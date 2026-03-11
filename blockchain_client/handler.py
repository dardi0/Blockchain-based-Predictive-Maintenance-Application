# -*- coding: utf-8 -*-
"""
Blockchain Handler - Modüler Yapı
Original: hybrid_blockchain_handler.py
"""

import hashlib
import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
import warnings
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Windows konsollarında UTF-8/emoji yazdırma sorunlarını engelle
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# web3 legacy warnings
warnings.filterwarnings(
    "ignore",
    category=DeprecationWarning,
    message=r".*websockets\.legacy is deprecated.*",
)

from eth_account import Account
from web3 import Web3

# Optional zksync2 for type-113 (EIP-712) Smart Account transactions
try:
    from zksync2.module.module_builder import ZkSyncBuilder
    from zksync2.signer.eth_signer import PrivateKeyEthSigner
    from zksync2.transaction.transaction_builders import TxFunctionCall

    ZKSYNC2_AVAILABLE = True
except ImportError:
    ZKSYNC2_AVAILABLE = False

# Import components from root
try:
    import config
    from config import BlockchainConfig, ConfigUtils
    from database import PdMDatabaseManager
    from hybrid_storage_manager import MaintenanceData, PredictionData, SensorData
    from zk_proof_generator import ZKProofGenerator
except ImportError:
    # Bu modül root'tan import edildiğinde çalışır
    # Eğer standalone test ediliyorsa path ayarı gerekebilir
    pass

# Local imports
from .gas import GasEstimator
from .nonce import NonceManager
from .pdm_db import DBAdapter

logger = logging.getLogger(__name__)


