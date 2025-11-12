
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
// Load .env explicitly from project root
try {
    require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
} catch (_) {}



// --- CONFIGURATION ---
const DEPLOYMENT_INFO_PATH = path.join(__dirname, "..", "deployment_info_hybrid_ZKSYNC_ERA.json");
const PDM_HYBRID_ARTIFACT_PATH = path.join(__dirname, "..", "artifacts-zk", "contracts", "PdMSystemHybrid.sol", "PdMSystemHybrid.json");

async function main() {
    console.log("ğŸš€ Starting Configuration Check script...");

    // 1. Load necessary files
    if (!fs.existsSync(DEPLOYMENT_INFO_PATH) || !fs.existsSync(PDM_HYBRID_ARTIFACT_PATH)) {
        console.error("âŒ Error: Deployment info or PDM Hybrid artifact file not found.");
        return;
    }
    const deploymentInfo = JSON.parse(fs.readFileSync(DEPLOYMENT_INFO_PATH, "utf-8"));
    const pdmHybridArtifact = JSON.parse(fs.readFileSync(PDM_HYBRID_ARTIFACT_PATH, "utf-8"));

    const pdmContractAddress = deploymentInfo.contracts?.PdMSystemHybrid?.address;
    const configuredVerifierAddress = deploymentInfo.contracts?.OptimizedGroth16Verifier?.address;

    if (!pdmContractAddress) {
        console.error("âŒ PDM Hybrid contract address not found in deployment info.");
        return;
    }

    // 2. Connect to the blockchain (read-only)
    const rpcUrl = process.env.ZKSYNC_ERA_RPC_URL || deploymentInfo.rpc_url || "https://sepolia.era.zksync.dev";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const pdmContract = new ethers.Contract(pdmContractAddress, pdmHybridArtifact.abi, provider);

    console.log(`ğŸ” Checking configuration for PdMSystemHybrid at: ${pdmContractAddress}`);

    try {
        // 3. Call the view functions to get the configured addresses
        const activeVerifierAddress = await pdmContract.zkVerifier();
        const activeAccessRegistryAddress = await pdmContract.accessRegistry();

        console.log("\n---------- [ CONFIGURATION CHECK ] ----------");
        console.log(`ğŸ”— Main PDM Contract is using Verifier at:     ${activeVerifierAddress}`);
        console.log(`ğŸ”‘ Verifier configured by setup script was at: ${configuredVerifierAddress || 'Not found in deployment file'}`);
        console.log("---------------------------------------------");

        if (activeVerifierAddress.toLowerCase() === configuredVerifierAddress.toLowerCase()) {
            console.log("âœ… SUCCESS: The PDM contract is pointing to the correctly configured verifier.");
        } else {
            console.error("âŒ MISMATCH FOUND: The main PDM contract is pointing to the WRONG verifier contract!");
            console.error(`   - It is pointing to: ${activeVerifierAddress}`);
            console.error(`   - It SHOULD be pointing to: ${configuredVerifierAddress}`);
            console.error("   - This is the root cause of the error.");
        }

        console.log(`\n(Additional Info) Access Registry is at: ${activeAccessRegistryAddress}`);

    } catch (error) {
        console.error("\nâŒ An error occurred while checking the configuration:");
        console.error(error);
    }
}

main().catch(console.error);


