/**
 * No Tap Info Entry: turns what the AI heard (a spoken job update) and saw
 * (job photos) into a list of proposed changes to records Owner'sLOCAL
 * already has -- job notes/activity, Job Tracking, inventory, scheduling,
 * change-order estimates, documents, expenses, notifications. Nothing here
 * writes anything; the Review & Save screen shows every proposal, lets the
 * user edit or untick it, and only then applies it (see useNoTapEntry).
 */
import type { InventoryItem } from "../types/domain";

// ------------------------------------------------------------------ AI responses (mirror server/aiHandler.ts)

export interface VoiceExtraction {
  transcript: string;
  workPerformed: string | null;
  jobNotes: string | null;
  progressSummary: string | null;
  materials: Array<{ name: string; quantity: number | null; unit: string | null; inventoryId: string | null }>;
  followUps: Array<{ description: string; date: string | null; time: string | null; kind: "appointment" | "task" }>;
  customerRequests: string[];
  changeOrders: Array<{ description: string; amount: number | null; customerApproved: boolean }>;
  partsToOrder: Array<{ name: string; quantity: number | null }>;
  issues: Array<{ description: string; kind: "callback" | "warranty" | "complaint" | "damage" | "safety" | "other" }>;
  jobFinished: boolean;
}

export const PHOTO_CATEGORIES = ["before", "during", "after", "damage", "materials", "receipt", "serial", "completed", "other"] as const;
export type PhotoCategory = typeof PHOTO_CATEGORIES[number];

export const PHOTO_CATEGORY_LABEL: Record<PhotoCategory, string> = {
  before: "Before", during: "During", after: "After", damage: "Damage / problem", materials: "Materials / equipment",
  receipt: "Receipt", serial: "Serial / model #", completed: "Completed work", other: "Other",
};

export interface PhotoExtraction {
  category: PhotoCategory;
  caption: string | null;
  brand: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  equipmentType: string | null;
  receiptVendor: string | null;
  receiptTotal: number | null;
  receiptDate: string | null;
  materials: Array<{ name: string; quantity: number | null; unit: string | null }>;
}

export interface CapturedPhoto {
  id: string;
  dataUrl: string;
  fileName: string;
  takenAt: number;
  status: "analyzing" | "done" | "failed";
  analysis?: PhotoExtraction;
  /** What the user settled on (defaults to the AI's category). */
  category: PhotoCategory;
}

// ------------------------------------------------------------------ proposals

/** What a proposal needs permission for; anything the user can't do goes to a manager instead. */
export type Capability = "job" | "tracking" | "inventory" | "schedule" | "estimates" | "documents" | "expenses" | "notify";

interface Base { id: string; selected: boolean; needs: Capability[] }

export type Proposal = Base & (
  | { kind: "work"; text: string }
  | { kind: "notes"; text: string }
  | { kind: "material"; name: string; quantity: number; unit: string; inventoryId: string | null; unitCost: number; fromReceipt?: boolean }
  | { kind: "followup"; description: string; date: string; time: string; appointment: boolean }
  | { kind: "change_order"; description: string; amount: number; approved: boolean }
  | { kind: "part_order"; name: string; quantity: number | null }
  | { kind: "issue"; description: string; issueKind: VoiceExtraction["issues"][number]["kind"] }
  | { kind: "equipment"; text: string }
  | { kind: "expense"; vendor: string; amount: number; date: string }
  | { kind: "finish" }
);

export type ProposalKind = Proposal["kind"];
type DraftProposal = Proposal extends infer P ? P extends Proposal ? Omit<P, "id" | "needs"> : never : never;

const NEEDS: Record<ProposalKind, Capability[]> = {
  work: ["job"], notes: ["job"], equipment: ["job"], finish: ["job"],
  material: ["inventory"], followup: ["schedule"], change_order: ["estimates"],
  part_order: ["schedule"], issue: ["job"], expense: ["expenses"],
};

// ------------------------------------------------------------------ helpers

const STOP = new Set(["of", "the", "a", "an", "and", "for", "with", "inch", "in", "ft", "feet", "foot", "x", "pcs", "pc", "piece", "pieces"]);
const stem = (w: string) => w.replace(/(es|s)$/i, "");
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9/.\s-]/g, " ").split(/[\s-]+/).filter(t => t && !STOP.has(t)).map(stem);

/**
 * Best inventory item for a spoken/printed material name, or null. Prefers
 * an id the AI already matched (if it really exists), otherwise needs at
 * least half of the spoken words to appear in one item's name and that item
 * to beat the runner-up, so "PEX" finds "1/2in PEX tubing" but "fittings"
 * doesn't silently pick one of six different fittings.
 */
export function matchInventory(name: string, inventory: Pick<InventoryItem, "id" | "name">[], aiId?: string | null): string | null {
  if (aiId && inventory.some(i => i.id === aiId)) return aiId;
  const want = tokens(name);
  if (!want.length) return null;
  const scored = inventory
    .map(item => {
      const have = new Set(tokens(item.name));
      const hits = want.filter(t => have.has(t)).length;
      return { id: item.id, score: hits / want.length, extra: have.size - hits };
    })
    .filter(s => s.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.extra - b.extra);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score && scored[0].extra === scored[1].extra) return null;
  return scored[0].id;
}

const nextId = (() => { let n = 0; return (p: string) => `${p}_${Date.now().toString(36)}_${(n++).toString(36)}`; })();

