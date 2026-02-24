/**
 * Deploy BackendOracleConsumer for zkSync Era Sepolia
 *
 * This contract replaces PdMFunctionsConsumer when Chainlink Functions
 * is not available. It uses a trusted backend oracle for predictions.
 */

require('dotenv').config();

const { Wallet, Provider } = require("zksync-ethers");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const fs = require("fs");
const path = require("path");

module.exports = async function (hre) {
    console.log("=== Backend Oracle Consumer Deployment ===\n");

    // Load existing chainlink deployment info
    const chainlinkDeploymentPath = path.join(__dirname, "../chainlink_deployment_info.json");
    let chainlinkDeployment;
    try {
        chainlinkDeployment = JSON.parse(fs.readFileSync(chainlinkDeploymentPath, "utf8"));
        console.log("Loaded existing chainlink deployment info");
    } catch (e) {
        console.error("Could not load chainlink deployment. Run deploy-chainlink.js first.");
        process.exit(1);
    }

    const automationAddress = chainlinkDeployment.contracts.ChainlinkPdMAutomation.address;
    console.log(`ChainlinkPdMAutomation: ${automationAddress}`);

    // Get deployer wallet
    const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL || "https://sepolia.era.zksync.dev");
    const wallet = new Wallet(process.env.CONTRACT_OWNER_PRIVATE_KEY, provider);
    const deployer = new Deployer(hre, wallet);

    console.log(`\nDeployer: ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH\n`);

    // Trusted oracle = deployer wallet (or separate if configured)
    const trustedOracleAddress = process.env.AUTOMATION_ORACLE_ADDRESS || wallet.address;
    console.log(`Trusted Oracle: ${trustedOracleAddress}`);

    // Deploy BackendOracleConsumer
    console.log("\n--- Deploying BackendOracleConsumer ---");
    const oracleArtifact = await deployer.loadArtifact("BackendOracleConsumer");

    const oracleContract = await deployer.deploy(oracleArtifact, [
        trustedOracleAddress
    ]);

    await oracleContract.waitForDeployment();
    const oracleAddress = await oracleContract.getAddress();
    console.log(`✅ BackendOracleConsumer: ${oracleAddress}`);

    // Configure contracts
    console.log("\n--- Configuring Contracts ---");

    // Set Automation contract on Oracle consumer
    const setAutomationTx = await oracleContract.setAutomationContract(automationAddress);
    await setAutomationTx.wait();
    console.log("✅ Set Automation contract on Oracle consumer");

    // Update Automation contract to use new consumer
    const automationArtifact = JSON.parse(fs.readFileSync(
        path.join(__dirname, "../artifacts-zk/contracts/chainlink/ChainlinkPdMAutomation.sol/ChainlinkPdMAutomation.json"),
        "utf8"
    ));

    const { Contract } = require("zksync-ethers");
    const automationContract = new Contract(automationAddress, automationArtifact.abi, wallet);

    const setConsumerTx = await automationContract.setFunctionsConsumer(oracleAddress);
    await setConsumerTx.wait();
    console.log("✅ Updated Automation to use BackendOracleConsumer");

    // Update deployment info
    chainlinkDeployment.contracts.BackendOracleConsumer = {
        address: oracleAddress,
        config: {
            trustedOracle: trustedOracleAddress
        }
    };
    chainlinkDeployment.contracts.PdMFunctionsConsumer.note = "Replaced by BackendOracleConsumer";
    chainlinkDeployment.activeConsumer = "BackendOracleConsumer";

    fs.writeFileSync(chainlinkDeploymentPath, JSON.stringify(chainlinkDeployment, null, 2));
    console.log(`\n📄 Updated deployment info`);

    console.log("\n=== Deployment Complete ===");
    console.log("\nContract Addresses:");
    console.log(`   BackendOracleConsumer: ${oracleAddress}`);
    console.log(`   ChainlinkPdMAutomation: ${automationAddress}`);
    console.log(`   Trusted Oracle: ${trustedOracleAddress}`);

    console.log("\n📋 Next Steps:");
    console.log("1. Backend will listen for PredictionRequested events");
    console.log("2. Backend runs ML prediction");
    console.log("3. Backend calls fulfillPrediction() with results");
    console.log("4. Automation contract processes the prediction");
};
