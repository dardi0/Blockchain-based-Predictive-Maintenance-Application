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
from sklearn.utils.class_weight import compute_class_weight
from imblearn.over_sampling import SMOTE
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout, Conv1D, MaxPooling1D, LSTM
from tensorflow.keras.callbacks import EarlyStopping
from tensorflow.keras.optimizers import Adam
import joblib
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')

# Konfigürasyon
from config import (
    FilePaths, ModelConfig, TrainingConfig, 
    LogConfig
)

# TensorFlow warning'lerini bastır
LogConfig.suppress_tf_after_import()

class TaskProgressCallback(tf.keras.callbacks.Callback):
    """
    Eğitim ilerlemesini dışarıya raporlayan callback.
    Her epoch sonunda durumu günceller.
    """
    def __init__(self, update_fn, total_epochs, start_epoch=0):
        super().__init__()
        self.update_fn = update_fn
        self.total_epochs = total_epochs
        self.start_epoch = start_epoch

    def on_epoch_end(self, epoch, logs=None):
        logs = logs or {}
        current = self.start_epoch + epoch + 1
        
        # Update state via callback function
        if self.update_fn:
            self.update_fn(
                current_epoch=current,
                total_epochs=self.total_epochs,
                train_loss=logs.get('loss'),
                val_loss=logs.get('val_loss')
            )

