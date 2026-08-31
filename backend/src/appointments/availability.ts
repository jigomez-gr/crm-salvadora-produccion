import { TZDate } from '@date-fns/tz';
import { WorkingHourSlot } from '../common/entities/agent-config.entity';
import { Appointment, AppointmentStatus } from '../common/entities/appointment.entity';

export interface TimeSlot {
  startsAt: Date;
  endsAt: Date;
}

export interface AvailabilityOptions {
  /** IANA timezone the business operates in; workingHours are local to it */
  timezone: string;
  /** Reference instant — slots starting at or before this are excluded */
  now: Date;
  /** Maximum simultaneous appointments allowed per slot (defaults to 1) */
  maxCapacity?: number;
}

/**
 * Returns free slots for a given date and duration, given working hours config
 * and existing appointments. Slots are generated at 30-minute intervals in the
 * business timezone, and slots in the past (relative to `now`) are excluded.
 * When maxCapacity > 1, slots remain open until overlapping active appointments
 * reach maxCapacity.
 */
export function computeFreeSlots(
  date: Date,
  durationMinutes: number,
  workingHours: WorkingHourSlot[],
  existingAppointments: Appointment[],
  options: AvailabilityOptions,
): TimeSlot[] {
  const { timezone, now, maxCapacity = 1 } = options;
  const effectiveMaxCapacity = Math.max(1, maxCapacity);

  // Resolve the requested calendar day in the business timezone
  const zoned = new TZDate(date.getTime(), timezone);
  const year = zoned.getFullYear();
  const month = zoned.getMonth();
  const day = zoned.getDate();
  const dayOfWeek = zoned.getDay(); // 0=Sunday...6=Saturday

  const workingDay = workingHours.find((w) => w.day === dayOfWeek);
  if (!workingDay) return [];

  const [openH, openM] = workingDay.open.split(':').map(Number);
  const [closeH, closeM] = workingDay.close.split(':').map(Number);

  // Build open/close instants as business-local wall-clock times
  const dayStart = new TZDate(year, month, day, openH, openM, timezone);
  const dayEnd = new TZDate(year, month, day, closeH, closeM, timezone);

  const slots: TimeSlot[] = [];
  const stepMs = 30 * 60 * 1000;
  const durationMs = durationMinutes * 60 * 1000;

  const activeAppts = existingAppointments.filter(
    (a) => a.status !== AppointmentStatus.CANCELLED,
  );

  let cursor = dayStart.getTime();

  while (cursor + durationMs <= dayEnd.getTime()) {
    const slotStart = new Date(cursor);
    const slotEnd = new Date(cursor + durationMs);

    const isPast = slotStart.getTime() <= now.getTime();

    const overlappingCount = activeAppts.filter(
      (a) =>
        new Date(a.startsAt).getTime() < slotEnd.getTime() &&
        new Date(a.endsAt).getTime() > slotStart.getTime(),
    ).length;

    const hasConflict = overlappingCount >= effectiveMaxCapacity;

    if (!isPast && !hasConflict) {
      slots.push({ startsAt: slotStart, endsAt: slotEnd });
    }

    cursor += stepMs;
  }

  return slots;
}