class HybridBlockchainHandler:
    """
    Hibrit blockchain handler - Off-chain storage + On-chain proofs
    Tek veritabanı kullanır: PdMDatabase/PdMDatabase
    """

    def __init__(self, db_manager=None):
        # PdM DB (eğer dışarıdan verilmişse onu, yoksa kendisi oluşturur)
        self.pdm_db = (
            db_manager
            if db_manager is not None
            else (PdMDatabaseManager() if PdMDatabaseManager else None)
        )

        # Tek veritabanı kullan - sadece PdMDatabaseManager
        # DBAdapter kullanılıyor (Refactored from _DBAdapter)
        self.storage_manager = DBAdapter(pdm_db=self.pdm_db)

        self.zk_proof_generator = ZKProofGenerator()
        # Blockchain bağlantısı
        self.role_wallets = {}  # {role: {'address': ...}} - NO PRIVATE KEYS STORED
        self.address_wallet_map = {}
        self.default_signer_role = None

        # Mapping from role to env variable name for secure on-demand access
        self.role_key_map = {
            "MANAGER": "MANAGER_PRIVATE_KEY",
            "ENGINEER": "ENGINEER_PRIVATE_KEY",
            "OPERATOR": "OPERATOR_PRIVATE_KEY",
        }

        # Blockchain state
        self.web3 = None
        self.pdm_contract = None
        self.admin_account = None
        self.rpc_url = None
        self.deployment_info = None
        self._verifier_contract = None
        self._sensor_vk_ready = False
        self._runtime_contracts_aligned = True
        self._runtime_contract_mismatch_reason = None
        self._sensor_vk_warned = False
        self._no_window_flag = getattr(subprocess, "CREATE_NO_WINDOW", 0)

        # Gas estimation helper (web3 initialize edilince ayarlanır)
        self._gas_estimator = None

        # zksync2 / Smart Account support
        self._zk_web3 = None  # zksync2 provider (type-113 TX için)
        self._ephemeral_session_keys: dict = {}  # {role: {'address': ..., 'private_key': ...}}
        self.smart_account_map: dict = {  # env'den okunur
            "ENGINEER": os.getenv("ENGINEER_SMART_ACCOUNT"),
            "OPERATOR": os.getenv("OPERATOR_SMART_ACCOUNT"),
        }
        self._nonce_manager = None

        # Çoklu imzalayıcı desteği
        self.role_wallets: Dict[str, Dict[str, str]] = {}
        self.address_wallet_map: Dict[str, Dict[str, str]] = {}
        self.default_signer_role: Optional[str] = None
        self._configure_role_wallets()

        # Initialize blockchain if available
        self._initialize_blockchain()

    # --- Helper Methods ---
    @staticmethod
    def _norm_value(v) -> int:
        """Normalized integer value from int, string or hex string."""
        if isinstance(v, int):
            return v
        s = str(v)
        return int(s, 16) if s.lower().startswith("0x") else int(s)

    @staticmethod
    def _format_g2(point, swap=False):
        """Format G2 point with optional coordinate swapping.
        point: [[x0, x1], [y0, y1]]
        """
        if len(point) < 2:
            raise ValueError("Invalid G2 point")

        # Norm values first
        x = point[0]
        y = point[1]

        if swap:
            # Swap coordinates [x1, x0] (for some verifiers)
            return (
                [
                    HybridBlockchainHandler._norm_value(x[1]),
                    HybridBlockchainHandler._norm_value(x[0]),
                ],
                [
                    HybridBlockchainHandler._norm_value(y[1]),
                    HybridBlockchainHandler._norm_value(y[0]),
                ],
            )
        else:
            # Standard order [x0, x1]
            return (
                [
                    HybridBlockchainHandler._norm_value(x[0]),
                    HybridBlockchainHandler._norm_value(x[1]),
                ],
                [
                    HybridBlockchainHandler._norm_value(y[0]),
                    HybridBlockchainHandler._norm_value(y[1]),
                ],
            )

    def _extract_proof_id_from_receipt(self, receipt) -> int:
        """Tx receipt içinden proofId'yi olaylardan ayıkla.
        Hem SensorDataProofSubmitted hem PredictionProofSubmitted olaylarını dener.
        """
        try:
            if not self.pdm_contract:
                return 0
            # Önce Prediction
            try:
                evs = (
                    self.pdm_contract.events.PredictionProofSubmitted().process_receipt(
                        receipt
                    )
                )
                for e in evs:
                    args = getattr(e, "args", {}) or {}
                    pid = int(args.get("proofId") or args.get("proofID") or 0)
                    if pid:
                        return pid
            except Exception as e:
                logger.warning(f"Failed to find PredictionProofSubmitted event: {e}")
            # Sonra Sensor
            try:
                evs = (
                    self.pdm_contract.events.SensorDataProofSubmitted().process_receipt(
                        receipt
                    )
                )
                for e in evs:
                    args = getattr(e, "args", {}) or {}
                    pid = int(args.get("proofId") or args.get("proofID") or 0)
                    if pid:
                        return pid
            except Exception as e:
                logger.warning(f"Failed to find SensorDataProofSubmitted event: {e}")
        except Exception as e:
            logger.warning(f"Error extracting proof id from receipt: {e}")
            return 0
        return 0

    def _normalize_raw_private_key(self, pk: Optional[str]) -> Optional[str]:
        """Verilen raw string'i geçerli private key formatına getir."""
        if not pk:
            return None
        pk = pk.strip().strip('"').strip("'").replace(" ", "")
        hex_part = pk[2:] if pk.lower().startswith("0x") else pk
        if not re.fullmatch(r"[0-9a-fA-F]{64}", hex_part or ""):
            logger.error("❌ Invalid PRIVATE_KEY format (expected 64 hex chars)")
            return None
        return "0x" + hex_part.lower()

    def _normalize_private_key(self, raw_key: Optional[str] = None) -> Optional[str]:
        """Env'den gelen private key'i güvenli biçime getir (0x + 64 hex)."""
        try:
            pk = raw_key
            if not pk and hasattr(config.EnvConfig, "get_PRIVATE_KEY"):
                pk = config.EnvConfig.get_PRIVATE_KEY()
            if not pk and hasattr(config.EnvConfig, "get_private_key"):
                pk = config.EnvConfig.get_private_key()
            if not pk:
                pk = os.getenv("Private_Key") or os.getenv("PRIVATE_KEY")
            return self._normalize_raw_private_key(pk)
        except Exception:
            return None

    def _get_signer_private_key(
        self, role_or_address: Optional[str] = None
    ) -> Optional[str]:
        """
        SECURITY (H7): Retrieve private key on-demand from environment variables.
        Never store it in class attributes or long-lived dictionaries.
        """
        try:
            # 1. Try as role name
            if role_or_address:
                role_upper = role_or_address.upper()
                if role_upper in self.role_key_map:
                    raw = os.getenv(self.role_key_map[role_upper])
                    return self._normalize_raw_private_key(raw)

            # 2. Try as address (reverse lookup role)
            if role_or_address and role_or_address.startswith("0x"):
                addr_lower = role_or_address.lower()
                # Check admin first
                if (
                    hasattr(self, "admin_account")
                    and self.admin_account
                    and self.admin_account.lower() == addr_lower
                ):
                    return self._normalize_private_key()

                # Check roles
                for role, info in self.role_wallets.items():
                    if info["address"].lower() == addr_lower:
                        if role in self.role_key_map:
                            raw = os.getenv(self.role_key_map[role])
                            return self._normalize_raw_private_key(raw)

            # 3. Default/Fallback to main PRIVATE_KEY
            return self._normalize_private_key()
        except Exception as e:
            logger.error(f"Error retrieving private key: {e}")
            return None

    def _configure_role_wallets(self) -> None:
        """ENGINEER/OPERATOR/MANAGER cüzdan adreslerini yükle (Private key saklama!)."""
        # Load addresses only
        self.role_wallets.clear()
        self.address_wallet_map.clear()

        for role, env_var in self.role_key_map.items():
            raw = os.getenv(env_var)
            normalized = self._normalize_raw_private_key(raw)
            if not normalized:
                continue
            try:
                # Key'i sadece adres üretmek için anlık kullan, saklama
                address = Web3.to_checksum_address(Account.from_key(normalized).address)
                info = {
                    "role": role,
                    "address": address,
                    # 'private_key': REMOVED for H7 security fix
                    "smart_account": self.smart_account_map.get(role),
                }
                self.role_wallets[role] = info
                self.address_wallet_map[address.lower()] = info
            except Exception as err:
                logger.error(f"❌ Could not derive address for {role}: {err}")
                continue

        if "MANAGER" in self.role_wallets:
            self.default_signer_role = "MANAGER"
        elif self.role_wallets:
            self.default_signer_role = next(iter(self.role_wallets.keys()))
        else:
            fallback_key = self._normalize_private_key()
            if fallback_key:
                try:
                    address = Web3.to_checksum_address(
                        Account.from_key(fallback_key).address
                    )
                    info = {"role": "DEFAULT", "address": address}
                    self.role_wallets["DEFAULT"] = info
                    self.address_wallet_map[address.lower()] = info
                    self.default_signer_role = "DEFAULT"
                except Exception as err:
                    logger.error(f"❌ Could not derive fallback signer: {err}")
                    self.default_signer_role = None
            else:
                self.default_signer_role = None

        default_wallet = (
            self.role_wallets.get(self.default_signer_role)
            if self.default_signer_role
            else None
        )
        if default_wallet:
            self.admin_account = default_wallet["address"]

    def _resolve_signer(
        self, actor_role: Optional[str], recorded_by: Optional[str]
    ) -> Optional[Dict[str, str]]:
        """Rol veya cüzdan adresine göre uygun imzalayıcıyı döndür."""
        # Öncelik: cüzdan adresi eşleşmesi
        if recorded_by:
            try:
                checksum_addr = Web3.to_checksum_address(recorded_by)
            except Exception:
                checksum_addr = recorded_by
            lookup_key = (
                checksum_addr.lower() if isinstance(checksum_addr, str) else None
            )
            if lookup_key and lookup_key in self.address_wallet_map:
                return self.address_wallet_map[lookup_key]

        role_key = (actor_role or "").upper()
        if role_key and role_key in self.role_wallets:
            return self.role_wallets[role_key]
        if self.default_signer_role and self.default_signer_role in self.role_wallets:
            return self.role_wallets[self.default_signer_role]
        return None

    def _initialize_blockchain(self):
        """Blockchain bağlantısını kur"""
        try:
            # Config'ten bilgileri al
            # SECURITY (H7): Don't store private_key in self.private_key
            temp_pk = self._normalize_private_key()

            self.rpc_url = ConfigUtils.get_current_rpc_url()
            self.network_name = ConfigUtils.get_network_config()["name"]

            if not all([self.rpc_url, temp_pk]):
                logger.warning(
                    "⚠️ Blockchain config incomplete - running in local-only mode"
                )
                return False

            # Web3 bağlantısı
            try:
                self.web3 = Web3(
                    Web3.HTTPProvider(self.rpc_url, request_kwargs={"timeout": 30})
                )
            except TypeError:
                self.web3 = Web3(Web3.HTTPProvider(self.rpc_url))
            if not self.web3.is_connected():
                logger.error(f"❌ Cannot connect to {self.network_name}")
                return False

            # Account setup
            account = self.web3.eth.account.from_key(temp_pk)
            del temp_pk  # Clear local variable asap
            self.admin_account = account.address
            balance = self.web3.from_wei(
                self.web3.eth.get_balance(self.admin_account), "ether"
            )

            # Initialize gas estimator and nonce manager
            self._gas_estimator = GasEstimator(self.web3)
            self._nonce_manager = NonceManager(self.web3, self.admin_account)

            # logger.info(f"✅ {self.network_name} connected!")
            # logger.info(f"👤 Account: {self.admin_account}")
            # logger.info(f"💰 Balance: {balance:.4f} ETH")

            # Contract'ı yükle
            try:
                onchain_chain_id = int(self.web3.eth.chain_id)
                cfg = ConfigUtils.get_network_config()
                expected_chain_id = (
                    int(cfg.get("chain_id", onchain_chain_id))
                    if isinstance(cfg, dict)
                    else onchain_chain_id
                )
                if onchain_chain_id != expected_chain_id:
                    logger.error(
                        f"Chain ID mismatch: on-chain={onchain_chain_id}, expected={expected_chain_id}"
                    )
                    return False
            except Exception as e:
                logger.warning(f"Could not validate chain id: {e}")
            result = self._load_hybrid_contract()
            self._setup_zksync2_provider()
            return result

        except Exception as e:
            logger.error(f"❌ Blockchain initialization error: {e}")
            return False

    def _setup_zksync2_provider(self) -> None:
        """zksync2 provider'ı başlat (type-113 TX için)."""
        if not ZKSYNC2_AVAILABLE or not self.rpc_url:
            return
        try:
            self._zk_web3 = ZkSyncBuilder.build(self.rpc_url)
            logger.info("✅ zksync2 provider initialized")
        except Exception as e:
            logger.warning(f"zksync2 provider init failed: {e}")

    def setup_session_keys(self) -> None:
        """
        Startup'ta OPERATOR ve ENGINEER için ephemeral session key üret,
        onları kendi Smart Account sözleşmelerine authorizeSessionKey() ile kaydet.
        Başarısız olursa EOA fallback'e gerilenir (exception propagate edilmez).
        """
        if not self.web3 or not self.pdm_contract:
            logger.warning("setup_session_keys: blockchain not ready, skipping")
            return

        pdm_address = self.pdm_contract.address

        # Load SessionKeyAccount ABI
        sk_artifacts_path = Path(
            "artifacts-zk/contracts/SessionKeyAccount.sol/SessionKeyAccount.json"
        )
        if not sk_artifacts_path.exists():
            logger.warning(
                "setup_session_keys: SessionKeyAccount artifacts not found, skipping"
            )
            return
        with open(sk_artifacts_path) as f:
            sk_artifact = json.load(f)
        sk_abi = sk_artifact["abi"]

        # Function selectors for allowed operations
        sensor_selector = self.web3.keccak(
            text="submitSensorDataProof(uint256,bytes32,bytes32,bytes32,uint256,uint256[2],uint256[2][2],uint256[2],uint256[])"
        )[:4]
        prediction_selector = self.web3.keccak(
            text="submitPredictionProof(uint256,bytes32,bytes32,uint256[2],uint256[2][2],uint256[2],uint256[])"
        )[:4]

        role_selectors = {
            "OPERATOR": sensor_selector,
            "ENGINEER": prediction_selector,
        }

        for role, selector in role_selectors.items():
            smart_account_addr = self.smart_account_map.get(role)
            if not smart_account_addr:
                logger.info(
                    f"setup_session_keys: no smart account for {role}, skipping"
                )
                continue

            owner_pk = self._get_signer_private_key(role)
            if not owner_pk:
                logger.warning(
                    f"setup_session_keys: no private key for {role}, skipping"
                )
                continue

            try:
                ephemeral = Account.create()
                smart_account_addr_cs = self.web3.to_checksum_address(
                    smart_account_addr
                )
                session_contract = self.web3.eth.contract(
                    address=smart_account_addr_cs, abi=sk_abi
                )

                owner_account = Account.from_key(owner_pk)
                nonce = self.web3.eth.get_transaction_count(
                    owner_account.address, "pending"
                )
                tx = session_contract.functions.authorizeSessionKey(
                    ephemeral.address,
                    pdm_address,
                    selector,
                    86400,  # valid for 24 hours
                ).build_transaction(
                    {
                        "from": owner_account.address,
                        "nonce": nonce,
                        "gas": 150000,
                        "gasPrice": self._get_gas_price(),
                    }
                )
                signed = self.web3.eth.account.sign_transaction(
                    tx, private_key=owner_pk
                )
                tx_hash = self.web3.eth.send_raw_transaction(signed.raw_transaction)
                receipt = self.web3.eth.wait_for_transaction_receipt(
                    tx_hash,
                    timeout=getattr(BlockchainConfig, "TRANSACTION_TIMEOUT", 120),
                )
                if receipt.status == 1:
                    self._ephemeral_session_keys[role] = {
                        "address": ephemeral.address,
                        "private_key": ephemeral.key.hex(),
                    }
                    print(f"✅ Session key authorized for {role}: {ephemeral.address}")
                else:
                    logger.warning(
                        f"authorizeSessionKey TX failed for {role} (status=0)"
                    )
            except Exception as e:
                logger.warning(f"setup_session_keys failed for {role}: {e}")

    def _send_as_smart_account(
        self, contract_fn, smart_account_addr: str, role: str, gas_limit: int
    ) -> Dict:
        """
        Type-113 EIP-712 TX'i session key ile imzalayıp Smart Account üzerinden gönder.
        zksync2 kütüphanesi gerektirir.
        """
        if not ZKSYNC2_AVAILABLE:
            raise RuntimeError("zksync2 not available")
        if not self._zk_web3:
            raise RuntimeError("zksync2 provider not initialized")
        ephemeral = self._ephemeral_session_keys.get(role)
        if not ephemeral:
            raise RuntimeError(f"No ephemeral session key for role {role}")

        chain_id = self.web3.eth.chain_id
        nonce = self.web3.eth.get_transaction_count(smart_account_addr, "pending")
        gas_price = self._get_gas_price()

        # Build calldata via standard web3 (no TX broadcast)
        calldata = contract_fn.build_transaction(
            {
                "from": smart_account_addr,
                "nonce": nonce,
                "gas": gas_limit,
                "gasPrice": gas_price,
            }
        )["data"]

        tx_func = TxFunctionCall(
            chain_id=chain_id,
            nonce=nonce,
            from_=smart_account_addr,
            to=self.pdm_contract.address,
            data=calldata,
            gas_limit=gas_limit,
            gas_price=gas_price,
        )
        tx_712 = tx_func.tx712(gas_limit)

        signer = PrivateKeyEthSigner(
            Account.from_key(ephemeral["private_key"]), chain_id
        )
        signed_msg = signer.sign_typed_data(tx_712.to_eip712_struct())
        tx_712.meta.custom_signature = signed_msg.signature

        encoded = tx_712.encode()
        tx_hash_bytes = self.web3.eth.send_raw_transaction(encoded)
        receipt = self.web3.eth.wait_for_transaction_receipt(
            tx_hash_bytes, timeout=getattr(BlockchainConfig, "TRANSACTION_TIMEOUT", 120)
        )
        return {
            "tx_hash": tx_hash_bytes.hex(),
            "receipt": receipt,
        }

    def _load_hybrid_contract(self):
        """Hibrit PDM contract'ını yükle"""
        try:
            # Deployment info dosyası
            deployment_path = ConfigUtils.get_deployment_info_path()
            if not deployment_path.exists():
                logger.warning("⚠️ No deployment info found - contracts not deployed")
                return False

            # Deployment bilgilerini yükle
            with open(deployment_path) as f:
                self.deployment_info = json.load(f)

            # Hybrid contract artifacts (zkSync Era artifacts)
            hybrid_artifacts_path = Path(
                "artifacts-zk/contracts/PdMSystemHybrid.sol/PdMSystemHybrid.json"
            )
            if not hybrid_artifacts_path.exists():
                logger.error(
                    f"❌ Hybrid contract artifacts not found: {hybrid_artifacts_path}"
                )
                return False

            with open(hybrid_artifacts_path) as f:
                hybrid_artifact = json.load(f)
            # logger.info("✅ Loaded PdMSystemHybrid artifacts from artifacts-zk")

            # Contract address'ini deployment_info.json'dan çek
            contracts = self.deployment_info.get("contracts", {})
            hybrid_address = contracts.get("PdMSystemHybrid", {}).get("address")
            if not hybrid_address:
                logger.error("❌ Hybrid contract address not found in deployment info")
                return False

            # Contract instance oluştur
            self.pdm_contract = self.web3.eth.contract(
                address=self.web3.to_checksum_address(hybrid_address),
                abi=hybrid_artifact["abi"],
            )

            # logger.info(f"✅ Hybrid PDM Contract loaded: {hybrid_address}")
            return True

        except Exception as e:
            logger.error(f"❌ Contract loading error: {e}")
            return False

    def _get_verifier_contract(self):
        """Load verifier contract instance on demand.

        Source-of-truth priority:
        1) PdMSystemHybrid.zkVerifier() address (runtime-linked verifier)
        2) deployment_info fallback (legacy behavior)
        """
        if self._verifier_contract:
            return self._verifier_contract
        if not self.web3:
            return None
        try:
            # Artifact yolu için iki olasılığı sırayla dene
            # __file__ → blockchain_client/handler.py → parent.parent = project root
            _project_root = Path(__file__).resolve().parent.parent
            candidate_paths = [
                _project_root
                / "artifacts-zk/contracts/OptimizedGroth16Verifier.sol/OptimizedGroth16Verifier.json",
                _project_root
                / "artifacts-zk/contracts/UnifiedGroth16Verifier.sol/UnifiedGroth16Verifier.json",
            ]
            artifact = None
            for p in candidate_paths:
                if p.exists():
                    with open(p, encoding="utf-8") as f:
                        artifact = json.load(f)
                    break
            if artifact is None:
                logger.error("Verifier contract artifacts not found in expected paths")
                return None

            verifier_address = None

            # Primary: read linked verifier directly from PdM contract
            try:
                if self.pdm_contract is not None:
                    linked_addr = self.pdm_contract.functions.zkVerifier().call()
                    if (
                        linked_addr
                        and linked_addr != "0x0000000000000000000000000000000000000000"
                    ):
                        verifier_address = linked_addr
                        logger.info(
                            f"[verifier-resolve] using PdMSystemHybrid.zkVerifier={verifier_address}"
                        )
            except Exception as e:
                logger.info(
                    f"[verifier-resolve] zkVerifier() read failed, fallback to deployment info: {e}"
                )

            # Fallback: deployment info
            if not verifier_address:
                if not self.deployment_info:
                    logger.error(
                        "Verifier contract address could not be resolved (no pdm zkVerifier and no deployment info)"
                    )
                    return None
                contracts = self.deployment_info.get("contracts", {})
                # Hem eski (Optimized...) hem yeni (Unified...) anahtarları destekle
                verifier_info = (
                    contracts.get("OptimizedGroth16Verifier")
                    or contracts.get("UnifiedGroth16Verifier")
                    or {}
                )
                verifier_address = verifier_info.get("address")
                if not verifier_address:
                    logger.error(
                        "Verifier contract address not found in deployment info"
                    )
                    return None
                logger.warning(
                    f"[verifier-resolve] using deployment_info verifier address={verifier_address}"
                )

            self._verifier_contract = self.web3.eth.contract(
                address=self.web3.to_checksum_address(verifier_address),
                abi=artifact["abi"],
            )
            return self._verifier_contract
        except Exception as e:
            logger.error(f"Verifier contract load error: {e}")
            return None

    def _check_runtime_contract_alignment(self) -> bool:
        """Fail-fast guard: runtime contract addresses must match deployment info."""
        self._runtime_contracts_aligned = True
        self._runtime_contract_mismatch_reason = None

        try:
            if not self.pdm_contract or not self.deployment_info:
                self._runtime_contracts_aligned = False
                self._runtime_contract_mismatch_reason = (
                    "alignment check skipped: pdm_contract or deployment_info missing"
                )
                logger.error(
                    f"[alignment] FAIL — {self._runtime_contract_mismatch_reason}"
                )
                return False

            contracts = self.deployment_info.get("contracts", {})
            dep_pdm = (contracts.get("PdMSystemHybrid", {}) or {}).get("address")
            dep_verifier = (contracts.get("UnifiedGroth16Verifier", {}) or {}).get(
                "address"
            ) or (contracts.get("OptimizedGroth16Verifier", {}) or {}).get("address")

            runtime_pdm = self.pdm_contract.address
            runtime_verifier = self.pdm_contract.functions.zkVerifier().call()

            mismatches = []
            if dep_pdm and runtime_pdm and dep_pdm.lower() != runtime_pdm.lower():
                mismatches.append(
                    f"PdMSystemHybrid mismatch: deployment={dep_pdm} runtime={runtime_pdm}"
                )
            if (
                dep_verifier
                and runtime_verifier
                and dep_verifier.lower() != runtime_verifier.lower()
            ):
                mismatches.append(
                    f"zkVerifier mismatch: deployment={dep_verifier} runtime={runtime_verifier}"
                )

            if mismatches:
                self._runtime_contracts_aligned = False
                self._runtime_contract_mismatch_reason = " | ".join(mismatches)
                logger.error(
                    f"[alignment] FAIL — {self._runtime_contract_mismatch_reason}"
                )
                return False

            logger.info(
                f"[alignment] OK — pdm={runtime_pdm}, zkVerifier={runtime_verifier}"
            )
            return True

        except Exception as e:
            self._runtime_contracts_aligned = False
            self._runtime_contract_mismatch_reason = f"alignment_check_exception: {e}"
            logger.error(f"[alignment] FAIL — {self._runtime_contract_mismatch_reason}")
            return False

    def _load_local_sensor_vk_params(self):
        try:
            temp_dir = getattr(
                self.zk_proof_generator, "temp_dir", Path("temp/zk_proofs")
            )
            vk_path = temp_dir / "verification_key.json"
            zkey_path = temp_dir / "sensor_data_proof.zkey"
            if not vk_path.exists():
                if not zkey_path.exists():
                    return None
                if not self._export_sensor_verification_key(zkey_path, vk_path):
                    return None
            vk_json = json.loads(vk_path.read_text(encoding="utf-8"))

            def _norm(v):
                return HybridBlockchainHandler._norm_value(v)

            alpha = [_norm(vk_json["vk_alpha_1"][0]), _norm(vk_json["vk_alpha_1"][1])]

            def _g2(point):
                return HybridBlockchainHandler._format_g2(point, swap=False)

            beta = _g2(vk_json["vk_beta_2"])
            gamma = _g2(vk_json["vk_gamma_2"])
            delta = _g2(vk_json["vk_delta_2"])
            return alpha, beta, gamma, delta
        except Exception:
            return None

    # ----- Revert Reason Yardımcıları -----
    def _extract_revert_reason(self, error) -> str:
        """Web3/JSON-RPC hatalarından olası revert sebebini okunur çıkar."""
        try:
            # web3.exceptions.ContractLogicError (v6) için
            try:
                from web3.exceptions import ContractLogicError  # type: ignore

                if isinstance(error, ContractLogicError):
                    msg = getattr(error, "revert_message", None)
                    if msg:
                        return str(msg)
            except Exception:
                pass

            # ValueError({... 'message': 'execution reverted: REASON' ...})
            if hasattr(error, "args") and error.args:
                arg0 = error.args[0]
                if isinstance(arg0, dict):
                    m = arg0.get("message") or ""
                    if isinstance(m, str) and m:
                        text = m
                    else:
                        # Bazı nodelar data -> error -> message taşır
                        data = arg0.get("data") or {}
                        if isinstance(data, dict):
                            # İlk alt hata mesajını topla
                            for v in data.values():
                                if (
                                    isinstance(v, dict)
                                    and "message" in v
                                    and isinstance(v["message"], str)
                                ):
                                    text = v["message"]
                                    break
                            else:
                                text = ""
                        else:
                            text = ""
                else:
                    text = str(arg0)
            else:
                text = str(error)

            import re

            # 'execution reverted: REASON' kalıbını yakala
            m = re.search(r"execution reverted(?::)?\s*(.*)", text, flags=re.IGNORECASE)
            if m and m.group(1):
                return m.group(1).strip()
            # Alternatif kısmi kalıp
            m = re.search(r"(?i)revert(?:ed)?(?::)?\s*(.*)", text)
            if m and m.group(1):
                return m.group(1).strip()
            return text.strip()
        except Exception:
            return str(error)

    def _sensor_verifier_is_set(self) -> bool:
        contract = self._get_verifier_contract()
        if not contract:
            print("❌ Verifier contract not available")
            return False
        try:
            # circuitKeys returns: struct DynVK {alpha, beta, gamma, delta, IC[], isSet}
            vk_info = contract.functions.circuitKeys(0).call()
            if not vk_info:
                print("❌ circuitKeys(0) returned empty")
                return False

            # DynVK struct: (G1Point alpha, G2Point beta, G2Point gamma, G2Point delta, G1Point[] IC, bool isSet)
            # Tuple indices: 0=alpha, 1=beta, 2=gamma, 3=delta, 4=IC, 5=isSet
            is_set = bool(vk_info[5]) if len(vk_info) > 5 else False
            print(f"🔍 Sensor VK status: isSet={is_set}")

            if len(vk_info) > 4:
                ic_array = vk_info[4]
                ic_length = len(ic_array) if isinstance(ic_array, (list, tuple)) else 0
                print(f"   IC Length: {ic_length}")
                if (
                    len(vk_info) > 0
                    and isinstance(vk_info[0], (list, tuple))
                    and len(vk_info[0]) >= 2
                ):
                    print(f"   Alpha.X: {vk_info[0][0]}")

            if not is_set:
                print("❌ Sensor VK not set on contract - VK upload gerekli!")
                return False

            # On-chain VK ile local VK uyuşuyor mu?
            try:
                alpha_on, beta_on, gamma_on, delta_on = (
                    vk_info[0],
                    vk_info[1],
                    vk_info[2],
                    vk_info[3],
                )
                local_params = self._load_local_sensor_vk_params()
                if local_params is None:
                    self._sensor_vk_ready = True
                    return True
                alpha_l, beta_l, gamma_l, delta_l = local_params

                def _eq(a, b):
                    try:
                        return json.dumps(a, sort_keys=True) == json.dumps(
                            b, sort_keys=True
                        )
                    except Exception:
                        return a == b

                if (
                    _eq(alpha_on, alpha_l)
                    and _eq(beta_on, beta_l)
                    and _eq(gamma_on, gamma_l)
                    and _eq(delta_on, delta_l)
                ):
                    self._sensor_vk_ready = True
                    return True
                else:
                    return False
            except Exception as e:
                logger.warning(
                    f"Error comparing on-chain keys with local keys (Sensor): {e}"
                )
                self._sensor_vk_ready = True
                return True
        except Exception as e:
            logger.warning(f"Unable to read verifier key state: {e}")
            return False

    def _export_sensor_verification_key(self, zkey_path: Path, vk_path: Path) -> bool:
        cmd = self.zk_proof_generator._build_snarkjs_command(
            "zkey", "export", "verificationkey", str(zkey_path), str(vk_path)
        )
        if not cmd:
            logger.error("snarkjs command not available to export verification key")
            return False
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
                creationflags=self._no_window_flag,
            )
            if result.returncode == 0:
                # logger.info(f"Verification key exported to {vk_path}")
                return True
            logger.error(
                f"Verification key export failed: {result.stderr.strip() or result.stdout.strip()}"
            )
        except Exception as e:
            logger.error(f"Verification key export error: {e}")
        return False

    def _upload_sensor_verifying_key(self) -> bool:
        # 1. Unified Verifier Artifact'ini Bul
        verifier_artifact_path = Path(
            "artifacts-zk/contracts/UnifiedGroth16Verifier.sol/UnifiedGroth16Verifier.json"
        )

        if not verifier_artifact_path.exists():
            logger.error(
                f"❌ UnifiedVerifier artifact not found at {verifier_artifact_path}"
            )
            # Fallback to Adapter if Unified not found (rare)
            return False

        try:
            # --- A. DEPLOY NEW UNIFIED VERIFIER ---
            with open(verifier_artifact_path) as f:
                artifact = json.load(f)

            abi = artifact["abi"]
            bytecode = artifact["bytecode"]

            logger.info("🚀 Deploying new UnifiedGroth16Verifier...")
            VerifierContract = self.web3.eth.contract(abi=abi, bytecode=bytecode)

            nonce = (
                self._nonce_manager.get_nonce()
                if self._nonce_manager
                else self.web3.eth.get_transaction_count(self.admin_account, "pending")
            )
            # Constructor has no args based on ABI
            base_tx = {
                "from": self.admin_account,
                "nonce": nonce,
                "gasPrice": self._get_gas_price(),
            }
            # Use dynamic gas estimation with fallback
            gas_limit = (
                self._gas_estimator.estimate_gas(
                    base_tx, BlockchainConfig.VERIFIER_DEPLOY_GAS_LIMIT
                )
                if self._gas_estimator
                else BlockchainConfig.VERIFIER_DEPLOY_GAS_LIMIT
            )
            base_tx["gas"] = gas_limit
            tx = VerifierContract.constructor().build_transaction(base_tx)

            pk = self._get_signer_private_key(self.admin_account)
            signed = self.web3.eth.account.sign_transaction(tx, private_key=pk)
            tx_hash = self.web3.eth.send_raw_transaction(signed.raw_transaction)

            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            if receipt.status != 1:
                logger.error("❌ Unified Verifier deployment failed")
                return False

            new_verifier_address = receipt.contractAddress
            logger.info(f"✅ Unified Verifier deployed at: {new_verifier_address}")
            new_verifier_contract = self.web3.eth.contract(
                address=new_verifier_address, abi=abi
            )

            # --- B. UPLOAD VALIDATION KEYS ---
            temp_dir = getattr(
                self.zk_proof_generator, "temp_dir", Path("temp/zk_proofs")
            )
            vk_path = temp_dir / "verification_key.json"
            zkey_path = temp_dir / "sensor_data_proof.zkey"

            # Check/Export keys if needed
            if not vk_path.exists():
                if not zkey_path.exists():
                    logger.error("❌ No zkey found to generate verification key")
                    return False
                if not self._export_sensor_verification_key(zkey_path, vk_path):
                    return False

            vk_json = json.loads(vk_path.read_text(encoding="utf-8"))

            # Helper for proper int conversion
            # Helper for proper int conversion
            def _norm(v):
                return HybridBlockchainHandler._norm_value(v)

            # Helper for G2 points using static method (swap=True for Unified Verifier)
            def _g2(p):
                return HybridBlockchainHandler._format_g2(p, swap=True)

            # NOTE: If this fails validation, we might need non-swapped.
            # But standard Groth16 implementations on ETH require X=[x1, x0] format for G2.

            alpha = (_norm(vk_json["vk_alpha_1"][0]), _norm(vk_json["vk_alpha_1"][1]))
            beta = _g2(vk_json["vk_beta_2"])
            gamma = _g2(vk_json["vk_gamma_2"])
            delta = _g2(vk_json["vk_delta_2"])
            ic = [(_norm(p[0]), _norm(p[1])) for p in vk_json["IC"]]

            logger.info("🔑 Setting Sensor Circuit (ID 0) Keys on new Verifier...")
            nonce = self.web3.eth.get_transaction_count(self.admin_account, "pending")

            # setCircuitVerifyingKey(uint8 circuitType, alpha, beta, gamma, delta, IC)
            tx_keys = new_verifier_contract.functions.setCircuitVerifyingKey(
                0,  # CircuitType.SENSOR_DATA
                alpha,
                beta,
                gamma,
                delta,
                ic,
            ).build_transaction(
                {
                    "from": self.admin_account,
                    "nonce": nonce,
                    "gas": 6000000,
                }
            )

            pk = self._get_signer_private_key(self.admin_account)
            signed_keys = self.web3.eth.account.sign_transaction(
                tx_keys, private_key=pk
            )
            tx_keys_hash = self.web3.eth.send_raw_transaction(
                signed_keys.raw_transaction
            )
            receipt_keys = self.web3.eth.wait_for_transaction_receipt(
                tx_keys_hash, timeout=60
            )

            if receipt_keys.status != 1:
                logger.error("❌ Failed to upload keys to Unified Verifier")
                return False

            logger.info("✅ Keys set successfully.")

            # --- C. LINK TO MAIN CONTRACT ---
            pdm_contract = self._get_verifier_contract()
            if not pdm_contract:
                return False

            logger.info("🔗 Linking new Unified Verifier to PdMSystemHybrid...")
            nonce = (
                self._nonce_manager.get_nonce()
                if self._nonce_manager
                else self.web3.eth.get_transaction_count(self.admin_account, "pending")
            )

            base_tx_link = {
                "from": self.admin_account,
                "nonce": nonce,
                "gasPrice": self._get_gas_price(),
            }
            gas_limit = (
                self._gas_estimator.estimate_gas(
                    base_tx_link, BlockchainConfig.CONTRACT_UPDATE_GAS_LIMIT
                )
                if self._gas_estimator
                else BlockchainConfig.CONTRACT_UPDATE_GAS_LIMIT
            )
            base_tx_link["gas"] = gas_limit
            tx_link = pdm_contract.functions.updateSensorVerifier(
                new_verifier_address
            ).build_transaction(base_tx_link)

            pk = self._get_signer_private_key(self.admin_account)
            signed_link = self.web3.eth.account.sign_transaction(
                tx_link, private_key=pk
            )
            link_tx_hash = self.web3.eth.send_raw_transaction(
                signed_link.raw_transaction
            )

            link_receipt = self.web3.eth.wait_for_transaction_receipt(
                link_tx_hash, timeout=60
            )
            if link_receipt.status == 1:
                logger.info(
                    f"✅ Linked & Ready! New Sensor Verifier: {new_verifier_address}"
                )
                self._sensor_vk_ready = True
                return True
            else:
                logger.error("❌ Failed to link Verifier")
                return False

        except Exception as e:
            logger.error(f"Verifier setup error: {e}")
            return False

    def _ensure_sensor_verifier_key(self) -> bool:
        if self._sensor_vk_ready:
            return True

        contract = self._get_verifier_contract()
        if not contract:
            return False

        try:
            # FIRST: Check if zkVerifier has CircuitType.SENSOR_DATA VK set
            # This is the preferred path - use dynamically loaded VK
            try:
                zk_verifier_addr = contract.functions.zkVerifier().call()
                if (
                    zk_verifier_addr
                    and zk_verifier_addr != "0x0000000000000000000000000000000000000000"
                ):
                    # Check if VK is set for CircuitType.SENSOR_DATA (0)
                    zk_verifier_abi = [
                        {
                            "inputs": [
                                {
                                    "internalType": "uint8",
                                    "name": "circuitType",
                                    "type": "uint8",
                                }
                            ],
                            "name": "getICLength",
                            "outputs": [
                                {
                                    "internalType": "uint256",
                                    "name": "",
                                    "type": "uint256",
                                }
                            ],
                            "stateMutability": "view",
                            "type": "function",
                        }
                    ]
                    zk_verifier = self.web3.eth.contract(
                        address=zk_verifier_addr, abi=zk_verifier_abi
                    )
                    ic_length = zk_verifier.functions.getICLength(
                        0
                    ).call()  # CircuitType.SENSOR_DATA = 0
                    if ic_length == 4:  # 3 public inputs + 1
                        logger.info(
                            f"✅ Sensor VK already set on zkVerifier (IC length={ic_length})"
                        )
                        self._sensor_vk_ready = True
                        return True
            except Exception as e:
                logger.debug(f"zkVerifier VK check failed: {e}")

            # FALLBACK: Check if sensorVerifier is set
            current_verifier_addr = contract.functions.sensorVerifier().call()
            ZERO_ADDR = "0x0000000000000000000000000000000000000000"

            needs_update = False

            if not current_verifier_addr or current_verifier_addr == ZERO_ADDR:
                logger.warning("⚠️ Sensor Verifier address is not set on main contract.")
                needs_update = True
            else:
                # Check if code exists
                code = self.web3.eth.get_code(current_verifier_addr)
                if len(code) <= 2:
                    logger.warning(
                        f"⚠️ Sensor Verifier address {current_verifier_addr} has no code."
                    )
                    needs_update = True
                else:
                    # STRICT CHECK: Is it the Unified Verifier?
                    # The previous generic verifier failed because it missed the right methods.
                    # We check if it supports 'circuitKeys' (unique to Unified).
                    try:
                        # Create a temp contract instance to call view
                        # We use minimal ABI for the check
                        checker = self.web3.eth.contract(
                            address=current_verifier_addr,
                            abi=[
                                {
                                    "inputs": [
                                        {
                                            "internalType": "uint8",
                                            "name": "",
                                            "type": "uint8",
                                        }
                                    ],
                                    "name": "circuitKeys",
                                    "outputs": [
                                        {
                                            "name": "alpha",
                                            "type": "tuple",
                                            "components": [
                                                {"type": "uint256"},
                                                {"type": "uint256"},
                                            ],
                                        }
                                    ],  # Partial return match sufficient
                                    "stateMutability": "view",
                                    "type": "function",
                                }
                            ],
                        )
                        # Try to read key for circuit 0
                        checker.functions.circuitKeys(0).call()
                        logger.info(
                            "✅ Existing Sensor Verifier appears to be valid (Unified)."
                        )
                    except Exception as e:
                        logger.warning(
                            f"⚠️ Existing Verifier at {current_verifier_addr} failed validation check (Old Type?): {e}"
                        )
                        logger.info(
                            "♻️ Triggering replacement with UnifiedGroth16Verifier..."
                        )
                        needs_update = True

            if needs_update:
                if not self._sensor_vk_warned:
                    logger.info("Initiating Sensor Verifier update sequence...")
                    self._sensor_vk_warned = True
                success = self._upload_sensor_verifying_key()
                if success:
                    self._sensor_vk_ready = True
                return success

            self._sensor_vk_ready = True
            return True

        except Exception as e:
            logger.error(f"Error ensuring sensor verifier: {e}")
            return False

    # --- Prediction circuit VK helpers ---
    def _prediction_verifier_is_set(self) -> bool:
        contract = self._get_verifier_contract()
        if not contract:
            return False
        try:
            # CircuitType.PREDICTION = 1; ABI: (alpha, beta, gamma, delta, isSet)
            vk_info = contract.functions.circuitKeys(1).call()
            if not vk_info:
                return False
            is_set = bool(vk_info[-1])
            if not is_set:
                return False

            # Yerel VK ile karşılaştır (uyum yoksa yeniden yükleme tetikle)
            try:
                alpha_on, beta_on, gamma_on, delta_on = (
                    vk_info[0],
                    vk_info[1],
                    vk_info[2],
                    vk_info[3],
                )
                local_params = self._load_local_prediction_vk_params()
                if local_params is None:
                    return True
                alpha_l, beta_l, gamma_l, delta_l = local_params

                def _eq(a, b):
                    try:
                        return json.dumps(a, sort_keys=True) == json.dumps(
                            b, sort_keys=True
                        )
                    except Exception:
                        return a == b

                if (
                    _eq(alpha_on, alpha_l)
                    and _eq(beta_on, beta_l)
                    and _eq(gamma_on, gamma_l)
                    and _eq(delta_on, delta_l)
                ):
                    return True
                else:
                    return False
            except Exception as e:
                logger.warning(
                    f"Error comparing on-chain prediction keys with local keys: {e}"
                )
                return True
        except Exception as e:
            logger.warning(f"Unable to read prediction verifier key state: {e}")
            return False

    def _export_prediction_verification_key(
        self, zkey_path: Path, vk_path: Path
    ) -> bool:
        cmd = self.zk_proof_generator._build_snarkjs_command(
            "zkey", "export", "verificationkey", str(zkey_path), str(vk_path)
        )
        if not cmd:
            logger.error(
                "snarkjs command not available to export verification key (prediction)"
            )
            return False
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
                creationflags=self._no_window_flag,
            )
            if result.returncode == 0:
                # logger.info(f"Prediction verification key exported to {vk_path}")
                return True
            logger.error(
                f"Prediction verification key export failed: {result.stderr.strip() or result.stdout.strip()}"
            )
        except Exception as e:
            logger.error(f"Prediction verification key export error: {e}")
        return False

    def _upload_prediction_verifying_key(self) -> bool:
        contract = self._get_verifier_contract()
        if not contract:
            return False

        temp_dir = getattr(self.zk_proof_generator, "temp_dir", Path("temp/zk_proofs"))
        vk_path = temp_dir / "prediction_verification_key.json"
        zkey_path = temp_dir / "prediction_proof.zkey"

        # VK yoksa ya da zkey daha yeniyse yeniden export et
        try:
            need_export = not vk_path.exists()
            if (
                vk_path.exists()
                and zkey_path.exists()
                and zkey_path.stat().st_mtime > vk_path.stat().st_mtime
            ):
                need_export = True
            if need_export:
                if not zkey_path.exists():
                    logger.error(
                        f"Prediction VK not found at {vk_path} and zkey missing at {zkey_path}"
                    )
                    return False
                if not self._export_prediction_verification_key(zkey_path, vk_path):
                    return False
        except Exception as e:
            logger.warning(f"Failed to check/export prediction VK during upload: {e}")

        try:
            vk_json = json.loads(vk_path.read_text(encoding="utf-8"))

            def _norm(value):
                return HybridBlockchainHandler._norm_value(value)

            alpha = (_norm(vk_json["vk_alpha_1"][0]), _norm(vk_json["vk_alpha_1"][1]))

            def _g2(point):
                return HybridBlockchainHandler._format_g2(point, swap=False)

            beta = _g2(vk_json["vk_beta_2"])
            gamma = _g2(vk_json["vk_gamma_2"])
            delta = _g2(vk_json["vk_delta_2"])
            ic_points = [(_norm(p[0]), _norm(p[1])) for p in vk_json["IC"]]

            nonce = (
                self._nonce_manager.get_nonce()
                if self._nonce_manager
                else self.web3.eth.get_transaction_count(self.admin_account, "pending")
            )
            base_tx_vk = {
                "from": self.admin_account,
                "nonce": nonce,
                "gasPrice": self._get_gas_price(),
            }
            gas_limit = (
                self._gas_estimator.estimate_gas(
                    base_tx_vk, BlockchainConfig.VK_UPLOAD_GAS_LIMIT
                )
                if self._gas_estimator
                else BlockchainConfig.VK_UPLOAD_GAS_LIMIT
            )
            base_tx_vk["gas"] = gas_limit
            tx = contract.functions.setCircuitVerifyingKey(
                1, alpha, beta, gamma, ic_points
            ).build_transaction(base_tx_vk)

            pk = self._get_signer_private_key(self.admin_account)
            signed = self.web3.eth.account.sign_transaction(tx, private_key=pk)
            tx_hash = self.web3.eth.send_raw_transaction(signed.raw_transaction)
            # logger.info(f"Prediction verifier key transaction sent: {tx_hash.hex()}")
            receipt = self.web3.eth.wait_for_transaction_receipt(
                tx_hash, timeout=BlockchainConfig.TRANSACTION_TIMEOUT
            )
            if receipt.status != 1:
                logger.error(
                    f"Prediction verifier key transaction failed with status {receipt.status}"
                )
                return False
            # logger.info(f"Prediction verifier key configured on-chain (block {receipt.blockNumber})")
            return True
        except Exception as e:
            logger.error(f"Prediction verifier key upload error: {e}")
            return False

    def _load_local_prediction_vk_params(self):
        try:
            temp_dir = getattr(
                self.zk_proof_generator, "temp_dir", Path("temp/zk_proofs")
            )
            vk_path = temp_dir / "prediction_verification_key.json"
            zkey_path = temp_dir / "prediction_proof.zkey"
            if not vk_path.exists():
                if not zkey_path.exists():
                    return None
                if not self._export_prediction_verification_key(zkey_path, vk_path):
                    return None
            vk_json = json.loads(vk_path.read_text(encoding="utf-8"))

            def _norm(value):
                return HybridBlockchainHandler._norm_value(value)

            # On-chain ABI circuitKeys(1) döndüğünü şekle uygun olacak biçimde
            # G1: [X, Y]
            # G2: [[X0, X1], [Y0, Y1]]
            alpha = [_norm(vk_json["vk_alpha_1"][0]), _norm(vk_json["vk_alpha_1"][1])]

            def _g2(point):
                return HybridBlockchainHandler._format_g2(point, swap=False)

            beta = _g2(vk_json["vk_beta_2"])
            gamma = _g2(vk_json["vk_gamma_2"])
            delta = _g2(vk_json["vk_delta_2"])
            return (alpha, beta, gamma, delta)
        except Exception:
            return None

    def _ensure_prediction_verifier_key(self) -> bool:
        # Eğer on-chain VK var ve yerel VK ile eşleşiyorsa tamam
        if self._prediction_verifier_is_set():
            return True
        logger.warning(
            "Prediction circuit verifying key not set/mismatch. Attempting automatic configuration."
        )
        if self._upload_prediction_verifying_key():
            return True
        logger.error(
            "Prediction circuit verifying key is missing. Configure verifier key and retry."
        )
        return False

    def _submit_prediction_proof_to_blockchain(
        self,
        data_proof_id_onchain: int,
        prediction_hash: str,
        model_commitment: bytes,
        proof_data: Dict,
        actor_role: Optional[str] = None,
        recorded_by: Optional[str] = None,
    ) -> Dict:
        """Submit prediction proof to blockchain with ZK verification."""
        try:
            if not self._ensure_prediction_verifier_key():
                return {
                    "success": False,
                    "error": "prediction_verifier_key_not_configured",
                }

            # Resolve signer: prefer ENGINEER role for prediction (access control requires it).
            # Fall back to admin_account only if no role wallet is configured.
            signer_info = self._resolve_signer(actor_role or "ENGINEER", recorded_by)
            pred_signer_addr = (
                signer_info["address"] if signer_info else self.admin_account
            )
            pred_signer_pk = (
                self._get_signer_private_key(signer_info["address"])
                if signer_info
                else self._get_signer_private_key(self.admin_account)
            )

            proof = proof_data["proof"]
            public_inputs = proof_data["publicInputs"]

            if "pi_a" in proof:
                a = [int(proof["pi_a"][0]), int(proof["pi_a"][1])]
                b_native = [
                    [int(proof["pi_b"][0][0]), int(proof["pi_b"][0][1])],
                    [int(proof["pi_b"][1][0]), int(proof["pi_b"][1][1])],
                ]
                c = [int(proof["pi_c"][0]), int(proof["pi_c"][1])]
            else:
                a = [int(proof["a"][0]), int(proof["a"][1])]
                b_native = [
                    [int(proof["b"][0][0]), int(proof["b"][0][1])],
                    [int(proof["b"][1][0]), int(proof["b"][1][1])],
                ]
                c = [int(proof["c"][0]), int(proof["c"][1])]

            # Decide B order: if adapter is configured on-chain, send precompile order (swapped)
            # Unified verifier swaps G2 internally, but some snarkjs outputs have reversed axis
            def _swap_b(bpt):
                try:
                    return [
                        [int(bpt[0][1]), int(bpt[0][0])],
                        [int(bpt[1][1]), int(bpt[1][0])],
                    ]
                except Exception:
                    return bpt

            b_candidates = [b_native, _swap_b(b_native)]
            b = b_candidates[0]

            public_inputs_int = [int(x) for x in public_inputs]

            # Privacy Update:
            # Expected public inputs: [dataProofId, modelHash, timestamp, predictionCommitment]
            # predictionCommitment is the 4th element (index 3)
            if len(public_inputs_int) < 4:
                return {
                    "success": False,
                    "error": "invalid_public_inputs_length_for_privacy",
                }

            prediction_commitment_int = public_inputs_int[3]
            prediction_commitment_bytes = prediction_commitment_int.to_bytes(
                32, byteorder="big"
            )

            logger.info(
                f"🔍 PREDICTION PROOF: dataProofId={data_proof_id_onchain}, commitment={hex(prediction_commitment_int)[:20]}..."
            )

            nonce = self.web3.eth.get_transaction_count(pred_signer_addr, "pending")

            # Pre-simulation and gas estimation
            def _estimate_with_b(bpt):
                return self.pdm_contract.functions.submitPredictionProof(
                    int(data_proof_id_onchain),
                    model_commitment,
                    prediction_commitment_bytes,
                    [a[0], a[1]],
                    [[bpt[0][0], bpt[0][1]], [bpt[1][0], bpt[1][1]]],
                    [c[0], c[1]],
                    public_inputs_int,
                ).estimate_gas({"from": pred_signer_addr})

            sim_ok = False
            sim_err_reason = None
            pred_gas_estimate = None
            for b_try in b_candidates:
                try:
                    pred_gas_estimate = _estimate_with_b(b_try)
                    b = b_try
                    sim_ok = True
                    break
                except Exception as sim_err:
                    sim_err_reason = self._extract_revert_reason(sim_err)
                    continue
            if not sim_ok:
                logger.error(f"❌ Prediction tx simulation failed: {sim_err_reason}")
                return {
                    "success": False,
                    "error": f"simulation_failed: {sim_err_reason}",
                }

            pred_gas_limit = int(
                pred_gas_estimate * BlockchainConfig.GAS_ESTIMATION_BUFFER
            )
            logger.info(
                f"⛽ Dynamic gas (prediction): {pred_gas_estimate} → {pred_gas_limit} (+{int((BlockchainConfig.GAS_ESTIMATION_BUFFER - 1) * 100)}%)"
            )

            pred_contract_fn = self.pdm_contract.functions.submitPredictionProof(
                int(data_proof_id_onchain),
                model_commitment,
                prediction_commitment_bytes,
                [a[0], a[1]],
                [[b[0][0], b[0][1]], [b[1][0], b[1][1]]],
                [c[0], c[1]],
                public_inputs_int,
            )

            # Smart Account route (type-113) or EOA fallback
            eng_smart_acct = (self.role_wallets.get("ENGINEER") or {}).get(
                "smart_account"
            )
            eng_has_session = "ENGINEER" in self._ephemeral_session_keys

            if eng_smart_acct and eng_has_session and ZKSYNC2_AVAILABLE:
                sa_result = self._send_as_smart_account(
                    pred_contract_fn, eng_smart_acct, "ENGINEER", pred_gas_limit
                )
                tx_hash = bytes.fromhex(sa_result["tx_hash"].replace("0x", ""))
                receipt = sa_result["receipt"]
            else:
                tx = pred_contract_fn.build_transaction(
                    {
                        "from": pred_signer_addr,
                        "nonce": nonce,
                        "gas": pred_gas_limit,
                        "gasPrice": self._get_gas_price(),
                    }
                )
                signed_tx = self.web3.eth.account.sign_transaction(
                    tx, private_key=pred_signer_pk
                )
                tx_hash = self.web3.eth.send_raw_transaction(signed_tx.raw_transaction)
                receipt = self.web3.eth.wait_for_transaction_receipt(
                    tx_hash, timeout=BlockchainConfig.TRANSACTION_TIMEOUT
                )

            logger.info(
                f"✅ Prediction proof TX sent: {tx_hash.hex() if isinstance(tx_hash, (bytes, bytearray)) else tx_hash}"
            )
            if receipt.status == 1:
                proof_id = self._extract_proof_id_from_receipt(receipt)
                logger.info(
                    f"✅ Prediction proof submitted! proofId={proof_id}, block={receipt.blockNumber}"
                )
                return {
                    "success": True,
                    "proof_id": proof_id,
                    "tx_hash": tx_hash.hex(),
                    "block_number": receipt.blockNumber,
                    "gas_used": receipt.gasUsed,
                }
            else:
                return {
                    "success": False,
                    "error": f"Transaction failed - Status: {receipt.status}",
                }
        except Exception as e:
            logger.error(f"Prediction proof submission error: {e}")
            return {"success": False, "error": str(e)}

    def submit_prediction_proof_automated(self, proof_data: dict) -> dict:
        """
        Submit prediction proof using dedicated automation wallet.
        Used when Chainlink Automation triggers the flow.
        """
        try:
            automation_key = self._normalize_raw_private_key(
                os.getenv("CHAINLINK_AUTOMATION_PRIVATE_KEY")
            )
            if not automation_key:
                logger.warning(
                    "Automation private key not configured, using admin wallet"
                )
                automation_key = self._get_signer_private_key(self.admin_account)

            automation_account = Account.from_key(automation_key)
            logger.info(f"🤖 Automated submission from: {automation_account.address}")

            # Ensure prediction verifier key is set
            if not self._ensure_prediction_verifier_key():
                return {
                    "success": False,
                    "error": "prediction_verifier_key_not_configured",
                }

            proof = proof_data["proof"]
            public_inputs = proof_data["publicInputs"]

            # Extract proof components
            if "pi_a" in proof:
                a = [int(proof["pi_a"][0]), int(proof["pi_a"][1])]
                b_native = [
                    [int(proof["pi_b"][0][0]), int(proof["pi_b"][0][1])],
                    [int(proof["pi_b"][1][0]), int(proof["pi_b"][1][1])],
                ]
                c = [int(proof["pi_c"][0]), int(proof["pi_c"][1])]
            else:
                a = [int(proof["a"][0]), int(proof["a"][1])]
                b_native = [
                    [int(proof["b"][0][0]), int(proof["b"][0][1])],
                    [int(proof["b"][1][0]), int(proof["b"][1][1])],
                ]
                c = [int(proof["c"][0]), int(proof["c"][1])]

            public_inputs_int = [int(x) for x in public_inputs]

            if len(public_inputs_int) < 4:
                return {"success": False, "error": "invalid_public_inputs_length"}

            prediction_commitment_int = public_inputs_int[3]
            prediction_commitment_bytes = prediction_commitment_int.to_bytes(
                32, byteorder="big"
            )

            data_proof_id = proof_data.get("data_proof_id", public_inputs_int[0])
            model_commitment = proof_data.get("model_commitment") or self.web3.keccak(
                text="LSTM-CNN-v1.0"
            )

            if isinstance(model_commitment, str):
                model_commitment = bytes.fromhex(model_commitment.replace("0x", ""))

            # Build transaction
            nonce = self.web3.eth.get_transaction_count(
                automation_account.address, "pending"
            )

            tx = self.pdm_contract.functions.submitPredictionProof(
                int(data_proof_id),
                model_commitment,
                prediction_commitment_bytes,
                [a[0], a[1]],
                [[b_native[0][0], b_native[0][1]], [b_native[1][0], b_native[1][1]]],
                [c[0], c[1]],
                public_inputs_int,
            ).build_transaction(
                {
                    "from": automation_account.address,
                    "nonce": nonce,
                    "gas": int(
                        self.web3.eth.estimate_gas(
                            {
                                "from": automation_account.address,
                                "to": self.pdm_contract.address,
                            }
                        )
                        * BlockchainConfig.GAS_ESTIMATION_BUFFER
                    ),
                    "gasPrice": self._get_gas_price(),
                }
            )

            # Sign and send
            signed_tx = self.web3.eth.account.sign_transaction(
                tx, private_key=automation_key
            )
            tx_hash = self.web3.eth.send_raw_transaction(signed_tx.raw_transaction)
            logger.info(f"🤖 Automated prediction TX sent: {tx_hash.hex()}")

            receipt = self.web3.eth.wait_for_transaction_receipt(
                tx_hash, timeout=BlockchainConfig.TRANSACTION_TIMEOUT
            )

            if receipt.status == 1:
                proof_id = self._extract_proof_id_from_receipt(receipt)
                logger.info(
                    f"✅ Automated prediction proof submitted! proofId={proof_id}"
                )
                return {
                    "success": True,
                    "proof_id": proof_id,
                    "tx_hash": tx_hash.hex(),
                    "block_number": receipt.blockNumber,
                    "gas_used": receipt.gasUsed,
                    "automated": True,
                }
            else:
                return {
                    "success": False,
                    "error": f"Transaction failed - Status: {receipt.status}",
                }
        except Exception as e:
            logger.error(f"Automated prediction proof submission error: {e}")
            return {"success": False, "error": str(e)}

    def is_ready(self):
        """Sistem hazır mı?"""
        return all([self.web3, self.admin_account, self.pdm_contract])

    def diagnose(self) -> Dict:
        """Ağ/kontrat/konfigürasyon durumunu özetler (hızlı teşhis)."""
        diag: Dict = {
            "rpc_url": self.rpc_url,
            "network_name": self.network_name,
            "web3_connected": False,
            "admin_account": self.admin_account,
            "balance_eth": None,
            "pdm_contract_loaded": False,
            "pdm_contract_address": None,
            "artifacts_present": False,
            "deployment_info_present": False,
        }
        try:
            diag["web3_connected"] = bool(self.web3 and self.web3.is_connected())
        except Exception:
            diag["web3_connected"] = False

        try:
            if self.admin_account and self.web3:
                bal = self.web3.from_wei(
                    self.web3.eth.get_balance(self.admin_account), "ether"
                )
                diag["balance_eth"] = float(bal)
        except Exception:
            pass

        try:
            hybrid_artifacts_path = Path(
                "artifacts-zk/contracts/PdMSystemHybrid.sol/PdMSystemHybrid.json"
            )
            diag["artifacts_present"] = hybrid_artifacts_path.exists()
        except Exception:
            diag["artifacts_present"] = False

        try:
            dep_path = ConfigUtils.get_deployment_info_path()
            diag["deployment_info_present"] = dep_path.exists()
            if dep_path.exists():
                with open(dep_path) as f:
                    dep = json.load(f)
                pdm_addr = (
                    dep.get("contracts", {}).get("PdMSystemHybrid", {}).get("address")
                )
                diag["pdm_deployment_address"] = pdm_addr
        except Exception:
            pass

        try:
            if self.pdm_contract:
                diag["pdm_contract_loaded"] = True
                diag["pdm_contract_address"] = self.pdm_contract.address
        except Exception:
            pass

        # logger.info(f"✅ Diagnose: {diag}")
        return diag

    def prepare_sensor_proof(self, prediction_data: Dict, pdm_id=None) -> Dict:
        """
        Frontend için ZK proof hazırlar ve contract argümanlarını döner.
        Blockchain işlemini backend yapmaz, argümanları frontend'e verir.
        """
        try:
            # 1. Local DB'ye kaydet
            sensor_data = SensorData(
                machine_id=int(prediction_data["machine_id"]),
                air_temp=prediction_data["air_temp"],
                process_temp=prediction_data["process_temp"],
                rotation_speed=int(prediction_data["rotation_speed"]),
                torque=prediction_data["torque"],
                tool_wear=int(prediction_data["tool_wear"]),
                machine_type=prediction_data.get("machine_type", "M"),
                timestamp=int(prediction_data.get("timestamp") or time.time()),
                submitter=prediction_data.get("recorded_by") or "0xFE",
            )

            data_id, data_hash = self.storage_manager.store_sensor_data(
                sensor_data, pdm_id=pdm_id
            )
            storage_location = f"sensor_{data_id}"

            # 2. ZK Proof Oluştur
            sensor_data.data_id = data_id
            proof_data = self.zk_proof_generator.generate_sensor_proof_v2(sensor_data)

            if not proof_data:
                return {"success": False, "error": "ZK proof generation failed"}

            # 3. Contract Argümanlarını Hazırla
            proof = proof_data["proof"]
            public_inputs = proof_data["publicInputs"]

            if "pi_a" in proof:
                # Ethers.js için string'e çeviriyoruz (overflow engeller)
                a = [str(proof["pi_a"][0]), str(proof["pi_a"][1])]
                b = [
                    [str(proof["pi_b"][0][0]), str(proof["pi_b"][0][1])],
                    [str(proof["pi_b"][1][0]), str(proof["pi_b"][1][1])],
                ]
                c = [str(proof["pi_c"][0]), str(proof["pi_c"][1])]
            else:
                a = [str(proof["a"][0]), str(proof["a"][1])]
                b = [
                    [str(proof["b"][0][0]), str(proof["b"][0][1])],
                    [str(proof["b"][1][0]), str(proof["b"][1][1])],
                ]
                c = [str(proof["c"][0]), str(proof["c"][1])]

            public_inputs_int = [int(x) for x in public_inputs]
            if len(public_inputs_int) > 3:
                public_inputs_int = public_inputs_int[:3]

            data_commitment_int = int(public_inputs_int[2])
            commitment_hash = data_commitment_int.to_bytes(32, byteorder="big")

            # String to bytes32 helper
            storage_loc_bytes = storage_location.encode("utf-8")
            if len(storage_loc_bytes) > 32:
                storage_loc_bytes = storage_loc_bytes[:32]
            else:
                storage_loc_bytes = storage_loc_bytes.ljust(32, b"\0")

            return {
                "success": True,
                "record_id": data_id,
                "contract_address": self.pdm_contract.address
                if self.pdm_contract
                else None,
                "proof_args": {
                    "machine_id": int(sensor_data.machine_id),
                    "data_hash_bytes": data_hash,  # Frontend should handle hex conversion helper if needed, but ethers expects bytes/hex string
                    "commitment_hash_bytes": "0x" + commitment_hash.hex(),
                    "storage_location_bytes": "0x" + storage_loc_bytes.hex(),
                    "a": a,
                    "b": b,
                    "c": c,
                    "public_inputs": [
                        str(x) for x in public_inputs_int
                    ],  # String listesi olarak dön
                },
            }

        except Exception as e:
            logger.error(f"Prepare proof error: {e}")
            return {"success": False, "error": str(e)}

    def submit_sensor_data_hybrid(self, prediction_data: Dict, pdm_id=None) -> Dict:
        """
        Hibrit yaklaşımla sensör verisi gönder
        1. Local DB'ye kaydet
        2. ZK proof oluştur
        3. Blockchain'e proof gönder
        """
        try:
            # logger.info("Starting hybrid sensor data submission...")

            actor_role = prediction_data.get("actor_role")
            recorded_by = prediction_data.get("recorded_by")
            signer_info = self._resolve_signer(actor_role, recorded_by)
            if not signer_info:
                return {
                    "success": False,
                    "error": "signer_not_configured",
                    "details": "No private key configured for the requested role/address",
                }
            signer_address = signer_info["address"]
            signer_private_key = self._get_signer_private_key(signer_address)

            sensor_data = SensorData(
                machine_id=int(prediction_data["machine_id"]),
                air_temp=prediction_data["air_temp"],
                process_temp=prediction_data["process_temp"],
                rotation_speed=int(prediction_data["rotation_speed"]),
                torque=prediction_data["torque"],
                tool_wear=int(prediction_data["tool_wear"]),
                machine_type=prediction_data.get("machine_type", "M"),
                timestamp=int(prediction_data.get("timestamp") or time.time()),
                submitter=recorded_by or signer_address,
            )

            # logger.info("Veri depolanıyor (PdM DB mevcutsa öncelikli)...")
            data_id, data_hash = self.storage_manager.store_sensor_data(
                sensor_data, pdm_id=pdm_id
            )
            storage_location = f"sensor_{data_id}"

            # logger.info("Generating ZK proof...")
            sensor_data.data_id = data_id
            proof_data = self.zk_proof_generator.generate_sensor_proof_v2(sensor_data)

            if not proof_data:
                return {"success": False, "error": "ZK proof generation failed"}

            blockchain_result: Dict[str, Any] = {"success": False}

            if self.is_ready():
                # logger.info("Submitting proof to blockchain...")
                blockchain_result = self._submit_sensor_proof_to_blockchain(
                    sensor_data,
                    data_hash,
                    storage_location,
                    proof_data,
                    signer_address=signer_address,
                    signer_private_key=signer_private_key,
                )
                if blockchain_result.get("success"):
                    self.storage_manager.update_blockchain_proof_id(
                        "sensor_data",
                        data_id,
                        blockchain_result.get("proof_id"),
                        blockchain_result.get("tx_hash"),
                    )
            else:
                logger.warning("Blockchain not ready - data stored locally only")

            # Compute overall status and success
            blockchain_attempted = self.is_ready()
            blockchain_ok = bool(blockchain_result.get("success"))
            status = (
                "onchain_success"
                if blockchain_attempted and blockchain_ok
                else "onchain_failed"
                if blockchain_attempted and not blockchain_ok
                else "local_only"
            )

            result: Dict[str, Any] = {
                "success": (blockchain_ok if blockchain_attempted else True),
                "status": status,
                "storage_type": "hybrid",
                "local_data_id": data_id,
                "data_hash": data_hash,
                "storage_location": storage_location,
                "zk_proof_generated": True,
                "blockchain_submitted": blockchain_ok,
                "tx_hash": blockchain_result.get("tx_hash", "N/A"),
                "block_number": blockchain_result.get("block_number", "N/A"),
                "zk_proof_hash": blockchain_result.get("zk_proof_hash", "N/A"),
            }

            if blockchain_result.get("success"):
                result.update(
                    {
                        "blockchain_proof_id": blockchain_result.get("proof_id"),
                        "gas_used": blockchain_result.get("gas_used"),
                    }
                )

            try:
                success_value = blockchain_result.get("success", False)

                # Local DB (pdm_hybrid_storage.db) güncellemesi
                self.storage_manager.update_blockchain_info(
                    record_id=data_id,
                    success=success_value,
                    tx_hash=result["tx_hash"],
                    proof_id=blockchain_result.get("proof_id"),
                    zk_proof_hash=result.get("zk_proof_hash"),
                )

            except AttributeError as ae:
                logger.debug(
                    f"AttributeError during blockchain info update (likely optional DB missing): {ae}"
                )
            except Exception as db_error:
                logger.warning(f"Could not update blockchain info in DB: {db_error}")

            # Bubble up blockchain error info if on-chain submission was attempted and failed
            if (
                blockchain_attempted
                and not blockchain_ok
                and blockchain_result.get("error")
            ):
                result["error"] = blockchain_result.get("error")

            # logger.info("Hybrid sensor data submission completed!")
            return result

        except Exception as e:
            logger.error(f"Hybrid sensor data submission error: {e}")
            return {
                "success": False,
                "error": str(e),
                "storage_type": "hybrid",
                "local_data_id": None,
                "data_hash": None,
                "storage_location": None,
                "zk_proof_generated": False,
                "blockchain_submitted": False,
                "tx_hash": "N/A",
                "block_number": "N/A",
            }

    def _submit_sensor_proof_to_blockchain(
        self,
        sensor_data: SensorData,
        data_hash: str,
        storage_location: str,
        proof_data: Dict,
        signer_address: Optional[str] = None,
        signer_private_key: Optional[str] = None,
    ) -> Dict:
        """ZK proof'u blockchain'e gönder"""
        try:
            signer_addr = signer_address or self.admin_account

            # Security H7: Don't use self.private_key (removed). Use helper.
            signer_pk = signer_private_key
            if not signer_pk:
                signer_pk = self._get_signer_private_key(signer_addr)

            if not signer_addr or not signer_pk:
                return {"success": False, "error": "signer_missing"}

            # --- Access Control Pre-flight Check ---
            # If smart account is configured, on-chain permissions are on that address
            _op_smart_acct = (self.role_wallets.get("OPERATOR") or {}).get(
                "smart_account"
            )
            access_check_addr = (
                self.web3.to_checksum_address(_op_smart_acct)
                if _op_smart_acct and "OPERATOR" in self._ephemeral_session_keys
                else signer_addr
            )
            try:
                # Load AccessControlRegistry contract if not already loaded
                if not hasattr(self, "access_registry_contract"):
                    access_registry_address = (
                        self.pdm_contract.functions.accessRegistry().call()
                    )
                    access_artifacts_path = Path(
                        "artifacts-zk/contracts/AccessControlRegistry.sol/AccessControlRegistry.json"
                    )
                    with open(access_artifacts_path) as f:
                        access_artifact = json.load(f)
                    self.access_registry_contract = self.web3.eth.contract(
                        address=access_registry_address, abi=access_artifact["abi"]
                    )

                sensor_data_resource = (
                    self.pdm_contract.functions.SENSOR_DATA_RESOURCE().call()
                )
                write_limited_level = 2  # Corresponds to AccessLevel.WRITE_LIMITED (0=NO_ACCESS, 1=READ_ONLY, 2=WRITE_LIMITED)

                has_access, reason = (
                    self.access_registry_contract.functions.checkAccess(
                        access_check_addr, sensor_data_resource, write_limited_level
                    ).call()
                )

                if not has_access:
                    error_msg = f"Access denied for {access_check_addr} on SENSOR_DATA_RESOURCE. Reason: {reason}"
                    logger.error(f"❌ {error_msg}")
                    return {
                        "success": False,
                        "error": "access_control",
                        "details": error_msg,
                    }

                logger.info("✅ Access control check passed.")

            except Exception as ac_error:
                logger.error(f"❌ Failed to perform access control check: {ac_error}")
                # Continue anyway but log the failure, as the main transaction might still work
                # if the check itself was faulty.
            # --- Duplicate data hash check (prevent revert: "Data hash already used") ---
            try:
                if (
                    data_hash
                    and isinstance(data_hash, str)
                    and data_hash.startswith("0x")
                    and self.pdm_contract
                ):
                    already_used = bool(
                        self.pdm_contract.functions.usedDataHashes(
                            bytes.fromhex(data_hash[2:])
                        ).call()
                    )
                    if already_used:
                        logger.error(
                            "❌ Sensor data hash already used on-chain; skipping submission"
                        )
                        return {"success": False, "error": "data_hash_already_used"}
            except Exception as dupe_err:
                logger.warning(f"⚠️ Could not check usedDataHashes: {dupe_err}")

            proof = proof_data["proof"]
            public_inputs = proof_data["publicInputs"]
            # --- Proof verilerini hazırla (Unified) ---

            if "pi_a" in proof:
                a = [int(proof["pi_a"][0]), int(proof["pi_a"][1])]
                b_native = [
                    [int(proof["pi_b"][0][0]), int(proof["pi_b"][0][1])],
                    [int(proof["pi_b"][1][0]), int(proof["pi_b"][1][1])],
                ]
                c = [int(proof["pi_c"][0]), int(proof["pi_c"][1])]
            else:
                a = [int(proof["a"][0]), int(proof["a"][1])]
                b_native = [
                    [int(proof["b"][0][0]), int(proof["b"][0][1])],
                    [int(proof["b"][1][0]), int(proof["b"][1][1])],
                ]
                c = [int(proof["c"][0]), int(proof["c"][1])]

            public_inputs_int = [int(x) for x in public_inputs]
            # Sensor circuit (privacy-first) expects exactly 3 public inputs: [machineId, timestamp, dataCommitment]
            if len(public_inputs_int) > 3:
                public_inputs_int = public_inputs_int[:3]

            # dataCommitment is the 3rd public input (Poseidon hash of sensor values)
            data_commitment_int = int(public_inputs_int[2])
            # Convert to bytes32 for contract call
            commitment_hash = data_commitment_int.to_bytes(32, byteorder="big")

            # --- DEBUG LOG ---
            print("\n" + "=" * 70)
            print("🔍 PREPARING SENSOR PROOF TRANSACTION")
            print("=" * 70)
            print(f"   machineId: {sensor_data.machine_id}")
            print(f"   timestamp: {public_inputs_int[1]}")
            print(f"   dataHash: {data_hash}")
            print(f"   commitmentHash: {commitment_hash.hex()}")
            print(f"   storageLocation: {storage_location}")
            print(f"   sensorCount: 1")
            # b noktası coordinates [x, y] formatında gelir.
            # Ancak Solidity verifier genelde bunları [x1, x0] şeklinde isteyebilir, VEYA b[0] ve b[1] yer değişmiş (swapped) olabilir.

            # Robust Strategy: Try both formats via simulation
            def _swap_b(bpt):
                return [[bpt[0][1], bpt[0][0]], [bpt[1][1], bpt[1][0]]]

            b_candidates = [b_native, _swap_b(b_native)]
            b = b_candidates[0]  # Default to native if both fail (unlikely)

            # Pre-simulation loop to find correct G2 format
            print("🧪 Testing transaction simulation (G2 format check)...")
            sim_ok = False
            sim_err_reason = None

            for i, b_try in enumerate(b_candidates):
                try:
                    # Try simulation with this b
                    gas_estimate = self.pdm_contract.functions.submitSensorDataProof(
                        int(sensor_data.machine_id),
                        bytes.fromhex(data_hash[2:]),
                        commitment_hash,
                        self._string_to_bytes32(storage_location),
                        1,
                        [a[0], a[1]],
                        [[b_try[0][0], b_try[0][1]], [b_try[1][0], b_try[1][1]]],
                        [c[0], c[1]],
                        public_inputs_int,
                    ).estimate_gas({"from": signer_addr})

                    print(
                        f"✅ Simulation passed with G2-Format-{i}! Gas: {gas_estimate}"
                    )
                    b = b_try
                    sim_ok = True
                    break
                except Exception as sim_err:
                    reason = self._extract_revert_reason(sim_err)
                    sim_err_reason = reason
                    # Continue to next candidate

            if not sim_ok:
                print(f"❌ ALL SIMULATIONS FAILED. Last Reason: {sim_err_reason}")
                logger.error(f"Sensor tx simulation failed: {sim_err_reason}")
                return {
                    "success": False,
                    "error": f"simulation_failed: {sim_err_reason}",
                }

            gas_limit = int(gas_estimate * BlockchainConfig.GAS_ESTIMATION_BUFFER)
            logger.info(
                f"\u26fd Dynamic gas (sensor): {gas_estimate} \u2192 {gas_limit} (+{int((BlockchainConfig.GAS_ESTIMATION_BUFFER - 1) * 100)}%)"
            )
            contract_fn = self.pdm_contract.functions.submitSensorDataProof(
                int(sensor_data.machine_id),
                bytes.fromhex(data_hash[2:]),
                commitment_hash,
                self._string_to_bytes32(storage_location),
                1,
                [a[0], a[1]],
                [[b[0][0], b[0][1]], [b[1][0], b[1][1]]],
                [c[0], c[1]],
                public_inputs_int,
            )

            # !CALL_MARK
            try:
                proof_id = contract_fn.call({"from": signer_addr})
            except Exception as call_error:
                logger.warning(f"❌ Call failed (reason): {call_error}")
                proof_id = None

            # Smart Account route (type-113) or EOA fallback
            nonce = self.web3.eth.get_transaction_count(signer_addr, "pending")
            smart_account_addr = (self.role_wallets.get("OPERATOR") or {}).get(
                "smart_account"
            )
            has_session_key = "OPERATOR" in self._ephemeral_session_keys

            if smart_account_addr and has_session_key and ZKSYNC2_AVAILABLE:
                sa_result = self._send_as_smart_account(
                    contract_fn, smart_account_addr, "OPERATOR", gas_limit
                )
                tx_hash = bytes.fromhex(sa_result["tx_hash"].replace("0x", ""))
                receipt = sa_result["receipt"]
            else:
                submit_proof_tx = contract_fn.build_transaction(
                    {
                        "from": signer_addr,
                        "nonce": nonce,
                        "gas": gas_limit,
                        "gasPrice": self._get_gas_price(),
                    }
                )
                signed_tx = self.web3.eth.account.sign_transaction(
                    submit_proof_tx, private_key=signer_pk
                )
                tx_hash = self.web3.eth.send_raw_transaction(signed_tx.raw_transaction)
                receipt = self.web3.eth.wait_for_transaction_receipt(
                    tx_hash, timeout=BlockchainConfig.TRANSACTION_TIMEOUT
                )

            if receipt.status == 1:
                if proof_id is None:
                    proof_id = self._extract_proof_id_from_receipt(receipt)
                zk_hash_hex = None
                try:
                    if proof_id:
                        sp = self.pdm_contract.functions.sensorProofs(
                            int(proof_id)
                        ).call()
                        # struct SensorDataProof: index 7 is zkProofHash
                        if isinstance(sp, (list, tuple)) and len(sp) >= 8:
                            zk_val = sp[7]
                            try:
                                # bytes32 -> hex
                                zk_hash_hex = (
                                    self.web3.to_hex(zk_val)
                                    if hasattr(self.web3, "to_hex")
                                    else (
                                        zk_val.hex()
                                        if hasattr(zk_val, "hex")
                                        else str(zk_val)
                                    )
                                )
                            except Exception:
                                zk_hash_hex = (
                                    zk_val.hex()
                                    if hasattr(zk_val, "hex")
                                    else str(zk_val)
                                )
                except Exception:
                    zk_hash_hex = None
                return {
                    "success": True,
                    "proof_id": proof_id,
                    "tx_hash": tx_hash.hex(),
                    "block_number": receipt.blockNumber,
                    "gas_used": receipt.gasUsed,
                    "zk_proof_hash": zk_hash_hex or "N/A",
                }
            else:
                return {
                    "success": False,
                    "error": f"Transaction failed - Status: {receipt.status}",
                }

        except Exception as e:
            logger.error(f"❌ Blockchain proof submission error: {e}")
            return {"success": False, "error": str(e)}

    # ─────────────────────────────────────────────────────────────────
    # YENİ: Arıza / Eğitim / Rapor ZK Proof Blockchain Kaydı
    # ─────────────────────────────────────────────────────────────────

    def _parse_proof_components(self, proof_data: Dict):
        """Proof dict'inden a, b_native, c bileşenlerini çıkar."""
        proof = proof_data["proof"]
        if "pi_a" in proof:
            a = [int(proof["pi_a"][0]), int(proof["pi_a"][1])]
            b_native = [
                [int(proof["pi_b"][0][0]), int(proof["pi_b"][0][1])],
                [int(proof["pi_b"][1][0]), int(proof["pi_b"][1][1])],
            ]
            c = [int(proof["pi_c"][0]), int(proof["pi_c"][1])]
        else:
            a = [int(proof["a"][0]), int(proof["a"][1])]
            b_native = [
                [int(proof["b"][0][0]), int(proof["b"][0][1])],
                [int(proof["b"][1][0]), int(proof["b"][1][1])],
            ]
            c = [int(proof["c"][0]), int(proof["c"][1])]
        public_inputs_int = [int(x) for x in proof_data["publicInputs"]]
        return a, b_native, c, public_inputs_int

    def _build_and_send_tx(
        self, contract_fn, signer_addr: str, signer_pk: str, gas_limit: int
    ) -> Dict:
        """Önce call() ile simulate et (revert sebebini yakala), sonra imzala ve gönder."""
        # Simulation: revert sebebini erken yakala
        try:
            contract_fn.call({"from": signer_addr})
        except Exception as sim_err:
            reason = self._extract_revert_reason(sim_err)
            logger.error(f"TX simulation failed: {reason}")
            return {"success": False, "error": f"simulation_failed: {reason}"}

        nonce = self.web3.eth.get_transaction_count(signer_addr, "pending")
        tx = contract_fn.build_transaction(
            {
                "from": signer_addr,
                "nonce": nonce,
                "gas": gas_limit,
                "gasPrice": self._get_gas_price(),
            }
        )
        signed = self.web3.eth.account.sign_transaction(tx, private_key=signer_pk)
        tx_hash = self.web3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.web3.eth.wait_for_transaction_receipt(
            tx_hash, timeout=BlockchainConfig.TRANSACTION_TIMEOUT
        )
        if receipt.status == 1:
            return {
                "success": True,
                "tx_hash": tx_hash.hex(),
                "block_number": receipt.blockNumber,
                "gas_used": receipt.gasUsed,
            }
        return {
            "success": False,
            "error": f"Transaction failed - Status: {receipt.status}",
        }

    # ────────────────────────────────────────────────────────────────
    # Generic circuit VK helpers (FAULT_RECORD=4, TRAINING=5, REPORT=6)
    # ────────────────────────────────────────────────────────────────

    def _is_circuit_vk_set(self, circuit_type_id: int) -> bool:
        """Verifier kontratında ilgili circuit'in VK'sinin set edilip edilmediğini kontrol et."""
        contract = self._get_verifier_contract()
        if not contract:
            return False
        try:
            vk_info = contract.functions.circuitKeys(circuit_type_id).call()
            return bool(vk_info[-1])  # isSet son alan
        except Exception as e:
            logger.warning(f"circuitKeys({circuit_type_id}) okunamadı: {e}")
            return False

    def _upload_circuit_vk(self, circuit_type_id: int, circuit_name: str) -> bool:
        """
        Verilen circuit'in VK'sini on-chain verifier'a yükle (setCircuitVerifyingKey).
        Tek kaynak: {circuit_name}.zkey — vk.json her zaman buradan taze export edilir.
        circuit_name: 'batch_sensor_proof' | 'fault_record_proof' | 'training_record_proof' | 'report_record_proof'
        circuit_type_id: 7 | 4 | 5 | 6  (UnifiedGroth16Verifier.CircuitType enum)
        VK zaten set edilmişse setCircuitVerifyingKey REVERT eder; o durumda _propose_vk_change kullan.
        """
        contract = self._get_verifier_contract()
        if not contract:
            return False

        temp_dir = getattr(self.zk_proof_generator, "temp_dir", Path("temp/zk_proofs"))
        # 'fault_record_proof' → 'fault_record_verification_key.json'
        vk_name = circuit_name.replace("_proof", "") + "_verification_key.json"
        vk_path = temp_dir / vk_name
        zkey_path = temp_dir / f"{circuit_name}.zkey"

        # Export VK from zkey if: (a) vk.json missing, or (b) zkey is newer than vk.json
        needs_export = not vk_path.exists()
        if not needs_export and zkey_path.exists():
            try:
                if zkey_path.stat().st_mtime > vk_path.stat().st_mtime + 1.0:
                    needs_export = True  # zkey was regenerated; vk.json is stale
            except Exception:
                pass

        if needs_export:
            if not zkey_path.exists():
                logger.error(
                    f"VK yüklenemedi: zkey yok ({zkey_path}). "
                    f"İlk çalıştırmada ZK proof üret ki setup oluşsun."
                )
                return False
            cmd = self.zk_proof_generator._build_snarkjs_command(
                "zkey", "export", "verificationkey", str(zkey_path), str(vk_path)
            )
            if not cmd:
                logger.error("snarkjs bulunamadı, VK export edilemedi")
                return False
            export_result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
                creationflags=self._no_window_flag,
            )
            if export_result.returncode != 0:
                logger.error(
                    f"VK export başarısız ({circuit_name}): {export_result.stderr.strip()}"
                )
                return False

        try:
            vk_json = json.loads(vk_path.read_text(encoding="utf-8"))
            _norm = HybridBlockchainHandler._norm_value
            alpha = (_norm(vk_json["vk_alpha_1"][0]), _norm(vk_json["vk_alpha_1"][1]))

            def _g2(p, swap: bool = False):
                return HybridBlockchainHandler._format_g2(p, swap=swap)

            # Primary candidate: snarkjs/native order (swap=False)
            beta = _g2(vk_json["vk_beta_2"], swap=False)
            gamma = _g2(vk_json["vk_gamma_2"], swap=False)
            delta = _g2(vk_json["vk_delta_2"], swap=False)
            ic = [(_norm(p[0]), _norm(p[1])) for p in vk_json["IC"]]

            # Secondary candidate: swapped G2 order (for legacy/deployed verifier mismatch cases)
            beta_alt = _g2(vk_json["vk_beta_2"], swap=True)
            gamma_alt = _g2(vk_json["vk_gamma_2"], swap=True)
            delta_alt = _g2(vk_json["vk_delta_2"], swap=True)

            pk = self._get_signer_private_key(self.admin_account)
            gas = getattr(BlockchainConfig, "VK_UPLOAD_GAS_LIMIT", 3_000_000)

            def _send_vk_tx(fn):
                nonce = self.web3.eth.get_transaction_count(
                    self.admin_account, "pending"
                )
                built = fn.build_transaction(
                    {
                        "from": self.admin_account,
                        "nonce": nonce,
                        "gas": gas,
                        "gasPrice": self._get_gas_price(),
                    }
                )
                signed = self.web3.eth.account.sign_transaction(built, private_key=pk)
                h = self.web3.eth.send_raw_transaction(signed.raw_transaction)
                return self.web3.eth.wait_for_transaction_receipt(
                    h, timeout=BlockchainConfig.TRANSACTION_TIMEOUT
                )

            # Try direct set first (works on new contract with no require(!isSet)).
            # If set/propose+execute with native ordering does not produce valid proofs,
            # we'll retry once with alternate (swapped) G2 VK ordering.
            vk_variant = "native"
            receipt = _send_vk_tx(
                contract.functions.setCircuitVerifyingKey(
                    circuit_type_id, alpha, beta, gamma, delta, ic
                )
            )
            if receipt.status != 1:
                # Likely "VK already set" revert — use propose+execute flow (instant with delay=0).
                # Build a separate contract instance with minimal ABI that includes legacy
                # proposeVKChange/executeVKChange (may be absent from current artifacts ABI).
                logger.info(
                    f"setCircuitVerifyingKey reverted for circuit {circuit_type_id} "
                    f"— using propose+execute flow..."
                )
                _LEGACY_VK_ABI = [
                    {
                        "name": "proposeVKChange",
                        "type": "function",
                        "stateMutability": "nonpayable",
                        "inputs": [
                            {"name": "circuitType", "type": "uint8"},
                            {
                                "name": "alpha",
                                "type": "tuple",
                                "components": [
                                    {"name": "X", "type": "uint256"},
                                    {"name": "Y", "type": "uint256"},
                                ],
                            },
                            {
                                "name": "beta",
                                "type": "tuple",
                                "components": [
                                    {"name": "X", "type": "uint256[2]"},
                                    {"name": "Y", "type": "uint256[2]"},
                                ],
                            },
                            {
                                "name": "gamma",
                                "type": "tuple",
                                "components": [
                                    {"name": "X", "type": "uint256[2]"},
                                    {"name": "Y", "type": "uint256[2]"},
                                ],
                            },
                            {
                                "name": "delta",
                                "type": "tuple",
                                "components": [
                                    {"name": "X", "type": "uint256[2]"},
                                    {"name": "Y", "type": "uint256[2]"},
                                ],
                            },
                            {
                                "name": "IC",
                                "type": "tuple[]",
                                "components": [
                                    {"name": "X", "type": "uint256"},
                                    {"name": "Y", "type": "uint256"},
                                ],
                            },
                        ],
                        "outputs": [],
                    },
                    {
                        "name": "executeVKChange",
                        "type": "function",
                        "stateMutability": "nonpayable",
                        "inputs": [{"name": "circuitType", "type": "uint8"}],
                        "outputs": [],
                    },
                ]
                verifier_addr = contract.address
                legacy = self.web3.eth.contract(
                    address=self.web3.to_checksum_address(verifier_addr),
                    abi=_LEGACY_VK_ABI,
                )
                r1 = _send_vk_tx(
                    legacy.functions.proposeVKChange(
                        circuit_type_id, alpha, beta, gamma, delta, ic
                    )
                )
                if r1.status != 1:
                    logger.error(
                        f"proposeVKChange TX başarısız: circuit {circuit_type_id}"
                    )
                    return False
                receipt = _send_vk_tx(legacy.functions.executeVKChange(circuit_type_id))
                if receipt.status != 1:
                    logger.error(
                        f"executeVKChange TX başarısız: circuit {circuit_type_id}"
                    )
                    return False

            # Special handling for batch circuit: verify proof with both B orderings.
            # If both fail, re-upload VK once using alternate G2 ordering.
            if circuit_type_id == 7:
                try:
                    proof_file = temp_dir / "batch_sensor_proof_proof.json"
                    public_file = temp_dir / "batch_sensor_proof_public.json"
                    if proof_file.exists() and public_file.exists():
                        proof_json = json.loads(proof_file.read_text(encoding="utf-8"))
                        pub_json = json.loads(public_file.read_text(encoding="utf-8"))

                        def _to_int(v):
                            return int(v)

                        if "pi_a" in proof_json:
                            a_chk = [
                                _to_int(proof_json["pi_a"][0]),
                                _to_int(proof_json["pi_a"][1]),
                            ]
                            b_chk_native = [
                                [
                                    _to_int(proof_json["pi_b"][0][0]),
                                    _to_int(proof_json["pi_b"][0][1]),
                                ],
                                [
                                    _to_int(proof_json["pi_b"][1][0]),
                                    _to_int(proof_json["pi_b"][1][1]),
                                ],
                            ]
                            c_chk = [
                                _to_int(proof_json["pi_c"][0]),
                                _to_int(proof_json["pi_c"][1]),
                            ]
                        else:
                            a_chk = [
                                _to_int(proof_json["a"][0]),
                                _to_int(proof_json["a"][1]),
                            ]
                            b_chk_native = [
                                [
                                    _to_int(proof_json["b"][0][0]),
                                    _to_int(proof_json["b"][0][1]),
                                ],
                                [
                                    _to_int(proof_json["b"][1][0]),
                                    _to_int(proof_json["b"][1][1]),
                                ],
                            ]
                            c_chk = [
                                _to_int(proof_json["c"][0]),
                                _to_int(proof_json["c"][1]),
                            ]

                        pub_chk = [_to_int(pub_json[0]), _to_int(pub_json[1])]
                        b_chk_swapped = [
                            [b_chk_native[0][1], b_chk_native[0][0]],
                            [b_chk_native[1][1], b_chk_native[1][0]],
                        ]

                        ok_native = contract.functions.verifyBatchSensorProof(
                            [a_chk[0], a_chk[1]],
                            b_chk_native,
                            [c_chk[0], c_chk[1]],
                            pub_chk,
                        ).call()
                        ok_swapped = contract.functions.verifyBatchSensorProof(
                            [a_chk[0], a_chk[1]],
                            b_chk_swapped,
                            [c_chk[0], c_chk[1]],
                            pub_chk,
                        ).call()

                        if not ok_native and not ok_swapped and vk_variant == "native":
                            logger.warning(
                                "Batch verify still failing after native VK upload; "
                                "retrying VK upload with alternate swapped G2 ordering..."
                            )
                            # Re-upload using alternate VK ordering
                            try:
                                receipt_alt = _send_vk_tx(
                                    contract.functions.setCircuitVerifyingKey(
                                        circuit_type_id,
                                        alpha,
                                        beta_alt,
                                        gamma_alt,
                                        delta_alt,
                                        ic,
                                    )
                                )
                                if receipt_alt.status != 1:
                                    logger.info(
                                        f"setCircuitVerifyingKey (alt) reverted for circuit {circuit_type_id} "
                                        f"— using propose+execute flow..."
                                    )
                                    _LEGACY_VK_ABI = [
                                        {
                                            "name": "proposeVKChange",
                                            "type": "function",
                                            "stateMutability": "nonpayable",
                                            "inputs": [
                                                {
                                                    "name": "circuitType",
                                                    "type": "uint8",
                                                },
                                                {
                                                    "name": "alpha",
                                                    "type": "tuple",
                                                    "components": [
                                                        {
                                                            "name": "X",
                                                            "type": "uint256",
                                                        },
                                                        {
                                                            "name": "Y",
                                                            "type": "uint256",
                                                        },
                                                    ],
                                                },
                                                {
                                                    "name": "beta",
                                                    "type": "tuple",
                                                    "components": [
                                                        {
                                                            "name": "X",
                                                            "type": "uint256[2]",
                                                        },
                                                        {
                                                            "name": "Y",
                                                            "type": "uint256[2]",
                                                        },
                                                    ],
                                                },
                                                {
                                                    "name": "gamma",
                                                    "type": "tuple",
                                                    "components": [
                                                        {
                                                            "name": "X",
                                                            "type": "uint256[2]",
                                                        },
                                                        {
                                                            "name": "Y",
                                                            "type": "uint256[2]",
                                                        },
                                                    ],
                                                },
                                                {
                                                    "name": "delta",
                                                    "type": "tuple",
                                                    "components": [
                                                        {
                                                            "name": "X",
                                                            "type": "uint256[2]",
                                                        },
                                                        {
                                                            "name": "Y",
                                                            "type": "uint256[2]",
                                                        },
                                                    ],
                                                },
                                                {
                                                    "name": "IC",
                                                    "type": "tuple[]",
                                                    "components": [
                                                        {
                                                            "name": "X",
                                                            "type": "uint256",
                                                        },
                                                        {
                                                            "name": "Y",
                                                            "type": "uint256",
                                                        },
                                                    ],
                                                },
                                            ],
                                            "outputs": [],
                                        },
                                        {
                                            "name": "executeVKChange",
                                            "type": "function",
                                            "stateMutability": "nonpayable",
                                            "inputs": [
                                                {"name": "circuitType", "type": "uint8"}
                                            ],
                                            "outputs": [],
                                        },
                                    ]
                                    verifier_addr = contract.address
                                    legacy = self.web3.eth.contract(
                                        address=self.web3.to_checksum_address(
                                            verifier_addr
                                        ),
                                        abi=_LEGACY_VK_ABI,
                                    )
                                    r1_alt = _send_vk_tx(
                                        legacy.functions.proposeVKChange(
                                            circuit_type_id,
                                            alpha,
                                            beta_alt,
                                            gamma_alt,
                                            delta_alt,
                                            ic,
                                        )
                                    )
                                    if r1_alt.status != 1:
                                        logger.error(
                                            f"proposeVKChange (alt) TX başarısız: circuit {circuit_type_id}"
                                        )
                                        return False
                                    receipt_alt = _send_vk_tx(
                                        legacy.functions.executeVKChange(
                                            circuit_type_id
                                        )
                                    )
                                    if receipt_alt.status != 1:
                                        logger.error(
                                            f"executeVKChange (alt) TX başarısız: circuit {circuit_type_id}"
                                        )
                                        return False
                                receipt = receipt_alt
                                vk_variant = "swapped"
                                logger.info(
                                    "Batch VK re-uploaded with alternate swapped G2 ordering."
                                )
                            except Exception as alt_err:
                                logger.error(
                                    f"Alternate VK upload failed for batch circuit: {alt_err}"
                                )
                                return False
                except Exception as probe_err:
                    logger.warning(
                        f"Batch VK post-upload probe skipped/failed: {probe_err}"
                    )

            logger.info(
                f"VK yüklendi: circuit_type={circuit_type_id} ({circuit_name}), "
                f"variant={vk_variant}, block={receipt.blockNumber}"
            )
            try:
                if zkey_path.exists():
                    marker_path = temp_dir / f"{circuit_name}.vk_mtime"
                    marker_path.write_text(
                        str(zkey_path.stat().st_mtime), encoding="utf-8"
                    )
            except Exception:
                pass
            return True
        except Exception as e:
            logger.error(f"VK yükleme hatası (circuit {circuit_type_id}): {e}")
            return False

    def _ensure_circuit_vk(self, circuit_type_id: int, circuit_name: str) -> bool:
        """VK on-chain set değilse yükle; zkey güncellenmiş ise anında güncelle."""
        if self._is_circuit_vk_set(circuit_type_id):
            # Staleness check: if local zkey was regenerated after the VK was last uploaded,
            # update on-chain VK immediately (setCircuitVerifyingKey allows overwriting).
            temp_dir = getattr(
                self.zk_proof_generator, "temp_dir", Path("temp/zk_proofs")
            )
            zkey_path = temp_dir / f"{circuit_name}.zkey"
            marker_path = temp_dir / f"{circuit_name}.vk_mtime"
            if zkey_path.exists():
                if not marker_path.exists():
                    # No marker → first encounter after a clean start or temp dir wipe.
                    # Compare local VK IC[0] with on-chain IC[0] to detect stale VK
                    # (the zkey may have been regenerated since the last VK upload).
                    ic_mismatch = False
                    try:
                        vk_name = circuit_name.replace("_proof", "") + "_verification_key.json"
                        vk_path_local = temp_dir / vk_name
                        if vk_path_local.exists():
                            verifier_ic = self._get_verifier_contract()
                            if verifier_ic:
                                on_chain_ic0 = verifier_ic.functions.getICPoint(
                                    circuit_type_id, 0
                                ).call()
                                local_vk_data = json.loads(
                                    vk_path_local.read_text(encoding="utf-8")
                                )
                                local_ic0 = (
                                    int(local_vk_data["IC"][0][0]),
                                    int(local_vk_data["IC"][0][1]),
                                )
                                if local_ic0 != (on_chain_ic0[0], on_chain_ic0[1]):
                                    ic_mismatch = True
                                    logger.warning(
                                        f"[ensure_vk] IC[0] mismatch on first marker check "
                                        f"({circuit_name}) — local zkey was regenerated. "
                                        f"Uploading fresh VK on-chain..."
                                    )
                    except Exception as ic_cmp_e:
                        logger.debug(
                            f"IC comparison skipped ({circuit_name}): {ic_cmp_e}"
                        )
                    if ic_mismatch:
                        return self._upload_circuit_vk(circuit_type_id, circuit_name)
                    try:
                        marker_path.write_text(
                            str(zkey_path.stat().st_mtime), encoding="utf-8"
                        )
                        logger.debug(f"VK mtime marker seeded for {circuit_name}.")
                    except Exception as e:
                        logger.debug(
                            f"Could not seed vk_mtime marker ({circuit_name}): {e}"
                        )
                else:
                    try:
                        stored_mtime = float(
                            marker_path.read_text(encoding="utf-8").strip()
                        )
                        if zkey_path.stat().st_mtime > stored_mtime + 1.0:
                            logger.warning(
                                f"ZKey regenerated since last VK upload ({circuit_name}). "
                                f"On-chain VK is stale — updating immediately..."
                            )
                            return self._upload_circuit_vk(
                                circuit_type_id, circuit_name
                            )
                    except Exception as e:
                        logger.debug(
                            f"VK staleness check skipped ({circuit_name}): {e}"
                        )
            return True
        logger.warning(
            f"Circuit VK set edilmemiş (type={circuit_type_id}, {circuit_name}). "
            f"Yükleniyor..."
        )
        return self._upload_circuit_vk(circuit_type_id, circuit_name)

    def submit_fault_record(
        self,
        machine_id: int,
        data_proof_id: int,
        prediction: int,
        prediction_prob: float,
        actor_role: Optional[str] = None,
        recorded_by: Optional[str] = None,
    ) -> Dict:
        """Arıza tespitini ZK proof ile blockchain'e kaydet."""
        try:
            signer_info = self._resolve_signer(actor_role, recorded_by)
            if not signer_info:
                return {"success": False, "error": "signer_not_configured"}
            signer_address = signer_info["address"]
            # Security H7: private_key artık dict'te tutulmuyor, on-demand alınır
            signer_pk = self._get_signer_private_key(signer_address)
            if not signer_pk:
                return {"success": False, "error": "signer_private_key_missing"}

            if not self._ensure_circuit_vk(4, "fault_record_proof"):
                return {"success": False, "error": "fault_record_vk_not_configured"}

            ts = int(time.time())
            proof_data = self.zk_proof_generator.generate_fault_record_proof(
                machine_id=int(machine_id),
                prediction=int(prediction),
                prediction_prob=float(prediction_prob),
                timestamp=ts,
            )
            if not proof_data:
                return {"success": False, "error": "zk_proof_failed"}

            a, b_native, c, pub = self._parse_proof_components(proof_data)
            if len(pub) > 3:
                pub = pub[:3]

            fault_commitment_bytes = int(pub[2]).to_bytes(32, byteorder="big")

            fn = self.pdm_contract.functions.recordFaultDetection(
                int(machine_id),
                int(data_proof_id),
                fault_commitment_bytes,
                [a[0], a[1]],
                [[b_native[0][0], b_native[0][1]], [b_native[1][0], b_native[1][1]]],
                [c[0], c[1]],
                pub[:3],
            )
            result = self._build_and_send_tx(
                fn,
                signer_address,
                signer_pk,
                getattr(BlockchainConfig, "FAULT_RECORD_GAS_LIMIT", 300000),
            )
            if result.get("success"):
                result["zk_proof_hash"] = (
                    "0x" + hashlib.sha256(str(pub).encode()).hexdigest()
                )
            return result

        except Exception as e:
            logger.error(f"submit_fault_record error: {e}")
            return {"success": False, "error": str(e)}

    def submit_training_record(
        self,
        model_hash_int: int,
        hyperparams: dict,
        actor_role: Optional[str] = None,
        recorded_by: Optional[str] = None,
    ) -> Dict:
        """Model eğitimini ZK proof ile blockchain'e kaydet."""
        try:
            signer_info = self._resolve_signer(actor_role, recorded_by)
            if not signer_info:
                return {"success": False, "error": "signer_not_configured"}
            signer_address = signer_info["address"]
            # Security H7: private_key artık dict'te tutulmuyor, on-demand alınır
            signer_pk = self._get_signer_private_key(signer_address)
            if not signer_pk:
                return {"success": False, "error": "signer_private_key_missing"}

            if not self._ensure_circuit_vk(5, "training_record_proof"):
                return {"success": False, "error": "training_record_vk_not_configured"}

            BN254_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617
            ts = int(time.time())

            proof_data = self.zk_proof_generator.generate_training_record_proof(
                model_hash_int=int(model_hash_int),
                hyperparams=hyperparams,
                timestamp=ts,
            )
            if not proof_data:
                return {"success": False, "error": "zk_proof_failed"}

            a, b_native, c, pub = self._parse_proof_components(proof_data)
            if len(pub) > 3:
                pub = pub[:3]

            model_hash_bytes = (int(model_hash_int) % BN254_PRIME).to_bytes(
                32, byteorder="big"
            )
            hyperparams_commitment_bytes = int(pub[2]).to_bytes(32, byteorder="big")

            fn = self.pdm_contract.functions.recordModelTraining(
                model_hash_bytes,
                hyperparams_commitment_bytes,
                [a[0], a[1]],
                [[b_native[0][0], b_native[0][1]], [b_native[1][0], b_native[1][1]]],
                [c[0], c[1]],
                pub[:3],
            )
            result = self._build_and_send_tx(
                fn,
                signer_address,
                signer_pk,
                getattr(BlockchainConfig, "TRAINING_RECORD_GAS_LIMIT", 300000),
            )
            if result.get("success"):
                result["zk_proof_hash"] = (
                    "0x" + hashlib.sha256(str(pub).encode()).hexdigest()
                )
            return result

        except Exception as e:
            logger.error(f"submit_training_record error: {e}")
            return {"success": False, "error": str(e)}

    def submit_report_record(
        self,
        report_hash_hex: str,
        machine_count: int = 1,
        actor_role: Optional[str] = None,
        recorded_by: Optional[str] = None,
    ) -> Dict:
        """Rapor oluşturmayı ZK proof ile blockchain'e kaydet."""
        try:
            signer_info = self._resolve_signer(actor_role, recorded_by)
            if not signer_info:
                return {"success": False, "error": "signer_not_configured"}
            signer_address = signer_info["address"]
            # Security H7: private_key artık dict'te tutulmuyor, on-demand alınır
            signer_pk = self._get_signer_private_key(signer_address)
            if not signer_pk:
                return {"success": False, "error": "signer_private_key_missing"}

            if not self._ensure_circuit_vk(6, "report_record_proof"):
                return {"success": False, "error": "report_record_vk_not_configured"}

            ts = int(time.time())
            proof_data = self.zk_proof_generator.generate_report_record_proof(
                report_data_hash_hex=report_hash_hex,
                machine_count=int(machine_count),
                timestamp=ts,
            )
            if not proof_data:
                return {"success": False, "error": "zk_proof_failed"}

            a, b_native, c, pub = self._parse_proof_components(proof_data)
            if len(pub) > 2:
                pub = pub[:2]

            report_commitment_bytes = int(pub[1]).to_bytes(32, byteorder="big")

            fn = self.pdm_contract.functions.recordReportGeneration(
                report_commitment_bytes,
                [a[0], a[1]],
                [[b_native[0][0], b_native[0][1]], [b_native[1][0], b_native[1][1]]],
                [c[0], c[1]],
                pub[:2],
            )
            result = self._build_and_send_tx(
                fn,
                signer_address,
                signer_pk,
                getattr(BlockchainConfig, "REPORT_RECORD_GAS_LIMIT", 300000),
            )
            if result.get("success"):
                result["zk_proof_hash"] = (
                    "0x" + hashlib.sha256(str(pub).encode()).hexdigest()
                )
            return result

        except Exception as e:
            logger.error(f"submit_report_record error: {e}")
            return {"success": False, "error": str(e)}

    # ─────────────────────────────────────────────────────────────────────
    # BATCH SENSOR SUBMISSION
    # ─────────────────────────────────────────────────────────────────────

    def submit_batch(
        self,
        merkle_root: str,
        record_count: int,
        batch_type: str,
        proof_data: Dict,
        actor_role: Optional[str] = None,
        recorded_by: Optional[str] = None,
    ) -> Dict:
        """Toplu sensör batch'ini ZK proof ile blockchain'e gönder.

        Args:
            merkle_root:  Hex Merkle root (0x... veya 0x-siz)
            record_count: Batch'teki kayıt sayısı
            batch_type:   "SENSOR" | "FAULT"
            proof_data:   ZKProofGenerator.generate_batch_proof() çıktısı
        """
        try:
            from config import BatchConfig

            signer_info = self._resolve_signer(actor_role, recorded_by)
            if not signer_info:
                return {"success": False, "error": "signer_not_configured"}
            signer_address = signer_info["address"]
            signer_pk = self._get_signer_private_key(signer_address)
            if not signer_pk:
                return {"success": False, "error": "signer_private_key_missing"}

            # Fail-fast alignment guard: runtime addresses must match deployment file.
            if not self._check_runtime_contract_alignment():
                logger.error(
                    "Batch submission blocked by contract alignment guard: "
                    f"{self._runtime_contract_mismatch_reason}"
                )
                return {
                    "success": False,
                    "error": (
                        "contract_alignment_mismatch: "
                        f"{self._runtime_contract_mismatch_reason}"
                    ),
                }

            # VK circuit_type=7 (BATCH_SENSOR) için hazır mı?
            if not self._ensure_circuit_vk(7, "batch_sensor_proof"):
                logger.warning(
                    "BATCH_SENSOR VK not ready (stale/pending update or unset); "
                    "skipping batch submission. Run: npm run vk:delay:dev && npm run vk:execute"
                )
                return {"success": False, "error": "batch_sensor_vk_not_ready"}

            # ── Diagnostic: on-chain VK integrity check ──────────────────────
            try:
                verifier_diag = self._get_verifier_contract()
                if not verifier_diag:
                    logger.warning(
                        "[batch VK diag] verifier contract is None — skipping IC check"
                    )
                if verifier_diag:
                    ic_len = verifier_diag.functions.getICLength(7).call()
                    ic0 = verifier_diag.functions.getICPoint(7, 0).call()
                    logger.info(
                        f"[batch VK diag] on-chain IC length={ic_len}, IC[0]=({ic0[0]}, {ic0[1]})"
                    )
                    # Compare with local vk.json IC[0]
                    temp_dir = getattr(self.zk_proof_generator, "temp_dir", None)
                    if temp_dir:
                        vk_path = Path(temp_dir) / "batch_sensor_verification_key.json"
                        if vk_path.exists():
                            local_vk = json.loads(vk_path.read_text(encoding="utf-8"))
                            local_ic0 = (
                                int(local_vk["IC"][0][0]),
                                int(local_vk["IC"][0][1]),
                            )
                            if local_ic0 != (ic0[0], ic0[1]):
                                logger.warning(
                                    f"[batch VK diag] IC[0] MISMATCH — on-chain=({ic0[0]},{ic0[1]}) "
                                    f"local=({local_ic0[0]},{local_ic0[1]}) — VK stale on-chain!"
                                )
                            else:
                                logger.debug(
                                    "[batch VK diag] IC[0] matches local vk.json ✓"
                                )
            except Exception as _diag_e:
                logger.info(
                    f"[batch VK diag] exception: {type(_diag_e).__name__}: {_diag_e}"
                )
            # ─────────────────────────────────────────────────────────────────

            # Proof bileşenlerini ayrıştır
            a, b_native, c, pub = self._parse_proof_components(proof_data)

            # merkle_root hex → bytes32
            root_clean = merkle_root.replace("0x", "").replace("0X", "").zfill(64)
            root_bytes32 = bytes.fromhex(root_clean)

            # Diagnostic: confirm submit target verifier and VK upload target are aligned
            try:
                submit_verifier_addr = (
                    self.pdm_contract.functions.zkVerifier().call()
                    if self.pdm_contract
                    else None
                )
            except Exception:
                submit_verifier_addr = None
            vk_contract = self._get_verifier_contract()
            vk_target_addr = vk_contract.address if vk_contract else None
            logger.info(
                f"[batch target diag] submitBatch.zkVerifier={submit_verifier_addr} | vk_upload_target={vk_target_addr}"
            )

            # publicInputs: [merkleRoot_field (int), batchTimestamp (int)] — 2 eleman
            pub2 = [int(pub[0]), int(pub[1])]

            def _swap_b(bpt):
                return [[bpt[0][1], bpt[0][0]], [bpt[1][1], bpt[1][0]]]

            # Select B coordinate ordering by querying verifyBatchSensorProof view directly.
            # Hardened behavior:
            # - Try native + swapped
            # - Track whether calls reverted or returned false
            # - Fail fast if both candidates are rejected
            verifier = self._get_verifier_contract()
            b_chosen = b_native
            if not verifier:
                logger.warning(
                    "[submit_batch] verifier contract is None — dual-candidate B skipped, using native ordering"
                )

            probe_outcomes = []
            found_valid_b = False
            for idx, b_try in enumerate(
                [b_native, _swap_b(b_native)] if verifier else []
            ):
                label = "native" if idx == 0 else "swapped"
                try:
                    ok = verifier.functions.verifyBatchSensorProof(
                        [a[0], a[1]], b_try, [c[0], c[1]], pub2
                    ).call()
                    probe_outcomes.append(f"{label}:ok={ok}")
                    if ok:
                        found_valid_b = True
                        b_chosen = b_try
                        if b_try is not b_native:
                            logger.info(
                                "Batch B: swapped sub-coordinates verified on-chain — using swapped ordering"
                            )
                        else:
                            logger.debug(
                                "Batch B: native sub-coordinates verified on-chain"
                            )
                        break
                except Exception as ve:
                    reason = self._extract_revert_reason(ve)
                    probe_outcomes.append(f"{label}:revert={reason}")
                    logger.info(
                        f"[batch B diag] verifyBatchSensorProof exception ({label}): {type(ve).__name__}: {reason}"
                    )
                    continue

            if verifier and not found_valid_b:
                details = (
                    " | ".join(probe_outcomes) if probe_outcomes else "no_probe_outcome"
                )
                logger.error(
                    "Batch B-order probe failed: verifyBatchSensorProof rejected both candidates "
                    f"({details})"
                )
                return {
                    "success": False,
                    "error": f"batch_b_probe_failed: {details}",
                }

            fn = self.pdm_contract.functions.submitBatch(
                root_bytes32,
                int(record_count),
                batch_type,
                [a[0], a[1]],
                b_chosen,
                [c[0], c[1]],
                pub2,
            )

            result = self._build_and_send_tx(
                fn,
                signer_address,
                signer_pk,
                getattr(BatchConfig, "BATCH_GAS_LIMIT", 800000),
            )

            # BatchSubmitted event'inden batchId'yi çıkarmaya çalış
            if result.get("success"):
                result["merkle_root"] = merkle_root
                result["record_count"] = record_count
            elif "ZK proof invalid" in str(result.get("error", "")):
                # Proof failed on-chain despite VK being set — likely a VK/zkey mismatch
                # (e.g. zkey was regenerated but on-chain VK was uploaded from old zkey).
                # Update VK immediately via setCircuitVerifyingKey, then retry once with dual-candidate.
                logger.warning(
                    "Batch proof invalid on-chain — likely VK/zkey mismatch. "
                    "Updating BATCH_SENSOR VK immediately..."
                )
                vk_updated = self._upload_circuit_vk(7, "batch_sensor_proof")
                if vk_updated:
                    logger.info(
                        "VK güncellendi — batch TX bir kez yeniden deneniyor (dual B)..."
                    )
                    # Re-run dual-candidate via verifyBatchSensorProof with fresh VK on-chain
                    retry_b = b_native
                    retry_probe_outcomes = []
                    retry_found_valid_b = False
                    for idx, b_try in enumerate([b_native, _swap_b(b_native)]):
                        label = "native" if idx == 0 else "swapped"
                        try:
                            ok = verifier.functions.verifyBatchSensorProof(
                                [a[0], a[1]], b_try, [c[0], c[1]], pub2
                            ).call()
                            retry_probe_outcomes.append(f"{label}:ok={ok}")
                            if ok:
                                retry_found_valid_b = True
                                retry_b = b_try
                                break
                        except Exception as ve:
                            reason = self._extract_revert_reason(ve)
                            retry_probe_outcomes.append(f"{label}:revert={reason}")
                            continue

                    if not retry_found_valid_b:
                        details = (
                            " | ".join(retry_probe_outcomes)
                            if retry_probe_outcomes
                            else "no_probe_outcome"
                        )
                        logger.error(
                            "Batch retry B-order probe failed after VK update: "
                            f"{details}"
                        )
                        return {
                            "success": False,
                            "error": f"batch_b_probe_failed_after_vk_update: {details}",
                        }
                    retry_fn = self.pdm_contract.functions.submitBatch(
                        root_bytes32,
                        int(record_count),
                        batch_type,
                        [a[0], a[1]],
                        retry_b,
                        [c[0], c[1]],
                        pub2,
                    )
                    retry = self._build_and_send_tx(
                        retry_fn,
                        signer_address,
                        signer_pk,
                        getattr(BatchConfig, "BATCH_GAS_LIMIT", 800000),
                    )
                    if retry.get("success"):
                        retry["merkle_root"] = merkle_root
                        retry["record_count"] = record_count
                        return retry
                    logger.warning(
                        f"VK güncelleme sonrası retry de başarısız: {retry.get('error')}"
                    )
            return result

        except Exception as e:
            logger.error(f"submit_batch error: {e}")
            return {"success": False, "error": str(e)}

    def retrieve_sensor_data(self, data_identifier: Any) -> Optional[SensorData]:
        """
        Sensör verisini geri getir (ID veya hash ile)
        Boş liste veya beklenmeyen format kontrolü içerir
        """
        try:
            retrieved_data = None
            if isinstance(data_identifier, int):
                # Adapter exposes get_sensor_data; there is no get_sensor_data_obj
                retrieved_data = self.storage_manager.get_sensor_data(data_identifier)
            elif isinstance(data_identifier, str):
                retrieved_data = self.storage_manager.get_sensor_data_by_hash_obj(
                    data_identifier
                )
            else:
                logger.error(
                    f"❌ Invalid data identifier type: {type(data_identifier)}"
                )
                return None

            # Liste dönmüşse ve boşsa None dön
            if isinstance(retrieved_data, list):
                return retrieved_data[0] if retrieved_data else None

            # SensorData nesnesi dönmüşse direkt return
            if hasattr(retrieved_data, "machine_id"):
                return retrieved_data

            logger.warning(f"❌ Retrieved data in unexpected format: {retrieved_data}")
            return None

        except Exception as e:
            logger.error(f"❌ Data retrieval error: {e}")
            return None

    def verify_data_integrity(self, data_id: int, expected_hash: str) -> bool:
        """
        Veri bütünlüğünü doğrula
        """
        try:
            # Local DB'den veriyi al
            # Adapter exposes get_sensor_data; there is no get_sensor_data_obj
            sensor_data = self.storage_manager.get_sensor_data(data_id)
            if not sensor_data:
                return False

            # Hash'i yeniden hesapla (Poseidon hash kullan)
            from real_poseidon_utils import RealPoseidonHasher

            poseidon_hasher = RealPoseidonHasher()

            machine_type_int = {"L": 1, "M": 2, "H": 3}.get(sensor_data.machine_type, 2)
            sensor_values = [
                int(sensor_data.air_temp * 100),
                int(sensor_data.process_temp * 100),
                int(sensor_data.rotation_speed),
                int(sensor_data.torque * 100),
                int(sensor_data.tool_wear),
                machine_type_int,
            ]
            try:
                import json
                import subprocess

                hash_cmd = f"""
                const circomlibjs = require("circomlibjs");
                (async () => {{
                    const poseidon = await circomlibjs.buildPoseidon();
                    const inputs = {json.dumps([str(v) for v in sensor_values])}.map(BigInt);
                    const hash = poseidon(inputs);
                    console.log(poseidon.F.toString(hash));
                }})();
                """
                result = subprocess.run(
                    ["node", "-e", hash_cmd],
                    capture_output=True,
                    text=True,
                    timeout=10,
                    check=True,
                )
                poseidon_result = result.stdout.strip()
            except Exception as e:
                logger.error(f"Poseidon hash failed in integrity check: {e}")
                return False
            calculated_hash = poseidon_hasher.poseidon_to_hex(poseidon_result)

            is_valid = calculated_hash == expected_hash
            # logger.info(f"✅ Data integrity check: {'✅ Valid' if is_valid else '❌ Invalid'}")
            return is_valid

        except Exception as e:
            logger.error(f"❌ Data integrity verification error: {e}")
            return False

    def get_system_statistics(self) -> Dict:
        """
        Sistem istatistikleri
        """
        try:
            # Local storage stats
            local_stats = self.storage_manager.get_statistics()

            # Blockchain stats (if available)
            blockchain_stats = {}
            if self.is_ready():
                try:
                    blockchain_stats = {
                        "network": self.network_name,
                        "connected": True,
                        "contract_address": self.pdm_contract.address,
                        "admin_account": self.admin_account,
                        "balance": float(
                            self.web3.from_wei(
                                self.web3.eth.get_balance(self.admin_account), "ether"
                            )
                        ),
                    }
                except Exception as e:
                    logger.debug(f"Failed to get blockchain stats: {e}")
                    blockchain_stats = {"connected": False}
            else:
                blockchain_stats = {"connected": False}

            return {
                "storage_type": "hybrid",
                "local_storage": local_stats,
                "blockchain": blockchain_stats,
                "timestamp": int(time.time()),
            }

        except Exception as e:
            logger.error(f"❌ Statistics error: {e}")
            return {"error": str(e)}

    # ========== ACCESS CONTROL INTEGRATION ==========

    def _get_access_registry_contract(self):
        """Load AccessControlRegistry contract instance."""
        if not self.web3 or not self.deployment_info:
            return None
        try:
            contracts = self.deployment_info.get("contracts", {})
            registry_info = contracts.get("AccessControlRegistry", {})
            registry_address = registry_info.get("address")
            if not registry_address:
                logger.warning(
                    "AccessControlRegistry address not found in deployment info"
                )
                return None

            # Load ABI
            artifact_path = Path(
                "artifacts-zk/contracts/AccessControlRegistry.sol/AccessControlRegistry.json"
            )
            if not artifact_path.exists():
                logger.warning(
                    f"AccessControlRegistry artifact not found: {artifact_path}"
                )
                return None

            with open(artifact_path) as f:
                artifact = json.load(f)

            return self.web3.eth.contract(
                address=self.web3.to_checksum_address(registry_address),
                abi=artifact["abi"],
            )
        except Exception as e:
            logger.error(f"Failed to load AccessControlRegistry: {e}")
            return None

    def check_role(self, address: str, role: str) -> bool:
        """
        Check if an address has a specific role on-chain.

        Args:
            address: Wallet address to check
            role: Role name (e.g., 'ENGINEER', 'OPERATOR', 'SYSTEM_ADMIN', 'SUPER_ADMIN')

        Returns:
            True if address has the role, False otherwise
        """
        try:
            contract = self._get_access_registry_contract()
            if not contract:
                logger.warning(
                    "AccessControlRegistry not available, skipping on-chain role check"
                )
                return True  # Fallback: allow if contract not available

            # Convert role name to bytes32 hash
            role_map = {
                "SUPER_ADMIN": "ADMIN_ROLE",
                "SYSTEM_ADMIN": "MANAGER_ROLE",
                "ENGINEER": "ENGINEER_ROLE",
                "OPERATOR": "OPERATOR_ROLE",
                "MANAGER": "MANAGER_ROLE",  # Manager maps to SYSTEM_ADMIN
                "OWNER": "ADMIN_ROLE",  # Owner maps to SUPER_ADMIN
            }
            role_key = role_map.get(role.upper(), f"{role.upper()}_ROLE")
            role_hash = self.web3.keccak(text=role_key)

            checksum_addr = self.web3.to_checksum_address(address)
            has_role = contract.functions.hasRole(checksum_addr, role_hash).call()
            return bool(has_role)
        except Exception as e:
            logger.error(f"Role check failed: {e}")
            return True  # Fallback: allow on error

    def get_node_info(self, address: str) -> Optional[Dict]:
        """
        Get node information for an address from AccessControlRegistry.
        Searches both by owner address and by nodeAddress.

        Args:
            address: Wallet address

        Returns:
            Node info dict or None if not found
        """
        try:
            contract = self._get_access_registry_contract()
            if not contract:
                return None

            checksum_addr = self.web3.to_checksum_address(address)

            # 1. Önce direkt owner olarak ara
            node_ids = contract.functions.getNodesByAddress(checksum_addr).call()

            if node_ids:
                node_id = node_ids[0]
                node_info = contract.functions.nodes(node_id).call()
                return self._parse_node_info(node_id, node_info)

            # 2. Bulunamadıysa, admin hesabının node'larını kontrol et
            # (Kullanıcılar admin tarafından kaydedildiğinde nodeAddress olarak ekleniyor)
            if self.admin_account:
                admin_node_ids = contract.functions.getNodesByAddress(
                    self.admin_account
                ).call()
                for node_id in admin_node_ids:
                    node_info = contract.functions.nodes(node_id).call()
                    # node_info[2] = nodeAddress
                    if node_info[2].lower() == checksum_addr.lower():
                        return self._parse_node_info(node_id, node_info)

            return None
        except Exception as e:
            logger.error(f"Get node info failed: {e}")
            return None

    def _parse_node_info(self, node_id: bytes, node_info: tuple) -> Dict:
        """Parse node struct to dict.

        Solidity struct Node indices (dynamic array assignedRoles excluded from getter):
        [0]: nodeId, [1]: nodeName, [2]: nodeAddress, [3]: nodeType,
        [4]: status, [5]: accessLevel, [6]: owner, [7]: createdAt,
        [8]: lastActiveAt, [9]: accessExpiresAt, [10]: isBlacklisted, [11]: metadata
        """
        return {
            "node_id": node_id.hex() if isinstance(node_id, bytes) else node_id,
            "node_name": node_info[1],
            "node_address": node_info[2],
            "node_type": node_info[
                3
            ],  # 0=UNDEFINED, 1=DATA_PROCESSOR, 2=FAILURE_ANALYZER, 3=MANAGER
            "status": node_info[4],  # 0=INACTIVE, 1=ACTIVE, 2=SUSPENDED
            "access_level": node_info[5],  # 0=NO_ACCESS to 4=ADMIN_ACCESS
            "owner": node_info[6],
            "created_at": node_info[7],
            "last_active_at": node_info[8],
            "access_expires_at": node_info[9],
            "is_blacklisted": node_info[10],  # bool
            "metadata": node_info[11] if len(node_info) > 11 else "",
        }

    def check_resource_access(
        self, address: str, resource: str, required_level: int = 1
    ) -> bool:
        """
        Check if an address has access to a specific resource.

        Args:
            address: Wallet address
            resource: Resource name (e.g., 'SENSOR_DATA', 'PREDICTION', 'MAINTENANCE')
            required_level: Minimum access level required (0=NO_ACCESS, 1=READ_ONLY, 2=WRITE_LIMITED, 3=FULL_ACCESS, 4=ADMIN_ACCESS)

        Returns:
            True if address has required access level, False otherwise
        """
        try:
            contract = self._get_access_registry_contract()
            if not contract:
                return True  # Fallback: allow if contract not available

            checksum_addr = self.web3.to_checksum_address(address)
            node_ids = contract.functions.getNodesByAddress(checksum_addr).call()

            if not node_ids:
                return False

            node_id = node_ids[0]
            resource_hash = self.web3.keccak(text=resource)

            # Check node permissions
            has_permission = contract.functions.nodePermissions(
                node_id, resource_hash
            ).call()
            if not has_permission:
                return False

            # Check access level
            node_info = contract.functions.nodes(node_id).call()
            access_level = node_info[5]
            return access_level >= required_level
        except Exception as e:
            logger.error(f"Resource access check failed: {e}")
            return True  # Fallback: allow on error

    def is_address_active(self, address: str) -> bool:
        """
        Check if an address has an active (non-suspended, non-blacklisted) node.

        Args:
            address: Wallet address

        Returns:
            True if address is active, False otherwise
        """
        try:
            node_info = self.get_node_info(address)
            if not node_info:
                return False

            # Check status (1 = ACTIVE) and not blacklisted
            return node_info["status"] == 1 and not node_info["is_blacklisted"]
        except Exception as e:
            logger.error(f"Active check failed: {e}")
            return True  # Fallback: allow on error

    def verify_access(
        self,
        address: str,
        role: str = None,
        resource: str = None,
        required_level: int = 1,
    ) -> Dict:
        """
        Comprehensive access verification combining role and resource checks.

        Args:
            address: Wallet address to verify
            role: Optional role to check (e.g., 'ENGINEER')
            resource: Optional resource to check (e.g., 'SENSOR_DATA')
            required_level: Minimum access level for resource check

        Returns:
            Dict with verification results
        """
        result = {
            "address": address,
            "is_active": False,
            "has_role": False,
            "has_resource_access": False,
            "node_info": None,
            "allowed": False,
            "reason": "",
        }

        try:
            # Check if address is active
            result["is_active"] = self.is_address_active(address)
            if not result["is_active"]:
                result["reason"] = "Address not registered or inactive"
                return result

            # Get node info
            result["node_info"] = self.get_node_info(address)

            # Check role if specified
            if role:
                result["has_role"] = self.check_role(address, role)
                if not result["has_role"]:
                    result["reason"] = f"Missing required role: {role}"
                    return result

            # Check resource access if specified
            if resource:
                result["has_resource_access"] = self.check_resource_access(
                    address, resource, required_level
                )
                if not result["has_resource_access"]:
                    result["reason"] = f"Insufficient access to resource: {resource}"
                    return result

            result["allowed"] = True
            result["reason"] = "Access granted"
            return result

        except Exception as e:
            logger.error(f"Access verification failed: {e}")
            result["reason"] = f"Verification error: {str(e)}"
            return result

    def register_node_on_blockchain(
        self,
        user_address: str,
        role: str,
        node_name: str = None,
        access_duration: int = 365 * 24 * 3600,  # 1 yıl varsayılan
    ) -> Dict:
        """
        Kullanıcıyı blockchain'e node olarak kaydet.

        Args:
            user_address: Kullanıcının wallet adresi
            role: Kullanıcı rolü (OPERATOR, ENGINEER, MANAGER, OWNER)
            node_name: Node adı (opsiyonel, yoksa role + address kullanılır)
            access_duration: Erişim süresi saniye cinsinden (varsayılan 1 yıl)

        Returns:
            Dict: {success, tx_hash, node_id, error}
        """
        try:
            contract = self._get_access_registry_contract()
            if not contract:
                return {
                    "success": False,
                    "error": "AccessControlRegistry contract not available",
                }

            checksum_addr = self.web3.to_checksum_address(user_address)

            # Zaten kayıtlı mı kontrol et
            existing_nodes = contract.functions.getNodesByAddress(checksum_addr).call()
            if existing_nodes:
                logger.info(
                    f"User {user_address} already has {len(existing_nodes)} node(s) on blockchain"
                )
                return {
                    "success": True,
                    "already_registered": True,
                    "node_id": existing_nodes[0].hex() if existing_nodes else None,
                    "message": "User already registered on blockchain",
                }

            # Role -> NodeType mapping
            # NodeType: 0=UNDEFINED, 1=DATA_PROCESSOR, 2=FAILURE_ANALYZER, 3=MANAGER
            role_to_node_type = {
                "OPERATOR": 1,  # DATA_PROCESSOR - sensör verisi girebilir
                "ENGINEER": 2,  # FAILURE_ANALYZER - analiz yapabilir
                "MANAGER": 3,  # MANAGER - yönetici
                "OWNER": 3,  # MANAGER - owner da manager tipi
            }
            node_type = role_to_node_type.get(role.upper(), 0)

            # Role -> AccessLevel mapping
            # AccessLevel: 0=NO_ACCESS, 1=READ_ONLY, 2=WRITE_LIMITED, 3=FULL_ACCESS, 4=ADMIN_ACCESS
            role_to_access_level = {
                "OPERATOR": 2,  # WRITE_LIMITED
                "ENGINEER": 3,  # FULL_ACCESS
                "MANAGER": 3,  # FULL_ACCESS
                "OWNER": 4,  # ADMIN_ACCESS
            }
            access_level = role_to_access_level.get(role.upper(), 1)

            # Node adı oluştur
            if not node_name:
                node_name = f"{role.upper()}_{checksum_addr[:8]}"

            # Metadata
            metadata = f"Registered via API at {int(time.time())}"

            logger.info(
                f"Registering node on blockchain: {node_name} ({role}) for {checksum_addr}"
            )

            # Transaction oluştur
            # registerNode(string nodeName, address nodeAddress, NodeType nodeType,
            #              AccessLevel accessLevel, uint256 accessDuration, string metadata)
            tx = contract.functions.registerNode(
                node_name,
                checksum_addr,
                node_type,
                access_level,
                access_duration,
                metadata,
            ).build_transaction(
                {
                    "from": self.admin_account,
                    "nonce": self.web3.eth.get_transaction_count(
                        self.admin_account, "pending"
                    ),
                    "gas": 500000,
                    "gasPrice": self._get_gas_price(),
                }
            )

            # İmzala ve gönder
            # Security fix: use _get_signer_private_key
            pk = self._get_signer_private_key(self.admin_account)
            signed_tx = self.web3.eth.account.sign_transaction(tx, private_key=pk)
            tx_hash = self.web3.eth.send_raw_transaction(signed_tx.raw_transaction)

            logger.info(f"Blockchain registration TX sent: {tx_hash.hex()}")

            # Receipt bekle
            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            if receipt.status == 1:
                # Event'lerden node_id'yi al
                node_id = None
                try:
                    # NodeRegistered event'ini parse et
                    logs = contract.events.NodeRegistered().process_receipt(receipt)
                    if logs:
                        node_id = logs[0]["args"]["nodeId"].hex()
                except Exception as e:
                    logger.warning(f"Could not parse NodeRegistered event: {e}")

                logger.info(
                    f"✅ User {checksum_addr} registered on blockchain successfully!"
                )
                return {
                    "success": True,
                    "tx_hash": tx_hash.hex(),
                    "block_number": receipt.blockNumber,
                    "node_id": node_id,
                    "node_type": node_type,
                    "access_level": access_level,
                }
            else:
                logger.error(f"❌ Blockchain registration failed: TX reverted")
                return {
                    "success": False,
                    "error": "Transaction reverted",
                    "tx_hash": tx_hash.hex(),
                }

        except Exception as e:
            logger.error(f"Blockchain registration error: {e}")
            return {"success": False, "error": str(e)}

    def _string_to_bytes32(self, text: str) -> bytes:
        """
        String'i bytes32'ye çevir (gaz optimizasyonu için)
        Kısa metinlerde UTF-8 ile pad edilmiş 32 byte döner.
        32 karakterden uzun metinlerde SHA-256 digest (32 byte) döner.
        """
        if len(text) > 32:
            # Uzun string'ler için gerçek 32 byte'lık SHA-256 digest kullan
            digest = hashlib.sha256(text.encode("utf-8")).digest()  # 32 bytes
            try:
                logger.warning(
                    f"❌ Storage location too long, using sha256 digest: {text} -> 0x{digest.hex()}"
                )
            except Exception:
                # Bazı konsollar unicode/encoding sorunu yaşayabilir
                logger.warning(
                    "Storage location too long, using sha256 digest (see debug for hex)"
                )
                logger.debug({"original": text, "digest_hex": digest.hex()})
            return digest

        # Kısa metinler için string'i 32 byte'a pad et
        return text.encode("utf-8").ljust(32, b"\x00")

    def _bytes32_to_string(self, data: bytes) -> str:
        """
        bytes32'yi string'e çevir
        """
        return data.rstrip(b"\x00").decode("utf-8")

    def _get_gas_price(self):
        """Gas price hesapla"""
        try:
            current_gas_price = self.web3.eth.gas_price
            min_gas_price = self.web3.to_wei(
                BlockchainConfig.SENSOR_DATA_GAS_PRICE_GWEI, "gwei"
            )
            return max(current_gas_price, min_gas_price)
        except Exception:
            return self.web3.to_wei(BlockchainConfig.SENSOR_DATA_GAS_PRICE_GWEI, "gwei")

    def get_network_info(self) -> Optional[Dict]:
        """Network bilgilerini döndürür"""
        if not self.web3:
            return None

        try:
            block_number = self.web3.eth.block_number

            # Balance bilgisini al
            balance_wei = 0
            balance_eth = 0.0
            if self.admin_account:
                try:
                    balance_wei = self.web3.eth.get_balance(self.admin_account)
                    balance_eth = self.web3.from_wei(balance_wei, "ether")
                except Exception as e:
                    logger.warning(f"Balance alınamadı: {e}")

            return {
                "network_name": self.network_name,
                "chain_id": self.web3.eth.chain_id,
                "block_number": block_number,
                "rpc_url": self.rpc_url,
                "admin_account": self.admin_account,
                "balance": float(balance_eth),
                "currency": "ETH",
            }
        except Exception as e:
            logger.error(f"Network info error: {e}")
            return None

    def get_contract_info(self) -> Optional[Dict]:
        """Contract bilgilerini döndürür"""
        if not self.deployment_info:
            return None

        try:
            contracts = self.deployment_info.get("contracts", {})
            hybrid_contract = contracts.get("PdMSystemHybrid", {})
            verifier_contract = contracts.get(
                "OptimizedGroth16Verifier", {}
            ) or contracts.get("UnifiedGroth16Verifier", {})
            access_control_contract = contracts.get("AccessControlRegistry", {})

            return {
                "pdm_address": hybrid_contract.get("address"),
                "verifier_address": verifier_contract.get("address"),
                "access_control_address": access_control_contract.get("address"),
                "deployment_time": self.deployment_info.get("timestamp", "Unknown"),
                "system_type": self.deployment_info.get("system_type", "hybrid"),
                "admin_account": self.admin_account,
            }
        except Exception as e:
            logger.error(f"Contract info error: {e}")
            return None

    # --- New: Full prediction submission with on-chain proof ---
    def submit_prediction_hybrid_v2(
        self,
        prediction_data: Dict,
        sensor_data_id: int,
        actor_role: Optional[str] = None,
        recorded_by: Optional[str] = None,
    ) -> Dict:
        """
        Improved hybrid prediction submission: generates ZK proof and submits to blockchain.
        prediction_data may include 'data_proof_id_onchain' (int) to reference sensor proof on-chain.
        actor_role / recorded_by: passed to signer resolution for EOA fallback (default: ENGINEER).
        """
        try:
            # logger.info("✅ Starting hybrid prediction submission (v2)...")

            sensor_data = self.storage_manager.get_sensor_data_obj(sensor_data_id)
            if not sensor_data:
                return {
                    "success": False,
                    "error": f"Sensor data ID {sensor_data_id} not found",
                }

            prediction = PredictionData(
                data_id=sensor_data_id,
                prediction=int(prediction_data["prediction"]),
                probability=float(prediction_data["probability"]),
                model_version="LSTM-CNN-v1.0",
                model_hash=hashlib.sha256(f"model_{time.time()}".encode()).hexdigest(),
                predictor=self.admin_account
                or "0x0000000000000000000000000000000000000000",
                timestamp=int(time.time()),
            )

            # logger.info("✅ Storing prediction in local database...")
            pred_id, pred_hash = self.storage_manager.store_prediction_data(prediction)

            # On-chain sensor proof ID zorunlu: yoksa DB'den çözmeyi dene
            data_proof_id_onchain = prediction_data.get("data_proof_id_onchain")
            if not data_proof_id_onchain:
                data_proof_id_onchain = self._resolve_sensor_proof_id_onchain(
                    sensor_data_id
                )
            try:
                data_proof_id_onchain = int(data_proof_id_onchain or 0)
            except Exception:
                data_proof_id_onchain = 0
            if data_proof_id_onchain <= 0:
                return {
                    "success": False,
                    "error": "missing_data_proof_id_onchain",
                    "details": "Prediction göndermeden önce sensör kanıtını zincire yazın ve dönen proof_idyi data_proof_id_onchain olarak geçin.",
                }

            # logger.info("✅ Generating prediction ZK proof (v2)...")
            prediction.prediction_id = pred_id
            proof_data = self.zk_proof_generator.generate_prediction_proof(
                prediction, sensor_data, data_proof_id_onchain=data_proof_id_onchain
            )
            if not proof_data:
                return {
                    "success": False,
                    "error": "Prediction ZK proof generation failed",
                }

            blockchain_result: Dict[str, Any] = {"success": False}
            if self.is_ready():
                # logger.info("✅ Submitting prediction proof to blockchain (v2)...")
                model_commitment = self.web3.keccak(
                    text=prediction.model_hash or prediction.model_version
                )
                confidence_int = int(float(prediction.probability) * 10000)

                blockchain_result = self._submit_prediction_proof_to_blockchain(
                    data_proof_id_onchain=data_proof_id_onchain,
                    prediction_hash=pred_hash,
                    model_commitment=model_commitment,
                    proof_data=proof_data,
                    actor_role=actor_role,
                    recorded_by=recorded_by,
                )
                if blockchain_result.get("success"):
                    self.storage_manager.update_blockchain_proof_id(
                        "prediction_data",
                        pred_id,
                        blockchain_result.get("proof_id"),
                        tx_hash=blockchain_result.get("tx_hash"),
                    )

            result = {
                "success": bool(blockchain_result.get("success")),
                "storage_type": "hybrid",
                "local_prediction_id": pred_id,
                "prediction_hash": pred_hash,
                "zk_proof_generated": True,
                "blockchain_submitted": bool(blockchain_result.get("success")),
                "tx_hash": blockchain_result.get("tx_hash", "N/A"),
                "block_number": blockchain_result.get("block_number", "N/A"),
            }

            # Hata detayını kullanıcıya yansıt
            if not blockchain_result.get("success") and blockchain_result.get("error"):
                result["error"] = blockchain_result.get("error")

            # logger.info("✅ Hybrid prediction submission (v2) completed!")
            return result
        except Exception as e:
            logger.error(f"❌ Hybrid prediction submission (v2) error: {e}")
            return {"success": False, "error": str(e)}

    def _resolve_sensor_proof_id_onchain(self, sensor_data_id: int) -> Optional[int]:
        """DB'den sensor_data.blockchain_proof_id alanını bulup döndür.
        Önce PdM DB (varsa), ardından local SQLite taranır.
        """
        # PdM DB
        try:
            if self.pdm_db and hasattr(self.pdm_db, "get_sensor_data"):
                rows = self.pdm_db.get_sensor_data(record_id=sensor_data_id)
                if isinstance(rows, list) and rows:
                    row = rows[0]
                    if isinstance(row, dict):
                        pid = row.get("blockchain_proof_id") or row.get("proof_id")
                        if pid:
                            return int(pid)
        except Exception:
            pass
        return None


