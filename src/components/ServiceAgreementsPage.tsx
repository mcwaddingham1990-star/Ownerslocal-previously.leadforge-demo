import React, { useMemo, useState } from "react";
import { Plus, Search, Calendar, CheckCircle2, AlertTriangle, FileText, ChevronRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { hasEffectivePermission } from "../types/permissions";
import type { Membership } from "../types/membership";
import type { SchedulingEvent, WorkOrder } from "../types/domain";
import type { BuildJobPrefill } from "../types/generatedPdf";
import { MembershipBuilder } from "./MembershipBuilder";
import { BuildJobModal } from "./BuildJobModal";
import { WorkOrderBuilder } from "./WorkOrderBuilder";
import { agreementVisitStats, addDaysIso, isAgreementExpiringSoon, isVisitDueSoon } from "../lib/serviceAgreements";

const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const STATUSES: Membership["status"][] = ["Active", "Draft", "Paused", "Canceled", "Expired"];

const statusStyle: Record<string, string> = {
  Active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Draft: "border-slate-200 bg-slate-50 text-slate-600",
  Paused: "border-amber-200 bg-amber-50 text-amber-700",
  Canceled: "border-rose-200 bg-rose-50 text-rose-700",
  Expired: "border-slate-200 bg-slate-100 text-slate-500"
};
const StatusBadge = ({ status }: { status: string }) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${statusStyle[status] || statusStyle.Draft}`}>{status}</span>;

const billingLabel = (m: Membership) => m.billingFrequency === "one_time" ? "one time" : m.billingFrequency === "custom" ? `every ${m.customBillingDays || 30} days` : m.billingFrequency;

/** Same term length again, starting the day after the current term ends (or today). */
function renewalDates(m: Membership): { startDate: string; endDate: string } {
  const today = todayStr();
  const startDate = m.endDate && m.endDate >= today ? addDaysIso(m.endDate, 1) : today;
  let months = 12;
  if (m.startDate && m.endDate) {
    const s = new Date(`${m.startDate}T12:00:00Z`), e = new Date(`${m.endDate}T12:00:00Z`);
    months = Math.max(1, Math.round((e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + (e.getUTCDate() - s.getUTCDate()) / 30));
  }
  const end = new Date(`${startDate}T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + months);
  end.setUTCDate(end.getUTCDate() - 1);
  return { startDate, endDate: end.toISOString().slice(0, 10) };
}

/**
 * Service Agreements -- one table of every Membership/Service Agreement,
 * built on the existing memberships collection, Membership Builder, Build
 * Job and Work Order forms. Visits left / next visit are derived from the
 * agreement's linked Jobs and Work Orders (lib/serviceAgreements.ts).
 */
