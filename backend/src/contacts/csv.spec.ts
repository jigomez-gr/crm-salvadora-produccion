import { parseCsv, toCsv } from './csv';

describe('parseCsv', () => {
  it('parses a simple table', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('does not emit a spurious empty row for a trailing newline', () => {
    expect(parseCsv('a\n1\n')).toEqual([['a'], ['1']]);
  });

  it('parses quoted fields with embedded commas', () => {
    expect(parseCsv('name,note\n"Doe, Jane","hi, there"')).toEqual([
      ['name', 'note'],
      ['Doe, Jane', 'hi, there'],
    ]);
  });

  it('parses escaped quotes ("") inside a quoted field', () => {
    expect(parseCsv('q\n"say ""hi"""')).toEqual([['q'], ['say "hi"']]);
  });

  it('parses a newline inside a quoted field', () => {
    expect(parseCsv('q\n"line1\nline2"')).toEqual([['q'], ['line1\nline2']]);
  });

  it('keeps empty cells', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('toCsv', () => {
  it('serializes a table with CRLF', () => {
    expect(
      toCsv([
        ['a', 'b'],
        ['1', '2'],
      ]),
    ).toBe('a,b\r\n1,2');
  });

  it('quotes cells containing commas, quotes or newlines', () => {
    expect(toCsv([['Doe, Jane', 'say "hi"', 'a\nb']])).toBe(
      '"Doe, Jane","say ""hi""","a\nb"',
    );
  });

  it('neutralizes spreadsheet formula-injection cells with a leading apostrophe', () => {
    expect(toCsv([['=1+1'], ['@SUM(A1)'], ['-2+cmd']])).toBe(
      "'=1+1\r\n'@SUM(A1)\r\n'-2+cmd",
    );
  });

  it('leaves plain phone/number cells unguarded (lossless round-trip)', () => {
    expect(toCsv([['+34600111222'], ['-5']])).toBe('+34600111222\r\n-5');
  });

  it('round-trips through parseCsv', () => {
    const rows = [
      ['name', 'phone', 'tags'],
      ['Ana, María', '+34600111222', 'vip;recordar'],
      ['Quote "Q"', '+34600111223', ''],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