# --- Monkey patch: improve sensor proof submission by trying swapped B if needed ---
try:
    _orig_submit_sensor = None
    if "HybridBlockchainHandler" in globals():
        _orig_submit_sensor = getattr(
            HybridBlockchainHandler, "_submit_sensor_proof_to_blockchain", None
        )

    def _swap_b_array(b_arr):
        try:
            return [
                [int(b_arr[0][1]), int(b_arr[0][0])],
                [int(b_arr[1][1]), int(b_arr[1][0])],
            ]
        except Exception:
            return b_arr

    def _patched_submit_sensor(
        self,
        sensor_data,
        data_hash,
        storage_location,
        proof_data,
        signer_address=None,
        signer_private_key=None,
    ):
        if _orig_submit_sensor is None:
            # Fallback to error
            return {"success": False, "error": "submit_method_missing"}
        # İlk deneme: orijinal yöntem (native b)
        result = _orig_submit_sensor(
            self,
            sensor_data,
            data_hash,
            storage_location,
            proof_data,
            signer_address=signer_address,
            signer_private_key=signer_private_key,
        )
        err = (result or {}).get("error")
        if result and result.get("success"):
            return result
        # Eğer invalid proof/simulation_failed hatası varsa b'yi swap ederek tekrar dene
        reason_text = str(err or "")
        should_retry = ("simulation_failed" in reason_text) or (
            "Invalid sensor data ZK proof" in reason_text
        )
        if not should_retry:
            return result
        try:
            # Derin kopya al ve b'yi swap et
            import copy

            proof_data_swapped = copy.deepcopy(proof_data)
            pf = proof_data_swapped.get("proof") or {}
            if "pi_b" in pf:
                pf["pi_b"] = _swap_b_array(pf["pi_b"])
            elif "b" in pf:
                pf["b"] = _swap_b_array(pf["b"])
            # Tekrar dene
            return _orig_submit_sensor(
                self,
                sensor_data,
                data_hash,
                storage_location,
                proof_data_swapped,
                signer_address=signer_address,
                signer_private_key=signer_private_key,
            )
        except Exception:
            return result

    if _orig_submit_sensor is not None:
        HybridBlockchainHandler._submit_sensor_proof_to_blockchain = (
            _patched_submit_sensor
        )
