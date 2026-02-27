"""
Admin Routes - Yönetim endpoint'leri

Endpoints:
- GET /admin/users - Tüm kullanıcıları listele
- GET /admin/users/pending - Bekleyen kullanıcılar
- POST /admin/users/invite - Kullanıcı davet et
- PUT /admin/users/{address} - Kullanıcı güncelle
- DELETE /admin/users/{address} - Kullanıcı sil
- PUT /admin/users/{address}/role - Rol güncelle
- GET /debug/fix-owner - Owner düzelt (debug)
"""

import os
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from .dependencies import get_db_manager, require_role

router = APIRouter(tags=["Admin"])
logger = logging.getLogger(__name__)


# --- Pydantic Models ---
class UserInvite(BaseModel):
    address: str = Field(..., min_length=42, max_length=42, pattern=r"^0x[a-fA-F0-9]{40}$")
    role: str
    name: str
    email: Optional[str] = None
    department: Optional[str] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None


# --- Admin Endpoints ---
@router.get("/admin/users")
def get_all_users(user: dict = Depends(require_role('OWNER', 'MANAGER'))):
    """Tüm kullanıcıları listele"""
    db = get_db_manager()
    users = db.get_all_users()

    stats = {
        "total": len(users),
        "active": len([u for u in users if u.get('status') == 'active']),
        "pending": len([u for u in users if u.get('status') == 'pending']),
        "by_role": {}
    }
    for u in users:
        role = u.get('role', 'UNKNOWN')
        stats["by_role"][role] = stats["by_role"].get(role, 0) + 1

    return {"users": users, "stats": stats}


@router.get("/admin/users/pending")
def get_pending_users(user: dict = Depends(require_role('OWNER', 'MANAGER'))):
    """Bekleyen kullanıcıları listele"""
    db = get_db_manager()
    return db.get_pending_users()


@router.post("/admin/users/invite")
def invite_user(invite_data: UserInvite, admin: dict = Depends(require_role('OWNER'))):
    """Yeni kullanıcı davet et"""
    db = get_db_manager()

    existing = db.get_user(invite_data.address)
    if existing:
        raise HTTPException(status_code=400, detail="Bu cüzdan adresi zaten kayıtlı")

    valid_roles = ['OPERATOR', 'ENGINEER', 'MANAGER']
    if invite_data.role.upper() not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Geçersiz rol. Geçerli roller: {', '.join(valid_roles)}")

    success = db.invite_user(
        address=invite_data.address,
        role=invite_data.role.upper(),
        name=invite_data.name,
        email=invite_data.email,
        department=invite_data.department,
        invited_by=admin.get('address')
    )

    if not success:
        raise HTTPException(status_code=500, detail="Kullanıcı davet edilemedi")

    new_user = db.get_user(invite_data.address)
    return {
        "status": "success",
        "message": f"{invite_data.name} başarıyla davet edildi.",
        "user": new_user
    }


@router.put("/admin/users/{address}")
def update_user(address: str, update_data: UserUpdate, admin: dict = Depends(require_role('OWNER'))):
    """Kullanıcı bilgilerini güncelle"""
    db = get_db_manager()

    existing = db.get_user(address)
    if not existing:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    success = db.update_user(
        address=address,
        name=update_data.name,
        email=update_data.email,
        department=update_data.department,
        role=update_data.role.upper() if update_data.role else None
    )

    if not success:
        raise HTTPException(status_code=400, detail="Kullanıcı güncellenemedi")

    return {"status": "success", "user": db.get_user(address)}


@router.delete("/admin/users/{address}")
def delete_user(address: str, admin: dict = Depends(require_role('OWNER'))):
    """Kullanıcı sil"""
    db = get_db_manager()

    existing = db.get_user(address)
    if not existing:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    success = db.delete_user(address)
    if not success:
        raise HTTPException(status_code=400, detail="Kullanıcı silinemedi (Owner olabilir)")

    return {"status": "success", "message": "Kullanıcı silindi"}


@router.put("/admin/users/{address}/role")
def update_user_role(address: str, role_data: dict, admin: dict = Depends(require_role('OWNER'))):
    """Kullanıcı rolünü güncelle (eski endpoint uyumluluk için)"""
    db = get_db_manager()

    new_role = role_data.get("role")
    if not new_role:
        raise HTTPException(status_code=400, detail="Role gerekli")

    allowed_roles = ['OWNER', 'MANAGER', 'ENGINEER', 'OPERATOR']
    if new_role.upper() not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Geçersiz rol. Geçerli roller: {', '.join(allowed_roles)}")

    success = db.update_user_role(address, new_role.upper())
    if not success:
        raise HTTPException(status_code=400, detail="Rol güncellenemedi")

    return {"status": "success", "user": db.get_user(address)}


# --- Debug Endpoint ---
@router.get("/debug/fix-owner")
def debug_fix_owner(admin: dict = Depends(require_role('OWNER'))):
    """Debug: Force reload env and seed owner"""
    from dotenv import load_dotenv
    load_dotenv(override=True)

    db = get_db_manager()
    owner_address = os.getenv('CONTRACT_OWNER_ADDRESS')

    if not owner_address:
        return {"status": "error", "message": "CONTRACT_OWNER_ADDRESS not found in .env"}

    try:
        user = db.get_user(owner_address)
        msg = ""
        if not user:
            db.create_user(owner_address, "OWNER", "Contract Owner")
            msg = "Created new user. "

        conn = db.get_connection()
        if conn:
            try:
                with conn.cursor() as cursor:
                    cursor.execute("UPDATE users SET role='OWNER', is_owner=TRUE WHERE address=%s", (owner_address,))
                conn.commit()
            finally:
                db.return_connection(conn)

        return {
            "status": "success",
            "message": f"{msg}Owner rights enforced.",
            "enforced_address": owner_address
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
