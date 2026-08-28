const express = require("express");
const { deployments } = require("../chain");
const { RPC_URL, CHAIN_ID } = require("../config");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    vaultAddress: deployments.vault,
    rpcUrl: RPC_URL,
    chainId: CHAIN_ID,
  });
});

module.exports = router;
