import React, { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, FileText } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import type { Membership, MaintenanceFrequencyUnit, BillingFrequency, MembershipStatus, MembershipBillingMethod, MembershipIncludedService, MembershipCustomField } from "../types/membership";
import { PriceBookModal } from "./PriceBookModal";

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * The ONE shared Membership / Service Agreement builder. Every entry point
 * (Customers, Estimates, Jobs, Scheduling, Documents -> Service Agreements)
 * opens this same component instead of each page growing its own version.
 * A Membership is 100% user-built -- there are no preset plans baked in;
 * every field here starts blank (or copied from `prefill`) and the user
 * fills in whatever their business actually offers.
 */
export interface MembershipBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  prefill?: Partial<Membership>;
  editingMembership?: Membership | null;
  onSaved?: (membership: Membership) => void;
}

const EMPTY_FORM = {
  planName: "",
  description: "",
  price: "",
  billingFrequency: "monthly" as BillingFrequency,
  customBillingDays: "",
  discountPercent: "",
  discountFlat: "",
  maintenanceUnit: "months" as MaintenanceFrequencyUnit,
  maintenanceInterval: "1",
  startDate: todayStr(),
  endDate: "",
  notes: "",
  customerId: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  address: "",
  sourceEstimateId: "",
  sourceJobId: "",
  assignedEmployee: "",
  assignedCrew: "",
  status: "Active" as MembershipStatus,
  billingMethod: "manual" as MembershipBillingMethod
};

/** Advances a start date forward by one maintenance cycle -- the same math
 * the server's advanceMaintenanceDate uses -- so the first-ever
 * nextMaintenanceDate set here lines up with what the scheduler expects. */
function addInterval(dateStr: string, unit: MaintenanceFrequencyUnit, interval: number): string {
  const d = new Date(dateStr + "T00:00:00");
  if (unit === "days") d.setDate(d.getDate() + interval);
  else if (unit === "weeks") d.setDate(d.getDate() + interval * 7);
  else if (unit === "months") d.setMonth(d.getMonth() + interval);
  else if (unit === "years") d.setFullYear(d.getFullYear() + interval);
  return d.toISOString().slice(0, 10);
}

function firstBillingDate(startDate: string, freq: BillingFrequency, customDays: number): string {
  if (freq === "one_time") return startDate;
  if (freq === "weekly") return addInterval(startDate, "weeks", 1);
  if (freq === "quarterly") return addInterval(startDate, "months", 3);
  if (freq === "annually") return addInterval(startDate, "years", 1);
  if (freq === "custom") return addInterval(startDate, "days", Math.max(1, customDays || 30));
  return addInterval(startDate, "months", 1);
}

