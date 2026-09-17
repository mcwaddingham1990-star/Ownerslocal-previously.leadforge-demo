import React, { useEffect, useRef, useState } from "react";
import { X, Plus, Trash2, FileText, Camera } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from "../types/purchaseOrder";
import type { Bill } from "../types/accounting";
import { postBillCreatedEntry } from "../lib/accountingEngine";
import { downscaleImageToBase64 } from "../lib/imageCompression";
import { MAX_INLINE_BASE64_LENGTH } from "../lib/firestoreDocumentLimits";

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const lineTotal = (item: { quantity: number; unitCost: number }) => item.quantity * item.unitCost;

/**
 * The ONE shared Purchase Order builder -- every entry point (Jobs,
 * Inventory, Accounting, Work Orders, Documents -> Purchase Orders) opens
 * this same component. 100% user-created: no preset vendors, materials,
 * prices, or PO templates. Only Date, Vendor, and at least one item/
 * description are required to save.
 */
export interface PurchaseOrderBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  prefill?: Partial<PurchaseOrder>;
  editingPurchaseOrder?: PurchaseOrder | null;
  onSaved?: (po: PurchaseOrder) => void;
}

const EMPTY_FORM = {
  vendor: "",
  vendorEmail: "",
  vendorPhone: "",
  date: todayStr(),
  sourceJobId: "",
  sourceWorkOrderId: "",
  requestedBy: "",
  assignedEmployee: "",
  deliveryMethod: "" as "" | "Delivery" | "Pickup",
  expectedDate: "",
  notes: "",
  status: "Draft" as PurchaseOrderStatus
};

