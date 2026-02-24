"""
Notifications Routes - Bildirim endpoint'leri

Endpoints:
- GET /notifications - Bildirimleri listele
- POST /notifications/{notif_id}/read - Bildirimi okundu işaretle
- DELETE /notifications/{notif_id} - Bildirimi sil
"""

from fastapi import APIRouter, Header

from .dependencies import get_db_manager

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
def get_notifications(x_wallet_address: str = Header(...), limit: int = 50):
    """Kullanıcının son bildirimlerini getir"""
    db = get_db_manager()
    return db.get_recent_notifications(x_wallet_address, limit)


@router.post("/{notif_id}/read")
def mark_notification_read(notif_id: int):
    """Bildirimi okundu olarak işaretle"""
    db = get_db_manager()
    success = db.mark_notification_read(notif_id)
    return {"success": success}


@router.delete("/{notif_id}")
def delete_notification(notif_id: int):
    """Bildirimi sil"""
    db = get_db_manager()
    success = db.delete_notification(notif_id)
    return {"success": success}
