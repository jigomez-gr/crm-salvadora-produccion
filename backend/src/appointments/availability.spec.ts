import { computeFreeSlots } from './availability';
import { WorkingHourSlot } from '../common/entities/agent-config.entity';
import {
  Appointment,
  AppointmentStatus,
  PaymentStatus,
} from '../common/entities/appointment.entity';

const workingHours: WorkingHourSlot[] = [
  { day: 1, open: '09:00', close: '17:00' }, // Monday
  { day: 2, open: '09:00', close: '17:00' }, // Tuesday
  { day: 3, open: '09:00', close: '17:00' }, // Wednesday
  { day: 4, open: '09:00', close: '17:00' }, // Thursday
  { day: 5, open: '09:00', close: '13:00' }, // Friday (shorter day)
];

function makeAppt(
  startsAt: string,
  endsAt: string,
  status: AppointmentStatus = AppointmentStatus.SCHEDULED,
): Appointment {
  return {
    id: 'appt-1',
    contactId: 'c1',
    service: 'Test',
    serviceId: null,
    calendarId: 'default',
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    status,
    agentKey: null,
    modality: 'in_person',
    reason: null,
    calBookingId: null,
    calBookingUid: null,
    calMeetingUrl: null,
    calStatus: null,
    notes: null,
    responseDocument: null,
    doctorReportPdf: null,
    doctorReportPdfName: null,
    doctorReportPdfMime: null,
    doctorReportPdfSize: null,
    patientAttachmentData: null,
    patientAttachmentName: null,
    patientAttachmentMime: null,
    patientAttachmentSize: null,
    patientAttachmentUploadedAt: null,
    aiAnalysisType: null,
    aiAnalysisResult: null,
    aiAnalysisDate: null,
    aiCroppedImageData: null,
    aiCroppedImageMime: null,
    price: null,
    paymentStatus: PaymentStatus.UNPAID,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    paymentUrl: null,
    paidAt: null,
    acceptedAt: null,
    acceptedBy: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    contact: null as any,
  };
}

const UTC_OPTS = { timezone: 'UTC', now: new Date('2020-01-01T00:00:00.000Z') };

