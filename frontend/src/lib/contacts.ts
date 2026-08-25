import type { ContactStatus } from "@/lib/types";

// Shared presentation for the contact lifecycle status (label + Badge variant).
export const CONTACT_STATUS_META: Record<
  ContactStatus,
  { label: string; variant: "info" | "success" | "default" }
> = {
  lead: { label: "Lead", variant: "info" },
  active: { label: "Cliente", variant: "success" },
  inactive: { label: "Inactivo", variant: "default" },
};

export const CONTACT_STATUSES: ContactStatus[] = ["lead", "active", "inactive"];
