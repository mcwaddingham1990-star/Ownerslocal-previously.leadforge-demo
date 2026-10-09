import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection";
import { hasEffectivePermission } from "../types/permissions";
import type {
  Automation,
  AutomationAction,
  AutomationActionType,
  AutomationCondition,
  AutomationConditionField,
  AutomationRun,
  AutomationRunStatus,
  AutomationTrigger
} from "../types/automation";
import {
  ACTION_BY_ID,
  APPOINTMENT_TYPES,
  AUTOMATION_ACTIONS,
  AUTOMATION_TEMPLATES,
  AUTOMATION_TRIGGERS,
  CONDITION_FIELDS,
  CONDITION_FIELD_BY_ID,
  MAX_ACTIONS,
  MAX_CONDITIONS,
  OPERATOR_LABELS,
  PRIORITY_VALUES,
  TRIGGER_BY_ID,
  automationFromTemplate,
  describeCondition,
  duplicateAutomation,
  newActionId,
  newAutomationId,
  newConditionId,
  safeStatusesForTrigger,
  validateAutomation
} from "../lib/automationEngine";
import { Copy, History, Pencil, Plus, Power, Trash2, X, Zap, ShieldCheck, ChevronRight } from "lucide-react";

const STATUS_STYLES: Record<AutomationRunStatus, string> = {
  Running: "bg-sky-100 text-sky-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Partial: "bg-amber-100 text-amber-800",
  Skipped: "bg-slate-200 text-slate-600",
  Failed: "bg-rose-100 text-rose-700"
};

