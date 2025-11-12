// Deploy AccessControlRegistry, UnifiedGroth16Verifier and PdMSystemHybrid on zkSync Era Sepolia
require('dotenv').config();
const { Provider, Wallet, ContractFactory, utils } = require('zksync-ethers');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

function loadArtifact(relPath) {
  const p = path.join(process.cwd(), 'artifacts-zk', 'contracts', ...relPath.split('/'));
  if (!fs.existsSync(p)) throw new Error(`Artifact not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function main() {
  const RPC = process.env.ZKSYNC_ERA_RPC_URL;
  const PK = process.env.PRIVATE_KEY;
  if (!RPC || !PK) throw new Error('Missing ZKSYNC_ERA_RPC_URL or PRIVATE_KEY');

  const provider = new Provider(RPC);
  const wallet = new Wallet(PK, provider);

  console.log('Deployer:', wallet.address);
  const balance = await wallet.getBalance();
  console.log('Balance:', ethers.formatEther(balance), 'ETH');
  if (balance === 0n) throw new Error('Wallet has zero balance');

  // Load artifacts
  const accessArt = loadArtifact('AccessControlRegistry.sol/AccessControlRegistry.json');
  const unifiedArt = loadArtifact('UnifiedGroth16Verifier.sol/UnifiedGroth16Verifier.json');
  const pdmArt = loadArtifact('PdMSystemHybrid.sol/PdMSystemHybrid.json');

  // Deploy AccessControlRegistry(owner)
  console.log('\nDeploying AccessControlRegistry...');
  const accessFactory = new ContractFactory(accessArt.abi, accessArt.bytecode, wallet, 'create');
  const access = await accessFactory.deploy(wallet.address, {
    customData: { gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT },
  });
  await access.deploymentTransaction().wait();
  const accessAddr = await access.getAddress();
  console.log('AccessControlRegistry:', accessAddr);

  // Deploy UnifiedGroth16Verifier
  console.log('\nDeploying UnifiedGroth16Verifier...');
  const unifiedFactory = new ContractFactory(unifiedArt.abi, unifiedArt.bytecode, wallet, 'create');
  const unified = await unifiedFactory.deploy({
    customData: { gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT },
  });
  await unified.deploymentTransaction().wait();
  const unifiedAddr = await unified.getAddress();
  console.log('UnifiedGroth16Verifier:', unifiedAddr);

  // Deploy PdMSystemHybrid(access, verifier, initialAdmin)
  console.log('\nDeploying PdMSystemHybrid...');
  const pdmFactory = new ContractFactory(pdmArt.abi, pdmArt.bytecode, wallet, 'create');
  const pdm = await pdmFactory.deploy(accessAddr, unifiedAddr, wallet.address, {
    customData: { gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT },
  });
  await pdm.deploymentTransaction().wait();
  const pdmAddr = await pdm.getAddress();
  console.log('PdMSystemHybrid:', pdmAddr);

  // Save deployment info
  const outPath = path.join(process.cwd(), 'deployment_info_hybrid_ZKSYNC_ERA.json');
  let deployment = {};
  if (fs.existsSync(outPath)) {
    try { deployment = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch (_) {}
  }
  deployment.network = 'ZKSYNC_ERA';
  deployment.deployer = wallet.address;
  deployment.contracts = {
    AccessControlRegistry: { name: 'AccessControlRegistry', address: accessAddr },
    UnifiedGroth16Verifier: { name: 'UnifiedGroth16Verifier', address: unifiedAddr },
    PdMSystemHybrid: {
      name: 'PdMSystemHybrid',
      address: pdmAddr,
      dependencies: { accessRegistry: accessAddr, zkVerifier: unifiedAddr },
    },
  };
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log('\nSaved deployment to', outPath);
}

main().catch((e) => {
  console.error('Deployment error:', e);
  process.exit(1);
});

