import { businessDayWindow } from './business-day';

describe('businessDayWindow', () => {
  it('spans exactly 24h', () => {
    const { start, end } = businessDayWindow(
      new Date('2026-07-01T10:30:00Z'),
      'Europe/Madrid',
    );
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('anchors to local midnight in the business tz (Madrid = UTC+2 in summer)', () => {
    // 2026-07-01 00:30 Madrid (summer, UTC+2) is 2026-06-30 22:30 UTC — the
    // business day is 2026-07-01, so the window must start at 2026-06-30T22:00Z.
    const { start, end } = businessDayWindow(
      new Date('2026-06-30T22:30:00Z'),
      'Europe/Madrid',
    );
    expect(start.toISOString()).toBe('2026-06-30T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-01T22:00:00.000Z');
  });

  it('winter offset (Madrid = UTC+1) anchors correctly', () => {
    const { start } = businessDayWindow(
      new Date('2026-01-15T09:00:00Z'),
      'Europe/Madrid',
    );
    expect(start.toISOString()).toBe('2026-01-14T23:00:00.000Z');
  });

  it('a late-night instant still resolves to that local day', () => {
    // 23:45 Madrid summer = 21:45 UTC → same business day starts 22:00 UTC prev.
    const { start, end } = businessDayWindow(
      new Date('2026-07-01T21:45:00Z'),
      'Europe/Madrid',
    );
    expect(start.toISOString()).toBe('2026-06-30T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-01T22:00:00.000Z');
  });

  it('UTC timezone is a plain midnight window', () => {
    const { start, end } = businessDayWindow(
      new Date('2026-07-01T13:00:00Z'),
      'UTC',
    );
    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-02T00:00:00.000Z');
  });
});
