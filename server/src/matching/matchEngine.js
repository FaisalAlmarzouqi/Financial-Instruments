const { db, getAssetBySymbol, adjustBalance } = require("../db/helpers");

const insertOrder = db.prepare(`
  INSERT INTO orders (user_id, asset_id, side, order_type, price, quantity, remaining_quantity, status, created_at, updated_at)
  VALUES (@user_id, @asset_id, @side, @order_type, @price, @quantity, @remaining_quantity, 'open', @now, @now)
`);
const updateOrderFill = db.prepare(`
  UPDATE orders SET remaining_quantity = ?, status = ?, updated_at = ? WHERE id = ?
`);
const insertTrade = db.prepare(`
  INSERT INTO trades (asset_id, buy_order_id, sell_order_id, price, quantity, executed_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const restingOppositeOrders = db.prepare(`
  SELECT * FROM orders
  WHERE asset_id = ? AND side = ? AND order_type = 'limit' AND status IN ('open', 'partially_filled')
  ORDER BY price ASC, created_at ASC
`);
const restingOppositeOrdersDesc = db.prepare(`
  SELECT * FROM orders
  WHERE asset_id = ? AND side = ? AND order_type = 'limit' AND status IN ('open', 'partially_filled')
  ORDER BY price DESC, created_at ASC
`);
const walletById = db.prepare("SELECT wallet_address FROM users WHERE id = ?");
function walletOf(userId) {
  return walletById.get(userId).wallet_address;
}

function trgAsset() {
  const trg = getAssetBySymbol("TRG");
  if (!trg) throw new Error("TRG asset not seeded yet");
  return trg;
}

function fillStatus(remaining, original) {
  if (remaining <= 1e-9) return "filled";
  if (remaining < original) return "partially_filled";
  return "open";
}

/// Places a resting limit order, reserving the offered side's balance up front.
const placeLimitOrder = db.transaction(({ userId, asset, side, quantity, price }) => {
  const trg = trgAsset();
  if (side === "sell") {
    adjustBalance(userId, asset.id, -quantity, quantity); // move asset available -> reserved
  } else {
    adjustBalance(userId, trg.id, -quantity * price, quantity * price); // reserve TRG cost
  }
  const now = Date.now();
  const info = insertOrder.run({
    user_id: userId,
    asset_id: asset.id,
    side,
    order_type: "limit",
    price,
    quantity,
    remaining_quantity: quantity,
    now,
  });
  return { id: info.lastInsertRowid };
});

/// Executes a market order against the best-priced resting limit orders (price-time
/// priority), settling both sides' balances trade by trade.
const executeMarketOrder = db.transaction(({ userId, asset, side, quantity }) => {
  const trg = trgAsset();
  const now = Date.now();
  const marketOrderId = insertOrder.run({
    user_id: userId,
    asset_id: asset.id,
    side,
    order_type: "market",
    price: null,
    quantity,
    remaining_quantity: quantity,
    now,
  }).lastInsertRowid;

  const opposite = side === "buy" ? "sell" : "buy";
  const book = (opposite === "sell" ? restingOppositeOrders : restingOppositeOrdersDesc).all(asset.id, opposite);

  let remaining = quantity;
  const trades = [];

  for (const resting of book) {
    if (remaining <= 1e-9) break;
    const fillQty = Math.min(remaining, resting.remaining_quantity);
    const price = resting.price;
    const cost = fillQty * price;

    const buyerId = side === "buy" ? userId : resting.user_id;
    const sellerId = side === "buy" ? resting.user_id : userId;
    adjustBalance(buyerId, trg.id, -cost, 0);
    adjustBalance(buyerId, asset.id, fillQty, 0);
    adjustBalance(sellerId, asset.id, 0, -fillQty);
    adjustBalance(sellerId, trg.id, cost, 0);

    const restingRemaining = resting.remaining_quantity - fillQty;
    updateOrderFill.run(restingRemaining, fillStatus(restingRemaining, resting.quantity), now, resting.id);

    const buyOrderId = side === "buy" ? marketOrderId : resting.id;
    const sellOrderId = side === "buy" ? resting.id : marketOrderId;
    insertTrade.run(asset.id, buyOrderId, sellOrderId, price, fillQty, now);
    trades.push({
      price,
      quantity: fillQty,
      counterpartyOrderId: resting.id,
      buyerWallet: walletOf(buyerId),
      sellerWallet: walletOf(sellerId),
      assetAmount: fillQty,
      trgAmount: cost,
    });

    remaining -= fillQty;
  }

  const filled = quantity - remaining;
  updateOrderFill.run(remaining, fillStatus(remaining, quantity), now, marketOrderId);

  return { orderId: marketOrderId, filled, remaining, trades };
});

module.exports = { placeLimitOrder, executeMarketOrder };
