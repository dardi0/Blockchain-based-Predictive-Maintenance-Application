#!/usr/bin/env python3
"""
zkSync Era PDM Contract Deployment Script
Bu script PDM sistemini zkSync Era testnet'ine deploy eder.
"""

import os
import json
import time
import requests
from datetime import datetime
from web3 import Web3
from dotenv import load_dotenv

# Environment dosyasını yükle
load_dotenv("bc/pk.env")

# zkSync Era konfigürasyonu
ZKSYNC_ERA_RPC_URL = os.getenv("ZKSYNC_ERA_RPC_URL", "https://sepolia.era.zksync.dev")
PRIVATE_KEY = os.getenv("Private_Key")
CHAIN_ID = 300  # zkSync Era Sepolia

# Contract dosya yolları
CONTRACTS_DIR = "contracts/"
ARTIFACTS_DIR = "artifacts/contracts/"

def setup_web3():
    """Web3 bağlantısını kur"""
    if not all([ZKSYNC_ERA_RPC_URL, PRIVATE_KEY]):
        raise ValueError("❌ ZKSYNC_ERA_RPC_URL veya Private_Key .env dosyasında bulunamadı!")
    
    # Web3 bağlantısı
    w3 = Web3(Web3.HTTPProvider(ZKSYNC_ERA_RPC_URL))
    if not w3.is_connected():
        raise ConnectionError("❌ zkSync Era ağına bağlanılamadı!")
    
    # Account setup
    account = w3.eth.account.from_key(PRIVATE_KEY)
    deployer_address = account.address
    
    # Bakiye kontrolü
    balance = w3.from_wei(w3.eth.get_balance(deployer_address), 'ether')
    
    print(f"✅ zkSync Era bağlantısı başarılı!")
    print(f"🆔 Chain ID: {w3.eth.chain_id}")
    print(f"📦 Block Number: {w3.eth.block_number}")
    print(f"👤 Deployer: {deployer_address}")
    print(f"💰 Bakiye: {balance:.4f} ETH")
    
    if balance < 0.001:
        print("⚠️ Düşük bakiye! En az 0.001 ETH gerekli")
        print("🚰 zkSync Era faucet: https://portal.zksync.io/faucet")
    
    return w3, account

def check_zksync_era_status():
    """zkSync Era ağ durumunu kontrol et"""
    try:
        response = requests.get("https://api.zksync.io/api/v0.2/network/status", timeout=10)
        if response.status_code == 200:
            status = response.json()
            print(f"🌐 zkSync Era Ağ Durumu: {status.get('status', 'Unknown')}")
            return True
    except requests.RequestException:
        print("⚠️ zkSync Era ağ durumu kontrol edilemedi")
    return False

def load_contract_artifacts(contract_name):
    """Contract artifact'larını yükle"""
    artifact_path = f"{ARTIFACTS_DIR}{contract_name}.sol/{contract_name}.json"
    
    try:
        with open(artifact_path, 'r') as f:
            artifact = json.load(f)
        return artifact['abi'], artifact['bytecode']
    except FileNotFoundError:
        raise FileNotFoundError(f"❌ Contract artifact bulunamadı: {artifact_path}")

def estimate_zksync_gas(w3, transaction):
    """zkSync Era için gas estimation"""
    try:
        estimated_gas = w3.eth.estimate_gas(transaction)
        # zkSync Era için gas limitini %20 artır
        return int(estimated_gas * 1.2)
    except Exception as e:
        print(f"⚠️ Gas estimation hatası: {e}")
        # Fallback gas limit
        return 5000000

