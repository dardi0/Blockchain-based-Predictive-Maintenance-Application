# -*- coding: utf-8 -*-
"""
🔧 PDM Sistemi - Konfigürasyon Dosyası
======================================
Bu dosya tüm sistem parametrelerini merkezi olarak yönetir.
Değişiklikler buradan yapılabilir, kod değişikliği gerektirmez.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Environment dosyasını hemen yükle (merkezi .env dosyası)
load_dotenv()  # Ana dizindeki .env dosyasını okur

# --- DOSYA YOLLARI ---
class FilePaths:
    """📁 Dosya yolları konfigürasyonu"""
    # Veri dosyaları
    DATASET_PATH = 'ai4i2020.csv'
    
    # Model dosyaları
    MODEL_DIR = Path("build")
    MODEL_PATH = MODEL_DIR / "model.h5"
    SCALER_PATH = MODEL_DIR / "scaler.joblib" 
    
    # Blockchain dosyaları
    DEPLOYMENT_INFO = Path("deployment_info_hybrid_ZKSYNC_ERA.json")
    
    # Contract artifacts
    PDM_ARTIFACTS_PATH = Path("artifacts-zk/contracts/PdMSystemHybrid.sol/PdMSystemHybrid.json")
    FAILURE_VERIFIER_ARTIFACTS_PATH = Path("artifacts-zk/contracts/OptimizedGroth16Verifier.sol/OptimizedGroth16Verifier.json")
    ACCESS_CONTROL_ARTIFACTS_PATH = Path("artifacts-zk/contracts/AccessControlRegistry.sol/AccessControlRegistry.json")

# --- MODEL PARAMETRELERİ ---
class ModelConfig:
    """🤖 LSTM-CNN Model konfigürasyonu"""
    # Model mimarisi 
    CNN_FILTERS_PER_LAYER = [128, 256]
    CNN_KERNEL_SIZE = 4
    CNN_POOL_SIZE = 2
    CNN_DROPOUT = 0.3
    CNN_ACTIVATION = 'relu'  
    
    LSTM_UNITS_PER_LAYER = [128, 256]
    LSTM_DROPOUT = 0.3
    
    DENSE_UNITS_PER_LAYER = [32, 64, 16]        
    DENSE_DROPOUT = 0.4
    DENSE_ACTIVATION = 'tanh'
    
    # Optimizasyon - ADAM
    LEARNING_RATE = 0.001  
    OPTIMIZER = 'adam'
    LOSS_FUNCTION = 'binary_crossentropy'

# --- EĞİTİM PARAMETRELERİ ---
class TrainingConfig:
    """📊 Model eğitimi konfigürasyonu"""
    # Cross Validation
    CV_SPLITS = 5
    CV_RANDOM_STATE = 42
    CV_SHUFFLE = True
    
    # Train/Test split
    TEST_SIZE = 0.2
    TRAIN_RANDOM_STATE = 42
    STRATIFY = True

    DROP_COLUMNS = ['UDI', 'Product ID', 'TWF', 'HDF', 'PWF', 'OSF', 'RNF']
    
    # Model eğitimi
    EPOCHS = 200
    FINAL_MODEL_EPOCHS = 500
    BATCH_SIZE = 64
    VALIDATION_SPLIT = 0.2
    
    # Early Stopping
    EARLY_STOPPING_MONITOR = 'val_loss'
    EARLY_STOPPING_PATIENCE = 80
    FINAL_MODEL_PATIENCE = 120
    EARLY_STOPPING_RESTORE_BEST = True
    
    # Threshold optimization
    DEFAULT_THRESHOLD = 0.5
    THRESHOLD_OPTIMIZATION_METHOD = 'f1'  # F1-Score maksimizasyonu ('f1', 'f_beta', 'recall_focused')
    F_BETA_VALUE = 2.0  # Sadece 'f_beta' yöntemi için kullanılır
    MIN_PRECISION_THRESHOLD = 0.2  # Minimum %20 precision korunarak recall maksimize edilir
    
    # SMOTE (Synthetic Minority Oversampling Technique)
    USE_SMOTE = False  # SMOTE kullanımını aktif/pasif eder
    SMOTE_RANDOM_STATE = 42  # SMOTE için random state
    SMOTE_K_NEIGHBORS = 5  # SMOTE k-neighbors parametresi
    

# --- BLOCKCHAIN KONFİGÜRASYONU ---
class BlockchainConfig:
    """🔗 Blockchain konfigürasyonu"""
    # Network ayarları
    DEFAULT_NETWORK = "ZKSYNC_ERA"

    # Gas ayarları
    SENSOR_DATA_GAS_PRICE_GWEI = 0.25
    PREDICTION_GAS_PRICE_GWEI = 0.25

    # ZK kayıt işlemleri için gas limitleri
    FAULT_RECORD_GAS_LIMIT    = 300000
    TRAINING_RECORD_GAS_LIMIT = 300000
    REPORT_RECORD_GAS_LIMIT   = 300000

    # Deployment ve VK setup için gas limitleri
    VERIFIER_DEPLOY_GAS_LIMIT = 3000000
    VK_UPLOAD_GAS_LIMIT = 5000000
    CONTRACT_UPDATE_GAS_LIMIT = 1000000
    NODE_REGISTER_GAS_LIMIT = 500000

    # Gas estimation — her zaman dinamik
    GAS_ESTIMATION_BUFFER = 1.2  # %20 buffer
    GAS_PRICE_BUFFER = 1.1       # %10 buffer

    # Transaction ayarları
    TRANSACTION_TIMEOUT = 120
    
    # Network bilgileri
    NETWORKS = {
        "ZKSYNC_ERA": {
            "name": "zkSync Era Sepolia",
            "currency": "ETH",
            "explorer": "https://sepolia.explorer.zksync.io",
            "type": "zkEVM Layer 2",
            "chain_id": 300,
            "rpc_url": "https://sepolia.era.zksync.dev",
            "advantages": [
                "İşlem süresi: <2 saniye",
                "Gas ücreti: %99+ daha düşük",
                "Throughput: 2000+ TPS",
                "zkEVM: Full Ethereum compatibility",
                "Account Abstraction: Gelişmiş wallet özellikleri"
            ]
        }
    }

# --- VİZUALİZASYON KONFİGÜRASYONU ---
class VisualizationConfig:
    """📈 Görselleştirme konfigürasyonu"""
    # Matplotlib ayarları
    FIGURE_SIZE_LOSS = (15, 6)
    FIGURE_SIZE_FOLD_PERFORMANCE = (12, 8)
    FIGURE_SIZE_CONFUSION_MATRIX = (10, 8)
    FIGURE_SIZE_CV_TEST_COMPARISON = (12, 8)
    FIGURE_SIZE_ROC_CURVE = (8, 6)
    FIGURE_SIZE_PR_CURVE = (8, 6)     # Precision-Recall Eğrisi
    
    # Renkler
    COLORS = {
        'accuracy': '#E74C3C',     # Kırmızı
        'f1': '#3498DB',           # Mavi
        'auc': '#1ABC9C',          # Turkuaz
        'precision': '#9B59B6',    # Mor
        'recall': '#F39C12',       # Turuncu
        'cv_mean': '#E67E22',      # Turuncu
        'test_result': '#2ECC71',  # Yeşil
        'roc_curve': '#8E44AD',    # Mor
        'pr_curve': '#E67E22',     # Turuncu (PR Eğrisi)
        'random_line': '#95A5A6'   # Gri
    }
    
    # Grafik ayarları
    LINE_WIDTH = 3
    MARKER_SIZE = 8
    GRID_ALPHA = 0.3
    LEGEND_FONT_SIZE = 12
    TITLE_FONT_SIZE = 16
    LABEL_FONT_SIZE = 14

    # Entropi analiz ayarları
    ENTROPY_HIGH_THRESHOLD = 0.8  # bit
    ENTROPY_TOP_N = 10            # listelenecek en yüksek entropili örnek sayısı

# --- ARIZA ANALİZ KONFİGÜRASYONU ---
class FailureAnalysisConfig:
    """🔍 Arıza analizi konfigürasyonu"""
    # Arıza eşikleri
    TWF_CRITICAL_THRESHOLD = 200  # dakika
    TWF_WARNING_THRESHOLD = 150   # dakika
    
    HDF_TEMP_DIFF_THRESHOLD = 8.6  # K
    HDF_ROTATION_THRESHOLD = 1380  # rpm
    
    PWF_MIN_POWER = 3500  # W
    PWF_MAX_POWER = 9000  # W
    
    # Overstrain limitleri (makine tipine göre)
    OSF_LIMITS = {
        'L': 11000,  # minNm
        'M': 12000,  # minNm
        'H': 13000   # minNm
    }
    
    # Fuzzy risk seviyeleri
    FUZZY_RISK_THRESHOLDS = {
        'MINIMAL': 0.05,
        'VERY_LOW': 0.2,
        'LOW': 0.4,
        'MEDIUM': 0.6,
        'HIGH': 0.8
    }

# --- LOG KONFİGÜRASYONU ---
class LogConfig:
    """📝 Loglama konfigürasyonu"""
    # TensorFlow log seviyesi
    TF_LOG_LEVEL = 'ERROR'
    
    # Python logging
    LOG_LEVEL = 'INFO'
    LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    
    # Hangi warning'leri gizleyelim
    SUPPRESS_WARNINGS = [
        'ignore',  # Tüm warning'ler
        'DeprecationWarning',
        'FutureWarning', 
        'UserWarning'
    ]
    
    # TensorFlow warning'lerini tamamen bastırma
    TF_CPP_MIN_LOG_LEVEL = '3'  # 0=INFO, 1=WARNING, 2=ERROR, 3=FATAL
    TF_AUTOTUNE_THRESHOLD = '3'
    
    @staticmethod
    def suppress_all_tf_warnings():
        """TensorFlow warning'lerini tamamen bastırır - import öncesi çağrılmalı"""
        import os
        
        # TensorFlow environment variables (import öncesi ayarlanmalı)
        os.environ['TF_CPP_MIN_LOG_LEVEL'] = LogConfig.TF_CPP_MIN_LOG_LEVEL
        os.environ['TF_AUTOTUNE_THRESHOLD'] = LogConfig.TF_AUTOTUNE_THRESHOLD
        
        # CUDA warning'lerini bastır
        os.environ['CUDA_VISIBLE_DEVICES'] = '-1'  # CPU only
        
        # Diğer TensorFlow warning'leri
        os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
        os.environ['TF_FORCE_GPU_ALLOW_GROWTH'] = 'true'
    
    @staticmethod
    def suppress_tf_after_import():
        """TensorFlow import sonrası warning bastırma (TensorFlow 2.x uyumlu)"""
        try:
            import tensorflow as tf
            import logging
            
            # Modern TensorFlow 2.x logger ayarları
            tf.get_logger().setLevel('ERROR')
            
            # Python logging bastırma
            logging.getLogger('tensorflow').setLevel(logging.ERROR)
            logging.getLogger('tensorflow.python').setLevel(logging.ERROR)
            logging.getLogger('tensorflow.python.client').setLevel(logging.ERROR)
            
            # TensorFlow device ayarları
            tf.config.set_soft_device_placement(True)
            
        except ImportError:
            pass

