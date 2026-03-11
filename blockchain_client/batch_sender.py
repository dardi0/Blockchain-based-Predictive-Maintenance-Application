# -*- coding: utf-8 -*-
"""
BatchSender — Toplu ZK proof + blockchain gönderim modülü
Saatlik (veya BATCH_INTERVAL saniyelik) periyotlarda bekleyen kayıtları
tek bir ZK proof + tek bir TX ile blockchain'e gönderir.

Tasarruf: ~%98 maliyet + ~%98 hesaplama (60 kayıt → 1 proof + 1 TX / saat)
"""

import time
import logging
import threading
from typing import Dict, Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from database.manager import PdMDatabaseManager
    from blockchain_client.handler import HybridBlockchainHandler
    from zk_proof_generator import ZKProofGenerator

logger = logging.getLogger(__name__)


class BatchSender:
    """Periyodik toplu ZK proof üretimi ve blockchain gönderimi."""

    def __init__(self, db, handler, zk_generator):
        """
        Args:
            db:           PdMDatabaseManager instance
            handler:      HybridBlockchainHandler instance
            zk_generator: ZKProofGenerator instance
        """
        from config import BatchConfig
        self.db: "PdMDatabaseManager" = db
        self.handler: "HybridBlockchainHandler" = handler
        self.zk: "ZKProofGenerator" = zk_generator
        self._cfg = BatchConfig

        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._last_flush_time: float = 0.0
        self._last_size_flush_time: float = 0.0   # size-trigger cooldown için
        self._status: Dict[str, Any] = {
            'running': False,
            'last_flush': None,
            'total_batches': 0,
            'total_records': 0,
        }

    # ──────────────────────────────────────────────────────────────────────
    # Lifecycle
    # ──────────────────────────────────────────────────────────────────────

    def start(self):
        """Daemon thread'i başlat."""
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run_loop, daemon=True, name="BatchSender"
        )
        self._thread.start()
        self._status['running'] = True
        logger.info(
            f"BatchSender started (interval={self._cfg.BATCH_INTERVAL}s, "
            f"max_size={self._cfg.BATCH_MAX_SIZE})"
        )

    def stop(self):
        """Thread'i durdur."""
        self._stop_event.set()
        self._status['running'] = False
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("BatchSender stopped")

    def get_status(self) -> Dict[str, Any]:
        """Mevcut durum bilgisini döndür."""
        status = dict(self._status)
        status['running'] = self._thread is not None and self._thread.is_alive()
        return status

    # ──────────────────────────────────────────────────────────────────────
    # Internal loop
    # ──────────────────────────────────────────────────────────────────────

    # Size-triggered flush'lar arasındaki minimum bekleme süresi (saniye).
    # Başarısız flush sonrası sonsuz döngüyü önler.
    _SIZE_TRIGGER_COOLDOWN = 300   # 5 dakika

    def _run_loop(self):
        """Periyodik flush döngüsü.

        İki tetikleyici:
        - Zaman: elapsed >= BATCH_INTERVAL (güvenlik ağı, varsayılan 2 saat)
        - Boyut: pending >= BATCH_MAX_SIZE, en az _SIZE_TRIGGER_COOLDOWN saniyede bir
          (başarısız flush sonrası sonsuz döngüyü önler)
        """
        logger.info("BatchSender loop started")
        while not self._stop_event.is_set():
            now = time.time()
            elapsed = now - self._last_flush_time
            size_cooldown_ok = (now - self._last_size_flush_time) >= self._SIZE_TRIGGER_COOLDOWN
            pending = self.db.count_pending_sensor_records() if size_cooldown_ok else 0
            size_triggered = size_cooldown_ok and pending >= self._cfg.BATCH_MAX_SIZE
            if elapsed >= self._cfg.BATCH_INTERVAL or size_triggered:
                if size_triggered:
                    logger.info(
                        f"BatchSender: size-triggered flush "
                        f"({pending} pending >= {self._cfg.BATCH_MAX_SIZE})"
                    )
                    self._last_size_flush_time = now
                try:
                    self._run_all_flushes()
                except Exception as exc:
                    logger.error(f"BatchSender loop error: {exc}")
                self._last_flush_time = time.time()
            # Küçük uyku: CPU'ya soluk aldır, stop_event'i hızlı yakala
            self._stop_event.wait(timeout=30)
        logger.info("BatchSender loop exited")

    def _run_all_flushes(self):
        """Her batch tipi için flush çalıştır."""
        if not self._lock.acquire(blocking=False):
            logger.info("BatchSender: periodic flush skipped (force_flush in progress)")
            return
        try:
            for batch_type in ('SENSOR', 'FAULT'):
                try:
                    result = self._flush_type(batch_type)
                    if result.get('skipped'):
                        continue
                    status = 'SUCCESS' if result.get('success') else 'FAILED'
                    logger.info(
                        f"Batch flush [{batch_type}] → {status} | "
                        f"records={result.get('record_count', 0)} "
                        f"tx={result.get('tx_hash', 'N/A')}"
                    )
                except Exception as exc:
                    logger.error(f"Flush error [{batch_type}]: {exc}")
        finally:
            self._lock.release()

    # ──────────────────────────────────────────────────────────────────────
    # Public: force flush (API endpoint için)
    # ──────────────────────────────────────────────────────────────────────

    def force_flush(self) -> Dict[str, Any]:
        """API'den çağrılabilir anlık flush. Lock ile korunur."""
        if not self._lock.acquire(blocking=False):
            return {'success': False, 'error': 'flush_already_in_progress'}
        try:
            results = {}
            for batch_type in ('SENSOR', 'FAULT'):
                results[batch_type] = self._flush_type(batch_type)
            self._last_flush_time = time.time()
            return {'success': True, 'results': results}
        except Exception as exc:
            logger.error(f"force_flush error: {exc}")
            return {'success': False, 'error': str(exc)}
        finally:
            self._lock.release()

    # ──────────────────────────────────────────────────────────────────────
    # Core flush logic
    # ──────────────────────────────────────────────────────────────────────

    def _flush_type(self, batch_type: str) -> Dict[str, Any]:
        """Tek bir tip için bekleyen kayıtları al, proof üret, TX gönder."""
        # 1. Bekleyen kayıtları çek
        if batch_type == 'SENSOR':
            records = self.db.get_pending_sensor_records_for_batch(
                self._cfg.BATCH_MAX_SIZE
            )
        else:
            records = self.db.get_pending_fault_records_for_batch(
                self._cfg.BATCH_MAX_SIZE
            )

        if not records or len(records) < self._cfg.BATCH_MIN_SIZE:
            return {'skipped': True, 'batch_type': batch_type, 'reason': 'no_pending_records'}

        # 2. data_hash listesini hazırla
        hashes = [r['data_hash'] for r in records if r.get('data_hash')]
        if not hashes:
            return {'skipped': True, 'batch_type': batch_type, 'reason': 'no_hashes'}

        batch_timestamp = int(time.time())

        # 3. ZK proof üret
        try:
            proof_data = self.zk.generate_batch_proof(hashes, batch_timestamp)
        except Exception as exc:
            logger.error(f"ZK proof generation failed: {exc}")
            return {'success': False, 'error': f'zk_proof_failed: {exc}', 'batch_type': batch_type}

        if not proof_data:
            return {'success': False, 'error': 'zk_proof_returned_none', 'batch_type': batch_type}

        # 4. Merkle root (publicInputs[0])
        merkle_root_int = int(proof_data['publicInputs'][0])
        merkle_root_hex = hex(merkle_root_int)

        # 5. DB'ye batch kaydı oluştur (PENDING)
        batch_id = self.db.create_batch_submission(
            batch_type, len(records), str(merkle_root_int)
        )
        if not batch_id:
            return {'success': False, 'error': 'db_create_batch_failed', 'batch_type': batch_type}

        # 6. Blockchain'e gönder
        # Sensor/fault batch submissions use OPERATOR role (has SENSOR_DATA_RESOURCE access).
        # Avoid defaulting to MANAGER which doesn't have that resource grant.
        try:
            result = self.handler.submit_batch(
                merkle_root=merkle_root_hex,
                record_count=len(records),
                batch_type=batch_type,
                proof_data=proof_data,
                actor_role='OPERATOR',
            )
        except Exception as exc:
            logger.error(f"submit_batch error: {exc}")
            result = {'success': False, 'error': str(exc)}

        # 7. Sonuca göre DB güncelle
        if result.get('success'):
            self.db.update_batch_submission(
                batch_id,
                tx_hash=result.get('tx_hash'),
                block_number=result.get('block_number'),
                gas_used=result.get('gas_used'),
                status='SUCCESS',
            )
            record_ids = [r['id'] for r in records]
            if batch_type == 'SENSOR':
                self.db.mark_sensor_records_batched(record_ids, batch_id)
            else:
                self.db.mark_fault_records_batched(record_ids, batch_id)

            self._status['total_batches'] += 1
            self._status['total_records'] += len(records)
            self._status['last_flush'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        else:
            self.db.update_batch_submission(
                batch_id,
                status='FAILED',
                error_msg=result.get('error', 'unknown'),
            )

        result['batch_type'] = batch_type
        result['batch_id'] = batch_id
        result['record_count'] = len(records)
        result['merkle_root'] = merkle_root_hex
        return result
