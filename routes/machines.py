"""
Machines Routes - Makine yönetimi endpoint'leri

Endpoints:
- GET /machines - Tüm makineleri listele
- GET /machines/{machine_id} - Belirli makine detayı
"""

import logging
from fastapi import APIRouter, HTTPException, Depends

from .dependencies import get_db_manager, require_role

router = APIRouter(prefix="/machines", tags=["Machines"])
logger = logging.getLogger(__name__)


@router.get("")
def get_machines(user: dict = Depends(require_role('MANAGER', 'ENGINEER', 'OPERATOR', 'OWNER'))):
    """Tüm makineleri listele"""
    db = get_db_manager()
    try:
        machines = db.get_all_assets()
        return {"machines": machines, "count": len(machines)}
    except Exception as e:
        logger.error(f"Get machines error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{machine_id}")
def get_machine(machine_id: int):
    """Belirli bir makineyi getir"""
    db = get_db_manager()
    try:
        machine = db.get_asset_by_id(machine_id)
        if not machine:
            raise HTTPException(status_code=404, detail="Makine bulunamadı")

        # Sensor geçmişini de ekle
        sensor_history = db.get_sensor_data(machine_id=machine_id, limit=20)
        machine['sensor_data'] = sensor_history

        return machine

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get machine error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
