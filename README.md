# 🏭 Hybrid Blockchain-Based Predictive Maintenance System

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/)
[![Solidity](https://img.shields.io/badge/solidity-0.8.26-orange.svg)](https://soliditylang.org/)
[![zkSync Era](https://img.shields.io/badge/zkSync-Era-purple.svg)](https://zksync.io/)

## 📋 İçindekiler / Table of Contents

- [Türkçe](#türkçe)
  - [Proje Hakkında](#-proje-hakkında)
  - [Özellikler](#-özellikler)
  - [Teknoloji Stack](#-teknoloji-stack)
  - [Kurulum](#-kurulum)
  - [Kullanım](#-kullanım)
  - [Sistem Mimarisi](#-sistem-mimarisi)
- [English](#english)
  - [About](#-about)
  - [Features](#-features-1)
  - [Installation](#-installation-1)
  - [Usage](#-usage-1)

---

## Türkçe

### 🎯 Proje Hakkında

Bu proje, **Blockchain** tabanlı bir **Tahmine Dayalı Bakım (Predictive Maintenance - PDM)** sistemidir. Makine arızalarını LSTM-CNN modeli ile tahmin etmekte ve Zero-Knowledge (ZK) kanıtları kullanarak blockchain üzerinde şeffaf ve doğrulanabilir şekilde saklamaktadır.

**Ana Hedef:** Endüstriyel makinelerin arızalarını önceden tespit ederek bakım maliyetlerini düşürmek ve üretim verimliliğini artırmaktadır.

### ✨ Özellikler

#### 🔗 Blockchain Entegrasyonu
- **zkSync Era** Layer 2 çözümü
- Smart contracts ile merkezi olmayan veri saklama
- **Access Control Registry** ile rol tabanlı erişim kontrolü
- Gerçek zamanlı blockchain istatistikleri ve izleme

#### 🤖 Makine Öğrenmesi
- **LSTM-CNN Hybrid Model** ile arıza tahmini
- Recall_focused ve F1-Skoru optimizasyonları ile yüksek doğruluk
- 5 farklı sensör verisi analizi (Temperature, Torque, Speed, vb.)
- ROC-AUC: 0.979, F1-Score: 0.7937

#### 🔐 Zero-Knowledge Proofs
- **Circom** ile ZK-SNARK devreleri
- Poseidon hash fonksiyonu ile veri bütünlüğü
- Üç tip ZK kanıtı:
  - Sensör veri kanıtı
  - Tahmin kanıtı
  - Bakım kanıtı
- Groth16 proof sistemi

#### 💾 Hibrit Depolama
- **Local SQLite Database**: Hızlı erişim ve offline çalışma
- **Blockchain Storage**: Kalıcı ve değiştirilemez kayıtlar
- Otomatik senkronizasyon
- Veri bütünlüğü doğrulaması

#### 🖥️ Kullanıcı Arayüzü
- Tkinter tabanlı modern GUI
- Gerçek zamanlı tahmin ve izleme
- Blockchain transaction takibi
- Detaylı sistem raporları ve istatistikler

### 🛠️ Teknoloji Stack

#### Backend
- **Python 3.11+**
  - TensorFlow/Keras (LSTM-CNN model)
  - Web3.py (Blockchain entegrasyonu)
  - Pandas, NumPy, Scikit-learn
  - Tkinter (GUI)

#### Blockchain
- **zkSync Era Sepolia Testnet**
- **Solidity 0.8.26**
- **Hardhat** (Development framework)
- **OpenZeppelin** Contracts

#### Zero-Knowledge
- **Circom 2.2.2** (Circuit compiler)
- **snarkjs** (Proof generation)
- **circomlibjs** (Poseidon hash)

#### Smart Contracts
- `PdMSystemHybrid.sol` - Ana sistem kontratı
- `AccessControlRegistry.sol` - Erişim kontrol sistemi
- `UnifiedGroth16Verifier.sol` - ZK proof doğrulayıcı
- `SensorDataVerifier.sol` - Sensör veri doğrulayıcı

#### GUI Kullanımı

1. **Sistem Başlatma**: Uygulama açıldığında blockchain bağlantısı otomatik kontrol edilir
2. **Veri Girişi**: Sensör değerlerini girin (Temperature, Torque, Speed, vb.)
3. **Tahmin**: "Predict" butonuna tıklayın
4. **Blockchain**: "Send to Blockchain" ile tahminleri zkSync Era'ya gönderin
5. **İstatistikler**: "Blockchain Stats" ile sistem durumunu görüntüleyin

### 📊 Sistem Mimarisi

```
┌─────────────────┐
│   GUI (Tkinter) │
└────────┬────────┘
         │
┌────────▼────────────────────────┐
│  Python Backend                 │
│  ├─ LSTM-CNN Model              │
│  ├─ Hybrid Storage Manager      │
│  ├─ ZK Proof Generator          │
│  └─ Blockchain Handler          │
└────────┬────────────────────────┘
         │
┌────────▼────────────────────────┐
│  Hybrid Storage                 │
│  ├─ SQLite (Local)              │
│  └─ zkSync Era (Blockchain)     │
└────────┬────────────────────────┘
         │
┌────────▼────────────────────────┐
│  Smart Contracts (zkSync Era)   │
│  ├─ PdMSystemHybrid             │
│  ├─ AccessControlRegistry       │
│  └─ UnifiedGroth16Verifier      │
└─────────────────────────────────┘
```

### 📁 Proje Yapısı

```
pdm_bc/
├── contracts/              # Smart contracts
│   ├── PdMSystemHybrid.sol
│   ├── AccessControlRegistry.sol
│   └── UnifiedGroth16Verifier.sol
├── circuits/               # ZK circuits
│   └── hybrid/
│       ├── sensor_data_proof.circom
│       ├── prediction_proof.circom
│       └── maintenance_proof.circom
├── scripts/                # Deployment scripts
├── docs/                   # Dokümantasyon
├── config.py               # Sistem konfigürasyonu
├── pdm_main.py            # Ana uygulama
├── run_gui_only.py        # GUI-only mode
├── blockchain_client/      # Blockchain işlemleri (Gas, Nonce, Handler, DB Adapter).
├── database/               # Veritabanı yönetimi (Models, Connection, Manager).
├── hybrid_blockchain_handler_deprecated.py # (Eski) Monolitik blockchain yönetimi (referans için).
├── database_manager_deprecated.py # (Eski) Monolitik veritabanı yönetimi (referans için).
├── training_utils.py
├── reporting.py
├── hardhat.config.js
├── requirements.txt
└── README.md
```

### 🔑 Smart Contract Adresleri

**zkSync Era Sepolia Testnet:**

- **AccessControlRegistry**: `0x8EdBc23E8A41e1d76A71095F6C590252F0C672f2`
- **PdMSystemHybrid**: `0x5Bc1c60FE3C5d8C0260AE13ed73a626A9836e601`
- **UnifiedGroth16Verifier**: `0x2F06844902438CaFCd82eBFc98aDc2F11bb6503f`

### 📈 Performans Metrikleri

| Metrik | Değer |
|--------|-------|
| **Doğruluk (Accuracy)** | 0.9870 |
| **ROC-AUC Skoru** | 0.979 |
| **F1-Score** | 0.7937 |
| **Precision** | 0.8621 |
| **Recall** | 0.7353 |
| **İşlem Süresi** | 3-5 saniye |

### 🔒 Güvenlik

- Private key'ler asla commit edilmez (`.env` dosyası)
- Access Control Registry ile rol tabanlı erişim
- ZK proofs ile veri gizliliği
- Reentrancy guard ile akıllı kontrat güvenliği
- Pausable pattern ile acil durdurma mekanizması

## English

### 🎯 About

A **Hybrid Blockchain-based Predictive Maintenance (PDM)** system that predicts machine failures using LSTM-CNN models and stores results on blockchain with Zero-Knowledge proofs for transparency and verifiability.

**Main Goal:** Predict industrial machine failures in advance to reduce maintenance costs and increase production efficiency.

### ✨ Features

- **zkSync Era** Layer 2 
- **LSTM-CNN Hybrid Model** for failure prediction
- **Zero-Knowledge Proofs** with Circom and snarkjs
- **Hybrid Storage**: Local SQLite + Blockchain
- **Access Control Registry** for role-based permissions
- Modern **Tkinter GUI** with real-time monitoring

### 📊 Performance Metrics

- **Accuracy**: 0,9870
- **ROC-AUC**: 0.979
- **F1-Score**: 0.7353
- **Transaction Time**: 3-5 seconds

---



