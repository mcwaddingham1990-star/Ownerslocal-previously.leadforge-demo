import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import type { WorkOrder } from "../types/domain";
import { WorkOrderBuilder } from "./WorkOrderBuilder";

const todayStr = () => new Date().toISOString().slice(0, 10);

export interface CreateWorkOrderPickerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Fields to carry in no matter which starting point is picked -- e.g. a
   * preselected employee (Employee card) or customer (Customer card). */
  prefillBase?: Partial<WorkOrder>;
}

type Mode = "menu" | "pick_estimate" | "pick_job" | "builder";

/**
 * The 4-choice menu every Create Work Order entry point shows: Build From
 * Estimate, Build From Existing Job, Create New Work Order, Create Blank
 * Work Order Document. Owns its own WorkOrderBuilder instance so any page
 * can drop this one component in and get the whole flow, instead of each
 * entry point wiring the choice logic itself.
 */
export const CreateWorkOrderPicker: React.FC<CreateWorkOrderPickerProps> = ({ isOpen, onClose, prefillBase }) => {
  const { estimates, schedulingEvents, setPendingCreateTemplateFolder } = useDomainData();
  const { navigateToScreen } = useNavTelemetry();
  const [mode, setMode] = useState<Mode>("menu");
  const [builderPrefill, setBuilderPrefill] = useState<Partial<WorkOrder> | undefined>(undefined);

  useEffect(() => {
    if (isOpen) { setMode("menu"); setBuilderPrefill(undefined); }
  }, [isOpen]);

  if (!isOpen) return null;

  if (mode === "builder") {
    return <WorkOrderBuilder isOpen onClose={onClose} prefill={{ ...builderPrefill, ...prefillBase }} />;
  }

  const jobs = schedulingEvents.filter(e => e.eventType === "Job");

  const pickEstimate = (estId: string) => {
    const est = estimates.find(e => e.id === estId);
    if (!est) return;
    setBuilderPrefill({
      sourceEstimateId: est.id,
      customerName: est.customerName,
      address: est.address,
      customerPhone: est.phone,
      jobDescription: est.projectSpecifics || est.notes || `${est.company || est.customerName} project`,
      estimatedValue: est.amount,
      date: todayStr()
    });
    setMode("builder");
  };

  const pickJob = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    setBuilderPrefill({
      sourceJobId: job.id,
      customerId: job.customerId,
      customerName: job.customer,
      customerPhone: job.customerPhone,
      address: job.location || job.customerAddress,
      jobDescription: job.description || job.title || "",
      date: todayStr()
    });
    setMode("builder");
  };

  const createBlankDocument = () => {
    setPendingCreateTemplateFolder("Work Orders");
    navigateToScreen("documents");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#9EC8EF] bg-[#F5FAFF] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#9EC8EF] bg-[#C7E3FA] px-4 py-3">
          <h3 className="text-base font-black text-[#1F3557]">🧰 Create Work Order</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-white"><X className="h-4 w-4" /></button>
        </div>

        {mode === "menu" && (
          <div className="space-y-2 p-4">
            <button onClick={() => setMode("pick_estimate")} className="w-full rounded-xl border border-[#9EC8EF] bg-white p-4 text-left text-sm font-black text-[#1F3557]">Build From Estimate</button>
            <button onClick={() => setMode("pick_job")} className="w-full rounded-xl border border-[#9EC8EF] bg-white p-4 text-left text-sm font-black text-[#1F3557]">Build From Existing Job</button>
            <button onClick={() => { setBuilderPrefill({ date: todayStr() }); setMode("builder"); }} className="w-full rounded-xl border border-[#9EC8EF] bg-white p-4 text-left text-sm font-black text-[#1F3557]">Create New Work Order</button>
            <button onClick={createBlankDocument} className="w-full rounded-xl border border-dashed border-[#315C9F] p-4 text-left text-sm font-black text-[#315C9F]">Create Blank Work Order Document</button>
          </div>
        )}

        {mode === "pick_estimate" && (
          <div className="space-y-2 p-4">
            {estimates.length === 0 && <p className="text-xs text-slate-400">No estimates yet.</p>}
            {estimates.map(est => (
              <button key={est.id} onClick={() => pickEstimate(est.id)} className="w-full rounded-xl border border-[#9EC8EF] bg-white p-3 text-left text-xs">
                <span className="font-black text-[#1F3557]">{est.number}</span>
                <span className="ml-2 text-[#5E7393]">{est.customerName}</span>
              </button>
            ))}
            <button onClick={() => setMode("menu")} className="text-xs font-bold text-[#315C9F]">← Back</button>
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
      </div>
    </div>
  );
};
