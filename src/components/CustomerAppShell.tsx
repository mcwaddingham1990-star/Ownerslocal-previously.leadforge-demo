import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Briefcase, FileText, CalendarClock, Receipt, FolderOpen, ShieldCheck, ClipboardList, MessageSquare,
  Users, Search, LogOut, ChevronDown, Loader2, CheckCircle2, XCircle, ExternalLink, Send, Plus, Building2
} from "lucide-react";
import type { CustomerSession } from "../types/customerAccount";
import * as api from "../lib/customerAccountClient";

type TabId = "jobs" | "estimates" | "appointments" | "invoices" | "documents" | "memberships" | "request" | "messages" | "professionals" | "find";

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode; comingSoon?: boolean }> = [
  { id: "jobs", label: "My Jobs", icon: <Briefcase className="w-[18px] h-[18px]" /> },
  { id: "estimates", label: "Estimates", icon: <FileText className="w-[18px] h-[18px]" /> },
  { id: "appointments", label: "Appointments", icon: <CalendarClock className="w-[18px] h-[18px]" /> },
  { id: "invoices", label: "Invoices", icon: <Receipt className="w-[18px] h-[18px]" /> },
  { id: "documents", label: "Documents", icon: <FolderOpen className="w-[18px] h-[18px]" /> },
  { id: "memberships", label: "Memberships", icon: <ShieldCheck className="w-[18px] h-[18px]" /> },
  { id: "request", label: "Request Service", icon: <ClipboardList className="w-[18px] h-[18px]" /> },
  { id: "messages", label: "Messages", icon: <MessageSquare className="w-[18px] h-[18px]" /> },
  { id: "professionals", label: "Your Service Professionals", icon: <Users className="w-[18px] h-[18px]" /> },
  { id: "find", label: "Find a Service Professional", icon: <Search className="w-[18px] h-[18px]" />, comingSoon: true }
];

const fmtMoney = (n: number) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface CustomerAppShellProps {
  session: CustomerSession;
  onSignOut: () => void;
}

/**
 * The real Owner'sLOCAL Customer app shell -- rendered by App.tsx instead
 * of the business dashboard whenever a signed-in Firebase user has a
 * customer_accounts/{uid} doc (see App.tsx's onAuthStateChanged). Same
 * visual language as the business app's left nav (colors/shape), but this
 * menu is completely fixed -- no role-based visibility, nothing editable --
 * and every screen's data comes from /api/customer-accounts/* (see
 * src/lib/customerAccountClient.ts / server/customerAccounts.ts), which
 * re-derives which businesses this account may see from its own confirmed
 * Active relationships, never from anything chosen here.
 */
