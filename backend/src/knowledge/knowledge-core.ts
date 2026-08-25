/**
 * Pure, IO-free helpers for the agent knowledge base (mirrors the `contacts/csv.ts`
 * pattern — deterministic, exhaustively unit-testable, no DB/network).
 *
 * The knowledge base is size-triggered: below the threshold the WHOLE base is
 * injected into the agent prompt each message; above it, only the most relevant
 * chunks are retrieved (Postgres full-text search) and packed within a budget.
 * Everything is measured in characters (a tokenizer-free proxy: ~4 chars/token
 * for Spanish/Latin text) to avoid a tokenizer dependency.
 */

// Inject the whole base at/under this many characters (~12k tokens ≈ 15-20 pages);
// above it, switch to retrieval. Also the hard cap on how much knowledge text is
// ever put into a single prompt (bounds context size and per-message cost).
export const KNOWLEDGE_THRESHOLD_CHARS = 48_000;
export const KNOWLEDGE_BUDGET_CHARS = 48_000;

// Chunking for the retrieval path. ~1200 chars ≈ 300 tokens ≈ roughly one FAQ
// entry; a small overlap keeps an answer that straddles a boundary retrievable.
export const CHUNK_MAX_CHARS = 1_200;
export const CHUNK_OVERLAP_CHARS = 150;

export type KnowledgeMode = 'inject' | 'retrieve';

export interface TextChunk {
  index: number;
  content: string;
}

/**
 * Decide whether to inject the entire knowledge base or retrieve relevant chunks,
 * based on an agent's TOTAL extracted-text size. Single source of truth so the
 * backend and the UI's mode indicator always agree.
 */
export function resolveKnowledgeMode(
  totalChars: number,
  thresholdChars: number = KNOWLEDGE_THRESHOLD_CHARS,
): KnowledgeMode {
  return totalChars <= thresholdChars ? 'inject' : 'retrieve';
}

/**
 * Find a good break point within `window` so chunks end on a paragraph, sentence
 * or word boundary rather than mid-word. Returns the offset (within the window)
 * just AFTER the boundary, or -1 to signal "no acceptable boundary — hard cut".
 * Only accepts boundaries in the latter part of the window so chunks don't become
 * tiny.
 */
function findBreak(window: string): number {
  const minAcceptable = Math.floor(window.length * 0.6);

  // Prefer a paragraph break.
  const para = window.lastIndexOf('\n\n');
  if (para >= minAcceptable) return para + 2;

  // Then a sentence end (. ! ? followed by whitespace).
  const sentenceRe = /[.!?]\s/g;
  let lastSentence = -1;
  let m: RegExpExecArray | null;
  while ((m = sentenceRe.exec(window)) !== null) {
    if (m.index >= minAcceptable) lastSentence = m.index + 2;
  }
  if (lastSentence > 0) return lastSentence;

  // Then any whitespace.
  const space = window.lastIndexOf(' ');
  if (space >= minAcceptable) return space + 1;
  const newline = window.lastIndexOf('\n');
  if (newline >= minAcceptable) return newline + 1;

  return -1;
}

/**
 * Split text into ordered chunks of at most `maxChars`, breaking on natural
 * boundaries where possible, with a small overlap between consecutive chunks so
 * context isn't lost at a boundary. Pure and deterministic. Empty/whitespace
 * input → []. Always makes forward progress (no infinite loop on tiny chunks).
 */
export function chunkText(
  text: string,
  maxChars: number = CHUNK_MAX_CHARS,
  overlapChars: number = CHUNK_OVERLAP_CHARS,
): TextChunk[] {
  const clean = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length);
    if (end < clean.length) {
      const breakAt = findBreak(clean.slice(start, end));
      if (breakAt > 0) end = start + breakAt;
    }
    const content = clean.slice(start, end).trim();
    if (content) {
      chunks.push({ index, content });
      index += 1;
    }
    if (end >= clean.length) break;
    // Overlap, but never stall: if backing up wouldn't advance past `start`,
    // continue from `end` (that boundary just gets no overlap).
    const nextStart = end - overlapChars;
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}

/**
 * Concatenate `pieces` (documents, or ranked chunks) in order with `separator`
 * until adding the next one would exceed `budgetChars`. If the very first piece
 * alone exceeds the budget it's truncated to fit, so the result is always bounded
 * and never empty when there's any content. Pure.
 */
export function packWithinBudget(
  pieces: string[],
  budgetChars: number = KNOWLEDGE_BUDGET_CHARS,
  separator: string = '\n\n',
): string {
  const out: string[] = [];
  let used = 0;
  for (const piece of pieces) {
    if (!piece) continue;
    const addition = out.length === 0 ? piece.length : separator.length + piece.length;
    if (used + addition > budgetChars) {
      if (out.length === 0) out.push(piece.slice(0, budgetChars));
      break;
    }
    out.push(piece);
    used += addition;
  }
  return out.join(separator);
}
