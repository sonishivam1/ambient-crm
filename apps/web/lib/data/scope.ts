import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { startOfDay } from "@ambient/db/time";

import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { getRepScope, ownerFilter, type RepScope } from "@/lib/auth/visibility";
import { LENS_COOKIE, divisionLabel, lensDivisions, resolveLens } from "@/lib/lens";

export type DivisionOption = { key: string; label: string };

export type Scope = {
  user: SessionUser;
  tenantId: string;
  reps: RepScope;
  /** The active lens key, or "all". */
  lens: string;
  /** The tenant's IANA time zone: every "today", "overdue" and due date uses it. */
  timeZone: string;
  /** Local midnight today in the tenant's zone. */
  today: Date;
  /** The divisions this user can see right now (the tenant's, narrowed by the lens). */
  divisions: DivisionOption[];
  divisionLabel: (key: string) => string;
  /** Tenant only — for collections with no owner (reps, users, notifications, lookups by id). */
  tenant: () => { tenantId: string };
  /** Tenant + rep scope + division lens — for anything owned by a rep and tagged with a division. */
  filter: (ownerField?: string) => Record<string, unknown>;
};

/**
 * Everything a query needs to stay inside what this user may see, in the
 * user's tenant's own terms (divisions, time zone). Every query in the app
 * spreads one of these filters; none may run without it.
 */
export const getScope = cache(async (): Promise<Scope> => {
  const user = await getCurrentUser();
  const { tenant } = user;
  const reps = await getRepScope(user);
  const saved = (await cookies()).get(LENS_COOKIE)?.value;
  const lens = user.capabilities.lens ? resolveLens(saved, tenant) : "all";
  const lensKeys = lensDivisions(lens, tenant);
  const tenantId = user.tenantId;
  return {
    user,
    tenantId,
    reps,
    lens,
    timeZone: tenant.timeZone,
    today: startOfDay(new Date(), tenant.timeZone),
    divisions: tenant.divisions.filter((d) => !lensKeys || lensKeys.includes(d.key)),
    divisionLabel: (key) => divisionLabel(tenant, key),
    tenant: () => ({ tenantId }),
    filter: (ownerField = "ownerRepId") => ({
      tenantId,
      ...ownerFilter(reps, ownerField),
      ...(lensKeys ? { division: { $in: lensKeys } } : {}),
    }),
  };
});
