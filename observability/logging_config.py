"""
Merkezi logging konfigürasyonu.

İki mod:
  fmt="json"   → python-json-logger ile makine-okunur JSON → stdout
                 Loki/Filebeat/Logstash doğrudan okur.
  fmt="pretty" → colorlog ile renkli, insan-okunur console output.

Her iki modda da PDMJsonFormatter (veya filter'ı) contextvars'tan
correlation_id, circuit_type, machine_id, event_type alanlarını
her log kaydına otomatik enjekte eder.

LOG_FORMAT=json   LOG_LEVEL=DEBUG  ortam değişkenleriyle override edilebilir.
"""

import logging
import logging.handlers
import os
import sys
from typing import Optional

from .log_context import get_log_context

# --- Env config ---
NODE_ID  = os.getenv("PDM_NODE_ID", "node_01")
LOG_LEVEL  = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.getenv("LOG_FORMAT", "json")   # "json" | "pretty"

# --- Opsiyonel bağımlılıklar ---
try:
    from pythonjsonlogger import jsonlogger as _jl
    _JsonFormatter = _jl.JsonFormatter
    HAS_JSON_LOGGER = True
except ImportError:
    HAS_JSON_LOGGER = False

try:
    import colorlog as _colorlog
    HAS_COLORLOG = True
except ImportError:
    HAS_COLORLOG = False


# ---------------------------------------------------------------------------
# JSON Formatter
# ---------------------------------------------------------------------------

class _ContextFilter(logging.Filter):
    """Her log kaydına context alanlarını ve sabit node_id'yi ekler."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.node_id = NODE_ID
        for key, value in get_log_context().items():
            setattr(record, key, value)
        return True


if HAS_JSON_LOGGER:
    class PDMJsonFormatter(_JsonFormatter):
        """python-json-logger tabanlı JSON formatter.

        Üretilen JSON satırı örneği:
        {
          "timestamp": "2026-02-23T10:00:00.123Z",
          "level": "error",
          "logger": "zk_proof_generator",
          "message": "Witness calculation failed",
          "node_id": "node_01",
          "correlation_id": "a1b2c3d4",
          "circuit_type": "PREDICTION",
          "machine_id": 42,
          "event_type": "zk_proof_failed"
        }
        """

        def add_fields(
            self,
            log_record: dict,
            record: logging.LogRecord,
            message_dict: dict,
        ) -> None:
            super().add_fields(log_record, record, message_dict)

            # context filter zaten ekledi, sadece normalize et
            log_record["level"]  = record.levelname.lower()
            log_record["logger"] = record.name
            log_record["node_id"] = getattr(record, "node_id", NODE_ID)

            # context alanlarını üst üste yaz (filter eklemiş olsa da
            # extra={} ile geçilen değerler öncelikli olsun)
            for field in ("correlation_id", "circuit_type", "machine_id",
                          "event_type", "tx_hash"):
                val = getattr(record, field, None)
                if val is not None:
                    log_record[field] = val

            # Gereksiz alanları temizle
            for redundant in ("levelname", "color_message"):
                log_record.pop(redundant, None)
else:
    PDMJsonFormatter = None  # type: ignore


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def configure_logging(
    level:    str           = LOG_LEVEL,
    fmt:      str           = LOG_FORMAT,
    log_file: Optional[str] = None,
) -> None:
    """Root logger'ı bir kez yapılandır.

    Args:
        level:    "DEBUG" | "INFO" | "WARNING" | "ERROR"
        fmt:      "json"  → makine-okunur (production / Loki)
                  "pretty"→ renkli console (geliştirme)
        log_file: Opsiyonel dosya yolu; her zaman JSON formatında yazılır.
    """
    root = logging.getLogger()
    root.setLevel(getattr(logging, level, logging.INFO))
    root.handlers.clear()

    ctx_filter = _ContextFilter()

    # -- stdout handler -------------------------------------------------
    if fmt == "json" and HAS_JSON_LOGGER:
        stdout_handler = logging.StreamHandler(sys.stdout)
        stdout_handler.setFormatter(PDMJsonFormatter(
            fmt="%(timestamp)s %(level)s %(logger)s %(message)s",
            rename_fields={"asctime": "timestamp"},
            timestamp=True,
        ))
    elif HAS_COLORLOG:
        stdout_handler = _colorlog.StreamHandler(sys.stdout)
        stdout_handler.setFormatter(_colorlog.ColoredFormatter(
            "%(log_color)s%(asctime)s %(levelname)-8s%(reset)s "
            "%(cyan)s[%(name)s]%(reset)s "
            "%(white)s%(message)s%(reset)s",
            datefmt="%Y-%m-%d %H:%M:%S",
            log_colors={
                "DEBUG":    "white",
                "INFO":     "green",
                "WARNING":  "yellow",
                "ERROR":    "red",
                "CRITICAL": "bold_red",
            },
        ))
    else:
        stdout_handler = logging.StreamHandler(sys.stdout)
        stdout_handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))

    stdout_handler.addFilter(ctx_filter)
    root.addHandler(stdout_handler)

    # -- dosya handler (opsiyonel) --------------------------------------
    if log_file:
        if HAS_JSON_LOGGER:
            file_handler = logging.handlers.RotatingFileHandler(
                log_file,
                maxBytes=20 * 1024 * 1024,   # 20 MB
                backupCount=5,
                encoding="utf-8",
            )
            file_handler.setFormatter(PDMJsonFormatter(
                fmt="%(timestamp)s %(level)s %(logger)s %(message)s",
                rename_fields={"asctime": "timestamp"},
                timestamp=True,
            ))
        else:
            file_handler = logging.handlers.RotatingFileHandler(
                log_file, maxBytes=20 * 1024 * 1024, backupCount=5,
                encoding="utf-8",
            )
            file_handler.setFormatter(logging.Formatter(
                "%(asctime)s %(levelname)-8s [%(name)s] %(message)s"
            ))
        file_handler.addFilter(ctx_filter)
        root.addHandler(file_handler)

    # -- gürültülü üçüncü taraf logger'ları sustur -------------------
    for noisy in ("urllib3", "web3", "eth_abi", "asyncio",
                  "tensorflow", "h5py", "absl"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
