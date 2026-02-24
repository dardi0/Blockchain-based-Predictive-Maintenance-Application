"""
Per-request / per-task log context via Python contextvars.

contextvars, asyncio ve thread-pool'larda güvenli şekilde çalışır:
- FastAPI handler'da set_correlation_id() → tüm alt çağrılara otomatik yayılır
- ZKProofGenerator içinde set_log_context(circuit_type="PREDICTION") → o proof
  süresince tüm log satırlarına circuit_type eklenir

Her context değişkeni None varsayılanla başlar; get_log_context() sadece
dolu alanları döndürür — gereksiz null field kirliği olmaz.
"""

import uuid
from contextvars import ContextVar
from typing import Any, Dict, Optional

# --- Context değişkenleri ---
_correlation_id: ContextVar[Optional[str]] = ContextVar("correlation_id", default=None)
_circuit_type:   ContextVar[Optional[str]] = ContextVar("circuit_type",   default=None)
_machine_id:     ContextVar[Optional[int]] = ContextVar("machine_id",     default=None)
_event_type:     ContextVar[Optional[str]] = ContextVar("event_type",     default=None)
_tx_hash:        ContextVar[Optional[str]] = ContextVar("tx_hash",        default=None)


# --- Public API ---

def set_correlation_id(cid: Optional[str] = None) -> str:
    """Mevcut bağlam için correlation ID ata veya üret.

    Returns:
        Atanan veya üretilen correlation ID.
    """
    cid = cid or str(uuid.uuid4())[:8]
    _correlation_id.set(cid)
    return cid


def set_log_context(
    circuit_type: Optional[str] = None,
    machine_id:   Optional[int] = None,
    event_type:   Optional[str] = None,
    tx_hash:      Optional[str] = None,
) -> None:
    """ZK/blockchain spesifik context alanlarını güncelle.

    None olmayan her argüman mevcut değerin üzerine yazar.
    """
    if circuit_type is not None:
        _circuit_type.set(circuit_type)
    if machine_id is not None:
        _machine_id.set(machine_id)
    if event_type is not None:
        _event_type.set(event_type)
    if tx_hash is not None:
        _tx_hash.set(tx_hash)


def clear_log_context() -> None:
    """Tüm context alanlarını sıfırla (istek/görev sonunda çağır)."""
    _correlation_id.set(None)
    _circuit_type.set(None)
    _machine_id.set(None)
    _event_type.set(None)
    _tx_hash.set(None)


def get_log_context() -> Dict[str, Any]:
    """Dolu context alanlarını dict olarak döndür.

    PDMJsonFormatter bu fonksiyonu her log kaydına çağırır.
    """
    ctx: Dict[str, Any] = {}
    if (v := _correlation_id.get()) is not None:
        ctx["correlation_id"] = v
    if (v := _circuit_type.get()) is not None:
        ctx["circuit_type"] = v
    if (v := _machine_id.get()) is not None:
        ctx["machine_id"] = v
    if (v := _event_type.get()) is not None:
        ctx["event_type"] = v
    if (v := _tx_hash.get()) is not None:
        ctx["tx_hash"] = v
    return ctx
