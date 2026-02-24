import time
import hashlib
import logging
from hybrid_storage_manager import SensorData, PredictionData, MaintenanceData

# Optional Database Manager Import
try:
    from database import PdMDatabaseManager
except ImportError:
    PdMDatabaseManager = None

logger = logging.getLogger(__name__)

class DBAdapter:
    """
    Adapter: Tek veritabanı (PdMDatabase) üzerinden çalışır.
    LocalStorageManager kaldırıldı - artık sadece PdMDatabaseManager kullanılıyor.
    """
    def __init__(self, pdm_db=None):
        self.pdm_db = pdm_db

    # --- Store Metodları ---
    def store_sensor_data(self, sensor_data, pdm_id=None):
        """Sensör verisini PdMDatabase'e kaydet"""
        try:
            # SensorData dataclass -> dict dönüşümü
            data_dict = {
                'machine_id': getattr(sensor_data, 'machine_id', 0),
                'timestamp': getattr(sensor_data, 'timestamp', int(time.time())),
                'air_temp': getattr(sensor_data, 'air_temperature', 300.0),
                'process_temp': getattr(sensor_data, 'process_temperature', 310.0),
                'rotation_speed': getattr(sensor_data, 'rotational_speed', 1500),
                'torque': getattr(sensor_data, 'torque', 40.0),
                'tool_wear': getattr(sensor_data, 'tool_wear', 0),
                'machine_type': getattr(sensor_data, 'machine_type', 'M'),
                'recorded_by': getattr(sensor_data, 'submitter', ''),
            }
            
            # data_hash oluştur
            data_str = f"{data_dict['machine_id']}-{data_dict['air_temp']}-{data_dict['timestamp']}"
            data_hash = "0x" + hashlib.sha256(data_str.encode()).hexdigest()

            if pdm_id:
                return pdm_id, data_hash

            if self.pdm_db and hasattr(self.pdm_db, 'save_sensor_data'):
                record_id = self.pdm_db.save_sensor_data(data_dict)
                return record_id, data_hash
                
        except Exception as e:
            logger.error(f"store_sensor_data error: {e}")
        return None, None

    def store_prediction_data(self, prediction_data):
        """Tahmin verisini kaydet (şimdilik desteklenmiyor)"""
        return None, None

    def store_maintenance_data(self, maintenance_data):
        """Bakım verisini kaydet (şimdilik desteklenmiyor)"""
        return None, None

    # --- Update Blockchain Info ---
    def update_blockchain_proof_id(self, table_name, local_id, proof_id, tx_hash=None):
        if self.pdm_db and hasattr(self.pdm_db, "update_blockchain_info"):
            try:
                return self.pdm_db.update_blockchain_info(
                    record_id=local_id,
                    success=True,
                    tx_hash=tx_hash,
                    proof_id=proof_id
                )
            except Exception as e:
                logger.warning(f"Failed to update blockchain proof info in PdM DB: {e}")
        return None

    def update_blockchain_info(
        self,
        record_id,
        success,
        tx_hash=None,
        proof_id=None,
        zk_proof_hash=None,
        table_name="sensor_data",
    ):
        # 'N/A' benzeri değerleri None'a çevir
        if isinstance(zk_proof_hash, str) and zk_proof_hash.strip().upper() in {"N/A", "NA", "NONE", "NULL", ""}:
            zk_proof_hash = None
            
        if self.pdm_db and hasattr(self.pdm_db, "update_blockchain_info"):
            try:
                return self.pdm_db.update_blockchain_info(
                    record_id=record_id,
                    success=success,
                    tx_hash=tx_hash,
                    proof_id=proof_id,
                    offchain_hash=zk_proof_hash
                )
            except Exception as e:
                logger.warning(f"Failed to update blockchain info in PdM DB: {e}")
        
        if self.pdm_db and hasattr(self.pdm_db, "update_blockchain_proof_id"):
             return self.pdm_db.update_blockchain_proof_id(table_name, record_id, proof_id, tx_hash)
             
        return None

    # --- Get Metodları ---
    def get_sensor_data(self, data_id):
        """ID ile sensör verisini getir. PdM DB boş/None dönerse local'e düş."""
        result = None
        if self.pdm_db and hasattr(self.pdm_db, "get_sensor_data"):
            try:
                result = self.pdm_db.get_sensor_data(record_id=data_id)
                # PdM DB'de yoksa local'e düş
                if (isinstance(result, list) and not result) or result is None:
                    result = None
            except Exception as e:
                logger.warning(f"Error fetching sensor data from PdM DB: {e}")
                result = None
        # Liste dönerse ilk elemanı ver
        if isinstance(result, list):
            return result[0] if result else None
        return result

    def get_sensor_data_by_hash(self, data_hash: str):
        result = None
        if self.pdm_db and hasattr(self.pdm_db, "get_sensor_data_by_hash"):
            try:
                result = self.pdm_db.get_sensor_data_by_hash(data_hash)
                if (isinstance(result, list) and not result) or result is None:
                    result = None
            except Exception as e:
                logger.warning(f"Error fetching sensor data by hash from PdM DB: {e}")
                result = None
        if isinstance(result, list):
            return result[0] if result else None
        return result

    # -- Yeni: PdM dict -> SensorData dönüştürücü yardımcılar --
    def get_sensor_data_obj(self, data_id):
        """ID ile sensör verisini getir ve SensorData döndür (PdM dict to dataclass)."""
        # Önce PdM DB
        if self.pdm_db and hasattr(self.pdm_db, "get_sensor_data"):
            try:
                res_list = self.pdm_db.get_sensor_data(record_id=data_id)
                if isinstance(res_list, list) and res_list:
                    row = res_list[0]
                    if isinstance(row, dict):
                        return SensorData(
                            id=row.get('id') or row.get('data_id'),
                            machine_id=row.get('machine_id'),
                            air_temperature=row.get('air_temp') or row.get('air_temperature'),
                            process_temperature=row.get('process_temp') or row.get('process_temperature'),
                            rotational_speed=row.get('rotation_speed') or row.get('rotational_speed'),
                            torque=row.get('torque'),
                            tool_wear=row.get('tool_wear'),
                            machine_type=row.get('machine_type'),
                            timestamp=row.get('timestamp'),
                        )
                    return row
            except Exception as e:
                logger.warning(f"Error converting sensor data dict to obj: {e}")
        return None

    def get_sensor_data_by_hash_obj(self, data_hash: str):
        """Hash ile sensör verisini getir ve SensorData döndür (PdM dict to dataclass)."""
        if self.pdm_db and hasattr(self.pdm_db, "get_sensor_data_by_hash"):
            try:
                row = self.pdm_db.get_sensor_data_by_hash(data_hash)
                if isinstance(row, dict):
                    return SensorData(
                        id=row.get('id') or row.get('data_id'), 
                        machine_id=row.get('machine_id'),
                        air_temperature=row.get('air_temp') or row.get('air_temperature'),
                        process_temperature=row.get('process_temp') or row.get('process_temperature'),
                        rotational_speed=row.get('rotation_speed') or row.get('rotational_speed'),
                        torque=row.get('torque'),
                        tool_wear=row.get('tool_wear'),
                        machine_type=row.get('machine_type'),
                        timestamp=row.get('timestamp'),
                    )
                if isinstance(row, list):
                    row = row[0] if row else None
                if row is not None:
                    return row
            except Exception as e:
                logger.warning(f"Error converting sensor data hash dict to obj: {e}")
        return None

    def get_prediction_data(self, pred_id):
        result = None
        if self.pdm_db and hasattr(self.pdm_db, "get_prediction_data"):
            result = self.pdm_db.get_prediction_data(pred_id)
        if isinstance(result, list):
            return result[0] if result else None
        return result

    # --- Statistics ---
    def get_statistics(self):
        """PdM DB istatistiklerini döndür"""
        stats = {}
        if self.pdm_db and hasattr(self.pdm_db, "get_statistics"):
            stats = self.pdm_db.get_statistics()
        else:
            stats = {
                'sensor_data_count': 0,
                'prediction_data_count': 0,
                'maintenance_data_count': 0
            }
        return stats
