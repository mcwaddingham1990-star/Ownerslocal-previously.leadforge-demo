import React, { useMemo, useState } from "react";
import { X, Plus, Trash2, Pencil, FileText, FolderPlus, Folder } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import type { PriceBookModel, PriceBookLineItem, PriceBookCustomField } from "../types/priceBook";
import type { Invoice, InvoiceLineItem } from "../types/accounting";
import type { WorkOrder, Estimate } from "../types/domain";
import { buildTextDocumentPdf } from "../lib/pdfExport";
import { generateEstimateNumber, formatEstimateDate, estimateExpirationDate } from "../lib/estimateDefaults";

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

type DocType = "invoice" | "work_order" | "estimate" | "job_costing" | "job_tracking";
const DOC_TYPE_LABELS: Record<DocType, string> = {
  invoice: "Invoice",
  work_order: "Work Order",
  estimate: "Estimate",
  job_costing: "Job Costing",
  job_tracking: "Job Tracking"
};

export interface PriceBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When set, the Price Book opens in picker mode for a document that's
   * already open on screen (e.g. WorkOrderBuilder's own "Add Flat Rate
   * Pricing Model" button) -- picking/reviewing a model calls onPick
   * instead of showing the separate "Add To" (pick an existing record)
   * flow, since there's nothing to navigate to. */
  pickerMode?: { onPick: (item: { priceBookModelId: string; description: string; quantity: number; unitPrice: number }) => void };
}

const EMPTY_MODEL_FORM = { name: "", description: "", sellingPrice: "", notes: "" };
const EMPTY_LINE = { kind: "labor" as PriceBookLineItem["kind"], description: "", quantity: 1, unitCost: 0 };

