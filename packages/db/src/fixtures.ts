/**
 * The fictional demo data set (made-up companies and people) for two tenants,
 * shared by the seed script and the integration tests. Dates are relative to
 * when this module loads.
 *
 * The second tenant deliberately reuses some source keys and account codes from
 * the first: they must not collide (ADR 0004).
 */
import type { Db } from "mongodb";

import { ensureIndexes } from "./indexes";
import { calendarDaysBetween, isoDayIn, startOfDay, zonedParts, zonedTime } from "./time";
import type {
  Account,
  Contact,
  CustomerGroup,
  Interaction,
  Notification,
  Rep,
  SalesSnapshot,
  Task,
  Tenant,
  User,
  Visit,
} from "./models";

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
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

/** Day arithmetic on the tenant's own calendar: "3 days from now at 17:00" means local time there. */
function tenantCalendar(timeZone: string) {
  const today = startOfDay(now, timeZone);
  const t = zonedParts(today, timeZone);
  const addDays = (n: number, hour = 9, minute = 0) => zonedTime(t.year, t.month, t.day + n, hour, minute, timeZone);
  const endOfMonth = zonedTime(t.year, t.month + 1, 0, 0, 0, timeZone);
  // Financial year ends 30 June.
  const endOfFy = zonedTime(t.month >= 7 ? t.year + 1 : t.year, 6, 30, 0, 0, timeZone);
  return {
    addDays,
    asOf: addDays(-1, 22, 30),
    daysLeftInMonth: calendarDaysBetween(today, endOfMonth, timeZone),
    daysLeftInYear: calendarDaysBetween(today, endOfFy, timeZone),
  };
}

// ---------- tenant specs ----------
type RepRow = [key: string, code: string, name: string, team: string, segment: string, manager: string | null];
type UserRow = [key: string, role: User["role"], name: string, title: string, rep: string | null];
type GroupRow = [key: string, name: string, code: string, level: CustomerGroup["level"], bt: number, st: number, owner: string, health: "g" | "a" | "r", fy: number, div: CustomerGroup["division"], cg3: string, cg2: string, cg1: string];
type TaskRow = [acct: string, title: string, owner: string, dueIn: number, priority: Task["priority"], status: Task["status"], source: Task["source"], createdBy: string];
type VisitRow = [dayOffset: number, acct: string, type: Visit["type"], purpose: string, status: Visit["status"], rep: string];
type InteractionRow = [daysAgo: number, acct: string, type: Interaction["type"], summary: string, author: string];
/** A contact at a bill-to; `site` picks its n-th sold-to (0 = the bill-to as a whole). */
type ContactRow = [acct: string, first: string, last: string, title: string, roles: string[], site: number, active: boolean];
type NotifRow = [type: Notification["type"], acct: string, title: string, body: string, minutes: number, unread: boolean];

export type TenantSpec = {
  id: string;
  name: string;
  domain: string;
  timeZone: string;
  divisions: Tenant["divisions"];
  lenses: Tenant["lenses"];
  contactRoles: Tenant["contactRoles"];
  sites: string[];
  reps: RepRow[];
  users: UserRow[];
  groups: GroupRow[];
  tasks: TaskRow[];
  visits: VisitRow[];
  interactions: InteractionRow[];
  contacts: ContactRow[];
  notifications: NotifRow[];
  orgSales: [mtd: [number, number], ytd: [number, number], gm: number];
  repSales: Record<string, [mtd: number, target: number, gm: number]>;
};

