import React, { useMemo, useState } from "react";
import { AlertTriangle, Banknote, ChevronRight, Clock, FileWarning, PenLine, ShieldCheck, TrendingUp } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useAllProtection, useProtectionActions } from "../hooks/useOwnerProtection";
import { hasEffectivePermission } from "../types/permissions";
import { jobDisplayNumber, toMillis, type AlertType, type RiskAlert } from "../lib/ownerProtection";
import { levelStyle, money, severityStyle } from "./OwnerProtectionPanel";

type Category = "all" | "unbilled" | "overdue" | "change" | "proof" | "cost";

const CATEGORY_TYPES: Record<Exclude<Category, "all">, AlertType[]> = {
  unbilled: ["completed_not_invoiced"],
  overdue: ["invoice_overdue", "payment_disputed"],
  change: ["extra_work_no_change_order", "scope_change_message", "unsigned_change_order"],
  proof: ["closing_without_proof", "callback_risk"],
  cost: ["over_estimate", "labor_overrun"],
};

const CATEGORY_LABEL: Record<Category, string> = {
  all: "All", unbilled: "Unbilled work", overdue: "Overdue & disputed", change: "Change orders", proof: "Missing proof", cost: "Cost overruns",
};

/** Money at risk without double counting: one figure per job/invoice, the largest any of its alerts names. */
function moneyAtRisk(alerts: RiskAlert[]): number {
  const byEntity = new Map<string, number>();
  alerts.forEach(a => {
    if (!a.amount) return;
    const key = a.invoiceId ? `inv:${a.invoiceId}` : `job:${a.jobId}:${a.type === "over_estimate" || a.type === "labor_overrun" ? "cost" : "value"}`;
    byEntity.set(key, Math.max(byEntity.get(key) || 0, a.amount));
  });
  return [...byEntity.values()].reduce((s, v) => s + v, 0);
}

/**
 * Owner Protection / Money at Risk: every problem the system can detect
 * across jobs and invoices, what it's worth, why it matters, and the one
 * action that fixes it.
 */
