import { describe, expect, it } from "vitest";

import { isLens, lensDivisions } from "./lens";

describe("division lens", () => {
  it("shows everything for 'both'", () => {
    expect(lensDivisions("both")).toBeNull();
  });
  it("rolls ICW up under uniforms", () => {
    expect(lensDivisions("uniforms")).toEqual(["uniforms", "icw"]);
    expect(lensDivisions("wholesale")).toEqual(["wholesale"]);
  });
  it("only accepts known lenses from a cookie", () => {
    expect(isLens("wholesale")).toBe(true);
    expect(isLens("icw")).toBe(false);
    expect(isLens(undefined)).toBe(false);
  });
});
