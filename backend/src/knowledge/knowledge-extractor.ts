import * as mammoth from 'mammoth';
import * as ExcelJS from 'exceljs';

/**
 * Multi-format plain-text extraction for uploaded knowledge-base files. We store
 * only the extracted TEXT (never the original bytes), so this runs once on
 * upload. All parsers are pure-JS CommonJS libs (no native addons): `mammoth`
 * (.docx), `exceljs` (.xlsx), and `pdf-parse` v2 (.pdf, lazily imported so pdfjs
 * only loads when a PDF is actually parsed). Text/markdown/csv are decoded
 * directly.
 */

// Accepted upload extensions (lowercase, no dot). Word .doc (legacy binary) and
// Excel .xls (legacy binary) are intentionally NOT supported: re-save as
// .docx/.xlsx.
export const ACCEPTED_EXTENSIONS = [
  'txt',
  'text',
  'md',
  'markdown',
  'csv',
  'pdf',
  'docx',
  'docm',
  'xlsx',
  'xlsm',
] as const;

const TEXT_EXTENSIONS = new Set(['txt', 'text', 'md', 'markdown', 'csv']);

// The NUL character, built via fromCharCode so no NUL byte lives in this source
// file. Postgres text/tsvector reject NUL, which binary parsers can emit, so it
// is stripped from every extracted document.
const NUL_CHAR = String.fromCharCode(0);

export interface ExtractResult {
  text: string;
  extension: string;
  mimeType: string;
}

/** Lowercase extension without the dot, or '' if none. */
export function normalizeExtension(filename: string): string {
  const dot = (filename ?? '').lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase().trim() : '';
}

export function isAcceptedExtension(ext: string): boolean {
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Tidy extracted text for storage/retrieval: strip NUL bytes, normalise newlines,
 * drop trailing spaces, and collapse runs of blank lines.
 */
export function normalizeWhitespace(text: string): string {
  return (text ?? '')
    .split(NUL_CHAR)
    .join('')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.text === 'string') return v.text; // hyperlink / simple rich text
    if (Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((t) => t.text ?? '').join('');
    }
    if ('result' in v) return String(v.result ?? ''); // formula: its computed value
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return '';
  }
  return String(value);
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // Lazy CJS import so pdfjs only initialises when a PDF is actually uploaded.
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const res = await parser.getText({ pageJoiner: '\n' });
    return res.text ?? '';
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const res = await mammoth.extractRawText({ buffer });
  return res.value ?? '';
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  // Cast: @types/node v24 made Buffer generic (Buffer<ArrayBufferLike>), which
  // trips exceljs's non-generic Buffer param type. Runtime accepts a Buffer fine.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const lines: string[] = [];
  wb.eachSheet((sheet) => {
    lines.push(`# ${sheet.name}`);
    sheet.eachRow((row) => {
      const values = (row.values as unknown[]).slice(1).map(cellToText);
      if (values.some((v) => v !== '')) lines.push(values.join('\t'));
    });
  });
  return lines.join('\n');
}

/**
 * Extract plain text from an uploaded file's bytes. Throws
 * `UnsupportedFormatError` for a disallowed extension. The returned `text` is
 * whitespace-normalised but may be empty (e.g. a scanned/image-only PDF); the
 * caller decides how to handle empty extraction.
 */
export async function extractText(
  buffer: Buffer,
  filename: string,
): Promise<ExtractResult> {
  const extension = normalizeExtension(filename);
  let text = '';
  let mimeType = 'application/octet-stream';

  if (TEXT_EXTENSIONS.has(extension)) {
    text = buffer.toString('utf8');
    mimeType =
      extension === 'csv'
        ? 'text/csv'
        : extension === 'md' || extension === 'markdown'
          ? 'text/markdown'
          : 'text/plain';
  } else if (extension === 'pdf') {
    text = await extractPdf(buffer);
    mimeType = 'application/pdf';
  } else if (extension === 'docx' || extension === 'docm') {
    text = await extractDocx(buffer);
    mimeType =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else if (extension === 'xlsx' || extension === 'xlsm') {
    text = await extractXlsx(buffer);
    mimeType =
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else {
    throw new UnsupportedFormatError(extension);
  }

  return { text: normalizeWhitespace(text), extension, mimeType };
}

export class UnsupportedFormatError extends Error {
  constructor(public readonly extension: string) {
    super(`Unsupported knowledge-base format: ${extension || '(none)'}`);
    this.name = 'UnsupportedFormatError';
  }
}
