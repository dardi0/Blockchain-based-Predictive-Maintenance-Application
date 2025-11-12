// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./SensorDataVerifier.sol"; // provides Groth16Verifier (snarkjs) for sensor circuit

/**
 * Tek doğrulayıcı: Sensör kanıtı için snarkjs tarzı (sabit VK),
 * Prediction/Bakım için dinamik VK + pairing precompile.
 */

library PairingU {
    struct G1Point { uint256 X; uint256 Y; }
    struct G2Point { uint256[2] X; uint256[2] Y; }

    function G1_add(G1Point memory p1, G1Point memory p2) internal view returns (G1Point memory r) {
        uint256[4] memory input = [p1.X, p1.Y, p2.X, p2.Y];
        assembly { if iszero(staticcall(gas(), 0x06, input, 0x80, r, 0x40)) { revert(0, 0) } }
    }
    function G1_mul(G1Point memory p, uint256 s) internal view returns (G1Point memory r) {
        uint256[3] memory input = [p.X, p.Y, s];
        assembly { if iszero(staticcall(gas(), 0x07, input, 0x60, r, 0x40)) { revert(0, 0) } }
    }
    function G1_neg(G1Point memory p) internal pure returns (G1Point memory) {
        if (p.X == 0 && p.Y == 0) return p;
        uint256 FIELD_PRIME = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
        return G1Point(p.X, FIELD_PRIME - p.Y);
    }
}

contract UnifiedGroth16Verifier is Ownable, Groth16Verifier {
    using PairingU for *;

    // ----------------- Dinamik VK Yapısı (Prediction/Maintenance) -----------------
    enum CircuitType { SENSOR_DATA, PREDICTION, MAINTENANCE, LEGACY }
    struct DynVK {
        PairingU.G1Point alpha;
        PairingU.G2Point beta;
        PairingU.G2Point gamma;
        PairingU.G2Point delta;
        PairingU.G1Point[] IC;
        bool isSet;
    }
    mapping(CircuitType => DynVK) public circuitKeys;

    function setCircuitVerifyingKey(
        CircuitType circuitType,
        PairingU.G1Point memory alpha,
        PairingU.G2Point memory beta,
        PairingU.G2Point memory gamma,
        PairingU.G2Point memory delta,
        PairingU.G1Point[] memory IC
    ) external onlyOwner {
        require(IC.length > 0, "IC empty");
        delete circuitKeys[circuitType].IC;
        circuitKeys[circuitType].alpha = alpha;
        circuitKeys[circuitType].beta = beta;
        circuitKeys[circuitType].gamma = gamma;
        circuitKeys[circuitType].delta = delta;
        for (uint i=0;i<IC.length;i++){ circuitKeys[circuitType].IC.push(IC[i]); }
        circuitKeys[circuitType].isSet = true;
    }

    function verifyPredictionProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[] memory public_inputs
    ) public view returns (bool) {
        return _baseVerify(circuitKeys[CircuitType.PREDICTION], a, b, c, public_inputs);
    }

    function verifyMaintenanceProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[] memory public_inputs
    ) public view returns (bool) {
        return _baseVerify(circuitKeys[CircuitType.MAINTENANCE], a, b, c, public_inputs);
    }

    function _swapG2(PairingU.G2Point memory g) internal pure returns (PairingU.G2Point memory) {
        return PairingU.G2Point([g.X[1], g.X[0]], [g.Y[1], g.Y[0]]);
    }

    function _baseVerify(
        DynVK storage vk,
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[] memory public_inputs
    ) internal view returns (bool) {
        require(vk.isSet, "VK not set");
        require(public_inputs.length == vk.IC.length - 1, "bad inputs");

        PairingU.G1Point memory pA = PairingU.G1Point(a[0], a[1]);
        // pB: EVM precompile sırasına göre swap
        PairingU.G2Point memory pB = PairingU.G2Point([b[0][1], b[0][0]],[b[1][1], b[1][0]]);
        PairingU.G1Point memory pC = PairingU.G1Point(c[0], c[1]);

        PairingU.G1Point memory vk_x = vk.IC[0];
        for (uint i=0;i<public_inputs.length;i++) {
            vk_x = PairingU.G1_add(vk_x, PairingU.G1_mul(vk.IC[i+1], public_inputs[i]));
        }

        // Pairing input derleme (0x08)
        PairingU.G1Point[4] memory p1s = [
            PairingU.G1_neg(pA),
            vk.alpha,
            vk_x,
            pC
        ];
        PairingU.G2Point[4] memory p2s = [
            pB,
            _swapG2(vk.beta),
            _swapG2(vk.gamma),
            _swapG2(vk.delta)
        ];

        uint256 len = p1s.length;
        uint256 inputSize = len * 6 * 32;
        bytes memory input = new bytes(inputSize);
        assembly {
            let p_input := add(input, 0x20)
            let p_p1s := p1s
            let p_p2s := p2s
            for { let i := 0 } lt(i, len) { i := add(i, 1) } {
                let dest := add(p_input, mul(i, 192))
                let p1 := add(p_p1s, mul(i, 0x40))
                let p2 := add(p_p2s, mul(i, 0x80))
                mstore(dest, mload(p1))
                mstore(add(dest,32), mload(add(p1,32)))
                mstore(add(dest,64), mload(p2))
                mstore(add(dest,96), mload(add(p2,32)))
                mstore(add(dest,128), mload(add(p2,64)))
                mstore(add(dest,160), mload(add(p2,96)))
            }
        }
        bool ok;
        assembly { ok := staticcall(gas(), 0x08, add(input,0x20), inputSize, 0, 0) }
        return ok;
    }

    function verifySensorDataProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[] memory input
    ) public view returns (bool) {
        // Prefer dynamic VK if set (supports variable public input length, e.g., 3)
        if (circuitKeys[CircuitType.SENSOR_DATA].isSet) {
            return _baseVerify(circuitKeys[CircuitType.SENSOR_DATA], a, b, c, input);
        }
        // Fallback to legacy snarkjs verifier path which expects exactly 8 public inputs
        if (input.length != 8) return false;
        uint[8] memory pub;
        for (uint i=0;i<8;i++){ pub[i]=input[i]; }
        bytes memory data = abi.encodeWithSignature(
            "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[8])",
            a, b, c, pub
        );
        (bool ok, bytes memory ret) = address(this).staticcall(data);
        if (!ok || ret.length == 0) return false;
        return abi.decode(ret, (bool));
    }
}
