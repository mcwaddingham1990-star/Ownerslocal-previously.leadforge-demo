import React, { useEffect, useState } from "react";
import { X, Plus, Trash2, FileText } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import type { WorkOrder } from "../types/domain";
import { PriceBookModal } from "./PriceBookModal";
import { CreatePurchaseOrderPicker } from "./CreatePurchaseOrderPicker";
import { PurchaseOrderBuilder } from "./PurchaseOrderBuilder";
import type { PurchaseOrder } from "../types/purchaseOrder";
import { useAssignableEmployeeRoster } from "../hooks/useAssignableEmployees";

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

type MaterialRow = { name: string; quantity: number; unitCost: number };
type LineItemRow = { id: string; description: string; quantity: number; unitPrice: number; priceBookModelId?: string };

/**
 * The ONE shared Work Order builder -- every entry point (Estimates, Jobs,
 * Scheduling, Dispatch, Employee cards, Customer cards, Documents, and this
 * turn's standalone "Create Custom Work Order" button) opens this same
 * component instead of each page growing its own version. Passing `prefill`
 * copies data in from wherever it was opened; nothing here is a live link
 * back to that source -- editing a saved Work Order never changes the
 * Estimate/Job/Invoice/master Price Book model it came from.
 *
 * Only `date` and `jobDescription` are required to save -- everything else,
 * including having come from an Estimate/Job at all, is optional. A Work
 * Order can be created completely from scratch.
 */
export interface WorkOrderBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  /** Data copied in from an Estimate/Job/etc. when opened from one of those pages. Omit (or pass {}) for a fully blank/custom Work Order. */
  prefill?: Partial<WorkOrder>;
  /** Pass an existing saved Work Order to reopen and edit it (its own copy, not the source it came from). */
  editingWorkOrder?: WorkOrder | null;
  onSaved?: (workOrder: WorkOrder) => void;
}

const EMPTY_FORM = {
  date: todayStr(),
  jobDescription: "",
  customerId: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  address: "",
  assignedEmployees: [] as string[],
  scheduledDate: "",
  scheduledTime: "",
  priority: "Medium" as WorkOrder["priority"],
  notes: "",
  status: "Draft" as WorkOrder["status"],
  estimatedValue: ""
};

