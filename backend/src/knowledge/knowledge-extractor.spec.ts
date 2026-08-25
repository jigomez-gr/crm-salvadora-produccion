import {
  normalizeExtension,
  isAcceptedExtension,
  normalizeWhitespace,
  extractText,
  UnsupportedFormatError,
} from './knowledge-extractor';

describe('normalizeExtension', () => {
  it('extracts a lowercase extension', () => {
    expect(normalizeExtension('FAQ.PDF')).toBe('pdf');
    expect(normalizeExtension('precios.final.xlsx')).toBe('xlsx');
  });
  it('returns "" when there is no extension', () => {
    expect(normalizeExtension('README')).toBe('');
  });
});

describe('isAcceptedExtension', () => {
  it('accepts the supported formats', () => {
    for (const ext of ['txt', 'md', 'csv', 'pdf', 'docx', 'xlsx']) {
      expect(isAcceptedExtension(ext)).toBe(true);
    }
  });
  it('rejects unsupported/dangerous formats', () => {
    for (const ext of ['exe', 'doc', 'xls', 'zip', '']) {
      expect(isAcceptedExtension(ext)).toBe(false);
    }
  });
});

describe('normalizeWhitespace', () => {
  it('normalises CRLF and collapses blank-line runs', () => {
    expect(normalizeWhitespace('a\r\n\r\n\r\n\r\nb')).toBe('a\n\nb');
  });
  it('strips NUL bytes (Postgres text/tsvector reject them)', () => {
    const withNul = `ho${String.fromCharCode(0)}la`;
    expect(normalizeWhitespace(withNul)).toBe('hola');
  });
  it('trims trailing spaces before newlines and overall', () => {
    expect(normalizeWhitespace('  line1   \n  line2  ')).toBe('line1\n  line2');
  });
});

describe('extractText (text formats)', () => {
  it('decodes .txt as UTF-8', async () => {
    const r = await extractText(Buffer.from('Horario: 9-18h', 'utf8'), 'info.txt');
    expect(r).toEqual({ text: 'Horario: 9-18h', extension: 'txt', mimeType: 'text/plain' });
  });
  it('decodes .md as markdown', async () => {
    const r = await extractText(Buffer.from('# Título\n\nTexto', 'utf8'), 'faq.md');
    expect(r.extension).toBe('md');
    expect(r.mimeType).toBe('text/markdown');
    expect(r.text).toBe('# Título\n\nTexto');
  });
  it('decodes .csv as text', async () => {
    const r = await extractText(Buffer.from('a,b\n1,2', 'utf8'), 'data.csv');
    expect(r.mimeType).toBe('text/csv');
  });
  it('throws UnsupportedFormatError for a disallowed extension', async () => {
    await expect(extractText(Buffer.from('x'), 'virus.exe')).rejects.toBeInstanceOf(
      UnsupportedFormatError,
    );
  });
});