export const ServiceAgreementsPage: React.FC = () => {
  const { loggedInUser, simulatedRole } = useAuth();
  const { memberships, setMemberships, workOrders, schedulingEvents } = useDomainData();
  const { logOperationalEvent, triggerNotification } = useNavTelemetry();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const actor = loggedInUser?.name || loggedInUser?.email || activeRole;
  const isOwner = activeRole.trim().toLowerCase() === "owner";
  const canEdit = simulatedRole
    ? /owner|manager|admin|dispatch|scheduler|supervisor/i.test(activeRole)
    : isOwner || hasEffectivePermission(loggedInUser?.granularPermissions, loggedInUser?.permissions, "memberships", "edit");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [quickFilter, setQuickFilter] = useState<"" | "due" | "expiring">("");
  const [builder, setBuilder] = useState<{ editing: Membership | null; activityLabel?: string } | null>(null);
  const [jobModal, setJobModal] = useState<{ editingJob: SchedulingEvent | null; prefill: BuildJobPrefill | null } | null>(null);
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrder | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "cancel" | "extra_visit"; agreement: Membership } | null>(null);

  const today = todayStr();
  const rows = useMemo(() => memberships.map(m => {
    const stats = agreementVisitStats(m, workOrders, schedulingEvents);
    return { m, stats, dueSoon: m.status === "Active" && isVisitDueSoon(stats.nextVisitDate, today), expiring: isAgreementExpiringSoon(m, today) };
  }).sort((a, b) => (a.stats.nextVisitDate || "9999").localeCompare(b.stats.nextVisitDate || "9999")), [memberships, workOrders, schedulingEvents, today]);

  const stats = {
    active: rows.filter(r => r.m.status === "Active").length,
    due: rows.filter(r => r.dueSoon).length,
    expiring: rows.filter(r => r.expiring).length,
    total: rows.length
  };

  const q = search.trim().toLowerCase();
  const visibleRows = rows.filter(r => {
    if (statusFilter !== "All" && r.m.status !== statusFilter) return false;
    if (quickFilter === "due" && !r.dueSoon) return false;
    if (quickFilter === "expiring" && !r.expiring) return false;
    if (!q) return true;
    return [r.m.customerName, r.m.planName, r.m.membershipNumber, r.m.address, r.m.customerPhone].some(v => (v || "").toLowerCase().includes(q));
  });

  const scheduleVisit = (m: Membership, allowExtra = false) => {
    if (m.status !== "Active") {
      triggerNotification(`This agreement is ${m.status}. Set it to Active before scheduling a visit.`);
      return;
    }
    const s = agreementVisitStats(m, workOrders, schedulingEvents);
    // One open visit at a time: reschedule the booked one instead of
    // creating a second visit for the same agreement.
    if (s.openVisit) {
      if (s.openVisit.kind === "job") {
        const job = schedulingEvents.find(e => e.id === s.openVisit!.id) || null;
        if (job) { setJobModal({ editingJob: job, prefill: null }); return; }
      } else {
        const wo = workOrders.find(w => w.id === s.openVisit!.id) || null;
        if (wo) { setEditingWorkOrder(wo); return; }
      }
    }
    if (s.remaining === 0 && !allowExtra) {
      setConfirm({ kind: "extra_visit", agreement: m });
      return;
    }
    const equipment = (m.coveredEquipment || []).map(eq => [eq.type, eq.manufacturer, eq.model].filter(Boolean).join(" ") + (eq.location ? ` (${eq.location})` : ""));
    const services = (m.includedServices || []).map(sv => sv.description);
    setJobModal({
      editingJob: null,
      prefill: {
        customerId: m.customerId || undefined,
        customerName: m.customerName || "",
        customerPhone: m.customerPhone,
        customerEmail: m.customerEmail,
        customerAddress: m.address,
        title: `${m.planName} — Maintenance Visit`,
        description: [
          `Service Agreement ${m.membershipNumber || ""}`.trim(),
          services.length ? `Services: ${services.join(", ")}` : "",
          equipment.length ? `Equipment: ${equipment.join("; ")}` : ""
        ].filter(Boolean).join("\n"),
        // Included in the agreement's price -- editable if this visit is billed extra.
        budget: 0,
        sourceMembershipId: m.id
      }
    });
  };

  const renew = (m: Membership) => {
    const dates = renewalDates(m);
    setBuilder({
      editing: { ...m, ...dates, previousStartDate: m.startDate, status: "Active", nextMaintenanceDate: m.status === "Active" ? m.nextMaintenanceDate : undefined, nextPaymentDate: m.status === "Active" ? m.nextPaymentDate : undefined },
      activityLabel: "Agreement renewed"
    });
  };

  const cancelAgreement = (m: Membership) => {
    const now = new Date().toISOString();
    setMemberships(prev => prev.map(x => x.id === m.id ? {
      ...x,
      status: "Canceled",
      updatedAt: now,
      activity: [...(x.activity || []), { id: uid("act"), timestamp: now, action: "Agreement canceled", by: actor }]
    } : x));
    logOperationalEvent("Service Agreement Canceled", `${m.membershipNumber || ""} — ${m.planName}`, "📜");
    triggerNotification("Agreement canceled. No more visits or bills will be generated for it.");
  };

  const linkBtn = "font-bold text-[#315C9F] disabled:opacity-40";

  return <div className="space-y-5 animate-fade-in text-left">
    <div className="rounded-3xl border border-[#9EC8EF] bg-[#C7E3FA] p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#315C9F]">Jobs</p><h2 className="text-xl font-black text-[#1F3557]">Service Agreements</h2><p className="text-xs font-semibold text-[#5E7393]">Maintenance plans, their visits, and when they renew.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setQuickFilter(prev => prev === "due" ? "" : "due")} className={`rounded-xl border px-3 py-2 text-xs font-bold ${quickFilter === "due" ? "border-[#315C9F] bg-[#315C9F] text-white" : "border-[#9EC8EF] bg-[#EAF5FF] text-[#315C9F]"}`}><Calendar className="mr-1 inline h-4 w-4"/>Due Soon</button>
          {canEdit && <button onClick={() => setBuilder({ editing: null })} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white shadow"><Plus className="mr-1 inline h-4 w-4"/>New Agreement</button>}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ["Active", stats.active, CheckCircle2, statusFilter === "Active" && !quickFilter, () => { setQuickFilter(""); setStatusFilter(prev => prev === "Active" ? "All" : "Active"); }],
          ["Visits Due Soon", stats.due, Calendar, quickFilter === "due", () => { setStatusFilter("All"); setQuickFilter(prev => prev === "due" ? "" : "due"); }],
          ["Expiring Soon", stats.expiring, AlertTriangle, quickFilter === "expiring", () => { setStatusFilter("All"); setQuickFilter(prev => prev === "expiring" ? "" : "expiring"); }],
          ["All Agreements", stats.total, FileText, statusFilter === "All" && !quickFilter, () => { setStatusFilter("All"); setQuickFilter(""); }],
        ] as const).map(([label, value, Icon, isActive, onClick]) => <button key={label} onClick={onClick} className={`rounded-2xl border p-3 text-left transition ${isActive ? "border-[#315C9F] bg-[#C7E3FA] ring-2 ring-[#315C9F]" : "border-[#9EC8EF] bg-[#EAF5FF]"}`}><Icon className="h-4 w-4 text-[#4A86F7]"/><p className="mt-2 text-xl font-black text-[#1F3557]">{value}</p><p className="text-[9px] font-bold uppercase tracking-wide text-[#5E7393]">{label}</p></button>)}
      </div>
    </div>

    <div className="rounded-2xl border border-[#9EC8EF] bg-[#EAF5FF] p-3 shadow-sm">
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <label className="flex items-center gap-2 rounded-xl border border-[#9EC8EF] bg-white px-3"><Search className="h-4 w-4 text-[#5E7393]"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer, plan, agreement #, address, phone..." className="w-full bg-transparent py-2.5 text-xs outline-none"/></label>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-xl border border-[#9EC8EF] bg-white px-3 py-2 text-xs font-bold" aria-label="Status filter"><option>All</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
      </div>
    </div>

    {visibleRows.length === 0
      ? <div className="rounded-3xl border-2 border-dashed border-[#9EC8EF] bg-[#EAF5FF] p-12 text-center"><FileText className="mx-auto h-10 w-10 text-[#9EC8EF]"/><p className="mt-3 text-sm font-black text-[#1F3557]">{rows.length ? "No agreements match." : "No service agreements yet."}</p><p className="text-xs text-[#5E7393]">{rows.length ? "Clear your filters." : "Select New Agreement to create one."}</p></div>
      : <div className="overflow-x-auto rounded-2xl border border-[#9EC8EF] bg-white"><table className="w-full min-w-[900px] text-xs"><thead className="bg-[#C7E3FA] text-[9px] uppercase tracking-wide text-[#5E7393]"><tr>{["Agreement", "Customer", "Price", "Status", "Next Visit", "Visits Left", "Expires", ""].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr></thead><tbody>
        {visibleRows.map(({ m, stats: s, expiring }) => {
          const overdue = !!s.nextVisitDate && s.nextVisitDate < today && m.status === "Active";
          const closed = m.status === "Canceled" || m.status === "Expired";
          return <tr key={m.id} className="border-t border-blue-100 hover:bg-blue-50">
            <td className="px-4 py-3 font-black text-[#1F3557]">{m.membershipNumber || "—"}<p className="font-semibold text-[#5E7393]">{m.planName}</p></td>
            <td className="px-4 py-3">{m.customerName || "—"}{m.address && <p className="text-[10px] text-[#5E7393]">{m.address}</p>}</td>
            <td className="px-4 py-3 font-bold">${(Number(m.price) || 0).toLocaleString()}<p className="text-[10px] font-semibold text-[#5E7393]">{billingLabel(m)}</p></td>
            <td className="px-4 py-3"><StatusBadge status={m.status}/></td>
            <td className={`px-4 py-3 ${overdue ? "font-black text-rose-600" : ""}`}>{s.nextVisitDate || "—"}{overdue && <p className="text-[9px] uppercase">Overdue</p>}{s.openVisit && !overdue && <p className="text-[9px] uppercase text-[#5E7393]">Booked</p>}</td>
            <td className="px-4 py-3 font-bold">{s.remaining === null ? "No limit" : `${s.remaining} of ${m.visitsIncluded}`}</td>
            <td className={`px-4 py-3 ${expiring ? "font-black text-amber-700" : ""}`}>{m.endDate || "—"}{expiring && <p className="text-[9px] uppercase">Expiring soon</p>}</td>
            <td className="px-4 py-3"><div className="flex flex-wrap gap-3">
              <button onClick={() => setBuilder({ editing: m })} className={linkBtn}>{canEdit ? "View/Edit" : "View"} <ChevronRight className="inline h-4 w-4"/></button>
              {canEdit && <>
                <button onClick={() => scheduleVisit(m)} disabled={closed} className={linkBtn}>{s.openVisit ? "Reschedule Visit" : "Schedule Visit"}</button>
                <button onClick={() => renew(m)} className={linkBtn}>Renew</button>
                {!closed && <button onClick={() => setConfirm({ kind: "cancel", agreement: m })} className="font-bold text-rose-600">Cancel</button>}
              </>}
            </div></td>
          </tr>;
        })}
      </tbody></table></div>}

    {confirm && <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && setConfirm(null)}>
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-[#9EC8EF] bg-[#F5FAFF] p-5 text-center shadow-2xl">
        <h3 className="text-base font-black text-[#1F3557]">{confirm.kind === "cancel" ? "Cancel this agreement?" : "No visits left"}</h3>
        <p className="text-xs text-[#5E7393]">
          <b className="text-[#1F3557]">{confirm.agreement.planName}</b> — {confirm.agreement.customerName}<br/>
          {confirm.kind === "cancel"
            ? "No more visits or bills will be created for it. Its history stays saved."
            : "All included visits for this term are used. Schedule an extra visit anyway?"}
        </p>
        <div className="flex justify-center gap-2">
          <button onClick={() => setConfirm(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">{confirm.kind === "cancel" ? "Keep Agreement" : "Not Now"}</button>
          <button onClick={() => { const c = confirm; setConfirm(null); if (c.kind === "cancel") cancelAgreement(c.agreement); else scheduleVisit(c.agreement, true); }} className={`rounded-xl px-4 py-2 text-xs font-black text-white ${confirm.kind === "cancel" ? "bg-rose-600" : "bg-[#315C9F]"}`}>{confirm.kind === "cancel" ? "Cancel Agreement" : "Schedule Extra Visit"}</button>
        </div>
      </div>
    </div>}

    <MembershipBuilder isOpen={!!builder} onClose={() => setBuilder(null)} editingMembership={builder?.editing || null} activityLabel={builder?.activityLabel} />
    <BuildJobModal isOpen={!!jobModal} onClose={() => setJobModal(null)} editingJob={jobModal?.editingJob || null} prefill={jobModal?.prefill || null} />
    <WorkOrderBuilder isOpen={!!editingWorkOrder} onClose={() => setEditingWorkOrder(null)} editingWorkOrder={editingWorkOrder} />
  </div>;
};
