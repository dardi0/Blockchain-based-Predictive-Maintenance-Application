const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const uni = path.join(process.cwd(), 'artifacts-zk', 'contracts', 'UnifiedGroth16Verifier.sol', 'UnifiedGroth16Verifier.json');
  if (!fs.existsSync(uni)) throw new Error('Unified verifier artifact bulunamadı');
  const artifact = JSON.parse(fs.readFileSync(uni, 'utf8'));
  const dep = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'deployment_info_hybrid_ZKSYNC_ERA.json'), 'utf8'));
  const address = (dep.contracts.UnifiedGroth16Verifier || {}).address;
  if (!address) throw new Error('UnifiedGroth16Verifier adresi deployment dosyasında yok');
  const provider = new ethers.JsonRpcProvider(process.env.ZKSYNC_ERA_RPC_URL);
  const contract = new ethers.Contract(address, artifact.abi, provider);
  const circuitNames = ['SENSOR_DATA', 'PREDICTION', 'MAINTENANCE', 'LEGACY'];

  console.log('Unified verifier address:', address);
  for (let i = 0; i < circuitNames.length; i++) {
    try {
      const key = await contract.circuitKeys(i);
      const alpha = key.alpha;
      const isSet = key.isSet;
      const icLen = Array.isArray(key.IC) ? key.IC.length : 0;
      console.log('Circuit ' + i + ' (' + circuitNames[i] + '): isSet=' + isSet + ', IC length=' + icLen);
      if (isSet) {
        console.log('  alpha.X = ' + alpha.X.toString());
        console.log('  alpha.Y = ' + alpha.Y.toString());
      }
    } catch (err) {
      console.error('Error while reading circuit', i, err);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
});

