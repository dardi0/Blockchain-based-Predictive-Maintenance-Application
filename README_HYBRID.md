# Hibrit PDM Sistemi — Off-Chain Storage + Groth16 ZK-SNARK Proofs

Bu repo; sensör verilerini off-chain saklarken, zincire yalnızca Groth16 ZK kanıtlarını yazan hibrit bir PDM mimarisi sunar. Amaç; maliyet/performans dengesini korurken veri gizliliği ve bütünlüğünü sağlamaktır.

## Mimari Özeti

- Off-chain storage: Sensör verileri local SQLite DB’de tutulur.
- On-chain proofs: Sensör/tahmin/bakım kanıtları Groth16 ile doğrulanır.
- Tek doğrulayıcı: UnifiedGroth16Verifier (dinamik VK ile 3 devreyi de doğrular).
- Mock/fallback yoktur: circom/snarkjs bulunmazsa kanıt üretimi başarısız olur.

## Bileşenler

- Smart contracts
  - `contracts/PdMSystemHybrid.sol`: Ana hibrit PDM sözleşmesi
  - `contracts/AccessControlRegistry.sol`: Merkezi yetkilendirme
  - `contracts/UnifiedGroth16Verifier.sol`: Tek Groth16 doğrulayıcı (dinamik VK)

- Python
  - `zk_proof_generator.py`: Groth16 kanıt üretimi (circom+snarkjs ile)
  - `hybrid_blockchain_handler.py`: Zincir etkileşimi, kanıt gönderimi
  - `hybrid_storage_manager.py`: Local SQLite yönetimi
  - `pdm_main.py`: Uygulama/arayüz

- Circom devreleri
  - `circuits/hybrid/sensor_data_proof.circom`
  - `circuits/hybrid/prediction_proof.circom`
  - `circuits/hybrid/maintenance_proof.circom`

## Kurulum

Önkoşullar: Node.js 18+, Python 3.10+, circom/snarkjs, Hardhat zksync eklentileri.

```bash
# Python
pip install -r requirements.txt

# ZK araçları
npm install -g circom snarkjs

# JS bağımlılıkları
npm install
```

`.env` örneği:

```
ZKSYNC_ERA_RPC_URL=https://sepolia.era.zksync.dev
PRIVATE_KEY=0x... # test private key
PYTHONUTF8=1
```

## Derleme ve Dağıtım

```bash
# 1) Derle
npx hardhat compile

# 2) Dağıt (zkSync Era Sepolia)
node scripts/deploy_unified_and_pdm.js

# Dağıtım bilgisi: deployment_info_hybrid_ZKSYNC_ERA.json
```

Sözleşme adreslerini bu dosyadan ve explorer’dan teyit edebilirsiniz.

## VK (Verifying Key) Yönetimi

Unified doğrulayıcı dinamik VK kullanır. Her devre için VK’yı yazın:

```bash
# Sensör devresi VK
node scripts/set_verifying_key_sensor.js

# Tahmin devresi VK
node scripts/set_verifying_key_prediction.js

# Bakım devresi VK
node scripts/set_verifying_key_maintenance.js

# VK durum kontrolü
node scripts/check_vk.js
```

Notlar:
- Public inputs uzunluğu ile IC uzunluğu (IC.length - 1) eşleşmelidir.
- B noktası sıralaması Unified içinde EVM precompile’a göre yönetilir; off-chain “native” sırada gönderin.

## ZK Kanıt Üretimi ve Gönderimi

`zk_proof_generator.py` circom/snarkjs ile gerçek Groth16 kanıtları üretir. Mock yoktur. `hybrid_blockchain_handler.py` bu kanıtları zincire gönderir.

Örnek (sensör kanıtı gönderimi):

```python
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

## Doğrulama (Explorer)

Hardhat ile explorer doğrulaması:

```bash
npx hardhat run scripts/verify_hardhat.js --network zkSyncSepolia
```

Alternatif:

```bash
npx hardhat run scripts/verify_contract.js --network zkSyncSepolia
```

## Sık Sorulanlar

- Mock proofs var mı?
  - Hayır. Yalnızca gerçek Groth16 kanıtları üretilir/doğrulanır.
- String doğrulama var mı?
  - String placeholder/modüller kaldırıldı. Gerekirse string için ayrı devre + VK eklenebilir.
- Adapter sözleşmeleri?
  - Kaldırıldı. Tüm doğrulamalar `UnifiedGroth16Verifier` üzerinden yürür.

## Sorun Giderme

- `circom` veya `snarkjs` yoksa kanıt üretimi başarısız olur.
  - Kurulum: `circom --version`, `snarkjs --version`
- RPC bağlantısı için `.env` ve bakiye kontrol edin.

## Lisans

MIT

