import { Account, AccountType, JournalEntry, JournalEntryLine, Invoice, Bill, computeAccountBalance, isBalancedEntry, accountIdForExpenseCategory } from "../types/accounting";
import { Transaction } from "../types/domain";

function generateEntryId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildEntry(
  date: string,
  memo: string,
  source: JournalEntry["source"],
  sourceId: string | undefined,
  lines: JournalEntryLine[],
  createdBy?: string
): JournalEntry {
  if (!isBalancedEntry(lines)) {
    // A bug in one of the builders below, not a user-facing state — every
    // builder in this file is hand-verified to balance. Fail loudly in dev
    // rather than silently posting a broken ledger entry.
    throw new Error(`Unbalanced journal entry attempted: ${memo}`);
  }
  return {
    id: generateEntryId("je"),
    date,
    memo,
    source,
    sourceId,
    lines,
    createdAt: new Date().toISOString(),
    createdBy
  };
}

/** A manually-logged or scanned income/expense Transaction (LogTransactionModal, Run Payroll) posts as real cash movement. */
export function postTransactionEntry(txn: Transaction): JournalEntry {
  if (txn.type === "income") {
    return buildEntry(
      txn.date,
      `Income: ${txn.description}`,
      "income",
      txn.id,
      [
        { accountId: "acct_cash", debit: txn.amount, credit: 0 },
        { accountId: "acct_service_revenue", debit: 0, credit: txn.amount }
      ],
      txn.createdBy
    );
  }
  const expenseAccountId = accountIdForExpenseCategory(txn.category);
  return buildEntry(
    txn.date,
    `Expense: ${txn.description}`,
    txn.source === "payroll" ? "payroll" : "expense",
    txn.id,
    [
      { accountId: expenseAccountId, debit: txn.amount, credit: 0 },
      { accountId: "acct_cash", debit: 0, credit: txn.amount }
    ],
    txn.createdBy
  );
}

/** Revenue recognized when an estimate-backed job is completed before invoicing. */
export function postJobCompletionRevenueEntry(params: {
  id: string;
  date: string;
  amount: number;
  customer: string;
}, createdBy?: string): JournalEntry {
  return buildEntry(
    params.date.slice(0, 10),
    `Job completed - ${params.customer}`,
    "job_completion",
    params.id,
    [
      { accountId: "acct_ar", debit: params.amount, credit: 0 },
      { accountId: "acct_service_revenue", debit: 0, credit: params.amount }
    ],
    createdBy
  );
}

function invoiceTotal(invoice: Invoice): number {
  const subtotal = invoice.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  return subtotal + subtotal * (invoice.taxRate / 100);
}

/** Invoice created -- real Accounts Receivable + revenue recognition (accrual basis, same as QuickBooks' default). */
export function postInvoiceCreatedEntry(invoice: Invoice, createdBy?: string): JournalEntry {
  const subtotal = invoice.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  const tax = subtotal * (invoice.taxRate / 100);
  const lines: JournalEntryLine[] = [{ accountId: "acct_ar", debit: subtotal + tax, credit: 0 }, { accountId: "acct_service_revenue", debit: 0, credit: subtotal }];
  if (tax > 0) lines.push({ accountId: "acct_sales_tax_payable", debit: 0, credit: tax });
  return buildEntry(invoice.issuedDate, `Invoice ${invoice.invoiceNumber} - ${invoice.customer}`, "invoice", invoice.id, lines, createdBy);
}

/** A payment received against an open invoice -- moves the balance from AR into Cash, no new revenue (already recognized at creation). */
export function postInvoicePaymentEntry(invoice: Invoice, paymentAmount: number, createdBy?: string): JournalEntry {
  return buildEntry(
    new Date().toISOString().slice(0, 10),
    `Payment received: Invoice ${invoice.invoiceNumber} - ${invoice.customer}`,
    "invoice_payment",
    invoice.id,
    [
      { accountId: "acct_cash", debit: paymentAmount, credit: 0 },
      { accountId: "acct_ar", debit: 0, credit: paymentAmount }
    ],
    createdBy
  );
}

/**
 * Bill created (vendor invoice received) -- real Accounts Payable.
 *
 * `inventoryPortion` is the slice of the bill's subtotal that's for real
 * Inventory items (a received Purchase Order line linked to an Inventory
 * item) rather than a one-off expense. That slice debits Inventory instead
 * of an Expense account -- Inventory's own asset value already went up the
 * moment those items were received (see AccountingPage's inventoryAssetValue,
 * computed live from Inventory, not from journal entries), so debiting an
 * Expense account for the same purchase would count it as money spent AND
 * stock on hand at the same time. Defaults to 0 (the whole bill is a normal
 * expense), so every existing caller is unaffected.
 */
