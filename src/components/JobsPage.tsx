import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Briefcase, Calendar, CheckCircle2, ChevronRight,
  ClipboardCheck, Clock, DollarSign, Edit3, FileText, Filter, MapPin,
  MessageSquare, Package, Plus, Search, Send, Trash2, Truck, User, Users, X
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import SendChoiceModal from "./SendChoiceModal";
import type { SchedulingEvent, WorkOrder, DocumentItem } from "../types/domain";
import { buildTextDocumentPdf, bytesToBase64 } from "../lib/pdfExport";
import { MAX_INLINE_BASE64_LENGTH } from "../lib/firestoreDocumentLimits";
import type { ProjectCompletionPlan } from "../types/completion";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection";
import { hasEffectivePermission } from "../types/permissions";
import { ProjectCompletionTracking } from "./ProjectCompletionTracking";
import { computeJobCosting } from "../lib/jobCostingEngine";
import { WorkOrderBuilder } from "./WorkOrderBuilder";
import { PriceBookModal } from "./PriceBookModal";
import { CreateMembershipPicker } from "./CreateMembershipPicker";
import { MembershipBuilder } from "./MembershipBuilder";
import type { Membership } from "../types/membership";
import { CreatePurchaseOrderPicker } from "./CreatePurchaseOrderPicker";
import { PurchaseOrderBuilder } from "./PurchaseOrderBuilder";
import type { PurchaseOrder } from "../types/purchaseOrder";
import { CustomerPortalControls } from "./CustomerPortalControls";
import { ReviewRequestControls } from "./ReviewRequestControls";
import { resolveCustomerByIdOrName } from "../lib/resolveCustomer";
import { BuildJobModal } from "./BuildJobModal";
import { AssignEmployeeField } from "./AssignEmployeeField";
import type { BuildJobPrefill } from "../types/generatedPdf";
import { OwnerProtectionPanel, levelStyle } from "./OwnerProtectionPanel";
import { OPEN_JOB_KEY, useAllProtection } from "../hooks/useOwnerProtection";
import { NoTapEntryLauncher } from "./NoTapEntry";

type JobStatus = SchedulingEvent["status"];
type ViewMode = "board" | "list";

