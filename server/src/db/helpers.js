const db = require("./index");

const getAssetBySymbol = db.prepare("SELECT * FROM assets WHERE symbol = ?");
const getAssetById = db.prepare("SELECT * FROM assets WHERE id = ?");
const listAssetsStmt = db.prepare("SELECT * FROM assets ORDER BY id");
const getUserByWallet = db.prepare("SELECT * FROM users WHERE wallet_address = ?");
const getUserById = db.prepare("SELECT * FROM users WHERE id = ?");
const insertUser = db.prepare(
  "INSERT INTO users (wallet_address, legal_name, passport_image_path, registered_at) VALUES (?, ?, ?, ?)"
);

const ensureBalanceRow = db.prepare(
  "INSERT OR IGNORE INTO balances (user_id, asset_id, available, reserved) VALUES (?, ?, 0, 0)"
);
const getBalanceRow = db.prepare("SELECT * FROM balances WHERE user_id = ? AND asset_id = ?");
const listBalancesForUser = db.prepare(
  `SELECT b.*, a.symbol, a.name, a.type, a.contract_address, a.default_price
   FROM balances b JOIN assets a ON a.id = b.asset_id
   WHERE b.user_id = ?`
);
const updateBalanceRow = db.prepare(
  "UPDATE balances SET available = ?, reserved = ? WHERE user_id = ? AND asset_id = ?"
);

function getOrCreateBalance(userId, assetId) {
  ensureBalanceRow.run(userId, assetId);
  return getBalanceRow.get(userId, assetId);
}

/// Applies deltas to a user's available/reserved balance for one asset, atomically.
/// Throws if the result would go negative (insufficient funds).
const adjustBalance = db.transaction((userId, assetId, availableDelta, reservedDelta) => {
  const row = getOrCreateBalance(userId, assetId);
  const available = row.available + availableDelta;
  const reserved = row.reserved + reservedDelta;
  if (available < -1e-9 || reserved < -1e-9) {
    throw new Error("Insufficient balance");
  }
  updateBalanceRow.run(Math.max(available, 0), Math.max(reserved, 0), userId, assetId);
  return { available, reserved };
});

module.exports = {
  db,
  getAssetBySymbol: (symbol) => getAssetBySymbol.get(symbol),
  getAssetById: (id) => getAssetById.get(id),
  listAssets: () => listAssetsStmt.all(),
  getUserByWallet: (wallet) => getUserByWallet.get(wallet.toLowerCase()),
  getUserById: (id) => getUserById.get(id),
  createUser: (wallet, legalName, passportPath) =>
    insertUser.run(wallet.toLowerCase(), legalName, passportPath, Date.now()),
  getOrCreateBalance,
  getAvailableBalance: (userId, assetId) => getOrCreateBalance(userId, assetId).available,
  listBalancesForUser: (userId) => listBalancesForUser.all(userId),
  adjustBalance,
};
