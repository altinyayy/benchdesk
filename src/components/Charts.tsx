// Small server-rendered SVG charts. No client JS needed.

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export function Sparkline({ points, label }: { points: number[]; label: string }) {
  if (points.length < 2) return null;
  const L = 0, R = 400, T = 8, B = 70;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const pad = (hi - lo) * 0.1 || 1;
  const X = (i: number) => L + ((R - L) * i) / (points.length - 1);
  const Y = (v: number) => B - ((B - T) * (v - (lo - pad))) / (hi + pad - (lo - pad));
  const d = points.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const minIdx = points.indexOf(lo);
  return (
    <svg viewBox="0 0 400 90" width="100%" role="img" aria-label={label}>
      <path d={`${d} L${R} ${B} L${L} ${B} Z`} style={{ fill: "var(--line)" }} fillOpacity={0.12} />
      <path d={d} fill="none" style={{ stroke: "var(--line)" }} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={X(minIdx)} cy={Y(lo)} r={4} style={{ fill: "var(--score-bad)" }} />
      <text x={12} y={86} textAnchor="middle">0h</text>
      <text x={388} y={86} textAnchor="middle">end</text>
    </svg>
  );
}

export function BarChart({
  bars,
  highlight,
  label,
}: {
  bars: { name: string; value: number }[];
  highlight?: string;
  label: string;
}) {
  const sorted = [...bars].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((b) => b.value), 1);
  return (
    <div className="bars" role="list" aria-label={label}>
      {sorted.map((b) => (
        <div className="bar-row" role="listitem" key={b.name}>
          <span className="bar-name">{b.name}</span>
          <div className="bar-track">
            <i
              style={{
                width: `${(b.value / max) * 100}%`,
                background: b.name === highlight ? "var(--primary)" : "var(--bar-other)",
              }}
            />
          </div>
          <span className="bar-val">{fmt(b.value)}</span>
        </div>
      ))}
    </div>
  );
}
