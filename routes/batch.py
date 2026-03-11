"""
Batch Blockchain Submission Routes
-----------------------------------
POST /batch/flush        — Anlık flush (MANAGER veya ENGINEER)
GET  /batch/status       — BatchSender durumu + son batch'ler
GET  /batch/submissions  — Geçmiş batch listesi
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Any, Dict, Optional
import logging

from .dependencies import require_role, get_db_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/batch", tags=["Batch"])

# BatchSender referansı — api_main tarafından set edilir
_batch_sender = None


def set_batch_sender(sender):
    """api_main startup'ından çağrılır."""
    global _batch_sender
    _batch_sender = sender


def get_batch_sender():
    return _batch_sender


# ──────────────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/flush", summary="Anlık batch flush tetikle")
async def flush_batch(
    user=Depends(require_role("MANAGER", "ENGINEER", "OWNER"))
) -> Dict[str, Any]:
    """Bekleyen sensör ve arıza kayıtlarını hemen bir ZK proof + TX ile gönderir."""
    sender = get_batch_sender()
    if not sender:
        raise HTTPException(status_code=503, detail="BatchSender başlatılmamış")

    result = sender.force_flush()
    if not result.get('success') and result.get('error') == 'flush_already_in_progress':
        raise HTTPException(status_code=429, detail="Flush zaten çalışıyor, lütfen bekleyin")
    return result


@router.get("/status", summary="BatchSender durumu")
async def batch_status(
    user=Depends(require_role("MANAGER", "ENGINEER", "OPERATOR", "OWNER"))
) -> Dict[str, Any]:
    """BatchSender'ın çalışma durumunu ve son flush bilgisini döndürür."""
    from config import BatchConfig
    db = get_db_manager()

    sender = get_batch_sender()
    sender_status = sender.get_status() if sender else {'running': False}

    pending_records = db.get_pending_sensor_records_for_batch(limit=BatchConfig.BATCH_MAX_SIZE)
    recent = db.get_recent_batch_submissions(limit=5)
    return {
        'batch_interval': BatchConfig.BATCH_INTERVAL,
        'batch_max_size': BatchConfig.BATCH_MAX_SIZE,
        'batch_min_size': BatchConfig.BATCH_MIN_SIZE,
        'pending_sensor_count': len(pending_records),
        'sender': sender_status,
        'recent_submissions': recent,
    }


@router.get("/submissions", summary="Geçmiş batch listesi")
async def list_submissions(
    limit: int = 20,
    user=Depends(require_role("MANAGER", "ENGINEER", "OPERATOR", "OWNER"))
) -> Dict[str, Any]:
    """Son batch submission kayıtlarını listeler."""
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="limit 1-200 arasında olmalı")
    db = get_db_manager()
    submissions = db.get_recent_batch_submissions(limit=limit)
    return {'count': len(submissions), 'submissions': submissions}


@router.get("/{batch_id}/records", summary="Batch detayı ve içindeki kayıtlar")
async def get_batch_records(
    batch_id: int,
    user=Depends(require_role("MANAGER", "ENGINEER", "OPERATOR", "OWNER"))
) -> Dict[str, Any]:
    """Belirli bir batch'in metadata'sı ve içindeki tüm sensör kayıtlarını döndürür."""
    db = get_db_manager()
    result = db.get_batch_detail(batch_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Batch #{batch_id} bulunamadı")
    return result
