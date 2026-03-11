"""
Sensors Routes - Sensör veri endpoint'leri

Endpoints:
- POST /sensor-data - Sensör verisi kaydet
- GET /sensor-data/{machine_id} - Makineye ait sensör geçmişi
- GET /sensor-data/live - Canlı sensör verileri
"""

import time
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, field_validator

from .dependencies import get_db_manager, require_role

router = APIRouter(prefix="/sensor-data", tags=["Sensor"])
logger = logging.getLogger(__name__)


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


# --- Endpoints ---
@router.post("")
def save_sensor_data(
    data: SensorData,
    machine_id: int,
    user: dict = Depends(require_role('OPERATOR', 'ENGINEER'))
):
    """Sensör verisini kaydet - OPERATOR kullanır"""
    db = get_db_manager()
    print(f"📊 /sensor-data endpoint called - machine_id={machine_id}, user={user.get('name')}")

    try:
        current_ts = int(time.time())
        sensor_dict = {
            'machine_id': machine_id,
            'air_temp': data.air_temp_k,
            'process_temp': data.process_temp_k,
            'rotation_speed': data.rotational_speed_rpm,
            'torque': data.torque_nm,
            'tool_wear': data.tool_wear_min,
            'machine_type': data.machine_type,
            'timestamp': current_ts,
            'recorded_by': user.get('address', 'Unknown')
        }

        record_id = db.save_sensor_data(sensor_dict)
        print(f"💾 Sensor data saved - record_id={record_id}")

        if record_id:
            logger.info(f"Sensor data saved by {user['name']}: machine_id={machine_id}, record_id={record_id}")

            user_addr = user.get('address')
            if user_addr and user_addr != 'Unknown':
                try:
                    db.create_notification(
                        user_address=user_addr,
                        message=f"New sensor data saved for Machine #{machine_id}",
                        notif_type="info",
                        tx_hash=None
                    )
                except Exception as ne:
                    logger.error(f"Failed to create notification: {ne}")

        return {
            "status": "success",
            "record_id": record_id,
            "message": "Sensör verisi kaydedildi"
        }

    except Exception as e:
        logger.error(f"Save sensor data error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/live")
def get_live_sensor_data(limit: int = 20):
    """Tüm makinelerden gelen son sensör verileri"""
    db = get_db_manager()
    try:
        history = db.get_sensor_data(limit=limit)
        return {"data": history, "count": len(history)}
    except Exception as e:
        logger.error(f"Get live sensor data error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{machine_id}")
def get_sensor_history(machine_id: int, limit: int = 100):
    """Makineye ait sensör geçmişini getir"""
    db = get_db_manager()
    try:
        history = db.get_sensor_data(machine_id=machine_id, limit=limit)
        return history  # Frontend expects array directly
    except Exception as e:
        logger.error(f"Get sensor history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
