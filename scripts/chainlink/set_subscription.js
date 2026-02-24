/**
 * Set Subscription ID on PdMFunctionsConsumer contract
 *
 * Usage: node scripts/chainlink/set_subscription.js
 */

require('dotenv').config();

const { Wallet, Provider, Contract } = require("zksync-ethers");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("=== Set Subscription ID on PdMFunctionsConsumer ===\n");

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
    const subscriptionId = process.env.CHAINLINK_SUBSCRIPTION_ID || 6254;

    console.log("Consumer Address:", consumerAddress);
    console.log("Subscription ID:", subscriptionId);

    // Connect
    const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL || "https://sepolia.era.zksync.dev");
    const wallet = new Wallet(process.env.CONTRACT_OWNER_PRIVATE_KEY, provider);

    console.log("Wallet:", wallet.address);

    const consumer = new Contract(consumerAddress, consumerArtifact.abi, wallet);

    // Check current subscription ID
    const currentSubId = await consumer.subscriptionId();
    console.log("\nCurrent Subscription ID:", currentSubId.toString());

    if (currentSubId.toString() === subscriptionId.toString()) {
        console.log("✅ Subscription ID already set correctly!");
        return;
    }

    // Set new subscription ID
    console.log("\n--- Setting Subscription ID ---");
    const tx = await consumer.setSubscriptionId(subscriptionId);
    console.log("Transaction sent:", tx.hash);

    await tx.wait();
    console.log("✅ Subscription ID updated!");

    // Verify
    const newSubId = await consumer.subscriptionId();
    console.log("New Subscription ID:", newSubId.toString());

    // Update deployment info
    chainlinkDeployment.chainlinkConfig.subscriptionId = parseInt(subscriptionId);
    chainlinkDeployment.contracts.PdMFunctionsConsumer.config.subscriptionId = parseInt(subscriptionId);
    fs.writeFileSync(chainlinkDeploymentPath, JSON.stringify(chainlinkDeployment, null, 2));
    console.log("\n📄 Deployment info updated");

    console.log("\n=== Done ===");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