const STATUSES: JobStatus[] = ["Unassigned", "Assigned", "En Route", "Arrived", "Working", "On Hold", "Completed", "Cancelled"];
const PRIORITIES: SchedulingEvent["priority"][] = ["Low", "Medium", "High", "Urgent"];

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
  const { schedulingEvents, setSchedulingEvents, customers, recentRoster, inventoryList, setInventoryList, documents, setDocuments, timeClockLogs, estimates, employees, transactions, payrollWorkweekStart, workOrders, memberships, purchaseOrders, setGeneratedPdfDraft, preSelectedCustomerId, setPreSelectedCustomerId, businessProfile, buildJobPrefill, setBuildJobPrefill } = useDomainData();
  const [isWorkOrderBuilderOpen, setIsWorkOrderBuilderOpen] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrder | null>(null);
  const [workOrderPrefill, setWorkOrderPrefill] = useState<Partial<WorkOrder> | undefined>(undefined);
  const [isMembershipPickerOpen, setIsMembershipPickerOpen] = useState(false);
  const [membershipPrefillBase, setMembershipPrefillBase] = useState<Partial<Membership> | undefined>(undefined);
  const [editingMembership, setEditingMembership] = useState<Membership | null>(null);
  const [isMembershipBuilderOpen, setIsMembershipBuilderOpen] = useState(false);
  const [isPurchaseOrderPickerOpen, setIsPurchaseOrderPickerOpen] = useState(false);
  const [purchaseOrderPrefillBase, setPurchaseOrderPrefillBase] = useState<Partial<PurchaseOrder> | undefined>(undefined);
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [isPurchaseOrderBuilderOpen, setIsPurchaseOrderBuilderOpen] = useState(false);
  const [isPriceBookOpen, setIsPriceBookOpen] = useState(false);
  const { navigateToScreen, logOperationalEvent, triggerNotification } = useNavTelemetry();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const actor = loggedInUser?.name || loggedInUser?.email || activeRole;
  const isOwner = activeRole.trim().toLowerCase() === "owner";
  // Real sessions obey the Owner-configured Jobs permission matrix. Keep the
  // existing role-name behavior only for Workspace Simulator previews, which
  // do not carry a real employee permission payload.
  const previewCanEdit = /owner|manager|admin|dispatch|scheduler|supervisor/i.test(activeRole);
  const previewCanDelete = /owner|general manager|admin/i.test(activeRole);
  const canEdit = simulatedRole
    ? previewCanEdit
    : isOwner || hasEffectivePermission(loggedInUser?.granularPermissions, loggedInUser?.permissions, "jobs", "edit");
  const canDelete = simulatedRole
    ? previewCanDelete
    : isOwner || hasEffectivePermission(loggedInUser?.granularPermissions, loggedInUser?.permissions, "jobs", "delete");
  const canManageCompletion = canEdit;
  const [completionPlans, setCompletionPlans] = useFirestoreCollection<ProjectCompletionPlan>("project_completion_plans", businessId);
  const jobs = useMemo(() => schedulingEvents.filter(e => e.eventType === "Job"), [schedulingEvents]);
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
  const [quickFilter, setQuickFilter] = useState<"" | "open" | "active" | "overdue">("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [assigneeFilter, setAssigneeFilter] = useState("All");
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [createPrefill, setCreatePrefill] = useState<BuildJobPrefill | null>(null);
  // Cross-navigation: a Lead, a Customer, an accepted Estimate, or the Map
  // queues buildJobPrefill and lands here -- this opens the exact same
  // Build Job popup as the "New Job" button, just pre-filled.
  useEffect(() => {
    if (!buildJobPrefill) return;
    setCreatePrefill(buildJobPrefill);
    setSelectedId(null);
    setModal("create");
    setBuildJobPrefill(null);
  }, [buildJobPrefill, setBuildJobPrefill]);
  const [materialId, setMaterialId] = useState("");
  const [materialQty, setMaterialQty] = useState(1);
  const [completionJobId, setCompletionJobId] = useState<string | null>(null);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const { views: protectionViews } = useAllProtection();
  const protectionByJob = useMemo(() => new Map(protectionViews.map(v => [v.job.id, v.protection])), [protectionViews]);
  // Owner Protection dashboard / completion warning: "open this job" handoff.
  const [focusSection, setFocusSection] = useState<"protection" | "timeline" | null>(null);
  useEffect(() => {
    const raw = sessionStorage.getItem(OPEN_JOB_KEY);
    if (!raw) return;
    sessionStorage.removeItem(OPEN_JOB_KEY);
    try {
      const { jobId, focus } = JSON.parse(raw);
      if (typeof jobId === "string") { setSelectedId(jobId); setFocusSection(focus === "timeline" ? "timeline" : "protection"); }
    } catch { /* ignore a malformed handoff */ }
  }, []);
  useEffect(() => {
    if (!focusSection || !selectedId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(focusSection === "timeline" ? "proof-timeline-section" : "owner-protection-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [focusSection, selectedId]);

  const selected = jobs.find(j => j.id === selectedId) || null;
  const selectedCompletionPlan = selected ? completionPlans.find(plan => plan.jobId === selected.id) : undefined;
  const selectedCompletedGoals = selectedCompletionPlan?.goals.filter(goal => goal.completed || goal.status === "Completed").length || 0;
  const selectedGoalProgress = selectedCompletionPlan?.goals.length ? Math.round((selectedCompletedGoals / selectedCompletionPlan.goals.length) * 100) : 0;
  const jobCosting = useMemo(
    () => selected ? computeJobCosting(selected, estimates, timeClockLogs, employees, transactions, payrollWorkweekStart) : null,
    [selected, estimates, timeClockLogs, employees, transactions, payrollWorkweekStart]
  );
  const completionJob = jobs.find(j => j.id === completionJobId) || null;
  const isAssignedWorker = (job: SchedulingEvent) => {
    const identity = [loggedInUser?.name, loggedInUser?.email].filter(Boolean).map(value => String(value).trim().toLowerCase());
    return identity.includes((job.assignedEmployee || "").trim().toLowerCase()) || identity.includes((job.assignedCrew || "").trim().toLowerCase());
  };
  const openCompletion = (job: SchedulingEvent) => {
    if (!canManageCompletion && !isAssignedWorker(job)) return triggerNotification("Only assigned workers or authorized management can access this completion plan.");
    setCompletionJobId(job.id);
  };
  const today = new Date().toISOString().slice(0, 10);
  const visibleJobs = useMemo(() => jobs.filter(job => {
    const q = search.toLowerCase();
    const haystack = [displayNumber(job), job.title, job.customer, job.customerPhone, job.location, job.assignedEmployee, job.notes].join(" ").toLowerCase();
    const matchesQuick = quickFilter === "" ? true
      : quickFilter === "open" ? !["Completed", "Cancelled"].includes(normalizedStatus(job))
      : quickFilter === "active" ? ["En Route", "Arrived", "Working"].includes(normalizedStatus(job))
      : !["Completed", "Cancelled"].includes(normalizedStatus(job)) && job.date < today;
    return (!q || haystack.includes(q)) &&
      (statusFilter === "All" || normalizedStatus(job) === statusFilter) &&
      (priorityFilter === "All" || job.priority === priorityFilter) &&
      (assigneeFilter === "All" || (assigneeFilter === "Unassigned" ? !job.assignedEmployee : job.assignedEmployee === assigneeFilter)) &&
      matchesQuick;
  }), [jobs, search, statusFilter, priorityFilter, assigneeFilter, quickFilter, today]);

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

  const openCreate = () => { setCreatePrefill(null); setModal("create"); };
  const openEdit = (job: SchedulingEvent) => { setSelectedId(job.id); setModal("edit"); };
  const assignSelectedJob = (assignee: string) => {
    if (!selected) return;
    const cleanAssignee = assignee.trim();
    writeJob(
      selected.id,
      { assignedEmployee: cleanAssignee, status: cleanAssignee ? "Assigned" : "Unassigned" },
      cleanAssignee ? `Assigned to ${cleanAssignee}` : "Job unassigned"
    );
    setShowAssignMenu(false);
  };

  // Native window.confirm() blocks the JS main thread until dismissed -- in
  // some embedded/automated contexts it never gets dismissed, which reads as
  // the whole page freezing. Route confirmations through in-app UI instead.
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const requestConfirm = (message: string, onConfirm: () => void) => setConfirmState({ message, onConfirm });

  const deleteJob = (job: SchedulingEvent) => {
    if (!canDelete) return triggerNotification("You do not have Delete permission for Jobs.");
    requestConfirm(`Delete ${displayNumber(job)}? This cannot be undone.`, () => {
      setSchedulingEvents(prev => prev.filter(j => j.id !== job.id));
      setSelectedId(null);
      logOperationalEvent("Job Deleted", `${displayNumber(job)} deleted`, "🗑️");
    });
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
  const jobPdfLines = (job: SchedulingEvent) => [`Customer: ${job.customer}`,`Phone: ${job.customerPhone||"—"}`,`Address: ${job.location||job.customerAddress||"—"}`,`Date: ${job.date} ${job.startTime||""}`,`Status: ${normalizedStatus(job)}`,`Priority: ${job.priority}`,`Estimated value: $${Number(estimatedAmount(job)).toLocaleString()}`,"",`Description: ${job.description||job.notes||"—"}`];
  const generateJobPdf = (job: SchedulingEvent) => {
    setGeneratedPdfDraft({filename:`${displayNumber(job)}.pdf`,title:`Job ${displayNumber(job)}`,sourceType:"Job",sourceId:job.id,customerName:job.customer,customerPhone:job.customerPhone,customerEmail:job.customerEmail,representativeName:job.assignedEmployee||actor,lines:jobPdfLines(job)});
    navigateToScreen("documents");
  };

  // "Save (and Store as PDF)" -- unlike the other pages' Generate PDF
  // (which only queues a freeform draft for the PDF Editor to render),
  // this builds real PDF bytes right now via the generic section-based
  // builder and stores it straight into Documents, without opening the
  // editor.
  const storeJobPdf = async (job: SchedulingEvent) => {
    const bytes = await buildTextDocumentPdf(`Job ${displayNumber(job)}`, [{ body: jobPdfLines(job).join("\n") }], businessProfile);
    const pdfBase64 = bytesToBase64(bytes);
    const filename = `${displayNumber(job)}.pdf`;
    const newDoc: DocumentItem = {
      id: `doc_job_${job.id}_${Date.now()}`,
      name: filename,
      customer: job.customer,
      employee: job.assignedEmployee || actor,
      vendor: "None",
      job: displayNumber(job),
      type: "Contracts",
      folder: "Jobs",
      uploadedBy: actor,
      date: new Date().toISOString().split("T")[0],
      size: `${Math.max(1, Math.ceil(bytes.length / 1024))} KB`,
      status: "Draft",
      isFavorite: false,
      isArchived: false,
      notes: "Generated from the Jobs page.",
      tags: ["Job", "Generated"],
      estimateId: "None",
      invoiceId: "None",
      lastModified: new Date().toISOString().replace("T", " ").substring(0, 19)
    };
    if (pdfBase64.length <= MAX_INLINE_BASE64_LENGTH) {
      (newDoc as any).pdfBase64 = pdfBase64;
    } else {
      triggerNotification("This PDF is too large to store inline -- the Documents record was saved, but regenerate it for a fresh copy since the file itself wasn't attached.");
    }
    setDocuments(prev => [...prev, newDoc]);
    if (logOperationalEvent) logOperationalEvent("Job PDF Stored", `${filename} saved to Documents`, "📄");
  };

  return <div className="space-y-5 animate-fade-in text-left">
    <div className="rounded-3xl border border-[#9EC8EF] bg-[#C7E3FA] p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#315C9F]">Jobs</p><h2 className="text-xl font-black text-[#1F3557]">Jobs</h2><p className="text-xs font-semibold text-[#5E7393]">View job details, assign employees, track progress, and record materials.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigateToScreen("dispatch")} className="rounded-xl border border-[#9EC8EF] bg-[#EAF5FF] px-3 py-2 text-xs font-bold text-[#315C9F]"><Truck className="mr-1 inline h-4 w-4"/>Dispatch</button>
          <button onClick={() => setIsPriceBookOpen(true)} className="rounded-xl border border-[#9EC8EF] bg-[#EAF5FF] px-3 py-2 text-xs font-bold text-[#315C9F]">💲 Price Book</button>
          <button onClick={() => navigateToScreen("routes")} className="rounded-xl border border-[#9EC8EF] bg-[#EAF5FF] px-3 py-2 text-xs font-bold text-[#315C9F]"><MapPin className="mr-1 inline h-4 w-4"/>Map</button>
          {canEdit && <button onClick={openCreate} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white shadow"><Plus className="mr-1 inline h-4 w-4"/>New Job</button>}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {([
          ["Open Jobs", stats.open, Briefcase, quickFilter === "open", () => { setStatusFilter("All"); setQuickFilter(prev => prev === "open" ? "" : "open"); }],
          ["Unassigned", stats.unassigned, AlertTriangle, statusFilter === "Unassigned", () => { setQuickFilter(""); setStatusFilter(prev => prev === "Unassigned" ? "All" : "Unassigned"); }],
          ["In Progress", stats.active, Clock, quickFilter === "active", () => { setStatusFilter("All"); setQuickFilter(prev => prev === "active" ? "" : "active"); }],
          ["Overdue", stats.overdue, Calendar, quickFilter === "overdue", () => { setStatusFilter("All"); setQuickFilter(prev => prev === "overdue" ? "" : "overdue"); }],
          ["Completed", stats.completed, CheckCircle2, statusFilter === "Completed", () => { setQuickFilter(""); setStatusFilter(prev => prev === "Completed" ? "All" : "Completed"); }],
        ] as const).map(([label, value, Icon, isActive, onClick]) => <button key={label} onClick={onClick} className={`rounded-2xl border p-3 text-left transition ${isActive ? "border-[#315C9F] bg-[#C7E3FA] ring-2 ring-[#315C9F]" : "border-[#9EC8EF] bg-[#EAF5FF]"}`}><Icon className="h-4 w-4 text-[#4A86F7]"/><p className="mt-2 text-xl font-black text-[#1F3557]">{value}</p><p className="text-[9px] font-bold uppercase tracking-wide text-[#5E7393]">{label}</p></button>)}
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

    {visibleJobs.length===0 ? <div className="rounded-3xl border-2 border-dashed border-[#9EC8EF] bg-[#EAF5FF] p-12 text-center"><Briefcase className="mx-auto h-10 w-10 text-[#9EC8EF]"/><p className="mt-3 text-sm font-black text-[#1F3557]">No jobs found.</p><p className="text-xs text-[#5E7393]">Clear your filters or select New Job.</p></div> : viewMode==="board" ?
      <div className="grid gap-4 xl:grid-cols-3">{visibleJobs.map(job=><JobCard key={job.id} job={job} protection={protectionByJob.get(job.id)} plan={completionPlans.find(plan=>plan.jobId===job.id)} onOpen={()=>setSelectedId(job.id)} onTracking={()=>openCompletion(job)} estimatedAmount={estimatedAmount(job)}/>)}</div> :
      <div className="overflow-x-auto rounded-2xl border border-[#9EC8EF] bg-white"><table className="w-full min-w-[900px] text-xs"><thead className="bg-[#C7E3FA] text-[9px] uppercase tracking-wide text-[#5E7393]"><tr>{["Job","Customer","Schedule","Assigned","Priority","Status","Value",""] .map(h=><th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr></thead><tbody>{visibleJobs.map(job=><tr key={job.id} className="border-t border-blue-100 hover:bg-blue-50"><td className="px-4 py-3 font-black text-[#1F3557]">{displayNumber(job)}<p className="font-semibold text-[#5E7393]">{job.title||job.customType||"Service Job"}</p></td><td className="px-4 py-3">{job.customer}</td><td className="px-4 py-3">{job.date} {job.startTime}</td><td className="px-4 py-3">{job.assignedEmployee||"Unassigned"}</td><td className="px-4 py-3">{job.priority}</td><td className="px-4 py-3"><StatusBadge status={normalizedStatus(job)}/></td><td className="px-4 py-3 font-bold">${estimatedAmount(job).toLocaleString()}</td><td className="px-4 py-3"><div className="flex gap-3"><button onClick={()=>setSelectedId(job.id)} className="font-bold text-[#315C9F]">Open <ChevronRight className="inline h-4 w-4"/></button><button onClick={()=>openCompletion(job)} className="font-bold text-emerald-700">Job Tracking</button></div></td></tr>)}</tbody></table></div>}

    {selected && <div className="fixed inset-0 z-[80] flex justify-end bg-slate-900/50 backdrop-blur-sm" onMouseDown={e=>{if(e.target===e.currentTarget){setSelectedId(null);setFocusSection(null);}}}><div className="h-full w-full max-w-2xl overflow-y-auto bg-[#F5FAFF] shadow-2xl">
      <div className="sticky top-0 z-10 border-b border-[#9EC8EF] bg-[#C7E3FA] p-5">
        <div className="flex items-start justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-[#315C9F]">{displayNumber(selected)}</p><h3 className="text-xl font-black text-[#1F3557]">{selected.title||selected.customType||"Service Job"}</h3><p className="text-xs font-semibold text-[#5E7393]">{selected.customer}</p></div>
          <button onClick={()=>{setShowAssignMenu(false);setSelectedId(null);setFocusSection(null)}} className="rounded-full p-2 hover:bg-white"><X className="h-5 w-5"/></button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge status={normalizedStatus(selected)}/>
          {protectionByJob.get(selected.id)&&<button onClick={()=>document.getElementById("owner-protection-section")?.scrollIntoView({behavior:"smooth",block:"start"})} className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${levelStyle[protectionByJob.get(selected.id)!.level]}`}>🛡️ {protectionByJob.get(selected.id)!.score}%</button>}
          {canEdit&&<button onClick={()=>setShowAssignMenu(value=>!value)} className="rounded-lg bg-[#315C9F] px-3 py-1.5 text-xs font-bold text-white"><Users className="mr-1 inline h-3.5 w-3.5"/>Assign To</button>}
          <button onClick={()=>void storeJobPdf(selected)} className="rounded-lg border border-emerald-600 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700"><FileText className="mr-1 inline h-3.5 w-3.5"/>Store as PDF</button>
          <button onClick={()=>generateJobPdf(selected)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><FileText className="mr-1 inline h-3.5 w-3.5"/>Generate PDF</button>
          <button onClick={()=>{setEditingWorkOrder(null);setWorkOrderPrefill({sourceJobId:selected.id,customerId:selected.customerId,customerName:selected.customer,customerPhone:selected.customerPhone,customerEmail:selected.customerEmail,address:selected.location||selected.customerAddress,jobDescription:selected.description||selected.title||"",estimatedValue:jobCosting?.estimatedRevenue,date:new Date().toISOString().slice(0,10)});setIsWorkOrderBuilderOpen(true);}} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#315C9F]">🧰 Create Work Order</button>
          <button disabled={!selected.customerPhone&&!selected.customerEmail} onClick={()=>setIsSendOpen(true)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#315C9F] disabled:opacity-40 disabled:cursor-not-allowed"><Send className="mr-1 inline h-3.5 w-3.5"/>Send</button>
          {canEdit&&<button onClick={()=>openEdit(selected)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#315C9F]"><Edit3 className="mr-1 inline h-3.5 w-3.5"/>Edit</button>}
          {canDelete&&<button onClick={()=>deleteJob(selected)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600"><Trash2 className="mr-1 inline h-3.5 w-3.5"/>Delete</button>}
        </div>
        {canEdit&&showAssignMenu&&<div className="mt-2 flex items-center gap-2 rounded-xl border border-[#9EC8EF] bg-white p-2 shadow-sm">
          <span className="shrink-0 text-[10px] font-black uppercase text-[#5E7393]">Assign to</span>
          <AssignEmployeeField
            value={selected.assignedEmployee||""}
            onChange={assignSelectedJob}
            className="min-w-0 flex-1 rounded-lg border border-[#9EC8EF] bg-white px-3 py-2 text-xs font-bold text-[#1F3557]"
          />
          <button onClick={()=>setShowAssignMenu(false)} className="rounded-lg px-2 py-2 text-[10px] font-bold text-slate-500">Cancel</button>
        </div>}
      </div>
      <div className="space-y-5 p-5">
        <NoTapEntryLauncher key={`notap-${selected.id}`} job={selected} />
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Date",selected.date,Calendar],["Time",`${selected.startTime}–${selected.endTime}`,Clock],["Technician",selected.assignedEmployee||"Unassigned",User],["Priority",selected.priority,AlertTriangle]].map(([l,v,I]:any)=><div key={l} className="rounded-xl border border-[#9EC8EF] bg-white p-3"><I className="h-4 w-4 text-[#4A86F7]"/><p className="mt-2 text-[9px] font-bold uppercase text-[#5E7393]">{l}</p><p className="truncate text-xs font-black text-[#1F3557]">{v}</p></div>)}</section>
        <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4"><h4 className="text-xs font-black uppercase text-[#1F3557]">Customer & Site</h4><div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><p><User className="mr-2 inline h-4 w-4 text-[#4A86F7]"/>{selected.customer}</p><p><MapPin className="mr-2 inline h-4 w-4 text-[#4A86F7]"/>{selected.location||selected.customerAddress||"No site address"}</p><p>{selected.customerPhone||"No phone"}</p><p>{selected.customerEmail||"No email"}</p></div>{selected.description&&<p className="mt-3 border-t border-blue-100 pt-3 text-xs text-slate-600">{selected.description}</p>}<div className="mt-3 border-t border-blue-100 pt-3"><CustomerPortalControls customer={resolveCustomerByIdOrName(customers, selected.customerId, selected.customer)} /></div><div className="mt-3 border-t border-blue-100 pt-3"><ReviewRequestControls customer={resolveCustomerByIdOrName(customers, selected.customerId, selected.customer)} jobId={selected.id} jobDescription={selected.title || selected.description} /></div></section>
        <OwnerProtectionPanel key={selected.id} job={selected} canEdit={canEdit} focusTimeline={focusSection === "timeline"} />
        <section id="job-tracking-section" className="rounded-2xl border border-[#9EC8EF] bg-white p-4 scroll-mt-28">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-black uppercase text-[#1F3557]"><ClipboardCheck className="mr-1 inline h-4 w-4"/>Job Tracking</h4>
            <b className="text-xs text-[#315C9F]">{selectedGoalProgress}%</b>
          </div>
          <div className="mt-3">
            {businessId ? <ProjectCompletionTracking
              inline
              job={selected}
              plan={selectedCompletionPlan}
              businessId={businessId}
              actor={actor}
              canManage={canManageCompletion}
              canCreate={canManageCompletion}
              canRespond={isAssignedWorker(selected)}
              inventory={inventoryList}
              setPlans={setCompletionPlans}
              setDocuments={setDocuments}
              onClose={()=>{}}
              notify={triggerNotification}
            /> : <p className="text-xs text-slate-500">Job Tracking will be available once the business account is loaded.</p>}
          </div>
        </section>
        <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4"><h4 className="text-xs font-black uppercase text-[#1F3557]"><Package className="mr-1 inline h-4 w-4"/>Materials & Inventory</h4><div className="mt-3 space-y-2">{(selected.materials||[]).map((m,i)=><div key={`${m.inventoryId}-${i}`} className="flex justify-between rounded-lg bg-blue-50 p-2 text-xs"><span>{m.quantity} × {m.name}</span><b>${(m.quantity*m.unitCost).toFixed(2)}</b></div>)}{!(selected.materials||[]).length&&<p className="text-xs text-slate-400">No material allocated.</p>}</div>{canEdit&&<div className="mt-3 grid grid-cols-[1fr_70px_auto] gap-2"><select value={materialId} onChange={e=>setMaterialId(e.target.value)} className="rounded-lg border border-[#9EC8EF] px-2 text-xs"><option value="">Select inventory item</option>{inventoryList.map(i=><option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit})</option>)}</select><input type="number" min="1" value={materialQty} onChange={e=>setMaterialQty(Number(e.target.value))} className="rounded-lg border border-[#9EC8EF] px-2 text-xs"/><button onClick={allocateMaterial} className="rounded-lg bg-[#315C9F] px-3 py-2 text-xs font-bold text-white">Allocate</button></div>}</section>
        {jobCosting && <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase text-[#1F3557]"><DollarSign className="mr-1 inline h-4 w-4"/>Job Costing</h4>
            <span className="text-[9px] font-bold text-[#5E7393]">{jobCosting.laborHours.toFixed(1)} labor hrs</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Estimated Revenue", jobCosting.estimatedRevenue],
              ["Labor Cost", jobCosting.laborCost],
              ["Material Cost", jobCosting.materialCost],
              ["Other Costs", jobCosting.otherCost],
              ["Total Cost", jobCosting.totalCost],
              ["Profit", jobCosting.grossProfit],
            ].map(([l, v]: any) => <div key={l} className="rounded-xl border border-[#9EC8EF] bg-blue-50/60 p-3">
              <p className="text-[9px] font-bold uppercase text-[#5E7393]">{l}</p>
              <p className={`text-sm font-black ${l==="Profit"?(v<0?"text-rose-600":"text-emerald-700"):"text-[#1F3557]"}`}>{v<0?"-":""}${Math.abs(Number(v)).toLocaleString(undefined,{maximumFractionDigits:2})}</p>
            </div>)}
            <div className="rounded-xl border border-[#9EC8EF] bg-blue-50/60 p-3 sm:col-span-2">
              <p className="text-[9px] font-bold uppercase text-[#5E7393]">Margin</p>
              <p className={`text-sm font-black ${jobCosting.marginPercent==null?"text-[#5E7393]":jobCosting.marginPercent<0?"text-rose-600":"text-emerald-700"}`}>{jobCosting.marginPercent==null?"— (no estimate)":`${jobCosting.marginPercent.toFixed(1)}%`}</p>
            </div>
          </div>
        </section>}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["scheduling","Schedule",Calendar],["dispatch","Dispatch",Truck],["documents","Documents",FileText],["messages","Messages",MessageSquare]].map(([id,label,I]:any)=><button key={id} onClick={()=>navigateToScreen(id)} className="rounded-xl border border-[#9EC8EF] bg-white p-3 text-xs font-bold text-[#315C9F]"><I className="mx-auto mb-1 h-4 w-4"/>{label}{id==="documents"&&<span className="ml-1">({documents.filter(d=>d.job===selected.id||d.job===displayNumber(selected)).length})</span>}</button>)}
          {(() => {
            const linkedWorkOrders = workOrders.filter(w => w.sourceJobId === selected.id);
            return <button
              onClick={() => {
                if (linkedWorkOrders.length) { setEditingWorkOrder(linkedWorkOrders[0]); setWorkOrderPrefill(undefined); }
                else { setEditingWorkOrder(null); setWorkOrderPrefill({ sourceJobId: selected.id, customerId: selected.customerId, customerName: selected.customer, jobDescription: selected.description || selected.title || "", date: new Date().toISOString().slice(0, 10) }); }
                setIsWorkOrderBuilderOpen(true);
              }}
              className="rounded-xl border border-[#9EC8EF] bg-white p-3 text-xs font-bold text-[#315C9F]"
            >
              <span className="mx-auto mb-1 block text-center">🧰</span>Work Orders<span className="ml-1">({linkedWorkOrders.length})</span>
            </button>;
          })()}
          {(() => {
            const linkedMemberships = memberships.filter(m => m.sourceJobId === selected.id);
            return <button
              onClick={() => {
                if (linkedMemberships.length) { setEditingMembership(linkedMemberships[0]); setIsMembershipBuilderOpen(true); }
                else {
                  setMembershipPrefillBase({ sourceJobId: selected.id, customerId: selected.customerId, customerName: selected.customer, customerPhone: selected.customerPhone, address: selected.location || selected.customerAddress });
                  setIsMembershipPickerOpen(true);
                }
              }}
              className="rounded-xl border border-[#9EC8EF] bg-white p-3 text-xs font-bold text-[#315C9F]"
            >
              <span className="mx-auto mb-1 block text-center">📜</span>Memberships<span className="ml-1">({linkedMemberships.length})</span>
            </button>;
          })()}
          {(() => {
            const linkedPOs = purchaseOrders.filter(p => p.sourceJobId === selected.id);
            return <button
              onClick={() => {
                if (linkedPOs.length) { setEditingPurchaseOrder(linkedPOs[0]); setIsPurchaseOrderBuilderOpen(true); }
                else {
                  setPurchaseOrderPrefillBase({ sourceJobId: selected.id });
                  setIsPurchaseOrderPickerOpen(true);
                }
              }}
              className="rounded-xl border border-[#9EC8EF] bg-white p-3 text-xs font-bold text-[#315C9F]"
            >
              <span className="mx-auto mb-1 block text-center">🧾</span>Purchase Orders<span className="ml-1">({linkedPOs.length})</span>
            </button>;
          })()}
        </section>
        <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4"><h4 className="text-xs font-black uppercase text-[#1F3557]">Activity Timeline</h4><div className="mt-3 space-y-3">{[...(selected.activity||[])].reverse().map(a=><div key={a.id} className="border-l-2 border-blue-300 pl-3"><p className="text-xs font-bold text-slate-700">{a.action}</p><p className="text-[9px] text-slate-400">{new Date(a.timestamp).toLocaleString()} · {a.by}</p></div>)}{!(selected.activity||[]).length&&<p className="text-xs text-slate-400">Future changes will appear here automatically.</p>}</div></section>
      </div></div></div>}

    <BuildJobModal isOpen={modal !== null} onClose={()=>setModal(null)} editingJob={modal==="edit" ? selected : null} prefill={modal==="create" ? createPrefill : null} />
    {completionJob && businessId && <ProjectCompletionTracking
      job={completionJob} plan={completionPlans.find(plan=>plan.jobId===completionJob.id)}
      businessId={businessId} actor={actor} canManage={canManageCompletion}
      canCreate={canManageCompletion} canRespond={isAssignedWorker(completionJob)} inventory={inventoryList}
      setPlans={setCompletionPlans} setDocuments={setDocuments} onClose={()=>setCompletionJobId(null)} notify={triggerNotification}
    />}
    {confirmState && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4" onMouseDown={e=>e.target===e.currentTarget&&setConfirmState(null)}><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><p className="text-sm font-bold text-[#1F3557]">{confirmState.message}</p><div className="mt-4 flex justify-end gap-2"><button onClick={()=>setConfirmState(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button><button onClick={()=>{const run=confirmState.onConfirm;setConfirmState(null);run();}} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white">Confirm</button></div></div></div>}
    <SendChoiceModal isOpen={isSendOpen} onClose={()=>setIsSendOpen(false)} label={selected?displayNumber(selected):"job"} phone={selected?.customerPhone} email={selected?.customerEmail} />
    <WorkOrderBuilder isOpen={isWorkOrderBuilderOpen} onClose={()=>setIsWorkOrderBuilderOpen(false)} prefill={workOrderPrefill} editingWorkOrder={editingWorkOrder} />
    <CreateMembershipPicker isOpen={isMembershipPickerOpen} onClose={()=>setIsMembershipPickerOpen(false)} prefillBase={membershipPrefillBase} />
    <MembershipBuilder isOpen={isMembershipBuilderOpen} onClose={()=>setIsMembershipBuilderOpen(false)} editingMembership={editingMembership} onSaved={()=>setEditingMembership(null)} />
    <CreatePurchaseOrderPicker isOpen={isPurchaseOrderPickerOpen} onClose={()=>setIsPurchaseOrderPickerOpen(false)} prefillBase={purchaseOrderPrefillBase} />
    <PurchaseOrderBuilder isOpen={isPurchaseOrderBuilderOpen} onClose={()=>setIsPurchaseOrderBuilderOpen(false)} editingPurchaseOrder={editingPurchaseOrder} onSaved={()=>setEditingPurchaseOrder(null)} />
    <PriceBookModal isOpen={isPriceBookOpen} onClose={()=>setIsPriceBookOpen(false)} />
  </div>;
};

const StatusBadge = ({status}:{status:JobStatus}) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${statusStyle[status]||statusStyle.Scheduled}`}>{status}</span>;

const JobCard = ({job,plan,protection,onOpen,onTracking,estimatedAmount}:{key?: React.Key;job:SchedulingEvent;plan?:ProjectCompletionPlan;protection?:{score:number;level:string};onOpen:()=>void;onTracking:()=>void;estimatedAmount:number}) => {
  const goals=plan?.goals||[], done=goals.filter(goal=>goal.completed||goal.status==="Completed").length;
  return <div className="group rounded-2xl border border-[#9EC8EF] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onOpen();}}} className="w-full text-left cursor-pointer"><div className="flex items-start justify-between"><div><p className="font-mono text-[9px] font-black uppercase tracking-wider text-[#315C9F]">{displayNumber(job)}</p><h3 className="mt-1 text-sm font-black text-[#1F3557]">{job.title||job.customType||"Service Job"}</h3><p className="text-xs font-semibold text-[#5E7393]">{job.customer}</p></div><StatusBadge status={normalizedStatus(job)}/></div><div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-slate-600"><p><Calendar className="mr-1 inline h-3.5 w-3.5 text-[#4A86F7]"/>{job.date} · {job.startTime}</p><p><User className="mr-1 inline h-3.5 w-3.5 text-[#4A86F7]"/>{job.assignedEmployee||"Unassigned"}</p><p className="col-span-2 truncate"><MapPin className="mr-1 inline h-3.5 w-3.5 text-[#4A86F7]"/>{job.location||job.customerAddress||"No site address"}</p></div></div><div className="mt-4 flex items-center justify-between border-t border-blue-100 pt-3"><span className="text-[9px] font-bold uppercase text-[#5E7393]">{done}/{goals.length} goals · {job.priority}{protection&&<span className={`ml-1.5 rounded-full border px-1.5 py-0.5 ${levelStyle[protection.level]}`}>🛡️ {protection.score}%</span>}</span><button onClick={onTracking} className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[10px] font-black text-emerald-700">Edit/View Job Tracking</button></div></div>;
};