# --- PERFORMANS KONFİGÜRASYONU ---
class PerformanceConfig:
    """⚡ Performans konfigürasyonu"""
    # Threading
    MAX_WORKER_THREADS = 4
    
    # Memory
    MEMORY_LIMIT_GB = 8
    
    # Processing
    BATCH_PROCESSING_SIZE = 1000
    
    # Caching
    ENABLE_CACHING = True
    CACHE_SIZE_MB = 500

class DatabaseConfig:
    """Database Configuration"""
    DB_NAME = os.getenv("POSTGRES_DB", "pdm_db")
    DB_USER = os.getenv("POSTGRES_USER", "postgres")
    DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
    DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
    DB_PORT = os.getenv("POSTGRES_PORT", "5432")
    
    # Connection string for SQLAlchemy or other ORMs if needed
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# --- BATCH KONFİGÜRASYONU ---
class BatchConfig:
    """Toplu blockchain gönderim konfigürasyonu (%98 maliyet tasarrufu)

    3 makine tipi (L/M/H) × 5 dakikada bir → saatte 36 kayıt
    110 dakikada 66 kayıt birikir → 64 alınır, sıfır padding olmaz.
    BATCH_MAX_SIZE=64 → CircuitType.BATCH_SENSOR devresini tam doldurur.
    BATCH_CIRCUIT_SIZE=64 Circom sabiti — eksik slotlar 0 ile padding yapılır.
    """
    ENABLE_BATCH_MODE  = True   # Her zaman aktif — Chainlink + BatchSender ile çalışır
    BATCH_INTERVAL     = int(os.getenv("BATCH_INTERVAL", "7200"))   # saniye (2 saat güvenlik ağı)
    BATCH_MAX_SIZE     = int(os.getenv("BATCH_MAX_SIZE", "64"))     # Circom devresi tam dolumu
    BATCH_MIN_SIZE     = int(os.getenv("BATCH_MIN_SIZE", "32"))     # Yarısı dolunca acil flush
    BATCH_GAS_LIMIT    = int(os.getenv("BATCH_GAS_LIMIT", "800000"))
    BATCH_CIRCUIT_SIZE = 64   # Circom fixed-size — 64'ten az kayıt 0 ile padlenir


