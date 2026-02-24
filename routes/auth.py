"""
Auth Routes - Kimlik doğrulama endpoint'leri

Endpoints:
- POST /auth/login - Kullanıcı girişi
- POST /auth/register - Kullanıcı aktivasyonu
- POST /auth/logout - Çıkış
- GET /auth/verify - Token doğrulama
- GET /auth/me - Mevcut kullanıcı bilgisi
"""

import os
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field

from .dependencies import (
    get_db_manager,
    verify_signature,
    create_auth_token,
    verify_auth_token,
    invalidate_token,
    get_current_user,
    get_blockchain_handler,
    JWT_EXPIRY_HOURS
)

router = APIRouter(prefix="/auth", tags=["Auth"])
logger = logging.getLogger(__name__)


# --- Pydantic Models ---
class UserLogin(BaseModel):
    address: str = Field(..., min_length=42, max_length=42, pattern=r"^0x[a-fA-F0-9]{40}$")
    signature: str = Field(..., min_length=130)
    message: str = Field(..., min_length=1)

class UserRegister(BaseModel):
    address: str = Field(..., min_length=42, max_length=42, pattern=r"^0x[a-fA-F0-9]{40}$")
    role: str = Field(...)
    name: Optional[str] = Field(default=None, max_length=100)
    signature: str = Field(..., min_length=130)
    message: str = Field(..., min_length=1)

    @classmethod
    def validate_role(cls, v: str) -> str:
        allowed_roles = ['OWNER', 'MANAGER', 'ENGINEER', 'OPERATOR']
        if v.upper() not in allowed_roles:
            raise ValueError(f'Role must be one of: {", ".join(allowed_roles)}')
        return v.upper()


# --- Endpoints ---
@router.post("/login")
def login(user_data: UserLogin):
    """Kullanıcı girişi (İmza Doğrulamalı)"""
    db = get_db_manager()

    # 1. İmza Doğrulama
    if not verify_signature(user_data.address, user_data.message, user_data.signature):
        raise HTTPException(status_code=401, detail="Geçersiz imza! Kimlik doğrulanamadı.")

    # 2. Kullanıcı Kontrolü
    user = db.get_user(user_data.address)

    # 3. Owner özel durumu - DB'de yoksa otomatik oluştur
    if not user:
        owner_address = os.getenv('CONTRACT_OWNER_ADDRESS', '')
        if owner_address and user_data.address.lower() == owner_address.lower():
            db.create_user(owner_address, 'OWNER', 'Contract Owner')
            conn = db.get_connection()
            if conn:
                try:
                    with conn.cursor() as cursor:
                        cursor.execute(
                            "UPDATE users SET is_owner = TRUE, status = 'active' WHERE lower(address) = lower(%s)",
                            (owner_address,)
                        )
                    conn.commit()
                finally:
                    db.return_connection(conn)
            user = db.get_user(owner_address)
            logger.info(f"Owner auto-registered: {owner_address}")

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Kullanıcı bulunamadı. Lütfen yöneticinize başvurun."
        )

    # 4. Owner için status kontrolü bypass
    is_owner = user.get('is_owner', False) or user.get('role') == 'OWNER'

    if not is_owner:
        user_status = user.get('status', 'pending')

        if user_status == 'pending':
            raise HTTPException(
                status_code=403,
                detail="Hesabınız henüz aktifleştirilmedi. Lütfen önce Register yapın."
            )

        if user_status == 'suspended':
            raise HTTPException(
                status_code=403,
                detail="Hesabınız askıya alınmış. Lütfen yöneticinize başvurun."
            )

    # 5. Son giriş zamanını güncelle
    db.update_last_login(user_data.address)

    # 6. Create auth token
    auth_token = create_auth_token(user["address"], user["role"])

    return {
        "user": user,
        "token": auth_token,
        "expires_in": JWT_EXPIRY_HOURS * 3600
    }


