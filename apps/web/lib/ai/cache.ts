import "server-only";

import { collection, type AiOutput } from "@ambient/db";
import { createLogger } from "@ambient/logger";

import type { Scope } from "@/lib/data/scope";

/**
 * The aiOutputs cache: one verified answer per user, feature and subject.
 * An answer is served only when it was built from the same facts (fingerprint),
 * prompt and policy versions and model, and hasn't expired. Per user, because
 * two users can see different facts about the same account.
 */

export type CacheKey = {
  feature: string;
  subject: string;
  fingerprint: string;
  promptVersion: number;
  policyVersion: number;
  model: string;
};

const idFor = (scope: Scope, feature: string, subject: string) => `${scope.tenantId}:${scope.user._id}:${feature}:${subject}`;

/** The user's latest answer for this feature and subject, if it hasn't expired. */
export async function latestOutput(scope: Scope, feature: string, subject: string): Promise<AiOutput | null> {
  const row = await (await collection("aiOutputs")).findOne({ _id: idFor(scope, feature, subject), ...scope.tenant(), userId: scope.user._id });
  // The TTL index deletes expired rows only every minute or so; never serve one.
  return row && row.expiresAt > new Date() ? row : null;
}

/** The cached answer, only if everything it was built from still matches. */
export async function cachedOutput(scope: Scope, key: CacheKey): Promise<AiOutput | null> {
  const row = await latestOutput(scope, key.feature, key.subject);
  if (!row) return null;
  const same =
    row.factsFingerprint === key.fingerprint && row.promptVersion === key.promptVersion && row.policyVersion === key.policyVersion && row.model === key.model;
  return same ? row : null;
}

/** Keep a verified answer. A failure to cache never breaks the user's request. */
export async function saveOutput(scope: Scope, key: CacheKey, output: unknown, ttlDays: number): Promise<Date> {
  const createdAt = new Date();
  try {
    await (await collection("aiOutputs")).replaceOne(
      { _id: idFor(scope, key.feature, key.subject) },
      {
        tenantId: scope.tenantId,
        userId: scope.user._id,
        feature: key.feature,
        subjectId: key.subject,
        factsFingerprint: key.fingerprint,
        promptVersion: key.promptVersion,
        policyVersion: key.policyVersion,
        model: key.model,
        output,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + ttlDays * 86_400_000),
      },
      { upsert: true },
    );
  } catch (err) {
    createLogger("ai", { tenantId: scope.tenantId, userId: scope.user._id }).error({ err, feature: key.feature }, "aiOutputs write failed");
  }
  return createdAt;
}
