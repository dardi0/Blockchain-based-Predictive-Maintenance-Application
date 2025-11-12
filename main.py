import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import RobustScaler
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, roc_curve, auc, precision_recall_curve, average_precision_score
import seaborn as sns
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier, plot_tree  # Karar ağacı için import

# Veri setini yükleme
veri = pd.read_csv('engine_data.csv')


# Veri hakkında bilgi alma
print("\nVeri seti hakkında bilgi:")
print(f"Veri şekli: {veri.shape}")
print("\nİlk 5 satır:")
print(veri.head())

print("\nVeri istatistikleri:")
print(veri.describe())

# Sınıf dağılımını kontrol etme
print("\nHedef değişken dağılımı:")
engine_counts = veri['Engine Condition'].value_counts()
print(engine_counts)

sınıf_0 = (veri['Engine Condition'] == 0).sum()
sınıf_1 = (veri['Engine Condition'] == 1).sum()
print(f"Motor Durumu 0 (Sağlıklı Değil): {sınıf_0}")
print(f"Motor Durumu 1 (Sağlıklı): {sınıf_1}")
print(f"Sınıf oranı (Sağlıklı/Sağlıklı Değil): {sınıf_1 / sınıf_0:.2f}")

# Eksik değerler kontrolü
print("\nEksik değerler:")
print(veri.isnull().sum())

# Öznitelikler ve hedef değişken tanımlama
X = veri.drop('Engine Condition', axis=1)  # Tüm öznitelikler
y = veri['Engine Condition']  # Hedef değişken (motor durumu)

# Öznitelikler arasındaki korelasyon analizi - Spearman korelasyonu kullanma
plt.figure(figsize=(10, 8))
corr_matrix = X.corr(method='spearman')  # Spearman korelasyonu
sns.heatmap(corr_matrix, annot=True, cmap='coolwarm', fmt='.2f')
plt.title('Öznitelikler Arası Spearman Korelasyon Matrisi')
plt.tight_layout()
plt.show()

# Eğitim ve test verilerini ayırma
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42, stratify=y)

# Öznitelikleri ölçeklendirme (RobustScaler kullanarak - aykırı değerlere daha dirençli)
scaler = RobustScaler()  # Aykırı değerlere karşı daha dayanıklı ölçeklendirme
print("\nRobustScaler kullanılarak veri ölçeklendiriliyor...")
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Ölçeklendirme öncesi ve sonrası veri özelliklerini göster
train_stats_before = pd.DataFrame(X_train).describe()
train_stats_after = pd.DataFrame(X_train_scaled).describe()

print("\nÖlçeklendirme Öncesi İstatistikler:")
print(train_stats_before)
print("\nÖlçeklendirme Sonrası İstatistikler (RobustScaler):")
print(train_stats_after)

# Çapraz doğrulama ile model performansı değerlendirme
print("\nÇapraz doğrulama yapılıyor...")
base_mlp = MLPClassifier(hidden_layer_sizes=(30, 20), 
                         activation='tanh',
                         solver='adam',
                         alpha=0.01, 
                         batch_size=32,
                         learning_rate_init=0.001,
                         max_iter=5000, 
                         random_state=42,
                         early_stopping=True,
                         validation_fraction=0.2,
                         n_iter_no_change=10)

cv_scores = cross_val_score(base_mlp, X_train_scaled, y_train, cv=5, scoring='accuracy')
print(f"Çapraz doğrulama sonuçları: {cv_scores}")
print(f"Ortalama doğruluk: {cv_scores.mean():.4f} (±{cv_scores.std():.4f})")

# MLP modelini eğitme
print("\nMLP modeli eğitiliyor...")
mlp = MLPClassifier(hidden_layer_sizes=(30, 20), 
                   activation='tanh',
                   solver='adam',
                   alpha=0.01, 
                   batch_size=32,
                   learning_rate_init=0.001,
                   max_iter=10000, 
                   random_state=42,
                   early_stopping=True,
                   validation_fraction=0.2,
                   n_iter_no_change=10)

mlp.fit(X_train_scaled, y_train)

# Eğitimle ilgili bilgileri görüntüleme
print(f"\nEğitim süresince tamamlanan iterasyon sayısı: {mlp.n_iter_}")
if mlp.n_iter_ < mlp.max_iter:
    print(f"Model erken durdu: {mlp.n_iter_} iterasyondan sonra")
else:
    print(f"Model maksimum {mlp.max_iter} iterasyona ulaştı.")

# Test verileri üzerinde tahmin yapma
y_pred = mlp.predict(X_test_scaled)
y_prob = mlp.predict_proba(X_test_scaled)[:, 1]  # Pozitif sınıf olasılıkları

# Model başarısını değerlendirme
print("\nMLP Model performansı (Orijinal Özellikler):")
print(f"Doğruluk (Accuracy): {accuracy_score(y_test, y_pred):.4f}")

