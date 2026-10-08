import React, { useEffect, useRef, useState } from "react";
import { ShieldAlert, XCircle, MinusCircle, Circle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useProtectionSources, useProtectionActions } from "../hooks/useOwnerProtection";
import { computeJobProtection, jobDisplayNumber, type JobProtection } from "../lib/ownerProtection";
import { registerCompletionGuard } from "../lib/completionGuard";
import type { SchedulingEvent } from "../types/domain";

interface Pending {
  job: SchedulingEvent;
  protection: JobProtection;
  resolve: (proceed: boolean) => void;
}

/**
 * Before any job is marked Completed (from any page), checks its Owner
 * Protection items. If important proof is missing, the person completing
 * it sees exactly what's missing and must acknowledge it to continue; the
 * acknowledgment is written to the job's activity history.
 */
export const CompletionGuard: React.FC = () => {
  const { loggedInUser } = useAuth();
  const { setSchedulingEvents } = useDomainData();
  const { jobs, sourcesFor } = useProtectionSources();
  const { openJob } = useProtectionActions();
  const [pending, setPending] = useState<Pending | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const latest = useRef({ jobs, sourcesFor });
  latest.current = { jobs, sourcesFor };
  const actor = loggedInUser?.name || loggedInUser?.email || "Staff";

  useEffect(() => {
    registerCompletionGuard(jobId => new Promise<boolean>(resolve => {
      const job = latest.current.jobs.find(j => j.id === jobId);
      if (!job || String(job.status).toLowerCase() === "completed") return resolve(true);
      const protection = computeJobProtection(job, latest.current.sourcesFor(job));
      if (!protection.missingCritical.length) return resolve(true);
      setAcknowledged(false);
      setPending({ job, protection, resolve });
    }));
    return () => registerCompletionGuard(null);
  }, []);

  if (!pending) return null;
  const { job, protection } = pending;

  const finish = (proceed: boolean) => {
    if (proceed) {
      const missing = protection.missingCritical.map(c => c.label).join(", ");
      setSchedulingEvents(prev => prev.map(j => j.id === job.id ? {
        ...j,
        activity: [...(j.activity || []), {
          id: `act_${Date.now()}_ack`, timestamp: new Date().toISOString(), by: actor,
          action: "Completed with missing protection items acknowledged",
          detail: `Protection ${protection.score}% (${protection.level}). Missing: ${missing}.`,
        }],
      } : j));
    }
    pending.resolve(proceed);
    setPending(null);
  };

  const fixFirst = () => {
    pending.resolve(false);
    setPending(null);
    openJob(job);
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-[#1F3557]/50 p-4 backdrop-blur-[2px]" onClick={() => finish(false)} role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="completion-guard-title" className="w-full max-w-md overflow-hidden rounded-3xl border-2 border-amber-300 bg-white text-left shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 bg-amber-50 px-5 py-4">
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
          <div>
            <h2 id="completion-guard-title" className="text-sm font-black text-[#1F3557]">Before you complete {jobDisplayNumber(job)}</h2>
            <p className="text-xs font-semibold text-[#5E7393]">{job.customer} · Protection {protection.score}% ({protection.level})</p>
          </div>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-xs leading-relaxed text-slate-600">These items protect you if the customer disputes the work or the bill. They aren't on file yet:</p>
          <ul className="space-y-2">
            {protection.missingCritical.map(check => (
              <li key={check.id} className="flex gap-2">
                {check.status === "partial" ? <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : check.status === "pending" ? <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />}
                <div>
                  <p className="text-xs font-bold text-[#1F3557]">{check.label}</p>
                  <p className="text-[11px] text-slate-500">{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-[#EAF5FF] p-3 text-xs font-bold text-[#1F3557]">
            <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-[#A9CDEE] text-[#315C9F]" />
            I understand these items are missing and want to mark the job complete anyway.
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#E0EEFA] bg-[#F5FAFF] px-5 py-3">
          <button onClick={() => finish(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Go back</button>
          <button onClick={fixFirst} className="rounded-xl border border-[#315C9F] bg-white px-4 py-2 text-xs font-bold text-[#315C9F]">Fix these first</button>
          <button disabled={!acknowledged} onClick={() => finish(true)} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white disabled:opacity-40">Complete anyway</button>
        </div>
      </div>
    </div>
  );
};

export default CompletionGuard;
