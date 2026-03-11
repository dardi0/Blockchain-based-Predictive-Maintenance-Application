"""
Predictions Routes - Tahmin endpoint'leri

Endpoints:
- POST /predict - Arıza tahmini yap
- GET /predictions/history - Tahmin geçmişi
- GET /predictions/trend/{machine_id} - Tahmin trendi
"""

import os
import time
import logging
import numpy as np
import pandas as pd
import base64
from datetime import time as _time
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field, field_validator
from eth_account import Account
from eth_account.messages import encode_defunct

_MIDNIGHT = _time(0, 0, 0)

from .dependencies import get_db_manager

router = APIRouter(tags=["Prediction"])
logger = logging.getLogger(__name__)

# Global references (set by api_main on startup)
_model = None
_scaler = None
_optimal_threshold = 0.5
_feature_names = [
    'Air temperature [K]', 'Process temperature [K]', 'Rotational speed [rpm]',
    'Torque [Nm]', 'Tool wear [min]', 'Type_H', 'Type_L', 'Type_M'
]


def set_model_refs(model, scaler, threshold, features=None):
    """Called by api_main on startup to set model references."""
    global _model, _scaler, _optimal_threshold, _feature_names
    _model = model
    _scaler = scaler
    _optimal_threshold = threshold
    if features:
        _feature_names = features


# --- Pydantic Model ---
class SensorData(BaseModel):
    air_temp_k: float = Field(default=298.0, ge=250.0, le=350.0)
    process_temp_k: float = Field(default=308.0, ge=250.0, le=400.0)
    rotational_speed_rpm: int = Field(default=1500, ge=0, le=5000)
    torque_nm: float = Field(default=40.0, ge=0.0, le=250.0)
    tool_wear_min: float = Field(default=0.0, ge=0.0, le=600.0)
    machine_type: str = Field(default="M")
    id: Optional[int] = Field(default=None)

    @field_validator('machine_type')
    @classmethod
    def validate_machine_type(cls, v: str) -> str:
        if v.upper() not in ['L', 'M', 'H']:
            raise ValueError('Machine type must be L, M, or H')
        return v.upper()


# --- Config for Failure Analysis ---
class FailureAnalysisConfig:
    TWF_CRITICAL_THRESHOLD = 200
    HDF_TEMP_DIFF_THRESHOLD = 8.6
    HDF_ROTATION_THRESHOLD = 1380
    PWF_MIN_POWER = 3500
    PWF_MAX_POWER = 9000
    OSF_LIMITS = {'L': 11000, 'M': 12000, 'H': 13000}


def analyze_failure_type(input_data: np.ndarray, machine_type: str):
    """Girilen verilere göre potansiyel arıza tipini analiz eder."""
    air_temp, process_temp, rotational_speed, torque, tool_wear, _, _, _ = input_data

    failure_risks = []
    has_definite_failure = False

    # TWF - Tool Wear Failure
    if tool_wear >= FailureAnalysisConfig.TWF_CRITICAL_THRESHOLD:
        failure_risks.append(f"TWF (Takım Aşınması): {tool_wear:.0f} dk - Kritik seviye aşıldı")
        has_definite_failure = True

    # HDF - Heat Dissipation Failure
    temp_diff = process_temp - air_temp
    if temp_diff < FailureAnalysisConfig.HDF_TEMP_DIFF_THRESHOLD and rotational_speed < FailureAnalysisConfig.HDF_ROTATION_THRESHOLD:
        failure_risks.append(f"HDF (Isı Dağılımı): Sıcaklık farkı {temp_diff:.1f}K ve hız < {FailureAnalysisConfig.HDF_ROTATION_THRESHOLD}rpm")
        has_definite_failure = True

    # PWF - Power Failure
    power = torque * (rotational_speed * 2 * np.pi / 60)
    if not (FailureAnalysisConfig.PWF_MIN_POWER <= power <= FailureAnalysisConfig.PWF_MAX_POWER):
        failure_risks.append(f"PWF (Güç): Güç {power:.0f}W ({FailureAnalysisConfig.PWF_MIN_POWER}-{FailureAnalysisConfig.PWF_MAX_POWER}W dışında)")
        has_definite_failure = True

    # OSF - Overstrain Failure
    overstrain_product = tool_wear * torque
    limit = FailureAnalysisConfig.OSF_LIMITS.get(machine_type, 12000)
    if overstrain_product > limit:
        failure_risks.append(f"OSF (Aşırı Yük): {overstrain_product:.0f} > {limit} minNm")
        has_definite_failure = True

    return failure_risks, has_definite_failure


