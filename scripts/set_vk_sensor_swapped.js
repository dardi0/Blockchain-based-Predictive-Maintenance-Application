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

function swapG2(g2){
  return [[g2[0][1], g2[0][0]],[g2[1][1], g2[1][0]]];
}

async function main(){
  const RPC = process.env.ZKSYNC_ERA_RPC_URL;
  const PK = process.env.PRIVATE_KEY;
  if (!RPC || !PK) throw new Error('Missing env: ZKSYNC_ERA_RPC_URL or PRIVATE_KEY');

  const root = process.cwd();
  const depPath = path.join(root, 'deployment_info_hybrid_ZKSYNC_ERA.json');
  const verifierArtifactPathUnified = path.join(root, 'artifacts-zk', 'contracts', 'UnifiedGroth16Verifier.sol', 'UnifiedGroth16Verifier.json');
  const vkJsonPath = process.env.SENSOR_VERIFICATION_KEY_JSON || path.join(root, 'temp', 'zk_proofs', 'verification_key.json');

  if (!fs.existsSync(depPath)) throw new Error(`Missing deployment: ${depPath}`);
  if (!fs.existsSync(verifierArtifactPathUnified)) throw new Error(`Missing artifact: ${verifierArtifactPathUnified}`);
  if (!fs.existsSync(vkJsonPath)) throw new Error(`Missing verification key: ${vkJsonPath}`);

  const dep = JSON.parse(fs.readFileSync(depPath, 'utf8'));
  const verifierAddress = (dep.contracts.UnifiedGroth16Verifier || {}).address;
  if (!verifierAddress) throw new Error('UnifiedGroth16Verifier address missing in deployment');

  const provider = new Provider(RPC);
  const wallet = new Wallet(PK, provider);
  const verifierArtifact = JSON.parse(fs.readFileSync(verifierArtifactPathUnified, 'utf8'));
  const verifier = new Contract(verifierAddress, verifierArtifact.abi, wallet);

  const vkJson = JSON.parse(fs.readFileSync(vkJsonPath, 'utf8'));
  const vk = loadVKFromJson(vkJson);

  // Pre-swap G2 so that on-chain _swapG2 returns the original orientation
  const vk_swapped = {
    alpha: vk.alpha,
    beta: swapG2(vk.beta),
    gamma: swapG2(vk.gamma),
    delta: swapG2(vk.delta),
    IC: vk.IC,
  };

  const tx = await verifier.setCircuitVerifyingKey(0, vk_swapped.alpha, vk_swapped.beta, vk_swapped.gamma, vk_swapped.delta, vk_swapped.IC);
  console.log('set VK (pre-swapped) tx:', tx.hash);
  await tx.wait();
  console.log('pre-swapped VK set.');
}

main().catch((e)=>{ console.error(e); process.exit(1); });

