import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase, FileText, Calendar, CreditCard, FolderOpen, ShieldCheck, PlusCircle, MessageSquare,
  Loader2, AlertTriangle, CheckCircle2, Camera, X, Send, Download, FileSignature
} from "lucide-react";
import {
  fetchPortalData, fetchPortalDocumentPdf, submitPortalEstimateDecision, submitPortalServiceRequest,
  submitPortalMessage, startInvoiceCheckout, getCustomerPortalTokenFromUrl,
  type PortalData
} from "../lib/customerPortalClient";
import { buildRemoteSigningLink } from "../lib/remoteSigningClient";
import { downscaleImageToBase64 } from "../lib/imageCompression";
import { base64ToBytes } from "../lib/pdfExport";

type Tab = "jobs" | "estimates" | "appointments" | "invoices" | "documents" | "memberships" | "request" | "messages";

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "jobs", label: "My Jobs", icon: <Briefcase className="w-4 h-4" /> },
  { id: "estimates", label: "Estimates", icon: <FileText className="w-4 h-4" /> },
  { id: "appointments", label: "Appointments", icon: <Calendar className="w-4 h-4" /> },
  { id: "invoices", label: "Invoices", icon: <CreditCard className="w-4 h-4" /> },
  { id: "documents", label: "Documents", icon: <FolderOpen className="w-4 h-4" /> },
  { id: "memberships", label: "Memberships", icon: <ShieldCheck className="w-4 h-4" /> },
  { id: "request", label: "Request Service", icon: <PlusCircle className="w-4 h-4" /> },
  { id: "messages", label: "Messages", icon: <MessageSquare className="w-4 h-4" /> }
];

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

  const reload = async () => {
    const result = await fetchPortalData(token);
    setData(result);
    setLoading(false);
  };
  useEffect(() => { void reload(); const paid = new URLSearchParams(window.location.search).get("paid"); if (paid) setToast("Payment received -- thank you!"); }, [token]);

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

  return (
    <div className="min-h-screen bg-[#EAF5FF] pb-10">
      <div className="sticky top-0 z-10 bg-[#1F3557] text-white px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#9EC8EF]">{data.businessName || "Your Service Provider"}</p>
        <h1 className="text-lg font-black">Hi, {data.customer?.name}</h1>
      </div>

      <div className="sticky top-[52px] z-10 bg-[#C7E3FA] border-b border-[#9EC8EF] overflow-x-auto">
        <div className="flex gap-1.5 px-3 py-2 min-w-max">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors ${tab === t.id ? "bg-[#315C9F] text-white" : "bg-white text-[#1F3557]"}`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {toast && (
        <div className="mx-4 mt-3 rounded-xl bg-emerald-100 border border-emerald-300 px-4 py-2.5 text-sm font-bold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {toast}
        </div>
      )}

      <div className="p-4 space-y-3 max-w-2xl mx-auto">
        {tab === "jobs" && <JobsTab data={data} />}
        {tab === "estimates" && <EstimatesTab data={data} token={token} onNotify={setToast} onReload={reload} />}
        {tab === "appointments" && <AppointmentsTab data={data} />}
        {tab === "invoices" && <InvoicesTab data={data} token={token} onNotify={setToast} />}
        {tab === "documents" && <DocumentsTab data={data} token={token} />}
        {tab === "memberships" && <MembershipsTab data={data} />}
        {tab === "request" && <RequestServiceTab data={data} token={token} onNotify={setToast} />}
        {tab === "messages" && <MessagesTab data={data} token={token} onReload={reload} />}
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
