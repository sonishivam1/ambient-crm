import type { Metadata } from "next";
import { Suspense } from "react";

import { WrenChat } from "@/components/ai/wren-chat";
import { PageHead, Skeleton } from "@/components/ui/primitives";
import { WREN_CHAT } from "@/lib/ai/chat";
import { getConversation, listConversations, toTurnView } from "@/lib/ai/conversations";
import { REFUSAL_MESSAGE, checkAccess } from "@/lib/ai/gates";
import { chatSuggestions } from "@/lib/ai/suggestions";
import { getScope } from "@/lib/data/scope";

export const metadata: Metadata = { title: "Wren assistant" };

export default function Page({ searchParams }: PageProps<"/assistant">) {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] rounded-[22px]" />}>
      <AssistantContent searchParams={searchParams} />
    </Suspense>
  );
}

/** The user's conversations and, with ?c=, one of them. Never calls the model. */
async function AssistantContent({ searchParams }: { searchParams: PageProps<"/assistant">["searchParams"] }) {
  const raw = (await searchParams).c;
  const id = typeof raw === "string" && raw.length <= 100 ? raw : null;
  const scope = await getScope();
  const denied = await checkAccess(scope, WREN_CHAT);
  const [conversations, conversation, suggestions] = await Promise.all([listConversations(scope), id ? getConversation(scope, id) : null, chatSuggestions(scope)]);
  return (
    <>
      <PageHead eyebrow="Wren" title="Assistant" sub="Ask about your own tasks, visits, renewals, contacts and accounts. Read-only for now." />
      <WrenChat
        // A fresh chat state per conversation.
        key={conversation?._id ?? "new"}
        conversations={conversations}
        conversationId={conversation?._id ?? null}
        turns={(conversation?.turns ?? []).map(toTurnView)}
        unavailable={denied ? REFUSAL_MESSAGE[denied] : null}
        suggestions={suggestions}
      />
    </>
  );
}
