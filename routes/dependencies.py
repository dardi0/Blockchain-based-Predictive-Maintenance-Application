"""
Shared dependencies for route modules.
Bu modül tüm route'larda kullanılan ortak bağımlılıkları içerir.
"""

import os
import time
import hmac
import base64
import hashlib
import secrets
import logging

from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from fastapi import Header, HTTPException, Depends
from eth_account import Account
from eth_account.messages import encode_defunct
from database import PdMDatabaseManager

# --- Logger ---
logger = logging.getLogger(__name__)

# --- Database Manager (Singleton) ---
_db_manager: Optional[PdMDatabaseManager] = None

def get_db_manager() -> PdMDatabaseManager:
    """Database manager singleton'ını döndür."""
    global _db_manager
    if _db_manager is None:
        _db_manager = PdMDatabaseManager()
    return _db_manager

# --- JWT Token System ---
JWT_SECRET = os.getenv("JWT_SECRET", secrets.token_hex(32))
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))
active_tokens: Dict[str, Dict[str, Any]] = {}

def create_auth_token(address: str, role: str) -> str:
    """Create a simple auth token for the user."""
    token_data = f"{address}:{role}:{int(time.time())}"
    signature = hmac.new(JWT_SECRET.encode(), token_data.encode(), hashlib.sha256).hexdigest()
    token = base64.urlsafe_b64encode(f"{token_data}:{signature}".encode()).decode()

    expires_at = datetime.now() + timedelta(hours=JWT_EXPIRY_HOURS)
    active_tokens[token] = {
        "address": address,
        "role": role,
        "expires_at": expires_at
    }
    _cleanup_expired_tokens()
    return token

def verify_auth_token(token: str) -> Optional[Dict[str, Any]]:
    """Verify and return token data if valid."""
    if not token:
        return None

    if token.startswith("Bearer "):
        token = token[7:]

    if token in active_tokens:
        token_data = active_tokens[token]
        if datetime.now() < token_data["expires_at"]:
            return token_data
        else:
            del active_tokens[token]
            return None

    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        parts = decoded.rsplit(":", 1)
        if len(parts) != 2:
            return None

        data, signature = parts
        expected_sig = hmac.new(JWT_SECRET.encode(), data.encode(), hashlib.sha256).hexdigest()

        if hmac.compare_digest(signature, expected_sig):
            data_parts = data.split(":")
            if len(data_parts) >= 3:
                address, role, timestamp = data_parts[0], data_parts[1], int(data_parts[2])
                if time.time() - timestamp < JWT_EXPIRY_HOURS * 3600:
                    return {"address": address, "role": role}
    except Exception:
        pass

    return None

def _cleanup_expired_tokens():
    """Remove expired tokens from memory."""
    now = datetime.now()
    expired = [token for token, data in active_tokens.items() if now >= data["expires_at"]]
    for token in expired:
        del active_tokens[token]

def invalidate_token(token: str) -> bool:
    """Token'ı geçersiz kıl."""
    if token.startswith("Bearer "):
        token = token[7:]
    if token in active_tokens:
        del active_tokens[token]
        return True
    return False

# --- Signature Verification ---
def verify_signature(address: str, message: str, signature: str) -> bool:
    """Ethereum imzasını doğrula."""
    try:
        msg_encoded = encode_defunct(text=message)
        recovered_address = Account.recover_message(msg_encoded, signature=signature)
        return recovered_address.lower() == address.lower()
    except Exception as e:
        logger.error(f"Signature verification error: {e}")
        return False

# --- Current User Dependency ---
def get_current_user(
    authorization: Optional[str] = Header(None),
    x_wallet_address: Optional[str] = Header(None)
) -> Optional[Dict[str, Any]]:
    """Get current user from token or wallet address."""
    db = get_db_manager()

    if authorization:
        token_data = verify_auth_token(authorization)
        if token_data:
            return token_data

    if x_wallet_address:
        user = db.get_user(x_wallet_address)
        if user:
            return {"address": x_wallet_address, "role": user.get("role", "UNKNOWN")}

    return None

# --- Role-based Access Control ---
def require_role(*allowed_roles, check_blockchain: bool = False):
    """
    Belirli rollere sahip kullanıcı gerektirir.

    Args:
        allowed_roles: İzin verilen roller
        check_blockchain: Blockchain kontrolü yap (şu an devre dışı)
    """
    async def _require_role(x_wallet_address: str = Header(...)):
        db = get_db_manager()
        user = db.get_user(x_wallet_address)

        if not user:
            raise HTTPException(status_code=401, detail="Unauthorized")

        db_role = user['role']
        if db_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Bu işlem için {', '.join(allowed_roles)} rolü gereklidir"
            )

        return user

    return _require_role

# --- Blockchain Handler Accessor ---
_blockchain_handler = None

def set_blockchain_handler(handler):
    """Blockchain handler'ı ayarla (api_main tarafından çağrılır)."""
    global _blockchain_handler
    _blockchain_handler = handler

def get_blockchain_handler():
    """Blockchain handler'ı döndür."""
    return _blockchain_handler

def is_blockchain_ready() -> bool:
    """Blockchain hazır mı kontrol et."""
    return _blockchain_handler is not None and _blockchain_handler.is_ready()
