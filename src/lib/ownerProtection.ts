/**
 * Owner Protection: reads data Owner'sLOCAL already stores (estimates,
 * documents/photos, signatures, job tracking, time clock, invoices,
 * payments, customer messages) and derives, per job:
 *
 *  - a protection checklist + score (what proof the business has),
 *  - risk & revenue alerts (money that's unbilled, overdue or unapproved),
 *  - a chronological proof timeline.
 *
 * Nothing here writes or stores anything -- it's recomputed from the live,
 * Firestore-synced collections every render, so it is always current and
 * follows the same per-collection security rules as the rest of the app.
 * Change orders are ordinary Estimates linked back to the job via
 * Estimate.changeOrderForJobId, so they reuse estimate pricing, PDFs and
 * e-signatures instead of a parallel system.
 */
import type { DocumentItem, Estimate, SchedulingEvent, TextMessage, TimeClockLog, Transaction } from "../types/domain";
import type { Invoice } from "../types/accounting";
import type { ProjectCompletionPlan } from "../types/completion";
import type { JobCostBreakdown } from "./jobCostingEngine";

// ------------------------------------------------------------------ inputs

/** A team/customer conversation from the Messages page, reduced to what protection needs. */
export interface ProtectionConversation {
  id: string;
  title?: string;
  type?: string;
  jobId?: string;
  messages: Array<{ id: string; sender: string; senderRole?: string; content: string; timestamp?: string }>;
}

export interface ProtectionSources {
  estimates: Estimate[];
  documents: DocumentItem[];
  completionPlans: ProjectCompletionPlan[];
  invoices: Invoice[];
  transactions: Transaction[];
  timeClockLogs: TimeClockLog[];
  textMessages: TextMessage[];
  conversations: ProtectionConversation[];
  /** Linked Work Order ids per job, so a signed work order counts as completion proof. */
  workOrderIdsByJob?: Record<string, string[]>;
  /** Labor/material/other cost for the job, from computeJobCosting. */
  costing?: JobCostBreakdown | null;
  now?: number;
}

// ------------------------------------------------------------------ outputs

export type CheckStatus = "done" | "partial" | "missing" | "pending" | "na";

export type ProtectionActionKind =
  | "create_change_order"
  | "sign_estimate"
  | "sign_change_order"
  | "sign_scope"
  | "sign_completion"
  | "send_invoice"
  | "view_invoice"
  | "add_before_photos"
  | "add_after_photos"
  | "open_tracking"
  | "review_job"
  | "build_package";

export interface ProtectionAction {
  kind: ProtectionActionKind;
  label: string;
  /** Estimate / change order / invoice the action targets, when it has one. */
  targetId?: string;
}

export interface ProtectionCheck {
  id: "scope" | "before_photos" | "approvals" | "change_orders" | "tracking" | "after_photos" | "completion_signature" | "invoice" | "communications";
  label: string;
  status: CheckStatus;
  detail: string;
  weight: number;
  /** Important enough to warn about before the job is marked Completed. */
  critical: boolean;
  action?: ProtectionAction;
}

export interface JobProtection {
  jobId: string;
  checks: ProtectionCheck[];
  /** 0-100 over every applicable check (pending items count as not yet in place). */
  score: number;
  level: "Protected" | "Partially Protected" | "At Risk";
  /** Critical items still missing -- what the completion warning lists. */
  missingCritical: ProtectionCheck[];
  approvedValue: number;
  changeOrders: Estimate[];
  scopeChangeMessages: Array<{ at: number; text: string; source: string }>;
}

export type AlertType =
  | "extra_work_no_change_order"
  | "scope_change_message"
  | "unsigned_change_order"
  | "over_estimate"
  | "labor_overrun"
  | "completed_not_invoiced"
  | "invoice_overdue"
  | "closing_without_proof"
  | "callback_risk"
  | "payment_disputed";

export interface RiskAlert {
  id: string;
  type: AlertType;
  severity: "high" | "medium" | "low";
  jobId?: string;
  invoiceId?: string;
  title: string;
  why: string;
  /** Dollars at risk, when it can be measured. */
  amount?: number;
  action: ProtectionAction;
}

export type TimelineKind =
  | "estimate" | "approval" | "signature" | "change_order" | "job" | "arrival" | "work"
  | "photo" | "document" | "message" | "completion" | "invoice" | "payment";

export interface TimelineEvent {
  id: string;
  at: number;
  kind: TimelineKind;
  title: string;
  detail?: string;
  by?: string;
  /** Documents record behind this event, when there is one (photo, signed PDF). */
  documentId?: string;
}

// ------------------------------------------------------------------ helpers

export const jobDisplayNumber = (job: SchedulingEvent) =>
  job.jobNumber || `JOB-${job.id.replace(/\D/g, "").slice(-6) || job.id.slice(-6).toUpperCase()}`;