const formatWhen = (iso?: string) => {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

function describeAction(action: AutomationAction): string {
  const def = ACTION_BY_ID.get(action.type);
  const cfg = action.config || {};
  const label = def?.label || action.type;
  if (action.type === "mark_priority" && cfg.priority) return `${label}: ${cfg.priority}`;
  if (action.type === "update_status" && cfg.status) return `${label}: ${cfg.status}`;
  if (action.type === "create_appointment") return `${label}: ${cfg.appointmentType || "Site Visit"}`;
  if (action.type === "notify_team") return `${label} (${cfg.recipients === "managers" ? "managers" : cfg.recipients === "owner_and_managers" ? "owner + managers" : "owner"})`;
  return label;
}

const StatusBadge: React.FC<{ status?: AutomationRunStatus }> = ({ status }) =>
  status ? <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${STATUS_STYLES[status] || "bg-slate-100 text-slate-600"}`}>{status}</span>
    : <span className="text-[10px] font-bold text-slate-400">—</span>;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

interface BuilderProps {
  initial: Automation;
  isNew: boolean;
  onCancel: () => void;
  onSave: (automation: Automation) => void;
}

const defaultConfigFor = (type: AutomationActionType, trigger: AutomationTrigger): AutomationAction["config"] => {
  switch (type) {
    case "create_job": return {};
    case "create_appointment": return { appointmentType: "Site Visit", daysFromNow: 1 };
    case "create_follow_up_task": return { daysFromNow: 2 };
    case "notify_team": return { recipients: "owner" };
    case "mark_priority": return { priority: "High" };
    case "update_status": return { status: TRIGGER_BY_ID.get(trigger)?.collection === "leads" ? "Contacted" : "Scheduled" };
    case "send_customer_message": return { message: "Hi {customer}, " };
    case "add_timeline_entry": return { message: "" };
    default: return undefined;
  }
};

const AutomationBuilder: React.FC<BuilderProps> = ({ initial, isNew, onCancel, onSave }) => {
  const [draft, setDraft] = useState<Automation>(initial);
  const [step, setStep] = useState<1 | 2 | 3>(isNew ? 1 : 3);
  const [errors, setErrors] = useState<string[]>([]);
  const triggerDef = TRIGGER_BY_ID.get(draft.trigger);
  const availableActions = AUTOMATION_ACTIONS.filter(a => a.triggers.includes(draft.trigger));

  const update = (patch: Partial<Automation>) => setDraft(prev => ({ ...prev, ...patch }));

  const setTrigger = (trigger: AutomationTrigger) => {
    // Drop actions that can't run on the new WHEN event rather than saving an invalid automation.
    const actions = draft.actions.filter(a => ACTION_BY_ID.get(a.type)?.triggers.includes(trigger));
    update({ trigger, actions });
  };

  const updateCondition = (id: string, patch: Partial<AutomationCondition>) =>
    update({ conditions: draft.conditions.map(c => (c.id === id ? { ...c, ...patch } : c)) });

  const addCondition = () => {
    const field = CONDITION_FIELDS[0];
    update({ conditions: [...draft.conditions, { id: newConditionId(), field: field.id, operator: field.operators[0], value: "" }] });
  };

  const updateAction = (id: string, patch: Partial<AutomationAction["config"]>) =>
    update({ actions: draft.actions.map(a => (a.id === id ? { ...a, config: { ...(a.config || {}), ...patch } } : a)) });

  const addAction = (type: AutomationActionType) =>
    update({ actions: [...draft.actions, { id: newActionId(), type, config: defaultConfigFor(type, draft.trigger) }] });

  const save = () => {
    const cleaned: Automation = {
      ...draft,
      name: draft.name.trim(),
      conditions: draft.conditions.map(c => ({ ...c, value: String(c.value).trim() })),
      actionTypes: draft.actions.map(a => a.type)
    };
    const problems = validateAutomation(cleaned);
    setErrors(problems);
    if (problems.length === 0) onSave(cleaned);
  };

  const stepButton = (n: 1 | 2 | 3, label: string) => (
    <button type="button" onClick={() => setStep(n)}
      className={`flex-1 rounded-xl px-2 py-2 text-[10px] font-black uppercase tracking-wider border ${step === n ? "bg-[#342D7E] text-white border-[#342D7E]" : "bg-white text-[#342D7E] border-[#A9CDEE]"}`}>
      Step {n}: {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#A9CDEE] bg-[#F5FAFF] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#A9CDEE] bg-[#C7E3FB] px-4 py-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#315C9F]">{isNew ? "New automation" : "Edit automation"}</p>
            <h3 className="text-sm font-black text-[#342D7E]">WHEN → IF → DO</h3>
          </div>
          <button type="button" onClick={onCancel} className="rounded-xl p-2 text-slate-500 hover:bg-white/60" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-4">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Name</span>
            <input value={draft.name} onChange={e => update({ name: e.target.value })} maxLength={120} placeholder="e.g. Accepted estimates become jobs"
              className="mt-1 w-full rounded-xl border border-[#A9CDEE] bg-white px-3 py-2 text-sm" />
          </label>

          <div className="flex gap-2">{stepButton(1, "When")}{stepButton(2, "If")}{stepButton(3, "Do")}</div>

          {step === 1 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">Pick the event that starts this automation.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {AUTOMATION_TRIGGERS.map(t => (
                  <button key={t.id} type="button" onClick={() => setTrigger(t.id)}
                    className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${draft.trigger === t.id ? "border-[#342D7E] bg-white ring-2 ring-[#342D7E]/30" : "border-[#A9CDEE] bg-[#E3F3FF] hover:bg-white"}`}>
                    <span className="block text-xs font-black text-[#342D7E]">{t.label}</span>
                    <span className="block text-[10px] font-medium text-slate-500">{t.description}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-end"><button type="button" onClick={() => setStep(2)} className="flex items-center gap-1 rounded-xl bg-[#342D7E] px-4 py-2 text-xs font-bold text-white">Next <ChevronRight className="h-3.5 w-3.5" /></button></div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">Optional. Every condition must be true (AND). Leave empty to run every time.</p>
              {draft.conditions.length === 0 && <p className="rounded-xl border border-dashed border-[#A9CDEE] bg-white/60 px-3 py-3 text-center text-[11px] font-semibold text-slate-500">No conditions — runs on every {triggerDef?.label || "event"}.</p>}
              {draft.conditions.map((c, i) => {
                const field = CONDITION_FIELD_BY_ID.get(c.field) || CONDITION_FIELDS[0];
                const listId = `cond-suggest-${c.id}`;
                return (
                  <div key={c.id} className="rounded-2xl border border-[#A9CDEE] bg-white p-2.5">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{i === 0 ? "If" : "And"}</span>
                      <button type="button" onClick={() => update({ conditions: draft.conditions.filter(x => x.id !== c.id) })} className="rounded-lg p-1 text-slate-400 hover:text-rose-600" aria-label="Remove condition"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <select value={c.field} onChange={e => {
                        const next = CONDITION_FIELD_BY_ID.get(e.target.value as AutomationConditionField)!;
                        updateCondition(c.id, { field: next.id, operator: next.operators.includes(c.operator) ? c.operator : next.operators[0] });
                      }} className="rounded-xl border border-[#A9CDEE] px-2 py-2 text-xs">
                        {CONDITION_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                      <select value={c.operator} onChange={e => updateCondition(c.id, { operator: e.target.value as AutomationCondition["operator"] })} className="rounded-xl border border-[#A9CDEE] px-2 py-2 text-xs">
                        {field.operators.map(op => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
                      </select>
                      <input value={c.value} onChange={e => updateCondition(c.id, { value: e.target.value })} list={field.suggestions ? listId : undefined}
                        inputMode={field.kind === "number" ? "decimal" : undefined} placeholder={field.kind === "number" ? "e.g. 5000" : "value"}
                        className="rounded-xl border border-[#A9CDEE] px-2 py-2 text-xs" />
                      {field.suggestions && <datalist id={listId}>{field.suggestions.map(s => <option key={s} value={s} />)}</datalist>}
                    </div>
                    {field.hint && <p className="mt-1 text-[10px] text-slate-400">{field.hint}</p>}
                  </div>
                );
              })}
              <div className="flex items-center justify-between">
                <button type="button" disabled={draft.conditions.length >= MAX_CONDITIONS} onClick={addCondition} className="flex items-center gap-1 rounded-xl border border-[#A9CDEE] bg-white px-3 py-2 text-xs font-bold text-[#342D7E] disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add condition</button>
                <button type="button" onClick={() => setStep(3)} className="flex items-center gap-1 rounded-xl bg-[#342D7E] px-4 py-2 text-xs font-bold text-white">Next <ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">What should happen, in order. Each step uses the same action as its manual button.</p>
              {draft.actions.map((a, i) => {
                const def = ACTION_BY_ID.get(a.type);
                const cfg = a.config || {};
                return (
                  <div key={a.id} className="rounded-2xl border border-[#A9CDEE] bg-white p-2.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Do #{i + 1}</span>
                        <p className="text-xs font-black text-[#342D7E]">{def?.label || a.type}</p>
                        <p className="text-[10px] text-slate-500">{def?.description}</p>
                      </div>
                      <button type="button" onClick={() => update({ actions: draft.actions.filter(x => x.id !== a.id) })} className="rounded-lg p-1 text-slate-400 hover:text-rose-600" aria-label="Remove action"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    {(a.type === "create_appointment" || a.type === "create_follow_up_task") && (
                      <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                        Schedule
                        <input type="number" min={0} max={365} value={cfg.daysFromNow ?? 1} onChange={e => updateAction(a.id, { daysFromNow: Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0)) })} className="w-16 rounded-lg border border-[#A9CDEE] px-2 py-1 text-xs" />
                        day(s) after the event (unassigned — you pick who goes)
                      </label>
                    )}
                    {a.type === "create_appointment" && (
                      <select value={cfg.appointmentType || "Site Visit"} onChange={e => updateAction(a.id, { appointmentType: e.target.value })} className="w-full rounded-xl border border-[#A9CDEE] px-2 py-2 text-xs">
                        {APPOINTMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                    {(a.type === "create_appointment" || a.type === "create_follow_up_task") && (
                      <input value={cfg.title || ""} onChange={e => updateAction(a.id, { title: e.target.value })} placeholder="Title (optional)" maxLength={120} className="w-full rounded-xl border border-[#A9CDEE] px-2 py-2 text-xs" />
                    )}
                    {a.type === "notify_team" && (
                      <select value={cfg.recipients || "owner"} onChange={e => updateAction(a.id, { recipients: e.target.value as any })} className="w-full rounded-xl border border-[#A9CDEE] px-2 py-2 text-xs">
                        <option value="owner">Owner</option>
                        <option value="managers">Managers / office</option>
                        <option value="owner_and_managers">Owner and managers</option>
                      </select>
                    )}
                    {a.type === "mark_priority" && (
                      <select value={cfg.priority || "High"} onChange={e => updateAction(a.id, { priority: e.target.value as any })} className="w-full rounded-xl border border-[#A9CDEE] px-2 py-2 text-xs">
                        {PRIORITY_VALUES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    )}
                    {a.type === "update_status" && (
                      <select value={cfg.status || ""} onChange={e => updateAction(a.id, { status: e.target.value })} className="w-full rounded-xl border border-[#A9CDEE] px-2 py-2 text-xs">
                        {safeStatusesForTrigger(draft.trigger).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    {(a.type === "send_customer_message" || a.type === "send_customer_confirmation" || a.type === "notify_team" || a.type === "add_timeline_entry" || a.type === "create_follow_up_task") && (
                      <textarea value={cfg.message || ""} onChange={e => updateAction(a.id, { message: e.target.value })} rows={2} maxLength={1000}
                        placeholder={a.type === "send_customer_confirmation" ? "Leave blank for the standard confirmation" : a.type === "notify_team" ? "Leave blank to just name the record" : a.type === "create_follow_up_task" ? "Notes (optional)" : "Text"}
                        className="w-full rounded-xl border border-[#A9CDEE] px-2 py-2 text-xs" />
                    )}
                    {(a.type === "send_customer_message" || a.type === "send_customer_confirmation") && (
                      <p className="text-[10px] text-slate-400">Posted to the customer's Messages / Customer Portal conversation. Use {"{customer}"}, {"{number}"}, {"{amount}"}, {"{date}"}, {"{business}"}.</p>
                    )}
                  </div>
                );
              })}
              {draft.actions.length < MAX_ACTIONS && (
                <select value="" onChange={e => { if (e.target.value) addAction(e.target.value as AutomationActionType); }} className="w-full rounded-xl border border-dashed border-[#342D7E] bg-white px-3 py-2 text-xs font-bold text-[#342D7E]">
                  <option value="">+ Add a DO action…</option>
                  {availableActions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              )}
              <p className="flex items-start gap-1.5 text-[10px] text-slate-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> Automations can't delete anything, move money, issue refunds, or change approved prices.</p>
            </div>
          )}

          {errors.length > 0 && (
            <ul className="space-y-0.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
              {errors.map(e => <li key={e}>• {e}</li>)}
            </ul>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-[#A9CDEE] pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] font-semibold text-slate-500">{isNew ? "Saved turned OFF — switch it on from the list when you're ready." : draft.enabled ? "This automation is ON." : "This automation is OFF."}</p>
            <div className="flex gap-2">
              <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-[#A9CDEE] bg-white px-4 py-2 text-xs font-bold text-slate-600 sm:flex-none">Cancel</button>
              <button type="button" onClick={save} className="flex-1 rounded-xl bg-[#342D7E] px-4 py-2 text-xs font-bold text-white sm:flex-none">Save automation</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const HistoryModal: React.FC<{ automation: Automation; businessId: string; onClose: () => void }> = ({ automation, businessId, onClose }) => {
  const [runs, setRuns] = useState<AutomationRun[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // Two equality filters -- no composite index needed; newest-first sort is done here.
    const q = query(collection(db, "automation_runs"), where("businessId", "==", businessId), where("automationId", "==", automation.id));
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ ...(d.data() as AutomationRun), id: d.id }));
      items.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
      setRuns(items.slice(0, 200));
    }, err => setError(err.message));
  }, [automation.id, businessId]);

  const staleRunning = (run: AutomationRun) => run.status === "Running" && Date.now() - new Date(run.startedAt).getTime() > 10 * 60 * 1000;

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#A9CDEE] bg-[#F5FAFF] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#A9CDEE] bg-[#C7E3FB] px-4 py-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#315C9F]">Execution history</p>
            <h3 className="text-sm font-black text-[#342D7E]">{automation.name}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-white/60" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-2 p-4">
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">Couldn't load history: {error}</p>}
          {runs === null && !error && <p className="py-8 text-center text-xs font-semibold text-slate-500">Loading…</p>}
          {runs?.length === 0 && <p className="py-8 text-center text-xs font-semibold text-slate-500">This automation hasn't run yet.</p>}
          {runs?.map(run => (
            <details key={run.id} className="rounded-2xl border border-[#A9CDEE] bg-white px-3 py-2">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                <StatusBadge status={run.status} />
                {staleRunning(run) && <span className="text-[9px] font-black uppercase text-amber-700">Interrupted</span>}
                <span className="text-xs font-bold text-[#342D7E]">{run.sourceLabel || run.sourceRecordId}</span>
                <span className="ml-auto text-[10px] font-semibold text-slate-400">{formatWhen(run.startedAt)}</span>
              </summary>
              <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                <p><b>Trigger:</b> {TRIGGER_BY_ID.get(run.trigger)?.label || run.trigger} · <b>Record:</b> {run.sourceCollection}/{run.sourceRecordId}</p>
                <p><b>Run by:</b> {run.runBy || "—"} · <b>Automation ID:</b> {run.automationId}</p>
                {run.conditionResults?.length > 0 && (
                  <div><b>Conditions:</b><ul className="ml-4 list-disc">{run.conditionResults.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
                )}
                {run.actionResults?.length > 0 && (
                  <div><b>Actions ({run.completedActions || 0} completed, {run.skippedActions || 0} skipped, {run.failedActions || 0} failed):</b>
                    <ul className="ml-4 list-disc">{run.actionResults.map(r => <li key={r.actionId}><span className="font-bold">{ACTION_BY_ID.get(r.type)?.label || r.type}</span> — {r.status}: {r.detail}</li>)}</ul>
                  </div>
                )}
                {run.errors?.length > 0 && <div className="text-rose-700"><b>Errors:</b><ul className="ml-4 list-disc">{run.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const AutomationsPage: React.FC = () => {
  const { loggedInUser, businessId, simulatedRole } = useAuth();
  const { triggerNotification, logOperationalEvent } = useNavTelemetry();
  const [automations, setAutomations] = useFirestoreCollection<Automation>("automations", businessId);
  const [editing, setEditing] = useState<{ automation: Automation; isNew: boolean } | null>(null);
  const [historyFor, setHistoryFor] = useState<Automation | null>(null);
  const [tab, setTab] = useState<"mine" | "templates">("mine");

  const isOwnerAccount = !!loggedInUser && !loggedInUser.isEmployee && (!simulatedRole || simulatedRole === "Owner");
  const canEdit = isOwnerAccount || hasEffectivePermission(loggedInUser?.granularPermissions, loggedInUser?.permissions, "automations", "edit");
  const canDelete = isOwnerAccount || hasEffectivePermission(loggedInUser?.granularPermissions, undefined, "automations", "delete");
  const actor = loggedInUser?.email;

  const sorted = useMemo(() => [...automations].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")), [automations]);
  const enabledCount = automations.filter(a => a.enabled).length;

  const startNew = () => setEditing({
    isNew: true,
    automation: { id: newAutomationId(), name: "", trigger: "estimate.accepted", conditions: [], actions: [], actionTypes: [], enabled: false, createdAt: new Date().toISOString(), createdBy: actor }
  });

  const saveAutomation = (automation: Automation) => {
    const isNew = !automations.some(a => a.id === automation.id);
    // New automations always start OFF (also enforced by firestore.rules).
    const toSave = isNew ? { ...automation, enabled: false, enabledAt: undefined } : automation;
    setAutomations(prev => isNew ? [toSave, ...prev] : prev.map(a => (a.id === toSave.id ? { ...a, ...toSave } : a)));
    setEditing(null);
    triggerNotification(isNew ? `"${toSave.name}" saved (OFF). Turn it on when you're ready.` : `"${toSave.name}" updated.`);
  };

  const toggle = (automation: Automation) => {
    const enabled = !automation.enabled;
    setAutomations(prev => prev.map(a => a.id === automation.id ? { ...a, enabled, enabledAt: enabled ? new Date().toISOString() : a.enabledAt } : a));
    logOperationalEvent("Automation " + (enabled ? "Enabled" : "Disabled"), `"${automation.name}" turned ${enabled ? "ON" : "OFF"}`, "⚡");
    triggerNotification(`"${automation.name}" is now ${enabled ? "ON" : "OFF"}.`);
  };

  const duplicate = (automation: Automation) => {
    const copy = duplicateAutomation(automation, actor);
    setAutomations(prev => [copy, ...prev]);
    triggerNotification(`Copied as "${copy.name}" (OFF).`);
  };

  const remove = (automation: Automation) => {
    if (!window.confirm(`Delete "${automation.name}"? Its run history is kept. Records it already created are not touched.`)) return;
    setAutomations(prev => prev.filter(a => a.id !== automation.id));
    logOperationalEvent("Automation Deleted", `"${automation.name}" deleted`, "🗑️");
  };

  const addTemplate = (templateId: string) => {
    const template = AUTOMATION_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;
    const automation = automationFromTemplate(template, actor);
    setAutomations(prev => [automation, ...prev]);
    setTab("mine");
    triggerNotification(`"${automation.name}" added (OFF). Review it, then switch it on.`);
  };

  return (
    <div className="bg-[#C7E3FB] rounded-3xl p-4 sm:p-6 border border-[#A9CDEE] shadow-sm space-y-4 animate-fade-in text-left">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 bg-[#E3F3FF] text-[#342D7E] rounded-xl border border-[#A9CDEE]"><Zap className="h-5 w-5" /></span>
          <div>
            <h1 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">Automations</h1>
            <p className="text-xs text-slate-500 font-sans font-medium">Run it your way. Automate only what you want. · {enabledCount} on / {automations.length} total</p>
          </div>
        </div>
        {canEdit && (
          <button type="button" onClick={startNew} className="flex items-center justify-center gap-1.5 rounded-xl bg-[#342D7E] px-4 py-2 text-xs font-bold text-white">
            <Plus className="h-4 w-4" /> Create automation
          </button>
        )}
      </div>

      <p className="rounded-2xl border border-[#A9CDEE] bg-[#E3F3FF] px-3 py-2 text-[11px] font-semibold text-slate-600">
        Every automation is OFF until you turn it on, and every manual button keeps working exactly the same either way. Automations run while Owner'sLOCAL is open and signed in, and each event is handled once — re-saving a record or replaying an event never creates a second job, invoice, or appointment.
      </p>

      <div className="flex gap-2">
        {(["mine", "templates"] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border ${tab === t ? "bg-[#342D7E] text-white border-[#342D7E]" : "bg-white text-[#342D7E] border-[#A9CDEE]"}`}>
            {t === "mine" ? "My automations" : "Starter templates"}
          </button>
        ))}
      </div>

      {tab === "templates" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {AUTOMATION_TEMPLATES.map(t => (
            <div key={t.id} className="flex flex-col justify-between gap-2 rounded-2xl border border-[#A9CDEE] bg-[#E3F3FF] p-3">
              <div>
                <p className="text-xs font-black text-[#342D7E]">{t.name}</p>
                <p className="text-[11px] text-slate-500">{t.description}</p>
                <p className="mt-1 text-[10px] font-semibold text-slate-500">
                  WHEN {TRIGGER_BY_ID.get(t.trigger)?.label}{t.conditions.length ? ` · IF ${t.conditions.map(c => describeCondition({ ...c, id: "" })).join(" AND ")}` : ""} · DO {t.actions.map(a => ACTION_BY_ID.get(a.type)?.label).join(" + ")}
                </p>
              </div>
              {canEdit && <button type="button" onClick={() => addTemplate(t.id)} className="self-start rounded-xl border border-[#342D7E] bg-white px-3 py-1.5 text-[11px] font-bold text-[#342D7E]">Add (starts OFF)</button>}
            </div>
          ))}
        </div>
      )}

      {tab === "mine" && (
        <div className="space-y-2">
          {sorted.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#A9CDEE] bg-[#E3F3FF] py-10 text-center">
              <Zap className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="text-xs font-semibold text-slate-500">No automations yet. Start from a template or create your own.</p>
            </div>
          )}
          {sorted.map(a => (
            <div key={a.id} className={`rounded-2xl border bg-[#E3F3FF] p-3 ${a.enabled ? "border-emerald-300" : "border-[#A9CDEE]"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#342D7E]">{a.name}</p>
                  <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                    <p><span className="font-black text-[#315C9F]">WHEN</span> {TRIGGER_BY_ID.get(a.trigger)?.label || a.trigger}</p>
                    <p><span className="font-black text-[#315C9F]">IF</span> {a.conditions?.length ? a.conditions.map(describeCondition).join(" AND ") : "Always"}</p>
                    <p><span className="font-black text-[#315C9F]">DO</span> {(a.actions || []).map(describeAction).join(" → ")}</p>
                  </div>
                </div>
                <button type="button" disabled={!canEdit} onClick={() => toggle(a)} aria-pressed={a.enabled}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase disabled:opacity-50 ${a.enabled ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-700"}`}>
                  <Power className="h-3.5 w-3.5" /> {a.enabled ? "On" : "Off"}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[#A9CDEE]/60 pt-2">
                <span className="text-[10px] font-semibold text-slate-500">Last run: {formatWhen(a.lastRunAt)}</span>
                <StatusBadge status={a.lastRunStatus} />
                {a.lastRunSummary && <span className="max-w-full truncate text-[10px] text-slate-500">{a.lastRunSummary}</span>}
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {canEdit && <button type="button" onClick={() => setEditing({ automation: a, isNew: false })} className="flex items-center gap-1 rounded-lg border border-[#A9CDEE] bg-white px-2 py-1 text-[10px] font-bold text-[#342D7E]"><Pencil className="h-3 w-3" /> Edit</button>}
                  {canEdit && <button type="button" onClick={() => duplicate(a)} className="flex items-center gap-1 rounded-lg border border-[#A9CDEE] bg-white px-2 py-1 text-[10px] font-bold text-[#342D7E]"><Copy className="h-3 w-3" /> Duplicate</button>}
                  <button type="button" onClick={() => setHistoryFor(a)} className="flex items-center gap-1 rounded-lg border border-[#A9CDEE] bg-white px-2 py-1 text-[10px] font-bold text-[#342D7E]"><History className="h-3 w-3" /> History</button>
                  {canDelete && <button type="button" onClick={() => remove(a)} className="flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-[10px] font-bold text-rose-600"><Trash2 className="h-3 w-3" /> Delete</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <AutomationBuilder initial={editing.automation} isNew={editing.isNew} onCancel={() => setEditing(null)} onSave={saveAutomation} />}
      {historyFor && businessId && <HistoryModal automation={historyFor} businessId={businessId} onClose={() => setHistoryFor(null)} />}
    </div>
  );
};

export default AutomationsPage;