export const CustomerAppShell: React.FC<CustomerAppShellProps> = ({ session, onSignOut }) => {
  const [activeTab, setActiveTab] = useState<TabId>("jobs");
  const [professionals, setProfessionals] = useState<api.ServiceProfessionalCard[]>([]);
  const [pending, setPending] = useState<api.PendingConnection[]>([]);
  const [professionalsLoaded, setProfessionalsLoaded] = useState(false);
  const [businessFilter, setBusinessFilter] = useState<string>(""); // "" == All Businesses
  const [viewingBusinessId, setViewingBusinessId] = useState<string | null>(null);
  const [toast, setToast] = useState<string>("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 3500);
  }, []);

  const refreshProfessionals = useCallback(async () => {
    const result = await api.getServiceProfessionals();
    if (result.ok) {
      setProfessionals(result.professionals || []);
      setPending(result.pending || []);
    }
    setProfessionalsLoaded(true);
  }, []);

  useEffect(() => { refreshProfessionals(); }, [refreshProfessionals]);

  // A business's invite link (?joinCode=CODE) can land here for someone who
  // already has an account and is just now signing back in -- redeem it
  // once, then clean the URL so it doesn't re-fire on every reload.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get("joinCode");
    if (!joinCode) return;
    (async () => {
      const result = await api.redeemInviteCode(joinCode);
      if (result.ok) {
        showToast(result.businessName ? `Connection request sent to ${result.businessName} -- accept it below.` : "Connection request sent.");
        refreshProfessionals();
        setActiveTab("professionals");
      } else {
        showToast(result.error || "That invite link isn't valid.");
      }
      params.delete("joinCode");
      const rest = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeBusinesses = useMemo(() => professionals.map(p => ({ id: p.businessId, name: p.businessName })), [professionals]);

  const goToBusiness = (businessId: string) => setViewingBusinessId(businessId);

  return (
    <div className="w-full min-h-[100dvh] flex items-center justify-center p-2 sm:p-4" style={{ background: "linear-gradient(135deg,#EAF5FF,#C7E3FA)" }}>
      <div className="w-full h-[calc(100vh-16px)] sm:h-[calc(100vh-32px)] min-h-[500px] bg-[#EAF5FF] border border-[#9EC8EF] overflow-hidden flex flex-row shadow-2xl relative max-w-7xl mx-auto rounded-2xl">
        {/* LEFT NAV -- fixed, no role-based visibility, nothing editable */}
        <div className="hidden sm:flex flex-col w-[240px] shrink-0 border-r border-[#9EC8EF] text-[#1F3557]" style={{ backgroundColor: "#C7E3FA" }}>
          <div className="p-4 border-b border-[#9EC8EF]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#315C9F] flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <span className="font-sans font-black tracking-tight text-sm text-[#1F3557]">OwnersLOCAL</span>
            </div>
            <p className="mt-2.5 text-[10px] font-bold text-[#5E7393] truncate">{session.name || session.email}</p>
            <span className="mt-1 inline-block text-[7.5px] px-1.5 py-0.5 bg-[#4A86F7]/10 text-[#1F3557] rounded font-black uppercase tracking-wider">Customer Account</span>
          </div>

          <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
            {TABS.map(tab => {
              const isCurrent = activeTab === tab.id && !viewingBusinessId;
              const badgeCount = tab.id === "professionals" ? pending.length : 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setViewingBusinessId(null); }}
                  className={`w-full rounded-xl px-3 py-2 flex items-center gap-2.5 transition-all ${
                    isCurrent ? "bg-gradient-to-r from-[#2E7BEF] to-[#1485F4] text-white font-bold shadow-[0_0_10px_rgba(20,133,244,0.45)]" : "hover:bg-[#BDDDF8] text-[#5E7393] hover:text-[#1F3557]"
                  }`}
                >
                  <span className={`shrink-0 ${isCurrent ? "text-white" : ""}`}>{tab.icon}</span>
                  <span className="font-sans font-bold text-xs flex-1 text-left truncate">{tab.label}</span>
                  {tab.comingSoon && <span className="text-[7px] bg-[#1F3557]/10 px-1 py-0.5 rounded font-black uppercase">Soon</span>}
                  {badgeCount > 0 && <span className="flex h-2 w-2 rounded-full bg-red-500" />}
                </button>
              );
            })}
          </div>

          <div className="p-3 border-t border-[#9EC8EF]">
            <button onClick={onSignOut} className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#9EC8EF] bg-white/60 px-3 py-2 text-xs font-bold text-[#315C9F] hover:bg-white">
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>

        {/* Mobile top bar (menu becomes a horizontal scroller) */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="sm:hidden flex items-center justify-between gap-2 p-3 border-b border-[#9EC8EF] bg-[#C7E3FA]">
            <span className="font-black text-sm text-[#1F3557]">OwnersLOCAL</span>
            <button onClick={onSignOut} className="p-2 text-[#315C9F]"><LogOut className="w-4 h-4" /></button>
          </div>
          <div className="sm:hidden flex overflow-x-auto gap-1.5 p-2 border-b border-[#9EC8EF] bg-[#EAF5FF] scrollbar-none">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setViewingBusinessId(null); }}
                className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold whitespace-nowrap ${activeTab === tab.id && !viewingBusinessId ? "bg-[#315C9F] text-white" : "bg-white border border-[#9EC8EF] text-[#5E7393]"}`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Business filter bar */}
          {!viewingBusinessId && ["jobs", "estimates", "appointments", "invoices", "documents", "memberships"].includes(activeTab) && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#9EC8EF] bg-white/60">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#5E7393]">Showing:</span>
              <div className="relative">
                <select
                  value={businessFilter}
                  onChange={e => setBusinessFilter(e.target.value)}
                  className="appearance-none rounded-lg border border-[#9EC8EF] bg-white pl-3 pr-7 py-1.5 text-xs font-bold text-[#1F3557]"
                >
                  <option value="">All Businesses</option>
                  {activeBusinesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#5E7393] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {viewingBusinessId ? (
              <ViewBusinessPanel businessId={viewingBusinessId} onBack={() => setViewingBusinessId(null)} />
            ) : (
              <>
                {activeTab === "jobs" && <JobsTab businessFilter={businessFilter} />}
                {activeTab === "estimates" && <EstimatesTab businessFilter={businessFilter} onToast={showToast} />}
                {activeTab === "appointments" && <AppointmentsTab businessFilter={businessFilter} />}
                {activeTab === "invoices" && <InvoicesTab businessFilter={businessFilter} onToast={showToast} />}
                {activeTab === "documents" && <DocumentsTab businessFilter={businessFilter} />}
                {activeTab === "memberships" && <MembershipsTab businessFilter={businessFilter} />}
                {activeTab === "request" && <RequestServiceTab businesses={activeBusinesses} onToast={showToast} />}
                {activeTab === "messages" && <MessagesTab businesses={activeBusinesses} />}
                {activeTab === "professionals" && (
                  <ServiceProfessionalsTab
                    professionals={professionals}
                    pending={pending}
                    loaded={professionalsLoaded}
                    onToast={showToast}
                    onRefresh={refreshProfessionals}
                    onViewBusiness={goToBusiness}
                  />
                )}
                {activeTab === "find" && <FindProfessionalTab />}
              </>
            )}
          </div>
        </div>

        {toast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-[#1F3557] text-white text-xs font-bold px-4 py-2.5 shadow-2xl max-w-[90%] text-center">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const Loading: React.FC = () => (
  <div className="flex items-center justify-center py-16 text-[#5E7393]"><Loader2 className="w-5 h-5 animate-spin" /></div>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="text-center py-16 text-[#5E7393] text-xs font-semibold">{label}</div>
);

const ErrorState: React.FC<{ error: string }> = ({ error }) => (
  <div className="text-center py-16 text-rose-600 text-xs font-bold">{error}</div>
);

const BusinessTag: React.FC<{ name: string }> = ({ name }) => (
  <span className="inline-block text-[9px] font-black uppercase tracking-wide text-[#315C9F] bg-[#EAF5FF] border border-[#9EC8EF] rounded px-1.5 py-0.5">{name}</span>
);

// ---------------------------------------------------------------------------
// My Jobs
// ---------------------------------------------------------------------------

const JobsTab: React.FC<{ businessFilter: string }> = ({ businessFilter }) => {
  const [jobs, setJobs] = useState<api.TaggedJob[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setJobs(null);
    api.getJobs(businessFilter || undefined).then(r => r.ok ? setJobs(r.jobs || []) : setError(r.error || "Could not load your jobs."));
  }, [businessFilter]);

  if (error) return <ErrorState error={error} />;
  if (!jobs) return <Loading />;
  if (!jobs.length) return <EmptyState label="No jobs yet." />;

  return (
    <div className="space-y-3">
      {jobs.map(job => (
        <div key={job.id} className="rounded-2xl border border-[#9EC8EF] bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <BusinessTag name={job.businessName} />
              <p className="mt-1.5 text-sm font-black text-[#1F3557]">{job.title || job.jobType || "Job"}</p>
              {job.description && <p className="text-xs text-[#5E7393] mt-0.5">{job.description}</p>}
            </div>
            <span className="shrink-0 text-[9px] font-black uppercase tracking-wide px-2 py-1 rounded-lg bg-[#EAF5FF] text-[#315C9F] border border-[#9EC8EF]">{job.status}</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-3 text-[11px] font-bold text-[#5E7393]">
            <span>{job.date}</span>
            {job.startTime && <span>{job.startTime}{job.endTime ? `–${job.endTime}` : ""}</span>}
            {job.assignedEmployee && <span>Tech: {job.assignedEmployee}</span>}
          </div>
          {typeof job.progress === "number" && (
            <div className="mt-2.5">
              <div className="h-1.5 rounded-full bg-[#EAF5FF] overflow-hidden">
                <div className="h-full bg-[#315C9F]" style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------------

const EstimatesTab: React.FC<{ businessFilter: string; onToast: (m: string) => void }> = ({ businessFilter, onToast }) => {
  const [estimates, setEstimates] = useState<api.TaggedEstimate[] | null>(null);
  const [error, setError] = useState("");
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setEstimates(null);
    api.getEstimates(businessFilter || undefined).then(r => r.ok ? setEstimates(r.estimates || []) : setError(r.error || "Could not load your estimates."));
  }, [businessFilter]);

  useEffect(() => { load(); }, [load]);

  const decide = async (estimate: api.TaggedEstimate, decision: "Accepted" | "Declined", reason?: string) => {
    setBusyId(estimate.id);
    const result = await api.submitEstimateDecision(estimate.businessId, estimate.id, decision, reason);
    setBusyId(null);
    if (result.ok) {
      onToast(decision === "Accepted" ? "Estimate approved." : "Estimate declined.");
      setDecliningId(null);
      setDeclineReason("");
      load();
    } else {
      onToast(result.error || "Could not submit your decision.");
    }
  };

  if (error) return <ErrorState error={error} />;
  if (!estimates) return <Loading />;
  if (!estimates.length) return <EmptyState label="No estimates yet." />;

  return (
    <div className="space-y-3">
      {estimates.map(est => (
        <div key={est.id} className="rounded-2xl border border-[#9EC8EF] bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <BusinessTag name={est.businessName} />
              <p className="mt-1.5 text-sm font-black text-[#1F3557]">Estimate {est.number}</p>
              {est.projectSpecifics && <p className="text-xs text-[#5E7393] mt-0.5">{est.projectSpecifics}</p>}
            </div>
            <span className="shrink-0 text-sm font-black text-[#1F3557]">{fmtMoney(est.amount)}</span>
          </div>
          <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-[#5E7393]">Status: {est.status}</p>
          {est.declineReason && <p className="mt-1 text-xs text-rose-600 font-semibold">Your note: {est.declineReason}</p>}

          {(est.status === "Sent" || est.status === "Viewed" || est.status === "Pending") && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button disabled={busyId === est.id} onClick={() => decide(est, "Accepted")} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-2 text-xs font-black text-white">
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve
              </button>
              <button disabled={busyId === est.id} onClick={() => setDecliningId(decliningId === est.id ? null : est.id)} className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 px-3 py-2 text-xs font-black text-rose-700">
                <XCircle className="w-3.5 h-3.5" /> Decline
              </button>
            </div>
          )}
          {decliningId === est.id && (
            <div className="mt-2.5 space-y-2">
              <textarea
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                placeholder="Optional -- tell them why (price, timing, scope, etc.)"
                className="w-full rounded-xl border border-[#9EC8EF] p-2.5 text-xs"
                rows={2}
              />
              <button disabled={busyId === est.id} onClick={() => decide(est, "Declined", declineReason)} className="rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 px-3 py-2 text-xs font-black text-white">
                Send Decline
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

const AppointmentsTab: React.FC<{ businessFilter: string }> = ({ businessFilter }) => {
  const [appointments, setAppointments] = useState<api.TaggedAppointment[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setAppointments(null);
    api.getAppointments(businessFilter || undefined).then(r => r.ok ? setAppointments(r.appointments || []) : setError(r.error || "Could not load your appointments."));
  }, [businessFilter]);

  if (error) return <ErrorState error={error} />;
  if (!appointments) return <Loading />;
  if (!appointments.length) return <EmptyState label="No upcoming appointments." />;

  return (
    <div className="space-y-3">
      {appointments.map(a => (
        <div key={a.id} className="rounded-2xl border border-[#9EC8EF] bg-white p-4 flex items-center justify-between gap-3">
          <div>
            <BusinessTag name={a.businessName} />
            <p className="mt-1.5 text-sm font-black text-[#1F3557]">{a.title || a.eventType}</p>
            <p className="text-[11px] font-bold text-[#5E7393] mt-0.5">{a.date} · {a.startTime}{a.endTime ? `–${a.endTime}` : ""}</p>
          </div>
          <span className="shrink-0 text-[9px] font-black uppercase tracking-wide px-2 py-1 rounded-lg bg-[#EAF5FF] text-[#315C9F] border border-[#9EC8EF]">{a.status}</span>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

const InvoicesTab: React.FC<{ businessFilter: string; onToast: (m: string) => void }> = ({ businessFilter, onToast }) => {
  const [invoices, setInvoices] = useState<api.TaggedInvoice[] | null>(null);
  const [error, setError] = useState("");
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    setInvoices(null);
    api.getInvoices(businessFilter || undefined).then(r => r.ok ? setInvoices(r.invoices || []) : setError(r.error || "Could not load your invoices."));
  }, [businessFilter]);

  const pay = async (inv: api.TaggedInvoice) => {
    setPayingId(inv.id);
    const result = await api.createInvoiceCheckout(inv.businessId, inv.id);
    setPayingId(null);
    if (result.ok && result.url) window.location.href = result.url;
    else onToast(result.error || "Could not start checkout.");
  };

  if (error) return <ErrorState error={error} />;
  if (!invoices) return <Loading />;
  if (!invoices.length) return <EmptyState label="No invoices yet." />;

  return (
    <div className="space-y-3">
      {invoices.map(inv => (
        <div key={inv.id} className="rounded-2xl border border-[#9EC8EF] bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <BusinessTag name={inv.businessName} />
              <p className="mt-1.5 text-sm font-black text-[#1F3557]">Invoice {inv.invoiceNumber}</p>
              <p className="text-[11px] font-bold text-[#5E7393] mt-0.5">Due {inv.dueDate}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-black text-[#1F3557]">{fmtMoney(inv.total)}</p>
              <p className={`text-[10px] font-black uppercase ${inv.balanceDue > 0 ? "text-rose-600" : "text-emerald-600"}`}>{inv.balanceDue > 0 ? `${fmtMoney(inv.balanceDue)} due` : "Paid"}</p>
            </div>
          </div>
          {inv.balanceDue > 0 && (
            <button disabled={payingId === inv.id} onClick={() => pay(inv)} className="mt-3 flex items-center gap-1.5 rounded-xl bg-[#315C9F] hover:bg-[#1F3557] disabled:opacity-50 px-3 py-2 text-xs font-black text-white">
              {payingId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Pay Invoice
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const DocumentsTab: React.FC<{ businessFilter: string }> = ({ businessFilter }) => {
  const [documents, setDocuments] = useState<api.TaggedDocument[] | null>(null);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    setDocuments(null);
    api.getDocuments(businessFilter || undefined).then(r => r.ok ? setDocuments(r.documents || []) : setError(r.error || "Could not load your documents."));
  }, [businessFilter]);

  const open = async (doc: api.TaggedDocument) => {
    setOpeningId(doc.id);
    const result = await api.getDocumentPdf(doc.businessId, doc.id);
    setOpeningId(null);
    if (result.ok && result.pdfBase64) {
      const win = window.open("");
      if (win) win.document.write(`<iframe src="data:application/pdf;base64,${result.pdfBase64}" style="border:0;width:100%;height:100vh"></iframe>`);
    }
  };

  if (error) return <ErrorState error={error} />;
  if (!documents) return <Loading />;
  if (!documents.length) return <EmptyState label="No documents shared with you yet." />;

  return (
    <div className="space-y-2.5">
      {documents.map(doc => (
        <button key={doc.id} onClick={() => open(doc)} disabled={openingId === doc.id} className="w-full text-left rounded-2xl border border-[#9EC8EF] bg-white p-4 flex items-center justify-between gap-3 hover:border-[#4A86F7]">
          <div>
            <BusinessTag name={doc.businessName} />
            <p className="mt-1.5 text-sm font-black text-[#1F3557]">{doc.name}</p>
            <p className="text-[11px] font-bold text-[#5E7393] mt-0.5">{doc.date} · {doc.status}</p>
          </div>
          {openingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin text-[#5E7393]" /> : <ExternalLink className="w-4 h-4 text-[#5E7393] shrink-0" />}
        </button>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------

const MembershipsTab: React.FC<{ businessFilter: string }> = ({ businessFilter }) => {
  const [memberships, setMemberships] = useState<api.TaggedMembership[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setMemberships(null);
    api.getMemberships(businessFilter || undefined).then(r => r.ok ? setMemberships(r.memberships || []) : setError(r.error || "Could not load your memberships."));
  }, [businessFilter]);

  if (error) return <ErrorState error={error} />;
  if (!memberships) return <Loading />;
  if (!memberships.length) return <EmptyState label="No active memberships." />;

  return (
    <div className="space-y-3">
      {memberships.map(m => (
        <div key={m.id} className="rounded-2xl border border-[#9EC8EF] bg-white p-4">
          <BusinessTag name={m.businessName} />
          <div className="flex items-start justify-between gap-2 mt-1.5">
            <p className="text-sm font-black text-[#1F3557]">{m.planName}</p>
            <p className="text-sm font-black text-[#1F3557]">{fmtMoney(m.price)}<span className="text-[10px] font-bold text-[#5E7393]">/{m.billingFrequency}</span></p>
          </div>
          {m.description && <p className="text-xs text-[#5E7393] mt-1">{m.description}</p>}
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold text-[#5E7393]">
            {m.nextMaintenanceDate && <span>Next visit: {m.nextMaintenanceDate}</span>}
            {m.nextPaymentDate && <span>Next payment: {m.nextPaymentDate}</span>}
          </div>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Request Service
// ---------------------------------------------------------------------------

const RequestServiceTab: React.FC<{ businesses: Array<{ id: string; name: string }>; onToast: (m: string) => void }> = ({ businesses, onToast }) => {
  const [businessId, setBusinessId] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!businessId) { onToast("Choose which service professional this is for."); return; }
    if (!description.trim()) { onToast("Describe what you need done."); return; }
    setBusy(true);
    const result = await api.submitServiceRequest(businessId, { description, address, preferredDate, notes });
    setBusy(false);
    if (result.ok) {
      onToast("Request sent! They'll follow up with you.");
      setDescription(""); setAddress(""); setPreferredDate(""); setNotes("");
    } else {
      onToast(result.error || "Could not submit your request.");
    }
  };

  if (!businesses.length) return <EmptyState label="Connect with a service professional first (see Your Service Professionals) to request service." />;

  return (
    <div className="max-w-lg space-y-3">
      <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wide text-[#5E7393]">Service Professional</span>
        <select value={businessId} onChange={e => setBusinessId(e.target.value)} className="mt-1 w-full rounded-xl border border-[#9EC8EF] p-2.5 text-sm">
          <option value="">Choose one...</option>
          {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wide text-[#5E7393]">What do you need done?</span>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-[#9EC8EF] p-2.5 text-sm" />
      </label>
      <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wide text-[#5E7393]">Address</span>
        <input value={address} onChange={e => setAddress(e.target.value)} className="mt-1 w-full rounded-xl border border-[#9EC8EF] p-2.5 text-sm" />
      </label>
      <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wide text-[#5E7393]">Preferred Date</span>
        <input type="date" value={preferredDate} onChange={e => setPreferredDate(e.target.value)} className="mt-1 w-full rounded-xl border border-[#9EC8EF] p-2.5 text-sm" />
      </label>
      <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wide text-[#5E7393]">Notes</span>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-[#9EC8EF] p-2.5 text-sm" />
      </label>
      <button disabled={busy} onClick={submit} className="flex items-center gap-1.5 rounded-xl bg-[#315C9F] hover:bg-[#1F3557] disabled:opacity-50 px-4 py-2.5 text-xs font-black text-white">
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Send Request
      </button>
      <p className="text-[10px] text-[#5E7393] font-semibold">This sends a request to {businesses.find(b => b.id === businessId)?.name || "that business"} -- it does not create a job automatically. They'll follow up with you.</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const MessagesTab: React.FC<{ businesses: Array<{ id: string; name: string }> }> = ({ businesses }) => {
  const [businessId, setBusinessId] = useState("");
  const [messages, setMessages] = useState<api.TaggedMessage[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => { if (businesses.length && !businessId) setBusinessId(businesses[0].id); }, [businesses, businessId]);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    const result = await api.getMessages(businessId);
    setLoading(false);
    if (result.ok) setMessages(result.messages || []);
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!content.trim() || !businessId) return;
    setSending(true);
    const result = await api.sendMessage(businessId, content);
    setSending(false);
    if (result.ok) { setContent(""); load(); }
  };

  if (!businesses.length) return <EmptyState label="Connect with a service professional first to send a message." />;

  return (
    <div className="max-w-xl flex flex-col h-full">
      <select value={businessId} onChange={e => setBusinessId(e.target.value)} className="mb-3 rounded-xl border border-[#9EC8EF] p-2.5 text-sm font-bold">
        {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <div className="flex-1 min-h-[240px] rounded-2xl border border-[#9EC8EF] bg-white p-3 space-y-2 overflow-y-auto">
        {loading ? <Loading /> : messages.length === 0 ? <EmptyState label="No messages yet -- say hello." /> : messages.map(m => (
          <div key={m.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${m.senderRole === "Customer" ? "ml-auto bg-[#315C9F] text-white" : "bg-[#EAF5FF] text-[#1F3557]"}`}>
            <p>{m.content}</p>
            <p className={`text-[9px] mt-1 ${m.senderRole === "Customer" ? "text-white/70" : "text-[#5E7393]"}`}>{m.timestamp}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={content} onChange={e => setContent(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Type a message..." className="flex-1 rounded-xl border border-[#9EC8EF] p-2.5 text-sm" />
        <button disabled={sending} onClick={send} className="rounded-xl bg-[#315C9F] hover:bg-[#1F3557] disabled:opacity-50 px-3 py-2.5 text-white"><Send className="w-4 h-4" /></button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Your Service Professionals
// ---------------------------------------------------------------------------

const ServiceProfessionalsTab: React.FC<{
  professionals: api.ServiceProfessionalCard[];
  pending: api.PendingConnection[];
  loaded: boolean;
  onToast: (m: string) => void;
  onRefresh: () => void;
  onViewBusiness: (businessId: string) => void;
}> = ({ professionals, pending, loaded, onToast, onRefresh, onViewBusiness }) => {
  const [showJoin, setShowJoin] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const redeem = async () => {
    if (!code.trim()) return;
    setBusy(true);
    const result = await api.redeemInviteCode(code.trim());
    setBusy(false);
    if (result.ok) {
      onToast(result.businessName ? `Connection request sent to ${result.businessName}.` : "Connection request sent.");
      setCode(""); setShowJoin(false); onRefresh();
    } else {
      onToast(result.error || "That code isn't valid.");
    }
  };

  const respond = async (relationshipId: string, action: "accept" | "decline" | "remove") => {
    setRespondingId(relationshipId);
    const fn = action === "accept" ? api.acceptRelationship : action === "decline" ? api.declineRelationship : api.removeRelationship;
    const result = await fn(relationshipId);
    setRespondingId(null);
    if (result.ok) onRefresh();
    else onToast(result.error || "Could not update this connection.");
  };

  if (!loaded) return <Loading />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wide text-[#5E7393]">Connected Businesses</p>
        <button onClick={() => setShowJoin(s => !s)} className="flex items-center gap-1 text-xs font-black text-[#315C9F]"><Plus className="w-3.5 h-3.5" /> I have a code</button>
      </div>

      {showJoin && (
        <div className="rounded-2xl border border-[#9EC8EF] bg-white p-4 flex flex-wrap items-center gap-2">
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Enter invite code" className="flex-1 min-w-[160px] rounded-xl border border-[#9EC8EF] p-2.5 text-sm font-mono tracking-widest uppercase" />
          <button disabled={busy} onClick={redeem} className="rounded-xl bg-[#315C9F] hover:bg-[#1F3557] disabled:opacity-50 px-4 py-2.5 text-xs font-black text-white">Connect</button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[10px] font-black uppercase tracking-wide text-[#5E7393]">Waiting on your response</p>
          {pending.map(p => (
            <div key={p.relationshipId} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex items-center justify-between gap-3">
              <p className="text-sm font-black text-[#1F3557]">{p.businessName}</p>
              <div className="flex gap-2 shrink-0">
                <button disabled={respondingId === p.relationshipId} onClick={() => respond(p.relationshipId, "accept")} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 text-[10px] font-black text-white">Accept</button>
                <button disabled={respondingId === p.relationshipId} onClick={() => respond(p.relationshipId, "decline")} className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[10px] font-black text-rose-700">Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {professionals.length === 0 ? (
        <EmptyState label="No connected businesses yet. Ask your service professional for an invite link or code." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {professionals.map(p => (
            <div key={p.relationshipId} className="rounded-2xl border border-[#9EC8EF] bg-white p-4">
              <div className="flex items-center gap-2.5">
                {p.logo ? <img src={p.logo} alt="" className="w-9 h-9 rounded-lg object-cover" /> : <div className="w-9 h-9 rounded-lg bg-[#EAF5FF] flex items-center justify-center"><Building2 className="w-4 h-4 text-[#315C9F]" /></div>}
                <p className="text-sm font-black text-[#1F3557] flex-1">{p.businessName}</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[9px] font-bold uppercase text-[#5E7393]">Active Jobs</p><p className="text-sm font-black text-[#1F3557]">{p.activeJobs}</p></div>
                <div><p className="text-[9px] font-bold uppercase text-[#5E7393]">Next Visit</p><p className="text-[11px] font-black text-[#1F3557]">{p.nextAppointment || "--"}</p></div>
                <div><p className="text-[9px] font-bold uppercase text-[#5E7393]">Amount Due</p><p className={`text-sm font-black ${p.amountDue > 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmtMoney(p.amountDue)}</p></div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button onClick={() => onViewBusiness(p.businessId)} className="text-xs font-black text-[#315C9F]">View Business</button>
                <button disabled={respondingId === p.relationshipId} onClick={() => respond(p.relationshipId, "remove")} className="text-[10px] font-bold text-rose-600">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ViewBusinessPanel: React.FC<{ businessId: string; onBack: () => void }> = ({ businessId, onBack }) => {
  const [profile, setProfile] = useState<api.BusinessProfileView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getBusinessProfile(businessId).then(r => r.ok ? setProfile(r.profile || null) : setError(r.error || "Could not load this business."));
  }, [businessId]);

  return (
    <div className="max-w-lg">
      <button onClick={onBack} className="text-xs font-bold text-[#315C9F] mb-3">&larr; Back</button>
      {error && <ErrorState error={error} />}
      {!error && !profile && <Loading />}
      {profile && (
        <div className="rounded-2xl border border-[#9EC8EF] bg-white p-5">
          <div className="flex items-center gap-3">
            {profile.logo ? <img src={profile.logo} alt="" className="w-12 h-12 rounded-xl object-cover" /> : <div className="w-12 h-12 rounded-xl bg-[#EAF5FF] flex items-center justify-center"><Building2 className="w-5 h-5 text-[#315C9F]" /></div>}
            <div>
              <p className="text-base font-black text-[#1F3557]">{profile.name}</p>
              {profile.serviceArea && <p className="text-xs text-[#5E7393] font-semibold">{profile.serviceArea}</p>}
            </div>
          </div>
          {profile.description && <p className="mt-3 text-sm text-[#1F3557]">{profile.description}</p>}
          <div className="mt-4 space-y-1 text-xs font-semibold text-[#5E7393]">
            {profile.phone && <p>{profile.phone}</p>}
            {profile.email && <p>{profile.email}</p>}
            {profile.address && <p>{profile.address}</p>}
            {profile.hours && <p>Hours: {profile.hours}</p>}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center border-t border-[#9EC8EF] pt-3">
            <div><p className="text-[9px] font-bold uppercase text-[#5E7393]">Active Jobs</p><p className="text-sm font-black text-[#1F3557]">{profile.relationship.activeJobs}</p></div>
            <div><p className="text-[9px] font-bold uppercase text-[#5E7393]">Next Visit</p><p className="text-[11px] font-black text-[#1F3557]">{profile.relationship.nextAppointment || "--"}</p></div>
            <div><p className="text-[9px] font-bold uppercase text-[#5E7393]">Amount Due</p><p className="text-sm font-black text-[#1F3557]">{fmtMoney(profile.relationship.amountDue)}</p></div>
          </div>
        </div>
      )}
    </div>
  );
};

const FindProfessionalTab: React.FC = () => (
  <div className="max-w-md mx-auto text-center py-16">
    <div className="w-14 h-14 mx-auto rounded-2xl bg-[#EAF5FF] flex items-center justify-center mb-4"><Search className="w-6 h-6 text-[#315C9F]" /></div>
    <p className="text-lg font-black text-[#1F3557]">Find a Service Professional</p>
    <p className="mt-2 text-sm text-[#5E7393] font-semibold">Coming soon -- search and connect with new local businesses right from your account. For now, ask your service professional for an invite link or code under "Your Service Professionals."</p>
  </div>
);
