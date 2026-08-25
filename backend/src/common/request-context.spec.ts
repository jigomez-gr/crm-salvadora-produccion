import {
  getRequestId,
  pickRequestId,
  runWithRequestContext,
} from './request-context';

describe('pickRequestId', () => {
  const fallback = 'generated-uuid';

  it('reuses a well-formed inbound id', () => {
    expect(pickRequestId('abc-123', fallback)).toBe('abc-123');
    expect(pickRequestId('  trimmed  ', fallback)).toBe('trimmed');
  });

  it('uses the first value when the header repeats', () => {
    expect(pickRequestId(['first', 'second'], fallback)).toBe('first');
  });

  it('mints a fresh id when absent, empty, or absurdly long', () => {
    expect(pickRequestId(undefined, fallback)).toBe(fallback);
    expect(pickRequestId('', fallback)).toBe(fallback);
    expect(pickRequestId('   ', fallback)).toBe(fallback);
    expect(pickRequestId('x'.repeat(201), fallback)).toBe(fallback);
  });
});

describe('request context (AsyncLocalStorage)', () => {
  it('exposes the id inside the scope and nothing outside it', () => {
    expect(getRequestId()).toBeUndefined();
    runWithRequestContext({ requestId: 'scoped-1' }, () => {
      expect(getRequestId()).toBe('scoped-1');
    });
    expect(getRequestId()).toBeUndefined();
  });

  it('keeps the id across async boundaries within the scope', async () => {
    await runWithRequestContext({ requestId: 'scoped-2' }, async () => {
      await Promise.resolve();
      expect(getRequestId()).toBe('scoped-2');
    });
  });
});
