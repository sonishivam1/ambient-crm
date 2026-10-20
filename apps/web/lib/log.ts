import "server-only";

import { headers } from "next/headers";

import { createLogger, type LogContext, type Logger } from "@ambient/logger";

import { getCurrentUser } from "@/lib/auth/session";
import { REQUEST_ID_HEADER } from "@/lib/request-id";

/**
 * Request-aware logging for the web app. Use `requestLogger(area)` in server
 * code, and wrap every server action in `loggedAction(name, fn)`. See
 * docs/engineering/conventions.md#logging.
 */

/** The request id, tenant and user for this request, as far as they are known. */
export async function requestContext(): Promise<LogContext> {
  const context: LogContext = {};
  try {
    const id = (await headers()).get(REQUEST_ID_HEADER);
    if (id) context.requestId = id;
  } catch {
    // Outside a request (scripts, tests): no request id.
  }
  try {
    const user = await getCurrentUser();
    context.tenantId = user.tenantId;
    context.userId = user._id;
  } catch {
    // Not signed in, or sign-in itself failed: log without a user.
  }
  return context;
}

/** A logger for one area, carrying this request's id, tenant and user. */
export async function requestLogger(area: string): Promise<Logger> {
  return createLogger(area, await requestContext());
}

/** Next.js signals redirects and not-found by throwing; those aren't failures. */
function isControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && /^(NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND)/.test(digest);
}

/** `{ ok: false, error }` results are expected refusals, not failures. */
function outcomeOf(result: unknown): { outcome: "ok" | "rejected"; reason?: string } {
  if (result && typeof result === "object" && "ok" in result && (result as { ok: unknown }).ok === false) {
    const reason = (result as { error?: unknown; reason?: unknown }).error ?? (result as { reason?: unknown }).reason;
    return { outcome: "rejected", reason: typeof reason === "string" ? reason : undefined };
  }
  return { outcome: "ok" };
}

/**
 * Wrap a server action so every call is logged with its name, duration and
 * outcome. Results are returned and errors rethrown unchanged.
 *
 *   export const createTask = loggedAction("tasks.create", async (raw: unknown) => { … });
 */
export function loggedAction<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    const started = performance.now();
    try {
      const result = await fn(...args);
      (await requestLogger("action")).info({ action: name, ...outcomeOf(result), ms: Math.round(performance.now() - started) }, "server action");
      return result;
    } catch (err) {
      if (!isControlFlow(err)) {
        (await requestLogger("action")).error({ action: name, outcome: "error", err, ms: Math.round(performance.now() - started) }, "server action failed");
      }
      throw err;
    }
  };
}
