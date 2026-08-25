import {
  ApptRow,
  ApptStatus,
  PipelineStageCounts,
  ReportSummary,
  buildConversionFunnel,
  buildReportSummary,
  buildServiceStats,
  buildSourceStats,
  computeTrend,
  computeTrends,
  dayKey,
  enumerateDays,
  hourOf,
} from './report-aggregation';

const TZ = 'Europe/Madrid';

// Test helpers so a status-only appointment still satisfies ApptRow.
function appt(
  startsAt: string,
  status: ApptStatus,
  service = 'Corte',
  price: string | null = null,
): ApptRow {
  return { startsAt: new Date(startsAt), status, service, price };
}
const EMPTY_PIPELINE: PipelineStageCounts = {
  new: 0,
  contacted: 0,
  qualified: 0,
  booked: 0,
  won: 0,
  lost: 0,
};

describe('day/hour bucketing (business timezone)', () => {
  it('buckets an instant into the business-local day, not UTC', () => {
    // 2026-06-30 22:30 UTC is already 2026-07-01 00:30 in Madrid (UTC+2 in DST).
    const d = new Date('2026-06-30T22:30:00.000Z');
    expect(dayKey(d, TZ)).toBe('2026-07-01');
    expect(hourOf(d, TZ)).toBe(0);
  });

  it('enumerates inclusive day keys and dedups', () => {
    const from = new Date('2026-07-01T10:00:00.000Z');
    const to = new Date('2026-07-03T10:00:00.000Z');
    expect(enumerateDays(from, to, TZ)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ]);
  });
});

describe('buildReportSummary', () => {
  const from = new Date('2026-07-01T00:00:00.000Z');
  // Keep `to` within 2026-07-02 in Madrid (UTC+2 in summer) so the range spans
  // exactly two local days.
  const to = new Date('2026-07-02T20:00:00.000Z');

  it('aggregates statuses, rates, day series and hour buckets', () => {
    const summary = buildReportSummary(
      {
        appointments: [
          appt('2026-07-01T08:00:00.000Z', 'completed'),
          appt('2026-07-01T09:00:00.000Z', 'cancelled'),
          appt('2026-07-02T08:00:00.000Z', 'scheduled'),
          appt('2026-07-02T08:30:00.000Z', 'completed'),
        ],
        messages: [
          { createdAt: new Date('2026-07-01T08:00:00.000Z'), direction: 'inbound' },
          { createdAt: new Date('2026-07-01T08:05:00.000Z'), direction: 'outbound' },
          { createdAt: new Date('2026-07-02T08:00:00.000Z'), direction: 'inbound' },
        ],
        newContacts: [
          { createdAt: new Date('2026-07-01T08:00:00.000Z') },
          { createdAt: new Date('2026-07-01T09:00:00.000Z') },
        ],
        contactsByStatus: { lead: 6, active: 3, inactive: 1 },
        pipelineStageCounts: EMPTY_PIPELINE,
        sources: [],
      },
      from,
      to,
      TZ,
    );

    // Appointments
    expect(summary.appointments.total).toBe(4);
    expect(summary.appointments.byStatus).toEqual({
      scheduled: 1,
      completed: 2,
      cancelled: 1,
    });
    expect(summary.appointments.completionRate).toBe(0.5); // 2/4
    expect(summary.appointments.cancellationRate).toBe(0.25); // 1/4
    // Two days in range, continuous.
    expect(summary.appointments.byDay.map((d) => d.date)).toEqual([
      '2026-07-01',
      '2026-07-02',
    ]);
    expect(summary.appointments.byDay[0]).toEqual({
      date: '2026-07-01',
      scheduled: 0,
      completed: 1,
      cancelled: 1,
    });
    // 08:00 UTC = 10:00 Madrid (DST).
    expect(summary.appointments.byHour[10]).toBe(3);
    expect(summary.appointments.byHour).toHaveLength(24);

    // Messages
    expect(summary.messages).toMatchObject({ total: 3, inbound: 2, outbound: 1 });
    expect(summary.messages.byDay[0]).toEqual({
      date: '2026-07-01',
      inbound: 1,
      outbound: 1,
    });

    // Contacts (snapshot + conversion)
    expect(summary.contacts.total).toBe(10);
    expect(summary.contacts.conversionRate).toBe(0.3); // 3/10
    expect(summary.contacts.newByDay).toEqual([
      { date: '2026-07-01', count: 2 },
      { date: '2026-07-02', count: 0 },
    ]);
  });

  it('is safe on empty input (no divide-by-zero)', () => {
    const summary = buildReportSummary(
      {
        appointments: [],
        messages: [],
        newContacts: [],
        contactsByStatus: { lead: 0, active: 0, inactive: 0 },
        pipelineStageCounts: EMPTY_PIPELINE,
        sources: [],
      },
      from,
      to,
      TZ,
    );
    expect(summary.appointments.completionRate).toBe(0);
    expect(summary.appointments.cancellationRate).toBe(0);
    expect(summary.contacts.conversionRate).toBe(0);
    expect(summary.messages.total).toBe(0);
    expect(summary.appointments.byHour.every((h) => h === 0)).toBe(true);
    expect(summary.appointments.byService).toEqual([]);
    expect(summary.appointments.revenue.total).toBe(0);
  });

  it('computes revenue over non-cancelled appointments, by day', () => {
    const summary = buildReportSummary(
      {
        appointments: [
          appt('2026-07-01T08:00:00.000Z', 'completed', 'Corte', '20'),
          appt('2026-07-01T09:00:00.000Z', 'scheduled', 'Tinte', '50.5'),
          // cancelled → excluded from revenue, still counted in totals
          appt('2026-07-01T10:00:00.000Z', 'cancelled', 'Corte', '20'),
          // no price → contributes 0
          appt('2026-07-02T08:00:00.000Z', 'completed', 'Corte', null),
        ],
        messages: [],
        newContacts: [],
        contactsByStatus: { lead: 0, active: 0, inactive: 0 },
        pipelineStageCounts: EMPTY_PIPELINE,
        sources: [],
      },
      from,
      to,
      TZ,
    );
    expect(summary.appointments.revenue.total).toBe(70.5); // 20 + 50.5
    expect(summary.appointments.revenue.byDay[0]).toEqual({
      date: '2026-07-01',
      amount: 70.5,
    });
    expect(summary.appointments.revenue.byDay[1]).toEqual({
      date: '2026-07-02',
      amount: 0,
    });
  });
});

