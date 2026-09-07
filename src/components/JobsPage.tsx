import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Briefcase, Calendar, Check, CheckCircle2, ChevronRight,
  ChevronDown, ClipboardCheck, Clock, DollarSign, Edit3, FileText, Filter, MapPin,
  MessageSquare, Package, Plus, Search, Send, Trash2, Truck, User, Users, X
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { StructuredAddressFields } from "./StructuredAddressFields";
import SendChoiceModal from "./SendChoiceModal";
import type { SchedulingEvent } from "../types/domain";
import type { ProjectCompletionPlan } from "../types/completion";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection";
import { hasPermission } from "../types/permissions";
import { ProjectCompletionTracking } from "./ProjectCompletionTracking";

type JobStatus = SchedulingEvent["status"];
type ViewMode = "board" | "list";

const STATUSES: JobStatus[] = ["Unassigned", "Assigned", "En Route", "Arrived", "Working", "On Hold", "Completed", "Cancelled"];
const PRIORITIES: SchedulingEvent["priority"][] = ["Low", "Medium", "High", "Urgent"];
const EMPTY_FORM = {
  customerId: "", addAsNewCustomer: false, customerName: "", customerPhone: "", title: "", jobType: "Service", date: new Date().toISOString().slice(0, 10),
  startTime: "09:00", endTime: "11:00", assignedEmployee: "", assignedCrew: "None",
  assignedVehicle: "None", priority: "Medium" as SchedulingEvent["priority"], status: "Unassigned" as JobStatus,
  location: "", department: "General", description: "", notes: "", purchaseOrder: "", budget: "", laborRate: ""
};

const statusStyle: Record<string, string> = {
  Unassigned: "bg-rose-50 text-rose-700 border-rose-200", Assigned: "bg-blue-50 text-blue-700 border-blue-200",
  "En Route": "bg-cyan-50 text-cyan-700 border-cyan-200", Arrived: "bg-violet-50 text-violet-700 border-violet-200",
  Working: "bg-amber-50 text-amber-800 border-amber-200", "On Hold": "bg-orange-50 text-orange-700 border-orange-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200", Cancelled: "bg-slate-100 text-slate-600 border-slate-200",
  Scheduled: "bg-blue-50 text-blue-700 border-blue-200"
};

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const displayNumber = (job: SchedulingEvent) => job.jobNumber || `JOB-${job.id.replace(/\D/g, "").slice(-6) || job.id.slice(-6).toUpperCase()}`;
const normalizedStatus = (job: SchedulingEvent): JobStatus => {
  const raw = String(job.status || "Unassigned").trim();
  const canonical = STATUSES.find(status => status.toLowerCase() === raw.toLowerCase());
  if (raw.toLowerCase() === "scheduled") return job.assignedEmployee ? "Assigned" : "Unassigned";
  return canonical || "Unassigned";
};

