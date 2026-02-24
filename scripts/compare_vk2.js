/**
 * Compare on-chain VK with snarkjs VK - Simpler version
 */
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
    console.log("=".repeat(70));
    console.log("COMPARING VK (IC Points Only)");
    console.log("=".repeat(70));

    const provider = new ethers.JsonRpcProvider(process.env.ZKSYNC_ERA_RPC_URL);
    const verifierAddr = process.env.VERIFIER_ADDRESS;

    // Load snarkjs VK from temp file
    const snarkjsVK = JSON.parse(fs.readFileSync('temp/zk_proofs/sensor_vk_check.json', 'utf8'));

    console.log("\n[SNARKJS VK FILE]");
    for (let i = 0; i < snarkjsVK.IC.length; i++) {
        console.log(`IC[${i}]: X=${snarkjsVK.IC[i][0].slice(0, 20)}... Y=${snarkjsVK.IC[i][1].slice(0, 20)}...`);
    }

    // Read on-chain IC points
    const verifierABI = [
        "function getICLength(uint8 circuitType) view returns (uint256)",
        "function getICPoint(uint8 circuitType, uint256 index) view returns (uint256 X, uint256 Y)"
    ];

    const verifier = new ethers.Contract(verifierAddr, verifierABI, provider);

    console.log("\n[ON-CHAIN VK]");
    const icLength = await verifier.getICLength(0);
    console.log(`IC Length: ${icLength}`);

    let allMatch = true;
    for (let i = 0; i < icLength; i++) {
        const ic = await verifier.getICPoint(0, i);
        const onchainX = ic.X.toString();
        const onchainY = ic.Y.toString();
        const snarkjsX = snarkjsVK.IC[i][0];
        const snarkjsY = snarkjsVK.IC[i][1];

        const match = onchainX === snarkjsX && onchainY === snarkjsY;
        allMatch = allMatch && match;

        console.log(`IC[${i}]: X=${onchainX.slice(0, 20)}... Y=${onchainY.slice(0, 20)}... ${match ? 'OK' : 'MISMATCH'}`);

        if (!match) {
            console.log(`   Expected X: ${snarkjsX}`);
            console.log(`   Got X:      ${onchainX}`);
            console.log(`   Expected Y: ${snarkjsY}`);
            console.log(`   Got Y:      ${onchainY}`);
        }
    }

    console.log("\n" + "-".repeat(70));
    console.log(`IC Points: ${allMatch ? 'ALL MATCH' : 'SOME MISMATCH'}`);

    // Now check beta/gamma/delta manually via raw call
    console.log("\n" + "-".repeat(70));
    console.log("Checking G2 Points (Beta, Gamma, Delta)");
    console.log("-".repeat(70));

    // We'll read raw storage or use a simpler ABI
    // The struct layout is: alpha(2 uint256), beta(4 uint256), gamma(4), delta(4), IC[], isSet
    // Let's just call the contract with a simpler approach

    console.log("\nsnarkjs vk_beta_2 (format: [[x1, x0], [y1, y0]]):");
    console.log(`  [0]: [${snarkjsVK.vk_beta_2[0][0].slice(0, 15)}..., ${snarkjsVK.vk_beta_2[0][1].slice(0, 15)}...]`);
    console.log(`  [1]: [${snarkjsVK.vk_beta_2[1][0].slice(0, 15)}..., ${snarkjsVK.vk_beta_2[1][1].slice(0, 15)}...]`);

    console.log("\nWhat deploy script set for beta.X:");
    console.log(`  According to code: [3390645320962890..., 13131765436705689...]`);

    console.log("\nExpected (snarkjs native order):");
    console.log(`  beta.X should be: [${snarkjsVK.vk_beta_2[0][0].slice(0, 15)}..., ${snarkjsVK.vk_beta_2[0][1].slice(0, 15)}...]`);
    console.log(`  beta.Y should be: [${snarkjsVK.vk_beta_2[1][0].slice(0, 15)}..., ${snarkjsVK.vk_beta_2[1][1].slice(0, 15)}...]`);

    console.log("\n" + "=".repeat(70));
}

main().catch(console.error);
