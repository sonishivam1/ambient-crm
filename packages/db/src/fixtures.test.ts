import { describe, expect, it } from "vitest";

import { HARBOR, NORTHWIND, build } from "./fixtures";
import {
  accountSchema,
  customerGroupSchema,
  interactionSchema,
  notificationSchema,
  repSchema,
  salesSnapshotSchema,
  taskSchema,
  tenantSchema,
  userSchema,
  visitSchema,
} from "./models";
import { isValidTimeZone } from "./time";

describe.each([NORTHWIND, HARBOR])("demo tenant $id", (spec) => {
  const b = build(spec);

  it("produces documents that match their schemas", () => {
    expect(() => tenantSchema.parse(b.tenant)).not.toThrow();
    for (const [schema, docs] of [
      [repSchema, b.reps],
      [userSchema, b.users],
      [customerGroupSchema, b.groups],
      [accountSchema, b.accounts],
      [taskSchema, b.tasks],
      [visitSchema, b.visits],
      [interactionSchema, b.interactions],
      [notificationSchema, b.notifications],
      [salesSnapshotSchema, b.salesSnapshots],
    ] as const) {
      for (const doc of docs) expect(() => schema.parse(doc), JSON.stringify(doc).slice(0, 120)).not.toThrow();
    }
  });

  it("only uses divisions the tenant defines, and lenses point at real divisions", () => {
    const keys = new Set(b.tenant.divisions.map((d) => d.key));
    for (const doc of [...b.groups, ...b.accounts, ...b.tasks, ...b.visits, ...b.interactions]) {
      expect(keys.has(doc.division), `${doc._id} uses ${doc.division}`).toBe(true);
    }
    for (const lens of b.tenant.lenses) for (const d of lens.divisions) expect(keys.has(d)).toBe(true);
  });

  it("has a real time zone and puts every record in this tenant", () => {
    expect(isValidTimeZone(b.tenant.timeZone)).toBe(true);
    for (const doc of [...b.reps, ...b.accounts, ...b.tasks, ...b.notifications]) expect(doc.tenantId).toBe(spec.id);
  });
});

it("gives the two tenants different divisions", () => {
  const keys = (spec: typeof NORTHWIND) => build(spec).tenant.divisions.map((d) => d.key);
  expect(keys(NORTHWIND)).toEqual(["wholesale", "uniforms", "icw", "other"]);
  expect(keys(HARBOR)).toEqual(["trade", "institutional"]);
});