print("\nKarmaşıklık matrisi:")
cm = confusion_matrix(y_test, y_pred)
print(cm)

print("\nSınıflandırma raporu:")
print(classification_report(y_test, y_pred))

# ROC Eğrisi ve AUC skoru
fpr, tpr, thresholds = roc_curve(y_test, y_prob)
roc_auc = auc(fpr, tpr)
print(f"AUC Skoru: {roc_auc:.4f}")

plt.figure(figsize=(8, 6))
plt.plot(fpr, tpr, color='darkorange', lw=2, label=f'ROC eğrisi (alan = {roc_auc:.2f})')
plt.plot([0, 1], [0, 1], color='navy', lw=2, linestyle='--')
plt.xlim([0.0, 1.0])
plt.ylim([0.0, 1.05])
plt.xlabel('Yanlış Pozitif Oranı')
plt.ylabel('Doğru Pozitif Oranı')
plt.title('Alıcı İşletim Karakteristiği (ROC) Eğrisi')
plt.legend(loc="lower right")
plt.show()


# Görselleştirme: Karmaşıklık matrisi - Etiketli hali
plt.figure(figsize=(10, 8))

# İki sınıf için etiketleri belirle
group_names = ['Doğru Negatif (TN)', 'Yanlış Pozitif (FP)',
               'Yanlış Negatif (FN)', 'Doğru Pozitif (TP)']

# Matrisi düzleştirip etiketleri oluştur
group_counts = ["{0:0.0f}".format(value) for value in cm.flatten()]
group_percentages = ["{0:.2%}".format(value) for value in cm.flatten()/np.sum(cm)]

# Değerli ve anlamlı etiketleri birleştir
labels = [f"{v1}\n{v2}\n{v3}" for v1, v2, v3 in zip(group_names, group_counts, group_percentages)]
labels = np.asarray(labels).reshape(2,2)

# Isı haritasını oluştur
sns.heatmap(cm, annot=labels, fmt='', cmap='Blues')
plt.title('Karmaşıklık Matrisi (Confusion Matrix) - Etiketli')
plt.ylabel('Gerçek Değer')
plt.xlabel('Tahmin Edilen Değer')
plt.xticks([0.5, 1.5], ['0 (Sağlıklı Değil)', '1 (Sağlıklı)'])
plt.yticks([0.5, 1.5], ['0 (Sağlıklı Değil)', '1 (Sağlıklı)'])
plt.tight_layout()
plt.show()


# Görselleştirme: Özniteliklerin dağılımı
plt.figure(figsize=(15, 12))
for i, col in enumerate(X.columns):
    plt.subplot(3, 3, i + 1)
    sns.histplot(data=veri, x=col, hue='Engine Condition', kde=True, palette={0: "red", 1: "green"})
    plt.title(f'{col} Dağılımı')
plt.tight_layout()
plt.show()


# Öznitelik önem dereceleri analizi (Permutation Importance ile MLP için)
print("\nMLP için Permütasyon Önem Dereceleri Hesaplanıyor...")
perm_result = permutation_importance(
    mlp, X_test_scaled, y_test, n_repeats=10, random_state=42, n_jobs=-1
)

perm_importance_mlp = pd.DataFrame({
    'Öznitelik': X.columns,
    'Önem Derecesi (Ortalama)': perm_result.importances_mean,
    'Önem Derecesi (Std)': perm_result.importances_std
}).sort_values(by='Önem Derecesi (Ortalama)', ascending=False)

print("\nMLP Permütasyon Öznitelik Önem Dereceleri:")
print(perm_importance_mlp)

# ----- Derin Özellik Çıkarma ve Karşılaştırma -----
print("\n----- Derin Özellik Çıkarma ve Karşılaştırmalı Analiz -----")

# MLP modelinden belirtilen katman için özellikleri çıkarma fonksiyonu
def extract_features_from_mlp(model, X, layer_index):
    """
    MLP modelinin belirli bir katmanından özellik çıkarma
    
    Parametreler:
    model: Eğitilmiş MLPClassifier modeli
    X: Özellik çıkarılacak giriş verileri
    layer_index: Özellik çıkarılacak katman indeksi (0 = ilk gizli katman)
    
    Dönüş:
    activations: Belirtilen katmanın aktivasyon değerleri
    """
    # İlk katmandan başlayarak istenen katmana kadar aktivasyonları hesapla
    activations = X.copy()
    
    # Sadece gizli katmanlarda ilerliyoruz (çıkış katmanı hariç)
    for i in range(min(layer_index + 1, len(model.coefs_) - 1)):
        # Doğrusal dönüşüm: A = X*W + b
        activations = np.dot(activations, model.coefs_[i]) + model.intercepts_[i]
        
        # Aktivasyon fonksiyonu uygula
        if model.activation == 'tanh':
            activations = np.tanh(activations)
        elif model.activation == 'relu':
            activations = np.maximum(0, activations)
        elif model.activation == 'logistic':
            activations = 1 / (1 + np.exp(-activations))
            
    return activations