# --- CHAINLINK KONFİGÜRASYONU ---
def _load_chainlink_automation_address() -> str:
    """Load AUTOMATION_ADDRESS from env var, then chainlink_deployment_info.json, then fail loudly."""
    import logging as _logging
    _log = _logging.getLogger(__name__)

    # 1. Prefer explicit env var (no hardcoded default)
    env_val = os.getenv("CHAINLINK_AUTOMATION_ADDRESS", "").strip()
    if env_val:
        return env_val

    # 2. Fall back to deployment info file
    info_path = Path("chainlink_deployment_info.json")
    if info_path.exists():
        try:
            import json as _json
            info = _json.loads(info_path.read_text())
            addr = (
                info.get("contracts", {}).get("ChainlinkPdMAutomation")
                or info.get("automation_address")
            )
            if addr:
                _log.info(f"ChainlinkConfig: AUTOMATION_ADDRESS loaded from {info_path}: {addr}")
                return addr
        except Exception as e:
            _log.warning(f"ChainlinkConfig: could not parse {info_path}: {e}")

    # 3. Not found — return empty string and warn
    _log.warning(
        "ChainlinkConfig: AUTOMATION_ADDRESS not configured. "
        "Set CHAINLINK_AUTOMATION_ADDRESS in .env or deploy chainlink contracts first."
    )
    return ""


