// Real bookkeeping/accounting data model. Every screen in AccountingPage
// reads from these collections (or derives numbers from JournalEntry lines)
// -- nothing here is a hand-typed report number. The Event Engine posts a
// real, balanced JournalEntry for every financial event (invoice created,
// invoice paid, bill paid, expense logged, payroll run, refund, etc.), and
// the P&L/Balance Sheet/Cash Flow/Aging reports are all just different
// slices of that same real ledger.

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface Account {
  id: string;
  code: string; // standard-ish numbering: 1000s asset, 2000s liability, 3000s equity, 4000s revenue, 5000s+ expense
  name: string;
  type: AccountType;
  subtype: string; // e.g. "Current Asset", "Fixed Asset", "Current Liability", "Cost of Goods Sold", "Operating Expense"
  // Seeded default accounts the app's own event-posting logic depends on
  // existing -- an owner can still add unlimited custom accounts, but the
  // UI won't let system accounts be deleted (renaming is fine).
  isSystemAccount: boolean;
  description?: string;
  createdAt: string;
}

export interface JournalEntryLine {
  accountId: string;
  debit: number; // 0 if this line is a credit
  credit: number; // 0 if this line is a debit
  memo?: string;
}

export type JournalEntrySource =
  | "invoice"
  | "invoice_payment"
  | "bill"
  | "bill_payment"
  | "expense"
  | "income"
  | "job_completion"
  | "payroll"
  | "refund"
  | "inventory_purchase"
  | "manual"
  | "opening_balance";

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  memo: string;
  source: JournalEntrySource;
  sourceId?: string; // id of the Invoice/Bill/Transaction/etc. this was posted from
  lines: JournalEntryLine[];
  createdAt: string;
  createdBy?: string;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customer: string;
  jobId?: string;
  estimateId?: string;
  lineItems: InvoiceLineItem[];
  taxRate: number; // percent
  issuedDate: string;
  dueDate: string;
  status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void";
  amountPaid: number;
  notes?: string;
  createdAt: string;
  createdBy?: string;
}

export interface Bill {
  id: string;
  billNumber: string;
  vendor: string;
  lineItems: InvoiceLineItem[];
  category: string;
  issuedDate: string;
  dueDate: string;
  status: "unpaid" | "partial" | "paid" | "overdue" | "void";
  amountPaid: number;
  notes?: string;
  createdAt: string;
  createdBy?: string;
  /** Simplified Owners Local bill fields. Legacy lineItems remain for ledger compatibility. */
  serviceProviderId?: string;
  serviceProvided?: string;
  estimatedCost?: number;
  totalCost?: number;
  recurring?: boolean;
  recurringDate?: string;
  history?: Array<{
    id: string;
    date: string;
    action: string;
    amount?: number;
    note?: string;
  }>;
}

export interface Vendor {
  id: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  address?: string;
  category?: string;
  notes?: string;
  createdAt: string;
}

export type BankAccountType = "checking" | "savings" | "credit_card" | "loan" | "line_of_credit" | "merchant_account";

export interface BankAccount {
  id: string;
  name: string;
  type: BankAccountType;
  accountNumberLast4?: string;
  openingBalance: number;
  openingBalanceDate: string;
  linkedAccountId?: string; // Chart of Accounts account this rolls up into
  isPlaidConnected: boolean;
  plaidAccountId?: string;
  plaidItemId?: string;
  plaidInstitutionName?: string;
  createdAt: string;
}

export interface RecurringTransaction {
  id: string;
  type: "invoice" | "bill";
  templateName: string;
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  nextRunDate: string; // YYYY-MM-DD
  active: boolean;
  // The fields needed to generate a new Invoice or Bill when this runs --
  // shape mirrors Omit<Invoice|Bill, "id"|"invoiceNumber"|"billNumber"|
  // "issuedDate"|"dueDate"|"status"|"amountPaid"|"createdAt">.
  payload: {
    customerOrVendor: string;
    lineItems: InvoiceLineItem[];
    taxRate?: number;
    category?: string;
    dueInDays: number;
    notes?: string;
  };
  createdAt: string;
}

export interface MileageLog {
  id: string;
  employeeEmail: string;
  date: string;
  startLocation: string;
  endLocation: string;
  miles: number;
  purpose: string;
  rateApplied: number; // dollars per mile at time of entry (IRS standard rate or custom)
  amount: number; // miles * rateApplied
  jobId?: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  accountId: string;
  period: string; // "2026-07" for a monthly budget, "2026" for annual
  amount: number;
}

export interface SalesTaxRate {
  id: string;
  name: string;
  rate: number; // percent
  isDefault: boolean;
}

