import type { RoleKey } from "@ambient/db";

/**
 * What each role can do. Two separate ladders:
 * account visibility (user → manager → senior → global) and admin access
 * (admin → super). Being an admin grants no account visibility on its own.
 */
export type RoleCapabilities = {
  label: string;
  /** "own": owned accounts; "reports": plus direct reports; "subtree": whole reporting tree; "all": everything. */
  visibility: "own" | "reports" | "subtree" | "all" | "none";
  manager: boolean;
  admin: boolean;
  superAdmin: boolean;
  /** Can switch the division lens (the lenses themselves are per tenant). */
  lens: boolean;
  canAssignTasks: boolean;
  canReview: boolean;
};

export const ROLES: Record<RoleKey, RoleCapabilities> = {
  user: { label: "CRM-USER", visibility: "own", manager: false, admin: false, superAdmin: false, lens: false, canAssignTasks: false, canReview: false },
  manager: { label: "CRM-MANAGER", visibility: "reports", manager: true, admin: false, superAdmin: false, lens: false, canAssignTasks: true, canReview: false },
  senior: { label: "CRM-SENIOR-MANAGER", visibility: "subtree", manager: true, admin: false, superAdmin: false, lens: true, canAssignTasks: true, canReview: false },
  lead: { label: "CRM-LEAD", visibility: "all", manager: true, admin: false, superAdmin: false, lens: true, canAssignTasks: true, canReview: true },
  admin: { label: "CRM-ADMIN", visibility: "none", manager: true, admin: true, superAdmin: false, lens: false, canAssignTasks: true, canReview: true },
  super: { label: "CRM-SUPER-ADMIN", visibility: "all", manager: true, admin: true, superAdmin: true, lens: true, canAssignTasks: true, canReview: true },
};