describe('buildServiceStats', () => {
  it('groups by service and collapses the tail into "Otros"', () => {
    const rows: ApptRow[] = [];
    // 9 distinct services so we exceed the top-8 cap.
    for (let i = 0; i < 9; i++) {
      const count = 9 - i; // service0 has 9, service8 has 1
      for (let j = 0; j < count; j++) {
        rows.push(appt('2026-07-01T08:00:00.000Z', 'completed', `svc${i}`, '10'));
      }
    }
    const stats = buildServiceStats(rows);
    expect(stats).toHaveLength(9); // 8 + Otros
    expect(stats[0].service).toBe('svc0');
    expect(stats[0].total).toBe(9);
    const otros = stats[stats.length - 1];
    expect(otros.service).toBe('Otros');
    expect(otros.total).toBe(1); // only svc8 fell into the tail
  });

  it('revenue excludes cancelled per service', () => {
    const stats = buildServiceStats([
      appt('2026-07-01T08:00:00.000Z', 'completed', 'Corte', '20'),
      appt('2026-07-01T09:00:00.000Z', 'cancelled', 'Corte', '20'),
    ]);
    expect(stats[0]).toMatchObject({
      service: 'Corte',
      total: 2,
      completed: 1,
      cancelled: 1,
      revenue: 20,
    });
  });
});

describe('buildSourceStats', () => {
  it('merges case variants, tops the list, keeps "Sin origen" apart', () => {
    const stats = buildSourceStats([
      { source: 'Instagram', total: 30, converted: 3 },
      { source: 'instagram', total: 10, converted: 1 },
      { source: null, total: 5, converted: 0 },
      { source: '  ', total: 2, converted: 0 },
    ]);
    const insta = stats.find((s) => s.source === 'Instagram');
    expect(insta).toEqual({ source: 'Instagram', total: 40, converted: 4 });
    const none = stats.find((s) => s.source === 'Sin origen');
    expect(none).toEqual({ source: 'Sin origen', total: 7, converted: 0 });
  });

  it('never emits duplicate labels when a source is literally "Otros"', () => {
    // A user-entered "Otros" (top by count) alongside >6 other named sources so a
    // computed tail bucket (also "Otros") is produced — must merge into one row.
    const rows = [
      { source: 'Otros', total: 100, converted: 10 },
      ...Array.from({ length: 8 }, (_, i) => ({
        source: `Fuente${i}`,
        total: 8 - i,
        converted: 0,
      })),
    ];
    const stats = buildSourceStats(rows);
    const labels = stats.map((s) => s.source);
    expect(new Set(labels).size).toBe(labels.length); // no duplicate keys
    expect(labels.filter((l) => l === 'Otros')).toHaveLength(1);
  });
});

describe('buildConversionFunnel', () => {
  it('is monotonically non-increasing (at-or-beyond counts, excludes lost)', () => {
    const funnel = buildConversionFunnel({
      new: 10,
      contacted: 6,
      qualified: 4,
      booked: 3,
      won: 2,
      lost: 5, // excluded from the funnel entirely
    });
    expect(funnel.map((f) => [f.key, f.count])).toEqual([
      ['leads', 25], // 10+6+4+3+2
      ['contacted', 15], // 6+4+3+2
      ['qualified', 9], // 4+3+2
      ['booked', 5], // 3+2
      ['won', 2],
    ]);
    // strictly non-increasing
    for (let i = 1; i < funnel.length; i++) {
      expect(funnel[i].count).toBeLessThanOrEqual(funnel[i - 1].count);
    }
  });
});

describe('computeTrend / computeTrends', () => {
  it('marks a rise as good when higherIsBetter', () => {
    expect(computeTrend(10, 6, true)).toMatchObject({
      delta: 4,
      direction: 'up',
      good: true,
    });
  });
  it('inverts semantics when lowerIsBetter (cancellations)', () => {
    expect(computeTrend(0.1, 0.25, false)).toMatchObject({
      direction: 'down',
      good: true,
    });
  });
  it('flat delta is neutral (good=null)', () => {
    expect(computeTrend(5, 5, true)).toMatchObject({ direction: 'flat', good: null });
  });

  it('computeTrends wires the four KPIs against the previous window', () => {
    const summary = {
      appointments: { total: 8, completionRate: 0.5, cancellationRate: 0.25 },
      contacts: { newByDay: [{ date: 'x', count: 4 }] },
    } as unknown as ReportSummary;
    const trends = computeTrends(summary, {
      appointments: { total: 4, completed: 1, cancelled: 2 }, // rates .25 / .5
      newContacts: 2,
    });
    expect(trends.appointments).toMatchObject({ current: 8, previous: 4, good: true });
    expect(trends.completionRate).toMatchObject({ good: true }); // .5 > .25
    expect(trends.cancellationRate).toMatchObject({ good: true }); // .25 < .5, lower better
    expect(trends.newContacts).toMatchObject({ current: 4, previous: 2, good: true });
  });
});
