import { describe, expect, it } from "vitest";

import { ALL_LENS, divisionLabel, lensDivisions, lensOptions, resolveLens } from "./lens";

const northwind = {
  divisions: [
    { key: "wholesale", label: "Wholesale" },
    { key: "uniforms", label: "Uniforms" },
    { key: "icw", label: "ICW" },
    { key: "other", label: "Other" },
  ],
  lenses: [
    { key: "wholesale", label: "Wholesale", divisions: ["wholesale"] },
    { key: "uniforms", label: "Uniforms", divisions: ["uniforms", "icw"] },
  ],
};
const noLens = { divisions: [{ key: "core", label: "Core" }], lenses: [] };

describe("division lens", () => {
  it("offers All plus each of the tenant's lenses", () => {
    expect(lensOptions(northwind).map((o) => o.key)).toEqual([ALL_LENS, "wholesale", "uniforms"]);
    expect(lensOptions(noLens)).toEqual([]);
  });

  it("maps a lens to the divisions it shows", () => {
    expect(lensDivisions(ALL_LENS, northwind)).toBeNull();
    expect(lensDivisions("uniforms", northwind)).toEqual(["uniforms", "icw"]);
  });

  it("only keeps a saved lens the tenant still has", () => {
    expect(resolveLens("wholesale", northwind)).toBe("wholesale");
    expect(resolveLens("trade", northwind)).toBe(ALL_LENS); // another tenant's lens
    expect(resolveLens(undefined, northwind)).toBe(ALL_LENS);
  });

  it("labels divisions from the tenant, falling back to the key", () => {
    expect(divisionLabel(northwind, "icw")).toBe("ICW");
    expect(divisionLabel(northwind, "retired")).toBe("retired");
  });
});
