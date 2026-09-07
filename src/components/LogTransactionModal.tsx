import React, { useRef, useState } from "react";
import { Camera, Keyboard, X, AlertTriangle, Loader2, DollarSign } from "lucide-react";
import { Transaction } from "../types/domain";
import { downscaleImageToBase64 } from "../lib/imageCompression";
import { buildScanSnapshotDocument, SNAPSHOT_PHOTO_MAX_BASE64_LENGTH } from "../lib/scanSnapshotDocument";
import { useDomainData } from "../context/DomainDataContext";

interface LogTransactionModalProps {
  type: "income" | "expense";
  createdBy?: string;
  onSave: (t: Omit<Transaction, "id">) => Promise<void>;
  onClose: () => void;
}

type Mode = "choose" | "form" | "processing";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Bills are intentionally excluded: provider obligations are created in the
// Bills workflow. Operational purchases stay here.
const EXPENSE_CATEGORIES = ["Materials", "Equipment", "Tools", "Fuel", "Vehicle Maintenance", "Payroll", "Rent", "Utilities", "Insurance", "Office Supplies", "Marketing", "Other"];
const INCOME_CATEGORIES = ["Job Payment", "Check Deposit", "Deposit", "Refund", "Other"];

/**
 * Manual typing is a first-class, equally-supported path here — not a
 * fallback for when the scan fails. The scan path only ever prefills this
 * same editable form via real Gemini vision OCR; nothing saves without the
 * user confirming the form, typed or scanned.
 */
export function LogTransactionModal({ type, createdBy, onSave, onClose }: LogTransactionModalProps) {
  const { setDocuments } = useDomainData();
  const [mode, setMode] = useState<Mode>("choose");
  const [source, setSource] = useState<"manual" | "ai_scan">("manual");
  const [scanError, setScanError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // The downscaled photo behind the current scan, kept around so it can be
  // filed into Documents > Snapshots once the user actually confirms a save.
  const [scannedPhoto, setScannedPhoto] = useState<{ base64: string; mimeType: string } | null>(null);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(todayStr());

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const label = type === "income" ? "Income" : "Expense";
  const descLabel = type === "income" ? "Payer / Source" : "Vendor";

  const startManual = () => {
    setSource("manual");
    setAmount("");
    setDescription("");
    setCategory("");
    setDate(todayStr());
    setScanError(null);
    setMode("form");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMode("processing");
    setScanError(null);
    try {
      const { base64, mimeType } = await downscaleImageToBase64(file);
      setScannedPhoto({ base64, mimeType });
      const res = await fetch("/api/ai/scan-financial-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setSource("ai_scan");
      if (data.unreadable) {
        setScanError(`Couldn't read a real ${type === "income" ? "check" : "receipt"} in that photo — the fields below are blank, fill in what you know.`);
        setAmount("");
        setDescription("");
      } else {
        setAmount(data.amount != null ? String(data.amount) : "");
        setDescription(data.counterpartyName || "");
      }
      setCategory("");
      setDate(data.date || todayStr());
      setMode("form");
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed. Make sure GEMINI_API_KEY is configured on the server.");
      setSource("manual");
      setAmount("");
      setDescription("");
      setCategory("");
      setDate(todayStr());
      setMode("form");
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0 || !description.trim() || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave({
        type,
        source,
        amount: parsedAmount,
        description: description.trim(),
        category: category || undefined,
        date,
        createdAt: new Date().toISOString(),
        createdBy
      });
      if (scannedPhoto && scannedPhoto.base64.length <= SNAPSHOT_PHOTO_MAX_BASE64_LENGTH) {
        setDocuments(prev => [buildScanSnapshotDocument({
          photoBase64: scannedPhoto.base64,
          mimeType: scannedPhoto.mimeType,
          vendor: description.trim(),
          date,
          docType: type === "income" ? "Checks" : "Receipts",
          uploadedBy: createdBy
        }), ...prev]);
      }
    } catch (err) {
      console.error(`Error saving ${type}:`, err);
      setSaveError(`Couldn't save this ${label.toLowerCase()}. Please try again.`);
      setIsSaving(false);
    }
  };

  const canSave = !!parseFloat(amount) && parseFloat(amount) > 0 && description.trim() !== "";

  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white text-slate-800 rounded-3xl p-5 w-[95%] max-w-[420px] shadow-2xl border border-blue-100">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-xs font-extrabold text-blue-950 uppercase tracking-tight flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-blue-600" /> Log {label}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer">×</button>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />

        {mode === "choose" && (
          <div className="py-4 space-y-2.5">
            <p className="text-[10.5px] text-slate-500 font-sans">
              {type === "income" ? "Scan a photo of a check, or just type it in." : "Scan a photo of a receipt, or just type it in."}
            </p>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem("ownerslocal_pending_financial_scan", type);
                fileInputRef.current?.click();
              }}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4" /> Scan a Photo
            </button>
            <button
              type="button"
              onClick={startManual}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              <Keyboard className="w-4 h-4" /> Type It In
            </button>
          </div>
        )}

        {mode === "processing" && (
          <div className="py-10 flex flex-col items-center gap-2 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <p className="text-[11px] font-sans font-semibold">Reading the photo...</p>
          </div>
        )}

        {mode === "form" && (
          <form id="log-transaction-form" onSubmit={handleSave} className="py-3 space-y-3 text-xs">
            {scanError && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-[10.5px] font-sans font-medium text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{scanError}</span>
              </div>
            )}
            {saveError && (
              <div role="alert" className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-[10.5px] font-sans font-medium text-rose-700">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{saveError}</span>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">{descLabel}</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={type === "income" ? "e.g. Jane Smith" : "e.g. Home Depot"}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 font-semibold focus:outline-none focus:border-blue-400"
                >
                  <option value="">Uncategorized</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 font-semibold focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
          </form>
        )}

        <div className="flex gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          {mode === "form" && (
            <button
              type="submit"
              form="log-transaction-form"
              disabled={!canSave || isSaving}
              className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving..." : `Save ${label}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
