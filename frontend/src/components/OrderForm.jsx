import { useState } from "react";
import { useWallet } from "../lib/wallet";
import { api } from "../lib/api";
import { getSigner, depositErc20, depositBond, firstOwnedBondSerial } from "../lib/chain";

/// Makes sure the connected wallet has at least `neededAmount` of `asset` sitting in
/// their on-platform (Vault-custodied) available balance, depositing the shortfall
/// on-chain (approve + deposit) and confirming it with the server if not.
async function ensureOnPlatformBalance({ address, asset, neededAmount, vaultAddress, signer }) {
  const portfolio = await api.getPortfolio(address);
  const row = portfolio.portfolio.find((p) => p.symbol === asset.symbol);
  const shortfall = neededAmount - (row?.onPlatformAvailable ?? 0);
  if (shortfall <= 1e-9) return;

  if (asset.type === "bond") {
    const bondsNeeded = Math.ceil(shortfall);
    for (let i = 0; i < bondsNeeded; i++) {
      const serial = await firstOwnedBondSerial(signer, asset.contract_address, address);
      const txHash = await depositBond(signer, asset.contract_address, vaultAddress, serial);
      await api.verifyDeposit({ walletAddress: address, symbol: asset.symbol, txHash });
    }
  } else {
    const txHash = await depositErc20(signer, asset.contract_address, vaultAddress, shortfall);
    await api.verifyDeposit({ walletAddress: address, symbol: asset.symbol, txHash });
  }
}

export default function OrderForm({ asset, trgAsset, vaultAddress, onChanged }) {
  const { address, user } = useWallet();
  const [side, setSide] = useState("sell");
  const [mode, setMode] = useState("limit");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const disabled = !address || !user || busy;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setStatus("");
    const qty = Number(quantity);
    if (!(qty > 0)) return setError("Quantity must be positive");
    if (mode === "limit" && !(Number(price) > 0)) return setError("Price must be positive");

    setBusy(true);
    try {
      const signer = await getSigner();

      if (mode === "limit") {
        setStatus("Depositing collateral on-chain (this asks MetaMask to approve, then deposit)...");
        if (side === "sell") {
          await ensureOnPlatformBalance({ address, asset, neededAmount: qty, vaultAddress, signer });
        } else {
          await ensureOnPlatformBalance({
            address,
            asset: trgAsset,
            neededAmount: qty * Number(price),
            vaultAddress,
            signer,
          });
        }
        setStatus("Placing order...");
        await api.placeLimitOrder({ walletAddress: address, symbol: asset.symbol, side, quantity: qty, price: Number(price) });
      } else {
        setStatus("Ensuring you hold enough on the platform to settle at market price...");
        const current = await api.getAsset(asset.symbol);
        const marketPrice = side === "buy" ? current.bestAsk : current.bestBid;
        if (!marketPrice) throw new Error(`No resting ${side === "buy" ? "sell" : "buy"} orders to match against`);
        if (side === "buy") {
          await ensureOnPlatformBalance({ address, asset: trgAsset, neededAmount: qty * marketPrice, vaultAddress, signer });
        } else {
          await ensureOnPlatformBalance({ address, asset, neededAmount: qty, vaultAddress, signer });
        }
        setStatus("Executing market order...");
        await api.placeMarketOrder({ walletAddress: address, symbol: asset.symbol, side, quantity: qty });
      }

      setStatus("Done.");
      setQuantity("");
      setPrice("");
      onChanged?.();
    } catch (err) {
      setError(err.message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="order-form" onSubmit={submit}>
      <div className="tabs">
        <button type="button" className={side === "sell" ? "active" : ""} onClick={() => setSide("sell")}>
          Sell
        </button>
        <button type="button" className={side === "buy" ? "active" : ""} onClick={() => setSide("buy")}>
          Buy
        </button>
      </div>
      <div className="tabs">
        <button type="button" className={mode === "limit" ? "active" : ""} onClick={() => setMode("limit")}>
          Limit order
        </button>
        <button type="button" className={mode === "market" ? "active" : ""} onClick={() => setMode("market")}>
          Market price
        </button>
      </div>

      <label>
        Quantity
        <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </label>

      {mode === "limit" && (
        <label>
          Price (TRG)
          <input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
      )}

      {!address && <p className="muted">Connect your wallet to trade.</p>}
      {address && !user && <p className="muted">Finish registration to trade.</p>}
      {status && <p className="muted">{status}</p>}
      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={disabled}>
        {busy ? "Working..." : mode === "limit" ? `Place ${side} order` : `${side === "buy" ? "Buy" : "Sell"} at market`}
      </button>
    </form>
  );
}
