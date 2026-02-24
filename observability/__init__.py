"""
PDM Observability Package

Merkezi loglama altyapısı:
- JSON structured logs (Loki / ELK ingestion için)
- Renkli console output (geliştirme için)
- contextvars tabanlı correlation_id, circuit_type, machine_id yayılımı

Kullanım:
    from observability import configure_logging, set_correlation_id, set_log_context

    # Uygulama başlangıcında bir kez çağır:
    configure_logging(fmt="json")   # production
    configure_logging(fmt="pretty") # development

    # İstek başında:
    set_correlation_id("req_abc123")
    set_log_context(circuit_type="PREDICTION", machine_id=42)
"""

from .logging_config import configure_logging
from .log_context import (
    set_correlation_id,
    set_log_context,
    clear_log_context,
    get_log_context,
)

__all__ = [
    "configure_logging",
    "set_correlation_id",
    "set_log_context",
    "clear_log_context",
    "get_log_context",
]
