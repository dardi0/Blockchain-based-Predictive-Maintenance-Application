/**
 * Deploy Chainlink Automation and Functions contracts to zkSync Era Sepolia
 *
 * Chainlink Functions zkSync Sepolia Configuration:
 * - Router: 0x20Fb9D1d12884A3FA5a5Af6258430A15A2aB3e69
 * - DON ID: fun-zksync-sepolia-1
 * - DON ID (bytes32): 0x66756e2d7a6b73796e632d7365706f6c69612d31000000000000000000000000
 */

require('dotenv').config();

const { Wallet, Provider } = require("zksync-ethers");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const fs = require("fs");
const path = require("path");

// Chainlink Functions zkSync Sepolia Configuration
const CHAINLINK_CONFIG = {
    router: "0x20Fb9D1d12884A3FA5a5Af6258430A15A2aB3e69",
    donId: "0x66756e2d7a6b73796e632d7365706f6c69612d31000000000000000000000000",
    donIdString: "fun-zksync-sepolia-1",
    // Subscription ID - set via env or after creating subscription on Chainlink UI
    subscriptionId: process.env.CHAINLINK_SUBSCRIPTION_ID || 0,
    callbackGasLimit: 300000
};

module.exports = async function (hre) {
    console.log("=== Chainlink Automation & Functions Deployment ===\n");
    console.log("Network: zkSync Era Sepolia");
    console.log("Chainlink Functions Router:", CHAINLINK_CONFIG.router);
    console.log("DON ID:", CHAINLINK_CONFIG.donIdString);

    // Load existing deployment info
    const existingDeploymentPath = path.join(__dirname, "../deployment_info_hybrid_ZKSYNC_ERA.json");
    let existingDeployment;
    try {
        existingDeployment = JSON.parse(fs.readFileSync(existingDeploymentPath, "utf8"));
        console.log("\nLoaded existing deployment info");
    } catch (e) {
        console.error("Could not load existing deployment. Deploy PDM contracts first.");
        process.exit(1);
    }

    const accessRegistryAddress = existingDeployment.contracts.AccessControlRegistry.address;
    const pdmSystemAddress = existingDeployment.contracts.PdMSystemHybrid.address;

    console.log(`AccessControlRegistry: ${accessRegistryAddress}`);
    console.log(`PdMSystemHybrid: ${pdmSystemAddress}`);

    // Get deployer wallet
    const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL || "https://sepolia.era.zksync.dev");
    const wallet = new Wallet(process.env.CONTRACT_OWNER_PRIVATE_KEY, provider);
    const deployer = new Deployer(hre, wallet);

    console.log(`\nDeployer: ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH\n`);

    // Configuration
    const sensorInterval = 3600;  // 1 hour
    const reportInterval = 86400; // 1 day
    const failureThreshold = 7000; // 70%

    // Get subscription ID
    let subscriptionId = parseInt(CHAINLINK_CONFIG.subscriptionId);
    if (!subscriptionId || subscriptionId === 0) {
        console.log("⚠️  WARNING: CHAINLINK_SUBSCRIPTION_ID not set!");
        console.log("   You need to:");
        console.log("   1. Go to https://functions.chain.link/zksync-sepolia");
        console.log("   2. Create a new subscription");
        console.log("   3. Fund it with LINK");
        console.log("   4. Set CHAINLINK_SUBSCRIPTION_ID in .env");
        console.log("   5. Re-run this deployment or call setSubscriptionId() after deployment");
        console.log("\n   Deploying with subscriptionId = 0 for now...\n");
    } else {
        console.log(`Chainlink Subscription ID: ${subscriptionId}`);
    }

    // Deploy PdMFunctionsConsumer first
    console.log("\n--- Deploying PdMFunctionsConsumer (Chainlink Functions) ---");
    const functionsArtifact = await deployer.loadArtifact("PdMFunctionsConsumer");

    const functionsContract = await deployer.deploy(functionsArtifact, [
        CHAINLINK_CONFIG.router,           // Chainlink Functions Router
        CHAINLINK_CONFIG.donId,            // DON ID (bytes32)
        subscriptionId,                    // Subscription ID
        CHAINLINK_CONFIG.callbackGasLimit  // Callback gas limit
    ]);

    await functionsContract.waitForDeployment();
    const functionsAddress = await functionsContract.getAddress();
    console.log(`✅ PdMFunctionsConsumer: ${functionsAddress}`);

    // Deploy ChainlinkPdMAutomation
    console.log("\n--- Deploying ChainlinkPdMAutomation ---");
    const automationArtifact = await deployer.loadArtifact("ChainlinkPdMAutomation");

    const automationContract = await deployer.deploy(automationArtifact, [
        accessRegistryAddress,
        pdmSystemAddress,
        sensorInterval,
        reportInterval,
        failureThreshold
    ]);

    await automationContract.waitForDeployment();
    const automationAddress = await automationContract.getAddress();
    console.log(`✅ ChainlinkPdMAutomation: ${automationAddress}`);

    // Configure contracts
    console.log("\n--- Configuring Contracts ---");

    // Set Functions consumer on Automation contract
    const setConsumerTx = await automationContract.setFunctionsConsumer(functionsAddress);
    await setConsumerTx.wait();
    console.log("✅ Set Functions consumer on Automation contract");

    // Set Automation contract on Functions consumer
    const setAutomationTx = await functionsContract.setAutomationContract(automationAddress);
    await setAutomationTx.wait();
    console.log("✅ Set Automation contract on Functions consumer");

    // Save deployment info
    const deploymentInfo = {
        network: "ZKSYNC_ERA_SEPOLIA",
        chainId: 300,
        timestamp: new Date().toISOString(),
        deployer: wallet.address,
        chainlinkConfig: {
            router: CHAINLINK_CONFIG.router,
            donId: CHAINLINK_CONFIG.donIdString,
            donIdBytes32: CHAINLINK_CONFIG.donId,
            subscriptionId: subscriptionId,
            callbackGasLimit: CHAINLINK_CONFIG.callbackGasLimit
        },
        contracts: {
            ChainlinkPdMAutomation: {
                address: automationAddress,
                config: {
                    sensorInterval,
                    reportInterval,
                    failureThreshold
                }
            },
            PdMFunctionsConsumer: {
                address: functionsAddress,
                config: {
                    router: CHAINLINK_CONFIG.router,
                    donId: CHAINLINK_CONFIG.donIdString,
                    subscriptionId: subscriptionId
                }
            }
        },
        linkedContracts: {
            AccessControlRegistry: accessRegistryAddress,
            PdMSystemHybrid: pdmSystemAddress
        }
    };

    const outputPath = path.join(__dirname, "../chainlink_deployment_info.json");
    fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\n📄 Deployment info saved to: ${outputPath}`);

    console.log("\n=== Deployment Complete ===");
    console.log("\n📋 Next Steps:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (!subscriptionId || subscriptionId === 0) {
        console.log("\n1️⃣  Create Chainlink Functions Subscription:");
        console.log("   → Go to: https://functions.chain.link/zksync-sepolia");
        console.log("   → Click 'Create Subscription'");
        console.log("   → Fund with LINK tokens");
        console.log("   → Add consumer: " + functionsAddress);
        console.log("   → Copy Subscription ID");
        console.log("   → Run: npx hardhat run scripts/chainlink/set_subscription.js --network zkSyncSepolia");
    } else {
        console.log("\n1️⃣  Add Consumer to Subscription:");
        console.log("   → Go to: https://functions.chain.link/zksync-sepolia/" + subscriptionId);
        console.log("   → Click 'Add Consumer'");
        console.log("   → Enter: " + functionsAddress);
    }

    console.log("\n2️⃣  Register Chainlink Nodes:");
    console.log("   → Run: node scripts/chainlink/register_chainlink_nodes.js");

    console.log("\n3️⃣  Set JavaScript Source Code:");
    console.log("   → Run: npx hardhat run scripts/chainlink/upload_functions_source.js --network zkSyncSepolia");

    console.log("\n4️⃣  Register Upkeep on Chainlink Automation UI:");
    console.log("   → Go to: https://automation.chain.link/zksync-sepolia");
    console.log("   → Register new upkeep with contract: " + automationAddress);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n📍 Contract Addresses:");
    console.log(`   ChainlinkPdMAutomation: ${automationAddress}`);
    console.log(`   PdMFunctionsConsumer:   ${functionsAddress}`);
    console.log(`   Chainlink Router:       ${CHAINLINK_CONFIG.router}`);
};
