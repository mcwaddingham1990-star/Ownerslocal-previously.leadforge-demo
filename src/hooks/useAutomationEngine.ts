import { useEffect, useRef } from "react";
import { collection, doc, getDocs, limit, query, runTransaction, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useDomainActions } from "./useDomainActions";
import { useFirestoreCollection } from "./useFirestoreCollection";
import { onCollectionEvent, onRemoteCollectionEvent, type CollectionEvent } from "../lib/eventBus";
import {
  automationAppliesTo,
  automationRunId,
  deriveAutomationEvents,
  executeAutomation,
  findOverdueInvoiceEvents,
  requiredActionModules,
  type AutomationEvent,
  type AutomationRunStore
} from "../lib/automationEngine";
import { createAutomationActionHandlers, type AutomationActionDeps } from "../lib/automationActions";
import { hasEffectivePermission } from "../types/permissions";
import type { Automation, AutomationAction, AutomationRun } from "../types/automation";
import type { Customer } from "../types/domain";

const WATCHED_COLLECTIONS = ["leads", "estimates", "scheduling_events", "invoices"] as const;
const OVERDUE_SCAN_INTERVAL_MS = 15 * 60 * 1000;

/** Firestore-backed run log. The run document id is deterministic, so the transaction below is the cross-tab / cross-device "exactly once" gate. */
export function createFirestoreRunStore(): AutomationRunStore {
  const createIfAbsent = (run: AutomationRun) =>
    runTransaction(db, async tx => {
      const ref = doc(db, "automation_runs", run.id);
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      tx.set(ref, run);
      return true;
    });
  return {
    claim: createIfAbsent,
    recordSkip: async run => { await createIfAbsent(run); },
    finish: async (runId, patch) => { await updateDoc(doc(db, "automation_runs", runId), patch as Record<string, unknown>); },
    updateLastRun: async (automationId, patch) => { await updateDoc(doc(db, "automations", automationId), patch as Record<string, unknown>); }
  };
}

/**
 * Appends one message to the customer's single "Customer Chat" conversation
 * -- the same record Messages and the Customer Portal both read -- creating
 * it (with a deterministic id) only if the customer has none yet. The
 * message id is deterministic per run + action, so a retry finds it already
 * there instead of sending twice.
 */
async function postCustomerChatMessage(businessId: string, senderName: string, senderEmail: string | undefined, params: { customer: Customer; messageId: string; content: string }): Promise<"posted" | "exists"> {
  const { customer, messageId, content } = params;
  const customerName = customer.contact || customer.company || "Customer";
  const existing = await getDocs(query(collection(db, "conversations"), where("businessId", "==", businessId), where("customerId", "==", customer.id), limit(1)));
  const ref = existing.empty ? doc(db, "conversations", `convo_cust_${customer.id.replace(/[^A-Za-z0-9_-]/g, "_")}`) : existing.docs[0].ref;
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const message = { id: messageId, sender: senderName, senderEmail, senderRole: "Automation", content, timestamp };
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      const data = snap.data();
      const messages = Array.isArray(data.messages) ? data.messages : [];
      if (messages.some((m: any) => m?.id === messageId)) return "exists" as const;
      tx.update(ref, {
        messages: [...messages, message],
        lastMessage: content,
        lastMessageTime: timestamp,
        lastMessageSender: senderName,
        updatedAt: new Date().toISOString()
      });
      return "posted" as const;
    }
    tx.set(ref, {
      id: ref.id,
      title: customerName,
      type: "Customer Chat",
      participants: [customerName],
      unreadCount: 0,
      lastMessage: content,
      lastMessageTime: timestamp,
      lastMessageSender: senderName,
      isRead: true,
      isArchived: false,
      priority: "Normal",
      customerId: customer.id,
      customerName,
      messages: [message],
      createdDate: timestamp,
      businessId,
      updatedAt: new Date().toISOString()
    });
    return "posted" as const;
  });
}

/**
 * Mounts the WHEN -> IF -> DO Automation Engine for the signed-in business.
 * Renders nothing; listens to the same Event Engine bus the built-in
 * cascades use (plus the remote channel for server-written changes), and
 * runs enabled automations after the triggering action has already
 * completed. With no enabled automations it does nothing at all.
 */
