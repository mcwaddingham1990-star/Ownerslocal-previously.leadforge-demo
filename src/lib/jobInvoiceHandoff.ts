import type { Invoice } from "../types/accounting";
import type { Customer, Estimate, SchedulingEvent } from "../types/domain";

export interface PendingInvoicePrefill {
  jobId?: string;
  estimateId?: string;
  customerId?: string;
  customerName?: string;
  description?: string;
  amount?: number;
}

export function buildJobInvoicePrefill(job: SchedulingEvent): PendingInvoicePrefill {
  return {
    jobId: job.id,
    estimateId: job.sourceEstimateId || undefined,
    customerId: job.customerId || undefined,
    customerName: job.customer || undefined,
    description: job.title || job.description || "Completed job",
    amount: Number(job.budget) || 0,
  };
}

export function parsePendingInvoicePrefill(raw: string | null): PendingInvoicePrefill | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const result: PendingInvoicePrefill = {};
    for (const key of ["jobId", "estimateId", "customerId", "customerName", "description"] as const) {
      if (typeof value[key] === "string" && value[key].trim()) {
        result[key] = value[key].trim();
      }
    }
    if (typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount >= 0) {
      result.amount = value.amount;
    }
    return Object.keys(result).length ? result : null;
  } catch {
    return null;
  }
}

export function findExistingInvoiceForJob(invoices: Invoice[], jobId?: string): Invoice | undefined {
  if (!jobId) return undefined;
  return invoices.find(invoice => invoice.jobId === jobId && invoice.status !== "void");
}

/**
 * Builds the same invoice a person gets from the completed job's "Create
 * Invoice" handoff (buildJobInvoicePrefill -> Accounting's prefilled create
 * form -> Create): linked to the job (and its estimate, when there is one),
 * the estimate's amount as the line when linked, otherwise the job's
 * description and estimated value. Used by the "Create Invoice" automation
 * so it never drifts from the manual path. Returns an error instead of a
 * $0 invoice when the job has no amount to bill.
 */
export function buildInvoiceFromJob(params: {
  job: SchedulingEvent;
  invoices: Invoice[];
  estimates: Array<Pick<Estimate, "id" | "number" | "amount" | "customerName" | "company" | "source" | "sourceLeadId">>;
  customers: Array<Pick<Customer, "id" | "contact" | "company" | "source" | "sourceLeadId">>;
  taxRate?: number;
  dueInDays?: number;
  createdBy?: string;
  createdByAutomationId?: string;
  now?: Date;
}): { invoice: Invoice } | { error: string } {
  const { job, invoices, estimates, customers } = params;
  const prefill = buildJobInvoicePrefill(job);
  const now = params.now || new Date();
  const linkedEstimate = prefill.estimateId ? estimates.find(e => e.id === prefill.estimateId) : undefined;
  const matchedCustomer =
    customers.find(c => c.id === prefill.customerId) ||
    customers.find(c => c.contact === prefill.customerName || c.company === prefill.customerName);

  const customer = linkedEstimate
    ? (linkedEstimate.customerName || linkedEstimate.company || "").trim()
    : (matchedCustomer?.company || matchedCustomer?.contact || prefill.customerName || "").trim();
  const line = linkedEstimate
    ? { description: `Estimate ${linkedEstimate.number}`, unitPrice: Number(linkedEstimate.amount) || 0 }
    : { description: prefill.description || "Completed job", unitPrice: Number(prefill.amount) || 0 };

  if (!customer) return { error: "The job has no customer name to invoice." };
  if (!(line.unitPrice > 0)) return { error: "The job has no estimated value or accepted estimate amount to bill -- create this invoice manually." };

  const issuedDate = now.toISOString().slice(0, 10);
  const due = new Date(`${issuedDate}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + (params.dueInDays ?? 30));
  const random = Math.random().toString(36).slice(2, 8);

  return {
    invoice: {
      id: `inv_${now.getTime()}_${random}`,
      invoiceNumber: `INV-${1000 + invoices.length + 1}`,
      customer,
      customerId: matchedCustomer?.id,
      lineItems: [{ id: `li_${now.getTime()}_${random}`, description: line.description, quantity: 1, unitPrice: line.unitPrice }],
      taxRate: params.taxRate || 0,
      issuedDate,
      dueDate: due.toISOString().slice(0, 10),
      status: "sent",
      amountPaid: 0,
      createdAt: now.toISOString(),
      createdBy: params.createdBy,
      jobId: job.id,
      estimateId: linkedEstimate?.id,
      source: linkedEstimate?.source || matchedCustomer?.source || "Manual Entry",
      sourceLeadId: linkedEstimate?.sourceLeadId || matchedCustomer?.sourceLeadId,
      ...(params.createdByAutomationId ? { createdByAutomationId: params.createdByAutomationId } : {})
    }
  };
}
