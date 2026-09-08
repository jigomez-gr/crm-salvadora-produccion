import { parseWeeklyScheduleFromText } from './schedule-parser';

describe('schedule-parser', () => {
  it('parses Hatha Yoga schedule correctly with 16:00', () => {
    const text =
      'Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15) y Jueves (9:45, 11:15, 16:00, 17:30, 19:00)';
    const parsed = parseWeeklyScheduleFromText(text);

    expect(parsed).toEqual({
      2: ['09:45', '11:15', '17:00', '18:30', '20:00'],
      3: ['20:15'],
      4: ['09:45', '11:15', '16:00', '17:30', '19:00'],
    });
  });

  it('parses Meditaciones Guiadas schedule correctly', () => {
    const text = 'Martes y Jueves de 09:15 a 09:45';
    const parsed = parseWeeklyScheduleFromText(text);

    expect(parsed).toEqual({
      2: ['09:15'],
      4: ['09:15'],
    });
  });

  it('parses Iaido schedule correctly', () => {
    const text = 'Lunes de 20:00 a 21:00 y Jueves de 20:30 a 22:00';
    const parsed = parseWeeklyScheduleFromText(text);

    expect(parsed).toEqual({
      1: ['20:00'],
      4: ['20:30'],
    });
  });

  it('parses schedule with colon separation: "Martes: 9:45, 11:15"', () => {
    const text = 'Martes: 9:45, 11:15, 17:00; Jueves: 16:00, 17:30';
    const parsed = parseWeeklyScheduleFromText(text);

    expect(parsed).toEqual({
      2: ['09:45', '11:15', '17:00'],
      4: ['16:00', '17:30'],
    });
  });
});
