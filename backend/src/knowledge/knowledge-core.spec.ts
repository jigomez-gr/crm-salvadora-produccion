import {
  resolveKnowledgeMode,
  chunkText,
  packWithinBudget,
  KNOWLEDGE_THRESHOLD_CHARS,
} from './knowledge-core';

describe('resolveKnowledgeMode', () => {
  it('injects at or below the threshold', () => {
    expect(resolveKnowledgeMode(0, 100)).toBe('inject');
    expect(resolveKnowledgeMode(100, 100)).toBe('inject');
  });

  it('retrieves above the threshold', () => {
    expect(resolveKnowledgeMode(101, 100)).toBe('retrieve');
  });

  it('uses the default threshold when none is given', () => {
    expect(resolveKnowledgeMode(KNOWLEDGE_THRESHOLD_CHARS)).toBe('inject');
    expect(resolveKnowledgeMode(KNOWLEDGE_THRESHOLD_CHARS + 1)).toBe('retrieve');
  });
});

describe('chunkText', () => {
  it('returns [] for empty or whitespace input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('returns a single chunk for short text', () => {
    const chunks = chunkText('Horario: 9 a 18h.', 1200, 150);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ index: 0, content: 'Horario: 9 a 18h.' });
  });

  it('splits long text into multiple ordered chunks within maxChars', () => {
    const text = 'a'.repeat(50) + '\n\n' + 'b'.repeat(50);
    const chunks = chunkText(text, 60, 10);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.content.length).toBeLessThanOrEqual(60);
    });
  });

  it('prefers a paragraph boundary when splitting', () => {
    const para1 = 'Primera parte del texto que es bastante larga.';
    const para2 = 'Segunda parte del texto tambien larga.';
    const chunks = chunkText(`${para1}\n\n${para2}`, 60, 10);
    // The first chunk should end at the paragraph break, not mid-word.
    expect(chunks[0].content).toBe(para1);
  });

  it('hard-splits a single oversize word/paragraph without looping forever', () => {
    const chunks = chunkText('x'.repeat(250), 100, 20);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.every((c) => c.content.length <= 100)).toBe(true);
    // Reassembled (accounting for overlap) covers the original length.
    expect(chunks.map((c) => c.content).join('').length).toBeGreaterThanOrEqual(250);
  });

  it('overlaps consecutive chunks so total emitted text exceeds the source', () => {
    const text = 'palabra '.repeat(60).trim(); // ~480 chars, breaks on spaces
    const chunks = chunkText(text, 100, 20);
    expect(chunks.length).toBeGreaterThan(1);
    const emitted = chunks.reduce((n, c) => n + c.content.length, 0);
    expect(emitted).toBeGreaterThan(text.length);
  });
});

describe('packWithinBudget', () => {
  it('returns empty string for no pieces', () => {
    expect(packWithinBudget([], 100)).toBe('');
    expect(packWithinBudget(['', ''], 100)).toBe('');
  });

  it('joins pieces in order until the budget is reached', () => {
    const out = packWithinBudget(['aaaa', 'bbbb', 'cccc'], 10, '\n');
    // 'aaaa' (4) + '\n' + 'bbbb' (5) = 9 <= 10; adding '\ncccc' (5) → 14 > 10, stop.
    expect(out).toBe('aaaa\nbbbb');
  });

  it('truncates the first piece if it alone exceeds the budget', () => {
    expect(packWithinBudget(['abcdefghij'], 4)).toBe('abcd');
  });

  it('skips empty pieces', () => {
    expect(packWithinBudget(['a', '', 'b'], 100, '-')).toBe('a-b');
  });
});