export const OwnerProtectionPage: React.FC = () => {
  const { loggedInUser, simulatedRole } = useAuth();
  const { navigateToScreen } = useNavTelemetry();
  const { views, alerts } = useAllProtection();
  const { run, openJob } = useProtectionActions();
  const [category, setCategory] = useState<Category>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const canEdit = simulatedRole
    ? /owner|manager|admin/i.test(activeRole)
    : !loggedInUser?.isEmployee || hasEffectivePermission(loggedInUser?.granularPermissions, loggedInUser?.permissions, "jobs", "edit");

  const jobById = useMemo(() => new Map(views.map(v => [v.job.id, v])), [views]);
  const shown = category === "all" ? alerts : alerts.filter(a => CATEGORY_TYPES[category].includes(a.type));
  const sumOf = (types: AlertType[]) => alerts.filter(a => types.includes(a.type)).reduce((s, a) => s + (a.amount || 0), 0);

  // Open jobs plus anything completed in the last 60 days.
  const recentCutoff = Date.now() - 60 * 86400_000;
  const scored = views
    .filter(v => {
      const status = String(v.job.status).toLowerCase();
      if (status === "cancelled") return false;
      if (status !== "completed") return true;
      return (toMillis(v.job.completedAt) ?? toMillis(v.job.updatedAt) ?? 0) >= recentCutoff;
    })
    .sort((a, b) => a.protection.score - b.protection.score);

  const tiles = [
    { label: "Money at risk", value: money(moneyAtRisk(alerts)) || "$0", icon: AlertTriangle, tone: "text-rose-700" },
    { label: "Unbilled finished work", value: money(sumOf(CATEGORY_TYPES.unbilled)) || "$0", icon: Banknote, tone: "text-[#1F3557]" },
    { label: "Overdue receivables", value: money(sumOf(["invoice_overdue"])) || "$0", icon: Clock, tone: "text-[#1F3557]" },
    { label: "Unsigned change orders", value: money(sumOf(["unsigned_change_order"])) || "$0", icon: PenLine, tone: "text-[#1F3557]" },
    { label: "Jobs at risk", value: String(scored.filter(v => v.protection.level === "At Risk").length), icon: FileWarning, tone: "text-[#1F3557]" },
  ];

  const act = async (alert: RiskAlert) => {
    const view = alert.jobId ? jobById.get(alert.jobId) : undefined;
    setBusyId(alert.id);
    try {
      if (alert.action.kind === "build_package" && view) return openJob(view.job, "timeline");
      await run(alert.action, view?.job, { protection: view?.protection });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in text-left">
      <div className="rounded-3xl border border-[#9EC8EF] bg-[#C7E3FA] p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#315C9F]">Owner Protection</p>
        <h2 className="text-xl font-black text-[#1F3557]"><ShieldCheck className="mr-1 inline h-5 w-5" />Money at Risk</h2>
        <p className="text-xs font-semibold text-[#5E7393]">Problems Owner'sLOCAL found in your jobs, estimates, invoices and messages, and the one step that fixes each.</p>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          {tiles.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-2xl border border-[#9EC8EF] bg-[#EAF5FF] p-3">
              <Icon className="h-4 w-4 text-[#4A86F7]" />
              <p className={`mt-2 text-xl font-black ${tone}`}>{value}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-[#5E7393]">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(CATEGORY_LABEL) as Category[]).map(c => {
          const count = c === "all" ? alerts.length : alerts.filter(a => CATEGORY_TYPES[c].includes(a.type)).length;
          return (
            <button key={c} onClick={() => setCategory(c)} className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${category === c ? "border-[#315C9F] bg-[#315C9F] text-white" : "border-[#9EC8EF] bg-[#EAF5FF] text-[#315C9F]"}`}>
              {CATEGORY_LABEL[c]} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {shown.length === 0 && (
          <div className="rounded-3xl border-2 border-dashed border-[#9EC8EF] bg-[#EAF5FF] p-10 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 text-sm font-black text-[#1F3557]">Nothing at risk here.</p>
            <p className="text-xs text-[#5E7393]">New problems show up automatically as jobs, invoices and messages change.</p>
          </div>
        )}
        {shown.map(alert => {
          const view = alert.jobId ? jobById.get(alert.jobId) : undefined;
          const canRun = canEdit || ["review_job", "open_tracking", "view_invoice", "build_package"].includes(alert.action.kind);
          return (
            <div key={alert.id} className={`rounded-2xl border p-4 shadow-sm ${severityStyle[alert.severity]}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[#5E7393]">
                    {alert.severity === "high" ? "High priority" : alert.severity === "medium" ? "Needs attention" : "Heads up"}
                    {view ? ` · ${jobDisplayNumber(view.job)} · ${view.job.customer}` : ""}
                  </p>
                  <h3 className="mt-0.5 text-sm font-black text-[#1F3557]">{alert.title}</h3>
                  <p className="mt-1 text-xs leading-snug text-slate-600"><b className="text-slate-700">Why it matters:</b> {alert.why}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                  {alert.amount != null && alert.amount > 0 && <p className="text-lg font-black text-rose-700">{money(alert.amount)}</p>}
                  {canRun && (
                    <button disabled={busyId === alert.id} onClick={() => void act(alert)} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white shadow disabled:opacity-50">
                      {busyId === alert.id ? "Working…" : alert.action.label}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-[#9EC8EF] bg-white">
        <div className="flex items-center justify-between border-b border-[#E0EEFA] p-4">
          <h3 className="text-xs font-black uppercase text-[#1F3557]"><TrendingUp className="mr-1 inline h-4 w-4" />Job protection scores</h3>
          <button onClick={() => navigateToScreen("jobs")} className="text-xs font-bold text-[#315C9F]">All jobs <ChevronRight className="inline h-4 w-4" /></button>
        </div>
        {scored.length === 0 ? <p className="p-4 text-xs text-slate-400">No open or recently completed jobs.</p> : (
          <ul className="divide-y divide-blue-50">
            {scored.map(({ job, protection }) => (
              <li key={job.id}>
                <button onClick={() => openJob(job)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-[#F5FAFF]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-[#1F3557]">{jobDisplayNumber(job)} · {job.title || job.customType || "Service Job"}</p>
                    <p className="truncate text-[11px] text-[#5E7393]">{job.customer} · {job.status}{protection.missingCritical.length ? ` · ${protection.missingCritical.length} item${protection.missingCritical.length === 1 ? "" : "s"} to fix` : ""}</p>
                  </div>
                  <span className={`hidden rounded-full border px-2 py-0.5 text-[9px] font-black uppercase sm:inline ${levelStyle[protection.level]}`}>{protection.level}</span>
                  <span className="w-10 text-right text-sm font-black text-[#1F3557]">{protection.score}%</span>
                  <ChevronRight className="h-4 w-4 text-[#5E7393]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default OwnerProtectionPage;