export const MembershipBuilder: React.FC<MembershipBuilderProps> = ({ isOpen, onClose, prefill, editingMembership, onSaved }) => {
  const { loggedInUser } = useAuth();
  const { customers, schedulingEvents, estimates, recentRoster, employees, memberships, setMemberships, setGeneratedPdfDraft } = useDomainData();
  const { navigateToScreen, logOperationalEvent, triggerNotification } = useNavTelemetry();
  const actor = loggedInUser?.name || loggedInUser?.email || "Staff";

  // Same "active roster" source as Estimates/Scheduling/Work Orders/Dispatch
  // -- recentRoster alone is just the invite-code ledger (often stale
  // "Pending" entries), not the real employee roster, so real active
  // employees never showed up here on their own.
  const assignmentCandidates = useMemo(() => {
    const byName = new Map<string, { id: string; name: string }>();
    recentRoster
      .filter(person => person.status?.toLowerCase() !== "inactive")
      .forEach(person => byName.set(person.name.trim().toLowerCase(), { id: person.id || person.code || person.name, name: person.name }));
    employees.forEach(employee => {
      const name = `${employee.firstName} ${employee.lastName}`.trim();
      if (name) byName.set(name.toLowerCase(), { id: employee.id || employee.email, name });
    });
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [recentRoster, employees]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [includedServices, setIncludedServices] = useState<MembershipIncludedService[]>([]);
  const [newService, setNewService] = useState({ description: "", quantity: 1, unitPrice: 0 });
  const [customFields, setCustomFields] = useState<MembershipCustomField[]>([]);
  const [newField, setNewField] = useState({ key: "", value: "" });
  const [specificDates, setSpecificDates] = useState<string[]>([]);
  const [newSpecificDate, setNewSpecificDate] = useState("");
  const [isPriceBookOpen, setIsPriceBookOpen] = useState(false);

  const jobs = schedulingEvents.filter(e => e.eventType === "Job");

  useEffect(() => {
    if (!isOpen) return;
    const source = editingMembership || prefill || {};
    setForm({
      planName: source.planName || "",
      description: source.description || "",
      price: source.price != null ? String(source.price) : "",
      billingFrequency: source.billingFrequency || "monthly",
      customBillingDays: source.customBillingDays != null ? String(source.customBillingDays) : "",
      discountPercent: source.discountPercent != null ? String(source.discountPercent) : "",
      discountFlat: source.discountFlat != null ? String(source.discountFlat) : "",
      maintenanceUnit: source.maintenanceFrequency?.unit || "months",
      maintenanceInterval: source.maintenanceFrequency?.interval != null ? String(source.maintenanceFrequency.interval) : "1",
      startDate: source.startDate || todayStr(),
      endDate: source.endDate || "",
      notes: source.notes || "",
      customerId: source.customerId || "",
      customerName: source.customerName || "",
      customerPhone: source.customerPhone || "",
      customerEmail: source.customerEmail || "",
      address: source.address || "",
      sourceEstimateId: source.sourceEstimateId || "",
      sourceJobId: source.sourceJobId || "",
      assignedEmployee: source.assignedEmployee || "",
      assignedCrew: source.assignedCrew || "",
      status: source.status || "Active",
      billingMethod: source.billingMethod || "manual"
    });
    setIncludedServices((source.includedServices || []).map(s => ({ ...s })));
    setCustomFields((source.customFields || []).map(f => ({ ...f })));
    setSpecificDates(source.maintenanceFrequency?.specificDates || []);
  }, [isOpen, editingMembership, prefill]);

  if (!isOpen) return null;

  const canSave = form.planName.trim() !== "" && form.customerName.trim() !== "" && form.startDate.trim() !== "";

  const addService = () => {
    if (!newService.description.trim() || newService.quantity <= 0) return;
    setIncludedServices(prev => [...prev, { id: uid("svc"), description: newService.description.trim(), quantity: newService.quantity, unitPrice: newService.unitPrice }]);
    setNewService({ description: "", quantity: 1, unitPrice: 0 });
  };

  const addCustomField = () => {
    if (!newField.key.trim()) return;
    setCustomFields(prev => [...prev, { key: newField.key.trim(), value: newField.value.trim() }]);
    setNewField({ key: "", value: "" });
  };

  const addSpecificDate = () => {
    if (!newSpecificDate || specificDates.includes(newSpecificDate)) return;
    setSpecificDates(prev => [...prev, newSpecificDate].sort());
    setNewSpecificDate("");
  };

  const handleSave = () => {
    if (!canSave) {
      triggerNotification("Plan Name, Customer, and Start Date are required to save a Membership.");
      return;
    }
    const now = new Date().toISOString();
    const id = editingMembership?.id || uid("mem");
    const interval = Math.max(1, Number(form.maintenanceInterval) || 1);
    const maintenanceFrequency = {
      unit: form.maintenanceUnit,
      interval: form.maintenanceUnit === "specific_dates" ? undefined : interval,
      specificDates: form.maintenanceUnit === "specific_dates" ? specificDates : undefined
    };
    const nextMaintenanceDate = editingMembership?.nextMaintenanceDate
      || (form.maintenanceUnit === "specific_dates"
        ? specificDates.find(d => d >= form.startDate) || specificDates[0]
        : addInterval(form.startDate, form.maintenanceUnit, interval));
    const nextPaymentDate = editingMembership?.nextPaymentDate
      || (form.billingFrequency === "one_time" ? undefined : firstBillingDate(form.startDate, form.billingFrequency, Number(form.customBillingDays) || 30));

    const membership: Membership = {
      id,
      membershipNumber: editingMembership?.membershipNumber || `MEM-${new Date().getFullYear()}-${String(memberships.length + 1).padStart(4, "0")}`,
      planName: form.planName.trim(),
      description: form.description.trim() || undefined,
      price: Number(form.price) || 0,
      billingFrequency: form.billingFrequency,
      customBillingDays: form.billingFrequency === "custom" ? Number(form.customBillingDays) || 30 : undefined,
      includedServices,
      discountPercent: form.discountPercent ? Number(form.discountPercent) : undefined,
      discountFlat: form.discountFlat ? Number(form.discountFlat) : undefined,
      maintenanceFrequency,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      notes: form.notes.trim() || undefined,
      customFields: customFields.length ? customFields : undefined,
      customerId: form.customerId || "",
      customerName: form.customerName.trim() || undefined,
      customerPhone: form.customerPhone.trim() || undefined,
      customerEmail: form.customerEmail.trim() || undefined,
      address: form.address.trim() || undefined,
      sourceEstimateId: form.sourceEstimateId || undefined,
      sourceJobId: form.sourceJobId || undefined,
      assignedEmployee: form.assignedEmployee || undefined,
      assignedCrew: form.assignedCrew.trim() || undefined,
      status: form.status,
      nextMaintenanceDate,
      lastGeneratedVisitDate: editingMembership?.lastGeneratedVisitDate,
      billingMethod: form.billingMethod,
      nextPaymentDate,
      lastBilledDate: editingMembership?.lastBilledDate,
      stripeSubscriptionId: editingMembership?.stripeSubscriptionId,
      createdAt: editingMembership?.createdAt || now,
      updatedAt: now,
      createdBy: editingMembership?.createdBy || loggedInUser?.email,
      activity: [
        ...(editingMembership?.activity || []),
        { id: uid("act"), timestamp: now, action: editingMembership ? "Membership edited" : "Membership created", by: actor }
      ]
    };

    setMemberships(prev => editingMembership ? prev.map(m => m.id === id ? membership : m) : [membership, ...prev]);
    logOperationalEvent(editingMembership ? "Membership Updated" : "Membership Created", `${membership.membershipNumber} — ${membership.planName}`, "📜");
    triggerNotification(editingMembership ? "Membership updated." : "Membership created.");
    onSaved?.(membership);
    onClose();
  };

  const generatePdf = () => {
    if (!canSave) {
      triggerNotification("Save the Membership first (Plan Name, Customer, and Start Date are required).");
      return;
    }
    handleSave();
    setGeneratedPdfDraft({
      filename: `${editingMembership?.membershipNumber || "Service-Agreement"}.pdf`,
      title: `Service Agreement ${editingMembership?.membershipNumber || ""}`.trim(),
      sourceType: "Service Agreement",
      sourceId: editingMembership?.id || "",
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      customerEmail: form.customerEmail,
      representativeName: actor,
      autoCaptureSignatures: true,
      lines: [
        `Plan: ${form.planName}`,
        `Customer: ${form.customerName || "—"}`,
        `Address: ${form.address || "—"}`,
        `Price: $${(Number(form.price) || 0).toFixed(2)} (${form.billingFrequency})`,
        `Start Date: ${form.startDate}${form.endDate ? ` — End Date: ${form.endDate}` : ""}`,
        `Maintenance: every ${form.maintenanceUnit === "specific_dates" ? "specific dates" : `${form.maintenanceInterval} ${form.maintenanceUnit}`}`,
        "",
        ...(form.description ? [`Description: ${form.description}`, ""] : []),
        ...(includedServices.length ? ["Included Services:", ...includedServices.map(s => `  ${s.quantity} x ${s.description} — $${(s.quantity * s.unitPrice).toFixed(2)}`)] : []),
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
            <p className="text-[8px] font-black uppercase tracking-widest text-[#315C9F]">{editingMembership?.membershipNumber || "New Membership"}</p>
            <h3 className="text-base font-black text-[#1F3557]">Service Agreement</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-white" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-4">
          <Field label="Plan Name *">
            <input value={form.planName} onChange={e => setForm({ ...form, planName: e.target.value })} className="input" placeholder="e.g. Quarterly HVAC Tune-Up" />
          </Field>

          <Field label="Description">
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="input" placeholder="What this plan covers" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer *">
              <select
                value={form.customerId}
                onChange={e => {
                  const c = customers.find(x => x.id === e.target.value);
                  setForm({ ...form, customerId: e.target.value, customerName: c ? (c.contact || c.company) : form.customerName, customerPhone: c?.phone || form.customerPhone, customerEmail: c?.email || form.customerEmail, address: c?.address || form.address });
                }}
                className="input"
              >
                <option value="">Select a customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.contact || c.company}</option>)}
              </select>
            </Field>
            <Field label="Customer name">
              <input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} className="input" placeholder="Customer name" />
            </Field>
            <Field label="Phone">
              <input value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} className="input" />
            </Field>
            <Field label="Property / Address">
              <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input" placeholder="Job site covered by this plan" />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Linked estimate (optional)">
              <select value={form.sourceEstimateId} onChange={e => setForm({ ...form, sourceEstimateId: e.target.value })} className="input">
                <option value="">Not linked</option>
                {estimates.map(est => <option key={est.id} value={est.id}>{est.number} — {est.customerName}</option>)}
              </select>
            </Field>
            <Field label="Linked job (optional)">
              <select value={form.sourceJobId} onChange={e => setForm({ ...form, sourceJobId: e.target.value })} className="input">
                <option value="">Not linked</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.jobNumber || j.title || "Job"} — {j.customer}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Assigned employee (optional)">
            <div className="flex flex-wrap gap-2 rounded-xl border border-[#9EC8EF] bg-white p-2">
              {assignmentCandidates.length === 0 && <p className="px-1 text-xs text-slate-400">No roster yet.</p>}
              {assignmentCandidates.map(r => (
                <button
                  type="button"
                  key={r.id || r.name}
                  onClick={() => setForm({ ...form, assignedEmployee: form.assignedEmployee === r.name ? "" : r.name })}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${form.assignedEmployee === r.name ? "bg-[#315C9F] text-white" : "bg-[#EAF5FF] text-[#315C9F]"}`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </Field>

          <div className="rounded-2xl border border-[#9EC8EF] bg-white p-3">
            <p className="text-xs font-black uppercase text-[#1F3557]">Included Services</p>
            <div className="mt-2 space-y-1.5">
              {includedServices.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg bg-blue-50 p-2 text-xs">
                  <span>{s.quantity} × {s.description}</span>
                  <div className="flex items-center gap-2">
                    <b>${(s.quantity * s.unitPrice).toFixed(2)}</b>
                    <button type="button" onClick={() => setIncludedServices(prev => prev.filter((_, idx) => idx !== i))} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_60px_80px_auto] gap-2">
              <input value={newService.description} onChange={e => setNewService({ ...newService, description: e.target.value })} placeholder="Service" className="input" />
              <input type="number" min="1" value={newService.quantity} onChange={e => setNewService({ ...newService, quantity: Number(e.target.value) })} className="input" />
              <input type="number" min="0" step="0.01" value={newService.unitPrice} onChange={e => setNewService({ ...newService, unitPrice: Number(e.target.value) })} placeholder="Price" className="input" />
              <button type="button" onClick={addService} className="rounded-lg bg-[#315C9F] px-3 text-white"><Plus className="h-4 w-4" /></button>
            </div>
            <button type="button" onClick={() => setIsPriceBookOpen(true)} className="mt-2 w-full rounded-lg border border-dashed border-[#315C9F] py-2 text-xs font-black text-[#315C9F]">💲 Add Flat Rate Pricing Model</button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Price *">
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="input" placeholder="0.00" />
            </Field>
            <Field label="Billing frequency">
              <select value={form.billingFrequency} onChange={e => setForm({ ...form, billingFrequency: e.target.value as BillingFrequency })} className="input">
                {["weekly", "monthly", "quarterly", "annually", "one_time", "custom"].map(f => <option key={f} value={f}>{f.replace("_", " ")}</option>)}
              </select>
            </Field>
            {form.billingFrequency === "custom" && (
              <Field label="Every N days">
                <input type="number" min="1" value={form.customBillingDays} onChange={e => setForm({ ...form, customBillingDays: e.target.value })} className="input" />
              </Field>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Discount %">
              <input type="number" min="0" max="100" value={form.discountPercent} onChange={e => setForm({ ...form, discountPercent: e.target.value })} className="input" />
            </Field>
            <Field label="Discount $">
              <input type="number" min="0" step="0.01" value={form.discountFlat} onChange={e => setForm({ ...form, discountFlat: e.target.value })} className="input" />
            </Field>
            <Field label="How this bills">
              <select value={form.billingMethod} onChange={e => setForm({ ...form, billingMethod: e.target.value as MembershipBillingMethod })} className="input">
                <option value="manual">Manual (record payment yourself)</option>
                <option value="invoice">Auto-create Invoice</option>
                <option value="stripe">Card on file (Stripe)</option>
              </select>
            </Field>
          </div>

          <div className="rounded-2xl border border-[#9EC8EF] bg-white p-3">
            <p className="text-xs font-black uppercase text-[#1F3557]">Recurring Maintenance</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Repeats every">
                <select value={form.maintenanceUnit} onChange={e => setForm({ ...form, maintenanceUnit: e.target.value as MaintenanceFrequencyUnit })} className="input">
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                  <option value="specific_dates">Specific Dates</option>
                </select>
              </Field>
              {form.maintenanceUnit !== "specific_dates" && (
                <Field label="Interval">
                  <input type="number" min="1" value={form.maintenanceInterval} onChange={e => setForm({ ...form, maintenanceInterval: e.target.value })} className="input" />
                </Field>
              )}
            </div>
            {form.maintenanceUnit === "specific_dates" && (
              <div className="mt-2">
                <div className="flex flex-wrap gap-1.5">
                  {specificDates.map(d => (
                    <span key={d} className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-[#315C9F]">
                      {d}
                      <button type="button" onClick={() => setSpecificDates(prev => prev.filter(x => x !== d))}><Trash2 className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input type="date" value={newSpecificDate} onChange={e => setNewSpecificDate(e.target.value)} className="input" />
                  <button type="button" onClick={addSpecificDate} className="rounded-lg bg-[#315C9F] px-3 text-white"><Plus className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Start date *">
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="input" />
            </Field>
            <Field label="End date (optional)">
              <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="input" />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as MembershipStatus })} className="input">
                {["Draft", "Active", "Paused", "Canceled", "Expired"].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div className="rounded-2xl border border-[#9EC8EF] bg-white p-3">
            <p className="text-xs font-black uppercase text-[#1F3557]">Custom Fields</p>
            <div className="mt-2 space-y-1.5">
              {customFields.map((f, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-blue-50 p-2 text-xs">
                  <span><b>{f.key}:</b> {f.value}</span>
                  <button type="button" onClick={() => setCustomFields(prev => prev.filter((_, idx) => idx !== i))} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
              <input value={newField.key} onChange={e => setNewField({ ...newField, key: e.target.value })} placeholder="Field name" className="input" />
              <input value={newField.value} onChange={e => setNewField({ ...newField, value: e.target.value })} placeholder="Value" className="input" />
              <button type="button" onClick={addCustomField} className="rounded-lg bg-[#315C9F] px-3 text-white"><Plus className="h-4 w-4" /></button>
            </div>
          </div>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="input" />
          </Field>
        </div>

        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[#9EC8EF] bg-[#F5FAFF] px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={generatePdf} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white"><FileText className="mr-1 inline h-3.5 w-3.5" />Generate PDF</button>
          <button type="button" disabled={!canSave} onClick={handleSave} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white disabled:opacity-40">Save Membership</button>
        </div>
      </div>
      <PriceBookModal
        isOpen={isPriceBookOpen}
        onClose={() => setIsPriceBookOpen(false)}
        pickerMode={{ onPick: (item) => { setIncludedServices(prev => [...prev, { id: uid("svc"), ...item }]); setIsPriceBookOpen(false); } }}
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