export function tomorrowISO(today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-10-03 (Saturday)" in the speaker's own timezone. */
export function todayContext(now = new Date()): string {
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `${iso} (${now.toLocaleDateString("en-US", { weekday: "long" })})`;
}

// ------------------------------------------------------------------ build

export function buildProposals(
  voice: VoiceExtraction | null,
  photos: CapturedPhoto[],
  inventory: InventoryItem[],
  now = new Date()
): Proposal[] {
  const out: Proposal[] = [];
  const add = (p: DraftProposal) => out.push({ ...p, id: nextId(p.kind), needs: NEEDS[p.kind] } as Proposal);
  const invById = new Map(inventory.map(i => [i.id, i]));

  if (voice) {
    if (voice.workPerformed) add({ kind: "work", text: voice.workPerformed, selected: true });
    const notes = [voice.jobNotes, ...voice.customerRequests.map(r => `Customer request: ${r}`)].filter(Boolean).join("\n");
    if (notes) add({ kind: "notes", text: notes, selected: true });
    voice.materials.forEach(m => {
      const inventoryId = matchInventory(m.name, inventory, m.inventoryId);
      const item = inventoryId ? invById.get(inventoryId) : undefined;
      add({ kind: "material", name: item?.name || m.name, quantity: m.quantity ?? 1, unit: m.unit || item?.unit || "", inventoryId, unitCost: item?.unitCost || 0, selected: true });
    });
    voice.followUps.forEach(f => add({
      kind: "followup", description: f.description, date: f.date || "", time: f.time || "",
      appointment: f.kind === "appointment", selected: !!f.date,
    }));
    voice.changeOrders.forEach(c => add({ kind: "change_order", description: c.description, amount: c.amount ?? 0, approved: c.customerApproved, selected: true }));
    // A spoken customer request with no change order of its own still deserves one.
    if (!voice.changeOrders.length) {
      voice.customerRequests.filter(r => /\b(add|another|more|extra|also|install|replace|upgrade)\b/i.test(r)).forEach(r =>
        add({ kind: "change_order", description: r, amount: 0, approved: false, selected: false }));
    }
    voice.partsToOrder.forEach(p => add({ kind: "part_order", name: p.name, quantity: p.quantity, selected: true }));
    voice.issues.forEach(i => add({ kind: "issue", description: i.description, issueKind: i.kind, selected: true }));
  }

  photos.filter(p => p.status === "done" && p.analysis).forEach(p => {
    const a = p.analysis!;
    const equipment = [a.equipmentType, a.brand, a.modelNumber && `model ${a.modelNumber}`, a.serialNumber && `serial ${a.serialNumber}`].filter(Boolean).join(", ");
    if ((a.modelNumber || a.serialNumber) && equipment) add({ kind: "equipment", text: `Equipment on site: ${equipment}`, selected: true });
    if (p.category === "receipt" && a.receiptTotal != null && a.receiptTotal > 0) {
      add({ kind: "expense", vendor: a.receiptVendor || "Receipt", amount: a.receiptTotal, date: a.receiptDate || todayContext(now).slice(0, 10), selected: true });
    }
    // Materials read off a receipt or seen in a photo are suggestions only: buying
    // isn't using, so they start unticked.
    a.materials.forEach(m => {
      if (out.some(o => o.kind === "material" && o.name.toLowerCase() === m.name.toLowerCase())) return;
      const inventoryId = matchInventory(m.name, inventory);
      const item = inventoryId ? invById.get(inventoryId) : undefined;
      add({ kind: "material", name: item?.name || m.name, quantity: m.quantity ?? 1, unit: m.unit || item?.unit || "", inventoryId, unitCost: item?.unitCost || 0, fromReceipt: true, selected: false });
    });
  });

  if (voice?.jobFinished) add({ kind: "finish", selected: true });
  return out;
}

export const PROPOSAL_TITLE: Record<ProposalKind, string> = {
  work: "Work performed", notes: "Job notes & customer requests", material: "Material used", followup: "Follow-up",
  change_order: "Change order", part_order: "Part to order", issue: "Possible callback / warranty issue",
  equipment: "Equipment details", expense: "Receipt → job expense", finish: "Job is finished",
};

/** One-line description of what saving a proposal will do, for the Review screen. */
export function describeEffect(p: Proposal, opts: { canDeduct: boolean; hasTracking: boolean }): string {
  switch (p.kind) {
    case "work": return `Adds to the job's activity${opts.hasTracking ? ", Job Tracking" : ""} and Proof Timeline.`;
    case "notes": return "Adds to the job notes.";
    case "equipment": return "Adds to the job notes.";
    case "material":
      if (p.inventoryId && opts.canDeduct) return `Deducts ${p.quantity} from inventory and adds it to the job's materials.`;
      if (p.inventoryId && opts.hasTracking) return "Submitted in Job Tracking for a manager to approve the inventory deduction.";
      if (p.inventoryId) return "Sent to a manager to approve the inventory deduction.";
      return "Not in inventory: added to the job's materials list for costing.";
    case "followup": return p.appointment ? "Creates a follow-up appointment on the schedule." : "Creates a task on the schedule.";
    case "change_order": return p.approved ? "Creates a change order recording the customer's verbal approval; get it signed next." : "Creates a draft change order for this job.";
    case "part_order": return "Creates a reminder task for tomorrow and notifies managers.";
    case "issue": return "Flags the job as a possible callback and notifies managers.";
    case "expense": return "Logs a Materials expense against this job.";
    case "finish": return "Marks the job Completed (after the Owner Protection check).";
  }
}
