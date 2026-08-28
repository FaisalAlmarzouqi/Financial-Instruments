import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "../lib/wallet";
import { api } from "../lib/api";
import PortfolioPie from "../components/PortfolioPie";

export default function Portfolio() {
  const { address, user } = useWallet();
  const [portfolio, setPortfolio] = useState([]);
  const [withdrawing, setWithdrawing] = useState(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!address) return;
    const [{ portfolio: rows }, assets] = await Promise.all([api.getPortfolio(address), api.listAssets()]);
    const priceBySymbol = Object.fromEntries(assets.map((a) => [a.symbol, a.currentPrice]));
    setPortfolio(rows.map((r) => ({ ...r, currentPrice: priceBySymbol[r.symbol] })));
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleWithdraw(symbol) {
    setError("");
    setWithdrawing(symbol);
    try {
      const row = portfolio.find((p) => p.symbol === symbol);
      const amount = row.type === "bond" ? Math.floor(row.onPlatformAvailable) : row.onPlatformAvailable;
      await api.withdraw({ walletAddress: address, symbol, amount });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setWithdrawing(null);
    }
  }

  if (!address) {
    return (
      <div className="page">
        <h1>Portfolio</h1>
        <p className="muted">Connect your wallet to see your possessions.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Portfolio</h1>
      {!user && <p className="muted">Finish registration on the homepage to unlock trading.</p>}

      <table className="portfolio-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>On platform</th>
            <th>Total available</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {portfolio.map((row) => (
            <tr key={row.symbol}>
              <td>
                {row.type === "stablecoin" ? row.symbol : <Link to={`/asset/${row.symbol}`}>{row.symbol}</Link>}
              </td>
              <td>{row.onPlatform}</td>
              <td>{row.totalAvailable}</td>
              <td>
                {row.onPlatformAvailable > 0 && (
                  <button onClick={() => handleWithdraw(row.symbol)} disabled={withdrawing === row.symbol}>
                    {withdrawing === row.symbol ? "Withdrawing..." : "Withdraw"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="error">{error}</p>}

      <h2>Breakdown</h2>
      <PortfolioPie portfolio={portfolio} />
    </div>
  );
}
