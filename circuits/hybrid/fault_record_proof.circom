
pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

template FaultRecordProof() {
    // Public inputs
    signal input machineId;
    signal input timestamp;
    signal input faultCommitment;  // Poseidon(prediction, predictionProb, nonce)

    // Private inputs
    signal input prediction;       // 0 or 1
    signal input predictionProb;   // 0-10000 (prob * 10000)
    signal input nonce;

    // Compute commitment
    component hasher = Poseidon(3);
    hasher.inputs[0] <== prediction;
    hasher.inputs[1] <== predictionProb;
    hasher.inputs[2] <== nonce;

    // Verify commitment matches
    faultCommitment === hasher.out;

    // Validate prediction is 0 or 1
    component predCheck = LessThan(8);
    predCheck.in[0] <== prediction;
    predCheck.in[1] <== 2;
    predCheck.out === 1;

    // Validate probability in range [0, 10000]
    component probCheck = LessEqThan(16);
    probCheck.in[0] <== predictionProb;
    probCheck.in[1] <== 10000;
    probCheck.out === 1;

    // Expose outputs (public)
    signal output out_machineId;
    signal output out_timestamp;
    signal output out_faultCommitment;

    out_machineId <== machineId;
    out_timestamp <== timestamp;
    out_faultCommitment <== faultCommitment;
}

template Main() {
    // Public inputs
    signal input machineId;
    signal input timestamp;
    signal input faultCommitment;

    // Private inputs
    signal input prediction;
    signal input predictionProb;
    signal input nonce;

    component P = FaultRecordProof();
    P.machineId      <== machineId;
    P.timestamp      <== timestamp;
    P.faultCommitment <== faultCommitment;
    P.prediction     <== prediction;
    P.predictionProb <== predictionProb;
    P.nonce          <== nonce;

    signal output out_machineId;
    signal output out_timestamp;
    signal output out_faultCommitment;

    out_machineId      <== P.out_machineId;
    out_timestamp      <== P.out_timestamp;
    out_faultCommitment <== P.out_faultCommitment;
}

component main {public [machineId, timestamp, faultCommitment]} = Main();
