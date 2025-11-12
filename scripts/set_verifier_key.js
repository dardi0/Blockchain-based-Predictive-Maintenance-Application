
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
// Load .env from project root explicitly
try {
    require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
} catch (_) {}

// --- CONFIGURATION ---
const DEPLOYMENT_INFO_PATH = path.join(__dirname, "..", "deployment_info_hybrid_ZKSYNC_ERA.json");
const VERIFIER_ARTIFACT_PATH = path.join(__dirname, "..", "artifacts-zk", "contracts", "OptimizedGroth16Verifier.sol", "OptimizedGroth16Verifier.json");
const ZKEY_PATH = "C:/temp/zk_proofs/sensor_data_proof.zkey";
const VK_JSON_PATH = "C:/temp/zk_proofs/verification_key.json";

// CircuitType Enum from the contract
const CIRCUIT_TYPE = {
    SENSOR_DATA: 0,
    PREDICTION: 1,
    MAINTENANCE: 2,
    LEGACY: 3
};

async function main() {
    console.log("ğŸš€ Starting Verifying Key setup script...");

    // 1. Ensure verification_key.json exists, or create it
    if (!fs.existsSync(VK_JSON_PATH)) {
        console.log(`ğŸ” Verification key file not found at ${VK_JSON_PATH}.`);
        if (!fs.existsSync(ZKEY_PATH)) {
            console.error(`âŒ Error: zkey file not found at ${ZKEY_PATH}.`);
            console.error("Please run the main application first to generate the necessary ZK setup files.");
            return;
        }
        try {
            console.log("ğŸ› ï¸ Exporting verification key from .zkey file...");
            const command = `npx snarkjs zkey export verificationkey ${ZKEY_PATH} ${VK_JSON_PATH}`;
            execSync(command, { stdio: 'inherit' });
            console.log("âœ… Verification key exported successfully.");
        } catch (error) {
            console.error("âŒ Failed to export verification key:", error);
            return;
        }
    } else {
        console.log(`âœ… Found existing verification key at ${VK_JSON_PATH}.`);
    }

    // 2. Load necessary files and configuration
    if (!fs.existsSync(DEPLOYMENT_INFO_PATH) || !fs.existsSync(VERIFIER_ARTIFACT_PATH)) {
        console.error("âŒ Error: Deployment info or verifier artifact file not found.");
        return;
    }
    const deploymentInfo = JSON.parse(fs.readFileSync(DEPLOYMENT_INFO_PATH, "utf-8"));
    const verifierArtifact = JSON.parse(fs.readFileSync(VERIFIER_ARTIFACT_PATH, "utf-8"));
    const vk = JSON.parse(fs.readFileSync(VK_JSON_PATH, "utf-8"));

    const verifierAddress = deploymentInfo.contracts?.OptimizedGroth16Verifier?.address;
    if (!verifierAddress) {
        console.error("âŒ Verifier contract address not found in deployment info.");
        return;
    }

    // 3. Connect to the blockchain
    const privateKey = process.env.PRIVATE_KEY && String(process.env.PRIVATE_KEY).trim().replace(/"|'/g, "");
    if (!privateKey) {
        console.error("âŒ PRIVATE_KEY environment variable not set.");
        return;
    }
    const rpcUrl = process.env.ZKSYNC_ERA_RPC_URL || deploymentInfo.rpc_url;
    if (!rpcUrl) {
        console.error("âŒ RPC URL not found. Set ZKSYNC_ERA_RPC_URL in .env or provide deploymentInfo.rpc_url.");
        return;
    }
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const verifierContract = new ethers.Contract(verifierAddress, verifierArtifact.abi, wallet);

    console.log(`ğŸ”— Connected to network: ${deploymentInfo.network_name}`);
    console.log(`ğŸ“‹ Verifier Contract Address: ${verifierAddress}`);
    console.log(`ğŸ‘¤ Using wallet: ${wallet.address}`);

    // 4. Format the verification key for the contract
    // Use JSON/native ordering: [[x0,x1],[y0,y1]]
    const formattedVK = {
        alpha: { X: vk.vk_alpha_1[0], Y: vk.vk_alpha_1[1] },
        beta: { X: vk.vk_beta_2[0], Y: vk.vk_beta_2[1] },
        gamma: { X: vk.vk_gamma_2[0], Y: vk.vk_gamma_2[1] },
        delta: { X: vk.vk_delta_2[0], Y: vk.vk_delta_2[1] },
        IC: vk.IC.map(p => ({ X: p[0], Y: p[1] }))
    };

    // 5. Call setCircuitVerifyingKey
    try {
        console.log("\nğŸ› ï¸  Calling setCircuitVerifyingKey for SENSOR_DATA circuit...");
        const tx = await verifierContract.setCircuitVerifyingKey(
            CIRCUIT_TYPE.SENSOR_DATA,
            formattedVK.alpha,
            formattedVK.beta,
            formattedVK.gamma,
            formattedVK.delta,
            formattedVK.IC
        );

        console.log(`ğŸ“¤ Transaction sent: ${tx.hash}`);
        console.log("â³ Waiting for transaction to be mined...");
        
        const receipt = await tx.wait();
        
        console.log("âœ… Transaction mined successfully!");
        console.log(`   - Block Number: ${receipt.blockNumber}`);
        console.log(`   - Gas Used: ${receipt.gasUsed.toString()}`);
        console.log("\nğŸ‰ Verifier contract has been successfully configured for the SENSOR_DATA circuit.");

    } catch (error) {
        console.error("\nâŒ An error occurred while setting the verifying key:");
        console.error(error);
    }
}

main().catch(console.error);

