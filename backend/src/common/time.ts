import { TZDate } from '@date-fns/tz';

/**
 * Normalizes colloquial Spanish time expressions in text into standard HH:MM formats.
 * Examples:
 * - "16 y 30" / "las 16 y 30" / "16 y media" -> "16:30"
 * - "9 y 45" / "10 menos cuarto" -> "09:45"
 * - "11 y 15" / "11 y cuarto" -> "11:15"
 * - "4 y media de la tarde" -> "16:30"
 * - "4 de la tarde" -> "16:00"
 * - "16h30" / "16h" -> "16:30" / "16:00"
 * - "a las 16.30" -> "a las 16:30"
 */
export function normalizeColloquialSpanishTimes(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let result = text;

  // 1. 12-hour format with "de la tarde" / "de la noche" / "pm"
  // e.g. "4 y media de la tarde", "4 y 30 de la tarde" -> 16:30
  result = result.replace(
    /\b([1-9]|1[0-2])\s*y\s*(?:30|media)\s*(?:de la tarde|de la noche|pm)\b/gi,
    (_, h) => {
      const hour = (Number(h) % 12) + 12;
      return `${String(hour).padStart(2, '0')}:30`;
    },
  );

  // e.g. "4 y cuarto de la tarde", "4 y 15 de la tarde" -> 16:15
  result = result.replace(
    /\b([1-9]|1[0-2])\s*y\s*(?:15|cuarto)\s*(?:de la tarde|de la noche|pm)\b/gi,
    (_, h) => {
      const hour = (Number(h) % 12) + 12;
      return `${String(hour).padStart(2, '0')}:15`;
    },
  );

  // e.g. "5 menos cuarto de la tarde" -> 16:45
  result = result.replace(
    /\b([1-9]|1[0-2])\s*menos\s*(?:15|cuarto)\s*(?:de la tarde|de la noche|pm)\b/gi,
    (_, h) => {
      const hour = ((Number(h) - 1 + 12) % 12) + 12;
      return `${String(hour).padStart(2, '0')}:45`;
    },
  );

  // e.g. "4 de la tarde", "8 de la tarde", "9 de la noche" -> 16:00, 20:00, 21:00
  result = result.replace(
    /\b([1-9]|1[0-2])\s*(?:de la tarde|de la noche|pm)\b/gi,
    (_, h) => {
      const hour = (Number(h) % 12) + 12;
      return `${String(hour).padStart(2, '0')}:00`;
    },
  );

  // e.g. "9 de la mañana", "10 de la mañana", "8 am" -> 09:00, 10:00, 08:00
  result = result.replace(
    /\b([1-9]|1[0-2])\s*(?:de la mañana|am)\b/gi,
    (_, h) => `${String(Number(h)).padStart(2, '0')}:00`,
  );

  // 2. 24h & general "X menos cuarto / X menos 15"
  // e.g. "17 menos cuarto" -> "16:45", "10 menos cuarto" -> "09:45"
  result = result.replace(
    /\b([01]?\d|2[0-3])\s*menos\s*(?:15|cuarto)\b/gi,
    (_, h) => {
      const hour = (Number(h) - 1 + 24) % 24;
      return `${String(hour).padStart(2, '0')}:45`;
    },
  );

  // 3. "X y media" -> "X:30" (e.g. "16 y media" -> "16:30", "9 y media" -> "09:30")
  result = result.replace(
    /\b([01]?\d|2[0-3])\s*y\s*media\b/gi,
    (_, h) => `${String(Number(h)).padStart(2, '0')}:30`,
  );

  // 4. "X y cuarto" -> "X:15" (e.g. "11 y cuarto" -> "11:15")
  result = result.replace(
    /\b([01]?\d|2[0-3])\s*y\s*cuarto\b/gi,
    (_, h) => `${String(Number(h)).padStart(2, '0')}:15`,
  );

  // 5. "X y MM" -> "X:MM" where MM is 00-59
  // e.g. "16 y 30" -> "16:30", "9 y 45" -> "09:45", "11 y 15" -> "11:15", "17 y 00" -> "17:00", "20 y 15" -> "20:15"
  result = result.replace(
    /\b([01]?\d|2[0-3])\s*y\s*([0-5]\d)\b/gi,
    (_, h, min) => `${String(Number(h)).padStart(2, '0')}:${min}`,
  );

  // 6. "X y M" where M is single digit minute e.g. "16 y 5" -> "16:05" (if preceded by hora/a las or clear context)
  result = result.replace(
    /(?:a\s+las?|las?)\s+([01]?\d|2[0-3])\s*y\s*([0-9])\b/gi,
    (_, h, min) => `${String(Number(h)).padStart(2, '0')}:0${min}`,
  );

  // 7. "16h30", "16h", "16H30" -> "16:30", "16:00"
  result = result.replace(
    /\b([01]?\d|2[0-3])\s*[hH]\s*([0-5]\d)\b/g,
    (_, h, min) => `${String(Number(h)).padStart(2, '0')}:${min}`,
  );
  result = result.replace(
    /\b([01]?\d|2[0-3])\s*[hH]\b(?!\w)/g,
    (_, h) => `${String(Number(h)).padStart(2, '0')}:00`,
  );

  // 8. "a las 16.30" / "a las 16,30" -> "a las 16:30"
  result = result.replace(
    /(a\s+las?\s+|las?\s+)([01]?\d|2[0-3])[.,]([0-5]\d)\b/gi,
    (_, prefix, h, min) => `${prefix}${String(Number(h)).padStart(2, '0')}:${min}`,
  );

  return result;
}

