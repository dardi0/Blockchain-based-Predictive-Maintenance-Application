/**
 * Compare on-chain VK with snarkjs VK file
 */
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
    console.log("=" .repeat(70));
    console.log("COMPARING VK: On-Chain vs snarkjs File");
    console.log("=".repeat(70));

    const provider = new ethers.JsonRpcProvider(process.env.ZKSYNC_ERA_RPC_URL);
    const verifierAddr = process.env.VERIFIER_ADDRESS;

    // Load snarkjs VK from temp file
    const snarkjsVK = JSON.parse(fs.readFileSync('temp/zk_proofs/sensor_vk_check.json', 'utf8'));

    console.log("\n[SNARKJS VK FILE]");
    console.log("vk_alpha_1:", snarkjsVK.vk_alpha_1.slice(0, 2));
    console.log("vk_beta_2[0]:", snarkjsVK.vk_beta_2[0]);
    console.log("vk_beta_2[1]:", snarkjsVK.vk_beta_2[1]);
    console.log("IC[0]:", snarkjsVK.IC[0].slice(0, 2));

    // Read on-chain VK
    const verifierABI = [
        "function circuitKeys(uint8) view returns (tuple(uint256 X, uint256 Y) alpha, tuple(uint256[2] X, uint256[2] Y) beta, tuple(uint256[2] X, uint256[2] Y) gamma, tuple(uint256[2] X, uint256[2] Y) delta, tuple(uint256 X, uint256 Y)[] IC, bool isSet)",
        "function getICPoint(uint8 circuitType, uint256 index) view returns (uint256 X, uint256 Y)"
    ];

    const verifier = new ethers.Contract(verifierAddr, verifierABI, provider);

    try {
        const vk = await verifier.circuitKeys(0);

        console.log("\n[ON-CHAIN VK]");
        console.log("alpha:", [vk.alpha.X.toString(), vk.alpha.Y.toString()]);
        console.log("beta.X:", [vk.beta.X[0].toString(), vk.beta.X[1].toString()]);
        console.log("beta.Y:", [vk.beta.Y[0].toString(), vk.beta.Y[1].toString()]);

        // Get IC points
        const ic0 = await verifier.getICPoint(0, 0);
        console.log("IC[0]:", [ic0.X.toString(), ic0.Y.toString()]);

        // Compare
        console.log("\n" + "-".repeat(70));
        console.log("COMPARISON");
        console.log("-".repeat(70));

        // Alpha comparison
        const alphaMatch = snarkjsVK.vk_alpha_1[0] === vk.alpha.X.toString() &&
                          snarkjsVK.vk_alpha_1[1] === vk.alpha.Y.toString();
        console.log(`Alpha: ${alphaMatch ? 'MATCH' : 'MISMATCH'}`);

        // Beta comparison - snarkjs format is [[x1,x0], [y1,y0]]
        console.log("\nBeta comparison (snarkjs format [[x1,x0], [y1,y0]]):");
        console.log(`  snarkjs beta[0]: [${snarkjsVK.vk_beta_2[0][0]}, ${snarkjsVK.vk_beta_2[0][1]}]`);
        console.log(`  onchain beta.X:  [${vk.beta.X[0].toString()}, ${vk.beta.X[1].toString()}]`);
        console.log(`  snarkjs beta[1]: [${snarkjsVK.vk_beta_2[1][0]}, ${snarkjsVK.vk_beta_2[1][1]}]`);
        console.log(`  onchain beta.Y:  [${vk.beta.Y[0].toString()}, ${vk.beta.Y[1].toString()}]`);

        // Check if they match in native order
        const betaNativeMatch =
            snarkjsVK.vk_beta_2[0][0] === vk.beta.X[0].toString() &&
            snarkjsVK.vk_beta_2[0][1] === vk.beta.X[1].toString() &&
            snarkjsVK.vk_beta_2[1][0] === vk.beta.Y[0].toString() &&
            snarkjsVK.vk_beta_2[1][1] === vk.beta.Y[1].toString();

        // Check if they match in swapped order
        const betaSwappedMatch =
            snarkjsVK.vk_beta_2[0][1] === vk.beta.X[0].toString() &&
            snarkjsVK.vk_beta_2[0][0] === vk.beta.X[1].toString() &&
            snarkjsVK.vk_beta_2[1][1] === vk.beta.Y[0].toString() &&
            snarkjsVK.vk_beta_2[1][0] === vk.beta.Y[1].toString();

        console.log(`\n  Beta native match: ${betaNativeMatch}`);
        console.log(`  Beta swapped match: ${betaSwappedMatch}`);

        // IC comparison
        const ic0Match = snarkjsVK.IC[0][0] === ic0.X.toString() &&
                        snarkjsVK.IC[0][1] === ic0.Y.toString();
        console.log(`\nIC[0]: ${ic0Match ? 'MATCH' : 'MISMATCH'}`);

        console.log("\n" + "=".repeat(70));

    } catch (e) {
        console.log("Error:", e.message);
    }
}

main().catch(console.error);
