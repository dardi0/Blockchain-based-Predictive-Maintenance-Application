import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler, RobustScaler
from tensorflow.keras.regularizers import l1, l2, l1_l2
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Conv1D, MaxPooling1D, Dropout, BatchNormalization, Bidirectional
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
import matplotlib.pyplot as plt
import math
import tensorflow as tf
import tensorflow.keras.backend as K
import warnings
import os
import tempfile
import shutil

# KerasTuner import
import keras_tuner as kt

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
warnings.filterwarnings('ignore')

# Windows UTF-8 kodlama sorunu için
os.environ['PYTHONIOENCODING'] = 'utf-8'

# NASA RUL Scoring Function (S-score)
def nasa_scoring_function(y_true, y_pred):
    """
    NASA'nın CMAPSS veri setleri için standart skorlama fonksiyonu.
    Erken ve geç tahminler farklı şekilde cezalandırılır.
    """
    diff = y_pred - y_true
    scores = np.where(diff >= 0,
                      np.exp(diff/10.0) - 1,    # Geç tahminler
                      np.exp(-diff/13.0) - 1)  # Erken tahminler
    return np.sum(scores)

# TensorFlow ile uyumlu NASA scoring loss function
def nasa_score_loss(y_true, y_pred):
    """
    NASA scoring function'ın TensorFlow ile uyumlu geliştirilmiş versiyonu.
    """
    diff = y_pred - y_true
    scores = tf.where(diff >= 0,
                      tf.exp(diff/8.5) - 1,
                      tf.exp(-diff/15.0) - 1)
    extreme_penalty = tf.where(tf.abs(diff) > 30,
                               tf.abs(diff) * 0.08,
                               0.0)
    scores = tf.clip_by_value(scores, -10.0, 10.0)
    return tf.reduce_mean(scores) + tf.reduce_mean(extreme_penalty)

def load_data():
    train_df = pd.read_csv('turbofan/train_FD001.txt', sep=' ', header=None)
    train_df = train_df.drop(columns=[26, 27])
    
    test_df = pd.read_csv('turbofan/test_FD001.txt', sep=' ', header=None)
    test_df = test_df.drop(columns=[26, 27])
    
    rul_df = pd.read_csv('turbofan/RUL_FD001.txt', header=None)
    rul_df.columns = ['RUL']
    
    columns = ['unit', 'cycle', 'op1', 'op2', 'op3'] + [f's{i}' for i in range(1,22)]
    train_df.columns = columns
    test_df.columns = columns
    
    # Kullanılacak özellikler 
    selected_sensors_indices = [2, 3, 4, 7, 8, 9, 11, 12, 13, 14, 15, 17, 20, 21]
    features_to_use = ['op1', 'op2'] + [f's{i}' for i in selected_sensors_indices]

    return train_df, test_df, rul_df, features_to_use

def prepare_sequences(df, sequence_length=30, feature_cols_to_scale=None, op_cols_to_scale=None, is_test=False, sensor_scaler=None, op_scaler=None):
    if feature_cols_to_scale is None:
        feature_cols_to_scale = [f's{i}' for i in range(1,22) if f's{i}' in df.columns]
    if op_cols_to_scale is None:
        op_cols_to_scale = [f'op{i}' for i in range(1,4) if f'op{i}' in df.columns]

    # Sensör verilerinin ölçeklendirilmesi:
    if sensor_scaler is None:
        sensor_scaler = RobustScaler()
        df[feature_cols_to_scale] = sensor_scaler.fit_transform(df[feature_cols_to_scale])
    else:
        df[feature_cols_to_scale] = sensor_scaler.transform(df[feature_cols_to_scale])
    
    # Operating conditions için ölçeklendirme:
    if op_scaler is None:
        op_scaler = MinMaxScaler()
        df[op_cols_to_scale] = op_scaler.fit_transform(df[op_cols_to_scale])
    else:
        df[op_cols_to_scale] = op_scaler.transform(df[op_cols_to_scale])
    
    full_feature_cols = feature_cols_to_scale + op_cols_to_scale
    
    sequences = []
    targets = []
    
    for unit in df['unit'].unique():
        unit_data = df[df['unit'] == unit]
        for i in range(len(unit_data) - sequence_length):
            sequence = unit_data[full_feature_cols].iloc[i:(i + sequence_length)].values
            if not is_test:
                target = unit_data['RUL'].iloc[i + sequence_length]
                targets.append(target)
            sequences.append(sequence)
    
    if is_test:
        return np.array(sequences), None, sensor_scaler, op_scaler
        
    return np.array(sequences), np.array(targets), sensor_scaler, op_scaler

