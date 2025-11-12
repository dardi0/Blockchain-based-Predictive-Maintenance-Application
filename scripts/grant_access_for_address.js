require('dotenv').config();
const { Provider, Wallet } = require('zksync-ethers');
const { Contract, keccak256, toUtf8Bytes } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main(){
  const RPC_URL = process.env.ZKSYNC_ERA_RPC_URL;
  const PRIVATE_KEY = process.env.PRIVATE_KEY; // Admin (SUPER_ADMIN_ROLE)
  const TARGET_ADDRESS = process.env.TARGET_ADDRESS; // erişim verilecek adres
  if(!RPC_URL || !PRIVATE_KEY) throw new Error('ZKSYNC_ERA_RPC_URL/PRIVATE_KEY eksik');
  if(!TARGET_ADDRESS) throw new Error('TARGET_ADDRESS env ile hedef adresi verin');

  const dep = JSON.parse(fs.readFileSync(path.join(process.cwd(),'deployment_info_hybrid_ZKSYNC_ERA.json'),'utf8'));
  const registryAddr = dep.contracts.AccessControlRegistry.address;
  const registryAbi = JSON.parse(fs.readFileSync(path.join(process.cwd(),'artifacts-zk','contracts','AccessControlRegistry.sol','AccessControlRegistry.json'),'utf8')).abi;

  const provider = new Provider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const registry = new Contract(registryAddr, registryAbi, wallet);

  const nodes = await registry.getNodesByAddress(TARGET_ADDRESS);
  if(!nodes || !nodes.length) throw new Error('Hedef adres için kayıtlı node yok');
  const nodeId = nodes[nodes.length-1];
  console.log('Granting access to nodeId:', nodeId);

  const SENSOR = keccak256(toUtf8Bytes('SENSOR_DATA'));
  const PRED = keccak256(toUtf8Bytes('PREDICTION'));
  const MAIN = keccak256(toUtf8Bytes('MAINTENANCE'));

  async function grant(resource, name){
    const tx = await registry.grantEmergencyAccess(nodeId, resource, `grant for ${TARGET_ADDRESS}`);
    console.log(name, 'TX:', tx.hash);
    await tx.wait();
  }

  await grant(SENSOR, 'SENSOR_DATA');
  // İsterseniz diğer kaynakları da açın:
  // await grant(PRED, 'PREDICTION');
  // await grant(MAIN, 'MAINTENANCE');

  console.log('Access granted.');
}

main().catch((e)=>{ console.error(e); process.exit(1); });

