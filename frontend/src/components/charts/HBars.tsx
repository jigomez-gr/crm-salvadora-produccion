import Link from "next/link";
import { cn } from "@/lib/utils";

export interface HBarRow {
  key: string;
  label: string;
  value: number;
  subLabel?: string; // e.g. "80% completadas" or "3 reservaron"
  color?: string; // tailwind bg-* (defaults to indigo)
  href?: string;
}

/** Horizontal bars for a top-N breakdown (services, sources). */
export function HBars({ rows }: { rows: HBarRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const body = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-medium text-neutral-700">
                {r.label}
              </span>
              <span className="flex-shrink-0 text-xs text-neutral-500">
                {r.subLabel ? (
                  <>
                    <span className="font-semibold text-neutral-900">{r.value}</span>{" "}
                    · {r.subLabel}
                  </>
                ) : (
                  <span className="font-semibold text-neutral-900">{r.value}</span>
                )}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-neutral-100">
              <div
                className={cn("h-full rounded-full", r.color ?? "bg-indigo-500")}
                style={{ width: `${(r.value / max) * 100}%` }}
              />
            </div>
          </>
        );
        return r.href ? (
          <Link
            key={r.key}
            href={r.href}
            className="block rounded p-0.5 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {body}
          </Link>
        ) : (
          <div key={r.key}>{body}</div>
        );
      })}
    </div>
  );
}
