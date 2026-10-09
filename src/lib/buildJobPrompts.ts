import type { Customer, Estimate, Lead } from "../types/domain";
import type { BuildJobPrefill } from "../types/generatedPdf";
import { normalizeContactPhone } from "./contactNormalization";

/**
 * "Build the job" prompts. An accepted (or signed -- signed IS accepted)
 * estimate never turns into a bare job on its own: a real job needs its
 * schedule, crew, job tracking and job costing set up, so instead the user
 * is asked to open the shared Build Job form pre-filled from the estimate.
 *
 * One in-memory queue, deduplicated by key ("estimate:<id>" / "lead:<id>"),
 * fed by the acceptance watcher (BuildJobPromptHost) and by automations'
 * Build Job action -- so the same estimate is only ever asked about once per
 * session, however many ways its acceptance is observed.
 */

export interface BuildJobPromptRequest {
  key: string;
  title: string;
  detail: string;
  prefill: BuildJobPrefill;
}

const ACCEPTED_ESTIMATE_STATUSES = new Set(["Signed", "Accepted"]);

/** Signed and Accepted mean the same thing for an estimate. */
export function isAcceptedEstimateStatus(status: unknown): boolean {
  return typeof status === "string" && ACCEPTED_ESTIMATE_STATUSES.has(status);
}

export const estimatePromptKey = (estimateId: string) => `estimate:${estimateId}`;
export const leadPromptKey = (leadId: string) => `lead:${leadId}`;

/** Same mapping as the estimate's own "Convert to Job" button. */
export function buildJobPrefillFromEstimate(estimate: Estimate, matchedCustomer?: Customer | null): BuildJobPrefill {
  return {
    customerId: matchedCustomer?.id,
    customerName: estimate.customerName,
    customerPhone: normalizeContactPhone(estimate.phone || matchedCustomer?.phone),
    customerEmail: matchedCustomer?.email,
    customerAddress: estimate.address || matchedCustomer?.address,
    description: estimate.projectSpecifics || undefined,
    notes: estimate.notes,
    budget: estimate.amount,
    sourceEstimateId: estimate.id,
    source: matchedCustomer?.source || estimate.source
  };
}

/** Same mapping as the lead's own "Build Job" button. */
export function buildJobPrefillFromLead(lead: Lead): BuildJobPrefill {
  return {
    customerName: lead.name,
    customerPhone: lead.phone,
    customerEmail: lead.email,
    customerAddress: lead.address,
    notes: lead.notes,
    budget: lead.estimatedValue,
    sourceLeadId: lead.id,
    source: lead.source
  };
}

const money = (n: number) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function estimateBuildJobPrompt(estimate: Estimate, matchedCustomer?: Customer | null): BuildJobPromptRequest {
  return {
    key: estimatePromptKey(estimate.id),
    title: "Estimate accepted -- build the job",
    detail: `${estimate.number || "Estimate"} for ${estimate.customerName || "this customer"} (${money(estimate.amount)}) was accepted. Build the job to set its schedule, crew, job tracking and job costing.`,
    prefill: buildJobPrefillFromEstimate(estimate, matchedCustomer)
  };
}

export function leadBuildJobPrompt(lead: Lead): BuildJobPromptRequest {
  return {
    key: leadPromptKey(lead.id),
    title: "Build the job for this lead",
    detail: `${lead.name || "This lead"} is ready for a job. Build it to set its schedule, crew, job tracking and job costing.`,
    prefill: buildJobPrefillFromLead(lead)
  };
}

let queue: BuildJobPromptRequest[] = [];
const seen = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

/** Queues a prompt. Returns false when this key was already asked about (or handled) this session. */
export function requestBuildJobPrompt(request: BuildJobPromptRequest): boolean {
  if (seen.has(request.key)) return false;
  seen.add(request.key);
  queue = [...queue, request];
  notify();
  return true;
}

/** The user is already building this job (e.g. clicked Convert to Job) -- never prompt for it. */
export function suppressBuildJobPrompt(key: string): void {
  seen.add(key);
  if (queue.some(r => r.key === key)) {
    queue = queue.filter(r => r.key !== key);
    notify();
  }
}

/** Removes a prompt that was answered (Build Job or Later). */
export function resolveBuildJobPrompt(key: string): void {
  queue = queue.filter(r => r.key !== key);
  notify();
}

export function getBuildJobPrompts(): BuildJobPromptRequest[] {
  return queue;
}

export function subscribeBuildJobPrompts(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test helper. */
export function resetBuildJobPrompts(): void {
  queue = [];
  seen.clear();
  notify();
}
