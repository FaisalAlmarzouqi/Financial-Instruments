const db = require("./index");
const { loadDeployments } = require("../config");

const upsert = db.prepare(`
  INSERT INTO assets (type, symbol, name, contract_address, decimals, default_price, issuer_address, created_at)
  VALUES (@type, @symbol, @name, @contract_address, 18, @default_price, @issuer_address, @created_at)
  ON CONFLICT(symbol) DO UPDATE SET
    contract_address = excluded.contract_address,
    issuer_address = excluded.issuer_address,
    default_price = excluded.default_price
`);

const NAMES = {
  TRG: "Triangle",
  CLV: "Clove Company",
  ROO: "Rooibos Limited",
  GOV: "Government Bonds",
};

function seedAssetsFromDeployments() {
  const deployments = loadDeployments();
  if (!deployments.assets) {
    console.warn("No assets in deployments/deployed-addresses.json yet — run the populate script first.");
    return;
  }
  const now = Date.now();
  const insertMany = db.transaction((assets) => {
    for (const [symbol, info] of Object.entries(assets)) {
      upsert.run({
        type: info.type,
        symbol,
        name: NAMES[symbol] || symbol,
        contract_address: info.address,
        default_price: info.defaultPrice,
        issuer_address: info.issuer,
        created_at: now,
      });
    }
  });
  insertMany(deployments.assets);
  console.log(`Seeded ${Object.keys(deployments.assets).length} assets from deployments file.`);
}

module.exports = { seedAssetsFromDeployments };
