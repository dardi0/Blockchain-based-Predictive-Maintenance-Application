# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ZK-SNARK based Predictive Maintenance (PDM) system deployed on **zkSync Era Sepolia** (Chain ID 300).

- **Backend:** FastAPI (Python 3.11+), entry point `api_main.py`
- **Blockchain:** Solidity 0.8.26 contracts on zkSync Era L2
- **ZK Proofs:** Circom 2.x circuits + snarkjs (groth16) + circomlibjs for Poseidon
- **Database:** PostgreSQL via `PdMDatabaseManager` (connection pooling in `database/connection.py`)
- **Frontend:** Next.js 16 + React 19 + React Compiler (experimental), located in `dashboard/frontend-next/`
- **ML Model:** TensorFlow/Keras CNN-LSTM hybrid, loaded at startup from `models/` directory

## Common Commands

### Backend
```bash
# Start API server (port 8000)
python api_main.py

# Run all tests
pytest tests/ -v

# Run a single test file
pytest tests/test_maintenance.py -v

# Run a single test
pytest tests/test_api.py::ClassName::test_method -v
```

### Frontend (`dashboard/frontend-next/`)
```bash
npm run dev       # Dev server at localhost:3000
npm run build     # Production build
npm run lint      # ESLint
npm test          # vitest run (single pass)
npm run test:watch  # vitest watch mode
```

### Smart Contracts (root-level hardhat/zksync project)
```bash
npm run compile
npm run deploy:integrated -- --network zkSyncSepolia
npm run configure:access   # Grant permissions post-deploy
npm run register:node      # Register oracle node
```

## High-Level Architecture

### Request Flow
1. **Chainlink Automation** emits `PredictionRequested` on-chain
2. **AutomationEventListener** (`automation_event_listener.py`) polls every 30s, detects event
3. Listener calls ML model → stores result in PostgreSQL → submits fulfillment TX
4. Backend generates a **ZK proof** (`zk_proof_generator.py`) for the sensor/prediction data
5. **HybridBlockchainHandler** (`blockchain_client/handler.py`) submits the proof to `PdMSystemHybrid.sol`
6. TX monitor confirms on-chain; DB record updated with `proof_id` and `tx_hash`

### Hybrid Storage Pattern
- **Off-chain (PostgreSQL):** raw sensor values, predictions, maintenance records
- **On-chain (zkSync):** only ZK proof hashes + minimal metadata
- **Batch mode:** up to 64 sensor records packed into a single 64-leaf Poseidon Merkle tree proof (CircuitType 7), saving ~98% gas vs individual submissions

### CircuitType Enum (critical — must match `UnifiedGroth16Verifier.sol`)
```
0=SENSOR_DATA   800k gas
1=PREDICTION    800k gas
2=MAINTENANCE   300k gas
3=LEGACY
4=FAULT_RECORD  300k gas
5=TRAINING_RECORD 300k gas
6=REPORT_RECORD  300k gas
7=BATCH_SENSOR   800k gas
```

### Smart Contract Architecture
- `AccessControlRegistry.sol` — RBAC; roles: MANAGER, ENGINEER, OPERATOR; resources: SENSOR_DATA, PREDICTION, MAINTENANCE, FAULT_RECORD, TRAINING, REPORT
- `UnifiedGroth16Verifier.sol` — single verifier supporting all CircuitTypes via `setCircuitVerifyingKey(typeId, vk)`
- `PdMSystemHybrid.sol` — main proof submission surface; calls into the registry for `onlyAuthorizedNode` checks
- `ChainlinkPdMAutomation.sol` — AutomationType enum (0=PREDICTION, 1=MAINTENANCE, 2=TRAINING, 3=BATCH_FLUSH)

After any contract redeployment: run `setCircuitVerifyingKey` for each circuit type used, then `configure:access` to re-grant permissions.

### BatchSender
`blockchain_client/batch_sender.py` runs as a **daemon thread** (not async). It flushes pending records every `BATCH_INTERVAL` seconds (default 3600) or when `force_flush()` is called. Wired into `AutomationEventListener` in `api_main.py` after both are initialized.

## Critical Constraints

### G2 Swap — DO NOT DOUBLE-SWAP
`UnifiedGroth16Verifier._baseVerify()` performs **exactly one** swap of B and VK G2 points. If you add G2 point preparation anywhere else in the proof pipeline, verification will silently fail.

### Poseidon Hash — Always Use Node.js Subprocess
Python has no native Poseidon implementation compatible with the circuits. Always use:
```python
self._poseidon_js([field1, field2, ...])          # single hash
self._poseidon_merkle_root(leaf_hashes, timestamp) # batch (63 hashes in one call)
```
Both methods in `ZKProofGenerator` spawn a Node.js child process using snarkjs/circomlibjs.

### React Compiler try/catch Rule (CRITICAL)
With `experimental.reactCompiler: true`, the following are **forbidden inside try/catch blocks**:
`?.`  `||`  `&&`  `??`  `?:`  and string `+` concatenation.

**Correct pattern:**
```typescript
// Prepare outside try
const val = data?.field ?? 'default';
let errMsg = 'Unknown error';

try {
  if (val) { doSomething(val); }   // only if/else inside
} catch (e) {
  if (e instanceof Error) { errMsg = e.message; }
}
```
Also: `useEffect` must use `fetchData().then(applyResult)` pattern (no `setState` directly in effect body); `router.push()` inside `useEffect` → use `window.location.replace()` instead; `useSearchParams()` must live inside a `Suspense` child component.

### Environment Variables
The system requires these `.env` keys to run:
```
OPERATOR_PRIVATE_KEY / ENGINEER_PRIVATE_KEY / MANAGER_PRIVATE_KEY
ZKSYNC_ERA_RPC_URL=https://sepolia.era.zksync.dev
POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_HOST / POSTGRES_PORT
CHAINLINK_AUTOMATION_ADDRESS
ENABLE_BATCH_MODE=true
BATCH_INTERVAL=3600
BATCH_MAX_SIZE=64
POLL_INTERVAL=30
```

## Key File Locations

| Concern | File |
|---|---|
| All config dataclasses | `config.py` |
| API startup / lifespan | `api_main.py` |
| ZK proof generation | `zk_proof_generator.py` (BOM: utf-8-sig) |
| Blockchain TX submission | `blockchain_client/handler.py` |
| Batch daemon | `blockchain_client/batch_sender.py` |
| Chainlink event loop | `automation_event_listener.py` |
| DB schema + pooling | `database/connection.py` |
| DB query methods | `database/manager.py` |
| Contract addresses | `deployment_info_hybrid_ZKSYNC_ERA.json` |
| Frontend API client | `dashboard/frontend-next/src/services/api.ts` |

## Database Tables
`sensor_data`, `predictions`, `maintenance_records`, `fault_records`, `training_records`, `report_records`, `batch_submissions`, `batch_fault_queue`, `notifications`

The `sensor_data` table has columns `chain_hash`, `batch_id`, `batch_index` added for batch tracking. `proof_id` is stored as `BIGINT`.
