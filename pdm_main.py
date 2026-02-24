#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
from pathlib import Path
import warnings
import os
import sys
import logging

# --- CONFIGURATION IMPORT ---
import config
from config import (
    FilePaths, ModelConfig, TrainingConfig, 
    BlockchainConfig, VisualizationConfig, FailureAnalysisConfig,
    LogConfig, ConfigUtils, EnvConfig
)

LogConfig.suppress_all_tf_warnings()


# Windows/Python UTF-8 konsol çıktısı (Türkçe karakterler için)
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# --- MODULAR FUNCTIONS ---
import training_utils
import reporting

# SECURITY FIX: Safe warning type mapping instead of dangerous eval()
# Only explicitly allowed warning categories are accepted
SAFE_WARNING_TYPES = {
    'DeprecationWarning': DeprecationWarning,
    'FutureWarning': FutureWarning,
    'UserWarning': UserWarning,
    'RuntimeWarning': RuntimeWarning,
    'PendingDeprecationWarning': PendingDeprecationWarning,
    'ImportWarning': ImportWarning,
    'ResourceWarning': ResourceWarning,
    'SyntaxWarning': SyntaxWarning,
}

for warning_type in LogConfig.SUPPRESS_WARNINGS:
    if warning_type == 'ignore':
        warnings.filterwarnings('ignore')
    elif warning_type in SAFE_WARNING_TYPES:
        warnings.filterwarnings('ignore', category=SAFE_WARNING_TYPES[warning_type])
    else:
        # Log invalid warning type but don't execute arbitrary code
        logging.warning(f"Unknown warning type in config (ignored): {warning_type}")

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import time
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, roc_curve, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.preprocessing import StandardScaler
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout, Conv1D, MaxPooling1D, LSTM, GRU 
from tensorflow.keras.callbacks import EarlyStopping
from tensorflow.keras.optimizers import Adam
from dotenv import load_dotenv  

# Blockchain entegrasyonu
try:
    from web3 import Web3
    import threading
    from blockchain_client import HybridBlockchainHandler
    BLOCKCHAIN_AVAILABLE = True
    print("🔐 Hibrit Blockchain modülü yüklendi")
except ImportError as e:
    BLOCKCHAIN_AVAILABLE = False
    print(f"⚠️ Hibrit Blockchain modülü yüklenemedi: {e}")
    print("ℹ️ Gerekli kütüphaneler: pip install web3")

# TensorFlow warning'lerini bastır
LogConfig.suppress_tf_after_import()

# --- GLOBAL VARIABLES & CONFIGURATION ---

# Ağ konfigürasyonu (zkSync Era only)
ACTIVE_NETWORK = "ZKSYNC_ERA"
PRIVATE_KEY = EnvConfig.get_PRIVATE_KEY()

# Aktif ağa göre RPC URL ve deployment dosyası seç
CURRENT_RPC_URL = ConfigUtils.get_current_rpc_url()
DEPLOYMENT_INFO_PATH = ConfigUtils.get_deployment_info_path()
network_config = ConfigUtils.get_network_config()
NETWORK_NAME = network_config['name'] if network_config else "Unknown"
EXPLORER_BASE_URL = network_config['explorer'] if network_config else ""

# Dosya yolları
MODEL_PATH = FilePaths.MODEL_PATH
SCALER_PATH = FilePaths.SCALER_PATH

# Contract artifacts paths
PDM_ARTIFACTS_PATH = FilePaths.PDM_ARTIFACTS_PATH
FAILURE_VERIFIER_ARTIFACTS_PATH = FilePaths.FAILURE_VERIFIER_ARTIFACTS_PATH

# Global variable definitions removed (Refactoring M-5)
# Imports restored for Type Hinting
from database import PdMDatabaseManager
if BLOCKCHAIN_AVAILABLE:
    from hybrid_blockchain_handler import HybridBlockchainHandler

# Dummy class for when blockchain is not available (if not imported)
if not BLOCKCHAIN_AVAILABLE:
    class _DummyHybridHandler:
        def is_ready(self):
            return False
        def get_system_statistics(self):
            return {'blockchain': {'connected': False}}