@router.post("/register")
def register(user_data: UserRegister):
    """
    Kullanıcı aktivasyonu (Wallet doğrulama + Blockchain kayıt).
    """
    db = get_db_manager()
    blockchain_handler = get_blockchain_handler()

    # 1. İmza Doğrulama
    if not verify_signature(user_data.address, user_data.message, user_data.signature):
        raise HTTPException(status_code=401, detail="Geçersiz imza! Kimlik doğrulanamadı.")

    # 2. Kullanıcı DB'de var mı kontrol et
    existing_user = db.get_user(user_data.address)

    if not existing_user:
        raise HTTPException(
            status_code=403,
            detail="Bu cüzdan adresi sisteme kayıtlı değil. Lütfen yöneticinize başvurun."
        )

    # 3. Kullanıcı durumunu kontrol et
    user_status = existing_user.get('status', 'pending')

    if user_status == 'active':
        raise HTTPException(
            status_code=400,
            detail="Bu hesap zaten aktif. Lütfen giriş yapın."
        )

    try:
        # 4. Blockchain'e kayıt
        blockchain_result = None
        node_id = None

        if blockchain_handler and blockchain_handler.is_ready():
            logger.info(f"Registering user {user_data.address} on blockchain...")
            blockchain_result = blockchain_handler.register_node_on_blockchain(
                user_address=user_data.address,
                role=existing_user['role'],
                node_name=existing_user.get('name') or f"{existing_user['role']}_{user_data.address[:8]}"
            )

            if not blockchain_result.get('success') and not blockchain_result.get('already_registered'):
                error_msg = blockchain_result.get('error', 'Unknown blockchain error')
                logger.error(f"Blockchain registration failed: {error_msg}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Blockchain kaydı başarısız: {error_msg}. Lütfen tekrar deneyin."
                )

            node_id = blockchain_result.get('node_id')
            logger.info(f"Blockchain registration successful for {user_data.address}")
        else:
            logger.warning("Blockchain handler not ready, skipping on-chain registration")

        # 5. Kullanıcıyı aktif et
        db.activate_user(user_data.address, node_id)

        activated_user = db.get_user(user_data.address)

        # 6. Create auth token
        auth_token = create_auth_token(activated_user["address"], activated_user["role"])

        response = {
            "user": activated_user,
            "token": auth_token,
            "expires_in": JWT_EXPIRY_HOURS * 3600,
            "message": "Hesabınız başarıyla aktifleştirildi!"
        }

        if blockchain_result:
            response["blockchain"] = {
                "registered": blockchain_result.get('success', False),
                "tx_hash": blockchain_result.get('tx_hash'),
                "node_id": node_id,
                "already_registered": blockchain_result.get('already_registered', False)
            }

        # Bildirim oluştur
        db.create_notification(
            user_address=user_data.address,
            message=f"Hoş geldiniz {activated_user.get('name', '')}! Hesabınız aktifleştirildi.",
            notif_type="success"
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=f"Aktivasyon hatası: {str(e)}")


@router.post("/logout")
def logout(authorization: Optional[str] = Header(None)):
    """Çıkış yap - Token'ı geçersiz kıl"""
    if authorization:
        invalidate_token(authorization)
    return {"status": "success", "message": "Başarıyla çıkış yapıldı"}


@router.get("/verify")
def verify_token_endpoint(authorization: str = Header(...)):
    """Token doğrulama"""
    db = get_db_manager()
    token_data = verify_auth_token(authorization)

    if not token_data:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş token")

    user = db.get_user(token_data["address"])
    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")

    return {"valid": True, "user": user}


@router.get("/me")
def get_current_user_info(
    authorization: Optional[str] = Header(None),
    x_wallet_address: Optional[str] = Header(None)
):
    """Mevcut kullanıcı bilgilerini getir"""
    db = get_db_manager()
    current_user = get_current_user(authorization, x_wallet_address)

    if not current_user:
        raise HTTPException(status_code=401, detail="Kimlik doğrulaması gerekli")

    user = db.get_user(current_user["address"])
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    return {"user": user}