class ChainlinkConfig:
    """Chainlink Automation konfigurasyonu"""
    BACKEND_ORACLE_ADDRESS = os.getenv("BACKEND_ORACLE_ADDRESS")
    AUTOMATION_ADDRESS = _load_chainlink_automation_address()
    ORACLE_PRIVATE_KEY = (
        os.getenv("CHAINLINK_AUTOMATION_PRIVATE_KEY")
        or os.getenv("CONTRACT_OWNER_PRIVATE_KEY")
    )
    POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "30"))
    DEPLOYMENT_INFO_PATH = Path("chainlink_deployment_info.json")
    FAILURE_THRESHOLD = 7000  # 70.00% confidence

# --- GÜVENLIK KONFİGÜRASYONU ---
class SecurityConfig:
    """🔐 Güvenlik konfigürasyonu"""
    # API rate limiting
    MAX_REQUESTS_PER_MINUTE = 600
    
    # Input validation
    MAX_INPUT_LENGTH = 1000
    ALLOWED_FILE_EXTENSIONS = ['.csv', '.json', '.h5']
    
    # Encryption
    HASH_ALGORITHM = 'sha256'
    
    # Session
    SESSION_TIMEOUT_MINUTES = 30

# --- ENVIRONMENT VARIABLES ---
class EnvConfig:
    """🌍 Environment değişkenleri"""
    @staticmethod
    def get_network():
        return "ZKSYNC_ERA"
    
    @staticmethod
    def get_zksync_era_rpc():
        return os.getenv("ZKSYNC_ERA_RPC_URL", "https://sepolia.era.zksync.dev")
    
    @staticmethod
    def get_PRIVATE_KEY():
        return os.getenv("PRIVATE_KEY") or os.getenv("CONTRACT_OWNER_PRIVATE_KEY")

    @staticmethod
    def get_MANAGER_PRIVATE_KEY():
        return os.getenv("MANAGER_PRIVATE_KEY")

    @staticmethod
    def get_ENGINEER_PRIVATE_KEY():
        return os.getenv("ENGINEER_PRIVATE_KEY")

    @staticmethod
    def get_OPERATOR_PRIVATE_KEY():
        return os.getenv("OPERATOR_PRIVATE_KEY")

