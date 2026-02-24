// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity ^0.8.20;

contract SensorDataVerifier3 {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 21339814134635918043715183308821067913673704016195140377083391436207761499388;
    uint256 constant alphay  = 18396397960406460263684748582427848766251374685859553197471410359874232086073;
    uint256 constant betax1  = 13131765436705689350091509395361597512374749302748958422346268496626363717026;
    uint256 constant betax2  = 3390645320962890469411220673269092813853605425328202633366541161835893796612;
    uint256 constant betay1  = 6976235140046857320878577154791021017432839679892854738656924056075877074198;
    uint256 constant betay2  = 11427394024346191301820981134354104572320447102621800774745680039186382834409;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 3687657317814544787290677065926036341712108064815776192772842377743832486936;
    uint256 constant deltax2 = 20889342796612640664230799824208129271455842688574999158146164397956405207041;
    uint256 constant deltay1 = 10848612649553578626428395924957320912651189526282275166109906092070098603865;
    uint256 constant deltay2 = 5123857537056526038104970340531654177669609172456932495135211381311998193642;

    
    uint256 constant IC0x = 16232471168520182923163587808912768251371742923344243154157036663715695231933;
    uint256 constant IC0y = 14439208790731208075520435716432270572612688062902760192869300317231657042205;
    
    uint256 constant IC1x = 654595490832797179141492297380539998165802826122061119705673225506065464609;
    uint256 constant IC1y = 20752707530608611443802442045438828041314918273798814857108181410905633737554;
    
    uint256 constant IC2x = 6832763857669100848640530504804266728114400698696659183643208697496441250485;
    uint256 constant IC2y = 13674255148308434624029833160279724712084217907357268903030895631283321068617;
    
    uint256 constant IC3x = 10255295587565243533046259951457948125887739960404202569466020829192161338424;
    uint256 constant IC3y = 20489633406055494585619634259936345328943704433440862491074042704698648197287;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[3] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2 - zkSync Era: imaginary coordinate first
                mstore(add(_pPairing, 256), betax2)
                mstore(add(_pPairing, 288), betax1)
                mstore(add(_pPairing, 320), betay2)
                mstore(add(_pPairing, 352), betay1)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2 - zkSync Era: imaginary coordinate first
                mstore(add(_pPairing, 448), gammax2)
                mstore(add(_pPairing, 480), gammax1)
                mstore(add(_pPairing, 512), gammay2)
                mstore(add(_pPairing, 544), gammay1)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2 - zkSync Era: imaginary coordinate first
                mstore(add(_pPairing, 640), deltax2)
                mstore(add(_pPairing, 672), deltax1)
                mstore(add(_pPairing, 704), deltay2)
                mstore(add(_pPairing, 736), deltay1)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
