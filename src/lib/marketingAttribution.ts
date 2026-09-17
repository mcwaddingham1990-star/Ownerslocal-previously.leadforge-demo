import type { Lead, Customer, Estimate, SchedulingEvent, EmployeeRecord, TimeClockLog, Transaction, LeadSource } from "../types/domain";
import type { Invoice } from "../types/accounting";
import { computeJobCosting } from "./jobCostingEngine";

/**
 * Marketing Attribution -- rolls up the real Lead -> Customer -> Estimate ->
 * Job -> Invoice -> Revenue -> Profit chain by the Lead's original source.
 * Every number here comes from real linked records (Estimates, Jobs,
 * Invoices, Job Costing) -- nothing is estimated or guessed. A record's own
 * `source` field (set at creation time, see useDomainActions.ts) is used
 * when present; older records that predate this feature fall back to
 * walking their real links (Job -> Estimate -> Customer, Invoice -> Job/
 * Estimate -> Customer) so historical data still attributes correctly
 * instead of dumping everything into "Other".
 */

export const ALL_LEAD_SOURCES: LeadSource[] = [
  "Google Business Profile", "Website", "Facebook", "Instagram", "Referral",
  "Phone Call", "Walk-In", "Manual Entry", "Customer Portal", "Other"
];

function findCustomerFor(customers: Customer[], id?: string, name?: string, company?: string): Customer | undefined {
  if (id) {
    const byId = customers.find(c => c.id === id);
    if (byId) return byId;
  }
  return customers.find(c => (name && c.contact === name) || (company && c.company === company));
}

export function resolveEstimateSource(est: Estimate, customers: Customer[]): LeadSource {
  if (est.source) return est.source;
  return findCustomerFor(customers, est.customerId, est.customerName, est.company)?.source || "Other";
}

export function resolveJobSource(job: SchedulingEvent, estimates: Estimate[], customers: Customer[]): LeadSource {
  if (job.source) return job.source;
  if (job.sourceEstimateId) {
    const est = estimates.find(e => e.id === job.sourceEstimateId);
    if (est) return resolveEstimateSource(est, customers);
  }
  return findCustomerFor(customers, job.customerId, job.customer)?.source || "Other";
}

export function resolveInvoiceSource(inv: Invoice, jobs: SchedulingEvent[], estimates: Estimate[], customers: Customer[]): LeadSource {
  if (inv.source) return inv.source;
  if (inv.jobId) {
    const job = jobs.find(j => j.id === inv.jobId);
    if (job) return resolveJobSource(job, estimates, customers);
  }
  if (inv.estimateId) {
    const est = estimates.find(e => e.id === inv.estimateId);
    if (est) return resolveEstimateSource(est, customers);
  }
  return findCustomerFor(customers, inv.customerId, inv.customer, inv.customer)?.source || "Other";
}

export function invoiceTotalOf(inv: Invoice): number {
  const subtotal = inv.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  return subtotal + subtotal * ((inv.taxRate || 0) / 100);
}

export interface AttributionFilters {
  source?: LeadSource | "All";
  dateFrom?: string;
  dateTo?: string;
  employee?: string;
  jobType?: string;
  customerId?: string;
  wonLost?: "Won" | "Lost" | "All";
}

export interface AttributionRow {
  source: string;
  leads: number;
  estimatesSent: number;
  jobsWon: number;
  revenue: number;
  grossProfit: number;
  conversionRate: number;
  avgJobValue: number;
}

function inRange(date: string | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!date) return false;
  const d = date.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export interface AttributionSourceData {
  leads: Lead[];
  customers: Customer[];
  estimates: Estimate[];
  jobs: SchedulingEvent[];
  invoices: Invoice[];
  timeClockLogs: TimeClockLog[];
  employees: EmployeeRecord[];
  transactions: Transaction[];
  payrollWorkweekStart: number;
}

/**
 * One flat funnel row per real Job -- the shared unit every filter (source,
 * date, employee, job type, customer, won/lost) and every downstream
 * metric (revenue, profit) is computed from, so the numbers stay
 * consistent with each other no matter which filters are active.
 */
