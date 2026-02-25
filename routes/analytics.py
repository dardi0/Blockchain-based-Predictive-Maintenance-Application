"""
Analytics Routes - Analitik endpoint'leri

Endpoints:
- GET /analytics/anomalies - Anomali tespiti
- GET /analytics/comparison - Makine karşılaştırması
- GET /analytics/failure-modes - Arıza modu dağılımı
- GET /analytics/tool-wear-trend - Takım aşınma trendi
- GET /analytics/rul - Kalan faydalı ömür tahmini
- GET /analytics/maintenance-timeline - Bakım zaman çizelgesi
- GET /analytics/anomaly-frequency - Anomali frekans haritası
- GET /analytics/kpi - KPI metrikleri
- GET /activity - Aktivite akışı
- GET /stats/overview - Dashboard istatistikleri
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends

from .dependencies import get_db_manager, require_role, get_current_user

router = APIRouter(tags=["Analytics"])
logger = logging.getLogger(__name__)


@router.get("/analytics/anomalies")
def get_anomalies(hours: int = 24, threshold: float = 2.0):
    """Son N saatteki anomalileri tespit et (Z-score tabanlı)"""
    db = get_db_manager()

    try:
        all_data = []
        for machine_id in [1001, 2001, 3001]:
            history = db.get_sensor_data(machine_id=machine_id, limit=500)
            for record in history:
                record['machine_id'] = machine_id
                all_data.append(record)

        if len(all_data) < 10:
            return {"anomalies": [], "message": "Insufficient data"}

        # İstatistikler
        metrics = ['air_temp', 'process_temp', 'rotation_speed', 'torque', 'tool_wear']
        stats = {}
        for metric in metrics:
            values = [float(r.get(metric) or 0) for r in all_data if r.get(metric) is not None]
            if values:
                mean = sum(values) / len(values)
                variance = sum((x - mean) ** 2 for x in values) / len(values)
                std = variance ** 0.5 if variance > 0 else 1
                stats[metric] = {'mean': mean, 'std': std}

        # Anomali tespiti
        cutoff = datetime.now() - timedelta(hours=hours)
        anomalies = []

        for record in all_data:
            ts = record.get('timestamp')
            if isinstance(ts, str):
                record_time = datetime.fromisoformat(ts.replace('Z', '+00:00'))
            elif isinstance(ts, (int, float)):
                record_time = datetime.fromtimestamp(ts)
            else:
                continue

            if record_time.replace(tzinfo=None) < cutoff:
                continue

            for metric in metrics:
                value = record.get(metric)
                if value is None or metric not in stats:
                    continue

                z_score = abs(value - stats[metric]['mean']) / stats[metric]['std'] if stats[metric]['std'] > 0 else 0

                if z_score > threshold:
                    anomalies.append({
                        'machine_id': record.get('machine_id'),
                        'timestamp': record.get('timestamp'),
                        'metric': metric,
                        'value': value,
                        'z_score': round(z_score, 2),
                        'expected_range': f"{stats[metric]['mean'] - stats[metric]['std']:.1f} - {stats[metric]['mean'] + stats[metric]['std']:.1f}",
                        'severity': 'HIGH' if z_score > 3 else 'MEDIUM'
                    })

        anomalies.sort(key=lambda x: x['timestamp'], reverse=True)

        return {
            "hours": hours,
            "threshold": threshold,
            "anomalies": anomalies[:50],
            "total_found": len(anomalies)
        }

    except Exception as e:
        logger.error(f"Get anomalies error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/comparison")
def get_machine_comparison():
    """Tüm makineleri karşılaştır"""
    db = get_db_manager()

    try:
        machines_data = []

        for machine_id in [1001, 2001, 3001]:
            history = db.get_sensor_data(machine_id=machine_id, limit=100)

            if not history:
                continue

            probabilities = [float(r.get('prediction_probability') or 0) for r in history if r.get('prediction_probability') is not None]
            failures = sum(1 for r in history if r.get('prediction', 0) == 1)
            tool_wears = [float(r.get('tool_wear') or 0) for r in history if r.get('tool_wear') is not None]

            avg_prob = sum(probabilities) / len(probabilities) if probabilities else 0
            avg_tool_wear = sum(tool_wears) / len(tool_wears) if tool_wears else 0
            max_tool_wear = max(tool_wears) if tool_wears else 0

            latest = history[0] if history else {}
            last_prob = float(latest.get('prediction_probability') or 0)
            ml_score = round(100 - (last_prob * 100), 1)
            ml_score = max(0, min(100, ml_score))

            # Engineering Score calculation
            if latest:
                air_temp = float(latest.get('air_temp') or 300)
                process_temp = float(latest.get('process_temp') or 310)
                rotation_speed = float(latest.get('rotation_speed') or 1500)
                torque = float(latest.get('torque') or 40)
                tool_wear = float(latest.get('tool_wear') or 0)

                def calc_sensor_score(value, min_val, max_val, critical_min, critical_max):
                    if min_val <= value <= max_val:
                        return 100
                    if value < min_val:
                        deviation = min_val - value
                        max_deviation = min_val - critical_min
                        if max_deviation <= 0:
                            return 100
                        penalty = min(1, deviation / max_deviation)
                        return round(100 - (penalty * 100))
                    if value > max_val:
                        deviation = value - max_val
                        max_deviation = critical_max - max_val
                        if max_deviation <= 0:
                            return 100
                        penalty = min(1, deviation / max_deviation)
                        return round(100 - (penalty * 100))
                    return 100

                air_score = calc_sensor_score(air_temp, 295, 305, 290, 310)
                process_score = calc_sensor_score(process_temp, 305, 315, 300, 320)
                speed_score = calc_sensor_score(rotation_speed, 1200, 1800, 1000, 2000)
                torque_score = calc_sensor_score(torque, 30, 50, 20, 60)
                wear_score = calc_sensor_score(tool_wear, 0, 150, 0, 240)

                eng_score = round(
                    air_score * 0.10 +
                    process_score * 0.15 +
                    speed_score * 0.15 +
                    torque_score * 0.25 +
                    wear_score * 0.35
                , 1)
            else:
                eng_score = 95

            health_score = round((ml_score + eng_score) / 2, 1)

            if health_score < 50 or ml_score < 40 or eng_score < 40:
                status = 'CRITICAL'
            elif health_score < 75 or ml_score < 60 or eng_score < 60:
                status = 'WARNING'
            else:
                status = 'OPERATIONAL'

            machines_data.append({
                'machine_id': machine_id,
                'machine_type': 'L' if machine_id == 1001 else 'M' if machine_id == 2001 else 'H',
                'total_records': len(history),
                'failure_count': failures,
                'failure_rate': round(failures / len(history) * 100, 1) if history else 0,
                'avg_failure_probability': round(avg_prob, 4),
                'avg_tool_wear': round(avg_tool_wear, 1),
                'max_tool_wear': max_tool_wear,
                'ml_health_score': ml_score,
                'eng_health_score': eng_score,
                'health_score': health_score,
                'last_reading': latest.get('timestamp') if latest else None,
                'status': status
            })

        return {"machines": machines_data}

    except Exception as e:
        logger.error(f"Get comparison error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/activity")
def get_recent_activity(limit: int = 10, user: dict = Depends(require_role('MANAGER', 'ENGINEER', 'OWNER'))):
    """Son sistem olaylarını getir"""
    db = get_db_manager()

    try:
        activities = []

        # Son sensör kayıtları
        sensor_records = db.get_sensor_data(limit=limit)
        for rec in sensor_records:
            event_type = "prediction_alert" if rec.get('prediction') == 1 else "sensor_submit"
            activities.append({
                "id": f"sensor_{rec.get('id')}",
                "type": event_type,
                "message": f"Machine #{rec.get('machine_id')} - {'⚠️ Failure Predicted' if rec.get('prediction') == 1 else '✅ Normal Operation'}",
                "timestamp": rec.get('created_at'),
                "machine_id": rec.get('machine_id')
            })

        # Son rapor kayıtları
        reports = db.get_saved_reports(limit=5)
        for rep in reports:
            activities.append({
                "id": f"report_{rep.get('id')}",
                "type": "report_saved",
                "message": f"📄 Report saved: {rep.get('title', 'Untitled')[:30]}",
                "timestamp": rep.get('created_at'),
                "created_by": rep.get('created_by')
            })

        activities.sort(key=lambda x: x.get('timestamp', ''), reverse=True)

        return {"activities": activities[:limit]}

    except Exception as e:
        logger.error(f"Get activity error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/failure-modes")
def get_failure_modes():
    """Her makine için arıza modu dağılımını hesapla (TWF, HDF, PWF, OSF, RNF)"""
    db = get_db_manager()

    try:
        result = []
        for machine_id in [1001, 2001, 3001]:
            history = db.get_sensor_data(machine_id=machine_id, limit=500)
            failures = [r for r in history if r.get('prediction', 0) == 1]

            counts = {'TWF': 0, 'HDF': 0, 'PWF': 0, 'OSF': 0, 'RNF': 0}

            for r in failures:
                reason = (r.get('prediction_reason') or '').lower()
                tool_wear = float(r.get('tool_wear') or 0)
                process_temp = float(r.get('process_temp') or 310)
                air_temp = float(r.get('air_temp') or 300)
                torque = float(r.get('torque') or 40)
                rotation_speed = float(r.get('rotation_speed') or 1500)

                classified = False
                if 'tool wear' in reason or 'twf' in reason or tool_wear > 200:
                    counts['TWF'] += 1
                    classified = True
                if 'heat' in reason or 'hdf' in reason or (process_temp - air_temp) > 8.6:
                    counts['HDF'] += 1
                    classified = True
                power = torque * (rotation_speed * 2 * 3.14159 / 60)
                if 'power' in reason or 'pwf' in reason or power < 3500 or power > 9000:
                    counts['PWF'] += 1
                    classified = True
                if 'overstrain' in reason or 'osf' in reason or (tool_wear * torque) > 11000:
                    counts['OSF'] += 1
                    classified = True
                if not classified:
                    counts['RNF'] += 1

            machine_type = 'L' if machine_id == 1001 else 'M' if machine_id == 2001 else 'H'
            result.append({
                'machine_id': machine_id,
                'machine_type': machine_type,
                'total_failures': len(failures),
                **counts
            })

        return {'failure_modes': result}

    except Exception as e:
        logger.error(f"Get failure modes error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/tool-wear-trend")
def get_tool_wear_trend(days: int = 14):
    """Son N gündeki takım aşınma trendini makineye göre döndür"""
    db = get_db_manager()

    try:
        machines_data = []
        cutoff = datetime.now() - timedelta(days=days)

        for machine_id in [1001, 2001, 3001]:
            history = db.get_sensor_data(machine_id=machine_id, limit=1000)
            machine_type = 'L' if machine_id == 1001 else 'M' if machine_id == 2001 else 'H'

            # Group by day
            daily: dict = {}
            for record in history:
                ts = record.get('timestamp') or record.get('created_at')
                if not ts:
                    continue
                try:
                    if isinstance(ts, str):
                        dt = datetime.fromisoformat(ts.replace('Z', '+00:00')).replace(tzinfo=None)
                    elif isinstance(ts, (int, float)):
                        dt = datetime.fromtimestamp(ts / 1000 if ts > 1e10 else ts)
                    else:
                        continue
                except Exception:
                    continue

                if dt < cutoff:
                    continue

                day_key = dt.strftime('%Y-%m-%d')
                tw = float(record.get('tool_wear') or 0)
                if day_key not in daily:
                    daily[day_key] = []
                daily[day_key].append(tw)

            trend = []
            for day in sorted(daily.keys()):
                values = daily[day]
                trend.append({
                    'day': day,
                    'avg_wear': round(sum(values) / len(values), 1),
                    'max_wear': max(values)
                })

            machines_data.append({
                'machine_id': machine_id,
                'machine_type': machine_type,
                'data': trend
            })

        return {'machines': machines_data, 'days': days, 'critical_threshold': 250}

    except Exception as e:
        logger.error(f"Get tool wear trend error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/rul")
def get_rul_estimates():
    """Her makine için kalan faydalı ömür (RUL) tahmini yap (lineer regresyon)"""
    db = get_db_manager()

    try:
        result = []
        cutoff = datetime.now() - timedelta(days=7)

        for machine_id in [1001, 2001, 3001]:
            history = db.get_sensor_data(machine_id=machine_id, limit=500)
            machine_type = 'L' if machine_id == 1001 else 'M' if machine_id == 2001 else 'H'

            # Collect (day_index, tool_wear) pairs from last 7 days
            points = []
            for record in history:
                ts = record.get('timestamp') or record.get('created_at')
                if not ts:
                    continue
                try:
                    if isinstance(ts, str):
                        dt = datetime.fromisoformat(ts.replace('Z', '+00:00')).replace(tzinfo=None)
                    elif isinstance(ts, (int, float)):
                        dt = datetime.fromtimestamp(ts / 1000 if ts > 1e10 else ts)
                    else:
                        continue
                except Exception:
                    continue

                if dt < cutoff:
                    continue

                tw = float(record.get('tool_wear') or 0)
                day_idx = (dt - cutoff).total_seconds() / 86400
                points.append((day_idx, tw))

            if len(points) < 2:
                current_wear = float(history[0].get('tool_wear') or 0) if history else 0
                result.append({
                    'machine_id': machine_id,
                    'machine_type': machine_type,
                    'current_wear': current_wear,
                    'daily_rate': 0,
                    'estimated_days': None,
                    'estimated_date': None,
                    'status': 'INSUFFICIENT_DATA'
                })
                continue

            # Linear regression (numpy-free manual calculation)
            n = len(points)
            sum_x = sum(p[0] for p in points)
            sum_y = sum(p[1] for p in points)
            sum_xy = sum(p[0] * p[1] for p in points)
            sum_x2 = sum(p[0] ** 2 for p in points)
            denom = n * sum_x2 - sum_x ** 2
            daily_rate = (n * sum_xy - sum_x * sum_y) / denom if denom != 0 else 0

            current_wear = points[-1][1]
            CRITICAL_THRESHOLD = 250

            if daily_rate > 0 and current_wear < CRITICAL_THRESHOLD:
                remaining_days = (CRITICAL_THRESHOLD - current_wear) / daily_rate
                estimated_date = (datetime.now() + timedelta(days=remaining_days)).strftime('%Y-%m-%d')
            else:
                remaining_days = None
                estimated_date = None

            if remaining_days is None:
                status = 'EXCEEDED'
            elif remaining_days < 10:
                status = 'CRITICAL'
            elif remaining_days < 30:
                status = 'WARNING'
            else:
                status = 'GOOD'

            result.append({
                'machine_id': machine_id,
                'machine_type': machine_type,
                'current_wear': round(current_wear, 1),
                'daily_rate': round(daily_rate, 2),
                'estimated_days': round(remaining_days, 1) if remaining_days is not None else None,
                'estimated_date': estimated_date,
                'status': status,
                'critical_threshold': CRITICAL_THRESHOLD
            })

        return {'rul_estimates': result}

    except Exception as e:
        logger.error(f"Get RUL estimates error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/maintenance-timeline")
def get_maintenance_timeline(days: int = 90):
    """Son N gündeki bakım kayıtlarını döndür"""
    db = get_db_manager()

    try:
        records = db.get_maintenance_records(limit=500)
        cutoff = datetime.now() - timedelta(days=days)

        events = []
        for rec in records:
            ts = rec.get('timestamp') or rec.get('created_at')
            if not ts:
                continue
            try:
                if isinstance(ts, str):
                    dt = datetime.fromisoformat(ts.replace('Z', '+00:00')).replace(tzinfo=None)
                elif isinstance(ts, (int, float)):
                    dt = datetime.fromtimestamp(ts / 1000 if ts > 1e10 else ts)
                else:
                    continue
            except Exception:
                continue

            if dt < cutoff:
                continue

            maintenance_type = rec.get('maintenance_type') or rec.get('action') or 'PREVENTIVE'
            events.append({
                'id': rec.get('id'),
                'machine_id': rec.get('machine_id'),
                'type': str(maintenance_type).upper(),
                'description': rec.get('description') or rec.get('action') or '',
                'technician': rec.get('technician') or rec.get('operator_address') or 'Unknown',
                'timestamp': dt.isoformat()
            })

        events.sort(key=lambda x: x['timestamp'], reverse=True)

        return {'events': events, 'days': days, 'total': len(events)}

    except Exception as e:
        logger.error(f"Get maintenance timeline error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/anomaly-frequency")
def get_anomaly_frequency(days: int = 30):
    """Son N gündeki anomali frekansını (makine x metrik) hesapla"""
    db = get_db_manager()

    try:
        all_data = []
        machine_ids = [1001, 2001, 3001]
        metrics = ['air_temp', 'process_temp', 'rotation_speed', 'torque', 'tool_wear']
        cutoff = datetime.now() - timedelta(days=days)

        for machine_id in machine_ids:
            history = db.get_sensor_data(machine_id=machine_id, limit=1000)
            for record in history:
                ts = record.get('timestamp') or record.get('created_at')
                if not ts:
                    continue
                try:
                    if isinstance(ts, str):
                        dt = datetime.fromisoformat(ts.replace('Z', '+00:00')).replace(tzinfo=None)
                    elif isinstance(ts, (int, float)):
                        dt = datetime.fromtimestamp(ts / 1000 if ts > 1e10 else ts)
                    else:
                        continue
                except Exception:
                    continue
                if dt < cutoff:
                    continue
                record['_machine_id'] = machine_id
                record['_dt'] = dt
                all_data.append(record)

        if len(all_data) < 5:
            return {
                'machines': [str(m) for m in machine_ids],
                'metrics': metrics,
                'data': []
            }

        # Compute global stats per metric
        global_stats = {}
        for metric in metrics:
            values = [float(r.get(metric) or 0) for r in all_data if r.get(metric) is not None]
            if values:
                mean = sum(values) / len(values)
                variance = sum((v - mean) ** 2 for v in values) / len(values)
                std = variance ** 0.5 if variance > 0 else 1
                global_stats[metric] = {'mean': mean, 'std': std}

        # Count anomalies per (machine_id, metric, week)
        freq: dict = {}
        for record in all_data:
            machine_id = record['_machine_id']
            dt = record['_dt']
            week_num = dt.isocalendar()[1]
            week_key = f"W{week_num}"

            for metric in metrics:
                value = record.get(metric)
                if value is None or metric not in global_stats:
                    continue
                z = abs(float(value) - global_stats[metric]['mean']) / global_stats[metric]['std']
                if z > 2.0:
                    key = (str(machine_id), metric, week_key)
                    if key not in freq:
                        freq[key] = {'count': 0, 'severity_sum': 0}
                    freq[key]['count'] += 1
                    freq[key]['severity_sum'] += z

        freq_data = []
        for (machine_id, metric, week), v in freq.items():
            freq_data.append({
                'machine_id': machine_id,
                'metric': metric,
                'week': week,
                'count': v['count'],
                'severity_avg': round(v['severity_sum'] / v['count'], 2)
            })

        return {
            'machines': [str(m) for m in machine_ids],
            'metrics': metrics,
            'data': freq_data
        }

    except Exception as e:
        logger.error(f"Get anomaly frequency error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/kpi")
def get_kpi_metrics():
    """MTBF, MTTR, False Alarm Rate ve OEE proxy hesapla"""
    db = get_db_manager()

    try:
        machine_ids = [1001, 2001, 3001]
        kpi_result = {'machines': [], 'overall': {}}

        all_health_scores = []

        for machine_id in machine_ids:
            history = db.get_sensor_data(machine_id=machine_id, limit=1000)
            machine_type = 'L' if machine_id == 1001 else 'M' if machine_id == 2001 else 'H'

            if not history:
                continue

            # Parse timestamps
            timestamps = []
            for record in history:
                ts = record.get('timestamp') or record.get('created_at')
                if not ts:
                    continue
                try:
                    if isinstance(ts, str):
                        dt = datetime.fromisoformat(ts.replace('Z', '+00:00')).replace(tzinfo=None)
                    elif isinstance(ts, (int, float)):
                        dt = datetime.fromtimestamp(ts / 1000 if ts > 1e10 else ts)
                    else:
                        continue
                    timestamps.append(dt)
                except Exception:
                    continue

            # MTBF calculation
            failure_count = sum(1 for r in history if r.get('prediction', 0) == 1)
            if timestamps:
                total_hours = (max(timestamps) - min(timestamps)).total_seconds() / 3600
            else:
                total_hours = 0

            mtbf = round(total_hours / max(failure_count, 1), 1)

            # False alarm rate: consecutive failures where next reading is normal
            predictions = [r.get('prediction', 0) for r in reversed(history)]
            false_alarms = 0
            total_failures = 0
            for i in range(len(predictions) - 1):
                if predictions[i] == 1:
                    total_failures += 1
                    if predictions[i + 1] == 0:
                        false_alarms += 1
            false_alarm_rate = round(false_alarms / max(total_failures, 1) * 100, 1)

            # Health score proxy for OEE
            probs = [float(r.get('prediction_probability') or 0) for r in history if r.get('prediction_probability') is not None]
            avg_prob = sum(probs) / len(probs) if probs else 0
            health_score = round(100 - avg_prob * 100, 1)
            all_health_scores.append(health_score)

            kpi_result['machines'].append({
                'machine_id': machine_id,
                'machine_type': machine_type,
                'mtbf_hours': mtbf,
                'failure_count': failure_count,
                'false_alarm_rate': false_alarm_rate,
                'oee_proxy': max(0, min(100, health_score))
            })

        # MTTR from maintenance records (estimate: 2 hours per corrective maintenance)
        try:
            maintenance_records = db.get_maintenance_records(limit=100)
            corrective = [r for r in maintenance_records if 'corrective' in str(r.get('maintenance_type') or r.get('action') or '').lower()]
            mttr = round(len(corrective) * 2.0 / max(len(corrective), 1), 1) if corrective else 2.0
        except Exception:
            mttr = 2.0

        avg_oee = round(sum(all_health_scores) / len(all_health_scores), 1) if all_health_scores else 0
        overall_mtbf = round(sum(m['mtbf_hours'] for m in kpi_result['machines']) / max(len(kpi_result['machines']), 1), 1)
        overall_far = round(sum(m['false_alarm_rate'] for m in kpi_result['machines']) / max(len(kpi_result['machines']), 1), 1)

        kpi_result['overall'] = {
            'mtbf_hours': overall_mtbf,
            'mttr_hours': mttr,
            'false_alarm_rate': overall_far,
            'oee_proxy': avg_oee
        }

        return kpi_result

    except Exception as e:
        logger.error(f"Get KPI metrics error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/overview")
def get_dashboard_stats(user: dict = Depends(get_current_user)):
    """Dashboard istatistikleri"""
    db = get_db_manager()

    try:
        return {
            "total_assets": db.count_assets(),
            "critical_alerts": db.count_critical_assets(),
            "avg_health_score": db.get_avg_health(),
            "recent_predictions": db.get_recent_predictions(limit=10)
        }
    except Exception as e:
        logger.error(f"Get stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
