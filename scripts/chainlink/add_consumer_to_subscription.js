/**
 * Add PdMFunctionsConsumer to Chainlink Functions Subscription
 *
 * This script adds the consumer contract to the subscription directly
 * via the Chainlink Functions Router contract.
 *
 * Usage: node scripts/chainlink/add_consumer_to_subscription.js
 */

require('dotenv').config();

const { Wallet, Provider, Contract } = require("zksync-ethers");
const fs = require("fs");
const path = require("path");

// Chainlink Functions Router ABI (only the functions we need)
const ROUTER_ABI = [
    "function addConsumer(uint64 subscriptionId, address consumer) external",
    "function getSubscription(uint64 subscriptionId) external view returns (uint96 balance, uint64 blockedBalance, address owner, address[] memory consumers)",
    "function owner() external view returns (address)"
];

async function main() {
    console.log("=== Add Consumer to Chainlink Functions Subscription ===\n");

    // Load chainlink deployment info
    const chainlinkDeploymentPath = path.join(__dirname, "../../chainlink_deployment_info.json");
    let chainlinkDeployment;
    try {
        chainlinkDeployment = JSON.parse(fs.readFileSync(chainlinkDeploymentPath, "utf8"));
    } catch (e) {
        console.error("Could not load chainlink deployment info. Run deploy-chainlink.js first.");
        process.exit(1);
    }

    const routerAddress = chainlinkDeployment.chainlinkConfig.router;
    const consumerAddress = chainlinkDeployment.contracts.PdMFunctionsConsumer.address;

    // Get subscription ID from env or deployment
    const subscriptionId = process.env.CHAINLINK_SUBSCRIPTION_ID || chainlinkDeployment.chainlinkConfig.subscriptionId;

    if (!subscriptionId || subscriptionId === 0) {
        console.error("❌ CHAINLINK_SUBSCRIPTION_ID not set!");
        console.error("   Set it in .env file: CHAINLINK_SUBSCRIPTION_ID=6254");
        process.exit(1);
    }

    console.log("Router Address:", routerAddress);
    console.log("Consumer Address:", consumerAddress);
    console.log("Subscription ID:", subscriptionId);

    // Connect to provider
    const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL || "https://sepolia.era.zksync.dev");
    const wallet = new Wallet(process.env.CONTRACT_OWNER_PRIVATE_KEY, provider);

    console.log("\nWallet Address:", wallet.address);

    // Connect to router
    const router = new Contract(routerAddress, ROUTER_ABI, wallet);

    // Check current subscription
    console.log("\n--- Checking Subscription ---");
    try {
        const [balance, blockedBalance, owner, consumers] = await router.getSubscription(subscriptionId);
        console.log("Subscription Owner:", owner);
        console.log("Balance:", balance.toString(), "LINK (juels)");
        console.log("Current Consumers:", consumers);

        // Check if consumer already added
        const consumerLower = consumerAddress.toLowerCase();
        const alreadyAdded = consumers.some(c => c.toLowerCase() === consumerLower);

        if (alreadyAdded) {
            console.log("\n✅ Consumer is already added to subscription!");
            return;
        }

        // Check if we are the owner
        if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
            console.error("\n❌ You are not the subscription owner!");
            console.error("   Subscription owner:", owner);
            console.error("   Your wallet:", wallet.address);
            console.error("   Use the subscription owner's private key.");
            process.exit(1);
        }
    } catch (error) {
        console.error("Error checking subscription:", error.message);
        console.log("\nTrying to add consumer anyway...");
    }

    // Add consumer
    console.log("\n--- Adding Consumer ---");
    try {
        const tx = await router.addConsumer(subscriptionId, consumerAddress);
        console.log("Transaction sent:", tx.hash);

        const receipt = await tx.wait();
        console.log("✅ Consumer added successfully!");
        console.log("   Block:", receipt.blockNumber);
        console.log("   Gas used:", receipt.gasUsed?.toString());
    } catch (error) {
        if (error.message.includes("already exists") || error.message.includes("already added")) {
            console.log("✅ Consumer was already added to subscription");
        } else {
            console.error("❌ Error adding consumer:", error.message);
            process.exit(1);
        }
    }

    // Verify
    console.log("\n--- Verifying ---");
    try {
        const [, , , consumers] = await router.getSubscription(subscriptionId);
        console.log("Updated Consumers:", consumers);

        const consumerLower = consumerAddress.toLowerCase();
        const isAdded = consumers.some(c => c.toLowerCase() === consumerLower);

        if (isAdded) {
            console.log("\n✅ Verification passed! Consumer is now in subscription.");
        } else {
            console.log("\n⚠️  Consumer not found in list. May need to wait for confirmation.");
        }
    } catch (error) {
        console.log("Could not verify:", error.message);
    }

    // Update subscription ID in deployment info
    chainlinkDeployment.chainlinkConfig.subscriptionId = parseInt(subscriptionId);
    fs.writeFileSync(chainlinkDeploymentPath, JSON.stringify(chainlinkDeployment, null, 2));
    console.log("\n📄 Updated deployment info with subscription ID");

    console.log("\n=== Done ===");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
