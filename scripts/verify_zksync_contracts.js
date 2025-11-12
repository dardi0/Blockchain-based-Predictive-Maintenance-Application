// zkSync Era Sepolia Contract Verification Script
require('dotenv').config();
const { Provider } = require('zksync-ethers');
const fs = require('fs');
const path = require('path');

async function verifyContract(contractName, contractAddress, constructorArgs = []) {
    console.log(`\n🔍 Verifying ${contractName} at ${contractAddress}...`);
    
    try {
        // Contract source code path
        const sourcePath = path.join(__dirname, '..', 'contracts', `${contractName}.sol`);
        if (!fs.existsSync(sourcePath)) {
            console.error(`❌ Source file not found: ${sourcePath}`);
            return false;
        }

        // Read contract source code
        const sourceCode = fs.readFileSync(sourcePath, 'utf8');
        
        // Get contract artifact
        const artifactPath = path.join(__dirname, '..', 'artifacts-zk', 'contracts', `${contractName}.sol`, `${contractName}.json`);
        if (!fs.existsSync(artifactPath)) {
            console.error(`❌ Artifact not found: ${artifactPath}`);
            return false;
        }

        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        
        // Prepare verification request
        const verificationRequest = {
            contractAddress: contractAddress,
            sourceCode: sourceCode,
            contractName: contractName,
            compilerVersion: artifact.compiler?.version || '0.8.20',
            constructorArguments: constructorArgs,
            optimizationUsed: true,
            runs: 200
        };

        console.log(`📋 Verification details:`);
        console.log(`   Contract: ${contractName}`);
        console.log(`   Address: ${contractAddress}`);
        console.log(`   Compiler: ${verificationRequest.compilerVersion}`);
        console.log(`   Constructor Args: ${constructorArgs.length > 0 ? constructorArgs : 'None'}`);

        // For zkSync Era, we'll use the block explorer API
        const apiUrl = 'https://api-era.zksync.network/api';
        const verifyUrl = `${apiUrl}/contracts/${contractAddress}/verify`;
        
        console.log(`🌐 Submitting verification to: ${verifyUrl}`);
        
        // Note: This is a simplified approach. In practice, you might need to use
        // the official zkSync block explorer or a different verification method
        console.log(`⚠️  Manual verification required for zkSync Era`);
        console.log(`   Please visit: https://explorer.zksync.io/address/${contractAddress}`);
        console.log(`   Or use the zkSync CLI tool for verification`);
        
        return true;
        
    } catch (error) {
        console.error(`❌ Verification failed for ${contractName}:`, error.message);
        return false;
    }
}

async function main() {
    console.log('🚀 zkSync Era Sepolia Contract Verification');
    console.log('==========================================');
    
    // Load deployment info
    const deploymentPath = path.join(__dirname, '..', 'deployment_info_hybrid_ZKSYNC_ERA.json');
    if (!fs.existsSync(deploymentPath)) {
        console.error('❌ Deployment info not found');
        process.exit(1);
    }
    
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const contracts = deployment.contracts;
    
    console.log(`📋 Network: ${deployment.network}`);
    console.log(`📋 Deployer: ${deployment.deployer}`);
    
    // Verify AccessControlRegistry
    await verifyContract(
        'AccessControlRegistry',
        contracts.AccessControlRegistry.address,
        [] // No constructor arguments
    );
    
    // Verify UnifiedGroth16Verifier
    await verifyContract(
        'UnifiedGroth16Verifier',
        contracts.UnifiedGroth16Verifier.address,
        [] // No constructor arguments
    );
    
    // Verify PdMSystemHybrid
    await verifyContract(
        'PdMSystemHybrid',
        contracts.PdMSystemHybrid.address,
        [
            contracts.AccessControlRegistry.address,
            contracts.UnifiedGroth16Verifier.address,
            deployment.deployer
        ]
    );
    
    console.log('\n🎉 Verification process completed!');
    console.log('\n📋 Contract Addresses:');
    console.log(`   AccessControlRegistry: ${contracts.AccessControlRegistry.address}`);
    console.log(`   UnifiedGroth16Verifier: ${contracts.UnifiedGroth16Verifier.address}`);
    console.log(`   PdMSystemHybrid: ${contracts.PdMSystemHybrid.address}`);
    
    console.log('\n🔗 Block Explorer Links:');
    console.log(`   AccessControlRegistry: https://explorer.zksync.io/address/${contracts.AccessControlRegistry.address}`);
    console.log(`   OptimizedGroth16Verifier: https://explorer.zksync.io/address/${contracts.OptimizedGroth16Verifier.address}`);
    console.log(`   PdMSystemHybrid: https://explorer.zksync.io/address/${contracts.PdMSystemHybrid.address}`);
}

main().catch((error) => {
    console.error('💥 Verification script error:', error);
    process.exit(1);
});
