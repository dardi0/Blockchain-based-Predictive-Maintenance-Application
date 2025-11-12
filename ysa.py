import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import RobustScaler, MinMaxScaler
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, roc_curve, auc, precision_recall_curve, average_precision_score, mean_squared_error, r2_score, mean_absolute_error
import seaborn as sns
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier, plot_tree  # Karar ağacı için import
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, LSTM, Dropout

# Veri setini yükleme
veri = pd.read_excel('TALEP.xlsx')

# Veri seti hakkında detaylı bilgi
print("\nVeri seti sütunları:")
print(veri.columns.tolist())

print("\nVeri seti hakkında bilgi:")
print(f"Veri şekli: {veri.shape}")
print("\nİlk 5 satır:")
print(veri.head())

print("\nMüşteri Sayısı İstatistikleri:")
print(veri['Musteri Sayisi'].describe())

# Müşteri sayısı histogram
plt.figure(figsize=(10, 6))
plt.hist(veri['Musteri Sayisi'], bins=20, alpha=0.7)
plt.title('Müşteri Sayısı Dağılımı')
plt.xlabel('Müşteri Sayısı')
plt.ylabel('Frekans')
plt.grid(True)
plt.tight_layout()
plt.show()

print("\nVeri istatistikleri:")
print(veri.describe())

print("\nVeri tipleri:")
print(veri.dtypes)

print("\nEksik değerler:")
print(veri.isnull().sum())

# Sınıf dağılımını kontrol etme
print("\nHedef değişken dağılımı:")
# engine_counts = veri['Engine Condition'].value_counts()  # Bu satırı geçici olarak yorum satırına aldık
# print(engine_counts)

# sınıf_0 = (veri['Engine Condition'] == 0).sum()  # Bu satırı geçici olarak yorum satırına aldık
# sınıf_1 = (veri['Engine Condition'] == 1).sum()  # Bu satırı geçici olarak yorum satırına aldık
# print(f"Motor Durumu 0 (Sağlıklı Değil): {sınıf_0}")
# print(f"Motor Durumu 1 (Sağlıklı): {sınıf_1}")
# print(f"Sınıf oranı (Sağlıklı/Sağlıklı Değil): {sınıf_1 / sınıf_0:.2f}")

# Korelasyon matrisi
plt.figure(figsize=(12, 10))
corr_matrix = veri.corr()
sns.heatmap(corr_matrix, annot=True, cmap='coolwarm', fmt='.2f')
plt.title('Değişkenler Arası Korelasyon Matrisi')
plt.tight_layout()
plt.show()

# Girdiler ve çıktı değişkenleri ayırma
# Sadece belirtilen değişkenleri girdi olarak kullanma
selected_features = ['Ortalama Hava Sicakligi', 'Kulturel Etkinlik Gunu Sayisi', 'Yillik Enflasyon (AB)']
X = veri[selected_features]  # Sadece seçilen özellikler
y = veri['Musteri Sayisi']  # Tahmin edilecek hedef değişken

# Eğitim ve test verilerini ayırma
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Özellikleri ölçeklendirme (normalleştirme)
scaler = RobustScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# MLPRegressor modelini oluşturma ve eğitme
print("\nMLPRegressor modeli eğitiliyor...")
mlp = MLPRegressor(
    hidden_layer_sizes=(50, 30, 20),  # Daha karmaşık model (3 gizli katman)
    activation='relu',               # ReLU aktivasyon fonksiyonu
    solver='adam',                   # Adam optimizer
    alpha=0.0001,                    # Regülarizasyon parametresi
    batch_size=16,                   # Batch boyutu
    learning_rate_init=0.001,        # Başlangıç öğrenme oranı
    max_iter=10000,                  # Maksimum iterasyon sayısı
    random_state=42,                 # Sonuçları tekrarlanabilir yapmak için
    early_stopping=True,             # Erken durdurma
    validation_fraction=0.1,         # Doğrulama için ayrılan veri oranı
    n_iter_no_change=50,             # Gelişme olmadan geçebilecek iterasyon sayısı
    verbose=True                     # İlerlemeyi göster
)

# Modeli eğitelim
mlp.fit(X_train_scaled, y_train)

