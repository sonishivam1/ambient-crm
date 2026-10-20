/**
 * The test-only stand-in for OpenAI. Integration tests swap it in for
 * lib/ai/client.ts with vi.mock; the running app never imports this file.
 * It records exactly what would have been sent to the model, so tests can
 * prove what does (and doesn't) leave the server.
 */
import { MockLanguageModelV4 } from "ai/test";

export type StandInReply = object | string | Error | { delayMs: number; reply: object | string | Error };

const USAGE = {
  inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 40, text: 40, reasoning: undefined },
};

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const done = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(done);
      reject(signal.reason instanceof Error ? signal.reason : Object.assign(new Error("aborted"), { name: "AbortError" }));
    });
  });
}

function createStandIn() {
  let replies: StandInReply[] = [];
  const sent: string[] = [];

  const model = new MockLanguageModelV4({
    provider: "stand-in",
    modelId: "stand-in-model",
    doGenerate: async (options) => {
      sent.push(JSON.stringify(options.prompt));
      // Replies are used in order; the last one repeats.
      let next = replies.length > 1 ? replies.shift()! : replies[0];
      if (next === undefined) throw new Error("The stand-in has no reply queued.");
      if (typeof next === "object" && !(next instanceof Error) && "delayMs" in next && "reply" in next) {
        await sleep(next.delayMs as number, options.abortSignal);
        next = next.reply as StandInReply;
      }
      if (next instanceof Error) throw next;
      return {
        content: [{ type: "text", text: typeof next === "string" ? next : JSON.stringify(next) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: USAGE,
        warnings: [],
      };
    },
  });

  return {
    model,
    /** Queue the next replies. */
    reply(...next: StandInReply[]) {
      replies = next;
    },
    /** Every prompt sent so far, as JSON text, oldest first. */
    sent,
    reset() {
      replies = [];
      sent.length = 0;
    },
  };
}

export const standIn = createStandIn();
