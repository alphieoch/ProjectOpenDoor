let sparkId = 0;

export function Sparkline({
  values,
  width = 120,
  height = 36,
  color = "var(--md-primary)",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const id = `od-spark-${++sparkId}`;
  const series = values.length > 1 ? values : [0, ...values, 0];
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const span = Math.max(max - min, 1);
  const step = width / Math.max(series.length - 1, 1);
  const points = series.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d = `M ${points.join(" L ")}`;
  const area = `M 0,${height} L ${points.join(" L ")} L ${width},${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