export function useAutomationEngine(): void {
  const { businessId, loggedInUser } = useAuth();
  const domain = useDomainData();
  const nav = useNavTelemetry();
  const domainActions = useDomainActions();
  // Read-only here (the setter is never called): the Automations page owns edits.
  const [automations] = useFirestoreCollection<Automation>("automations", businessId);

  const latest = useRef({ domain, nav, domainActions, automations, businessId, loggedInUser });
  latest.current = { domain, nav, domainActions, automations, businessId, loggedInUser };

  /** >0 while an automation action is synchronously writing state -- events it causes don't trigger automations (no chains/loops). */
  const executingRef = useRef(0);
  /** Runs already settled in this session (claimed or found claimed) -- avoids a Firestore round trip for local-write echoes. */
  const settledRef = useRef(new Set<string>());
  const inFlightRef = useRef(new Set<string>());
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const storeRef = useRef<AutomationRunStore | null>(null);
  if (!storeRef.current) storeRef.current = createFirestoreRunStore();

  useEffect(() => {
    settledRef.current.clear();
    inFlightRef.current.clear();
  }, [businessId]);

  const canRunActions = (actions: AutomationAction[], trigger: Automation["trigger"]): boolean => {
    const user = latest.current.loggedInUser;
    if (!user) return false;
    if (!user.isEmployee) return true; // the business owner's own account
    return actions.every(action => {
      const modules = requiredActionModules(action.type, trigger);
      return modules.length === 0 || modules.some(module => hasEffectivePermission(user.granularPermissions, user.permissions, module, "edit"));
    });
  };

  const buildHandlers = () => {
    const current = latest.current;
    const deps: AutomationActionDeps = {
      businessId: current.businessId as string,
      businessName: current.domain.businessProfile?.name || "",
      actorEmail: current.loggedInUser?.email,
      getData: () => {
        const d = latest.current.domain;
        return {
          customers: d.customers,
          leads: d.leads,
          estimates: d.estimates,
          schedulingEvents: d.schedulingEvents,
          invoices: d.invoices,
          employees: d.employees,
          reviewRequests: d.reviewRequests,
          reviewAutomationSettings: d.reviewAutomationSettings,
          salesTaxRates: d.salesTaxRates
        };
      },
      createJob: input => latest.current.domainActions.createJob(input),
      createAppointment: input => latest.current.domainActions.createAppointment(input),
      updateJob: (jobId, updates, label) => latest.current.domainActions.updateJob(jobId, updates, label),
      setLeads: value => latest.current.domain.setLeads(value),
      setInvoices: value => latest.current.domain.setInvoices(value),
      setJournalEntries: value => latest.current.domain.setJournalEntries(value),
      setEstimates: value => latest.current.domain.setEstimates(value),
      setNotifications: value => latest.current.domain.setNotifications(value),
      setReviewRequests: value => latest.current.domain.setReviewRequests(value),
      postCustomerMessage: params => postCustomerChatMessage(
        current.businessId as string,
        current.domain.businessProfile?.name || "Owner'sLOCAL",
        current.loggedInUser?.email,
        params
      ),
      logOperationalEvent: (type, desc, icon) => latest.current.nav.logOperationalEvent(type, desc, icon)
    };
    const handlers = createAutomationActionHandlers(deps);
    // Mark the synchronous part of each handler (where all its state writes
    // happen) so the collection events it emits are ignored by this engine.
    return Object.fromEntries(Object.entries(handlers).map(([type, handler]) => [type, (...args: Parameters<typeof handler>) => {
      executingRef.current++;
      try {
        return handler(...args);
      } finally {
        executingRef.current--;
      }
    }])) as typeof handlers;
  };

  const schedule = (automation: Automation, event: AutomationEvent) => {
    const key = automationRunId(automation.id, event.eventKey);
    if (settledRef.current.has(key) || inFlightRef.current.has(key)) return;
    inFlightRef.current.add(key);
    // Queued (one run at a time) and started on a later tick, so the manual
    // action that emitted this event has fully finished -- and React has
    // re-rendered with its result -- before any automation touches state.
    queueRef.current = queueRef.current.then(() => new Promise<void>(resolve => setTimeout(resolve, 0))).then(async () => {
      const current = latest.current;
      const fresh = current.automations.find(a => a.id === automation.id);
      if (!current.businessId || !fresh) return;
      const outcome = await executeAutomation(fresh, event, {
        businessId: current.businessId,
        runBy: current.loggedInUser?.email,
        store: storeRef.current!,
        handlers: buildHandlers(),
        canRunActions: actions => canRunActions(actions, fresh.trigger)
      });
      // Condition-skips and "not this session's permissions" stay open so a
      // later pass (or another session) can still run them.
      if (outcome !== "skipped" && outcome !== "no_permission" && outcome !== "not_applicable") settledRef.current.add(key);
      if (outcome !== "not_applicable" && outcome !== "duplicate" && outcome !== "no_permission") {
        console.info(`[Automations] "${fresh.name}" on ${event.trigger} (${event.record?.id}): ${outcome}`);
      }
    }).catch(error => {
      console.error("[Automations] run failed unexpectedly", error);
    }).finally(() => {
      inFlightRef.current.delete(key);
    });
  };

  const handleEvent = (event: AutomationEvent) => {
    const current = latest.current;
    if (!current.businessId || !current.loggedInUser) return;
    current.automations.filter(a => automationAppliesTo(a, event)).forEach(a => schedule(a, event));
  };

  useEffect(() => {
    if (!businessId) return;
    const onEvent = (evt: CollectionEvent) => {
      if (executingRef.current > 0) return;
      try {
        deriveAutomationEvents(evt).forEach(handleEvent);
      } catch (error) {
        // Never let automation bookkeeping throw back into the manual action
        // that emitted this event.
        console.error("[Automations] couldn't process event", error);
      }
    };
    const unsubscribers = WATCHED_COLLECTIONS.flatMap(name => [
      onCollectionEvent(name, onEvent),
      onRemoteCollectionEvent(name, onEvent)
    ]);
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
    // Handlers read everything through latest.current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // invoice.overdue is a state, not a write: scan on load, whenever invoices
  // or automations change (debounced), and every 15 minutes.
  const overdueAutomations = automations.filter(a => a.enabled && a.trigger === "invoice.overdue");
  const overdueSignature = overdueAutomations.map(a => `${a.id}:${a.enabledAt}`).join("|");
  useEffect(() => {
    if (!businessId || !overdueSignature) return;
    const scan = () => {
      try {
        const current = latest.current;
        current.automations
          .filter(a => a.enabled && a.trigger === "invoice.overdue")
          .forEach(a => findOverdueInvoiceEvents(current.domain.invoices, a.enabledAt).forEach(event => {
            if (automationAppliesTo(a, event)) schedule(a, event);
          }));
      } catch (error) {
        console.error("[Automations] overdue scan failed", error);
      }
    };
    const debounce = setTimeout(scan, 5000);
    const interval = setInterval(scan, OVERDUE_SCAN_INTERVAL_MS);
    return () => {
      clearTimeout(debounce);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, overdueSignature, domain.invoices]);
}
