import type { Invoice } from "../types/accounting";
import type { RevenueEvent, Transaction } from "../types/domain";

/**
 * A job completed from an estimate is counted once, as a revenue event, when
 * it's marked Completed. Paying that job's invoice later records an income
 * transaction too (linked by invoiceId), which is the same money -- adding
 * both would count the job twice. This returns the income transactions that
 * are payments on an invoice for a job (or estimate) already counted as a
 * revenue event, so Revenue totals can leave them out.
 *
 * Income not tied to a completed job (manual/scanned income, membership
 * billing, invoices with no job, jobs completed without an estimate) is
 * never excluded.
 */
export function incomeCountedAsJobRevenue(
  transactions: Transaction[],
  invoices: Invoice[],
  revenueEvents: RevenueEvent[]
): Set<string> {
  const countedJobs = new Set(revenueEvents.map(e => e.jobId).filter(Boolean));
  const countedEstimates = new Set(revenueEvents.map(e => e.estimateId).filter(Boolean));
  const invoicesById = new Map(invoices.map(inv => [inv.id, inv]));
  const ids = new Set<string>();
  for (const t of transactions) {
    if (t.type !== "income" || !t.invoiceId) continue;
    const inv = invoicesById.get(t.invoiceId);
    if (!inv) continue;
    if ((inv.jobId && countedJobs.has(inv.jobId)) || (inv.estimateId && countedEstimates.has(inv.estimateId))) ids.add(t.id);
  }
  return ids;
}

/** Income transactions that Revenue totals should add on top of revenue events. */
export function countableIncome(transactions: Transaction[], invoices: Invoice[], revenueEvents: RevenueEvent[]): Transaction[] {
  const skip = incomeCountedAsJobRevenue(transactions, invoices, revenueEvents);
  return transactions.filter(t => t.type === "income" && !skip.has(t.id));
}
