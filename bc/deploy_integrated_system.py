#!/usr/bin/env python3
"""
Integrated PDM System Deployment Script
=======================================

Bu script aşağıdaki kontratları sırasıyla deploy eder:
1. UniversalFailureVerifier (Arıza kanıt yönetimi)
2. PdMSystemIntegrated (Ana PDM sistemi)

Holesky testnet için optimize edilmiştir.
"""

import json
import time
import os
from datetime import datetime
from pathlib import Path

def log_step(step, message):
    print(f"\n🔹 {step}: {message}")

def log_success(message):
    print(f"✅ {message}")

def log_error(message):
    print(f"❌ {message}")

def log_info(message):
    print(f"ℹ️ {message}")

class IntegratedSystemDeployment:
    def __init__(self):
        self.network = "holesky"
        self.deployer_address = "0xE8a00a012E2dd82031ca72020fE0A9e50691488F"
        self.deployment_info = {
            "timestamp": datetime.now().isoformat(),
            "network": self.network,
            "deployer": self.deployer_address,
            "contracts": {}
        }
        
    def create_hardhat_deploy_script(self):
        """Hardhat deployment script oluştur"""
        
        deploy_script = '''
const { ethers } = require("hardhat");

async function main() {
    console.log("\\n🚀 Integrated PDM System Deployment Starting...");
    
    const [deployer] = await ethers.getSigners();
    console.log("👤 Deploying with account:", deployer.address);
    console.log("💰 Account balance:", (await deployer.getBalance()).toString());

    // 1. UniversalFailureVerifier Deploy
    console.log("\\n📋 Deploying UniversalFailureVerifier...");
    const UniversalFailureVerifier = await ethers.getContractFactory("UniversalFailureVerifier");
    const failureVerifier = await UniversalFailureVerifier.deploy(deployer.address);
    await failureVerifier.deployed();
    console.log("✅ UniversalFailureVerifier deployed to:", failureVerifier.address);

    // 2. PdMSystemIntegrated Deploy  
    console.log("\\n🏭 Deploying PdMSystemIntegrated...");
    const PdMSystemIntegrated = await ethers.getContractFactory("PdMSystemIntegrated");
    const pdmSystem = await PdMSystemIntegrated.deploy(
        failureVerifier.address,
        deployer.address
    );
    await pdmSystem.deployed();
    console.log("✅ PdMSystemIntegrated deployed to:", pdmSystem.address);

    // 3. UniversalFailureVerifier'da roller kur
    console.log("\\n🔧 Setting up roles in UniversalFailureVerifier...");
    await failureVerifier.grantRole(await failureVerifier.MANAGER_ROLE(), deployer.address);
    await failureVerifier.grantRole(await failureVerifier.ENGINEER_ROLE(), deployer.address);
    console.log("✅ Roles configured in UniversalFailureVerifier");

    // 4. PdMSystemIntegrated'da roller kur
    console.log("\\n🔧 Setting up roles in PdMSystemIntegrated...");
    await pdmSystem.grantRole(await pdmSystem.MANAGER_ROLE(), deployer.address);
    await pdmSystem.grantRole(await pdmSystem.ENGINEER_ROLE(), deployer.address);
    await pdmSystem.grantRole(await pdmSystem.WORKER_ROLE(), deployer.address);
    console.log("✅ Roles configured in PdMSystemIntegrated");

    // 5. Test user registration
    console.log("\\n👥 Registering test users...");
    
    // Engineer user
    const engineerAddress = "0x2A7D5D123456789012345678901234567890ABCD";
    await pdmSystem.registerUser(
        engineerAddress,
        await pdmSystem.ENGINEER_ROLE(),
        "Test Engineer",
        "Engineering"
    );
    console.log("✅ Test Engineer registered:", engineerAddress);

    // Worker user  
    const workerAddress = "0x3B8E8E234567890123456789012345678901BCDE";
    await pdmSystem.registerUser(
        workerAddress,
        await pdmSystem.WORKER_ROLE(),
        "Test Worker",
        "Operations"
    );
    console.log("✅ Test Worker registered:", workerAddress);

    // 6. Deployment bilgilerini kaydet
    const deploymentInfo = {
        timestamp: new Date().toISOString(),
        network: "holesky",
        deployer: deployer.address,
        contracts: {
            UniversalFailureVerifier: {
                address: failureVerifier.address,
                description: "Centralized failure proof management for all failure types"
            },
            PdMSystemIntegrated: {
                address: pdmSystem.address,
                description: "Main PDM system integrated with UniversalFailureVerifier"
            }
        },
        testUsers: {
            engineer: engineerAddress,
            worker: workerAddress
        },
        integrationPoints: {
            failureProofSubmission: "UniversalFailureVerifier.submitFailureProof()",
            proofLinking: "PdMSystemIntegrated.linkFailureProof()",
            maintenanceCreation: "Automatic via linkFailureProof()"
        }
    };

    // JSON dosyasına kaydet
    const fs = require('fs');
    fs.writeFileSync(
        'integrated_deployment_info.json', 
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("\\n📊 Deployment Summary:");
    console.log("==========================================");
    console.log("🏭 Network:", "holesky");
    console.log("👤 Deployer:", deployer.address);
    console.log("📋 UniversalFailureVerifier:", failureVerifier.address);
    console.log("🏭 PdMSystemIntegrated:", pdmSystem.address);
    console.log("💾 Config saved to: integrated_deployment_info.json");
    console.log("==========================================");
    
    console.log("\\n🎉 Integrated PDM System Deployment Complete!");
    console.log("🔗 Integration ready for production use!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
'''
        
        script_path = Path("scripts/deploy_integrated.js")
        script_path.parent.mkdir(exist_ok=True)
        
        with open(script_path, 'w') as f:
            f.write(deploy_script)
            
        log_success(f"Hardhat deployment script created: {script_path}")
        return script_path
        
    def create_package_json_update(self):
        """package.json'ı entegre sistem için güncelle"""
        
        package_json = {
            "name": "integrated-pdm-system",
            "version": "2.0.0",
            "description": "Integrated PDM System with UniversalFailureVerifier",
            "scripts": {
                "compile": "npx hardhat compile",
                "deploy:integrated": "npx hardhat run scripts/deploy_integrated.js --network holesky",
                "deploy:local": "npx hardhat run scripts/deploy_integrated.js --network localhost",
                "test": "npx hardhat test",
                "verify:failure": "npx hardhat verify --network holesky",
                "verify:pdm": "npx hardhat verify --network holesky"
            },
            "dependencies": {
                "@openzeppelin/contracts": "^4.9.0",
                "hardhat": "^2.17.0",
                "@nomiclabs/hardhat-ethers": "^2.2.3",
                "ethers": "^5.7.2",
                "@nomiclabs/hardhat-etherscan": "^3.1.7"
            },
            "keywords": [
                "predictive-maintenance",
                "zero-knowledge",
                "blockchain",
                "failure-detection",
                "integrated-system"
            ]
        }
        
        with open("package.json", 'w') as f:
            json.dump(package_json, f, indent=2)
            
        log_success("package.json updated for integrated system")
        
    def create_hardhat_config_update(self):
        """hardhat.config.js'yi güncelle"""
        
        config_content = '''
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();

module.exports = {
    solidity: {
        version: "0.8.19",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    },
    networks: {
        holesky: {
            url: process.env.HOLESKY_RPC_URL || "https://eth-holesky.alchemyapi.io/v2/YOUR_KEY",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 17000,
            gasPrice: "auto",
            gasMultiplier: 1.2
        },
        localhost: {
            url: "http://127.0.0.1:8545",
            chainId: 31337
        }
    },
    etherscan: {
        apiKey: {
            holesky: process.env.ETHERSCAN_API_KEY || ""
        },
        customChains: [
            {
                network: "holesky",
                chainId: 17000,
                urls: {
                    apiURL: "https://api-holesky.etherscan.io/api",
                    browserURL: "https://holesky.etherscan.io"
                }
            }
        ]
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    }
};
'''
        
        with open("hardhat.config.js", 'w') as f:
            f.write(config_content)
            
        log_success("hardhat.config.js updated")
        
    def create_env_template(self):
        """Environment template oluştur"""
        
        env_content = '''# Integrated PDM System Environment Configuration
# ==============================================

# Blockchain Network Configuration
HOLESKY_RPC_URL=https://eth-holesky.alchemyapi.io/v2/YOUR_ALCHEMY_API_KEY
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY

# Private Key (WITHOUT 0x prefix)
PRIVATE_KEY=YOUR_PRIVATE_KEY_HERE

# Contract Addresses (Updated after deployment)
UNIVERSAL_FAILURE_VERIFIER_ADDRESS=
PDM_SYSTEM_INTEGRATED_ADDRESS=

# ZK Circuit Configuration
CIRCOM_BINARY_PATH=./bc/circom/target/release/circom
SNARKJS_PATH=./node_modules/.bin/snarkjs

# AI4I2020 Dataset Configuration  
DATASET_PATH=./ai4i2020_dataset.csv
MODEL_PATH=./models/

# System Configuration
DEFAULT_GAS_LIMIT=3000000
DEFAULT_GAS_PRICE=20000000000
CONFIRMATION_BLOCKS=2

# Role Addresses
ADMIN_ADDRESS=0xE8a00a012E2dd82031ca72020fE0A9e50691488F
MANAGER_ADDRESS=0x2A7D5D123456789012345678901234567890ABCD
ENGINEER_ADDRESS=0x3B8E8E234567890123456789012345678901BCDE
WORKER_ADDRESS=0x4C9F9F345678901234567890123456789012CDEF

# Integration Settings
AUTO_MAINTENANCE_ENABLED=true
CRITICAL_FAILURE_ALERT_WEBHOOK=
HIGH_PRIORITY_ALERT_WEBHOOK=
'''
        
        with open(".env.integrated", 'w') as f:
            f.write(env_content)
            
        log_success(".env.integrated template created")
        
    def create_deployment_guide(self):
        """Deployment guide oluştur"""
        
        guide_content = '''# Integrated PDM System Deployment Guide
========================================

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────┐
│                 Frontend                    │
│              (pdm_main.py)                  │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│           PdMSystemIntegrated               │
│    • User management                        │
│    • Sensor data                           │
│    • Predictions                           │
│    • Maintenance tasks                     │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│         UniversalFailureVerifier            │
│    • Failure proof management              │
│    • ZK proof verification                 │
│    • Statistics & reporting                │
└─────────────────────────────────────────────┘
```

## 📋 Prerequisites

1. **Node.js & NPM**
   ```bash
   node --version  # >= 16.0.0
   npm --version   # >= 8.0.0
   ```

2. **Hardhat Environment**
   ```bash
   npm install --save-dev hardhat
   npm install @openzeppelin/contracts
   ```

3. **Environment Setup**
   ```bash
   cp .env.integrated .env
   # Edit .env with your actual values
   ```

## 🚀 Deployment Steps

### Step 1: Compile Contracts
```bash
npx hardhat compile
```

### Step 2: Deploy to Holesky
```bash
npm run deploy:integrated
```

### Step 3: Verify Contracts (Optional)
```bash
npx hardhat verify --network holesky <UNIVERSAL_FAILURE_VERIFIER_ADDRESS>
npx hardhat verify --network holesky <PDM_SYSTEM_INTEGRATED_ADDRESS> <FAILURE_VERIFIER_ADDRESS> <ADMIN_ADDRESS>
```

### Step 4: Update pdm_main.py Configuration
```python
# In pdm_main.py, update contract addresses
UNIVERSAL_FAILURE_VERIFIER_ADDRESS = "0x..."
PDM_SYSTEM_INTEGRATED_ADDRESS = "0x..."
```

## 🔧 Integration Points

### 1. Failure Proof Submission
```javascript
// UniversalFailureVerifier
await failureVerifier.submitFailureProof(
    failureType,
    machineType, 
    dataCommitment,
    severity,
    confidenceScore,
    zkProof.a,
    zkProof.b,
    zkProof.c,
    publicSignals,
    additionalData
);
```

### 2. Proof Verification
```javascript
// Manager doğrulaması
await failureVerifier.verifyFailureProof(proofId);
```

### 3. Proof Linking
```javascript
// PdMSystemIntegrated
await pdmSystem.linkFailureProof(predictionId, proofId);
```

### 4. Automatic Maintenance
```javascript
// Otomatik olarak oluşur (kritik/yüksek öncelik)
// Task assignment ve completion ayrı fonksiyonlar
```

## 📊 Monitoring & Maintenance

### Contract Statistics
```javascript
// Global stats
const stats = await failureVerifier.getGlobalStatistics();

// Failure type distribution
const twfStats = await failureVerifier.getFailureTypeStats(1); // TWF

// User performance
const userStats = await pdmSystem.getUserStats(userAddress);
```

### Maintenance Dashboard
```python
# pdm_main.py integration
def get_pending_maintenance_tasks():
    return pdm_system.getPendingMaintenanceTasks()

def complete_maintenance_task(task_id, notes):
    return pdm_system.completeMaintenanceTask(task_id, notes)
```

## 🔐 Security Features

1. **Role-Based Access Control (OpenZeppelin)**
   - ADMIN_ROLE: Full system control
   - MANAGER_ROLE: Verification & task assignment
   - ENGINEER_ROLE: Predictions & proofs
   - WORKER_ROLE: Data submission

2. **ZK Proof Verification**
   - Privacy-preserving failure detection
   - Cryptographic proof of sensor data validity

3. **Reentrancy Protection**
   - All state-changing functions protected
   - Safe Ether transfers

4. **Emergency Controls**
   - Pausable functionality
   - Emergency withdrawal
   - User blacklisting

## 📈 Production Considerations

### Gas Optimization
- Batch operations where possible
- Optimize ZK proof sizes
- Use events for off-chain monitoring

### Scalability
- Index events for faster queries
- Consider Layer 2 solutions for high volume
- Implement proper pagination

### Monitoring
- Set up event listeners
- Monitor gas usage
- Track proof verification rates

### Backup & Recovery
- Regular state backups
- Multi-signature admin controls
- Upgrade patterns for future enhancements

## 🎯 Success Metrics

- **Proof Verification Rate**: >95%
- **Automatic Maintenance**: Critical tasks <1 hour
- **System Uptime**: >99.9%
- **Gas Efficiency**: <50k gas per operation
- **User Satisfaction**: Real-time failure detection

## 🆘 Troubleshooting

### Common Issues
1. **Out of Gas**: Increase gas limit
2. **Proof Verification Failed**: Check ZK circuit compatibility
3. **Role Access Denied**: Verify user roles
4. **Transaction Reverted**: Check contract state

### Support
- GitHub Issues: [PDM Project Repository]
- Documentation: [Complete API Reference]
- Community: [Discord/Telegram Channel]
'''
        
        with open("INTEGRATED_DEPLOYMENT_GUIDE.md", 'w') as f:
            f.write(guide_content)
            
        log_success("INTEGRATED_DEPLOYMENT_GUIDE.md created")
        
    def run_deployment_preparation(self):
        """Deployment hazırlığını çalıştır"""
        
        print("🏗️ Integrated PDM System Deployment Preparation")
        print("=" * 60)
        
        try:
            log_step("1", "Creating Hardhat deployment script")
            self.create_hardhat_deploy_script()
            
            log_step("2", "Updating package.json")
            self.create_package_json_update()
            
            log_step("3", "Updating hardhat.config.js")
            self.create_hardhat_config_update()
            
            log_step("4", "Creating environment template")
            self.create_env_template()
            
            log_step("5", "Creating deployment guide")
            self.create_deployment_guide()
            
            print("\n🎉 Deployment preparation complete!")
            print("\n📋 Next Steps:")
            print("1. Update .env with your actual values")
            print("2. Run: npm install")
            print("3. Run: npx hardhat compile")  
            print("4. Run: npm run deploy:integrated")
            print("5. Update pdm_main.py with contract addresses")
            print("6. Test the integration with demo scripts")
            
            log_info("All files created successfully!")
            log_info("Ready for production deployment to Holesky testnet!")
            
        except Exception as e:
            log_error(f"Deployment preparation failed: {e}")
            return False
            
        return True

if __name__ == "__main__":
    deployment = IntegratedSystemDeployment()
    deployment.run_deployment_preparation() 