def initialize_system_components():
    """Sistem bileşenlerini başlatır (DB, Blockchain)"""
    from database import PdMDatabaseManager
    if BLOCKCHAIN_AVAILABLE:
        from hybrid_blockchain_handler import HybridBlockchainHandler
    
    pdm_db = PdMDatabaseManager()
    
    if BLOCKCHAIN_AVAILABLE:
        handler = HybridBlockchainHandler(db_manager=pdm_db)
    else:
        handler = _DummyHybridHandler()
        
    return pdm_db, handler

def check_blockchain_status(handler):
    """Blockchain handler durumunu kontrol eder"""
    if handler.is_ready():
        print("✅ Blockchain sistemi hazır!")
        return True
    else:
        print("⚠️ Blockchain sistemi hazır değil, sadece local storage aktif")
        return False

def train_model():
    """AI4I2020 dataset ile LSTM-CNN model eğitim pipeline'ını çalıştırır.

    ModelTrainer sınıfını kullanarak tam eğitim sürecini gerçekleştirir:
    veri yükleme, cross validation, final model eğitimi ve sonuç raporlama.

    Returns:
        tuple: (model, scaler, feature_names, optimal_threshold)

    Raises:
        Exception: Dataset yükleme veya model eğitimi hatası oluşursa.
    """
    # Refactored to return values instead of setting globals
    
    print("🔄 LSTM-CNN Model Eğitimi Başlıyor...")
    print("="*80)
    
    # ModelTrainer sınıfını başlat
    trainer = training_utils.PdMModelTrainer()
    
    # Tam eğitim pipeline'ını çalıştır
    print("🚀 ModelTrainer pipeline başlatılıyor...")
    model, scaler, results = trainer.run_training_pipeline()
    
    # Sınıftan durumları al
    feature_names = trainer.feature_names
    optimal_threshold = trainer.optimal_threshold
    
    # Sonuçları raporla (reporting.py)
    print("\n📊 Eğitim sonuçları raporlanıyor...")
    test_results = results['test_results']
    
    # Artık sadece klasik CV sonuçları (Genetik algoritma kaldırıldı)
    cv_scores = results['cv_results']
    reporting.print_cv_results(cv_scores)
    reporting.print_test_results(test_results, cv_scores)
    reporting.plot_all_results(cv_scores, test_results)
    
    print(f"✅ LSTM-CNN Model Eğitimi Tamamlandı!")
    print(f"🎯 Final Performans: F1={test_results['optimal_threshold_results']['f1']:.4f}")
    print(f"{'='*80}")
    
    return model, scaler, feature_names, optimal_threshold


def main():
    """Modüler PDM sistemi ana entry point fonksiyonu.

    Tam sistem başlatma sürecini yönetir: zkSync Era blockchain bağlantısı kontrolü,
    LSTM-CNN model eğitimi. GUI kaldırıldı — veritabanı PostgreSQL üzerinden
    görüntülenmektedir.
    """
    print(f"🚀 Modüler Arıza Tespit Sistemi - {NETWORK_NAME} Entegrasyonlu")
    print("=" * 70)
    
    # Sistem bileşenlerini başlat
    pdm_db, blockchain_handler = initialize_system_components()

    # Blockchain setup
    print(f"🔗 {NETWORK_NAME} sistemi kontrol ediliyor...")
    blockchain_ready = check_blockchain_status(blockchain_handler)
    if blockchain_ready:
        print(f"✅ {NETWORK_NAME} modülü hazır")
        print("⚡ zkSync Era Avantajları: <2s işlem + %99+ düşük gas + zkEVM!")
    else:
        print(f"⚠️ {NETWORK_NAME} modülü kapalı - sadece local mod aktif")
    
    print("📊 Modüler model eğitimi başlatılıyor, lütfen bekleyin...")
    
    # Modeli eğit
    try:
        model, scaler, feature_names, optimal_threshold = train_model()
        if model is None:
            print("❌ Model eğitimi başarısız!")
            return
        print("✅ Model eğitimi tamamlandı!")
        print(f"🎯 LSTM-CNN Model hazır, optimal threshold: {optimal_threshold:.4f}")
    except Exception as e:
        print(f"❌ Model eğitimi hatası: {e}")
        import traceback
        traceback.print_exc()
        return
    
    print("✅ Sistem hazır! API üzerinden erişilebilir.")


if __name__ == "__main__":
    main()
