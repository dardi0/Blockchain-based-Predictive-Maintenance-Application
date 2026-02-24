"""
Analytics Routes - Analitik endpoint'leri

Endpoints:
- GET /analytics/anomalies - Anomali tespiti
- GET /analytics/comparison - Makine karşılaştırması
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
