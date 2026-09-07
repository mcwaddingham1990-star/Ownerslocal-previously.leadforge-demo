import React, { useEffect, useState } from "react";
import { CheckCircle2, FileUp, Plus, Trash2, X } from "lucide-react";
import type { InventoryItem, DocumentItem, SchedulingEvent } from "../types/domain";
import type { CompletionGoal, ProjectCompletionPlan } from "../types/completion";
import { approveCompletionMaterial } from "../lib/completionService";

const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();
const blankGoal = (): CompletionGoal => ({ id: id("goal"), title: "", estimatedStartDate: "", estimatedCompletionDate: "", instructions: "", status: "Not Started", completed: false, completedOnSchedule: false, actualCompletionDate: "", projectNotes: "", issuesDuringCompletion: "", materials: [], attachments: [] });
const activity = (action: string, by: string, detail?: string) => ({ id: id("act"), action, detail, by, at: now() });

export function ProjectCompletionTracking(props: {
  job: SchedulingEvent; plan?: ProjectCompletionPlan; businessId: string; actor: string; canManage: boolean; canCreate?: boolean;
  inventory: InventoryItem[]; setPlans: React.Dispatch<React.SetStateAction<ProjectCompletionPlan[]>>;
  setDocuments: React.Dispatch<React.SetStateAction<DocumentItem[]>>; onClose: () => void; notify: (message: string) => void;
}) {
  const { job, plan, businessId, actor, canManage, canCreate = canManage, inventory, setPlans, setDocuments, onClose, notify } = props;
  const [draft, setDraft] = useState<ProjectCompletionPlan | null>(plan || null);
  const [busy, setBusy] = useState(false);
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
    const goals = draft.goals.map(goal => goal.id === goalId ? { ...goal, ...changes, lastEmployeeName: actor, lastUpdatedAt: now() } : goal);
    persist({ ...draft, goals }, actionName, goals.find(goal => goal.id === goalId)?.title);
  };
  const deletePlan = () => {
    if (!canManage || !draft) return;
    requestConfirm("Delete this completion plan and all of its goals?", () => {
      setPlans(prev => prev.filter(item => item.id !== draft.id)); onClose();
    });
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

  if (!draft) return <Modal onClose={onClose}><div className="p-8 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-[#4A86F7]"/><h3 className="mt-3 text-lg font-black text-[#1F3557]">Project Completion Tracking</h3><p className="mt-2 text-xs text-slate-500">No completion plan has been created for this job.</p>{canCreate && <button onClick={createPlan} className="mt-5 rounded-xl bg-[#315C9F] px-5 py-3 text-xs font-black text-white">Create Completion Plan</button>}</div></Modal>;

  return <>
  <Modal onClose={onClose}>
    <header className="sticky top-0 z-10 flex items-start justify-between border-b border-[#9EC8EF] bg-[#C7E3FA] p-4"><div><p className="text-[9px] font-black uppercase tracking-widest text-[#315C9F]">{job.jobNumber || job.id}</p><h3 className="text-lg font-black text-[#1F3557]">Project Completion Tracking</h3><p className="text-xs text-[#5E7393]">{job.customer}</p></div><button onClick={onClose} aria-label="Close"><X className="h-5 w-5"/></button></header>
    <div className="space-y-4 p-4">
      <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Overall completion summary"><textarea disabled={!canManage} rows={3} value={draft.summary} onChange={e=>setDraft({...draft,summary:e.target.value})} className="input"/></Field><Field label="Overall project completion goal"><textarea disabled={!canManage} rows={3} value={draft.overallGoal} onChange={e=>setDraft({...draft,overallGoal:e.target.value})} className="input"/></Field><Field label="Project start date"><input disabled={!canManage} type="date" value={draft.projectStartDate} onChange={e=>setDraft({...draft,projectStartDate:e.target.value})} className="input"/></Field><Field label="Estimated completion date"><input disabled={!canManage} type="date" value={draft.estimatedCompletionDate} onChange={e=>setDraft({...draft,estimatedCompletionDate:e.target.value})} className="input"/></Field></div>{canManage&&<button onClick={()=>persist(draft,"Completion plan edited")} className="mt-3 rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white">Save Plan Details</button>}</section>
      {draft.goals.map((goal,index)=><GoalCard key={goal.id} goal={goal} index={index} canManage={canManage} inventory={inventory} onChange={(changes,actionName)=>updateGoal(goal.id,changes,actionName)} onDelete={()=>requestConfirm("Delete this project goal?",()=>persist({...draft,goals:draft.goals.filter(item=>item.id!==goal.id)},"Goal deleted",goal.title))} onMaterial={(itemId,qty,notes)=>addMaterial(goal,itemId,qty,notes)} onAttach={file=>attach(goal,file)} onApprove={material=>requestConfirm(`Deduct ${material.quantity} × ${material.inventoryItemName} from Inventory? This can only happen once.`,async()=>{setBusy(true);try{const savedPlan=await approveCompletionMaterial({businessId,plan:draft,goalId:goal.id,materialId:material.id,actor});setDraft(savedPlan);setPlans(prev=>prev.map(item=>item.id===savedPlan.id?savedPlan:item));notify("Inventory deduction approved.");}catch(error){notify(error instanceof Error?error.message:"Inventory deduction failed.");}finally{setBusy(false)}})} busy={busy}/>) }
      {canManage&&<button onClick={()=>persist({...draft,goals:[...draft.goals,blankGoal()]},"Goal created")} className="w-full rounded-xl border-2 border-dashed border-[#4A86F7] bg-blue-50 px-4 py-3 text-xs font-black text-[#315C9F]"><Plus className="mr-1 inline h-4 w-4"/>Add Project Completion Goal</button>}
      <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4"><h4 className="text-xs font-black uppercase text-[#1F3557]">Activity History</h4><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{[...draft.activity].reverse().map(item=><div key={item.id} className="border-l-2 border-blue-300 pl-3"><p className="text-xs font-bold">{item.action}{item.detail?` — ${item.detail}`:""}</p><p className="text-[9px] text-slate-400">{new Date(item.at).toLocaleString()} · {item.by}</p></div>)}</div></section>
      {canManage&&<div className="flex flex-wrap justify-between gap-2"><button onClick={deletePlan} className="rounded-xl bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700"><Trash2 className="mr-1 inline h-4 w-4"/>Delete Plan</button><button disabled={draft.finalCloseoutApproved} onClick={()=>persist({...draft,finalCloseoutApproved:true,finalCloseoutApprovedBy:actor,finalCloseoutApprovedAt:now()},"Final project closeout approved")} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{draft.finalCloseoutApproved?"Closeout Approved":"Approve Final Closeout"}</button></div>}
    </div>
  </Modal>
  {confirmState && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4" onMouseDown={e=>e.target===e.currentTarget&&setConfirmState(null)}><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><p className="text-sm font-bold text-[#1F3557]">{confirmState.message}</p><div className="mt-4 flex justify-end gap-2"><button onClick={()=>setConfirmState(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button><button onClick={()=>{const run=confirmState.onConfirm;setConfirmState(null);run();}} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white">Confirm</button></div></div></div>}
  </>;
}

function GoalCard({goal,index,canManage,inventory,onChange,onDelete,onMaterial,onAttach,onApprove,busy}:any){const [itemId,setItemId]=useState("");const [qty,setQty]=useState(1);const [notes,setNotes]=useState("");return <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4"><div className="flex justify-between"><h4 className="text-xs font-black uppercase text-[#1F3557]">Goal {index+1}</h4>{canManage&&<button onClick={onDelete} className="text-rose-600"><Trash2 className="h-4 w-4"/></button>}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Short goal title"><input disabled={!canManage} value={goal.title} onChange={e=>onChange({title:e.target.value})} className="input"/></Field><Field label="Status"><select value={goal.status} onChange={e=>onChange({status:e.target.value},e.target.value==="Blocked"?"Goal blocked":e.target.value==="In Progress"?"Goal started":"Goal status updated")} className="input">{["Not Started","In Progress","Blocked","Completed"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Estimated start"><input disabled={!canManage} type="date" value={goal.estimatedStartDate} onChange={e=>onChange({estimatedStartDate:e.target.value})} className="input"/></Field><Field label="Estimated completion"><input disabled={!canManage} type="date" value={goal.estimatedCompletionDate} onChange={e=>onChange({estimatedCompletionDate:e.target.value})} className="input"/></Field><div className="sm:col-span-2"><Field label="Instructions / details"><textarea disabled={!canManage} rows={5} value={goal.instructions} onChange={e=>onChange({instructions:e.target.value})} className="input"/></Field></div><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={goal.completed} onChange={e=>onChange({completed:e.target.checked,status:e.target.checked?"Completed":goal.status,actualCompletionDate:e.target.checked?(goal.actualCompletionDate||now().slice(0,10)):goal.actualCompletionDate},e.target.checked?"Goal completed":"Goal reopened")}/>Completed</label><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={goal.completedOnSchedule} onChange={e=>onChange({completedOnSchedule:e.target.checked},"Schedule completion response updated")}/>Completed on schedule</label><Field label="Actual completion date"><input type="date" value={goal.actualCompletionDate} onChange={e=>onChange({actualCompletionDate:e.target.value})} className="input"/></Field><div className="text-[10px] text-slate-500">{goal.lastEmployeeName&&<>Last response: <b>{goal.lastEmployeeName}</b><br/>{goal.lastUpdatedAt&&new Date(goal.lastUpdatedAt).toLocaleString()}</>}</div><Field label="Project Notes"><textarea rows={3} value={goal.projectNotes} onChange={e=>onChange({projectNotes:e.target.value},"Worker submission updated")} className="input"/></Field><Field label="Issues During Completion"><textarea rows={3} value={goal.issuesDuringCompletion} onChange={e=>onChange({issuesDuringCompletion:e.target.value},"Worker submission updated")} className="input"/></Field></div><div className="mt-4 rounded-xl bg-blue-50 p-3"><p className="text-[10px] font-black uppercase text-[#315C9F]">Materials Used</p><div className="mt-2 space-y-2">{goal.materials.map((m:any)=><div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2 text-xs"><span><b>{m.quantity} × {m.inventoryItemName}</b><small className="block text-slate-400">{m.submittedBy} · {new Date(m.submittedAt).toLocaleString()} {m.notes&&`· ${m.notes}`}</small></span><span className="flex items-center gap-2"><b className={m.approvalStatus==="approved"?"text-emerald-600":"text-amber-600"}>{m.approvalStatus}</b>{canManage&&m.approvalStatus==="pending"&&<button disabled={busy} onClick={()=>onApprove(m)} className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">Approve & Deduct</button>}</span></div>)}</div><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_80px_1fr_auto]"><select value={itemId} onChange={e=>setItemId(e.target.value)} className="input"><option value="">Inventory item…</option>{inventory.map((i:any)=><option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit})</option>)}</select><input type="number" min="0.01" step="0.01" value={qty} onChange={e=>setQty(Number(e.target.value))} className="input"/><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes / item not found" className="input"/><button onClick={()=>{onMaterial(itemId,qty,notes);setItemId("");setQty(1);setNotes("")}} className="rounded-lg bg-[#315C9F] px-3 py-2 text-xs font-bold text-white">Submit</button></div></div><div className="mt-3"><label className="inline-flex cursor-pointer items-center rounded-lg border border-[#9EC8EF] px-3 py-2 text-xs font-bold text-[#315C9F]"><FileUp className="mr-1 h-4 w-4"/>Add photo or document<input type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={e=>e.target.files?.[0]&&onAttach(e.target.files[0])}/></label><div className="mt-2 flex flex-wrap gap-2">{goal.attachments.map((a:any)=><span key={a.id} className="rounded bg-slate-100 px-2 py-1 text-[10px]">{a.name}</span>)}</div></div></section>}
const Modal=({children,onClose}:{children:React.ReactNode;onClose:()=>void})=><div className="fixed inset-0 z-[110] flex justify-end bg-slate-900/60 backdrop-blur-sm" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="h-full w-full max-w-3xl overflow-y-auto bg-[#F5FAFF] shadow-2xl">{children}</div></div>;
const Field=({label,children}:{label:string;children:React.ReactNode})=><label className="block"><span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-[#5E7393]">{label}</span>{children}</label>;
