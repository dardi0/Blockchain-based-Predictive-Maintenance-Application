# Gemini Context: Hybrid Predictive Maintenance (PdM) System

## Project Overview

This project is a **Hybrid Predictive Maintenance (PdM) System** that leverages both off-chain storage and on-chain zero-knowledge proofs for a secure, efficient, and private solution. It is designed to predict machine failures using an LSTM-CNN model, with critical operations verified on the **zkSync Era (Sepolia Testnet)** blockchain.

The architecture is a mix of Python for the backend logic and AI model, JavaScript/Hardhat for blockchain deployment and interaction, and Solidity for the smart contracts.

### Core Technologies:
- **Blockchain:** zkSync Era (Sepolia Testnet), Solidity
- **Zero-Knowledge Proofs:** Circom for circuits and SnarkJS/Groth16 for proof generation. A `UnifiedGroth16Verifier` is used on-chain to handle multiple proof types (sensor, prediction, maintenance) with dynamic verifying keys.
- **Backend & AI:** Python, TensorFlow/Keras (for the LSTM-CNN model), Scikit-learn.
- **Blockchain Tooling:** Node.js, Hardhat, Ethers.js.
- **Database:** SQLite for local off-chain storage of sensor data.

### Key Components:
- **`pdm_main.py`**: Main Python application entry point, likely handling the user interface or core orchestration.
- **`hybrid_blockchain_handler.py`**: Manages all interactions with the zkSync Era blockchain, including submitting proofs.
- **`zk_proof_generator.py`**: Generates Groth16 ZK-SNARK proofs using `circom` and `snarkjs`.
- **`contracts/PdMSystemHybrid.sol`**: The main smart contract orchestrating the on-chain logic.
- **`contracts/UnifiedGroth16Verifier.sol`**: A single, efficient verifier for all ZK proofs.
- **`config.py`**: Centralized configuration for all system parameters, including model architecture, training parameters, file paths, and blockchain network details.

## Building and Running

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- `circom` and `snarkjs` installed globally.

### 1. Setup Environment

Create a `.env` file in the root directory with the following content:

```
ZKSYNC_ERA_RPC_URL=https://sepolia.era.zksync.dev
PRIVATE_KEY=0x... # Your private key for deployment and transactions
PYTHONUTF8=1
```

### 2. Install Dependencies

**Python:**
```bash
pip install -r requirements.txt
```

**JavaScript:**
```bash
npm install
```

### 3. Compile Smart Contracts

Compile the Solidity contracts using the Hardhat zkSync plugin.

```bash
npx hardhat compile
```

### 4. Deploy Smart Contracts

Deploy the core contracts to zkSync Era Sepolia testnet.

```bash
node scripts/deploy_unified_and_pdm.js
```
This will create a `deployment_info_hybrid_ZKSYNC_ERA.json` file with the deployed contract addresses.

### 5. Set Verifying Keys (VKs)

The `UnifiedGroth16Verifier` needs to be configured with the Verifying Keys for each circuit. Run the following scripts to set them:

```bash
# Set VK for the sensor data circuit
node scripts/set_verifying_key_sensor.js

# Set VK for the prediction circuit
node scripts/set_verifying_key_prediction.js

# Set VK for the maintenance circuit
node scripts/set_verifying_key_maintenance.js
```

### 6. Run the Application

The main application logic can be started via the Python scripts. The `README_HYBRID.md` provides an example of how to interact with the system programmatically.

```python
# Example from README_HYBRID.md
from hybrid_blockchain_handler import HybridBlockchainHandler

handler = HybridBlockchainHandler()
result = handler.submit_sensor_data_hybrid({
    'air_temp': 298.1,
    'process_temp': 308.6,
    'rotation_speed': 1551,
    'torque': 42.8,
    'tool_wear': 0,
    'machine_type': 'M'
})
print(result)
```

## Development Conventions

- **Configuration:** All major settings are managed centrally in `config.py`. Do not use hardcoded values.
- **Blockchain Interaction:** All contract interactions from the Python side are handled by the `HybridBlockchainHandler` class.
- **ZK Proofs:** The system uses real Groth16 proofs; there are no mocks. `zk_proof_generator.py` is the source for all proof generation.
- **Contract Verification:** Use the provided Hardhat scripts to verify contracts on the block explorer (e.g., `npx hardhat run scripts/verify_hardhat.js --network zkSyncSepolia`).
- **Dependencies:** Project dependencies are managed in `requirements.txt` for Python and `package.json` for Node.js.
