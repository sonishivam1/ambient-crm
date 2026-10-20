import "server-only";

import { collection, type AI_REFUSALS, type RoleKey } from "@ambient/db";

import type { Scope } from "@/lib/data/scope";

import { RATE_LIMIT, aiConfigured } from "./config";
import { tokensLeft } from "./budget";

export type AiRefusal = (typeof AI_REFUSALS)[number];

/** What the user is told for each refusal. Never mentions keys, models or limits' internals. */
export const REFUSAL_MESSAGE: Record<AiRefusal, string> = {
  not_configured: "AI isn't set up yet.",
  ai_disabled: "AI is turned off for your organisation.",
  feature_disabled: "This AI feature isn't turned on for your organisation.",
  role_not_allowed: "Your role can't use this AI feature.",
  budget_exhausted: "Your organisation's AI allowance for this month is used up.",
  rate_limited: "You've reached the AI request limit. Try again shortly.",
};

/**
 * Every check that must pass before a model is called, in order. Returns the
 * first refusal, or null. A refused request never calls the model and never
 * counts against the budget or the rate limit.
 */
export async function checkGates(scope: Scope, feature: { id: string; roles: readonly RoleKey[] }): Promise<AiRefusal | null> {
  if (!aiConfigured()) return "not_configured";
  const policy = scope.user.tenant.ai;
  if (!policy.enabled) return "ai_disabled";
  if (!policy.features.includes(feature.id)) return "feature_disabled";
  const role = scope.user.role;
  if (!feature.roles.includes(role) || !policy.roles.includes(role)) return "role_not_allowed";

  // Only requests that reached the model count towards the limits.
  const calls = await collection("aiInvocations");
  const mine = { ...scope.tenant(), userId: scope.user._id, outcome: { $ne: "refused" as const } };
  const now = Date.now();
  const [lastMinute, lastDay] = await Promise.all([
    calls.countDocuments({ ...mine, createdAt: { $gte: new Date(now - 60_000) } }, { limit: RATE_LIMIT.perMinute }),
    calls.countDocuments({ ...mine, createdAt: { $gte: new Date(now - 86_400_000) } }, { limit: RATE_LIMIT.perDay }),
  ]);
  if (lastMinute >= RATE_LIMIT.perMinute || lastDay >= RATE_LIMIT.perDay) return "rate_limited";

  if ((await tokensLeft(scope)) <= 0) return "budget_exhausted";
  return null;
}
