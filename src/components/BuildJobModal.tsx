import React, { useEffect, useMemo, useState } from "react";
import { confirmJobCompletion } from "../lib/completionGuard";
import { waitForPendingWrites } from "firebase/firestore";
import { db } from "../firebase";
import { Check, ChevronDown, ClipboardCheck, FileText, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useDomainActions } from "../hooks/useDomainActions";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection";
import { hasPermission } from "../types/permissions";
import { StructuredAddressFields } from "./StructuredAddressFields";
import { ProjectCompletionTracking } from "./ProjectCompletionTracking";
import { buildTextDocumentPdf, bytesToBase64 } from "../lib/pdfExport";
import { MAX_INLINE_BASE64_LENGTH } from "../lib/firestoreDocumentLimits";
import { buildNewCustomerRecord } from "../lib/customerDefaults";
import { AssignEmployeeField } from "./AssignEmployeeField";
import ESignChoiceModal from "./ESignChoiceModal";
import type { SchedulingEvent, DocumentItem, Customer } from "../types/domain";
import type { ProjectCompletionPlan } from "../types/completion";
import type { BuildJobPrefill } from "../types/generatedPdf";

type JobStatusType = SchedulingEvent["status"];
const STATUSES: JobStatusType[] = ["Unassigned", "Assigned", "En Route", "Arrived", "Working", "On Hold", "Completed", "Cancelled"];
const PRIORITIES: SchedulingEvent["priority"][] = ["Low", "Medium", "High", "Urgent"];

const EMPTY_FORM = {
  customerId: "", addAsNewCustomer: false, customerName: "", customerPhone: "", customerEmail: "", title: "", jobType: "Service",
  date: new Date().toISOString().slice(0, 10), startTime: "09:00", endTime: "11:00", assignedEmployee: "", assignedCrew: "None",
  assignedVehicle: "None", priority: "Medium" as SchedulingEvent["priority"], status: "Unassigned" as JobStatusType,
  location: "", department: "General", description: "", notes: "", purchaseOrder: "", budget: "", laborRate: "",
  sourceEstimateId: undefined as string | undefined, sourceLeadId: undefined as string | undefined, source: undefined as Customer["source"] | undefined,
  sourceMembershipId: undefined as string | undefined
};

const displayNumber = (job: SchedulingEvent) => job.jobNumber || `JOB-${job.id.replace(/\D/g, "").slice(-6) || job.id.slice(-6).toUpperCase()}`;
const normalizedStatus = (job: SchedulingEvent): JobStatusType => {
  const raw = String(job.status || "Unassigned").trim();
  const canonical = STATUSES.find(status => status.toLowerCase() === raw.toLowerCase());
  if (raw.toLowerCase() === "scheduled") return job.assignedEmployee ? "Assigned" : "Unassigned";
  return canonical || "Unassigned";
};

/**
 * The one shared "Build Job" popup -- opened identically whether it was
 * reached from a Lead, a Customer, an accepted Estimate, the Map, or the
 * Jobs page's own "New Job"/"Edit" buttons. Every entry point either passes
 * an `editingJob` (an existing SchedulingEvent to edit) or a `prefill`
 * (customer/estimate/lead info to start a new one from) -- the form, the
 * save logic, and the Job Tracking button underneath are all the same
 * component no matter which one triggered it.
 */