# Birinci gizli katmandan özellik çıkarma
print("\nBirinci gizli katmandan (katman 0) özellik çıkarılıyor...")
features_layer0_train = extract_features_from_mlp(mlp, X_train_scaled, 0)
features_layer0_test = extract_features_from_mlp(mlp, X_test_scaled, 0)

print(f"Çıkarılan özellik boyutu (1. Katman): {features_layer0_train.shape}")

# İkinci gizli katmandan özellik çıkarma
print("\nİkinci gizli katmandan (katman 1) özellik çıkarılıyor...")
features_layer1_train = extract_features_from_mlp(mlp, X_train_scaled, 1)
features_layer1_test = extract_features_from_mlp(mlp, X_test_scaled, 1)

print(f"Çıkarılan özellik boyutu (2. Katman): {features_layer1_train.shape}")

# ----- Derin Özelliklerle Farklı Sınıflandırıcıların Karşılaştırması -----
print("\n----- Derin Özelliklerle Farklı Sınıflandırıcıların Karşılaştırması -----")

# 1. Derin özelliklerle yeni bir MLP sınıflandırıcı eğitme
print("\nDerin özelliklerle yeni MLP sınıflandırıcı eğitiliyor...")

# İlk katman özellikleriyle
mlp_deep_layer0 = MLPClassifier(hidden_layer_sizes=(10,), activation='tanh', 
                                random_state=42, max_iter=5000)
mlp_deep_layer0.fit(features_layer0_train, y_train)
y_pred_mlp_layer0 = mlp_deep_layer0.predict(features_layer0_test)
accuracy_mlp_layer0 = accuracy_score(y_test, y_pred_mlp_layer0)

# İkinci katman özellikleriyle
mlp_deep_layer1 = MLPClassifier(hidden_layer_sizes=(10,), activation='tanh', 
                                random_state=42, max_iter=5000)
mlp_deep_layer1.fit(features_layer1_train, y_train)
y_pred_mlp_layer1 = mlp_deep_layer1.predict(features_layer1_test)
accuracy_mlp_layer1 = accuracy_score(y_test, y_pred_mlp_layer1)

# Sonuçları görüntüleme
print("\n----- Sınıflandırma Sonuçları -----")
print("Orijinal MLP (Orijinal özellikler)     : {:.4f}".format(accuracy_score(y_test, y_pred)))
print("MLP (1. Katman derin özellikleri)      : {:.4f}".format(accuracy_mlp_layer0))
print("MLP (2. Katman derin özellikleri)      : {:.4f}".format(accuracy_mlp_layer1))

# ----- MLP Karşılaştırma Analizi: Orijinal vs. Derin Özellikler -----
print("\n----- MLP Karşılaştırma Analizi: Orijinal vs. Derin Özellikler -----")

# 1. Orijinal verilerle MLP (mevcut model)
print("\nOrijinal verilerle MLP performansı:")
print(f"Doğruluk (Accuracy): {accuracy_score(y_test, y_pred):.4f}")
print("\nSınıflandırma raporu (Orijinal özellikler):")
print(classification_report(y_test, y_pred))

# Derin özellikler MLP modellerinin performansları
print("\nDerin özelliklerle MLP performansı:")
print(f"1. Katman derin özellikleri ile: {accuracy_mlp_layer0:.4f}")
print(f"2. Katman derin özellikleri ile: {accuracy_mlp_layer1:.4f}")

print("\nSınıflandırma raporu (1. Katman derin özellikleri):")
print(classification_report(y_test, y_pred_mlp_layer0))

print("\nSınıflandırma raporu (2. Katman derin özellikleri):")
print(classification_report(y_test, y_pred_mlp_layer1))

# Karşılaştırmalı ROC eğrileri çizelim
plt.figure(figsize=(10, 8))

# Orijinal MLP için ROC
fpr_orig, tpr_orig, _ = roc_curve(y_test, mlp.predict_proba(X_test_scaled)[:, 1])
roc_auc_orig = auc(fpr_orig, tpr_orig)
plt.plot(fpr_orig, tpr_orig, color='blue', lw=2, 
         label=f'Orijinal MLP (AUC = {roc_auc_orig:.2f})')

# 1. Katman derin özelliklerle MLP için ROC
fpr_layer0, tpr_layer0, _ = roc_curve(y_test, mlp_deep_layer0.predict_proba(features_layer0_test)[:, 1])
roc_auc_layer0 = auc(fpr_layer0, tpr_layer0)
plt.plot(fpr_layer0, tpr_layer0, color='green', lw=2, 
         label=f'MLP + 1. Katman derin öz. (AUC = {roc_auc_layer0:.2f})')

