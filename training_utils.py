# -*- coding: utf-8 -*-
"""
🤖 Training Utilities - Modüler Eğitim Fonksiyonları
==================================================
Bu modül train_model fonksiyonundan ayrıştırılan eğitim fonksiyonlarını içerir.
Her fonksiyon tek bir sorumluluğa odaklanır (Single Responsibility Principle).
"""

# --- MODÜLER LSTM-CNN EĞİTİM UTILS ---

import pandas as pd
import numpy as np
import time
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, classification_report, confusion_matrix, precision_recall_curve, average_precision_score, matthews_corrcoef
# from imblearn.over_sampling import SMOTE  # DEVRE DIŞI - CLASS WEIGHT kullanımına geçildi
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout, Conv1D, MaxPooling1D, LSTM
from tensorflow.keras.callbacks import EarlyStopping
from tensorflow.keras.optimizers import Adam
import joblib

# Konfigürasyon
from config import (
    FilePaths, ModelConfig, TrainingConfig, 
    LogConfig
)

# Genetik Algoritma kaldırıldı

# TensorFlow warning'lerini bastır
LogConfig.suppress_tf_after_import()

class ModelTrainer:
    """
    🚀 LSTM-CNN Model Eğitim Sınıfı
    ===============================
    Tüm eğitim sürecini yöneten merkezi sınıf
    """
    
    def __init__(self, config=None):
        """ModelTrainer sınıfını başlatır.

        Args:
            config (dict, optional): Özel konfigürasyon parametreleri. 
                                   Varsayılan değer None'dır.
        
        Example:
            >>> trainer = ModelTrainer()
        """
        self.config = config or {}
        
        # Durumlar (State)
        self.model = None
        self.scaler = None
        self.feature_names = None
        self.optimal_threshold = TrainingConfig.DEFAULT_THRESHOLD
        self.results = {}
        
        print("📊 Klasik Cross Validation modu aktif!")
        
        # Eğitim verileri
        self.X_train = None
        self.X_test = None
        self.y_train = None
        self.y_test = None
        
        print(f"🏗️ ModelTrainer başlatıldı")
    
    def load_data(self):
        """AI4I2020 dataset'ini yükler ve eğitim/test setlerini hazırlar.

        Dataset'i yükler, feature engineering yapar (Type değişkenini one-hot encode eder),
        hedef değişkeni ayırır ve train/test split işlemini gerçekleştirir.

        Returns:
            ModelTrainer: Method chaining için kendisini döndürür.

        Raises:
            FileNotFoundError: Dataset dosyası bulunamazsa.
            ValueError: Dataset'te gerekli kolonlar yoksa.

        Example:
            >>> trainer = ModelTrainer()
            >>> trainer.load_data()
            📁 Veri yükleme ve ön işleme başlıyor...
            ✅ Veri hazırlandı: Eğitim seti: (8000, 8)
        """
        print("📁 Veri yükleme ve ön işleme başlıyor...")
        
        try:
            # Dataset'i yükle
            data = pd.read_csv(FilePaths.DATASET_PATH)
            print(f"📊 Dataset yüklendi: {data.shape}")
            
            # Dropları kaldır (config'ten)
            data = data.drop(columns=TrainingConfig.DROP_COLUMNS, errors='ignore')
            
            # Type değişkenini one-hot encode et
            data = pd.get_dummies(data, columns=['Type'], prefix='Type')
            
            # Feature'ları ve target'ı ayır
            self.feature_names = [col for col in data.columns if col != 'Machine failure']
            X = data[self.feature_names]
            y = data['Machine failure']
            
            print(f"📋 Features: {len(self.feature_names)} adet")
            print(f"📊 Target dağılımı: {y.value_counts().to_dict()}")
            
            # Train/test split
            self.X_train, self.X_test, self.y_train, self.y_test = train_test_split(
                X, y,
                test_size=TrainingConfig.TEST_SIZE,
                random_state=TrainingConfig.TRAIN_RANDOM_STATE,
                stratify=y if TrainingConfig.STRATIFY else None
            )
            
            print(f"✅ Veri hazırlandı: Eğitim seti: {self.X_train.shape}, Test seti: {self.X_test.shape}")
            
            return self
            
        except Exception as e:
            print(f"❌ Veri yükleme hatası: {e}")
            raise

