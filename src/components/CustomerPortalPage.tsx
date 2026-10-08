import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase, FileText, Calendar, CreditCard, FolderOpen, ShieldCheck, PlusCircle, MessageSquare,
  Loader2, AlertTriangle, CheckCircle2, Camera, X, Send, Download, FileSignature, Building2,
  ChevronLeft, ChevronRight, CalendarPlus
} from "lucide-react";
import {
  fetchPortalData, fetchPortalDocumentPdf, submitPortalEstimateDecision, submitPortalServiceRequest,
  submitPortalMessage, startInvoiceCheckout, createPortalAccountInvite, getCustomerPortalTokenFromUrl,
  type PortalData
} from "../lib/customerPortalClient";
import { buildRemoteSigningLink } from "../lib/remoteSigningClient";
import { downscaleImageToBase64 } from "../lib/imageCompression";
import { base64ToBytes } from "../lib/pdfExport";
import { auth } from "../firebase";
import BookServiceFlow from "./BookServiceFlow";
import { portalBookingApi } from "../lib/onlineBookingClient";

type Tab = "providers" | "jobs" | "estimates" | "appointments" | "invoices" | "documents" | "memberships" | "book" | "request" | "messages";

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "providers", label: "My Service Providers", icon: <Building2 className="w-4 h-4" /> },
  { id: "jobs", label: "My Jobs", icon: <Briefcase className="w-4 h-4" /> },
  { id: "estimates", label: "Estimates", icon: <FileText className="w-4 h-4" /> },
  { id: "appointments", label: "Appointments", icon: <Calendar className="w-4 h-4" /> },
  { id: "invoices", label: "Invoices", icon: <CreditCard className="w-4 h-4" /> },
  { id: "documents", label: "Documents", icon: <FolderOpen className="w-4 h-4" /> },
  { id: "memberships", label: "Memberships", icon: <ShieldCheck className="w-4 h-4" /> },
  { id: "book", label: "Book Service", icon: <CalendarPlus className="w-4 h-4" /> },
  { id: "request", label: "Request Service", icon: <PlusCircle className="w-4 h-4" /> },
  { id: "messages", label: "Messages", icon: <MessageSquare className="w-4 h-4" /> }
];

const BrandIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <img
    src="/branding/owners-sidebar-icon-1000043699.png"
    alt=""
    aria-hidden="true"
    className={`object-contain ${className}`}
  />
);

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-2xl border border-[#9EC8EF] bg-white p-4 shadow-sm">{children}</div>
);
const Badge: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = "bg-slate-100 text-slate-600" }) => (
  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${color}`}>{children}</span>
);
const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="py-10 text-center text-sm text-slate-400">{children}</p>
);

/**
 * The page a customer lands on when they open their Customer Portal link.
 * Public and unauthenticated -- gated only by the token in the URL -- so
 * it's mounted directly by App.tsx before the normal login gate, exactly
 * like RemoteSigningPage. Every action here hits server/customerPortal.ts,
 * which updates the same real records the staff app uses.
 */
export default function CustomerPortalPage({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("jobs");
  const [toast, setToast] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const bookingApi = useMemo(() => portalBookingApi(token), [token]);

  const reload = useCallback(async () => {
    const result = await fetchPortalData(token);
    setData(result);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void reload();
    const paid = new URLSearchParams(window.location.search).get("paid");
    if (paid) setToast("Payment received -- thank you!");
  }, [reload]);

  // This public token portal cannot safely subscribe to Firestore directly
  // without weakening security rules. Instead it live-refreshes from the
  // SAME Firestore records the business app uses every four seconds and
  // immediately whenever the homeowner returns to the tab/window.
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const timer = window.setInterval(refreshIfVisible, 4000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [reload]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EAF5FF] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-[#5E7393]">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-semibold">Loading your account…</p>
        </div>
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="min-h-screen bg-[#EAF5FF] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[#9EC8EF] p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h1 className="text-lg font-black text-[#1F3557] mb-1">Can't open this portal</h1>
          <p className="text-sm text-[#5E7393]">{data?.error || "Something went wrong."}</p>
        </div>
      </div>
    );
  }

  const activeTab = TABS.find(item => item.id === tab) || TABS[0];

  return (
    <div className="min-h-[100dvh] w-full bg-[#F5FAFF] p-2 sm:p-4 flex items-center justify-center">
      <div
        className="w-full h-[calc(100dvh-16px)] sm:h-[calc(100dvh-32px)] min-h-[650px] bg-[#EAF5FF] border border-[#9EC8EF] overflow-hidden flex flex-row shadow-2xl relative max-w-7xl mx-auto workspace-theme theme-light-basic"
        style={{ borderRadius: "24px" }}
      >
        {/* CUSTOMER PORTAL — same workspace shell as the main Owner'sLOCAL app. */}
        <aside
          style={{
            width: isSidebarCollapsed ? "72px" : "240px",
            backgroundColor: "#C7E3FA",
            transition: "width 0.2s ease-in-out"
          }}
          className="flex flex-col border-r border-[#9EC8EF] text-[#1F3557] shrink-0 relative"
        >
          <div className="p-4 border-b border-[#9EC8EF] flex flex-col gap-2 relative">
            <div className="flex items-center justify-between">
              {!isSidebarCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                    <BrandIcon className="w-full h-full" />
                  </div>
                  <span className="font-sans font-black tracking-tight text-sm text-[#1F3557] select-none truncate">OwnersLOCAL</span>
                  <span className="text-[7.5px] px-1.5 py-0.5 bg-[#4A86F7]/10 text-[#1F3557] rounded font-black uppercase tracking-wider select-none shrink-0">Customer</span>
                </div>
              ) : (
                <div className="mx-auto w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center">
                  <BrandIcon className="w-full h-full" />
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(v => !v)}
                style={{ width: "24px", height: "24px" }}
                className="absolute -right-3 top-5 bg-[#4A86F7] hover:bg-[#3977EE] border border-[#9EC8EF] rounded-full flex items-center justify-center text-white shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer z-20"
                title={isSidebarCollapsed ? "Expand Menu" : "Collapse Menu"}
              >
                {isSidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
              </button>
            </div>

            {!isSidebarCollapsed && (
              <div className="mt-2.5 px-0.5 animate-fade-in text-left min-w-0">
                <p className="font-sans font-black text-xs text-[#1F3557] tracking-wider uppercase leading-normal truncate">
                  {data.businessName || "Your Service Provider"}
                </p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-[#5E7393] truncate">
                  Customer Portal
                </p>
              </div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-none">
            {TABS.map(item => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`sidebar-nav-btn rounded-xl transition-all duration-200 cursor-pointer flex items-center relative group w-full ${
                    isSidebarCollapsed ? "justify-center p-2" : "px-3 py-2"
                  } ${
                    active
                      ? "sidebar-nav-btn-active bg-gradient-to-r from-[#2E7BEF] to-[#1485F4] text-white font-bold shadow-[0_0_10px_rgba(20,133,244,0.45)]"
                      : "hover:bg-[#BDDDF8] text-[#5E7393] hover:text-[#1F3557] border border-transparent"
                  }`}
                  title={item.label}
                >
                  {isSidebarCollapsed ? (
                    <span className={`shrink-0 select-none ${active ? "text-white" : "text-[#5E7393] group-hover:text-[#1F3557]"}`}>
                      {item.icon}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2.5 w-full min-w-0">
                      <span className={`shrink-0 select-none ${active ? "text-white" : "text-[#5E7393] group-hover:text-[#1F3557]"}`}>
                        {item.icon}
                      </span>
                      <span className={`font-sans font-bold tracking-wide text-xs flex-1 text-left truncate ${active ? "text-white" : "text-[#5E7393] group-hover:text-[#1F3557]"}`}>
                        {item.label}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="p-3 border-t border-[#9EC8EF] bg-transparent">
            <div className={`flex ${isSidebarCollapsed ? "flex-col items-center" : "items-center gap-2"} min-w-0 overflow-hidden`}>
              <div className="w-10 h-10 rounded-full bg-[#A9CEF5] text-[#1F3557] flex items-center justify-center text-xs font-black shrink-0 border border-[#9EC8EF] uppercase select-none">
                {(data.customer?.name || "CU").slice(0, 2)}
              </div>
              {!isSidebarCollapsed && (
                <div className="flex-1 min-w-0 animate-fade-in text-left">
                  <p className="text-xs font-sans font-extrabold text-[#1F3557] truncate leading-tight">{data.customer?.name || "Customer"}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <p className="text-[10px] font-mono text-[#1F3557]/60 truncate uppercase tracking-wider leading-none">Customer</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 min-h-[640px] overflow-hidden relative bg-[#EAF5FF]">
          <div className="px-5 py-3 border-b border-[#9EC8EF] bg-[#C7E3FA] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-bold text-[#5E7393] uppercase font-mono tracking-wider shrink-0">CURRENT PAGE:</span>
              <span className="text-xs font-extrabold text-[#1F3557] bg-[#EAF5FF] border border-[#9EC8EF] px-2.5 py-1 rounded-xl truncate">
                {activeTab.label}
              </span>
            </div>
            <span className="shrink-0 rounded-xl border border-emerald-300/70 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">● Live sync</span>
          </div>

          {toast && (
            <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-2.5 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {toast}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 pb-28 md:p-6 md:pb-10 space-y-6 scrollbar-thin">
            <div className="mx-auto w-full max-w-5xl space-y-3">
              {tab === "providers" && <ServiceProvidersTab data={data} token={token} onNotify={setToast} />}
              {tab === "jobs" && <JobsTab data={data} />}
              {tab === "estimates" && <EstimatesTab data={data} token={token} onNotify={setToast} onReload={reload} />}
              {tab === "appointments" && <AppointmentsTab data={data} />}
              {tab === "invoices" && <InvoicesTab data={data} token={token} onNotify={setToast} />}
              {tab === "documents" && <DocumentsTab data={data} token={token} />}
              {tab === "memberships" && <MembershipsTab data={data} />}
              {tab === "book" && <BookServiceFlow api={bookingApi} onBooked={() => void reload()} onViewAppointments={() => setTab("appointments")} />}
              {tab === "request" && <RequestServiceTab data={data} token={token} onNotify={setToast} />}
              {tab === "messages" && <MessagesTab data={data} token={token} onReload={reload} />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function ServiceProvidersTab({ data, token, onNotify }: { data: PortalData; token: string; onNotify: (message: string) => void }) {
  const [busy, setBusy] = useState(false);

  const createAccount = async () => {
    if (busy) return;
    setBusy(true);
    const result = await createPortalAccountInvite(token);
    setBusy(false);
    if (!result.ok || !result.code) {
      onNotify(result.error || "Could not prepare your free customer account. Try again.");
      return;
    }
    // Customer signup must start from a clean auth session. Otherwise an owner
    // previewing the portal is immediately restored into the business app.
    // Keep an explicit intent marker as a second guard for the auth listener.
    sessionStorage.setItem("ownerslocal_customer_auth_intent", "1");
    try {
      await auth.signOut();
    } catch (error) {
      console.warn("Could not clear the existing session before customer signup.", error);
    }
    window.location.href = `/?joinCode=${encodeURIComponent(result.code)}&customer=signup`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF5FF] text-[#315C9F]">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-wider text-[#5E7393]">Connected through this portal</p>
            <p className="truncate text-sm font-black text-[#1F3557]">{data.businessName || "Your Service Provider"}</p>
            <p className="mt-0.5 text-xs font-semibold text-[#5E7393]">Jobs, estimates, appointments, invoices, documents and messages on this link stay synced with this provider.</p>
          </div>
        </div>
      </Card>

      <div className="rounded-2xl border border-[#9EC8EF] bg-gradient-to-br from-white to-[#EAF5FF] p-4 shadow-sm">
        <p className="text-sm font-black text-[#1F3557]">One account. Every service provider.</p>
        <p className="mt-1 text-xs font-semibold leading-relaxed text-[#5E7393]">
          Create your free Owner'sLOCAL customer account to keep every connected service provider — and all of your jobs, appointments, estimates, invoices, documents and messages — together in one place.
        </p>
        <button
          type="button"
          onClick={() => void createAccount()}
          disabled={busy}
          className="mt-3 rounded-xl bg-[#315C9F] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white hover:bg-[#1F3557] disabled:opacity-50"
        >
          {busy ? "Preparing…" : "Create My Free Account"}
        </button>
      </div>
    </div>
  );
}

function JobsTab({ data }: { data: PortalData }) {
  const jobs = data.jobs || [];
  if (!jobs.length) return <Empty>No jobs yet.</Empty>;
  return (
    <>
      {jobs.map(j => (
        <Card key={j.id}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black text-[#1F3557]">{j.title || j.jobNumber || "Job"}</p>
              <p className="text-xs text-[#5E7393]">{j.date} · {j.startTime}–{j.endTime}</p>
            </div>
            <Badge color="bg-blue-100 text-blue-700">{j.status}</Badge>
          </div>
          {j.description && <p className="mt-2 text-xs text-slate-600">{j.description}</p>}
          {j.assignedEmployee && <p className="mt-2 text-xs text-[#5E7393]">Technician: {j.assignedEmployee}</p>}
          {j.location && <p className="text-xs text-[#5E7393]">{j.location}</p>}
          {typeof j.progress === "number" && (
            <div className="mt-3">
              <div className="h-2 rounded bg-blue-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${j.progress}%` }} /></div>
              <p className="mt-1 text-[10px] font-bold text-[#5E7393]">{j.progress}% complete</p>
            </div>
          )}
          {!!j.checklist?.length && (
            <div className="mt-3 space-y-1.5">
              {j.checklist.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${c.completed ? "bg-emerald-500 border-emerald-500" : "border-slate-300"}`}>
                    {c.completed && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </span>
                  <span className={c.completed ? "text-slate-400 line-through" : "text-slate-700"}>{c.label}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </>
  );
}

function EstimatesTab({ data, token, onNotify, onReload }: { data: PortalData; token: string; onNotify: (m: string) => void; onReload: () => void }) {
  const [busyId, setBusyId] = useState("");
  const estimates = data.estimates || [];
  if (!estimates.length) return <Empty>No estimates yet.</Empty>;

  const decide = async (id: string, decision: "Accepted" | "Declined") => {
    setBusyId(id);
    const result = await submitPortalEstimateDecision(token, id, decision);
    setBusyId("");
    if (!result.ok) { onNotify(result.error || "Could not submit your decision."); return; }
    onNotify(decision === "Accepted" ? "Estimate approved!" : "Estimate declined.");
    onReload();
  };

  return (
    <>
      {estimates.map(e => {
        const pending = e.status !== "Accepted" && e.status !== "Declined";
        return (
          <Card key={e.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-black text-[#1F3557]">{e.number}</p>
                <p className="text-xs text-[#5E7393]">Expires {e.expirationDate}</p>
              </div>
              <Badge color={e.status === "Accepted" ? "bg-emerald-100 text-emerald-700" : e.status === "Declined" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}>{e.status}</Badge>
            </div>
            {e.projectSpecifics && <p className="mt-2 text-xs text-slate-600">{e.projectSpecifics}</p>}
            {!!e.lineItems?.length && (
              <div className="mt-2 space-y-1">
                {e.lineItems.map(li => (
                  <div key={li.id} className="flex justify-between text-xs text-slate-600"><span>{li.quantity} × {li.description}</span><span>${(li.quantity * li.unitPrice).toFixed(2)}</span></div>
                ))}
              </div>
            )}
            <p className="mt-2 text-lg font-black text-[#1F3557]">${e.amount.toLocaleString()}</p>
            {pending && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button disabled={busyId === e.id} onClick={() => void decide(e.id, "Declined")} className="rounded-xl border border-rose-300 bg-rose-50 py-2.5 text-xs font-black text-rose-700 disabled:opacity-50">Decline</button>
                <button disabled={busyId === e.id} onClick={() => void decide(e.id, "Accepted")} className="rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white disabled:opacity-50">Approve</button>
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}

function AppointmentsTab({ data }: { data: PortalData }) {
  const appts = data.appointments || [];
  if (!appts.length) return <Empty>No upcoming appointments.</Empty>;
  return (
    <>
      {appts.map(a => (
        <Card key={a.id}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black text-[#1F3557]">{a.title || a.eventType}</p>
              <p className="text-xs text-[#5E7393]">{a.date} · {a.startTime}–{a.endTime}</p>
            </div>
            <Badge color="bg-blue-100 text-blue-700">{a.status}</Badge>
          </div>
          {a.assignedEmployee && <p className="mt-2 text-xs text-[#5E7393]">Technician: {a.assignedEmployee}</p>}
          {a.location && <p className="text-xs text-[#5E7393]">{a.location}</p>}
        </Card>
      ))}
    </>
  );
}

function InvoicesTab({ data, token, onNotify }: { data: PortalData; token: string; onNotify: (m: string) => void }) {
  const [busyId, setBusyId] = useState("");
  const invoices = data.invoices || [];
  if (!invoices.length) return <Empty>No invoices yet.</Empty>;

  const pay = async (id: string) => {
    setBusyId(id);
    const result = await startInvoiceCheckout(token, id);
    setBusyId("");
    if (!result.ok || !result.url) { onNotify(result.error || "Could not start payment."); return; }
    window.location.href = result.url;
  };

  return (
    <>
      {invoices.map(inv => (
        <Card key={inv.id}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black text-[#1F3557]">{inv.invoiceNumber}</p>
              <p className="text-xs text-[#5E7393]">Due {inv.dueDate}</p>
            </div>
            <Badge color={inv.balanceDue <= 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}>{inv.balanceDue <= 0 ? "Paid" : inv.status}</Badge>
          </div>
          <div className="mt-2 space-y-1">
            {inv.lineItems.map(li => (
              <div key={li.id} className="flex justify-between text-xs text-slate-600"><span>{li.quantity} × {li.description}</span><span>${(li.quantity * li.unitPrice).toFixed(2)}</span></div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-[#5E7393]"><span>Total</span><span>${inv.total.toFixed(2)}</span></div>
          <div className="flex justify-between text-xs text-[#5E7393]"><span>Paid</span><span>${inv.amountPaid.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm font-black text-[#1F3557]"><span>Balance Due</span><span>${inv.balanceDue.toFixed(2)}</span></div>
          {inv.balanceDue > 0 && (
            <button disabled={busyId === inv.id} onClick={() => void pay(inv.id)} className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white disabled:opacity-50">
              {busyId === inv.id ? "Starting checkout…" : "Pay Invoice"}
            </button>
          )}
        </Card>
      ))}
    </>
  );
}

function DocumentsTab({ data, token }: { data: PortalData; token: string }) {
  const [busyId, setBusyId] = useState("");
  const docs = data.documents || [];
  if (!docs.length) return <Empty>No documents yet.</Empty>;

  const download = async (docId: string, name: string) => {
    setBusyId(docId);
    const result = await fetchPortalDocumentPdf(token, docId);
    setBusyId("");
    if (!result.ok || !result.pdfBase64) return;
    const blob = new Blob([base64ToBytes(result.pdfBase64)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${name || "document"}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {docs.map(d => (
        <Card key={d.id}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black text-[#1F3557]">{d.name}</p>
              <p className="text-xs text-[#5E7393]">{d.date} · {d.folder}</p>
            </div>
            <Badge color={d.status === "Signed" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>{d.status}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {d.hasPdf && (
              <button disabled={busyId === d.id} onClick={() => void download(d.id, d.name)} className="flex items-center gap-1.5 rounded-xl border border-[#9EC8EF] bg-[#EAF5FF] px-3 py-2 text-xs font-bold text-[#315C9F] disabled:opacity-50">
                <Download className="w-3.5 h-3.5" /> Download PDF
              </button>
            )}
            {d.canSign && d.remoteToken && (
              <a href={buildRemoteSigningLink(d.remoteToken)} className="flex items-center gap-1.5 rounded-xl bg-[#315C9F] px-3 py-2 text-xs font-bold text-white">
                <FileSignature className="w-3.5 h-3.5" /> Sign Document
              </a>
            )}
          </div>
        </Card>
      ))}
    </>
  );
}

function MembershipsTab({ data }: { data: PortalData }) {
  const memberships = data.memberships || [];
  if (!memberships.length) return <Empty>No service agreements yet.</Empty>;
  return (
    <>
      {memberships.map(m => (
        <Card key={m.id}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-black text-[#1F3557]">{m.planName}</p>
            <Badge color={m.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>{m.status}</Badge>
          </div>
          {m.description && <p className="mt-1 text-xs text-slate-600">{m.description}</p>}
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#5E7393]">
            <div>Price: ${m.price.toFixed(2)} / {m.billingFrequency.replace("_", " ")}</div>
            <div>Next Service: {m.nextMaintenanceDate || "—"}</div>
            <div>Next Payment: {m.nextPaymentDate || "—"}</div>
            <div>Started: {m.startDate}</div>
          </div>
          {!!m.includedServices?.length && (
            <div className="mt-2 space-y-1 border-t border-blue-100 pt-2">
              {m.includedServices.map(s => <div key={s.id} className="text-xs text-slate-600">{s.quantity} × {s.description}</div>)}
            </div>
          )}
        </Card>
      ))}
    </>
  );
}

function RequestServiceTab({ data, token, onNotify }: { data: PortalData; token: string; onNotify: (m: string) => void }) {
  const [description, setDescription] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [address, setAddress] = useState(data.customer?.address || "");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const addPhoto = async (file: File) => {
    try {
      const { base64, mimeType } = await downscaleImageToBase64(file, 1200, 0.75);
      setPhotos(prev => prev.length >= 4 ? prev : [...prev, `data:${mimeType};base64,${base64}`]);
    } catch {
      onNotify("Couldn't read that photo. Try again.");
    }
  };

  const submit = async () => {
    if (!description.trim() || submitting) return;
    setSubmitting(true);
    const result = await submitPortalServiceRequest(token, { description: description.trim(), preferredDate, address, notes, photos });
    setSubmitting(false);
    if (!result.ok) { onNotify(result.error || "Could not submit your request."); return; }
    setDone(true);
  };

  if (done) {
    return (
      <Card>
        <div className="py-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-black text-[#1F3557]">Request sent!</p>
          <p className="mt-1 text-xs text-[#5E7393]">The business will reach out about scheduling this.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <label className="block mb-3">
        <span className="text-xs font-bold text-[#1F3557]">What do you need done? *</span>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-[#9EC8EF] px-3 py-2.5 text-sm" placeholder="Describe the job" />
      </label>
      <label className="block mb-3">
        <span className="text-xs font-bold text-[#1F3557]">Preferred date</span>
        <input type="date" value={preferredDate} onChange={e => setPreferredDate(e.target.value)} className="mt-1 w-full rounded-xl border border-[#9EC8EF] px-3 py-2.5 text-sm" />
      </label>
      <label className="block mb-3">
        <span className="text-xs font-bold text-[#1F3557]">Address / Location</span>
        <input value={address} onChange={e => setAddress(e.target.value)} className="mt-1 w-full rounded-xl border border-[#9EC8EF] px-3 py-2.5 text-sm" />
      </label>
      <label className="block mb-3">
        <span className="text-xs font-bold text-[#1F3557]">Notes</span>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-[#9EC8EF] px-3 py-2.5 text-sm" placeholder="Anything else to know" />
      </label>
      <div className="mb-4">
        <span className="text-xs font-bold text-[#1F3557]">Photos</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative h-16 w-16">
              <img src={p} className="h-16 w-16 rounded-lg object-cover border border-[#9EC8EF]" />
              <button onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1.5 -right-1.5 rounded-full bg-rose-500 text-white p-0.5"><X className="w-3 h-3" /></button>
            </div>
          ))}
          {photos.length < 4 && (
            <button onClick={() => fileRef.current?.click()} className="h-16 w-16 rounded-lg border-2 border-dashed border-[#9EC8EF] flex items-center justify-center text-[#315C9F]">
              <Camera className="w-5 h-5" />
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void addPhoto(f); e.target.value = ""; }} />
      </div>
      <button disabled={!description.trim() || submitting} onClick={() => void submit()} className="w-full rounded-xl bg-[#315C9F] py-3 text-sm font-black text-white disabled:opacity-40">
        {submitting ? "Sending…" : "Send Request"}
      </button>
    </Card>
  );
}

function MessagesTab({ data, token, onReload }: { data: PortalData; token: string; onReload: () => void }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const messages = useMemo(() => data.conversation?.messages || [], [data]);

  const send = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    const result = await submitPortalMessage(token, body.trim());
    setSending(false);
    if (result.ok) { setBody(""); onReload(); }
  };

  return (
    <Card>
      <div className="max-h-[50vh] space-y-2.5 overflow-y-auto">
        {messages.length === 0 && <Empty>Send a message and the business will get back to you.</Empty>}
        {messages.map(m => (
          <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${m.senderRole === "Customer" ? "ml-auto bg-[#315C9F] text-white" : "bg-[#EAF5FF] text-[#1F3557]"}`}>
            <p>{m.content}</p>
            <p className={`mt-1 text-[9px] ${m.senderRole === "Customer" ? "text-blue-100" : "text-[#5E7393]"}`}>{m.timestamp}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => e.key === "Enter" && void send()} placeholder="Type a message" className="flex-1 rounded-xl border border-[#9EC8EF] px-3 py-2.5 text-sm" />
        <button disabled={!body.trim() || sending} onClick={() => void send()} className="rounded-xl bg-[#315C9F] px-4 text-white disabled:opacity-40"><Send className="w-4 h-4" /></button>
      </div>
    </Card>
  );
}
