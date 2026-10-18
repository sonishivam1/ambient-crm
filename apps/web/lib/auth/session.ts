import "server-only";

import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";

import { collection, type User } from "@ambient/db";

import { ROLES, type RoleCapabilities } from "./roles";

export const DEV_USER_COOKIE = "amb_dev_user";
const DEFAULT_DEV_USER = "u-super";

export type SessionUser = User & { capabilities: RoleCapabilities };

export function devAuthEnabled(): boolean {
  return process.env.AMBIENT_DEV_AUTH === "1" && process.env.NODE_ENV !== "production";
}

/**
 * The signed-in user for this request.
 *
 * Development: the user picked in the role switcher (a cookie holding a seeded
 * user id). Production will read the Entra principal that App Service Easy Auth
 * puts in x-ms-client-principal; until that lands, there is no sign-in outside
 * development and this throws.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser> => {
  // Everything behind sign-in is per request: stop prerendering (and runtime
  // prefetching) here, before any database work.
  await connection();
  if (!devAuthEnabled()) {
    throw new Error("No sign-in configured. Set AMBIENT_DEV_AUTH=1 for local development.");
  }
  const id = (await cookies()).get(DEV_USER_COOKIE)?.value ?? DEFAULT_DEV_USER;
  const users = await collection("users");
  const user =
    (await users.findOne({ _id: id, deletedAt: null })) ??
    (await users.findOne({ _id: DEFAULT_DEV_USER, deletedAt: null }));
  if (!user) throw new Error("No seeded users found. Run `pnpm db:seed`.");
  return { ...user, capabilities: ROLES[user.role] };
});