const SIGNED_ESTIMATE = new Set(["Signed", "Accepted", "Completed"]);
const SIGNED_DOC = new Set(["Signed", "Completed"]);

/** Lenient timestamp parse for the app's mix of ISO, "YYYY-MM-DD HH:MM:SS" (UTC) and MM/DD/YYYY strings. */
export function toMillis(value: string | undefined | null): number | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const isoLike = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw;
  const ms = Date.parse(isoLike);
  return Number.isFinite(ms) ? ms : null;
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

const digits = (value?: string | null) => String(value || "").replace(/\D/g, "").slice(-10);

export function invoiceTotal(invoice: Invoice): number {
  const subtotal = (invoice.lineItems || []).reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0);
  return subtotal * (1 + (Number(invoice.taxRate) || 0) / 100);
}

export function invoiceBalance(invoice: Invoice): number {
  return Math.max(0, invoiceTotal(invoice) - (Number(invoice.amountPaid) || 0));
}

export function isInvoiceOverdue(invoice: Invoice, now: number): boolean {
  if (invoice.status === "overdue") return true;
  if (!["sent", "partial"].includes(invoice.status)) return false;
  const due = toMillis(invoice.dueDate);
  return due != null && due + 24 * 3600_000 < now && invoiceBalance(invoice) > 0.005;
}

/** Hours from free-text durations like "2 hours", "90 min", "1.5h", "3". */
export function parseDurationHours(value?: string): number | null {
  if (!value) return null;
  const text = value.toLowerCase();
  const n = parseFloat(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/min/.test(text)) return n / 60;
  if (/day/.test(text)) return n * 8;
  return n;
}

