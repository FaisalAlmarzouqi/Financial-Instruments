require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    privatenet: {
      url: process.env.RPC_URL || "http://127.0.0.1:8545",
      chainId: process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 4218,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: 0,
    },
  },
};
