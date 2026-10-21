import "server-only";

import { collection } from "@ambient/db";

import type { Scope } from "@/lib/data/scope";

import { WREN_CHAT } from "./chat";
import type { ChatTurnView, ConversationSummary } from "./chat-view";
import { getConversation, listConversations, turnViews } from "./conversations";
import { REFUSAL_MESSAGE, checkAccess } from "./gates";
import { chatSuggestions, titleCase } from "./suggestions";

/**
 * What the Wren side panel opens with: the user's most recent conversation if
 * it was active in the last day (so the panel and the full page share it),
 * and suggestions that know the page: on a customer profile, that account
 * (only if the user can see it).
 */

export const PANEL_CONTINUE_HOURS = 24;

export type PanelData = {
  conversations: ConversationSummary[];
  conversationId: string | null;
  turns: ChatTurnView[];
  unavailable: string | null;
  suggestions: string[];
  proposalCtx: { ownRepId: string | null; timeZone: string };
};

/** The account a page is about, from its path: /accounts/<id>. Only one the user can see. */
async function pageAccount(scope: Scope, pathname: string): Promise<string | null> {
  const m = /^\/accounts\/([^/?#]+)$/.exec(pathname);
  if (!m || m[1] === "group") return null;
  let id: string;
  try {
    id = decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
  const a = await (await collection("accounts")).findOne({ _id: id, ...scope.filter(), active: true }, { projection: { name: 1 } });
  return a ? titleCase(a.name) : null;
}

export async function panelData(scope: Scope, pathname: string): Promise<PanelData> {
  const denied = await checkAccess(scope, WREN_CHAT);
  const [conversations, account] = await Promise.all([listConversations(scope, 20), pageAccount(scope, pathname.slice(0, 300))]);
  const recent = conversations[0];
  const fresh = recent && Date.now() - new Date(recent.updatedAt).getTime() < PANEL_CONTINUE_HOURS * 3_600_000;
  const conversation = fresh ? await getConversation(scope, recent.id) : null;
  const suggestions = account
    ? [`Summarise ${account}`, `What's overdue on ${account}?`, `Upcoming visits to ${account}`, `Who are the contacts at ${account}?`]
    : await chatSuggestions(scope);
  return {
    conversations,
    conversationId: conversation?._id ?? null,
    turns: await turnViews(scope, conversation),
    unavailable: denied ? REFUSAL_MESSAGE[denied] : null,
    suggestions,
    proposalCtx: { ownRepId: scope.user.repId, timeZone: scope.timeZone },
  };
}
