const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "platform.sqlite"));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

/// node:sqlite's DatabaseSync has no built-in `.transaction()` helper (unlike
/// better-sqlite3) — this wraps a function in BEGIN/COMMIT/ROLLBACK the same way,
/// using SAVEPOINTs for nested calls (e.g. adjustBalance() called from inside
/// placeLimitOrder()'s own transaction) since SQLite rejects a nested BEGIN.
let transactionDepth = 0;
db.transaction = function transaction(fn) {
  return (...args) => {
    const depth = transactionDepth++;
    const savepoint = `sp_${depth}`;
    db.exec(depth === 0 ? "BEGIN" : `SAVEPOINT ${savepoint}`);
    try {
      const result = fn(...args);
      db.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`);
      transactionDepth--;
      return result;
    } catch (err) {
      db.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${savepoint}`);
      transactionDepth--;
      throw err;
    }
  };
};

db.exec(`
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('stablecoin','share','bond')),
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 18,
  default_price REAL NOT NULL,
  issuer_address TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  passport_image_path TEXT NOT NULL,
  registered_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS balances (
  user_id INTEGER NOT NULL REFERENCES users(id),
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  available REAL NOT NULL DEFAULT 0,
  reserved REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, asset_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  side TEXT NOT NULL CHECK(side IN ('buy','sell')),
  order_type TEXT NOT NULL CHECK(order_type IN ('limit','market')),
  price REAL,
  quantity REAL NOT NULL,
  remaining_quantity REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','partially_filled','filled','cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS processed_deposits (
  tx_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  amount REAL NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  buy_order_id INTEGER REFERENCES orders(id),
  sell_order_id INTEGER NOT NULL REFERENCES orders(id),
  price REAL NOT NULL,
  quantity REAL NOT NULL,
  executed_at INTEGER NOT NULL
);
`);

module.exports = db;
