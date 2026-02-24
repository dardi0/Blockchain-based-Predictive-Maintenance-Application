import { ethers } from 'ethers';

const ZKSYNC_SEPOLIA_CHAIN_ID = '0x12c'; // 300
const ZKSYNC_SEPOLIA_RPC = 'https://sepolia.era.zksync.dev';
const EXPLORER_URL = 'https://sepolia.explorer.zksync.io';

// Event Signature Hashes for filtering receipt logs correctly
const SENSOR_EVENT_SIG = '0x722eaae1c7136e0bbab7bbe397c8a2b8b80d67292f578be4bc60e29a89857417';
const PREDICTION_EVENT_SIG = '0xf1183b7142d1003ff6e3ecde9cd377482d3be371c092e1c962684374efec4d24';

export interface BlockchainResponse {
    success: boolean;
    txHash?: string;
    error?: string;
    receipt?: any;
    proofId?: string | null;
}

export const blockchainService = {
    // Check if MetaMask is installed
    isMetaMaskInstalled: (): boolean => {
        return typeof window !== 'undefined' && !!(window as any).ethereum;
    },

    // Connect to wallet
    connectWallet: async (): Promise<string | null> => {
        if (!blockchainService.isMetaMaskInstalled()) {
            throw new Error("MetaMask is not installed!");
        }

        try {
            const accounts = await (window as any).ethereum.request({
                method: 'eth_requestAccounts'
            });
            return accounts[0];
        } catch (error: any) {
            console.warn("User rejected connection:", error);
            throw new Error("User rejected connection");
        }
    },

    // Switch to zkSync Sepolia network
    switchToZkSync: async () => {
        if (!blockchainService.isMetaMaskInstalled()) return;

        try {
            await (window as any).ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: ZKSYNC_SEPOLIA_CHAIN_ID }],
            });
        } catch (switchError: any) {
            // This error code indicates that the chain has not been added to MetaMask.
            if (switchError.code === 4902) {
                try {
                    await (window as any).ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [
                            {
                                chainId: ZKSYNC_SEPOLIA_CHAIN_ID,
                                chainName: 'zkSync Sepolia Testnet',
                                rpcUrls: [ZKSYNC_SEPOLIA_RPC],
                                blockExplorerUrls: [EXPLORER_URL],
                                nativeCurrency: {
                                    name: 'Ethereum',
                                    symbol: 'ETH',
                                    decimals: 18
                                }
                            },
                        ],
                    });
                } catch (addError) {
                    console.error("Failed to add zkSync network:", addError);
                    throw new Error("Failed to add zkSync network");
                }
            } else {
                console.error("Failed to switch network:", switchError);
                throw new Error("Failed to switch network");
            }
        }
    },

    // Load contract
    getContract: async (address: string) => {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();

        try {
            const response = await fetch('/contracts/PdMSystemHybrid.json');
            const artifact = await response.json();
            return new ethers.Contract(address, artifact.abi, signer);
        } catch (error) {
            console.error("Failed to load contract ABI:", error);
            throw new Error("Failed to load contract ABI");
        }
    },

    // Submit Proof Transaction
    submitSensorDataProof: async (
        contractAddress: string,
        proofData: any
    ): Promise<BlockchainResponse> => {
        try {
            await blockchainService.switchToZkSync();
            const contract = await blockchainService.getContract(contractAddress);

            // Extract data from proofData (which comes from backend)
            // Backend should return everything formatted for the contract call
            // expected format:
            // {
            //   machine_id: number,
            //   data_hash_bytes: string (hex),
            //   commitment_hash_bytes: string (hex),
            //   storage_location_bytes: string (hex),
            //   data_type: number (1),
            //   a: [uint, uint],
            //   b: [[uint, uint], [uint, uint]],
            //   c: [uint, uint],
            //   public_inputs: [uint, ...]
            // }

            console.log("Submitting proof to blockchain...", proofData);
            console.log("Type of a[0]:", typeof proofData.a[0], proofData.a[0]);
            console.log("Type of public_inputs[0]:", typeof proofData.public_inputs[0], proofData.public_inputs[0]);

            // Helper to handle scientific notation strings e.g. "1.3e+76" -> "13000..."
            const safeStringify = (val: any): string => {
                try {
                    if (typeof val === 'string') {
                        // If it's a scientific notation string, try to expand it safely
                        if (val.includes('e+')) {
                            console.warn("⚠️ Warning: Scientific notation string detected in proof data:", val);
                            return BigInt(Number(val)).toString(); // Potential precision loss here
                        }
                        return val;
                    }
                    if (typeof val === 'number') {
                        if (!Number.isSafeInteger(val)) {
                            console.warn("⚠️ CRITICAL: Precision loss likely! Number > MAX_SAFE_INTEGER passed:", val);
                        }
                        return BigInt(val).toString();
                    }
                    return String(val);
                } catch (e) {
                    console.warn(`Failed to safeStringify value: ${val}`, e);
                    return String(val);
                }
            };

            const safeProofData = {
                ...proofData,
                a: proofData.a.map((x: any) => safeStringify(x)),
                b: proofData.b.map((row: any) => row.map((x: any) => safeStringify(x))),
                c: proofData.c.map((x: any) => safeStringify(x)),
                public_inputs: proofData.public_inputs.map((x: any) => safeStringify(x))
            };

            const tx = await contract.submitSensorDataProof(
                safeProofData.machine_id,
                safeProofData.data_hash_bytes,
                safeProofData.commitment_hash_bytes,
                safeProofData.storage_location_bytes,
                1, // data_type always 1 for now
                safeProofData.a,
                safeProofData.b,
                safeProofData.c,
                safeProofData.public_inputs
            );

            console.log("Transaction sent:", tx.hash);
            console.log("Waiting for transaction confirmation...");
            const receipt = await tx.wait(); // Wait for confirmation
            console.log("Transaction confirmed! Receipt:", receipt);
            console.log("Transaction status:", receipt.status);

            // Parse logs to find proofId (Topic 1 of SensorDataProofSubmitted event)
            let proofId = null;
            if (receipt.logs) {
                // We look for the event. The topic[0] is the event signature hash.
                // Assuming it's the first log or we iterate.
                // Simplified: Just grab the first topic of the first log if available and length > 2
                // Or better: use interface parsing if possible.
                // For now, let's try to parse manually or just assume it's in the logs.

                try {
                    // SensorDataProofSubmitted(uint256 indexed proofId, ...)
                    // We only want the specific event from our contract
                    for (const log of receipt.logs) {
                        if (log.topics && log.topics[0] === SENSOR_EVENT_SIG) {
                            proofId = BigInt(log.topics[1]).toString(); // proofId is the first indexed param (Topic 1)
                            break;
                        }
                    }
                } catch (e) {
                    console.warn("Could not parse proofId from logs", e);
                }
            }

            console.log("Parsed Proof ID:", proofId);

            return {
                success: true,
                txHash: tx.hash,
                receipt: receipt,
                proofId: proofId // Return the proof ID
            };

        } catch (error: any) {
            console.error("Blockchain submission error:", error);
            // Extract readable error if possible
            let errorMessage = error.message || "Unknown blockchain error";
            if (error.reason) errorMessage = error.reason;
            if (error.data?.message) errorMessage = error.data.message;

            return {
                success: false,
                error: errorMessage
            };
        }
    },

    // Submit Prediction Proof Transaction
    submitPredictionProof: async (
        contractAddress: string,
        proofData: any
    ): Promise<BlockchainResponse> => {
        try {
            await blockchainService.switchToZkSync();
            const contract = await blockchainService.getContract(contractAddress);

            console.log("Submitting prediction proof to blockchain...", proofData);

            // Convert numbers to strings to be safe with BigInt logic
            const safeStringify = (val: any): string => {
                try {
                    if (Array.isArray(val)) {
                        // This shouldn't happen for atomic values but for safety
                        return val.map(safeStringify) as any;
                    }
                    if (typeof val === 'string' && val.includes('e+')) {
                        return BigInt(Number(val)).toString();
                    }
                    if (typeof val === 'number') {
                        return BigInt(val).toString();
                    }
                    return String(val);
                } catch (e) {
                    return String(val);
                }
            };

            // proofData structure:
            // submitPredictionProof(dataProofId, predictionHash, modelCommitment, prediction, confidence, a, b, c, publicInputs)

            const tx = await contract.submitPredictionProof(
                safeStringify(proofData.dataProofId),
                proofData.predictionHash,
                proofData.modelCommitment,
                safeStringify(proofData.prediction),
                safeStringify(proofData.confidence),
                proofData.a,
                proofData.b,
                proofData.c,
                proofData.publicInputs
            );

            console.log("Prediction Proof Transaction sent:", tx.hash);
            console.log("Waiting for confirmation...");
            const receipt = await tx.wait();
            console.log("Prediction Proof Confirmed!", receipt);

            // Parse Proof ID (PredictionProofSubmitted event)
            let proofId = null;
            if (receipt.logs) {
                try {
                    // PredictionProofSubmitted(uint256 indexed proofId, ...)
                    for (const log of receipt.logs) {
                        if (log.topics && log.topics[0] === PREDICTION_EVENT_SIG) {
                            proofId = BigInt(log.topics[1]).toString();
                            break;
                        }
                    }
                } catch (e) {
                    console.warn("Could not parse prediction proofId", e);
                }
            }

            return {
                success: true,
                txHash: tx.hash,
                receipt: receipt,
                proofId: proofId
            };

        } catch (error: any) {
            console.error("Blockchain prediction submission error:", error);
            let errorMessage = error.message || "Unknown error";
            if (error.reason) errorMessage = error.reason;
            return {
                success: false,
                error: errorMessage
            };
        }
    }
};
