import { PieChart, Pie, Cell, Tooltip } from "recharts";

const COLORS = ["var(--accent)", "var(--danger)", "var(--success)", "var(--warning)", "var(--muted-2)"];

function renderLabel({ cx, cy, midAngle, outerRadius, percent, name }) {
  const RADIAN = Math.PI / 180;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + outerRadius * cos;
  const sy = cy + outerRadius * sin;
  const mx = cx + (outerRadius + 24) * cos;
  const my = cy + (outerRadius + 24) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 16;
  const ey = my;
  const textAnchor = cos >= 0 ? "start" : "end";

  return (
    <g>
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke="var(--muted-2)" fill="none" />
      <circle cx={sx} cy={sy} r={2} fill="var(--muted-2)" />
      <text x={ex + (cos >= 0 ? 6 : -6)} y={ey} textAnchor={textAnchor} dominantBaseline="central" fontSize={13}>
        {name}
      </text>
      <text
        x={ex + (cos >= 0 ? 6 : -6)}
        y={ey + 16}
        textAnchor={textAnchor}
        dominantBaseline="central"
        fontSize={13}
        fill="var(--muted)"
      >
        {(percent * 100).toFixed(1)}%
      </text>
    </g>
  );
}

export default function PortfolioPie({ portfolio }) {
  const data = portfolio
    .map((row) => ({ name: row.symbol, value: row.totalAvailable * (row.symbol === "TRG" ? 1 : row.currentPrice || 0) }))
    .filter((d) => d.value > 0);

  if (data.length === 0) {
    return <p className="muted">No holdings to visualize yet.</p>;
  }

  return (
    <PieChart width={480} height={360}>
      <Pie
        data={data}
        dataKey="value"
        nameKey="name"
        cx="50%"
        cy="50%"
        outerRadius={110}
        label={renderLabel}
        labelLine={false}
      >
        {data.map((_, i) => (
          <Cell key={i} fill={COLORS[i % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip formatter={(v) => `${v.toFixed(2)} TRG`} />
    </PieChart>
  );
}