export const WorkOrderBuilder: React.FC<WorkOrderBuilderProps> = ({ isOpen, onClose, prefill, editingWorkOrder, onSaved }) => {
  const { loggedInUser } = useAuth();
  const { customers, workOrders, setWorkOrders, setSchedulingEvents, setGeneratedPdfDraft, purchaseOrders } = useDomainData();
  const { navigateToScreen, logOperationalEvent, triggerNotification } = useNavTelemetry();
  const actor = loggedInUser?.name || loggedInUser?.email || "Staff";

  // Same canonical active roster used everywhere else a job/event/work
  // order gets assigned to a person (see useAssignableEmployeeRoster).
  const assignmentCandidates = useAssignableEmployeeRoster();

  const [form, setForm] = useState(EMPTY_FORM);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [newMaterial, setNewMaterial] = useState<MaterialRow>({ name: "", quantity: 1, unitCost: 0 });
  const [newLineItem, setNewLineItem] = useState({ description: "", quantity: 1, unitPrice: 0 });
  const [isPriceBookOpen, setIsPriceBookOpen] = useState(false);
  const [isPurchaseOrderPickerOpen, setIsPurchaseOrderPickerOpen] = useState(false);
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [isPurchaseOrderBuilderOpen, setIsPurchaseOrderBuilderOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const source = editingWorkOrder || prefill || {};
    setForm({
      date: source.date || todayStr(),
      jobDescription: source.jobDescription || "",
      customerId: source.customerId || "",
      customerName: source.customerName || "",
      customerPhone: source.customerPhone || "",
      customerEmail: source.customerEmail || "",
      address: source.address || "",
      assignedEmployees: source.assignedEmployees || [],
      scheduledDate: source.scheduledDate || "",
      scheduledTime: source.scheduledTime || "",
      priority: source.priority || "Medium",
      notes: source.notes || "",
      status: source.status || "Draft",
      estimatedValue: source.estimatedValue != null ? String(source.estimatedValue) : ""
    });
    setMaterials((source.materials || []).map(m => ({ name: m.name, quantity: m.quantity, unitCost: m.unitCost })));
    setLineItems((source.lineItems || []).map(li => ({ id: li.id, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, priceBookModelId: li.priceBookModelId })));
  }, [isOpen, editingWorkOrder, prefill]);

  if (!isOpen) return null;

  const canSave = form.date.trim() !== "" && form.jobDescription.trim() !== "";

  const toggleEmployee = (name: string) => {
    setForm(prev => ({
      ...prev,
      assignedEmployees: prev.assignedEmployees.includes(name)
        ? prev.assignedEmployees.filter(n => n !== name)
        : [...prev.assignedEmployees, name]
    }));
  };

  const addMaterial = () => {
    if (!newMaterial.name.trim() || newMaterial.quantity <= 0) return;
    setMaterials(prev => [...prev, { ...newMaterial, name: newMaterial.name.trim() }]);
    setNewMaterial({ name: "", quantity: 1, unitCost: 0 });
  };

  const addLineItem = () => {
    if (!newLineItem.description.trim() || newLineItem.quantity <= 0) return;
    setLineItems(prev => [...prev, { id: uid("li"), ...newLineItem, description: newLineItem.description.trim() }]);
    setNewLineItem({ description: "", quantity: 1, unitPrice: 0 });
  };

  const handleSave = () => {
    if (!canSave) {
      triggerNotification("Date and Job Description are required to save a Work Order.");
      return;
    }
    const now = new Date().toISOString();
    const id = editingWorkOrder?.id || uid("wo");
    const workOrder: WorkOrder = {
      id,
      workOrderNumber: editingWorkOrder?.workOrderNumber || `WO-${new Date().getFullYear()}-${String(workOrders.length + 1).padStart(4, "0")}`,
      date: form.date,
      jobDescription: form.jobDescription.trim(),
      customerId: form.customerId || undefined,
      customerName: form.customerName.trim() || undefined,
      customerPhone: form.customerPhone.trim() || undefined,
      customerEmail: form.customerEmail.trim() || undefined,
      address: form.address.trim() || undefined,
      sourceEstimateId: editingWorkOrder?.sourceEstimateId ?? prefill?.sourceEstimateId,
      sourceJobId: editingWorkOrder?.sourceJobId ?? prefill?.sourceJobId,
      assignedEmployees: form.assignedEmployees.length ? form.assignedEmployees : undefined,
      scheduledDate: form.scheduledDate || undefined,
      scheduledTime: form.scheduledTime || undefined,
      priority: form.priority,
      notes: form.notes.trim() || undefined,
      materials: materials.length ? materials : undefined,
      lineItems: lineItems.length ? lineItems : undefined,
      status: form.status,
      estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : undefined,
      createdAt: editingWorkOrder?.createdAt || now,
      updatedAt: now,
      createdBy: editingWorkOrder?.createdBy || loggedInUser?.email,
      activity: [
        ...(editingWorkOrder?.activity || []),
        { id: uid("act"), timestamp: now, action: editingWorkOrder ? "Work order edited" : "Work order created", by: actor }
      ]
    };

    setWorkOrders(prev => editingWorkOrder ? prev.map(w => w.id === id ? workOrder : w) : [workOrder, ...prev]);

    // Populate through the app: a scheduled + assigned Work Order shows up
    // on Scheduling/Dispatch/Map/Employee Locations for free, since those
    // pages already render every scheduling_events record -- no new code
    // needed there. A companion record is created/kept in sync rather than
    // duplicating that rendering logic here.
    if (form.scheduledDate && form.assignedEmployees.length) {
      setSchedulingEvents(prev => {
        const existing = prev.find(e => e.sourceWorkOrderId === id);
        const base = {
          eventType: "Work Order",
          date: form.scheduledDate,
          startTime: form.scheduledTime || "09:00",
          endTime: form.scheduledTime || "10:00",
          customer: form.customerName || "Work Order",
          customerPhone: form.customerPhone || undefined,
          customerAddress: form.address || undefined,
          customerId: form.customerId || undefined,
          assignedEmployee: form.assignedEmployees[0],
          assignedCrew: form.assignedEmployees.length > 1 ? form.assignedEmployees.join(", ") : undefined,
          priority: form.priority,
          status: "Assigned" as const,
          title: form.jobDescription.slice(0, 80),
          description: form.jobDescription,
          location: form.address || undefined,
          sourceWorkOrderId: id,
          updatedAt: now
        };
        if (existing) return prev.map(e => e.id === existing.id ? { ...e, ...base } : e);
        return [...prev, { id: uid("evt"), createdAt: now, ...base }];
      });
    }

    logOperationalEvent(editingWorkOrder ? "Work Order Updated" : "Work Order Created", `${workOrder.workOrderNumber} — ${workOrder.jobDescription}`, "🧰");
    triggerNotification(editingWorkOrder ? "Work order updated." : "Work order created.");
    onSaved?.(workOrder);
    onClose();
  };

  const generatePdf = () => {
    if (!canSave) {
      triggerNotification("Save the Work Order first (Date and Job Description are required).");
      return;
    }
    handleSave();
    setGeneratedPdfDraft({
      filename: `${editingWorkOrder?.workOrderNumber || "Work-Order"}.pdf`,
      title: `Work Order ${editingWorkOrder?.workOrderNumber || ""}`.trim(),
      sourceType: "Work Order",
      sourceId: editingWorkOrder?.id || "",
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      customerEmail: form.customerEmail,
      representativeName: actor,
      lines: [
        `Date: ${form.date}`,
        `Customer: ${form.customerName || "—"}`,
        `Address: ${form.address || "—"}`,
        `Assigned: ${form.assignedEmployees.join(", ") || "Unassigned"}`,
        `Scheduled: ${form.scheduledDate ? `${form.scheduledDate} ${form.scheduledTime || ""}` : "Not scheduled"}`,
        "",
        `Job Description: ${form.jobDescription}`,
        "",
        ...(materials.length ? ["Materials:", ...materials.map(m => `  ${m.quantity} x ${m.name} — $${(m.quantity * m.unitCost).toFixed(2)}`)] : []),
        ...(lineItems.length ? ["", "Labor/Tasks:", ...lineItems.map(li => `  ${li.quantity} x ${li.description} — $${(li.quantity * li.unitPrice).toFixed(2)}`)] : []),
        ...(form.notes ? ["", `Notes: ${form.notes}`] : [])
      ]
    });
    navigateToScreen("documents");
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#9EC8EF] bg-[#F5FAFF] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#9EC8EF] bg-[#C7E3FA] px-4 py-3">
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-[#315C9F]">{editingWorkOrder?.workOrderNumber || "New Work Order"}</p>
            <h3 className="text-base font-black text-[#1F3557]">Work Order</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-white" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date *">
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input" />
            </Field>
            <Field label="Priority">
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as WorkOrder["priority"] })} className="input">
                {["Low", "Medium", "High", "Urgent"].map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Job Description *">
            <textarea value={form.jobDescription} onChange={e => setForm({ ...form, jobDescription: e.target.value })} rows={3} className="input" placeholder="What needs to be done" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer (optional)">
              <select
                value={form.customerId}
                onChange={e => {
                  const c = customers.find(x => x.id === e.target.value);
                  setForm({ ...form, customerId: e.target.value, customerName: c ? (c.contact || c.company) : form.customerName, customerPhone: c?.phone || form.customerPhone, address: c?.address || form.address });
                }}
                className="input"
              >
                <option value="">Not linked to a customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.contact || c.company}</option>)}
              </select>
            </Field>
            <Field label="Customer name">
              <input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} className="input" placeholder="Customer name" />
            </Field>
            <Field label="Phone">
              <input value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} className="input" placeholder="(555) 555-0123" />
            </Field>
            <Field label="Address">
              <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input" placeholder="Job site address" />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Scheduled date">
              <input type="date" value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} className="input" />
            </Field>
            <Field label="Scheduled time">
              <input type="time" value={form.scheduledTime} onChange={e => setForm({ ...form, scheduledTime: e.target.value })} className="input" />
            </Field>
          </div>

          <Field label="Assigned employee(s)">
            <div className="flex flex-wrap gap-2 rounded-xl border border-[#9EC8EF] bg-white p-2">
              {assignmentCandidates.length === 0 && <p className="px-1 text-xs text-slate-400">No roster yet.</p>}
              {assignmentCandidates.map(r => (
                <button
                  type="button"
                  key={r.id || r.name}
                  onClick={() => toggleEmployee(r.name)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${form.assignedEmployees.includes(r.name) ? "bg-[#315C9F] text-white" : "bg-[#EAF5FF] text-[#315C9F]"}`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </Field>

          <div className="rounded-2xl border border-[#9EC8EF] bg-white p-3">
            <p className="text-xs font-black uppercase text-[#1F3557]">Materials</p>
            <div className="mt-2 space-y-1.5">
              {materials.map((m, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-blue-50 p-2 text-xs">
                  <span>{m.quantity} × {m.name}</span>
                  <div className="flex items-center gap-2">
                    <b>${(m.quantity * m.unitCost).toFixed(2)}</b>
                    <button type="button" onClick={() => setMaterials(prev => prev.filter((_, idx) => idx !== i))} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_60px_80px_auto] gap-2">
              <input value={newMaterial.name} onChange={e => setNewMaterial({ ...newMaterial, name: e.target.value })} placeholder="Material" className="input" />
              <input type="number" min="1" value={newMaterial.quantity} onChange={e => setNewMaterial({ ...newMaterial, quantity: Number(e.target.value) })} className="input" />
              <input type="number" min="0" step="0.01" value={newMaterial.unitCost} onChange={e => setNewMaterial({ ...newMaterial, unitCost: Number(e.target.value) })} placeholder="Unit $" className="input" />
              <button type="button" onClick={addMaterial} className="rounded-lg bg-[#315C9F] px-3 text-white"><Plus className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="rounded-2xl border border-[#9EC8EF] bg-white p-3">
            <p className="text-xs font-black uppercase text-[#1F3557]">Labor / Tasks</p>
            <div className="mt-2 space-y-1.5">
              {lineItems.map((li, i) => (
                <div key={li.id} className="flex items-center justify-between rounded-lg bg-blue-50 p-2 text-xs">
                  <span>{li.quantity} × {li.description}</span>
                  <div className="flex items-center gap-2">
                    <b>${(li.quantity * li.unitPrice).toFixed(2)}</b>
                    <button type="button" onClick={() => setLineItems(prev => prev.filter((_, idx) => idx !== i))} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_60px_80px_auto] gap-2">
              <input value={newLineItem.description} onChange={e => setNewLineItem({ ...newLineItem, description: e.target.value })} placeholder="Task / labor" className="input" />
              <input type="number" min="1" value={newLineItem.quantity} onChange={e => setNewLineItem({ ...newLineItem, quantity: Number(e.target.value) })} className="input" />
              <input type="number" min="0" step="0.01" value={newLineItem.unitPrice} onChange={e => setNewLineItem({ ...newLineItem, unitPrice: Number(e.target.value) })} placeholder="Price" className="input" />
              <button type="button" onClick={addLineItem} className="rounded-lg bg-[#315C9F] px-3 text-white"><Plus className="h-4 w-4" /></button>
            </div>
            <button type="button" onClick={() => setIsPriceBookOpen(true)} className="mt-2 w-full rounded-lg border border-dashed border-[#315C9F] py-2 text-xs font-black text-[#315C9F]">💲 Add Flat Rate Pricing Model</button>
          </div>

          {editingWorkOrder?.id && (
            <div className="rounded-2xl border border-[#9EC8EF] bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase text-[#1F3557]">Purchase Orders</p>
                <button
                  type="button"
                  onClick={() => setIsPurchaseOrderPickerOpen(true)}
                  className="rounded-lg bg-[#315C9F] px-2.5 py-1.5 text-[10px] font-black text-white uppercase"
                >
                  New PO
                </button>
              </div>
              <div className="mt-2 space-y-1.5">
                {purchaseOrders.filter(p => p.sourceWorkOrderId === editingWorkOrder.id).map(po => (
                  <button key={po.id} type="button" onClick={() => { setEditingPurchaseOrder(po); setIsPurchaseOrderBuilderOpen(true); }} className="flex w-full items-center justify-between rounded-lg bg-blue-50 p-2 text-left text-xs">
                    <span>{po.poNumber} — {po.vendor}</span>
                    <span className="font-bold text-[#5E7393]">{po.status}</span>
                  </button>
                ))}
                {purchaseOrders.filter(p => p.sourceWorkOrderId === editingWorkOrder.id).length === 0 && <p className="text-xs text-slate-400">No purchase orders yet.</p>}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as WorkOrder["status"] })} className="input">
                {["Draft", "Scheduled", "In Progress", "Completed", "Cancelled"].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Estimated value">
              <input type="number" min="0" step="0.01" value={form.estimatedValue} onChange={e => setForm({ ...form, estimatedValue: e.target.value })} className="input" placeholder="0.00" />
            </Field>
          </div>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="input" />
          </Field>
        </div>

        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[#9EC8EF] bg-[#F5FAFF] px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={generatePdf} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white"><FileText className="mr-1 inline h-3.5 w-3.5" />Generate PDF</button>
          <button type="button" disabled={!canSave} onClick={handleSave} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white disabled:opacity-40">Save Work Order</button>
        </div>
      </div>
      <PriceBookModal
        isOpen={isPriceBookOpen}
        onClose={() => setIsPriceBookOpen(false)}
        pickerMode={{ onPick: (item) => { setLineItems(prev => [...prev, { id: uid("li"), ...item }]); setIsPriceBookOpen(false); } }}
      />
      <CreatePurchaseOrderPicker
        isOpen={isPurchaseOrderPickerOpen}
        onClose={() => setIsPurchaseOrderPickerOpen(false)}
        prefillBase={{ sourceWorkOrderId: editingWorkOrder?.id, sourceJobId: editingWorkOrder?.sourceJobId }}
      />
      <PurchaseOrderBuilder
        isOpen={isPurchaseOrderBuilderOpen}
        onClose={() => setIsPurchaseOrderBuilderOpen(false)}
        editingPurchaseOrder={editingPurchaseOrder}
        onSaved={() => setEditingPurchaseOrder(null)}
      />
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1">
    <span className="text-[9px] font-bold uppercase tracking-wider text-[#5E7393]">{label}</span>
    {children}
  </label>
);
