import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function Home() {
  const [assets, setAssets] = useState([]);

  useEffect(() => {
    api.listAssets().then(setAssets).catch(() => {});
  }, []);

  return (
    <div className="page">
      <section className="hero">
        <h1>Triangle Settlement Platform</h1>
        <p className="muted">
          An international settlement platform for tokenized stablecoins, shares and
          bonds. Connect your wallet to view your portfolio and start trading.
        </p>
      </section>

      <section>
        <h2>Assets</h2>
        <div className="asset-grid">
          {assets.map((asset) => {
            const card = (
              <div className="asset-card" key={asset.symbol}>
                <div className="asset-card-symbol">{asset.symbol}</div>
                <div className="muted">{asset.name}</div>
                <div className="asset-card-price">{asset.currentPrice} TRG</div>
              </div>
            );
            return asset.type === "stablecoin" ? (
              card
            ) : (
              <Link to={`/asset/${asset.symbol}`} className="asset-card-link" key={asset.symbol}>
                {card}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
