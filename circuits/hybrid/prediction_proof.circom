
pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

template PredictionProof() {
    // Inputs (Private by default if not exposed in Main)
    signal input dataProofId;
    signal input prediction;    // 0 or 1 (now truly private)
    signal input confidence;    // 0-10000 (now truly private)
    signal input modelHash;     
    signal input timestamp;     
    signal input nonce;         // For entropy

    // Internal/public signals
    signal output validProof;
    signal output commitmentHash; // Hash of (prediction, confidence, nonce)

    // 1. Calculate Commitment Hash: Poseidon(prediction, confidence, nonce)
    component hasher = Poseidon(3);
    hasher.inputs[0] <== prediction;
    hasher.inputs[1] <== confidence;
    hasher.inputs[2] <== nonce;

    commitmentHash <== hasher.out;

    // 2. Validate Inputs
    // Check prediction is 0 or 1
    component predCheck = LessThan(8);
    predCheck.in[0] <== prediction;
    predCheck.in[1] <== 2;
    
    // Check confidence is <= 10000
    component confCheck = LessEqThan(16);
    confCheck.in[0] <== confidence;
    confCheck.in[1] <== 10000;

    validProof <== predCheck.out * confCheck.out;
    
    // Force validProof to be 1
    validProof === 1;
}

// Wrapper: expose specific signals as public
template Main() {
    // Public inputs (visible on-chain)
    signal input dataProofId;
    signal input modelHash;
    signal input timestamp;
    signal input predictionCommitment; // This is an INPUT that we claim matches the calculated hash

    // Private inputs (hidden)
    signal input prediction;
    signal input confidence;
    signal input nonce;

    // Instantiate circuit
    component P = PredictionProof();
    P.dataProofId <== dataProofId;
    P.prediction  <== prediction;
    P.confidence  <== confidence;
    P.modelHash   <== modelHash;
    P.timestamp   <== timestamp;
    P.nonce       <== nonce;

    // Verify that the provided public commitment matches the calculation
    P.commitmentHash === predictionCommitment;

    // Expose outputs (public signals)
    signal output out_dataProofId;
    signal output out_modelHash;
    signal output out_timestamp;
    signal output out_predictionCommitment;

    out_dataProofId <== P.dataProofId;
    out_modelHash   <== P.modelHash;
    out_timestamp   <== P.timestamp;
    out_predictionCommitment <== predictionCommitment;
}

component main {public [dataProofId, modelHash, timestamp, predictionCommitment]} = Main();
