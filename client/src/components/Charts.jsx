/**
 * Tiny dependency-free SVG charts in the QueueCare calm blue/teal language.
 * BarChart (vertical), HBarChart (horizontal bars), Donut.
 */

export function BarChart({ data, height = 180, color = '#0d9488', formatValue }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 560;
  const H = height;
  const padB = 26;
  const padT = 8;
  const bw = Math.min(44, (W / Math.max(1, data.length)) * 0.55);
  const step = W / Math.max(1, data.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="bar chart">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1="0"
          x2={W}
          y1={padT + (H - padB - padT) * (1 - f)}
          y2={padT + (H - padB - padT) * (1 - f)}
          stroke="#e2e8f0"
          strokeDasharray="3 4"
        />
      ))}
      {data.map((d, i) => {
        const h = ((H - padB - padT) * d.value) / max;
        const x = step * i + (step - bw) / 2;
        const y = H - padB - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={h} rx={4} fill={d.color || color} opacity={d.value ? 1 : 0.25} />
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#64748b">
              {d.label}
            </text>
            {d.value > 0 && (
              <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="#334155">
                {formatValue ? formatValue(d.value) : d.value}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function HBarChart({ data, color = '#0d9488' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-right text-xs text-slate-500">{d.label}</span>
          <div className="h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
            <div
              className="h-full rounded-md transition-all"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color || color }}
            />
          </div>
          <span className="w-10 text-xs font-semibold text-slate-700">{d.value}</span>
        </div>
      ))}
      {data.length === 0 && <p className="text-sm text-slate-400">No data for this period.</p>}
    </div>
  );
}

const DONUT_COLORS = ['#0d9488', '#0ea5e9', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

export function Donut({ data, size = 170 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <p className="text-sm text-slate-400">No data for this period.</p>;
  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label="donut chart">
        <circle cx="80" cy="80" r={R} fill="none" stroke="#f1f5f9" strokeWidth="24" />
        {data.map((d, i) => {
          const frac = d.value / total;
          const el = (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={d.color || DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="24"
              strokeDasharray={`${frac * C} ${C}`}
              strokeDashoffset={-offset * C}
              transform="rotate(-90 80 80)"
            />
          );
          offset += frac;
          return el;
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="22" fontWeight="700" fill="#0f172a">
          {total}
        </text>
        <text x="80" y="96" textAnchor="middle" fontSize="11" fill="#64748b">
          tokens
        </text>
      </svg>
      <ul className="space-y-1.5">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: d.color || DONUT_COLORS[i % DONUT_COLORS.length] }}
            />
            <span className="text-slate-600">{d.label}</span>
            <span className="font-semibold text-slate-900">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
