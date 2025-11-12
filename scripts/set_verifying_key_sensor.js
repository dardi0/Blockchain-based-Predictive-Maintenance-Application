// scripts/set_verifying_key_sensor.js (Unified)
require('dotenv').config();
const { Provider, Wallet } = require('zksync-ethers');
const { Contract } = require('ethers');
const fs = require('fs');
const path = require('path');

function loadVKFromJson(vkJson) {
  const toStr = (x) => BigInt(x).toString();
  const toG1 = (p) => [toStr(p[0]), toStr(p[1])];
  const toG2 = (p) => [[toStr(p[0][0]), toStr(p[0][1])],[toStr(p[1][0]), toStr(p[1][1])]];
  return {
    alpha: toG1(vkJson.vk_alpha_1),
    beta:  toG2(vkJson.vk_beta_2),
    gamma: toG2(vkJson.vk_gamma_2),
    delta: toG2(vkJson.vk_delta_2),
    IC:    vkJson.IC.map((p) => toG1(p))
  };
}

async function main() {
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const RPC_URL = process.env.ZKSYNC_ERA_RPC_URL;
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY .env içinde yok');
  if (!RPC_URL) throw new Error('ZKSYNC_ERA_RPC_URL .env içinde yok');

  const root = process.cwd();
  const deploymentInfoPath = path.join(root, 'deployment_info_hybrid_ZKSYNC_ERA.json');
  const verifierArtifactPathUnified = path.join(root, 'artifacts-zk', 'contracts', 'UnifiedGroth16Verifier.sol', 'UnifiedGroth16Verifier.json');
  const vkJsonPath = process.env.SENSOR_VERIFICATION_KEY_JSON || path.join(process.cwd(), 'temp', 'zk_proofs', 'verification_key.json');

  if (!fs.existsSync(deploymentInfoPath)) throw new Error(`Deployment dosyası yok: ${deploymentInfoPath}`);
  if (!fs.existsSync(verifierArtifactPathUnified)) throw new Error(`Unified verifier artifact yok: ${verifierArtifactPathUnified}`);
  if (!fs.existsSync(vkJsonPath)) throw new Error(`VK JSON yok: ${vkJsonPath}`);

  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, 'utf8'));
  const verifierAddress = (deploymentInfo.contracts.UnifiedGroth16Verifier || {}).address;
  if (!verifierAddress) throw new Error('UnifiedGroth16Verifier adresi bulunamadı');

  const verifierArtifact = JSON.parse(fs.readFileSync(verifierArtifactPathUnified, 'utf8'));
  const provider = new Provider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const verifier = new Contract(verifierAddress, verifierArtifact.abi, wallet);

  const vkJson = JSON.parse(fs.readFileSync(vkJsonPath, 'utf8'));
  const vk = loadVKFromJson(vkJson);
  console.log('Verifying Key to be set:');
  console.log(JSON.stringify(vk, null, 2));

  console.log('🚀 SENSOR_DATA VK UnifiedGroth16Verifier\'a yazılıyor...');
  const tx = await verifier.setCircuitVerifyingKey(
    0,                  // CircuitType.SENSOR_DATA
    vk.alpha,
    vk.beta,
    vk.gamma,
    vk.delta,
    vk.IC
  );
  console.log('✅ TX:', tx.hash);
  await tx.wait();
  console.log('🎉 SENSOR_DATA VK başarıyla ayarlandı.');
}

main().catch((e) => {
  console.error('❌ VK set hatası:', e);
  process.exit(1);
});

