require('dotenv').config();
const { Provider, Wallet } = require('zksync-ethers');
const { keccak256, toUtf8Bytes } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const RPC_URL = process.env.ZKSYNC_ERA_RPC_URL;
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY .env içinde bulunamadı');
  if (!RPC_URL) throw new Error('ZKSYNC_ERA_RPC_URL .env içinde bulunamadı');

  // Deployment ve ABI yolları
  const deploymentInfoPath = path.join(process.cwd(), 'deployment_info_hybrid_ZKSYNC_ERA.json');
  if (!fs.existsSync(deploymentInfoPath)) {
    throw new Error(`Deployment dosyası bulunamadı: ${deploymentInfoPath}`);
  }
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, 'utf8'));
  const registryAddress = deploymentInfo.contracts.AccessControlRegistry.address;

  const registryArtifactPath = path.join(process.cwd(), 'artifacts-zk', 'contracts', 'AccessControlRegistry.sol', 'AccessControlRegistry.json');
  if (!fs.existsSync(registryArtifactPath)) {
    throw new Error(`Artifact bulunamadı: ${registryArtifactPath}`);
  }
  const registryArtifact = JSON.parse(fs.readFileSync(registryArtifactPath, 'utf8'));

  // Provider & wallet
  const provider = new Provider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);

  const { Contract } = require('ethers');
  const registry = new Contract(registryAddress, registryArtifact.abi, wallet);

  console.log('🔗 Registry:', await registry.getAddress());
  console.log('👤 Wallet :', wallet.address);

  const targetAddress = process.argv[2] || wallet.address;
  console.log(`🎯 Yetki verilecek adres: ${targetAddress}`);
  // The node is registered under the deployer's address (msg.sender of registerNode)
  const deployerAddress = wallet.address;
  const nodeIds = await registry.getNodesByAddress(deployerAddress);
  if (!nodeIds || nodeIds.length === 0) {
    throw new Error(`Dağıtıcı cüzdan için kayıtlı node bulunamadı: ${deployerAddress}.`);
  }

  let nodeIdToGrant;
  for (const id of nodeIds) {
    const node = await registry.nodes(id);
    if (node.nodeAddress.toLowerCase() === targetAddress.toLowerCase()) {
      nodeIdToGrant = id;
      break;
    }
  }

  if (!nodeIdToGrant) {
    throw new Error(`Hedef adres için kayıtlı node bulunamadı: ${targetAddress}.`);
  }
  console.log('🆔 Kullanılacak nodeId:', nodeIdToGrant);
  const nodeId = nodeIdToGrant;
  console.log('🆔 Kullanılacak nodeId:', nodeId);

  // Kaynaklar
  const SENSOR_DATA_RESOURCE = keccak256(toUtf8Bytes('SENSOR_DATA'));
  const PREDICTION_RESOURCE = keccak256(toUtf8Bytes('PREDICTION'));
  const MAINTENANCE_RESOURCE = keccak256(toUtf8Bytes('MAINTENANCE'));

  // SUPER_ADMIN rolü gerektirir. grant_roles.js ile verilmiş olmalı.
  async function grant(resource, name) {
    console.log(`\n🚀 ${name} için acil erişim veriliyor...`);
    const tx = await registry.grantEmergencyAccess(nodeId, resource, 'Hybrid system init');
    console.log('   📤 TX:', tx.hash);
    await tx.wait();
    console.log(`   ✅ ${name} erişimi verildi.`);
  }

  await grant(SENSOR_DATA_RESOURCE, 'SENSOR_DATA');
  await grant(PREDICTION_RESOURCE, 'PREDICTION');
  await grant(MAINTENANCE_RESOURCE, 'MAINTENANCE');

  console.log('\n🎉 Tüm kaynak erişimleri başarıyla verildi.');
}

main().catch((e) => {
  console.error('💥 grant_resource_access.js hata:', e);
  process.exit(1);
});