describe('computeFreeSlots', () => {
  it('returns slots for a working day with no appointments', () => {
    // Monday 2025-01-06 in UTC
    const date = new Date('2025-01-06T00:00:00.000Z'); // Monday
    const slots = computeFreeSlots(date, 60, workingHours, [], UTC_OPTS);
    // 09:00-17:00 = 8 hours = 16 x 30-min steps, 60min duration => last slot starts at 16:00
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].startsAt.toISOString()).toBe('2025-01-06T09:00:00.000Z');
    expect(slots[0].endsAt.toISOString()).toBe('2025-01-06T10:00:00.000Z');
  });

  it('returns empty array for a non-working day (Sunday)', () => {
    const date = new Date('2025-01-05T00:00:00.000Z'); // Sunday
    const slots = computeFreeSlots(date, 60, workingHours, [], UTC_OPTS);
    expect(slots).toHaveLength(0);
  });

  it('excludes slot that conflicts with existing appointment', () => {
    const date = new Date('2025-01-06T00:00:00.000Z'); // Monday
    const appt = makeAppt('2025-01-06T09:00:00.000Z', '2025-01-06T10:00:00.000Z');
    const slots = computeFreeSlots(date, 60, workingHours, [appt], UTC_OPTS);
    // 09:00 is blocked
    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).not.toContain('2025-01-06T09:00:00.000Z');
    expect(starts).not.toContain('2025-01-06T09:30:00.000Z'); // 09:30–10:30 also conflicts
    expect(starts).toContain('2025-01-06T10:00:00.000Z');
  });

  it('allows cancelled appointments to be rebooked', () => {
    const date = new Date('2025-01-06T00:00:00.000Z'); // Monday
    const cancelledAppt = makeAppt(
      '2025-01-06T09:00:00.000Z',
      '2025-01-06T10:00:00.000Z',
      AppointmentStatus.CANCELLED,
    );
    const slots = computeFreeSlots(date, 60, workingHours, [cancelledAppt], UTC_OPTS);
    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).toContain('2025-01-06T09:00:00.000Z');
  });

  it('handles shorter days correctly (Friday 09:00-13:00)', () => {
    const date = new Date('2025-01-10T00:00:00.000Z'); // Friday
    const slots = computeFreeSlots(date, 60, workingHours, [], UTC_OPTS);
    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).toContain('2025-01-10T09:00:00.000Z');
    expect(starts).toContain('2025-01-10T12:00:00.000Z');
    expect(starts).not.toContain('2025-01-10T13:00:00.000Z');
  });

  it('handles 30-minute slots correctly', () => {
    const date = new Date('2025-01-06T00:00:00.000Z'); // Monday
    const slots = computeFreeSlots(date, 30, workingHours, [], UTC_OPTS);
    // 09:00 to 17:00 with 30-min slots = 16 slots
    expect(slots).toHaveLength(16);
  });

  it('excludes slots in the past relative to now', () => {
    const date = new Date('2025-01-06T00:00:00.000Z'); // Monday
    const now = new Date('2025-01-06T13:35:00.000Z'); // mid-afternoon
    const slots = computeFreeSlots(date, 60, workingHours, [], { timezone: 'UTC', now });
    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).not.toContain('2025-01-06T09:00:00.000Z');
    expect(starts).not.toContain('2025-01-06T13:30:00.000Z'); // 13:30 <= now? no, 13:30 < 13:35 -> excluded
    expect(starts[0]).toBe('2025-01-06T14:00:00.000Z');
  });

  it('generates slots as business-local wall-clock times (Europe/Madrid, CET +1)', () => {
    const date = new Date('2025-01-06T00:00:00.000Z'); // Monday
    const slots = computeFreeSlots(date, 60, workingHours, [], {
      timezone: 'Europe/Madrid',
      now: new Date('2020-01-01T00:00:00.000Z'),
    });
    // 09:00 Madrid (CET, UTC+1) === 08:00 UTC
    expect(slots[0].startsAt.toISOString()).toBe('2025-01-06T08:00:00.000Z');
  });

  it('does not place slot that would exceed closing time', () => {
    const date = new Date('2025-01-10T00:00:00.000Z'); // Friday closes at 13:00
    const slots = computeFreeSlots(date, 90, workingHours, [], UTC_OPTS);
    // Last slot must end at or before 13:00
    const lastSlot = slots[slots.length - 1];
    if (lastSlot) {
      expect(lastSlot.endsAt.getTime()).toBeLessThanOrEqual(
        new Date('2025-01-10T13:00:00.000Z').getTime(),
      );
    }
  });

  it('keeps group slot available when active appointments are below maxCapacity', () => {
    const date = new Date('2025-01-06T00:00:00.000Z'); // Monday
    // 5 existing appointments for yoga class (maxCapacity = 23)
    const existing = Array.from({ length: 5 }, (_, i) => ({
      ...makeAppt('2025-01-06T09:00:00.000Z', '2025-01-06T10:00:00.000Z'),
      id: `yoga-appt-${i + 1}`,
    }));

    const slots = computeFreeSlots(date, 60, workingHours, existing, {
      ...UTC_OPTS,
      maxCapacity: 23,
    });

    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).toContain('2025-01-06T09:00:00.000Z');
  });

  it('excludes group slot when active appointments reach maxCapacity', () => {
    const date = new Date('2025-01-06T00:00:00.000Z'); // Monday
    // 23 existing appointments for yoga class (maxCapacity = 23)
    const existing = Array.from({ length: 23 }, (_, i) => ({
      ...makeAppt('2025-01-06T09:00:00.000Z', '2025-01-06T10:00:00.000Z'),
      id: `yoga-appt-${i + 1}`,
    }));

    const slots = computeFreeSlots(date, 60, workingHours, existing, {
      ...UTC_OPTS,
      maxCapacity: 23,
    });

    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).not.toContain('2025-01-06T09:00:00.000Z');
    // Other slots without 23 appointments should still be available
    expect(starts).toContain('2025-01-06T10:00:00.000Z');
  });
});

