const express = require("express");
const { db, getAssetBySymbol, getUserByWallet, adjustBalance } = require("../db/helpers");
const { verifyDepositTx } = require("../chain");

const router = express.Router();

const alreadyProcessed = db.prepare("SELECT 1 FROM processed_deposits WHERE tx_hash = ?");
const markProcessed = db.prepare(
  "INSERT INTO processed_deposits (tx_hash, user_id, asset_id, amount, created_at) VALUES (?, ?, ?, ?, ?)"
);

const creditDeposit = db.transaction((txHash, userId, assetId, amount) => {
  if (alreadyProcessed.get(txHash)) throw new Error("ALREADY_PROCESSED");
  adjustBalance(userId, assetId, amount, 0);
  markProcessed.run(txHash, userId, assetId, amount, Date.now());
});

/// Confirms an on-chain deposit into the Vault (triggered from the UI after the user's
/// approve+deposit transaction confirms) and credits the platform's DB ledger.
router.post("/verify", async (req, res) => {
  const { walletAddress, symbol, txHash } = req.body;
  const user = getUserByWallet(walletAddress || "");
  if (!user) return res.status(403).json({ error: "Wallet is not registered" });
  const asset = getAssetBySymbol((symbol || "").toUpperCase());
  if (!asset) return res.status(404).json({ error: "Unknown asset" });
  if (!txHash) return res.status(400).json({ error: "txHash is required" });

  const onChain = await verifyDepositTx(txHash, walletAddress, asset.type);
  if (!onChain) {
    return res.status(400).json({ error: "No matching Deposit event for this wallet/tx" });
  }
  const amount = asset.type === "bond" ? 1 : onChain.amount;

  try {
    creditDeposit(txHash, user.id, asset.id, amount);
  } catch (err) {
    if (err.message === "ALREADY_PROCESSED") {
      return res.status(409).json({ error: "This deposit has already been credited" });
    }
    throw err;
  }

  res.json({ credited: amount, symbol: asset.symbol });
});

module.exports = router;