# Test ve eğitim setindeki tahminleri kontrol edelim
y_train_pred = mlp.predict(X_train_scaled)
y_test_pred = mlp.predict(X_test_scaled)

# Veri setindeki her bir örnek için gerçek vs tahmin grafiği
plt.figure(figsize=(14, 6))

plt.subplot(1, 2, 1)
plt.scatter(range(len(y_train)), y_train, label='Gerçek Değerler (Eğitim)', alpha=0.7, color='blue', s=50)
plt.scatter(range(len(y_train)), y_train_pred, label='Tahminler (Eğitim)', alpha=0.7, color='red', s=30, marker='x')
plt.title('Eğitim Seti: Gerçek vs Tahmin')
plt.xlabel('Örnek')
plt.ylabel('Müşteri Sayısı')
plt.legend()
plt.grid(True)

plt.subplot(1, 2, 2)
plt.scatter(range(len(y_test)), y_test, label='Gerçek Değerler (Test)', alpha=0.7, color='blue', s=50)
plt.scatter(range(len(y_test)), y_test_pred, label='Tahminler (Test)', alpha=0.7, color='red', s=30, marker='x')
plt.title('Test Seti: Gerçek vs Tahmin')
plt.xlabel('Örnek')
plt.ylabel('Müşteri Sayısı')
plt.legend()
plt.grid(True)

plt.tight_layout()
plt.show()

# Tahminlerin gerçek değerlere göre saçılım grafiği
plt.figure(figsize=(14, 6))

plt.subplot(1, 2, 1)
plt.scatter(y_train, y_train_pred, alpha=0.7)
plt.plot([min(y_train), max(y_train)], [min(y_train), max(y_train)], 'r--')
plt.title('Eğitim Seti: Gerçek vs. Tahmin')
plt.xlabel('Gerçek Müşteri Sayısı')
plt.ylabel('Tahmin Edilen Müşteri Sayısı')
plt.grid(True)

plt.subplot(1, 2, 2)
plt.scatter(y_test, y_test_pred, alpha=0.7)
plt.plot([min(y_test), max(y_test)], [min(y_test), max(y_test)], 'r--')
plt.title('Test Seti: Gerçek vs. Tahmin')
plt.xlabel('Gerçek Müşteri Sayısı')
plt.ylabel('Tahmin Edilen Müşteri Sayısı')
plt.grid(True)

plt.tight_layout()
plt.show()

# Özellik önem dereceleri (permütasyon yöntemiyle)
result = permutation_importance(mlp, X_test_scaled, y_test, n_repeats=10, random_state=42)
importance = pd.DataFrame({
    'Özellik': X.columns,
    'Önem Skoru': result.importances_mean,
    'Standart Sapma': result.importances_std
}).sort_values(by='Önem Skoru', ascending=False)

print("\nÖzellik Önem Dereceleri:")
print(importance)

# Özellik önem derecelerini görselleştirme
plt.figure(figsize=(10, 6))
plt.barh(importance['Özellik'], importance['Önem Skoru'])
plt.xlabel('Önem Skoru')
plt.title('Özellik Önem Dereceleri')
plt.grid(True, axis='x')
plt.tight_layout()
plt.show()

# Artık değerler (tahmin hataları) analizi
residuals = y_test - y_test_pred
plt.figure(figsize=(10, 6))
plt.scatter(y_test_pred, residuals)
plt.axhline(y=0, color='r', linestyle='--')
plt.xlabel('Tahmin Edilen Değerler')
plt.ylabel('Artık Değerler')
plt.title('Artık Değerler Analizi')
plt.grid(True)
plt.tight_layout()
plt.show()

# 6 ay için müşteri sayısı tahmini
# Önce mevcut değerlerin aralıklarını kontrol edelim
print("\nMevcut veri setindeki değer aralıkları:")
for feature in selected_features:
    print(f"{feature}: {veri[feature].min()} - {veri[feature].max()}, Ortalama: {veri[feature].mean():.2f}")

# 2025 yılı Mayıs-Ekim ayları için tahmin yapacağız
months = ["May.25", "Haz.25", "Tem.25", "Ağu.25", "Eyl.25", "Eki.25"]
month_indices = [5, 6, 7, 8, 9, 10]  # 1-Ocak, 2-Şubat... şeklinde ay indisleri

