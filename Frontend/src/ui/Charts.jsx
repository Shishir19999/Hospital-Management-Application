const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

const summary = (items) => items.map((i) => `${i.label}: ${i.value}`).join(', ');

// Vertical bars. items: [{ label, value }]
export function BarChart({ items, title, height = 180, labelEvery = 1 }) {
  const w = 480;
  const pad = { l: 28, r: 8, t: 10, b: 26 };
  const max = Math.max(1, ...items.map((i) => i.value));
  const step = Math.max(1, Math.ceil(max / 4));
  const top = Math.ceil(max / step) * step;
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const bw = iw / items.length;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="chart" role="img" aria-label={`${title}. ${summary(items)}`}>
      {ticks.map((t) => {
        const y = pad.t + ih - (t / top) * ih;
        return (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} className="chart-grid" />
            <text x={pad.l - 6} y={y + 4} textAnchor="end" className="chart-text">
              {t}
            </text>
          </g>
        );
      })}
      {items.map((it, i) => {
        const h = (it.value / top) * ih;
        const x = pad.l + i * bw + bw * 0.18;
        return (
          <g key={it.key || it.label}>
            <rect x={x} y={pad.t + ih - h} width={bw * 0.64} height={h} rx="3" fill="var(--c1)">
              <title>{`${it.label}: ${it.value}`}</title>
            </rect>
            {i % labelEvery === 0 && (
              <text x={x + bw * 0.32} y={height - 8} textAnchor="middle" className="chart-text">
                {it.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Donut with a legend. items: [{ label, value }]
export function DonutChart({ items, title, center }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut" role="img" aria-label={`${title}. ${summary(items)}`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="18" />
        {total > 0 &&
          items.map((it, i) => {
            const len = (it.value / total) * c;
            const el = (
              <circle
                key={it.label}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={COLORS[i % COLORS.length]}
                strokeWidth="18"
                strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
                strokeDashoffset={-acc}
                transform="rotate(-90 70 70)"
              >
                <title>{`${it.label}: ${it.value}`}</title>
              </circle>
            );
            acc += len;
            return el;
          })}
        <text x="70" y="68" textAnchor="middle" className="donut-total">
          {total}
        </text>
        <text x="70" y="86" textAnchor="middle" className="chart-text">
          {center}
        </text>
      </svg>
      <ul className="legend">
        {items.map((it, i) => (
          <li key={it.label}>
            <span className="swatch" style={{ background: COLORS[i % COLORS.length] }} />
            {it.label}
            <strong>{it.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Horizontal bars for category counts.
export function HBars({ items, title }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="hbars" aria-label={title}>
      {items.map((it) => (
        <li key={it.label}>
          <span className="hbar-label">{it.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(it.value / max) * 100}%` }} />
          </span>
          <strong>{it.value}</strong>
        </li>
      ))}
    </ul>
  );
}