def detect_outliers(values, threshold=3.0):
    z_scores = np.abs((values - np.mean(values)) / np.std(values))
    return z_scores > threshold

# KerasTuner için model builder fonksiyonu
def build_model(hp):
    """
    KerasTuner için hiperparametre optimizasyonu model builder fonksiyonu
    """
    # Hiperparametre arama alanları
    conv_filters_1 = hp.Int('conv_filters_1', min_value=32, max_value=128, step=32)
    conv_filters_2 = hp.Int('conv_filters_2', min_value=32, max_value=96, step=32)
    conv_kernel_1 = hp.Choice('conv_kernel_1', values=[3, 5, 7])
    conv_kernel_2 = hp.Choice('conv_kernel_2', values=[2, 3, 4])
    
    lstm_units_1 = hp.Int('lstm_units_1', min_value=32, max_value=128, step=16)
    lstm_units_2 = hp.Int('lstm_units_2', min_value=16, max_value=80, step=16)
    
    dense_units_1 = hp.Int('dense_units_1', min_value=50, max_value=150, step=25)
    dense_units_2 = hp.Int('dense_units_2', min_value=30, max_value=100, step=20)
    
    dropout_rate = hp.Float('dropout_rate', min_value=0.1, max_value=0.4, step=0.1)
    reg_factor = hp.Float('reg_factor', min_value=0.0001, max_value=0.01, sampling='LOG')
    learning_rate = hp.Float('learning_rate', min_value=1e-4, max_value=1e-2, sampling='LOG')
    
    # L1/L2 regularization oranı
    l1_ratio = hp.Float('l1_ratio', min_value=0.1, max_value=0.9, step=0.2)
    regularizer = l1_l2(l1=reg_factor * l1_ratio, l2=reg_factor * (1 - l1_ratio))
    
    # Recurrent dropout
    rec_dropout = hp.Float('recurrent_dropout', min_value=0.0, max_value=0.2, step=0.05)
    
    model = Sequential([
        Conv1D(conv_filters_1, conv_kernel_1, activation='relu', padding='same', 
               input_shape=(sequence_length, n_features), kernel_regularizer=regularizer),
        BatchNormalization(),
        MaxPooling1D(3),
        Dropout(dropout_rate),
        
        Conv1D(conv_filters_2, conv_kernel_2, activation='relu', padding='same', 
               kernel_regularizer=regularizer),
        BatchNormalization(),
        MaxPooling1D(2),
        Dropout(dropout_rate),
        
        Bidirectional(LSTM(lstm_units_1, return_sequences=True, activation="tanh", 
                           kernel_regularizer=regularizer, recurrent_regularizer=regularizer, 
                           recurrent_dropout=rec_dropout)),
        BatchNormalization(),
        Dropout(dropout_rate),
        
        Bidirectional(LSTM(lstm_units_2, return_sequences=False, activation="tanh", 
                           kernel_regularizer=regularizer, recurrent_regularizer=regularizer, 
                           recurrent_dropout=rec_dropout)),
        BatchNormalization(),
        Dropout(dropout_rate),
        
        Dense(dense_units_1, activation='relu', kernel_regularizer=regularizer),
        BatchNormalization(),
        Dropout(dropout_rate),
        Dense(dense_units_2, activation="relu", kernel_regularizer=regularizer),
        Dense(1, activation='linear')
    ])
    
    optimizer = tf.keras.optimizers.Adam(learning_rate=learning_rate)
    model.compile(optimizer=optimizer, loss=nasa_score_loss, metrics=['mae'])
    
    return model

