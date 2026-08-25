import Link from "next/link";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string; // hex
  href?: string;
}

/**
 * A donut chart (SVG stroke-dasharray) with a centred total and a legend. More
 * legible than bars for 2–4 categories. Legend rows drill through when they carry
 * an href. Colour is never the only signal — the legend labels the values.
 */
export function Donut({
  segments,
  centerLabel,
}: {
  segments: DonutSegment[];
  centerLabel?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 60;
  const c = 2 * Math.PI * r;

  let offset = 0;
  const arcs = segments.map((seg) => {
    const frac = total > 0 ? seg.value / total : 0;
    const len = frac * c;
    const dash = `${len} ${c - len}`;
    const arc = { seg, dash, dashoffset: -offset };
    offset += len;
    return arc;
  });

  return (
    <div className="flex items-center gap-6">
      <svg
        viewBox="0 0 160 160"
        className="h-36 w-36 flex-shrink-0"
        role="img"
        aria-label={`Total ${total}. ${segments
          .map((s) => `${s.label}: ${s.value}`)
          .join(", ")}`}
      >
        {/* Rotate only the arcs so they start at 12 o'clock; the label stays upright. */}
        <g transform="rotate(-90 80 80)">
          <circle cx="80" cy="80" r={r} fill="none" stroke="#f1f5f9" strokeWidth="16" />
          {total > 0 &&
            arcs.map(({ seg, dash, dashoffset }) => (
              <circle
                key={seg.key}
                cx="80"
                cy="80"
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth="16"
                strokeDasharray={dash}
                strokeDashoffset={dashoffset}
              />
            ))}
        </g>
        <text
          x="80"
          y="80"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-neutral-900 text-2xl font-semibold"
        >
          {total}
        </text>
      </svg>
      <div className="space-y-1.5">
        {centerLabel && (
          <p className="mb-1 text-xs font-medium text-neutral-400">{centerLabel}</p>
        )}
        {segments.map((seg) => {
          const row = (
            <span className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-neutral-600">{seg.label}</span>
              <span className="font-semibold text-neutral-900">{seg.value}</span>
            </span>
          );
          return seg.href ? (
            <Link
              key={seg.key}
              href={seg.href}
              className="block rounded hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {row}
            </Link>
          ) : (
            <div key={seg.key}>{row}</div>
          );
        })}
      </div>
    </div>
  );
}
