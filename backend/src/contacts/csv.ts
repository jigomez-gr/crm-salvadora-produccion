/**
 * Pure, dependency-free CSV (RFC 4180-ish) parse + serialize — no NestJS/DB/I-O,
 * so the riskiest part of import/export (quoting, embedded commas/newlines,
 * escaped quotes) is exhaustively unit-testable. Mirrors the pure-core pattern
 * of reminder-selection.ts / inbound-parser.ts.
 */

/**
 * Parse CSV text into rows of string cells. Handles:
 * - quoted fields containing commas, newlines and escaped quotes (`""`),
 * - both LF and CRLF line endings,
 * - a trailing newline (not emitted as a spurious empty row).
 * A fully empty input yields `[]`.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let started = false; // did the current row have any content/cell?

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    started = true;

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushRow();
    } else if (c === '\r') {
      // swallow — a following \n triggers the row; a lone \r also ends a row
      if (text[i + 1] !== '\n') pushRow();
    } else {
      field += c;
    }
  }

  // Flush the last field/row unless the input ended exactly on a newline.
  if (started || field.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows;
}

/** Serialize rows of cells to CSV text (quoting cells that need it). */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');
}

function escapeCell(value: string): string {
  let v = value ?? '';
  // Neutralize spreadsheet formula injection (OWASP): a cell a spreadsheet would
  // treat as a formula (starts with = + - @, tab or CR) gets a leading apostrophe
  // so Excel/Sheets render it as literal text instead of executing it. A plain
  // phone/number (e.g. "+34600111222", "-5") is NOT a formula — Excel just
  // evaluates it to the number, no code runs — so it's left untouched, which also
  // keeps the CSV export→import round-trip lossless. Export-only; stored data is
  // unchanged.
  if (/^[=+@\t\r-]/.test(v) && !/^[+-]?[\d\s.,()+-]+$/.test(v)) {
    v = `'${v}`;
  }
  if (/[",\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
