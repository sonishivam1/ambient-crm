"use client";

import { Loader2, MessageSquarePlus, SendHorizontal, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { deleteWrenConversation } from "@/app/actions/ai";
import { AiCards } from "@/components/ai/cards";
import type { ChatEvent, ChatTurnView, ConversationSummary } from "@/lib/ai/chat-view";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";

/**
 * The Wren chat page. Each question goes to POST /api/v1/ai/chat, which
 * streams progress lines while Wren looks things up, then one verified answer.
 * Conversations are saved on the server, so they survive refresh and
 * navigation.
 */

/** Used when the page passes no suggestions. */
const DEFAULT_SUGGESTIONS = ["What needs attention today?", "What's overdue?", "Show upcoming renewals", "My visits this week", "Who are my buyers?"];

type Props = {
  conversations: ConversationSummary[];
  conversationId: string | null;
  turns: ChatTurnView[];
  /** Set when AI isn't available to this user: why. */
  unavailable: string | null;
  /** Questions offered above the box; one click asks them. */
  suggestions?: string[];
};

/** Read newline-delimited JSON events from the chat route. */
async function* readEvents(response: Response): AsyncGenerator<ChatEvent | { error: { code: string; message: string } }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line);
    }
    if (done) return;
  }
}

const ago = (iso: string) => {
  const t = timeAgo(new Date(iso));
  return t === "just now" ? t : `${t} ago`;
};

export function WrenChat({ conversations: initialList, conversationId: initialId, turns: initialTurns, unavailable, suggestions = DEFAULT_SUGGESTIONS }: Props) {
  const router = useRouter();
  const [list, setList] = useState(initialList);
  const [conversationId, setConversationId] = useState(initialId);
  const [turns, setTurns] = useState(initialTurns);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ question: string; progress: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect may only return a clean-up.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns.length, pending?.progress.length]);

  async function ask(question: string) {
    const message = question.trim();
    if (!message || pending || unavailable) return;
    setError(null);
    setDraft("");
    setPending({ question: message, progress: [] });
    try {
      const response = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, message }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Couldn't reach Wren. Try again in a moment.");
      }
      for await (const event of readEvents(response)) {
        if ("error" in event) throw new Error(event.error.message);
        if (event.type === "progress") setPending((p) => p && { ...p, progress: [...p.progress, event.text] });
        else if (event.type === "error") throw new Error(event.message);
        else {
          setTurns((t) => [...t, event.question, event.answer]);
          if (event.conversationId !== conversationId) {
            setConversationId(event.conversationId);
            router.replace(`/assistant?c=${encodeURIComponent(event.conversationId)}`, { scroll: false });
          }
          const now = new Date().toISOString();
          setList((l) => [
            { id: event.conversationId, title: l.find((c) => c.id === event.conversationId)?.title ?? message.slice(0, 60), updatedAt: now },
            ...l.filter((c) => c.id !== event.conversationId),
          ]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach Wren. Try again in a moment.");
      setDraft(message);
    } finally {
      setPending(null);
    }
  }

  async function remove(id: string) {
    if (!(await deleteWrenConversation(id))) return;
    setList((l) => l.filter((c) => c.id !== id));
    if (id === conversationId) {
      setConversationId(null);
      setTurns([]);
      router.replace("/assistant", { scroll: false });
    }
  }

  const empty = !turns.length && !pending;
  return (
    <div className="wren">
      <aside className="wren-list" aria-label="Your conversations">
        <div className="wren-list-head">
          <b>Conversations</b>
          <Link href="/assistant" className="btn sm">
            <MessageSquarePlus size={15} />
            New chat
          </Link>
        </div>
        <ul>
          {list.map((c) => (
            <li key={c.id} className={cn(c.id === conversationId && "on")}>
              <Link href={`/assistant?c=${encodeURIComponent(c.id)}`}>
                <b>{c.title}</b>
                <span suppressHydrationWarning>{ago(c.updatedAt)}</span>
              </Link>
              <button className="btn icon xs ghost" aria-label={`Delete "${c.title}"`} title="Delete" onClick={() => remove(c.id)}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
          {!list.length && <li className="wren-none">Your conversations appear here.</li>}
        </ul>
      </aside>

      <section className="wren-main" aria-label="Wren">
        <div className="wren-log" aria-live="polite">
          {empty && (
            <div className="wren-empty">
              <span className="ic" aria-hidden>
                <Sparkles size={20} />
              </span>
              <h2>Ask Wren about your accounts</h2>
              <p>Tasks, visits, renewals, contacts and accounts you can see. Wren looks them up and shows the records it used.</p>
              {unavailable && <p className="wren-unavailable">{unavailable}</p>}
            </div>
          )}

          {turns.map((t) => (t.role === "user" ? <Question key={t.id} text={t.text} /> : <Answer key={t.id} turn={t} onAsk={ask} disabled={!!pending} />))}

          {pending && (
            <>
              <Question text={pending.question} />
              <div className="wren-msg assistant" aria-busy="true">
                <ul className="wren-progress">
                  {(pending.progress.length ? pending.progress : ["Thinking…"]).map((p, i, all) => (
                    <li key={i} className={cn(i === all.length - 1 && "now")}>
                      {i === all.length - 1 && <Loader2 size={13} className="spin" aria-hidden />}
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
          <div ref={end} />
        </div>

        <div className="wren-foot">
          <div className="wren-chips" role="group" aria-label="Suggested questions">
            {suggestions.map((q) => (
              <button key={q} type="button" className="wren-chip" onClick={() => ask(q)} disabled={!!unavailable || !!pending}>
                {q}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="wren-error">
              {error}
            </p>
          )}
          <form
            className="wren-input"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft);
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={unavailable ? "Wren isn't available yet" : "Ask Wren about your tasks, visits, renewals or contacts…"}
              aria-label="Your question"
              maxLength={1000}
              disabled={!!unavailable || !!pending}
            />
            <button type="submit" className="btn primary" disabled={!!unavailable || !!pending}>
              <SendHorizontal size={16} />
              Ask
            </button>
          </form>
          <p className="ai-disclaimer">Wren reads only what you can see and can&apos;t change anything yet. Check the records before acting.</p>
        </div>
      </section>
    </div>
  );
}

function Question({ text }: { text: string }) {
  return (
    <div className="wren-msg user">
      <p>{text}</p>
    </div>
  );
}

function Answer({ turn, onAsk, disabled }: { turn: ChatTurnView; onAsk: (q: string) => void; disabled: boolean }) {
  return (
    <div className="wren-msg assistant">
      <p>{turn.text}</p>
      {turn.bullets.length > 0 && (
        <ul className="wren-bullets">
          {turn.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      <AiCards cards={turn.cards} />
      {turn.uncited && <p className="wren-note">No records were used for this reply.</p>}
      {turn.followUpQuestion && (
        <button type="button" className="wren-chip wren-follow" onClick={() => onAsk(turn.followUpQuestion!)} disabled={disabled}>
          {turn.followUpQuestion}
        </button>
      )}
    </div>
  );
}
