import { DEV_USER_COOKIE } from "@/lib/auth/session";
import { LENS_COOKIE } from "@/lib/lens";

import { cookieJar } from "./cookie-jar";

/** Seeded users, by tenant and role. */
export const USERS = {
  northwind: {
    rep: "northwind:u-rep", // Priya Nair, rep r1
    manager: "northwind:u-manager", // Liam Carter, r2: manages r1, r4, r7, r8
    senior: "northwind:u-senior", // Grace Whitfield, r3: top of the tree
    lead: "northwind:u-lead",
    admin: "northwind:u-admin",
    super: "northwind:u-super",
  },
  harbor: {
    rep: "harbor:u-rep",
    manager: "harbor:u-manager",
    super: "harbor:u-super",
  },
} as const;

/** Make the next server call run as this user (and optionally with a division lens). */
export function signInAs(userId: string, lens?: "both" | "wholesale" | "uniforms") {
  cookieJar.clear();
  cookieJar.set(DEV_USER_COOKIE, userId);
  if (lens) cookieJar.set(LENS_COOKIE, lens);
}
