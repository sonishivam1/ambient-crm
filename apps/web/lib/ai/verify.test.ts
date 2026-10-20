import { describe, expect, it } from "vitest";

import { verifySources } from "./verify";

const handles = new Set(["A1", "T1", "T2"]);

describe("verifySources", () => {
  it("keeps claims whose sources are all real", () => {
    const out = { points: [{ text: "Renewal soon", sources: ["A1", "T1"] }] };
    expect(verifySources(out, handles)).toEqual({ output: out, claims: 1, removed: 0 });
  });

  it("drops invented handles, and claims left with none", () => {
    const out = {
      points: [
        { text: "real", sources: ["T1", "Z9"] },
        { text: "invented", sources: ["Q7"] },
      ],
      nextStep: { text: "made up", sources: ["X1"] },
    };
    const r = verifySources(out, handles);
    expect(r.output).toEqual({ points: [{ text: "real", sources: ["T1"] }], nextStep: null });
    expect(r).toMatchObject({ claims: 3, removed: 2 });
  });

  it("removes duplicate and non-string sources", () => {
    const r = verifySources({ items: [{ text: "x", sources: ["T2", "T2", 3, null] }] }, handles);
    expect(r.output).toEqual({ items: [{ text: "x", sources: ["T2"] }] });
  });

  it("leaves values without sources alone and counts no claims", () => {
    const out = { headline: "Quiet day", quiet: true, items: [] };
    expect(verifySources(out, handles)).toEqual({ output: out, claims: 0, removed: 0 });
  });

  it("reports when every claim was invented", () => {
    const r = verifySources({ points: [{ text: "a", sources: ["Z1"] }, { text: "b", sources: [] }] }, handles);
    expect(r.output).toEqual({ points: [] });
    expect(r.claims).toBe(r.removed);
  });
});
