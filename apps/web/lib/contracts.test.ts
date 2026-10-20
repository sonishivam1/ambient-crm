import { describe, expect, it } from "vitest";

import { BAND, RENEWAL_BANDS, bandFor, daysLeftLabel } from "./contracts";

describe("renewal bands", () => {
  it("puts each day count in exactly one band, edges included", () => {
    expect([-90, -1, 0, 30, 31, 60, 61, 90, 91, 400].map(bandFor)).toEqual(["expired", "expired", "30", "30", "60", "60", "90", "90", "later", "later"]);
  });

  it("has bands that touch without gaps or overlaps", () => {
    for (let i = 1; i < RENEWAL_BANDS.length; i++) {
      expect(BAND[RENEWAL_BANDS[i]!].from).toBe(BAND[RENEWAL_BANDS[i - 1]!].to + 1);
    }
  });

  it("describes days left in words", () => {
    expect(daysLeftLabel(0)).toBe("Ends today");
    expect(daysLeftLabel(1)).toBe("Ends tomorrow");
    expect(daysLeftLabel(9)).toBe("9 days");
    expect(daysLeftLabel(-1)).toBe("Ended yesterday");
    expect(daysLeftLabel(-12)).toBe("Ended 12 days ago");
  });
});
