import { cn } from "@/lib/utils";

export interface Segment {
  key: string;
  label: string;
  color: string; // tailwind bg-*
}

// Hand-rolled stacked-bar chart (no chart library — keeps deps minimal). Each bar
// is optionally a <button> for drill-through, with an accessible label describing
// its totals (so it's not a colour-only, mouse-only affordance).
export function StackedBars({
  data,
  series,
  labelKey,
  height = 150,
  onBarClick,
  barAriaLabel,
}: {
  data: Record<string, number | string>[];
  series: Segment[];
  labelKey: string;
  height?: number;
  onBarClick?: (index: number) => void;
  barAriaLabel?: (row: Record<string, number | string>) => string;
}) {
  const totals = data.map((d) =>
    series.reduce((s, ser) => s + Number(d[ser.key] ?? 0), 0),
  );
  const max = Math.max(1, ...totals);

  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => {
          const total = totals[i];
          const label =
            barAriaLabel?.(d) ?? `${d[labelKey]}: ${total}`;
          const stack = (
            <>
              {series.map((ser) => {
                const v = Number(d[ser.key] ?? 0);
                if (v <= 0) return null;
                return (
                  <div
                    key={ser.key}
                    className={ser.color}
                    style={{ height: (v / max) * height }}
                  />
                );
              })}
            </>
          );
          const cls =
            "flex flex-1 flex-col-reverse overflow-hidden rounded-t-sm bg-neutral-100";
          if (onBarClick) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onBarClick(i)}
                aria-label={label}
                title={label}
                className={cn(
                  cls,
                  "cursor-pointer transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                )}
                style={{ minWidth: 2 }}
              >
                {stack}
              </button>
            );
          }
          return (
            <div key={i} className={cls} title={label} style={{ minWidth: 2 }}>
              {stack}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-neutral-600">
              <span className={cn("h-2.5 w-2.5 rounded-sm", s.color)} />
              {s.label}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-neutral-400">máx. {max}</span>
      </div>
    </div>
  );
}
