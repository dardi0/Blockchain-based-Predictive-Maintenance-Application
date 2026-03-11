pragma circom 2.0.0;
include "circomlib/circuits/poseidon.circom";

/*
 * PoseidonMerkleRoot — Batch sensor proof circuit
 *
 * Proves knowledge of 64 leaf values whose Poseidon Merkle root,
 * when mixed with batchTimestamp, equals the public merkleRoot output.
 *
 * Public signals  : batchTimestamp (input), merkleRoot (output)
 * Private signals : leaves[64]
 *
 * Security properties:
 *  - merkleRoot = Poseidon(pure_64_leaf_root, batchTimestamp)
 *  - Replay protection: same leaves at different timestamp → different root
 */
template PoseidonMerkleRoot() {
    signal input  leaves[64];       // private: SHA256(sensor_data) % BN254_PRIME
    signal input  batchTimestamp;   // public:  Unix timestamp of batch submission
    signal output merkleRoot;       // public:  Poseidon(pure_root, batchTimestamp)

    // ── Level 1: 64 → 32 ──────────────────────────────────────────────────
    component l1[32];
    signal l1s[32];
    for (var i = 0; i < 32; i++) {
        l1[i] = Poseidon(2);
        l1[i].inputs[0] <== leaves[2 * i];
        l1[i].inputs[1] <== leaves[2 * i + 1];
        l1s[i] <== l1[i].out;
    }

    // ── Level 2: 32 → 16 ──────────────────────────────────────────────────
    component l2[16];
    signal l2s[16];
    for (var i = 0; i < 16; i++) {
        l2[i] = Poseidon(2);
        l2[i].inputs[0] <== l1s[2 * i];
        l2[i].inputs[1] <== l1s[2 * i + 1];
        l2s[i] <== l2[i].out;
    }

    // ── Level 3: 16 → 8 ───────────────────────────────────────────────────
    component l3[8];
    signal l3s[8];
    for (var i = 0; i < 8; i++) {
        l3[i] = Poseidon(2);
        l3[i].inputs[0] <== l2s[2 * i];
        l3[i].inputs[1] <== l2s[2 * i + 1];
        l3s[i] <== l3[i].out;
    }

    // ── Level 4: 8 → 4 ────────────────────────────────────────────────────
    component l4[4];
    signal l4s[4];
    for (var i = 0; i < 4; i++) {
        l4[i] = Poseidon(2);
        l4[i].inputs[0] <== l3s[2 * i];
        l4[i].inputs[1] <== l3s[2 * i + 1];
        l4s[i] <== l4[i].out;
    }

    // ── Level 5: 4 → 2 ────────────────────────────────────────────────────
    component l5[2];
    signal l5s[2];
    for (var i = 0; i < 2; i++) {
        l5[i] = Poseidon(2);
        l5[i].inputs[0] <== l4s[2 * i];
        l5[i].inputs[1] <== l4s[2 * i + 1];
        l5s[i] <== l5[i].out;
    }

    // ── Level 6: 2 → 1 (pure leaves root) ────────────────────────────────
    component root_h = Poseidon(2);
    root_h.inputs[0] <== l5s[0];
    root_h.inputs[1] <== l5s[1];

    // ── Bind batchTimestamp into final root ───────────────────────────────
    // merkleRoot = Poseidon(pure_leaves_root, batchTimestamp)
    // This makes the same leaf set produce a different root at each timestamp
    component ts_binder = Poseidon(2);
    ts_binder.inputs[0] <== root_h.out;
    ts_binder.inputs[1] <== batchTimestamp;
    merkleRoot <== ts_binder.out;
}

component main {public [batchTimestamp]} = PoseidonMerkleRoot();
