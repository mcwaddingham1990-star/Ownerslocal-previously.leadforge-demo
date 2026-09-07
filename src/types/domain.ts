// Canonical domain types shared across the app. Previously these were each
// defined independently inside their "owning" page component (and, for
// DocumentItem/SchedulingEvent, duplicated with conflicting shapes in
// src/initialData.ts). Page components re-export from here so existing
// imports (e.g. `import { Customer } from "./components/CustomersPage"`)
// keep working.

export interface Customer {
  id: string;
  company: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  openJobs: number;
  outstandingBalance: number;
  lifetimeValue: number;
  status: "Potential" | "Active" | "Inactive" | "Past Due";
  type: "Residential" | "Commercial";
  isVIP: boolean;
  recentlyAdded: boolean;
  upcomingJobDate?: string;
  requireFollowUp?: boolean;
  pendingConfirmation?: boolean;
  createdFrom?: "schedule_job" | "create_job";
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  source:
    | "Google Business Profile"
    | "Website"
    | "Facebook"
    | "Instagram"
    | "Referral"
    | "Phone Call"
    | "Walk-In"
    | "Manual Entry"
    | "Other";
  salesRep: string;
  status:
    | "New"
    | "Contacted"
    | "Qualified"
    | "Estimate Sent"
    | "Follow-Up Needed"
    | "Won"
    | "Lost"
    | "Archived";
  estimatedValue: number;
  dateAdded: string;
  addedDaysAgo: number;
  address?: string;
  notes?: string;
}

export interface Estimate {
  id: string;
  number: string;
  customerName: string;
  company: string;
  status: "Draft" | "Pending" | "Sent" | "Viewed" | "Accepted" | "Declined" | "Expired" | "Completed";
  salesRep: string;
  amount: number;
  createdDate: string;
  expirationDate: string;
  notes?: string;
  address?: string;
  phone?: string;
  /** Free-text description of the actual work to be done -- separate from
   * the general scope-of-work `notes`, and specifically what gets pulled
   * into the generated PDF as the job-specifics section. */
  projectSpecifics?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  vendor: string;
  manufacturer: string;
  sku: string;
  barcode: string;
  qrCode: string;
  description: string;
  quantity: number;
  unit: string;
  minQuantity: number;
  maxQuantity: number;
  location: string;
  unitCost: number;
  sellingPrice: number;
  notes: string;
  photo: string;
  isFavorite: boolean;
  assignedVehicle?: string;
  assignedEmployee?: string;
  lastUpdated: string;
  customFields?: Array<{ key: string; value: string }>;
  quantityHistory: Array<{ date: string; type: string; amount: number; previous: number; current: number; notes: string }>;
  purchaseHistory: Array<{ date: string; vendor: string; amount: number; unitCost: number; total: number }>;
  usageHistory: Array<{ date: string; jobName: string; amount: number; employee: string }>;
}

export interface PurchaseRecord {
  id: string;
  vendor: string;
  receiptNumber: string;
  date: string;
  employee: string;
  itemsPurchased: string;
  totalCost: number;
}

export interface DocumentItem {
  id: string;
  name: string;
  customer: string;
  employee: string;
  vendor: string;
  job: string;
  type: string;
  // Top-level cabinet folder this document lives in (Company, Customers,
  // Leads, Jobs, Payroll, etc. -- see FOLDER_TAXONOMY in DocumentsPage).
  // Optional because documents created before this taxonomy existed don't
  // have one yet; DocumentsPage backfills a real inferred value for those.
  folder?: string;
  uploadedBy: string;
  date: string;
  size: string;
  status: "Signed" | "Unsigned" | "Pending" | "Archived" | "Draft" | "Awaiting Signature" | "Sent" | "Viewed" | "Declined" | "Expired";
  isFavorite: boolean;
  isArchived: boolean;
  notes: string;
  tags: string[];
  estimateId: string;
  invoiceId: string;
  receiptAmount?: number;
  lastModified: string;
  url?: string;
  metaObjects?: any[];
  // Real per-signing-event log (timestamp, signer name/role, device, IP
  // when available, SHA-256 hash) written by PDFEditor's eSign system —
  // see ESignLegalInfoModal for what each field means and why.
  auditTrail?: Array<{
    id: string;
    signerName: string;
    role: string;
    action: string;
    timestamp: string;
    ipAddress?: string;
    device?: string;
    documentVersion?: string;
    hash?: string;
  }>;
  signingOptions?: {
    signingOption?: "in_person" | "remote";
    enforceSigningOrder?: boolean;
    requireWitness?: boolean;
  };
}

/**
 * One real, timestamped revenue recognition — written by the Event
 * Engine's job-completion cascade (useEventEngineSubscribers) when a job
 * with a linked estimate is marked Completed. This is the only source of
 * truth for both the running revenue total and the dashboard revenue
 * graph — nothing here is ever synthesized or estimated.
 */
export interface RevenueEvent {
  id: string;
  date: string; // ISO timestamp, when the job was marked Completed
  amount: number;
  customer: string;
  jobId: string;
  estimateId: string;
}

