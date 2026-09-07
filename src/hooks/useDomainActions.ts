import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { Customer, Estimate, SchedulingEvent } from "../types/domain";
import { generateEstimateNumber, formatEstimateDate, estimateExpirationDate } from "../lib/estimateDefaults";

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

  const convertLeadToCustomer = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return null;

    const newCustomer: Customer = {
      id: "cust_" + Math.random().toString(36).substring(2, 9),
      company: lead.company || lead.name + " Inc",
      contact: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: lead.address || "",
      openJobs: 0,
      outstandingBalance: 0,
      lifetimeValue: lead.estimatedValue || 0,
      status: "Active",
      type: "Residential",
      isVIP: false,
      recentlyAdded: true
    };

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
      company: lead.company || lead.name + " Inc",
      customerName: lead.name,
      salesRep: lead.salesRep || "Unassigned",
      amount: lead.estimatedValue || 0,
      status: "Draft",
      // Carry over what was already captured on the lead so the estimate
      // doesn't start blank -- the sales rep already wrote this down once.
      notes: lead.notes || "",
      phone: lead.phone || undefined,
      address: lead.address || undefined,
      createdDate: formatEstimateDate(new Date()),
      expirationDate: estimateExpirationDate()
    };

    setEstimates(prev => [newEstimate, ...prev]);
    setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, status: "Estimate Sent" } : l)));
    logOperationalEvent("Estimate Created", `Estimate ${newEstimate.number} generated from lead ${lead.name}`, "🧾");
    return newEstimate;
  };

  const approveEstimateToJob = (estimateId: string, schedule?: {
    date: string;
    startTime: string;
    endTime: string;
    assignedEmployee?: string;
    assignedCrew?: string;
    priority?: SchedulingEvent["priority"];
    notes?: string;
  }) => {
    const estimate = estimates.find(e => e.id === estimateId);
    if (!estimate) return null;

    // Conversion is intentionally idempotent. A double tap or a reopened
    // accepted estimate must never create a duplicate job.
    const existingJob = schedulingEvents.find(event => event.sourceEstimateId === estimateId);
    if (existingJob) return existingJob;

    // Cross-reference the real customer record for real contact info —
    // an estimate itself only stores a customer name/company, not
    // phone/email. No real match means honestly blank fields, not
    // fabricated placeholder contact details.
    const matchedCustomer = customers.find(
      c => c.contact === estimate.customerName || c.company === estimate.company
    );

    const newJob: SchedulingEvent = {
      id: "job_" + Math.random().toString(36).substring(2, 9),
      eventType: "Job",
      date: schedule?.date || new Date().toISOString().slice(0, 10),
      startTime: schedule?.startTime || "09:00",
      endTime: schedule?.endTime || "12:00",
      customer: estimate.customerName,
      customerPhone: matchedCustomer?.phone || estimate.phone || "",
      customerEmail: matchedCustomer?.email || "",
      customerAddress: matchedCustomer?.address || estimate.address || "",
      // No real rule exists yet for which employee should get an
      // auto-created job — leaving it unassigned for a real dispatcher
      // to pick is honest; a hardcoded name never matching a real
      // employee is not.
      assignedEmployee: schedule?.assignedEmployee || "",
      assignedCrew: schedule?.assignedCrew || "",
      location: matchedCustomer?.address || estimate.address || "",
      priority: schedule?.priority || "Medium",
      notes: ["Created from accepted estimate " + estimate.number, schedule?.notes].filter(Boolean).join(" — "),
      status: schedule?.assignedEmployee ? "Assigned" : "Scheduled",
      sourceEstimateId: estimate.id,
      title: `${estimate.company || estimate.customerName} project`,
      description: `Approved scope from estimate ${estimate.number}`,
      budget: estimate.amount,
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activity: [{
        id: "activity_" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        action: "Job created from accepted estimate",
        by: "Owners Event Engine",
        detail: estimate.number
      }]
    };

    setSchedulingEvents(prev => [newJob, ...prev]);
    setEstimates(prev => prev.map(e => (e.id === estimateId ? { ...e, status: "Accepted" } : e)));

    // Upgrade a "Potential" customer to "Active" now that they have a real job.
    // If no customer record exists yet (estimate was created without a CRM entry),
    // create the full Active record so the CRM stays in sync.
    const existingCustomer = customers.find(
      c => c.contact === estimate.customerName || c.company === estimate.company
    );
    if (existingCustomer) {
      if (existingCustomer.status === "Potential") {
        setCustomers(prev =>
          prev.map(c =>
            c.id === existingCustomer.id
              ? { ...c, status: "Active" }
              : c
          )
        );
        logOperationalEvent("Customer Activated", `${estimate.customerName} moved from Potential → Active`, "🤝", { screen: "customers", customerId: existingCustomer.id });
      }
    } else {
      // No CRM record at all — create an Active customer from estimate data.
      const newCustomer: Customer = {
        id: "cust_" + Math.random().toString(36).substring(2, 9),
        company: estimate.company || estimate.customerName + " Inc",
        contact: estimate.customerName,
        phone: "",
        email: "",
        address: estimate.address || "",
        openJobs: 1,
        outstandingBalance: estimate.amount || 0,
        lifetimeValue: estimate.amount || 0,
        status: "Active",
        type: "Residential",
        isVIP: false,
        recentlyAdded: true
      };
      setCustomers(prev => [newCustomer, ...prev]);
      logOperationalEvent("Customer Created", `${estimate.customerName} added as Active customer from accepted estimate`, "🤝", { screen: "customers", customerId: newCustomer.id });
    }

    logOperationalEvent("Estimate Accepted", `${estimate.number} confirmed and converted to ${newJob.status} Job`, "✅", { screen: "jobs" });
    return newJob;
  };

  /**
   * Called whenever a new estimate is created for someone who isn't already a
   * customer. Creates a "Potential" customer record so the name shows up in
   * the CRM immediately. If a matching customer already exists (by name or
   * company) nothing is written — the existing record wins.
   */
  const upsertPotentialCustomer = (customerName: string, company?: string, phone?: string, address?: string) => {
    const trimmedName = customerName.trim();
    if (!trimmedName) return;
    const alreadyExists = customers.some(
      c => c.contact === trimmedName || c.company === (company?.trim() || trimmedName + " Inc")
    );
    if (alreadyExists) return;

    const newCustomer: Customer = {
      id: "cust_" + Math.random().toString(36).substring(2, 9),
      company: company?.trim() || trimmedName + " Inc",
      contact: trimmedName,
      phone: phone?.trim() || "",
      email: "",
      address: address?.trim() || "",
      openJobs: 0,
      outstandingBalance: 0,
      lifetimeValue: 0,
      status: "Potential",
      type: "Residential",
      isVIP: false,
      recentlyAdded: true
    };

    setCustomers(prev => [newCustomer, ...prev]);
    logOperationalEvent("Potential Customer Added", `${trimmedName} added from estimate`, "🔮", { screen: "customers", customerId: newCustomer.id });
  };

  return { convertLeadToCustomer, createEstimateFromLead, approveEstimateToJob, upsertPotentialCustomer };
}
