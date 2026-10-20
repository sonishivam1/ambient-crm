import "server-only";

import { collection, type AiOutput } from "@ambient/db";
import { createLogger } from "@ambient/logger";

import type { Scope } from "@/lib/data/scope";

/**
 * The aiOutputs cache: one verified answer per user, feature and subject. Per
 * user, because two users can see different facts about the same account.
 * Always tied to the prompt and policy versions and model it came from:
 *
 * - `facts` mode: served only when built from the same facts (fingerprint).
 * - `day` mode: served until it expires (local midnight), with the cards it
 *   was shown with, even after the records change.
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

/** Built by the same prompt, policy and model. */
export const sameMaker = (row: AiOutput, key: Pick<CacheKey, "promptVersion" | "policyVersion" | "model">) =>
  row.promptVersion === key.promptVersion && row.policyVersion === key.policyVersion && row.model === key.model;

/** `facts` mode: the cached answer, only if everything it was built from still matches. */
export async function cachedOutput(scope: Scope, key: CacheKey): Promise<AiOutput | null> {
  const row = await latestOutput(scope, key.feature, key.subject);
  return row && sameMaker(row, key) && row.factsFingerprint === key.fingerprint ? row : null;
}

/** `day` mode: today's answer, whatever has changed since, if the same prompt, policy and model made it. */
export async function dayOutput(scope: Scope, key: Omit<CacheKey, "fingerprint">): Promise<AiOutput | null> {
  const row = await latestOutput(scope, key.feature, key.subject);
  return row && sameMaker(row, key) ? row : null;
}

/** Keep a verified answer. A failure to cache never breaks the user's request. */
export async function saveOutput(
  scope: Scope,
  key: CacheKey,
  answer: { output: unknown; cards: unknown[]; notes: string[]; expiresAt: (createdAt: Date) => Date },
): Promise<Date> {
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
        output: answer.output,
        cards: answer.cards,
        notes: answer.notes,
        createdAt,
        expiresAt: answer.expiresAt(createdAt),
      },
      { upsert: true },
    );
  } catch (err) {
    createLogger("ai", { tenantId: scope.tenantId, userId: scope.user._id }).error({ err, feature: key.feature }, "aiOutputs write failed");
  }
  return createdAt;
}
