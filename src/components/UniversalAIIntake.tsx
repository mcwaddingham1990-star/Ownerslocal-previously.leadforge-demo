import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, FileUp, Loader2, PencilLine, X } from "lucide-react";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useAuth } from "../context/AuthContext";
import { postBillCreatedEntry } from "../lib/accountingEngine";
import { db } from "../firebase";
import { doc, setDoc } from "firebase/firestore";
import { downscaleImageToBase64 } from "../lib/imageCompression";
import { useVisualViewportBottomRight } from "../hooks/useVisualViewportBottomRight";
import { buildScanSnapshotDocument, SNAPSHOT_PHOTO_MAX_BASE64_LENGTH } from "../lib/scanSnapshotDocument";
import type { ScannedLineItem } from "../types/scannedReceipt";
import type { InventoryItem, Customer, Lead, Estimate } from "../types/domain";
import { generateEstimateNumber, formatEstimateDate, estimateExpirationDate } from "../lib/estimateDefaults";

type RecordType = "bill" | "customer" | "lead" | "estimate" | "inventory" | "address" | "onboarding" | "material_expense" | "payroll" | "financial" | "unknown";

/** Which Snapshots subfolder a scanned record type files its original photo
 *  under. Types not listed here (customer/lead/estimate/address/onboarding)
 *  aren't receipts/invoices/bills/checks, so no photo is saved for them. */
const SNAPSHOT_DOC_TYPE: Partial<Record<RecordType, "Receipts" | "Invoices" | "Bills" | "Checks">> = {
  bill: "Bills",
  material_expense: "Receipts",
  financial: "Receipts",
  payroll: "Checks",
  inventory: "Receipts"
};
type Fields = Record<string, string | number | boolean | null>;
const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const today = () => new Date().toISOString().slice(0, 10);
const labels: Record<RecordType, string> = { bill: "Bill / Invoice", customer: "Customer", lead: "Lead", estimate: "Estimate", inventory: "Inventory", address: "Address", onboarding: "Onboarding", material_expense: "Material / Operational Expense", payroll: "Payroll Record", financial: "Other Financial Record", unknown: "Auto-detect" };
const asBoolean = (value: unknown) => value === true || String(value).trim().toLowerCase() === "true" || String(value).trim().toLowerCase() === "yes";
const canonicalFinancialCategory = (value: unknown): "Bills" | "Material Expenses" | "Payroll" | "Other Expenses" | null => {
  const category = String(value || "").trim().toLowerCase();
  if (["bill", "bills", "vendor bill", "service provider"].includes(category)) return "Bills";
  if (["material", "materials", "material expense", "material expenses", "equipment", "fuel", "supplies", "operational expense", "operational expenses"].includes(category)) return "Material Expenses";
  if (["payroll", "wages", "salary", "salaries", "payroll expense"].includes(category)) return "Payroll";
  if (["other", "other expense", "other expenses"].includes(category)) return "Other Expenses";
  return null;
};
const presetFields: Record<RecordType, Fields> = {
  bill: { payee: "", serviceProvided: "", estimatedCost: "", totalCost: "", recurring: false, recurringDate: "" },
  customer: { company: "", contact: "", phone: "", email: "", address: "", city: "", state: "", zip: "", notes: "" },
  lead: { company: "", contact: "", phone: "", email: "", address: "", notes: "" },
  estimate: { company: "", contact: "", description: "", estimatedCost: "", notes: "" },
  inventory: { name: "", category: "Materials", quantity: "", unitCost: "", company: "" },
  address: { address: "", city: "", state: "", zip: "" },
  onboarding: { accountAdministratorName: "", businessName: "", administratorPhone: "", businessPhone: "", address: "", companyLocation: "" },
  material_expense: { description: "", amount: "", category: "Materials", date: "", company: "", notes: "" },
  payroll: { description: "", amount: "", category: "Payroll", date: "", name: "", notes: "" },
  financial: { description: "", amount: "", category: "Other Expenses", date: "", notes: "" },
  unknown: { name: "", phone: "", email: "", address: "", description: "", amount: "" }
};

