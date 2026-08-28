export default function OrderBook({ orders }) {
  const sells = orders.filter((o) => o.side === "sell").sort((a, b) => a.price - b.price);
  const buys = orders.filter((o) => o.side === "buy").sort((a, b) => b.price - a.price);

  return (
    <div className="order-book">
      <h3>Open orders</h3>
      <div className="order-book-columns">
        <div>
          <h4>Sell</h4>
          <table>
            <tbody>
              {sells.map((o) => (
                <tr key={o.id}>
                  <td>{o.remainingQuantity}</td>
                  <td>{o.price} TRG</td>
                </tr>
              ))}
              {sells.length === 0 && (
                <tr>
                  <td colSpan={2} className="muted">
                    No sell orders
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div>
          <h4>Buy</h4>
          <table>
            <tbody>
              {buys.map((o) => (
                <tr key={o.id}>
                  <td>{o.remainingQuantity}</td>
                  <td>{o.price} TRG</td>
                </tr>
              ))}
              {buys.length === 0 && (
                <tr>
                  <td colSpan={2} className="muted">
                    No buy orders
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