# Verileri yükle
train_df, test_df, rul_df, features_to_use = load_data()

# features_to_use içinden sensör ve işletim parametrelerini ayır
op_cols = [f for f in features_to_use if f.startswith('op')]
selected_sensor_cols = [f for f in features_to_use if f.startswith('s')]

print("\nKullanılacak özellikler:")
print(f"İşletim parametreleri: {op_cols}")
print(f"Sensörler: {selected_sensor_cols}")
print(f"Toplam sensör sayısı: {len(selected_sensor_cols)}")
print(f"Toplam işletim parametresi sayısı: {len(op_cols)}")
print(f"Toplam özellik sayısı: {len(features_to_use)}")

sequence_length = 30
max_rul_value = 130

print("\nRUL hesaplama parametreleri:")
print(f"- Sabit RUL pencere uzunluğu: {sequence_length} döngü")
print(f"- Maksimum RUL değeri: {max_rul_value}")

# Eğitim verisi için RUL hesaplama
train_df['RUL'] = train_df.groupby('unit')['cycle'].transform(lambda x: max_rul_value - (x - (x.max() - max_rul_value)) if x.max() > max_rul_value else x.max() - x)
train_df['RUL'] = np.clip(train_df['RUL'], 0, max_rul_value)

# Test verisi için RUL hesaplama
true_test_ruls = []
for i, unit_id in enumerate(test_df['unit'].unique()):
    unit_data = test_df[test_df['unit'] == unit_id]
    true_test_ruls.append(rul_df.iloc[i]['RUL'])

# Eğitim verisi için sequence'leri hazırla
X, y, sensor_scaler, op_scaler = prepare_sequences(train_df.copy(), sequence_length=sequence_length, 
                                                  feature_cols_to_scale=selected_sensor_cols, 
                                                  op_cols_to_scale=op_cols, 
                                                  is_test=False)

rul_scaler = MinMaxScaler()
y_scaled = rul_scaler.fit_transform(y.reshape(-1, 1)).flatten()

X_train, X_val, y_train, y_val = train_test_split(X, y_scaled, test_size=0.2, random_state=42)

n_features = X_train.shape[2]

print(f"\nVeri seti boyutları:")
print(f"X_train shape: {X_train.shape}")
print(f"X_val shape: {X_val.shape}")
print(f"y_train shape: {y_train.shape}")
print(f"y_val shape: {y_val.shape}")
print(f"Özellik sayısı: {n_features}")

# KerasTuner hiperparametre optimizasyonu
print("\n" + "="*50)
print("KerasTuner Hiperparametre Optimizasyonu Başlıyor...")
print("="*50)

# Windows UTF-8 sorunu için güvenli dizin yolu oluştur
import tempfile
import shutil

# Geçici dizin kullan veya İngilizce yol belirle
try:
    # Önce mevcut dizini temizle
    tuner_dir = os.path.join(os.getcwd(), 'kt_tuner_logs')
    if os.path.exists(tuner_dir):
        try:
            shutil.rmtree(tuner_dir)
        except:
            pass
    
    # RandomSearch tuner oluştur - UTF-8 güvenli yol ile
    tuner = kt.RandomSearch(
        build_model,
        objective='val_loss',
        max_trials=50,  # Deneme sayısı - gerektiğinde artırabilirsiniz
        directory='kt_tuner_logs',
        project_name='nasa_rul_opt',  # Kısa isim, Türkçe karakter yok
        overwrite=True
    )
