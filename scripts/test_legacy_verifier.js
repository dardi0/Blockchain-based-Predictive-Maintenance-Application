/**
 * Test direct call to Groth16Verifier3.verifyProof (snarkjs generated)
 * This should work because it's the exact format snarkjs expects
 */
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
    console.log("=".repeat(70));
    console.log("TESTING LEGACY verifyProof (snarkjs format)");
    console.log("=".repeat(70));

    const provider = new ethers.JsonRpcProvider(process.env.ZKSYNC_ERA_RPC_URL);
    const verifierAddr = process.env.VERIFIER_ADDRESS;

    // Load proof and public inputs
    const proof = JSON.parse(fs.readFileSync('temp/zk_proofs/sensor_data_proof_proof.json', 'utf8'));
    const publicSignals = JSON.parse(fs.readFileSync('temp/zk_proofs/sensor_data_proof_public.json', 'utf8'));

    console.log("\n[PROOF FROM FILE]");
    console.log("pi_a:", proof.pi_a.slice(0, 2).map(x => x.slice(0, 20) + "..."));
    console.log("pi_b[0]:", proof.pi_b[0].map(x => x.slice(0, 15) + "..."));
    console.log("pi_b[1]:", proof.pi_b[1].map(x => x.slice(0, 15) + "..."));
    console.log("pi_c:", proof.pi_c.slice(0, 2).map(x => x.slice(0, 20) + "..."));
    console.log("public:", publicSignals);

    // The snarkjs-generated verifier expects:
    // verifyProof(uint[2] _pA, uint[2][2] _pB, uint[2] _pC, uint[3] _pubSignals)
    // Note: pi_b format from snarkjs is [[x0, x1], [y0, y1]] but verifier expects [[x0, x1], [y0, y1]]

    const a = [proof.pi_a[0], proof.pi_a[1]];
    const b = [
        [proof.pi_b[0][0], proof.pi_b[0][1]],
        [proof.pi_b[1][0], proof.pi_b[1][1]]
    ];
    const c = [proof.pi_c[0], proof.pi_c[1]];
    const pub = publicSignals.slice(0, 3);

    console.log("\n[FORMATTED FOR CONTRACT]");
    console.log("a:", a.map(x => x.slice(0, 20) + "..."));
    console.log("b:", b.map(arr => arr.map(x => x.slice(0, 15) + "...")));
    console.log("c:", c.map(x => x.slice(0, 20) + "..."));
    console.log("pub:", pub);

    // ABI for the snarkjs-generated verifier function with 3 public inputs
    // This is the verifyProof(uint[2], uint[2][2], uint[2], uint[3]) signature
    const verifierABI = [
        "function verifyProof(uint256[2] calldata _pA, uint256[2][2] calldata _pB, uint256[2] calldata _pC, uint256[3] calldata _pubSignals) public view returns (bool)"
    ];

    const verifier = new ethers.Contract(verifierAddr, verifierABI, provider);

    console.log("\n" + "-".repeat(70));
    console.log("Calling verifyProof (snarkjs format with 3 public inputs)...");
    console.log("-".repeat(70));

    try {
        const result = await verifier.verifyProof(a, b, c, pub);
        console.log(`Result: ${result ? 'VALID!' : 'INVALID'}`);
    } catch (e) {
        console.log("Error:", e.message);
    }

    // Also test with verifySensorDataProof (dynamic input array)
    console.log("\n" + "-".repeat(70));
    console.log("Calling verifySensorDataProof (dynamic array)...");
    console.log("-".repeat(70));

    const verifierABI2 = [
        "function verifySensorDataProof(uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[] memory input) public view returns (bool)"
    ];

    const verifier2 = new ethers.Contract(verifierAddr, verifierABI2, provider);

    try {
        const result = await verifier2.verifySensorDataProof(a, b, c, pub);
        console.log(`Result: ${result ? 'VALID!' : 'INVALID'}`);
    } catch (e) {
        console.log("Error:", e.message);
    }

    console.log("\n" + "=".repeat(70));
}

main().catch(console.error);
