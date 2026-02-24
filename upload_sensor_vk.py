# -*- coding: utf-8 -*-
"""
Sensor Circuit Verification Key Upload Script
Bu script, local verification key'i on-chain verifier kontratına yükler.
"""

import json
import os
from pathlib import Path
from web3 import Web3
from dotenv import load_dotenv

# .env dosyasını yükle
env_path = Path(__file__).parent / '.env'
if env_path.exists():
    load_dotenv(env_path)
    print(f"✅ .env dosyası yüklendi: {env_path}")
else:
    load_dotenv()  # Fallback
    print("⚠️ .env dosyası varsayılan konumdan yükleniyor")

def main():
    print("=" * 60)
    print("🔑 SENSOR CIRCUIT VERIFICATION KEY UPLOAD")
    print("=" * 60)
    
    # 1. Verification Key'i Oku
    vk_path = Path("temp/zk_proofs/verification_key.json")
    if not vk_path.exists():
        print(f"❌ Verification key bulunamadı: {vk_path}")
        return False
    
    with open(vk_path, 'r', encoding='utf-8') as f:
        vk_json = json.load(f)
    
    print(f"✅ Verification key yüklendi: {vk_path}")
    print(f"   Protocol: {vk_json.get('protocol')}")
    print(f"   Curve: {vk_json.get('curve')}")
    print(f"   nPublic: {vk_json.get('nPublic')}")
    print(f"   IC Length: {len(vk_json.get('IC', []))}")
    
    # 2. Deployment Info'yu Oku
    deployment_path = Path("deployment_info_hybrid_ZKSYNC_ERA.json")
    if not deployment_path.exists():
        print(f"❌ Deployment info bulunamadı: {deployment_path}")
        return False
    
    with open(deployment_path, 'r', encoding='utf-8') as f:
        deployment_info = json.load(f)
    
    contracts = deployment_info.get('contracts', {})
    
    # Verifier adresini bul - önce UnifiedGroth16Verifier, yoksa OptimizedGroth16Verifier
    verifier_info = contracts.get('UnifiedGroth16Verifier') or contracts.get('OptimizedGroth16Verifier')
    if not verifier_info:
        print("❌ Verifier contract adresi bulunamadı!")
        return False
    
    verifier_address = verifier_info.get('address')
    print(f"✅ Verifier Address: {verifier_address}")
    
    # 3. Web3 Bağlantısı
    rpc_url = os.getenv('ZKSYNC_ERA_TESTNET_RPC_URL') or 'https://sepolia.era.zksync.dev'
    # Öncelik sırası: CONTRACT_OWNER > MANAGER > ENGINEER > OPERATOR > PRIVATE_KEY
    private_key = (
        os.getenv('CONTRACT_OWNER_PRIVATE_KEY') or
        os.getenv('MANAGER_PRIVATE_KEY') or
        os.getenv('ENGINEER_PRIVATE_KEY') or
        os.getenv('OPERATOR_PRIVATE_KEY') or
        os.getenv('Private_Key') or 
        os.getenv('PRIVATE_KEY')
    )
    
    if not private_key:
        print("❌ Private key bulunamadı! .env dosyasında hiçbir private key yok.")
        return False
    
    print(f"✅ Private key bulundu (uzunluk: {len(private_key)} karakter)")
    
    # Private key formatını düzelt
    private_key = private_key.strip().strip('"').strip("'")
    if not private_key.startswith('0x'):
        private_key = '0x' + private_key
    
    web3 = Web3(Web3.HTTPProvider(rpc_url))
    if not web3.is_connected():
        print(f"❌ Web3 bağlantısı başarısız: {rpc_url}")
        return False
    
    print(f"✅ Web3 bağlantısı başarılı: {rpc_url}")
    
    account = web3.eth.account.from_key(private_key)
    admin_address = account.address
    balance = web3.from_wei(web3.eth.get_balance(admin_address), 'ether')
    print(f"✅ Admin Account: {admin_address}")
    print(f"✅ Balance: {balance:.6f} ETH")
    
    # 4. Verifier ABI'yi yükle
    abi_path = Path("artifacts-zk/contracts/UnifiedGroth16Verifier.sol/UnifiedGroth16Verifier.json")
    if not abi_path.exists():
        abi_path = Path("artifacts-zk/contracts/OptimizedGroth16Verifier.sol/OptimizedGroth16Verifier.json")
    
    if not abi_path.exists():
        print(f"❌ Verifier ABI bulunamadı!")
        return False
    
    with open(abi_path, 'r', encoding='utf-8') as f:
        verifier_artifact = json.load(f)
    
    verifier_contract = web3.eth.contract(
        address=web3.to_checksum_address(verifier_address),
        abi=verifier_artifact['abi']
    )
    
    # 5. Mevcut VK durumunu kontrol et
    try:
        # CircuitType.SENSOR_DATA = 0
        vk_info = verifier_contract.functions.circuitKeys(0).call()
        is_set = vk_info[-1] if isinstance(vk_info, (list, tuple)) else False
        print(f"📊 Mevcut Sensor VK durumu: isSet = {is_set}")
        
        if is_set:
            print("⚠️  Sensor VK zaten ayarlanmış!")
            user_input = input("   Üzerine yazmak ister misiniz? (e/h): ").strip().lower()
            if user_input != 'e':
                print("   İşlem iptal edildi.")
                return False
    except Exception as e:
        print(f"⚠️  VK durumu kontrol edilemedi: {e}")
    
    # 6. VK Parametrelerini Hazırla
    def _norm(v):
        if isinstance(v, int):
            return v
        s = str(v)
        return int(s, 16) if s.lower().startswith('0x') else int(s)
    
    # Alpha (G1 Point)
    alpha = (_norm(vk_json['vk_alpha_1'][0]), _norm(vk_json['vk_alpha_1'][1]))
    print(f"\n📐 Alpha Point:")
    print(f"   X: {alpha[0]}")
    print(f"   Y: {alpha[1]}")
    
    # G2 Point helper - snarkjs formatından Solidity formatına
    def _g2(point):
        # snarkjs: [[x0, x1], [y0, y1]]
        # Solidity: X = [x0, x1], Y = [y0, y1]
        return (
            [_norm(point[0][0]), _norm(point[0][1])],  # X
            [_norm(point[1][0]), _norm(point[1][1])]   # Y
        )
    
    beta = _g2(vk_json['vk_beta_2'])
    gamma = _g2(vk_json['vk_gamma_2'])
    delta = _g2(vk_json['vk_delta_2'])
    
    print(f"\n📐 Beta Point (G2):")
    print(f"   X: {beta[0]}")
    print(f"   Y: {beta[1]}")
    
    # IC Points (G1 Points array)
    ic_points = [(_norm(p[0]), _norm(p[1])) for p in vk_json['IC']]
    print(f"\n📐 IC Points: {len(ic_points)} adet")
    for i, p in enumerate(ic_points):
        x_str = str(p[0])[:20]
        y_str = str(p[1])[:20]
        print(f"   IC[{i}]: X={x_str}..., Y={y_str}...")
    
    # 7. Transaction Oluştur ve Gönder
    print("\n" + "=" * 60)
    print("🚀 TRANSACTION GÖNDERILIYOR...")
    print("=" * 60)
    
    try:
        nonce = web3.eth.get_transaction_count(admin_address, 'pending')
        
        # setCircuitVerifyingKey(CircuitType, alpha, beta, gamma, delta, IC[])
        tx = verifier_contract.functions.setCircuitVerifyingKey(
            0,  # CircuitType.SENSOR_DATA
            alpha,
            beta,
            gamma,
            delta,
            ic_points
        ).build_transaction({
            'from': admin_address,
            'nonce': nonce,
            'gas': 5000000,
            'gasPrice': web3.eth.gas_price
        })
        
        print(f"   Gas Limit: {tx['gas']}")
        print(f"   Gas Price: {web3.from_wei(tx['gasPrice'], 'gwei'):.2f} Gwei")
        
        # Transaction'ı imzala ve gönder
        signed_tx = web3.eth.account.sign_transaction(tx, private_key=private_key)
        tx_hash = web3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        print(f"\n✅ Transaction gönderildi!")
        print(f"   TX Hash: {tx_hash.hex()}")
        print(f"\n⏳ Transaction onayı bekleniyor...")
        
        # Receipt bekle
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        
        if receipt.status == 1:
            print(f"\n🎉 BAŞARILI!")
            print(f"   Block Number: {receipt.blockNumber}")
            print(f"   Gas Used: {receipt.gasUsed}")
            print(f"\n✅ Sensor Circuit Verification Key başarıyla yüklendi!")
            
            # Doğrulama
            vk_check = verifier_contract.functions.circuitKeys(0).call()
            is_set_after = vk_check[-1] if isinstance(vk_check, (list, tuple)) else False
            print(f"   Yeni VK durumu: isSet = {is_set_after}")
            
            return True
        else:
            print(f"\n❌ Transaction BAŞARISIZ!")
            print(f"   Status: {receipt.status}")
            return False
            
    except Exception as e:
        print(f"\n❌ HATA: {e}")
        return False

if __name__ == "__main__":
    success = main()
    print("\n" + "=" * 60)
    if success:
        print("✅ İşlem tamamlandı. Artık sensor proof gönderebilirsiniz!")
    else:
        print("❌ İşlem başarısız oldu. Lütfen hataları kontrol edin.")
    print("=" * 60)
