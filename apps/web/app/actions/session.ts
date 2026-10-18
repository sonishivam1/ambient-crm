"use server";

import { cookies } from "next/headers";

import { collection } from "@ambient/db";

import { DEV_USER_COOKIE, devAuthEnabled, getCurrentUser } from "@/lib/auth/session";
import { LENS_COOKIE, isLens } from "@/lib/lens";

const YEAR = 60 * 60 * 24 * 365;

/** Development only: sign in as another seeded user (the role switcher). */
export async function switchDevUser(userId: string) {
  if (!devAuthEnabled()) throw new Error("Role switching is only available in development.");
  const user = await (await collection("users")).findOne({ _id: userId, deletedAt: null }, { projection: { _id: 1 } });
  if (!user) throw new Error("Unknown user.");
  (await cookies()).set(DEV_USER_COOKIE, userId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: YEAR });
}

export async function setLens(lens: string) {
  const user = await getCurrentUser();
  if (!user.capabilities.lens || !isLens(lens)) throw new Error("Lens not available.");
  (await cookies()).set(LENS_COOKIE, lens, { path: "/", sameSite: "lax", maxAge: YEAR });
}
