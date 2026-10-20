/**
 * Records what the app logs, for tests that check logging. A suite swaps it in
 * for `createLogger` with vi.mock("@ambient/logger", …); redaction itself is
 * tested in packages/logger.
 */

export type LogEntry = { level: string; area: string; context: Record<string, unknown>; fields: Record<string, unknown>; msg?: string };

export const entries: LogEntry[] = [];

type Fake = Record<"trace" | "debug" | "info" | "warn" | "error" | "fatal", (fields: unknown, msg?: string) => void> & {
  child: (bindings: Record<string, unknown>) => Fake;
};

function fake(area: string, context: Record<string, unknown>): Fake {
  const write = (level: string) => (fields: unknown, msg?: string) => {
    if (typeof fields === "string") entries.push({ level, area, context, fields: {}, msg: fields });
    else entries.push({ level, area, context, fields: (fields ?? {}) as Record<string, unknown>, msg });
  };
  return {
    trace: write("trace"),
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
    fatal: write("fatal"),
    child: (bindings) => fake(area, { ...context, ...bindings }),
  };
}

export function createRecordingLogger(area: string, context: Record<string, unknown> = {}) {
  return fake(area, { area, ...context });
}

export function clearLog() {
  entries.length = 0;
}