/** Customer wording that usually means "do more than we agreed". */
const SCOPE_CHANGE = /\b(also|extra|additional|add(?:ing)?|another|while (?:you(?:'re| are)|ur) (?:here|there|at it)|can you|could you|would you|instead|upgrade|replace|change (?:the|it|to)|move (?:the|it)|one more|more (?:outlets?|rooms?|work)|bigger|expand)\b/i;

export function looksLikeScopeChange(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 8) return false;
  return SCOPE_CHANGE.test(trimmed);
}

const isPhoto = (d: DocumentItem) =>
  /photo|image|picture/i.test(d.type || "") ||
  String(d.url || "").startsWith("data:image") ||
  /\.(jpe?g|png|heic|webp|gif)$/i.test(d.name || "");

const tagText = (d: DocumentItem) => [d.name, d.notes, ...(d.tags || [])].join(" ").toLowerCase();

function docLinkedToJob(d: DocumentItem, job: SchedulingEvent, workOrderIds: string[]): boolean {
  if (d.isArchived) return false;
  const number = jobDisplayNumber(job);
  return d.job === job.id || d.job === number || (!!d.workOrderId && workOrderIds.includes(d.workOrderId));
}

function docTime(d: DocumentItem): number | null {
  const signedAt = (d.auditTrail || []).map(a => toMillis(a.timestamp)).filter((v): v is number => v != null);
  if (signedAt.length) return Math.max(...signedAt);
  return toMillis(d.lastModified) ?? toMillis(d.date);
}

function docSignedAt(d: DocumentItem): number | null {
  if (!SIGNED_DOC.has(String(d.status))) return null;
  return docTime(d);
}

interface JobWindow {
  start: number | null;
  end: number | null;
  completed: boolean;
}

function jobWindow(job: SchedulingEvent, logs: TimeClockLog[], plan?: ProjectCompletionPlan): JobWindow {
  const starts: number[] = [];
  logs.filter(l => l.jobId === job.id && l.type === "Clock In").forEach(l => {
    const t = toMillis(l.timestamp);
    if (t != null) starts.push(t);
  });
  (job.activity || []).forEach(a => {
    if (/arriv|working|en route|started|clock(ed)? in/i.test(a.action)) {
      const t = toMillis(a.timestamp);
      if (t != null) starts.push(t);
    }
  });
  const scheduled = toMillis(job.date ? `${job.date}T${job.startTime || "08:00"}:00` : undefined);
  const start = starts.length ? Math.min(...starts) : scheduled;
  const completed = String(job.status).toLowerCase() === "completed";
  const ends = [toMillis(job.completedAt), toMillis(plan?.finalCloseoutApprovedAt)].filter((v): v is number => v != null);
  const end = ends.length ? Math.max(...ends) : null;
  return { start, end, completed };
}

/** Customer-authored messages tied to this job (texts from the customer's number during the job, or the job's linked conversation). */
function customerMessages(job: SchedulingEvent, sources: ProtectionSources, win: JobWindow, now: number) {
  const out: Array<{ at: number; text: string; source: string; id: string }> = [];
  const phone = digits(job.customerPhone);
  const from = (win.start ?? now) - 3 * 86400_000;
  const to = (win.end ?? now) + 86400_000;
  sources.textMessages.forEach(m => {
    if (m.direction !== "incoming") return;
    const matches = (job.customerId && m.customerId === job.customerId) || (phone.length === 10 && digits(m.phoneNumber) === phone);
    if (!matches) return;
    const at = toMillis(m.timestamp) ?? toMillis(m.createdAt);
    if (at == null || at < from || at > to) return;
    out.push({ at, text: m.body, source: "Text message", id: m.id });
  });
  sources.conversations.filter(c => c.jobId === job.id).forEach(c => {
    c.messages.forEach(msg => {
      if (!/customer/i.test(msg.senderRole || "")) return;
      const fromId = Number((msg.id.match(/\d{12,}/) || [])[0]);
      const at = Number.isFinite(fromId) && fromId > 0 ? fromId : toMillis(msg.timestamp ? `${msg.timestamp.replace(" ", "T")}:00Z` : undefined);
      if (at == null) return;
      out.push({ at, text: msg.content, source: c.title || "Conversation", id: msg.id });
    });
  });
  return out.sort((a, b) => a.at - b.at);
}

// ------------------------------------------------------------------ protection

export function computeJobProtection(job: SchedulingEvent, sources: ProtectionSources): JobProtection {
  const now = sources.now ?? Date.now();
  const plan = sources.completionPlans.find(p => p.jobId === job.id);
  const workOrderIds = sources.workOrderIdsByJob?.[job.id] || [];
  const win = jobWindow(job, sources.timeClockLogs, plan);
  const jobDocs = sources.documents.filter(d => docLinkedToJob(d, job, workOrderIds));
  const estimate = job.sourceEstimateId ? sources.estimates.find(e => e.id === job.sourceEstimateId) : undefined;
  const changeOrders = sources.estimates.filter(e => e.changeOrderForJobId === job.id && e.status !== "Declined");
  const approvedChangeOrders = changeOrders.filter(e => SIGNED_ESTIMATE.has(e.status));
  const approvedValue = (estimate?.amount || Number(job.budget) || 0) + approvedChangeOrders.reduce((s, e) => s + (e.amount || 0), 0);
  const checks: ProtectionCheck[] = [];

  // 1. Signed estimate / scope
  const estimateDocs = estimate ? sources.documents.filter(d => d.estimateId === estimate.id) : [];
  const signedEstimateDoc = estimateDocs.find(d => SIGNED_DOC.has(String(d.status)));
  const signedJobContract = jobDocs.find(d => !isPhoto(d) && docSignedAt(d) != null && (win.start == null || (docSignedAt(d) as number) <= win.start + 3600_000));
  if (estimate && (estimate.status === "Signed" || signedEstimateDoc)) {
    checks.push({ id: "scope", label: "Signed estimate / scope", status: "done", detail: `Estimate ${estimate.number} is signed.`, weight: 20, critical: true });
  } else if (signedJobContract) {
    checks.push({ id: "scope", label: "Signed estimate / scope", status: "done", detail: `Signed before work started: ${signedJobContract.name}.`, weight: 20, critical: true });
  } else if (estimate) {
    checks.push({
      id: "scope", label: "Signed estimate / scope", status: SIGNED_ESTIMATE.has(estimate.status) ? "partial" : "missing",
      detail: SIGNED_ESTIMATE.has(estimate.status)
        ? `Estimate ${estimate.number} is marked ${estimate.status} but there's no customer signature on file.`
        : `Estimate ${estimate.number} is ${estimate.status} and unsigned.`,
      weight: 20, critical: true, action: { kind: "sign_estimate", label: "Get Signature", targetId: estimate.id }
    });
  } else {
    checks.push({ id: "scope", label: "Signed estimate / scope", status: "missing", detail: "No estimate or signed scope of work is linked to this job.", weight: 20, critical: true, action: { kind: "sign_scope", label: "Get Signature" } });
  }

  // Photos, with timestamps from Documents and Job Tracking attachments.
  const photoTimes = new Map<string, { at: number | null; doc: DocumentItem }>();
  jobDocs.filter(isPhoto).forEach(d => photoTimes.set(d.id, { at: docTime(d), doc: d }));
  plan?.goals.forEach(g => g.attachments.forEach(a => {
    const doc = sources.documents.find(d => d.id === a.documentId);
    if (doc && isPhoto(doc)) photoTimes.set(doc.id, { at: toMillis(a.uploadedAt) ?? docTime(doc), doc });
  }));
  // Receipts, data plates and parts shots are reference photos, not before/after proof.
  const photos = [...photoTimes.values()].filter(p => !/receipt|serial|materials/i.test(tagText(p.doc)) && !/receipt/i.test(p.doc.type || ""));
  const tagged = (p: { doc: DocumentItem }, word: string) => tagText(p.doc).includes(word);
  const beforePhotos = photos.filter(p => tagged(p, "before") || (!tagged(p, "after") && p.at != null && win.start != null && p.at <= win.start + 30 * 60_000));
  const afterPhotos = photos.filter(p => tagged(p, "after") || (!tagged(p, "before") && p.at != null && (
    (win.end != null && p.at >= win.end - 2 * 3600_000) ||
    (win.completed && win.end == null && win.start != null && p.at > win.start + 30 * 60_000)
  )));

  // 2. Before photos
  checks.push(beforePhotos.length
    ? { id: "before_photos", label: "Before photos", status: "done", detail: `${beforePhotos.length} photo${beforePhotos.length === 1 ? "" : "s"} from before work began.`, weight: 10, critical: true }
    : { id: "before_photos", label: "Before photos", status: "missing", detail: photos.length ? "Photos are on file, but none are from before work started." : "No photos of the site before work started.", weight: 10, critical: true, action: { kind: "add_before_photos", label: "Add Photos" } });

  // 3. Customer approvals
  const pendingChangeOrders = changeOrders.filter(e => !SIGNED_ESTIMATE.has(e.status));
  const estimateApproved = estimate ? SIGNED_ESTIMATE.has(estimate.status) : !!signedJobContract;
  checks.push(estimateApproved && !pendingChangeOrders.length
    ? { id: "approvals", label: "Customer approvals", status: "done", detail: changeOrders.length ? `Original work and ${changeOrders.length} change order${changeOrders.length === 1 ? "" : "s"} approved.` : "Customer approved the work.", weight: 10, critical: false }
    : {
      id: "approvals", label: "Customer approvals", status: estimateApproved ? "partial" : "missing",
      detail: !estimateApproved ? "No customer approval of the work is on record." : `${pendingChangeOrders.length} change order${pendingChangeOrders.length === 1 ? " is" : "s are"} waiting for customer approval.`,
      weight: 10, critical: false,
      action: estimate && !estimateApproved ? { kind: "sign_estimate", label: "Get Signature", targetId: estimate.id }
        : pendingChangeOrders[0] ? { kind: "sign_change_order", label: "Get Signature", targetId: pendingChangeOrders[0].id } : undefined
    });

  // 4. Signed change orders for added work
  const allMessages = customerMessages(job, sources, win, now);
  // Change orders only carry a date, so a request made any time on (or before) the
  // day the newest change order was written counts as covered by it.
  const newestChangeOrderDay = Math.max(0, ...changeOrders.map(e => toMillis(e.createdDate) ?? 0));
  const coveredUntil = newestChangeOrderDay ? newestChangeOrderDay + 86400_000 : 0;
  const scopeChangeMessages = allMessages.filter(m => looksLikeScopeChange(m.text) && m.at > coveredUntil).map(({ at, text, source }) => ({ at, text, source }));
  const overBy = sources.costing && approvedValue > 0 ? sources.costing.totalCost - approvedValue : 0;
  if (pendingChangeOrders.length) {
    checks.push({ id: "change_orders", label: "Signed change orders", status: "partial", detail: `${pendingChangeOrders.length} change order${pendingChangeOrders.length === 1 ? "" : "s"} not signed yet (${money(pendingChangeOrders.reduce((s, e) => s + e.amount, 0))}).`, weight: 15, critical: true, action: { kind: "sign_change_order", label: "Get Signature", targetId: pendingChangeOrders[0].id } });
  } else if (scopeChangeMessages.length || overBy > 0) {
    checks.push({
      id: "change_orders", label: "Signed change orders", status: "missing",
      detail: scopeChangeMessages.length ? "The customer asked for more work, but there's no change order." : `Costs are ${money(overBy)} over the approved amount with no change order.`,
      weight: 15, critical: true, action: { kind: "create_change_order", label: "Create Change Order" }
    });
  } else if (changeOrders.length) {
    checks.push({ id: "change_orders", label: "Signed change orders", status: "done", detail: `${changeOrders.length} change order${changeOrders.length === 1 ? "" : "s"} signed.`, weight: 15, critical: true });
  } else {
    checks.push({ id: "change_orders", label: "Signed change orders", status: "na", detail: "No added work detected.", weight: 15, critical: true });
  }

  // 5. Job tracking / completion records
  const goals = plan?.goals || [];
  const goalsDone = goals.filter(g => g.completed || g.status === "Completed").length;
  const checklist = job.checklist || [];
  const checklistDone = checklist.filter(c => c.completed).length;
  const hasClock = sources.timeClockLogs.some(l => l.jobId === job.id);
  if (plan?.finalCloseoutApproved || (goals.length && goalsDone === goals.length) || (checklist.length && checklistDone === checklist.length)) {
    checks.push({ id: "tracking", label: "Job tracking & completion records", status: "done", detail: plan?.finalCloseoutApproved ? `Final closeout approved${plan.finalCloseoutApprovedBy ? ` by ${plan.finalCloseoutApprovedBy}` : ""}.` : "All tracked goals are complete.", weight: 10, critical: false });
  } else if (goals.length || checklist.length || hasClock) {
    checks.push({ id: "tracking", label: "Job tracking & completion records", status: "partial", detail: goals.length ? `${goalsDone} of ${goals.length} goals complete.` : checklist.length ? `${checklistDone} of ${checklist.length} checklist items done.` : "Time clock records exist, but no Job Tracking plan.", weight: 10, critical: false, action: { kind: "open_tracking", label: "Review Job" } });
  } else {
    checks.push({ id: "tracking", label: "Job tracking & completion records", status: "missing", detail: "No Job Tracking plan, checklist or clock-ins for this job.", weight: 10, critical: false, action: { kind: "open_tracking", label: "Review Job" } });
  }

  // 6. After photos
  checks.push(afterPhotos.length
    ? { id: "after_photos", label: "After photos", status: "done", detail: `${afterPhotos.length} photo${afterPhotos.length === 1 ? "" : "s"} of the finished work.`, weight: 10, critical: true }
    : { id: "after_photos", label: "After photos", status: win.completed ? "missing" : "pending", detail: win.completed ? "No photos of the finished work." : "Take these when the work is finished.", weight: 10, critical: true, action: { kind: "add_after_photos", label: "Add Photos" } });

  // 7. Completion / customer signature
  const scopeDocIds = new Set([...estimateDocs.map(d => d.id), signedJobContract?.id].filter(Boolean) as string[]);
  const completionSigned = jobDocs.filter(d => !isPhoto(d) && !scopeDocIds.has(d.id) && docSignedAt(d) != null && (win.start == null || (docSignedAt(d) as number) >= win.start));
  checks.push(completionSigned.length
    ? { id: "completion_signature", label: "Completion / customer signature", status: "done", detail: `Customer signed ${completionSigned[completionSigned.length - 1].name}.`, weight: 15, critical: true }
    : { id: "completion_signature", label: "Completion / customer signature", status: win.completed ? "missing" : "pending", detail: win.completed ? "No customer sign-off that the work was completed." : "Get the customer's sign-off when the work is done.", weight: 15, critical: true, action: { kind: "sign_completion", label: "Get Signature" } });

  // 8. Invoice / payment
  const invoice = sources.invoices.find(i => i.jobId === job.id && i.status !== "void");
  if (!invoice) {
    checks.push({ id: "invoice", label: "Invoice & payment", status: win.completed ? "missing" : "pending", detail: win.completed ? "The job is completed but hasn't been invoiced." : "Invoice when the work is complete.", weight: 5, critical: false, action: { kind: "send_invoice", label: "Send Invoice" } });
  } else if (invoice.status === "paid" || invoiceBalance(invoice) <= 0.005) {
    checks.push({ id: "invoice", label: "Invoice & payment", status: "done", detail: `Invoice ${invoice.invoiceNumber} paid in full.`, weight: 5, critical: false });
  } else {
    const overdue = isInvoiceOverdue(invoice, now);
    checks.push({
      id: "invoice", label: "Invoice & payment", status: overdue ? "missing" : "partial",
      detail: `Invoice ${invoice.invoiceNumber} ${overdue ? "is overdue" : invoice.status === "draft" ? "is still a draft" : "is unpaid"}: ${money(invoiceBalance(invoice))} due.`,
      weight: 5, critical: false, action: { kind: "view_invoice", label: invoice.status === "draft" ? "Send Invoice" : "Review Invoice", targetId: invoice.id }
    });
  }

  // 9. Customer messages / documents on file
  const otherDocs = jobDocs.filter(d => !isPhoto(d));
  const commsCount = allMessages.length + otherDocs.length + sources.conversations.filter(c => c.jobId === job.id).length;
  checks.push(commsCount
    ? { id: "communications", label: "Customer messages & documents", status: "done", detail: `${allMessages.length} customer message${allMessages.length === 1 ? "" : "s"}, ${otherDocs.length} document${otherDocs.length === 1 ? "" : "s"} on file.`, weight: 5, critical: false }
    : { id: "communications", label: "Customer messages & documents", status: win.completed ? "missing" : "pending", detail: "No customer messages or job documents linked yet.", weight: 5, critical: false });

  const applicable = checks.filter(c => c.status !== "na");
  const total = applicable.reduce((s, c) => s + c.weight, 0);
  const earned = applicable.reduce((s, c) => s + (c.status === "done" ? c.weight : c.status === "partial" ? c.weight / 2 : 0), 0);
  const score = total ? Math.round((earned / total) * 100) : 100;
  const missingCritical = checks.filter(c => c.critical && (c.status === "missing" || c.status === "partial" || c.status === "pending"));

  return {
    jobId: job.id,
    checks,
    score,
    level: score >= 85 ? "Protected" : score >= 60 ? "Partially Protected" : "At Risk",
    missingCritical,
    approvedValue,
    changeOrders,
    scopeChangeMessages,
  };
}

// ------------------------------------------------------------------ alerts

export function computeJobAlerts(job: SchedulingEvent, protection: JobProtection, sources: ProtectionSources): RiskAlert[] {
  const now = sources.now ?? Date.now();
  const alerts: RiskAlert[] = [];
  const number = jobDisplayNumber(job);
  const status = String(job.status).toLowerCase();
  if (status === "cancelled") return alerts;
  const completed = status === "completed";
  const check = (id: ProtectionCheck["id"]) => protection.checks.find(c => c.id === id)!;
  const costing = sources.costing;

  const pending = protection.changeOrders.filter(e => !SIGNED_ESTIMATE.has(e.status));
  pending.forEach(co => alerts.push({
    id: `${job.id}:unsigned_co:${co.id}`, type: "unsigned_change_order", severity: "high", jobId: job.id,
    title: `Change order ${co.number} isn't signed`,
    why: "Added work without a signature is the most common reason customers refuse to pay the difference.",
    amount: co.amount, action: { kind: "sign_change_order", label: "Get Signature", targetId: co.id }
  }));

  if (protection.scopeChangeMessages.length) {
    const latest = protection.scopeChangeMessages[protection.scopeChangeMessages.length - 1];
    alerts.push({
      id: `${job.id}:scope_msg:${latest.at}`, type: pending.length ? "scope_change_message" : "extra_work_no_change_order", severity: pending.length ? "medium" : "high", jobId: job.id,
      title: pending.length ? `Customer may be asking for more on ${number}` : `Customer asked for extra work on ${number}, with no change order`,
      why: `"${latest.text.slice(0, 140)}${latest.text.length > 140 ? "…" : ""}" (${latest.source}). Get the added scope priced and signed before doing it.`,
      action: { kind: "create_change_order", label: "Create Change Order" }
    });
  }

  if (costing && protection.approvedValue > 0 && costing.totalCost > protection.approvedValue) {
    alerts.push({
      id: `${job.id}:over_estimate`, type: "over_estimate", severity: "high", jobId: job.id,
      title: `${number} costs exceed the approved amount`,
      why: `Labor, materials and other costs are ${money(costing.totalCost)} against ${money(protection.approvedValue)} approved. Without a change order the overage comes out of profit.`,
      amount: costing.totalCost - protection.approvedValue, action: { kind: "create_change_order", label: "Create Change Order" }
    });
  }

  const estHours = parseDurationHours(job.estimatedDuration);
  if (costing && estHours && costing.laborHours > estHours * 1.25 && costing.laborHours - estHours >= 1) {
    const rate = costing.laborHours ? costing.laborCost / costing.laborHours : 0;
    alerts.push({
      id: `${job.id}:labor_overrun`, type: "labor_overrun", severity: "medium", jobId: job.id,
      title: `${number} is running over on labor`,
      why: `${costing.laborHours.toFixed(1)} hours logged against ${estHours.toFixed(1)} estimated (${Math.round((costing.laborHours / estHours - 1) * 100)}% over).`,
      amount: rate ? (costing.laborHours - estHours) * rate : undefined, action: { kind: "review_job", label: "Review Job" }
    });
  }

  if ((job.tags || []).includes("Callback Risk")) {
    const flagged = [...(job.activity || [])].reverse().find(a => /^Possible .* flagged$/i.test(a.action));
    alerts.push({
      id: `${job.id}:callback_risk`, type: "callback_risk", severity: "medium", jobId: job.id,
      title: `Possible callback or warranty issue on ${number}`,
      why: `${flagged?.detail ? `"${flagged.detail}"` : "A complaint or problem was reported"}${flagged?.by ? ` (${flagged.by})` : ""}. Callbacks are unpaid work. Document it and follow up before it becomes a dispute.`,
      action: { kind: "review_job", label: "Review Job" }
    });
  }

  const invoice = sources.invoices.find(i => i.jobId === job.id && i.status !== "void");
  if (completed && !invoice) {
    alerts.push({
      id: `${job.id}:not_invoiced`, type: "completed_not_invoiced", severity: "high", jobId: job.id,
      title: `${number} is completed but not invoiced`,
      why: "Finished work that isn't billed is money you've earned but won't collect.",
      amount: protection.approvedValue || undefined, action: { kind: "send_invoice", label: "Send Invoice" }
    });
  }

  if (completed || check("after_photos").status === "missing") {
    const gaps = ["before_photos", "after_photos", "completion_signature"].map(id => check(id as ProtectionCheck["id"])).filter(c => c.status === "missing");
    if (completed && gaps.length) {
      const first = gaps[0];
      alerts.push({
        id: `${job.id}:closing_without_proof`, type: "closing_without_proof", severity: "medium", jobId: job.id,
        title: `${number} closed without ${gaps.map(g => g.label.toLowerCase()).join(", ")}`,
        why: "If the customer disputes the work, photos and a completion signature are your proof.",
        amount: protection.approvedValue || undefined,
        action: first.action || { kind: "review_job", label: "Review Job" }
      });
    }
  }
  return alerts;
}

/** Overdue and disputed invoices, including ones not tied to a job. */
export function computeInvoiceAlerts(invoices: Invoice[], jobs: SchedulingEvent[], now = Date.now()): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  invoices.forEach(inv => {
    if (inv.status === "void") return;
    const job = inv.jobId ? jobs.find(j => j.id === inv.jobId) : undefined;
    const label = job ? ` (${jobDisplayNumber(job)})` : "";
    if (inv.disputeStatus) {
      alerts.push({
        id: `inv:${inv.id}:dispute`, type: "payment_disputed", severity: "high", jobId: job?.id, invoiceId: inv.id,
        title: `Payment disputed on invoice ${inv.invoiceNumber}${label}`,
        why: `The customer opened a ${inv.disputeStatus.replace(/_/g, " ")} dispute. Respond with your job proof before the deadline.`,
        amount: inv.disputedAmount, action: job ? { kind: "build_package", label: "Build Evidence Package" } : { kind: "view_invoice", label: "Review Invoice", targetId: inv.id }
      });
    }
    if (isInvoiceOverdue(inv, now)) {
      const due = toMillis(inv.dueDate);
      const days = due ? Math.floor((now - due) / 86400_000) : 0;
      alerts.push({
        id: `inv:${inv.id}:overdue`, type: "invoice_overdue", severity: days > 30 ? "high" : "medium", jobId: job?.id, invoiceId: inv.id,
        title: `Invoice ${inv.invoiceNumber} is ${days > 0 ? `${days} day${days === 1 ? "" : "s"} ` : ""}overdue${label}`,
        why: `${inv.customer} still owes ${money(invoiceBalance(inv))}. The longer an invoice goes unpaid, the less likely it gets collected.`,
        amount: invoiceBalance(inv), action: { kind: "view_invoice", label: "Send Reminder", targetId: inv.id }
      });
    }
  });
  return alerts;
}

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export function sortAlerts(alerts: RiskAlert[]): RiskAlert[] {
  return [...alerts].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (b.amount || 0) - (a.amount || 0));
}

