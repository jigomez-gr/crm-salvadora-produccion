const DAY_MAP: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
  domingo: 0,
};

function formatTime(h: string, m: string): string {
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

/**
 * Parses human-readable Spanish schedule text into a structured weeklySchedule.
 * Examples:
 * - "Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15) y Jueves (9:45, 11:15, 16:00, 17:30, 19:00)"
 *   -> { 2: ['09:45', '11:15', '17:00', '18:30', '20:00'], 3: ['20:15'], 4: ['09:45', '11:15', '16:00', '17:30', '19:00'] }
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

  // Pattern 1: Day followed by parentheses or colon with comma-separated times
  // e.g. "Martes (9:45, 11:15, 17:00, 18:30, 20:00)" or "Martes: 9:45, 11:15"
  const daySegmentRegex =
    /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)[\s:]*(?:\(([^)]+)\)|:?\s*([^,;()]+(?:,\s*\d{1,2}:\d{2})+))/gi;

  let match: RegExpExecArray | null;

  while ((match = daySegmentRegex.exec(text)) !== null) {
    const rawDay = match[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const dayNum = DAY_MAP[rawDay] ?? DAY_MAP[match[1].toLowerCase()];
    if (dayNum === undefined) continue;

    const timesBlock = match[2] || match[3] || '';
    const timesRegex = /\b(\d{1,2}):(\d{2})\b/g;
    let tMatch: RegExpExecArray | null;
    const times: string[] = [];

    while ((tMatch = timesRegex.exec(timesBlock)) !== null) {
      times.push(formatTime(tMatch[1], tMatch[2]));
    }

    if (times.length > 0) {
      result[dayNum] = Array.from(new Set([...(result[dayNum] || []), ...times])).sort();
      matchedAny = true;
    }
  }

  // Pattern 2: "Martes y Jueves de 09:15 a 09:45"
  const multiDayRangeRegex =
    /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s*(?:,|y)\s*(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s*(?:de\s+)?(\d{1,2}):(\d{2})/gi;

  while ((match = multiDayRangeRegex.exec(text)) !== null) {
    const day1 = match[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const day2 = match[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const time = formatTime(match[3], match[4]);

    for (const dName of [day1, day2]) {
      const dayNum = DAY_MAP[dName];
      if (dayNum !== undefined) {
        result[dayNum] = Array.from(new Set([...(result[dayNum] || []), time])).sort();
        matchedAny = true;
      }
    }
  }

  // Pattern 3: "Lunes de 20:00 a 21:00" or "Jueves de 20:30 a 22:00"
  const singleDayRangeRegex =
    /(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s*(?:de\s+)?(\d{1,2}):(\d{2})\s*(?:a\s+\d{1,2}:\d{2})?/gi;

  while ((match = singleDayRangeRegex.exec(text)) !== null) {
    const dName = match[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const dayNum = DAY_MAP[dName];
    const time = formatTime(match[2], match[3]);
    if (dayNum !== undefined) {
      result[dayNum] = Array.from(new Set([...(result[dayNum] || []), time])).sort();
      matchedAny = true;
    }
  }

  return matchedAny && Object.keys(result).length > 0 ? result : null;
}
