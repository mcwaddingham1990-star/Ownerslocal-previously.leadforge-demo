import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { Briefcase, X } from "lucide-react";
import { onCollectionEvent, onRemoteCollectionEvent, type CollectionEvent } from "../lib/eventBus";
import { useDomainData } from "../context/DomainDataContext";
import { useAuth } from "../context/AuthContext";
import { hasEffectivePermission } from "../types/permissions";
import { resolveCustomerByIdOrName } from "../lib/resolveCustomer";
import { normalizeEstimateCompany } from "../lib/contactNormalization";
import type { Estimate } from "../types/domain";
import {
  estimateBuildJobPrompt, getBuildJobPrompts, isAcceptedEstimateStatus, requestBuildJobPrompt,
  resolveBuildJobPrompt, subscribeBuildJobPrompts
} from "../lib/buildJobPrompts";

/**
 * Asks "build the job?" the moment an estimate becomes accepted -- whether
 * it was accepted here, signed in person, signed remotely, or approved by
 * the customer in their portal (those last two arrive as live Firestore
 * updates). Answering "Build Job" opens the shared Build Job form
 * pre-filled from the estimate; nothing is created until that form is saved.
 * "Later" leaves the estimate in Estimates' "Convert to Job" list.
 */
export function BuildJobPromptHost({ onOpenJobs }: { onOpenJobs: () => void }) {
  const { estimates, schedulingEvents, customers, setBuildJobPrefill } = useDomainData();
  const { loggedInUser, simulatedRole } = useAuth();
  const prompts = useSyncExternalStore(subscribeBuildJobPrompts, getBuildJobPrompts, getBuildJobPrompts);

  const role = simulatedRole || loggedInUser?.role;
  const canBuildJobs = !!loggedInUser && (role === "Owner" || ["jobs", "scheduling", "dispatch"].some(moduleId =>
    hasEffectivePermission(loggedInUser.granularPermissions, loggedInUser.permissions, moduleId, "edit")
  ));

  const latest = useRef({ schedulingEvents, customers });
  latest.current = { schedulingEvents, customers };

  useEffect(() => {
    if (!canBuildJobs) return;
    const handle = (evt: CollectionEvent<Estimate>) => {
      const estimate = evt.item;
      // Only a real transition into accepted -- never estimates imported or
      // created already accepted, which would flood the screen with prompts.
      if (!estimate?.id || evt.type !== "updated") return;
      if (!isAcceptedEstimateStatus(estimate.status) || isAcceptedEstimateStatus(evt.previous?.status)) return;
      // Deferred one tick: a manual Convert to Job in the same click opens
      // the Build Job form itself and suppresses this prompt first.
      setTimeout(() => {
        const { schedulingEvents: events, customers: list } = latest.current;
        if (events.some(e => e.sourceEstimateId === estimate.id)) return;
        const company = normalizeEstimateCompany(estimate.customerName, estimate.company);
        const matched = resolveCustomerByIdOrName(list, estimate.customerId, estimate.customerName)
          || (company ? resolveCustomerByIdOrName(list, undefined, company) : null);
        requestBuildJobPrompt(estimateBuildJobPrompt(estimate, matched));
      }, 0);
    };
    const offLocal = onCollectionEvent("estimates", handle);
    const offRemote = onRemoteCollectionEvent("estimates", handle);
    return () => { offLocal(); offRemote(); };
  }, [canBuildJobs]);

  // A prompt whose job got built some other way meanwhile is no longer needed.
  const current = prompts.find(p => {
    const sourceId = p.prefill.sourceEstimateId;
    const leadId = p.prefill.sourceLeadId;
    if (sourceId && schedulingEvents.some(e => e.sourceEstimateId === sourceId)) return false;
    if (leadId && schedulingEvents.some(e => e.eventType === "Job" && e.sourceLeadId === leadId)) return false;
    return true;
  });
  if (!canBuildJobs || !current || estimates === undefined) return null;

  const build = () => {
    resolveBuildJobPrompt(current.key);
    setBuildJobPrefill(current.prefill);
    onOpenJobs();
  };

  return (
    <div className="fixed inset-0 z-[400] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="build-job-prompt-title">
      <div className="w-full max-w-[420px] rounded-3xl bg-white p-5 shadow-2xl border border-blue-100 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Briefcase className="h-5 w-5" /></span>
            <h3 id="build-job-prompt-title" className="text-sm font-extrabold text-blue-950">{current.title}</h3>
          </div>
          <button type="button" aria-label="Later" onClick={() => resolveBuildJobPrompt(current.key)} className="bg-transparent text-slate-400 hover:text-slate-600 cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">{current.detail}</p>
        <p className="mt-2 text-[10.5px] text-slate-400">No job is created until you save the Build Job form.</p>
        <div className="mt-4 flex gap-2.5">
          <button type="button" onClick={() => resolveBuildJobPrompt(current.key)} className="flex-1 py-2 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer border-transparent">
            Later
          </button>
          <button type="button" onClick={build} className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl shadow-md cursor-pointer">
            Build Job
          </button>
        </div>
      </div>
    </div>
  );
}
