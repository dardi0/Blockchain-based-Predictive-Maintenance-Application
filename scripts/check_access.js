require('dotenv').config();
const { Provider, Wallet } = require('zksync-ethers');
const { keccak256, toUtf8Bytes, Contract } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  const RPC_URL = process.env.ZKSYNC_ERA_RPC_URL;
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!RPC_URL || !PRIVATE_KEY) {
    throw new Error('Missing ZKSYNC_ERA_RPC_URL or PRIVATE_KEY');
  }
  const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'deployment_info_hybrid_ZKSYNC_ERA.json'), 'utf8'));
  const registryAddr = deployment.contracts.AccessControlRegistry.address;
  const registryAbi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'artifacts-zk', 'contracts', 'AccessControlRegistry.sol', 'AccessControlRegistry.json'), 'utf8')).abi;

  const provider = new Provider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const registry = new Contract(registryAddr, registryAbi, wallet);

  const resName = (process.argv[2] || process.env.RESOURCE || 'SENSOR_DATA').toUpperCase();
  const level = Number(process.argv[3] || process.env.REQUIRED_LEVEL || 2);
  const resource = keccak256(toUtf8Bytes(resName));
  const res = await registry.checkAccess(wallet.address, resource, level);
  console.log(`checkAccess(${resName}, level=${level}) ->`, res);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
