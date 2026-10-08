import React, { useEffect, useState } from "react";
import { confirmJobCompletion } from "../lib/completionGuard";
import { CheckCircle2, ChevronDown, ChevronRight, FileUp, Plus, Save, Trash2, X } from "lucide-react";
import { doc, setDoc, waitForPendingWrites } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import type { InventoryItem, DocumentItem, SchedulingEvent } from "../types/domain";
import type { CompletionGoal, CompletionGoalStatus, ProjectCompletionPlan } from "../types/completion";
import { approveCompletionMaterial } from "../lib/completionService";
import { useDomainData } from "../context/DomainDataContext";
import { resolveCustomerByIdOrName } from "../lib/resolveCustomer";
import { ReviewRequestControls } from "./ReviewRequestControls";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { buildJobInvoicePrefill } from "../lib/jobInvoiceHandoff";

const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();
const blankGoal = (): CompletionGoal => ({ id: id("goal"), title: "", estimatedStartDate: "", estimatedCompletionDate: "", instructions: "", status: "Not Started", completed: false, completedOnSchedule: false, actualCompletionDate: "", projectNotes: "", issuesDuringCompletion: "", materials: [], attachments: [], managerReviewed: false, managerReviewNotes: "" });
const activity = (action: string, by: string, detail?: string) => ({ id: id("act"), action, detail, by, at: now() });

