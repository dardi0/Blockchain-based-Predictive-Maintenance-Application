
pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

template TrainingRecordProof() {
    // Public inputs
    signal input modelHash;              // 254-bit truncated model file hash
    signal input timestamp;
    signal input hyperparamsCommitment;  // Poseidon(h1, h2, h3, nonce)

    // Private inputs — Training group (8 params)
    signal input lrScaled;              // learning_rate * 1e6
    signal input epochs;
    signal input batchSize;
    signal input cvSplits;
    signal input earlyStopPatience;
    signal input cvLrScaled;            // cv learning_rate * 1e6
    signal input cvEpochs;
    signal input cvEarlyStopPatience;

    // Private inputs — Architecture group (8 params)
    signal input cnnFilters;            // CNN_FILTERS_PER_LAYER[0]
    signal input cnnLayers;             // len(CNN_FILTERS_PER_LAYER)
    signal input cnnKernelSize;
    signal input cnnDropoutScaled;      // cnn_dropout * 10000
    signal input cnnPoolSize;
    signal input lstmUnits;             // LSTM_UNITS_PER_LAYER[0]
    signal input lstmLayers;            // len(LSTM_UNITS_PER_LAYER)
    signal input lstmDropoutScaled;     // lstm_dropout * 10000

    // Private inputs — Dense group (4 params)
    signal input denseUnits;            // DENSE_UNITS_PER_LAYER[0]
    signal input denseLayers;           // len(DENSE_UNITS_PER_LAYER)
    signal input denseDropoutScaled;    // dense_dropout * 10000
    signal input thresholdMethodCode;   // f1=1, fbeta=2, recall_focused=3, other=4, default=0

    signal input nonce;

    // Layer 1: h1 = Poseidon(8 training params)
    component hasher1 = Poseidon(8);
    hasher1.inputs[0] <== lrScaled;
    hasher1.inputs[1] <== epochs;
    hasher1.inputs[2] <== batchSize;
    hasher1.inputs[3] <== cvSplits;
    hasher1.inputs[4] <== earlyStopPatience;
    hasher1.inputs[5] <== cvLrScaled;
    hasher1.inputs[6] <== cvEpochs;
    hasher1.inputs[7] <== cvEarlyStopPatience;

    signal h1;
    h1 <== hasher1.out;

    // Layer 2: h2 = Poseidon(8 architecture params)
    component hasher2 = Poseidon(8);
    hasher2.inputs[0] <== cnnFilters;
    hasher2.inputs[1] <== cnnLayers;
    hasher2.inputs[2] <== cnnKernelSize;
    hasher2.inputs[3] <== cnnDropoutScaled;
    hasher2.inputs[4] <== cnnPoolSize;
    hasher2.inputs[5] <== lstmUnits;
    hasher2.inputs[6] <== lstmLayers;
    hasher2.inputs[7] <== lstmDropoutScaled;

    signal h2;
    h2 <== hasher2.out;

    // Layer 3: h3 = Poseidon(4 dense params)
    component hasher3 = Poseidon(4);
    hasher3.inputs[0] <== denseUnits;
    hasher3.inputs[1] <== denseLayers;
    hasher3.inputs[2] <== denseDropoutScaled;
    hasher3.inputs[3] <== thresholdMethodCode;

    signal h3;
    h3 <== hasher3.out;

    // Final: hyperparamsCommitment = Poseidon(h1, h2, h3, nonce)
    component hasherFinal = Poseidon(4);
    hasherFinal.inputs[0] <== h1;
    hasherFinal.inputs[1] <== h2;
    hasherFinal.inputs[2] <== h3;
    hasherFinal.inputs[3] <== nonce;

    // Verify commitment matches
    hyperparamsCommitment === hasherFinal.out;

    // Expose outputs (public)
    signal output out_modelHash;
    signal output out_timestamp;
    signal output out_hyperparamsCommitment;

    out_modelHash             <== modelHash;
    out_timestamp             <== timestamp;
    out_hyperparamsCommitment <== hyperparamsCommitment;
}

template Main() {
    // Public inputs
    signal input modelHash;
    signal input timestamp;
    signal input hyperparamsCommitment;

    // Private inputs — Training
    signal input lrScaled;
    signal input epochs;
    signal input batchSize;
    signal input cvSplits;
    signal input earlyStopPatience;
    signal input cvLrScaled;
    signal input cvEpochs;
    signal input cvEarlyStopPatience;

    // Private inputs — Architecture
    signal input cnnFilters;
    signal input cnnLayers;
    signal input cnnKernelSize;
    signal input cnnDropoutScaled;
    signal input cnnPoolSize;
    signal input lstmUnits;
    signal input lstmLayers;
    signal input lstmDropoutScaled;

    // Private inputs — Dense
    signal input denseUnits;
    signal input denseLayers;
    signal input denseDropoutScaled;
    signal input thresholdMethodCode;

    signal input nonce;

    component P = TrainingRecordProof();
    P.modelHash             <== modelHash;
    P.timestamp             <== timestamp;
    P.hyperparamsCommitment <== hyperparamsCommitment;
    P.lrScaled              <== lrScaled;
    P.epochs                <== epochs;
    P.batchSize             <== batchSize;
    P.cvSplits              <== cvSplits;
    P.earlyStopPatience     <== earlyStopPatience;
    P.cvLrScaled            <== cvLrScaled;
    P.cvEpochs              <== cvEpochs;
    P.cvEarlyStopPatience   <== cvEarlyStopPatience;
    P.cnnFilters            <== cnnFilters;
    P.cnnLayers             <== cnnLayers;
    P.cnnKernelSize         <== cnnKernelSize;
    P.cnnDropoutScaled      <== cnnDropoutScaled;
    P.cnnPoolSize           <== cnnPoolSize;
    P.lstmUnits             <== lstmUnits;
    P.lstmLayers            <== lstmLayers;
    P.lstmDropoutScaled     <== lstmDropoutScaled;
    P.denseUnits            <== denseUnits;
    P.denseLayers           <== denseLayers;
    P.denseDropoutScaled    <== denseDropoutScaled;
    P.thresholdMethodCode   <== thresholdMethodCode;
    P.nonce                 <== nonce;

    signal output out_modelHash;
    signal output out_timestamp;
    signal output out_hyperparamsCommitment;

    out_modelHash             <== P.out_modelHash;
    out_timestamp             <== P.out_timestamp;
    out_hyperparamsCommitment <== P.out_hyperparamsCommitment;
}

component main {public [modelHash, timestamp, hyperparamsCommitment]} = Main();
