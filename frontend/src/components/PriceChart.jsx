import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function PriceChart({ points, symbol }) {
  const data = points.map((p) => ({
    time: new Date(p.executed_at).toLocaleString(),
    price: p.price,
  }));

  return (
    <div className="price-chart">
      <h3>{symbol} price history</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="time" hide />
          <YAxis domain={["auto", "auto"]} width={48} />
          <Tooltip formatter={(v) => [`${v} TRG`, "price"]} labelFormatter={(l) => l} />
          <Line type="stepAfter" dataKey="price" stroke="var(--accent)" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
