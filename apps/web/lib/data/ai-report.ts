import "server-only";

import { collection } from "@ambient/db";
import { fromIsoDay } from "@ambient/db/time";

import { ledgerMonth } from "@/lib/ai/budget";
import { tokenPrices } from "@/lib/ai/config";

import { getScope } from "./scope";

/**
 * The admin AI report: this month's totals for the tenant, from metadata only
 * (aiInvocations, aiFeedback, aiProposals, aiUsage). There is no field here
 * that could hold a question, an answer or customer text. Null for anyone
 * who isn't an admin.
 */

export type FeatureUsage = {
  feature: string;
  /** Requests that reached the model. */
  calls: number;
  cached: number;
  refused: number;
  failed: number;
  rejected: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number | null;
  /** USD, when prices are set. */
  cost: number | null;
};

export type FeatureFeedback = { feature: string; promptVersion: number; up: number; down: number; reasons: Record<string, number> };
export type ProposalTotals = { origin: "chat" | "followups"; prepared: number; accepted: number; dismissed: number; expired: number; pending: number };

export type AiReport = {
  month: string;
  budget: { used: number; reserved: number; limit: number; enabled: boolean };
  pricesSet: boolean;
  usage: FeatureUsage[];
  refusals: { reason: string; count: number }[];
  feedback: FeatureFeedback[];
  proposals: ProposalTotals[];
};

export async function getAiReport(): Promise<AiReport | null> {
  const scope = await getScope();
  if (!scope.user.capabilities.admin) return null;
  const month = ledgerMonth(scope);
  const since = fromIsoDay(`${month}-01`, scope.timeZone);
  const inMonth = { ...scope.tenant(), createdAt: { $gte: since } };
  const prices = tokenPrices();
  const now = new Date();

  const [usageRows, refusalRows, feedbackRows, reasonRows, proposalRows, ledger] = await Promise.all([
    (await collection("aiInvocations"))
      .aggregate<{ _id: string; calls: number; cached: number; refused: number; failed: number; rejected: number; inputTokens: number; outputTokens: number; latency: number; timed: number }>([
        { $match: inMonth },
        {
          $group: {
            _id: "$feature",
            calls: { $sum: { $cond: [{ $in: ["$outcome", ["ok", "repaired", "rejected", "failed"]] }, 1, 0] } },
            cached: { $sum: { $cond: [{ $eq: ["$outcome", "cached"] }, 1, 0] } },
            refused: { $sum: { $cond: [{ $eq: ["$outcome", "refused"] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ["$outcome", "failed"] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ["$outcome", "rejected"] }, 1, 0] } },
            inputTokens: { $sum: "$inputTokens" },
            outputTokens: { $sum: "$outputTokens" },
            latency: { $sum: { $cond: [{ $in: ["$outcome", ["ok", "repaired", "rejected", "failed"]] }, "$latencyMs", 0] } },
            timed: { $sum: { $cond: [{ $in: ["$outcome", ["ok", "repaired", "rejected", "failed"]] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
    (await collection("aiInvocations"))
      .aggregate<{ _id: string; count: number }>([{ $match: { ...inMonth, outcome: "refused" } }, { $group: { _id: "$refusal", count: { $sum: 1 } } }, { $sort: { count: -1 } }])
      .toArray(),
    (await collection("aiFeedback"))
      .aggregate<{ _id: { feature: string; promptVersion: number }; up: number; down: number }>([
        { $match: inMonth },
        {
          $group: {
            _id: { feature: "$feature", promptVersion: "$promptVersion" },
            up: { $sum: { $cond: [{ $eq: ["$rating", "up"] }, 1, 0] } },
            down: { $sum: { $cond: [{ $eq: ["$rating", "down"] }, 1, 0] } },
          },
        },
        { $sort: { "_id.feature": 1, "_id.promptVersion": 1 } },
      ])
      .toArray(),
    (await collection("aiFeedback"))
      .aggregate<{ _id: { feature: string; promptVersion: number; reason: string }; count: number }>([
        { $match: { ...inMonth, rating: "down", reason: { $ne: null } } },
        { $group: { _id: { feature: "$feature", promptVersion: "$promptVersion", reason: "$reason" }, count: { $sum: 1 } } },
      ])
      .toArray(),
    (await collection("aiProposals"))
      .aggregate<{ _id: { origin: "chat" | "followups"; status: string; expired: boolean }; count: number }>([
        { $match: inMonth },
        { $group: { _id: { origin: "$origin", status: "$status", expired: { $lte: ["$expiresAt", now] } }, count: { $sum: 1 } } },
      ])
      .toArray(),
    (await collection("aiUsage")).findOne({ _id: `${scope.tenantId}:${month}` }),
  ]);

  const usage = usageRows.map((r): FeatureUsage => ({
    feature: r._id,
    calls: r.calls,
    cached: r.cached,
    refused: r.refused,
    failed: r.failed,
    rejected: r.rejected,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    avgLatencyMs: r.timed ? Math.round(r.latency / r.timed) : null,
    cost: prices ? (r.inputTokens * prices.input + r.outputTokens * prices.output) / 1_000_000 : null,
  }));

  const feedback = feedbackRows.map((r): FeatureFeedback => ({
    feature: r._id.feature,
    promptVersion: r._id.promptVersion,
    up: r.up,
    down: r.down,
    reasons: Object.fromEntries(
      reasonRows.filter((x) => x._id.feature === r._id.feature && x._id.promptVersion === r._id.promptVersion).map((x) => [x._id.reason, x.count]),
    ),
  }));

  const proposals = (["chat", "followups"] as const).map((origin): ProposalTotals => {
    const rows = proposalRows.filter((r) => r._id.origin === origin);
    const sum = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).reduce((n, r) => n + r.count, 0);
    const live = (r: (typeof rows)[number]) => r._id.status === "pending" || r._id.status === "accepting";
    return {
      origin,
      prepared: sum(() => true),
      accepted: sum((r) => r._id.status === "accepted"),
      dismissed: sum((r) => r._id.status === "dismissed"),
      expired: sum((r) => live(r) && r._id.expired),
      pending: sum((r) => live(r) && !r._id.expired),
    };
  });

  const ai = scope.user.tenant.ai;
  return {
    month,
    budget: { used: ledger?.used ?? 0, reserved: ledger?.reserved ?? 0, limit: ai.monthlyTokenBudget, enabled: ai.enabled },
    pricesSet: !!prices,
    usage,
    refusals: refusalRows.map((r) => ({ reason: r._id ?? "unknown", count: r.count })),
    feedback,
    proposals,
  };
}
