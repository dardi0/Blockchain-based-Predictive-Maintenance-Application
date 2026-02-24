/**
 * Test Backend Oracle Automation Flow
 *
 * This script simulates what happens when Chainlink Automation triggers performUpkeep:
 * 1. Fetch sensor data from backend
 * 2. Run ML prediction via backend
 * 3. Generate ZK proof via backend
 * 4. Submit to blockchain
 *
 * Usage: node scripts/chainlink/test_backend_automation.js
 */

require('dotenv').config();

const { Wallet, Provider, Contract } = require("zksync-ethers");
const fs = require("fs");
const path = require("path");

const API_BASE = process.env.API_BASE_URL || "http://localhost:8000";
const AUTOMATION_API_KEY = process.env.CHAINLINK_AUTOMATION_API_KEY || "test-key";

async function fetchJson(url, options = {}) {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'X-Automation-Key': AUTOMATION_API_KEY,
            ...options.headers
        }
    });
    return response.json();
}

async function main() {
    console.log("=== Backend Oracle Automation Test ===\n");
    console.log("API Base:", API_BASE);

    // Step 1: Check automation status
    console.log("\n--- Step 1: Check Automation Status ---");
    const status = await fetchJson(`${API_BASE}/automation/status`);
    console.log("Pending predictions:", status.pending_predictions);
    console.log("Automated last 24h:", status.automated_last_24h);
    console.log("Failures detected:", status.failures_detected);

    // Step 2: Fetch sensor data batch
    console.log("\n--- Step 2: Fetch Sensor Data ---");
    const sensorData = await fetchJson(`${API_BASE}/automation/sensor-batch?limit=1`);

    if (!sensorData.sensors || sensorData.sensors.length === 0) {
        console.log("No sensor data available for prediction");
        return;
    }

    const sensor = sensorData.sensors[0];
    console.log("Sensor ID:", sensor.id);
    console.log("Machine ID:", sensor.machine_id);
    console.log("Air Temp:", sensor.air_temp);
    console.log("Process Temp:", sensor.process_temp);
    console.log("Rotation Speed:", sensor.rotation_speed);
    console.log("Torque:", sensor.torque);
    console.log("Tool Wear:", sensor.tool_wear);

    // Step 3: Run prediction via backend
    console.log("\n--- Step 3: Run Prediction ---");
    const predictionResult = await fetchJson(`${API_BASE}/predict`, {
        method: 'POST',
        body: JSON.stringify({
            air_temp: sensor.air_temp,
            process_temp: sensor.process_temp,
            rotation_speed: sensor.rotation_speed,
            torque: sensor.torque,
            tool_wear: sensor.tool_wear
        })
    });

    console.log("Prediction:", predictionResult.prediction === 1 ? "FAILURE" : "NORMAL");
    console.log("Probability:", (predictionResult.prediction_probability * 100).toFixed(2) + "%");
    console.log("Risk Level:", predictionResult.risk_level);

    // Step 4: Generate ZK proof
    console.log("\n--- Step 4: Generate ZK Proof ---");
    const proofResult = await fetchJson(`${API_BASE}/automation/generate-proof`, {
        method: 'POST',
        body: JSON.stringify({
            sensor_id: sensor.id,
            machine_id: sensor.machine_id,
            prediction: predictionResult.prediction,
            probability: predictionResult.prediction_probability
        })
    });

    if (proofResult.error) {
        console.log("Proof generation error:", proofResult.error);
        console.log("Skipping blockchain submission...");
        return;
    }

    console.log("Proof generated:", proofResult.proof ? "Yes" : "No");
    console.log("Public signals:", proofResult.public_signals?.length || 0, "signals");

    // Step 5: Submit to blockchain (optional - requires funded wallet)
    console.log("\n--- Step 5: Blockchain Submission ---");

    const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL || "https://sepolia.era.zksync.dev");
    const wallet = new Wallet(process.env.CONTRACT_OWNER_PRIVATE_KEY, provider);

    console.log("Automation wallet:", wallet.address);
    const balance = await provider.getBalance(wallet.address);
    console.log("Wallet balance:", (Number(balance) / 1e18).toFixed(4), "ETH");

    if (Number(balance) < 0.001 * 1e18) {
        console.log("⚠️  Insufficient balance for blockchain submission");
        console.log("   Fund the wallet to test full flow");
        return;
    }

    // Load contract
    const chainlinkDeployment = JSON.parse(fs.readFileSync(
        path.join(__dirname, "../../chainlink_deployment_info.json"), "utf8"
    ));

    const automationArtifact = JSON.parse(fs.readFileSync(
        path.join(__dirname, "../../artifacts-zk/contracts/chainlink/ChainlinkPdMAutomation.sol/ChainlinkPdMAutomation.json"),
        "utf8"
    ));

    const automationContract = new Contract(
        chainlinkDeployment.contracts.ChainlinkPdMAutomation.address,
        automationArtifact.abi,
        wallet
    );

    // Trigger manual sensor collection
    console.log("\nTriggering manual sensor collection...");
    try {
        const tx = await automationContract.triggerSensorCollectionManual();
        console.log("TX sent:", tx.hash);
        await tx.wait();
        console.log("✅ Sensor collection triggered!");

        // Check updated status
        const newStatus = await automationContract.getAutomationStatus();
        console.log("\nUpdated status:");
        console.log("  Time since last sensor:", newStatus[0].toString(), "seconds");
        console.log("  Pending to process:", newStatus[2].toString());
    } catch (error) {
        console.log("Error:", error.message);
    }

    console.log("\n=== Test Complete ===");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
