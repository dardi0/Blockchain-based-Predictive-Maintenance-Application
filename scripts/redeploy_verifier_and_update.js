require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Provider, Wallet, ContractFactory } = require('zksync-ethers');
const { ethers } = require('ethers');

async function main() {
  const RPC = process.env.ZKSYNC_ERA_RPC_URL;
  const PK = process.env.PRIVATE_KEY;
  if (!RPC || !PK) throw new Error('Missing ZKSYNC_ERA_RPC_URL or PRIVATE_KEY');

  const root = process.cwd();
  const depPath = path.join(root, 'deployment_info_hybrid_ZKSYNC_ERA.json');
  const pdmArtifactPath = path.join(root, 'artifacts-zk', 'contracts', 'PdMSystemHybrid.sol', 'PdMSystemHybrid.json');
  const verArtifactPath = path.join(root, 'artifacts-zk', 'contracts', 'UnifiedGroth16Verifier.sol', 'UnifiedGroth16Verifier.json');
  if (!fs.existsSync(depPath) || !fs.existsSync(pdmArtifactPath) || !fs.existsSync(verArtifactPath)) {
    throw new Error('Missing deployment info or artifacts');
  }
  const dep = JSON.parse(fs.readFileSync(depPath, 'utf8'));
  const pdmAddr = dep.contracts.PdMSystemHybrid.address;
  const pdmAbi = JSON.parse(fs.readFileSync(pdmArtifactPath, 'utf8')).abi;
  const verArtifact = JSON.parse(fs.readFileSync(verArtifactPath, 'utf8'));

  const provider = new Provider(RPC);
  const wallet = new Wallet(PK, provider);

  console.log('Deployer:', wallet.address);

  // 1) Deploy new Verifier
  const factory = new ContractFactory(verArtifact.abi, verArtifact.bytecode, wallet, 'create');
  const verifier = await factory.deploy();
  await verifier.deploymentTransaction().wait();
  const newVerifierAddr = await verifier.getAddress();
  console.log('New Verifier:', newVerifierAddr);

  // 2) Update PDM to point to new verifier
  const pdm = new ethers.Contract(pdmAddr, pdmAbi, new ethers.Wallet(PK, new ethers.JsonRpcProvider(RPC)));
  const tx = await pdm.updateZKVerifier(newVerifierAddr);
  console.log('updateZKVerifier tx:', tx.hash);
  await tx.wait();
  console.log('PDM updated to new verifier');

  // 3) Save back
  dep.contracts.UnifiedGroth16Verifier = {
    name: 'UnifiedGroth16Verifier',
    address: newVerifierAddr
  };
  fs.writeFileSync(depPath, JSON.stringify(dep, null, 2));
}

main().catch((e)=>{ console.error(e); process.exit(1); });
