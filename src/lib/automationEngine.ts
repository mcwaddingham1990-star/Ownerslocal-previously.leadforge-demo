/**
 * WHEN -> IF -> DO Automation Engine core. Framework-agnostic (no React, no
 * Firestore import) so every rule here -- which business event a collection
 * change is, whether the IF conditions pass, the deterministic run id that
 * makes replays a no-op, and the run-status rollup -- is unit-testable and
 * shared by the live engine (src/hooks/useAutomationEngine.ts) and the
 * Automations page.
 *
 * Safety model (see executeAutomation below):
 *   1. Automations are OFF unless an owner explicitly enables them.
 *   2. Each (automation, event) pair claims one deterministic run document
 *      before any action runs; a replayed or echoed event finds the claim
 *      and stops. Each action is ALSO idempotent on its own (e.g. Create Job
 *      goes through the canonical createJob, which refuses a second job for
 *      the same estimate).
 *   3. Every action runs in its own try/catch, after the triggering manual
 *      action has already finished -- a failing automation is logged, never
 *      thrown back into (or rolled back through) the manual workflow.
 *   4. Only actions on the allowlist below can run; nothing destructive,
 *      nothing that moves money, nothing that changes approved pricing.
 */
import type { CollectionEvent } from "./eventBus";
import type {
  Automation,
  AutomationAction,
  AutomationActionResult,
  AutomationActionType,
  AutomationCondition,
  AutomationConditionField,
  AutomationConditionOperator,
  AutomationRun,
  AutomationRunStatus,
  AutomationTrigger
} from "../types/automation";

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export type AutomationSourceCollection = "leads" | "estimates" | "scheduling_events" | "invoices";

export interface TriggerDefinition {
  id: AutomationTrigger;
  label: string;
  description: string;
  collection: AutomationSourceCollection;
  /** The record this trigger is about was just created (used by the loop guard). */
  creation: boolean;
}

export const AUTOMATION_TRIGGERS: TriggerDefinition[] = [
  { id: "lead.created", label: "Lead Created", description: "Any new lead, from any source.", collection: "leads", creation: true },
  { id: "booking.website.created", label: "Website Booking", description: "A job booked through Online Booking on your website, or a request sent from your website lead form.", collection: "leads", creation: true },
  { id: "booking.portal.created", label: "Customer Portal Booking", description: "A job a customer booked (or a service request they sent) from their Customer Portal.", collection: "leads", creation: true },
  { id: "estimate.created", label: "Estimate Created", description: "A new estimate is saved.", collection: "estimates", creation: true },
  { id: "estimate.accepted", label: "Estimate Accepted", description: "An estimate's status becomes Accepted (by you or by the customer in the portal).", collection: "estimates", creation: false },
  { id: "job.created", label: "Job Created", description: "A new job is created.", collection: "scheduling_events", creation: true },
  { id: "job.completed", label: "Job Completed", description: "A job's status becomes Completed.", collection: "scheduling_events", creation: false },
  { id: "appointment.created", label: "Appointment Created", description: "A customer appointment (site visit, consultation, inspection, estimate visit...) is scheduled.", collection: "scheduling_events", creation: true },
  { id: "invoice.created", label: "Invoice Created", description: "A new invoice is created.", collection: "invoices", creation: true },
  { id: "invoice.paid", label: "Invoice Paid", description: "An invoice is paid in full.", collection: "invoices", creation: false },
  { id: "invoice.overdue", label: "Invoice Overdue", description: "An unpaid invoice passes its due date. Checked while Owner'sLOCAL is open; only invoices due on/after the day the automation was turned on.", collection: "invoices", creation: false }
];

export const TRIGGER_BY_ID = new Map(AUTOMATION_TRIGGERS.map(t => [t.id, t]));

export interface ConditionFieldDefinition {
  id: AutomationConditionField;
  label: string;
  kind: "number" | "text";
  operators: AutomationConditionOperator[];
  suggestions?: string[];
  hint?: string;
}

const NUMBER_OPERATORS: AutomationConditionOperator[] = ["greater_than", "at_least", "less_than", "at_most", "equals", "not_equals"];
const TEXT_OPERATORS: AutomationConditionOperator[] = ["equals", "not_equals", "contains"];

