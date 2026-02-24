"""
Maintenance Routes - Bakım endpoint'leri

Endpoints:
- GET /maintenance/schedule - Bakım takvimini getir
- POST /maintenance/schedule - Yeni bakım görevi oluştur
"""

import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends

from .dependencies import get_db_manager, require_role

router = APIRouter(prefix="/maintenance", tags=["Maintenance"])
logger = logging.getLogger(__name__)


@router.get("/schedule")
def get_maintenance_schedule():
    """Bakım takvimini getir"""
    db = get_db_manager()

    try:
        schedule = db.get_maintenance_schedule() if hasattr(db, 'get_maintenance_schedule') else []

        if not schedule:
            today = datetime.now().date()
            schedule = []

            for machine_id in [1001, 2001, 3001]:
                history = db.get_sensor_data(machine_id=machine_id, limit=10)
                if history:
                    latest = history[0]
                    tool_wear = float(latest.get('tool_wear') or 0)

                    if tool_wear > 200:
                        due_date = today + timedelta(days=1)
                        priority = 'HIGH'
                        task = 'Urgent Tool Replacement'
                    elif tool_wear > 150:
                        due_date = today + timedelta(days=3)
                        priority = 'MEDIUM'
                        task = 'Scheduled Tool Inspection'
                    else:
                        due_date = today + timedelta(days=7)
                        priority = 'LOW'
                        task = 'Routine Maintenance Check'

                    schedule.append({
                        'id': f"maint_{machine_id}_{today.isoformat()}",
                        'machine_id': machine_id,
                        'machine_type': 'L' if machine_id == 1001 else 'M' if machine_id == 2001 else 'H',
                        'task': task,
                        'due_date': due_date.isoformat(),
                        'priority': priority,
                        'status': 'PENDING',
                        'estimated_duration': '2 hours' if priority == 'HIGH' else '1 hour',
                        'notes': f'Tool wear at {tool_wear} min'
                    })

        return {"schedule": schedule}

    except Exception as e:
        logger.error(f"Get maintenance schedule error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedule")
def create_maintenance_task(
    machine_id: int,
    task: str,
    due_date: str,
    priority: str = "MEDIUM",
    user: dict = Depends(require_role('ENGINEER', 'MANAGER', 'OWNER'))
):
    """Yeni bakım görevi oluştur"""
    try:
        new_task = {
            'id': f"maint_{machine_id}_{datetime.now().timestamp()}",
            'machine_id': machine_id,
            'task': task,
            'due_date': due_date,
            'priority': priority,
            'status': 'PENDING',
            'created_by': user.get('address'),
            'created_at': datetime.now().isoformat()
        }

        # TODO: Veritabanına kaydet
        # db.create_maintenance_task(new_task)

        return {"success": True, "task": new_task}

    except Exception as e:
        logger.error(f"Create maintenance task error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
