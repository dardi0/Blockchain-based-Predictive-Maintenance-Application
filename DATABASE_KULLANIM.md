# 📊 PdM Database Entegrasyonu - Kullanım Kılavuzu

## 🎯 Genel Bakış

**PdM sistemi** artık **SQLite3 database** entegrasyonu ile çalışıyor! GUI'den her arıza tahmini yaptığınızda, **sensör verileri otomatik olarak** `PdMDatabase/PdMDatabase` dosyasına kaydediliyor.

## 📋 Özellikler

### ✅ Otomatik Veri Kaydetme
- **GUI**'den arıza tahmini yapıldığında
- **Sensör verileri** (sıcaklık, hız, tork, aşınma)
- **Tahmin sonuçları** (arıza/normal, olasılık)
- **Analiz süreleri** ve **blockchain durumu**
- **Zaman damgaları** ve **makine bilgileri**

### 📊 Database Yapısı

```sql
CREATE TABLE sensor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id INTEGER,
    timestamp INTEGER NOT NULL,
    air_temp REAL NOT NULL,
    process_temp REAL NOT NULL,
    rotation_speed INTEGER NOT NULL,
    torque REAL NOT NULL,
    tool_wear INTEGER NOT NULL,
    machine_type TEXT NOT NULL DEFAULT 'M',
    prediction INTEGER,
    prediction_probability REAL,
    prediction_reason TEXT,
    analysis_time REAL,
    blockchain_success BOOLEAN DEFAULT 0,
    blockchain_tx_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## 🚀 Kullanım

### 1. Ana PDM Sistemini Çalıştırma

```bash
python pdm_main.py
```

- **GUI açılır**
- **Sensör değerlerini girin**
- **"Arıza Tahmin Et"** butonuna tıklayın
- **Veriler otomatik olarak database'e kaydedilir**

### 2. Database Viewer ile Kayıtları Görüntüleme

```bash
python database_viewer.py
```

**Database Viewer Özellikleri:**
- 📋 **Tüm kayıtları tablo halinde görüntüleme**
- 🔄 **Otomatik yenileme**
- 📈 **İstatistikler** (toplam kayıt, arıza dağılımı)
- 🔍 **Arıza kayıtları arama**
- 📋 **Detaylı kayıt görüntüleme** (çift tıklama)
- 🎨 **Renk kodlama** (arıza=kırmızı, normal=yeşil)

### 3. Programatik Erişim

```python
from database_manager import PdMDatabaseManager

# Database manager oluştur
db = PdMDatabaseManager()

# Son 10 kaydı getir
records = db.get_sensor_data(limit=10)

# Specific kayıt getir
record = db.get_sensor_data(record_id=1)

# İstatistikleri getir
stats = db.get_statistics()

# Arıza kayıtlarını ara
failures = db.search_by_prediction(1, limit=50)
```

### 4. Manuel Kayıt Ekleme

```python
# Test verisi
sensor_data = {
    'air_temp': 298.5,
    'process_temp': 308.2,
    'rotation_speed': 1500,
    'torque': 42.3,
    'tool_wear': 180,
    'machine_type': 'M',
    'prediction': 1,
    'prediction_probability': 0.85,
    'prediction_reason': 'LSTM-CNN Model',
    'analysis_time': 2.45,
    'blockchain_success': True,
    'blockchain_tx_hash': '0x1234567890abcdef'
}

# Kaydet
record_id = db.save_sensor_data(sensor_data)
```

## 📊 Mevcut Kayıtları Kontrol Etme

```bash
python check_records.py
```

Bu script:
- **Toplam kayıt sayısını** gösterir
- **Son kayıtları** listeler
- **İstatistikleri** (arıza dağılımı, makine tipleri) gösterir

## 🔧 Database Dosyası

- **Konum:** `PdMDatabase/PdMDatabase`
- **Format:** SQLite3
- **Boyut:** Dinamik (kayıt sayısına göre büyür)
- **Backup:** Manuel olarak kopyalayabilirsiniz

## 📈 İstatistik Örnekleri

```
📈 İstatistikler:
   📝 Toplam: 25
   🎯 Tahminler: {0: 18, 1: 7}  # 18 normal, 7 arıza
   🔧 Makineler: {'M': 15, 'L': 6, 'H': 4}
```

## 🔍 Filtreleme ve Sorgulama

**Database Viewer'da:**
- **Kayıt sayısı limiti** (10-1000)
- **Tahmin filtresi** (Tümü/Normal/Arıza)
- **Makine tipi filtresi** (Tümü/L/M/H)

## 🚨 Önemli Notlar

1. **Otomatik Kayıt:** Her arıza tahmini otomatik kaydedilir
2. **Blockchain Entegrasyonu:** Blockchain başarı durumu da kaydedilir
3. **Performans:** SQLite hızlı ve hafiftir
4. **Backup:** Önemli veriler için düzenli backup alın
5. **Güvenlik:** Database dosyası yerel makinede saklanır

## 🎯 Gelecek Özellikler

- [ ] **CSV Export** özelliği
- [ ] **Advanced filtreleme** (tarih aralığı, sensör değerleri)
- [ ] **Grafik görselleştirme** (zaman serisi)
- [ ] **Otomatik backup** sistemi
- [ ] **Database şifreleme**

## ✅ Test Senaryosu

1. **PDM GUI'yi açın** (`python pdm_main.py`)
2. **Test verileri girin:**
   - Hava Sıcaklığı: 298.5
   - İşlem Sıcaklığı: 308.2
   - Dönüş Hızı: 1500
   - Tork: 42.3
   - Aşınma: 180
   - Makine Tipi: M
3. **"Arıza Tahmin Et"** butonuna tıklayın
4. **Database Viewer'ı açın** (`python database_viewer.py`)
5. **Yeni kaydı görün** ve **detaylarını inceleyin**

---

## 🎊 Sonuç

**PdM sisteminiz artık tam entegre database desteği ile çalışıyor!** 

- ✅ **Otomatik veri kaydetme**
- ✅ **Görsel database yönetimi**  
- ✅ **İstatistik ve analiz**
- ✅ **Programatik erişim**
- ✅ **Blockchain entegrasyonu**

**Tüm arıza tahminleriniz güvenle saklanıyor ve kolayca erişilebilir!** 🚀
