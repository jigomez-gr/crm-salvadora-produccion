import {
  selectDueReminders,
  reminderKey,
  REMINDER_OFFSETS,
  ReminderOffset,
} from './reminder-selection';

// Fixed "now" so the tests are deterministic.
const NOW = new Date('2026-07-01T10:00:00.000Z');

// Helper: an appointment starting `minutes` from NOW.
const apptIn = (id: string, minutes: number) => ({
  id,
  startsAt: new Date(NOW.getTime() + minutes * 60_000),
});

const OFFSETS: ReminderOffset[] = REMINDER_OFFSETS; // 24h (1440) + 2h (120)

describe('selectDueReminders', () => {
  it('fires the 24h reminder exactly at the trigger', () => {
    const appts = [apptIn('a', 1440)]; // exactly 24h away
    const due = selectDueReminders(appts, new Set(), NOW, OFFSETS, 30);
    expect(due).toEqual([{ appointmentId: 'a', offsetLabel: '24h' }]);
  });

  it('fires the 24h reminder within the grace band (just past the trigger)', () => {
    const appts = [apptIn('a', 1420)]; // 23h40m → inside (1410, 1440]
    const due = selectDueReminders(appts, new Set(), NOW, OFFSETS, 30);
    expect(due).toEqual([{ appointmentId: 'a', offsetLabel: '24h' }]);
  });

  it('does NOT fire the 24h reminder before its band', () => {
    const appts = [apptIn('a', 1450)]; // >24h away → not yet
    const due = selectDueReminders(appts, new Set(), NOW, OFFSETS, 30);
    expect(due).toEqual([]);
  });

  it('does NOT fire the 24h reminder after its band passed', () => {
    const appts = [apptIn('a', 1405)]; // below (1410,1440] → missed, skipped
    const due = selectDueReminders(appts, new Set(), NOW, OFFSETS, 30);
    expect(due).toEqual([]);
  });

  it('fires the 2h reminder in its band', () => {
    const appts = [apptIn('a', 110)]; // inside (90, 120]
    const due = selectDueReminders(appts, new Set(), NOW, OFFSETS, 30);
    expect(due).toEqual([{ appointmentId: 'a', offsetLabel: '2h' }]);
  });

  it('a same-day booking never gets a "24h before" reminder', () => {
    // Booked 90 min before the appointment — should only ever get the 2h band,
    // never the 24h one.
    const appts = [apptIn('a', 90)]; // inside (90,120]? 90 is NOT > 90 → just out
    const dueNow = selectDueReminders(appts, new Set(), NOW, OFFSETS, 30);
    // 90 is the open lower bound of the 2h band → excluded; definitely no 24h.
    expect(dueNow.some((d) => d.offsetLabel === '24h')).toBe(false);
  });

  it('skips reminders already sent (idempotency)', () => {
    const appts = [apptIn('a', 1440)];
    const sent = new Set([reminderKey('a', '24h')]);
    const due = selectDueReminders(appts, sent, NOW, OFFSETS, 30);
    expect(due).toEqual([]);
  });

  it('skips appointments in the past', () => {
    const appts = [apptIn('a', -10)];
    const due = selectDueReminders(appts, new Set(), NOW, OFFSETS, 30);
    expect(due).toEqual([]);
  });

  it('handles many appointments, each independently', () => {
    const appts = [
      apptIn('due24', 1435), // 24h band
      apptIn('due2', 115), // 2h band
      apptIn('tooFar', 2000), // nothing
      apptIn('between', 600), // 10h → between bands, nothing
      apptIn('past', -5), // past
    ];
    const due = selectDueReminders(appts, new Set(), NOW, OFFSETS, 30);
    expect(due).toEqual([
      { appointmentId: 'due24', offsetLabel: '24h' },
      { appointmentId: 'due2', offsetLabel: '2h' },
    ]);
  });

  it('only the unsent offset fires when one of two was already sent', () => {
    // Appointment 2h away whose 24h reminder already went out earlier.
    const appts = [apptIn('a', 115)];
    const sent = new Set([reminderKey('a', '24h')]);
    const due = selectDueReminders(appts, sent, NOW, OFFSETS, 30);
    expect(due).toEqual([{ appointmentId: 'a', offsetLabel: '2h' }]);
  });
});
