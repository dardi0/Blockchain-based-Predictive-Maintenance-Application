pragma circom 2.0.0;
include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

template SensorProof() {
    signal input machineId;
    signal input timestamp;
    signal input value;
    
    signal output commitment;
    signal output valid;
    
    // Hash commitment
    component hasher = Poseidon(3);
    hasher.inputs[0] <== machineId;
    hasher.inputs[1] <== timestamp;  
    hasher.inputs[2] <== value;
    
    commitment <== hasher.out;
    
    // Basic validation
    component check = GreaterThan(32);
    check.in[0] <== machineId;
    check.in[1] <== 0;
    
    valid <== check.out;
}

component main = SensorProof();