export interface JobFunnelRow {
  jobId: string;
  source: LeadSource;
  date: string;
  employee: string;
  jobType: string;
  customerId?: string;
  customerName: string;
  status: SchedulingEvent["status"];
  won: boolean;
  revenue: number;
  grossProfit: number;
}

export function buildJobFunnelRows(data: AttributionSourceData): JobFunnelRow[] {
  const { customers, estimates, jobs: allEvents, invoices, timeClockLogs, employees, transactions, payrollWorkweekStart } = data;
  const jobs = allEvents.filter(e => e.eventType === "Job");
  const lostEstimateIds = new Set(estimates.filter(e => e.status === "Declined").map(e => e.id));

  return jobs.map(job => {
    const jobInvoices = invoices.filter(inv => inv.jobId === job.id || inv.estimateId === job.sourceEstimateId);
    const revenue = jobInvoices.reduce((s, inv) => s + invoiceTotalOf(inv), 0);
    const costing = computeJobCosting(job, estimates, timeClockLogs, employees, transactions, payrollWorkweekStart);
    const won = !job.sourceEstimateId || !lostEstimateIds.has(job.sourceEstimateId);
    return {
      jobId: job.id,
      source: resolveJobSource(job, estimates, customers),
      date: job.date,
      employee: job.assignedEmployee || "Unassigned",
      jobType: job.jobType || "General",
      customerId: job.customerId,
      customerName: job.customer,
      status: job.status,
      won,
      revenue,
      grossProfit: costing.grossProfit
    };
  });
}

export function computeAttributionRows(data: AttributionSourceData, filters: AttributionFilters): AttributionRow[] {
  const { leads, customers, estimates } = data;

  const sourceOk = (s: LeadSource) => !filters.source || filters.source === "All" || s === filters.source;
  const custOk = (customerId: string | undefined, name: string | undefined, company?: string) => {
    if (!filters.customerId) return true;
    const cust = findCustomerFor(customers, customerId, name, company);
    return cust?.id === filters.customerId;
  };

  const filteredLeads = leads.filter(l => sourceOk(l.source) && inRange(l.dateAdded, filters.dateFrom, filters.dateTo) && custOk(undefined, l.name, l.company));

  const filteredEstimates = estimates.filter(e => {
    if (e.status === "Draft") return false; // "Estimates sent"
    if (!sourceOk(resolveEstimateSource(e, customers))) return false;
    if (!inRange(e.createdDate, filters.dateFrom, filters.dateTo)) return false;
    if (filters.employee && e.salesRep !== filters.employee) return false;
    if (!custOk(e.customerId, e.customerName, e.company)) return false;
    if (filters.wonLost === "Won" && e.status !== "Accepted") return false;
    if (filters.wonLost === "Lost" && e.status !== "Declined") return false;
    return true;
  });

  const funnelRows = buildJobFunnelRows(data).filter(row => {
    if (!sourceOk(row.source)) return false;
    if (!inRange(row.date, filters.dateFrom, filters.dateTo)) return false;
    if (filters.employee && row.employee !== filters.employee) return false;
    if (filters.jobType && row.jobType !== filters.jobType) return false;
    if (!custOk(row.customerId, row.customerName)) return false;
    if (filters.wonLost === "Won" && !row.won) return false;
    if (filters.wonLost === "Lost" && row.won) return false;
    return true;
  });

  const sourcesToShow = filters.source && filters.source !== "All" ? [filters.source] : ALL_LEAD_SOURCES;

  return sourcesToShow.map(source => {
    const leadCount = filteredLeads.filter(l => l.source === source).length;
    const estimatesSent = filteredEstimates.filter(e => resolveEstimateSource(e, customers) === source).length;
    const jobRows = funnelRows.filter(r => r.source === source);
    const jobsWon = jobRows.length;
    const revenue = jobRows.reduce((s, r) => s + r.revenue, 0);
    const grossProfit = jobRows.reduce((s, r) => s + r.grossProfit, 0);
    return {
      source,
      leads: leadCount,
      estimatesSent,
      jobsWon,
      revenue,
      grossProfit,
      conversionRate: leadCount > 0 ? (jobsWon / leadCount) * 100 : 0,
      avgJobValue: jobsWon > 0 ? revenue / jobsWon : 0
    };
  }).filter(row => row.leads || row.estimatesSent || row.jobsWon || row.revenue);
}
