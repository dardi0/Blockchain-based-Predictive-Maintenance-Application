console.log("--- Loading hardhat.config.js ---");
require("@matterlabs/hardhat-zksync-solc");
require("@matterlabs/hardhat-zksync-deploy");
require("@matterlabs/hardhat-zksync-verify");
require("@matterlabs/hardhat-zksync-ethers");
require('dotenv').config({ quiet: true });

module.exports = {
  zksolc: {
    version: "1.4.1",
    compilerSource: "binary",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  defaultNetwork: "hardhat",

  networks: {
    hardhat: {
      zksync: false,  // Disable zkSync for local testing
      allowUnlimitedContractSize: true,  // Allow large contracts for testing
    },
    zkSyncSepolia: {
      url: process.env.ZKSYNC_ERA_RPC_URL,   // Infura URL
      ethNetwork: "sepolia",                 // L1 bağlantısı
      zksync: true,
      accounts: [process.env.CONTRACT_OWNER_PRIVATE_KEY || process.env.PRIVATE_KEY],
      verifyURL: "https://explorer.sepolia.era.zksync.dev/contract_verification",
    },
  },

  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,  // Low runs value for smaller bytecode
      },
      viaIR: true,  // Enable IR-based compilation for complex contracts
    },
  },
};
