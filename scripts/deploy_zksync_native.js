#!/usr/bin/env node

/**
 * zkSync Era Native Deployment - EIP-712 Compatible
 */

import "dotenv/config";
import { Provider, Wallet, ContractFactory, utils } from "zksync-ethers";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log("ğŸ¯ ZKSYNC ERA NATIVE DEPLOYMENT (EIP-712)");
    console.log("=".repeat(60));

    try {
        // 1ï¸âƒ£ Provider & Wallet
        const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL);
        const wallet = new Wallet(process.env.PRIVATE_KEY, provider);

        console.log("ğŸ‘¤ Deployer:", wallet.address);
        const balance = await wallet.getBalance();
        console.log("ğŸ’° Balance:", ethers.formatEther(balance), "ETH");

        if (balance === 0n) {
            console.error("âŒ No balance. Faucet: https://portal.zksync.io/faucet");
            process.exit(1);
        }

        // 2ï¸âƒ£ Artifacts yÃ¼kle
        const artifactsPath = path.join(__dirname, "../artifacts-zk/contracts");

        function loadArtifact(file) {
            return JSON.parse(fs.readFileSync(path.join(artifactsPath, file), "utf8"));
        }

        const accessArtifact = loadArtifact("AccessControlRegistry.sol/AccessControlRegistry.json");
        const verifierArtifact = loadArtifact("UnifiedGroth16Verifier.sol/UnifiedGroth16Verifier.json");
        const hybridArtifact = loadArtifact("PdMSystemHybrid.sol/PdMSystemHybrid.json");

        // 3ï¸âƒ£ Deploy AccessControlRegistry
        console.log("\nğŸš€ Deploying AccessControlRegistry...");
        const accessFactory = new ContractFactory(
            accessArtifact.abi,
            accessArtifact.bytecode,
            wallet,
            "create"
        );

        const accessContract = await accessFactory.deploy(wallet.address, {
            customData: {
                gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
            }
        });
        await accessContract.deploymentTransaction().wait();
        const accessAddress = await accessContract.getAddress();
        console.log("âœ… AccessControlRegistry:", accessAddress);

        // 4ï¸âƒ£ Deploy Verifier
        console.log("\nğŸš€ Deploying UnifiedGroth16Verifier...");
        const verifierFactory = new ContractFactory(
            verifierArtifact.abi,
            verifierArtifact.bytecode,
            wallet,
            "create"
        );

        const verifierContract = await verifierFactory.deploy({
            gasLimit: 8_000_000,
            gasPrice: await provider.getGasPrice(),
            customData: {
                gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
                factoryDeps: [utils.hashBytecode(verifierArtifact.bytecode)]
            }
        });
        await verifierContract.deploymentTransaction().wait();
        const verifierAddress = await verifierContract.getAddress();
        console.log("âœ… UnifiedGroth16Verifier:", verifierAddress);

        // 5ï¸âƒ£ Deploy PdMSystemHybrid
        console.log("\nğŸš€ Deploying PdMSystemHybrid...");
        const hybridFactory = new ContractFactory(
            hybridArtifact.abi,
            hybridArtifact.bytecode,
            wallet,
            "create"
        );

        const hybridContract = await hybridFactory.deploy(
            accessAddress,
            verifierAddress,
            wallet.address,
            {
                gasLimit: 12_000_000,
                gasPrice: await provider.getGasPrice(),
                customData: {
                    gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
                    factoryDeps: [utils.hashBytecode(hybridArtifact.bytecode)]
                }
            }
        );
        await hybridContract.deploymentTransaction().wait();
        const hybridAddress = await hybridContract.getAddress();
        console.log("âœ… PdMSystemHybrid:", hybridAddress);

        console.log("\nğŸ‰ ALL CONTRACTS DEPLOYED SUCCESSFULLY!");
        console.log("ğŸ› AccessControlRegistry:", accessAddress);
        console.log("ğŸ” Verifier:", verifierAddress);
        console.log("ğŸ— Hybrid:", hybridAddress);

    } catch (err) {
        console.error("\nâŒ DEPLOYMENT ERROR:");
        console.error(err);
        process.exit(1);
    }
}

main();

