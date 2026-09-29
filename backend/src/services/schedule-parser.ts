const DAY_MAP: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
  sabados: 6,
  sábados: 6,
  domingo: 0,
  domingos: 0,
};

function normalizeDay(name: string): number | undefined {
  if (!name) return undefined;
  const clean = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return DAY_MAP[clean] ?? DAY_MAP[name.toLowerCase()];
}

function formatTime(h: string, m: string): string {
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

/**
 * Parses human-readable Spanish schedule text into a structured weeklySchedule.
 * Examples:
 * - "Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15) y Jueves (9:45, 11:15, 16:00, 17:30, 19:00)"
 *   -> { 2: ['09:45', '11:15', '17:00', '18:30', '20:00'], 3: ['20:15'], 4: ['09:45', '11:15', '16:00', '17:30', '19:00'] }
 * - "Lunes a Jueves a las 14:00 y 20:45"
 *   -> { 1: ['14:00', '20:45'], 2: ['14:00', '20:45'], 3: ['14:00', '20:45'], 4: ['14:00', '20:45'] }
 * - "Viernes o Sábados a las 18:00 y 20:00"
 *   -> { 5: ['18:00', '20:00'], 6: ['18:00', '20:00'] }
 * - "Martes y Jueves de 09:15 a 09:45"
 *   -> { 2: ['09:15'], 4: ['09:15'] }
 * - "Lunes de 20:00 a 21:00 y Jueves de 20:30 a 22:00"
 *   -> { 1: ['20:00'], 4: ['20:30'] }
 */
export function parseWeeklyScheduleFromText(
  text: string | null | undefined,
): Record<number, string[]> | null {
  if (!text || typeof text !== 'string') return null;

  const result: Record<number, string[]> = {};
  let matchedAny = false;

  const addTime = (dayNum: number | undefined, time: string) => {
    if (dayNum === undefined) return;
    result[dayNum] = Array.from(new Set([...(result[dayNum] || []), time])).sort();
    matchedAny = true;
  };

  // 1. Day range with 'a' / 'al' / 'hasta' followed by times
  // e.g. "Lunes a Jueves a las 14:00 y 20:45", "Lunes a Jueves (14:00, 20:45)"
  const rangeRegex =
    /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)\s+(?:a|al|hasta)\s+(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)\s*(?:a\s+las|de|:\s*|\()\s*([^);.]+)/gi;

  let match: RegExpExecArray | null;
  while ((match = rangeRegex.exec(text)) !== null) {
    const startDay = normalizeDay(match[1]);
    const endDay = normalizeDay(match[2]);
    if (startDay === undefined || endDay === undefined) continue;

    const days: number[] = [];
    if (startDay <= endDay) {
      for (let d = startDay; d <= endDay; d++) days.push(d);
    } else {
      for (let d = startDay; d <= 6; d++) days.push(d);
      for (let d = 0; d <= endDay; d++) days.push(d);
    }

    const timesBlock = match[3] || '';
    const timesRegex = /\b(\d{1,2}):(\d{2})\b/g;
    let tMatch: RegExpExecArray | null;
    const times: string[] = [];
    while ((tMatch = timesRegex.exec(timesBlock)) !== null) {
      times.push(formatTime(tMatch[1], tMatch[2]));
    }

    if (times.length > 0) {
      for (const d of days) {
        for (const t of times) {
          addTime(d, t);
        }
      }
    }
  }

  // 2. Multi-day list with 'y' or 'o': "Viernes o Sábados a las 18:00 y 20:00", "Martes y Jueves de 09:15 a 09:45"
  const multiDayListRegex =
    /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)\s*(?:,|y|o)\s*(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)\s*(?:a\s+las|de|:\s*|\()\s*([^);.]+)/gi;

  while ((match = multiDayListRegex.exec(text)) !== null) {
    const day1 = normalizeDay(match[1]);
    const day2 = normalizeDay(match[2]);
    const timesBlock = match[3] || '';
    const timesRegex = /\b(\d{1,2}):(\d{2})\b/g;
    let tMatch: RegExpExecArray | null;
    const times: string[] = [];
    while ((tMatch = timesRegex.exec(timesBlock)) !== null) {
      times.push(formatTime(tMatch[1], tMatch[2]));
    }
    if (times.length > 0) {
      for (const d of [day1, day2]) {
        if (d !== undefined) {
          if (
            /de\s+\d{1,2}:\d{2}\s+a\s+\d{1,2}:\d{2}/i.test(match[0]) &&
            !/y\s+\d{1,2}:\d{2}/i.test(match[0])
          ) {
            addTime(d, times[0]);
          } else {
            for (const t of times) addTime(d, t);
          }
        }
      }
    }
  }

  // 3. Day followed by parentheses or colon with comma-separated times
  // e.g. "Martes (9:45, 11:15, 17:00, 18:30, 20:00)"
  const daySegmentRegex =
    /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)[\s:]*(?:\(([^)]+)\)|:?\s*([^,;()]+(?:,\s*\d{1,2}:\d{2})+))/gi;

  while ((match = daySegmentRegex.exec(text)) !== null) {
    const dayNum = normalizeDay(match[1]);
    if (dayNum === undefined) continue;

    const timesBlock = match[2] || match[3] || '';
    const timesRegex = /\b(\d{1,2}):(\d{2})\b/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = timesRegex.exec(timesBlock)) !== null) {
      addTime(dayNum, formatTime(tMatch[1], tMatch[2]));
    }
  }

  // 4. Single day: "Lunes de 20:00 a 21:00"
  const singleDayRangeRegex =
    /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)\s*(?:de\s+)?(\d{1,2}):(\d{2})\s*(?:a\s+\d{1,2}:\d{2})?/gi;

  while ((match = singleDayRangeRegex.exec(text)) !== null) {
    const dayNum = normalizeDay(match[1]);
    if (dayNum !== undefined) {
      addTime(dayNum, formatTime(match[2], match[3]));
    }
  }

  return matchedAny && Object.keys(result).length > 0 ? result : null;
}