export const CONDITION_FIELDS: ConditionFieldDefinition[] = [
  { id: "amount", label: "Amount ($)", kind: "number", operators: NUMBER_OPERATORS, hint: "Estimate amount, job estimated value, invoice total, or lead estimated value." },
  { id: "priority", label: "Priority", kind: "text", operators: TEXT_OPERATORS, suggestions: ["Emergency", "Urgent", "High", "Medium", "Low"], hint: "Emergency matches Urgent jobs, and website/portal requests that mention emergency, urgent, or ASAP." },
  { id: "source", label: "Source", kind: "text", operators: TEXT_OPERATORS, suggestions: ["Website", "Customer Portal", "Google Business Profile", "Facebook", "Instagram", "Referral", "Phone Call", "Walk-In", "Manual Entry", "Other"] },
  { id: "daysOverdue", label: "Days overdue", kind: "number", operators: NUMBER_OPERATORS, hint: "Invoices only. Days past the due date with a balance still owed." },
  { id: "serviceType", label: "Service type", kind: "text", operators: TEXT_OPERATORS, suggestions: ["HVAC", "Plumbing", "Electrical", "Roofing", "Service", "Installation", "Repair", "Maintenance"], hint: "Job type, or the description/line items when a record has no job type." },
  { id: "status", label: "Status", kind: "text", operators: TEXT_OPERATORS }
];

export const CONDITION_FIELD_BY_ID = new Map(CONDITION_FIELDS.map(f => [f.id, f]));

export const OPERATOR_LABELS: Record<AutomationConditionOperator, string> = {
  equals: "is",
  not_equals: "is not",
  greater_than: ">",
  at_least: "≥",
  less_than: "<",
  at_most: "≤",
  contains: "contains"
};

export interface ActionDefinition {
  id: AutomationActionType;
  label: string;
  description: string;
  /** Triggers this action can meaningfully run on. */
  triggers: AutomationTrigger[];
}

const LEAD_TRIGGERS: AutomationTrigger[] = ["lead.created", "booking.website.created", "booking.portal.created"];
/** Booking triggers fire for both a booked Job (Online Booking) and a request Lead (website form / portal service request). */
export const BOOKING_TRIGGERS: AutomationTrigger[] = ["booking.website.created", "booking.portal.created"];
const ESTIMATE_TRIGGERS: AutomationTrigger[] = ["estimate.created", "estimate.accepted"];
const JOB_TRIGGERS: AutomationTrigger[] = ["job.created", "job.completed"];
const INVOICE_TRIGGERS: AutomationTrigger[] = ["invoice.created", "invoice.paid", "invoice.overdue"];
const ALL_TRIGGERS: AutomationTrigger[] = AUTOMATION_TRIGGERS.map(t => t.id);

/**
 * The complete allowlist. Anything not listed here can never run, and
 * firestore.rules rejects an automation document naming anything else.
 * Deliberately absent: refunds/payments/any money movement, deleting
 * records, editing prices or approved amounts, cancelling/completing jobs,
 * marking leads lost, scripting/code.
 */
export const AUTOMATION_ACTIONS: ActionDefinition[] = [
  { id: "create_job", label: "Create Job", description: "Runs the same Estimate/Lead → Job conversion as the Convert to Job button. Never creates a second job for the same estimate or lead.", triggers: [...LEAD_TRIGGERS, "estimate.accepted"] },
  { id: "create_appointment", label: "Create Appointment", description: "Puts an unassigned appointment on the Scheduling calendar.", triggers: [...LEAD_TRIGGERS, ...ESTIMATE_TRIGGERS, "job.created"] },
  { id: "create_invoice", label: "Create Invoice", description: "Creates the job's invoice the same way the Job → Invoice handoff does. Never a second open invoice for the same job.", triggers: ["job.completed"] },
  { id: "send_customer_confirmation", label: "Send Customer Confirmation", description: "Posts a confirmation in the customer's Messages / Customer Portal conversation.", triggers: [...ESTIMATE_TRIGGERS, ...JOB_TRIGGERS, "appointment.created", "invoice.created", "invoice.paid", ...BOOKING_TRIGGERS] },
  { id: "send_customer_message", label: "Send Message/Text", description: "Posts your message in the customer's Messages / Customer Portal conversation.", triggers: [...ESTIMATE_TRIGGERS, ...JOB_TRIGGERS, "appointment.created", ...INVOICE_TRIGGERS, ...BOOKING_TRIGGERS] },
  { id: "notify_team", label: "Notify Owner/Manager", description: "Sends an Alert Center notification (and push, when set up) to the owner and/or managers.", triggers: ALL_TRIGGERS },
  { id: "create_follow_up_task", label: "Create Follow-Up Task", description: "Adds a Follow-Up entry to the Scheduling calendar.", triggers: ALL_TRIGGERS },
  { id: "request_review", label: "Request Review", description: "Creates the customer's review request (Settings > Automate Reviews message and link). Never duplicates one.", triggers: ["job.completed", "invoice.paid"] },
  { id: "mark_priority", label: "Mark Priority", description: "Sets the job, appointment, or lead priority.", triggers: [...LEAD_TRIGGERS, ...JOB_TRIGGERS, "appointment.created"] },
  { id: "update_status", label: "Update Status", description: "Moves a job/appointment or lead to a safe status (never Completed, Cancelled, Lost, or Archived).", triggers: [...LEAD_TRIGGERS, "job.created", "appointment.created"] },
  { id: "add_timeline_entry", label: "Add Timeline Entry", description: "Adds an entry to the job's activity timeline (or the business activity log when there's no job).", triggers: ALL_TRIGGERS }
];

