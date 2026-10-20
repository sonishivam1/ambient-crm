import pino, { type DestinationStream, type Level, type Logger as PinoLogger } from "pino";
import pretty from "pino-pretty";

import { scrub, scrubString } from "./scrub";

/**
 * Ambient's logger: structured JSON in production, readable lines in
 * development, redacted everywhere. Use it instead of `console` in server
 * code, workers and scripts:
 *
 *   const log = createLogger("ai", { tenantId, userId });
 *   log.warn({ feature, errorKind }, "AI call failed");
 *
 * Never log prompt, reply, note or email text on purpose; the redaction is a
 * safety net, not a licence.
 */

export { MASK, scrub, scrubString } from "./scrub";

export type Logger = PinoLogger;

/** Context carried on every line of a child logger. */
export type LogContext = {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  [key: string]: unknown;
};

/**
 * An error we raised ourselves: its message and stack are safe to log.
 * Any other error (a provider's, a driver's) is logged by name and code only,
 * because its message can echo request data.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

function serializeError(err: unknown) {
  if (err instanceof AppError) return { name: err.name, code: err.code, message: scrubString(err.message), stack: err.stack && scrubString(err.stack) };
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return { name: err.name, ...(typeof code === "string" || typeof code === "number" ? { code } : {}) };
  }
  return { name: typeof err };
}

const LEVELS: readonly string[] = ["trace", "debug", "info", "warn", "error", "fatal", "silent"];

function defaultLevel(): Level | "silent" {
  const env = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (env && LEVELS.includes(env)) return env as Level | "silent";
  if (process.env.VITEST || process.env.NODE_ENV === "test") return "silent";
  return "info";
}

export type LoggerOptions = {
  level?: Level | "silent";
  /** Where lines go; defaults to stdout (pretty outside production). */
  destination?: DestinationStream;
  pretty?: boolean;
};

/**
 * pino's bindings formatter only sees the root logger's bindings, so context
 * given to child() is redacted here, for children of children too.
 */
function redactChildren(log: Logger): Logger {
  // pino's child() lives on the prototype; children inherit whatever is set
  // here, so `this` is always the logger child() was called on.
  const original = log.child as unknown as (this: Logger, bindings: Record<string, unknown>, options?: unknown) => Logger;
  function child(this: Logger, bindings: Record<string, unknown>, options?: unknown): Logger {
    return original.call(this, scrub(bindings) as Record<string, unknown>, options);
  }
  log.child = child as unknown as Logger["child"];
  return log;
}

/** Build a root logger. Most code uses `logger` or `createLogger()` instead. */
export function buildLogger(options: LoggerOptions = {}): Logger {
  const production = process.env.NODE_ENV === "production";
  const usePretty = options.pretty ?? (!production && !options.destination);
  const destination =
    options.destination ??
    (usePretty ? pretty({ sync: true, colorize: true, singleLine: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" }) : undefined);

  const log = pino(
    {
      level: options.level ?? defaultLevel(),
      base: { service: "ambient" },
      timestamp: pino.stdTimeFunctions.isoTime,
      messageKey: "msg",
      serializers: { err: serializeError, error: serializeError },
      formatters: {
        level: (label) => ({ level: label }),
        // Context bound on child loggers is redacted too.
        bindings: (bindings) => scrub(bindings) as Record<string, unknown>,
        // Every logged object is redacted before it is written.
        log: (object) => scrub(object) as Record<string, unknown>,
      },
      hooks: {
        // Messages are redacted as well: a string can carry a URI or an email.
        logMethod(args, method) {
          method.apply(this, args.map((a) => (typeof a === "string" ? scrubString(a) : a)) as Parameters<typeof method>);
        },
      },
    },
    destination,
  );
  return redactChildren(log);
}

/** The shared root logger. */
export const logger: Logger = buildLogger();

/** A logger for one area of the product, with optional request context. */
export function createLogger(area: string, context: LogContext = {}): Logger {
  return logger.child({ area, ...context });
}