/** True only if the entry's debits and credits actually balance -- the one hard rule of double-entry bookkeeping. */
export function isBalancedEntry(lines: JournalEntryLine[]): boolean {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return Math.abs(totalDebit - totalCredit) < 0.005;
}

/** Real account balance -- always derived from every posted journal line, never a separately-tracked number that can drift. */
export function computeAccountBalance(account: Account, entries: JournalEntry[]): number {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.accountId !== account.id) continue;
      debitTotal += line.debit;
      creditTotal += line.credit;
    }
  }
  // Assets & Expenses normally increase with debits; Liabilities, Equity &
  // Revenue normally increase with credits.
  const debitNormal = account.type === "asset" || account.type === "expense";
  return debitNormal ? debitTotal - creditTotal : creditTotal - debitTotal;
}

/** The standard chart of accounts every account seeds with -- covers everything the app's own event-posting logic writes to. */
export const DEFAULT_CHART_OF_ACCOUNTS: Array<Omit<Account, "createdAt">> = [
  { id: "acct_cash", code: "1000", name: "Cash & Bank Accounts", type: "asset", subtype: "Current Asset", isSystemAccount: true },
  { id: "acct_ar", code: "1100", name: "Accounts Receivable", type: "asset", subtype: "Current Asset", isSystemAccount: true },
  { id: "acct_inventory", code: "1200", name: "Inventory Asset", type: "asset", subtype: "Current Asset", isSystemAccount: true },
  { id: "acct_ap", code: "2000", name: "Accounts Payable", type: "liability", subtype: "Current Liability", isSystemAccount: true },
  { id: "acct_sales_tax_payable", code: "2100", name: "Sales Tax Payable", type: "liability", subtype: "Current Liability", isSystemAccount: true },
  { id: "acct_owner_equity", code: "3000", name: "Owner's Equity", type: "equity", subtype: "Equity", isSystemAccount: true },
  { id: "acct_retained_earnings", code: "3900", name: "Retained Earnings", type: "equity", subtype: "Equity", isSystemAccount: true },
  { id: "acct_service_revenue", code: "4000", name: "Service Revenue", type: "revenue", subtype: "Operating Revenue", isSystemAccount: true },
  { id: "acct_other_income", code: "4900", name: "Other Income", type: "revenue", subtype: "Other Revenue", isSystemAccount: true },
  { id: "acct_refunds", code: "4800", name: "Sales Refunds & Allowances", type: "revenue", subtype: "Contra-Revenue", isSystemAccount: true },
  { id: "acct_cogs_materials", code: "5000", name: "Cost of Goods Sold - Materials", type: "expense", subtype: "Cost of Goods Sold", isSystemAccount: true },
  { id: "acct_payroll_expense", code: "6000", name: "Payroll & Labor Expense", type: "expense", subtype: "Operating Expense", isSystemAccount: true },
  { id: "acct_fuel_expense", code: "6100", name: "Fuel Expense", type: "expense", subtype: "Operating Expense", isSystemAccount: true },
  { id: "acct_vehicle_expense", code: "6200", name: "Vehicle Maintenance Expense", type: "expense", subtype: "Operating Expense", isSystemAccount: true },
  { id: "acct_office_expense", code: "6300", name: "Office Supplies Expense", type: "expense", subtype: "Operating Expense", isSystemAccount: true },
  { id: "acct_marketing_expense", code: "6400", name: "Advertising & Marketing Expense", type: "expense", subtype: "Operating Expense", isSystemAccount: true },
  { id: "acct_utilities_expense", code: "6500", name: "Utilities Expense", type: "expense", subtype: "Operating Expense", isSystemAccount: true },
  { id: "acct_insurance_expense", code: "6600", name: "Insurance Expense", type: "expense", subtype: "Operating Expense", isSystemAccount: true },
  { id: "acct_other_expense", code: "6900", name: "Other Operating Expense", type: "expense", subtype: "Operating Expense", isSystemAccount: true }
];

/** Maps the existing Transaction expense `category` strings (LogTransactionModal) onto a real Chart of Accounts account. */
export function accountIdForExpenseCategory(category: string | undefined): string {
  switch (category) {
    case "Materials": return "acct_cogs_materials";
    case "Fuel": return "acct_fuel_expense";
    case "Vehicle Maintenance": return "acct_vehicle_expense";
    case "Office Supplies": return "acct_office_expense";
    case "Marketing": return "acct_marketing_expense";
    case "Utilities": return "acct_utilities_expense";
    case "Insurance": return "acct_insurance_expense";
    case "Payroll": return "acct_payroll_expense";
    default: return "acct_other_expense";
  }
}