export const NORTHWIND: TenantSpec = {
  id: "northwind",
  name: "Northwind Supply Co.",
  domain: "northwind.example",
  timeZone: "Australia/Sydney",
  divisions: [
    { key: "wholesale", label: "Wholesale" },
    { key: "uniforms", label: "Uniforms" },
    { key: "icw", label: "ICW" },
    { key: "other", label: "Other" },
  ],
  // ICW rolls up under Uniforms; "Other" only shows with no lens.
  lenses: [
    { key: "wholesale", label: "Wholesale", divisions: ["wholesale"] },
    { key: "uniforms", label: "Uniforms", divisions: ["uniforms", "icw"] },
  ],
  contactRoles: [
    { key: "buyer", label: "Buyer" },
    { key: "finance", label: "Finance" },
    { key: "safety", label: "Safety" },
    { key: "warehouse", label: "Warehouse" },
    { key: "operations", label: "Operations" },
  ],
  sites: ["Sydney HQ", "Melbourne DC", "Brisbane", "Perth", "Geelong", "Adelaide", "Newcastle", "Wollongong", "Toowoomba", "Auckland"],
  // Manager hierarchy: Grace → Liam → field reps.
  reps: [
    ["r3", "GW03", "Grace Whitfield", "NSW Uniforms", "Enterprise", null],
    ["r2", "LC02", "Liam Carter", "WA Wholesale", "Retail", "r3"],
    ["r6", "NB06", "Noah Bennett", "SA Uniforms", "Government", "r3"],
    ["r5", "ET05", "Ella Thompson", "NZ Wholesale", "Retail", "r3"],
    ["r1", "PN01", "Priya Nair", "QLD Uniforms", "Enterprise", "r2"],
    ["r4", "VT04", "VIC Telesales", "VIC Inside Sales", "SMB", "r2"],
    ["r7", "JR07", "Jordan Reyes", "VIC Wholesale", "Retail", "r2"],
    ["r8", "MC08", "Mia Chen", "QLD Wholesale", "Enterprise", "r2"],
  ],
  users: [
    ["u-rep", "user", "Priya Nair", "Account Manager", "r1"],
    ["u-manager", "manager", "Liam Carter", "Manager", "r2"],
    ["u-senior", "senior", "Grace Whitfield", "Senior Manager", "r3"],
    ["u-lead", "lead", "Noah Bennett", "CRM Lead", "r6"],
    ["u-admin", "admin", "Sam Patel", "Administrator", null],
    ["u-super", "super", "Alex Morgan", "Super Admin", null],
  ],
  groups: [
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
  ],
  tasks: [
    ["CO-ACME-BT1", "Follow up on delivery delay complaint", "Priya Nair", -3, "high", "open", "ai", "wren"],
    ["CO-NORTHERN-BT1", "Review renewal pack before pricing call", "Grace Whitfield", -1, "high", "in_progress", "manual", "u-senior"],
    ["CG-HARROW-BT1", "Send updated hi-vis range and price list", "Priya Nair", 0, "normal", "open", "manual", "u-rep"],
    ["CG-BRIGHTWELL-BT1", "Confirm Q4 store roll-out schedule", "Liam Carter", 0, "high", "open", "manager_assigned", "u-super"],
    ["CO-METRO-BT1", "Prepare site-visit brief for Metro Services", "Mia Chen", 1, "normal", "open", "ai", "wren"],
    ["CG-MARLOWE-BT1", "Chase overdue purchase order PO-77120", "VIC Telesales", 2, "high", "open", "manual", "u-manager"],
    ["CG-CASTLEFORD-BT1", "Book stakeholder review with Castleford", "Grace Whitfield", 3, "normal", "open", "manual", "u-senior"],
    ["CO-SKYBRIDGE-BT1", "Draft uniform refresh proposal", "Noah Bennett", 4, "normal", "in_progress", "manager_assigned", "u-super"],
    ["SA-SOUTHPORT-BT1", "Call buyer about stock shortage", "Jordan Reyes", -5, "high", "open", "ai", "wren"],
    ["CG-KIWISAFE-BT1", "Send NZ compliance certificates", "Ella Thompson", 5, "low", "open", "manual", "u-senior"],
    ["CG-SENTINEL-BT1", "Reconcile open orders with warehouse", "VIC Telesales", 6, "normal", "open", "manual", "u-manager"],
    ["CO-WESTLINE-BT1", "Post-visit follow-up: sample boots", "Liam Carter", 7, "normal", "open", "manual", "u-manager"],
    ["SA-HARBOUR-BT1", "Submit council tender response", "Noah Bennett", 9, "high", "in_progress", "manager_assigned", "u-super"],
    ["CG-TRADEPOINT-BT1", "Quarterly range review", "VIC Telesales", 10, "low", "open", "manual", "u-manager"],
    ["SA-DELTA-BT1", "Verify contact details after restructure", "Priya Nair", 12, "low", "open", "ai", "wren"],
    ["CO-ACME-BT1", "Schedule executive check-in", "Priya Nair", 14, "normal", "open", "manual", "u-rep"],
    ["CG-BRIGHTWELL-BT1", "Review shrinkage report with regional lead", "Liam Carter", 16, "normal", "open", "manual", "u-manager"],
    ["CO-METRO-BT1", "Renewal early-bird discount approval", "Mia Chen", 18, "normal", "open", "manager_assigned", "u-senior"],
    ["CG-HARROW-BT1", "Deliver embroidery artwork proofs", "Priya Nair", -8, "normal", "completed", "manual", "u-rep"],
    ["CG-MARLOWE-BT1", "Onboard new store contact", "VIC Telesales", -6, "low", "completed", "manual", "u-manager"],
    ["CO-SKYBRIDGE-BT1", "Confirm hangar PPE requirements", "Noah Bennett", -4, "high", "completed", "manager_assigned", "u-super"],
    ["CG-SENTINEL-BT1", "Update credit terms note", "VIC Telesales", -2, "low", "completed", "manual", "u-manager"],
  ],
  visits: [
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
  ],
  interactions: [
    [1, "CO-ACME-BT1", "call", "Buyer chased an ETA on pallets 3 and 4; promised tracking numbers by Friday.", "u-rep"],
    [4, "CO-ACME-BT1", "note", "Procurement wants weekly delivery updates until the backlog clears.", "u-rep"],
    [12, "CO-ACME-BT1", "meeting", "Quarterly review: agreed to trial the new hi-vis range at two sites.", "u-manager"],
    [2, "CG-HARROW-BT1", "call", "Confirmed Q4 forecast; expects a 12% uplift on boots and hi-vis.", "u-rep"],
    [9, "CG-HARROW-BT1", "note", "Embroidery proofs approved for the regional stores.", "u-rep"],
    [3, "CG-BRIGHTWELL-BT1", "meeting", "Store roll-out planning with the regional lead; dates to confirm.", "u-manager"],
    [6, "CO-NORTHERN-BT1", "note", "Renewal pack drafted; pricing review booked 45 days before end date.", "u-senior"],
    [8, "SA-SOUTHPORT-BT1", "call", "Stock-out on the WB-220 boot; offered an in-stock alternative.", "u-lead"],
  ],
  contacts: [
    ["CO-ACME-BT1", "Hannah", "Brooks", "Procurement Manager", ["buyer"], 1, true],
    ["CO-ACME-BT1", "Marcus", "Lee", "Finance Controller", ["finance"], 0, true],
    ["CO-ACME-BT1", "Tessa", "Doyle", "WHS Officer", ["safety", "operations"], 2, true],
    ["CO-ACME-BT1", "Raj", "Malhotra", "Site Manager", ["operations"], 1, false],
    ["CG-HARROW-BT1", "Olivia", "Grant", "Category Manager", ["buyer"], 0, true],
    ["CG-HARROW-BT1", "Ben", "Fletcher", "Accounts Payable", ["finance"], 0, true],
    ["SA-DELTA-BT1", "Kate", "Sullivan", "Warehouse Lead", ["warehouse"], 1, true],
    ["CG-BRIGHTWELL-BT1", "Daniel", "Wu", "Buyer", ["buyer"], 0, true],
    ["CO-WESTLINE-BT1", "Sophie", "Turner", "Operations Manager", ["operations", "safety"], 1, true],
    ["CG-CASTLEFORD-BT1", "Aaron", "Holt", "Site Manager", ["operations"], 0, true],
    ["CO-NORTHERN-BT1", "Leah", "Morris", "Procurement Manager", ["buyer"], 0, true],
    ["CG-TRADEPOINT-BT1", "Jack", "Hamilton", "Store Manager", ["buyer", "operations"], 1, true],
    ["CG-MARLOWE-BT1", "Ruby", "Clarke", "Buyer", ["buyer"], 0, false],
    ["CG-SENTINEL-BT1", "Chris", "Nolan", "Finance Controller", ["finance"], 0, true],
    ["CG-KIWISAFE-BT1", "Aroha", "Ngata", "Warehouse Lead", ["warehouse"], 1, true],
    ["CO-SKYBRIDGE-BT1", "Megan", "Ford", "Uniform Coordinator", ["buyer"], 0, true],
    ["SA-HARBOUR-BT1", "Paul", "Evans", "Facilities Manager", ["operations"], 0, true],
    ["SA-SOUTHPORT-BT1", "Nina", "Alvarez", "Accounts Payable", ["finance"], 0, true],
    ["CO-METRO-BT1", "Will", "Barker", "Procurement Manager", ["buyer"], 1, true],
  ],
  notifications: [
    ["at_risk_change", "CO-ACME-BT1", "ACME SAFETY moved to At risk", "Sentiment dropped after two delivery complaints in 48 hours.", 12, true],
    ["contract_renewal", "CO-NORTHERN-BT1", "Contract renews in 9 days", "Supply Agreement · $184K · no renewal task exists.", 55, true],
    ["ai_suggestion", "SA-SOUTHPORT-BT1", "Wren drafted a follow-up task", "Offer alternative SKU for out-of-stock work boots.", 130, true],
    ["task_assigned", "CG-BRIGHTWELL-BT1", "Alex Morgan assigned you a task", "Confirm Q4 store roll-out schedule · due today.", 200, false],
    ["email_flagged", "CG-MARLOWE-BT1", "Flagged email needs attention", "Purchase order overdue — customer expects response today.", 320, false],
    ["visit_reminder", "CO-METRO-BT1", "Visit today at 10:30 AM", "Metro Services · 4 open orders · last interaction 8 days ago.", 60 * 20, false],
    ["contract_renewal", "CO-ACME-BT1", "Contract renews in 21 days", "National Safety Program · $312K.", 60 * 26, false],
    ["ai_suggestion", "CG-MARLOWE-BT1", "Wren noticed 24 days of silence", "Suggested a check-in call this week.", 60 * 30, false],
    ["at_risk_change", "SA-SOUTHPORT-BT1", "SOUTHPORT MARINE moved to At risk", "Stock-out on top-selling style plus negative sentiment.", 60 * 50, false],
    ["task_assigned", "CO-SKYBRIDGE-BT1", "New task assigned", "Draft uniform refresh proposal · due in 4 days.", 60 * 52, false],
  ],
  orgSales: [[10.5e6, 31.2e6], [34.7e6, 63.4e6], 0.414],
  repSales: {
    r1: [560e3, 520e3, 0.421], r2: [470e3, 410e3, 0.389], r3: [380e3, 450e3, 0.402], r4: [350e3, 360e3, 0.436],
    r5: [290e3, 330e3, 0.377], r6: [240e3, 210e3, 0.448], r7: [180e3, 240e3, 0.361], r8: [175e3, 175e3, 0.412],
  },
};

