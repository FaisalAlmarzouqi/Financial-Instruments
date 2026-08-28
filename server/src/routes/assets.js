const express = require("express");
const { db, listAssets, getAssetBySymbol } = require("../db/helpers");

const router = express.Router();

const lastTradeStmt = db.prepare(
  "SELECT price, executed_at FROM trades WHERE asset_id = ? ORDER BY executed_at DESC LIMIT 1"
);
const priceHistoryStmt = db.prepare(
  "SELECT price, quantity, executed_at FROM trades WHERE asset_id = ? ORDER BY executed_at ASC"
);
const bestAskStmt = db.prepare(
  "SELECT price FROM orders WHERE asset_id = ? AND side = 'sell' AND order_type = 'limit' AND status IN ('open','partially_filled') ORDER BY price ASC LIMIT 1"
);
const bestBidStmt = db.prepare(
  "SELECT price FROM orders WHERE asset_id = ? AND side = 'buy' AND order_type = 'limit' AND status IN ('open','partially_filled') ORDER BY price DESC LIMIT 1"
);

function currentPrice(asset) {
  const last = lastTradeStmt.get(asset.id);
  return last ? last.price : asset.default_price;
}

router.get("/", (req, res) => {
  const assets = listAssets().map((asset) => ({
    ...asset,
    currentPrice: currentPrice(asset),
  }));
  res.json(assets);
});

router.get("/:symbol", (req, res) => {
  const asset = getAssetBySymbol(req.params.symbol.toUpperCase());
  if (!asset) return res.status(404).json({ error: "Unknown asset" });
  res.json({
    ...asset,
    currentPrice: currentPrice(asset),
    bestAsk: bestAskStmt.get(asset.id)?.price ?? null, // lowest sell price = market buy price
    bestBid: bestBidStmt.get(asset.id)?.price ?? null, // highest buy price = market sell price
  });
});

router.get("/:symbol/price-history", (req, res) => {
  const asset = getAssetBySymbol(req.params.symbol.toUpperCase());
  if (!asset) return res.status(404).json({ error: "Unknown asset" });

  const trades = priceHistoryStmt.all(asset.id);
  if (trades.length === 0) {
    const now = Date.now();
    return res.json([
      { price: asset.default_price, executed_at: asset.created_at },
      { price: asset.default_price, executed_at: now },
    ]);
  }
  res.json(trades);
});

module.exports = router;