# --- YARDıMCı FONKSİYONLAR ---
class ConfigUtils:
    """🛠️ Konfigürasyon yardımcı fonksiyonları"""
    
    @staticmethod
    def get_network_config(network_name=None):
        """zkSync Era network konfigürasyonunu döndürür"""
        return BlockchainConfig.NETWORKS.get("ZKSYNC_ERA")
    
    @staticmethod
    def get_deployment_info_path():
        """zkSync Era deployment dosya yolunu döndürür"""
        return FilePaths.DEPLOYMENT_INFO
    
    @staticmethod
    def get_current_rpc_url():
        """zkSync Era RPC URL'ini döndürür"""
        return EnvConfig.get_zksync_era_rpc()
    
    @staticmethod
    def create_build_directory():
        """Build klasörünü oluşturur"""
        FilePaths.MODEL_DIR.mkdir(exist_ok=True)
        return FilePaths.MODEL_DIR
    
    @staticmethod
    def validate_config():
        """Konfigürasyon doğrulaması yapar"""
        errors = []
        
        # Dosya varlığı kontrolü
        if not Path(FilePaths.DATASET_PATH).exists():
            errors.append(f"Dataset dosyası bulunamadı: {FilePaths.DATASET_PATH}")
        
        # Environment değişken kontrolü
        if not any([
            EnvConfig.get_MANAGER_PRIVATE_KEY(),
            EnvConfig.get_ENGINEER_PRIVATE_KEY(),
            EnvConfig.get_OPERATOR_PRIVATE_KEY(),
            EnvConfig.get_PRIVATE_KEY()
        ]):
            errors.append("Herhangi bir private key tanımlı değil (MANAGER/ENGINEER/OPERATOR/PRIVATE_KEY)")
        
        # RPC URL kontrolü
        rpc_url = ConfigUtils.get_current_rpc_url()
        if not rpc_url:
            errors.append("zkSync Era RPC URL bulunamadı")
        
        # zkSync Era RPC kontrolü
        if not EnvConfig.get_zksync_era_rpc():
            errors.append("ZKSYNC_ERA_RPC_URL environment değişkeni eksik")
        
        return errors

# --- QUICK ACCESS ---
# Hızlı erişim için sık kullanılan değerler
DATASET_FILE = FilePaths.DATASET_PATH
MODEL_FILE = FilePaths.MODEL_PATH
LEARNING_RATE = ModelConfig.LEARNING_RATE
EPOCHS = TrainingConfig.EPOCHS
BATCH_SIZE = TrainingConfig.BATCH_SIZE
CV_SPLITS = TrainingConfig.CV_SPLITS
DEFAULT_THRESHOLD = TrainingConfig.DEFAULT_THRESHOLD

# Konfigürasyon doğrulaması
if __name__ == "__main__":
    # Test modu
    print("🔧 Konfigürasyon test ediliyor...")
    errors = ConfigUtils.validate_config()
    if errors:
        print("❌ Konfigürasyon hataları:")
        for error in errors:
            print(f"  • {error}")
    else:
        print("✅ Konfigürasyon geçerli!")
        
    print(f"\n📊 Aktif Konfigürasyon:")
    print(f"  • Dataset: {DATASET_FILE}")
    print(f"  • Network: {EnvConfig.get_network()}")
    print(f"  • Learning Rate: {LEARNING_RATE}")
    print(f"  • Epochs: {EPOCHS}")
    print(f"  • CV Splits: {CV_SPLITS}") 