export const PriceBookModal: React.FC<PriceBookModalProps> = ({ isOpen, onClose, pickerMode }) => {
  const { loggedInUser } = useAuth();
  const { priceBookFolders, setPriceBookFolders, priceBookModels, setPriceBookModels, invoices, setInvoices, workOrders, setWorkOrders, estimates, setEstimates, schedulingEvents, setSchedulingEvents, setTransactions, businessProfile } = useDomainData();
  const { triggerNotification, logOperationalEvent } = useNavTelemetry();
  const actor = loggedInUser?.name || loggedInUser?.email || "Staff";

  const [activeFolder, setActiveFolder] = useState<string | "unfiled" | "all">("all");
  const [editingModel, setEditingModel] = useState<PriceBookModel | null>(null);
  const [showModelForm, setShowModelForm] = useState(false);
  const [modelForm, setModelForm] = useState(EMPTY_MODEL_FORM);
  const [modelFolderId, setModelFolderId] = useState<string>("");
  const [lineItems, setLineItems] = useState<PriceBookLineItem[]>([]);
  const [newLine, setNewLine] = useState(EMPTY_LINE);
  const [customFields, setCustomFields] = useState<PriceBookCustomField[]>([]);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");

  // Add To flow (picking an existing real record to insert a model into)
  const [addToModel, setAddToModel] = useState<PriceBookModel | null>(null);
  const [addToDocType, setAddToDocType] = useState<DocType | null>(null);
  const [addToTargetId, setAddToTargetId] = useState<string | "blank" | null>(null);
  const [reviewItem, setReviewItem] = useState({ description: "", quantity: 1, unitPrice: 0 });

  // Create PDF
  const [showPdfPicker, setShowPdfPicker] = useState(false);
  const [selectedForPdf, setSelectedForPdf] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const visibleModels = priceBookModels.filter(m =>
    activeFolder === "all" ? true : activeFolder === "unfiled" ? !m.folderId : m.folderId === activeFolder
  );

  const resetModelForm = () => {
    setModelForm(EMPTY_MODEL_FORM);
    setLineItems([]);
    setCustomFields([]);
    setNewLine(EMPTY_LINE);
    setModelFolderId(activeFolder !== "all" && activeFolder !== "unfiled" ? activeFolder : "");
  };

  const openAddPrice = () => {
    setEditingModel(null);
    resetModelForm();
    setShowModelForm(true);
  };

  const openEditModel = (model: PriceBookModel) => {
    setEditingModel(model);
    setModelForm({ name: model.name, description: model.description || "", sellingPrice: String(model.sellingPrice), notes: model.notes || "" });
    setLineItems(model.lineItems);
    setCustomFields(model.customFields || []);
    setModelFolderId(model.folderId || "");
    setShowModelForm(true);
  };

  const addLine = () => {
    if (!newLine.description.trim()) return;
    setLineItems(prev => [...prev, { id: uid("pbli"), ...newLine, description: newLine.description.trim() }]);
    setNewLine(EMPTY_LINE);
  };

  const addCustomField = () => {
    if (!newFieldKey.trim()) return;
    setCustomFields(prev => [...prev, { key: newFieldKey.trim(), value: newFieldValue.trim() }]);
    setNewFieldKey(""); setNewFieldValue("");
  };

  const saveModel = () => {
    if (!modelForm.name.trim() || !modelForm.sellingPrice.trim()) {
      triggerNotification("Name and selling price are required to save a pricing model.");
      return;
    }
    const now = new Date().toISOString();
    const model: PriceBookModel = {
      id: editingModel?.id || uid("pbm"),
      folderId: modelFolderId || undefined,
      name: modelForm.name.trim(),
      description: modelForm.description.trim() || undefined,
      lineItems,
      sellingPrice: Number(modelForm.sellingPrice) || 0,
      notes: modelForm.notes.trim() || undefined,
      customFields: customFields.length ? customFields : undefined,
      createdAt: editingModel?.createdAt || now,
      updatedAt: now,
      createdBy: editingModel?.createdBy || loggedInUser?.email
    };
    setPriceBookModels(prev => editingModel ? prev.map(m => m.id === model.id ? model : m) : [model, ...prev]);
    logOperationalEvent(editingModel ? "Price Updated" : "Price Added", `${model.name} — $${model.sellingPrice.toLocaleString()}`, "💲");
    triggerNotification(editingModel ? "Pricing model updated." : "Pricing model saved.");
    setShowModelForm(false);
  };

  const deleteModel = (model: PriceBookModel) => {
    if (!confirm(`Delete "${model.name}" from the Price Book? This never affects copies already added to documents.`)) return;
    setPriceBookModels(prev => prev.filter(m => m.id !== model.id));
    triggerNotification(`"${model.name}" deleted.`);
  };

  const handleCreateFolder = () => {
    const name = prompt("New folder name")?.trim();
    if (!name) return;
    if (priceBookFolders.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      triggerNotification("A folder with that name already exists.");
      return;
    }
    const folder = { id: uid("pbf"), name, createdAt: new Date().toISOString() };
    setPriceBookFolders(prev => [...prev, folder]);
    setActiveFolder(folder.id);
  };

  const deleteFolder = (folderId: string) => {
    const folder = priceBookFolders.find(f => f.id === folderId);
    if (!folder) return;
    if (!confirm(`Delete folder "${folder.name}"? Models inside move to Unfiled.`)) return;
    setPriceBookFolders(prev => prev.filter(f => f.id !== folderId));
    setPriceBookModels(prev => prev.map(m => m.folderId === folderId ? { ...m, folderId: undefined } : m));
    if (activeFolder === folderId) setActiveFolder("all");
  };

  // ---- Picker mode (model already-open document just wants one line item back) ----
  const startPick = (model: PriceBookModel) => {
    if (pickerMode) {
      setAddToModel(model);
      setReviewItem({ description: model.name, quantity: 1, unitPrice: model.sellingPrice });
      return;
    }
    setAddToModel(model);
    setAddToDocType(null);
    setAddToTargetId(null);
  };

  const confirmPick = () => {
    if (!addToModel || !pickerMode) return;
    pickerMode.onPick({ priceBookModelId: addToModel.id, description: reviewItem.description.trim() || addToModel.name, quantity: reviewItem.quantity, unitPrice: reviewItem.unitPrice });
    triggerNotification(`${addToModel.name} added.`);
    setAddToModel(null);
    onClose();
  };

  // ---- Add To flow (standalone Price Book -> an existing real record) ----
  const invoiceOptions = invoices.filter(i => i.status !== "paid" && i.status !== "void");
  const workOrderOptions = workOrders;
  const estimateOptions = estimates;
  const jobOptions = schedulingEvents.filter(e => e.eventType === "Job");
  // Job Costing/Job Tracking always target a real, already-existing Job --
  // unlike the others there's no sensible "blank" job to create from here.
  const targetOptionsFor = (type: DocType) =>
    type === "invoice" ? invoiceOptions
    : type === "work_order" ? workOrderOptions
    : type === "estimate" ? estimateOptions
    : jobOptions;
  const targetLabel = (type: DocType, record: any) =>
    type === "invoice" ? `${record.invoiceNumber} — ${record.customer || "No customer"}`
    : type === "work_order" ? `${record.workOrderNumber} — ${record.jobDescription}`
    : type === "estimate" ? `${record.number} — ${record.customerName || "No customer"}`
    : `${record.jobNumber || record.title || record.customer || "Job"}`;

  const chooseAddToTarget = (targetId: string | "blank") => {
    setAddToTargetId(targetId);
    setReviewItem({ description: addToModel?.name || "", quantity: 1, unitPrice: addToModel?.sellingPrice || 0 });
  };

  const confirmAddTo = () => {
    if (!addToModel || !addToDocType || !addToTargetId) return;
    const item = { id: uid("li"), description: reviewItem.description.trim() || addToModel.name, quantity: reviewItem.quantity, unitPrice: reviewItem.unitPrice, priceBookModelId: addToModel.id };
    const now = new Date().toISOString();

    if (addToDocType === "invoice") {
      const invoiceItem: InvoiceLineItem = { id: item.id, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice };
      if (addToTargetId === "blank") {
        const newInvoice: Invoice = {
          id: uid("inv"), invoiceNumber: `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(4, "0")}`,
          customer: "", lineItems: [invoiceItem], taxRate: 0, issuedDate: now.slice(0, 10), dueDate: now.slice(0, 10),
          status: "draft", amountPaid: 0, createdAt: now, createdBy: loggedInUser?.email
        };
        setInvoices(prev => [newInvoice, ...prev]);
        triggerNotification(`New draft invoice created with ${addToModel.name}. Finish it in Accounting.`);
      } else {
        setInvoices(prev => prev.map(inv => inv.id === addToTargetId ? { ...inv, lineItems: [...inv.lineItems, invoiceItem] } : inv));
        triggerNotification(`${addToModel.name} added to invoice.`);
      }
    } else if (addToDocType === "work_order") {
      if (addToTargetId === "blank") {
        const newWorkOrder: WorkOrder = {
          id: uid("wo"), workOrderNumber: `WO-${new Date().getFullYear()}-${String(workOrders.length + 1).padStart(4, "0")}`,
          date: now.slice(0, 10), jobDescription: addToModel.name, lineItems: [item], status: "Draft", createdAt: now, createdBy: loggedInUser?.email
        };
        setWorkOrders(prev => [newWorkOrder, ...prev]);
        triggerNotification(`New Work Order created with ${addToModel.name}. Finish it in Documents > Work Orders.`);
      } else {
        setWorkOrders(prev => prev.map(wo => wo.id === addToTargetId ? { ...wo, lineItems: [...(wo.lineItems || []), item], updatedAt: now } : wo));
        triggerNotification(`${addToModel.name} added to work order.`);
      }
    } else if (addToDocType === "estimate") {
      const estimateLine = { id: item.id, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, priceBookModelId: addToModel.id };
      const lineTotal = item.quantity * item.unitPrice;
      if (addToTargetId === "blank") {
        const newEstimate: Estimate = {
          id: uid("est"), number: generateEstimateNumber(), customerName: "", company: "",
          status: "Draft", salesRep: actor, amount: lineTotal,
          createdDate: formatEstimateDate(new Date()), expirationDate: estimateExpirationDate(),
          lineItems: [estimateLine]
        };
        setEstimates(prev => [newEstimate, ...prev]);
        triggerNotification(`New draft estimate created with ${addToModel.name}. Finish it in Estimates.`);
      } else {
        setEstimates(prev => prev.map(est => est.id === addToTargetId ? { ...est, lineItems: [...(est.lineItems || []), estimateLine], amount: est.amount + lineTotal } : est));
        triggerNotification(`${addToModel.name} added to estimate.`);
      }
    } else if (addToDocType === "job_tracking") {
      setSchedulingEvents(prev => prev.map(e => e.id === addToTargetId ? { ...e, checklist: [...(e.checklist || []), { id: uid("chk"), label: item.description, completed: false }] } : e));
      triggerNotification(`${addToModel.name} added to job checklist.`);
    } else if (addToDocType === "job_costing") {
      const materialLines = addToModel.lineItems.filter(li => li.kind === "material");
      const otherLines = addToModel.lineItems.filter(li => li.kind !== "material");
      if (materialLines.length) {
        setSchedulingEvents(prev => prev.map(e => e.id === addToTargetId ? {
          ...e, materials: [...(e.materials || []), ...materialLines.map(li => ({ inventoryId: uid("pbmat"), name: li.description, quantity: li.quantity, unitCost: li.unitCost }))]
        } : e));
      }
      const otherTotal = otherLines.reduce((s, li) => s + li.quantity * li.unitCost, 0);
      if (otherTotal > 0) {
        setTransactions(prev => [...prev, {
          id: uid("txn"), type: "expense", source: "manual", amount: otherTotal,
          description: `${addToModel.name} (Price Book)`, category: "Labor", date: now.slice(0, 10),
          createdAt: now, createdBy: loggedInUser?.email, jobId: addToTargetId
        }]);
      }
      triggerNotification(`${addToModel.name} costs added to job.`);
    }
    logOperationalEvent("Price Book: Added To", `${addToModel.name} → ${DOC_TYPE_LABELS[addToDocType]}`, "💲");
    setAddToModel(null); setAddToDocType(null); setAddToTargetId(null);
  };

  // ---- Create PDF ----
  const toggleForPdf = (id: string) => setSelectedForPdf(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const generatePdf = async () => {
    const chosen = priceBookModels.filter(m => selectedForPdf.has(m.id));
    if (!chosen.length) { triggerNotification("Select at least one pricing model."); return; }
    const sections = chosen.map(m => ({
      heading: `${m.name} — $${m.sellingPrice.toLocaleString()}`,
      body: m.description || ""
    }));
    const bytes = await buildTextDocumentPdf("Flat Rate Price Book", sections, businessProfile);
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "Price-Book.pdf"; a.click();
    URL.revokeObjectURL(url);
    triggerNotification(`PDF created with ${chosen.length} pricing model${chosen.length === 1 ? "" : "s"}.`);
    setShowPdfPicker(false);
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#9EC8EF] bg-[#F5FAFF] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#9EC8EF] bg-[#C7E3FA] px-4 py-3">
          <h3 className="text-base font-black text-[#1F3557]">💲 Price Book</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-white"><X className="h-4 w-4" /></button>
        </div>

        {!showModelForm && !addToModel && !showPdfPicker && (
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setActiveFolder("all")} className={`rounded-xl px-3 py-2 text-xs font-black ${activeFolder === "all" ? "bg-[#315C9F] text-white" : "bg-white text-[#1F3557] border border-[#9EC8EF]"}`}>All</button>
              <button onClick={() => setActiveFolder("unfiled")} className={`rounded-xl px-3 py-2 text-xs font-black ${activeFolder === "unfiled" ? "bg-[#315C9F] text-white" : "bg-white text-[#1F3557] border border-[#9EC8EF]"}`}>Unfiled</button>
              {priceBookFolders.map(f => (
                <div key={f.id} className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-black ${activeFolder === f.id ? "bg-[#315C9F] text-white" : "bg-white text-[#1F3557] border border-[#9EC8EF]"}`}>
                  <button onClick={() => setActiveFolder(f.id)} className="flex items-center gap-1"><Folder className="h-3.5 w-3.5" />{f.name}</button>
                  <button onClick={() => deleteFolder(f.id)} aria-label={`Delete folder ${f.name}`}><Trash2 className="h-3 w-3 opacity-60" /></button>
                </div>
              ))}
              <button onClick={handleCreateFolder} className="rounded-xl border border-dashed border-[#315C9F] px-3 py-2 text-xs font-black text-[#315C9F]"><FolderPlus className="mr-1 inline h-3.5 w-3.5" />New Folder</button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={openAddPrice} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white"><Plus className="mr-1 inline h-4 w-4" />Add Price</button>
              <button onClick={() => { setSelectedForPdf(new Set()); setShowPdfPicker(true); }} className="rounded-xl border border-[#9EC8EF] bg-white px-4 py-2 text-xs font-black text-[#315C9F]"><FileText className="mr-1 inline h-4 w-4" />Create PDF</button>
            </div>

            <div className="space-y-2">
              {visibleModels.length === 0 && <p className="py-8 text-center text-xs text-slate-400">No pricing models yet. Add Price to create one.</p>}
              {visibleModels.map(m => (
                <div key={m.id} className="rounded-xl border border-[#9EC8EF] bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-black text-[#1F3557]">{m.name}</p>
                      {m.description && <p className="text-xs text-[#5E7393]">{m.description}</p>}
                    </div>
                    <p className="shrink-0 text-sm font-black text-emerald-700">${m.sellingPrice.toLocaleString()}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button onClick={() => startPick(m)} className="rounded-lg bg-[#315C9F] px-2.5 py-1.5 text-[10px] font-black text-white">Add To</button>
                    <button onClick={() => openEditModel(m)} className="rounded-lg bg-[#EAF5FF] px-2.5 py-1.5 text-[10px] font-black text-[#315C9F]"><Pencil className="mr-1 inline h-3 w-3" />Edit</button>
                    <button onClick={() => deleteModel(m)} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[10px] font-black text-rose-600"><Trash2 className="mr-1 inline h-3 w-3" />Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showModelForm && (
          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Service name *"><input value={modelForm.name} onChange={e => setModelForm({ ...modelForm, name: e.target.value })} className="input" /></Field>
              <Field label="Selling price *"><input type="number" min="0" step="0.01" value={modelForm.sellingPrice} onChange={e => setModelForm({ ...modelForm, sellingPrice: e.target.value })} className="input" /></Field>
            </div>
            <Field label="Description"><textarea value={modelForm.description} onChange={e => setModelForm({ ...modelForm, description: e.target.value })} rows={2} className="input" /></Field>
            <Field label="Folder">
              <select value={modelFolderId} onChange={e => setModelFolderId(e.target.value)} className="input">
                <option value="">Unfiled</option>
                {priceBookFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>

            <div className="rounded-2xl border border-[#9EC8EF] bg-white p-3">
              <p className="text-xs font-black uppercase text-[#1F3557]">Labor & Materials (cost breakdown)</p>
              <div className="mt-2 space-y-1.5">
                {lineItems.map((li, i) => (
                  <div key={li.id} className="flex items-center justify-between rounded-lg bg-blue-50 p-2 text-xs">
                    <span className="capitalize">{li.kind}: {li.quantity} × {li.description}</span>
                    <div className="flex items-center gap-2">
                      <b>${(li.quantity * li.unitCost).toFixed(2)}</b>
                      <button onClick={() => setLineItems(prev => prev.filter((_, idx) => idx !== i))} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-[80px_1fr_50px_70px_auto] gap-2">
                <select value={newLine.kind} onChange={e => setNewLine({ ...newLine, kind: e.target.value as PriceBookLineItem["kind"] })} className="input">
                  <option value="labor">Labor</option>
                  <option value="material">Material</option>
                  <option value="other">Other</option>
                </select>
                <input value={newLine.description} onChange={e => setNewLine({ ...newLine, description: e.target.value })} placeholder="Description" className="input" />
                <input type="number" min="1" value={newLine.quantity} onChange={e => setNewLine({ ...newLine, quantity: Number(e.target.value) })} className="input" />
                <input type="number" min="0" step="0.01" value={newLine.unitCost} onChange={e => setNewLine({ ...newLine, unitCost: Number(e.target.value) })} placeholder="Cost" className="input" />
                <button onClick={addLine} className="rounded-lg bg-[#315C9F] px-3 text-white"><Plus className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="rounded-2xl border border-[#9EC8EF] bg-white p-3">
              <p className="text-xs font-black uppercase text-[#1F3557]">Custom Fields</p>
              <div className="mt-2 space-y-1.5">
                {customFields.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-blue-50 p-2 text-xs">
                    <span><b>{f.key}:</b> {f.value}</span>
                    <button onClick={() => setCustomFields(prev => prev.filter((_, idx) => idx !== i))} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
                <input value={newFieldKey} onChange={e => setNewFieldKey(e.target.value)} placeholder="Field name" className="input" />
                <input value={newFieldValue} onChange={e => setNewFieldValue(e.target.value)} placeholder="Value" className="input" />
                <button onClick={addCustomField} className="rounded-lg bg-[#315C9F] px-3 text-white"><Plus className="h-4 w-4" /></button>
              </div>
            </div>

            <Field label="Notes"><textarea value={modelForm.notes} onChange={e => setModelForm({ ...modelForm, notes: e.target.value })} rows={2} className="input" /></Field>

            <div className="flex justify-end gap-2 border-t border-[#9EC8EF] pt-3">
              <button onClick={() => setShowModelForm(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
              <button onClick={saveModel} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white">Save Price</button>
            </div>
          </div>
        )}

        {addToModel && pickerMode && (
          <div className="space-y-4 p-4">
            <p className="text-xs font-black uppercase text-[#1F3557]">Review before adding: {addToModel.name}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Description"><input value={reviewItem.description} onChange={e => setReviewItem({ ...reviewItem, description: e.target.value })} className="input" /></Field>
              <Field label="Quantity"><input type="number" min="1" value={reviewItem.quantity} onChange={e => setReviewItem({ ...reviewItem, quantity: Number(e.target.value) })} className="input" /></Field>
              <Field label="Price"><input type="number" min="0" step="0.01" value={reviewItem.unitPrice} onChange={e => setReviewItem({ ...reviewItem, unitPrice: Number(e.target.value) })} className="input" /></Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#9EC8EF] pt-3">
              <button onClick={() => setAddToModel(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
              <button onClick={confirmPick} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white">Add</button>
            </div>
          </div>
        )}

        {addToModel && !pickerMode && (
          <div className="space-y-4 p-4">
            <p className="text-xs font-black uppercase text-[#1F3557]">Add To: {addToModel.name}</p>

            {!addToDocType && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map(type => (
                  <button key={type} onClick={() => setAddToDocType(type)} className="rounded-xl border border-[#9EC8EF] bg-white p-4 text-sm font-black text-[#1F3557]">{DOC_TYPE_LABELS[type]}</button>
                ))}
              </div>
            )}

            {addToDocType && !addToTargetId && (
              <div className="space-y-2">
                {addToDocType !== "job_costing" && addToDocType !== "job_tracking" && (
                  <button onClick={() => chooseAddToTarget("blank")} className="w-full rounded-xl border border-dashed border-[#315C9F] p-3 text-left text-xs font-black text-[#315C9F]">
                    + Add to Blank {DOC_TYPE_LABELS[addToDocType]}
                  </button>
                )}
                {targetOptionsFor(addToDocType).map((record: any) => (
                  <button key={record.id} onClick={() => chooseAddToTarget(record.id)} className="w-full rounded-xl border border-[#9EC8EF] bg-white p-3 text-left text-xs">
                    {targetLabel(addToDocType, record)}
                  </button>
                ))}
                {targetOptionsFor(addToDocType).length === 0 && (
                  <p className="text-xs text-slate-400">
                    {addToDocType === "job_costing" || addToDocType === "job_tracking" ? "No jobs yet." : "Nothing existing yet — use Add to Blank above."}
                  </p>
                )}
                <button onClick={() => setAddToDocType(null)} className="text-xs font-bold text-[#315C9F]">← Back</button>
              </div>
            )}

            {addToDocType && addToTargetId && (addToDocType === "invoice" || addToDocType === "work_order" || addToDocType === "estimate") && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Description"><input value={reviewItem.description} onChange={e => setReviewItem({ ...reviewItem, description: e.target.value })} className="input" /></Field>
                  <Field label="Quantity"><input type="number" min="1" value={reviewItem.quantity} onChange={e => setReviewItem({ ...reviewItem, quantity: Number(e.target.value) })} className="input" /></Field>
                  <Field label="Price"><input type="number" min="0" step="0.01" value={reviewItem.unitPrice} onChange={e => setReviewItem({ ...reviewItem, unitPrice: Number(e.target.value) })} className="input" /></Field>
                </div>
                <div className="flex justify-end gap-2 border-t border-[#9EC8EF] pt-3">
                  <button onClick={() => setAddToTargetId(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Back</button>
                  <button onClick={confirmAddTo} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white">Add</button>
                </div>
              </div>
            )}

            {addToDocType === "job_tracking" && addToTargetId && (
              <div className="space-y-3">
                <Field label="Checklist item"><input value={reviewItem.description} onChange={e => setReviewItem({ ...reviewItem, description: e.target.value })} className="input" /></Field>
                <div className="flex justify-end gap-2 border-t border-[#9EC8EF] pt-3">
                  <button onClick={() => setAddToTargetId(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Back</button>
                  <button onClick={confirmAddTo} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white">Add</button>
                </div>
              </div>
            )}

            {addToDocType === "job_costing" && addToTargetId && addToModel && (
              <div className="space-y-3">
                <p className="text-xs font-bold text-[#5E7393]">This adds {addToModel.name}'s cost breakdown to the job's Job Costing:</p>
                <div className="space-y-1.5">
                  {addToModel.lineItems.filter(li => li.kind === "material").map(li => (
                    <div key={li.id} className="flex justify-between rounded-lg bg-blue-50 p-2 text-xs"><span>Material: {li.quantity} × {li.description}</span><b>${(li.quantity * li.unitCost).toFixed(2)}</b></div>
                  ))}
                  {addToModel.lineItems.filter(li => li.kind !== "material").length > 0 && (
                    <div className="flex justify-between rounded-lg bg-blue-50 p-2 text-xs"><span>Labor/Other expense</span><b>${addToModel.lineItems.filter(li => li.kind !== "material").reduce((s, li) => s + li.quantity * li.unitCost, 0).toFixed(2)}</b></div>
                  )}
                  {!addToModel.lineItems.length && <p className="text-xs text-slate-400">This model has no cost breakdown to add yet — edit it to add labor/materials first.</p>}
                </div>
                <div className="flex justify-end gap-2 border-t border-[#9EC8EF] pt-3">
                  <button onClick={() => setAddToTargetId(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Back</button>
                  <button disabled={!addToModel.lineItems.length} onClick={confirmAddTo} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white disabled:opacity-40">Add</button>
                </div>
              </div>
            )}

            {!addToDocType && <button onClick={() => setAddToModel(null)} className="text-xs font-bold text-slate-500">Cancel</button>}
          </div>
        )}

        {showPdfPicker && (
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase text-[#1F3557]">Select Pricing Models</p>
              <div className="flex gap-2">
                <button onClick={() => setSelectedForPdf(new Set(priceBookModels.map(m => m.id)))} className="text-[10px] font-black text-[#315C9F]">Select All</button>
                <button onClick={() => setSelectedForPdf(new Set())} className="text-[10px] font-black text-[#315C9F]">Deselect All</button>
              </div>
            </div>
            <div className="max-h-80 space-y-1.5 overflow-y-auto">
              {priceBookModels.map(m => (
                <label key={m.id} className="flex items-center gap-2 rounded-lg bg-blue-50 p-2 text-xs">
                  <input type="checkbox" checked={selectedForPdf.has(m.id)} onChange={() => toggleForPdf(m.id)} />
                  <span className="flex-1">{m.name}</span>
                  <b>${m.sellingPrice.toLocaleString()}</b>
                </label>
              ))}
              {priceBookModels.length === 0 && <p className="text-xs text-slate-400">No pricing models yet.</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#9EC8EF] pt-3">
              <button onClick={() => setShowPdfPicker(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
              <button onClick={() => void generatePdf()} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white">Create PDF</button>
            </div>
          </div>
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
