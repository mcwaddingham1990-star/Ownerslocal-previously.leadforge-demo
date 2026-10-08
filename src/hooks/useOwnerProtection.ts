import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import type { SchedulingEvent, TextMessage, DocumentItem } from "../types/domain";
import type { ProjectCompletionPlan } from "../types/completion";
import { computeJobCosting } from "../lib/jobCostingEngine";
import {
  buildProofTimeline, computeInvoiceAlerts, computeJobAlerts, computeJobProtection, invoiceTotal, jobDisplayNumber,
  sortAlerts, toMillis, type JobProtection, type ProtectionAction, type ProtectionConversation, type ProtectionSources, type RiskAlert, type TimelineEvent
} from "../lib/ownerProtection";
import { buildEstimatePdf, buildImagePagePdf, buildInvoicePdf, buildTextDocumentPdf, bytesToBase64, mergePdfs } from "../lib/pdfExport";
import { MAX_INLINE_BASE64_LENGTH } from "../lib/firestoreDocumentLimits";
import { buildJobInvoicePrefill } from "../lib/jobInvoiceHandoff";
import { resolveCustomerByIdOrName } from "../lib/resolveCustomer";

/** sessionStorage handoff: Jobs opens this job (and scrolls to Owner Protection) on its next mount. */
export const OPEN_JOB_KEY = "ownerslocal_open_job";

/**
 * Customer texts and job-linked conversations. Read with plain listeners
 * that fail silently: a login without Messages access simply contributes no
 * message evidence, rather than raising sync-error banners.
 */
function useMessageEvidence(businessId: string | undefined) {
  const [textMessages, setTextMessages] = useState<TextMessage[]>([]);
  const [conversations, setConversations] = useState<ProtectionConversation[]>([]);
  const [completionPlans, setCompletionPlans] = useState<ProjectCompletionPlan[]>([]);
  useEffect(() => {
    if (!businessId) return;
    const quiet = () => {};
    const unsubTexts = onSnapshot(
      query(collection(db, "text_messages"), where("businessId", "==", businessId)),
      snap => setTextMessages(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<TextMessage, "id">) }))),
      quiet
    );
    const unsubConvs = onSnapshot(
      query(collection(db, "conversations"), where("businessId", "==", businessId)),
      snap => setConversations(snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(c => c.jobId)
        .map(c => ({ id: c.id, title: c.title, type: c.type, jobId: c.jobId, messages: Array.isArray(c.messages) ? c.messages : [] }))),
      quiet
    );
    // Job Tracking plans need Jobs view access; without it there's simply no tracking evidence.
    const unsubPlans = onSnapshot(
      query(collection(db, "project_completion_plans"), where("businessId", "==", businessId)),
      snap => setCompletionPlans(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ProjectCompletionPlan, "id">) }))),
      quiet
    );
    return () => { unsubTexts(); unsubConvs(); unsubPlans(); };
  }, [businessId]);
  return { textMessages, conversations, completionPlans };
}

/** Everything Owner Protection reads, from the live (Firestore-synced) collections. */
export function useProtectionSources() {
  const { businessId } = useAuth();
  const data = useDomainData();
  const { textMessages, conversations, completionPlans } = useMessageEvidence(businessId);
  const jobs = useMemo(() => data.schedulingEvents.filter(e => e.eventType === "Job"), [data.schedulingEvents]);
  const workOrderIdsByJob = useMemo(() => {
    const map: Record<string, string[]> = {};
    data.workOrders.forEach(w => { if (w.sourceJobId) (map[w.sourceJobId] ||= []).push(w.id); });
    return map;
  }, [data.workOrders]);
  const base: Omit<ProtectionSources, "costing"> = useMemo(() => ({
    estimates: data.estimates, documents: data.documents, completionPlans, invoices: data.invoices,
    transactions: data.transactions, timeClockLogs: data.timeClockLogs, textMessages, conversations, workOrderIdsByJob
  }), [data.estimates, data.documents, completionPlans, data.invoices, data.transactions, data.timeClockLogs, textMessages, conversations, workOrderIdsByJob]);

  const sourcesFor = (job: SchedulingEvent): ProtectionSources => ({
    ...base,
    costing: computeJobCosting(job, data.estimates, data.timeClockLogs, data.employees, data.transactions, data.payrollWorkweekStart),
  });
  return { jobs, base, sourcesFor };
}

