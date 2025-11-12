require('dotenv').config();
const { Provider, Wallet } = require('zksync-ethers');
const { Contract } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  const RPC = process.env.ZKSYNC_ERA_RPC_URL;
  const PK = process.env.PRIVATE_KEY;
  if (!RPC || !PK) throw new Error('Missing ZKSYNC_ERA_RPC_URL or PRIVATE_KEY');

  const root = process.cwd();
  const depPath = path.join(root, 'deployment_info_hybrid_ZKSYNC_ERA.json');
  const verArtifactPath = path.join(root, 'artifacts-zk', 'contracts', 'UnifiedGroth16Verifier.sol', 'UnifiedGroth16Verifier.json');
  if (!fs.existsSync(depPath) || !fs.existsSync(verArtifactPath)) {
    throw new Error('Missing deployment info or verifier artifact');
  }
  const dep = JSON.parse(fs.readFileSync(depPath, 'utf8'));
  const verAddr = (dep.contracts.UnifiedGroth16Verifier || {}).address;
  if (!verAddr) throw new Error('UnifiedGroth16Verifier address not found');

  // Export solidity calldata via snarkjs
  const { execSync } = require('child_process');
  const cmd = 'npx --yes snarkjs zkey export soliditycalldata temp/zk_proofs/sensor_data_proof_public.json temp/zk_proofs/sensor_data_proof_proof.json';
  const out = execSync(cmd, { encoding: 'utf8' }).trim();

  // Parse arrays
  const parts = JSON.parse('[' + out + ']');
  let A = parts[0], B = parts[1], C = parts[2], INPUTS = parts[3];

  // Instantiate contract and call
  const provider = new Provider(RPC);
  const wallet = new Wallet(PK, provider);
  const abi = JSON.parse(fs.readFileSync(verArtifactPath, 'utf8')).abi;
  const verifier = new Contract(verAddr, abi, wallet);

  const ok = await verifier.verifySensorDataProof(A, B, C, INPUTS);
  console.log(JSON.stringify({ ok: !!ok, inputs: INPUTS }));
}

main().catch((e) => { console.error(e); process.exit(1); });

