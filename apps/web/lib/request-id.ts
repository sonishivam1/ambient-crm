/** Request ids, shared by the proxy, the request logger and route handlers. Pure. */

export const REQUEST_ID_HEADER = "x-request-id";

const WELL_FORMED = /^[A-Za-z0-9._-]{8,64}$/;

/** The caller's id when it is well-formed (so it can't inject into logs), otherwise a new one. */
export function requestIdFrom(incoming: string | null | undefined): string {
  return incoming && WELL_FORMED.test(incoming) ? incoming : crypto.randomUUID();
}
