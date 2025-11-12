// Full system deployment: AccessControlRegistry, UnifiedGroth16Verifier, PdMSystemHybrid
// plus SensorVerifierAdapter and PredictionVerifierAdapter, and hook adapters into PdM.
require('dotenv').config();
const { Provider, Wallet, ContractFactory, utils } = require('zksync-ethers');
const { Contract, ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

function loadArtifact(rel) {
  const p = path.join(process.cwd(), 'artifacts-zk', 'contracts', ...rel.split('/'));
  if (!fs.existsSync(p)) throw new Error(`Artifact not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function tryGetVKPath(envName, fallbackRel) {
  const envVal = process.env[envName];
  if (envVal && fs.existsSync(envVal)) return envVal;
  const local = path.join(process.cwd(), ...fallbackRel.split('/'));
  if (fs.existsSync(local)) return local;
  return null;
}

function toG1(p) {
  const s = (x) => {
    console.log(`toG1 converting: ${x}`);
    return BigInt(x.toString().replace(/,/g, '')).toString();
  };
  return [s(p[0]), s(p[1])];
}
function toG2(p) {
  const s = (x) => {
    console.log(`toG2 converting: ${x}`);
    return BigInt(x.toString().replace(/,/g, '')).toString();
  };
  return [[s(p[0][0]), s(p[0][1])], [s(p[1][0]), s(p[1][1])]];
}

async function maybeSetVK(verifier, circuitIndex, vkJsonPath, label) {
  if (!vkJsonPath) {
    console.log(`- ${label} VK dosyası bulunamadı, atlanıyor.`);
    return false;
  }
  const vkJson = JSON.parse(fs.readFileSync(vkJsonPath, 'utf8'));
  const vk = {
    alpha: toG1(vkJson.vk_alpha_1),
    beta: toG2(vkJson.vk_beta_2),
    gamma: toG2(vkJson.vk_gamma_2),
    delta: toG2(vkJson.vk_delta_2),
    IC: vkJson.IC.map(toG1),
  };
  console.log(`- ${label} VK ayarlanıyor (IC=${vk.IC.length})...`);
  const tx = await verifier.setCircuitVerifyingKey(
    circuitIndex,
    vk.alpha,
    vk.beta,
    vk.gamma,
    vk.delta,
    vk.IC
  );
  console.log(`  tx: ${tx.hash}`);
  await tx.wait();
  console.log(`  ✓ ${label} VK ayarlandı.`);
  return true;
}

async function main() {
  const RPC = process.env.ZKSYNC_ERA_RPC_URL;
  const PK = process.env.PRIVATE_KEY;
  if (!RPC) throw new Error('ZKSYNC_ERA_RPC_URL .env içinde yok');
  if (!PK) throw new Error('PRIVATE_KEY .env içinde yok');

  const provider = new Provider(RPC);
  const wallet = new Wallet(PK, provider);

  console.log('Deployer:', wallet.address);
  const balance = await wallet.getBalance();
  console.log('Balance:', ethers.formatEther(balance), 'ETH');
  if (balance === 0n) throw new Error('Cüzdan bakiyesi 0');

  // Load artifacts
  const accessArt = loadArtifact('AccessControlRegistry.sol/AccessControlRegistry.json');
  const unifiedArt = loadArtifact('UnifiedGroth16Verifier.sol/UnifiedGroth16Verifier.json');
  const pdmArt = loadArtifact('PdMSystemHybrid.sol/PdMSystemHybrid.json');
  const sensorAdapterArt = loadArtifact('SensorVerifierAdapter.sol/SensorVerifierAdapter.json');
  const predAdapterArt = loadArtifact('PredictionVerifierAdapter.sol/PredictionVerifierAdapter.json');

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

  // Deploy SensorVerifierAdapter
  console.log('\nDeploying SensorVerifierAdapter...');
  const sensorFactory = new ContractFactory(sensorAdapterArt.abi, sensorAdapterArt.bytecode, wallet, 'create');
  const sensorAdapter = await sensorFactory.deploy({
    customData: { gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT },
  });
  await sensorAdapter.deploymentTransaction().wait();
  const sensorAdapterAddr = await sensorAdapter.getAddress();
  console.log('SensorVerifierAdapter:', sensorAdapterAddr);

  // Deploy PredictionVerifierAdapter
  console.log('\nDeploying PredictionVerifierAdapter...');
  const predFactory = new ContractFactory(predAdapterArt.abi, predAdapterArt.bytecode, wallet, 'create');
  const predAdapter = await predFactory.deploy({
    customData: { gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT },
  });
  await predAdapter.deploymentTransaction().wait();
  const predAdapterAddr = await predAdapter.getAddress();
  console.log('PredictionVerifierAdapter:', predAdapterAddr);

  // Hook adapters into PdM (onlyOwner)
  console.log('\nUpdating PdM verifiers...');
  const pdmContract = new Contract(pdmAddr, pdmArt.abi, wallet);
  let tx = await pdmContract.updateSensorVerifier(sensorAdapterAddr, {
    customData: { gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT },
  });
  console.log('updateSensorVerifier tx:', tx.hash);
  await tx.wait();
  tx = await pdmContract.updatePredictionVerifier(predAdapterAddr, {
    customData: { gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT },
  });
  console.log('updatePredictionVerifier tx:', tx.hash);
  await tx.wait();
  console.log('✓ PdM verifiers güncellendi.');

  // Optionally set VKs on Unified verifier (if files exist)
  console.log('\nOptional: Setting VKs on UnifiedGroth16Verifier (if available)...');
  const unifiedContract = new Contract(unifiedAddr, unifiedArt.abi, wallet);
  const sensorVK = tryGetVKPath('SENSOR_VERIFICATION_KEY_JSON', 'temp/zk_proofs/verification_key.json');
  const predVK = tryGetVKPath('PREDICTION_VERIFICATION_KEY_JSON', 'temp/zk_proofs/prediction_verification_key.json');
  const maintVK = tryGetVKPath('MAINTENANCE_VERIFICATION_KEY_JSON', 'temp/zk_proofs/maintenance_verification_key.json');
  try { await maybeSetVK(unifiedContract, 0, sensorVK, 'SENSOR_DATA'); } catch (e) { console.warn('! SENSOR_DATA VK ayarlanamadı:', e.message); }
  try { await maybeSetVK(unifiedContract, 1, predVK, 'PREDICTION'); } catch (e) { console.warn('! PREDICTION VK ayarlanamadı:', e.message); }
  try { await maybeSetVK(unifiedContract, 2, maintVK, 'MAINTENANCE'); } catch (e) { console.warn('! MAINTENANCE VK ayarlanamadı:', e.message); }

  // Save/merge deployment info
  const outPath = path.join(process.cwd(), 'deployment_info_hybrid_ZKSYNC_ERA.json');
  let deployment = {};
  if (fs.existsSync(outPath)) {
    try { deployment = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch (_) {}
  }
  if (!deployment.contracts) deployment.contracts = {};
  deployment.network = 'ZKSYNC_ERA';
  deployment.deployer = wallet.address;
  deployment.contracts.AccessControlRegistry = { name: 'AccessControlRegistry', address: accessAddr };
  deployment.contracts.UnifiedGroth16Verifier = { name: 'UnifiedGroth16Verifier', address: unifiedAddr };
  deployment.contracts.PdMSystemHybrid = {
    name: 'PdMSystemHybrid',
    address: pdmAddr,
    dependencies: { accessRegistry: accessAddr, zkVerifier: unifiedAddr },
    adapters: { sensor: sensorAdapterAddr, prediction: predAdapterAddr },
  };
  deployment.contracts.SensorVerifierAdapter = { name: 'SensorVerifierAdapter', address: sensorAdapterAddr };
  deployment.contracts.PredictionVerifierAdapter = { name: 'PredictionVerifierAdapter', address: predAdapterAddr };
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log('\nSaved deployment to', outPath);

  console.log('\nALL DONE.');
  console.log('AccessControlRegistry  :', accessAddr);
  console.log('UnifiedGroth16Verifier :', unifiedAddr);
  console.log('PdMSystemHybrid        :', pdmAddr);
  console.log('SensorVerifierAdapter  :', sensorAdapterAddr);
  console.log('PredictionVerifierAdapter:', predAdapterAddr);
}

main().catch((e) => {
  console.error('Deployment error:', e);
  process.exit(1);
});

