import { ConsoleLogger, LoggerService, LogLevel } from '@nestjs/common';
import { inspect } from 'util';
import { getRequestId } from './request-context';
import {
  formatJsonLog,
  isLevelEnabled,
  resolveLogFormat,
  resolveLogLevel,
} from './log-format';

/**
 * App logger that drives every `new Logger(Ctx.name)` call site. It replaces the
 * default Nest console logger via `app.useLogger()`, so nothing in the codebase
 * changes — output just becomes:
 *
 *  - **production:** one structured JSON line per message (parseable by a log
 *    aggregator — Dokploy/Loki/CloudWatch — with level, context, requestId), and
 *  - **development:** the familiar coloured human-readable Nest format.
 *
 * The active **request correlation id** (from `request-context`) is attached to
 * every line, so all logs from one request — and the error filter's response —
 * share one id. `LOG_LEVEL` tunes verbosity; `LOG_FORMAT` forces json/pretty.
 *
 * It carries NO request bodies/args (callers already log PII-free messages), so
 * structuring them never leaks secrets or customer data.
 */
export class StructuredLogger implements LoggerService {
  private readonly threshold: LogLevel;
  private readonly format: 'json' | 'pretty';
  private readonly pretty: ConsoleLogger;

  constructor() {
    const isProd = process.env.NODE_ENV === 'production';
    this.threshold = resolveLogLevel(process.env.LOG_LEVEL, isProd);
    this.format = resolveLogFormat(process.env.LOG_FORMAT, isProd);
    this.pretty = new ConsoleLogger();
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams);
  }
  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }
  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }
  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }
  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  private write(
    level: LogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    if (!isLevelEnabled(level, this.threshold)) return;

    const { context, stack } = this.extract(optionalParams);
    const requestId = getRequestId();

    if (this.format === 'pretty') {
      // Keep Nest's coloured formatting in dev; surface the correlation id by
      // tagging the context label so related lines are easy to eyeball.
      const ctx = requestId
        ? `${context ?? ''}${context ? ' ' : ''}req=${requestId.slice(0, 8)}`.trim()
        : context;
      if (level === 'error') this.pretty.error(message, stack, ctx);
      else if (level === 'warn') this.pretty.warn(message, ctx);
      else if (level === 'debug') this.pretty.debug(message, ctx);
      else if (level === 'verbose') this.pretty.verbose(message, ctx);
      else this.pretty.log(message, ctx);
      return;
    }

    const line = formatJsonLog({
      timestamp: new Date().toISOString(),
      level,
      context,
      message: this.coerce(message),
      requestId,
      stack: stack || undefined,
    });
    process.stdout.write(line + '\n');
  }

  /**
   * Nest's `Logger` facade appends the bound context as the LAST argument, and
   * for `error` passes the stack just before it: `(message, stack?, context?)`.
   * Pull both out by peeling trailing strings.
   */
  private extract(optionalParams: unknown[]): {
    context?: string;
    stack?: string;
  } {
    const params = [...optionalParams];
    let context: string | undefined;
    let stack: string | undefined;
    if (params.length && typeof params[params.length - 1] === 'string') {
      context = params.pop() as string;
    }
    if (params.length && typeof params[params.length - 1] === 'string') {
      stack = params.pop() as string;
    }
    return { context, stack };
  }

  private coerce(message: unknown): string {
    return typeof message === 'string' ? message : inspect(message, { depth: 3 });
  }
}