export interface JobProtectionView {
  job: SchedulingEvent;
  protection: JobProtection;
  alerts: RiskAlert[];
}

/** Protection + alerts for one job. */
export function useJobProtection(job: SchedulingEvent | null) {
  const { sourcesFor, base } = useProtectionSources();
  const data = useDomainData();
  return useMemo(() => {
    if (!job) return null;
    const sources = sourcesFor(job);
    const protection = computeJobProtection(job, sources);
    const alerts = sortAlerts([
      ...computeJobAlerts(job, protection, sources),
      ...computeInvoiceAlerts(data.invoices.filter(i => i.jobId === job.id), [job]),
    ]);
    const timeline = buildProofTimeline(job, sources);
    return { protection, alerts, timeline, sources };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, base, data.employees, data.payrollWorkweekStart]);
}

/** Every open/recent job's protection plus all alerts, for the Money at Risk dashboard. */
export function useAllProtection() {
  const { jobs, sourcesFor, base } = useProtectionSources();
  const data = useDomainData();
  return useMemo(() => {
    const views: JobProtectionView[] = jobs.map(job => {
      const sources = sourcesFor(job);
      const protection = computeJobProtection(job, sources);
      return { job, protection, alerts: computeJobAlerts(job, protection, sources) };
    });
    const alerts = sortAlerts([...views.flatMap(v => v.alerts), ...computeInvoiceAlerts(data.invoices, jobs)]);
    return { views, alerts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, base, data.employees, data.payrollWorkweekStart]);
}

// ------------------------------------------------------------------ actions

// The standard PDF fonts only cover WinAnsi (Latin-1 plus a few typographic
// marks). Job activity ("Status → Arrived") and customer texts (emoji) can
// contain anything, so map the common ones and drop what can't be drawn.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
export function pdfSafe(text: string): string {
  return text
    .replace(/[→⇒➜➔]/g, "->").replace(/[←⇐]/g, "<-").replace(/[✓✔]/g, "v").replace(/[✕✖✗]/g, "x").replace(/[≥]/g, ">=").replace(/[≤]/g, "<=")
    .replace(/\u00a0/g, " ")
    .split("").filter(ch => {
      const code = ch.charCodeAt(0);
      return ch === "\n" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch);
    }).join("");
}

const statusWord = (s: string) => ({ done: "In place", partial: "Partial", missing: "MISSING", pending: "Not yet", na: "Not needed" } as Record<string, string>)[s] || s;
const fmtTime = (ms: number) => new Date(ms).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The one-tap fixes behind every protection item and alert. Each reuses an
 * existing Owner'sLOCAL flow: estimates for change orders, the PDF Editor's
 * e-sign for signatures, Accounting's invoice form, Documents for storage.
 */