export function postBillCreatedEntry(bill: Bill, createdBy?: string, inventoryPortion = 0): JournalEntry {
  const subtotal = bill.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  const cleanInventoryPortion = Math.min(Math.max(0, inventoryPortion), subtotal);
  const expensePortion = subtotal - cleanInventoryPortion;
  // Bills always carry the literal category "Bills" (BillsTab never lets a
  // bill be tagged with one of the finer Transaction categories), so routing
  // through accountIdForExpenseCategory would always fall through to
  // "Other Operating Expense" -- silently merging every bill's dollars into
  // the same bucket as miscellaneous logged expenses. A dedicated account
  // keeps bills their own real ledger category, matching how every screen
  // already displays them as a category distinct from "Other".
  const expenseAccountId = "acct_bills_expense";
  const lines: JournalEntryLine[] = [];
  if (expensePortion > 0) lines.push({ accountId: expenseAccountId, debit: expensePortion, credit: 0 });
  if (cleanInventoryPortion > 0) lines.push({ accountId: "acct_inventory", debit: cleanInventoryPortion, credit: 0 });
  lines.push({ accountId: "acct_ap", debit: 0, credit: subtotal });
  return buildEntry(
    bill.issuedDate,
    `Bill ${bill.billNumber} - ${bill.vendor}`,
    "bill",
    bill.id,
    lines,
    createdBy
  );
}

/** Paying down an open bill -- moves the balance from AP out of Cash. */
export function postBillPaymentEntry(bill: Bill, paymentAmount: number, createdBy?: string): JournalEntry {
  return buildEntry(
    new Date().toISOString().slice(0, 10),
    `Bill payment: ${bill.billNumber} - ${bill.vendor}`,
    "bill_payment",
    bill.id,
    [
      { accountId: "acct_ap", debit: paymentAmount, credit: 0 },
      { accountId: "acct_cash", debit: 0, credit: paymentAmount }
    ],
    createdBy
  );
}

/** A refund paid out to a customer -- reduces net revenue via a dedicated contra-revenue account, real cash leaves the business. */
export function postRefundEntry(date: string, amount: number, memo: string, sourceId?: string, createdBy?: string): JournalEntry {
  return buildEntry(
    date,
    memo,
    "refund",
    sourceId,
    [
      { accountId: "acct_refunds", debit: amount, credit: 0 },
      { accountId: "acct_cash", debit: 0, credit: amount }
    ],
    createdBy
  );
}

export { invoiceTotal };

/**
 * ---------------------------------------------------------------------
 * Canonical ledger selectors.
 *
 * Every financial screen (Dashboard, Revenue, Accounting & Bookkeeping's
 * Reports tab, the Payments/Expenses statement tables, CSV exports) is
 * meant to read its numbers through these functions instead of separately
 * re-deriving totals from raw transactions/bills/revenueEvents arrays --
 * that's what let the same dollar get bucketed differently (or double-
 * counted) on different screens in the first place. A journal entry line
 * belongs to exactly one account, so grouping by account can never overlap
 * the way matching against free-text category strings could.
 * ---------------------------------------------------------------------
 */

/** One account's net movement from journal lines posted within [start, end) -- omit either bound for an open-ended range, omit both for the account's real all-time balance (equivalent to computeAccountBalance). */
export function accountMovementInRange(accountId: string, accountType: AccountType, entries: JournalEntry[], start?: Date, end?: Date): number {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const entry of entries) {
    if (start || end) {
      const d = new Date(entry.date);
      if (Number.isNaN(d.getTime())) continue;
      if (start && d < start) continue;
      if (end && d >= end) continue;
    }
    for (const line of entry.lines) {
      if (line.accountId !== accountId) continue;
      debitTotal += line.debit;
      creditTotal += line.credit;
    }
  }
  const debitNormal = accountType === "asset" || accountType === "expense";
  return debitNormal ? debitTotal - creditTotal : creditTotal - debitTotal;
}

/**
 * Every account's real all-time balance, in one map keyed by account id --
 * the same inputs (accounts, journalEntries, plus the two backfills below)
 * from any screen always produce the identical map, which is the whole
 * point: Dashboard, Revenue, and Accounting all call this instead of each
 * hand-rolling their own version of the same loop.
 *
 * `inventoryAssetValue`, when passed, overrides acct_inventory with the
 * live valuation (quantity * unitCost across the real Inventory list)
 * instead of only what's been posted through bill receiving -- inventory
 * value can change without a new journal entry (a manual count adjustment,
 * for instance), so the live number is the more truthful one to show.
 *
 * `revenueEvents`, when passed, backfills AR/Service Revenue for any
 * job-completion revenue event written before this app's version started
 * posting a matching journal entry for it (identified by no journal entry
 * carrying that event's id as sourceId) -- purely additive, never touches
 * an existing entry or deletes anything.
 */