/** A real employee record, written once at employee-onboarding completion (see handleCompleteEmployeeOnboarding in App.tsx). Doc id is the employee's email. */
export interface EmployeeRecord {
  id: string; // employee's email
  /** Firebase account id, used by authorized managers to update the employee's live access profile. */
  userUid?: string;
  email: string;
  firstName: string;
  lastName: string;
  address: string;
  phone: string;
  photo: string;
  goals: string;
  hourlyRate: number;
  role: string;
  /** The employee-specific, owner/manager-editable permissions inherited from their selected role. */
  granularPermissions?: import("./permissions").GranularPermissions;
  permissions?: string[];
  businessEmail: string;
  /** When enabled, this employee's clock in/out events are marked pending
   * until a manager reviews and approves them remotely -- never by an
   * owner/manager entering their own credentials on this employee's device. */
  requireTimeClockVerification?: boolean;
  /** Email of the specific owner/manager who should be notified to review
   * this employee's clock in/out events. When unset, every Owner/Manager-role
   * staff member for the business is notified and any one of them may act. */
  assignedManagerEmail?: string;
  createdAt: string;
}

/**
 * One real clock in/out/break event, written the moment it actually
 * happens — by the employee themselves (self clock-in/out) or by an
 * authorized manager via manual time entry. This is the only source of
 * truth for hours worked, overtime, and payroll on the Time Clock page;
 * nothing there is ever a running counter kept separately from this log.
 */
export interface TimeClockLog {
  id: string;
  employeeEmail: string;
  employeeName: string;
  type: "Clock In" | "Clock Out" | "Break Start" | "Break End";
  date: string; // YYYY-MM-DD, local to whoever logged it
  time: string; // e.g. "08:00 AM"
  timestamp: string; // ISO timestamp, real ordering/aggregation key
  gps: string;
  jobId?: string;
  jobTitle?: string;
  route?: string;
  vehicle?: string;
  approved?: boolean;
  /** Remote manager-approval workflow (see EmployeeRecord.requireTimeClockVerification).
   * "pending" means a manager must approve/reject this specific punch from
   * their own device before it's considered reviewed; absent means no
   * remote approval was required for this entry. */
  approvalStatus?: "pending" | "approved" | "rejected";
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  enteredManually?: boolean;
  verifiedBy?: string;
  verifierRole?: string;
}

/**
 * A single notification addressed to one specific user (recipientEmail),
 * shown in the sidebar Alert Center (App.tsx) and, when actionable is set,
 * carrying enough context (relatedLogId, etc.) to act on it directly from
 * the notification itself -- e.g. approving/rejecting a clock in/out without
 * navigating away. Firestore security rules restrict reads to the recipient.
 */
export interface AppNotification {
  id: string;
  businessId: string;
  recipientEmail: string;
  type: "time_clock_approval" | "general";
  title: string;
  description: string;
  time: string;
  isRead: boolean;
  icon?: string;
  screenId?: string;
  relatedLogId?: string;
  relatedCustomerId?: string;
  actionable?: boolean;
  actionedAt?: string;
  createdAt: string;
}

/**
 * One real income or expense record. Entered either by typing it in
 * directly or by scanning a photo (receipt/check) through real Gemini
 * vision OCR (see handleScanFinancialDocument) — manual entry is always
 * available and never blocked behind the scan path. Payroll runs also
 * write real expense transactions here, computed from real time_clock_logs
 * hours x real employee hourlyRate, never a fabricated number.
 */
export interface Transaction {
  id: string;
  type: "income" | "expense";
  source: "manual" | "ai_scan" | "payroll" | "invoice_payment";
  amount: number;
  description: string; // vendor/payer name, or a payroll period label
  category?: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp
  createdBy?: string; // real logged-in user's email
  inventoryItemId?: string; // links inventory purchases/adjustments to their expense entry
  /** Links a cash receipt to the invoice it paid so Revenue and Accounting share one economic event. */
  invoiceId?: string;
}

export interface SchedulingEvent {
  id: string;
  eventType: string; // Estimate, Consultation, Meeting, Job, Project Review, Site Visit, Follow-Up, Inspection, Delivery, Training, PTO, Vacation, Sick Day, Vehicle Maintenance, Equipment Maintenance, Inventory Delivery, Reminder, Task, Custom
  customType?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24-hour)
  endTime: string; // HH:MM (24-hour)
  customer: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  assignedEmployee: string;
  assignedCrew?: string;
  assignedVehicle?: string;
  estimatedDuration?: string;
  department?: string;
  location?: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  notes?: string;
  status: "Scheduled" | "Unassigned" | "Assigned" | "En Route" | "Arrived" | "Working" | "On Hold" | "Completed" | "Cancelled";
  /** Set when this job was created via Estimate->Job conversion (useDomainActions.approveEstimateToJob); lets the Event Engine's job-completion cascade find a real revenue amount instead of guessing. */
  sourceEstimateId?: string;
  /** Jobs use the scheduling record as their canonical Event Engine entity. */
  jobNumber?: string;
  title?: string;
  description?: string;
  customerId?: string;
  progress?: number;
  jobType?: string;
  tags?: string[];
  purchaseOrder?: string;
  budget?: number;
  laborRate?: number;
  checklist?: Array<{ id: string; label: string; completed: boolean; completedAt?: string; completedBy?: string }>;
  materials?: Array<{ inventoryId: string; name: string; quantity: number; unitCost: number }>;
  activity?: Array<{ id: string; timestamp: string; action: string; by: string; detail?: string }>;
  createdAt?: string;
  updatedAt?: string;
}
