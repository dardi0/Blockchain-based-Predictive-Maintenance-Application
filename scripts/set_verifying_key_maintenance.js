// scripts/set_verifying_key_maintenance.js (Unified)
require('dotenv').config();
const { Provider, Wallet } = require('zksync-ethers');
const { Contract } = require('ethers');
const fs = require('fs');
const path = require('path');

function norm(x){
  const s = String(x).trim();
  if (s.startsWith('0x') || s.startsWith('0X')) return s;
  const digits = s.replace(/[^0-9]/g, '');
  return digits.length ? digits : '0';
}
function toG1(p){ return [norm(p[0]), norm(p[1])]; }
function toG2(p){ return [[norm(p[0][0]), norm(p[0][1])],[norm(p[1][0]), norm(p[1][1])]]; }

async function main(){
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const RPC_URL = process.env.ZKSYNC_ERA_RPC_URL;
  if(!PRIVATE_KEY) throw new Error('PRIVATE_KEY .env içinde yok');
  if(!RPC_URL) throw new Error('ZKSYNC_ERA_RPC_URL .env içinde yok');

  const root = process.cwd();
  const depPath = path.join(root, 'deployment_info_hybrid_ZKSYNC_ERA.json');
  const artifactPath = path.join(root, 'artifacts-zk', 'contracts', 'UnifiedGroth16Verifier.sol', 'UnifiedGroth16Verifier.json');
  const vkJsonPath = process.env.MAINTENANCE_VERIFICATION_KEY_JSON || path.join('C:', 'temp', 'zk_proofs', 'maintenance_verification_key.json');

  if(!fs.existsSync(depPath)) throw new Error(`Deployment dosyası yok: ${depPath}`);
  if(!fs.existsSync(artifactPath)) throw new Error(`Unified artifact yok: ${artifactPath}`);
  if(!fs.existsSync(vkJsonPath)) throw new Error(`Maintenance VK JSON yok: ${vkJsonPath}`);

  const dep = JSON.parse(fs.readFileSync(depPath, 'utf8'));
  const verifierAddr = (dep.contracts.UnifiedGroth16Verifier || {}).address;
  if(!verifierAddr) throw new Error('UnifiedGroth16Verifier adresi yok');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const provider = new Provider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const verifier = new Contract(verifierAddr, artifact.abi, wallet);

  const vkJson = JSON.parse(fs.readFileSync(vkJsonPath, 'utf8'));
  const vk = {
    alpha: toG1(vkJson.vk_alpha_1),
    beta:  toG2(vkJson.vk_beta_2),
    gamma: toG2(vkJson.vk_gamma_2),
    delta: toG2(vkJson.vk_delta_2),
    IC:    vkJson.IC.map(toG1)
  };

  console.log('🚀 MAINTENANCE VK UnifiedGroth16Verifier\'a yazılıyor...');
  const tx = await verifier.setCircuitVerifyingKey(2, vk.alpha, vk.beta, vk.gamma, vk.delta, vk.IC);
  console.log('✅ TX:', tx.hash);
  await tx.wait();
  console.log('🎉 MAINTENANCE VK başarıyla ayarlandı.');
}

main().catch((e)=>{ console.error('❌ Maintenance VK set hatası:', e); process.exit(1); });

