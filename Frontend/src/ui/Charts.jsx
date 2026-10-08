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

// Line chart over time. series: [{ name, points: [{ t: Date|string, v: number }] }], band: [low, high] shaded normal range.
export function LineChart({ series, title, unit = '', band, height = 150 }) {
  const w = 360;
  const pad = { l: 38, r: 10, t: 12, b: 26 };
  const pts = series.flatMap((s) => s.points.map((p) => ({ t: new Date(p.t).getTime(), v: p.v })));
  if (!pts.length) return <p className="muted">No readings recorded yet.</p>;
  const lo = Math.min(...pts.map((p) => p.v), band ? band[0] : Infinity);
  const hi = Math.max(...pts.map((p) => p.v), band ? band[1] : -Infinity);
  const span = hi - lo || 1;
  const min = lo - span * 0.12;
  const max = hi + span * 0.12;
  const t0 = Math.min(...pts.map((p) => p.t));
  const t1 = Math.max(...pts.map((p) => p.t));
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (t) => pad.l + (t1 === t0 ? iw / 2 : ((t - t0) / (t1 - t0)) * iw);
  const y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;
  const ticks = [min + (max - min) * 0.1, (min + max) / 2, max - (max - min) * 0.1];
  const fmt = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const colors = ['var(--c1)', 'var(--c3)'];
  const summary = series.map((s) => `${s.name}: ${s.points.map((p) => p.v).join(', ')}`).join('; ');
  return (
    <figure className="figure">
      <svg viewBox={`0 0 ${w} ${height}`} className="chart" role="img" aria-label={`${title}. ${summary} ${unit}`}>
        {band && <rect x={pad.l} width={iw} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} className="chart-band" />}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="chart-text">{Math.round(t * 10) / 10}</text>
          </g>
        ))}
        <text x={pad.l} y={height - 6} className="chart-text">{fmt(t0)}</text>
        {t1 !== t0 && <text x={w - pad.r} y={height - 6} textAnchor="end" className="chart-text">{fmt(t1)}</text>}
        {series.map((s, si) => {
          const sorted = [...s.points].sort((a, b) => new Date(a.t) - new Date(b.t));
          return (
            <g key={s.name}>
              <polyline fill="none" stroke={colors[si % colors.length]} strokeWidth="2" points={sorted.map((p) => `${x(new Date(p.t).getTime())},${y(p.v)}`).join(' ')} />
              {sorted.map((p) => (
                <circle key={`${p.t}-${p.v}`} cx={x(new Date(p.t).getTime())} cy={y(p.v)} r="3.5" fill={colors[si % colors.length]}>
                  <title>{`${s.name} ${p.v}${unit} on ${fmt(new Date(p.t).getTime())}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <figcaption className="legend-inline">
          {series.map((s, i) => (
            <span key={s.name}>
              <i className="swatch" style={{ background: colors[i % colors.length] }} /> {s.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

// Two-series bar chart (for example billed vs collected per day).
export function PairBars({ items, title, a, b, height = 190 }) {
  const w = 480;
  const pad = { l: 40, r: 8, t: 10, b: 26 };
  const max = Math.max(1, ...items.flatMap((i) => [i[a.key], i[b.key]]));
  const top = Math.ceil(max / 4) * 4 || 4;
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const bw = iw / items.length;
  const labelEvery = Math.ceil(items.length / 7);
  return (
    <figure className="figure">
      <svg viewBox={`0 0 ${w} ${height}`} className="chart" role="img" aria-label={`${title}. ${items.map((i) => `${i.label}: ${a.name} ${i[a.key]}, ${b.name} ${i[b.key]}`).join('; ')}`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih - f * ih} y2={pad.t + ih - f * ih} className="chart-grid" />
            <text x={pad.l - 6} y={pad.t + ih - f * ih + 4} textAnchor="end" className="chart-text">{Math.round(top * f)}</text>
          </g>
        ))}
        {items.map((it, i) => (
          <g key={it.label}>
            {[a, b].map((s, si) => {
              const h = (it[s.key] / top) * ih;
              return (
                <rect key={s.key} x={pad.l + i * bw + bw * (0.12 + si * 0.38)} y={pad.t + ih - h} width={bw * 0.36} height={h} rx="2" fill={si ? 'var(--c3)' : 'var(--c1)'}>
                  <title>{`${it.label} ${s.name}: ${it[s.key]}`}</title>
                </rect>
              );
            })}
            {i % labelEvery === 0 && <text x={pad.l + i * bw + bw / 2} y={height - 8} textAnchor="middle" className="chart-text">{it.label}</text>}
          </g>
        ))}
      </svg>
      <figcaption className="legend-inline">
        <span><i className="swatch" style={{ background: 'var(--c1)' }} /> {a.name}</span>
        <span><i className="swatch" style={{ background: 'var(--c3)' }} /> {b.name}</span>
      </figcaption>
    </figure>
  );
}
