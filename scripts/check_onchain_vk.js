require('dotenv').config();
const { Provider, Wallet } = require('zksync-ethers');
const { Contract } = require('ethers');
const fs = require('fs');
const path = require('path');

function parseVerifierSol(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const constants = {};
    const regex = /uint256 constant (\w+)\s*=\s*(\d+);/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        constants[match[1]] = match[2];
    }
    return constants;
}

async function main() {
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const RPC_URL = process.env.ZKSYNC_ERA_RPC_URL;
    if (!PRIVATE_KEY || !RPC_URL) {
        throw new Error('PRIVATE_KEY and ZKSYNC_ERA_RPC_URL must be set in .env');
    }

    const deploymentInfoPath = path.join(process.cwd(), 'deployment_info_hybrid_ZKSYNC_ERA.json');
    if (!fs.existsSync(deploymentInfoPath)) {
        throw new Error(`Deployment file not found: ${deploymentInfoPath}`);
    }
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, 'utf8'));
    const verifierAddress = (deploymentInfo.contracts.UnifiedGroth16Verifier || {}).address;
    if (!verifierAddress) {
        throw new Error('UnifiedGroth16Verifier address not found in deployment info');
    }

    const verifierArtifactPath = path.join(process.cwd(), 'artifacts-zk', 'contracts', 'UnifiedGroth16Verifier.sol', 'UnifiedGroth16Verifier.json');
    if (!fs.existsSync(verifierArtifactPath)) {
        throw new Error(`Verifier artifact not found: ${verifierArtifactPath}`);
    }
    const verifierArtifact = JSON.parse(fs.readFileSync(verifierArtifactPath, 'utf8'));

    const provider = new Provider(RPC_URL);
    const wallet = new Wallet(PRIVATE_KEY, provider);
    const verifier = new Contract(verifierAddress, verifierArtifact.abi, wallet);

    console.log('🔗 Verifier Contract:', await verifier.getAddress());

    // 1. Get On-Chain VK
    console.log('\n🔎 Reading On-Chain VK for SENSOR_DATA (CircuitType 0)...');
    const onChainVK = await verifier.circuitKeys(0);
    console.log('Raw on-chain VK object:', onChainVK);

    // 2. Get Local VK from verifier.sol
    console.log('\n🔎 Reading Local VK from temp/verifier.sol...');
    const localVKPath = path.join(process.cwd(), 'temp', 'verifier.sol');
    if (!fs.existsSync(localVKPath)) {
        throw new Error(`Local verifier file not found: ${localVKPath}. Please generate it first.`);
    }
    const localVKConstants = parseVerifierSol(localVKPath);

    // 3. Compare
    console.log('\n🔄 Comparing On-Chain VK with Local VK...');

    let mismatchFound = false;

    function compare(name, onChainValue, localValue) {
        const onChainStr = onChainValue.toString();
        const localStr = localValue.toString();
        if (onChainStr !== localStr) {
            console.error(`❌ MISMATCH in ${name}:`);
            console.error(`   - On-Chain: ${onChainStr}`);
            console.error(`   - Local:    ${localStr}`);
            mismatchFound = true;
        } else {
            console.log(`✅ MATCH in ${name}`);
        }
    }

    compare('alpha.X', onChainVK.alpha[0], localVKConstants.alphax);
    compare('alpha.Y', onChainVK.alpha[1], localVKConstants.alphay);
    
    // Note: snarkjs verifier has beta x1/x2, y1/y2, but contract has G2Point struct
    // We need to match the structure.
    compare('beta.X[0]', onChainVK.beta[0][0], localVKConstants.betax2); // X.c1 in solidity is index 0
    compare('beta.X[1]', onChainVK.beta[0][1], localVKConstants.betax1); // X.c0 in solidity is index 1
    compare('beta.Y[0]', onChainVK.beta[1][0], localVKConstants.betay2); // Y.c1 in solidity is index 0
    compare('beta.Y[1]', onChainVK.beta[1][1], localVKConstants.betay1); // Y.c0 in solidity is index 1

    // The VK from snarkjs has gamma and delta swapped compared to the contract struct
    compare('gamma.X[0]', onChainVK.gamma[0][0], localVKConstants.gammax2);
    compare('gamma.X[1]', onChainVK.gamma[0][1], localVKConstants.gammax1);
    compare('gamma.Y[0]', onChainVK.gamma[1][0], localVKConstants.gammay2);
    compare('gamma.Y[1]', onChainVK.gamma[1][1], localVKConstants.gammay1);

    compare('delta.X[0]', onChainVK.delta[0][0], localVKConstants.deltax2);
    compare('delta.X[1]', onChainVK.delta[0][1], localVKConstants.deltax1);
    compare('delta.Y[0]', onChainVK.delta[1][0], localVKConstants.deltay2);
    compare('delta.Y[1]', onChainVK.delta[1][1], localVKConstants.deltay1);

    console.log('\nIC Points:');
    for (let i = 0; i < onChainVK.IC.length; i++) {
        compare(`IC[${i}].X`, onChainVK.IC[i][0], localVKConstants[`IC${i}x`]);
        compare(`IC[${i}].Y`, onChainVK.IC[i][1], localVKConstants[`IC${i}y`]);
    }

    console.log('\n-------------------');
    if (mismatchFound) {
        console.error('❌ VERIFICATION KEY MISMATCH DETECTED! The VK on-chain does not match the local VK.');
    } else {
        console.log('✅ SUCCESS! The On-Chain VK perfectly matches the local VK.');
    }
    console.log('-------------------');

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
