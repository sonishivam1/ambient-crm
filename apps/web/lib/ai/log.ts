import "server-only";

import { randomUUID } from "node:crypto";

import { collection, type AiInvocation } from "@ambient/db";
import { createLogger } from "@ambient/logger";

import type { Scope } from "@/lib/data/scope";

export type InvocationRecord = Omit<AiInvocation, "_id" | "tenantId" | "userId" | "createdAt">;

/**
 * Record one AI request. Metadata only: the type has no field for prompt,
 * facts or reply text, and callers pass codes (outcome, refusal, errorKind),
 * never error messages, which can echo provider responses.
 * A logging failure never breaks the user's request.
 */
export async function logInvocation(scope: Scope, record: InvocationRecord) {
  try {
    await (await collection("aiInvocations")).insertOne({
      _id: randomUUID(),
      tenantId: scope.tenantId,
      userId: scope.user._id,
      createdAt: new Date(),
      ...record,
    });
  } catch (err) {
    createLogger("ai", { tenantId: scope.tenantId, userId: scope.user._id }).error({ err, feature: record.feature }, "aiInvocations write failed");
  }
}