export function useProtectionActions() {
  const data = useDomainData();
  const { loggedInUser } = useAuth();
  const { navigateToScreen, triggerNotification, logOperationalEvent } = useNavTelemetry();
  const actor = loggedInUser?.name || loggedInUser?.email || "Owner";

  const openJob = (job: SchedulingEvent, focus: "protection" | "timeline" = "protection") => {
    sessionStorage.setItem(OPEN_JOB_KEY, JSON.stringify({ jobId: job.id, focus }));
    navigateToScreen("jobs");
  };

  const customerFor = (job: SchedulingEvent) => resolveCustomerByIdOrName(data.customers, job.customerId, job.customer) || undefined;

  const openForSignature = (opts: { filename: string; title: string; sourceType: "Estimate" | "Job"; sourceId: string; pdfBase64: string; job: SchedulingEvent }) => {
    const customer = customerFor(opts.job);
    data.setGeneratedPdfDraft({
      filename: opts.filename, title: opts.title, sourceType: opts.sourceType, sourceId: opts.sourceId,
      customerName: opts.job.customer, customerPhone: opts.job.customerPhone || customer?.phone, customerEmail: opts.job.customerEmail || customer?.email,
      representativeName: actor, lines: [], pdfBase64: opts.pdfBase64, autoCaptureSignatures: true, autoOpenSignSetup: true,
    });
    navigateToScreen("documents");
  };

  const signEstimate = async (job: SchedulingEvent, estimateId?: string) => {
    const est = data.estimates.find(e => e.id === estimateId);
    if (!est) return triggerNotification("That estimate no longer exists.");
    const bytes = await buildEstimatePdf(est, customerFor(job), data.businessProfile);
    openForSignature({ filename: `${est.number}.pdf`, title: `${est.changeOrderForJobId ? "Change Order" : "Estimate"} ${est.number}`, sourceType: "Estimate", sourceId: est.id, pdfBase64: bytesToBase64(bytes), job });
  };

  /** A completion sign-off (or scope agreement, before work starts) built from the job record. */
  const signJobDocument = async (job: SchedulingEvent, kind: "completion" | "scope") => {
    const number = jobDisplayNumber(job);
    const changeOrders = data.estimates.filter(e => e.changeOrderForJobId === job.id && e.status !== "Declined");
    const title = kind === "completion" ? `Job Completion Acknowledgment – ${number}` : `Scope of Work Agreement – ${number}`;
    const sections = [
      { heading: "Job", body: [`Job: ${number} – ${job.title || job.customType || "Service Job"}`, `Customer: ${job.customer}`, `Service address: ${job.location || job.customerAddress || "—"}`, `Scheduled: ${job.date} ${job.startTime || ""}`].join("\n") },
      { heading: kind === "completion" ? "Work performed" : "Work to be performed", body: job.description || job.notes || job.title || "As discussed with the customer." },
      ...(changeOrders.length ? [{ heading: "Change orders", body: changeOrders.map(c => `${c.number}: $${c.amount.toLocaleString()} (${c.status})`).join("\n") }] : []),
      {
        heading: "Acknowledgment",
        body: kind === "completion"
          ? "By signing below, the customer confirms the work described above (including any listed change orders) was completed, the work area was left in acceptable condition, and they have had the opportunity to inspect the work."
          : "By signing below, the customer authorizes the work described above. Any additional work will be priced and approved in writing as a change order before it is performed.",
      },
    ];
    const bytes = await buildTextDocumentPdf(pdfSafe(title), sections.map(sec => ({ heading: pdfSafe(sec.heading), body: pdfSafe(sec.body) })), data.businessProfile);
    openForSignature({ filename: `${number}-${kind === "completion" ? "completion" : "scope"}.pdf`, title, sourceType: "Job", sourceId: job.id, pdfBase64: bytesToBase64(bytes), job });
  };

  const createChangeOrder = (job: SchedulingEvent) => {
    const number = jobDisplayNumber(job);
    const customer = customerFor(job);
    data.setEstimatePrefill({
      customerName: job.customer, company: customer?.company, phone: job.customerPhone || customer?.phone,
      address: job.location || job.customerAddress, notes: `Change order for ${number}: additional work requested beyond the original scope.`,
      changeOrderForJobId: job.id, changeOrderJobLabel: number,
    });
    navigateToScreen("estimates");
  };

  const sendInvoice = (job: SchedulingEvent, approvedValue: number) => {
    const prefill = buildJobInvoicePrefill(job);
    if (approvedValue > 0) prefill.amount = approvedValue;
    sessionStorage.setItem("ownerslocal_pending_invoice_create", "1");
    sessionStorage.setItem("ownerslocal_pending_invoice_prefill", JSON.stringify(prefill));
    navigateToScreen("accounting");
  };

  /** Adds photos to Documents, linked to the job and tagged Before/After. */
  const addPhotos = async (job: SchedulingEvent, files: FileList | File[], when: "Before" | "After") => {
    const { downscaleImageToBase64 } = await import("../lib/imageCompression");
    const list = Array.from(files).filter(f => f.type.startsWith("image/"));
    const created: DocumentItem[] = [];
    for (const file of list) {
      const { base64, mimeType } = await downscaleImageToBase64(file, 1280, 0.72);
      const now = new Date();
      created.push({
        id: `doc_photo_${job.id}_${now.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
        name: `${when} – ${file.name}`, customer: job.customer, employee: actor, vendor: "None", job: job.id,
        type: "Progress Photos", folder: "Jobs", uploadedBy: actor, date: now.toISOString().slice(0, 10),
        size: `${Math.max(1, Math.round((base64.length * 3) / 4 / 1024))} KB`, status: "Completed", isFavorite: false, isArchived: false,
        notes: `${when} photo for ${jobDisplayNumber(job)}`, tags: ["Job Photo", `${when} Photos`], estimateId: "None", invoiceId: "None",
        lastModified: now.toISOString().replace("T", " ").substring(0, 19), url: `data:${mimeType};base64,${base64}`,
      });
    }
    if (!created.length) return triggerNotification("Choose one or more photos.");
    data.setDocuments(prev => [...prev, ...created]);
    data.setSchedulingEvents(prev => prev.map(j => j.id === job.id ? {
      ...j, updatedAt: new Date().toISOString(),
      activity: [...(j.activity || []), { id: `act_${Date.now()}`, timestamp: new Date().toISOString(), action: `${created.length} ${when.toLowerCase()} photo${created.length === 1 ? "" : "s"} added`, by: actor }],
    } : j));
    triggerNotification(`${created.length} ${when.toLowerCase()} photo${created.length === 1 ? "" : "s"} saved to Documents.`);
  };

  /**
   * Job Verification / Dispute Evidence Package: a cover report (summary,
   * protection checklist, proof timeline, money) followed by the real
   * records already on file -- signed estimate & change orders, signed job
   * documents, photos and the invoice -- merged into one PDF, saved to
   * Documents, and opened in the PDF Editor.
   */
  const buildEvidencePackage = async (job: SchedulingEvent, protection: JobProtection, timeline: TimelineEvent[], sources: ProtectionSources) => {
    triggerNotification("Building the evidence package…");
    const number = jobDisplayNumber(job);
    const customer = customerFor(job);
    const invoice = data.invoices.find(i => i.jobId === job.id && i.status !== "void");
    const costing = sources.costing;
    const coverSections = [
      { heading: "Job", body: [`Customer: ${job.customer}`, `Service address: ${job.location || job.customerAddress || "—"}`, `Phone: ${job.customerPhone || "—"}`, `Job: ${job.title || job.customType || "Service Job"}`, `Status: ${job.status}`, `Assigned: ${job.assignedEmployee || "—"}`, `Prepared: ${fmtTime(Date.now())} by ${actor}`].join("\n") },
      { heading: `Protection status: ${protection.level} (${protection.score}%)`, body: protection.checks.map(c => `[${statusWord(c.status)}] ${c.label} – ${c.detail}`).join("\n") },
      { heading: "Money", body: [`Approved amount (estimate + signed change orders): $${protection.approvedValue.toLocaleString()}`, costing ? `Recorded cost: $${Math.round(costing.totalCost).toLocaleString()} (${costing.laborHours.toFixed(1)} labor hours)` : "", invoice ? `Invoice ${invoice.invoiceNumber}: $${invoiceTotal(invoice).toLocaleString(undefined, { maximumFractionDigits: 2 })}, paid $${(invoice.amountPaid || 0).toLocaleString()}, status ${invoice.status}` : "No invoice yet."].filter(Boolean).join("\n") },
      { heading: "Proof timeline", body: timeline.length ? timeline.map(e => `${fmtTime(e.at)} – ${e.title}${e.by ? ` (${e.by})` : ""}${e.detail ? `\n    ${e.detail.slice(0, 220)}` : ""}`).join("\n") : "No timeline events recorded." },
      { heading: "About this package", body: "Every entry above comes from records Owner'sLOCAL captured as the work happened: signatures with their audit trail, time-clock punches with GPS, photo uploads, customer messages, invoices and payments. The documents and photos that follow are copies of those original records." },
    ];
    const cover = await buildTextDocumentPdf(pdfSafe(`Job Verification Package – ${number}`), coverSections.map(sec => ({ heading: pdfSafe(sec.heading), body: pdfSafe(sec.body) })), data.businessProfile);

    const pdfs: Array<Uint8Array | string> = [cover];
    const pdfOf = (d: DocumentItem) => (d as any).pdfBase64 || (String(d.url || "").startsWith("data:application/pdf") ? d.url : "");
    const included = new Set<string>();

    const estimateIds = [job.sourceEstimateId, ...protection.changeOrders.map(c => c.id)].filter(Boolean) as string[];
    for (const id of estimateIds) {
      const signedDoc = data.documents.filter(d => d.estimateId === id && pdfOf(d)).sort((a, b) => (toMillis(b.lastModified) || 0) - (toMillis(a.lastModified) || 0))
        .find(d => ["Signed", "Completed"].includes(String(d.status))) || data.documents.find(d => d.estimateId === id && pdfOf(d));
      if (signedDoc) { pdfs.push(pdfOf(signedDoc)); included.add(signedDoc.id); continue; }
      const est = data.estimates.find(e => e.id === id);
      if (est) pdfs.push(await buildEstimatePdf(est, customer, data.businessProfile));
    }
    const workOrderIds = sources.workOrderIdsByJob?.[job.id] || [];
    const jobDocs = data.documents.filter(d => !d.isArchived && (d.job === job.id || d.job === number || (d.workOrderId && workOrderIds.includes(d.workOrderId))));
    jobDocs.filter(d => !included.has(d.id) && pdfOf(d) && !/package/i.test(d.type || "")).forEach(d => { pdfs.push(pdfOf(d)); included.add(d.id); });
    for (const d of jobDocs.filter(d => String(d.url || "").startsWith("data:image/jpeg") || String(d.url || "").startsWith("data:image/png"))) {
      try {
        pdfs.push(await buildImagePagePdf(String(d.url), pdfSafe(`${d.name} – uploaded ${d.lastModified || d.date} by ${d.uploadedBy}`)));
      } catch { /* unreadable image: skip it, keep the rest */ }
    }
    if (invoice) pdfs.push(await buildInvoicePdf(invoice, customer, data.businessProfile));

    const merged = await mergePdfs(pdfs);
    const pdfBase64 = bytesToBase64(merged);
    const filename = `${number}-evidence-package.pdf`;
    const now = new Date();
    const docId = `doc_evidence_${job.id}_${now.getTime()}`;
    const record: DocumentItem = {
      id: docId, name: filename, customer: job.customer, employee: actor, vendor: "None", job: job.id,
      type: "Evidence Package", folder: "Jobs", uploadedBy: actor, date: now.toISOString().slice(0, 10),
      size: `${Math.max(1, Math.ceil(merged.length / 1024))} KB`, status: "Completed", isFavorite: false, isArchived: false,
      notes: `Job Verification / Dispute Evidence Package for ${number}: cover report, proof timeline and ${pdfs.length - 1} supporting record${pdfs.length === 2 ? "" : "s"}.`,
      tags: ["Owner Protection", "Evidence Package"], estimateId: "None", invoiceId: invoice?.id || "None",
      lastModified: now.toISOString().replace("T", " ").substring(0, 19),
    };
    const fitsInline = pdfBase64.length <= MAX_INLINE_BASE64_LENGTH;
    if (fitsInline) (record as any).pdfBase64 = pdfBase64;
    data.setDocuments(prev => [...prev, record]);
    if (!fitsInline) {
      // Too big to keep inline in Firestore (lots of photos): still hand the
      // owner the full file right now, and keep the record so it's findable.
      const blob = new Blob([merged], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      triggerNotification("The package is large, so it was downloaded to this device. Its Documents entry lists what it contains.");
    }
    logOperationalEvent("Evidence Package Built", `${filename} (${pdfs.length} sections)`, "🛡️");
    data.setGeneratedPdfDraft({
      filename, title: `Evidence Package ${number}`, sourceType: "Job", sourceId: job.id, documentId: fitsInline ? docId : undefined,
      customerName: job.customer, customerPhone: job.customerPhone, customerEmail: job.customerEmail, representativeName: actor, lines: [], pdfBase64,
    });
    navigateToScreen("documents");
  };

  const run = async (action: ProtectionAction, job: SchedulingEvent | undefined, ctx?: { protection?: JobProtection; timeline?: TimelineEvent[]; sources?: ProtectionSources }) => {
    try {
      switch (action.kind) {
        case "create_change_order": if (job) createChangeOrder(job); return;
        case "sign_estimate":
        case "sign_change_order": if (job) await signEstimate(job, action.targetId); return;
        case "sign_scope": if (job) await signJobDocument(job, "scope"); return;
        case "sign_completion": if (job) await signJobDocument(job, "completion"); return;
        case "send_invoice": if (job) sendInvoice(job, ctx?.protection?.approvedValue || 0); return;
        case "view_invoice": navigateToScreen("accounting"); return;
        case "build_package":
          if (job && ctx?.protection && ctx.timeline && ctx.sources) await buildEvidencePackage(job, ctx.protection, ctx.timeline, ctx.sources);
          else if (job) openJob(job, "timeline");
          return;
        case "add_before_photos":
        case "add_after_photos":
        case "open_tracking":
        case "review_job":
        default:
          if (job) openJob(job);
          return;
      }
    } catch (error) {
      console.error("Owner Protection action failed", error);
      triggerNotification("That action couldn't be completed. Please try again.");
    }
  };

  return { run, openJob, addPhotos, buildEvidencePackage, signJobDocument };
}