def deploy_contract(w3, account, contract_name, constructor_args=None):
    """Contract'ı zkSync Era'ya deploy et"""
    print(f"\n🚀 {contract_name} zkSync Era'ya deploy ediliyor...")
    
    # Contract artifacts yükle
    abi, bytecode = load_contract_artifacts(contract_name)
    
    # Contract instance oluştur
    contract = w3.eth.contract(abi=abi, bytecode=bytecode)
    
    # Constructor çağrısı
    if constructor_args:
        transaction = contract.constructor(*constructor_args)
    else:
        transaction = contract.constructor()
    
    # Transaction build et
    nonce = w3.eth.get_transaction_count(account.address)
    
    # zkSync Era için optimized transaction
    base_tx = {
        'from': account.address,
        'nonce': nonce,
        'chainId': CHAIN_ID
    }
    
    # Gas estimation
    try:
        built_tx_for_estimation = transaction.build_transaction(base_tx.copy())
        gas_limit = estimate_zksync_gas(w3, built_tx_for_estimation)
    except Exception:
        gas_limit = 5000000  # Fallback
    
    # zkSync Era için gas price
    try:
        gas_price = w3.eth.gas_price
        # Minimum gas price kontrolü
        min_gas_price = w3.to_wei('0.25', 'gwei')  # zkSync Era minimum
        if gas_price < min_gas_price:
            gas_price = min_gas_price
    except Exception:
        gas_price = w3.to_wei('0.25', 'gwei')  # zkSync Era default
    
    # Final transaction build
    built_tx = transaction.build_transaction({
        **base_tx,
        'gas': gas_limit,
        'gasPrice': gas_price
    })
    
    print(f"⛽ Gas Limit: {gas_limit:,}")
    print(f"💰 Gas Price: {w3.from_wei(gas_price, 'gwei'):.2f} gwei")
    
    # Transaction imzala ve gönder
    signed_tx = w3.eth.account.sign_transaction(built_tx, private_key=PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    
    print(f"📤 Transaction gönderildi: {tx_hash.hex()}")
    
    # Receipt bekle (zkSync Era daha hızlıdır)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    
    if receipt.status == 1:
        contract_address = receipt.contractAddress
        print(f"✅ {contract_name} başarıyla deploy edildi!")
        print(f"📍 Contract Address: {contract_address}")
        print(f"📦 Block Number: {receipt.blockNumber}")
        print(f"⛽ Gas Used: {receipt.gasUsed:,}")
        print(f"💰 Transaction Fee: {w3.from_wei(receipt.gasUsed * receipt.effectiveGasPrice, 'ether'):.6f} ETH")
        return contract_address, receipt
    else:
        print(f"❌ {contract_name} deployment başarısız!")
        print(f"📦 Transaction Hash: {tx_hash.hex()}")
        print(f"📦 Block Number: {receipt.blockNumber}")
        print(f"⛽ Gas Used: {receipt.gasUsed:,}")
        print(f"🔍 Explorer: https://sepolia.explorer.zksync.io/tx/{tx_hash.hex()}")
        
        raise Exception(f"❌ {contract_name} deployment başarısız! Status: {receipt.status}")

def main():
    """Ana deployment fonksiyonu"""
    print("🚀 ZKSYNC ERA PDM CONTRACT DEPLOYMENT")
    print("=" * 60)
    
    start_time = time.time()
    
    try:
        # zkSync Era ağ durumu kontrolü
        check_zksync_era_status()
        
        # Web3 setup
        w3, account = setup_web3()
        
        # Contract deployment sırası
        deployed_contracts = {}
        
        # 1. UniversalFailureVerifier deploy et
        print("\n" + "="*40)
        print("1️⃣ UNIVERSAL FAILURE VERIFIER DEPLOYMENT")
        print("="*40)
        
        # Admin adresi = deployer adresi
        verifier_address, verifier_receipt = deploy_contract(
            w3, account, "UniversalFailureVerifier", [account.address]
        )
        deployed_contracts['universal_failure_verifier'] = {
            'address': verifier_address,
            'tx_hash': verifier_receipt.transactionHash.hex(),
            'block_number': verifier_receipt.blockNumber,
            'gas_used': verifier_receipt.gasUsed
        }
        
        # 2. PdMSystemIntegrated deploy et (verifier address ile)
        print("\n" + "="*40)
        print("2️⃣ PDM SYSTEM INTEGRATED DEPLOYMENT")
        print("="*40)
        
        pdm_address, pdm_receipt = deploy_contract(
            w3, account, "PdMSystemIntegrated", [verifier_address, account.address]
        )
        deployed_contracts['pdm_system_integrated'] = {
            'address': pdm_address,
            'tx_hash': pdm_receipt.transactionHash.hex(),
            'block_number': pdm_receipt.blockNumber,
            'gas_used': pdm_receipt.gasUsed
        }
        
        # Deployment bilgilerini kaydet
        deployment_info = {
            "network": "zksync_era_sepolia",
            "chainId": str(CHAIN_ID),
            "deployer": account.address,
            "deployment_time": datetime.utcnow().isoformat() + "Z",
            "groth16_verifier_address": verifier_address,
            "pdm_system_address": pdm_address,
            "pdm_system_integrated_address": pdm_address,
            "universal_failure_verifier_address": verifier_address,
            "contract_type": "PdMSystemIntegrated",
            "deployment_status": "DEPLOYED",
            "deployment_details": deployed_contracts,
            "network_info": {
                "name": "zkSync Era Sepolia",
                "type": "zkEVM Layer 2 Testnet",
                "underlying_chain": "Sepolia",
                "chain_id": CHAIN_ID,
                "currency": "ETH",
                "explorer": "https://sepolia.explorer.zksync.io/",
                "rpc_url": ZKSYNC_ERA_RPC_URL,
                "advantages": [
                    "İşlem süresi: <2 saniye",
                    "Gas ücreti: %99+ daha düşük",
                    "Throughput: 2000+ TPS",
                    "zkEVM: Ethereum full compatibility",
                    "Account Abstraction: Gelişmiş wallet özellikleri",
                    "Native paymaster: Gas ücretini token ile ödeme"
                ]
            },
            "security_features": {
                "openzeppelin_contracts": True,
                "role_based_access": True,
                "reentrancy_guard": True,
                "pausable": True,
                "ownable": True,
                "zk_verification": True,
                "universal_failure_detection": True,
                "zkevm_compatibility": True,
                "account_abstraction": True
            },
            "zksync_specific_features": {
                "native_aa_support": True,
                "paymaster_compatibility": True,
                "l1_l2_messaging": True,
                "cheap_storage": True,
                "fast_finality": True
            }
        }
        
        # Deployment bilgilerini dosyaya kaydet
        with open("../zksync_era_deployment_info.json", "w") as f:
            json.dump(deployment_info, f, indent=2)
        
        # Özet rapor
        total_time = time.time() - start_time
        total_gas = sum([info['gas_used'] for info in deployed_contracts.values()])
        total_cost = sum([
            receipt.gasUsed * receipt.effectiveGasPrice 
            for receipt in [verifier_receipt, pdm_receipt]
        ])
        
        print("\n" + "="*60)
        print("🎉 ZKSYNC ERA DEPLOYMENT BAŞARILI!")
        print("="*60)
        print(f"⏱️  Toplam Süre: {total_time:.2f} saniye")
        print(f"⛽ Toplam Gas: {total_gas:,}")
        print(f"💰 Toplam Maliyet: {w3.from_wei(total_cost, 'ether'):.6f} ETH")
        print(f"📍 Verifier Contract: {verifier_address}")
        print(f"📍 PDM System Contract: {pdm_address}")
        print(f"📱 Explorer: https://sepolia.explorer.zksync.io/address/{pdm_address}")
        print(f"📄 Deployment Info: zksync_era_deployment_info.json")
        
        print("\n🚀 ZKSYNC ERA AVANTAJLARI:")
        print("   ⚡ İşlem süresi: <2 saniye")
        print("   💰 Gas ücreti: %99+ daha düşük")
        print("   🔄 Throughput: 2000+ TPS")
        print("   🛡️ zkEVM: Full Ethereum compatibility")
        print("   👤 Account Abstraction: Gelişmiş wallet özellikleri")
        print("   💳 Paymaster: Gas ücretini token ile ödeme")
        
        print("\n✅ Sistem hazır! PDM aplikasyonu zkSync Era'da çalışıyor.")
        
    except Exception as e:
        print(f"\n❌ Deployment hatası: {e}")
        return False
    
    return True

if __name__ == "__main__":
    success = main()
    if not success:
        exit(1)
