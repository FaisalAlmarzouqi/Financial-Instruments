const express = require("express");
const { ethers } = require("ethers");
const { listAssets, getUserByWallet, listBalancesForUser } = require("../db/helpers");
const { getOnChainBalance } = require("../chain");

const router = express.Router();

router.get("/:wallet", async (req, res) => {
  const wallet = req.params.wallet;
  if (!ethers.isAddress(wallet)) return res.status(400).json({ error: "Invalid address" });

  const user = getUserByWallet(wallet);
  const balanceRows = user ? listBalancesForUser(user.id) : [];
  const byAssetId = new Map(balanceRows.map((b) => [b.asset_id, b]));

  const assets = listAssets();
  const portfolio = await Promise.all(
    assets.map(async (asset) => {
      const row = byAssetId.get(asset.id);
      const onPlatform = row ? row.available + row.reserved : 0;
      const onChain = await getOnChainBalance(asset.type, asset.contract_address, wallet);
      return {
        symbol: asset.symbol,
        name: asset.name,
        type: asset.type,
        onPlatform,
        onPlatformAvailable: row ? row.available : 0,
        onChain,
        totalAvailable: onPlatform + onChain,
      };
    })
  );

  res.json({ registered: Boolean(user), portfolio });
});

module.exports = router;