class PdMModelTrainer:
    """
    🚀 LSTM-CNN Model Eğitim Sınıfı
    ===============================
    Tüm eğitim sürecini yöneten merkezi sınıf
    """
    
    def __init__(self, config=None, progress_callback=None):
        """ModelTrainer sınıfını başlatır.

        Args:
            config (dict, optional): Özel konfigürasyon parametreleri. 
            progress_callback (callable, optional): İlerleme durumunu güncelleyecek fonksiyon.
                                                  Signature: (current_epoch, total_epochs, train_loss, val_loss)
        """
        self.config = config or {}
        self.progress_callback = progress_callback
        
        # State
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
            
            # Dropları kaldır
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
        oof_true_list = []
        oof_pred_list = []
    
        for fold, (train_idx, val_idx) in enumerate(skf.split(self.X_train, self.y_train), 1):
            print(f"📋 Fold {fold}/{TrainingConfig.CV_SPLITS} işleniyor...")
        
            X_train_fold, X_val_fold = self.X_train.iloc[train_idx], self.X_train.iloc[val_idx]
            y_train_fold, y_val_fold = self.y_train.iloc[train_idx], self.y_train.iloc[val_idx]
        
            scaler = StandardScaler()
            X_train_scaled = scaler.fit_transform(X_train_fold)
            X_val_scaled = scaler.transform(X_val_fold)
        
            # SMOTE uygula (sadece train verisine)
            if TrainingConfig.USE_SMOTE:
                print(f"   🔄 SMOTE uygulanıyor... (Önce: {len(X_train_scaled)} örnek)")
                smote = SMOTE(
                    random_state=TrainingConfig.SMOTE_RANDOM_STATE,
                    k_neighbors=TrainingConfig.SMOTE_K_NEIGHBORS
                )
                X_train_scaled, y_train_fold = smote.fit_resample(X_train_scaled, y_train_fold)
                print(f"   ✅ SMOTE tamamlandı (Sonra: {len(X_train_scaled)} örnek)")
            
            # Class weight hesapla (SMOTE kapalıysa)
            class_weights = None
            if not TrainingConfig.USE_SMOTE:
                try:
                    classes = np.unique(y_train_fold)
                    weights = compute_class_weight(class_weight='balanced', classes=classes, y=y_train_fold)
                    class_weights = dict(zip(classes, weights))
                    print(f"   ⚖️ Sınıf Ağırlıkları (SMOTE Kapalı): {class_weights}")
                except Exception as e:
                    print(f"   ⚠️ Sınıf ağırlığı hesaplama hatası: {e}")
        
            X_train_reshaped = X_train_scaled.reshape(X_train_scaled.shape[0], X_train_scaled.shape[1], 1)
            X_val_reshaped = X_val_scaled.reshape(X_val_scaled.shape[0], X_val_scaled.shape[1], 1)
        
            model = self._create_model(input_shape=(X_train_scaled.shape[1], 1))
        
            early_stopping = EarlyStopping(
                monitor=TrainingConfig.EARLY_STOPPING_MONITOR,
                patience=TrainingConfig.EARLY_STOPPING_PATIENCE,
                restore_best_weights=TrainingConfig.EARLY_STOPPING_RESTORE_BEST,
                verbose=1
            )
            
            callbacks_list = [early_stopping]
            
            # Add progress callback for this fold
            if self.progress_callback:
                callbacks_list.append(TaskProgressCallback(
                    update_fn=lambda **kwargs: self.progress_callback(phase=f"Cross Validation (Fold {fold}/{TrainingConfig.CV_SPLITS})", **kwargs),
                    total_epochs=TrainingConfig.EPOCHS
                ))
        
            model.fit(
                X_train_reshaped, y_train_fold,
                epochs=TrainingConfig.EPOCHS,
                batch_size=TrainingConfig.BATCH_SIZE,
                validation_data=(X_val_reshaped, y_val_fold),
                callbacks=callbacks_list,
                class_weight=class_weights,
                verbose=1
            )
        
            y_pred_proba = model.predict(X_val_reshaped, verbose=0)
            try:
                oof_true_list.append(np.asarray(y_val_fold).ravel())
                oof_pred_list.append(np.asarray(y_pred_proba).ravel())
            except Exception:
                pass
        
            # Optimal eşiği bul (yeni F-Beta yöntemi)
            optimal_threshold = self._find_optimal_threshold(y_val_fold, y_pred_proba)

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
            
            # Confusion Matrix hesapla
            cm = confusion_matrix(y_val_fold, y_pred_optimal)
            tn, fp, fn, tp = cm.ravel()
            
            print(f"   ✅ Fold {fold}: Default F1={metrics['f1']:.4f}, Optimal F1={metrics['f1_opt']:.4f}, Recall={metrics['recall_opt']:.4f}")
            print(f"      📊 Confusion Matrix: TP={tp}, FP={fp}, FN={fn}, TN={tn}")
            print(f"      🎯 Arıza: {tp+fn} toplam, {tp} yakalandı, {fn} kaçırıldı")

        # --- DEĞİŞİKLİK BURADA BAŞLIYOR ---
        # Raporlamanın beklediği doğru veri yapısını (dict of lists) oluştur
        cv_results_structured = {
            'accuracy': [score['accuracy'] for score in fold_metric_list],
            'precision': [score['precision'] for score in fold_metric_list],
            'recall': [score['recall'] for score in fold_metric_list],
            'f1': [score['f1'] for score in fold_metric_list],
            'auc': [score['roc_auc'] for score in fold_metric_list],
            'mcc': [score['mcc'] for score in fold_metric_list],
            'entropy': [score.get('entropy') for score in fold_metric_list],
            'accuracy_opt': [score['accuracy_opt'] for score in fold_metric_list],
            'precision_opt': [score['precision_opt'] for score in fold_metric_list],
            'recall_opt': [score['recall_opt'] for score in fold_metric_list],
            'f1_opt': [score['f1_opt'] for score in fold_metric_list],
            'mcc_opt': [score['mcc_opt'] for score in fold_metric_list],
            'optimal_threshold': [score['optimal_threshold'] for score in fold_metric_list]
        }

        # Global tarama ile tek eşik seçimi (OOF tahminleri)
        try:
            oof_y = np.concatenate(oof_true_list) if len(oof_true_list) else np.array([])
            oof_p = np.concatenate(oof_pred_list) if len(oof_pred_list) else np.array([])
            if oof_y.size > 0 and oof_p.size > 0:
                best_global_th = self._find_optimal_threshold(oof_y, oof_p)
                self.optimal_threshold = float(best_global_th)
                print(f"\nSeçilen nihai optimal eşik (Global PR tarama): {self.optimal_threshold:.3f}")
            else:
                self.optimal_threshold = float(np.mean(cv_results_structured['optimal_threshold']))
                print(f"\nOOF bulunamadı; CV ortalama eşiği kullanılıyor: {self.optimal_threshold:.3f}")
        except Exception as e:
            self.optimal_threshold = TrainingConfig.DEFAULT_THRESHOLD
            print(f"\nGlobal eşik belirlenemedi ({e}); varsayılan eşik kullanılıyor: {self.optimal_threshold:.3f}")
    
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
        
        # SMOTE uygula (sadece train verisine)
        if TrainingConfig.USE_SMOTE:
            print(f"🔄 SMOTE uygulanıyor... (Önce: {len(X_train_scaled)} örnek)")
            y_train_np = np.asarray(self.y_train)
            print(f"   📊 Sınıf dağılımı: {np.bincount(y_train_np)}")
            smote = SMOTE(
                random_state=TrainingConfig.SMOTE_RANDOM_STATE,
                k_neighbors=TrainingConfig.SMOTE_K_NEIGHBORS
            )
            X_train_scaled, y_train_resampled = smote.fit_resample(X_train_scaled, y_train_np)
            self.y_train = y_train_resampled  # numpy array olarak sakla
            print(f"✅ SMOTE tamamlandı (Sonra: {len(X_train_scaled)} örnek)")
            print(f"   📊 Yeni sınıf dağılımı: {np.bincount(self.y_train)}")

        # Class weight hesapla (SMOTE kapalıysa)
        class_weights = None
        if not TrainingConfig.USE_SMOTE:
            try:
                # self.y_train bir series veya array olabilir, numpy array'e çevir
                y_train_np = np.asarray(self.y_train)
                classes = np.unique(y_train_np)
                weights = compute_class_weight(class_weight='balanced', classes=classes, y=y_train_np)
                class_weights = dict(zip(classes, weights))
                print(f"⚖️ Final Model Sınıf Ağırlıkları (SMOTE Kapalı): {class_weights}")
            except Exception as e:
                print(f"⚠️ Sınıf ağırlığı hesaplama hatası: {e}")
        
        # LSTM için reshape
        X_train_reshaped = X_train_scaled.reshape(X_train_scaled.shape[0], X_train_scaled.shape[1], 1)
        X_test_reshaped = X_test_scaled.reshape(X_test_scaled.shape[0], X_test_scaled.shape[1], 1)
        
        # Model oluştur
        self.model = self._create_model(input_shape=(X_train_scaled.shape[1], 1))
        
        # Early stopping
        early_stopping = EarlyStopping(
            monitor=TrainingConfig.EARLY_STOPPING_MONITOR,
            patience=TrainingConfig.FINAL_MODEL_PATIENCE,
            restore_best_weights=TrainingConfig.EARLY_STOPPING_RESTORE_BEST,
            verbose=1
        )
        
        callbacks_list = [early_stopping]
        
        # Add progress callback for final training
        if self.progress_callback:
            callbacks_list.append(TaskProgressCallback(
                update_fn=lambda **kwargs: self.progress_callback(phase="Final Training", **kwargs),
                total_epochs=TrainingConfig.FINAL_MODEL_EPOCHS
            ))
        
        # Model eğitimi
        history = self.model.fit(
            X_train_reshaped, self.y_train,
            epochs=TrainingConfig.FINAL_MODEL_EPOCHS,
            batch_size=TrainingConfig.BATCH_SIZE,
            validation_split=TrainingConfig.VALIDATION_SPLIT,
            callbacks=callbacks_list,
            class_weight=class_weights,
            verbose=1
        )
        
        # Test tahminleri
        y_pred_prob = self.model.predict(X_test_reshaped, verbose=0)
        
        # Optimal threshold bulma (yeni F-Beta yöntemi)
        print("\n🎯 Test seti için optimal eşik bulunuyor...")
        best_threshold = self.optimal_threshold
        print(f"\nUsing CV-derived optimal threshold for test evaluation: {best_threshold:.3f}")
        
        
        
        # Sonuçları hesapla - Config'ten varsayılan eşik
        y_pred_default = (y_pred_prob > TrainingConfig.DEFAULT_THRESHOLD).astype(int).flatten()
        y_pred_optimal = (y_pred_prob > best_threshold).astype(int).flatten()
        
        default_results = self._calculate_metrics(self.y_test, y_pred_default, y_pred_prob)
        optimal_results = self._calculate_metrics(self.y_test, y_pred_optimal, y_pred_prob)
        
        final_end_time = time.time()
        
        # Test sonuçlarını kaydet
        # Entropi özeti (test seti)
        try:
            p_test = np.clip(np.array(y_pred_prob).flatten(), 1e-12, 1 - 1e-12)
            entropy_test_vals = -(p_test * np.log2(p_test) + (1 - p_test) * np.log2(1 - p_test))
            entropy_test_mean = float(np.mean(entropy_test_vals))
        except Exception:
            entropy_test_mean = float('nan')

        test_results = {
            'default_threshold_results': default_results,
            'optimal_threshold_results': optimal_results,
            'optimal_threshold': best_threshold,
            'training_time': final_end_time - final_start_time,
            'history': history.history,
            'y_true': self.y_test.values,
            'y_pred_proba': y_pred_prob.flatten(),
            'y_pred': y_pred_optimal.flatten(),
            'entropy_mean': entropy_test_mean,
        }
        
        self.results['test_results'] = test_results
        
        # Confusion Matrix hesapla
        cm_final = confusion_matrix(self.y_test, y_pred_optimal)
        tn_final, fp_final, fn_final, tp_final = cm_final.ravel()
        
        print(f"✅ Nihai model eğitimi tamamlandı! (Süre: {test_results['training_time']:.1f}s)")
        print(f"📊 Final Performans: Precision={optimal_results['precision']:.4f}, Recall={optimal_results['recall']:.4f}, F1={optimal_results['f1']:.4f}")
        print(f"\n📊 Confusion Matrix (Test Seti):")
        print(f"   TN={tn_final:4d}  FP={fp_final:4d}")
        print(f"   FN={fn_final:4d}  TP={tp_final:4d}")
        print(f"\n🎯 Test Seti Analizi:")
        print(f"   Toplam arıza: {tp_final + fn_final}")
        print(f"   Yakalanan arıza: {tp_final}")
        print(f"   Kaçırılan arıza (FN): {fn_final}")
        print(f"   Yanlış alarm (FP): {fp_final}")
        
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
            
            # Optimal threshold ve metadata kaydet
            metadata = {
                'optimal_threshold': float(self.optimal_threshold),
                'feature_names': self.feature_names,
                'model_version': '1.0',
                'training_date': pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            metadata_path = FilePaths.MODEL_PATH.parent / 'model_metadata.pkl'
            joblib.dump(metadata, metadata_path)
            print(f"💾 Model metadata kaydedildi: {metadata_path}")
            print(f"   🎯 Optimal Threshold: {self.optimal_threshold:.3f}")
            
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
        try:
            required_precision = float(TrainingConfig.MIN_PRECISION_THRESHOLD)
        except Exception:
            required_precision = 0.5
        pr_auc_metric = tf.keras.metrics.AUC(curve='PR', name='pr_auc')
        roc_auc_metric = tf.keras.metrics.AUC(curve='ROC', name='roc_auc')
        recall_at_precision_metric = tf.keras.metrics.RecallAtPrecision(
            precision=required_precision,
            num_thresholds=200,
            name=f"recall_at_p{int(required_precision*100)}"
        )
        model.compile(
            optimizer=Adam(learning_rate=ModelConfig.LEARNING_RATE),
            loss=ModelConfig.LOSS_FUNCTION,
            metrics=[pr_auc_metric, roc_auc_metric, recall_at_precision_metric]
        )
        
        print("✅ Dinamik model başarıyla oluşturuldu!")
        model.summary() # Oluşturulan modelin özetini konsola yazdır
    
        return model
    
    def _calculate_metrics(self, y_true, y_pred, y_pred_proba):
        """Metrikleri hesaplar"""
        # Shannon entropisi (ikili sınıflandırma) – belirsizlik ölçümü (bit)
        try:
            p = np.clip(np.array(y_pred_proba).flatten(), 1e-12, 1 - 1e-12)
            entropy_vals = -(p * np.log2(p) + (1 - p) * np.log2(1 - p))
            entropy_mean = float(np.mean(entropy_vals))
        except Exception:
            entropy_mean = float('nan')

        return {
            'accuracy': accuracy_score(y_true, y_pred),
            'precision': precision_score(y_true, y_pred, zero_division=0),
            'recall': recall_score(y_true, y_pred, zero_division=0),
            'f1': f1_score(y_true, y_pred, zero_division=0),
            'roc_auc': roc_auc_score(y_true, p),
            'mcc': matthews_corrcoef(y_true, y_pred),
            'entropy': entropy_mean,
        }
    
    def _find_optimal_threshold(self, y_true, y_pred_proba):
        """
        Optimal eşiği bulur (konfigüre edilebilir yöntemler)
        
        Args:
            y_true: Gerçek etiketler
            y_pred_proba: Model olasılık tahminleri
            
        Returns:
            float: Optimal eşik değeri
            
        Methods:
            - 'f1': F1-Score maksimizasyonu (varsayılan)
            - 'f_beta': F-Beta Score (Recall öncelikli, beta=2.0)
            - 'recall_focused': Minimum precision kısıtı ile recall maksimizasyonu
        """
        p = np.asarray(y_pred_proba).ravel()
        precisions, recalls, thresholds = precision_recall_curve(y_true, p)
        prec = precisions[1:]
        rec = recalls[1:]
        
        method = TrainingConfig.THRESHOLD_OPTIMIZATION_METHOD
        
        if method == 'f1':
            # Yöntem 1: F1-Score maksimizasyonu (mevcut yöntem)
            f1_scores = 2 * (prec * rec) / (prec + rec + 1e-8)
            best_idx = np.argmax(f1_scores)
            print(f"   ℹ️ Eşik optimizasyon yöntemi: F1-Score maksimizasyonu")
            
        elif method == 'f_beta':
            # Yöntem 2: F-Beta Score (Recall öncelikli)
            beta = TrainingConfig.F_BETA_VALUE
            f_beta_scores = (1 + beta**2) * (prec * rec) / (beta**2 * prec + rec + 1e-8)
            best_idx = np.argmax(f_beta_scores)
            print(f"   ℹ️ Eşik optimizasyon yöntemi: F-Beta Score (β={beta}) - Recall öncelikli")
            
        elif method == 'recall_focused':
            # Yöntem 3: Minimum precision kısıtı ile recall maksimizasyonu
            min_precision = TrainingConfig.MIN_PRECISION_THRESHOLD
            valid_indices = np.where(prec >= min_precision)[0]
            
            if len(valid_indices) > 0:
                best_idx_local = np.argmax(rec[valid_indices])
                best_idx = valid_indices[best_idx_local]
                print(f"   ℹ️ Eşik optimizasyon yöntemi: Recall maksimizasyonu (Min Precision={min_precision})")
            else:
                # Hiçbir eşik minimum precision'ı sağlamıyorsa, en yüksek recall'ı seç
                best_idx = np.argmax(rec)
                print(f"   ⚠️ Min precision={min_precision} sağlanamadı, en yüksek recall seçildi")
                
        else:
            # Varsayılan: F1-Score
            f1_scores = 2 * (prec * rec) / (prec + rec + 1e-8)
            best_idx = np.argmax(f1_scores)
            print(f"   ℹ️ Eşik optimizasyon yöntemi: F1-Score (varsayılan)")
        
        optimal_threshold = float(thresholds[int(best_idx)])
        optimal_precision = float(prec[int(best_idx)])
        optimal_recall = float(rec[int(best_idx)])
        
        print(f"   📊 Optimal eşik: {optimal_threshold:.3f} (Precision={optimal_precision:.3f}, Recall={optimal_recall:.3f})")
        
        return optimal_threshold

# Backward compatibility için eski fonksiyonlar
def run_cross_validation(X_train, y_train):
    """Eski API uyumluluğu için wrapper
    
    Returns:
        tuple: (cv_results, empty_list, empty_list, empty_list)
        Note: fold_predictions/probabilities/true_labels artık aggregate metrikler
              olarak saklandığından boş liste döner. Metrikler cv_results içinde.
    """
    trainer = PdMModelTrainer()
    trainer.X_train = X_train
    trainer.y_train = y_train
    trainer.run_cv()
    cv_results = trainer.results.get('cv_results', {})
    return (cv_results, [], [], [])

def train_final_model(X_train, y_train, X_test, y_test, cv_scores):
    """Eski API uyumluluğu için wrapper"""
    trainer = PdMModelTrainer()
    trainer.X_train = X_train
    trainer.y_train = y_train
    trainer.X_test = X_test
    trainer.y_test = y_test
    trainer.train_final()
    return trainer.model, trainer.scaler, trainer.optimal_threshold, trainer.results['test_results']
