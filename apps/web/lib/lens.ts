import type { Division } from "@ambient/db";

export const LENS_COOKIE = "amb_lens";
export const LENSES = ["both", "wholesale", "uniforms"] as const;
export type Lens = (typeof LENSES)[number];

export const isLens = (v: string | undefined): v is Lens => !!v && (LENSES as readonly string[]).includes(v);

/** Divisions a lens shows. ICW rolls up under Uniforms. */
export function lensDivisions(lens: Lens): Division[] | null {
  if (lens === "wholesale") return ["wholesale"];
  if (lens === "uniforms") return ["uniforms", "icw"];
  return null;
}
