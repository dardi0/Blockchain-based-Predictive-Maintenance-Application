from dataclasses import dataclass
from typing import Optional

@dataclass
class SensorData:
    """Sensör verisi data class"""
    id: Optional[int] = None
    machine_id: Optional[int] = None
    timestamp: int = 0
    air_temp: float = 0.0
    process_temp: float = 0.0
    rotation_speed: int = 0
    torque: float = 0.0
    tool_wear: int = 0
    machine_type: str = 'L'
    submitter: Optional[str] = None
    data_hash: Optional[str] = None
    offchain_data_hash: Optional[str] = None
    tx_hash: Optional[str] = None
    zk_proof_hash: Optional[str] = None
    blockchain_tx_hash: Optional[str] = None
    blockchain_proof_id: Optional[int] = None

@dataclass
class PredictionData:
    """Tahmin verisi data class"""
    data_id: int = 0
    prediction: int = 0
    probability: float = 0.0
    model_version: str = "v1.0"
    model_hash: str = ""
    predictor: str = ""
    timestamp: int = 0
    prediction_id: Optional[int] = None

@dataclass
class MaintenanceData:
    """Bakım verisi data class"""
    machine_id: int = 0
    maintenance_type: str = "P"
    description: str = ""
    timestamp: int = 0
    technician: str = ""
