import type { Appointment } from "@/lib/types";

export type ApptStatus = Appointment["status"];

// Shared presentation for an appointment's status (label + colour classes),
// used by the calendar and the dashboard "Agenda de hoy".
export const APPT_STATUS_META: Record<
  ApptStatus,
  {
    label: string;
    variant: "info" | "success" | "danger" | "warning";
    // Tailwind classes for a bordered chip / block.
    block: string;
    dot: string;
  }
> = {
  scheduled: {
    label: "Programada",
    variant: "info",
    block: "bg-indigo-100 text-indigo-700 border-indigo-200",
    dot: "bg-indigo-500",
  },
  pending_approval: {
    label: "Pendiente",
    variant: "warning",
    block: "bg-amber-100 text-amber-800 border-amber-300",
    dot: "bg-amber-500",
  },
  completed: {
    label: "Completada",
    variant: "success",
    block: "bg-green-100 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
  cancelled: {
    label: "Cancelada",
    variant: "danger",
    block: "bg-red-100 text-red-700 border-red-200",
    dot: "bg-red-400",
  },
};
