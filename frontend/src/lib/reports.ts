import type { FunnelKey, TrendPoint } from "@/lib/types";

// Spanish labels for the conversion-funnel steps (keys are English, from the
// backend). The funnel is a snapshot of the current pipeline (at-or-beyond each
// stage), so it reads as LEAD → CONTACTADO → CUALIFICADO → CON CITA → CLIENTE.
export const FUNNEL_LABELS: Record<FunnelKey, string> = {
  leads: "Contactos",
  contacted: "Contactados",
  qualified: "Cualificados",
  booked: "Con cita",
  won: "Clientes",
};

// A small palette (cold → warm) for the funnel steps, aligned with the pipeline.
export const FUNNEL_COLORS: Record<FunnelKey, string> = {
  leads: "#94a3b8", // slate-400
  contacted: "#0ea5e9", // sky-500
  qualified: "#8b5cf6", // violet-500
  booked: "#f59e0b", // amber-500
  won: "#10b981", // emerald-500
};

/** `0.734` → `73%` (rounded). */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Ratio of `part` to `whole` as a percentage string; 0 when whole is 0. */
export function ratioPercent(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

/** Money in euros, no decimals for round amounts (list-price estimates). */
export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export interface TrendDisplay {
  arrow: "▲" | "▼" | "—";
  text: string; // e.g. "+4" or "nuevo" or "sin cambios"
  // Tailwind text colour. Neutral when the sample is too small to trust or flat.
  color: string;
}

/**
 * Turn a raw TrendPoint into display bits (arrow + label + colour). `isRate`
 * formats the delta as points of %; `sampleSize` neutralises the colour when the
 * base is too small for a delta to be meaningful (avoids "+200%" drama on n=1–2).
 */
export function trendDisplay(
  trend: TrendPoint | undefined,
  opts: { isRate?: boolean; sampleSize?: number } = {},
): TrendDisplay | null {
  if (!trend) return null;
  const { isRate = false, sampleSize } = opts;

  if (trend.previous === 0 && trend.current > 0) {
    return { arrow: "▲", text: "nuevo", color: "text-neutral-400" };
  }
  if (trend.direction === "flat") {
    return { arrow: "—", text: "sin cambios", color: "text-neutral-400" };
  }

  const arrow = trend.direction === "up" ? "▲" : "▼";
  const magnitude = Math.abs(trend.delta);
  const text = isRate
    ? `${trend.delta > 0 ? "+" : "−"}${Math.round(magnitude * 100)} pts`
    : `${trend.delta > 0 ? "+" : "−"}${magnitude}`;

  // Too few data points to read into a direction → keep it neutral.
  const lowN = sampleSize !== undefined && sampleSize < 10;
  const color = lowN
    ? "text-neutral-400"
    : trend.good === true
      ? "text-emerald-600"
      : trend.good === false
        ? "text-rose-600"
        : "text-neutral-400";

  return { arrow, text, color };
}
