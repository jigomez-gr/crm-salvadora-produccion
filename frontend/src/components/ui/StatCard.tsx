import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { TrendPoint } from "@/lib/types";
import { TrendPill } from "@/components/charts/TrendPill";
import { cn } from "@/lib/utils";

/**
 * A KPI tile. Renders as a Link when `href` is set (drill-through), otherwise a
 * plain card. Shows the metric, an icon chip, an optional trend vs the previous
 * period, and an optional hint line. `0` is a real value — pass 0, not "—".
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  color,
  href,
  hint,
  trend,
  trendIsRate,
  trendSample,
  emphasis,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  href?: string;
  hint?: string;
  trend?: TrendPoint;
  trendIsRate?: boolean;
  trendSample?: number;
  // Draw attention (e.g. unread > 0) with a coloured ring.
  emphasis?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-500">{label}</p>
        <div className={cn("rounded-lg p-2", color)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <p className="text-2xl font-semibold text-neutral-900">{value}</p>
        {trend && (
          <TrendPill
            trend={trend}
            isRate={trendIsRate}
            sampleSize={trendSample}
            className="mb-1"
          />
        )}
      </div>
      {hint && <p className="mt-0.5 text-xs text-neutral-400">{hint}</p>}
      {href && (
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100">
          <ArrowRight className="h-4 w-4" />
        </span>
      )}
    </>
  );

  const base = cn(
    "relative block rounded-xl border bg-white p-5 shadow-sm transition-colors",
    emphasis ? "border-indigo-300" : "border-neutral-200",
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={`${label}: ${value}`}
        className={cn(
          base,
          "group hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
        )}
      >
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}