except Exception as e:
    print(f"İlk tuner oluşturma hatası: {e}")
    print("Geçici dizin kullanılıyor...")
    
    # Geçici dizin kullan
    temp_dir = tempfile.mkdtemp()
    print(f"Geçici dizin: {temp_dir}")
    
    tuner = kt.RandomSearch(
        build_model,
        objective='val_loss',
        max_trials=50,
        directory=temp_dir,
        project_name='nasa_rul_opt',
        overwrite=True
    )

# Tuner özeti
print("\nTuner Özeti:")
tuner.search_space_summary()

# Early stopping callback
early_stop = tf.keras.callbacks.EarlyStopping(
    monitor='val_loss',
    patience=10,
    min_delta=0.001,
    mode='min',
    restore_best_weights=True,
    verbose=0
)

# Hiperparametre araması
print("\nHiperparametre araması başlıyor...")
print("Bu işlem uzun sürebilir...")

tuner.search(
    X_train, y_train,
    epochs=50,  # Her deneme için epoch sayısı
    batch_size=16, 
    validation_data=(X_val, y_val),
    callbacks=[early_stop],
    verbose=1
)

# En iyi hiperparametreleri al
best_hps = tuner.get_best_hyperparameters(num_trials=1)[0]

print("\n" + "="*50)
print("En İyi Hiperparametreler:")
print("="*50)

# En iyi hiperparametreleri yazdır
hyperparams_to_print = [
    'conv_filters_1', 'conv_filters_2', 'conv_kernel_1', 'conv_kernel_2',
    'lstm_units_1', 'lstm_units_2', 'dense_units_1', 'dense_units_2',
    'dropout_rate', 'reg_factor', 'learning_rate', 'l1_ratio', 'recurrent_dropout'
]

for param in hyperparams_to_print:
    print(f"{param}: {best_hps.get(param)}")

# En iyi modeli oluştur
print("\n" + "="*50)
print("En İyi Model ile Final Eğitim...")  
print("="*50)

best_model = tuner.hypermodel.build(best_hps)
print("\nEn İyi Model Özeti:")
best_model.summary()

# En iyi model ile eğitim - daha uzun eğitim
final_early_stop = tf.keras.callbacks.EarlyStopping(
    monitor='val_loss',
    patience=20,
    min_delta=0.0001,
    mode='min',
    restore_best_weights=True,
    verbose=1
)

final_model_checkpoint = tf.keras.callbacks.ModelCheckpoint(
    filepath='best_model_kerastuner.h5',
    monitor='val_loss',
    save_best_only=True,
    mode='min',
    verbose=1
)

final_reduce_lr = tf.keras.callbacks.ReduceLROnPlateau(
    monitor='val_loss',
    factor=0.2,
    patience=10,
    min_lr=1e-7,
    verbose=1
)

# Final eğitim
history = best_model.fit(
    X_train, y_train,
    epochs=150,
    batch_size=16,
    validation_data=(X_val, y_val),
    callbacks=[final_early_stop, final_reduce_lr, final_model_checkpoint],
    verbose=1
)

# En iyi modeli yükle
print("En iyi model 'best_model_kerastuner.h5' yükleniyor...")
best_model.load_weights('best_model_kerastuner.h5')

# Test verisi için sequence'leri oluştur
X_test_seq_list = []
for unit_id in test_df['unit'].unique():
    unit_test_data = test_df[test_df['unit'] == unit_id].copy()
    
    # Sensör verilerini ölçekle
    unit_test_data[selected_sensor_cols] = sensor_scaler.transform(unit_test_data[selected_sensor_cols])
    # Operasyonel koşulları ölçekle
    unit_test_data[op_cols] = op_scaler.transform(unit_test_data[op_cols])
    
    # Sadece son sequence'i al
    if len(unit_test_data) >= sequence_length:
        last_sequence = unit_test_data[selected_sensor_cols + op_cols].iloc[-sequence_length:].values
        X_test_seq_list.append(last_sequence)
    else:
        print(f"Uyarı: Unit {unit_id} için yeterli cycle yok ({len(unit_test_data)})")