export const ACTION_BY_ID = new Map(AUTOMATION_ACTIONS.map(a => [a.id, a]));

/**
 * Permission modules (any one, "edit" level) a non-owner session needs to
 * run this action for this trigger -- mirrors which collections the action
 * writes and what firestore.rules require for them. [] = any business member.
 */
export function requiredActionModules(type: AutomationActionType, trigger: AutomationTrigger): string[] {
  const scheduling = ["jobs", "scheduling", "dispatch"];
  switch (type) {
    case "create_job":
    case "create_appointment":
    case "create_follow_up_task":
      return scheduling;
    case "mark_priority":
    case "update_status":
      if (BOOKING_TRIGGERS.includes(trigger)) return ["leads", ...scheduling];
      return TRIGGER_BY_ID.get(trigger)?.collection === "leads" ? ["leads"] : scheduling;
    case "create_invoice":
      return ["invoices", "accounting"];
    case "send_customer_confirmation":
    case "send_customer_message":
      return ["messages"];
    case "request_review":
      return ["marketing"];
    case "notify_team":
    case "add_timeline_entry":
      return [];
  }
}
export const ALLOWED_ACTION_TYPES: AutomationActionType[] = AUTOMATION_ACTIONS.map(a => a.id);

export const SAFE_JOB_STATUSES = ["Scheduled", "Assigned", "On Hold"] as const;
export const SAFE_LEAD_STATUSES = ["Contacted", "Qualified", "Follow-Up Needed"] as const;
/** Statuses Update Status may set for this trigger. Booking triggers can be a booked Job or a request Lead, so both safe sets apply (each record only accepts its own). */
export function safeStatusesForTrigger(trigger: AutomationTrigger): readonly string[] {
  if (BOOKING_TRIGGERS.includes(trigger)) return [...SAFE_LEAD_STATUSES, ...SAFE_JOB_STATUSES];
  return TRIGGER_BY_ID.get(trigger)?.collection === "leads" ? SAFE_LEAD_STATUSES : SAFE_JOB_STATUSES;
}
export const PRIORITY_VALUES = ["Low", "Medium", "High", "Urgent"] as const;
export const APPOINTMENT_TYPES = ["Site Visit", "Consultation", "Estimate", "Inspection"] as const;

export const MAX_CONDITIONS = 10;
export const MAX_ACTIONS = 10;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface AutomationEvent {
  trigger: AutomationTrigger;
  collection: AutomationSourceCollection;
  record: any;
  previous?: any;
  /** Stable identity of this business event. Same event => same key, which is what the run claim de-duplicates on. */
  eventKey: string;
  occurredAt: string;
}

/** Calendar entry types that are internal (not a customer appointment), or that automations themselves create -- never "appointment.created". */
const NON_APPOINTMENT_EVENT_TYPES = new Set([
  "job", "work order", "pto", "vacation", "sick day", "vehicle maintenance", "equipment maintenance",
  "inventory delivery", "reminder", "task", "follow-up", "training", "meeting"
]);

export function isAppointmentRecord(item: any): boolean {
  const type = String(item?.eventType || "").trim().toLowerCase();
  return !!type && !NON_APPOINTMENT_EVENT_TYPES.has(type);
}

function makeEvent(trigger: AutomationTrigger, collection: AutomationSourceCollection, record: any, previous: any, keySuffix = ""): AutomationEvent {
  return {
    trigger,
    collection,
    record,
    previous,
    eventKey: `${trigger}:${record.id}${keySuffix}`,
    occurredAt: new Date().toISOString()
  };
}

/**
 * Maps one raw collection change (from the Event Engine bus) to the
 * business events automations listen for. Pure -- returns [] for anything
 * that isn't one of the supported WHEN events.
 */
