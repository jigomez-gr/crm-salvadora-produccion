import type { LogLevel } from '@nestjs/common';

/**
 * Pure, unit-tested helpers for structured logging. No IO, no Nest, no clock —
 * the `StructuredLogger` wires these to stdout and the real time.
 */

// Verbosity order, least → most verbose. A threshold enables itself and
// everything to its LEFT (so 'log' enables error + warn + log, not debug).
export const LOG_LEVEL_ORDER: LogLevel[] = [
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

/**
 * Resolve the configured verbosity threshold. Falls back to a sensible default
 * when unset/invalid: quieter in production (`log`), chattier in development
 * (`debug`). Case-insensitive; `info` is accepted as an alias for `log`.
 */
export function resolveLogLevel(
  raw: string | undefined,
  isProd: boolean,
): LogLevel {
  const value = (raw || '').trim().toLowerCase();
  const normalized = value === 'info' ? 'log' : value;
  if ((LOG_LEVEL_ORDER as string[]).includes(normalized)) {
    return normalized as LogLevel;
  }
  return isProd ? 'log' : 'debug';
}

/** Whether a message at `level` should be emitted given the active `threshold`. */
export function isLevelEnabled(level: LogLevel, threshold: LogLevel): boolean {
  return LOG_LEVEL_ORDER.indexOf(level) <= LOG_LEVEL_ORDER.indexOf(threshold);
}

/**
 * Resolve the output format. Defaults to machine-readable `json` in production
 * (so a log aggregator can parse fields) and human-readable `pretty` in dev.
 * `LOG_FORMAT=json|pretty` overrides.
 */
export function resolveLogFormat(
  raw: string | undefined,
  isProd: boolean,
): 'json' | 'pretty' {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'json' || value === 'pretty') return value;
  return isProd ? 'json' : 'pretty';
}

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  context?: string;
  message: string;
  requestId?: string;
  stack?: string;
}

/**
 * Serialize a log record to a single JSON line. Only defined fields are
 * included. Deliberately carries NO request bodies / args — the callers already
 * log PII-free messages; this just structures them.
 */
export function formatJsonLog(record: LogRecord): string {
  const out: Record<string, unknown> = {
    timestamp: record.timestamp,
    level: record.level,
    message: record.message,
  };
  if (record.context) out.context = record.context;
  if (record.requestId) out.requestId = record.requestId;
  if (record.stack) out.stack = record.stack;
  return JSON.stringify(out);
}
