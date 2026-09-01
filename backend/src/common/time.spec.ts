import {
  normalizeColloquialSpanishTimes,
  extractHourAndMinute,
  parseFlexibleStartsAt,
} from './time';

describe('Time Normalization & Parsing', () => {
  describe('normalizeColloquialSpanishTimes', () => {
    it('normalizes "16 y 30" and "las 16 y 30" to "16:30" / "las 16:30"', () => {
      expect(normalizeColloquialSpanishTimes('16 y 30')).toBe('16:30');
      expect(normalizeColloquialSpanishTimes('las 16 y 30')).toBe('las 16:30');
      expect(normalizeColloquialSpanishTimes('a las 16 y 30')).toBe('a las 16:30');
      expect(normalizeColloquialSpanishTimes('Quiero reservar el jueves a las 16 y 30 por favor')).toBe(
        'Quiero reservar el jueves a las 16:30 por favor',
      );
    });

    it('normalizes "16 y media" to "16:30"', () => {
      expect(normalizeColloquialSpanishTimes('16 y media')).toBe('16:30');
      expect(normalizeColloquialSpanishTimes('a las 16 y media')).toBe('a las 16:30');
    });

    it('normalizes "17 y 15" and "11 y cuarto" to "17:15" and "11:15"', () => {
      expect(normalizeColloquialSpanishTimes('17 y 15')).toBe('17:15');
      expect(normalizeColloquialSpanishTimes('11 y cuarto')).toBe('11:15');
    });

    it('normalizes "9 y 45" to "09:45"', () => {
      expect(normalizeColloquialSpanishTimes('9 y 45')).toBe('09:45');
      expect(normalizeColloquialSpanishTimes('a las 9 y 45')).toBe('a las 09:45');
    });

    it('normalizes "10 menos cuarto" and "17 menos cuarto"', () => {
      expect(normalizeColloquialSpanishTimes('10 menos cuarto')).toBe('09:45');
      expect(normalizeColloquialSpanishTimes('17 menos cuarto')).toBe('16:45');
    });

    it('normalizes 12h formats like "4 y media de la tarde"', () => {
      expect(normalizeColloquialSpanishTimes('4 y media de la tarde')).toBe('16:30');
      expect(normalizeColloquialSpanishTimes('4 y 30 de la tarde')).toBe('16:30');
      expect(normalizeColloquialSpanishTimes('4 de la tarde')).toBe('16:00');
      expect(normalizeColloquialSpanishTimes('5 y cuarto de la tarde')).toBe('17:15');
      expect(normalizeColloquialSpanishTimes('5 menos cuarto de la tarde')).toBe('16:45');
    });

    it('normalizes "16h30" and "16h"', () => {
      expect(normalizeColloquialSpanishTimes('16h30')).toBe('16:30');
      expect(normalizeColloquialSpanishTimes('16h')).toBe('16:00');
    });

    it('normalizes "a las 16.30" / "a las 16,30"', () => {
      expect(normalizeColloquialSpanishTimes('a las 16.30')).toBe('a las 16:30');
      expect(normalizeColloquialSpanishTimes('las 16,30')).toBe('las 16:30');
    });
  });

  describe('extractHourAndMinute', () => {
    it('extracts hour and minute from "16 y 30"', () => {
      expect(extractHourAndMinute('16 y 30')).toEqual({ hour: 16, minute: 30 });
      expect(extractHourAndMinute('a las 16 y 30')).toEqual({ hour: 16, minute: 30 });
      expect(extractHourAndMinute('16:30')).toEqual({ hour: 16, minute: 30 });
      expect(extractHourAndMinute('16 y media')).toEqual({ hour: 16, minute: 30 });
    });

    it('extracts hour and minute from "9 y 45"', () => {
      expect(extractHourAndMinute('9 y 45')).toEqual({ hour: 9, minute: 45 });
    });

    it('extracts hour and minute from "4 y media de la tarde"', () => {
      expect(extractHourAndMinute('4 y media de la tarde')).toEqual({ hour: 16, minute: 30 });
    });
  });

  describe('parseFlexibleStartsAt', () => {
    const fixedDate = new Date('2026-09-03T00:00:00.000Z'); // Thursday

    it('handles full ISO string', () => {
      const iso = '2026-09-03T14:30:00.000Z';
      expect(parseFlexibleStartsAt(iso, 'Europe/Madrid', fixedDate)).toBe(iso);
    });

    it('handles "2026-09-03 16:30" in Europe/Madrid (UTC+2 in Sept)', () => {
      const parsed = parseFlexibleStartsAt('2026-09-03 16:30', 'Europe/Madrid', fixedDate);
      expect(parsed).toBe('2026-09-03T14:30:00.000Z');
    });

    it('handles "2026-09-03 16 y 30" in Europe/Madrid', () => {
      const parsed = parseFlexibleStartsAt('2026-09-03 16 y 30', 'Europe/Madrid', fixedDate);
      expect(parsed).toBe('2026-09-03T14:30:00.000Z');
    });

    it('handles time-only "16 y 30" with fallbackDate', () => {
      const parsed = parseFlexibleStartsAt('16 y 30', 'Europe/Madrid', fixedDate);
      // fixedDate is 2026-09-03. In Madrid summer time (UTC+2), 16:30 is 14:30 UTC.
      const d = new Date(parsed);
      expect(d.toISOString()).toBe('2026-09-03T14:30:00.000Z');
    });

    it('handles "16:30"', () => {
      const parsed = parseFlexibleStartsAt('16:30', 'Europe/Madrid', fixedDate);
      expect(parsed).toBe('2026-09-03T14:30:00.000Z');
    });

    it('handles "a las 16 y media"', () => {
      const parsed = parseFlexibleStartsAt('a las 16 y media', 'Europe/Madrid', fixedDate);
      expect(parsed).toBe('2026-09-03T14:30:00.000Z');
    });
  });
});
