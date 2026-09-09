/**
 * Structured logging.
 *
 * One JSON object per line on stdout, so a log shipper (Loki, CloudWatch,
 * Datadog…) can index the fields instead of regexing prose. Every line carries
 * the instance id, so lines from several processes behind one load balancer
 * stay attributable — the first thing you need when the game runs on more than
 * one box.
 *
 * `LANDFALL_LOG_FORMAT=text` restores the readable console output for local
 * development; `LANDFALL_LOG_LEVEL` (debug|info|warn|error) sets the floor.
 *
 * Money is logged in minor units, named `*Minor`, exactly as everywhere else —
 * a log line that silently switched to credits would be a reconciliation trap.
 */
import { randomHex } from './random.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, unknown>;

function resolveLevel(): LogLevel {
  const raw = (process.env.LANDFALL_LOG_LEVEL ?? 'info').toLowerCase();
  return raw in LEVEL_ORDER ? (raw as LogLevel) : 'info';
}

let cachedInstanceId: string | null = null;

/**
 * Instance identity. Supplied by the orchestrator where there is one (a k8s
 * pod name, an ECS task id); a random suffix otherwise so two processes on one
 * machine never collide in the logs.
 *
 * Computed on first use rather than at module load. Cloudflare Workers forbid
 * generating random values in global scope — a module-level random id crashes
 * the Worker before it serves a single request — and this module is imported by
 * both hosts.
 */
export function instanceId(): string {
  cachedInstanceId ??= process.env.LANDFALL_INSTANCE_ID ?? `landfall-${randomHex(4)}`;
  return cachedInstanceId;
}

const minLevel = LEVEL_ORDER[resolveLevel()];
const asJson = (process.env.LANDFALL_LOG_FORMAT ?? 'json').toLowerCase() !== 'text';

export class Logger {
  constructor(private readonly base: LogFields = {}) {}

  /** A logger that stamps every line with extra context (roomId, roundId…). */
  child(fields: LogFields): Logger {
    return new Logger({ ...this.base, ...fields });
  }

  debug(msg: string, fields?: LogFields): void {
    this.write('debug', msg, fields);
  }
  info(msg: string, fields?: LogFields): void {
    this.write('info', msg, fields);
  }
  warn(msg: string, fields?: LogFields): void {
    this.write('warn', msg, fields);
  }
  error(msg: string, fields?: LogFields): void {
    this.write('error', msg, fields);
  }

  private write(level: LogLevel, msg: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < minLevel) return;
    const merged = { ...this.base, ...fields };

    if (!asJson) {
      const tail = Object.entries(merged)
        .filter(([key]) => key !== 'instance')
        .map(
          ([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`,
        )
        .join(' ');
      // eslint-disable-next-line no-console -- the log sink itself
      console.log(`[landfall] ${msg}${tail ? ` ${tail}` : ''}`);
      return;
    }

    // Errors carry a stack; JSON.stringify drops Error properties otherwise.
    for (const [key, value] of Object.entries(merged)) {
      if (value instanceof Error) {
        merged[key] = { message: value.message, stack: value.stack };
      }
    }
    const line: LogFields = {
      ts: new Date().toISOString(),
      level,
      msg,
      instance: instanceId(),
      ...merged,
    };
    // eslint-disable-next-line no-console -- the log sink itself
    console.log(JSON.stringify(line));
  }
}

export const log = new Logger();
