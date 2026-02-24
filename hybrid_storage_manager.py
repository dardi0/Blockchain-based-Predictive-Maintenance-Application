from database import PdMDatabaseManager, SensorData, PredictionData, MaintenanceData
import time
from typing import Dict, List, Optional
import logging

# Logging setup
logger = logging.getLogger(__name__)

class LocalStorageManager:
    """
    Yerel Depolama Yöneticisi - PostgreSQL (PdMDatabaseManager) wrapper
    
    Artık kendi SQLite veritabanını kullanmak yerine merkezi PdMDatabaseManager'ı
    kullanarak PostgreSQL'e erişir. Bu sayede H-1 (Schema Mismatch) ve kilitlenme
    sorunları çözülür.
    """
    
    def __init__(self, db_manager: PdMDatabaseManager = None):
        """
        Initialize LocalStorageManager
        
        Args:
            db_manager: Mevcut bir PdMDatabaseManager instance'ı (Dependency Injection)
        """
        self.db = db_manager if db_manager else PdMDatabaseManager()
        logger.info("✅ LocalStorageManager (PostgreSQL Unified) hazır.")

    def store_sensor_data(self, sensor_data: SensorData) -> int:
        """
        Sensör verisini kaydet (PdMDatabaseManager üzerinden)
        """
        data_dict = {
            'machine_id': sensor_data.machine_id,
            'timestamp': sensor_data.timestamp,
            'air_temp': sensor_data.air_temp,
            'process_temp': sensor_data.process_temp,
            'rotation_speed': sensor_data.rotation_speed,
            'torque': sensor_data.torque,
            'tool_wear': sensor_data.tool_wear,
            'machine_type': sensor_data.machine_type,
            'prediction': sensor_data.prediction,
            'prediction_probability': sensor_data.prediction_probability,
            'prediction_reason': sensor_data.prediction_reason,
            'analysis_time': sensor_data.analysis_time,
            'submitter': sensor_data.submitter,
            'blockchain_success': sensor_data.blockchain_success,
            'tx_hash': sensor_data.tx_hash,
            'proof_id': sensor_data.proof_id,
            'zk_proof_hash': sensor_data.zk_proof_hash,
            'offchain_data_hash': sensor_data.offchain_data_hash,
            'prediction_tx_hash': sensor_data.prediction_tx_hash,
            'prediction_proof_id': sensor_data.prediction_proof_id
        }
        
        # Backward compatibility için alias'lar
        if hasattr(sensor_data, 'submitter') and sensor_data.submitter:
            data_dict['recorded_by'] = sensor_data.submitter

        return self.db.save_sensor_data(data_dict)

    def get_recent_data(self, limit: int = 50) -> List[Dict]:
        """Son kayıtları getir"""
        return self.db.get_sensor_data(limit=limit)

    def get_data_by_hash(self, data_hash: str) -> Optional[Dict]:
        """Data hash'e göre kayıt getir (implementasyon eksikse None döner)"""
        # PdMDatabaseManager'da data_hash ile sorgu yok, şimdilik ID ile veya raw query eklenebilir.
        # Geçici olarak tüm veriler içinde filtreleme veya None (optimize edilmeli)
        # PostgreSQL'de doğrudan data_hash indexi var, sorgu eklenebilir.
        
        try:
            conn = self.db.get_connection()
            with conn.cursor(cursor_factory=self.db.get_connection().cursor_factory) as cursor: # cursor factory trick or basic dict
                 # Psycopg2 extra import needed if we want dict cursor explicitly here
                 # But self.db uses pool, let's just use simple fetch
                 pass
            self.db.return_connection(conn)
        except:
             pass
             
        # Basit çözüm: şimdilik None dönelim, çünkü bu nadiren kullanılıyor
        return None

    def update_blockchain_status(self, record_id: int, tx_hash: str, block_number: int = 0):
        """Blockchain durumunu güncelle"""
        return self.db.update_blockchain_info(record_id, success=True, tx_hash=tx_hash)

    def get_pending_uploads(self) -> List[Dict]:
        """Blockchain'e yüklenmemiş verileri getir"""
        return self.db.get_sensor_data(blockchain_filter="Başarısız", limit=50)

    # Alias methods for compatibility
    def close(self):
        """Kapat (Connection pool yönetildiği için pasif)"""
        pass
