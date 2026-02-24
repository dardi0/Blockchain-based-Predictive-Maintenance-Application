/**
 * Upload JavaScript source code to PdMFunctionsConsumer contract
 *
 * This script reads the prediction and report JS files and uploads them
 * to the contract for Chainlink Functions to execute.
 *
 * Usage: node scripts/chainlink/upload_functions_source.js
 */

require('dotenv').config();

const { Wallet, Provider, Contract } = require("zksync-ethers");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("=== Upload Chainlink Functions Source Code ===\n");

    // Load chainlink deployment info
    const chainlinkDeploymentPath = path.join(__dirname, "../../chainlink_deployment_info.json");
    let chainlinkDeployment;
    try {
        chainlinkDeployment = JSON.parse(fs.readFileSync(chainlinkDeploymentPath, "utf8"));
    } catch (e) {
        console.error("Could not load chainlink deployment info.");
        process.exit(1);
    }

    // Load ABI
    const consumerArtifact = JSON.parse(fs.readFileSync(
        path.join(__dirname, "../../artifacts-zk/contracts/chainlink/PdMFunctionsConsumer.sol/PdMFunctionsConsumer.json"),
        "utf8"
    ));

    const consumerAddress = chainlinkDeployment.contracts.PdMFunctionsConsumer.address;
    console.log("Consumer Address:", consumerAddress);

    // Connect
    const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL || "https://sepolia.era.zksync.dev");
    const wallet = new Wallet(process.env.CONTRACT_OWNER_PRIVATE_KEY, provider);
    console.log("Wallet:", wallet.address);

    const consumer = new Contract(consumerAddress, consumerArtifact.abi, wallet);

    // Read JavaScript source files
    const predictionSourcePath = path.join(__dirname, "prediction_function.js");
    const reportSourcePath = path.join(__dirname, "report_function.js");

    const predictionSource = fs.readFileSync(predictionSourcePath, "utf8");
    const reportSource = fs.readFileSync(reportSourcePath, "utf8");

    console.log("\n--- Source Code Stats ---");
    console.log("Prediction source length:", predictionSource.length, "bytes");
    console.log("Report source length:", reportSource.length, "bytes");

    // Upload prediction source
    console.log("\n--- Uploading Prediction Source ---");
    try {
        const tx1 = await consumer.setPredictionSource(predictionSource);
        console.log("Transaction sent:", tx1.hash);
        await tx1.wait();
        console.log("✅ Prediction source uploaded!");
    } catch (error) {
        console.error("❌ Error uploading prediction source:", error.message);
    }

    // Upload report source
    console.log("\n--- Uploading Report Source ---");
    try {
        const tx2 = await consumer.setReportSource(reportSource);
        console.log("Transaction sent:", tx2.hash);
        await tx2.wait();
        console.log("✅ Report source uploaded!");
    } catch (error) {
        console.error("❌ Error uploading report source:", error.message);
    }

    // Verify
    console.log("\n--- Verifying ---");
    const storedPredictionSource = await consumer.predictionSource();
    const storedReportSource = await consumer.reportSource();

    console.log("Stored prediction source length:", storedPredictionSource.length);
    console.log("Stored report source length:", storedReportSource.length);

    if (storedPredictionSource.length > 0 && storedReportSource.length > 0) {
        console.log("\n✅ Both sources uploaded successfully!");
    } else {
        console.log("\n⚠️ Warning: One or both sources may not be stored correctly.");
    }

    console.log("\n=== Done ===");
    console.log("\nNext steps:");
    console.log("1. Configure secrets in Chainlink Functions UI");
    console.log("   - apiEndpoint: Your backend API URL");
    console.log("   - automationApiKey: Your automation API key");
    console.log("2. Test the functions manually");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
