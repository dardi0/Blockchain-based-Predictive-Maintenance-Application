require('dotenv').config();
const { Provider, Wallet } = require('zksync-ethers');
const { Contract, keccak256, toUtf8Bytes } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main(){
  const RPC_URL = process.env.ZKSYNC_ERA_RPC_URL;
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if(!RPC_URL || !PRIVATE_KEY) throw new Error('ZKSYNC_ERA_RPC_URL/PRIVATE_KEY eksik');

  const dep = JSON.parse(fs.readFileSync(path.join(process.cwd(),'deployment_info_hybrid_ZKSYNC_ERA.json'),'utf8'));
  const registryAddr = dep.contracts.AccessControlRegistry.address;
  const registryAbi = JSON.parse(fs.readFileSync(path.join(process.cwd(),'artifacts-zk','contracts','AccessControlRegistry.sol','AccessControlRegistry.json'),'utf8')).abi;

  const provider = new Provider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const registry = new Contract(registryAddr, registryAbi, wallet);

  // 1) Mevcut node var mı?
  const nodes = await registry.getNodesByAddress(wallet.address);
  let nodeId = nodes && nodes.length ? nodes[nodes.length-1] : null;
  if(!nodeId){
    console.log('No node found. Registering a new node...');
    const nodeName = process.env.NODE_NAME || 'GatewayNode';
    const nodeType = Number(process.env.NODE_TYPE || 6); // GATEWAY_NODE
    const accessLevel = Number(process.env.ACCESS_LEVEL || 2); // WRITE_LIMITED
    const accessDuration = Number(process.env.ACCESS_DURATION || 0); // 0 = süresiz
    const metadata = process.env.NODE_METADATA || 'auto-registered';
    const tx = await registry.registerNode(nodeName, wallet.address, nodeType, accessLevel, accessDuration, metadata);
    console.log('Register TX:', tx.hash);
    await tx.wait();
    const nodesAfter = await registry.getNodesByAddress(wallet.address);
    nodeId = nodesAfter[nodesAfter.length-1];
  }
  console.log('Using nodeId:', nodeId);

  // 2) SENSOR_DATA için erişim talep et
  const SENSOR = keccak256(toUtf8Bytes('SENSOR_DATA'));
  const WRITE_LIMITED = 2;
  const duration = Number(process.env.REQUEST_DURATION || 3600);
  const justification = process.env.JUSTIFICATION || 'sensor submit access';
  const reqTx = await registry.requestAccess(nodeId, SENSOR, WRITE_LIMITED, duration, justification);
  console.log('requestAccess TX:', reqTx.hash);
  const receipt = await reqTx.wait();
  // requestId olaydan okunamadığı için tekrar oluşturmak uygun değil; kullanıcıya admin onayı için bu adresin nodeId'sini iletin
  console.log('Request submitted. Ask admin to approve or grant emergency access for this nodeId.');
}

main().catch((e)=>{ console.error(e); process.exit(1); });

