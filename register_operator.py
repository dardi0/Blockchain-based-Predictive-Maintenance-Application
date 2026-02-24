#!/usr/bin/env python3
"""
Operator Wallet Registration Script
====================================
Bu script, operator cüzdan adresini blockchain AccessControlRegistry kontratına kaydeder.
"""

import json
import sys
import os
from pathlib import Path
from web3 import Web3
from dotenv import load_dotenv

# .env dosyasını yükle
load_dotenv()

def register_operator_wallet():
    """Operator cüzdanını blockchain'e kaydet"""
    
    print("🔐 Operator Cüzdan Kaydı Başlatılıyor...")
    print("="*70)
    
    # 1. RPC bağlantısı kur
    rpc_url = os.getenv("ZKSYNC_ERA_RPC_URL", "https://sepolia.era.zksync.dev")
    print(f"📡 RPC URL: {rpc_url}")
    
    web3 = Web3(Web3.HTTPProvider(rpc_url))
    if not web3.is_connected():
        print("❌ Blockchain bağlantısı kurulamadı!")
        return False
    
    print("✅ Blockchain bağlantısı başarılı")
    
    # 2. Operator private key'i al
    operator_private_key = os.getenv("OPERATOR_PRIVATE_KEY")
    if not operator_private_key:
        print("❌ OPERATOR_PRIVATE_KEY bulunamadı! .env dosyasını kontrol edin.")
        return False
    
    # Operator account oluştur
    operator_account = web3.eth.account.from_key(operator_private_key)
    operator_address = operator_account.address
    print(f"👤 Operator Address: {operator_address}")
    
    # 3. Admin private key al (kayıt işlemi için)
    admin_private_key = os.getenv("PRIVATE_KEY") or os.getenv("MANAGER_PRIVATE_KEY")
    if not admin_private_key:
        print("❌ Admin private key bulunamadı! PRIVATE_KEY veya MANAGER_PRIVATE_KEY gerekli.")
        return False
    
    admin_account = web3.eth.account.from_key(admin_private_key)
    admin_address = admin_account.address
    print(f"🔑 Admin Address: {admin_address}")
    
    # 4. Deployment info oku
    deployment_path = Path("deployment_info_hybrid_ZKSYNC_ERA.json")
    if not deployment_path.exists():
        print(f"❌ Deployment info bulunamadı: {deployment_path}")
        return False
    
    with open(deployment_path) as f:
        deployment_info = json.load(f)
    
    # AccessControlRegistry adresini al
    access_registry_address = deployment_info.get('contracts', {}).get('AccessControlRegistry', {}).get('address')
    if not access_registry_address:
        print("❌ AccessControlRegistry adresi bulunamadı!")
        return False
    
    print(f"📜 AccessControlRegistry: {access_registry_address}")
    
    # 5. PdMSystemHybrid kontratından SENSOR_DATA_RESOURCE değerini al
    pdm_address = deployment_info.get('contracts', {}).get('PdMSystemHybrid', {}).get('address')
    if not pdm_address:
        print("❌ PdMSystemHybrid adresi bulunamadı!")
        return False
    
    # PdM kontratının minimal ABI (sadece SENSOR_DATA_RESOURCE için)
    pdm_abi = [
        {
            "inputs": [],
            "name": "SENSOR_DATA_RESOURCE",
            "outputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
            "stateMutability": "view",
            "type": "function"
        }
    ]
    
    pdm_contract = web3.eth.contract(address=pdm_address, abi=pdm_abi)
    sensor_data_resource = pdm_contract.functions.SENSOR_DATA_RESOURCE().call()
    print(f"🔍 SENSOR_DATA_RESOURCE: {web3.to_hex(sensor_data_resource)}")
    
    # 6. AccessControlRegistry kontratı için minimal ABI
    access_registry_abi = [
        {
            "inputs": [
                {"internalType": "string", "name": "nodeName", "type": "string"},
                {"internalType": "address", "name": "nodeAddress", "type": "address"},
                {"internalType": "bytes32", "name": "groupId", "type": "bytes32"},
                {"internalType": "uint8", "name": "accessLevel", "type": "uint8"},
                {"internalType": "uint256", "name": "accessDuration", "type": "uint256"},
                {"internalType": "string", "name": "metadata", "type": "string"}
            ],
            "name": "registerNode",
            "outputs": [
                {"internalType": "bytes32", "name": "nodeId", "type": "bytes32"}
            ],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [
                {"internalType": "address", "name": "account", "type": "address"},
                {"internalType": "bytes32", "name": "resource", "type": "bytes32"},
                {"internalType": "uint256", "name": "requiredLevel", "type": "uint256"}
            ],
            "name": "checkAccess",
            "outputs": [
                {"internalType": "bool", "name": "hasAccess", "type": "bool"},
                {"internalType": "string", "name": "reason", "type": "string"}
            ],
            "stateMutability": "view",
            "type": "function"
        }
    ]
    
    access_registry = web3.eth.contract(address=access_registry_address, abi=access_registry_abi)
    
    # 7. Mevcut erişimi kontrol et
    print("\n🔍 Mevcut erişim kontrolü...")
    try:
        WRITE_LIMITED_LEVEL = 2  # AccessLevel.WRITE_LIMITED
        has_access, reason = access_registry.functions.checkAccess(
            operator_address,
            sensor_data_resource,
            WRITE_LIMITED_LEVEL
        ).call()
        
        if has_access:
            print(f"✅ Operator zaten kayıtlı! Reason: {reason}")
            return True
        else:
            print(f"⚠️ Operator kayıtlı değil. Reason: {reason}")
    except Exception as e:
        print(f"⚠️ Erişim kontrolü yapılamadı: {e}")
    
    # 8. Operator'ı kaydet  
    print("\n📝 Operator kaydediliyor...")
    try:
        # Transaction oluştur
        nonce = web3.eth.get_transaction_count(admin_address, 'pending')
        
        # SENSOR_DATA_RESOURCE vs..
        # Operator için: GROUP = DATA_PROCESSOR
        group_id = b"DATA_PROCESSOR".ljust(32, b'\0')
        metadata_json = json.dumps({"registeredBy": "python_script", "role": "OPERATOR"})
        
        register_tx = access_registry.functions.registerNode(
            "Python Operator",
            operator_address,
            group_id,
            WRITE_LIMITED_LEVEL,
            0, # duration
            metadata_json
        ).build_transaction({
            'from': admin_address,
            'nonce': nonce,
            'gas': 500000,
            'gasPrice': web3.eth.gas_price
        })
        
        # Transaction'ı imzala
        signed_tx = web3.eth.account.sign_transaction(register_tx, private_key=admin_private_key)
        
        # Transaction'ı gönder
        tx_hash = web3.eth.send_raw_transaction(signed_tx.raw_transaction)
        print(f"📤 Transaction gönderildi: {tx_hash.hex()}")
        
        # Receipt bekle
        print("⏳ Transaction onayı bekleniyor...")
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        
        if receipt.status == 1:
            print(f"✅ Operator başarıyla kaydedildi!")
            print(f"   Block Number: {receipt.blockNumber}")
            print(f"   Gas Used: {receipt.gasUsed}")
            
            # Tekrar kontrol et
            has_access, reason = access_registry.functions.checkAccess(
                operator_address,
                sensor_data_resource,
                WRITE_LIMITED_LEVEL
            ).call()
            print(f"   Access Check: {has_access} - {reason}")
            
            return True
        else:
            print(f"❌ Transaction başarısız oldu! Status: {receipt.status}")
            return False
            
    except Exception as e:
        print(f"❌ Kayıt işlemi başarısız: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("\n" + "="*70)
    print("  OPERATOR WALLET REGISTRATION SCRIPT")
    print("="*70 + "\n")
    
    success = register_operator_wallet()
    
    print("\n" + "="*70)
    if success:
        print("✅ İŞLEM BAŞARILI - Operator cüzdanı kaydedildi!")
        print("📋 Şimdi yapabilecekleriniz:")
        print("   1. API'yi yeniden başlatın: python api_main.py")
        print("   2. Yeni sensör verisi gönderin")
        print("   3. Blockchain Ledger sayfasında tx hash'leri görün")
    else:
        print("❌ İŞLEM BAŞARISIZ - Operator kaydedilemedi")
        print("📋 Kontrol edilecekler:")
        print("   1. .env dosyasında OPERATOR_PRIVATE_KEY var mı?")
        print("   2. .env dosyasında PRIVATE_KEY veya MANAGER_PRIVATE_KEY var mı?")
        print("   3. Blockchain bağlantısı çalışıyor mu?")
    print("="*70 + "\n")
    
    sys.exit(0 if success else 1)
