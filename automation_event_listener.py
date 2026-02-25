"""
Chainlink Automation Event Listener

Bu servis BackendOracleConsumer kontratindan gelen PredictionRequested
event'lerini dinler ve ML prediction yaparak sonucu blockchain'e gonderir.
Ayrica ChainlinkPdMAutomation'dan MaintenanceTaskRequested event'lerini
dinleyerek ZK proof olusturup on-chain submit eder.

Kullanim:
    python automation_event_listener.py

Gerekli Environment Variables:
    - ZKSYNC_ERA_RPC_URL
    - CONTRACT_OWNER_PRIVATE_KEY (oracle wallet)
"""

import os
import sys
import json
import time
import logging
import threading
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

# Web3 imports
from web3 import Web3
from eth_account import Account

# Try to import POA middleware (different in web3 v6+)
try:
    from web3.middleware import geth_poa_middleware
    HAS_POA_MIDDLEWARE = True
except ImportError:
    try:
        from web3.middleware import ExtraDataToPOAMiddleware
        HAS_POA_MIDDLEWARE = "v6"
    except ImportError:
        HAS_POA_MIDDLEWARE = False

# Load environment
from dotenv import load_dotenv
load_dotenv()

# Import config
try:
    from config import BlockchainConfig, ChainlinkConfig
    HAS_CONFIG = True
except ImportError:
    HAS_CONFIG = False
    class BlockchainConfig:
        PREDICTION_GAS_LIMIT = 300000
        GAS_PRICE_BUFFER = 1.1
        USE_DYNAMIC_GAS_ESTIMATION = True
        GAS_ESTIMATION_BUFFER = 1.2
    class ChainlinkConfig:
        POLL_INTERVAL = 30
        DEPLOYMENT_INFO_PATH = Path("chainlink_deployment_info.json")
        FAILURE_THRESHOLD = 7000

# Import database manager
try:
    from database import PdMDatabaseManager
    HAS_DB_MANAGER = True
except ImportError:
    HAS_DB_MANAGER = False

# Structured logging setup
try:
    from observability import configure_logging, set_log_context, set_correlation_id
    configure_logging(log_file="automation_listener.log")
    HAS_OBSERVABILITY = True
except ImportError:
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler('automation_listener.log', encoding='utf-8'),
        ],
    )
    HAS_OBSERVABILITY = False
    def set_log_context(**_kw): pass  # type: ignore
    def set_correlation_id(*_a, **_kw): pass  # type: ignore

logger = logging.getLogger(__name__)

# Configuration
ZKSYNC_RPC_URL = os.getenv("ZKSYNC_ERA_RPC_URL", "https://sepolia.era.zksync.dev")
ORACLE_PRIVATE_KEY = (
    os.getenv("CHAINLINK_AUTOMATION_PRIVATE_KEY")
    or os.getenv("CONTRACT_OWNER_PRIVATE_KEY")
)
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "30"))

# Contract addresses (loaded from deployment info)
DEPLOYMENT_INFO_PATH = Path(__file__).parent / "chainlink_deployment_info.json"


