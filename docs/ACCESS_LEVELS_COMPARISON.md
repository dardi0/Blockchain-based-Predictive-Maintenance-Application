# PDM Sistemi - Erişim Seviyeleri Karşılaştırması

Bu doküman, PDM sistemindeki 4 ana erişim seviyesini detaylı olarak karşılaştırır ve hangi durumlarda hangi seviyenin kullanılması gerektiğini açıklar.

---

## 📊 **Erişim Seviyeleri Genel Karşılaştırması**

| **Özellik** | **READ_ONLY** | **WRITE_LIMITED** | **FULL_ACCESS** | **ADMIN_ACCESS** |
|-------------|---------------|-------------------|-----------------|------------------|
| **Enum Değeri** | `1` | `2` | `3` | `4` |
| **Seviye** | 🟢 **Düşük** | 🟡 **Orta** | 🟠 **Yüksek** | 🔴 **En Yüksek** |
| **Güvenlik Risk** | ✅ Çok Düşük | ⚠️ Orta | ⚠️ Yüksek | 🔴 Çok Yüksek |
| **Kullanım Sıklığı** | 🔄 Yüksek | 🔄 Çok Yüksek | 🔄 Orta | 🔄 Düşük |

---

## 🔍 **Detaylı Karşılaştırma**

### **1. READ_ONLY (Seviye 1)**

#### **✅ Ne Yapabilir:**
- 📖 Veri okuma (sensor data, predictions)
- 📊 Raporlama ve analiz
- 🔍 Audit log görüntüleme
- 📈 İstatistik sorgulama
- 🖥️ Dashboard görüntüleme

#### **❌ Ne Yapamaz:**
- ✏️ Veri yazma/değiştirme
- 🗑️ Veri silme
- ⚙️ Konfigürasyon değiştirme
- 🔐 İzin verme/iptal etme
- 👥 Kullanıcı yönetimi

#### **🎯 Kullanım Alanları:**
```javascript
// READ_ONLY kullanıcıları için tipik işlemler
await contract.getSensorData(nodeId, startDate, endDate);  // ✅ OK
await contract.getPredictions(nodeId);                     // ✅ OK
await contract.getAuditLogs(nodeId);                       // ✅ OK
await contract.submitSensorData(...);                      // ❌ HATA!
```

#### **👥 Kimler Kullanır:**
- 📊 **Analistler**: Veri analizi yapan kişiler
- 🔍 **Auditörler**: Sistem denetimi yapan kişiler  
- 📈 **Raporlama Uzmanları**: Dashboard ve rapor hazırlayanlar
- 👁️ **İzleyiciler**: Sistem durumunu takip edenler

---

### **2. WRITE_LIMITED (Seviye 2)**

#### **✅ Ne Yapabilir:**
- 📖 Tüm READ_ONLY işlemler
- ✏️ Belirli kaynaklara yazma (node tipine göre)
- 🔄 ZK proof oluşturma ve gönderme
- 📝 Operasyonel veri girişi
- 🔧 Sınırlı konfigürasyon güncellemeleri

#### **❌ Ne Yapamaz:**
- 🗑️ Kritik veri silme
- 👥 Kullanıcı yönetimi
- 🔐 İzin verme/iptal etme
- ⚙️ Sistem geneli ayarlar
- 🚫 Acil durum müdahaleleri

#### **🎯 Kullanım Alanları:**
```javascript
// WRITE_LIMITED kullanıcıları için tipik işlemler
await contract.getSensorData(nodeId);                      // ✅ OK
await contract.submitSensorDataProof(proof, publicInputs); // ✅ OK (DATA_PROCESSOR)
await contract.submitPredictionProof(proof, publicInputs); // ✅ OK (FAILURE_ANALYZER)
await contract.registerNode(...);                          // ❌ HATA!
```

#### **👥 Kimler Kullanır:**
- 👷 **Operatörler**: Sensör verisi toplayanlar
- 👨‍🔧 **Mühendisler**: ML model çalıştıranlar
- 🔧 **Teknisyenler**: Bakım verisi girenler
- 📊 **Veri Analistleri**: Tahmin sonuçları üretenler

---

### **3. FULL_ACCESS (Seviye 3)**

#### **✅ Ne Yapabilir:**
- 📖 Tüm READ_ONLY işlemler
- ✏️ Tüm WRITE_LIMITED işlemler
- 🗑️ Veri silme (kendi alanında)
- ⚙️ Konfigürasyon yönetimi
- 🔄 Sistem parametreleri güncelleme
- 📝 Kapsamlı veri yönetimi

#### **❌ Ne Yapamaz:**
- 👥 Kullanıcı yönetimi (rol verme/iptal)
- 🔐 Sistem geneli güvenlik ayarları
- 🚫 Acil durum müdahaleleri
- 🏗️ Sistem mimarisi değişiklikleri

#### **🎯 Kullanım Alanları:**
```javascript
// FULL_ACCESS kullanıcıları için tipik işlemler
await contract.submitSensorDataProof(...);                 // ✅ OK
await contract.updateNodeConfig(nodeId, newConfig);        // ✅ OK
await contract.deleteOldData(nodeId, beforeDate);          // ✅ OK
await contract.grantRole(role, user);                      // ❌ HATA!
```

