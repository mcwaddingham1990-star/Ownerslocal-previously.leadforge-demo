import React, { useRef, useState } from "react";
import {
  AlertTriangle, Camera, CheckCircle2, ChevronDown, ChevronUp, Circle, Clock, DollarSign, FileSignature, FileText,
  History, Image as ImageIcon, MessageSquare, MinusCircle, PenLine, Receipt, ShieldCheck, Truck, Wrench, XCircle
} from "lucide-react";
import type { SchedulingEvent } from "../types/domain";
import { useJobProtection, useProtectionActions } from "../hooks/useOwnerProtection";
import type { CheckStatus, ProtectionAction, RiskAlert, TimelineKind } from "../lib/ownerProtection";

export const levelStyle: Record<string, string> = {
  "Protected": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Partially Protected": "bg-amber-50 text-amber-800 border-amber-200",
  "At Risk": "bg-rose-50 text-rose-700 border-rose-200",
};

const statusIcon: Record<CheckStatus, React.ReactNode> = {
  done: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  partial: <MinusCircle className="h-4 w-4 text-amber-500" />,
  missing: <XCircle className="h-4 w-4 text-rose-600" />,
  pending: <Circle className="h-4 w-4 text-slate-300" />,
  na: <Circle className="h-4 w-4 text-slate-200" />,
};

const statusLabel: Record<CheckStatus, string> = { done: "In place", partial: "Partial", missing: "Missing", pending: "Not yet", na: "Not needed" };

const timelineIcon: Record<TimelineKind, React.ReactNode> = {
  estimate: <FileText className="h-3.5 w-3.5" />, approval: <CheckCircle2 className="h-3.5 w-3.5" />, signature: <FileSignature className="h-3.5 w-3.5" />,
  change_order: <PenLine className="h-3.5 w-3.5" />, job: <Wrench className="h-3.5 w-3.5" />, arrival: <Truck className="h-3.5 w-3.5" />,
  work: <Clock className="h-3.5 w-3.5" />, photo: <ImageIcon className="h-3.5 w-3.5" />, document: <FileText className="h-3.5 w-3.5" />,
  message: <MessageSquare className="h-3.5 w-3.5" />, completion: <ShieldCheck className="h-3.5 w-3.5" />, invoice: <Receipt className="h-3.5 w-3.5" />,
  payment: <DollarSign className="h-3.5 w-3.5" />,
};

export const severityStyle: Record<RiskAlert["severity"], string> = {
  high: "border-rose-200 bg-rose-50",
  medium: "border-amber-200 bg-amber-50",
  low: "border-[#9EC8EF] bg-[#EAF5FF]",
};

export const money = (n?: number) => n == null ? "" : `$${Math.round(n).toLocaleString()}`;

interface Props {
  job: SchedulingEvent;
  canEdit: boolean;
  /** Bumped by the parent to scroll the proof timeline into view. */
  focusTimeline?: boolean;
}

/**
 * Owner Protection inside a Job: protection score, what proof is in place
 * or missing (each with a one-tap fix), this job's risk alerts, and the
 * Proof Timeline with the Evidence Package builder.
 */
