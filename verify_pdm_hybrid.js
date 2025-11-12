// Verify PdMSystemHybrid contract on zkSync Era Sepolia
const { run } = require("hardhat");
const deployment = require('./deployment_info_hybrid_ZKSYNC_ERA.json');

async function main() {
    console.log("🔍 Verifying PdMSystemHybrid on zkSync Era Sepolia...");
    console.log("="*70);
    
    const pdmAddr = deployment.contracts.PdMSystemHybrid.address;
    const accessRegistry = deployment.contracts.PdMSystemHybrid.dependencies.accessRegistry;
    const zkVerifier = deployment.contracts.PdMSystemHybrid.dependencies.zkVerifier;
    const initialAdmin = deployment.deployer; // Constructor 3rd parameter
    
    console.log("📋 Contract Info:");
    console.log(`   Address: ${pdmAddr}`);
    console.log(`   AccessRegistry: ${accessRegistry}`);
    console.log(`   ZK Verifier: ${zkVerifier}`);
    console.log(`   Initial Admin: ${initialAdmin}`);
    
    console.log("\n🚀 Starting verification...");
    
    try {
        await run("verify:verify", {
            address: pdmAddr,
            constructorArguments: [accessRegistry, zkVerifier, initialAdmin],
            contract: "contracts/PdMSystemHybrid.sol:PdMSystemHybrid"
        });
        
        console.log("\n✅ Verification successful!");
        console.log(`🔗 View on explorer: https://sepolia.explorer.zksync.io/address/${pdmAddr}#contract`);
        
    } catch (error) {
        if (error.message.includes("Already Verified")) {
            console.log("\n✅ Contract already verified!");
            console.log(`🔗 View on explorer: https://sepolia.explorer.zksync.io/address/${pdmAddr}#contract`);
        } else {
            console.error("\n❌ Verification failed:", error.message);
            throw error;
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Error:", error);
        process.exit(1);
    });

