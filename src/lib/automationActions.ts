/**
 * The DO side of the Automation Engine. Every handler calls an existing,
 * canonical Owner'sLOCAL action (passed in as `deps` -- the live engine wires
 * in useDomainActions().createJob etc.) rather than re-implementing it, and
 * each one checks for an existing result first so it is idempotent on its
 * own, independent of the run claim in automationEngine.executeAutomation.
 *
 * Handlers make their state writes synchronously (before any await) so the
 * engine can recognise -- and ignore -- the collection events its own writes
 * produce.
 */
import type { Dispatch, SetStateAction } from "react";
import type { Customer, EmployeeRecord, Estimate, Lead, SchedulingEvent, AppNotification } from "../types/domain";
import type { Invoice, JournalEntry, SalesTaxRate } from "../types/accounting";
import type { ReviewAutomationSettings, ReviewRequest } from "../types/reviewRequest";
import type { Automation, AutomationAction, AutomationActionType, AutomationRecipients } from "../types/automation";
import {
  type ActionOutcome,
  type AutomationActionHandler,
  type AutomationEvent,
  SAFE_JOB_STATUSES,
  SAFE_LEAD_STATUSES,
  PRIORITY_VALUES,
  invoiceBalance,
  invoiceTotalAmount,
  recordLabel,
  renderAutomationMessage
} from "./automationEngine";
import { resolveCustomerByIdOrName } from "./resolveCustomer";
import { buildInvoiceFromJob, findExistingInvoiceForJob } from "./jobInvoiceHandoff";
import { postInvoiceCreatedEntry } from "./accountingEngine";
import { isManagerRole } from "./notificationsService";
import { buildScheduledReviewRequest, reviewRequestBlockedReason, reviewRequestExists } from "./reviewRequests";
import { normalizeContactPhone } from "./contactNormalization";

export interface AutomationDataSnapshot {
  customers: Customer[];
  leads: Lead[];
  estimates: Estimate[];
  schedulingEvents: SchedulingEvent[];
  invoices: Invoice[];
  employees: EmployeeRecord[];
  reviewRequests: ReviewRequest[];
  reviewAutomationSettings: ReviewAutomationSettings;
  salesTaxRates: SalesTaxRate[];
}

export type CreateJobFn = (input: {
  customerId?: string;
  customer: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  description?: string;
  notes?: string;
  budget?: number;
  date: string;
  startTime: string;
  endTime: string;
  sourceEstimateId?: string;
  sourceLeadId?: string;
  source?: Customer["source"];
  createdByAutomationId?: string;
}) => SchedulingEvent;

export type CreateAppointmentFn = (input: {
  eventType: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  customer: string;
  customerId?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  notes?: string;
  sourceLeadId?: string;
  source?: Customer["source"];
  dedupeKey?: string;
  createdByAutomationId?: string;
}) => SchedulingEvent;

export interface AutomationActionDeps {
  businessId: string;
  businessName: string;
  /** Email of the signed-in user running the automation. */
  actorEmail?: string;
  getData: () => AutomationDataSnapshot;
  createJob: CreateJobFn;
  createAppointment: CreateAppointmentFn;
  updateJob: (jobId: string, updates: Partial<SchedulingEvent>, actionLabel?: string) => SchedulingEvent | null;
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  setInvoices: Dispatch<SetStateAction<Invoice[]>>;
  setJournalEntries: Dispatch<SetStateAction<JournalEntry[]>>;
  setEstimates: Dispatch<SetStateAction<Estimate[]>>;
  setNotifications: Dispatch<SetStateAction<AppNotification[]>>;
  setReviewRequests: Dispatch<SetStateAction<ReviewRequest[]>>;
  /** Appends one message (by id) to the customer's Customer Chat conversation. Resolves "exists" when that message id is already there. */
  postCustomerMessage: (params: { customer: Customer; messageId: string; content: string }) => Promise<"posted" | "exists">;
  logOperationalEvent: (type: string, desc: string, icon?: string) => void;
  now?: () => Date;
}

/** Short, stable hash so derived ids (notifications, messages) stay compact but deterministic per run + action. */
export function stableHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

