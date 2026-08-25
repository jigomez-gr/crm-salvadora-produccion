import type { TrendPoint } from "@/lib/types";
import { trendDisplay } from "@/lib/reports";
import { cn } from "@/lib/utils";

/**
 * Compact ▲/▼ delta vs the previous period. The arrow + sign carry the meaning
 * (never colour alone), and the colour uses OUTCOME semantics (green = good) so a
 * drop in cancellations is green, not red. Neutral on a tiny sample.
 */
export function TrendPill({
  trend,
  isRate,
  sampleSize,
  className,
}: {
  trend: TrendPoint | undefined;
  isRate?: boolean;
  sampleSize?: number;
  className?: string;
}) {
  const d = trendDisplay(trend, { isRate, sampleSize });
  if (!d) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-xs font-medium", d.color, className)}
      title="Comparado con el periodo anterior"
    >
      <span aria-hidden>{d.arrow}</span>
      {d.text}
    </span>
  );
}