X_test_final_sequences = np.array(X_test_seq_list)

# Test verisi üzerinde tahmin yap
if X_test_final_sequences.shape[0] > 0:
    y_pred_scaled = best_model.predict(X_test_final_sequences)
    # Tahminleri orijinal ölçeğe geri dönüştür
    y_pred = rul_scaler.inverse_transform(y_pred_scaled).flatten()
else:
    print("Test için sequence oluşturulamadı.")
    y_pred = np.array([])

# Gerçek RUL değerleri
final_true_values = np.array(true_test_ruls[:len(y_pred)])
final_predictions = y_pred

# Tahmin sonrası aykırı değer işleme
if len(final_predictions) > 0:
    outliers = detect_outliers(final_predictions, threshold=2.3)
    print(f"\nTespit edilen aykırı tahmin sayısı: {np.sum(outliers)}")
    if np.sum(outliers) > 0:
        for i in range(len(final_predictions)):
            if outliers[i]:
                neighbors = []
                if i > 0 and not outliers[i-1]:
                    neighbors.append(final_predictions[i-1])
                if i < len(final_predictions)-1 and not outliers[i+1]:
                    neighbors.append(final_predictions[i+1])
                
                if len(neighbors) > 0:
                    final_predictions[i] = np.mean(neighbors) 
                else:
                    non_outlier_median = np.median(final_predictions[~outliers])
                    if not np.isnan(non_outlier_median):
                         final_predictions[i] = non_outlier_median
        print(f"Aykırı değerler düzeltildi")
    
    final_predictions = np.clip(final_predictions, 0, max_rul_value)

