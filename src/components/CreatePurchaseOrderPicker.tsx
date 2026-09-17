import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useDomainData } from "../context/DomainDataContext";
import type { PurchaseOrder } from "../types/purchaseOrder";
import { PurchaseOrderBuilder } from "./PurchaseOrderBuilder";

const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export interface CreatePurchaseOrderPickerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Fields to carry in no matter which starting point is picked -- e.g. a
   * preselected job (Job detail) or work order. */
  prefillBase?: Partial<PurchaseOrder>;
}

type Mode = "menu" | "pick_job" | "pick_work_order" | "pick_inventory" | "builder";

/**
 * The 4-choice menu every "New PO" entry point shows: From Blank, From
 * Existing Job, From Work Order, From Inventory Items. Owns its own
 * PurchaseOrderBuilder instance so any page can drop this one component in.
 */
export const CreatePurchaseOrderPicker: React.FC<CreatePurchaseOrderPickerProps> = ({ isOpen, onClose, prefillBase }) => {
  const { schedulingEvents, workOrders, inventoryList } = useDomainData();
  const [mode, setMode] = useState<Mode>("menu");
  const [builderPrefill, setBuilderPrefill] = useState<Partial<PurchaseOrder> | undefined>(undefined);
  const [pickedInventoryIds, setPickedInventoryIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) { setMode("menu"); setBuilderPrefill(undefined); setPickedInventoryIds([]); }
  }, [isOpen]);

  if (!isOpen) return null;

  if (mode === "builder") {
    return <PurchaseOrderBuilder isOpen onClose={onClose} prefill={{ ...builderPrefill, ...prefillBase }} />;
  }

  const jobs = schedulingEvents.filter(e => e.eventType === "Job");

  const pickJob = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    setBuilderPrefill({ sourceJobId: job.id, date: todayStr() });
    setMode("builder");
  };

  const pickWorkOrder = (woId: string) => {
    const wo = workOrders.find(w => w.id === woId);
    if (!wo) return;
    setBuilderPrefill({ sourceWorkOrderId: wo.id, sourceJobId: wo.sourceJobId, date: todayStr() });
    setMode("builder");
  };

  const confirmInventoryPick = () => {
    const items = pickedInventoryIds.map(id => {
      const inv = inventoryList.find(i => i.id === id);
      return { id: uid("poi"), description: inv?.name || "Item", inventoryId: id, quantity: 1, unitCost: inv?.unitCost || 0 };
    });
    setBuilderPrefill({ date: todayStr(), items });
    setMode("builder");
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#9EC8EF] bg-[#F5FAFF] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#9EC8EF] bg-[#C7E3FA] px-4 py-3">
          <h3 className="text-base font-black text-[#1F3557]">🧾 New PO</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-white"><X className="h-4 w-4" /></button>
        </div>

        {mode === "menu" && (
          <div className="space-y-2 p-4">
            <button onClick={() => { setBuilderPrefill({ date: todayStr() }); setMode("builder"); }} className="w-full rounded-xl border border-[#9EC8EF] bg-white p-4 text-left text-sm font-black text-[#1F3557]">From Blank</button>
            <button onClick={() => setMode("pick_job")} className="w-full rounded-xl border border-[#9EC8EF] bg-white p-4 text-left text-sm font-black text-[#1F3557]">From Existing Job</button>
            <button onClick={() => setMode("pick_work_order")} className="w-full rounded-xl border border-[#9EC8EF] bg-white p-4 text-left text-sm font-black text-[#1F3557]">From Work Order</button>
            <button onClick={() => setMode("pick_inventory")} className="w-full rounded-xl border border-dashed border-[#315C9F] p-4 text-left text-sm font-black text-[#315C9F]">From Inventory Items</button>
          </div>
        )}

        {mode === "pick_job" && (
          <div className="space-y-2 p-4">
            {jobs.length === 0 && <p className="text-xs text-slate-400">No jobs yet.</p>}
            {jobs.map(job => (
              <button key={job.id} onClick={() => pickJob(job.id)} className="w-full rounded-xl border border-[#9EC8EF] bg-white p-3 text-left text-xs">
                <span className="font-black text-[#1F3557]">{job.jobNumber || job.title || "Job"}</span>
                <span className="ml-2 text-[#5E7393]">{job.customer}</span>
              </button>
            ))}
            <button onClick={() => setMode("menu")} className="text-xs font-bold text-[#315C9F]">← Back</button>
          </div>
        )}

        {mode === "pick_work_order" && (
          <div className="space-y-2 p-4">
            {workOrders.length === 0 && <p className="text-xs text-slate-400">No work orders yet.</p>}
            {workOrders.map(wo => (
              <button key={wo.id} onClick={() => pickWorkOrder(wo.id)} className="w-full rounded-xl border border-[#9EC8EF] bg-white p-3 text-left text-xs">
                <span className="font-black text-[#1F3557]">{wo.workOrderNumber}</span>
                <span className="ml-2 text-[#5E7393]">{wo.customerName || wo.jobDescription}</span>
              </button>
            ))}
            <button onClick={() => setMode("menu")} className="text-xs font-bold text-[#315C9F]">← Back</button>
          </div>
        )}

        {mode === "pick_inventory" && (
          <div className="space-y-2 p-4">
            {inventoryList.length === 0 && <p className="text-xs text-slate-400">No inventory items yet.</p>}
            {inventoryList.map(inv => (
              <label key={inv.id} className="flex w-full items-center gap-2 rounded-xl border border-[#9EC8EF] bg-white p-3 text-left text-xs">
                <input
                  type="checkbox"
                  checked={pickedInventoryIds.includes(inv.id)}
                  onChange={() => setPickedInventoryIds(prev => prev.includes(inv.id) ? prev.filter(id => id !== inv.id) : [...prev, inv.id])}
                />
                <span className="font-black text-[#1F3557]">{inv.name}</span>
                <span className="ml-auto text-[#5E7393]">{inv.quantity} {inv.unit} on hand</span>
              </label>
            ))}
            <div className="flex justify-between pt-2">
              <button onClick={() => setMode("menu")} className="text-xs font-bold text-[#315C9F]">← Back</button>
              <button onClick={confirmInventoryPick} disabled={pickedInventoryIds.length === 0} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white disabled:opacity-40">Continue ({pickedInventoryIds.length})</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