class AutomationEventListener:
    """Listens for PredictionRequested and MaintenanceTaskRequested events."""

    def __init__(self):
        self.w3: Optional[Web3] = None
        self.oracle_account = None
        self.oracle_contract = None
        self.automation_contract = None
        self.last_processed_block = 0
        self.last_maintenance_block = 0
        self.running = False

        # Load deployment info
        self.deployment_info = self._load_deployment_info()

        # ML Model (lazy loaded)
        self.ml_model = None
        self.scaler = None

        # Database manager
        self.db_manager = None
        if HAS_DB_MANAGER:
            try:
                self.db_manager = PdMDatabaseManager()
            except Exception as e:
                logger.warning(f"Could not init database manager: {e}")

        # Blockchain handler (lazy loaded for ZK proof submission)
        self.blockchain_handler = None

        # Resilience tracking
        self._consecutive_rpc_failures = 0
        self.MAX_RPC_FAILURES = 5

    def _load_deployment_info(self) -> Dict:
        """Load contract addresses from deployment info."""
        try:
            with open(DEPLOYMENT_INFO_PATH, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            logger.error(f"Deployment info not found at {DEPLOYMENT_INFO_PATH}")
            sys.exit(1)

    def _load_contract_abi(self, contract_name: str) -> list:
        """Load contract ABI from artifacts."""
        abi_paths = [
            Path(__file__).parent / f"artifacts-zk/contracts/chainlink/{contract_name}.sol/{contract_name}.json",
            Path(__file__).parent / f"artifacts/contracts/chainlink/{contract_name}.sol/{contract_name}.json",
        ]

        for path in abi_paths:
            if path.exists():
                with open(path, 'r') as f:
                    artifact = json.load(f)
                    return artifact.get('abi', [])

        logger.error(f"ABI not found for {contract_name}")
        return []

    def _load_ml_model(self):
        """Load ML model and scaler."""
        try:
            import joblib

            model_path = Path(__file__).parent / "build" / "model.h5"
            scaler_path = Path(__file__).parent / "build" / "scaler.joblib"

            if model_path.exists():
                os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
                from tensorflow import keras
                self.ml_model = keras.models.load_model(str(model_path), compile=False)
                logger.info("ML model loaded successfully")

            if scaler_path.exists():
                self.scaler = joblib.load(str(scaler_path))
                logger.info("Scaler loaded successfully")

        except Exception as e:
            logger.warning(f"Could not load ML model: {e}")
            logger.info("Will use rule-based prediction as fallback")

    def _init_blockchain_handler(self):
        """Lazy-load HybridBlockchainHandler for ZK proof submission."""
        if self.blockchain_handler is not None:
            return True
        try:
            from blockchain_client import HybridBlockchainHandler
            self.blockchain_handler = HybridBlockchainHandler(self.db_manager)
            if hasattr(self.blockchain_handler, '_initialize_blockchain'):
                self.blockchain_handler._initialize_blockchain()
            logger.info("HybridBlockchainHandler initialized for ZK proof submission")
            return True
        except Exception as e:
            logger.error(f"Cannot init blockchain handler: {e}")
            return False

    def _reconnect(self, max_attempts: int = 10):
        """Reconnect to RPC with exponential backoff. Calls sys.exit after exhausting attempts."""
        self._consecutive_rpc_failures = 0
        for attempt in range(max_attempts):
            wait = min(2 ** attempt, 300)  # cap at 5 minutes
            logger.warning(
                f"RPC disconnected — reconnecting in {wait}s "
                f"(attempt {attempt + 1}/{max_attempts})",
                extra={"event_type": "rpc_reconnecting", "attempt": attempt + 1},
            )
            time.sleep(wait)
            try:
                self.connect()
                logger.info(
                    "Reconnected successfully.",
                    extra={"event_type": "rpc_connected"},
                )
                return
            except ConnectionError as e:
                logger.error(
                    f"Reconnect attempt {attempt + 1} failed: {e}",
                    extra={"event_type": "rpc_reconnect_failed"},
                )
        logger.critical(
            "Exhausted all reconnect attempts — exiting for process supervisor restart.",
            extra={"event_type": "rpc_disconnected"},
        )
        sys.exit(1)

    def connect(self):
        """Connect to zkSync Era and initialize contracts."""
        logger.info(f"Connecting to {ZKSYNC_RPC_URL}")

        # Connect to Web3
        self.w3 = Web3(Web3.HTTPProvider(ZKSYNC_RPC_URL))

        # Add POA middleware if available
        if HAS_POA_MIDDLEWARE == True:
            self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        elif HAS_POA_MIDDLEWARE == "v6":
            self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

        if not self.w3.is_connected():
            # Raise instead of sys.exit so run() can attempt reconnection
            raise ConnectionError(f"Failed to connect to RPC: {ZKSYNC_RPC_URL}")

        logger.info(f"Connected! Chain ID: {self.w3.eth.chain_id}")

        # Setup oracle account — missing key is unrecoverable, exit immediately
        if not ORACLE_PRIVATE_KEY:
            logger.error("ORACLE_PRIVATE_KEY not set")
            sys.exit(1)

        self.oracle_account = Account.from_key(ORACLE_PRIVATE_KEY)
        logger.info(f"Oracle wallet: {self.oracle_account.address}")

        balance = self.w3.eth.get_balance(self.oracle_account.address)
        logger.info(f"Wallet balance: {self.w3.from_wei(balance, 'ether')} ETH")

        # Load contract ABIs
        oracle_abi = self._load_contract_abi("BackendOracleConsumer")
        automation_abi = self._load_contract_abi("ChainlinkPdMAutomation")

        # Get contract addresses
        oracle_address = self.deployment_info.get('contracts', {}).get('BackendOracleConsumer', {}).get('address')
        automation_address = self.deployment_info.get('contracts', {}).get('ChainlinkPdMAutomation', {}).get('address')

        if not oracle_address:
            # Try environment variable as fallback
            oracle_address = os.getenv("BACKEND_ORACLE_ADDRESS")

        if not oracle_address:
            logger.error(
                "BackendOracleConsumer address not found. "
                "Run deploy-backend-oracle.js or set BACKEND_ORACLE_ADDRESS env var."
            )
            sys.exit(1)

        # Initialize oracle contract
        if oracle_abi:
            self.oracle_contract = self.w3.eth.contract(
                address=Web3.to_checksum_address(oracle_address),
                abi=oracle_abi
            )
            logger.info(f"BackendOracleConsumer: {oracle_address}")
        else:
            logger.error("BackendOracleConsumer ABI not found")
            sys.exit(1)  # Unrecoverable config error

        # Initialize automation contract
        if automation_address and automation_abi:
            self.automation_contract = self.w3.eth.contract(
                address=Web3.to_checksum_address(automation_address),
                abi=automation_abi
            )
            logger.info(f"ChainlinkPdMAutomation: {automation_address}")
        else:
            logger.warning("ChainlinkPdMAutomation not configured - maintenance events won't be tracked")

        # Initialize AccessControlRegistry for heartbeat
        access_registry_address = self.deployment_info.get('contracts', {}).get('AccessControlRegistry', {}).get('address')
        if access_registry_address:
            access_abi = [
                {
                    "inputs": [{"internalType": "address", "name": "nodeOwner", "type": "address"}],
                    "name": "getNodesByAddress",
                    "outputs": [{"internalType": "bytes32[]", "name": "", "type": "bytes32[]"}],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [{"internalType": "bytes32", "name": "nodeId", "type": "bytes32"}],
                    "name": "heartbeat",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                }
            ]
            self.access_contract = self.w3.eth.contract(
                address=Web3.to_checksum_address(access_registry_address),
                abi=access_abi
            )
            # Find nodeId for heartbeat
            nodes = self.access_contract.functions.getNodesByAddress(self.oracle_account.address).call()
            if nodes and len(nodes) > 0:
                self.node_id = nodes[0]
                logger.info(f"Node ID found for heartbeat: {self.node_id.hex()}")
            else:
                self.node_id = None
                logger.warning("No node ID found for oracle account. Heartbeat disabled.")
        else:
            self.access_contract = None
            self.node_id = None
            logger.warning("AccessControlRegistry not found, heartbeat disabled")

        # Set starting block
        self.last_processed_block = self.w3.eth.block_number - 100
        self.last_maintenance_block = self.last_processed_block
        logger.info(f"Starting from block: {self.last_processed_block}")

        # Load ML model
        self._load_ml_model()

    def get_sensor_data(self, machine_id: int = None) -> Optional[Dict]:
        """Get latest sensor data from database."""
        if self.db_manager:
            return self._get_sensor_data_postgres(machine_id)
        return None

    def _get_sensor_data_postgres(self, machine_id: int = None) -> Optional[Dict]:
        """Get sensor data from PostgreSQL via PdMDatabaseManager."""
        try:
            if machine_id:
                data = self.db_manager.get_sensor_data(machine_id=machine_id, limit=1)
            else:
                data = self.db_manager.get_sensor_data(limit=1)

            if data and len(data) > 0:
                return data[0] if isinstance(data[0], dict) else data[0]
            return None
        except Exception as e:
            logger.error(f"Database error: {e}")
            return None

    def run_prediction(self, sensor_data: Dict) -> Dict:
        """Run ML prediction on sensor data."""
        try:
            import numpy as np

            # One-hot encode machine type (Type_H, Type_L, Type_M)
            machine_type = str(sensor_data.get('machine_type', 'L')).upper()
            type_h = 1 if machine_type == 'H' else 0
            type_l = 1 if machine_type == 'L' else 0
            type_m = 1 if machine_type == 'M' else 0

            features = np.array([[
                sensor_data.get('air_temp', 0),
                sensor_data.get('process_temp', 0),
                sensor_data.get('rotation_speed', 0),
                sensor_data.get('torque', 0),
                sensor_data.get('tool_wear', 0),
                type_h,
                type_l,
                type_m,
            ]])

            # Use ML model if available
            if self.ml_model and self.scaler:
                scaled_features = self.scaler.transform(features)
                # Reshape for Conv1D: (samples, timesteps, channels) = (1, n_features, 1)
                reshaped = scaled_features.reshape((1, scaled_features.shape[1], 1))
                prob = float(self.ml_model.predict(reshaped, verbose=0)[0][0])
                prediction = 1 if prob > 0.5 else 0
            else:
                # Rule-based fallback
                prediction, prob = self._rule_based_prediction(sensor_data)

            return {
                'prediction': prediction,
                'probability': prob,
                'confidence': int(prob * 10000)  # 0-10000 scale
            }

        except Exception as e:
            logger.error(f"Prediction error: {e}")
            prediction, prob = self._rule_based_prediction(sensor_data)
            return {
                'prediction': prediction,
                'probability': prob,
                'confidence': int(prob * 10000)
            }

    def _rule_based_prediction(self, sensor_data: Dict) -> tuple:
        """Rule-based prediction fallback."""
        failure_score = 0.0

        air_temp = sensor_data.get('air_temp', 300)
        process_temp = sensor_data.get('process_temp', 310)
        rotation_speed = sensor_data.get('rotation_speed', 1500)
        torque = sensor_data.get('torque', 40)
        tool_wear = sensor_data.get('tool_wear', 0)

        # Temperature differential
        temp_diff = process_temp - air_temp
        if temp_diff > 12:
            failure_score += 0.4
        elif temp_diff > 10:
            failure_score += 0.2

        # Tool wear
        if tool_wear > 200:
            failure_score += 0.4
        elif tool_wear > 150:
            failure_score += 0.2

        # Power calculation
        power = (rotation_speed * torque) / 9549
        if power > 9:
            failure_score += 0.3
        elif power > 7:
            failure_score += 0.1

        # Heat dissipation
        if temp_diff > 10 and rotation_speed < 1400:
            failure_score += 0.3

        prediction = 1 if failure_score > 0.5 else 0
        probability = min(failure_score, 1.0)

        return prediction, probability

    def calculate_data_hash(self, sensor_data: Dict) -> bytes:
        """Calculate keccak256 hash of sensor data."""
        data_str = json.dumps({
            'machine_id': sensor_data.get('machine_id'),
            'air_temp': sensor_data.get('air_temp'),
            'process_temp': sensor_data.get('process_temp'),
            'rotation_speed': sensor_data.get('rotation_speed'),
            'torque': sensor_data.get('torque'),
            'tool_wear': sensor_data.get('tool_wear'),
            'timestamp': sensor_data.get('timestamp')
        }, sort_keys=True)

        return self.w3.keccak(text=data_str)

    def fulfill_prediction(self, request_id: bytes, machine_id: int,
                           prediction: int, confidence: int, data_hash: bytes,
                           max_retries: int = 3, retry_delay: float = 5.0):
        """Send fulfillPrediction transaction to blockchain with retry logic."""
        last_error = None

        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    logger.info(f"Retry attempt {attempt + 1}/{max_retries}...")
                    time.sleep(retry_delay * (2 ** (attempt - 1)))

                nonce = self.w3.eth.get_transaction_count(self.oracle_account.address, 'pending')
                gas_price = self.w3.eth.gas_price
                gas_price = int(gas_price * BlockchainConfig.GAS_PRICE_BUFFER)

                # Dynamic gas estimation with fallback
                fallback_gas = BlockchainConfig.PREDICTION_GAS_LIMIT
                if BlockchainConfig.USE_DYNAMIC_GAS_ESTIMATION:
                    try:
                        call_data = self.oracle_contract.functions.fulfillPrediction(
                            request_id, machine_id, prediction, confidence, data_hash
                        )
                        estimated = self.w3.eth.estimate_gas({
                            'from': self.oracle_account.address,
                            'to': self.oracle_contract.address,
                            'data': call_data._encode_transaction_data()
                        })
                        gas_limit = int(estimated * BlockchainConfig.GAS_ESTIMATION_BUFFER)
                    except Exception as est_err:
                        logger.debug(f"Gas estimation failed, using fallback: {est_err}")
                        gas_limit = fallback_gas
                else:
                    gas_limit = fallback_gas

                tx = self.oracle_contract.functions.fulfillPrediction(
                    request_id,
                    machine_id,
                    prediction,
                    confidence,
                    data_hash
                ).build_transaction({
                    'from': self.oracle_account.address,
                    'nonce': nonce,
                    'gas': gas_limit,
                    'gasPrice': gas_price
                })

                signed_tx = self.w3.eth.account.sign_transaction(tx, ORACLE_PRIVATE_KEY)
                raw_tx = getattr(signed_tx, 'rawTransaction', None) or getattr(signed_tx, 'raw_transaction', None)
                tx_hash = self.w3.eth.send_raw_transaction(raw_tx)

                logger.info(f"Fulfillment TX sent: {tx_hash.hex()}")

                receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

                if receipt['status'] == 1:
                    logger.info(
                        f"Prediction fulfilled! Block: {receipt['blockNumber']}, "
                        f"Gas: {receipt['gasUsed']}",
                        extra={"event_type": "tx_confirmed",
                               "tx_hash": tx_hash.hex(),
                               "block_number": receipt['blockNumber'],
                               "gas_used": receipt['gasUsed']},
                    )
                    return True
                else:
                    logger.error(
                        "Transaction failed with status 0",
                        extra={"event_type": "tx_failed",
                               "tx_hash": tx_hash.hex()},
                    )
                    last_error = "Transaction reverted"
                    continue

            except Exception as e:
                last_error = str(e)
                error_str = str(e).lower()

                retryable_errors = [
                    'nonce too low', 'replacement transaction underpriced',
                    'already known', 'timeout', 'connection', 'network', 'rate limit'
                ]

                if any(err in error_str for err in retryable_errors):
                    logger.warning(
                        f"Retryable error on attempt {attempt + 1}: {e}",
                        extra={"event_type": "tx_retryable_error", "attempt": attempt + 1},
                    )
                    continue
                else:
                    logger.error(
                        f"Non-retryable fulfillment error: {e}",
                        extra={"event_type": "tx_failed"},
                    )
                    return False

        logger.error(
            f"Fulfillment failed after {max_retries} attempts. Last error: {last_error}",
            extra={"event_type": "tx_failed", "max_retries": max_retries},
        )
        return False

    def is_request_fulfilled(self, request_id: bytes) -> bool:
        """Check if a prediction request has already been fulfilled."""
        try:
            # Use getRequestInfo which returns (requestType, timestamp, fulfilled, requester)
            result = self.oracle_contract.functions.getRequestInfo(request_id).call()
            # result[2] is the 'fulfilled' boolean
            return result[2]
        except Exception as e:
            logger.debug(f"Could not check request status: {e}")
            return False

    def process_prediction_request(self, event: Dict):
        """Process a PredictionRequested event."""
        request_id = event['args']['requestId']
        timestamp = event['args']['timestamp']
        requester = event['args']['requester']

        logger.info(f"Processing prediction request: {request_id.hex()[:16]}...")
        logger.info(f"  Timestamp: {datetime.fromtimestamp(timestamp)}")
        logger.info(f"  Requester: {requester}")

        # Check if already fulfilled
        if self.is_request_fulfilled(request_id):
            logger.info("  Request already fulfilled, skipping...")
            return

        # Get sensor data
        sensor_data = self.get_sensor_data()

        if not sensor_data:
            logger.warning("No sensor data available for prediction")
            return

        machine_id = sensor_data.get('machine_id', 1)
        logger.info(f"  Machine ID: {machine_id}")

        # Run prediction
        result = self.run_prediction(sensor_data)
        logger.info(f"  Prediction: {'FAILURE' if result['prediction'] == 1 else 'NORMAL'}")
        logger.info(f"  Confidence: {result['confidence'] / 100}%")

        # Calculate data hash
        data_hash = self.calculate_data_hash(sensor_data)

        # Fulfill on blockchain
        success = self.fulfill_prediction(
            request_id=request_id,
            machine_id=machine_id,
            prediction=result['prediction'],
            confidence=result['confidence'],
            data_hash=data_hash
        )

        if success:
            self._update_sensor_prediction(
                sensor_data.get('id'),
                result['prediction'],
                result['probability']
            )

    def _update_sensor_prediction(self, sensor_id: int, prediction: int, probability: float):
        """Update sensor record with prediction result."""
        if not sensor_id or not self.db_manager:
            return
        try:
            self.db_manager.update_blockchain_info(
                record_id=sensor_id,
                success=True,
                tx_hash=None,
                proof_id=None
            )
            logger.info(f"Updated sensor record {sensor_id} with prediction")
        except Exception as e:
            logger.error(f"Database update error: {e}")

    def process_maintenance_request(self, event: Dict):
        """Process a MaintenanceTaskRequested event - generate and submit ZK proof."""
        machine_id = event['args']['machineId']
        prediction_id = event['args']['predictionId']

        logger.info(f"MaintenanceTaskRequested: machine={machine_id}, predictionId={prediction_id}")

        # Get prediction details from automation contract
        try:
            pred_data = self.automation_contract.functions.getPendingPrediction(prediction_id).call()
            # Returns: (machineId, dataHash, prediction, confidence, timestamp, processed)
            pred_machine_id = pred_data[0]
            data_hash = pred_data[1]
            prediction_value = pred_data[2]
            confidence = pred_data[3]

            logger.info(f"  Prediction: {'FAILURE' if prediction_value == 1 else 'NORMAL'}")
            logger.info(f"  Confidence: {confidence / 100}%")

            # Only generate ZK proof for failure predictions
            if prediction_value == 1:
                set_log_context(
                    machine_id=pred_machine_id,
                    event_type="zk_proof_start",
                    circuit_type="MAINTENANCE",
                )
                self._generate_and_submit_zk_proof(pred_machine_id, prediction_id, pred_data)
            else:
                logger.info("  Normal prediction, no ZK proof needed")

        except Exception as e:
            logger.error(f"Error getting prediction details: {e}")

    def _generate_and_submit_zk_proof(self, machine_id: int, prediction_id: int, pred_data: tuple):
        """Generate ZK proof for a failure prediction and submit on-chain.

        Retries up to 3 times with exponential backoff (5s, 10s, 20s).
        On final failure, logs a dead-letter entry for manual recovery.
        """
        if not self._init_blockchain_handler():
            logger.error("Cannot generate ZK proof - blockchain handler unavailable")
            return

        # Get sensor data for the machine
        sensor_data = self.get_sensor_data(machine_id)
        if not sensor_data:
            logger.warning(f"No sensor data found for machine {machine_id}")
            return

        # Run prediction once (outside retry loop — same data reused across attempts)
        try:
            result = self.run_prediction(sensor_data)
        except Exception as e:
            logger.error(f"Prediction run failed before ZK proof for machine {machine_id}: {e}")
            return

        proof_payload = {
            'machine_id': machine_id,
            'prediction': result['prediction'],
            'probability': result['probability'],
            'confidence': result['confidence'],
            'air_temp': sensor_data.get('air_temp'),
            'process_temp': sensor_data.get('process_temp'),
            'rotation_speed': sensor_data.get('rotation_speed'),
            'torque': sensor_data.get('torque'),
            'tool_wear': sensor_data.get('tool_wear'),
            'timestamp': sensor_data.get('timestamp', int(time.time())),
        }

        max_attempts = 3
        backoff_seconds = [5, 10, 20]

        for attempt in range(1, max_attempts + 1):
            try:
                logger.info(f"Submitting ZK proof for machine {machine_id} (attempt {attempt}/{max_attempts})...")
                proof_result = self.blockchain_handler.submit_prediction_proof_automated(proof_payload)

                if isinstance(proof_result, dict) and proof_result.get('success'):
                    tx_hash = proof_result.get('tx_hash', '')
                    logger.info(
                        f"ZK proof submitted! TX: {tx_hash}",
                        extra={"event_type": "zk_proof_success",
                               "tx_hash": tx_hash,
                               "circuit_type": "MAINTENANCE",
                               "attempt": attempt},
                    )
                    # Update database
                    if self.db_manager and sensor_data.get('id'):
                        self.db_manager.update_blockchain_info(
                            record_id=sensor_data['id'],
                            success=True,
                            tx_hash=tx_hash,
                            proof_id=proof_result.get('blockchain_proof_id'),
                            is_prediction=True
                        )
                    return  # Success — exit retry loop

                error = proof_result.get('error', 'Unknown') if isinstance(proof_result, dict) else str(proof_result)
                logger.warning(
                    f"ZK proof submission attempt {attempt} failed: {error}",
                    extra={"event_type": "zk_proof_retry",
                           "attempt": attempt,
                           "circuit_type": "MAINTENANCE"},
                )

            except Exception as e:
                logger.warning(f"ZK proof attempt {attempt} raised exception: {e}")

            # Wait before next attempt (skip sleep after last attempt)
            if attempt < max_attempts:
                time.sleep(backoff_seconds[attempt - 1])

        # All attempts exhausted — log dead-letter entry
        logger.error(
            f"ZK proof submission PERMANENTLY FAILED after {max_attempts} attempts "
            f"for machine_id={machine_id}, prediction_id={prediction_id}. "
            f"Manual recovery required: re-run proof submission for sensor record id={sensor_data.get('id')}.",
            extra={"event_type": "zk_proof_dead_letter",
                   "machine_id": machine_id,
                   "prediction_id": prediction_id,
                   "sensor_record_id": sensor_data.get('id'),
                   "circuit_type": "MAINTENANCE"},
        )

    def poll_events(self):
        """Poll for new PredictionRequested and MaintenanceTaskRequested events."""
        try:
            current_block = self.w3.eth.block_number

            if current_block <= self.last_processed_block:
                return

            # Poll PredictionRequested events from BackendOracleConsumer
            self._poll_prediction_events(current_block)

            # Poll MaintenanceTaskRequested events from ChainlinkPdMAutomation
            self._poll_maintenance_events(current_block)

            # Reset failure counter on any successful poll
            self._consecutive_rpc_failures = 0

        except Exception as e:
            self._consecutive_rpc_failures += 1
            logger.error(
                f"Event polling error "
                f"({self._consecutive_rpc_failures}/{self.MAX_RPC_FAILURES}): {e}"
            )
            if self._consecutive_rpc_failures >= self.MAX_RPC_FAILURES:
                raise ConnectionError(
                    f"RPC failure threshold reached after {self.MAX_RPC_FAILURES} attempts"
                ) from e

    def _poll_prediction_events(self, current_block: int):
        """Poll for PredictionRequested events."""
        if not self.oracle_contract:
            return

        try:
            events = self.oracle_contract.events.PredictionRequested.get_logs(
                from_block=self.last_processed_block + 1,
                to_block=current_block
            )

            for event in events:
                try:
                    logger.info(f"Found PredictionRequested event in block {event['blockNumber']}")
                    self.process_prediction_request(event)
                except Exception as e:
                    logger.warning(f"Error processing prediction event: {e}")
                    continue

            self.last_processed_block = current_block

        except Exception as e:
            logger.debug(f"Prediction event polling: {e}")
            self.last_processed_block = current_block

    def _poll_maintenance_events(self, current_block: int):
        """Poll for MaintenanceTaskRequested events from automation contract."""
        if not self.automation_contract:
            return

        try:
            events = self.automation_contract.events.MaintenanceTaskRequested.get_logs(
                from_block=self.last_maintenance_block + 1,
                to_block=current_block
            )

            for event in events:
                try:
                    logger.info(f"Found MaintenanceTaskRequested event in block {event['blockNumber']}")
                    self.process_maintenance_request(event)
                except Exception as e:
                    logger.warning(f"Error processing maintenance event: {e}")
                    continue

            self.last_maintenance_block = current_block

        except Exception as e:
            logger.debug(f"Maintenance event polling: {e}")
            self.last_maintenance_block = current_block

    def _heartbeat_loop(self):
        """Background thread sending heartbeat every 30 minutes."""
        HEARTBEAT_INTERVAL = 1800  # 30 minutes
        while self.running:
            try:
                nonce = self.w3.eth.get_transaction_count(self.oracle_account.address, 'pending')
                gas_price = int(self.w3.eth.gas_price * 1.1)
                tx = self.access_contract.functions.heartbeat(self.node_id).build_transaction({
                    'from': self.oracle_account.address,
                    'nonce': nonce,
                    'gas': 300000,
                    'gasPrice': gas_price
                })
                signed_tx = self.w3.eth.account.sign_transaction(tx, private_key=ORACLE_PRIVATE_KEY)
                tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
                logger.info(f"Heartbeat sent! TX: {tx_hash.hex()}", extra={"event_type": "heartbeat_sent"})
            except Exception as e:
                logger.error(f"Heartbeat failed: {e}", extra={"event_type": "heartbeat_failed"})
            
            # Sleep in small increments to allow exiting quickly when self.running is False
            for _ in range(HEARTBEAT_INTERVAL):
                if not self.running:
                    break
                time.sleep(1)

    def run(self):
        """Main event loop with automatic reconnection on RPC failures."""
        logger.info("=" * 50)
        logger.info("Starting Automation Event Listener")
        logger.info("=" * 50)

        try:
            self.connect()
        except ConnectionError as e:
            logger.error(f"Initial connection failed: {e}")
            self._reconnect()

        self.running = True

        # Start heartbeat background thread
        if getattr(self, "node_id", None) and getattr(self, "access_contract", None):
            self.heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
            self.heartbeat_thread.start()
            logger.info("Heartbeat background task started")

        logger.info(f"Polling every {POLL_INTERVAL} seconds...")
        logger.info("Press Ctrl+C to stop\n")

        try:
            while self.running:
                try:
                    self.poll_events()
                except ConnectionError as e:
                    logger.error(f"Connection lost during polling: {e}")
                    self._reconnect()
                time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            logger.info("\nStopping listener...")
            self.running = False


def main():
    listener = AutomationEventListener()
    listener.run()


if __name__ == "__main__":
    main()
