
pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

template ReportRecordProof() {
    // Public inputs
    signal input timestamp;
    signal input reportCommitment;  // Poseidon(reportHashField, machineCount, nonce)

    // Private inputs
    signal input reportHashField;   // int(sha256(reportBytes), 16) % BN254_PRIME
    signal input machineCount;
    signal input nonce;

    // Compute commitment
    component hasher = Poseidon(3);
    hasher.inputs[0] <== reportHashField;
    hasher.inputs[1] <== machineCount;
    hasher.inputs[2] <== nonce;

    // Verify commitment matches
    reportCommitment === hasher.out;

    // Expose outputs (public)
    signal output out_timestamp;
    signal output out_reportCommitment;

    out_timestamp       <== timestamp;
    out_reportCommitment <== reportCommitment;
}

template Main() {
    // Public inputs
    signal input timestamp;
    signal input reportCommitment;

    // Private inputs
    signal input reportHashField;
    signal input machineCount;
    signal input nonce;

    component P = ReportRecordProof();
    P.timestamp       <== timestamp;
    P.reportCommitment <== reportCommitment;
    P.reportHashField  <== reportHashField;
    P.machineCount     <== machineCount;
    P.nonce            <== nonce;

    signal output out_timestamp;
    signal output out_reportCommitment;

    out_timestamp        <== P.out_timestamp;
    out_reportCommitment <== P.out_reportCommitment;
}

component main {public [timestamp, reportCommitment]} = Main();