export const OwnerProtectionPanel: React.FC<Props> = ({ job, canEdit, focusTimeline }) => {
  const view = useJobProtection(job);
  const { run, addPhotos } = useProtectionActions();
  const [showTimeline, setShowTimeline] = useState(!!focusTimeline);
  const [busy, setBusy] = useState(false);
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);
  if (!view) return null;
  const { protection, alerts, timeline, sources } = view;

  const act = async (action: ProtectionAction) => {
    if (action.kind === "add_before_photos") return beforeInput.current?.click();
    if (action.kind === "add_after_photos") return afterInput.current?.click();
    if (action.kind === "review_job" || action.kind === "open_tracking") {
      document.getElementById("job-tracking-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setBusy(true);
    try {
      await run(action, job, { protection, timeline, sources });
    } finally {
      setBusy(false);
    }
  };

  const onPhotos = (when: "Before" | "After") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) {
      setBusy(true);
      try { await addPhotos(job, files, when); } finally { setBusy(false); }
    }
    e.target.value = "";
  };

  const writeAction = (a?: ProtectionAction) => !!a && (canEdit || a.kind === "review_job" || a.kind === "open_tracking" || a.kind === "view_invoice");

  return (
    <section id="owner-protection-section" className="rounded-2xl border border-[#9EC8EF] bg-white p-4 scroll-mt-28">
      <input ref={beforeInput} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={onPhotos("Before")} />
      <input ref={afterInput} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={onPhotos("After")} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-xs font-black uppercase text-[#1F3557]"><ShieldCheck className="mr-1 inline h-4 w-4" />Owner Protection</h4>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${levelStyle[protection.level]}`}>{protection.level}</span>
          <span className="text-sm font-black text-[#1F3557]">{protection.score}%</span>
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100">
        <div className={`h-full rounded-full ${protection.score >= 85 ? "bg-emerald-500" : protection.score >= 60 ? "bg-amber-400" : "bg-rose-500"}`} style={{ width: `${protection.score}%` }} />
      </div>
      {protection.approvedValue > 0 && (
        <p className="mt-2 text-[10px] font-semibold text-[#5E7393]">
          Approved amount {money(protection.approvedValue)}
          {(() => {
            const signed = protection.changeOrders.filter(c => ["Signed", "Accepted", "Completed"].includes(c.status)).length;
            const waiting = protection.changeOrders.length - signed;
            return `${signed ? ` (incl. ${signed} signed change order${signed === 1 ? "" : "s"})` : ""}${waiting ? ` · ${waiting} change order${waiting === 1 ? "" : "s"} awaiting signature` : ""}`;
          })()}
        </p>
      )}

      {alerts.length > 0 && (
        <div className="mt-3 space-y-2">
          {alerts.map(alert => (
            <div key={alert.id} className={`rounded-xl border p-3 ${severityStyle[alert.severity]}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-black text-[#1F3557]"><AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-rose-600" />{alert.title}</p>
                {alert.amount != null && alert.amount > 0 && <span className="shrink-0 text-xs font-black text-rose-700">{money(alert.amount)}</span>}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-600">{alert.why}</p>
              {writeAction(alert.action) && (
                <button disabled={busy} onClick={() => void act(alert.action)} className="mt-2 rounded-lg bg-[#315C9F] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">{alert.action.label}</button>
              )}
            </div>
          ))}
        </div>
      )}

      <ul className="mt-3 divide-y divide-blue-50">
        {protection.checks.map(check => (
          <li key={check.id} className="flex items-start gap-2.5 py-2">
            <span className="mt-0.5 shrink-0">{statusIcon[check.status]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-[#1F3557]">{check.label} <span className="ml-1 text-[9px] font-black uppercase tracking-wide text-[#5E7393]">{statusLabel[check.status]}</span></p>
              <p className="text-[11px] leading-snug text-slate-500">{check.detail}</p>
            </div>
            {check.status !== "done" && check.status !== "na" && writeAction(check.action) && (
              <button disabled={busy} onClick={() => void act(check.action!)} className="shrink-0 rounded-lg border border-[#9EC8EF] bg-[#EAF5FF] px-2.5 py-1.5 text-[10px] font-bold text-[#315C9F] disabled:opacity-50">
                {check.action!.kind === "add_before_photos" || check.action!.kind === "add_after_photos" ? <Camera className="mr-1 inline h-3 w-3" /> : null}
                {check.action!.label}
              </button>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => beforeInput.current?.click()} className="rounded-lg border border-[#9EC8EF] bg-white px-3 py-1.5 text-[11px] font-bold text-[#315C9F] disabled:opacity-50"><Camera className="mr-1 inline h-3.5 w-3.5" />Before Photos</button>
          <button disabled={busy} onClick={() => afterInput.current?.click()} className="rounded-lg border border-[#9EC8EF] bg-white px-3 py-1.5 text-[11px] font-bold text-[#315C9F] disabled:opacity-50"><Camera className="mr-1 inline h-3.5 w-3.5" />After Photos</button>
          <button disabled={busy} onClick={() => void act({ kind: "create_change_order", label: "Create Change Order" })} className="rounded-lg border border-[#9EC8EF] bg-white px-3 py-1.5 text-[11px] font-bold text-[#315C9F] disabled:opacity-50"><PenLine className="mr-1 inline h-3.5 w-3.5" />Change Order</button>
        </div>
      )}

      <div id="proof-timeline-section" className="mt-4 border-t border-blue-100 pt-3 scroll-mt-28">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button onClick={() => setShowTimeline(v => !v)} className="text-xs font-black uppercase text-[#1F3557]">
            <History className="mr-1 inline h-4 w-4" />Proof Timeline <span className="font-bold text-[#5E7393]">({timeline.length})</span>
            {showTimeline ? <ChevronUp className="ml-1 inline h-4 w-4" /> : <ChevronDown className="ml-1 inline h-4 w-4" />}
          </button>
          <button disabled={busy} onClick={() => void act({ kind: "build_package", label: "Build Evidence Package" })} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
            <FileText className="mr-1 inline h-3.5 w-3.5" />{busy ? "Working…" : "Build Evidence Package"}
          </button>
        </div>
        {showTimeline && (
          <ol className="mt-3 space-y-2.5">
            {timeline.length === 0 && <li className="text-xs text-slate-400">Nothing recorded yet. Estimates, clock-ins, photos, signatures, messages, invoices and payments for this job will appear here automatically.</li>}
            {timeline.map(event => (
              <li key={event.id} className="flex gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EAF5FF] text-[#315C9F]">{timelineIcon[event.kind]}</span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700">{event.title}</p>
                  {event.detail && <p className="line-clamp-2 text-[11px] text-slate-500">{event.detail}</p>}
                  <p className="text-[9px] text-slate-400">{new Date(event.at).toLocaleString()}{event.by ? ` · ${event.by}` : ""}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
};

export default OwnerProtectionPanel;
