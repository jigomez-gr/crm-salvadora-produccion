/**
 * CRM lead pipeline (Kanban) — pure core, no IO. The sales funnel a lead travels
 * from first contact to customer. This is DISTINCT from `ContactStatus`
 * (lead/active/inactive lifecycle): the pipeline is how you *work* a lead, the
 * status is what the contact *is*. Both live on the Contact and evolve
 * independently (though a booking auto-advances the pipeline — see
 * `nextStageOnBooking`).
 *
 * Values are English identifiers (stored in the DB); the Spanish column labels
 * live on the frontend (`lib/pipeline.ts`), per the code-English / UI-Spanish
 * convention.
 */
export enum PipelineStage {
  NEW = 'new', // Nuevo — just captured, not yet worked
  CONTACTED = 'contacted', // Contactado — first touch made
  QUALIFIED = 'qualified', // Cualificado — interested and fits
  BOOKED = 'booked', // Cita agendada — has a booked appointment (high intent)
  WON = 'won', // Cliente — became a customer
  LOST = 'lost', // Perdido — no/dropped (reactivatable)
}

/** Ordered stages, left→right on the board. */
export const PIPELINE_STAGES: PipelineStage[] = [
  PipelineStage.NEW,
  PipelineStage.CONTACTED,
  PipelineStage.QUALIFIED,
  PipelineStage.BOOKED,
  PipelineStage.WON,
  PipelineStage.LOST,
];

export function isPipelineStage(value: unknown): value is PipelineStage {
  return (
    typeof value === 'string' &&
    (PIPELINE_STAGES as string[]).includes(value)
  );
}

/** Position of a stage in the funnel (0-based), or -1 if unknown. */
export function stageRank(stage: PipelineStage): number {
  return PIPELINE_STAGES.indexOf(stage);
}

// Stages a booking should auto-advance to BOOKED. Includes LOST: a lost lead that
// books again is a re-engagement and should re-enter the funnel at "Cita
// agendada". BOOKED (already there) and WON (already a customer) are left alone.
const ADVANCE_ON_BOOKING_FROM = new Set<PipelineStage>([
  PipelineStage.NEW,
  PipelineStage.CONTACTED,
  PipelineStage.QUALIFIED,
  PipelineStage.LOST,
]);

/**
 * The pipeline stage a contact should move to when an appointment is booked, or
 * `null` if it should stay put (already BOOKED or WON). Never moves a contact
 * "backwards" through the active funnel.
 */
export function nextStageOnBooking(
  current: PipelineStage,
): PipelineStage | null {
  return ADVANCE_ON_BOOKING_FROM.has(current) ? PipelineStage.BOOKED : null;
}