# training_utils.py dosyasındaki run_cv fonksiyonunun tamamı

    def run_cv(self):
        """5-Fold Cross Validation çalıştırır ve sonuçları doğru formatta yapılandırır."""
        print("\n🔄 5-Fold Cross Validation başlıyor...")
    
        cv_start_time = time.time()
    
        skf = StratifiedKFold(n_splits=TrainingConfig.CV_SPLITS, shuffle=True, random_state=TrainingConfig.CV_RANDOM_STATE)
    
        # Her fold'dan gelen metrik sözlüklerini saklamak için bir liste
        fold_metric_list = []
    
        for fold, (train_idx, val_idx) in enumerate(skf.split(self.X_train, self.y_train), 1):
            print(f"📋 Fold {fold}/{TrainingConfig.CV_SPLITS} işleniyor...")
        
            X_train_fold, X_val_fold = self.X_train.iloc[train_idx], self.X_train.iloc[val_idx]
            y_train_fold, y_val_fold = self.y_train.iloc[train_idx], self.y_train.iloc[val_idx]
        
            scaler = StandardScaler()
            X_train_scaled = scaler.fit_transform(X_train_fold)
            X_val_scaled = scaler.transform(X_val_fold)
        
            X_train_reshaped = X_train_scaled.reshape(X_train_scaled.shape[0], X_train_scaled.shape[1], 1)
            X_val_reshaped = X_val_scaled.reshape(X_val_scaled.shape[0], X_val_scaled.shape[1], 1)
        
            model = self._create_model(input_shape=(X_train_scaled.shape[1], 1))
        
            unique_classes, class_counts = np.unique(y_train_fold, return_counts=True)
            total_samples = len(y_train_fold)
            class_weights = {int(cls): total_samples / (len(unique_classes) * count) 
                        for cls, count in zip(unique_classes, class_counts)}
        
            early_stopping = EarlyStopping(
                monitor=TrainingConfig.EARLY_STOPPING_MONITOR,
                patience=TrainingConfig.EARLY_STOPPING_PATIENCE,
                restore_best_weights=TrainingConfig.EARLY_STOPPING_RESTORE_BEST,
                verbose=1
            )
        
            model.fit(
                X_train_reshaped, y_train_fold,
                epochs=TrainingConfig.EPOCHS,
                batch_size=TrainingConfig.BATCH_SIZE,
                validation_data=(X_val_reshaped, y_val_fold),
                class_weight=class_weights,
                callbacks=[early_stopping],
                verbose=1
            )
        
            y_pred_proba = model.predict(X_val_reshaped, verbose=0)
        
            # Optimal eşiği bul
            precisions, recalls, thresholds = precision_recall_curve(y_val_fold, y_pred_proba)
            f1_scores_temp = 2 * (precisions * recalls) / (precisions + recalls + 1e-8)
            best_threshold_idx = np.argmax(f1_scores_temp)
            optimal_threshold = thresholds[best_threshold_idx]

            # Config'ten varsayılan eşik ve optimal eşik ile tahminler yap
            y_pred_default = (y_pred_proba > TrainingConfig.DEFAULT_THRESHOLD).astype(int).flatten()
            y_pred_optimal = (y_pred_proba > optimal_threshold).astype(int).flatten()
        
            # Metrikleri her iki eşik için de hesapla
            metrics = self._calculate_metrics(y_val_fold, y_pred_default, y_pred_proba)
            metrics_opt = self._calculate_metrics(y_val_fold, y_pred_optimal, y_pred_proba)
        
            # Optimal metrikleri ana sözlüğe ekle
            metrics['accuracy_opt'] = metrics_opt['accuracy']
            metrics['precision_opt'] = metrics_opt['precision']
            metrics['recall_opt'] = metrics_opt['recall']
            metrics['f1_opt'] = metrics_opt['f1']
            metrics['mcc_opt'] = metrics_opt['mcc']
            metrics['optimal_threshold'] = optimal_threshold
        
            fold_metric_list.append(metrics)
            print(f"   Fold {fold}: F1={metrics['f1']:.4f}, Optimal F1={metrics['f1_opt']:.4f} (Eşik: {optimal_threshold:.3f})")

        # --- DEĞİŞİKLİK BURADA BAŞLIYOR ---
        # Raporlamanın beklediği doğru veri yapısını (dict of lists) oluştur
        cv_results_structured = {
            'accuracy': [score['accuracy'] for score in fold_metric_list],
            'precision': [score['precision'] for score in fold_metric_list],
            'recall': [score['recall'] for score in fold_metric_list],
            'f1': [score['f1'] for score in fold_metric_list],
            'auc': [score['roc_auc'] for score in fold_metric_list],
            'mcc': [score['mcc'] for score in fold_metric_list],
            'accuracy_opt': [score['accuracy_opt'] for score in fold_metric_list],
            'precision_opt': [score['precision_opt'] for score in fold_metric_list],
            'recall_opt': [score['recall_opt'] for score in fold_metric_list],
            'f1_opt': [score['f1_opt'] for score in fold_metric_list],
            'mcc_opt': [score['mcc_opt'] for score in fold_metric_list],
            'optimal_threshold': [score['optimal_threshold'] for score in fold_metric_list]
        }
    
        cv_end_time = time.time()
    
        # Sonuçları ana sonuçlar sözlüğüne kaydet
        self.results['cv_results'] = cv_results_structured
        self.results['cv_time'] = cv_end_time - cv_start_time

        print(f"✅ Cross Validation tamamlandı! (Süre: {self.results['cv_time']:.1f}s)")
        print(f"📊 Ortalama F1 (Optimal Eşik): {np.mean(cv_results_structured['f1_opt']):.4f} ± {np.std(cv_results_structured['f1_opt']):.4f}")
    
        return self

    def train_final(self):
        """Final model eğitimi yapar"""
        print("\n🎯 Final model eğitimi başlıyor...")
        
        final_start_time = time.time()
        
        # Scaler oluştur ve veriyi ölçeklendir
        self.scaler = StandardScaler()
        X_train_scaled = self.scaler.fit_transform(self.X_train)
        X_test_scaled = self.scaler.transform(self.X_test)
        
        # LSTM için reshape
        X_train_reshaped = X_train_scaled.reshape(X_train_scaled.shape[0], X_train_scaled.shape[1], 1)
        X_test_reshaped = X_test_scaled.reshape(X_test_scaled.shape[0], X_test_scaled.shape[1], 1)
        
        # Model oluştur
        self.model = self._create_model(input_shape=(X_train_scaled.shape[1], 1))
        
        # Class weights hesapla
        unique_classes, class_counts = np.unique(self.y_train, return_counts=True)
        total_samples = len(self.y_train)
        class_weights = {int(cls): total_samples / (len(unique_classes) * count) 
                        for cls, count in zip(unique_classes, class_counts)}
        
        print(f"⚖️ Class weights: {class_weights}")
        
        # Early stopping
        early_stopping = EarlyStopping(
            monitor=TrainingConfig.EARLY_STOPPING_MONITOR,
            patience=TrainingConfig.FINAL_MODEL_PATIENCE,
            restore_best_weights=TrainingConfig.EARLY_STOPPING_RESTORE_BEST,
            verbose=1
        )
        
        # Model eğitimi
        history = self.model.fit(
            X_train_reshaped, self.y_train,
            epochs=TrainingConfig.FINAL_MODEL_EPOCHS,
            batch_size=TrainingConfig.BATCH_SIZE,
            validation_data=(X_test_reshaped, self.y_test),
            class_weight=class_weights,
            callbacks=[early_stopping],
            verbose=1
        )
        
        # Test tahminleri
        y_pred_prob = self.model.predict(X_test_reshaped, verbose=0)
        
        # Optimal threshold bulma
        precisions, recalls, thresholds = precision_recall_curve(self.y_test, y_pred_prob)
        f1_scores = 2 * (precisions * recalls) / (precisions + recalls + 1e-8)
        best_threshold_idx = np.argmax(f1_scores)
        best_threshold = thresholds[best_threshold_idx]
        
        self.optimal_threshold = best_threshold
        
        # Sonuçları hesapla - Config'ten varsayılan eşik
        y_pred_default = (y_pred_prob > TrainingConfig.DEFAULT_THRESHOLD).astype(int)
        y_pred_optimal = (y_pred_prob > best_threshold).astype(int)
        
        default_results = self._calculate_metrics(self.y_test, y_pred_default, y_pred_prob)
        optimal_results = self._calculate_metrics(self.y_test, y_pred_optimal, y_pred_prob)
        
        final_end_time = time.time()
        
        # Test sonuçlarını kaydet
        test_results = {
            'default_threshold_results': default_results,
            'optimal_threshold_results': optimal_results,
            'optimal_threshold': best_threshold,
            'training_time': final_end_time - final_start_time,
            'history': history.history,
            'y_true': self.y_test.values,
            'y_pred_proba': y_pred_prob.flatten(),
            'y_pred': y_pred_optimal.flatten()
        }
        
        self.results['test_results'] = test_results
        
        print(f"✅ Nihai model eğitimi tamamlandı! (Süre: {test_results['training_time']:.1f}s)")
        
        return self
    
    def run_training_pipeline(self):
        """
        Tam eğitim pipeline'ını çalıştırır
        Returns: (model, scaler, results)
        """
        print("🚀 Tam Eğitim Pipeline'ı Başlıyor...")
        pipeline_start = time.time()
        
        # Klasik pipeline adımları
        print("📊 Klasik Cross Validation Modu Aktif!")
        self.load_data()
        self.run_cv()
        self.train_final()
        self.save_models()
        
        pipeline_end = time.time()
        total_time = pipeline_end - pipeline_start
        
        print(f"\n🎉 EĞİTİM PİPELİNE'I TAMAMLANDI!")
        print(f"⏱️ Toplam Süre: {total_time:.1f} saniye")
        
        if 'test_results' in self.results:
            print(f"🎯 Final F1 Skoru: {self.results['test_results']['optimal_threshold_results']['f1']:.4f}")
            print(f"🎚️ Optimal Eşik: {self.optimal_threshold:.3f}")
        
        return self.model, self.scaler, self.results
    
    def save_models(self):
        """Model ve scaler'ı kaydeder"""
        try:
            # Model kaydet
            self.model.save(FilePaths.MODEL_PATH)
            print(f"💾 Model kaydedildi: {FilePaths.MODEL_PATH}")
            
            # Scaler kaydet
            joblib.dump(self.scaler, FilePaths.SCALER_PATH)
            print(f"💾 Scaler kaydedildi: {FilePaths.SCALER_PATH}")
            
            return self
            
        except Exception as e:
            print(f"❌ Model kaydetme hatası: {e}")
            raise

    def _create_model(self, input_shape):
        """Config'ten parametreleri alarak LSTM-CNN model oluşturur"""

        model = Sequential()

       # config.py'deki CNN_LAYERS sayısı kadar döngü çalışır.
        for i, filters in enumerate(ModelConfig.CNN_FILTERS_PER_LAYER):
            # Her katmanda filtre sayısını artırma seçeneği 
            # filters = ModelConfig.CNN_FILTERS * (2**i) 
        
            if i == 0:
                # İlk katman, input_shape'i belirtmek zorundadır.
                model.add(Conv1D(   
                    filters=filters, 
                    kernel_size=ModelConfig.CNN_KERNEL_SIZE, 
                    activation=ModelConfig.CNN_ACTIVATION, 
                    input_shape=input_shape, 
                    padding='same'
                ))
            else:
                # Sonraki katmanlar
                model.add(Conv1D(
                    filters=filters, 
                    kernel_size=ModelConfig.CNN_KERNEL_SIZE, 
                    activation=ModelConfig.CNN_ACTIVATION,
                    padding='same'
                ))
            
            model.add(MaxPooling1D(pool_size=ModelConfig.CNN_POOL_SIZE))
            model.add(Dropout(ModelConfig.CNN_DROPOUT))
    
        # config.py'deki LSTM_LAYERS sayısı kadar döngü çalışır.
        num_lstm_layers = len(ModelConfig.LSTM_UNITS_PER_LAYER)
        for i, units in enumerate(ModelConfig.LSTM_UNITS_PER_LAYER):
            # Son LSTM katmanı hariç, bir sonraki LSTM katmanına veri aktarmak için
            # return_sequences=True olmalıdır.  
            return_sequences = (i < num_lstm_layers - 1)
        
            model.add(LSTM(
                units=units, 
                return_sequences=return_sequences, 
                dropout=ModelConfig.LSTM_DROPOUT
            ))
    
        # --- Dinamik Dense Katmanları ---
        # config.py'deki DENSE_LAYERS sayısı kadar döngü çalışır.
        for i, units in enumerate(ModelConfig.DENSE_UNITS_PER_LAYER):
        
            model.add(Dense(units, activation=ModelConfig.DENSE_ACTIVATION))
            model.add(Dropout(ModelConfig.DENSE_DROPOUT))
        
        # --- Çıkış Katmanı ---
        model.add(Dense(1, activation='sigmoid'))
    
        # --- Model Derleme ---
        # Tüm parametreler artık config.py'den geliyor.
        model.compile(
            optimizer=Adam(learning_rate=ModelConfig.LEARNING_RATE),
            loss=ModelConfig.LOSS_FUNCTION,
            metrics=ModelConfig.METRICS
        )
        
        print("✅ Dinamik model başarıyla oluşturuldu!")
        model.summary() # Oluşturulan modelin özetini konsola yazdır
    
        return model
    
    def _calculate_metrics(self, y_true, y_pred, y_pred_proba):
        """Metrikleri hesaplar"""
        return {
            'accuracy': accuracy_score(y_true, y_pred),
            'precision': precision_score(y_true, y_pred, zero_division=0),
            'recall': recall_score(y_true, y_pred, zero_division=0),
            'f1': f1_score(y_true, y_pred, zero_division=0),
            'roc_auc': roc_auc_score(y_true, y_pred_proba),
            'mcc': matthews_corrcoef(y_true, y_pred)
        }

# Backward compatibility için eski fonksiyonlar
def run_cross_validation(X_train, y_train):
    """Eski API uyumluluğu için wrapper"""
    trainer = ModelTrainer()
    trainer.X_train = X_train
    trainer.y_train = y_train
    trainer.run_cv()
    cv_results = trainer.results['cv_results']
    return (cv_results, cv_results['fold_predictions'], 
            cv_results['fold_probabilities'], cv_results['fold_true_labels'])

def train_final_model(X_train, y_train, X_test, y_test, cv_scores):
    """Eski API uyumluluğu için wrapper"""
    trainer = ModelTrainer()
    trainer.X_train = X_train
    trainer.y_train = y_train
    trainer.X_test = X_test
    trainer.y_test = y_test
    trainer.train_final()
    return trainer.model, trainer.scaler, trainer.optimal_threshold, trainer.results['test_results']