# Mevsimsel özelliklere sahip aylar
low_season_months = [5, 9, 10]  # Mayıs, Eylül ve Ekim - düşük müşteri sayısı
high_season_months = [6, 7, 8]  # Haziran, Temmuz, Ağustos - yüksek müşteri sayısı

future_data = []
for i, month in enumerate(month_indices):
    # Son satırı kopyala ve bazı değişiklikler yap
    new_row = X.iloc[-1].copy()
    
    # Mevsimsel faktörler - Sıcaklık
    mean_temp = veri['Ortalama Hava Sicakligi'].mean()
    min_temp = veri['Ortalama Hava Sicakligi'].min()
    max_temp = veri['Ortalama Hava Sicakligi'].max()
    
    if month in high_season_months:  # Yaz ayları (Haz, Tem, Ağu)
        new_row['Ortalama Hava Sicakligi'] = max(mean_temp * 1.2, min_temp)  # Yüksek sıcaklık
    elif month == 5:  # Mayıs
        new_row['Ortalama Hava Sicakligi'] = mean_temp * 0.9  # Ortalama altı sıcaklık
    else:  # Eylül ve Ekim
        new_row['Ortalama Hava Sicakligi'] = mean_temp * 0.8  # Düşük sıcaklık
    
    # Etkinlik sayısı - mevsimsel düşük/yüksek müşteri sayısını etkilemek için
    mean_events = veri['Kulturel Etkinlik Gunu Sayisi'].mean()
    min_events = veri['Kulturel Etkinlik Gunu Sayisi'].min()
    max_events = veri['Kulturel Etkinlik Gunu Sayisi'].max()
    
    if month in high_season_months:  # Yüksek sezon
        new_row['Kulturel Etkinlik Gunu Sayisi'] = min(mean_events * 1.3, max_events)  # Daha çok etkinlik
    elif month in low_season_months:  # Düşük sezon
        new_row['Kulturel Etkinlik Gunu Sayisi'] = max(mean_events * 0.7, min_events)  # Daha az etkinlik
    
    # Enflasyon - aydan aya kademeli artış
    last_inflation = veri['Yillik Enflasyon (AB)'].iloc[-1]
    new_row['Yillik Enflasyon (AB)'] = last_inflation * (1 + (0.005 * (i+1)))
    
    future_data.append(new_row)

# Dataframe'e çevir
future_df = pd.DataFrame(future_data)

print("\nGelecek 6 ay için oluşturulan girdi değerleri:")
print(future_df)

# Ölçeklendir ve tahmin yap
future_scaled = scaler.transform(future_df)
future_predictions = mlp.predict(future_scaled)

# Model performans metriklerini değerlendir
train_mse = mean_squared_error(y_train, y_train_pred)
train_rmse = np.sqrt(train_mse)
train_mae = mean_absolute_error(y_train, y_train_pred)
train_r2 = r2_score(y_train, y_train_pred)

test_mse = mean_squared_error(y_test, y_test_pred)
test_rmse = np.sqrt(test_mse)
test_mae = mean_absolute_error(y_test, y_test_pred)
test_r2 = r2_score(y_test, y_test_pred)

print("\nModel Performans Metrikleri:")
print(f"Eğitim RMSE: {train_rmse:.2f}, MAE: {train_mae:.2f}, R²: {train_r2:.4f}")
print(f"Test RMSE: {test_rmse:.2f}, MAE: {test_mae:.2f}, R²: {test_r2:.4f}")

# Gelecek tahminleri yazdır
print("\nGelecek 6 aylık müşteri sayısı tahminleri:")
for i, pred in enumerate(future_predictions):
    print(f"{i+1}. ay tahmini: {pred:.0f} müşteri")
    
# Eğer tahminler hala çok düşük çıkıyorsa, gerçek veri aralıklarıyla karşılaştıralım
print("\n--- Tahmin Değerleri Analizi ---")
print(f"Gerçek müşteri sayısı min-max: {y.min()}-{y.max()}")
print(f"Tahmin edilen müşteri sayısı min-max: {min(future_predictions):.0f}-{max(future_predictions):.0f}")

