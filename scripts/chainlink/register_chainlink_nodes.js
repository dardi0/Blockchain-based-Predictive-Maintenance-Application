/**
 * Register Chainlink Automation and Functions contracts as authorized nodes
 * in the AccessControlRegistry
 */

require('dotenv').config();

const { Wallet, Provider, Contract } = require("zksync-ethers");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("=== Chainlink Node Registration ===\n");

    // Load deployment info
    const deploymentPath = path.join(__dirname, "../../deployment_info_hybrid_ZKSYNC_ERA.json");
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

    // Load chainlink deployment info
    const chainlinkDeploymentPath = path.join(__dirname, "../../chainlink_deployment_info.json");
    let chainlinkDeployment;
    try {
        chainlinkDeployment = JSON.parse(fs.readFileSync(chainlinkDeploymentPath, "utf8"));
    } catch (e) {
        console.error("Could not load chainlink deployment info. Run deploy-chainlink.js first.");
        process.exit(1);
    }

    const accessRegistryAddress = deployment.contracts.AccessControlRegistry.address;
    console.log(`AccessControlRegistry: ${accessRegistryAddress}`);

    // Get signer (contract owner)
    const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL || "https://sepolia.era.zksync.dev");
    const wallet = new Wallet(process.env.CONTRACT_OWNER_PRIVATE_KEY, provider);
    console.log(`Deployer: ${wallet.address}`);

    // Load ABI
    const accessRegistryArtifact = JSON.parse(fs.readFileSync(
        path.join(__dirname, "../../artifacts-zk/contracts/AccessControlRegistry.sol/AccessControlRegistry.json"),
        "utf8"
    ));

    // Load contract
    const accessRegistry = new Contract(
        accessRegistryAddress,
        accessRegistryArtifact.abi,
        wallet
    );

    // Get Chainlink contract addresses from deployment info
    const automationAddress = chainlinkDeployment.contracts.ChainlinkPdMAutomation.address;
    const functionsAddress = chainlinkDeployment.contracts.PdMFunctionsConsumer.address;

    console.log(`\nChainlink Automation: ${automationAddress}`);
    console.log(`Chainlink Functions: ${functionsAddress}`);

    // Node groups from AccessControlRegistry
    const GroupId = {
        DATA_PROCESSOR: ethers.encodeBytes32String("DATA_PROCESSOR"),    // OPERATOR equivalent
        FAILURE_ANALYZER: ethers.encodeBytes32String("FAILURE_ANALYZER"),  // ENGINEER equivalent
        MANAGER: ethers.encodeBytes32String("MANAGER")            // Full access
    };

    // Access levels
    const AccessLevel = {
        NO_ACCESS: 0,
        READ_ONLY: 1,
        WRITE_LIMITED: 2,
        FULL_ACCESS: 3,
        ADMIN_ACCESS: 4
    };

    // Register Chainlink Automation contract
    console.log("\n--- Registering Chainlink Automation Node ---");
    try {
        const tx1 = await accessRegistry.registerNode(
            "Chainlink Automation",          // nodeName
            automationAddress,               // nodeAddress
            GroupId.DATA_PROCESSOR,          // groupId (OPERATOR equivalent)
            AccessLevel.WRITE_LIMITED,       // accessLevel
            0,                               // accessDuration (0 = permanent)
            JSON.stringify({                 // metadata
                type: "chainlink_automation",
                version: "2.0",
                network: "zksync_sepolia",
                registeredAt: new Date().toISOString()
            })
        );
        const receipt1 = await tx1.wait();
        console.log(`✅ Automation node registered! TX: ${receipt1.hash}`);

        // Extract node ID from logs
        for (const log of receipt1.logs) {
            try {
                const parsed = accessRegistry.interface.parseLog(log);
                if (parsed && parsed.name === "NodeRegistered") {
                    console.log(`   Node ID: ${parsed.args.nodeId.slice(0, 18)}...`);
                    break;
                }
            } catch (e) { /* not this event */ }
        }
    } catch (error) {
        if (error.message.includes("already registered") || error.message.includes("Node already exists")) {
            console.log("⚠️  Automation node already registered");
        } else {
            console.error(`❌ Error: ${error.message}`);
        }
    }

    // Register Chainlink Functions consumer
    console.log("\n--- Registering Chainlink Functions Node ---");
    try {
        const tx2 = await accessRegistry.registerNode(
            "Chainlink Functions DON",       // nodeName
            functionsAddress,                // nodeAddress
            GroupId.FAILURE_ANALYZER,        // groupId (ENGINEER equivalent)
            AccessLevel.WRITE_LIMITED,       // accessLevel
            0,                               // accessDuration
            JSON.stringify({
                type: "chainlink_functions",
                version: "1.0",
                network: "zksync_sepolia",
                registeredAt: new Date().toISOString()
            })
        );
        const receipt2 = await tx2.wait();
        console.log(`✅ Functions node registered! TX: ${receipt2.hash}`);

        for (const log of receipt2.logs) {
            try {
                const parsed = accessRegistry.interface.parseLog(log);
                if (parsed && parsed.name === "NodeRegistered") {
                    console.log(`   Node ID: ${parsed.args.nodeId.slice(0, 18)}...`);
                    break;
                }
            } catch (e) { /* not this event */ }
        }
    } catch (error) {
        if (error.message.includes("already registered") || error.message.includes("Node already exists")) {
            console.log("⚠️  Functions node already registered");
        } else {
            console.error(`❌ Error: ${error.message}`);
        }
    }

    // Save registration info
    const registrationInfo = {
        network: "zksync_sepolia",
        timestamp: new Date().toISOString(),
        accessRegistry: accessRegistryAddress,
        nodes: {
            automation: {
                address: automationAddress,
                nodeType: "DATA_PROCESSOR",
                accessLevel: "WRITE_LIMITED"
            },
            functions: {
                address: functionsAddress,
                nodeType: "FAILURE_ANALYZER",
                accessLevel: "WRITE_LIMITED"
            }
        }
    };

    const outputPath = path.join(__dirname, "../../chainlink_registration_info.json");
    fs.writeFileSync(outputPath, JSON.stringify(registrationInfo, null, 2));
    console.log(`\n📄 Registration info saved to: ${outputPath}`);

    console.log("\n=== Registration Complete ===");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