/**
 * Extracts hour and minute from a string that might contain colloquial time or formatted time.
 */
export function extractHourAndMinute(input: string): { hour: number; minute: number } | null {
  if (!input || typeof input !== 'string') return null;

  const normalized = normalizeColloquialSpanishTimes(input.trim());

  // 1. Direct HH:MM(:SS)? match
  const timeMatch = normalized.match(/(?:^|\b|\s|T)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?:\b|\s|$)/);
  if (timeMatch) {
    return {
      hour: Number(timeMatch[1]),
      minute: Number(timeMatch[2]),
    };
  }

  // 2. Bare hour if explicit e.g. "16"
  const bareHourMatch = normalized.match(/^([01]?\d|2[0-3])$/);
  if (bareHourMatch) {
    return {
      hour: Number(bareHourMatch[1]),
      minute: 0,
    };
  }

  return null;
}

/**
 * Parses any flexible startsAt representation (ISO, local date-time, colloquial time, time-only)
 * into a valid ISO string in the specified business timezone.
 */
export function parseFlexibleStartsAt(
  rawStartsAt: string | undefined | null,
  timezone: string = 'Europe/Madrid',
  fallbackDate: Date = new Date(),
): string {
  if (!rawStartsAt || typeof rawStartsAt !== 'string') {
    return fallbackDate.toISOString();
  }

  const trimmed = rawStartsAt.trim();
  const normalized = normalizeColloquialSpanishTimes(trimmed);

  // 1. Complete standard ISO with Z or timezone offset (e.g. "2026-09-03T14:30:00.000Z" or "+02:00")
  if (
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(
      normalized,
    )
  ) {
    const d = new Date(normalized);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }

  // 2. Date + Time without timezone offset (e.g. "2026-09-03 16:30", "2026-09-03T16:30:00", "2026-09-03 16 y 30")
  const dateMatch = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (dateMatch) {
    const [, y, m, d, h, min, s] = dateMatch;
    const zoned = new TZDate(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(h),
      Number(min),
      Number(s || 0),
      timezone,
    );
    return new Date(zoned.getTime()).toISOString();
  }

  // 3. European date format "DD/MM/YYYY HH:MM" or "DD-MM-YYYY HH:MM"
  const euDateMatch = normalized.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[T ]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (euDateMatch) {
    const [, d, m, y, h, min, s] = euDateMatch;
    const zoned = new TZDate(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(h),
      Number(min),
      Number(s || 0),
      timezone,
    );
    return new Date(zoned.getTime()).toISOString();
  }

  // 4. Time-only extracted (e.g. "16:30", "16 y 30", "16 y media", "las 16 y 30", "4 y media de la tarde")
  const hm = extractHourAndMinute(trimmed);
  if (hm) {
    const zoned = new TZDate(
      fallbackDate.getFullYear(),
      fallbackDate.getMonth(),
      fallbackDate.getDate(),
      hm.hour,
      hm.minute,
      0,
      timezone,
    );
    return new Date(zoned.getTime()).toISOString();
  }

  // Fallback to standard Date parsing
  const fallback = new Date(normalized);
  if (!isNaN(fallback.getTime())) {
    return fallback.toISOString();
  }

  return fallbackDate.toISOString();
}
