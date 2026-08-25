import type { PipelineStage } from "@/lib/types";

/**
 * Presentation for the CRM lead pipeline (Kanban). Stage ids are English (they
 * mirror the backend enum in contacts/pipeline.ts); the labels are Spanish, per
 * the code-English / UI-Spanish convention. Colours run cold→warm as intent
 * rises, with green = won and red = lost.
 */
export const PIPELINE_STAGES: PipelineStage[] = [
  "new",
  "contacted",
  "qualified",
  "booked",
  "won",
  "lost",
];

export interface StageMeta {
  label: string;
  hint: string;
  // Tailwind classes for the column header accent + the card's left border.
  dot: string;
  headerText: string;
  border: string;
}

export const PIPELINE_STAGE_META: Record<PipelineStage, StageMeta> = {
  new: {
    label: "Nuevo",
    hint: "Lead recién entrado, sin trabajar",
    dot: "bg-slate-400",
    headerText: "text-slate-600",
    border: "border-l-slate-300",
  },
  contacted: {
    label: "Contactado",
    hint: "Primer contacto realizado",
    dot: "bg-sky-500",
    headerText: "text-sky-700",
    border: "border-l-sky-400",
  },
  qualified: {
    label: "Cualificado",
    hint: "Interesado y encaja",
    dot: "bg-violet-500",
    headerText: "text-violet-700",
    border: "border-l-violet-400",
  },
  booked: {
    label: "Cita agendada",
    hint: "Tiene una cita reservada",
    dot: "bg-amber-500",
    headerText: "text-amber-700",
    border: "border-l-amber-400",
  },
  won: {
    label: "Cliente",
    hint: "Se convirtió en cliente",
    dot: "bg-emerald-500",
    headerText: "text-emerald-700",
    border: "border-l-emerald-400",
  },
  lost: {
    label: "Perdido",
    hint: "No interesado / ilocalizable",
    dot: "bg-rose-500",
    headerText: "text-rose-700",
    border: "border-l-rose-400",
  },
};

// Ordering within a column is a numeric `boardPosition` (DESC = top). The client
// no longer computes positions: a drag POSTs the column's new order of ids to
// `/api/contacts/board/reorder` and the server renumbers to clean integer steps
// (no float-midpoint exhaustion). The board simply renders each column in the
// order the API returns.