export function ProjectCompletionTracking(props: {
  job: SchedulingEvent; plan?: ProjectCompletionPlan; businessId: string; actor: string; canManage: boolean; canCreate?: boolean; canRespond?: boolean; inline?: boolean;
  inventory: InventoryItem[]; setPlans: React.Dispatch<React.SetStateAction<ProjectCompletionPlan[]>>;
  setDocuments: React.Dispatch<React.SetStateAction<DocumentItem[]>>; onClose: () => void; notify: (message: string) => void;
  /** Only set when this popup was opened automatically right after a job
   * was just saved (see BuildJobModal) -- lets someone who doesn't have the
   * completion-plan specifics on hand yet bail out without losing the job
   * they just created. Not shown when Job Tracking is opened manually
   * (e.g. from the Jobs page's own detail view), where there's nothing to
   * skip past. */
  onSkip?: () => void;
  onRemindLater?: () => void;
}) {
  const { job, plan, businessId, actor, canManage, canCreate = canManage, canRespond = false, inline = false, inventory, setPlans, setDocuments, onClose, notify, onSkip, onRemindLater } = props;
  const { loggedInUser } = useAuth();
  const { customers, setSchedulingEvents } = useDomainData();
  const { navigateToScreen } = useNavTelemetry();
  const [draft, setDraft] = useState<ProjectCompletionPlan | null>(plan || null);
  const [busy, setBusy] = useState(false);
  const [showInlineSetup, setShowInlineSetup] = useState(false);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  useEffect(() => setDraft(plan || null), [plan]);

  // Native window.confirm() blocks the JS main thread until dismissed — in
  // some embedded/automated contexts it never gets dismissed, which reads as
  // the whole page freezing. Route confirmations through in-app UI instead.
  const requestConfirm = (message: string, onConfirm: () => void) => setConfirmState({ message, onConfirm });

  const createPlan = () => {
    if (!canCreate) return;
    const stamp = now();
    const next: ProjectCompletionPlan = { id: job.id, jobId: job.id, businessId, summary: "", overallGoal: "", projectStartDate: job.date || "", estimatedCompletionDate: "", goals: [], activity: [activity("Completion plan created", actor)], finalCloseoutApproved: false, createdBy: actor, createdAt: stamp, updatedAt: stamp };
    setPlans(prev => [next, ...prev.filter(item => item.id !== next.id)]); setDraft(next);
  };
  const persist = (next: ProjectCompletionPlan, actionName?: string, detail?: string) => {
    const saved = { ...next, businessId, updatedAt: now(), activity: actionName ? [...(next.activity || []), activity(actionName, actor, detail)] : next.activity };
    setDraft(saved); setPlans(prev => prev.some(item => item.id === saved.id) ? prev.map(item => item.id === saved.id ? saved : item) : [saved, ...prev]);
  };
  const updateGoal = (goalId: string, changes: Partial<CompletionGoal>, actionName = "Goal edited") => {
    if (!draft) return;
    const goals = draft.goals.map(goal => goal.id === goalId ? { ...goal, ...changes } : goal);
    persist({ ...draft, goals }, actionName, goals.find(goal => goal.id === goalId)?.title);
  };

  const notifyEmployerOfResponse = async (goal: CompletionGoal, finished: boolean) => {
    const recipientEmail = businessId.trim().toLowerCase();
    const currentEmail = (loggedInUser?.email || "").trim().toLowerCase();
    if (!recipientEmail || currentEmail === recipientEmail) return;

    const stamp = now();
    const notificationId = id("goal_response");
    await setDoc(doc(db, "notifications", notificationId), {
      id: notificationId,
      businessId,
      recipientEmail,
      type: "general",
      title: finished ? "Job goal completed" : "Job goal update",
      description: `${actor} submitted an employee update for "${goal.title || "Untitled goal"}": ${finished ? "Goal completed" : "Goal still in progress"}.`,
      time: stamp,
      createdAt: stamp,
      isRead: false,
      icon: finished ? "✅" : "🛠️",
      screenId: "jobs",
      relatedJobId: job.id
    });
  };

  const saveEmployeeResponse = async (goalId: string, response: {
    status: CompletionGoalStatus;
    completed: boolean;
    completedOnSchedule: boolean;
    actualCompletionDate: string;
    projectNotes: string;
    issuesDuringCompletion: string;
  }) => {
    if (!draft || !canRespond) return;
    const stamp = now();
    const finished = response.completed || response.status === "Completed";
    const normalized = {
      ...response,
      completed: finished,
      status: (finished ? "Completed" : response.status) as CompletionGoalStatus,
      actualCompletionDate: finished ? (response.actualCompletionDate || stamp.slice(0, 10)) : response.actualCompletionDate
    };
    let savedGoal: CompletionGoal | undefined;
    const goals = draft.goals.map(goal => {
      if (goal.id !== goalId) return goal;
      savedGoal = {
        ...goal,
        ...normalized,
        lastEmployeeName: actor,
        lastUpdatedAt: stamp,
        employeeResponseSubmittedAt: stamp,
        employeeResponseSubmittedBy: actor
      };
      return savedGoal;
    });
    const label = finished ? "Employee update — Goal completed" : "Employee update — Goal still in progress";
    persist({ ...draft, goals }, label, savedGoal?.title);
    if (!savedGoal) return;
    try {
      await waitForPendingWrites(db);
      await notifyEmployerOfResponse(savedGoal, finished);
      notify(finished ? "Employee update saved. Employer notified that this goal is complete." : "Employee update saved. Employer notified that this goal is still in progress.");
    } catch (error) {
      console.error("Could not send goal-response notification:", error);
      notify("Employee update saved, but the employer notification could not be sent.");
    }
  };
  const deletePlan = () => {
    if (!canManage || !draft) return;
    requestConfirm("Delete this completion plan and all of its goals?", () => {
      setPlans(prev => prev.filter(item => item.id !== draft.id)); onClose();
    });
  };
  const approveFinalCloseout = async () => {
    if (!canManage || !draft || draft.finalCloseoutApproved) return;
    if (!(await confirmJobCompletion(job.id))) return;
    const stamp = now();

    persist({
      ...draft,
      finalCloseoutApproved: true,
      finalCloseoutApprovedBy: actor,
      finalCloseoutApprovedAt: stamp
    }, "Final project closeout approved");

    // Final closeout is the actual Jobs -> Invoice handoff. Previously this
    // only changed the completion-plan flag, leaving the underlying Job open
    // forever and forcing the owner to manually rebuild the billing context.
    setSchedulingEvents(prev => prev.map(item => item.id === job.id ? {
      ...item,
      status: "Completed",
      updatedAt: stamp,
      activity: [
        ...(item.activity || []),
        {
          id: id("act"),
          timestamp: stamp,
          action: "Final project closeout approved — job completed",
          by: actor
        }
      ]
    } : item));

    sessionStorage.setItem("ownerslocal_pending_invoice_create", "1");
    sessionStorage.setItem(
      "ownerslocal_pending_invoice_prefill",
      JSON.stringify(buildJobInvoicePrefill(job))
    );

    notify("Final closeout approved. Job marked Completed and the invoice is ready to review.");
    onClose();
    navigateToScreen("accounting");
  };

  const addMaterial = (goal: CompletionGoal, inventoryItemId: string, quantity: number, notes: string) => {
    const item = inventory.find(entry => entry.id === inventoryItemId);
    if (!item || quantity <= 0) return notify("Select an inventory item and enter a quantity greater than zero.");
    updateGoal(goal.id, { materials: [...goal.materials, { id: id("material"), inventoryItemId: item.id, inventoryItemName: item.name, quantity, notes, submittedBy: actor, submittedAt: now(), approvalStatus: "pending" }] }, "Worker material submission added");
  };
  const attach = (goal: CompletionGoal, file: File) => {
    if (file.size > 750_000) return notify("Please choose a file smaller than 750 KB.");
    const reader = new FileReader();
    reader.onload = () => {
      const documentId = id("doc");
      const uploadedAt = now();
      const doc: DocumentItem = { id: documentId, name: file.name, customer: job.customer, employee: actor, vendor: "None", job: job.id, type: file.type.startsWith("image/") ? "Progress Photos" : "Completion Forms", folder: "Jobs", uploadedBy: actor, date: uploadedAt.slice(0, 10), size: `${Math.ceil(file.size / 1024)} KB`, status: "Unsigned", isFavorite: false, isArchived: false, notes: `Project completion goal: ${goal.title}`, tags: ["Project Completion", goal.title], estimateId: "None", invoiceId: "None", lastModified: uploadedAt, url: String(reader.result) };
      setDocuments(prev => [doc, ...prev]);
      updateGoal(goal.id, { attachments: [...goal.attachments, { id: id("attachment"), documentId, name: file.name, type: file.type, uploadedBy: actor, uploadedAt }] }, "Attachment added");
    };
    reader.readAsDataURL(file);
  };

  if (!draft) {
    if (inline) {
      return <div className="job-tracking-inline flex flex-col gap-2">
        <div className="text-[10px] font-semibold text-[#5E7393]">No completion goals yet.</div>
        {canCreate && <button onClick={createPlan} className="job-tracking-edit-button"><Plus className="mr-1 inline h-3.5 w-3.5"/>Edit/Create Job Tracking</button>}
        {!canCreate && <p className="text-[10px] text-[#5E7393]">Management needs to create Job Tracking before the assigned employee can respond.</p>}
      </div>;
    }
    return <Modal onClose={onClose}><div className="p-8 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-[#4A86F7]"/><h3 className="mt-3 text-lg font-black text-[#1F3557]">Job Tracking</h3><p className="mt-2 text-xs text-slate-500">Job Tracking has not been set up for this job yet.</p>{canCreate && <button onClick={createPlan} className="mt-5 rounded-xl bg-[#315C9F] px-5 py-3 text-xs font-black text-white">Create Job Tracking</button>}{!canCreate && <p className="mt-4 text-[11px] font-semibold text-slate-500">Management needs to create the completion goals before the assigned employee can respond.</p>}{(onSkip || onRemindLater) && <div className="mt-3 flex justify-center gap-2">{onRemindLater && <button onClick={onRemindLater} className="rounded-xl border border-[#9EC8EF] bg-white px-4 py-2 text-xs font-bold text-[#315C9F]">Remind Me Later</button>}{onSkip && <button onClick={onSkip} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Skip for now</button>}</div>}</div></Modal>;
  }

  if (inline) {
    const completedGoals = draft.goals.filter(goal => goal.completed || goal.status === "Completed").length;
    const goalProgress = draft.goals.length ? Math.round((completedGoals / draft.goals.length) * 100) : 0;
    return <>
      <div className="job-tracking-inline flex flex-col gap-2">
        <div className="min-w-0">
          <div className="flex items-center justify-between text-[10px] font-bold text-[#5E7393]">
            <span>{completedGoals}/{draft.goals.length} completion goals</span>
            <span>{goalProgress}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-blue-100"><div className="h-full bg-emerald-500" style={{width:`${goalProgress}%`}}/></div>
        </div>

        {canManage && <button type="button" onClick={()=>setShowInlineSetup(value=>!value)} className="job-tracking-edit-button">
          <Plus className="mr-1 inline h-3.5 w-3.5"/>{showInlineSetup ? "Done Editing" : "Edit/Create Job Tracking"}
        </button>}

        {showInlineSetup && canManage && <section className="rounded-xl border border-[#9EC8EF] bg-blue-50/50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Overall completion summary"><textarea rows={2} value={draft.summary} onChange={e=>setDraft({...draft,summary:e.target.value})} className="input"/></Field>
            <Field label="Overall project completion goal"><textarea rows={2} value={draft.overallGoal} onChange={e=>setDraft({...draft,overallGoal:e.target.value})} className="input"/></Field>
            <Field label="Project start date"><input type="date" value={draft.projectStartDate} onChange={e=>setDraft({...draft,projectStartDate:e.target.value})} className="input"/></Field>
            <Field label="Estimated completion date"><input type="date" value={draft.estimatedCompletionDate} onChange={e=>setDraft({...draft,estimatedCompletionDate:e.target.value})} className="input"/></Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={()=>persist(draft,"Completion plan edited")} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white">Save Plan Details</button>
            <button onClick={()=>persist({...draft,goals:[...draft.goals,blankGoal()]},"Goal created")} className="rounded-xl border border-[#315C9F] bg-white px-4 py-2 text-xs font-black text-[#315C9F]"><Plus className="mr-1 inline h-4 w-4"/>Add Completion Goal</button>
          </div>
        </section>}

        <div className="job-goal-list flex flex-col items-start gap-1">
          {draft.goals.length === 0 && <div className="py-1 text-[10px] font-semibold text-slate-500">{canManage ? "No completion goals yet. Tap Edit/Create Job Tracking, then add the first goal." : "Management has not added any completion goals yet."}</div>}
          {draft.goals.map((goal,index)=><GoalCard key={goal.id} goal={goal} index={index} canManage={canManage} canRespond={canRespond} actor={actor} inventory={inventory} onChange={(changes,actionName)=>updateGoal(goal.id,changes,actionName)} onSaveResponse={(response)=>saveEmployeeResponse(goal.id,response)} onDelete={()=>requestConfirm("Delete this project goal?",()=>persist({...draft,goals:draft.goals.filter(item=>item.id!==goal.id)},"Goal deleted",goal.title))} onMaterial={(itemId,qty,notes)=>addMaterial(goal,itemId,qty,notes)} onAttach={file=>attach(goal,file)} onApprove={material=>requestConfirm(`Deduct ${material.quantity} × ${material.inventoryItemName} from Inventory? This can only happen once.`,async()=>{setBusy(true);try{const savedPlan=await approveCompletionMaterial({businessId,plan:draft,goalId:goal.id,materialId:material.id,actor});setDraft(savedPlan);setPlans(prev=>prev.map(item=>item.id===savedPlan.id?savedPlan:item));notify("Inventory deduction approved.");}catch(error){notify(error instanceof Error?error.message:"Inventory deduction failed.");}finally{setBusy(false)}})} busy={busy}/>)}
        </div>
      </div>
      {confirmState && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4" onMouseDown={e=>e.target===e.currentTarget&&setConfirmState(null)}><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><p className="text-sm font-bold text-[#1F3557]">{confirmState.message}</p><div className="mt-4 flex justify-end gap-2"><button onClick={()=>setConfirmState(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button><button onClick={()=>{const run=confirmState.onConfirm;setConfirmState(null);run();}} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white">Confirm</button></div></div></div>}
    </>;
  }

  return <>
  <Modal onClose={onClose}>
    <header className="sticky top-0 z-10 flex items-start justify-between border-b border-[#9EC8EF] bg-[#C7E3FA] p-4"><div><p className="text-[9px] font-black uppercase tracking-widest text-[#315C9F]">{job.jobNumber || job.id}</p><h3 className="text-lg font-black text-[#1F3557]">Job Tracking</h3><p className="text-xs text-[#5E7393]">{job.customer}</p></div><button onClick={onClose} aria-label="Close"><X className="h-5 w-5"/></button></header>
    <div className="space-y-4 p-4">
      <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Overall completion summary"><textarea disabled={!canManage} rows={3} value={draft.summary} onChange={e=>setDraft({...draft,summary:e.target.value})} className="input"/></Field><Field label="Overall project completion goal"><textarea disabled={!canManage} rows={3} value={draft.overallGoal} onChange={e=>setDraft({...draft,overallGoal:e.target.value})} className="input"/></Field><Field label="Project start date"><input disabled={!canManage} type="date" value={draft.projectStartDate} onChange={e=>setDraft({...draft,projectStartDate:e.target.value})} className="input"/></Field><Field label="Estimated completion date"><input disabled={!canManage} type="date" value={draft.estimatedCompletionDate} onChange={e=>setDraft({...draft,estimatedCompletionDate:e.target.value})} className="input"/></Field></div>{canManage&&<button onClick={()=>persist(draft,"Completion plan edited")} className="mt-3 rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white">Save Plan Details</button>}</section>
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-black uppercase tracking-wide text-[#1F3557]">Completion Goals</h4>
          <span className="text-[10px] font-bold text-[#5E7393]">{draft.goals.length} goal{draft.goals.length === 1 ? "" : "s"}</span>
        </div>
        {draft.goals.length === 0 && <div className="rounded-2xl border border-dashed border-[#9EC8EF] bg-white p-5 text-center text-xs font-semibold text-slate-500">{canManage ? "No completion goals yet. Add the first goal below." : "Management has not added any completion goals yet."}</div>}
        {draft.goals.map((goal,index)=><GoalCard key={goal.id} goal={goal} index={index} canManage={canManage} canRespond={canRespond} actor={actor} inventory={inventory} onChange={(changes,actionName)=>updateGoal(goal.id,changes,actionName)} onSaveResponse={(response)=>saveEmployeeResponse(goal.id,response)} onDelete={()=>requestConfirm("Delete this project goal?",()=>persist({...draft,goals:draft.goals.filter(item=>item.id!==goal.id)},"Goal deleted",goal.title))} onMaterial={(itemId,qty,notes)=>addMaterial(goal,itemId,qty,notes)} onAttach={file=>attach(goal,file)} onApprove={material=>requestConfirm(`Deduct ${material.quantity} × ${material.inventoryItemName} from Inventory? This can only happen once.`,async()=>{setBusy(true);try{const savedPlan=await approveCompletionMaterial({businessId,plan:draft,goalId:goal.id,materialId:material.id,actor});setDraft(savedPlan);setPlans(prev=>prev.map(item=>item.id===savedPlan.id?savedPlan:item));notify("Inventory deduction approved.");}catch(error){notify(error instanceof Error?error.message:"Inventory deduction failed.");}finally{setBusy(false)}})} busy={busy}/>)}
      </section>
      {canManage&&<button onClick={()=>persist({...draft,goals:[...draft.goals,blankGoal()]},"Goal created")} className="w-full rounded-xl border-2 border-dashed border-[#4A86F7] bg-blue-50 px-4 py-3 text-xs font-black text-[#315C9F]"><Plus className="mr-1 inline h-4 w-4"/>Add Project Completion Goal</button>}
      <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4"><h4 className="text-xs font-black uppercase text-[#1F3557]">Review Requests</h4><div className="mt-3"><ReviewRequestControls customer={resolveCustomerByIdOrName(customers, job.customerId, job.customer)} jobId={job.id} jobDescription={job.title || job.description} /></div><label className="mt-3 flex items-center gap-2 text-[11px] font-bold text-slate-600"><input type="checkbox" checked={!!job.reviewRequestExcluded} onChange={e=>setSchedulingEvents(prev=>prev.map(j=>j.id===job.id?{...j,reviewRequestExcluded:e.target.checked}:j))}/>Don't automatically request a review for this job</label></section>
      <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4"><h4 className="text-xs font-black uppercase text-[#1F3557]">Activity History</h4><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{[...draft.activity].reverse().map(item=><div key={item.id} className="border-l-2 border-blue-300 pl-3"><p className="text-xs font-bold">{item.action}{item.detail?` — ${item.detail}`:""}</p><p className="text-[9px] text-slate-400">{new Date(item.at).toLocaleString()} · {item.by}</p></div>)}</div></section>
      {canManage&&<div className="flex flex-wrap justify-between gap-2"><button onClick={deletePlan} className="rounded-xl bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700"><Trash2 className="mr-1 inline h-4 w-4"/>Delete Plan</button><button disabled={draft.finalCloseoutApproved} onClick={approveFinalCloseout} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{draft.finalCloseoutApproved?"Closeout Approved":"Approve Final Closeout"}</button></div>}
    </div>
  </Modal>
  {confirmState && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4" onMouseDown={e=>e.target===e.currentTarget&&setConfirmState(null)}><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><p className="text-sm font-bold text-[#1F3557]">{confirmState.message}</p><div className="mt-4 flex justify-end gap-2"><button onClick={()=>setConfirmState(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button><button onClick={()=>{const run=confirmState.onConfirm;setConfirmState(null);run();}} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white">Confirm</button></div></div></div>}
  </>;
}


function GoalCard({goal,index,canManage,canRespond,actor,inventory,onChange,onSaveResponse,onDelete,onMaterial,onAttach,onApprove,busy}:any){
  const [open,setOpen]=useState(false);
  const [itemId,setItemId]=useState("");
  const [qty,setQty]=useState(1);
  const [notes,setNotes]=useState("");
  const [response,setResponse]=useState({
    status: goal.status as CompletionGoalStatus,
    completed: !!goal.completed,
    completedOnSchedule: !!goal.completedOnSchedule,
    actualCompletionDate: goal.actualCompletionDate || "",
    projectNotes: goal.projectNotes || "",
    issuesDuringCompletion: goal.issuesDuringCompletion || ""
  });

  useEffect(()=>{
    setResponse({
      status: goal.status as CompletionGoalStatus,
      completed: !!goal.completed,
      completedOnSchedule: !!goal.completedOnSchedule,
      actualCompletionDate: goal.actualCompletionDate || "",
      projectNotes: goal.projectNotes || "",
      issuesDuringCompletion: goal.issuesDuringCompletion || ""
    });
  },[goal.id,goal.status,goal.completed,goal.completedOnSchedule,goal.actualCompletionDate,goal.projectNotes,goal.issuesDuringCompletion,goal.employeeResponseSubmittedAt]);

  const title=String(goal.title||"").trim() || `Goal ${index+1}`;
  const submitted=!!goal.employeeResponseSubmittedAt;
  const showEmployeeResponse=canRespond || submitted;
  const responseState=canRespond ? response : goal;
  const finished=canRespond ? (response.completed || response.status==="Completed") : (goal.completed || goal.status==="Completed");

  return <section className="job-goal-item w-full">
    <button
      type="button"
      onClick={()=>setOpen(v=>!v)}
      className="job-goal-menu-button"
      aria-expanded={open}
    >
      <span className="job-goal-menu-title min-w-0 truncate">{finished ? "✓ " : ""}{title}</span>
      {open?<ChevronDown className="job-goal-menu-chevron h-3.5 w-3.5 shrink-0"/>:<ChevronRight className="job-goal-menu-chevron h-3.5 w-3.5 shrink-0"/>}
    </button>

    {open&&<div className="mt-1 w-full space-y-4 border-t border-blue-100 px-1 py-3">
      <p className="job-goal-menu-status text-[9px] font-medium">{submitted ? `Employee response: ${goal.completed || goal.status==="Completed" ? "Completed" : "Still in progress"}` : "Awaiting employee response"}</p>
      <section className="rounded-xl bg-blue-50/60 p-3">
        <div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase text-[#315C9F]">Goal Setup</p>{canManage&&<button onClick={onDelete} className="text-rose-600" aria-label="Delete goal"><Trash2 className="h-4 w-4"/></button>}</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Goal completion title"><input disabled={!canManage} value={goal.title} onChange={e=>onChange({title:e.target.value})} className="input"/></Field>
          <Field label="Estimated start"><input disabled={!canManage} type="date" value={goal.estimatedStartDate} onChange={e=>onChange({estimatedStartDate:e.target.value})} className="input"/></Field>
          <Field label="Estimated completion"><input disabled={!canManage} type="date" value={goal.estimatedCompletionDate} onChange={e=>onChange({estimatedCompletionDate:e.target.value})} className="input"/></Field>
          <div className="sm:col-span-2"><Field label="Instructions / details"><textarea disabled={!canManage} rows={4} value={goal.instructions} onChange={e=>onChange({instructions:e.target.value})} className="input"/></Field></div>
        </div>
      </section>

      {!showEmployeeResponse&&<section className="rounded-xl border border-dashed border-[#9EC8EF] bg-slate-50 p-4 text-center">
        <p className="text-xs font-black text-[#1F3557]">Waiting for assigned employee response</p>
        <p className="mt-1 text-[10px] text-slate-500">Response fields stay hidden from management until the assigned employee saves an update.</p>
      </section>}

      {showEmployeeResponse&&<section className="rounded-xl border border-[#9EC8EF] bg-white p-3">
        <p className="text-[10px] font-black uppercase text-[#315C9F]">Employee Response</p>
        {canRespond ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Status"><select value={response.status} onChange={e=>setResponse(prev=>({...prev,status:e.target.value as CompletionGoalStatus}))} className="input">{["Not Started","In Progress","Blocked","Completed"].map(x=><option key={x}>{x}</option>)}</select></Field>
          <Field label="Actual completion date"><input type="date" value={response.actualCompletionDate} onChange={e=>setResponse(prev=>({...prev,actualCompletionDate:e.target.value}))} className="input"/></Field>
          <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={response.completed} onChange={e=>setResponse(prev=>({...prev,completed:e.target.checked,status:e.target.checked?"Completed":prev.status}))}/>Completed</label>
          <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={response.completedOnSchedule} onChange={e=>setResponse(prev=>({...prev,completedOnSchedule:e.target.checked}))}/>Completed on schedule</label>
          <Field label="Project Notes"><textarea rows={3} value={response.projectNotes} onChange={e=>setResponse(prev=>({...prev,projectNotes:e.target.value}))} className="input"/></Field>
          <Field label="Issues During Completion"><textarea rows={3} value={response.issuesDuringCompletion} onChange={e=>setResponse(prev=>({...prev,issuesDuringCompletion:e.target.value}))} className="input"/></Field>
          <div className="sm:col-span-2 flex justify-end"><button onClick={()=>void onSaveResponse(response)} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white"><Save className="mr-1 inline h-4 w-4"/>Save Employee Update</button></div>
        </div> : <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ReadValue label="Status" value={String(responseState.status||"—")}/>
          <ReadValue label="Actual completion date" value={responseState.actualCompletionDate||"—"}/>
          <ReadValue label="Completed" value={finished?"Yes":"No"}/>
          <ReadValue label="Completed on schedule" value={responseState.completedOnSchedule?"Yes":"No"}/>
          <ReadValue label="Project Notes" value={responseState.projectNotes||"—"}/>
          <ReadValue label="Issues During Completion" value={responseState.issuesDuringCompletion||"—"}/>
          <div className="sm:col-span-2 text-[10px] text-slate-500">{goal.employeeResponseSubmittedBy&&<>Saved by <b>{goal.employeeResponseSubmittedBy}</b>{goal.employeeResponseSubmittedAt&&` · ${new Date(goal.employeeResponseSubmittedAt).toLocaleString()}`}</>}</div>
        </div>}

        <div className="mt-4 rounded-xl bg-blue-50 p-3">
          <p className="text-[10px] font-black uppercase text-[#315C9F]">Materials Used</p>
          <div className="mt-2 space-y-2">{goal.materials.map((m:any)=><div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2 text-xs"><span><b>{m.quantity} × {m.inventoryItemName}</b><small className="block text-slate-400">{m.submittedBy} · {new Date(m.submittedAt).toLocaleString()} {m.notes&&`· ${m.notes}`}</small></span><span className="flex items-center gap-2"><b className={m.approvalStatus==="approved"?"text-emerald-600":"text-amber-600"}>{m.approvalStatus}</b>{canManage&&m.approvalStatus==="pending"&&<button disabled={busy} onClick={()=>onApprove(m)} className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">Approve & Deduct</button>}</span></div>)}</div>
          {canRespond&&<div className="mt-2 grid gap-2 sm:grid-cols-[1fr_80px_1fr_auto]"><select value={itemId} onChange={e=>setItemId(e.target.value)} className="input"><option value="">Inventory item…</option>{inventory.map((i:any)=><option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit})</option>)}</select><input type="number" min="0.01" step="0.01" value={qty} onChange={e=>setQty(Number(e.target.value))} className="input"/><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes / item not found" className="input"/><button onClick={()=>{onMaterial(itemId,qty,notes);setItemId("");setQty(1);setNotes("")}} className="rounded-lg bg-[#315C9F] px-3 py-2 text-xs font-bold text-white">Submit</button></div>}
        </div>

        <div className="mt-3">
          {canRespond&&<label className="inline-flex cursor-pointer items-center rounded-lg border border-[#9EC8EF] px-3 py-2 text-xs font-bold text-[#315C9F]"><FileUp className="mr-1 h-4 w-4"/>Add photo or document<input type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={e=>e.target.files?.[0]&&onAttach(e.target.files[0])}/></label>}
          <div className="mt-2 flex flex-wrap gap-2">{goal.attachments.map((a:any)=><span key={a.id} className="rounded bg-slate-100 px-2 py-1 text-[10px]">{a.name}</span>)}</div>
        </div>
      </section>}

      {(showEmployeeResponse||canRespond)&&<div className="rounded-xl bg-amber-50 p-3">
        <p className="text-[10px] font-black uppercase text-amber-700">Manager Review</p>
        {canManage?<label className="mt-2 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={goal.managerReviewed} onChange={e=>onChange(e.target.checked?{managerReviewed:true,managerReviewedBy:actor,managerReviewedAt:new Date().toISOString()}:{managerReviewed:false,managerReviewedBy:undefined,managerReviewedAt:undefined},e.target.checked?"Goal reviewed by manager":"Goal review reopened")}/>Reviewed &amp; approved this goal's work</label>:<p className="mt-2 text-xs font-bold">{goal.managerReviewed?"✓ Reviewed & approved by management":"Not yet reviewed by management"}</p>}
        {goal.managerReviewedBy&&<p className="mt-1 text-[10px] text-slate-500">Reviewed by <b>{goal.managerReviewedBy}</b>{goal.managerReviewedAt&&` · ${new Date(goal.managerReviewedAt).toLocaleString()}`}</p>}
        <Field label="Manager Review Notes"><textarea disabled={!canManage} rows={2} value={goal.managerReviewNotes||""} onChange={e=>onChange({managerReviewNotes:e.target.value},"Manager review notes updated")} className="input mt-1"/></Field>
      </div>}
    </div>}
  </section>;
}

const ReadValue=({label,value}:{label:string;value:string})=><div className="rounded-lg bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-wide text-[#5E7393]">{label}</p><p className="mt-1 whitespace-pre-wrap text-xs font-semibold text-[#1F3557]">{value}</p></div>;
const Modal=({children,onClose}:{children:React.ReactNode;onClose:()=>void})=><div className="fixed inset-0 z-[110] flex justify-end bg-slate-900/60 backdrop-blur-sm" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="h-full w-full max-w-3xl overflow-y-auto bg-[#F5FAFF] shadow-2xl">{children}</div></div>;
const Field=({label,children}:{label:string;children:React.ReactNode})=><label className="block"><span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-[#5E7393]">{label}</span>{children}</label>;
