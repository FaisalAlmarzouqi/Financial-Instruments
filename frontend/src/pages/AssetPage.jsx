import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import PriceChart from "../components/PriceChart";
import OrderForm from "../components/OrderForm";
import OrderBook from "../components/OrderBook";

export default function AssetPage() {
  const { symbol } = useParams();
  const [asset, setAsset] = useState(null);
  const [trgAsset, setTrgAsset] = useState(null);
  const [history, setHistory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [vaultAddress, setVaultAddress] = useState(null);

  const refresh = useCallback(async () => {
    const [assetDetail, priceHistory, orderBook] = await Promise.all([
      api.getAsset(symbol),
      api.getPriceHistory(symbol),
      api.getOrderBook(symbol),
    ]);
    setAsset(assetDetail);
    setHistory(priceHistory);
    setOrders(orderBook);
  }, [symbol]);

  useEffect(() => {
    refresh();
    api.getAsset("TRG").then(setTrgAsset);
    fetch("/api/config").then((r) => r.json()).then((c) => setVaultAddress(c.vaultAddress));
  }, [refresh]);

  if (!asset) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <h1>
        {asset.name} <span className="muted">({asset.symbol})</span>
      </h1>
      <div className="asset-layout">
        <div>
          <PriceChart points={history} symbol={asset.symbol} />
          <OrderBook orders={orders} />
        </div>
        <div>
          {trgAsset && vaultAddress && (
            <OrderForm asset={asset} trgAsset={trgAsset} vaultAddress={vaultAddress} onChanged={refresh} />
          )}
        </div>
      </div>
    </div>
  );
}
