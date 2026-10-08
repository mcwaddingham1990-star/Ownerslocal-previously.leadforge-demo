import type { ReviewAutomationSettings, ReviewRequest } from "../types/reviewRequest";

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The one de-dup rule for review requests: one per job, or -- when there's
 * no job behind it -- one job-less request per customer. Shared by the
 * Event Engine's built-in review trigger and the "Request Review"
 * automation so neither can create a request the other already made.
 */
export function reviewRequestExists(requests: ReviewRequest[], target: { jobId?: string; customerId?: string }): boolean {
  return requests.some(r => target.jobId ? r.jobId === target.jobId : (r.customerId === target.customerId && !r.jobId));
}

/** Why an automatic review request can't be created for this target, or null when it can. */
export function reviewRequestBlockedReason(settings: ReviewAutomationSettings, target: { customerId?: string; excludedByJob?: boolean }): string | null {
  if (!settings.message.trim() || !settings.reviewLink.trim()) return "Set up your review message and link in Settings > Automate Reviews first.";
  if (target.excludedByJob) return "This job is excluded from review requests.";
  if (target.customerId && settings.excludedCustomerIds.includes(target.customerId)) return "This customer is excluded from review requests.";
  return null;
}

/** A "Scheduled" (ready to send) review request, exactly as the automated review trigger has always created it. */
export function buildScheduledReviewRequest(params: {
  trigger: "job_completed" | "invoice_paid";
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  jobId?: string;
  invoiceId?: string;
  createdBy: string;
  activityBy: string;
}, settings: ReviewAutomationSettings): ReviewRequest {
  const now = new Date().toISOString();
  return {
    id: uid("review"),
    customerId: params.customerId || "",
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    customerEmail: params.customerEmail,
    jobId: params.jobId,
    invoiceId: params.invoiceId,
    trigger: params.trigger,
    status: "Scheduled",
    message: settings.message,
    reviewLink: settings.reviewLink,
    createdAt: now,
    createdBy: params.createdBy,
    activity: [{ id: uid("act"), timestamp: now, action: `Auto-scheduled (${params.trigger === "job_completed" ? "job completed" : "invoice paid"})`, by: params.activityBy }]
  };
}
