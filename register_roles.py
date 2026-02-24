"""
register_roles.py
-----------------
Deploy sonrası erişim izinlerini kontrol eder ve eksikleri giderir.

Kontrat ABI'si:
  - checkAccess(address caller, bytes32 resource, uint8 requiredLevel)
      → (bool hasAccess, string reason)
  - getNodesByAddress(address owner) → bytes32[]
  - grantEmergencyAccess(bytes32 nodeId, bytes32 resource, string reason)
      → onlyRole(ADMIN_ROLE)
"""
import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv
from web3 import Web3

# Windows terminal UTF-8 uyumluluğu
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

load_dotenv()


def register_roles():
    print("=" * 70)
    print("  ROLE REGISTRATION FOR PDM SYSTEM")
    print("=" * 70)

    # 1. Configuration
    rpc_url   = os.getenv("ZKSYNC_ERA_RPC_URL", "https://sepolia.era.zksync.dev")
    owner_pk  = os.getenv("CONTRACT_OWNER_PRIVATE_KEY")
    if not owner_pk:
        print("❌ CONTRACT_OWNER_PRIVATE_KEY bulunamadı!")
        return False

    operator_address = os.getenv("OPERATOR_ADDRESS")
    engineer_address = os.getenv("ENGINEER_ADDRESS")
    if not operator_address or not engineer_address:
        print("❌ OPERATOR_ADDRESS veya ENGINEER_ADDRESS bulunamadı!")
        return False

    # 2. Connection
    print(f"\n📡 Bağlanılıyor: {rpc_url}...")
    web3 = Web3(Web3.HTTPProvider(rpc_url))
    if not web3.is_connected():
        print("❌ Bağlantı hatası!")
        return False
    print("✅ Bağlandı!")

    owner_account    = web3.eth.account.from_key(owner_pk)
    operator_address = Web3.to_checksum_address(operator_address)
    engineer_address = Web3.to_checksum_address(engineer_address)
    print(f"👤 Owner (Admin): {owner_account.address}")
    print(f"🔧 Engineer:      {engineer_address}")
    print(f"⚙️  Operator:      {operator_address}")

    # 3. Load Deployment Info
    deployment_path = Path("deployment_info_hybrid_ZKSYNC_ERA.json")
    if not deployment_path.exists():
        print(f"❌ {deployment_path} bulunamadı!")
        return False
    with open(deployment_path) as f:
        deployment_info = json.load(f)

    pdm_address    = (os.getenv("PDM_SYSTEM_ADDRESS")
                      or deployment_info["contracts"]["PdMSystemHybrid"]["address"])
    access_address = (os.getenv("ACCESS_CONTROL_ADDRESS")
                      or deployment_info["contracts"]["AccessControlRegistry"]["address"])
    print(f"\n📜 PdMSystemHybrid:       {pdm_address}")
    print(f"📜 AccessControlRegistry: {access_address}")

    # 4. ABIs
    pdm_abi = [
        {"inputs": [], "name": "SENSOR_DATA_RESOURCE",  "outputs": [{"type": "bytes32"}], "stateMutability": "view", "type": "function"},
        {"inputs": [], "name": "PREDICTION_RESOURCE",   "outputs": [{"type": "bytes32"}], "stateMutability": "view", "type": "function"},
        {"inputs": [], "name": "MAINTENANCE_RESOURCE",  "outputs": [{"type": "bytes32"}], "stateMutability": "view", "type": "function"},
        {"inputs": [], "name": "FAULT_RECORD_RESOURCE", "outputs": [{"type": "bytes32"}], "stateMutability": "view", "type": "function"},
        {"inputs": [], "name": "TRAINING_RESOURCE",     "outputs": [{"type": "bytes32"}], "stateMutability": "view", "type": "function"},
        {"inputs": [], "name": "REPORT_RESOURCE",       "outputs": [{"type": "bytes32"}], "stateMutability": "view", "type": "function"},
    ]

    access_abi = [
        # checkAccess: AccessLevel enum is uint8
        {
            "inputs": [
                {"name": "caller",         "type": "address"},
                {"name": "resource",       "type": "bytes32"},
                {"name": "requiredLevel",  "type": "uint8"},
            ],
            "name": "checkAccess",
            "outputs": [
                {"name": "hasAccess", "type": "bool"},
                {"name": "reason",    "type": "string"},
            ],
            "stateMutability": "view",
            "type": "function",
        },
        # getNodesByAddress
        {
            "inputs": [{"name": "nodeOwner", "type": "address"}],
            "name": "getNodesByAddress",
            "outputs": [{"type": "bytes32[]"}],
            "stateMutability": "view",
            "type": "function",
        },
        # grantEmergencyAccess: SUPER_ADMIN only; activates node + grants resource
        {
            "inputs": [
                {"name": "nodeId",        "type": "bytes32"},
                {"name": "targetResource","type": "bytes32"},
                {"name": "reason",        "type": "string"},
            ],
            "name": "grantEmergencyAccess",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function",
        },
    ]

    pdm_contract    = web3.eth.contract(address=pdm_address, abi=pdm_abi)
    access_contract = web3.eth.contract(address=access_address, abi=access_abi)

    # 5. Fetch Resource IDs
    print("\n🔍 Kaynak ID'leri alınıyor...")
    resources = {
        "SENSOR_DATA":  pdm_contract.functions.SENSOR_DATA_RESOURCE().call(),
        "PREDICTION":   pdm_contract.functions.PREDICTION_RESOURCE().call(),
        "MAINTENANCE":  pdm_contract.functions.MAINTENANCE_RESOURCE().call(),
        "FAULT_RECORD": pdm_contract.functions.FAULT_RECORD_RESOURCE().call(),
        "TRAINING":     pdm_contract.functions.TRAINING_RESOURCE().call(),
        "REPORT":       pdm_contract.functions.REPORT_RESOURCE().call(),
    }

    WRITE_LIMITED = 2  # AccessLevel enum value

    # 6. Helper: check and grant via grantEmergencyAccess if missing
    def ensure_access(user_addr: str, resource_id: bytes, resource_name: str):
        label = f"{user_addr[:10]}... → {resource_name}"
        has_access, reason = access_contract.functions.checkAccess(
            user_addr, resource_id, WRITE_LIMITED
        ).call()

        if has_access:
            print(f"   ✅ {label}: erişim mevcut")
            return True

        print(f"   ⚠️  {label}: erişim yok ({reason}). grantEmergencyAccess çağrılıyor...")

        # nodeId gerekli — adrese ait ilk node'u al
        node_ids = access_contract.functions.getNodesByAddress(user_addr).call()
        if not node_ids:
            print(f"   ❌ {label}: kayıtlı node bulunamadı — önce node kaydı yapılmalı")
            return False

        node_id = node_ids[0]
        try:
            nonce = web3.eth.get_transaction_count(owner_account.address, "pending")
            tx = access_contract.functions.grantEmergencyAccess(
                node_id, resource_id, f"post-deploy grant for {resource_name}"
            ).build_transaction({
                "from":      owner_account.address,
                "nonce":     nonce,
                "gas":       500_000,
                "gasPrice":  web3.eth.gas_price,
            })
            signed   = web3.eth.account.sign_transaction(tx, private_key=owner_pk)
            tx_hash  = web3.eth.send_raw_transaction(signed.raw_transaction)
            receipt  = web3.eth.wait_for_transaction_receipt(tx_hash)
            if receipt.status == 1:
                print(f"   ✅ {label}: erişim verildi (TX: {tx_hash.hex()})")
            else:
                print(f"   ❌ {label}: TX başarısız")
        except Exception as e:
            print(f"   ❌ {label}: {e}")
        return False

    # 7. Check / grant all required resource permissions
    print("\n" + "─" * 60)
    print("🔐 ERİŞİM KONTROL & GRANT")
    print("─" * 60)

    # Operator: SENSOR_DATA, FAULT_RECORD (auto-granted via registerNode)
    for res_name in ("SENSOR_DATA", "FAULT_RECORD"):
        ensure_access(operator_address, resources[res_name], f"OPERATOR → {res_name}")

    # Engineer: all resources (auto-granted via registerNode for FAILURE_ANALYZER)
    for res_name in ("PREDICTION", "MAINTENANCE", "SENSOR_DATA",
                     "FAULT_RECORD", "TRAINING", "REPORT"):
        ensure_access(engineer_address, resources[res_name], f"ENGINEER → {res_name}")

    print("\n✅ TÜM İŞLEMLER TAMAMLANDI")
    return True


if __name__ == "__main__":
    register_roles()
