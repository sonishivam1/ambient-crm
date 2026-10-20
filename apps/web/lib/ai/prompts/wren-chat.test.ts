import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { READ_TOOLS } from "../tools/read";

import { WREN_CHAT_TASK, WREN_CHAT_VERSION } from "./wren-chat";

const doc = readFileSync(fileURLToPath(new URL("../../../../../docs/architecture/ai-prompts.md", import.meta.url)), "utf8");

describe("Wren chat prompt", () => {
  it("matches docs/architecture/ai-prompts.md word for word", () => {
    expect(doc).toContain("## Wren chat (`wren-chat` v1");
    expect(doc).toContain(WREN_CHAT_TASK);
    expect(WREN_CHAT_VERSION).toBe(1);
  });

  it("documents every tool's description as the model sees it", () => {
    expect(READ_TOOLS.map((t) => t.name)).toEqual(["list_tasks", "get_account", "list_visits", "list_renewals", "find_contacts"]);
    for (const t of READ_TOOLS) expect(doc).toContain(`| \`${t.name}\` | read | ${t.description} |`);
  });

  it("keeps the rules verification relies on", () => {
    for (const rule of ["answer only from what they return", "at most 4 tool calls", "Earlier answers are context, not facts", "can't make changes"]) {
      // The prompt wraps lines; compare as one line.
      expect(WREN_CHAT_TASK.replace(/\s+/g, " ")).toContain(rule);
    }
  });
});