# Tahminler çok düşük çıkıyorsa, gerçekçi aralığa ölçeklendirelim
original_mean = y.mean()
prediction_mean = np.mean(future_predictions)
scaling_factor = 1

# Eğer tahminler gerçek değerlerin çok altındaysa ve bu bir hata olduğu düşünülüyorsa
# bu faktörle düzeltme yapılabilir (opsiyonel)
if prediction_mean < original_mean / 100:  # Çok büyük bir fark varsa
    scaling_factor = original_mean / prediction_mean
    adjusted_predictions = future_predictions * scaling_factor
    print(f"\nDüzeltme faktörü uygulandı: {scaling_factor:.2f}")
    print("Düzeltilmiş tahminler:")
    for i, pred in enumerate(adjusted_predictions):
        print(f"{i+1}. ay düzeltilmiş tahmini: {pred:.0f} müşteri")

# Tahminlerde varyasyon kontrolü
prediction_std = np.std(future_predictions)
real_std = np.std(y)
print(f"Gerçek müşteri sayısı standart sapması: {real_std:.2f}")
print(f"Tahmin edilen müşteri sayısı standart sapması: {prediction_std:.2f}")

# Varyasyon çok düşükse uyarı verelim
if prediction_std < real_std * 0.1:  # Tahmin varyasyonu çok düşükse
    print("\nUYARI: Tahminlerin varyasyonu çok düşük! Model değişkenlere yeterince tepki vermeyebilir.")

# Tahminleri görselleştirme
plt.figure(figsize=(12, 6))
months = [f"Ay {i+1}" for i in range(6)]

# Eğer ölçeklendirme yapıldıysa
if scaling_factor > 1:
    plt.subplot(1, 2, 1)
    plt.bar(months, future_predictions, color='skyblue')
    plt.title('Orijinal Tahminler')
    plt.xlabel('Aylar')
    plt.ylabel('Tahmini Müşteri Sayısı')
    plt.grid(True, axis='y')
    
    plt.subplot(1, 2, 2)
    plt.bar(months, adjusted_predictions, color='salmon')
    plt.title('Düzeltilmiş Tahminler')
    plt.xlabel('Aylar')
    plt.ylabel('Tahmini Müşteri Sayısı')
    plt.grid(True, axis='y')
else:
    plt.bar(months, future_predictions, color='skyblue')
    plt.title('Gelecek 6 Ay İçin Müşteri Sayısı Tahminleri')
    plt.xlabel('Aylar')
    plt.ylabel('Tahmini Müşteri Sayısı')
    plt.grid(True, axis='y')

plt.tight_layout()
plt.show()

# Geçmiş ve gelecek tahminleri birlikte göster
historical = np.concatenate([y_train, y_test])
future = future_predictions if scaling_factor == 1 else adjusted_predictions

# Ay isimleri ekleyelim (modelimize göre)
month_names = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
               'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
current_month = 4  # Nisan
future_months = [(current_month + i - 1) % 12 for i in range(1, 7)]
future_month_labels = [month_names[m] for m in future_months]

plt.figure(figsize=(15, 7))

# Geçmiş veriler ve gelecek tahminleri
plt.subplot(2, 1, 1)
time_x = np.arange(len(historical))
future_x = np.arange(len(historical), len(historical) + len(future))

plt.plot(time_x, historical, label='Geçmiş Veriler', color='blue')
plt.plot(future_x, future, label='Gelecek Tahminleri', color='red', linestyle='--', marker='o')
plt.axvline(x=len(historical)-1, color='k', linestyle='-', alpha=0.3)
plt.title('Müşteri Sayısı: Geçmiş ve Gelecek Tahminleri')
plt.ylabel('Müşteri Sayısı')
plt.legend()
plt.grid(True)

# Sadece gelecek tahminleri (daha detaylı)
plt.subplot(2, 1, 2)
plt.bar(future_month_labels, future, color='salmon')
plt.title('Gelecek 6 Ay İçin Müşteri Sayısı Tahminleri')
plt.xlabel('Aylar')
plt.ylabel('Tahmini Müşteri Sayısı')
for i, v in enumerate(future):
    plt.text(i, v + 0.1, f"{v:.0f}", ha='center')
plt.grid(True, axis='y')

plt.tight_layout()
plt.show()


