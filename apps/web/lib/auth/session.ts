import "server-only";

import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";

import { collection, type Tenant, type User } from "@ambient/db";
import { AppError, createLogger } from "@ambient/logger";

import { ROLES, type RoleCapabilities } from "./roles";

export const DEV_USER_COOKIE = "amb_dev_user";
const DEFAULT_DEV_USER = "northwind:u-super";

export type SessionUser = User & { capabilities: RoleCapabilities; tenant: Tenant };

/**
 * Development sign-in: local development only. The one exception is the
 * end-to-end tests' production build, and only against a throwaway
 * `ambient_test_*` database, so a real deployment can't turn it on by accident.
 */
export function devAuthEnabled(): boolean {
  if (process.env.AMBIENT_DEV_AUTH !== "1") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.AMBIENT_E2E === "1" && (process.env.MONGODB_DB ?? "").startsWith("ambient_test_");
}

/**
 * The signed-in user for this request, with their tenant.
 *
 * Development: the user picked in the role switcher (a cookie holding a seeded
 * user id). Real sign-in (Entra ID, ADR 0005) replaces this; until then there is
 * no sign-in outside development and this throws.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser> => {
  // Everything behind sign-in is per request: stop prerendering (and runtime
  // prefetching) here, before any database work.
  await connection();
  // Not requestLogger(): it reads the signed-in user, which is what this resolves.
  const log = createLogger("auth");
  if (!devAuthEnabled()) {
    log.warn({ reason: "no_sign_in" }, "Sign-in refused: no sign-in is configured");
    throw new AppError("unauthenticated", "No sign-in configured. Set AMBIENT_DEV_AUTH=1 for local development.");
  }
  const id = (await cookies()).get(DEV_USER_COOKIE)?.value ?? DEFAULT_DEV_USER;
  const users = await collection("users");
  let user = await users.findOne({ _id: id, deletedAt: null });
  if (!user && id !== DEFAULT_DEV_USER) {
    log.warn({ requestedUserId: id, fallbackUserId: DEFAULT_DEV_USER }, "Unknown development user; signed in as the default");
    user = await users.findOne({ _id: DEFAULT_DEV_USER, deletedAt: null });
  }
  if (!user) throw new AppError("unauthenticated", "No seeded users found. Run `pnpm db:seed`.");
  const tenant = await (await collection("tenants")).findOne({ _id: user.tenantId, active: true });
  if (!tenant) {
    log.warn({ userId: user._id, tenantId: user.tenantId }, "Sign-in refused: the tenant is missing or inactive");
    throw new AppError("unauthenticated", "This user's tenant is missing or inactive.");
  }
  return { ...user, capabilities: ROLES[user.role], tenant };
});
