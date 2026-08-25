/**
 * Pure reminder-selection logic — no DB, no clock, no I/O — so it can be unit
 * tested exhaustively. The service feeds it the candidate appointments, what's
 * already been sent, and "now"; it returns which (appointment, offset) reminders
 * are due right now.
 */

export interface ReminderOffset {
  label: string;
  minutes: number;
}

// Reminders to send before an appointment. Fixed for v1 (documented as
// adaptable). Sorted is not required.
export const REMINDER_OFFSETS: ReminderOffset[] = [
  { label: '24h', minutes: 24 * 60 },
  { label: '2h', minutes: 2 * 60 },
];

/**
 * Catch-up grace. A reminder fires inside the band `(offset - grace, offset]`:
 * at, or just past, its trigger point — never far before it. This is what stops
 * a same-day booking from getting a "24h before" reminder (its time-until-start
 * never enters the 24h band), while still tolerating brief downtime / cron
 * jitter (a missed tick within `grace` minutes still fires). If the app is down
 * longer than `grace` past a trigger, that one reminder is skipped — acceptable,
 * and never a duplicate (the idempotency record guards that).
 */
export const REMINDER_GRACE_MINUTES = 30;

export interface ReminderCandidate {
  id: string;
  startsAt: Date;
}

export interface DueReminder {
  appointmentId: string;
  offsetLabel: string;
}

/** Key used both here and by the service to dedupe against sent reminders. */
export function reminderKey(appointmentId: string, offsetLabel: string): string {
  return `${appointmentId}:${offsetLabel}`;
}

export function selectDueReminders(
  appointments: ReminderCandidate[],
  alreadySent: Set<string>,
  now: Date,
  offsets: ReminderOffset[] = REMINDER_OFFSETS,
  graceMinutes: number = REMINDER_GRACE_MINUTES,
): DueReminder[] {
  const due: DueReminder[] = [];
  const nowMs = now.getTime();

  for (const appt of appointments) {
    const minutesUntil = (appt.startsAt.getTime() - nowMs) / 60000;
    if (minutesUntil <= 0) continue; // already started / past

    for (const offset of offsets) {
      const inBand =
        minutesUntil <= offset.minutes &&
        minutesUntil > offset.minutes - graceMinutes;
      if (!inBand) continue;
      if (alreadySent.has(reminderKey(appt.id, offset.label))) continue;
      due.push({ appointmentId: appt.id, offsetLabel: offset.label });
    }
  }

  return due;
}