/** A small second company. Reuses "CO-ACME" and account codes on purpose. */
export const HARBOR: TenantSpec = {
  id: "harbor",
  name: "Harbor & Finch Distribution",
  domain: "harborfinch.example",
  timeZone: "Pacific/Auckland",
  // A different business, with its own divisions, to prove they are per tenant.
  divisions: [
    { key: "trade", label: "Trade" },
    { key: "institutional", label: "Institutional" },
  ],
  lenses: [
    { key: "trade", label: "Trade", divisions: ["trade"] },
    { key: "institutional", label: "Institutional", divisions: ["institutional"] },
  ],
  contactRoles: [
    { key: "buyer", label: "Buyer" },
    { key: "finance", label: "Finance" },
    { key: "operations", label: "Operations" },
    { key: "facilities", label: "Facilities" },
  ],
  sites: ["Auckland", "Wellington", "Christchurch", "Hamilton"],
  reps: [
    ["r1", "OP01", "Owen Price", "North Island", "Enterprise", null],
    ["r2", "ZA02", "Zara Ahmed", "Auckland Metro", "Retail", "r1"],
    ["r3", "TB03", "Tom Becker", "South Island", "Government", "r1"],
  ],
  users: [
    ["u-rep", "user", "Zara Ahmed", "Account Manager", "r2"],
    ["u-manager", "manager", "Owen Price", "Sales Manager", "r1"],
    ["u-super", "super", "Rita Lopez", "Super Admin", null],
  ],
  groups: [
    ["CG-BLUEWATER", "BLUEWATER MARINE SUPPLY", "BWM", "conglomerate", 9, 40, "Zara Ahmed", "g", 1.9e6, "trade", "Marine", "Coastal", "BLUEWATER"],
    ["CO-ACME", "ACME ELECTRICAL NZ", "ACMEE", "corporation", 3, 12, "Zara Ahmed", "a", 740e3, "trade", "Electrical", "Trade", "ACME"],
    ["CO-PINECREST", "PINECREST HEALTH", "PCH", "corporation", 4, 18, "Tom Becker", "r", 620e3, "institutional", "Healthcare", "Hospitals", "PINECREST"],
    ["SA-LUMEN", "LUMEN SCHOOLS TRUST", "LST", "standalone", 1, 5, "Owen Price", "g", 410e3, "institutional", "Education", "Schools", "LUMEN"],
  ],
  tasks: [
    ["CO-PINECREST-BT1", "Resolve scrubs sizing complaint", "Tom Becker", -2, "high", "open", "ai", "wren"],
    ["CO-ACME-BT1", "Send updated trade price list", "Zara Ahmed", 0, "normal", "open", "manual", "u-rep"],
    ["CG-BLUEWATER-BT1", "Plan summer range launch", "Zara Ahmed", 4, "normal", "open", "manager_assigned", "u-manager"],
    ["SA-LUMEN-BT1", "Confirm term-two uniform order", "Owen Price", 6, "low", "open", "manual", "u-manager"],
  ],
  visits: [
    [0, "CO-ACME-BT1", "site", "Showroom walk-through", "planned", "Zara Ahmed"],
    [2, "CO-PINECREST-BT1", "meeting", "Sizing review with procurement", "planned", "Tom Becker"],
    [5, "CG-BLUEWATER-BT1", "call", "Range planning call", "planned", "Zara Ahmed"],
  ],
  interactions: [
    [1, "CO-PINECREST-BT1", "call", "Procurement reported scrubs running small; samples in two sizes up sent.", "u-manager"],
    [5, "CO-ACME-BT1", "note", "New trade price list requested before the showroom visit.", "u-rep"],
  ],
  // Hannah Brooks shares a name and email with a Northwind contact: emails are unique per tenant only.
  contacts: [
    ["CO-ACME-BT1", "Hannah", "Brooks", "Purchasing Officer", ["buyer"], 0, true],
    ["CG-BLUEWATER-BT1", "Liam", "Hart", "Operations Manager", ["operations"], 1, true],
    ["CO-PINECREST-BT1", "Grace", "Huang", "Procurement Lead", ["buyer", "finance"], 0, true],
    ["SA-LUMEN-BT1", "Mere", "Tane", "Facilities Manager", ["facilities"], 0, true],
  ],
  notifications: [
    ["at_risk_change", "CO-PINECREST-BT1", "PINECREST HEALTH moved to At risk", "Two complaints about scrubs sizing this week.", 40, true],
    ["task_assigned", "CG-BLUEWATER-BT1", "Owen Price assigned you a task", "Plan summer range launch · due in 4 days.", 180, false],
    ["visit_reminder", "CO-ACME-BT1", "Visit today", "ACME Electrical NZ · showroom walk-through.", 60 * 16, false],
  ],
  orgSales: [[1.4e6, 1.6e6], [4.1e6, 5.2e6], 0.392],
  repSales: { r1: [320e3, 300e3, 0.41], r2: [610e3, 640e3, 0.38], r3: [470e3, 560e3, 0.4] },
};

