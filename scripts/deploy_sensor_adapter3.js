require('dotenv').config();
const { Provider, Wallet, ContractFactory, Contract, utils } = require('zksync-ethers');
const fs = require('fs');
const path = require('path');

function loadArtifact(relPath) {
  const p = path.join(process.cwd(), 'artifacts-zk', 'contracts', ...relPath.split('/'));
  if (!fs.existsSync(p)) throw new Error(`Artifact not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function main(){
  const RPC = process.env.ZKSYNC_ERA_RPC_URL;
  const PK = process.env.PRIVATE_KEY;
  if (!RPC || !PK) throw new Error('Missing ZKSYNC_ERA_RPC_URL or PRIVATE_KEY');

  const provider = new Provider(RPC);
  const wallet = new Wallet(PK, provider);
  console.log('Deployer:', wallet.address);

  const depPath = path.join(process.cwd(), 'deployment_info_hybrid_ZKSYNC_ERA.json');
  if (!fs.existsSync(depPath)) throw new Error(`Missing deployment file: ${depPath}`);
  const deployInfo = JSON.parse(fs.readFileSync(depPath, 'utf8'));

  const pdmAddr = (deployInfo.contracts.PdMSystemHybrid||{}).address;
  if (!pdmAddr) throw new Error('PdMSystemHybrid address missing in deployment info');

  const pdmArt = loadArtifact('PdMSystemHybrid.sol/PdMSystemHybrid.json');
  const adapterArt = loadArtifact('SensorVerifierAdapter3.sol/SensorVerifierAdapter3.json');

  console.log('\nDeploying SensorVerifierAdapter3...');
  const factory = new ContractFactory(adapterArt.abi, adapterArt.bytecode, wallet, 'create');
  const adapter = await factory.deploy({ customData: { gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT } });
  await adapter.deploymentTransaction().wait();
  const adapterAddr = await adapter.getAddress();
  console.log('SensorVerifierAdapter3:', adapterAddr);

  console.log('\nUpdating PdM sensor verifier to Adapter3...');
  const pdm = new Contract(pdmAddr, pdmArt.abi, wallet);
  const tx = await pdm.updateSensorVerifier(adapterAddr, { customData: { gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT } });
  console.log('updateSensorVerifier tx:', tx.hash);
  await tx.wait();
  console.log('✓ PdM sensor verifier updated.');

  // Save into deployment info
  deployInfo.contracts.SensorVerifierAdapter3 = { name: 'SensorVerifierAdapter3', address: adapterAddr };
  fs.writeFileSync(depPath, JSON.stringify(deployInfo, null, 2));
  console.log('Saved deployment update to', depPath);
}

main().catch((e)=>{ console.error('deploy_sensor_adapter3 error:', e); process.exit(1); });

