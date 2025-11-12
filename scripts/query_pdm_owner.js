import 'dotenv/config';
import { Provider } from 'zksync-ethers';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

async function main() {
  const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL);
  const dep = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'deployment_info_hybrid_ZKSYNC_ERA.json'), 'utf8'));
  const pdmAddr = dep.contracts.PdMSystemHybrid.address;
  const art = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'artifacts-zk', 'contracts', 'PdMSystemHybrid.sol', 'PdMSystemHybrid.json'), 'utf8'));
  const c = new ethers.Contract(pdmAddr, art.abi, provider);
  const [owner, paused] = await Promise.all([c.owner(), c.paused()]);
  console.log('PdM owner:', owner);
  console.log('Paused:', paused);
}

main().catch((e)=>{ console.error(e); process.exit(1); });

