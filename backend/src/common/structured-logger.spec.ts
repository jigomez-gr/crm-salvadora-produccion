import { StructuredLogger } from './structured-logger';
import { runWithRequestContext } from './request-context';

/**
 * Verifies the logger's structured (JSON) output and level filtering end to end
 * — a deterministic stand-in for eyeballing production logs.
 */
describe('StructuredLogger (json mode)', () => {
  const originalEnv = { ...process.env };
  let lines: string[];
  let spy: jest.SpyInstance;

  beforeEach(() => {
    lines = [];
    spy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        lines.push(chunk.toString());
        return true;
      });
  });

  afterEach(() => {
    spy.mockRestore();
    process.env = { ...originalEnv };
  });

  const makeLogger = (env: Record<string, string> = {}) => {
    process.env.LOG_FORMAT = 'json';
    Object.assign(process.env, env);
    return new StructuredLogger();
  };

  it('emits one JSON line with level, context, message and the request id', () => {
    const logger = makeLogger();
    runWithRequestContext({ requestId: 'rid-123' }, () => {
      logger.log('Login ok', 'AuthService');
    });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.level).toBe('log');
    expect(parsed.message).toBe('Login ok');
    expect(parsed.context).toBe('AuthService');
    expect(parsed.requestId).toBe('rid-123');
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('includes the stack for an error', () => {
    const logger = makeLogger();
    logger.error('Boom', 'Error: Boom\n  at x', 'SomeService');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.level).toBe('error');
    expect(parsed.context).toBe('SomeService');
    expect(parsed.stack).toContain('Boom');
  });

  it('omits the requestId outside a request scope', () => {
    const logger = makeLogger();
    logger.warn('no scope', 'Ctx');
    expect(JSON.parse(lines[0]).requestId).toBeUndefined();
  });

  it('honours LOG_LEVEL — a quiet floor drops more verbose lines', () => {
    const logger = makeLogger({ LOG_LEVEL: 'warn' });
    logger.log('should be dropped', 'Ctx');
    logger.debug('also dropped', 'Ctx');
    expect(lines).toHaveLength(0);
    logger.warn('kept', 'Ctx');
    logger.error('kept too', 'Ctx');
    expect(lines).toHaveLength(2);
  });
});