const money = (n: number) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function dateFromNow(days: number | undefined, now: Date): string {
  const d = new Date(now);
  d.setDate(d.getDate() + (days ?? 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The real Customer record this event is about, when one exists. */
export function resolveEventCustomer(event: AutomationEvent, customers: Customer[]): Customer | null {
  const r = event.record || {};
  switch (event.collection) {
    case "leads":
      return resolveCustomerByIdOrName(customers, r.sourceCustomerId, r.name) || (r.company ? resolveCustomerByIdOrName(customers, undefined, r.company) : null);
    case "estimates":
      return resolveCustomerByIdOrName(customers, r.customerId, r.customerName) || (r.company ? resolveCustomerByIdOrName(customers, undefined, r.company) : null);
    case "scheduling_events":
      return resolveCustomerByIdOrName(customers, r.customerId, r.customer);
    case "invoices":
      return resolveCustomerByIdOrName(customers, r.customerId, r.customer);
  }
}

/** The Job (scheduling_events record with eventType Job) this event belongs to, when there is one. */
export function resolveEventJob(event: AutomationEvent, schedulingEvents: SchedulingEvent[]): SchedulingEvent | undefined {
  const r = event.record || {};
  if (event.collection === "scheduling_events") return schedulingEvents.find(e => e.id === r.id) || r;
  if (event.collection === "estimates") return schedulingEvents.find(e => e.eventType === "Job" && e.sourceEstimateId === r.id);
  if (event.collection === "invoices" && r.jobId) return schedulingEvents.find(e => e.id === r.jobId);
  if (event.collection === "leads") return schedulingEvents.find(e => e.eventType === "Job" && e.sourceLeadId === r.id);
  return undefined;
}

function customerNameFor(event: AutomationEvent, customer: Customer | null): string {
  const r = event.record || {};
  return (customer?.contact || customer?.company || r.customerName || r.customer || r.name || "Customer").trim();
}

export function messageVariables(event: AutomationEvent, customer: Customer | null, businessName: string): Record<string, string> {
  const r = event.record || {};
  const vars: Record<string, string> = { customer: customerNameFor(event, customer), business: businessName || "our team" };
  if (event.collection === "leads") { vars.number = r.name || ""; vars.amount = money(r.estimatedValue); }
  if (event.collection === "estimates") { vars.number = r.number || ""; vars.amount = money(r.amount); vars.date = r.expirationDate || ""; }
  if (event.collection === "scheduling_events") { vars.number = r.jobNumber || r.title || r.eventType || ""; vars.amount = money(r.budget); vars.date = [r.date, r.startTime].filter(Boolean).join(" "); }
  if (event.collection === "invoices") { vars.number = r.invoiceNumber || ""; vars.amount = money(event.trigger === "invoice.overdue" ? invoiceBalance(r) : invoiceTotalAmount(r)); vars.date = r.dueDate || ""; }
  return vars;
}

const DEFAULT_CONFIRMATIONS: Partial<Record<string, string>> = {
  "estimate.created": "Hi {customer}, your estimate {number} ({amount}) is ready. Reply here with any questions. -- {business}",
  "estimate.accepted": "Thanks, {customer}! We received your approval of estimate {number}. We'll be in touch to schedule the work. -- {business}",
  "job.created": "Hi {customer}, your job {number} is booked for {date}. -- {business}",
  "job.completed": "Hi {customer}, your job {number} is complete. Thank you for choosing {business}!",
  "appointment.created": "Hi {customer}, your appointment is confirmed for {date}. -- {business}",
  "invoice.created": "Hi {customer}, invoice {number} for {amount} is ready. You can view and pay it from your Customer Portal. -- {business}",
  "invoice.paid": "Thanks, {customer}! We received your payment for invoice {number}. -- {business}",
  "booking.portal.created": "Thanks, {customer}! We received your service request and will reach out shortly. -- {business}"
};

const SCREEN_FOR_COLLECTION: Record<AutomationEvent["collection"], string> = {
  leads: "leads",
  estimates: "estimates",
  scheduling_events: "jobs",
  invoices: "accounting"
};

function skipped(detail: string, recordId?: string): ActionOutcome {
  return { status: "skipped", detail, recordId };
}

function completed(detail: string, recordId?: string): ActionOutcome {
  return { status: "completed", detail, recordId };
}

export function resolveRecipientEmails(recipients: AutomationRecipients | undefined, businessId: string, employees: EmployeeRecord[]): { emails: string[]; note?: string } {
  const owner = [businessId];
  const managers = employees
    .filter(e => isManagerRole(e.role) && e.email && (e as any).status !== "Inactive" && (e as any).status !== "Terminated")
    .map(e => e.email.trim().toLowerCase());
  const mode = recipients || "owner";
  let emails = mode === "owner" ? owner : mode === "managers" ? managers : [...owner, ...managers];
  let note: string | undefined;
  if (emails.length === 0) {
    emails = owner;
    note = "No managers on the roster -- notified the owner instead.";
  }
  return { emails: [...new Set(emails.filter(Boolean))], note };
}

export function createAutomationActionHandlers(deps: AutomationActionDeps): Record<AutomationActionType, AutomationActionHandler> {
  const now = () => (deps.now ? deps.now() : new Date());
  const automationLabel = (automation: Automation) => `automation "${automation.name}"`;

  const createJob: AutomationActionHandler = (action, event, automation) => {
    const data = deps.getData();
    const r = event.record;
    const date = dateFromNow(action.config?.daysFromNow, now());
    if (event.collection === "estimates") {
      const estimate: Estimate = data.estimates.find(e => e.id === r.id) || r;
      const existing = data.schedulingEvents.find(e => e.sourceEstimateId === estimate.id);
      if (existing) return skipped(`Job ${existing.jobNumber || existing.id} already exists for estimate ${estimate.number}.`, existing.id);
      const matchedCustomer = resolveEventCustomer(event, data.customers);
      // Same mapping as the estimate's own "Convert to Job" button
      // (EstimatesPage.openBuildJobFromEstimate), through the same createJob.
      const job = deps.createJob({
        customerId: matchedCustomer?.id,
        customer: estimate.customerName,
        customerPhone: normalizeContactPhone(estimate.phone || matchedCustomer?.phone),
        customerEmail: matchedCustomer?.email,
        customerAddress: estimate.address || matchedCustomer?.address,
        description: estimate.projectSpecifics || undefined,
        notes: estimate.notes,
        budget: estimate.amount,
        date,
        startTime: "09:00",
        endTime: "11:00",
        sourceEstimateId: estimate.id,
        source: matchedCustomer?.source || estimate.source,
        createdByAutomationId: automation.id
      });
      return completed(`Created job ${job.jobNumber || job.id} (unassigned, ${date}) from estimate ${estimate.number}.`, job.id);
    }
    if (event.collection === "leads") {
      const lead: Lead = data.leads.find(l => l.id === r.id) || r;
      const existing = data.schedulingEvents.find(e => e.eventType === "Job" && e.sourceLeadId === lead.id);
      if (existing) return skipped(`Job ${existing.jobNumber || existing.id} already exists for this lead.`, existing.id);
      // Same mapping as the lead's own "Build Job" button (LeadsPage).
      const job = deps.createJob({
        customer: lead.name,
        customerPhone: lead.phone,
        customerEmail: lead.email,
        customerAddress: lead.address,
        notes: lead.notes,
        budget: lead.estimatedValue,
        date,
        startTime: "09:00",
        endTime: "11:00",
        sourceLeadId: lead.id,
        source: lead.source,
        createdByAutomationId: automation.id
      });
      return completed(`Created job ${job.jobNumber || job.id} (unassigned, ${date}) from lead ${lead.name}.`, job.id);
    }
    if (event.collection === "scheduling_events" && event.record?.eventType === "Job") return skipped("This booking is already a job.", event.record.id);
    return skipped("Create Job only applies to estimates and leads.");
  };

  const scheduleEntry = (eventType: string, defaultTitle: (customer: string) => string): AutomationActionHandler => (action, event, automation, runId) => {
    const data = deps.getData();
    const r = event.record || {};
    const customer = resolveEventCustomer(event, data.customers);
    const name = customerNameFor(event, customer);
    const dedupeKey = `${automation.id}_${stableHash(`${runId}|${action.id}`)}`;
    const appointmentId = `appt_${dedupeKey.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120)}`;
    const existing = data.schedulingEvents.find(e => e.id === appointmentId);
    if (existing) return skipped(`${eventType} already on the calendar for ${existing.date}.`, existing.id);
    const vars = messageVariables(event, customer, deps.businessName);
    const date = dateFromNow(action.config?.daysFromNow, now());
    const created = deps.createAppointment({
      eventType,
      title: action.config?.title?.trim() ? renderAutomationMessage(action.config.title, vars) : defaultTitle(name),
      date,
      startTime: "09:00",
      endTime: "10:00",
      customer: name,
      customerId: customer?.id,
      customerPhone: customer?.phone || r.phone || r.customerPhone,
      customerEmail: customer?.email || r.email || r.customerEmail,
      customerAddress: r.address || r.customerAddress || r.location || customer?.address,
      notes: [action.config?.message ? renderAutomationMessage(action.config.message, vars) : "", `Created by ${automationLabel(automation)} for ${recordLabel(event)}.`].filter(Boolean).join("\n"),
      sourceLeadId: event.collection === "leads" ? r.id : r.sourceLeadId,
      source: r.source,
      dedupeKey,
      createdByAutomationId: automation.id
    });
    return completed(`${eventType} scheduled for ${created.date} (unassigned).`, created.id);
  };

  const createAppointment: AutomationActionHandler = (action, event, automation, runId) => {
    if (event.collection === "invoices") return skipped("Create Appointment doesn't apply to invoices.");
    const type = action.config?.appointmentType || "Site Visit";
    return scheduleEntry(type, customer => `${type} — ${customer}`)(action, event, automation, runId);
  };

  const createFollowUpTask = scheduleEntry("Follow-Up", customer => `Follow up with ${customer}`);

  const createInvoice: AutomationActionHandler = (_action, event, automation) => {
    if (event.collection !== "scheduling_events" || event.record?.eventType !== "Job") return skipped("Create Invoice only applies to jobs.");
    const data = deps.getData();
    const job: SchedulingEvent = data.schedulingEvents.find(e => e.id === event.record.id) || event.record;
    const existing = findExistingInvoiceForJob(data.invoices, job.id);
    if (existing) return skipped(`Invoice ${existing.invoiceNumber} already exists for this job.`, existing.id);
    const built = buildInvoiceFromJob({
      job,
      invoices: data.invoices,
      estimates: data.estimates,
      customers: data.customers,
      taxRate: data.salesTaxRates.find(r => r.isDefault)?.rate || 0,
      createdBy: deps.actorEmail,
      createdByAutomationId: automation.id,
      now: now()
    });
    if ("error" in built) throw new Error(built.error);
    const { invoice } = built;
    let added = false;
    deps.setInvoices(prev => {
      if (findExistingInvoiceForJob(prev, job.id)) return prev;
      added = true;
      return [...prev, invoice];
    });
    if (!added) return skipped("An invoice for this job was created a moment ago.");
    // Same follow-on writes as Accounting's Create Invoice button.
    deps.setJournalEntries(prev => prev.some(e => e.source === "invoice" && e.sourceId === invoice.id) ? prev : [...prev, postInvoiceCreatedEntry(invoice, deps.actorEmail)]);
    if (invoice.estimateId) {
      deps.setEstimates(prev => prev.map(e => e.id === invoice.estimateId ? { ...e, status: "Completed" } : e));
    }
    deps.logOperationalEvent("Invoice Created", `${invoice.invoiceNumber} for ${invoice.customer}: ${money(invoiceTotalAmount(invoice))} (${automationLabel(automation)})`, "🧾");
    return completed(`Created invoice ${invoice.invoiceNumber} for ${money(invoiceTotalAmount(invoice))}.`, invoice.id);
  };

  const sendCustomerMessage = (kind: "confirmation" | "message"): AutomationActionHandler => async (action, event, _automation, runId) => {
    const data = deps.getData();
    const customer = resolveEventCustomer(event, data.customers);
    if (!customer) return skipped("No matching customer record to message -- add or link the customer in Customers first.");
    const template = action.config?.message?.trim() || (kind === "confirmation" ? DEFAULT_CONFIRMATIONS[event.trigger] : "");
    if (!template) return skipped("No message text configured.");
    const content = renderAutomationMessage(template, messageVariables(event, customer, deps.businessName));
    const result = await deps.postCustomerMessage({ customer, messageId: `msg_auto_${stableHash(`${runId}|${action.id}`)}`, content });
    return result === "exists"
      ? skipped("This message was already sent.")
      : completed(`Posted to ${customer.contact || customer.company}'s Messages / Customer Portal conversation.`);
  };

  const notifyTeam: AutomationActionHandler = (action, event, automation, runId) => {
    const data = deps.getData();
    const customer = resolveEventCustomer(event, data.customers);
    const { emails, note } = resolveRecipientEmails(action.config?.recipients, deps.businessId, data.employees);
    const vars = messageVariables(event, customer, deps.businessName);
    const description = action.config?.message?.trim() ? renderAutomationMessage(action.config.message, vars) : recordLabel(event);
    const base = `notif_auto_${stableHash(`${runId}|${action.id}`)}`;
    const createdAt = now().toISOString();
    const notifications: AppNotification[] = emails.map((recipientEmail, i) => ({
      id: `${base}_${i}`,
      businessId: deps.businessId,
      recipientEmail,
      type: "general",
      title: `Automation: ${automation.name}`.slice(0, 140),
      description,
      time: new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isRead: false,
      icon: "⚡",
      screenId: SCREEN_FOR_COLLECTION[event.collection],
      ...(customer?.id ? { relatedCustomerId: customer.id } : {}),
      createdAt
    }));
    let added = 0;
    deps.setNotifications(prev => {
      const existingIds = new Set(prev.map(n => n.id));
      const fresh = notifications.filter(n => !existingIds.has(n.id));
      added = fresh.length;
      return fresh.length ? [...fresh, ...prev] : prev;
    });
    if (!added) return skipped("These people were already notified.");
    return completed(`Notified ${emails.join(", ")}.${note ? ` ${note}` : ""}`);
  };

  const requestReview: AutomationActionHandler = (_action, event) => {
    const data = deps.getData();
    if (event.collection !== "scheduling_events" && event.collection !== "invoices") return skipped("Request Review only applies to jobs and invoices.");
    const customer = resolveEventCustomer(event, data.customers);
    if (!customer) return skipped("No matching customer record -- link this to a customer first.");
    const job = resolveEventJob(event, data.schedulingEvents);
    const target = { jobId: job?.id, customerId: customer.id, excludedByJob: job?.reviewRequestExcluded };
    const blocked = reviewRequestBlockedReason(data.reviewAutomationSettings, target);
    if (blocked) {
      if (blocked.startsWith("Set up")) throw new Error(blocked);
      return skipped(blocked);
    }
    if (reviewRequestExists(data.reviewRequests, target)) return skipped("A review request already exists for this job/customer.");
    const request = buildScheduledReviewRequest({
      trigger: event.collection === "invoices" ? "invoice_paid" : "job_completed",
      customerId: customer.id,
      customerName: customer.contact || customer.company,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      jobId: job?.id,
      invoiceId: event.collection === "invoices" ? event.record.id : undefined,
      createdBy: "Automations",
      activityBy: "Automation Engine"
    }, data.reviewAutomationSettings);
    let created = false;
    deps.setReviewRequests(prev => {
      if (reviewRequestExists(prev, target)) return prev;
      created = true;
      return [request, ...prev];
    });
    if (!created) return skipped("A review request already exists for this job/customer.");
    deps.logOperationalEvent("Review Request Scheduled", `${request.customerName} -- ready to send`, "⭐");
    return completed(`Review request ready to send to ${request.customerName} (Customers > Reviews).`, request.id);
  };

  const markPriority: AutomationActionHandler = (action, event, automation) => {
    const priority = action.config?.priority;
    if (!priority || !(PRIORITY_VALUES as readonly string[]).includes(priority)) throw new Error("No valid priority configured.");
    const data = deps.getData();
    if (event.collection === "leads") {
      const lead = data.leads.find(l => l.id === event.record.id);
      if (!lead) throw new Error("The lead no longer exists.");
      if (lead.priority === priority) return skipped(`Lead is already ${priority} priority.`);
      deps.setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, priority } : l));
      deps.logOperationalEvent("Lead Priority", `${lead.name} marked ${priority} priority (${automationLabel(automation)})`, "🚩");
      return completed(`Lead marked ${priority} priority.`, lead.id);
    }
    if (event.collection === "scheduling_events") {
      const entry = data.schedulingEvents.find(e => e.id === event.record.id);
      if (!entry) throw new Error("The calendar entry no longer exists.");
      if (entry.priority === priority) return skipped(`Already ${priority} priority.`);
      deps.updateJob(entry.id, { priority }, `Priority set to ${priority} by ${automationLabel(automation)}`);
      return completed(`Marked ${priority} priority.`, entry.id);
    }
    return skipped("Mark Priority only applies to leads, jobs, and appointments.");
  };

  const updateStatus: AutomationActionHandler = (action, event, automation) => {
    const status = action.config?.status || "";
    const data = deps.getData();
    if (event.collection === "leads") {
      if (!(SAFE_LEAD_STATUSES as readonly string[]).includes(status)) throw new Error(`"${status}" isn't an allowed automatic lead status.`);
      const lead = data.leads.find(l => l.id === event.record.id);
      if (!lead) throw new Error("The lead no longer exists.");
      if (lead.status === status) return skipped(`Lead is already ${status}.`);
      if (["Won", "Lost", "Archived"].includes(lead.status)) return skipped(`Lead is ${lead.status}; automations don't reopen closed leads.`);
      deps.setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: status as Lead["status"] } : l));
      deps.logOperationalEvent("Lead Updated", `${lead.name} moved to ${status} (${automationLabel(automation)})`, "🎯");
      return completed(`Lead moved to ${status}.`, lead.id);
    }
    if (event.collection === "scheduling_events") {
      if (!(SAFE_JOB_STATUSES as readonly string[]).includes(status)) throw new Error(`"${status}" isn't an allowed automatic status.`);
      const entry = data.schedulingEvents.find(e => e.id === event.record.id);
      if (!entry) throw new Error("The calendar entry no longer exists.");
      if (entry.status === status) return skipped(`Already ${status}.`);
      if (entry.status === "Completed" || entry.status === "Cancelled") return skipped(`It's ${entry.status}; automations don't reopen it.`);
      deps.updateJob(entry.id, { status: status as SchedulingEvent["status"] }, `Status set to ${status} by ${automationLabel(automation)}`);
      return completed(`Status set to ${status}.`, entry.id);
    }
    return skipped("Update Status only applies to leads, jobs, and appointments.");
  };

  const addTimelineEntry: AutomationActionHandler = (action, event, automation) => {
    const data = deps.getData();
    const customer = resolveEventCustomer(event, data.customers);
    const text = renderAutomationMessage(action.config?.message?.trim() || `${automation.name} ran`, messageVariables(event, customer, deps.businessName));
    const label = `Automation: ${text}`.slice(0, 500);
    const entry = event.collection === "scheduling_events"
      ? data.schedulingEvents.find(e => e.id === event.record.id)
      : resolveEventJob(event, data.schedulingEvents);
    if (entry && data.schedulingEvents.some(e => e.id === entry.id)) {
      if ((entry.activity || []).some(a => a.action === label)) return skipped("That timeline entry is already on the job.", entry.id);
      deps.updateJob(entry.id, {}, label);
      return completed(`Added to ${entry.jobNumber || entry.title || "the job"}'s timeline.`, entry.id);
    }
    deps.logOperationalEvent("Automation", `${recordLabel(event)}: ${text}`, "⚡");
    return completed("Added to the business activity log (no job is linked yet).");
  };

  return {
    create_job: createJob,
    create_appointment: createAppointment,
    create_invoice: createInvoice,
    send_customer_confirmation: sendCustomerMessage("confirmation"),
    send_customer_message: sendCustomerMessage("message"),
    notify_team: notifyTeam,
    create_follow_up_task: createFollowUpTask,
    request_review: requestReview,
    mark_priority: markPriority,
    update_status: updateStatus,
    add_timeline_entry: addTimelineEntry
  };
}

export type { AutomationAction };
