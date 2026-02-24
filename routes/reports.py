"""
Reports Routes - Rapor endpoint'leri

Endpoints:
- GET /reports - Raporları listele
- POST /reports - Yeni rapor kaydet
- GET /reports/{report_id} - Rapor detayı
- GET /export/report - Rapor dışa aktar
"""

import io
import csv
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel

from .dependencies import get_db_manager, require_role

router = APIRouter(tags=["Reports"])
logger = logging.getLogger(__name__)


# --- Pydantic Model ---
class SaveReportRequest(BaseModel):
    title: str
    content: Dict[str, Any]
    created_by: Optional[str] = None


# --- Report Endpoints ---
@router.get("/reports")
def get_reports(limit: int = 50, user: dict = Depends(require_role('MANAGER', 'ENGINEER', 'OWNER'))):
    """Kayıtlı raporları listele"""
    db = get_db_manager()
    reports = db.get_saved_reports(limit)
    return {"reports": reports}


@router.post("/reports")
def save_report(request: SaveReportRequest, user: dict = Depends(require_role('MANAGER', 'ENGINEER', 'OWNER'))):
    """Yeni rapor kaydet"""
    import hashlib as _hashlib
    import json as _json

    db = get_db_manager()
    creator = request.created_by or user.get('name', 'Unknown')
    record_id = db.save_report(request.title, request.content, creator)

    if record_id == -1:
        raise HTTPException(status_code=500, detail="Rapor kaydedilemedi")

    # Rapor → ZK proof ile blockchain'e kaydet
    bc_tx_hash = None
    bc_error = None
    try:
        from routes.dependencies import get_blockchain_handler
        bc = get_blockchain_handler()
        if bc and bc.is_ready():
            report_bytes = _json.dumps(request.content, sort_keys=True).encode()
            report_hash_hex = _hashlib.sha256(report_bytes).hexdigest()
            machines = request.content.get('machines', [])
            machine_count = len(machines) if isinstance(machines, list) and machines else 1

            bc_result = bc.submit_report_record(
                report_hash_hex=report_hash_hex,
                machine_count=machine_count,
                recorded_by=user.get('address')
            )
            if bc_result.get('success'):
                bc_tx_hash = bc_result.get('tx_hash')
                logger.info(
                    "Rapor ZK proof ile blockchain'e kaydedildi",
                    extra={"event_type": "zk_proof_success",
                           "circuit_type": "REPORT_RECORD",
                           "tx_hash": bc_tx_hash},
                )
            else:
                bc_error = bc_result.get('error')
                logger.warning(
                    f"Rapor blockchain kaydı başarısız: {bc_error}",
                    extra={"event_type": "zk_proof_failed",
                           "circuit_type": "REPORT_RECORD"},
                )
    except Exception as bc_err:
        bc_error = str(bc_err)
        logger.error(
            f"Rapor blockchain kaydı exception: {bc_err}",
            extra={"event_type": "zk_proof_failed", "circuit_type": "REPORT_RECORD"},
        )

    return {
        "status": "success",
        "id": record_id,
        "blockchain": {
            "submitted": bc_tx_hash is not None,
            "tx_hash": bc_tx_hash,
            "error": bc_error,
        },
    }


@router.get("/reports/{report_id}")
def get_report(report_id: int, user: dict = Depends(require_role('MANAGER', 'ENGINEER', 'OWNER'))):
    """Rapor detayını getir"""
    db = get_db_manager()
    report = db.get_saved_report(report_id)

    if not report:
        raise HTTPException(status_code=404, detail="Rapor bulunamadı")

    return report


# --- Export Endpoint ---
@router.get("/export/report")
def export_report(
    format: str = "json",
    machine_id: Optional[int] = None,
    days: int = 7,
    user: dict = Depends(require_role('ENGINEER', 'MANAGER', 'OWNER'))
):
    """Rapor dışa aktar (JSON, CSV)"""
    db = get_db_manager()

    try:
        machines = [machine_id] if machine_id else [1001, 2001, 3001]
        all_data = []

        for mid in machines:
            history = db.get_sensor_data(machine_id=mid, limit=500)
            for record in history:
                record['machine_id'] = mid
                all_data.append(record)

        report = {
            'generated_at': datetime.now().isoformat(),
            'generated_by': user.get('address'),
            'parameters': {
                'machine_id': machine_id,
                'days': days,
                'format': format
            },
            'summary': {
                'total_records': len(all_data),
                'machines_included': machines,
                'date_range': f"Last {days} days"
            },
            'data': all_data
        }

        if format == 'csv':
            output = io.StringIO()
            if all_data:
                writer = csv.DictWriter(output, fieldnames=all_data[0].keys())
                writer.writeheader()
                writer.writerows(all_data)

            return Response(
                content=output.getvalue(),
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename=pdm_report_{datetime.now().strftime('%Y%m%d')}.csv"}
            )

        return report

    except Exception as e:
        logger.error(f"Export report error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