export function computeAccountBalances(params: {
  accounts: Account[];
  journalEntries: JournalEntry[];
  revenueEvents?: Array<{ id: string; amount: number }>;
  inventoryAssetValue?: number;
}): Record<string, number> {
  const { accounts, journalEntries, revenueEvents = [], inventoryAssetValue } = params;
  const map: Record<string, number> = {};
  for (const acct of accounts) map[acct.id] = computeAccountBalance(acct, journalEntries);
  if (inventoryAssetValue !== undefined && accounts.some(a => a.id === "acct_inventory")) {
    map["acct_inventory"] = inventoryAssetValue;
  }
  const postedSourceIds = new Set(journalEntries.map(entry => entry.sourceId).filter(Boolean));
  const legacyUnpostedRevenue = revenueEvents
    .filter(event => !postedSourceIds.has(event.id))
    .reduce((sum, event) => sum + event.amount, 0);
  if (legacyUnpostedRevenue !== 0) {
    map["acct_ar"] = (map["acct_ar"] || 0) + legacyUnpostedRevenue;
    map["acct_service_revenue"] = (map["acct_service_revenue"] || 0) + legacyUnpostedRevenue;
  }
  return map;
}

export interface LedgerTotals {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

/** The P&L/Balance Sheet headline numbers every screen's summary tiles show -- always derived from the same account-balance map, never summed a second, slightly-different way per screen. */
export function computeLedgerTotals(accounts: Account[], accountBalances: Record<string, number>): LedgerTotals {
  const sumType = (t: AccountType) => accounts.filter(a => a.type === t).reduce((s, a) => s + (accountBalances[a.id] || 0), 0);
  const totalRevenue = sumType("revenue");
  const totalExpenses = sumType("expense");
  const netIncome = totalRevenue - totalExpenses;
  return {
    totalRevenue,
    totalExpenses,
    netIncome,
    totalAssets: sumType("asset"),
    totalLiabilities: sumType("liability"),
    totalEquity: sumType("equity") + netIncome
  };
}

/** Same headline numbers as computeLedgerTotals, but scoped to a date range (a chart bucket, a filter period) instead of all-time -- built from the same account movements, so a period total and the all-time balance can never disagree about which account a dollar belongs to. Deliberately doesn't apply the inventory/legacy-revenue backfills above (those are point-in-time balance corrections, not period movements). */
export function computeLedgerTotalsInRange(accounts: Account[], journalEntries: JournalEntry[], start?: Date, end?: Date): LedgerTotals {
  const sumType = (t: AccountType) => accounts.filter(a => a.type === t).reduce((s, a) => s + accountMovementInRange(a.id, a.type, journalEntries, start, end), 0);
  const totalRevenue = sumType("revenue");
  const totalExpenses = sumType("expense");
  const netIncome = totalRevenue - totalExpenses;
  return {
    totalRevenue,
    totalExpenses,
    netIncome,
    totalAssets: sumType("asset"),
    totalLiabilities: sumType("liability"),
    totalEquity: sumType("equity") + netIncome
  };
}

export interface LedgerCategoryTotal {
  accountId: string;
  name: string;
  total: number;
}

/** Every expense account's movement within an optional date range, one row per account, zero-and-negative rows dropped -- the single breakdown every "Expenses by Category" widget (Dashboard pie, Revenue statement table, Accounting Reports tab) should render instead of each re-matching category strings its own way. */
export function expenseBreakdownByAccount(accounts: Account[], entries: JournalEntry[], start?: Date, end?: Date): LedgerCategoryTotal[] {
  return accounts
    .filter(a => a.type === "expense")
    .map(a => ({ accountId: a.id, name: a.name, total: accountMovementInRange(a.id, a.type, entries, start, end) }))
    .filter(c => c.total > 0.005)
    .sort((a, b) => b.total - a.total);
}

/** Revenue-account counterpart to expenseBreakdownByAccount -- includes the contra-revenue Refunds account, so a period with refunds nets them out of the breakdown exactly as it already does in the all-time ledger balance. */
export function revenueBreakdownByAccount(accounts: Account[], entries: JournalEntry[], start?: Date, end?: Date): LedgerCategoryTotal[] {
  return accounts
    .filter(a => a.type === "revenue")
    .map(a => ({ accountId: a.id, name: a.name, total: accountMovementInRange(a.id, a.type, entries, start, end) }))
    .filter(c => Math.abs(c.total) > 0.005)
    .sort((a, b) => b.total - a.total);
}

export interface LedgerLineItem {
  id: string;
  date: string;
  memo: string;
  amount: number;
}

/** Every individual journal-entry line posted to one account, as statement-table rows -- the ledger-accurate replacement for filtering raw transactions/bills by a category string (which is what let the same record get listed under two different category rows). Each entry contributes at most one row per account, since a balanced entry never posts two lines to the same account. */
export function ledgerItemsForAccount(accountId: string, accountType: AccountType, entries: JournalEntry[], start?: Date, end?: Date): LedgerLineItem[] {
  const debitNormal = accountType === "asset" || accountType === "expense";
  const items: LedgerLineItem[] = [];
  for (const entry of entries) {
    if (start || end) {
      const d = new Date(entry.date);
      if (Number.isNaN(d.getTime())) continue;
      if (start && d < start) continue;
      if (end && d >= end) continue;
    }
    for (const line of entry.lines) {
      if (line.accountId !== accountId) continue;
      const amount = debitNormal ? line.debit - line.credit : line.credit - line.debit;
      if (Math.abs(amount) <= 0.005) continue;
      items.push({ id: entry.id, date: entry.date, memo: entry.memo, amount });
    }
  }
  return items;
}