# 2. Katman derin özelliklerle MLP için ROC
fpr_layer1, tpr_layer1, _ = roc_curve(y_test, mlp_deep_layer1.predict_proba(features_layer1_test)[:, 1])
roc_auc_layer1 = auc(fpr_layer1, tpr_layer1)
plt.plot(fpr_layer1, tpr_layer1, color='red', lw=2, 
         label=f'MLP + 2. Katman derin öz. (AUC = {roc_auc_layer1:.2f})')

plt.plot([0, 1], [0, 1], color='navy', lw=2, linestyle='--')
plt.xlim([0.0, 1.0])
plt.ylim([0.0, 1.05])
plt.xlabel('Yanlış Pozitif Oranı')
plt.ylabel('Doğru Pozitif Oranı')
plt.title('MLP Modellerinin ROC Eğrileri Karşılaştırması')
plt.legend(loc="lower right")
plt.grid(True, linestyle='--', alpha=0.7)
plt.tight_layout()
plt.show()

# Average Precision Score (AP) değerlerini hesaplama
ap_score_orig = average_precision_score(y_test, mlp.predict_proba(X_test_scaled)[:, 1])
ap_score_layer0 = average_precision_score(y_test, mlp_deep_layer0.predict_proba(features_layer0_test)[:, 1])
ap_score_layer1 = average_precision_score(y_test, mlp_deep_layer1.predict_proba(features_layer1_test)[:, 1])

# Karmaşıklık matrisleri karşılaştırması
fig, axes = plt.subplots(1, 3, figsize=(18, 6))

# Orijinal MLP için karmaşıklık matrisi
cm_orig = confusion_matrix(y_test, y_pred)
sns.heatmap(cm_orig, annot=True, fmt='d', cmap='Blues', ax=axes[0])
axes[0].set_title('Orijinal MLP')
axes[0].set_xlabel('Tahmin Edilen')
axes[0].set_ylabel('Gerçek Değer')
axes[0].set_xticks([0.5, 1.5])
axes[0].set_yticks([0.5, 1.5])
axes[0].set_xticklabels(['0 (Sağlıklı Değil)', '1 (Sağlıklı)'])
axes[0].set_yticklabels(['0 (Sağlıklı Değil)', '1 (Sağlıklı)'])

# 1. Katman derin özellikleri MLP için karmaşıklık matrisi
cm_layer0 = confusion_matrix(y_test, y_pred_mlp_layer0)
sns.heatmap(cm_layer0, annot=True, fmt='d', cmap='Blues', ax=axes[1])
axes[1].set_title('MLP + 1. Katman Derin Özellikler')
axes[1].set_xlabel('Tahmin Edilen')
axes[1].set_ylabel('Gerçek Değer')
axes[1].set_xticks([0.5, 1.5])
axes[1].set_yticks([0.5, 1.5])
axes[1].set_xticklabels(['0 (Sağlıklı Değil)', '1 (Sağlıklı)'])
axes[1].set_yticklabels(['0 (Sağlıklı Değil)', '1 (Sağlıklı)'])

# 2. Katman derin özellikleri MLP için karmaşıklık matrisi
cm_layer1 = confusion_matrix(y_test, y_pred_mlp_layer1)
sns.heatmap(cm_layer1, annot=True, fmt='d', cmap='Blues', ax=axes[2])
axes[2].set_title('MLP + 2. Katman Derin Özellikler')
axes[2].set_xlabel('Tahmin Edilen')
axes[2].set_ylabel('Gerçek Değer')
axes[2].set_xticks([0.5, 1.5])
axes[2].set_yticks([0.5, 1.5])
axes[2].set_xticklabels(['0 (Sağlıklı Değil)', '1 (Sağlıklı)'])
axes[2].set_yticklabels(['0 (Sağlıklı Değil)', '1 (Sağlıklı)'])

plt.tight_layout()
plt.show()

# MLP performans metriklerinin tek tabloda karşılaştırması
mlp_results = {
    'Model': ['Orijinal MLP', 'MLP + 1. Katman', 'MLP + 2. Katman'],
    'Doğruluk (Accuracy)': [
        accuracy_score(y_test, y_pred),
        accuracy_mlp_layer0,
        accuracy_mlp_layer1
    ],
    'AUC': [roc_auc_orig, roc_auc_layer0, roc_auc_layer1],
    'Avg Precision': [ap_score_orig, ap_score_layer0, ap_score_layer1]
}

df_results = pd.DataFrame(mlp_results)
print("\n----- MLP Modelleri Karşılaştırma Tablosu -----")
print(df_results.to_string(index=False))