export function UniversalAIIntake() {
  const data = useDomainData();
  const { triggerNotification, logOperationalEvent } = useNavTelemetry();
  const { loggedInUser, businessId } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportInset = useVisualViewportBottomRight();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"choose" | "scanning" | "review" | "review_items">("choose");
  const [recordType, setRecordType] = useState<RecordType>("unknown");
  const [fields, setFields] = useState<Fields>({});
  const [confidence, setConfidence] = useState(0);
  // Populated instead of `fields` when a scan comes back as a multi-item
  // receipt/packing slip (recordType material_expense/inventory) -- reviewed
  // as a per-item checklist rather than one flat record.
  const [scannedItems, setScannedItems] = useState<ScannedLineItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<boolean[]>([]);
  const [logItemsExpense, setLogItemsExpense] = useState(true);
  const [scanVendor, setScanVendor] = useState<string | null>(null);
  const [scanDate, setScanDate] = useState<string | null>(null);
  const [scanTotal, setScanTotal] = useState<number | null>(null);
  // The downscaled photo behind the current scan, kept around so it can be
  // filed into Documents > Snapshots once the user actually confirms a save
  // -- not saved for a scan that gets canceled, or for record types that
  // aren't a receipt/invoice/bill/check (customer, lead, estimate, etc.).
  const [scannedPhoto, setScannedPhoto] = useState<{ base64: string; mimeType: string } | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const preferred = (event as CustomEvent<{ recordType?: RecordType }>).detail?.recordType || "unknown";
      setRecordType(preferred); setFields({}); setScannedItems([]); setSelectedItems([]); setScannedPhoto(null); setStage("choose"); setOpen(true);
    };
    window.addEventListener("ownerslocal:ai-intake", handler);
    return () => window.removeEventListener("ownerslocal:ai-intake", handler);
  }, []);

  const close = () => { setOpen(false); setStage("choose"); setFields({}); setScannedItems([]); setSelectedItems([]); setScannedPhoto(null); };
  const saveSnapshotPhoto = (params: { vendor?: string | null; date?: string | null }) => {
    const docType = SNAPSHOT_DOC_TYPE[recordType];
    if (!docType || !scannedPhoto || scannedPhoto.base64.length > SNAPSHOT_PHOTO_MAX_BASE64_LENGTH) return;
    data.setDocuments(prev => [buildScanSnapshotDocument({
      photoBase64: scannedPhoto.base64,
      mimeType: scannedPhoto.mimeType,
      vendor: params.vendor,
      date: params.date,
      docType,
      uploadedBy: loggedInUser?.name
    }), ...prev]);
  };
  const scan = async (file?: File) => {
    if (!file) return;
    setStage("scanning");
    try {
      const { base64, mimeType } = await downscaleImageToBase64(file);
      setScannedPhoto({ base64, mimeType });
      const response = await fetch("/api/ai/scan-business-record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64: base64, mimeType, preferredRecordType: recordType === "unknown" ? undefined : recordType }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to scan this record");
      if (result.unreadable) throw new Error("AI could not read a completed business record in that image.");
      const resolvedType = result.recordType || recordType;
      setRecordType(resolvedType);
      setConfidence(Number(result.confidence) || 0);
      if ((resolvedType === "material_expense" || resolvedType === "inventory") && Array.isArray(result.items) && result.items.length) {
        setScannedItems(result.items);
        setSelectedItems(result.items.map(() => true));
        setLogItemsExpense(true);
        setScanVendor(result.fields?.payee || result.fields?.company || null);
        setScanDate(result.fields?.date || result.fields?.dueDate || null);
        setScanTotal(result.fields?.totalCost != null ? Number(result.fields.totalCost) : null);
        setStage("review_items");
      } else {
        setFields(Object.fromEntries(Object.entries(result.fields || {}).filter(([, value]) => value !== null && value !== "")));
        setStage("review");
      }
    } catch (error) {
      triggerNotification(error instanceof Error ? error.message : "AI scan failed. Manual entry is still available."); setStage("choose");
    }
  };

  const findInventoryMatch = (item: ScannedLineItem) =>
    data.inventoryList.find(i => (!!item.barcode && i.barcode === item.barcode) || (!!item.sku && i.sku === item.sku)) || null;

  const itemsTotal = scannedItems.reduce((sum, item) => sum + (item.quantity ?? 0) * (item.unitCost ?? 0), 0);
  const scanReceiptTotal = scanTotal ?? itemsTotal;

  const saveItemizedScan = () => {
    const createdAt = new Date().toISOString();
    const todayStr = today();
    const updatedNames: string[] = [];

    scannedItems.forEach((item, index) => {
      if (!selectedItems[index]) return;
      const scannedQty = item.quantity ?? 0;
      const scannedCost = item.unitCost ?? 0;
      const match = findInventoryMatch(item);

      if (match) {
        data.setInventoryList(prev => prev.map(i => i.id === match.id ? {
          ...i,
          quantity: i.quantity + scannedQty,
          quantityHistory: [
            { date: todayStr, type: "AI Snapshot Scan", amount: scannedQty, previous: i.quantity, current: i.quantity + scannedQty, notes: scanVendor ? `Scanned at ${scanVendor}` : "Scanned via AI Snapshot" },
            ...i.quantityHistory
          ]
        } : i));
        updatedNames.push(match.name);
      } else {
        const newItem: InventoryItem = {
          id: id("ai_inv"),
          name: item.name || "Unnamed scanned item",
          category: item.category || "Uncategorized",
          vendor: scanVendor || "",
          manufacturer: item.manufacturer || "",
          sku: item.sku || "",
          barcode: item.barcode || "",
          qrCode: "",
          description: "Added from a scanned receipt/label photo",
          quantity: scannedQty,
          unit: item.unit || "pcs",
          minQuantity: 5,
          maxQuantity: Math.max(scannedQty * 2, 10),
          location: "Warehouse A",
          unitCost: scannedCost,
          sellingPrice: scannedCost * 1.5,
          notes: "Created via AI Snapshot scan",
          photo: "📦",
          isFavorite: false,
          lastUpdated: new Date().toLocaleTimeString(),
          quantityHistory: [{ date: todayStr, type: "AI Scanned New", amount: scannedQty, previous: 0, current: scannedQty, notes: "Created from scanned receipt/label" }],
          purchaseHistory: [],
          usageHistory: []
        };
        data.setInventoryList(prev => [...prev, newItem]);
        updatedNames.push(newItem.name);
      }
    });

    if (logItemsExpense && scanReceiptTotal > 0) {
      const vendorName = scanVendor || "Scanned receipt";
      const itemCount = scannedItems.length;
      void data.saveTransaction({
        type: "expense",
        source: "ai_scan",
        amount: scanReceiptTotal,
        description: `${vendorName} (${itemCount} item${itemCount === 1 ? "" : "s"} via AI Snapshot)`,
        category: "Materials",
        date: scanDate || todayStr,
        createdAt,
        ...(loggedInUser?.email ? { createdBy: loggedInUser.email } : {})
      }).then(() => triggerNotification(`Logged $${scanReceiptTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} as a Materials expense.`))
        .catch(error => {
          console.error("Inventory updated, but its expense could not be logged:", error);
          triggerNotification("Inventory was updated, but the expense did not post. Log it manually from Revenue when the connection recovers.");
        });
    }

    saveSnapshotPhoto({ vendor: scanVendor, date: scanDate });
    logOperationalEvent?.("AI Intake Saved", `Itemized receipt scan reviewed and saved (${updatedNames.length} item${updatedNames.length === 1 ? "" : "s"})`, "🤖");
    triggerNotification(updatedNames.length ? `Updated inventory: ${updatedNames.join(", ")}.` : "No items were added to inventory.");
    close();
  };

  const save = async () => {
    const createdAt = new Date().toISOString();
    const actor = loggedInUser?.email;
    if (recordType === "bill") {
      const payee = String(fields.payee || fields.company || fields.name || "").trim();
      const service = String(fields.serviceProvided || fields.description || "").trim();
      const amount = Number(fields.totalCost ?? fields.estimatedCost ?? fields.amount);
      if (!payee || !service || !Number.isFinite(amount)) return triggerNotification("Review requires a payee, service, and valid cost before saving.");
      const existing = data.vendors.find(v => v.name.trim().toLowerCase() === payee.toLowerCase());
      const provider = existing || { id: id("provider"), name: payee, category: "Service Provider", createdAt };
      if (!existing) data.setVendors(prev => [...prev, provider]);
      const recurring = asBoolean(fields.recurring);
      const bill: any = { id: id("bill"), billNumber: `BILL-${1000 + data.bills.length + 1}`, vendor: provider.name, serviceProviderId: provider.id, serviceProvided: service, estimatedCost: Number(fields.estimatedCost ?? amount), totalCost: fields.totalCost == null ? undefined : Number(fields.totalCost), recurring, recurringDate: recurring && fields.recurringDate ? String(fields.recurringDate) : undefined, lineItems: [{ id: id("li"), description: service, quantity: 1, unitPrice: amount }], category: "Bills", issuedDate: today(), dueDate: String((recurring && fields.recurringDate) || fields.dueDate || today()), status: "unpaid", amountPaid: 0, notes: fields.notes ? String(fields.notes) : undefined, createdAt, createdBy: actor, source: "ai_snapshot", history: [{ id: id("history"), date: createdAt, action: "AI Snapshot reviewed and saved", amount }] };
      data.setBills(prev => [...prev, bill]);
      data.setJournalEntries(prev => [...prev, postBillCreatedEntry(bill, actor)]);
    } else if (recordType === "customer") {
      // Same real Customer shape every other creation path builds (manual
      // add, CSV import, lead/estimate conversion) -- so a scanned customer
      // shows up identically everywhere the others do instead of leaving
      // fields blank/NaN (openJobs, lifetimeValue, status, type, isVIP).
      const customer: Customer = {
        id: id("cust"),
        company: String(fields.company || fields.name || fields.contact || "New Customer"),
        contact: String(fields.contact || fields.name || ""),
        phone: String(fields.phone || ""),
        email: String(fields.email || ""),
        address: [fields.address, fields.city, fields.state, fields.zip].filter(Boolean).join(", "),
        openJobs: 0,
        outstandingBalance: 0,
        lifetimeValue: 0,
        status: "Active",
        type: "Residential",
        isVIP: false,
        recentlyAdded: true
      };
      data.setCustomers(prev => [customer, ...prev]);
    } else if (recordType === "lead") {
      // Same real Lead shape LeadsPage's own add-lead form builds, so a
      // scanned lead sorts/filters/displays identically (dateAdded,
      // addedDaysAgo, estimatedValue, salesRep) instead of showing blank.
      const lead: Lead = {
        id: id("lead"),
        name: String(fields.name || fields.contact || fields.company || "New Lead"),
        company: String(fields.company || ""),
        phone: String(fields.phone || ""),
        email: String(fields.email || ""),
        source: "Other",
        salesRep: loggedInUser?.name || actor || "Self",
        status: "New",
        estimatedValue: Number(fields.amount || fields.estimatedValue || 0),
        dateAdded: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        addedDaysAgo: 0,
        address: String(fields.address || ""),
        notes: String(fields.notes || fields.description || "")
      };
      data.setLeads(prev => [lead, ...prev]);
    } else if (recordType === "estimate") {
      // Same real Estimate shape EstimatesPage's manual form and the
      // lead-conversion pipeline build (customerName/number/salesRep/
      // expirationDate), so a scanned estimate shows up identically
      // instead of rendering blank or failing to match a customer later.
      const estimate: Estimate = {
        id: id("estimate"),
        number: generateEstimateNumber(),
        customerName: String(fields.contact || fields.name || fields.company || "Unassigned"),
        company: String(fields.company || fields.name || "Unassigned"),
        status: "Draft",
        salesRep: loggedInUser?.name || actor || "Self",
        amount: Number(fields.amount || fields.estimatedCost || 0),
        createdDate: formatEstimateDate(new Date()),
        expirationDate: estimateExpirationDate(),
        notes: String(fields.notes || fields.description || ""),
        address: String(fields.address || ""),
        phone: String(fields.phone || "")
      };
      data.setEstimates(prev => [estimate, ...prev]);
    } else if (recordType === "inventory") {
      data.setInventoryList(prev => [...prev, { id: id("inventory"), name: String(fields.name || fields.description || "Scanned item"), category: String(fields.category || "Materials"), quantity: Number(fields.quantity || 0), unitCost: Number(fields.unitCost || fields.amount || 0), supplier: String(fields.company || fields.payee || ""), source: "AI Snapshot", createdAt } as any]);
    } else if (recordType === "onboarding") {
      if (!businessId) return triggerNotification("Sign in to a business account before updating onboarding information.");
      const administratorName = String(fields.accountAdministratorName || fields.name || "").trim();
      const businessName = String(fields.businessName || fields.company || "").trim();
      if (!administratorName || !businessName) return triggerNotification("Review requires Account Administrator Name and Business Name. Your signed-in account supplies Business Email.");
      const profileUpdate: Record<string, string[] | string> = {
        ownerNames: [administratorName],
        businessNames: [businessName],
        updatedAt: createdAt
      };
      if (String(fields.administratorPhone || "").trim()) profileUpdate.ownerPhones = [String(fields.administratorPhone).trim()];
      if (String(fields.businessPhone || "").trim()) profileUpdate.businessPhones = [String(fields.businessPhone).trim()];
      if (String(fields.address || "").trim()) profileUpdate.businessAddresses = [String(fields.address).trim()];
      if (String(fields.companyLocation || "").trim()) profileUpdate.companyLocations = [String(fields.companyLocation).trim()];
      try {
        await setDoc(doc(db, "business_profiles", businessId), profileUpdate, { merge: true });
        window.dispatchEvent(new CustomEvent("ownerslocal:business-profile-updated", { detail: profileUpdate }));
      } catch (error) {
        console.error("AI onboarding profile save failed", error);
        return triggerNotification("Business profile could not be saved. Check the connection and try again.");
      }
    } else if (recordType === "financial" || recordType === "material_expense" || recordType === "payroll") {
      const amount = Number(fields.amount || fields.totalCost || 0);
      if (!Number.isFinite(amount) || amount <= 0) return triggerNotification("Review requires a valid financial amount before saving.");
      const category = recordType === "material_expense" ? "Material Expenses" : recordType === "payroll" ? "Payroll" : canonicalFinancialCategory(fields.category);
      if (category === "Bills") return triggerNotification("Service/provider obligations must be saved as a Bill so they remain linked to the provider.");
      if (!category) return triggerNotification("Choose Material / Operational Expense, Payroll Record, or enter a recognized category before saving.");
      // Goes through saveTransaction (not a raw setTransactions push) so a
      // matching journal entry is posted -- without one this expense would
      // never actually reduce revenue on the Accounting/Revenue pages, since
      // those are computed from journal entries, not the transactions list.
      try {
        await data.saveTransaction({ type: "expense", source: "ai_scan", amount, description: String(fields.description || fields.serviceProvided || fields.payee || labels[recordType]), category, date: String(fields.date || fields.dueDate || today()), createdAt, createdBy: actor });
      } catch (error) {
        console.error("AI intake expense save failed", error);
        return triggerNotification("Couldn't save this expense. Check the connection and try again.");
      }
    } else {
      triggerNotification("Choose Bill, Customer, Lead, Estimate, or Inventory before saving this reviewed record."); return;
    }
    saveSnapshotPhoto({
      vendor: String(fields.payee || fields.company || fields.name || "") || null,
      date: String(fields.date || fields.dueDate || "") || null
    });
    logOperationalEvent?.("AI Intake Saved", `${labels[recordType]} reviewed by owner before save`, "🤖");
    triggerNotification(`${labels[recordType]} reviewed and saved.`); close();
  };

  // Bottom-right, side by side with the Owner's AI chat widget's fixed dock
  // (bottom-6 right-6) -- offset left just enough to clear that pill without
  // overlapping it. Portaled straight to document.body so position:fixed is
  // always relative to the real viewport, not trapped by some ancestor --
  // it has to stay pinned to the screen corner no matter how far the page
  // underneath scrolls.
  if (!open) return createPortal(
    <button
      onClick={() => setOpen(true)}
      className="fixed z-40 rounded-full bg-violet-600 px-4 py-3 text-xs font-black text-white shadow-xl hover:bg-violet-700 flex items-center gap-2"
      style={{ bottom: 24 + viewportInset.bottom, right: 210 + viewportInset.right }}
    ><Camera className="w-4 h-4" /> Snapshot</button>,
    document.body
  );
  return createPortal(
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-black uppercase text-[#1F3557]">Snapshot</h3><p className="mt-1 text-[10px] text-slate-500">Photograph or upload a receipt, invoice, bill, check, or completed form -- the AI figures out what it is and where it goes. Nothing saves until you review it.</p></div><button onClick={close}><X className="w-5 h-5 text-slate-400" /></button></div>
    {stage === "choose" && <div className="mt-5 space-y-4"><label className="block text-[10px] font-black uppercase text-slate-500">Record destination<select value={recordType} onChange={e => setRecordType(e.target.value as RecordType)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs normal-case"><option value="unknown">Auto-detect from document</option>{Object.entries(labels).filter(([key]) => key !== "unknown").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => scan(e.target.files?.[0])} /><button onClick={() => inputRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 p-7 text-violet-700"><FileUp className="mx-auto mb-2 w-7 h-7" /><span className="text-xs font-black">Photograph or upload completed form</span></button><button onClick={() => { setFields({ ...presetFields[recordType] }); setStage("review"); }} className="w-full rounded-xl border border-[#9EC8EF] bg-[#EAF5FF] px-3 py-2.5 text-xs font-bold text-[#315C9F] flex justify-center gap-2"><PencilLine className="w-4 h-4" /> Use editable preset form</button><p className="text-center text-[9px] text-slate-500">Manual entry inside every module remains available.</p></div>}
    {stage === "scanning" && <div className="py-14 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-violet-600" /><p className="mt-3 text-xs font-bold text-[#1F3557]">Reading and classifying the form…</p></div>}
    {stage === "review" && <div className="mt-4 space-y-3"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-900"><strong>Owner review required.</strong> Correct every field below before saving. AI confidence: {Math.round(confidence * 100)}%.</div><label className="block text-[9px] font-black uppercase text-slate-500">Save to<select value={recordType} onChange={e => setRecordType(e.target.value as RecordType)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs normal-case">{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{Object.entries(fields).map(([key, value]) => <label key={key} className="block"><span className="text-[9px] font-bold uppercase text-slate-500">{key.replace(/([A-Z])/g, " $1")}</span><input value={String(value ?? "")} onChange={e => setFields(prev => ({ ...prev, [key]: typeof value === "number" ? Number(e.target.value) : typeof value === "boolean" ? e.target.value === "true" : e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label>)}<button onClick={() => setFields(prev => ({ ...prev, [`field${Object.keys(prev).length + 1}`]: "" }))} className="text-[10px] font-bold text-[#315C9F]">+ Add missing field</button><div className="flex gap-2 pt-2"><button onClick={() => setStage("choose")} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-600">Back</button><button onClick={save} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white flex justify-center gap-2"><Check className="w-4 h-4" /> Review Complete — Save</button></div></div>}
    {stage === "review_items" && <div className="mt-4 space-y-3 text-xs">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-900"><strong>Owner review required.</strong> {scannedItems.length} item{scannedItems.length === 1 ? "" : "s"} found — {scanVendor || "vendor not detected"}{scanDate ? ` · ${scanDate}` : ""}. AI confidence: {Math.round(confidence * 100)}%.</div>
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <label className="flex items-center gap-2.5 p-3 border-b border-slate-200 bg-slate-50 cursor-pointer">
          <input type="checkbox" checked={scannedItems.length > 0 && selectedItems.every(Boolean)} onChange={e => setSelectedItems(scannedItems.map(() => e.target.checked))} className="w-4 h-4 accent-violet-600" />
          <span className="text-[11px] font-black text-[#1F3557] uppercase tracking-wide">Add all items to inventory</span>
        </label>
        <div className="divide-y divide-slate-100">
          {scannedItems.map((item, index) => {
            const match = findInventoryMatch(item);
            return (
              <label key={index} className="flex items-start gap-2.5 p-3 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={!!selectedItems[index]} onChange={e => setSelectedItems(prev => prev.map((v, i) => i === index ? e.target.checked : v))} className="w-4 h-4 mt-0.5 accent-violet-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-slate-800 font-black">{item.quantity != null ? `${item.quantity} × ` : ""}{item.name || "Unnamed item"}</span>
                    <span className="font-mono text-slate-800 font-black">{item.unitCost != null ? `$${item.unitCost.toFixed(2)} ea` : "Cost not detected"}</span>
                  </div>
                  <div className="text-[9.5px] text-slate-400 font-medium mt-0.5">
                    {item.sku ? `SKU ${item.sku}` : "No SKU detected"}
                    {match ? ` · Restocks existing "${match.name}" (${match.quantity} on hand)` : " · Will be added as a new item"}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-between p-3 border-t border-slate-200 bg-slate-50">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wide">Receipt Total</span>
          <span className="font-mono text-sm text-[#1F3557] font-black">{scanReceiptTotal > 0 ? `$${scanReceiptTotal.toFixed(2)}` : "Not detected"}</span>
        </div>
      </div>
      <label className="flex items-start gap-2.5 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer">
        <input type="checkbox" checked={logItemsExpense} onChange={e => setLogItemsExpense(e.target.checked)} className="w-4 h-4 mt-0.5 accent-violet-600" />
        <span>
          <span className="text-slate-800 font-black block">{scanReceiptTotal > 0 ? `Log $${scanReceiptTotal.toFixed(2)} to Materials expenses` : "Log this receipt as a Materials expense"}</span>
          <span className="text-[9.5px] text-slate-400 font-medium">Posts to Accounting and reduces revenue, regardless of which items above are added to inventory.</span>
        </span>
      </label>
      {scanReceiptTotal <= 0 && <p className="text-[10px] text-amber-700 font-semibold">No receipt total or per-item costs were legible — confirming will update inventory but won't log an expense.</p>}
      <div className="flex gap-2 pt-2">
        <button onClick={() => setStage("choose")} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-600">Back</button>
        <button onClick={saveItemizedScan} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white flex justify-center gap-2"><Check className="w-4 h-4" /> Confirm & Update Ledger</button>
      </div>
    </div>}
  </div></div>,
  document.body
  );
}
