# 🔧 Blockchain-Integrated Predictive Maintenance System

Zero-Knowledge Proof destekli Akıllı Bakım sistemi. GRU-CNN modeli ile arıza tahmini yaparak sonuçları Ganache blockchain'inde saklayan sistem.

## 🎯 Proje Özellikleri

- **🤖 GRU-CNN Model:** %95+ accuracy ile arıza tahmini
- **⛓️ Blockchain Integration:** Ganache ile gerçek zamanlı transaction kayıtları  
- **🔐 Zero-Knowledge Proof:** Groth16 protokolü ile verification
- **🖥️ GUI Interface:** Tkinter tabanlı kullanıcı dostu arayüz
- **📊 Real-time Analytics:** Anlık sistem istatistikleri

## 🛠️ Sistem Gereksinimleri

### Yazılım
- **Python 3.11+**
- **Node.js 18+**
- **NPM 8+**
- **Ganache 2.7+**

### Python Paketleri
```bash
pip install tensorflow keras numpy pandas scikit-learn web3 eth-account mnemonic
```

### Node.js Paketleri
```bash
npm install hardhat @nomicfoundation/hardhat-toolbox
```

## 🚀 Kurulum ve Çalıştırma

### 1. Repository Clone
```bash
git clone <repository-url>
cd pdm
```

### 2. Python Environment
```bash
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

### 3. Node.js Setup
```bash
npm install
```

### 4. Ganache Başlatma
- Ganache GUI'yi başlatın
- Network: `http://127.0.0.1:7545`
- Chain ID: `1337`
- Mnemonic: `sport lab boring coffee stumble south identify jump soul stumble poverty armor`

### 5. Contract Deploy
```bash
npx hardhat compile
npx hardhat run scripts/deploy.js --network ganache
```

### 6. Sistem Başlatma
```bash
python pdm_main.py
```

## 📁 Proje Yapısı

```
pdm/
├── bc/                          # Blockchain entegrasyon modülü
│   ├── __init__.py
│   ├── blockchain_integration.py
│   └── circuits/               # ZK-SNARK circuit dosyaları
├── contracts/                  # Solidity contract'ları
│   ├── PdMSystem.sol
│   └── PDMVerifier.sol
├── test/                       # Contract test dosyaları
│   └── PDMSystem.test.js
├── ignition/modules/           # Hardhat deployment
├── pdm_main.py                 # Ana GUI uygulaması
├── hardhat.config.js           # Hardhat konfigürasyonu
├── package.json                # Node.js dependencies
└── README.md                   # Bu dosya
```

## 🔗 Blockchain Entegrasyonu

### Contract Adresleri (Ganache)
- **PdMSystem:** `0x3099510854Dd3165bdD07bea8410a7Bc0CcfD3fA`
- **Groth16Verifier:** `0x98EA576277EBA3F203C61D194E6659B5C4b15377`

### Transaction Flow
1. **Prediction:** GRU-CNN modeli arıza tahmini yapar
2. **Hash:** Prediction data SHA3 ile hash'lenir  
3. **Transaction:** submitSensorData() contract'a gönderilir
4. **Confirmation:** Ganache'de transaction confirm edilir
5. **Storage:** Blockchain'de kalıcı olarak saklanır

## 🧪 Test Etme

### Contract Testleri
```bash
npx hardhat test --network ganache
```

### Blockchain Entegrasyon
```bash
python -c "from bc.blockchain_integration import *; print('✅ Integration OK')"
```

## 📊 Model Performansı

- **Accuracy:** %95.5 (0.5 threshold)
- **Optimal Accuracy:** %96.5 (0.802 threshold)
- **AUC-ROC:** %95.8
- **Training Time:** 25.77 dakika (5-fold CV)

## 🔐 Güvenlik

- Private key'ler environment variable olarak saklanır
- Transaction'lar cryptographic signature ile imzalanır
- ZK-Proof ile model doğruluğu kanıtlanır
- Contract access control ile korunur

## 📝 Kullanım

1. **Ganache'i başlatın**
2. **Contract'ları deploy edin**
3. **PDM GUI'yi açın**
4. **Sensör verilerini girin**
5. **Tahmin yaptırın**
6. **Ganache'de transaction'ı görün**

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır.

## 👥 Geliştirici

**SDU - Predictive Maintenance Team**

## 🙏 Teşekkürler

- **Hardhat** - Smart contract development
- **Ganache** - Local blockchain
- **TensorFlow** - Machine learning
- **Web3.py** - Blockchain integration 