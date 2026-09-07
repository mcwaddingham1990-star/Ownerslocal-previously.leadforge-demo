import { useEffect } from "react";
import { onCollectionEvent, CollectionEvent } from "../lib/eventBus";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { SchedulingEvent, Estimate } from "../types/domain";
import { postJobCompletionRevenueEntry } from "../lib/accountingEngine";

function generateRevenueEventId(): string {
  return `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Registers the Event Engine's cascade rules. Every collection already
 * auto-emits create/update/delete via useFirestoreCollection, so adding a
 * new cascade later is just another onCollectionEvent subscription here —
 * no other file needs to change.
 */
export function useEventEngineSubscribers(): void {
  const { estimates, setCustomers, setRevenueEvents, setJournalEntries } = useDomainData();
  const { logOperationalEvent, triggerNotification } = useNavTelemetry();

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
  }, [estimates]);
}
