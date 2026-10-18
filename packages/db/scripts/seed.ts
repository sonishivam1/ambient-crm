/**
 * Seeds a local database with a fictional data set (made-up companies and
 * people), so every screen can be built and reviewed before real data is
 * connected. Dates are relative to the day the seed runs.
 *
 * Destructive: drops every collection in MONGODB_DB first. Refuses to run
 * against anything but a local server.
 */
import {
  closeClient,
  collection,
  ensureIndexes,
  getDb,
  type Account,
  type CustomerGroup,
  type Notification,
  type Rep,
  type SalesSnapshot,
  type Task,
  type User,
  type Visit,
} from "../src/index";

const uri = process.env.MONGODB_URI ?? "";
if (!/\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri)) {
  console.error("Refusing to seed: MONGODB_URI must point at localhost.");
  process.exit(1);
}

// ---------- deterministic helpers ----------
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: string) {
  let a = hashStr(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, arr: readonly T[]) => arr[Math.floor(r() * arr.length)]!;

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const addDays = (n: number, hour = 9, minute = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

// ---------- reps (manager hierarchy: Grace → Liam → field reps) ----------
const REPS: Array<[id: string, code: string, name: string, team: string, segment: string, manager: string | null]> = [
  ["r3", "GW03", "Grace Whitfield", "NSW Uniforms", "Enterprise", null],
  ["r2", "LC02", "Liam Carter", "WA Wholesale", "Retail", "r3"],
  ["r6", "NB06", "Noah Bennett", "SA Uniforms", "Government", "r3"],
  ["r5", "ET05", "Ella Thompson", "NZ Wholesale", "Retail", "r3"],
  ["r1", "PN01", "Priya Nair", "QLD Uniforms", "Enterprise", "r2"],
  ["r4", "VT04", "VIC Telesales", "VIC Inside Sales", "SMB", "r2"],
  ["r7", "JR07", "Jordan Reyes", "VIC Wholesale", "Retail", "r2"],
  ["r8", "MC08", "Mia Chen", "QLD Wholesale", "Enterprise", "r2"],
];
const email = (name: string) => `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`;
const reps: Rep[] = REPS.map(([_id, code, name, team, segment, managerRepId]) => ({
  _id, code, name, email: email(name), team, segment, managerRepId, active: true, syncedAt: now,
}));
const repId = (name: string) => reps.find((r) => r.name === name)!._id;
const divisionOf = (accountId: string) => accounts.find((a) => a._id === accountId)!.division;

// ---------- users: one per role, for the development role switcher ----------
const USERS: Array<[id: string, role: User["role"], name: string, title: string, rep: string | null]> = [
  ["u-rep", "user", "Priya Nair", "Account Manager", "r1"],
  ["u-manager", "manager", "Liam Carter", "Manager", "r2"],
  ["u-senior", "senior", "Grace Whitfield", "Senior Manager", "r3"],
  ["u-lead", "lead", "Noah Bennett", "CRM Lead", "r6"],
  ["u-admin", "admin", "Sam Patel", "Administrator", null],
  ["u-super", "super", "Alex Morgan", "Super Admin", null],
];
const users: User[] = USERS.map(([_id, role, name, title, rep]) => ({
  _id, entraOid: null, email: email(name), name, title, role, repId: rep,
  createdAt: now, updatedAt: now, deletedAt: null, deletedBy: null,
}));

// ---------- customer groups ----------
type G = [key: string, name: string, code: string, level: CustomerGroup["level"], bt: number, st: number, owner: string, health: "g" | "a" | "r", fy: number, div: CustomerGroup["division"], cg3: string, cg2: string, cg1: string];
const GROUPS: G[] = [
  ["CG-HARROW", "HARROW HARDWARE GROUP", "HHG", "conglomerate", 69, 127, "Priya Nair", "a", 4.2e6, "wholesale", "Retail Hardware", "Regional QLD", "HARROW"],
  ["CG-BRIGHTWELL", "BRIGHTWELL HOME SUPPLY (WA)", "BRIGHT", "conglomerate", 1, 529, "Liam Carter", "a", 2.7e6, "wholesale", "Retail Hardware", "Brightwell WA", "BRIGHTWELL"],
  ["CG-CASTLEFORD", "CASTLEFORD INDUSTRIAL", "CSTL", "conglomerate", 6, 314, "Grace Whitfield", "a", 2.6e6, "uniforms", "Industrial", "Castleford", "CASTLEFORD"],
  ["CG-TRADEPOINT", "TRADEPOINT WANGARATTA", "TPW", "conglomerate", 205, 293, "VIC Telesales", "g", 2.2e6, "wholesale", "Trade Retail", "Tradepoint", "TPW"],
  ["CG-KIWISAFE", "KIWI SITE SAFETY LTD", "KSS", "conglomerate", 6, 137, "Ella Thompson", "a", 1.6e6, "wholesale", "Safety Retail", "NZ", "KSS"],
  ["CG-MARLOWE", "MARLOWE MENSWEAR", "MARLOWE", "conglomerate", 47, 688, "VIC Telesales", "g", 1.4e6, "wholesale", "Menswear", "VIC", "MARLOWE"],
  ["CG-SENTINEL", "SENTINEL SAFETY PTY LTD", "SENTINEL", "conglomerate", 320, 692, "VIC Telesales", "a", 1.2e6, "wholesale", "Safety Retail", "National", "SENTINEL"],
  ["CO-SKYBRIDGE", "SKYBRIDGE AVIATION", "SKYB", "corporation", 12, 44, "Noah Bennett", "g", 1.1e6, "uniforms", "Aviation", "Airlines", "SKYBRIDGE"],
  ["CO-ACME", "ACME SAFETY", "ACME", "corporation", 4, 19, "Priya Nair", "r", 980e3, "uniforms", "Industrial", "Safety Solutions", "ACME"],
  ["CO-NORTHERN", "NORTHERN INDUSTRIAL", "NTHIND", "corporation", 3, 22, "Grace Whitfield", "a", 870e3, "uniforms", "Industrial", "Manufacturing", "NTHIND"],
  ["CO-METRO", "METRO SERVICES", "METRO", "corporation", 5, 31, "Mia Chen", "g", 760e3, "uniforms", "Facilities", "Services", "METRO"],
  ["CO-WESTLINE", "WESTLINE GROUP", "WSTLN", "corporation", 2, 14, "Liam Carter", "g", 640e3, "icw", "Construction", "Civil", "WSTLN"],
  ["SA-HARBOUR", "HARBOUR CITY COUNCIL", "HCC", "standalone", 1, 8, "Noah Bennett", "g", 520e3, "icw", "Government", "Local", "HCC"],
  ["SA-SOUTHPORT", "SOUTHPORT MARINE SERVICES", "SPMS", "standalone", 1, 3, "Jordan Reyes", "r", 310e3, "other", "Marine", "Services", "SPMS"],
  ["SA-DELTA", "DELTA MINING SUPPLIES", "DMS", "standalone", 2, 6, "Priya Nair", "a", 290e3, "uniforms", "Mining", "Supplies", "DMS"],
];
const groups: CustomerGroup[] = GROUPS.map(([_id, name, code, level, bt, st, owner, health, fy, division, cg3, cg2, cg1]) => ({
  _id, name, code, level, ownerRepId: repId(owner), division, health, fyRevenue: fy,
  billToCount: bt, soldToCount: st, hierarchy: { cg1, cg2, cg3 }, syncedAt: now,
}));

// ---------- accounts: bill-tos with sold-to children ----------
const SITES = ["Sydney HQ", "Melbourne DC", "Brisbane", "Perth", "Geelong", "Adelaide", "Newcastle", "Wollongong", "Toowoomba", "Auckland"];
const accounts: Account[] = [];
GROUPS.forEach((g, gi) => {
  const [key, name, , , bt, , owner, health, fy, division, cg3] = g;
  const r = rng(key);
  const nBt = Math.min(bt, 3 + Math.floor(r() * 2));
  for (let i = 0; i < nBt; i++) {
    const site = SITES[(gi * 3 + i * 5) % SITES.length]!;
    const id = `${key}-BT${i + 1}`;
    accounts.push({
      _id: id, type: "bill_to", groupId: key, parentId: null,
      name: i === 0 ? name : `${name} – ${site.toUpperCase()}`,
      code: `BT-${16000 + gi * 137 + i * 11}`, site, ownerRepId: repId(owner),
      division, segment: cg3, health: i === 0 ? health : pick(r, ["g", "a", "a", "g", "r"] as const),
      fyRevenue: Math.round((fy * (i === 0 ? 0.55 : 0.3 / i)) / 1000) * 1000, active: true, syncedAt: now,
    });
    const nSt = 2 + Math.floor(r() * 2);
    for (let j = 0; j < nSt; j++) {
      const s2 = SITES[(gi + i * 2 + j * 7) % SITES.length]!;
      accounts.push({
        _id: `${id}-ST${j + 1}`, type: "sold_to", groupId: key, parentId: id,
        name: `${name} – ${s2.toUpperCase()} #${j + 1}`, code: `ST-${420000 + gi * 900 + i * 31 + j}`,
        site: s2, ownerRepId: repId(owner), division, segment: cg3,
        health: pick(r, ["g", "a", "g", "a", "r"] as const),
        fyRevenue: Math.round((fy * 0.12) / (j + 1) / 1000) * 1000, active: true, syncedAt: now,
      });
    }
  }
});

// ---------- tasks ----------
type T = [acct: string, title: string, owner: string, dueIn: number, priority: Task["priority"], status: Task["status"], source: Task["source"], createdBy: string];
const TASKS: T[] = [
  ["CO-ACME-BT1", "Follow up on delivery delay complaint", "Priya Nair", -3, "high", "open", "cara_ai", "cara"],
  ["CO-NORTHERN-BT1", "Review renewal pack before pricing call", "Grace Whitfield", -1, "high", "in_progress", "manual", "u-senior"],
  ["CG-HARROW-BT1", "Send updated hi-vis range and price list", "Priya Nair", 0, "normal", "open", "manual", "u-rep"],
  ["CG-BRIGHTWELL-BT1", "Confirm Q4 store roll-out schedule", "Liam Carter", 0, "high", "open", "manager_assigned", "u-super"],
  ["CO-METRO-BT1", "Prepare site-visit brief for Metro Services", "Mia Chen", 1, "normal", "open", "cara_ai", "cara"],
  ["CG-MARLOWE-BT1", "Chase overdue purchase order PO-77120", "VIC Telesales", 2, "high", "open", "manual", "u-manager"],
  ["CG-CASTLEFORD-BT1", "Book stakeholder review with Castleford", "Grace Whitfield", 3, "normal", "open", "manual", "u-senior"],
  ["CO-SKYBRIDGE-BT1", "Draft uniform refresh proposal", "Noah Bennett", 4, "normal", "in_progress", "manager_assigned", "u-super"],
  ["SA-SOUTHPORT-BT1", "Call buyer about stock shortage", "Jordan Reyes", -5, "high", "open", "cara_ai", "cara"],
  ["CG-KIWISAFE-BT1", "Send NZ compliance certificates", "Ella Thompson", 5, "low", "open", "manual", "u-senior"],
  ["CG-SENTINEL-BT1", "Reconcile open orders with warehouse", "VIC Telesales", 6, "normal", "open", "manual", "u-manager"],
  ["CO-WESTLINE-BT1", "Post-visit follow-up: sample boots", "Liam Carter", 7, "normal", "open", "manual", "u-manager"],
  ["SA-HARBOUR-BT1", "Submit council tender response", "Noah Bennett", 9, "high", "in_progress", "manager_assigned", "u-super"],
  ["CG-TRADEPOINT-BT1", "Quarterly range review", "VIC Telesales", 10, "low", "open", "manual", "u-manager"],
  ["SA-DELTA-BT1", "Verify contact details after restructure", "Priya Nair", 12, "low", "open", "cara_ai", "cara"],
  ["CO-ACME-BT1", "Schedule executive check-in", "Priya Nair", 14, "normal", "open", "manual", "u-rep"],
  ["CG-BRIGHTWELL-BT1", "Review shrinkage report with regional lead", "Liam Carter", 16, "normal", "open", "manual", "u-manager"],
  ["CO-METRO-BT1", "Renewal early-bird discount approval", "Mia Chen", 18, "normal", "open", "manager_assigned", "u-senior"],
  ["CG-HARROW-BT1", "Deliver embroidery artwork proofs", "Priya Nair", -8, "normal", "completed", "manual", "u-rep"],
  ["CG-MARLOWE-BT1", "Onboard new store contact", "VIC Telesales", -6, "low", "completed", "manual", "u-manager"],
  ["CO-SKYBRIDGE-BT1", "Confirm hangar PPE requirements", "Noah Bennett", -4, "high", "completed", "manager_assigned", "u-super"],
  ["CG-SENTINEL-BT1", "Update credit terms note", "VIC Telesales", -2, "low", "completed", "manual", "u-manager"],
];
const tasks: Task[] = TASKS.map(([accountId, title, owner, dueIn, priority, status, source, createdBy], i) => ({
  _id: `t${i + 1}`, accountId, division: divisionOf(accountId), title, description: "Context captured from the account timeline and recent correspondence.",
  ownerRepId: repId(owner), dueAt: addDays(dueIn, 17), priority, status, source, createdByUserId: createdBy,
  completedAt: status === "completed" ? addDays(dueIn, 15) : null,
  createdAt: addDays(-3 - i * 2), updatedAt: addDays(-3 - i * 2), deletedAt: null, deletedBy: null,
}));

// ---------- visits ----------
type V = [dayOffset: number, acct: string, type: Visit["type"], purpose: string, status: Visit["status"], rep: string];
const VISITS: V[] = [
  [-2, "CO-ACME-BT1", "site", "Delivery issue walk-through", "planned", "Priya Nair"],
  [0, "CO-METRO-BT1", "site", "Quarterly site visit · 4 open orders", "planned", "Mia Chen"],
  [1, "CG-BRIGHTWELL-BT1", "meeting", "Q4 store roll-out planning", "planned", "Liam Carter"],
  [2, "CO-WESTLINE-BT1", "meeting", "Customer review", "planned", "Liam Carter"],
  [3, "CG-HARROW-BT1", "site", "Range refresh and fit-testing", "planned", "Priya Nair"],
  [7, "CO-NORTHERN-BT1", "call", "Renewal discussion", "planned", "Grace Whitfield"],
  [8, "CG-CASTLEFORD-BT1", "meeting", "Stakeholder review with Castleford", "planned", "Grace Whitfield"],
  [9, "CO-SKYBRIDGE-BT1", "site", "Hangar PPE audit", "planned", "Noah Bennett"],
  [14, "CG-MARLOWE-BT1", "call", "Overdue PO follow-up", "planned", "VIC Telesales"],
  [15, "SA-HARBOUR-BT1", "meeting", "Tender clarification", "planned", "Noah Bennett"],
  [16, "CG-KIWISAFE-BT1", "site", "NZ warehouse tour", "planned", "Ella Thompson"],
  [21, "CG-SENTINEL-BT1", "site", "National stock reconciliation", "planned", "VIC Telesales"],
  [23, "CG-TRADEPOINT-BT1", "call", "Range review call", "planned", "VIC Telesales"],
  [28, "SA-DELTA-BT1", "site", "Mine-site fitting day", "planned", "Priya Nair"],
  [30, "CO-ACME-BT1", "meeting", "Executive check-in", "planned", "Priya Nair"],
  [-3, "CG-MARLOWE-BT1", "site", "Store walk and stock take", "completed", "VIC Telesales"],
  [-6, "CO-SKYBRIDGE-BT1", "meeting", "PPE requirements meeting", "completed", "Noah Bennett"],
  [-9, "CG-HARROW-BT1", "site", "Proof approvals", "completed", "Priya Nair"],
  [-14, "CO-METRO-BT1", "site", "Onboarding new site lead", "completed", "Mia Chen"],
  [-20, "SA-SOUTHPORT-BT1", "call", "Stock shortage escalation", "completed", "Jordan Reyes"],
];
const visits: Visit[] = VISITS.map(([offset, accountId, type, purpose, status, rep], i) => ({
  _id: `v${i + 1}`, accountId, division: divisionOf(accountId), repId: repId(rep), type, status, purpose,
  scheduledAt: addDays(offset, 9 + (i % 6), i % 2 ? 30 : 0),
  createdAt: addDays(-30), updatedAt: addDays(-30), deletedAt: null, deletedBy: null,
}));

// ---------- notifications: the same feed for every seeded user ----------
type N = [type: Notification["type"], acct: string, title: string, body: string, minutes: number, unread: boolean];
const NOTIFS: N[] = [
  ["at_risk_change", "CO-ACME-BT1", "ACME SAFETY moved to At risk", "Sentiment dropped after two delivery complaints in 48 hours.", 12, true],
  ["contract_renewal", "CO-NORTHERN-BT1", "Contract renews in 9 days", "Supply Agreement · $184K · no renewal task exists.", 55, true],
  ["ai_suggestion", "SA-SOUTHPORT-BT1", "Cara drafted a follow-up task", "Offer alternative SKU for out-of-stock work boots.", 130, true],
  ["task_assigned", "CG-BRIGHTWELL-BT1", "Alex Morgan assigned you a task", "Confirm Q4 store roll-out schedule · due today.", 200, false],
  ["email_flagged", "CG-MARLOWE-BT1", "Flagged email needs attention", "Purchase order overdue — customer expects response today.", 320, false],
  ["visit_reminder", "CO-METRO-BT1", "Visit today at 10:30 AM", "Metro Services · 4 open orders · last interaction 8 days ago.", 60 * 20, false],
  ["contract_renewal", "CO-ACME-BT1", "Contract renews in 21 days", "National Safety Program · $312K.", 60 * 26, false],
  ["ai_suggestion", "CG-MARLOWE-BT1", "Cara noticed 24 days of silence", "Suggested a check-in call this week.", 60 * 30, false],
  ["at_risk_change", "SA-SOUTHPORT-BT1", "SOUTHPORT MARINE moved to At risk", "Stock-out on top-selling style plus negative sentiment.", 60 * 50, false],
  ["task_assigned", "CO-SKYBRIDGE-BT1", "New task assigned", "Draft uniform refresh proposal · due in 4 days.", 60 * 52, false],
];
const notifications: Notification[] = users.flatMap((u) =>
  NOTIFS.map(([type, accountId, title, body, minutes, unread], i) => ({
    _id: `${u._id}-n${i + 1}`, userId: u._id, type, accountId, title, body,
    readAt: unread ? null : minutesAgo(minutes - 5), createdAt: minutesAgo(minutes),
  })),
);

// ---------- sales snapshots (as of yesterday, like the nightly rollup) ----------
const asOf = addDays(-1, 22, 30);
const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
const endOfFy = new Date(today.getMonth() >= 6 ? today.getFullYear() + 1 : today.getFullYear(), 5, 30);
const daysLeftInMonth = Math.round((endOfMonth.getTime() - today.getTime()) / 86_400_000);
const daysLeftInYear = Math.round((endOfFy.getTime() - today.getTime()) / 86_400_000);
const snap = (scope: string, mtd: [number, number], ytd: [number, number], gmPct: number): SalesSnapshot => ({
  _id: `${scope}-${asOf.toISOString().slice(0, 10)}`, scope, asOf,
  mtd: { actual: mtd[0], target: mtd[1] }, ytd: { actual: ytd[0], target: ytd[1] }, gmPct, daysLeftInMonth, daysLeftInYear,
});
const REP_SALES: Record<string, [number, number, number]> = {
  r1: [560e3, 520e3, 0.421], r2: [470e3, 410e3, 0.389], r3: [380e3, 450e3, 0.402], r4: [350e3, 360e3, 0.436],
  r5: [290e3, 330e3, 0.377], r6: [240e3, 210e3, 0.448], r7: [180e3, 240e3, 0.361], r8: [175e3, 175e3, 0.412],
};
const salesSnapshots: SalesSnapshot[] = [
  snap("org", [10.5e6, 31.2e6], [34.7e6, 63.4e6], 0.414),
  ...Object.entries(REP_SALES).map(([rep, [mtd, target, gm]]) => snap(rep, [mtd, target], [mtd * 3.4, target * 6.9], gm)),
];

// ---------- write ----------
async function main() {
  const db = await getDb();
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    await db.collection(name).drop();
  }
  await (await collection("reps")).insertMany(reps);
  await (await collection("users")).insertMany(users);
  await (await collection("customerGroups")).insertMany(groups);
  await (await collection("accounts")).insertMany(accounts);
  await (await collection("tasks")).insertMany(tasks);
  await (await collection("visits")).insertMany(visits);
  await (await collection("notifications")).insertMany(notifications);
  await (await collection("salesSnapshots")).insertMany(salesSnapshots);
  await ensureIndexes();
  console.log(
    `Seeded ${db.databaseName}: ${reps.length} reps, ${users.length} users, ${groups.length} groups, ` +
      `${accounts.length} accounts, ${tasks.length} tasks, ${visits.length} visits, ` +
      `${notifications.length} notifications, ${salesSnapshots.length} sales snapshots.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeClient);