export const PurchaseOrderBuilder: React.FC<PurchaseOrderBuilderProps> = ({ isOpen, onClose, prefill, editingPurchaseOrder, onSaved }) => {
  const { loggedInUser } = useAuth();
  const {
    schedulingEvents, setSchedulingEvents, workOrders, setWorkOrders, inventoryList, setInventoryList,
    vendors, recentRoster, purchaseOrders, setPurchaseOrders, setBills, setJournalEntries, saveTransaction,
    setGeneratedPdfDraft
  } = useDomainData();
  const { navigateToScreen, logOperationalEvent, triggerNotification } = useNavTelemetry();
  const actor = loggedInUser?.name || loggedInUser?.email || "Staff";
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [current, setCurrent] = useState<PurchaseOrder | null>(null);
  const [mode, setMode] = useState<"edit" | "receive">("edit");
  const [receiveDraft, setReceiveDraft] = useState<Record<string, { quantity: string; unitCost: string }>>({});
  const [newItemInventoryId, setNewItemInventoryId] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemCost, setNewItemCost] = useState(0);
  const [receiptBase64, setReceiptBase64] = useState<string | undefined>(undefined);
  const [receiptFilename, setReceiptFilename] = useState<string | undefined>(undefined);

  const jobs = schedulingEvents.filter(e => e.eventType === "Job");

  useEffect(() => {
    if (!isOpen) return;
    const source = editingPurchaseOrder || prefill || {};
    setForm({
      vendor: source.vendor || "",
      vendorEmail: source.vendorEmail || "",
      vendorPhone: source.vendorPhone || "",
      date: source.date || todayStr(),
      sourceJobId: source.sourceJobId || "",
      sourceWorkOrderId: source.sourceWorkOrderId || "",
      requestedBy: source.requestedBy || "",
      assignedEmployee: source.assignedEmployee || "",
      deliveryMethod: source.deliveryMethod || "",
      expectedDate: source.expectedDate || "",
      notes: source.notes || "",
      status: source.status || "Draft"
    });
    setItems((source.items || []).map(i => ({ ...i })));
    setCurrent(editingPurchaseOrder || null);
    setMode("edit");
    setReceiveDraft({});
    setReceiptBase64(editingPurchaseOrder?.receiptBase64);
    setReceiptFilename(editingPurchaseOrder?.receiptFilename);
    setNewItemInventoryId(""); setNewItemDescription(""); setNewItemQty(1); setNewItemCost(0);
  }, [isOpen, editingPurchaseOrder, prefill]);

  if (!isOpen) return null;

  const canSave = form.date.trim() !== "" && form.vendor.trim() !== "" && items.length > 0;
  const poTotal = items.reduce((s, i) => s + lineTotal(i), 0);

  const addInventoryItem = () => {
    const inv = inventoryList.find(i => i.id === newItemInventoryId);
    if (!inv) return;
    setItems(prev => [...prev, { id: uid("poi"), description: inv.name, inventoryId: inv.id, quantity: 1, unitCost: inv.unitCost || 0 }]);
    setNewItemInventoryId("");
  };

  const addCustomItem = () => {
    if (!newItemDescription.trim() || newItemQty <= 0) return;
    setItems(prev => [...prev, { id: uid("poi"), description: newItemDescription.trim(), quantity: newItemQty, unitCost: newItemCost }]);
    setNewItemDescription(""); setNewItemQty(1); setNewItemCost(0);
  };

  const persist = (statusOverride: PurchaseOrderStatus, actionLabel: string, itemsOverride?: PurchaseOrderItem[], extra?: Partial<PurchaseOrder>): PurchaseOrder => {
    const now = new Date().toISOString();
    const id = current?.id || uid("po");
    const po: PurchaseOrder = {
      id,
      poNumber: current?.poNumber || `PO-${new Date().getFullYear()}-${String(purchaseOrders.length + 1).padStart(4, "0")}`,
      vendor: form.vendor.trim(),
      vendorEmail: form.vendorEmail.trim() || undefined,
      vendorPhone: form.vendorPhone.trim() || undefined,
      date: form.date,
      sourceJobId: form.sourceJobId || undefined,
      sourceWorkOrderId: form.sourceWorkOrderId || undefined,
      requestedBy: form.requestedBy.trim() || undefined,
      assignedEmployee: form.assignedEmployee || undefined,
      items: itemsOverride || items,
      deliveryMethod: form.deliveryMethod || undefined,
      expectedDate: form.expectedDate || undefined,
      notes: form.notes.trim() || undefined,
      status: statusOverride,
      receiptBase64,
      receiptFilename,
      linkedBillId: current?.linkedBillId,
      linkedTransactionId: current?.linkedTransactionId,
      createdAt: current?.createdAt || now,
      updatedAt: now,
      createdBy: current?.createdBy || loggedInUser?.email,
      activity: [...(current?.activity || []), { id: uid("act"), timestamp: now, action: actionLabel, by: actor }],
      ...extra
    };
    setPurchaseOrders(prev => prev.some(p => p.id === id) ? prev.map(p => p.id === id ? po : p) : [po, ...prev]);
    setCurrent(po);
    setForm(prev => ({ ...prev, status: statusOverride }));
    return po;
  };

  const handleSave = () => {
    if (!canSave) {
      triggerNotification("Date, Vendor, and at least one item are required to save a Purchase Order.");
      return;
    }
    const po = persist(form.status, current ? "Purchase order updated" : "Purchase order created");
    triggerNotification(current ? "Purchase order updated." : "Purchase order created.");
    onSaved?.(po);
    onClose();
  };

  const handleOrder = () => {
    if (!canSave) {
      triggerNotification("Date, Vendor, and at least one item are required to order.");
      return;
    }
    persist("Ordered", "Purchase order sent to vendor");
    triggerNotification("Purchase order marked Ordered.");
  };

  const handleCancelOrder = () => {
    persist("Canceled", "Purchase order canceled");
    triggerNotification("Purchase order canceled.");
  };

  const startReceiving = () => {
    const draft: Record<string, { quantity: string; unitCost: string }> = {};
    items.forEach(it => {
      const remaining = Math.max(0, it.quantity - (it.receivedQuantity || 0));
      if (remaining > 0) draft[it.id] = { quantity: String(remaining), unitCost: String(it.unitCost) };
    });
    setReceiveDraft(draft);
    setMode("receive");
  };

  const handleConfirmReceipt = () => {
    const now = new Date().toISOString();
    const receivedNow: Array<{ description: string; inventoryId?: string; qty: number; unitCost: number }> = [];
    const updatedItems = items.map(it => {
      const draft = receiveDraft[it.id];
      if (!draft) return it;
      const qty = Number(draft.quantity) || 0;
      if (qty <= 0) return it;
      const unitCost = Number(draft.unitCost) || it.unitCost;
      receivedNow.push({ description: it.description, inventoryId: it.inventoryId, qty, unitCost });
      return { ...it, receivedQuantity: (it.receivedQuantity || 0) + qty, receivedUnitCost: unitCost, receivedAt: now };
    });

    if (receivedNow.length === 0) {
      triggerNotification("Enter a received quantity for at least one item.");
      return;
    }

    // Aggregate first -- a PO can have more than one line pointing at the
    // same Inventory item (e.g. picked twice), and applying matches one at
    // a time with .find() would silently drop every line after the first.
    const receivedByInventoryId = new Map<string, { qty: number; unitCost: number }>();
    receivedNow.forEach(r => {
      if (!r.inventoryId) return;
      const existing = receivedByInventoryId.get(r.inventoryId);
      if (existing) {
        existing.qty += r.qty;
        existing.unitCost = r.unitCost; // most recent line's actual cost
      } else {
        receivedByInventoryId.set(r.inventoryId, { qty: r.qty, unitCost: r.unitCost });
      }
    });

    if (receivedByInventoryId.size) {
      setInventoryList(prev => prev.map(inv => {
        const match = receivedByInventoryId.get(inv.id);
        if (!match) return inv;
        const newQty = inv.quantity + match.qty;
        return {
          ...inv,
          quantity: newQty,
          lastUpdated: now,
          quantityHistory: [...inv.quantityHistory, { date: now.slice(0, 10), type: "Received via PO", amount: match.qty, previous: inv.quantity, current: newQty, notes: `${current?.poNumber || "Purchase Order"} — ${form.vendor}` }],
          purchaseHistory: [...inv.purchaseHistory, { date: now.slice(0, 10), vendor: form.vendor.trim(), amount: match.qty, unitCost: match.unitCost, total: match.qty * match.unitCost }]
        };
      }));
    }

    if (form.sourceJobId) {
      setSchedulingEvents(prev => prev.map(job => job.id === form.sourceJobId ? {
        ...job,
        materials: [...(job.materials || []), ...receivedNow.map(r => ({ inventoryId: r.inventoryId, name: r.description, quantity: r.qty, unitCost: r.unitCost }))]
      } : job));
    }
    if (form.sourceWorkOrderId) {
      setWorkOrders(prev => prev.map(wo => wo.id === form.sourceWorkOrderId ? {
        ...wo,
        materials: [...(wo.materials || []), ...receivedNow.map(r => ({ inventoryId: r.inventoryId, name: r.description, quantity: r.qty, unitCost: r.unitCost }))]
      } : wo));
    }

    const allFullyReceived = updatedItems.every(it => (it.receivedQuantity || 0) >= it.quantity);
    const newStatus: PurchaseOrderStatus = allFullyReceived ? "Received" : "Partially Received";

    setItems(updatedItems);
    persist(newStatus, `Received ${receivedNow.length} item(s)`, updatedItems);
    setReceiveDraft({});
    setMode("edit");
    triggerNotification("Items received. Inventory and job costing updated.");
  };

  const handleCreateBill = () => {
    if (!current || current.linkedBillId) return;
    const now = new Date().toISOString();
    const receivedItems = items.filter(i => (i.receivedQuantity || 0) > 0);
    const source = receivedItems.length ? receivedItems : items;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 15);
    const bill: Bill = {
      id: uid("bill"),
      billNumber: `BILL-PO-${current.poNumber.replace(/\W+/g, "")}`,
      vendor: form.vendor.trim(),
      lineItems: source.map(i => ({ id: uid("li"), description: i.description, quantity: i.receivedQuantity || i.quantity, unitPrice: i.receivedUnitCost ?? i.unitCost })),
      category: "Materials",
      issuedDate: todayStr(),
      dueDate: dueDate.toISOString().slice(0, 10),
      status: "unpaid",
      amountPaid: 0,
      purchaseOrderId: current.id,
      createdAt: now,
      createdBy: loggedInUser?.email,
      history: [{ id: uid("hist"), date: now, action: "Bill created from Purchase Order", note: current.poNumber }]
    };
    // Inventory items already raised Inventory's own asset value the moment
    // they were received -- billing them again as an Expense would count
    // that purchase as both stock on hand and money spent. That slice of
    // the bill debits Inventory instead (see postBillCreatedEntry).
    const inventoryPortion = source
      .filter(i => !!i.inventoryId)
      .reduce((s, i) => s + (i.receivedQuantity || i.quantity) * (i.receivedUnitCost ?? i.unitCost), 0);
    setBills(prev => [...prev, bill]);
    setJournalEntries(prev => [...prev, postBillCreatedEntry(bill, loggedInUser?.email, inventoryPortion)]);
    persist(form.status, `Bill ${bill.billNumber} created`, undefined, { linkedBillId: bill.id });
    triggerNotification(`Bill ${bill.billNumber} created.`);
  };

  const handleRecordExpense = async () => {
    if (!current || current.linkedTransactionId) return;
    // Inventory-linked items already raised Inventory's own asset value the
    // moment they were received (Accounting reads that live, no journal
    // entry needed) -- expensing those again here would double-count the
    // cost. Only items that never touched Inventory (custom/typed-in lines)
    // belong in a cash expense.
    const receivedItems = items.filter(i => (i.receivedQuantity || 0) > 0 && !i.inventoryId);
    const source = receivedItems.length ? receivedItems : items.filter(i => !i.inventoryId);
    const amount = source.reduce((s, i) => s + (i.receivedQuantity || i.quantity) * (i.receivedUnitCost ?? i.unitCost), 0);
    if (amount <= 0) {
      triggerNotification("Nothing to record yet -- receive non-inventory items first, or use Create Bill for inventory purchases.");
      return;
    }
    const transactionId = uid("txn_ref");
    await saveTransaction({
      type: "expense",
      source: "manual",
      amount,
      description: `${form.vendor.trim()} — ${current.poNumber}`,
      category: "Materials",
      date: todayStr(),
      createdAt: new Date().toISOString(),
      createdBy: loggedInUser?.email,
      jobId: form.sourceJobId || undefined,
      purchaseOrderId: current.id
    });
    // saveTransaction assigns its own real transaction id internally and
    // doesn't hand it back -- linkedTransactionId only needs to exist as a
    // truthy guard against a second "Record Expense" click, so a locally
    // generated marker id serves that purpose fine.
    persist(form.status, "Expense recorded", undefined, { linkedTransactionId: transactionId });
    triggerNotification("Expense recorded.");
  };

  const handleMarkPaidLater = () => {
    persist(form.status, "Marked to pay later");
    triggerNotification("Marked to pay later.");
  };

  const handleAttachReceipt = async (file: File) => {
    try {
      const { base64, mimeType } = await downscaleImageToBase64(file, 1600, 0.82);
      const dataUri = `data:${mimeType};base64,${base64}`;
      if (dataUri.length > MAX_INLINE_BASE64_LENGTH) {
        triggerNotification("That photo is too large -- try a closer, simpler shot.");
        return;
      }
      setReceiptBase64(dataUri);
      setReceiptFilename(file.name);
      triggerNotification("Receipt attached. Save to keep it.");
    } catch {
      triggerNotification("Couldn't read that photo. Try again.");
    }
  };

  const generatePdf = () => {
    if (!canSave) {
      triggerNotification("Save the Purchase Order first (Date, Vendor, and at least one item are required).");
      return;
    }
    const po = persist(form.status, "PDF generated");
    setGeneratedPdfDraft({
      filename: `${po.poNumber}.pdf`,
      title: `Purchase Order ${po.poNumber}`,
      sourceType: "Purchase Order",
      sourceId: po.id,
      customerName: form.vendor,
      customerPhone: form.vendorPhone,
      customerEmail: form.vendorEmail,
      representativeName: actor,
      lines: [
        `Vendor: ${form.vendor}`,
        `PO Number: ${po.poNumber}`,
        `Date: ${form.date}`,
        `Requested By: ${form.requestedBy || "—"}`,
        `Assigned Employee: ${form.assignedEmployee || "—"}`,
        `Delivery/Pickup: ${form.deliveryMethod || "—"}${form.expectedDate ? ` — Expected ${form.expectedDate}` : ""}`,
        "",
        "Items:",
        ...items.map(i => `  ${i.quantity} x ${i.description} @ $${i.unitCost.toFixed(2)} — $${lineTotal(i).toFixed(2)}`),
        "",
        `Total: $${poTotal.toFixed(2)}`,
        ...(form.notes ? ["", `Notes: ${form.notes}`] : [])
      ]
    });
    navigateToScreen("documents");
  };

  const canReceive = (form.status === "Ordered" || form.status === "Partially Received") && items.some(i => (i.receivedQuantity || 0) < i.quantity);
  const canOrder = form.status === "Draft";
  const canCancel = form.status !== "Received" && form.status !== "Canceled";
  const canPostReceiving = form.status === "Received" || form.status === "Partially Received";

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#9EC8EF] bg-[#F5FAFF] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#9EC8EF] bg-[#C7E3FA] px-4 py-3">
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-[#315C9F]">{current?.poNumber || "New Purchase Order"}</p>
            <h3 className="text-base font-black text-[#1F3557]">{mode === "receive" ? "Receive Items" : "Purchase Order"}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-white" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        {mode === "receive" ? (
          <div className="space-y-4 p-4">
            <p className="text-xs text-[#5E7393]">Confirm what actually showed up before it posts to Inventory and Job Costing.</p>
            {items.filter(it => (it.receivedQuantity || 0) < it.quantity).map(it => (
              <div key={it.id} className="rounded-2xl border border-[#9EC8EF] bg-white p-3">
                <p className="text-xs font-black text-[#1F3557]">{it.description}</p>
                <p className="text-[10px] text-[#5E7393]">Ordered {it.quantity} @ ${it.unitCost.toFixed(2)}{it.receivedQuantity ? ` · Already received ${it.receivedQuantity}` : ""}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field label="Actual quantity received">
                    <input type="number" min="0" value={receiveDraft[it.id]?.quantity ?? ""} onChange={e => setReceiveDraft(prev => ({ ...prev, [it.id]: { quantity: e.target.value, unitCost: prev[it.id]?.unitCost ?? String(it.unitCost) } }))} className="input" />
                  </Field>
                  <Field label="Actual unit cost">
                    <input type="number" min="0" step="0.01" value={receiveDraft[it.id]?.unitCost ?? ""} onChange={e => setReceiveDraft(prev => ({ ...prev, [it.id]: { quantity: prev[it.id]?.quantity ?? String(Math.max(0, it.quantity - (it.receivedQuantity || 0))), unitCost: e.target.value } }))} className="input" />
                  </Field>
                </div>
              </div>
            ))}
            {items.every(it => (it.receivedQuantity || 0) >= it.quantity) && <p className="text-xs text-slate-400">Everything on this PO has already been received.</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMode("edit")} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
              <button type="button" onClick={handleConfirmReceipt} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white">Confirm Receipt</button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Vendor *">
                  <input list="po-vendor-options" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} className="input" placeholder="Who are you buying from" />
                  <datalist id="po-vendor-options">{vendors.map(v => <option key={v.id} value={v.name} />)}</datalist>
                </Field>
                <Field label="Date *">
                  <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input" />
                </Field>
                <Field label="Vendor email">
                  <input value={form.vendorEmail} onChange={e => setForm({ ...form, vendorEmail: e.target.value })} className="input" placeholder="For sending the PO" />
                </Field>
                <Field label="Vendor phone">
                  <input value={form.vendorPhone} onChange={e => setForm({ ...form, vendorPhone: e.target.value })} className="input" />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Linked job (optional)">
                  <select value={form.sourceJobId} onChange={e => setForm({ ...form, sourceJobId: e.target.value })} className="input">
                    <option value="">Not linked</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.jobNumber || j.title || "Job"} — {j.customer}</option>)}
                  </select>
                </Field>
                <Field label="Linked work order (optional)">
                  <select value={form.sourceWorkOrderId} onChange={e => setForm({ ...form, sourceWorkOrderId: e.target.value })} className="input">
                    <option value="">Not linked</option>
                    {workOrders.map(w => <option key={w.id} value={w.id}>{w.workOrderNumber} — {w.customerName || "—"}</option>)}
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Requested by">
                  <input value={form.requestedBy} onChange={e => setForm({ ...form, requestedBy: e.target.value })} className="input" />
                </Field>
                <Field label="Assigned employee">
                  <select value={form.assignedEmployee} onChange={e => setForm({ ...form, assignedEmployee: e.target.value })} className="input">
                    <option value="">Not assigned</option>
                    {recentRoster.map(r => <option key={r.id || r.name} value={r.name}>{r.name}</option>)}
                  </select>
                </Field>
              </div>

              <div className="rounded-2xl border border-[#9EC8EF] bg-white p-3">
                <p className="text-xs font-black uppercase text-[#1F3557]">Items</p>
                <div className="mt-2 space-y-1.5">
                  {items.map((it, i) => (
                    <div key={it.id} className="flex items-center justify-between rounded-lg bg-blue-50 p-2 text-xs">
                      <span>{it.quantity} × {it.description}{it.receivedQuantity ? ` (received ${it.receivedQuantity})` : ""}</span>
                      <div className="flex items-center gap-2">
                        <b>${lineTotal(it).toFixed(2)}</b>
                        <button type="button" onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <p className="text-xs text-slate-400">No items yet.</p>}
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <select value={newItemInventoryId} onChange={e => setNewItemInventoryId(e.target.value)} className="input">
                    <option value="">Pick from Inventory…</option>
                    {inventoryList.map(inv => <option key={inv.id} value={inv.id}>{inv.name} ({inv.quantity} {inv.unit} on hand)</option>)}
                  </select>
                  <button type="button" onClick={addInventoryItem} className="rounded-lg bg-[#315C9F] px-3 text-white"><Plus className="h-4 w-4" /></button>
                </div>
                <div className="mt-2 grid grid-cols-[1fr_60px_80px_auto] gap-2">
                  <input value={newItemDescription} onChange={e => setNewItemDescription(e.target.value)} placeholder="Or type a custom item" className="input" />
                  <input type="number" min="1" value={newItemQty} onChange={e => setNewItemQty(Number(e.target.value))} className="input" />
                  <input type="number" min="0" step="0.01" value={newItemCost} onChange={e => setNewItemCost(Number(e.target.value))} placeholder="Unit $" className="input" />
                  <button type="button" onClick={addCustomItem} className="rounded-lg bg-[#315C9F] px-3 text-white"><Plus className="h-4 w-4" /></button>
                </div>
                <p className="mt-2 text-right text-xs font-black text-[#1F3557]">Total: ${poTotal.toFixed(2)}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Delivery or pickup">
                  <select value={form.deliveryMethod} onChange={e => setForm({ ...form, deliveryMethod: e.target.value as any })} className="input">
                    <option value="">Not set</option>
                    <option value="Delivery">Delivery</option>
                    <option value="Pickup">Pickup</option>
                  </select>
                </Field>
                <Field label="Expected date">
                  <input type="date" value={form.expectedDate} onChange={e => setForm({ ...form, expectedDate: e.target.value })} className="input" />
                </Field>
                <Field label="Status">
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as PurchaseOrderStatus })} className="input">
                    {["Draft", "Ordered", "Partially Received", "Received", "Canceled"].map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Notes">
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="input" />
              </Field>

              {canPostReceiving && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                  <p className="text-xs font-black uppercase text-emerald-800">Received — Handle Payment</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!!current?.linkedBillId} onClick={handleCreateBill} className="rounded-lg bg-white border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-800 disabled:opacity-40">{current?.linkedBillId ? "Bill Created" : "Create Bill"}</button>
                    <button type="button" disabled={!!current?.linkedTransactionId} onClick={() => void handleRecordExpense()} className="rounded-lg bg-white border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-800 disabled:opacity-40">{current?.linkedTransactionId ? "Expense Recorded" : "Record Expense"}</button>
                    <button type="button" onClick={() => receiptInputRef.current?.click()} className="rounded-lg bg-white border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-800"><Camera className="mr-1 inline h-3.5 w-3.5" />Attach Receipt/Invoice</button>
                    <button type="button" onClick={handleMarkPaidLater} className="rounded-lg bg-white border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-800">Mark Paid Later</button>
                  </div>
                  {receiptFilename && <p className="text-[10px] text-emerald-700">Attached: {receiptFilename}</p>}
                  <input ref={receiptInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleAttachReceipt(f); e.target.value = ""; }} />
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[#9EC8EF] bg-[#F5FAFF] px-4 py-3">
              {canCancel && <button type="button" onClick={handleCancelOrder} className="rounded-xl bg-rose-50 px-4 py-2 text-xs font-black text-rose-600 border border-rose-200">Cancel PO</button>}
              {canOrder && <button type="button" onClick={handleOrder} className="rounded-xl bg-[#BDDDF8] px-4 py-2 text-xs font-black text-[#1F3557]">Order</button>}
              {canReceive && <button type="button" onClick={startReceiving} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-white">Receive</button>}
              <button type="button" onClick={generatePdf} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white"><FileText className="mr-1 inline h-3.5 w-3.5" />Generate PDF</button>
              <button type="button" disabled={!canSave} onClick={handleSave} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white disabled:opacity-40">Save Purchase Order</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1">
    <span className="text-[9px] font-bold uppercase tracking-wider text-[#5E7393]">{label}</span>
    {children}
  </label>
);