export function deriveAutomationEvents(evt: CollectionEvent): AutomationEvent[] {
  const { collection, type, item, previous } = evt;
  if (!item || typeof item !== "object" || !item.id) return [];
  const events: AutomationEvent[] = [];

  if (collection === "leads" && type === "created") {
    events.push(makeEvent("lead.created", "leads", item, undefined));
    if (item.source === "Website") events.push(makeEvent("booking.website.created", "leads", item, undefined));
    if (item.source === "Customer Portal") events.push(makeEvent("booking.portal.created", "leads", item, undefined));
  }

  if (collection === "estimates") {
    if (type === "created") events.push(makeEvent("estimate.created", "estimates", item, undefined));
    if (type === "updated" && previous?.status !== "Accepted" && item.status === "Accepted") {
      events.push(makeEvent("estimate.accepted", "estimates", item, previous));
    }
  }

  if (collection === "scheduling_events") {
    const isJob = item.eventType === "Job";
    if (type === "created" && isJob) events.push(makeEvent("job.created", "scheduling_events", item, undefined));
    if (type === "created" && isAppointmentRecord(item)) events.push(makeEvent("appointment.created", "scheduling_events", item, undefined));
    // Online Booking (server/onlineBooking.ts) writes the booked Job directly.
    if (type === "created" && item.bookingSource === "Website Booking") events.push(makeEvent("booking.website.created", "scheduling_events", item, undefined));
    if (type === "created" && item.bookingSource === "Customer Portal") events.push(makeEvent("booking.portal.created", "scheduling_events", item, undefined));
    if (type === "updated" && isJob && previous?.status !== "Completed" && item.status === "Completed") {
      events.push(makeEvent("job.completed", "scheduling_events", item, previous));
    }
  }

  if (collection === "invoices") {
    if (type === "created") events.push(makeEvent("invoice.created", "invoices", item, undefined));
    if (type === "updated" && previous?.status !== "paid" && item.status === "paid") {
      events.push(makeEvent("invoice.paid", "invoices", item, previous));
    }
  }

  return events;
}

export function invoiceTotalAmount(invoice: any): number {
  const lines = Array.isArray(invoice?.lineItems) ? invoice.lineItems : [];
  const subtotal = lines.reduce((sum: number, li: any) => sum + (Number(li?.quantity) || 0) * (Number(li?.unitPrice) || 0), 0);
  return subtotal * (1 + (Number(invoice?.taxRate) || 0) / 100);
}