except Exception:
    pass

# --- Monkey patch: fix sensor VK check for UnifiedGroth16Verifier ABI ---
try:
    _orig_sensor_vk_check = None
    if "HybridBlockchainHandler" in globals():
        _orig_sensor_vk_check = getattr(
            HybridBlockchainHandler, "_sensor_verifier_is_set", None
        )

    def _patched_sensor_verifier_is_set(self) -> bool:
        contract = self._get_verifier_contract()
        if not contract:
            return False
        try:
            vk_info = contract.functions.circuitKeys(0).call()
            if not vk_info:
                return False
            is_set = bool(vk_info[-1]) if isinstance(vk_info, (list, tuple)) else False

            if not is_set:
                return False
            # Compare with local VK if available (best-effort)
            try:
                alpha_on, beta_on, gamma_on, delta_on = (
                    vk_info[0],
                    vk_info[1],
                    vk_info[2],
                    vk_info[3],
                )
                local_params = self._load_local_sensor_vk_params()
                if local_params is None:
                    self._sensor_vk_ready = True
                    return True
                alpha_l, beta_l, gamma_l, delta_l = local_params

                def _eq(a, b):
                    try:
                        import json as _json

                        return _json.dumps(a, sort_keys=True) == _json.dumps(
                            b, sort_keys=True
                        )
                    except Exception:
                        return a == b

                if (
                    _eq(alpha_on, alpha_l)
                    and _eq(beta_on, beta_l)
                    and _eq(gamma_on, gamma_l)
                    and _eq(delta_on, delta_l)
                ):
                    self._sensor_vk_ready = True
                    return True
                else:
                    return False
            except Exception:
                self._sensor_vk_ready = True
                return True
        except Exception:
            return False

    if _orig_sensor_vk_check is not None:
        HybridBlockchainHandler._sensor_verifier_is_set = (
            _patched_sensor_verifier_is_set
        )
except Exception:
    pass
