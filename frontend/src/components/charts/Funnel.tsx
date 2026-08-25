"use client";

import { useRouter } from "next/navigation";

export interface FunnelDisplayStep {
  key: string;
  label: string;
  count: number;
  color: string; // hex
  href?: string; // drill-through target
}

/**
 * A vertical conversion funnel. Each step's bar width is proportional to the top
 * step (so it's monotonically non-increasing), showing the count, its share of
 * the top, and the step-to-step conversion between consecutive stages. Steps are
 * buttons (keyboard-accessible) when they carry an href.
 */
export function Funnel({ steps }: { steps: FunnelDisplayStep[] }) {
  const router = useRouter();
  const top = Math.max(1, steps[0]?.count ?? 0);

  return (
    <div className="space-y-1">
      {steps.map((step, i) => {
        const widthPct = Math.max((step.count / top) * 100, 6); // keep a nub visible
        const ofTop = Math.round((step.count / top) * 100);
        const prev = i > 0 ? steps[i - 1].count : null;
        const stepConv =
          prev && prev > 0 ? Math.round((step.count / prev) * 100) : null;
        const aria = `${step.label}: ${step.count} (${ofTop}% del total)`;

        const bar = (
          <div className="flex items-center gap-3">
            <div className="w-24 flex-shrink-0 text-right text-xs font-medium text-neutral-600">
              {step.label}
            </div>
            <div className="relative h-9 flex-1">
              <div
                className="flex h-full items-center justify-end rounded-md px-2 text-xs font-semibold text-white transition-[width]"
                style={{ width: `${widthPct}%`, backgroundColor: step.color }}
              >
                {step.count}
              </div>
            </div>
            <div className="w-10 flex-shrink-0 text-left text-[11px] text-neutral-400">
              {ofTop}%
            </div>
          </div>
        );

        return (
          <div key={step.key}>
            {i > 0 && stepConv !== null && (
              <div className="flex items-center gap-3">
                <div className="w-24 flex-shrink-0" />
                <div className="flex-1 pl-2 text-[10px] text-neutral-400">
                  ↓ {stepConv}% pasa a la siguiente etapa
                </div>
                <div className="w-10 flex-shrink-0" />
              </div>
            )}
            {step.href ? (
              <button
                type="button"
                onClick={() => router.push(step.href!)}
                aria-label={aria}
                className="w-full rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <div className="transition-opacity hover:opacity-80">{bar}</div>
              </button>
            ) : (
              <div aria-label={aria}>{bar}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
