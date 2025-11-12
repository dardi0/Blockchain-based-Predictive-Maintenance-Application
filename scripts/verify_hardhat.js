// Hardhat-based Contract Verification for zkSync Era Sepolia
const hre = require("hardhat");

async function main() {
    console.log('🚀 Hardhat Contract Verification for zkSync Era Sepolia');
    console.log('======================================================');
    
    // Load deployment info
    const deploymentPath = require('path').join(__dirname, '..', 'deployment_info_hybrid_ZKSYNC_ERA.json');
    const deployment = JSON.parse(require('fs').readFileSync(deploymentPath, 'utf8'));
    const contracts = deployment.contracts;
    
    console.log(`📋 Network: ${deployment.network}`);
    console.log(`📋 Deployer: ${deployment.deployer}`);
    
    try {
        // Verify AccessControlRegistry
        console.log('\n🔍 Verifying AccessControlRegistry...');
        try {
            await hre.run("verify:verify", {
                address: contracts.AccessControlRegistry.address,
                constructorArguments: [deployment.deployer],
                contract: "contracts/AccessControlRegistry.sol:AccessControlRegistry",
            });
            console.log('✅ AccessControlRegistry verified successfully!');
        } catch (error) {
            if (error.message.includes('Already Verified')) {
                console.log('✅ AccessControlRegistry already verified!');
            } else {
                console.log('❌ AccessControlRegistry verification failed:', error.message);
            }
        }
        
        // Verify OptimizedGroth16Verifier
        // Determine verifier (Unified preferred, fallback Optimized)
        const verifierInfo = contracts.UnifiedGroth16Verifier || contracts.OptimizedGroth16Verifier;
        const verifierName = contracts.UnifiedGroth16Verifier ? 'UnifiedGroth16Verifier' : 'OptimizedGroth16Verifier';
        const verifierFQN = contracts.UnifiedGroth16Verifier
            ? 'contracts/UnifiedGroth16Verifier.sol:UnifiedGroth16Verifier'
            : 'contracts/OptimizedGroth16Verifier.sol:OptimizedGroth16Verifier';

        console.log(`\n🔍 Verifying ${verifierName}...`);
        try {
            await hre.run("verify:verify", {
                address: verifierInfo.address,
                constructorArguments: [],
                contract: verifierFQN,
            });
            console.log(`✅ ${verifierName} verified successfully!`);
        } catch (error) {
            if ((error.message || '').includes('Already Verified')) {
                console.log(`✅ ${verifierName} already verified!`);
            } else {
                console.log(`❌ ${verifierName} verification failed:`, error.message);
            }
        }
        
        // Verify PdMSystemHybrid
        console.log('\n🔍 Verifying PdMSystemHybrid...');
        try {
            await hre.run("verify:verify", {
                address: contracts.PdMSystemHybrid.address,
                constructorArguments: [
                    contracts.AccessControlRegistry.address,        // _accessRegistry
                    verifierInfo.address,                            // _zkVerifier
                    deployment.deployer                              // _initialAdmin
                ],
                contract: "contracts/PdMSystemHybrid.sol:PdMSystemHybrid",
            });
            console.log('✅ PdMSystemHybrid verified successfully!');
        } catch (error) {
            if ((error.message || '').includes('Already Verified')) {
                console.log('✅ PdMSystemHybrid already verified!');
            } else {
                console.log('❌ PdMSystemHybrid verification failed:', error.message);
            }
        }
        
    } catch (error) {
        console.error('💥 Verification process error:', error.message);
    }
    
    console.log('\n🎉 Verification process completed!');
    console.log('\n📋 Contract Addresses:');
    console.log(`   AccessControlRegistry: ${contracts.AccessControlRegistry.address}`);
    const vInfoPrint = contracts.UnifiedGroth16Verifier || contracts.OptimizedGroth16Verifier;
    console.log(`   Verifier: ${vInfoPrint.address}`);
    console.log(`   PdMSystemHybrid: ${contracts.PdMSystemHybrid.address}`);
    
    console.log('\n🔗 Block Explorer Links:');
    console.log(`   AccessControlRegistry: https://explorer.zksync.io/address/${contracts.AccessControlRegistry.address}`);
    console.log(`   Verifier: https://sepolia.explorer.zksync.io/address/${vInfoPrint.address}`);
    console.log(`   PdMSystemHybrid: https://explorer.zksync.io/address/${contracts.PdMSystemHybrid.address}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('💥 Verification script error:', error);
        process.exit(1);
    });