// ---------- build ----------
export type Built = {
  tenant: Tenant;
  reps: Rep[];
  users: User[];
  groups: CustomerGroup[];
  accounts: Account[];
  tasks: Task[];
  visits: Visit[];
  interactions: Interaction[];
  contacts: Contact[];
  notifications: Notification[];
  salesSnapshots: SalesSnapshot[];
};

export function build(spec: TenantSpec): Built {
  const tenantId = spec.id;
  const { addDays, asOf, daysLeftInMonth, daysLeftInYear } = tenantCalendar(spec.timeZone);
  const id = (key: string) => `${tenantId}:${key}`;
  const email = (name: string) => `${name.toLowerCase().replace(/\s+/g, ".")}@${spec.domain}`;

  const reps: Rep[] = spec.reps.map(([key, code, name, team, segment, manager]) => ({
    _id: id(key), tenantId, sourceKey: key, code, name, email: email(name), team, segment,
    managerRepId: manager ? id(manager) : null, active: true, syncedAt: now,
  }));
  const repId = (name: string) => reps.find((r) => r.name === name)!._id;

  const users: User[] = spec.users.map(([key, role, name, title, rep]) => ({
    _id: id(key), tenantId, entraOid: null, email: email(name), name, title, role, repId: rep ? id(rep) : null,
    createdAt: now, updatedAt: now, deletedAt: null, deletedBy: null,
  }));

  const groups: CustomerGroup[] = spec.groups.map(([key, name, code, level, bt, st, owner, health, fy, division, cg3, cg2, cg1]) => ({
    _id: id(key), tenantId, sourceKey: key, name, code, level, ownerRepId: repId(owner), division, health, fyRevenue: fy,
    billToCount: bt, soldToCount: st, hierarchy: { cg1, cg2, cg3 }, syncedAt: now,
  }));

  const accounts: Account[] = [];
  spec.groups.forEach((g, gi) => {
    const [key, name, , , bt, , owner, health, fy, division, cg3] = g;
    const r = rng(key);
    const nBt = Math.min(bt, 3 + Math.floor(r() * 2));
    for (let i = 0; i < nBt; i++) {
      const site = spec.sites[(gi * 3 + i * 5) % spec.sites.length]!;
      const btKey = `${key}-BT${i + 1}`;
      accounts.push({
        _id: id(btKey), tenantId, sourceKey: btKey, type: "bill_to", groupId: id(key), parentId: null,
        name: i === 0 ? name : `${name} – ${site.toUpperCase()}`,
        code: `BT-${16000 + gi * 137 + i * 11}`, site, ownerRepId: repId(owner),
        division, segment: cg3, health: i === 0 ? health : pick(r, ["g", "a", "a", "g", "r"] as const),
        fyRevenue: Math.round((fy * (i === 0 ? 0.55 : 0.3 / i)) / 1000) * 1000, active: true, syncedAt: now,
      });
      const nSt = 2 + Math.floor(r() * 2);
      for (let j = 0; j < nSt; j++) {
        const s2 = spec.sites[(gi + i * 2 + j * 7) % spec.sites.length]!;
        const stKey = `${btKey}-ST${j + 1}`;
        accounts.push({
          _id: id(stKey), tenantId, sourceKey: stKey, type: "sold_to", groupId: id(key), parentId: id(btKey),
          name: `${name} – ${s2.toUpperCase()} #${j + 1}`, code: `ST-${420000 + gi * 900 + i * 31 + j}`,
          site: s2, ownerRepId: repId(owner), division, segment: cg3,
          health: pick(r, ["g", "a", "g", "a", "r"] as const),
          fyRevenue: Math.round((fy * 0.12) / (j + 1) / 1000) * 1000, active: true, syncedAt: now,
        });
      }
    }
  });
  const divisionOf = (accountKey: string) => accounts.find((a) => a._id === id(accountKey))!.division;
  const actor = (key: string) => (key === "wren" ? "wren" : id(key));

  const tasks: Task[] = spec.tasks.map(([acct, title, owner, dueIn, priority, status, source, createdBy], i) => ({
    _id: id(`t${i + 1}`), tenantId, accountId: id(acct), division: divisionOf(acct), title,
    description: "Context captured from the account timeline and recent correspondence.",
    notes: "",
    ownerRepId: repId(owner), dueAt: addDays(dueIn, 17), priority, status, source, createdByUserId: actor(createdBy),
    completedAt: status === "completed" ? addDays(dueIn, 15) : null,
    cancelReason: null,
    createdAt: addDays(-3 - i * 2), updatedAt: addDays(-3 - i * 2), deletedAt: null, deletedBy: null,
  }));

  const visits: Visit[] = spec.visits.map(([offset, acct, type, purpose, status, rep], i) => ({
    _id: id(`v${i + 1}`), tenantId, accountId: id(acct), division: divisionOf(acct), repId: repId(rep), type, status, purpose,
    scheduledAt: addDays(offset, 9 + (i % 6), i % 2 ? 30 : 0),
    createdAt: addDays(-30), updatedAt: addDays(-30), deletedAt: null, deletedBy: null,
  }));

  const interactions: Interaction[] = spec.interactions.map(([daysAgo, acct, type, summary, author], i) => ({
    _id: id(`i${i + 1}`), tenantId, accountId: id(acct), division: divisionOf(acct), type, summary,
    authorUserId: id(author), occurredAt: addDays(-daysAgo, 11 + (i % 5), i % 2 ? 15 : 0),
    createdAt: addDays(-daysAgo, 12), updatedAt: addDays(-daysAgo, 12), deletedAt: null, deletedBy: null,
  }));

  const contactCreator = id(spec.users[0]![0]);
  const contacts: Contact[] = spec.contacts.map(([acct, first, last, jobTitle, roles, site, active], i) => {
    const account = accounts.find((a) => a._id === id(acct))!;
    const domain = account.name.split(" ")[0]!.toLowerCase().replace(/[^a-z]/g, "");
    const at = addDays(-((i * 7) % 50) - 1, 10);
    return {
      _id: id(`c${i + 1}`), tenantId, accountId: account._id, soldToAccountId: site ? id(`${acct}-ST${site}`) : null,
      ownerRepId: account.ownerRepId, division: account.division, firstName: first, lastName: last, jobTitle,
      email: `${first}.${last}@${domain}.example`.toLowerCase(),
      phone: spec.id === "harbor" ? `021 555 ${String(100 + i).padStart(4, "0")}` : `0491 570 ${110 + i}`,
      roles, active, createdByUserId: contactCreator, updatedByUserId: contactCreator,
      createdAt: at, updatedAt: at, deletedAt: null, deletedBy: null,
    };
  });

  const notifications: Notification[] = users.flatMap((u) =>
    spec.notifications.map(([type, acct, title, body, minutes, unread], i) => ({
      _id: `${u._id}-n${i + 1}`, tenantId, userId: u._id, type, accountId: id(acct), title, body,
      readAt: unread ? null : minutesAgo(minutes - 5), createdAt: minutesAgo(minutes),
    })),
  );

  const day = isoDayIn(asOf, spec.timeZone);
  const snap = (scope: string, mtd: [number, number], ytd: [number, number], gmPct: number): SalesSnapshot => ({
    _id: id(`${scope}-${day}`), tenantId, scope, asOf,
    mtd: { actual: mtd[0], target: mtd[1] }, ytd: { actual: ytd[0], target: ytd[1] }, gmPct, daysLeftInMonth, daysLeftInYear,
  });
  const salesSnapshots: SalesSnapshot[] = [
    snap("org", ...spec.orgSales),
    ...Object.entries(spec.repSales).map(([rep, [mtd, target, gm]]) => snap(id(rep), [mtd, target], [mtd * 3.4, target * 6.9], gm)),
  ];

  const tenant: Tenant = {
    _id: tenantId,
    name: spec.name,
    timeZone: spec.timeZone,
    divisions: spec.divisions,
    lenses: spec.lenses,
    contactRoles: spec.contactRoles,
    entraTenantId: null,
    active: true,
    createdAt: now,
  };
  return { tenant, reps, users, groups, accounts, tasks, visits, interactions, contacts, notifications, salesSnapshots };
}

export type SeedSummary = { tenantId: string; counts: Record<string, number> };

/** Drop every collection in `db`, create indexes, and insert both demo tenants. */
export async function seedDemoData(db: Db): Promise<SeedSummary[]> {
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    await db.collection(name).drop();
  }
  // Indexes first, so the unique per-tenant keys are enforced while seeding.
  await ensureIndexes(db);
  const summaries: SeedSummary[] = [];
  for (const spec of [NORTHWIND, HARBOR]) {
    const b = build(spec);
    await db.collection<Tenant>("tenants").insertOne(b.tenant);
    const sets: Array<[string, object[]]> = [
      ["reps", b.reps],
      ["users", b.users],
      ["customerGroups", b.groups],
      ["accounts", b.accounts],
      ["tasks", b.tasks],
      ["visits", b.visits],
      ["interactions", b.interactions],
      ["contacts", b.contacts],
      ["notifications", b.notifications],
      ["salesSnapshots", b.salesSnapshots],
    ];
    const counts: Record<string, number> = {};
    for (const [name, docs] of sets) {
      if (docs.length) await db.collection(name).insertMany(docs as never[]);
      counts[name] = docs.length;
    }
    summaries.push({ tenantId: spec.id, counts });
  }
  return summaries;
}