# Sonuçları değerlendir
if len(final_predictions) > 0 and len(final_true_values) == len(final_predictions):
    # Metrikleri hesapla
    nasa_score = nasa_scoring_function(final_true_values, final_predictions)
    print(f"\n" + "="*50)
    print("FINAL SONUÇLAR")
    print("="*50)
    print(f"NASA Scoring Function (S-score): {nasa_score:.4f} (düşük değerler daha iyi)")

    mse = mean_squared_error(final_true_values, final_predictions)
    rmse = math.sqrt(mse)
    mae = np.mean(np.abs(final_true_values - final_predictions))
    
    # MAPE için 0'a bölme hatasını engelle
    non_zero_true_indices = final_true_values != 0
    if np.sum(non_zero_true_indices) > 0:
        mape = np.mean(np.abs((final_true_values[non_zero_true_indices] - final_predictions[non_zero_true_indices]) / final_true_values[non_zero_true_indices])) * 100
    else:
        mape = float('inf')

    r2 = r2_score(final_true_values, final_predictions)

    print("\nModel Performansı (Regresyon Metrikleri):")
    print(f"MSE: {mse:.4f}")
    print(f"RMSE: {rmse:.4f}")
    print(f"MAE: {mae:.4f}")
    print(f"MAPE: {mape:.4f}%")
    print(f"R²: {r2:.4f}")

    # Görselleştirmeler
    plt.figure(figsize=(15, 10))

    # 1. Training history
    plt.subplot(2, 3, 1)
    plt.plot(history.history['loss'], label='Training Loss')
    plt.plot(history.history['val_loss'], label='Validation Loss')
    plt.title('Model Loss (KerasTuner Optimized)')
    plt.xlabel('Epoch')
    plt.ylabel('Loss')
    plt.legend()
    plt.grid(True)

    plt.subplot(2, 3, 2)
    plt.plot(history.history['mae'], label='Training MAE')
    plt.plot(history.history['val_mae'], label='Validation MAE')
    plt.title('Model MAE (KerasTuner Optimized)')
    plt.xlabel('Epoch')
    plt.ylabel('MAE')
    plt.legend()
    plt.grid(True)
    
    # 2. Bar plot karşılaştırması
    plt.subplot(2, 3, 3)
    indices = np.arange(len(final_true_values))
    width = 0.35
    plt.bar(indices - width/2, final_true_values, width, label='Gerçek RUL', color='blue', alpha=0.7)
    plt.bar(indices + width/2, final_predictions, width, label='Tahmin RUL', color='red', alpha=0.7)
    plt.xlabel('Test Ünitesi İndeksi')
    plt.ylabel('RUL')
    plt.title('RUL Tahminleri vs. Gerçek Değerler')
    plt.legend()
    plt.grid(True, axis='y')

    # 3. Sıralı karşılaştırma
    plt.subplot(2, 3, 4)
    sort_indices = np.argsort(final_true_values)
    sorted_true = final_true_values[sort_indices]
    sorted_pred = final_predictions[sort_indices]
    
    x = np.arange(len(sorted_true))
    plt.scatter(x, sorted_true, color='red', label='Gerçek RUL', alpha=0.7)
    plt.scatter(x, sorted_pred, color='blue', label='Tahmin RUL', alpha=0.7)
    
    for i in range(len(sorted_true)):
        plt.plot([i, i], [sorted_true[i], sorted_pred[i]], 'k:', alpha=0.3)
    
    plt.xlabel('Sıralı İndeks')
    plt.ylabel('RUL')
    plt.title('Artan Sıraya Göre Gerçek vs Tahmin')
    plt.legend()
    plt.grid(True, alpha=0.3)

    # 4. Scatter plot
    plt.subplot(2, 3, 5)
    plt.scatter(final_true_values, final_predictions, alpha=0.6, edgecolors='w', linewidth=0.5)
    plt.plot([0, max(np.max(final_true_values), np.max(final_predictions))], 
             [0, max(np.max(final_true_values), np.max(final_predictions))], 
             'r--', lw=2, label='İdeal Eşleşme')
    plt.xlabel('Gerçek RUL')
    plt.ylabel('Tahmin RUL')
    plt.title('Gerçek vs Tahmin RUL Scatter')
    plt.legend()
    plt.grid(True)

    # 5. Error distribution
    plt.subplot(2, 3, 6)
    errors = final_predictions - final_true_values
    plt.hist(errors, bins=20, alpha=0.7, color='green', edgecolor='black')
    plt.axvline(np.mean(errors), color='red', linestyle='--', label=f'Ortalama: {np.mean(errors):.2f}')
    plt.xlabel('Tahmin Hatası (Pred - True)')
    plt.ylabel('Frekans')
    plt.title('Tahmin Hata Dağılımı')
    plt.legend()
    plt.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.show()

    # Detaylı sonuç tablosu
    print(f"\n{'='*60}")
    print("DETAYLI SONUÇ ANALİZİ")
    print(f"{'='*60}")
    print(f"Toplam test ünitesi sayısı: {len(final_true_values)}")
    print(f"Ortalama gerçek RUL: {np.mean(final_true_values):.2f}")
    print(f"Ortalama tahmin RUL: {np.mean(final_predictions):.2f}")
    print(f"Medyan gerçek RUL: {np.median(final_true_values):.2f}")
    print(f"Medyan tahmin RUL: {np.median(final_predictions):.2f}")
    print(f"Ortalama mutlak hata: {mae:.2f}")
    print(f"Standart sapma (gerçek): {np.std(final_true_values):.2f}")
    print(f"Standart sapma (tahmin): {np.std(final_predictions):.2f}")

else:
    print("Metrik hesaplama için yeterli veri yok.")

# KerasTuner results summary
print(f"\n{'='*60}")
print("KERASTUNER OPTİMİZASYON ÖZETİ")
print(f"{'='*60}")
print(f"Toplam deneme sayısı: {len(tuner.oracle.trials)}")
print(f"En iyi skor: {tuner.oracle.get_best_trials(1)[0].score:.6f}")

# Bellek temizliği
K.clear_session()