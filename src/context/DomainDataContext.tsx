import { createContext, useContext, Dispatch, SetStateAction } from "react";
import { Customer, Lead, Estimate, InventoryItem, DocumentItem, SchedulingEvent, RevenueEvent, EmployeeRecord, TimeClockLog, Transaction } from "../types/domain";
import { Account, JournalEntry, Invoice, Bill, Vendor, BankAccount, RecurringTransaction, MileageLog, Budget, SalesTaxRate } from "../types/accounting";
import type { GeneratedPdfDraft, EstimatePrefill } from "../types/generatedPdf";

export interface RosterEntry {
  id?: string;
  name: string;
  role: string;
  code: string;
  status: string;
}

export interface DomainDataContextValue {
  customers: Customer[];
  setCustomers: Dispatch<SetStateAction<Customer[]>>;
  leads: Lead[];
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  estimates: Estimate[];
  setEstimates: Dispatch<SetStateAction<Estimate[]>>;
  schedulingEvents: SchedulingEvent[];
  setSchedulingEvents: Dispatch<SetStateAction<SchedulingEvent[]>>;
  inventoryList: InventoryItem[];
  setInventoryList: Dispatch<SetStateAction<InventoryItem[]>>;
  documents: DocumentItem[];
  setDocuments: Dispatch<SetStateAction<DocumentItem[]>>;
  recentRoster: RosterEntry[];
  setRecentRoster: Dispatch<SetStateAction<RosterEntry[]>>;
  bulletins: any[];
  setBulletins: Dispatch<SetStateAction<any[]>>;
  notifications: any[];
  setNotifications: Dispatch<SetStateAction<any[]>>;
  recentAiActions: any[];
  setRecentAiActions: Dispatch<SetStateAction<any[]>>;
  snapshots: any[];
  setSnapshots: Dispatch<SetStateAction<any[]>>;
  revenueEvents: RevenueEvent[];
  setRevenueEvents: Dispatch<SetStateAction<RevenueEvent[]>>;
  /** Derived sum of revenueEvents — provided so consumers don't each re-implement the reduce. */
  completedJobsRevenue: number;
  employees: EmployeeRecord[];
  setEmployees: Dispatch<SetStateAction<EmployeeRecord[]>>;
  /** Forces a fresh server read of employees, bypassing the realtime listener (see refreshTimeClockLogs). */
  refreshEmployees: () => Promise<void>;
  timeClockLogs: TimeClockLog[];
  setTimeClockLogs: Dispatch<SetStateAction<TimeClockLog[]>>;
  /** Forces a fresh server read of time clock logs — recovers a view stuck on stale data if the realtime listener died (Firestore listeners don't auto-retry after a permission/unavailable error). */
  refreshTimeClockLogs: () => Promise<void>;
  transactions: Transaction[];
  setTransactions: Dispatch<SetStateAction<Transaction[]>>;
  /** Atomically persists a transaction and its balanced journal entry. */
  saveTransaction: (transaction: Omit<Transaction, "id">) => Promise<void>;
  accounts: Account[];
  setAccounts: Dispatch<SetStateAction<Account[]>>;
  journalEntries: JournalEntry[];
  setJournalEntries: Dispatch<SetStateAction<JournalEntry[]>>;
  invoices: Invoice[];
  setInvoices: Dispatch<SetStateAction<Invoice[]>>;
  bills: Bill[];
  setBills: Dispatch<SetStateAction<Bill[]>>;
  vendors: Vendor[];
  setVendors: Dispatch<SetStateAction<Vendor[]>>;
  bankAccounts: BankAccount[];
  setBankAccounts: Dispatch<SetStateAction<BankAccount[]>>;
  recurringTransactions: RecurringTransaction[];
  setRecurringTransactions: Dispatch<SetStateAction<RecurringTransaction[]>>;
  mileageLogs: MileageLog[];
  setMileageLogs: Dispatch<SetStateAction<MileageLog[]>>;
  budgets: Budget[];
  setBudgets: Dispatch<SetStateAction<Budget[]>>;
  salesTaxRates: SalesTaxRate[];
  setSalesTaxRates: Dispatch<SetStateAction<SalesTaxRate[]>>;
  preSelectedDate: string | undefined;
  setPreSelectedDate: Dispatch<SetStateAction<string | undefined>>;
  preSelectedCustomerId: string | undefined;
  setPreSelectedCustomerId: Dispatch<SetStateAction<string | undefined>>;
  generatedPdfDraft: GeneratedPdfDraft | null;
  setGeneratedPdfDraft: Dispatch<SetStateAction<GeneratedPdfDraft | null>>;
  /** Queued "open the Estimate form pre-filled with this info" request (e.g. from a Lead's "Build Estimate" button) -- consumed by EstimatesPage to open its Add Estimate modal pre-populated, then cleared. */
  estimatePrefill: EstimatePrefill | null;
  setEstimatePrefill: Dispatch<SetStateAction<EstimatePrefill | null>>;
  /** Queued "Collect Signatures" request (e.g. from a customer card) -- consumed by DocumentsPage to open the PDF Editor straight to its file picker, ready to capture signatures on whatever real document gets opened. */
  pendingSignatureCapture: { customerName?: string; customerPhone?: string; customerEmail?: string } | null;
  setPendingSignatureCapture: Dispatch<SetStateAction<{ customerName?: string; customerPhone?: string; customerEmail?: string } | null>>;
  /** Real business profile (Settings -> Business Info), used to head every generated PDF and to place the HQ pin on the map. First location only -- multi-location businesses print/pin their primary address. */
  businessProfile: { name: string; phone: string; address: string; email: string; logo: string };
  /** The real, persisted global AI on/off + mode -- Owner Console's Pause/Resume AI button and the AI Assistant/Settings dropdowns all read and write this same value. */
  globalAiSetting: "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO";
  setGlobalAiSetting: Dispatch<SetStateAction<"OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO">>;
  /** Real, persisted "what your assistant knows" settings (tone, creativity, style notes) fed into every AI request's prompt. */
  aiKnowledgeBase: { selectedKBDoc: string; creativityLevel: number; aiTone: string; styleNotes: string };
  setAiKnowledgeBase: Dispatch<SetStateAction<{ selectedKBDoc: string; creativityLevel: number; aiTone: string; styleNotes: string }>>;
}

export const DomainDataContext = createContext<DomainDataContextValue | undefined>(undefined);

/**
 * The 12 Firestore-backed business collections (customers, leads, estimates,
 * scheduling events, inventory, documents, roster, bulletins, notifications,
 * recent AI actions, snapshots, revenue events) plus the handful of
 * cross-page scalars that travel with them. Page components should use this
 * instead of taking each collection as a pair of props.
 */
export function useDomainData(): DomainDataContextValue {
  const ctx = useContext(DomainDataContext);
  if (!ctx) {
    throw new Error("useDomainData must be used within a DomainDataContext.Provider");
  }
  return ctx;
}