export function invoiceBalance(invoice: any): number {
  return Math.max(0, invoiceTotalAmount(invoice) - (Number(invoice?.amountPaid) || 0));
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(value: string | Date): number {
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function daysOverdue(invoice: any, now: Date = new Date()): number {
  if (!invoice?.dueDate || ["paid", "void", "draft"].includes(invoice.status)) return 0;
  if (invoiceBalance(invoice) <= 0.005) return 0;
  const due = startOfUtcDay(String(invoice.dueDate));
  if (Number.isNaN(due)) return 0;
  return Math.max(0, Math.floor((startOfUtcDay(now) - due) / DAY_MS));
}

/**
 * invoice.overdue is a state, not a write, so it's found by scanning. Only
 * invoices due on/after the day the automation was enabled qualify -- turning
 * on "Invoice Overdue -> Customer Reminder" must never message every
 * customer with an old unpaid invoice at once. Keyed by invoice + due date,
 * so it fires once per overdue cycle.
 */
export function findOverdueInvoiceEvents(invoices: any[], enabledAt: string | undefined, now: Date = new Date()): AutomationEvent[] {
  if (!enabledAt) return [];
  const enabledDay = startOfUtcDay(enabledAt);
  if (Number.isNaN(enabledDay)) return [];
  return invoices
    .filter(inv => inv?.id && daysOverdue(inv, now) > 0 && startOfUtcDay(String(inv.dueDate)) >= enabledDay)
    .map(inv => makeEvent("invoice.overdue", "invoices", inv, undefined, `:${inv.dueDate}`));
}

// ---------------------------------------------------------------------------
// IF conditions
// ---------------------------------------------------------------------------

export interface AutomationFacts {
  amount?: number;
  priority?: string;
  source?: string;
  daysOverdue?: number;
  serviceType?: string;
  status?: string;
}

const EMERGENCY_WORDS = /\b(emergency|urgent|asap)\b/i;

export function buildAutomationFacts(event: AutomationEvent, now: Date = new Date()): AutomationFacts {
  const r = event.record || {};
  switch (event.collection) {
    case "leads":
      return {
        amount: Number(r.estimatedValue) || 0,
        priority: r.priority || (EMERGENCY_WORDS.test(`${r.notes || ""} ${r.name || ""}`) ? "Emergency" : "Normal"),
        source: r.source,
        serviceType: r.serviceType || r.notes || "",
        status: r.status
      };
    case "estimates":
      return {
        amount: Number(r.amount) || 0,
        source: r.source,
        serviceType: [r.projectSpecifics, ...(Array.isArray(r.lineItems) ? r.lineItems.map((li: any) => li?.description) : []), r.notes].filter(Boolean).join(" "),
        status: r.status
      };
    case "scheduling_events":
      return {
        amount: r.budget != null ? Number(r.budget) || 0 : undefined,
        // An online booking always lands as Medium; treat one whose customer
        // notes say emergency/urgent/ASAP as Emergency, same as a request lead.
        priority: r.bookingSource && r.priority !== "Urgent" && EMERGENCY_WORDS.test(`${r.description || ""} ${r.notes || ""}`) ? "Emergency" : r.priority,
        source: r.source,
        serviceType: r.jobType || r.customType || r.title || r.eventType || "",
        status: r.status
      };
    case "invoices":
      return {
        amount: invoiceTotalAmount(r),
        source: r.source,
        daysOverdue: daysOverdue(r, now),
        serviceType: (Array.isArray(r.lineItems) ? r.lineItems.map((li: any) => li?.description) : []).filter(Boolean).join(" "),
        status: r.status
      };
  }
}

function parseNumber(value: string): number {
  return Number(String(value).replace(/[$,\s]/g, ""));
}

function normalizeText(field: AutomationConditionField, value: string): string {
  const text = String(value ?? "").trim().toLowerCase();
  // An "Emergency" rule should match the app's own top priority level.
  if (field === "priority" && text === "urgent") return "emergency";
  return text;
}

export interface ConditionResult {
  passed: boolean;
  description: string;
}

export function describeCondition(condition: AutomationCondition): string {
  const field = CONDITION_FIELD_BY_ID.get(condition.field);
  return `${field?.label || condition.field} ${OPERATOR_LABELS[condition.operator] || condition.operator} ${condition.value}`;
}

export function evaluateCondition(condition: AutomationCondition, facts: AutomationFacts): ConditionResult {
  const field = CONDITION_FIELD_BY_ID.get(condition.field);
  const label = describeCondition(condition);
  const actual = facts[condition.field];
  if (!field) return { passed: false, description: `${label}: unknown field` };
  if (actual === undefined || actual === null || actual === "") {
    return { passed: false, description: `${label}: not available on this record` };
  }

  let passed = false;
  if (field.kind === "number") {
    const a = Number(actual);
    const b = parseNumber(condition.value);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { passed: false, description: `${label}: not a number` };
    switch (condition.operator) {
      case "greater_than": passed = a > b; break;
      case "at_least": passed = a >= b; break;
      case "less_than": passed = a < b; break;
      case "at_most": passed = a <= b; break;
      case "equals": passed = Math.abs(a - b) < 0.005; break;
      case "not_equals": passed = Math.abs(a - b) >= 0.005; break;
      default: passed = false;
    }
  } else {
    const a = normalizeText(condition.field, String(actual));
    const b = normalizeText(condition.field, condition.value);
    switch (condition.operator) {
      case "equals": passed = a === b; break;
      case "not_equals": passed = a !== b; break;
      case "contains": passed = !!b && a.includes(b); break;
      default: passed = false;
    }
  }
  return { passed, description: `${label} (was ${typeof actual === "number" ? Math.round(actual * 100) / 100 : actual}): ${passed ? "passed" : "not met"}` };
}

/** Simple AND: every condition must pass. No conditions = always runs. */
export function evaluateConditions(conditions: AutomationCondition[], facts: AutomationFacts): { passed: boolean; results: string[] } {
  const results = (conditions || []).map(c => evaluateCondition(c, facts));
  return { passed: results.every(r => r.passed), results: results.map(r => r.description) };
}

// ---------------------------------------------------------------------------
// Validation (client-side mirror of the firestore.rules allowlist)
// ---------------------------------------------------------------------------

export function validateAutomation(a: Pick<Automation, "name" | "trigger" | "conditions" | "actions">): string[] {
  const errors: string[] = [];
  if (!a.name || !a.name.trim()) errors.push("Give the automation a name.");
  if (a.name && a.name.length > 120) errors.push("Name must be 120 characters or fewer.");
  if (!TRIGGER_BY_ID.has(a.trigger)) errors.push("Choose a WHEN event.");
  const conditions = a.conditions || [];
  if (conditions.length > MAX_CONDITIONS) errors.push(`Use at most ${MAX_CONDITIONS} conditions.`);
  conditions.forEach((c, i) => {
    const field = CONDITION_FIELD_BY_ID.get(c.field);
    if (!field) errors.push(`Condition ${i + 1}: choose a field.`);
    else if (!field.operators.includes(c.operator)) errors.push(`Condition ${i + 1}: that comparison doesn't apply to ${field.label}.`);
    if (!String(c.value ?? "").trim()) errors.push(`Condition ${i + 1}: enter a value.`);
    else if (field?.kind === "number" && !Number.isFinite(parseNumber(c.value))) errors.push(`Condition ${i + 1}: ${field.label} needs a number.`);
  });
  const actions = a.actions || [];
  if (actions.length === 0) errors.push("Add at least one DO action.");
  if (actions.length > MAX_ACTIONS) errors.push(`Use at most ${MAX_ACTIONS} actions.`);
  actions.forEach((action, i) => {
    const def = ACTION_BY_ID.get(action.type);
    if (!def) {
      errors.push(`Action ${i + 1}: that action isn't allowed.`);
      return;
    }
    if (!def.triggers.includes(a.trigger)) errors.push(`Action ${i + 1}: ${def.label} can't run on "${TRIGGER_BY_ID.get(a.trigger)?.label || a.trigger}".`);
    const cfg = action.config || {};
    if (action.type === "update_status") {
      const allowed: readonly string[] = safeStatusesForTrigger(a.trigger);
      if (!cfg.status || !allowed.includes(cfg.status)) errors.push(`Action ${i + 1}: choose one of ${allowed.join(", ")}.`);
    }
    if (action.type === "mark_priority" && (!cfg.priority || !(PRIORITY_VALUES as readonly string[]).includes(cfg.priority))) {
      errors.push(`Action ${i + 1}: choose a priority.`);
    }
    if (cfg.daysFromNow != null && (!Number.isInteger(cfg.daysFromNow) || cfg.daysFromNow < 0 || cfg.daysFromNow > 365)) {
      errors.push(`Action ${i + 1}: days from now must be 0-365.`);
    }
    if (cfg.message && cfg.message.length > 1000) errors.push(`Action ${i + 1}: message must be 1000 characters or fewer.`);
    if ((action.type === "send_customer_message" || action.type === "add_timeline_entry") && !cfg.message?.trim()) {
      errors.push(`Action ${i + 1}: enter the ${action.type === "add_timeline_entry" ? "timeline text" : "message"}.`);
    }
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Idempotency + run bookkeeping
// ---------------------------------------------------------------------------

/**
 * Deterministic run document id: the same automation seeing the same event
 * (a replay, a retry, the realtime echo of a local write, or a second open
 * tab) always lands on the same id, and firestore.rules only allow creating
 * it once. Skipped-by-condition runs use their own id so a later qualifying
 * pass (e.g. an invoice going from 1 to 4 days overdue) can still run.
 */
export function automationRunId(automationId: string, eventKey: string, kind: "run" | "skip" = "run"): string {
  const safeKey = eventKey.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 300);
  return `${automationId}__${kind === "skip" ? "skip__" : ""}${safeKey}`;
}

export function computeRunStatus(results: AutomationActionResult[]): Exclude<AutomationRunStatus, "Running"> {
  const completed = results.filter(r => r.status === "completed").length;
  const failed = results.filter(r => r.status === "failed").length;
  if (failed > 0) return completed > 0 ? "Partial" : "Failed";
  return completed > 0 ? "Completed" : "Skipped";
}

export function summarizeRun(status: AutomationRunStatus, results: AutomationActionResult[], conditionsMet = true): string {
  if (!conditionsMet) return "Conditions not met";
  if (status === "Running") return "Running…";
  const parts = results.map(r => `${ACTION_BY_ID.get(r.type)?.label || r.type}: ${r.status}`);
  return parts.join(" · ").slice(0, 300);
}

/** Interpolates {customer}, {number}, {amount}, {date}, {business} into a message. */
export function renderAutomationMessage(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = vars[key];
    return value === undefined || value === null || value === "" ? match.replace(/[{}]/g, "") : String(value);
  });
}

export function recordLabel(event: AutomationEvent): string {
  const r = event.record || {};
  switch (event.collection) {
    case "leads": return `Lead ${r.name || r.id}`;
    case "estimates": return `Estimate ${r.number || r.id} — ${r.customerName || ""}`.trim();
    case "scheduling_events": return `${r.eventType === "Job" ? "Job" : r.eventType || "Appointment"} ${r.jobNumber || r.title || r.id} — ${r.customer || ""}`.trim();
    case "invoices": return `Invoice ${r.invoiceNumber || r.id} — ${r.customer || ""}`.trim();
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface AutomationRunStore {
  /** Atomically creates the run document if (and only if) it doesn't exist yet. Returns false when it already exists -- the event was already handled. */
  claim(run: AutomationRun): Promise<boolean>;
  finish(runId: string, patch: Partial<AutomationRun>): Promise<void>;
  /** Writes a Skipped run once; a no-op if that skip was already logged. */
  recordSkip(run: AutomationRun): Promise<void>;
  updateLastRun(automationId: string, patch: Pick<Automation, "lastRunAt" | "lastRunStatus" | "lastRunSummary">): Promise<void>;
}

export interface ActionOutcome {
  status: "completed" | "skipped";
  detail: string;
  recordId?: string;
}

export type AutomationActionHandler = (action: AutomationAction, event: AutomationEvent, automation: Automation, runId: string) => Promise<ActionOutcome> | ActionOutcome;

export interface ExecuteAutomationDeps {
  businessId: string;
  runBy?: string;
  store: AutomationRunStore;
  handlers: Partial<Record<AutomationActionType, AutomationActionHandler>>;
  /** Whether this session has the permissions every action needs. When false the run is left unclaimed for a session that can complete it. */
  canRunActions?: (actions: AutomationAction[]) => boolean;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
}

export type ExecuteOutcome = "not_applicable" | "no_permission" | "skipped" | "duplicate" | AutomationRunStatus;

/** Whether this automation should look at this event at all (enabled, right trigger, not an automation-created record echoing back). */
export function automationAppliesTo(automation: Automation, event: AutomationEvent): boolean {
  if (!automation || automation.enabled !== true) return false;
  if (automation.trigger !== event.trigger) return false;
  // Loop guard: a record an automation itself created never fires a
  // "...created" automation, so A -> creates X -> fires A' -> ... can't chain.
  if (TRIGGER_BY_ID.get(event.trigger)?.creation && event.record?.createdByAutomationId) return false;
  return true;
}

/**
 * Runs one automation for one event. Never throws: every failure is caught
 * and written to the run log instead, so it can't propagate into the manual
 * action that produced the event.
 */
export async function executeAutomation(automation: Automation, event: AutomationEvent, deps: ExecuteAutomationDeps): Promise<ExecuteOutcome> {
  const log = deps.log || ((message: string, error?: unknown) => console.warn(message, error));
  try {
    if (!automationAppliesTo(automation, event)) return "not_applicable";
    if (deps.canRunActions && !deps.canRunActions(automation.actions || [])) return "no_permission";

    const now = deps.now || (() => new Date());
    const facts = buildAutomationFacts(event, now());
    const { passed, results: conditionResults } = evaluateConditions(automation.conditions || [], facts);
    const base: AutomationRun = {
      id: automationRunId(automation.id, event.eventKey, passed ? "run" : "skip"),
      businessId: deps.businessId,
      automationId: automation.id,
      automationName: automation.name,
      trigger: event.trigger,
      eventKey: event.eventKey,
      sourceCollection: event.collection,
      sourceRecordId: String(event.record?.id || ""),
      sourceLabel: recordLabel(event),
      conditions: automation.conditions || [],
      conditionResults,
      conditionsMet: passed,
      actionsAttempted: [],
      actionResults: [],
      completedActions: 0,
      skippedActions: 0,
      failedActions: 0,
      errors: [],
      status: passed ? "Running" : "Skipped",
      startedAt: now().toISOString(),
      runBy: deps.runBy
    };

    if (!passed) {
      base.finishedAt = base.startedAt;
      try {
        await deps.store.recordSkip(base);
        await deps.store.updateLastRun(automation.id, { lastRunAt: base.startedAt, lastRunStatus: "Skipped", lastRunSummary: summarizeRun("Skipped", [], false) });
      } catch (error) {
        log(`Automation "${automation.name}": couldn't log skipped run`, error);
      }
      return "skipped";
    }

    let claimed = false;
    try {
      claimed = await deps.store.claim(base);
    } catch (error) {
      // Couldn't claim (offline, permission) -- do nothing rather than risk a
      // run that can't be de-duplicated.
      log(`Automation "${automation.name}": couldn't claim run ${base.id}`, error);
      return "duplicate";
    }
    if (!claimed) return "duplicate";

    const actionResults: AutomationActionResult[] = [];
    const errors: string[] = [];
    for (const action of automation.actions || []) {
      const handler = ALLOWED_ACTION_TYPES.includes(action.type) ? deps.handlers[action.type] : undefined;
      if (!handler) {
        actionResults.push({ actionId: action.id, type: action.type, status: "failed", detail: "This action isn't available." });
        errors.push(`${action.type}: not available`);
        continue;
      }
      try {
        const outcome = await handler(action, event, automation, base.id);
        actionResults.push({ actionId: action.id, type: action.type, status: outcome.status, detail: outcome.detail, ...(outcome.recordId ? { recordId: outcome.recordId } : {}) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        actionResults.push({ actionId: action.id, type: action.type, status: "failed", detail: message.slice(0, 500) });
        errors.push(`${ACTION_BY_ID.get(action.type)?.label || action.type}: ${message}`.slice(0, 500));
        log(`Automation "${automation.name}" action ${action.type} failed`, error);
      }
    }

    const status = computeRunStatus(actionResults);
    const finishedAt = now().toISOString();
    const patch: Partial<AutomationRun> = {
      actionsAttempted: (automation.actions || []).map(a => a.type),
      actionResults,
      completedActions: actionResults.filter(r => r.status === "completed").length,
      skippedActions: actionResults.filter(r => r.status === "skipped").length,
      failedActions: actionResults.filter(r => r.status === "failed").length,
      errors,
      status,
      finishedAt
    };
    try {
      await deps.store.finish(base.id, patch);
      await deps.store.updateLastRun(automation.id, { lastRunAt: finishedAt, lastRunStatus: status, lastRunSummary: summarizeRun(status, actionResults) });
    } catch (error) {
      log(`Automation "${automation.name}": couldn't save run result`, error);
    }
    return status;
  } catch (error) {
    log(`Automation "${automation?.name}" crashed`, error);
    return "Failed";
  }
}

// ---------------------------------------------------------------------------
// Starter templates -- always created DISABLED.
// ---------------------------------------------------------------------------

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  conditions: Array<Omit<AutomationCondition, "id">>;
  actions: Array<Omit<AutomationAction, "id">>;
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "estimate_accepted_job",
    name: "Estimate Accepted → Create Job",
    description: "Convert accepted estimates into jobs, tell the owner, and confirm with the customer.",
    trigger: "estimate.accepted",
    conditions: [],
    actions: [
      { type: "create_job", config: { daysFromNow: 1 } },
      { type: "notify_team", config: { recipients: "owner", message: "Estimate {number} for {customer} ({amount}) was accepted -- a job was created." } },
      { type: "send_customer_confirmation", config: { message: "Thanks, {customer}! We received your approval of estimate {number} and are getting your job on the schedule. -- {business}" } }
    ]
  },
  {
    id: "job_completed_invoice",
    name: "Job Completed → Create Invoice",
    description: "Create the invoice for a completed job and notify the office.",
    trigger: "job.completed",
    conditions: [],
    actions: [
      { type: "create_invoice" },
      { type: "notify_team", config: { recipients: "owner_and_managers", message: "{number} for {customer} is complete -- its invoice is ready to review and send." } }
    ]
  },
  {
    id: "invoice_overdue_reminder",
    name: "Invoice 3 Days Overdue → Reminder",
    description: "Tell the owner and remind the customer when an invoice is more than 3 days overdue.",
    trigger: "invoice.overdue",
    conditions: [{ field: "daysOverdue", operator: "greater_than", value: "3" }],
    actions: [
      { type: "notify_team", config: { recipients: "owner", message: "Invoice {number} for {customer} is overdue ({amount} still owed)." } },
      { type: "send_customer_message", config: { message: "Hi {customer}, this is a friendly reminder that invoice {number} ({amount}) is past due. You can pay it from your Customer Portal. Thank you! -- {business}" } }
    ]
  },
  {
    id: "website_emergency_priority",
    name: "Website Emergency Booking → High Priority",
    description: "Flag emergency website requests and alert managers right away.",
    trigger: "booking.website.created",
    conditions: [{ field: "priority", operator: "equals", value: "Emergency" }],
    actions: [
      { type: "mark_priority", config: { priority: "High" } },
      { type: "notify_team", config: { recipients: "managers", message: "Emergency website request from {customer} -- please follow up now." } }
    ]
  },
  {
    id: "invoice_paid_review",
    name: "Invoice Paid → Request Review",
    description: "Queue a review request once the customer has paid.",
    trigger: "invoice.paid",
    conditions: [],
    actions: [{ type: "request_review" }]
  }
];

function shortId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newConditionId(): string {
  return shortId("cond");
}

export function newActionId(): string {
  return shortId("act");
}

export function newAutomationId(): string {
  return shortId("auto");
}

export function automationFromTemplate(template: AutomationTemplate, createdBy?: string): Automation {
  const actions = template.actions.map(a => ({ ...a, id: newActionId(), config: a.config ? { ...a.config } : undefined }));
  return {
    id: newAutomationId(),
    name: template.name,
    description: template.description,
    trigger: template.trigger,
    conditions: template.conditions.map(c => ({ ...c, id: newConditionId() })),
    actions,
    actionTypes: actions.map(a => a.type),
    enabled: false,
    templateId: template.id,
    createdAt: new Date().toISOString(),
    createdBy
  };
}

/** Copy of an automation, always saved disabled with no run history. */
export function duplicateAutomation(source: Automation, createdBy?: string): Automation {
  const actions = (source.actions || []).map(a => ({ ...a, id: newActionId(), config: a.config ? { ...a.config } : undefined }));
  return {
    id: newAutomationId(),
    name: `${source.name} (copy)`.slice(0, 120),
    description: source.description,
    trigger: source.trigger,
    conditions: (source.conditions || []).map(c => ({ ...c, id: newConditionId() })),
    actions,
    actionTypes: actions.map(a => a.type),
    enabled: false,
    templateId: source.templateId,
    createdAt: new Date().toISOString(),
    createdBy
  };
}
