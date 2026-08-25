import {
  formatJsonLog,
  isLevelEnabled,
  resolveLogFormat,
  resolveLogLevel,
} from './log-format';

describe('resolveLogLevel', () => {
  it('accepts the valid levels (case-insensitive)', () => {
    expect(resolveLogLevel('error', false)).toBe('error');
    expect(resolveLogLevel('WARN', false)).toBe('warn');
    expect(resolveLogLevel(' verbose ', false)).toBe('verbose');
  });

  it('treats "info" as an alias for "log"', () => {
    expect(resolveLogLevel('info', true)).toBe('log');
  });

  it('falls back by environment when unset/invalid', () => {
    expect(resolveLogLevel(undefined, true)).toBe('log'); // prod: quieter
    expect(resolveLogLevel(undefined, false)).toBe('debug'); // dev: chattier
    expect(resolveLogLevel('nonsense', true)).toBe('log');
  });
});

describe('isLevelEnabled', () => {
  it('enables a level and everything less verbose than the threshold', () => {
    // threshold 'log' → error, warn, log on; debug, verbose off
    expect(isLevelEnabled('error', 'log')).toBe(true);
    expect(isLevelEnabled('warn', 'log')).toBe(true);
    expect(isLevelEnabled('log', 'log')).toBe(true);
    expect(isLevelEnabled('debug', 'log')).toBe(false);
    expect(isLevelEnabled('verbose', 'log')).toBe(false);
  });

  it('error is always on; verbose enables everything', () => {
    expect(isLevelEnabled('error', 'error')).toBe(true);
    expect(isLevelEnabled('warn', 'error')).toBe(false);
    expect(isLevelEnabled('verbose', 'verbose')).toBe(true);
    expect(isLevelEnabled('debug', 'verbose')).toBe(true);
  });
});

describe('resolveLogFormat', () => {
  it('honours an explicit format', () => {
    expect(resolveLogFormat('json', false)).toBe('json');
    expect(resolveLogFormat('pretty', true)).toBe('pretty');
  });

  it('defaults to json in prod, pretty in dev', () => {
    expect(resolveLogFormat(undefined, true)).toBe('json');
    expect(resolveLogFormat('', false)).toBe('pretty');
    expect(resolveLogFormat('weird', true)).toBe('json');
  });
});

describe('formatJsonLog', () => {
  it('emits a single valid JSON line with the core fields', () => {
    const line = formatJsonLog({
      timestamp: '2026-07-01T00:00:00.000Z',
      level: 'log',
      context: 'AuthService',
      message: 'Login ok',
      requestId: 'req-123',
    });
    const parsed = JSON.parse(line);
    expect(parsed).toEqual({
      timestamp: '2026-07-01T00:00:00.000Z',
      level: 'log',
      message: 'Login ok',
      context: 'AuthService',
      requestId: 'req-123',
    });
  });

  it('omits undefined optional fields and includes a stack when present', () => {
    const line = formatJsonLog({
      timestamp: '2026-07-01T00:00:00.000Z',
      level: 'error',
      message: 'Boom',
      stack: 'Error: Boom\n  at x',
    });
    const parsed = JSON.parse(line);
    expect(parsed.context).toBeUndefined();
    expect(parsed.requestId).toBeUndefined();
    expect(parsed.stack).toContain('Boom');
  });
});
