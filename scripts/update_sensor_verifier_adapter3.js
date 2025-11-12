require('dotenv').config();
const { Provider, Wallet, ContractFactory, Contract } = require('zksync-ethers');
const fs = require('fs');
const path = require('path');

async function main(){
  const RPC = process.env.ZKSYNC_ERA_RPC_URL;
  const PK = process.env.PRIVATE_KEY;
  if(!RPC || !PK) throw new Error('Missing RPC/PK');
  const root = process.cwd();
  const depPath = path.join(root, 'deployment_info_hybrid_ZKSYNC_ERA.json');
  const pdmPath = path.join(root, 'artifacts-zk','contracts','PdMSystemHybrid.sol','PdMSystemHybrid.json');
  if(!fs.existsSync(depPath) || !fs.existsSync(pdmPath)) throw new Error('Missing files');
  const dep = JSON.parse(fs.readFileSync(depPath,'utf8'));
  const pdmAddr = dep.contracts.PdMSystemHybrid.address;
  const pdmAbi = JSON.parse(fs.readFileSync(pdmPath,'utf8')).abi;
  const adapter3Addr = (dep.contracts.SensorVerifierAdapter3||{}).address;
  if(!adapter3Addr) throw new Error('Adapter3 address missing in deployment_info');

  const provider = new Provider(RPC);
  const wallet = new Wallet(PK, provider);
  const pdm = new Contract(pdmAddr, pdmAbi, wallet);
  const tx = await pdm.updateSensorVerifier(adapter3Addr);
  console.log('updateSensorVerifier tx:', tx.hash);
  await tx.wait();
  console.log('updated.');
}

main().catch((e)=>{ console.error(e); process.exit(1); });

