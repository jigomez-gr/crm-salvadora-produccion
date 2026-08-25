// A tiny inline line chart (SVG polyline), for a low-emphasis series like message
// volume. No axes, no interactivity — just the shape of the trend.
export function Sparkline({
  values,
  color = "#6366f1",
  width = 240,
  height = 40,
  ariaLabel,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  ariaLabel?: string;
}) {
  if (values.length === 0) {
    return <div className="h-10 text-xs text-neutral-400">Sin datos</div>;
  }
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - (v / max) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-10 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel ?? `Tendencia (${values.length} puntos, máx. ${max})`}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
