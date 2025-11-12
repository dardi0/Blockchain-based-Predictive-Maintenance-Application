require('dotenv').config();
const { Provider, Wallet, Contract } = require('zksync-ethers');
const fs = require('fs');
const path = require('path');

async function main(){
  const RPC = process.env.ZKSYNC_ERA_RPC_URL;
  const PK = process.env.PRIVATE_KEY;
  const hash = (process.argv[2]||'').toLowerCase();
  if(!RPC || !PK) throw new Error('Missing RPC/PK');
  if(!hash || !hash.startsWith('0x') || hash.length!==66) throw new Error('Usage: node scripts/check_data_hash_used.js 0x...32bytes');
  const root = process.cwd();
  const depPath = path.join(root, 'deployment_info_hybrid_ZKSYNC_ERA.json');
  const pdmPath = path.join(root, 'artifacts-zk','contracts','PdMSystemHybrid.sol','PdMSystemHybrid.json');
  const dep = JSON.parse(fs.readFileSync(depPath,'utf8'));
  const pdmAddr = dep.contracts.PdMSystemHybrid.address;
  const pdmAbi = JSON.parse(fs.readFileSync(pdmPath,'utf8')).abi;
  const provider = new Provider(RPC);
  const wallet = new Wallet(PK, provider);
  const pdm = new Contract(pdmAddr, pdmAbi, wallet);
  const used = await pdm.usedDataHashes(hash);
  console.log(JSON.stringify({ hash, used: !!used }));
}

main().catch((e)=>{ console.error(e); process.exit(1); });

