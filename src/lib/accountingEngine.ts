import { JournalEntry, JournalEntryLine, Invoice, Bill, isBalancedEntry, accountIdForExpenseCategory } from "../types/accounting";
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

/** Bill created (vendor invoice received) -- real Accounts Payable. */
export function postBillCreatedEntry(bill: Bill, createdBy?: string): JournalEntry {
  const subtotal = bill.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  const expenseAccountId = accountIdForExpenseCategory(bill.category);
  return buildEntry(
    bill.issuedDate,
    `Bill ${bill.billNumber} - ${bill.vendor}`,
    "bill",
    bill.id,
    [
      { accountId: expenseAccountId, debit: subtotal, credit: 0 },
      { accountId: "acct_ap", debit: 0, credit: subtotal }
    ],
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
