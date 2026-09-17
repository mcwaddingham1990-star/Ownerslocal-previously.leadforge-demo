/**
 * One shared Automated Review Request system -- a request is created once
 * per completed Job (or, for a request with no Job behind it, once per
 * Customer) and re-used for every send/resend rather than creating a new
 * record each time, which is what actually keeps "never duplicate an
 * automated request for the same job" true no matter how many times a
 * trigger condition re-fires.
 */

export type ReviewRequestTrigger = "job_completed" | "invoice_paid" | "days_after_completion" | "manual";
export type ReviewRequestStatus = "Not Sent" | "Scheduled" | "Sent" | "Opened" | "Completed" | "Canceled";
export type ReviewRequestChannel = "sms" | "email";

export interface ReviewRequest {
  id: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  /** The completed Job this request is for, when there is one -- the real
   * de-dup key: automated creation checks for an existing, non-Canceled
   * request with this jobId before ever creating a new one. */
  jobId?: string;
  invoiceId?: string;
  trigger: ReviewRequestTrigger;
  /** Set for a "days_after_completion" request once the scheduler has
   * picked a fire date, or immediately for job_completed/invoice_paid. */
  scheduledFor?: string;
  status: ReviewRequestStatus;
  message: string;
  reviewLink: string;
  channel?: ReviewRequestChannel;
  sentAt?: string;
  sendCount?: number;
  completedAt?: string;
  canceledAt?: string;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
  activity?: Array<{ id: string; timestamp: string; action: string; by: string }>;
}

export interface ReviewAutomationSettings {
  enabled: boolean;
  trigger: ReviewRequestTrigger;
  /** Only used when trigger is "days_after_completion". */
  daysAfterCompletion: number;
  message: string;
  reviewLink: string;
  excludedCustomerIds: string[];
}

export const DEFAULT_REVIEW_AUTOMATION_SETTINGS: ReviewAutomationSettings = {
  enabled: false,
  trigger: "manual",
  daysAfterCompletion: 3,
  message: "",
  reviewLink: "",
  excludedCustomerIds: []
};