export function BuildJobModal({
  isOpen, onClose, editingJob, prefill
}: {
  isOpen: boolean;
  onClose: () => void;
  editingJob?: SchedulingEvent | null;
  prefill?: BuildJobPrefill | null;
}) {
  const { loggedInUser, simulatedRole, businessId } = useAuth();
  const {
    schedulingEvents, customers, setCustomers, setNotifications,
    inventoryList, setDocuments, businessProfile
  } = useDomainData();
  const { createJob, updateJob } = useDomainActions();
  const { navigateToScreen, triggerNotification } = useNavTelemetry();
  const [completionPlans, setCompletionPlans] = useFirestoreCollection<ProjectCompletionPlan>("project_completion_plans", businessId);

  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const actor = loggedInUser?.name || loggedInUser?.email || activeRole;
  const canEdit = /owner|manager|admin|dispatch|scheduler|supervisor/i.test(activeRole);
  const managementRole = /^(owner|manager|scheduler|dispatch)$/i.test(activeRole) || /manager/i.test(activeRole);
  const canManageCompletion = managementRole && (/^owner$/i.test(activeRole) || hasPermission(loggedInUser?.granularPermissions, "jobs", "edit") || !loggedInUser?.granularPermissions);
  const isAssignedWorker = (job: SchedulingEvent) => {
    const identity = [loggedInUser?.name, loggedInUser?.email].filter(Boolean).map(value => String(value).trim().toLowerCase());
    return identity.includes((job.assignedEmployee || "").trim().toLowerCase()) || identity.includes((job.assignedCrew || "").trim().toLowerCase());
  };

  const customerOptions = useMemo(() => {
    const options = new Map<string, any>();
    customers.forEach(customer => options.set(customer.id, customer));
    schedulingEvents.forEach(event => {
      const name = event.customer?.trim();
      if (!name) return;
      const existing = customers.find(customer => customer.id === event.customerId || customer.contact === name || customer.company === name);
      const id = existing?.id || event.customerId || `event_customer_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
      if (!options.has(id)) options.set(id, { id, contact: name, company: "", phone: event.customerPhone || "", address: event.customerAddress || event.location || "" });
    });
    return [...options.values()].sort((a, b) => (a.contact || a.company).localeCompare(b.contact || b.company));
  }, [customers, schedulingEvents]);

  const [form, setForm] = useState(EMPTY_FORM);
  // The real, persisted job this modal is currently pointed at -- null until
  // the first Save, then whatever was just created/updated. Lets "Job
  // Tracking" and "Schedule Job" act on a real saved record even when this
  // modal was opened from a prefill (a Lead/Estimate) that has no job yet.
  const [savedJob, setSavedJob] = useState<SchedulingEvent | null>(null);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  // What to do once Job Tracking is dismissed (closed, skipped, or
  // remind-me-later'd) -- set right before auto-opening tracking after a
  // save, so the save action's own follow-through (closing Build Job,
  // navigating to Scheduling) still happens once tracking is done with,
  // instead of stacking on top of it. Left null when Job Tracking is
  // opened manually via its own button, so dismissing it just returns to
  // the still-open Build Job popup underneath, per the original design.
  const [afterTracking, setAfterTracking] = useState<(() => void) | null>(null);
  // The second eSign checkpoint the pipeline spec calls for: after Job
  // Tracking is dismissed, right before Schedule Job actually leaves for
  // Scheduling. Holding the job itself (not just a boolean) lets the choice
  // modal act on the right record regardless of when it fires.
  const [esignScheduleTarget, setEsignScheduleTarget] = useState<SchedulingEvent | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // A prefill for an estimate that already has its job (e.g. an "Estimate
    // Accepted -> Create Job" automation converted it first) opens that job
    // for editing -- createJob would return it anyway, and this way the
    // details entered here are saved to it instead of being dropped.
    const existingEstimateJob = !editingJob && prefill?.sourceEstimateId
      ? schedulingEvents.find(event => event.eventType === "Job" && event.sourceEstimateId === prefill.sourceEstimateId)
      : undefined;
    const jobToEdit = editingJob || existingEstimateJob;
    if (jobToEdit) {
      const editingJob = jobToEdit;
      const customer = customers.find(c => c.id === editingJob.customerId || c.contact === editingJob.customer || c.company === editingJob.customer);
      setForm({
        ...EMPTY_FORM, customerId: customer?.id || "", customerName: editingJob.customer || customer?.contact || customer?.company || "",
        customerPhone: editingJob.customerPhone || customer?.phone || "", customerEmail: editingJob.customerEmail || customer?.email || "",
        title: editingJob.title || editingJob.customType || "", jobType: editingJob.jobType || "Service",
        date: editingJob.date, startTime: editingJob.startTime?.replace(/\s?(AM|PM)$/i, "") || "09:00", endTime: editingJob.endTime?.replace(/\s?(AM|PM)$/i, "") || "11:00",
        assignedEmployee: editingJob.assignedEmployee || "", assignedCrew: editingJob.assignedCrew || "None", assignedVehicle: editingJob.assignedVehicle || "None",
        priority: editingJob.priority, status: normalizedStatus(editingJob), location: editingJob.location || editingJob.customerAddress || "", department: editingJob.department || "General",
        description: editingJob.description || "", notes: editingJob.notes || "", purchaseOrder: editingJob.purchaseOrder || "",
        budget: (editingJob.budget ?? "").toString(), laborRate: editingJob.laborRate?.toString() || "",
        sourceEstimateId: editingJob.sourceEstimateId, sourceLeadId: editingJob.sourceLeadId, source: editingJob.source,
        sourceMembershipId: editingJob.sourceMembershipId
      });
      setSavedJob(editingJob);
    } else if (prefill) {
      setForm({
        ...EMPTY_FORM, customerId: prefill.customerId || "", customerName: prefill.customerName || "",
        customerPhone: prefill.customerPhone || "", customerEmail: prefill.customerEmail || "", location: prefill.customerAddress || "",
        title: prefill.title || "", description: prefill.description || "", notes: prefill.notes || "",
        budget: prefill.budget != null ? String(prefill.budget) : "",
        sourceEstimateId: prefill.sourceEstimateId, sourceLeadId: prefill.sourceLeadId, source: prefill.source,
        sourceMembershipId: prefill.sourceMembershipId
      });
      setSavedJob(null);
    } else {
      setForm(EMPTY_FORM);
      setSavedJob(null);
    }
  }, [isOpen, editingJob, prefill]);

  if (!isOpen) return null;

  const jobPdfLines = (job: SchedulingEvent) => [`Customer: ${job.customer}`, `Phone: ${job.customerPhone || "—"}`, `Address: ${job.location || job.customerAddress || "—"}`, `Date: ${job.date} ${job.startTime || ""}`, `Status: ${normalizedStatus(job)}`, `Priority: ${job.priority}`, `Estimated value: $${Number(job.budget || 0).toLocaleString()}`, "", `Description: ${job.description || job.notes || "—"}`];

  const storeJobPdf = async (job: SchedulingEvent) => {
    const bytes = await buildTextDocumentPdf(`Job ${displayNumber(job)}`, [{ body: jobPdfLines(job).join("\n") }], businessProfile);
    const pdfBase64 = bytesToBase64(bytes);
    const filename = `${displayNumber(job)}.pdf`;
    const newDoc: DocumentItem = {
      id: `doc_job_${job.id}_${Date.now()}`, name: filename, customer: job.customer, employee: job.assignedEmployee || actor,
      vendor: "None", job: displayNumber(job), type: "Contracts", folder: "Jobs", uploadedBy: actor,
      date: new Date().toISOString().split("T")[0], size: `${Math.max(1, Math.ceil(bytes.length / 1024))} KB`, status: "Draft",
      isFavorite: false, isArchived: false, notes: "Generated from the Build Job popup.", tags: ["Job", "Generated"],
      estimateId: "None", invoiceId: "None", lastModified: new Date().toISOString().replace("T", " ").substring(0, 19)
    };
    if (pdfBase64.length <= MAX_INLINE_BASE64_LENGTH) {
      (newDoc as any).pdfBase64 = pdfBase64;
    } else {
      triggerNotification("This PDF is too large to store inline -- the Documents record was saved, but regenerate it for a fresh copy since the file itself wasn't attached.");
    }
    setDocuments(prev => [...prev, newDoc]);
  };

  const doSave = async (): Promise<SchedulingEvent | null> => {
    if (!canEdit) { triggerNotification("Your role cannot create or edit jobs."); return null; }
    if (savedJob && form.status === "Completed" && normalizedStatus(savedJob) !== "Completed" && !(await confirmJobCompletion(savedJob.id))) return null;
    const customer = customerOptions.find(c => c.id === form.customerId);
    const customerName = form.customerName.trim();
    const customerPhone = form.customerPhone.trim();
    const location = form.location.trim();
    const budget = Number(form.budget);
    if (!customerName || !location || !customerPhone || !form.date || !form.budget.trim() || !Number.isFinite(budget) || budget < 0) {
      triggerNotification("Name, address, phone number, estimated value, and date are required.");
      return null;
    }
    const jobTitle = form.title.trim() || "Service Job";
    let customerId = customer?.id || form.customerId || undefined;
    if (form.addAsNewCustomer) {
      const newCustomer = buildNewCustomerRecord({
        name: customerName, company: customerName, phone: customerPhone, email: form.customerEmail.trim(),
        address: location, createdFrom: "create_job", pendingConfirmation: true
      });
      customerId = newCustomer.id;
      setCustomers(prev => [newCustomer, ...prev]);
      setNotifications(prev => [{
        id: `customer_review_${customerId}`, screenId: "customers", title: "Edit and confirm new customer",
        description: `${customerName} was added while creating a job. Review and confirm the customer record.`,
        isRead: false, time: new Date().toISOString()
      }, ...prev]);
    }

    // Same reasoning as the prefill effect above: if this estimate's job was
    // created while the form was open (an automation got there first), save
    // these details onto that job rather than letting createJob drop them.
    const jobToUpdate = savedJob || (form.sourceEstimateId
      ? schedulingEvents.find(event => event.eventType === "Job" && event.sourceEstimateId === form.sourceEstimateId)
      : undefined);
    if (jobToUpdate) {
      const savedJob = jobToUpdate;
      const updated = updateJob(savedJob.id, {
        // Editing a record through Build Job means it either already was a
        // Job, or (e.g. someone switched a Scheduling event's type to
        // "Job" mid-edit and got routed here) is meant to become one --
        // either way, Build Job is the one place that owns "is this a
        // Job", so it stamps eventType itself rather than leaving whatever
        // the record started as.
        eventType: "Job",
        title: jobTitle, customType: jobTitle, jobType: form.jobType, date: form.date, startTime: form.startTime, endTime: form.endTime,
        customerId, customer: customerName, customerPhone, customerEmail: form.customerEmail.trim() || customer?.email || savedJob.customerEmail || "",
        customerAddress: location, location, assignedEmployee: form.assignedEmployee, assignedCrew: form.assignedCrew, assignedVehicle: form.assignedVehicle,
        priority: form.priority, status: form.assignedEmployee && form.status === "Unassigned" ? "Assigned" : form.status, department: form.department,
        description: form.description, notes: form.notes, purchaseOrder: form.purchaseOrder, budget, laborRate: Number(form.laborRate) || 0
      }, "Job details edited");
      if (updated) {
        try {
          // Do not tell the user a Job is saved until Firestore has actually
          // acknowledged the write. This prevents a fast logout/account switch
          // from dropping an optimistic local-only Job.
          await waitForPendingWrites(db);
        } catch (error) {
          console.error("Job update was not durably saved:", error);
          triggerNotification("Job update could not be confirmed saved. Please try Save again before leaving this account.");
          return null;
        }
        setSavedJob(updated);
        triggerNotification(`${displayNumber(updated)} updated.`);
      }
      return updated;
    }

    const created = createJob({
      customerId, customer: customerName, customerPhone, customerEmail: form.customerEmail.trim() || customer?.email,
      customerAddress: location, location, title: jobTitle, customType: jobTitle, jobType: form.jobType,
      date: form.date, startTime: form.startTime, endTime: form.endTime, assignedEmployee: form.assignedEmployee,
      assignedCrew: form.assignedCrew, assignedVehicle: form.assignedVehicle, priority: form.priority, department: form.department,
      description: form.description, notes: form.notes, purchaseOrder: form.purchaseOrder, budget, laborRate: Number(form.laborRate) || 0,
      status: form.status, sourceEstimateId: form.sourceEstimateId, sourceLeadId: form.sourceLeadId, source: form.source,
      sourceMembershipId: form.sourceMembershipId
    });
    try {
      // createJob updates UI state optimistically; wait for the corresponding
      // Firestore write to reach the server before the modal can close or the
      // user can move on assuming the Job is durable.
      await waitForPendingWrites(db);
    } catch (error) {
      console.error("Job creation was not durably saved:", error);
      triggerNotification("Job could not be confirmed saved. Please try Save again before leaving this account.");
      return null;
    }
    setSavedJob(created);
    triggerNotification(`${displayNumber(created)} created and published to Scheduling, Dispatch, Map, Time Clock, Messages, and the Event Engine.`);
    return created;
  };

  // Every save funnels into Job Tracking next -- the user asked for this to
  // be part of the flow every time a job is saved, not just something you
  // have to remember to click into. `runAfter` is what actually finishes
  // the save action (closing Build Job, navigating to Scheduling) once the
  // user is done with -- or skips/remind-later's past -- Job Tracking.
  const openTrackingThen = (job: SchedulingEvent, runAfter: () => void) => {
    setAfterTracking(() => runAfter);
    setIsTrackingOpen(true);
  };
  const handleSaveJob = async () => {
    const job = await doSave();
    if (!job) return;
    // Plain Save closes the form right away -- Job Tracking stays reachable
    // afterward from the Jobs list's own "Update Job Progress" button, so
    // nothing is lost by not funneling through it here.
    onClose();
  };
  const handleSaveAndPdf = async () => {
    const job = await doSave();
    if (!job) return;
    void storeJobPdf(job).then(() => openTrackingThen(job, onClose));
  };
  const finishScheduleNav = (job: SchedulingEvent) => { onClose(); navigateToScreen("scheduling", { customerId: job.customerId }); };
  const handleScheduleJob = async () => {
    const job = await doSave();
    if (!job) return;
    openTrackingThen(job, () => setEsignScheduleTarget(job));
  };
  const handleOpenTracking = () => {
    const job = savedJob || doSave();
    if (!job) return;
    setIsTrackingOpen(true);
  };
  // Closing Job Tracking (the X, Skip, or Remind Me Later) always runs
  // through here. When it was opened manually via the header button,
  // afterTracking is still null, so this just returns to Build Job --
  // matching the original design ("save job tracking, go back to build
  // job"). When it was opened automatically right after a save, this
  // finishes that save's own follow-through instead.
  const closeTracking = () => {
    setIsTrackingOpen(false);
    if (afterTracking) {
      const runAfter = afterTracking;
      setAfterTracking(null);
      runAfter();
    }
  };
  const handleSkipTracking = () => {
    triggerNotification("Job saved -- you can set up Job Tracking anytime from the job.");
    closeTracking();
  };
  const handleRemindLaterTracking = () => {
    if (savedJob) {
      setNotifications(prev => [{
        id: `job_tracking_reminder_${savedJob.id}_${Date.now()}`, screenId: "jobs", title: "Set up Job Tracking",
        description: `${displayNumber(savedJob)} — ${savedJob.customer} is waiting on a completion plan. Set one up when you have the specifics.`,
        isRead: false, time: new Date().toISOString()
      }, ...prev]);
    }
    triggerNotification("We'll remind you to set up Job Tracking later.");
    closeTracking();
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm" onMouseDown={(e: any) => e.target === e.currentTarget && onClose()}>
    <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#9EC8EF] bg-[#F5FAFF] shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#9EC8EF] bg-[#C7E3FA] px-4 py-3">
        <div><p className="text-[8px] font-black uppercase tracking-widest text-[#315C9F]">Job Record</p><h3 className="text-base font-black text-[#1F3557]">{savedJob ? `Edit Job — ${displayNumber(savedJob)}` : "Build Job"}</h3></div>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-white" aria-label="Close Build Job"><X className="h-4 w-4" /></button>
      </div>

      <div className="p-4 pb-0"><button type="button" onClick={handleOpenTracking} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white"><ClipboardCheck className="mr-1 inline h-4 w-4" />Job Tracking</button></div>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Select customer"><select value={form.addAsNewCustomer ? "__add__" : form.customerId} onChange={(e: any) => {
          if (e.target.value === "__add__") { setForm({ ...form, customerId: "", addAsNewCustomer: true, customerName: "", customerPhone: "", customerEmail: "", location: "" }); return; }
          const c = customerOptions.find((x: any) => x.id === e.target.value);
          setForm({ ...form, customerId: e.target.value, addAsNewCustomer: false, customerName: c ? (c.contact || c.company) : form.customerName, customerPhone: c?.phone || form.customerPhone, customerEmail: c?.email || form.customerEmail, location: c?.address || form.location });
        }} className="input"><option value="">Select customer...</option>{customerOptions.map((c: any) => <option key={c.id} value={c.id}>{c.contact || c.company}{c.contact && c.company ? ` — ${c.company}` : ""}</option>)}<option value="__add__">＋ Add customer</option></select>{form.addAsNewCustomer && <p className="mt-1 text-[10px] font-bold text-amber-700">Enter the new customer's details below. Customers will ask you to edit and confirm the record.</p>}</Field></div>
        <Field label="Name *"><input value={form.customerName} onChange={(e: any) => setForm({ ...form, customerName: e.target.value })} className="input" placeholder="Customer name" /></Field>
        <Field label="Phone number *"><input type="tel" value={form.customerPhone} onChange={(e: any) => setForm({ ...form, customerPhone: e.target.value })} className="input" placeholder="(555) 555-0123" /></Field>
        <div className="sm:col-span-2"><StructuredAddressFields value={form.location} onChange={(val: string) => setForm({ ...form, location: val })} required label="Job Site Address *" inputClassName="w-full rounded-xl border border-[#9EC8EF] bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-[#315C9F]" /></div>
        <Field label="Estimated value *"><input type="number" min="0" step="0.01" value={form.budget} onChange={(e: any) => setForm({ ...form, budget: e.target.value })} className="input" placeholder="0.00" /></Field>
        <Field label="Date *"><input type="date" value={form.date} onChange={(e: any) => setForm({ ...form, date: e.target.value })} className="input" /></Field>
      </div>
      <details className="group mx-4 mb-4 rounded-xl border border-[#9EC8EF] bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-black text-[#315C9F]">Other job info <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
        <div className="grid gap-3 border-t border-[#D7EAFB] p-3 sm:grid-cols-2">
          <Field label="Job title"><input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} className="input" placeholder="Repair, installation, inspection..." /></Field>
          <Field label="Job type"><select value={form.jobType} onChange={(e: any) => setForm({ ...form, jobType: e.target.value })} className="input">{["Service", "Installation", "Repair", "Maintenance", "Inspection", "Project", "Warranty", "Emergency", "Custom"].map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Department"><input value={form.department} onChange={(e: any) => setForm({ ...form, department: e.target.value })} className="input" /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Start"><input type="time" value={form.startTime} onChange={(e: any) => setForm({ ...form, startTime: e.target.value })} className="input" /></Field><Field label="End"><input type="time" value={form.endTime} onChange={(e: any) => setForm({ ...form, endTime: e.target.value })} className="input" /></Field></div>
          <Field label="Assigned technician"><AssignEmployeeField value={form.assignedEmployee} onChange={v => setForm({ ...form, assignedEmployee: v })} className="input" /></Field>
          <Field label="Crew"><input value={form.assignedCrew} onChange={(e: any) => setForm({ ...form, assignedCrew: e.target.value })} className="input" /></Field>
          <Field label="Vehicle"><input value={form.assignedVehicle} onChange={(e: any) => setForm({ ...form, assignedVehicle: e.target.value })} className="input" /></Field>
          <Field label="Status"><select value={form.status} onChange={(e: any) => setForm({ ...form, status: e.target.value })} className="input">{STATUSES.map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Priority"><select value={form.priority} onChange={(e: any) => setForm({ ...form, priority: e.target.value })} className="input">{PRIORITIES.map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="PO / Work order"><input value={form.purchaseOrder} onChange={(e: any) => setForm({ ...form, purchaseOrder: e.target.value })} className="input" /></Field>
          <Field label="Labor rate"><input type="number" min="0" value={form.laborRate} onChange={(e: any) => setForm({ ...form, laborRate: e.target.value })} className="input" /></Field>
          <div className="sm:col-span-2"><Field label="Scope / Description"><textarea rows={2} value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} className="input" /></Field></div>
          <div className="sm:col-span-2"><Field label="Internal notes"><textarea rows={2} value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} className="input" /></Field></div>
        </div>
      </details>
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[#9EC8EF] bg-[#EAF5FF] p-3">
        <button type="button" onClick={onClose} className="rounded-xl border border-[#9EC8EF] bg-white px-4 py-2 text-xs font-bold">Cancel</button>
        <button type="button" onClick={handleSaveJob} className="rounded-xl border border-[#315C9F] bg-white px-4 py-2 text-xs font-black text-[#315C9F]"><Check className="mr-1 inline h-4 w-4" />{savedJob ? "Save Changes" : "Save Job"}</button>
        <button type="button" onClick={handleSaveAndPdf} className="rounded-xl border border-emerald-600 bg-white px-4 py-2 text-xs font-black text-emerald-700"><FileText className="mr-1 inline h-4 w-4" />Save and Convert to PDF</button>
        <button type="button" onClick={handleScheduleJob} className="rounded-xl bg-[#315C9F] px-5 py-2 text-xs font-black text-white">Schedule Job</button>
      </div>
    </div>

    {isTrackingOpen && savedJob && businessId && <ProjectCompletionTracking
      job={savedJob} plan={completionPlans.find(plan => plan.jobId === savedJob.id)}
      businessId={businessId} actor={actor} canManage={canManageCompletion}
      canCreate={canManageCompletion} canRespond={isAssignedWorker(savedJob)} inventory={inventoryList}
      setPlans={setCompletionPlans} setDocuments={setDocuments} onClose={closeTracking} notify={triggerNotification}
      onSkip={handleSkipTracking} onRemindLater={handleRemindLaterTracking}
    />}
    <ESignChoiceModal
      isOpen={!!esignScheduleTarget}
      onClose={() => setEsignScheduleTarget(null)}
      label={esignScheduleTarget ? displayNumber(esignScheduleTarget) : ""}
      onSendRemote={() => { if (esignScheduleTarget) { const job = esignScheduleTarget; void storeJobPdf(job).then(() => triggerNotification(`${displayNumber(job)} saved to Documents -- open it anytime to send it for signing.`)); finishScheduleNav(job); } }}
      onSignInPerson={() => { if (esignScheduleTarget) { const job = esignScheduleTarget; void storeJobPdf(job).then(() => triggerNotification(`${displayNumber(job)} saved to Documents -- open it anytime to send it for signing.`)); finishScheduleNav(job); } }}
      onSkip={() => { if (esignScheduleTarget) finishScheduleNav(esignScheduleTarget); }}
      skipLabel="Skip"
      onRemindLater={() => { if (esignScheduleTarget) { triggerNotification(`We'll remind you to set up e-signing for ${displayNumber(esignScheduleTarget)}.`); finishScheduleNav(esignScheduleTarget); } }}
    />
  </div>;
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-[#5E7393]">{label}</span>{children}</label>;