# --- Endpoints ---
@router.post("/predict")
def predict_failure(
    data: SensorData,
    machine_id: Optional[int] = None,
    x_signature: Optional[str] = Header(None),
    x_message: Optional[str] = Header(None)
):
    """Sensör verilerini alarak makine arıza tahminini gerçekleştirir."""
    db = get_db_manager()
    user_address = 'Unknown'

    # 1. İmza Doğrulama (sağlanırsa zorunlu rol kontrolü yapılır)
    if x_signature and x_message:
        verified_role = None
        try:
            decoded_message = base64.b64decode(x_message).decode('utf-8')
            msg_encoded = encode_defunct(text=decoded_message)
            recovered_address = Account.recover_message(msg_encoded, signature=x_signature)

            user = db.get_user(recovered_address)
            if user:
                verified_role = user.get('role')
            user_address = recovered_address
            logger.info(f"Prediction signature verified for {recovered_address}")

        except Exception as e:
            logger.warning(f"Signature verification failed in predict: {e}")
            raise HTTPException(status_code=401, detail="Invalid signature")

        # Enforce role — reject unauthorized users when signature is explicitly provided
        if verified_role not in ['ENGINEER', 'OWNER', 'MANAGER']:
            logger.warning(f"Prediction denied — unauthorized role: {verified_role} for {user_address}")
            raise HTTPException(status_code=403, detail="Unauthorized role for prediction")
    else:
        logger.info("Unauthenticated prediction request from unknown client")

    if not _model or not _scaler:
        raise HTTPException(status_code=503, detail="Model henüz yüklenmedi.")

    try:
        machine_type = data.machine_type  # validator already normalises to uppercase
        one_hot = {t: int(machine_type == t) for t in ('H', 'L', 'M')}

        input_data = np.array([[
            data.air_temp_k,
            data.process_temp_k,
            data.rotational_speed_rpm,
            data.torque_nm,
            data.tool_wear_min,
            one_hot['H'],
            one_hot['L'],
            one_hot['M'],
        ]])

        # Kural tabanlı analiz
        failure_risks, has_definite_failure = analyze_failure_type(input_data[0], machine_type)

        # Veriyi ölçeklendir
        input_df = pd.DataFrame(input_data, columns=_feature_names)
        data_scaled = _scaler.transform(input_df)
        data_reshaped = data_scaled.reshape(1, data_scaled.shape[1], 1)

        # Model tahmini
        prediction_prob = _model.predict(data_reshaped, verbose=0)[0][0]

        # Nihai karar
        if has_definite_failure:
            final_prediction = 1
            prediction_reason = "Kural Tabanlı Analiz"
        else:
            final_prediction = 1 if prediction_prob > _optimal_threshold else 0
            prediction_reason = f"LSTM-CNN Model (Eşik: {_optimal_threshold:.2f})"

        # Veritabanına kaydet
        if data.id or machine_id:
            current_time = int(time.time())

            if data.id:
                conn = db.get_connection()
                if conn:
                    try:
                        with conn.cursor() as cursor:
                            cursor.execute("""
                                UPDATE sensor_data
                                SET prediction = %s, prediction_probability = %s, prediction_reason = %s, analysis_time = %s
                                WHERE id = %s
                            """, (final_prediction, float(prediction_prob), prediction_reason, current_time, data.id))
                            conn.commit()
                            print(f"✅ Updated existing record #{data.id}")
                    except Exception as e:
                        conn.rollback()
                        print(f"❌ Record update failed: {e}")
                    finally:
                        db.return_connection(conn)

            elif machine_id:
                sensor_dict = {
                    'machine_id': machine_id,
                    'air_temp': data.air_temp_k,
                    'process_temp': data.process_temp_k,
                    'rotation_speed': data.rotational_speed_rpm,
                    'torque': data.torque_nm,
                    'tool_wear': data.tool_wear_min,
                    'machine_type': machine_type,
                    'prediction': final_prediction,
                    'prediction_probability': float(prediction_prob),
                    'prediction_reason': prediction_reason,
                    'timestamp': current_time,
                    'recorded_by': user_address
                }
                db.save_sensor_data(sensor_dict)

        # Arıza tespit edildi → batch kuyruğuna ekle (BatchSender halleder)
        fault_enqueued = False
        fault_bc_error = None
        if final_prediction == 1:
            try:
                _recorded_by = user_address if user_address != 'Unknown' else None
                db.enqueue_fault_for_batch(
                    machine_id=machine_id or 0,
                    prediction=int(final_prediction),
                    prediction_prob=float(prediction_prob),
                    recorded_by=_recorded_by,
                )
                fault_enqueued = True
            except Exception as bc_err:
                fault_bc_error = str(bc_err)
                logger.error(
                    f"Arıza batch kuyruğuna eklenemedi: {bc_err}",
                    extra={"event_type": "fault_enqueue_failed", "machine_id": machine_id},
                )

        return {
            "prediction": final_prediction,
            "is_failure": bool(final_prediction),
            "prediction_probability": float(prediction_prob),
            "prediction_reason": prediction_reason,
            "rule_based_analysis": {
                "has_definite_failure": has_definite_failure,
                "failure_risks": failure_risks if failure_risks else "Belirgin bir risk bulunamadı."
            },
            "blockchain": {
                "enqueued": fault_enqueued,
                "error": fault_bc_error,
            } if final_prediction == 1 else None,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tahmin hatası: {str(e)}")


@router.get("/predictions/history")
def get_prediction_history(machine_id: Optional[int] = None, limit: int = 50):
    """Tahmin geçmişini getir"""
    db = get_db_manager()
    try:
        history = db.get_prediction_history(machine_id, limit)
        return {"predictions": history, "count": len(history)}
    except Exception as e:
        logger.error(f"Get prediction history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/predictions/trend/{machine_id}")
def get_prediction_trend(machine_id: int, days: int = 7):
    """Son N günlük tahmin trendi"""
    db = get_db_manager()
    from datetime import datetime, timedelta

    try:
        history = db.get_sensor_data(machine_id=machine_id, limit=1000)

        if not history:
            return {"machine_id": machine_id, "trend": [], "message": "No data available"}

        cutoff = datetime.now() - timedelta(days=days)
        daily_data = {}

        for record in history:
            ts = record.get('timestamp')
            if isinstance(ts, str):
                record_date = datetime.fromisoformat(ts.replace('Z', '+00:00')).date()
            elif isinstance(ts, (int, float)):
                record_date = datetime.fromtimestamp(ts).date()
            else:
                continue

            if datetime.combine(record_date, _MIDNIGHT) < cutoff:
                continue

            date_str = record_date.isoformat()
            if date_str not in daily_data:
                daily_data[date_str] = {'probabilities': [], 'failures': 0, 'total': 0}

            prob = record.get('prediction_probability') or 0
            daily_data[date_str]['probabilities'].append(float(prob))
            daily_data[date_str]['total'] += 1
            if record.get('prediction', 0) == 1:
                daily_data[date_str]['failures'] += 1

        trend = []
        for date_str in sorted(daily_data.keys()):
            data = daily_data[date_str]
            avg_prob = sum(data['probabilities']) / len(data['probabilities']) if data['probabilities'] else 0
            trend.append({
                'date': date_str,
                'avg_probability': round(avg_prob, 4),
                'failure_count': data['failures'],
                'total_predictions': data['total']
            })

        return {"machine_id": machine_id, "days": days, "trend": trend}

    except Exception as e:
        logger.error(f"Get prediction trend error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
