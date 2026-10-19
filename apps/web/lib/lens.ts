import type { Tenant } from "@ambient/db";

export const LENS_COOKIE = "amb_lens";
/** The lens value that shows every division. */
export const ALL_LENS = "all";

export type LensOption = { key: string; label: string };
type TenantDivisions = Pick<Tenant, "divisions" | "lenses">;

/** The top-bar choices for a tenant: "All" plus each lens it defines. Empty when the tenant has no lenses. */
export function lensOptions(tenant: TenantDivisions): LensOption[] {
  const lenses = tenant.lenses ?? [];
  return lenses.length ? [{ key: ALL_LENS, label: "All" }, ...lenses.map((l) => ({ key: l.key, label: l.label }))] : [];
}

/** A saved lens if this tenant still has it, otherwise "all". */
export function resolveLens(saved: string | undefined, tenant: TenantDivisions): string {
  return saved && (tenant.lenses ?? []).some((l) => l.key === saved) ? saved : ALL_LENS;
}

/** The division keys a lens shows; null means every division. */
export function lensDivisions(lens: string, tenant: TenantDivisions): string[] | null {
  if (lens === ALL_LENS) return null;
  return (tenant.lenses ?? []).find((l) => l.key === lens)?.divisions ?? null;
}

/** A division's display label, falling back to its key for data the tenant no longer lists. */
export function divisionLabel(tenant: TenantDivisions, key: string): string {
  return tenant.divisions.find((d) => d.key === key)?.label ?? key;
}
