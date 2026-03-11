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

_MACHINE_TYPE_MAP = {1001: 'L', 2001: 'M', 3001: 'H'}


@router.get("/schedule")
def get_maintenance_schedule():
    """Bakım takvimini getir. DB'de kayıt yoksa sensor verilerinden öneri üret."""
    db = get_db_manager()

    try:
        schedule = db.get_maintenance_schedule()

        if not schedule:
            today = datetime.now().date()
            suggestions = []

            for machine_id in [1001, 2001, 3001]:
                history = db.get_sensor_data(machine_id=machine_id, limit=1)
                if history:
                    latest = history[0]
                    tool_wear = float(latest.get('tool_wear') or 0)

                    if tool_wear > 200:
                        due_date = today + timedelta(days=1)
                        priority = 'HIGH'
                        task = 'Urgent Tool Replacement'
                        duration = '2 hours'
                    elif tool_wear > 150:
                        due_date = today + timedelta(days=3)
                        priority = 'MEDIUM'
                        task = 'Scheduled Tool Inspection'
                        duration = '1 hour'
                    else:
                        due_date = today + timedelta(days=7)
                        priority = 'LOW'
                        task = 'Routine Maintenance Check'
                        duration = '1 hour'

                    suggestions.append({
                        'id': f"suggest_{machine_id}_{today.isoformat()}",
                        'machine_id': machine_id,
                        'machine_type': _MACHINE_TYPE_MAP.get(machine_id, 'L'),
                        'task': task,
                        'due_date': due_date.isoformat(),
                        'priority': priority,
                        'status': 'PENDING',
                        'estimated_duration': duration,
                        'notes': f'Auto-suggestion: tool wear at {tool_wear:.0f} min'
                    })

            return {"schedule": suggestions}

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
    db = get_db_manager()

    valid_priorities = ['LOW', 'MEDIUM', 'HIGH']
    if priority.upper() not in valid_priorities:
        raise HTTPException(
            status_code=400,
            detail=f"Geçersiz öncelik. Geçerli değerler: {', '.join(valid_priorities)}"
        )

    machine_type = _MACHINE_TYPE_MAP.get(machine_id, 'L')
    estimated_duration = '2 hours' if priority.upper() == 'HIGH' else '1 hour'

    try:
        task_id = db.save_maintenance_task(
            machine_id=machine_id,
            machine_type=machine_type,
            task=task,
            due_date=due_date,
            priority=priority,
            estimated_duration=estimated_duration,
            notes='',
            created_by=user.get('address') or ''
        )

        if not task_id:
            raise HTTPException(status_code=500, detail="Görev kaydedilemedi")

        new_task = {
            'id': task_id,
            'machine_id': machine_id,
            'machine_type': machine_type,
            'task': task,
            'due_date': due_date,
            'priority': priority.upper(),
            'status': 'PENDING',
            'estimated_duration': estimated_duration,
            'notes': ''
        }

        return {"success": True, "task": new_task}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create maintenance task error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
