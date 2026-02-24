/**
 * Test direct call to inherited Groth16Verifier3.verifyProof
 * The UnifiedGroth16Verifier inherits from Groth16Verifier which inherits from Groth16Verifier3
 */
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
    console.log("=".repeat(70));
    console.log("TESTING INHERITED Groth16Verifier3.verifyProof");
    console.log("=".repeat(70));

    const provider = new ethers.JsonRpcProvider(process.env.ZKSYNC_ERA_RPC_URL);
    const verifierAddr = process.env.VERIFIER_ADDRESS;

    // Load proof and public inputs
    const proof = JSON.parse(fs.readFileSync('temp/zk_proofs/sensor_data_proof_proof.json', 'utf8'));
    const publicSignals = JSON.parse(fs.readFileSync('temp/zk_proofs/sensor_data_proof_public.json', 'utf8'));

    // Parse proof components
    const a = [proof.pi_a[0], proof.pi_a[1]];
    const b = [
        [proof.pi_b[0][0], proof.pi_b[0][1]],
        [proof.pi_b[1][0], proof.pi_b[1][1]]
    ];
    const c = [proof.pi_c[0], proof.pi_c[1]];

    console.log("\n[PROOF]");
    console.log("a:", a.map(x => x.slice(0, 20) + "..."));
    console.log("b[0]:", b[0].map(x => x.slice(0, 15) + "..."));
    console.log("b[1]:", b[1].map(x => x.slice(0, 15) + "..."));
    console.log("c:", c.map(x => x.slice(0, 20) + "..."));
    console.log("public:", publicSignals);

    // ABI with exact 3 public inputs (matches SensorDataVerifier3.sol)
    const verifierABI = [
        // This is the EXACT signature from SensorDataVerifier3.sol line 40
        "function verifyProof(uint256[2] calldata _pA, uint256[2][2] calldata _pB, uint256[2] calldata _pC, uint256[3] calldata _pubSignals) external view returns (bool)"
    ];

    const verifier = new ethers.Contract(verifierAddr, verifierABI, provider);

    console.log("\n" + "-".repeat(70));
    console.log("Testing verifyProof (Groth16Verifier3 signature)...");
    console.log("-".repeat(70));

    try {
        const result = await verifier.verifyProof(a, b, c, publicSignals);
        console.log(`Result: ${result ? 'VALID!' : 'INVALID'}`);

        if (result) {
            console.log("\n*** SUCCESS! The inherited verifier works! ***");
        }
    } catch (e) {
        console.log("Error:", e.message);
    }

    // Also try different B orderings
    console.log("\n" + "-".repeat(70));
    console.log("Testing with different B orderings...");
    console.log("-".repeat(70));

    const b_variants = {
        "native": b,
        "inner_swap": [[b[0][1], b[0][0]], [b[1][1], b[1][0]]],
        "outer_swap": [b[1], b[0]],
        "full_swap": [[b[1][1], b[1][0]], [b[0][1], b[0][0]]]
    };

    for (const [name, b_var] of Object.entries(b_variants)) {
        try {
            const result = await verifier.verifyProof(a, b_var, c, publicSignals);
            console.log(`${name}: ${result ? 'VALID!' : 'invalid'}`);
        } catch (e) {
            console.log(`${name}: error - ${e.message.slice(0, 50)}`);
        }
    }

    console.log("\n" + "=".repeat(70));
}

main().catch(console.error);
