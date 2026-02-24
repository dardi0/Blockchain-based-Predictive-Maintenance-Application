# PDM Sistemi - Sistem Mimarisi Diagramı

Bu doküman, PDM sisteminin tüm bileşenlerini ve aralarındaki ana etkileşimleri gösteren üst seviye sistem mimarisi diagramını içerir.

---

## 🏗️ **Sistem Mimarisi Genel Bakış**

```mermaid
graph TB
    %% Kullanıcı Katmanı
    subgraph "👥 KULLANICI KATMANI"
        Admin[👨‍💼 Yönetici<br/>Admin Wallet<br/>0xAdmin...]
        OperatorOwner[👷 Operatör Sahibi<br/>Operator Wallet<br/>0xOperator...]
        EngineerOwner[👨‍🔧 Mühendis Sahibi<br/>Engineer Wallet<br/>0xEngineer...]
    end

    %% Off-Chain Dünya
    subgraph "💻 OFF-CHAIN DÜNYA"
        subgraph "🖥️ Node Katmanı"
            OperatorNode[👷 Operatör Düğümü<br/>DATA_PROCESSOR<br/>Sensor Data Collection]
            EngineerNode[👨‍🔧 Mühendis Düğümü<br/>FAILURE_ANALYZER<br/>ML Model Training]
        end
        
        subgraph "💾 Veri Katmanı"
            LocalDB[(🗄️ Yerel Veritabanı<br/>SQLite<br/>Raw Sensor Data<br/>ML Models<br/>Predictions)]
        end
        
        subgraph "🔧 İşlem Katmanı"
            ZKGenerator[🔒 ZK Proof Generator<br/>Circom Circuits<br/>Groth16 Proofs<br/>Poseidon Hash]
            MLProcessor[🤖 ML Processor<br/>LSTM-CNN Model<br/>Failure Prediction<br/>Model Training]
        end
    end

    %% On-Chain Dünya
    subgraph "⛓️ ON-CHAIN DÜNYA (zkSync Era)"
        subgraph "🔐 Erişim Kontrolü"
            AccessControl[🔐 AccessControlRegistry<br/>Node Management<br/>Role-Based Access<br/>Permission Control]
        end
        
        subgraph "📊 Ana Sistem"
            PdMSystem[📊 PdMSystemHybrid<br/>Sensor Data Proofs<br/>Prediction Proofs<br/>Hybrid Storage]
        end
        
        subgraph "✓ Doğrulama"
            ZKVerifier[✓ UnifiedGroth16Verifier<br/>ZK-SNARK Verification<br/>Circuit Type 0: Sensor<br/>Circuit Type 1: Prediction]
        end
    end

    %% Blockchain Altyapısı
    subgraph "🌐 BLOCKCHAIN ALTYAPISI"
        zkSync[⛓️ zkSync Era<br/>Layer 2 Scaling<br/>Low Gas Costs<br/>Fast Transactions]
    end

    %% Ana Veri Akışları
    %% Kullanıcı -> Node
    Admin -.->|"Node Registration<br/>Role Management"| AccessControl
    OperatorOwner -.->|"Operate Node<br/>Submit Data"| OperatorNode
    EngineerOwner -.->|"Operate Node<br/>Submit Predictions"| EngineerNode

    %% Off-Chain İçi Akışlar
    OperatorNode -->|"Store Raw Data<br/>Generate Hash"| LocalDB
    EngineerNode -->|"Store Predictions<br/>Store Models"| LocalDB
    EngineerNode -->|"Query Sensor Data<br/>For Analysis"| LocalDB
    
    OperatorNode -->|"Generate ZK Proof<br/>Groth16"| ZKGenerator
    EngineerNode -->|"Generate ZK Proof<br/>Groth16"| ZKGenerator
    EngineerNode -->|"Train Model<br/>Make Predictions"| MLProcessor
    
    ZKGenerator -->|"Circuit Files<br/>WASM, ZKEY"| LocalDB

    %% Off-Chain -> On-Chain
    OperatorNode -->|"submitSensorDataProof()<br/>ZK Proof + Metadata"| PdMSystem
    EngineerNode -->|"submitPredictionProof()<br/>ZK Proof + Metadata"| PdMSystem

    %% On-Chain İçi Akışlar
    PdMSystem -->|"checkAccess()<br/>Permission Control"| AccessControl
    PdMSystem -->|"verifySensorDataProof()<br/>Mathematical Verification"| ZKVerifier
    PdMSystem -->|"verifyPredictionProof()<br/>Mathematical Verification"| ZKVerifier

    %% Blockchain Bağlantıları
    AccessControl -->|"NodeRegistered Event<br/>RoleGranted Event"| zkSync
    PdMSystem -->|"SensorDataProofSubmitted Event<br/>PredictionProofSubmitted Event"| zkSync
    ZKVerifier -->|"ProofVerified Event"| zkSync

    %% Geri Bildirim Akışları
    zkSync -.->|"Transaction Confirmation<br/>Event Logs"| AccessControl
    zkSync -.->|"Transaction Confirmation<br/>Event Logs"| PdMSystem
    zkSync -.->|"Transaction Confirmation<br/>Event Logs"| ZKVerifier

    PdMSystem -.->|"Proof ID<br/>Success Status"| OperatorNode
    PdMSystem -.->|"Proof ID<br/>Success Status"| EngineerNode

    %% Stil Tanımlamaları
    classDef userClass fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#000
    classDef offchainClass fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#000
    classDef onchainClass fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px,color:#000
    classDef blockchainClass fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#000

    class Admin,OperatorOwner,EngineerOwner userClass
    class OperatorNode,EngineerNode,LocalDB,ZKGenerator,MLProcessor offchainClass
    class AccessControl,PdMSystem,ZKVerifier onchainClass
    class zkSync blockchainClass
```

---