export const JobsPage: React.FC = () => {
  const { loggedInUser, simulatedRole, businessId } = useAuth();
  const { schedulingEvents, setSchedulingEvents, customers, setCustomers, setNotifications, recentRoster, inventoryList, setInventoryList, documents, setDocuments, timeClockLogs, estimates, setGeneratedPdfDraft, preSelectedCustomerId, setPreSelectedCustomerId } = useDomainData();
  const { navigateToScreen, logOperationalEvent, triggerNotification } = useNavTelemetry();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const actor = loggedInUser?.name || loggedInUser?.email || activeRole;
  const canEdit = /owner|manager|admin|dispatch|scheduler|supervisor/i.test(activeRole);
  const canDelete = /owner|general manager|admin/i.test(activeRole);
  const managementRole = /^(owner|manager|scheduler|dispatch)$/i.test(activeRole) || /manager/i.test(activeRole);
  const canManageCompletion = managementRole && (/^owner$/i.test(activeRole) || hasPermission(loggedInUser?.granularPermissions, "jobs", "edit") || !loggedInUser?.granularPermissions);
  const [completionPlans, setCompletionPlans] = useFirestoreCollection<ProjectCompletionPlan>("project_completion_plans", businessId);
  const jobs = useMemo(() => schedulingEvents.filter(e => e.eventType === "Job"), [schedulingEvents]);
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
  const [search, setSearch] = useState("");
  // Cross-navigation: "View Jobs" from a customer card lands here already
  // filtered to that customer's jobs.
  useEffect(() => {
    if (!preSelectedCustomerId) return;
    const match = customers.find(c => c.id === preSelectedCustomerId);
    if (match) setSearch(match.contact || match.company);
    setPreSelectedCustomerId(undefined);
  }, [preSelectedCustomerId, customers, setPreSelectedCustomerId]);
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [assigneeFilter, setAssigneeFilter] = useState("All");
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [newTask, setNewTask] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [materialQty, setMaterialQty] = useState(1);
  const [completionJobId, setCompletionJobId] = useState<string | null>(null);

  const selected = jobs.find(j => j.id === selectedId) || null;
  const completionJob = jobs.find(j => j.id === completionJobId) || null;
  const isAssignedWorker = (job: SchedulingEvent) => {
    const identity = [loggedInUser?.name, loggedInUser?.email].filter(Boolean).map(value => String(value).trim().toLowerCase());
    return identity.includes((job.assignedEmployee || "").trim().toLowerCase()) || identity.includes((job.assignedCrew || "").trim().toLowerCase());
  };
  const openCompletion = (job: SchedulingEvent) => {
    if (!canManageCompletion && !isAssignedWorker(job)) return triggerNotification("Only assigned workers or authorized management can access this completion plan.");
    setCompletionJobId(job.id);
  };
  const visibleJobs = useMemo(() => jobs.filter(job => {
    const q = search.toLowerCase();
    const haystack = [displayNumber(job), job.title, job.customer, job.customerPhone, job.location, job.assignedEmployee, job.notes].join(" ").toLowerCase();
    return (!q || haystack.includes(q)) &&
      (statusFilter === "All" || normalizedStatus(job) === statusFilter) &&
      (priorityFilter === "All" || job.priority === priorityFilter) &&
      (assigneeFilter === "All" || (assigneeFilter === "Unassigned" ? !job.assignedEmployee : job.assignedEmployee === assigneeFilter));
  }), [jobs, search, statusFilter, priorityFilter, assigneeFilter]);

  const stats = useMemo(() => ({
    open: jobs.filter(j => !["Completed", "Cancelled"].includes(normalizedStatus(j))).length,
    unassigned: jobs.filter(j => normalizedStatus(j) === "Unassigned").length,
    active: jobs.filter(j => ["En Route", "Arrived", "Working"].includes(normalizedStatus(j))).length,
    overdue: jobs.filter(j => !["Completed", "Cancelled"].includes(normalizedStatus(j)) && j.date < new Date().toISOString().slice(0, 10)).length,
    completed: jobs.filter(j => normalizedStatus(j) === "Completed").length
  }), [jobs]);

  const writeJob = (id: string, updates: Partial<SchedulingEvent>, action: string) => {
    if (!canEdit) return triggerNotification("Your role has view-only access to Jobs.");
    setSchedulingEvents(prev => prev.map(j => j.id === id ? {
      ...j, ...updates, updatedAt: new Date().toISOString(),
      activity: [...(j.activity || []), { id: uid("act"), timestamp: new Date().toISOString(), action, by: actor }]
    } : j));
    logOperationalEvent("Job Updated", `${displayNumber(jobs.find(j => j.id === id)!)} — ${action}`, "💼");
    triggerNotification(action);
  };

  const openCreate = () => { setForm(EMPTY_FORM); setModal("create"); };
  const openEdit = (job: SchedulingEvent) => {
    const customer = customers.find(c => c.id === job.customerId || c.contact === job.customer || c.company === job.customer);
    const sourceEstimate = estimates.find(e => e.id === job.sourceEstimateId);
    setForm({
      ...EMPTY_FORM, customerId: customer?.id || "", customerName: job.customer || customer?.contact || customer?.company || "",
      customerPhone: job.customerPhone || customer?.phone || "", title: job.title || job.customType || "", jobType: job.jobType || "Service",
      date: job.date, startTime: job.startTime?.replace(/\s?(AM|PM)$/i, "") || "09:00", endTime: job.endTime?.replace(/\s?(AM|PM)$/i, "") || "11:00",
      assignedEmployee: job.assignedEmployee || "", assignedCrew: job.assignedCrew || "None", assignedVehicle: job.assignedVehicle || "None",
      priority: job.priority, status: normalizedStatus(job), location: job.location || job.customerAddress || "", department: job.department || "General",
      description: job.description || "", notes: job.notes || "", purchaseOrder: job.purchaseOrder || "", budget: (job.budget ?? sourceEstimate?.amount)?.toString() || "", laborRate: job.laborRate?.toString() || ""
    });
    setSelectedId(job.id); setModal("edit");
  };

  const saveForm = (openPdf = false) => {
    if (!canEdit) return triggerNotification("Your role cannot create or edit jobs.");
    const customer = customerOptions.find(c => c.id === form.customerId);
    const customerName = form.customerName.trim();
    const customerPhone = form.customerPhone.trim();
    const location = form.location.trim();
    const budget = Number(form.budget);
    if (!customerName || !location || !customerPhone || !form.date || !form.budget.trim() || !Number.isFinite(budget) || budget < 0) {
      return triggerNotification("Name, address, phone number, estimated value, and date are required.");
    }
    const jobTitle = form.title.trim() || "Service Job";
    let customerId = customer?.id;
    if (form.addAsNewCustomer) {
      customerId = uid("cust");
      setCustomers(prev => [{
        id: customerId!, company: customerName, contact: customerName, phone: customerPhone,
        email: "", address: location, openJobs: 0, outstandingBalance: 0, lifetimeValue: 0,
        status: "Active", type: "Residential", isVIP: false, recentlyAdded: true,
        requireFollowUp: false, pendingConfirmation: true, createdFrom: "create_job"
      }, ...prev]);
      setNotifications(prev => [{
        id: `customer_review_${customerId}`, screenId: "customers", title: "Edit and confirm new customer",
        message: `${customerName} was added while creating a job. Review and confirm the customer record.`,
        isRead: false, timestamp: new Date().toISOString()
      }, ...prev]);
    }
    const base: Partial<SchedulingEvent> = {
      title: jobTitle, customType: jobTitle, jobType: form.jobType, date: form.date, startTime: form.startTime, endTime: form.endTime,
      customerId, customer: customerName, customerPhone,
      customerEmail: customer?.email || (modal === "edit" ? jobs.find(job => job.id === selectedId)?.customerEmail || "" : ""),
      customerAddress: location, location, assignedEmployee: form.assignedEmployee,
      assignedCrew: form.assignedCrew, assignedVehicle: form.assignedVehicle, priority: form.priority,
      status: form.assignedEmployee && form.status === "Unassigned" ? "Assigned" : form.status, department: form.department,
      description: form.description, notes: form.notes, purchaseOrder: form.purchaseOrder,
      budget, laborRate: Number(form.laborRate) || 0, updatedAt: new Date().toISOString()
    };
    if (modal === "edit" && selectedId) {
      writeJob(selectedId, base, "Job details edited");
      const updatedJob = jobs.find(job => job.id === selectedId);
      if (openPdf && updatedJob) generateJobPdf({...updatedJob,...base} as SchedulingEvent);
    } else {
      const now = new Date().toISOString();
      const job: SchedulingEvent = {
        id: uid("job"), eventType: "Job", jobNumber: `JOB-${new Date().getFullYear()}-${String(jobs.length + 1).padStart(4, "0")}`,
        progress: 0, checklist: [], materials: [], activity: [{ id: uid("act"), timestamp: now, action: "Job created", by: actor }], createdAt: now,
        ...base
      } as SchedulingEvent;
      setSchedulingEvents(prev => [job, ...prev]);
      setSelectedId(job.id);
      logOperationalEvent("Job Created", `${job.jobNumber} created for ${job.customer}`, "💼");
      triggerNotification(`${job.jobNumber} created and published to Scheduling, Dispatch, Map, Time Clock, Messages, and the Event Engine.`);
      if (openPdf) generateJobPdf(job);
    }
    setModal(null);
  };

  // Native window.confirm() blocks the JS main thread until dismissed -- in
  // some embedded/automated contexts it never gets dismissed, which reads as
  // the whole page freezing. Route confirmations through in-app UI instead.
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const requestConfirm = (message: string, onConfirm: () => void) => setConfirmState({ message, onConfirm });

  const deleteJob = (job: SchedulingEvent) => {
    if (!canDelete) return triggerNotification("Only an Owner, General Manager, or Admin can delete jobs.");
    requestConfirm(`Delete ${displayNumber(job)}? This cannot be undone.`, () => {
      setSchedulingEvents(prev => prev.filter(j => j.id !== job.id));
      setSelectedId(null);
      logOperationalEvent("Job Deleted", `${displayNumber(job)} deleted`, "🗑️");
    });
  };

  const addTask = () => {
    if (!selected || !newTask.trim()) return;
    writeJob(selected.id, { checklist: [...(selected.checklist || []), { id: uid("task"), label: newTask.trim(), completed: false }] }, `Checklist item added: ${newTask.trim()}`);
    setNewTask("");
  };
  const toggleTask = (taskId: string) => {
    if (!selected) return;
    const checklist = (selected.checklist || []).map(t => t.id === taskId ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : undefined, completedBy: !t.completed ? actor : undefined } : t);
    const done = checklist.filter(t => t.completed).length;
    writeJob(selected.id, { checklist, progress: checklist.length ? Math.round(done / checklist.length * 100) : 0 }, "Checklist progress updated");
  };
  const allocateMaterial = () => {
    if (!selected || !materialId || materialQty <= 0) return;
    const item = inventoryList.find(i => i.id === materialId);
    if (!item) return;
    if (item.quantity < materialQty) return triggerNotification(`Only ${item.quantity} ${item.unit} available.`);
    setInventoryList(prev => prev.map(i => i.id === item.id ? {
      ...i, quantity: i.quantity - materialQty, lastUpdated: new Date().toISOString(),
      usageHistory: [...(i.usageHistory || []), { date: new Date().toISOString(), jobName: displayNumber(selected), amount: materialQty, employee: actor }]
    } : i));
    writeJob(selected.id, { materials: [...(selected.materials || []), { inventoryId: item.id, name: item.name, quantity: materialQty, unitCost: item.unitCost }] }, `${materialQty} ${item.unit} ${item.name} allocated from Inventory`);
    setMaterialId(""); setMaterialQty(1);
  };

  const estimatedAmount = (job: SchedulingEvent) => estimates.find(e => e.id === job.sourceEstimateId)?.amount || job.budget || 0;
  const laborHours = (job: SchedulingEvent) => timeClockLogs.filter(l => l.jobId === job.id && l.type === "Clock Out").length;
  const materialCost = (job: SchedulingEvent) => (job.materials || []).reduce((s, m) => s + m.quantity * m.unitCost, 0);
  const generateJobPdf = (job: SchedulingEvent) => {
    setGeneratedPdfDraft({filename:`${displayNumber(job)}.pdf`,title:`Job ${displayNumber(job)}`,sourceType:"Job",sourceId:job.id,customerName:job.customer,customerPhone:job.customerPhone,customerEmail:job.customerEmail,representativeName:job.assignedEmployee||actor,lines:[`Customer: ${job.customer}`,`Phone: ${job.customerPhone||"—"}`,`Address: ${job.location||job.customerAddress||"—"}`,`Date: ${job.date} ${job.startTime||""}`,`Status: ${normalizedStatus(job)}`,`Priority: ${job.priority}`,`Estimated value: $${Number(estimatedAmount(job)).toLocaleString()}`,"",`Description: ${job.description||job.notes||"—"}`]});
    navigateToScreen("documents");
  };

  return <div className="space-y-5 animate-fade-in text-left">
    <div className="rounded-3xl border border-[#9EC8EF] bg-[#C7E3FA] p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#315C9F]">Job Management</p><h2 className="text-xl font-black text-[#1F3557]">Jobs</h2><p className="text-xs font-semibold text-[#5E7393]">Manage job details, status, assignments, and materials in one place.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigateToScreen("dispatch")} className="rounded-xl border border-[#9EC8EF] bg-[#EAF5FF] px-3 py-2 text-xs font-bold text-[#315C9F]"><Truck className="mr-1 inline h-4 w-4"/>Dispatch</button>
          <button onClick={() => navigateToScreen("routes")} className="rounded-xl border border-[#9EC8EF] bg-[#EAF5FF] px-3 py-2 text-xs font-bold text-[#315C9F]"><MapPin className="mr-1 inline h-4 w-4"/>Map</button>
          {canEdit && <button onClick={openCreate} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white shadow"><Plus className="mr-1 inline h-4 w-4"/>New Job</button>}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Open Jobs",stats.open,Briefcase],["Unassigned",stats.unassigned,AlertTriangle],["In Progress",stats.active,Clock],["Overdue",stats.overdue,Calendar],["Completed",stats.completed,CheckCircle2]].map(([label,value,Icon]: any)=><button key={label} onClick={()=>label==="Unassigned"&&setStatusFilter("Unassigned")} className="rounded-2xl border border-[#9EC8EF] bg-[#EAF5FF] p-3 text-left"><Icon className="h-4 w-4 text-[#4A86F7]"/><p className="mt-2 text-xl font-black text-[#1F3557]">{value}</p><p className="text-[9px] font-bold uppercase tracking-wide text-[#5E7393]">{label}</p></button>)}
      </div>
    </div>

    <div className="rounded-2xl border border-[#9EC8EF] bg-[#EAF5FF] p-3 shadow-sm">
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <label className="flex items-center gap-2 rounded-xl border border-[#9EC8EF] bg-white px-3"><Search className="h-4 w-4 text-[#5E7393]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job #, customer, address, phone, technician..." className="w-full bg-transparent py-2.5 text-xs outline-none"/></label>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="rounded-xl border border-[#9EC8EF] bg-white px-3 py-2 text-xs font-bold"><option>All</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select>
        <select value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)} className="rounded-xl border border-[#9EC8EF] bg-white px-3 py-2 text-xs font-bold"><option>All</option>{PRIORITIES.map(s=><option key={s}>{s}</option>)}</select>
        <select value={assigneeFilter} onChange={e=>setAssigneeFilter(e.target.value)} className="rounded-xl border border-[#9EC8EF] bg-white px-3 py-2 text-xs font-bold"><option>All</option><option>Unassigned</option>{recentRoster.map(r=><option key={r.id||r.name}>{r.name}</option>)}</select>
        <button onClick={()=>setViewMode(viewMode==="board"?"list":"board")} className="rounded-xl border border-[#9EC8EF] bg-white px-3 py-2 text-xs font-bold text-[#315C9F]"><Filter className="mr-1 inline h-4 w-4"/>{viewMode==="board"?"List":"Board"}</button>
      </div>
    </div>

    {visibleJobs.length===0 ? <div className="rounded-3xl border-2 border-dashed border-[#9EC8EF] bg-[#EAF5FF] p-12 text-center"><Briefcase className="mx-auto h-10 w-10 text-[#9EC8EF]"/><p className="mt-3 text-sm font-black text-[#1F3557]">No jobs match these filters</p><p className="text-xs text-[#5E7393]">Create a job or clear the filters.</p></div> : viewMode==="board" ?
      <div className="grid gap-4 xl:grid-cols-3">{visibleJobs.map(job=><JobCard key={job.id} job={job} onOpen={()=>setSelectedId(job.id)} onTracking={()=>openCompletion(job)} estimatedAmount={estimatedAmount(job)}/>)}</div> :
      <div className="overflow-x-auto rounded-2xl border border-[#9EC8EF] bg-white"><table className="w-full min-w-[900px] text-xs"><thead className="bg-[#C7E3FA] text-[9px] uppercase tracking-wide text-[#5E7393]"><tr>{["Job","Customer","Schedule","Assigned","Priority","Status","Value",""] .map(h=><th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr></thead><tbody>{visibleJobs.map(job=><tr key={job.id} className="border-t border-blue-100 hover:bg-blue-50"><td className="px-4 py-3 font-black text-[#1F3557]">{displayNumber(job)}<p className="font-semibold text-[#5E7393]">{job.title||job.customType||"Service Job"}</p></td><td className="px-4 py-3">{job.customer}</td><td className="px-4 py-3">{job.date} {job.startTime}</td><td className="px-4 py-3">{job.assignedEmployee||"Unassigned"}</td><td className="px-4 py-3">{job.priority}</td><td className="px-4 py-3"><StatusBadge status={normalizedStatus(job)}/></td><td className="px-4 py-3 font-bold">${estimatedAmount(job).toLocaleString()}</td><td className="px-4 py-3"><div className="flex gap-3"><button onClick={()=>setSelectedId(job.id)} className="font-bold text-[#315C9F]">Open <ChevronRight className="inline h-4 w-4"/></button><button onClick={()=>openCompletion(job)} className="font-bold text-emerald-700">Completion</button></div></td></tr>)}</tbody></table></div>}

    {selected && <div className="fixed inset-0 z-[80] flex justify-end bg-slate-900/50 backdrop-blur-sm" onMouseDown={e=>e.target===e.currentTarget&&setSelectedId(null)}><div className="h-full w-full max-w-2xl overflow-y-auto bg-[#F5FAFF] shadow-2xl">
      <div className="sticky top-0 z-10 border-b border-[#9EC8EF] bg-[#C7E3FA] p-5"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-[#315C9F]">{displayNumber(selected)}</p><h3 className="text-xl font-black text-[#1F3557]">{selected.title||selected.customType||"Service Job"}</h3><p className="text-xs font-semibold text-[#5E7393]">{selected.customer}</p></div><button onClick={()=>setSelectedId(null)} className="rounded-full p-2 hover:bg-white"><X className="h-5 w-5"/></button></div><div className="mt-4 flex flex-wrap gap-2"><StatusBadge status={normalizedStatus(selected)}/><button onClick={()=>generateJobPdf(selected)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><FileText className="mr-1 inline h-3.5 w-3.5"/>Generate PDF</button><button disabled={!selected.customerPhone&&!selected.customerEmail} onClick={()=>setIsSendOpen(true)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#315C9F] disabled:opacity-40 disabled:cursor-not-allowed"><Send className="mr-1 inline h-3.5 w-3.5"/>Send</button>{canEdit&&<button onClick={()=>openEdit(selected)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#315C9F]"><Edit3 className="mr-1 inline h-3.5 w-3.5"/>Edit</button>}{canDelete&&<button onClick={()=>deleteJob(selected)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600"><Trash2 className="mr-1 inline h-3.5 w-3.5"/>Delete</button>}</div></div>
      <div className="space-y-5 p-5">
        <button onClick={()=>openCompletion(selected)} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white"><ClipboardCheck className="mr-1 inline h-4 w-4"/>Project Completion Tracking</button>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Date",selected.date,Calendar],["Time",`${selected.startTime}–${selected.endTime}`,Clock],["Technician",selected.assignedEmployee||"Unassigned",User],["Priority",selected.priority,AlertTriangle]].map(([l,v,I]:any)=><div key={l} className="rounded-xl border border-[#9EC8EF] bg-white p-3"><I className="h-4 w-4 text-[#4A86F7]"/><p className="mt-2 text-[9px] font-bold uppercase text-[#5E7393]">{l}</p><p className="truncate text-xs font-black text-[#1F3557]">{v}</p></div>)}</section>
        <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4"><h4 className="text-xs font-black uppercase text-[#1F3557]">Customer & Site</h4><div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><p><User className="mr-2 inline h-4 w-4 text-[#4A86F7]"/>{selected.customer}</p><p><MapPin className="mr-2 inline h-4 w-4 text-[#4A86F7]"/>{selected.location||selected.customerAddress||"No site address"}</p><p>{selected.customerPhone||"No phone"}</p><p>{selected.customerEmail||"No email"}</p></div>{selected.description&&<p className="mt-3 border-t border-blue-100 pt-3 text-xs text-slate-600">{selected.description}</p>}</section>
        <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4"><div className="flex justify-between"><h4 className="text-xs font-black uppercase text-[#1F3557]"><ClipboardCheck className="mr-1 inline h-4 w-4"/>Work Checklist</h4><b className="text-xs text-[#315C9F]">{selected.progress||0}%</b></div><div className="mt-3 h-2 overflow-hidden rounded bg-blue-100"><div className="h-full bg-emerald-500" style={{width:`${selected.progress||0}%`}}/></div><div className="mt-3 space-y-2">{(selected.checklist||[]).map(t=><label key={t.id} className="flex items-center gap-2 rounded-lg bg-blue-50 p-2 text-xs"><input type="checkbox" checked={t.completed} onChange={()=>toggleTask(t.id)} disabled={!canEdit}/><span className={t.completed?"line-through text-slate-400":"font-semibold text-slate-700"}>{t.label}</span></label>)}{!(selected.checklist||[]).length&&<p className="text-xs text-slate-400">No checklist items yet.</p>}</div>{canEdit&&<div className="mt-3 flex gap-2"><input value={newTask} onChange={e=>setNewTask(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()} placeholder="Add work step or inspection item" className="flex-1 rounded-lg border border-[#9EC8EF] px-3 py-2 text-xs"/><button onClick={addTask} className="rounded-lg bg-[#315C9F] px-3 text-white"><Plus className="h-4 w-4"/></button></div>}</section>
        <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4"><h4 className="text-xs font-black uppercase text-[#1F3557]"><Package className="mr-1 inline h-4 w-4"/>Materials & Inventory</h4><div className="mt-3 space-y-2">{(selected.materials||[]).map((m,i)=><div key={`${m.inventoryId}-${i}`} className="flex justify-between rounded-lg bg-blue-50 p-2 text-xs"><span>{m.quantity} × {m.name}</span><b>${(m.quantity*m.unitCost).toFixed(2)}</b></div>)}{!(selected.materials||[]).length&&<p className="text-xs text-slate-400">No material allocated.</p>}</div>{canEdit&&<div className="mt-3 grid grid-cols-[1fr_70px_auto] gap-2"><select value={materialId} onChange={e=>setMaterialId(e.target.value)} className="rounded-lg border border-[#9EC8EF] px-2 text-xs"><option value="">Select inventory item</option>{inventoryList.map(i=><option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit})</option>)}</select><input type="number" min="1" value={materialQty} onChange={e=>setMaterialQty(Number(e.target.value))} className="rounded-lg border border-[#9EC8EF] px-2 text-xs"/><button onClick={allocateMaterial} className="rounded-lg bg-[#315C9F] px-3 py-2 text-xs font-bold text-white">Allocate</button></div>}</section>
        <section className="grid gap-3 sm:grid-cols-3">{[["Estimate / Budget",estimatedAmount(selected),DollarSign],["Materials Used",materialCost(selected),Package],["Clock-out Records",laborHours(selected),Clock]].map(([l,v,I]:any)=><div key={l} className="rounded-xl border border-[#9EC8EF] bg-white p-3"><I className="h-4 w-4 text-[#4A86F7]"/><p className="mt-2 text-[9px] font-bold uppercase text-[#5E7393]">{l}</p><p className="text-lg font-black text-[#1F3557]">{l==="Clock-out Records"?v:`$${Number(v).toLocaleString()}`}</p></div>)}</section>
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["scheduling","Schedule",Calendar],["dispatch","Dispatch",Truck],["documents","Documents",FileText],["messages","Messages",MessageSquare]].map(([id,label,I]:any)=><button key={id} onClick={()=>navigateToScreen(id)} className="rounded-xl border border-[#9EC8EF] bg-white p-3 text-xs font-bold text-[#315C9F]"><I className="mx-auto mb-1 h-4 w-4"/>{label}{id==="documents"&&<span className="ml-1">({documents.filter(d=>d.job===selected.id||d.job===displayNumber(selected)).length})</span>}</button>)}</section>
        <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4"><h4 className="text-xs font-black uppercase text-[#1F3557]">Activity Timeline</h4><div className="mt-3 space-y-3">{[...(selected.activity||[])].reverse().map(a=><div key={a.id} className="border-l-2 border-blue-300 pl-3"><p className="text-xs font-bold text-slate-700">{a.action}</p><p className="text-[9px] text-slate-400">{new Date(a.timestamp).toLocaleString()} · {a.by}</p></div>)}{!(selected.activity||[]).length&&<p className="text-xs text-slate-400">Future changes will appear here automatically.</p>}</div></section>
      </div></div></div>}

    {modal && <JobForm
      form={form} setForm={setForm} customers={customerOptions} roster={recentRoster}
      onClose={()=>setModal(null)} onSave={()=>saveForm(false)} onGenerate={()=>saveForm(true)} title={modal==="create"?"Create Job":"Edit Job"}
    />}
    {completionJob && businessId && <ProjectCompletionTracking
      job={completionJob} plan={completionPlans.find(plan=>plan.jobId===completionJob.id)}
      businessId={businessId} actor={actor} canManage={canManageCompletion}
      canCreate={canManageCompletion || isAssignedWorker(completionJob)} inventory={inventoryList}
      setPlans={setCompletionPlans} setDocuments={setDocuments} onClose={()=>setCompletionJobId(null)} notify={triggerNotification}
    />}
    {confirmState && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4" onMouseDown={e=>e.target===e.currentTarget&&setConfirmState(null)}><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><p className="text-sm font-bold text-[#1F3557]">{confirmState.message}</p><div className="mt-4 flex justify-end gap-2"><button onClick={()=>setConfirmState(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button><button onClick={()=>{const run=confirmState.onConfirm;setConfirmState(null);run();}} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white">Confirm</button></div></div></div>}
    <SendChoiceModal isOpen={isSendOpen} onClose={()=>setIsSendOpen(false)} label={selected?displayNumber(selected):"job"} phone={selected?.customerPhone} email={selected?.customerEmail} />
  </div>;
};

const StatusBadge = ({status}:{status:JobStatus}) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${statusStyle[status]||statusStyle.Scheduled}`}>{status}</span>;

const JobCard = ({job,onOpen,onTracking,estimatedAmount}:{key?: React.Key;job:SchedulingEvent;onOpen:()=>void;onTracking:()=>void;estimatedAmount:number}) => {
  const tasks=job.checklist||[], done=tasks.filter(t=>t.completed).length;
  return <div className="group rounded-2xl border border-[#9EC8EF] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><button onClick={onOpen} className="w-full text-left"><div className="flex items-start justify-between"><div><p className="font-mono text-[9px] font-black uppercase tracking-wider text-[#315C9F]">{displayNumber(job)}</p><h3 className="mt-1 text-sm font-black text-[#1F3557]">{job.title||job.customType||"Service Job"}</h3><p className="text-xs font-semibold text-[#5E7393]">{job.customer}</p></div><StatusBadge status={normalizedStatus(job)}/></div><div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-slate-600"><p><Calendar className="mr-1 inline h-3.5 w-3.5 text-[#4A86F7]"/>{job.date} · {job.startTime}</p><p><User className="mr-1 inline h-3.5 w-3.5 text-[#4A86F7]"/>{job.assignedEmployee||"Unassigned"}</p><p className="col-span-2 truncate"><MapPin className="mr-1 inline h-3.5 w-3.5 text-[#4A86F7]"/>{job.location||job.customerAddress||"No site address"}</p></div></button><div className="mt-4 flex items-center justify-between border-t border-blue-100 pt-3"><span className="text-[9px] font-bold uppercase text-[#5E7393]">{done}/{tasks.length} tasks · {job.priority}</span><button onClick={onTracking} className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[10px] font-black text-emerald-700">Project Completion Tracking</button></div></div>;
};

const JobForm = ({form,setForm,customers,roster,onClose,onSave,onGenerate,title}:any) => <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm" onMouseDown={(e:any)=>e.target===e.currentTarget&&onClose()}><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#9EC8EF] bg-[#F5FAFF] shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#9EC8EF] bg-[#C7E3FA] px-4 py-3"><div><p className="text-[8px] font-black uppercase tracking-widest text-[#315C9F]">Job Record</p><h3 className="text-base font-black text-[#1F3557]">{title}</h3></div><button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-white" aria-label="Close job form"><X className="h-4 w-4"/></button></div>
  <div className="grid gap-3 p-4 sm:grid-cols-2">
    <div className="sm:col-span-2"><Field label="Select customer"><select value={form.addAsNewCustomer?"__add__":form.customerId} onChange={(e:any)=>{if(e.target.value==="__add__"){setForm({...form,customerId:"",addAsNewCustomer:true,customerName:"",customerPhone:"",location:""});return;}const c=customers.find((x:any)=>x.id===e.target.value);setForm({...form,customerId:e.target.value,addAsNewCustomer:false,customerName:c?(c.contact||c.company):form.customerName,customerPhone:c?.phone||form.customerPhone,location:c?.address||form.location});}} className="input"><option value="">Select customer...</option>{customers.map((c:any)=><option key={c.id} value={c.id}>{c.contact || c.company}{c.contact&&c.company?` — ${c.company}`:""}</option>)}<option value="__add__">＋ Add customer</option></select>{form.addAsNewCustomer&&<p className="mt-1 text-[10px] font-bold text-amber-700">Enter the new customer's details below. Customers will ask you to edit and confirm the record.</p>}</Field></div>
    <Field label="Name *"><input value={form.customerName} onChange={(e:any)=>setForm({...form,customerName:e.target.value})} className="input" placeholder="Customer name"/></Field>
    <Field label="Phone number *"><input type="tel" value={form.customerPhone} onChange={(e:any)=>setForm({...form,customerPhone:e.target.value})} className="input" placeholder="(555) 555-0123"/></Field>
    <div className="sm:col-span-2"><StructuredAddressFields value={form.location} onChange={(val:string)=>setForm({...form,location:val})} required label="Job Site Address *" inputClassName="w-full rounded-xl border border-[#9EC8EF] bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-[#315C9F]"/></div>
    <Field label="Estimated value *"><input type="number" min="0" step="0.01" value={form.budget} onChange={(e:any)=>setForm({...form,budget:e.target.value})} className="input" placeholder="0.00"/></Field>
    <Field label="Date *"><input type="date" value={form.date} onChange={(e:any)=>setForm({...form,date:e.target.value})} className="input"/></Field>
  </div>
  <details className="group mx-4 mb-4 rounded-xl border border-[#9EC8EF] bg-white">
    <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-black text-[#315C9F]">Other job info <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180"/></summary>
    <div className="grid gap-3 border-t border-[#D7EAFB] p-3 sm:grid-cols-2">
      <Field label="Job title"><input value={form.title} onChange={(e:any)=>setForm({...form,title:e.target.value})} className="input" placeholder="Repair, installation, inspection..."/></Field>
      <Field label="Job type"><select value={form.jobType} onChange={(e:any)=>setForm({...form,jobType:e.target.value})} className="input">{["Service","Installation","Repair","Maintenance","Inspection","Project","Warranty","Emergency","Custom"].map(x=><option key={x}>{x}</option>)}</select></Field>
      <Field label="Department"><input value={form.department} onChange={(e:any)=>setForm({...form,department:e.target.value})} className="input"/></Field>
      <div className="grid grid-cols-2 gap-2"><Field label="Start"><input type="time" value={form.startTime} onChange={(e:any)=>setForm({...form,startTime:e.target.value})} className="input"/></Field><Field label="End"><input type="time" value={form.endTime} onChange={(e:any)=>setForm({...form,endTime:e.target.value})} className="input"/></Field></div>
      <Field label="Assigned technician"><select value={form.assignedEmployee} onChange={(e:any)=>setForm({...form,assignedEmployee:e.target.value})} className="input"><option value="">Unassigned</option>{roster.map((r:any)=><option key={r.id||r.name} value={r.name}>{r.name}</option>)}</select></Field>
      <Field label="Crew"><input value={form.assignedCrew} onChange={(e:any)=>setForm({...form,assignedCrew:e.target.value})} className="input"/></Field>
      <Field label="Vehicle"><input value={form.assignedVehicle} onChange={(e:any)=>setForm({...form,assignedVehicle:e.target.value})} className="input"/></Field>
      <Field label="Status"><select value={form.status} onChange={(e:any)=>setForm({...form,status:e.target.value})} className="input">{STATUSES.map(x=><option key={x}>{x}</option>)}</select></Field>
      <Field label="Priority"><select value={form.priority} onChange={(e:any)=>setForm({...form,priority:e.target.value})} className="input">{PRIORITIES.map(x=><option key={x}>{x}</option>)}</select></Field>
      <Field label="PO / Work order"><input value={form.purchaseOrder} onChange={(e:any)=>setForm({...form,purchaseOrder:e.target.value})} className="input"/></Field>
      <Field label="Labor rate"><input type="number" min="0" value={form.laborRate} onChange={(e:any)=>setForm({...form,laborRate:e.target.value})} className="input"/></Field>
      <div className="sm:col-span-2"><Field label="Scope / Description"><textarea rows={2} value={form.description} onChange={(e:any)=>setForm({...form,description:e.target.value})} className="input"/></Field></div>
      <div className="sm:col-span-2"><Field label="Internal notes"><textarea rows={2} value={form.notes} onChange={(e:any)=>setForm({...form,notes:e.target.value})} className="input"/></Field></div>
    </div>
  </details>
  <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#9EC8EF] bg-[#EAF5FF] p-3"><button type="button" onClick={onClose} className="rounded-xl border border-[#9EC8EF] bg-white px-4 py-2 text-xs font-bold">Cancel</button><button type="button" onClick={onGenerate} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white"><FileText className="mr-1 inline h-4 w-4"/>Generate PDF</button><button type="button" onClick={onSave} className="rounded-xl bg-[#315C9F] px-5 py-2 text-xs font-black text-white"><Check className="mr-1 inline h-4 w-4"/>Save Job</button></div>
</div></div>;

const Field=({label,children}:{label:string;children:React.ReactNode})=><label className="block"><span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-[#5E7393]">{label}</span>{children}</label>;
