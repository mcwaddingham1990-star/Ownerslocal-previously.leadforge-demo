import { useEffect } from "react";
import { onCollectionEvent, CollectionEvent } from "../lib/eventBus";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { SchedulingEvent, Estimate } from "../types/domain";
import type { Invoice } from "../types/accounting";
import type { ReviewRequest } from "../types/reviewRequest";
import { postJobCompletionRevenueEntry } from "../lib/accountingEngine";

function generateRevenueEventId(): string {
  return `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Registers the Event Engine's cascade rules. Every collection already
 * auto-emits create/update/delete via useFirestoreCollection, so adding a
 * new cascade later is just another onCollectionEvent subscription here —
 * no other file needs to change.
 */
export function useEventEngineSubscribers(): void {
  const { estimates, customers, schedulingEvents, setSchedulingEvents, setCustomers, setRevenueEvents, setJournalEntries, reviewAutomationSettings, setReviewRequests } = useDomainData();
  const { logOperationalEvent, triggerNotification } = useNavTelemetry();

  /**
   * Automated Review Requests -- shared by the job-completion and
   * invoice-paid cascades below. Creates the ONE ReviewRequest record for
   * this job (or this customer, when there's no job) the first time an
   * enabled trigger fires for it; a request that already exists (any
   * status, including a prior automated one) is left alone so an
   * automated trigger can never duplicate it -- only a manual "Send Review
   * Request" click resends an existing record.
   */
  const maybeCreateAutomatedReviewRequest = (params: {
    trigger: "job_completed" | "invoice_paid";
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    jobId?: string;
    invoiceId?: string;
    excludedByJob?: boolean;
  }) => {
    if (!reviewAutomationSettings.enabled || reviewAutomationSettings.trigger !== params.trigger) return;
    if (!reviewAutomationSettings.message.trim() || !reviewAutomationSettings.reviewLink.trim()) return;
    if (params.excludedByJob) return;
    if (params.customerId && reviewAutomationSettings.excludedCustomerIds.includes(params.customerId)) return;

    const now = new Date().toISOString();
    const request: ReviewRequest = {
      id: uid("review"),
      customerId: params.customerId || "",
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerEmail: params.customerEmail,
      jobId: params.jobId,
      invoiceId: params.invoiceId,
      trigger: params.trigger,
      status: "Scheduled",
      message: reviewAutomationSettings.message,
      reviewLink: reviewAutomationSettings.reviewLink,
      createdAt: now,
      createdBy: "Automated Review Requests",
      activity: [{ id: uid("act"), timestamp: now, action: `Auto-scheduled (${params.trigger === "job_completed" ? "job completed" : "invoice paid"})`, by: "Event Engine" }]
    };
    // De-dup check lives INSIDE the updater (always sees the very latest
    // state, not whatever `reviewRequests` this closure was created with)
    // so two near-simultaneous cascade firings for the same job can never
    // both pass the check and both insert -- this is the same pattern the
    // revenue-recognition cascade above already uses for the same reason.
    let created = false;
    setReviewRequests(prev => {
      const alreadyExists = prev.some(r => params.jobId ? r.jobId === params.jobId : (r.customerId === params.customerId && !r.jobId));
      if (alreadyExists) return prev;
      created = true;
      return [request, ...prev];
    });
    if (created) logOperationalEvent("Review Request Scheduled", `${params.customerName} -- ready to send`, "⭐");
  };

  useEffect(() => {
    const unsubscribe = onCollectionEvent("scheduling_events", (evt: CollectionEvent<SchedulingEvent>) => {
      if (evt.item.eventType !== "Job") return;

      // Keep the customer's open-job counter synchronized no matter which
      // module created, completed, cancelled, reopened, or deleted the job.
      const closed = (status?: SchedulingEvent["status"]) => status === "Completed" || status === "Cancelled";
      let openJobDelta = 0;
      if (evt.type === "created" && !closed(evt.item.status)) openJobDelta = 1;
      if (evt.type === "deleted" && !closed(evt.item.status)) openJobDelta = -1;
      if (evt.type === "updated" && closed(evt.previous?.status) !== closed(evt.item.status)) {
        openJobDelta = closed(evt.item.status) ? -1 : 1;
      }
      if (openJobDelta) {
        setCustomers(prev => prev.map(customer => {
          const matches = customer.id === evt.item.customerId || customer.contact === evt.item.customer || customer.company === evt.item.customer;
          return matches ? { ...customer, openJobs: Math.max(0, customer.openJobs + openJobDelta) } : customer;
        }));
      }

      if (evt.type !== "updated") return;
      const { item, previous } = evt;
      const justCompleted = previous?.status !== "Completed" && item.status === "Completed";
      if (!justCompleted || item.eventType !== "Job") return;

      // Stamped once, right at the moment of completion, regardless of
      // which page/action actually set the status -- a "days after
      // completion" Review Request needs a real completion timestamp to
      // count days from.
      if (!item.completedAt) {
        setSchedulingEvents(prev => prev.map(j => j.id === item.id ? { ...j, completedAt: new Date().toISOString() } : j));
      }

      const matchedCustomer = customers.find(c => c.id === item.customerId || c.contact === item.customer || c.company === item.customer);
      maybeCreateAutomatedReviewRequest({
        trigger: "job_completed",
        customerId: matchedCustomer?.id,
        customerName: item.customer,
        customerPhone: matchedCustomer?.phone || item.customerPhone,
        customerEmail: matchedCustomer?.email || item.customerEmail,
        jobId: item.id,
        excludedByJob: item.reviewRequestExcluded
      });

      if (item.sourceEstimateId) {
        const estimate = estimates.find((e: Estimate) => e.id === item.sourceEstimateId);
        if (estimate) {
          const revenueEvent = {
            id: generateRevenueEventId(),
            date: new Date().toISOString(),
            amount: estimate.amount,
            customer: item.customer,
            jobId: item.id,
            estimateId: estimate.id
          };
          setRevenueEvents((prev) => [...prev, revenueEvent]);
          setJournalEntries(prev => prev.some(entry => entry.sourceId === revenueEvent.id)
            ? prev
            : [...prev, postJobCompletionRevenueEntry(revenueEvent)]);
          logOperationalEvent("Job Completed", `${item.customer}'s job completed — $${estimate.amount.toLocaleString()} revenue recognized`, "💰");
          triggerNotification(`Job completed for ${item.customer}: $${estimate.amount.toLocaleString()} revenue recognized`);
          return;
        }
      }

      logOperationalEvent("Job Completed", `${item.customer}'s job marked completed`, "✅");
      triggerNotification(`Job completed for ${item.customer}`);
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimates, customers, reviewAutomationSettings]);

  // Review Requests triggered by "Invoice Paid" -- separate subscription
  // on the invoices collection, same shared helper as job completion above.
  useEffect(() => {
    const unsubscribe = onCollectionEvent("invoices", (evt: CollectionEvent<Invoice>) => {
      if (evt.type !== "updated") return;
      const { item, previous } = evt;
      const justPaid = previous?.status !== "paid" && item.status === "paid";
      if (!justPaid) return;

      const linkedJob = item.jobId ? schedulingEvents.find(j => j.id === item.jobId) : undefined;
      const matchedCustomer = customers.find(c => c.id === item.customerId || c.contact === item.customer || c.company === item.customer);
      maybeCreateAutomatedReviewRequest({
        trigger: "invoice_paid",
        customerId: matchedCustomer?.id,
        customerName: item.customer,
        customerPhone: matchedCustomer?.phone,
        customerEmail: matchedCustomer?.email,
        jobId: item.jobId,
        invoiceId: item.id,
        excludedByJob: linkedJob?.reviewRequestExcluded
      });
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, schedulingEvents, reviewAutomationSettings]);
}
