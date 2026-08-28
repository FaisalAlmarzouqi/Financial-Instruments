const express = require("express");
const { ethers } = require("ethers");
const { db, getAssetBySymbol, getUserByWallet } = require("../db/helpers");
const { placeLimitOrder, executeMarketOrder } = require("../matching/matchEngine");
const { settleErc20Trade, settleBondTrade } = require("../chain");

const router = express.Router();

const listOrdersStmt = db.prepare(`
  SELECT o.*, u.wallet_address FROM orders o
  JOIN users u ON u.id = o.user_id
  WHERE o.asset_id = ? AND o.status IN ('open', 'partially_filled')
  ORDER BY o.side, o.price ASC, o.created_at ASC
`);

function requireTradableAsset(symbol, res) {
  const asset = getAssetBySymbol(symbol.toUpperCase());
  if (!asset) {
    res.status(404).json({ error: "Unknown asset" });
    return null;
  }
  if (asset.type === "stablecoin") {
    res.status(400).json({ error: "TRG cannot be traded against itself" });
    return null;
  }
  return asset;
}

function requireUser(walletAddress, res) {
  if (!walletAddress || !ethers.isAddress(walletAddress)) {
    res.status(400).json({ error: "Valid walletAddress is required" });
    return null;
  }
  const user = getUserByWallet(walletAddress);
  if (!user) {
    res.status(403).json({ error: "Wallet is not registered" });
    return null;
  }
  return user;
}

router.get("/", (req, res) => {
  const asset = requireTradableAsset(req.query.symbol || "", res);
  if (!asset) return;
  const orders = listOrdersStmt.all(asset.id).map((o) => ({
    id: o.id,
    walletAddress: o.wallet_address,
    side: o.side,
    price: o.price,
    quantity: o.quantity,
    remainingQuantity: o.remaining_quantity,
    status: o.status,
    createdAt: o.created_at,
  }));
  res.json(orders);
});

router.post("/", (req, res) => {
  const { walletAddress, symbol, side, quantity, price } = req.body;
  const user = requireUser(walletAddress, res);
  if (!user) return;
  const asset = requireTradableAsset(symbol || "", res);
  if (!asset) return;
  if (!["buy", "sell"].includes(side)) return res.status(400).json({ error: "side must be buy or sell" });
  if (!(quantity > 0)) return res.status(400).json({ error: "quantity must be positive" });
  if (!(price > 0)) return res.status(400).json({ error: "price must be positive" });

  try {
    const order = placeLimitOrder({ userId: user.id, asset, side, quantity, price });
    res.status(201).json({ id: order.id });
  } catch (err) {
    res.status(400).json({ error: err.message.includes("Insufficient") ? "Insufficient balance" : err.message });
  }
});

/// After the matching engine settles a trade in the DB, the Vault's on-chain ledger
/// must be updated to match — otherwise a buyer's DB balance says they own something
/// the Vault never actually reassigned to them, and their later withdrawal reverts.
async function settleOnChain(asset, trg, trades) {
  for (const trade of trades) {
    if (asset.type === "bond") {
      await settleBondTrade(trade.sellerWallet, trade.buyerWallet, asset.contract_address, Math.round(trade.assetAmount));
    } else {
      await settleErc20Trade(trade.sellerWallet, trade.buyerWallet, asset.contract_address, trade.assetAmount);
    }
    await settleErc20Trade(trade.buyerWallet, trade.sellerWallet, trg.contract_address, trade.trgAmount);
  }
}

router.post("/market", async (req, res) => {
  const { walletAddress, symbol, side, quantity } = req.body;
  const user = requireUser(walletAddress, res);
  if (!user) return;
  const asset = requireTradableAsset(symbol || "", res);
  if (!asset) return;
  if (!["buy", "sell"].includes(side)) return res.status(400).json({ error: "side must be buy or sell" });
  if (!(quantity > 0)) return res.status(400).json({ error: "quantity must be positive" });

  let result;
  try {
    result = executeMarketOrder({ userId: user.id, asset, side, quantity });
    if (result.filled <= 1e-9) {
      return res.status(400).json({ error: "No resting orders available to match against" });
    }
  } catch (err) {
    return res.status(400).json({ error: err.message.includes("Insufficient") ? "Insufficient balance" : err.message });
  }

  try {
    const trg = getAssetBySymbol("TRG");
    await settleOnChain(asset, trg, result.trades);
    res.status(201).json(result);
  } catch (err) {
    // The DB trade is already committed at this point; on-chain settlement failed
    // (e.g. RPC hiccup). Surface it clearly — the DB and Vault are now out of sync
    // for this trade and need manual reconciliation in this demo setup.
    res.status(500).json({
      error: `Trade recorded in the database but on-chain settlement failed: ${err.message}`,
      result,
    });
  }
});

module.exports = router;