#### **👥 Kimler Kullanır:**
- 👨‍💼 **Departman Yöneticileri**: Kendi alanında tam yetki
- 🔧 **Sistem Uzmanları**: Teknik konfigürasyon yapanlar
- 📊 **Veri Yöneticileri**: Büyük veri setlerini yönetenler
- ⚙️ **Konfigürasyon Uzmanları**: Sistem ayarlarını yapanlar

---

### **4. ADMIN_ACCESS (Seviye 4)**

#### **✅ Ne Yapabilir:**
- 📖 Tüm READ_ONLY işlemler
- ✏️ Tüm WRITE_LIMITED işlemler
- 🗑️ Tüm FULL_ACCESS işlemler
- 👥 Kullanıcı yönetimi (node kayıt, güncelleme)
- 🔐 İzin verme/iptal etme
- ⚙️ Sistem geneli ayarlar
- 🚫 Acil durum müdahaleleri
- 🔍 Güvenlik ihlali raporlama

#### **❌ Ne Yapamaz:**
- 🏗️ Contract kodunu değiştirme
- 💰 Gas limitlerini değiştirme
- 🌐 Blockchain ağını değiştirme

#### **🎯 Kullanım Alanları:**
```javascript
// ADMIN_ACCESS kullanıcıları için tipik işlemler
await contract.registerNode(name, addr, type, level, ...); // ✅ OK
await contract.approveAccessRequest(requestId);            // ✅ OK
await contract.blacklistNode(nodeId, reason);             // ✅ OK
await contract.updateSystemSettings(duration, maxNodes);   // ✅ OK
```

#### **👥 Kimler Kullanır:**
- 👨‍💼 **Sistem Yöneticileri**: Tüm sistemi yönetenler
- 🔐 **Güvenlik Yöneticileri**: Güvenlik politikalarını belirleyenler
- 🏗️ **IT Yöneticileri**: Sistem mimarisini yönetenler
- 🚨 **Acil Müdahale Ekipleri**: Kritik durumlarda müdahale edenler

---

## 🎯 **Pratik Kullanım Senaryoları**

### **Senaryo 1: Fabrika Operatörü**
```javascript
// Operatör sadece sensör verisi gönderebilir
const operatorAccess = AccessLevel.WRITE_LIMITED;  // Seviye 2

// ✅ Yapabilecekleri:
await contract.submitSensorDataProof(machineId, proof, inputs);

// ❌ Yapamayacakları:
await contract.registerNode(...);        // ADMIN_ACCESS gerekli
await contract.approveAccessRequest(...); // ADMIN_ACCESS gerekli
```

### **Senaryo 2: ML Engineer**
```javascript
// Engineer hem sensör verisi okuyabilir hem prediction gönderebilir
const engineerAccess = AccessLevel.WRITE_LIMITED;  // Seviye 2

// ✅ Yapabilecekleri:
await contract.getSensorData(nodeId);              // READ_ONLY işlem
await contract.submitPredictionProof(proof, inputs); // WRITE_LIMITED işlem

// ❌ Yapamayacakları:
await contract.blacklistNode(...);      // ADMIN_ACCESS gerekli
await contract.updateSystemSettings(...); // ADMIN_ACCESS gerekli
```

### **Senaryo 3: Sistem Yöneticisi**
```javascript
// Yönetici her şeyi yapabilir
const adminAccess = AccessLevel.ADMIN_ACCESS;  // Seviye 4

// ✅ Yapabilecekleri:
await contract.registerNode(...);              // ✅ OK
await contract.approveAccessRequest(...);      // ✅ OK
await contract.blacklistNode(...);            // ✅ OK
await contract.getSensorData(...);             // ✅ OK
await contract.submitSensorDataProof(...);     // ✅ OK
```

### **Senaryo 4: Audit Uzmanı**
```javascript
// Audit uzmanı sadece okuyabilir
const auditAccess = AccessLevel.READ_ONLY;  // Seviye 1

// ✅ Yapabilecekleri:
await contract.getAuditLogs(nodeId);        // ✅ OK
await contract.getSensorData(nodeId);       // ✅ OK
await contract.getPredictions(nodeId);      // ✅ OK

// ❌ Yapamayacakları:
await contract.submitSensorDataProof(...);  // WRITE_LIMITED gerekli
await contract.registerNode(...);           // ADMIN_ACCESS gerekli
```

---

## 🔒 **Güvenlik Karşılaştırması**

### **Risk Seviyeleri**

| **Erişim Seviyesi** | **Risk Seviyesi** | **Potansiyel Zarar** | **Kontrol Mekanizmaları** |
|---------------------|-------------------|---------------------|---------------------------|
| **READ_ONLY** | 🟢 **Çok Düşük** | Bilgi sızıntısı | • IP kısıtlaması<br/>• Zaman sınırı<br/>• Audit log |
| **WRITE_LIMITED** | 🟡 **Orta** | Yanlış veri girişi | • Node tipi kontrolü<br/>• ZK proof doğrulama<br/>• Rate limiting |
| **FULL_ACCESS** | 🟠 **Yüksek** | Sistem bozulması | • Çoklu onay<br/>• Backup mekanizması<br/>• Rollback sistemi |
| **ADMIN_ACCESS** | 🔴 **Çok Yüksek** | Tam sistem ele geçirme | • Multi-signature<br/>• Time-lock<br/>• Emergency pause |

