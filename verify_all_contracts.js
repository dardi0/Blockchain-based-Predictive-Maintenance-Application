// Verify all deployed contracts on zkSync Era Sepolia
const { run } = require("hardhat");
const deployment = require('./deployment_info_hybrid_ZKSYNC_ERA.json');

async function verifyContract(name, address, constructorArgs = [], contractPath = null) {
    console.log(`\n🔍 Verifying ${name}...`);
    console.log(`   Address: ${address}`);
    if (constructorArgs.length > 0) {
        console.log(`   Constructor args: ${JSON.stringify(constructorArgs)}`);
    }
    
    try {
        const verifyParams = {
            address: address,
            constructorArguments: constructorArgs,
        };
        
        if (contractPath) {
            verifyParams.contract = contractPath;
        }
        
        await run("verify:verify", verifyParams);
        
        console.log(`   ✅ ${name} verified!`);
        console.log(`   🔗 https://sepolia.explorer.zksync.io/address/${address}#contract`);
        return true;
        
    } catch (error) {
        if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
            console.log(`   ✅ ${name} already verified!`);
            console.log(`   🔗 https://sepolia.explorer.zksync.io/address/${address}#contract`);
            return true;
        } else {
            console.error(`   ❌ ${name} verification failed:`, error.message);
            return false;
        }
    }
}

async function main() {
    console.log("🔍 Verifying All Contracts on zkSync Era Sepolia");
    console.log("="*70);
    console.log(`Network: ${deployment.network}`);
    console.log(`Deployer: ${deployment.deployer}`);
    console.log(`Timestamp: ${deployment.timestamp}`);
    console.log("="*70);
    
    const contracts = deployment.contracts;
    const results = [];
    
    // 1. AccessControlRegistry (no constructor args)
    if (contracts.AccessControlRegistry) {
        const result = await verifyContract(
            "AccessControlRegistry",
            contracts.AccessControlRegistry.address,
            [],
            "contracts/AccessControlRegistry.sol:AccessControlRegistry"
        );
        results.push({ name: "AccessControlRegistry", success: result });
    }
    
    // 2. UnifiedGroth16Verifier (no constructor args)
    if (contracts.UnifiedGroth16Verifier) {
        const result = await verifyContract(
            "UnifiedGroth16Verifier",
            contracts.UnifiedGroth16Verifier.address,
            [],
            "contracts/UnifiedGroth16Verifier.sol:UnifiedGroth16Verifier"
        );
        results.push({ name: "UnifiedGroth16Verifier", success: result });
    }
    
    // 3. SensorVerifierAdapter (constructor: verifier address)
    if (contracts.SensorVerifierAdapter && contracts.UnifiedGroth16Verifier) {
        const result = await verifyContract(
            "SensorVerifierAdapter",
            contracts.SensorVerifierAdapter.address,
            [contracts.UnifiedGroth16Verifier.address],
            "contracts/SensorVerifierAdapter.sol:SensorVerifierAdapter"
        );
        results.push({ name: "SensorVerifierAdapter", success: result });
    }
    
    // 4. PredictionVerifierAdapter (constructor: verifier address)
    if (contracts.PredictionVerifierAdapter && contracts.UnifiedGroth16Verifier) {
        const result = await verifyContract(
            "PredictionVerifierAdapter",
            contracts.PredictionVerifierAdapter.address,
            [contracts.UnifiedGroth16Verifier.address],
            "contracts/PredictionVerifierAdapter.sol:PredictionVerifierAdapter"
        );
        results.push({ name: "PredictionVerifierAdapter", success: result });
    }
    
    // 5. PdMSystemHybrid (constructor: accessRegistry, zkVerifier, initialAdmin)
    if (contracts.PdMSystemHybrid) {
        const deps = contracts.PdMSystemHybrid.dependencies;
        const initialAdmin = deployment.deployer;
        const result = await verifyContract(
            "PdMSystemHybrid",
            contracts.PdMSystemHybrid.address,
            [deps.accessRegistry, deps.zkVerifier, initialAdmin],
            "contracts/PdMSystemHybrid.sol:PdMSystemHybrid"
        );
        results.push({ name: "PdMSystemHybrid", success: result });
    }
    
    // Summary
    console.log("\n" + "="*70);
    console.log("📊 VERIFICATION SUMMARY");
    console.log("="*70);
    
    results.forEach(r => {
        const status = r.success ? "✅" : "❌";
        console.log(`${status} ${r.name}`);
    });
    
    const allSuccess = results.every(r => r.success);
    
    if (allSuccess) {
        console.log("\n🎉 All contracts verified successfully!");
    } else {
        console.log("\n⚠️ Some contracts failed verification. Check logs above.");
    }
    
    console.log("\n🔗 Explorer: https://sepolia.explorer.zksync.io/");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Fatal error:", error);
        process.exit(1);
    });

