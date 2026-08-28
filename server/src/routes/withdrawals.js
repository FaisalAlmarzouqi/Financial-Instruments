const express = require("express");
const {
  getAssetBySymbol,
  getUserByWallet,
  getAvailableBalance,
  adjustBalance,
} = require("../db/helpers");
const { operateWithdrawal, withdrawBond, bondsInVaultCustody } = require("../chain");

const router = express.Router();

/// Pays out a user's on-platform balance back to their own wallet on-chain. The
/// no-pending-orders / sufficient-funds check is the DB "available" column itself:
/// funds only sit in `available` when they are not reserved behind an open order.
router.post("/", async (req, res) => {
  const { walletAddress, symbol, amount } = req.body;
  const user = getUserByWallet(walletAddress || "");
  if (!user) return res.status(403).json({ error: "Wallet is not registered" });
  const asset = getAssetBySymbol((symbol || "").toUpperCase());
  if (!asset) return res.status(404).json({ error: "Unknown asset" });

  const requested = asset.type === "bond" ? Math.floor(Number(amount) || 1) : Number(amount);
  if (!(requested > 0)) return res.status(400).json({ error: "amount must be positive" });

  const available = getAvailableBalance(user.id, asset.id);
  if (requested > available + 1e-9) {
    return res.status(400).json({ error: "Amount exceeds available (non-reserved) balance" });
  }

  try {
    if (asset.type === "bond") {
      const serials = await bondsInVaultCustody(walletAddress, asset.contract_address);
      if (serials.length < requested) {
        return res.status(409).json({ error: "On-chain custody out of sync with DB balance" });
      }
      const txHashes = [];
      for (let i = 0; i < requested; i++) {
        const receipt = await withdrawBond(walletAddress, asset.contract_address, serials[i]);
        txHashes.push(receipt.hash);
      }
      adjustBalance(user.id, asset.id, -requested, 0);
      return res.json({ withdrawn: requested, txHashes });
    }

    const receipt = await operateWithdrawal(walletAddress, asset.contract_address, requested);
    adjustBalance(user.id, asset.id, -requested, 0);
    res.json({ withdrawn: requested, txHash: receipt.hash });
  } catch (err) {
    res.status(500).json({ error: `Withdrawal failed: ${err.message}` });
  }
});

module.exports = router;