### **Kontrol Mekanizmaları**

#### **READ_ONLY için:**
```solidity
modifier onlyReadAccess() {
    require(node.accessLevel >= AccessLevel.READ_ONLY, "Insufficient access");
    require(!node.isBlacklisted, "Node is blacklisted");
    require(node.status == NodeStatus.ACTIVE, "Node is not active");
    _;
}
```

#### **WRITE_LIMITED için:**
```solidity
modifier onlyWriteAccess(bytes32 resource) {
    require(node.accessLevel >= AccessLevel.WRITE_LIMITED, "Insufficient access");
    require(nodePermissions[nodeId][resource], "No permission for resource");
    require(!node.isBlacklisted, "Node is blacklisted");
    _;
}
```

#### **ADMIN_ACCESS için:**
```solidity
modifier onlyAdminAccess() {
    require(node.accessLevel >= AccessLevel.ADMIN_ACCESS, "Admin access required");
    require(hasRole[node.owner][MANAGER_ROLE], "Admin role required");
    require(!node.isBlacklisted, "Node is blacklisted");
    _;
}
```

---

## 📈 **Performans Karşılaştırması**

| **Erişim Seviyesi** | **Gas Maliyeti** | **İşlem Hızı** | **Doğrulama Süresi** |
|---------------------|------------------|----------------|---------------------|
| **READ_ONLY** | 💰 Çok Düşük | ⚡ Çok Hızlı | 🔍 Minimal |
| **WRITE_LIMITED** | 💰 Düşük | ⚡ Hızlı | 🔍 ZK Proof gerekli |
| **FULL_ACCESS** | 💰 Orta | ⚡ Orta | 🔍 Kapsamlı kontrol |
| **ADMIN_ACCESS** | 💰 Yüksek | ⚡ Yavaş | 🔍 Çoklu doğrulama |

---

## 🎯 **Hangi Seviyeyi Ne Zaman Kullanmalı?**

### **READ_ONLY Kullan:**
- ✅ Sadece veri görüntüleme gerekiyorsa
- ✅ Raporlama ve analiz yapılıyorsa
- ✅ Audit ve denetim işlemleri için
- ✅ Dashboard ve monitoring için

### **WRITE_LIMITED Kullan:**
- ✅ Normal operasyonel işlemler için
- ✅ Sensör verisi toplama için
- ✅ ML prediction gönderme için
- ✅ Günlük iş akışları için

### **FULL_ACCESS Kullan:**
- ✅ Departman düzeyinde yönetim için
- ✅ Kapsamlı veri yönetimi için
- ✅ Konfigürasyon değişiklikleri için
- ✅ Sistem optimizasyonu için

### **ADMIN_ACCESS Kullan:**
- ✅ Sistem geneli yönetim için
- ✅ Kullanıcı yönetimi için
- ✅ Güvenlik politikaları için
- ✅ Acil durum müdahaleleri için

---

## 🔄 **Seviye Geçişleri**

### **Nasıl Yükseltilir:**
```javascript
// 1. Erişim isteği oluştur
const requestId = await contract.requestAccess(
    nodeId,
    targetResource,
    AccessLevel.FULL_ACCESS,
    duration,
    "Department management needs"
);

// 2. Admin onayı bekle
// (Admin tarafından approveAccessRequest çağrılır)

// 3. Otomatik güncelleme
// accessLevel otomatik olarak güncellenir
```

### **Nasıl Düşürülür:**
```javascript
// Sadece ADMIN_ACCESS ile yapılabilir
await contract.updateNode(
    nodeId,
    nodeName,
    nodeType,
    AccessLevel.READ_ONLY,  // Düşürüldü
    metadata
);
```

---

## 📊 **Özet Tablo**

| **Kriter** | **READ_ONLY** | **WRITE_LIMITED** | **FULL_ACCESS** | **ADMIN_ACCESS** |
|------------|---------------|-------------------|-----------------|------------------|
| **Kullanım** | 📊 Analiz, Audit | 👷 Operasyonel | 👨‍💼 Yönetim | 🔐 Sistem Admin |
| **Güvenlik** | 🟢 Düşük Risk | 🟡 Orta Risk | 🟠 Yüksek Risk | 🔴 En Yüksek Risk |
| **Esneklik** | 🔒 Sınırlı | ⚙️ Orta | 🔧 Yüksek | 🚀 Tam |
| **Sorumluluk** | 👁️ İzleme | 🔄 İşletme | 📋 Yönetme | 🏗️ Sistem Yönetimi |
| **Gas Maliyeti** | 💰 Çok Düşük | 💰 Düşük | 💰 Orta | 💰 Yüksek |

Bu karşılaştırma, PDM sisteminde hangi erişim seviyesinin ne zaman kullanılması gerektiğini net bir şekilde gösterir! 🚀
