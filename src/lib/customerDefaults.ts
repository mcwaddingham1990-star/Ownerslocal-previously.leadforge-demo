import type { Customer } from "../types/domain";

/**
 * The one real shape a newly-created Customer record has -- id, contact
 * info, and the numeric/boolean defaults every fresh customer starts at
 * (0 balance, not VIP, freshly added) -- regardless of which of the several
 * "add a customer" flows created it (a converted Lead, an estimate's
 * auto-created Potential customer, quick-adding one while building a job
 * or scheduling a calendar event, a job's own customer sync, or AI document
 * intake). Previously each of those hand-coded this object literal
 * separately, so the shape could (and did) drift between them. Callers
 * still resolve their own business-specific fallbacks (e.g. what to use
 * for `company` when none was given) before calling this.
 */
export function buildNewCustomerRecord(input: {
  name: string;
  company: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: Customer["status"];
  openJobs?: number;
  lifetimeValue?: number;
  source?: Customer["source"];
  sourceLeadId?: string;
  createdFrom?: Customer["createdFrom"];
  /** Flags this record as a quick-add made in passing (while building a
   * job, scheduling an event, etc.) that still needs a human to open it
   * and confirm the details -- sets pendingConfirmation + requireFollowUp. */
  pendingConfirmation?: boolean;
}): Customer {
  return {
    id: "cust_" + Math.random().toString(36).substring(2, 9),
    company: input.company,
    contact: input.name,
    phone: input.phone || "",
    email: input.email || "",
    address: input.address || "",
    openJobs: input.openJobs ?? 0,
    outstandingBalance: 0,
    lifetimeValue: input.lifetimeValue ?? 0,
    status: input.status || "Active",
    type: "Residential",
    isVIP: false,
    recentlyAdded: true,
    source: input.source,
    sourceLeadId: input.sourceLeadId,
    createdFrom: input.createdFrom,
    ...(input.pendingConfirmation ? { pendingConfirmation: true, requireFollowUp: false } : {})
  };
}
