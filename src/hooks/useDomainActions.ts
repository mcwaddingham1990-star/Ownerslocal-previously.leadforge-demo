import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useAuth } from "../context/AuthContext";
import { Customer, Estimate, SchedulingEvent } from "../types/domain";
import { generateEstimateNumber, formatEstimateDate, estimateExpirationDate } from "../lib/estimateDefaults";
import { buildNewCustomerRecord } from "../lib/customerDefaults";
import { normalizeContactPhone } from "../lib/contactNormalization";

/**
 * Single home for the cross-domain writes that today happen ad hoc inside
 * individual page components (Lead -> Customer, Lead -> Estimate,
 * Estimate -> scheduled Job). Not the real Event Engine pub/sub yet — just
 * gives these existing imperative writes one shared module instead of three
 * scattered copies, so the future Event Engine has one obvious integration
 * point.
 */
export function useDomainActions() {
  const { leads, setLeads, customers, setCustomers, estimates, setEstimates, schedulingEvents, setSchedulingEvents } = useDomainData();
  const { logOperationalEvent } = useNavTelemetry();
  const { loggedInUser, simulatedRole } = useAuth();
  const actor = loggedInUser?.name || loggedInUser?.email || simulatedRole || loggedInUser?.role || "Owner";

  const convertLeadToCustomer = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return null;

    // Marketing attribution -- carries the real Lead source through into
    // the Customer record so it survives past this conversion.
    const newCustomer = buildNewCustomerRecord({
      name: lead.name,
      company: lead.company || "",
      phone: normalizeContactPhone(lead.phone),
      email: lead.email,
      address: lead.address,
      lifetimeValue: lead.estimatedValue,
      source: lead.source,
      sourceLeadId: lead.id
    });

    setCustomers(prev => [newCustomer, ...prev]);
    setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, status: "Won" } : l)));
    logOperationalEvent("Lead Converted", `${lead.name} converted to Customer`, "🤝", { screen: "customers", customerId: newCustomer.id });
    return newCustomer;
  };

  const createEstimateFromLead = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return null;

    const newEstimate: Estimate = {
      id: "est_" + Math.random().toString(36).substring(2, 9),
      number: generateEstimateNumber(),
      company: lead.company || "",
      customerName: lead.name,
      salesRep: lead.salesRep || "Unassigned",
      amount: lead.estimatedValue || 0,
      status: "Draft",
      // Carry over what was already captured on the lead so the estimate
      // doesn't start blank -- the sales rep already wrote this down once.
      notes: lead.notes || "",
      phone: normalizeContactPhone(lead.phone) || undefined,
      address: lead.address || undefined,
      createdDate: formatEstimateDate(new Date()),
      expirationDate: estimateExpirationDate(),
      source: lead.source,
      sourceLeadId: lead.id
    };

    setEstimates(prev => [newEstimate, ...prev]);
    setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, status: "Estimate Sent" } : l)));
    logOperationalEvent("Estimate Created", `Estimate ${newEstimate.number} generated from lead ${lead.name}`, "🧾");
    return newEstimate;
  };

  /**
   * Single real job-creation path -- every "build a job" entry point in the
   * app (Jobs page, the shared BuildJobModal, an accepted Estimate, a Lead,
   * the Map's quick-approve) funnels through this same function instead of
   * each hand-rolling its own SchedulingEvent, so they can never drift out
   * of sync with each other (missing fields, missing customer sync, or --
   * the real bug this replaced -- missing the sourceEstimateId that makes
   * the idempotency check below actually work).
   *
   * Conversion from a sourceEstimateId is intentionally idempotent: a
   * double submit or a reopened accepted estimate must never create a
   * duplicate job.
   */
  const createJob = (input: {
    customerId?: string;
    customer: string;
    customerPhone?: string;
    customerEmail?: string;
    customerAddress?: string;
    location?: string;
    title?: string;
    customType?: string;
    jobType?: string;
    date: string;
    startTime: string;
    endTime: string;
    assignedEmployee?: string;
    assignedCrew?: string;
    assignedVehicle?: string;
    priority?: SchedulingEvent["priority"];
    department?: string;
    description?: string;
    notes?: string;
    purchaseOrder?: string;
    budget?: number;
    laborRate?: number;
    status?: SchedulingEvent["status"];
    sourceEstimateId?: string;
    sourceLeadId?: string;
    source?: Customer["source"];
    /** Set only by the Automation Engine -- stamps the job so its own "Job Created" event can't re-trigger automations. */
    createdByAutomationId?: string;
  }): SchedulingEvent => {
    if (input.sourceEstimateId) {
      const existingJob = schedulingEvents.find(event => event.sourceEstimateId === input.sourceEstimateId);
      if (existingJob) return existingJob;
    }

    const jobsCount = schedulingEvents.filter(e => e.eventType === "Job").length;
    const now = new Date().toISOString();
    const newJob: SchedulingEvent = {
      id: "job_" + Math.random().toString(36).substring(2, 9),
      eventType: "Job",
      jobNumber: `JOB-${new Date().getFullYear()}-${String(jobsCount + 1).padStart(4, "0")}`,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      customerId: input.customerId,
      customer: input.customer,
      customerPhone: input.customerPhone || "",
      customerEmail: input.customerEmail || "",
      customerAddress: input.customerAddress || input.location || "",
      location: input.location || input.customerAddress || "",
      title: input.title,
      customType: input.customType || input.title,
      jobType: input.jobType,
      // No real rule exists for which employee should get an auto-created
      // job -- leaving it unassigned for a real dispatcher to pick is
      // honest; a hardcoded name never matching a real employee is not.
      assignedEmployee: input.assignedEmployee || "",
      assignedCrew: input.assignedCrew,
      assignedVehicle: input.assignedVehicle,
      priority: input.priority || "Medium",
      department: input.department,
      description: input.description,
      notes: input.notes,
      purchaseOrder: input.purchaseOrder,
      budget: input.budget,
      laborRate: input.laborRate,
      status: input.status && input.status !== "Unassigned" ? input.status : input.assignedEmployee ? "Assigned" : "Scheduled",
      sourceEstimateId: input.sourceEstimateId,
      sourceLeadId: input.sourceLeadId,
      source: input.source,
      ...(input.createdByAutomationId ? { createdByAutomationId: input.createdByAutomationId } : {}),
      progress: 0,
      checklist: [],
      materials: [],
      createdAt: now,
      updatedAt: now,
      activity: [{
        id: "activity_" + Math.random().toString(36).substring(2, 9),
        timestamp: now,
        action: (input.sourceEstimateId ? "Job created from accepted estimate" : "Job created") + (input.createdByAutomationId ? " (automation)" : ""),
        by: actor
      }]
    };

    // Re-checked against the very latest list inside the updater too: the
    // `schedulingEvents` closure above can lag a render behind when two
    // conversions of the same estimate land back to back (e.g. a manual
    // Convert to Job and an "Estimate Accepted -> Create Job" automation).
    setSchedulingEvents(prev => input.sourceEstimateId && prev.some(event => event.sourceEstimateId === input.sourceEstimateId) ? prev : [newJob, ...prev]);

    if (input.sourceEstimateId) {
      setEstimates(prev => prev.map(e => (e.id === input.sourceEstimateId ? { ...e, status: "Accepted" } : e)));
    }

    // Customer sync only applies to a real pipeline conversion (from a Lead
    // or an Estimate) -- a job typed directly into the Jobs form already
    // handles its own customer record (see BuildJobModal's "Add customer"
    // path) and shouldn't have this silently create a second one.
    if (input.sourceEstimateId || input.sourceLeadId) {
      const existingCustomer = customers.find(c => c.id === input.customerId || c.contact === input.customer || c.company === input.customer);
      if (existingCustomer) {
        const needsActivation = existingCustomer.status === "Potential";
        // Backfill attribution onto a customer record that predates this
        // conversion's source (e.g. created via a bare "Potential" upsert
        // before a Lead was ever linked) so later Estimates/Jobs for the
        // same customer still resolve a real source instead of "Other".
        const needsSourceBackfill = !existingCustomer.source && input.source;
        if (needsActivation || needsSourceBackfill) {
          setCustomers(prev =>
            prev.map(c =>
              c.id === existingCustomer.id
                ? { ...c, ...(needsActivation ? { status: "Active" as const } : {}), ...(needsSourceBackfill ? { source: input.source, sourceLeadId: input.sourceLeadId } : {}) }
                : c
            )
          );
          if (needsActivation) logOperationalEvent("Customer Activated", `${input.customer} moved from Potential → Active`, "🤝", { screen: "customers", customerId: existingCustomer.id });
        }
      } else if (input.customer) {
        // No CRM record at all — create an Active customer from the same data.
        const newCustomer = buildNewCustomerRecord({
          name: input.customer,
          company: input.customer,
          phone: input.customerPhone,
          email: input.customerEmail,
          address: input.customerAddress || input.location,
          openJobs: 1,
          lifetimeValue: input.budget,
          source: input.source || "Manual Entry",
          sourceLeadId: input.sourceLeadId
        });
        setCustomers(prev => [newCustomer, ...prev]);
        logOperationalEvent("Customer Created", `${input.customer} added as Active customer from ${input.sourceEstimateId ? "accepted estimate" : "converted lead"}`, "🤝", { screen: "customers", customerId: newCustomer.id });
      }
    }

    logOperationalEvent(input.sourceEstimateId ? "Estimate Accepted" : "Job Created", `${newJob.jobNumber} ${input.sourceEstimateId ? "confirmed and converted to" : "created for"} ${newJob.status} Job — ${input.customer}`, "💼", { screen: "jobs" });
    return newJob;
  };

  const updateJob = (jobId: string, updates: Partial<SchedulingEvent>, actionLabel = "Job details edited"): SchedulingEvent | null => {
    const existing = schedulingEvents.find(e => e.id === jobId);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updated: SchedulingEvent = {
      ...existing,
      ...updates,
      updatedAt: now,
      activity: [...(existing.activity || []), { id: "activity_" + Math.random().toString(36).substring(2, 9), timestamp: now, action: actionLabel, by: actor }]
    };
    setSchedulingEvents(prev => prev.map(e => e.id === jobId ? updated : e));
    logOperationalEvent("Job Updated", `${updated.jobNumber || updated.id} — ${actionLabel}`, "💼", { screen: "jobs" });
    return updated;
  };

  /**
   * One shared path for a non-Job calendar entry (Site Visit, Consultation,
   * Follow-Up...) -- the same SchedulingEvent shape the Lead page's
   * "Schedule Home Visit" writes, so it shows up on Scheduling, Dispatch,
   * and the Map like any other appointment. Used by automations; a
   * `dedupeKey` makes repeat calls for the same source return the existing
   * entry instead of adding a second one.
   */
  const createAppointment = (input: {
    eventType: string;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    customer: string;
    customerId?: string;
    customerPhone?: string;
    customerEmail?: string;
    customerAddress?: string;
    notes?: string;
    priority?: SchedulingEvent["priority"];
    sourceLeadId?: string;
    source?: Customer["source"];
    dedupeKey?: string;
    createdByAutomationId?: string;
  }): SchedulingEvent => {
    const id = input.dedupeKey
      ? `appt_${input.dedupeKey.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120)}`
      : "appt_" + Math.random().toString(36).substring(2, 9);
    const existing = schedulingEvents.find(event => event.id === id);
    if (existing) return existing;
    const now = new Date().toISOString();
    const appointment: SchedulingEvent = {
      id,
      eventType: input.eventType,
      title: input.title,
      customType: input.title,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      customerId: input.customerId,
      customer: input.customer,
      customerPhone: input.customerPhone || "",
      customerEmail: input.customerEmail || "",
      customerAddress: input.customerAddress || "",
      location: input.customerAddress || "",
      assignedEmployee: "",
      priority: input.priority || "Medium",
      notes: input.notes,
      status: "Unassigned",
      // Never sourceEstimateId: createJob's one-job-per-estimate check looks
      // that field up across every calendar entry, so an appointment carrying
      // it would be mistaken for the estimate's job.
      sourceLeadId: input.sourceLeadId,
      source: input.source,
      ...(input.createdByAutomationId ? { createdByAutomationId: input.createdByAutomationId } : {}),
      createdAt: now,
      updatedAt: now,
      activity: [{ id: "activity_" + Math.random().toString(36).substring(2, 9), timestamp: now, action: `${input.eventType} scheduled${input.createdByAutomationId ? " (automation)" : ""}`, by: actor }]
    };
    let added = false;
    setSchedulingEvents(prev => {
      if (prev.some(event => event.id === id)) return prev;
      added = true;
      return [appointment, ...prev];
    });
    if (added) logOperationalEvent(`${input.eventType} Scheduled`, `${input.title} for ${input.customer} on ${input.date}`, "📅", { screen: "scheduling" });
    return appointment;
  };

  /**
   * Called whenever a new estimate is created for someone who isn't already a
   * customer. Creates a "Potential" customer record so the name shows up in
   * the CRM immediately. If a matching customer already exists (by name or
   * company) nothing is written — the existing record wins.
   */
  const upsertPotentialCustomer = (customerName: string, company?: string, phone?: string, address?: string, source?: Customer["source"], sourceLeadId?: string) => {
    const trimmedName = customerName.trim();
    if (!trimmedName) return;
    const trimmedCompany = company?.trim() || "";
    const alreadyExists = customers.some(
      c => c.contact === trimmedName || (!!trimmedCompany && c.company === trimmedCompany)
    );
    if (alreadyExists) return;

    // No Lead means this customer was typed in directly -- "Manual Entry"
    // is the honest attribution unless the caller already knows better
    // (e.g. an estimate that itself carries a real Lead source).
    const newCustomer = buildNewCustomerRecord({
      name: trimmedName,
      company: trimmedCompany,
      phone: normalizeContactPhone(phone),
      address,
      status: "Potential",
      source: source || "Manual Entry",
      sourceLeadId
    });

    setCustomers(prev => [newCustomer, ...prev]);
    logOperationalEvent("Potential Customer Added", `${trimmedName} added from estimate`, "🔮", { screen: "customers", customerId: newCustomer.id });
  };

  return { convertLeadToCustomer, createEstimateFromLead, createJob, createAppointment, updateJob, upsertPotentialCustomer };
}
