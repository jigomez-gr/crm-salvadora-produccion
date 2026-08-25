import { TZDate } from '@date-fns/tz';

/**
 * The [start, end) UTC window of the business "today" (or any given instant's
 * day) in the business timezone. Pure and clock-injectable so it's unit-testable
 * and shared by `countToday` and the `GET /api/appointments/today` agenda — the
 * day boundary must be local-midnight in the business tz, not the container's UTC
 * (otherwise "today" is shifted 1–2h in production).
 */
export function businessDayWindow(
  now: Date,
  timezone: string,
): { start: Date; end: Date } {
  const zoned = new TZDate(now.getTime(), timezone);
  const start = new TZDate(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate(),
    0,
    0,
    timezone,
  );
  const startUtc = new Date(start.getTime());
  const endUtc = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: startUtc, end: endUtc };
}