// ------------------------------------------------------------------ timeline

export function buildProofTimeline(job: SchedulingEvent, sources: ProtectionSources): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const add = (e: Omit<TimelineEvent, "at"> & { at: number | null }) => { if (e.at != null) events.push(e as TimelineEvent); };
  const plan = sources.completionPlans.find(p => p.jobId === job.id);
  const workOrderIds = sources.workOrderIdsByJob?.[job.id] || [];
  const estimate = job.sourceEstimateId ? sources.estimates.find(e => e.id === job.sourceEstimateId) : undefined;
  const changeOrders = sources.estimates.filter(e => e.changeOrderForJobId === job.id);

  [estimate, ...changeOrders].filter((e): e is Estimate => !!e).forEach(est => {
    const isCO = est.changeOrderForJobId === job.id;
    add({ id: `est:${est.id}`, at: toMillis(est.createdDate), kind: isCO ? "change_order" : "estimate", title: `${isCO ? "Change order" : "Estimate"} ${est.number} created`, detail: `${money(est.amount)}${est.salesRep ? ` · ${est.salesRep}` : ""}` });
    sources.documents.filter(d => d.estimateId === est.id).forEach(d => {
      (d.auditTrail || []).forEach(a => add({ id: `audit:${d.id}:${a.id}`, at: toMillis(a.timestamp), kind: "signature", title: `${isCO ? "Change order" : "Estimate"} ${est.number} ${/sign/i.test(a.action) ? "signed" : a.action.toLowerCase()} by ${a.signerName}`, detail: [a.role, a.device, a.ipAddress ? `IP ${a.ipAddress}` : ""].filter(Boolean).join(" · "), documentId: d.id }));
    });
  });

  add({ id: `job:${job.id}:created`, at: toMillis(job.createdAt), kind: "job", title: `Job ${jobDisplayNumber(job)} created`, detail: job.title || job.description });
  (job.activity || []).forEach(a => add({
    id: `act:${a.id}`, at: toMillis(a.timestamp),
    kind: /complete/i.test(a.action) ? "completion" : /arriv|en route/i.test(a.action) ? "arrival" : "work",
    title: a.action, detail: a.detail, by: a.by
  }));

  sources.timeClockLogs.filter(l => l.jobId === job.id).forEach(l => add({
    id: `clock:${l.id}`, at: toMillis(l.timestamp), kind: l.type === "Clock In" ? "arrival" : "work",
    title: `${l.employeeName} ${l.type === "Clock In" ? "clocked in on site" : l.type.toLowerCase()}`,
    detail: [l.gps && l.gps !== "Unknown" ? `GPS ${l.gps}` : "", l.vehicle ? `Vehicle ${l.vehicle}` : ""].filter(Boolean).join(" · ") || undefined,
    by: l.employeeName
  }));

  plan?.goals.forEach(g => {
    if (g.completed || g.status === "Completed") add({ id: `goal:${g.id}`, at: toMillis(g.employeeResponseSubmittedAt) ?? toMillis(g.actualCompletionDate) ?? toMillis(g.lastUpdatedAt), kind: "work", title: `Goal completed: ${g.title}`, detail: g.projectNotes || undefined, by: g.employeeResponseSubmittedBy || g.lastEmployeeName });
    if (g.managerReviewed) add({ id: `goalrev:${g.id}`, at: toMillis(g.managerReviewedAt), kind: "approval", title: `Manager approved goal: ${g.title}`, by: g.managerReviewedBy });
  });
  if (plan?.finalCloseoutApproved) add({ id: `closeout:${plan.id}`, at: toMillis(plan.finalCloseoutApprovedAt), kind: "completion", title: "Final closeout approved", by: plan.finalCloseoutApprovedBy });

  sources.documents.filter(d => docLinkedToJob(d, job, workOrderIds)).forEach(d => {
    if (isPhoto(d)) {
      const t = tagText(d);
      add({ id: `photo:${d.id}`, at: docTime(d), kind: "photo", title: `${t.includes("before") ? "Before photo" : t.includes("after") ? "After photo" : "Photo"} added: ${d.name}`, by: d.uploadedBy, documentId: d.id });
    } else {
      add({ id: `doc:${d.id}`, at: toMillis(d.lastModified) ?? toMillis(d.date), kind: "document", title: `Document: ${d.name}`, detail: d.status, by: d.uploadedBy, documentId: d.id });
      (d.auditTrail || []).forEach(a => add({ id: `audit:${d.id}:${a.id}`, at: toMillis(a.timestamp), kind: "signature", title: `${d.name} signed by ${a.signerName}`, detail: [a.role, a.device, a.ipAddress ? `IP ${a.ipAddress}` : ""].filter(Boolean).join(" · "), documentId: d.id }));
    }
  });

  const win = jobWindow(job, sources.timeClockLogs, plan);
  customerMessages(job, sources, win, sources.now ?? Date.now()).forEach(m => add({ id: `msg:${m.id}`, at: m.at, kind: "message", title: `Customer message (${m.source})`, detail: m.text }));
  sources.textMessages.filter(m => m.direction === "outgoing" && ((job.customerId && m.customerId === job.customerId) || digits(m.phoneNumber) === digits(job.customerPhone))).forEach(m => {
    const at = toMillis(m.timestamp);
    if (at == null || win.start == null || at < win.start - 3 * 86400_000 || at > (win.end ?? Date.now()) + 86400_000) return;
    add({ id: `msg:${m.id}`, at, kind: "message", title: "Message to customer", detail: m.body });
  });

  add({ id: `job:${job.id}:completed`, at: toMillis(job.completedAt), kind: "completion", title: "Job marked completed" });

  sources.invoices.filter(i => i.jobId === job.id).forEach(inv => {
    add({ id: `inv:${inv.id}`, at: toMillis(inv.createdAt) ?? toMillis(inv.issuedDate), kind: "invoice", title: `Invoice ${inv.invoiceNumber} created (${inv.status})`, detail: `${money(invoiceTotal(inv))} · due ${inv.dueDate}`, by: inv.createdBy });
    sources.transactions.filter(t => t.invoiceId === inv.id && t.type === "income").forEach(t => add({ id: `pay:${t.id}`, at: toMillis(t.createdAt) ?? toMillis(t.date), kind: "payment", title: `Payment received: ${money(t.amount)}`, detail: t.description, by: t.createdBy }));
  });

  // De-dupe (a signature can be reachable through two paths) and order.
  const unique = new Map<string, TimelineEvent>();
  events.forEach(e => unique.set(e.id, e));
  return [...unique.values()].sort((a, b) => a.at - b.at);
}
