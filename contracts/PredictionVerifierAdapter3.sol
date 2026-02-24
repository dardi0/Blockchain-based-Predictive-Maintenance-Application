// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PredictionGroth16Verifier.sol";

interface IPredictionVerifierAdapter3 {
    function verifyPredictionProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[8] calldata public_inputs
    ) external view returns (bool);
}

contract PredictionVerifierAdapter3 is PredictionGroth16Verifier, IPredictionVerifierAdapter3 {
    function verifyPredictionProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[8] calldata public_inputs
    ) external view override returns (bool) {
        // Swap G2 coordinates to match precompile ordering expected by snarkjs verifier
        uint[2][2] memory bs;
        bs[0][0] = b[0][1];
        bs[0][1] = b[0][0];
        bs[1][0] = b[1][1];
        bs[1][1] = b[1][0];
        return this.verifyProof(a, bs, c, public_inputs);
    }
}
