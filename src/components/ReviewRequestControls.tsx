import React, { useState } from "react";
import { Send, CheckCircle2, XCircle } from "lucide-react";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useAuth } from "../context/AuthContext";
import type { Customer } from "../types/domain";
import type { ReviewRequest } from "../types/reviewRequest";
import SendChoiceModal from "./SendChoiceModal";

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const STATUS_COLOR: Record<string, string> = {
  "Not Sent": "bg-slate-100 text-slate-600",
  Scheduled: "bg-blue-100 text-blue-700",
  Sent: "bg-amber-100 text-amber-800",
  Opened: "bg-indigo-100 text-indigo-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Canceled: "bg-rose-100 text-rose-700"
};

/**
 * The shared "Send Review Request" control every entry point (Customer,
 * Job, Invoice, Job Completion) drops in. One real ReviewRequest record
 * per Job (or per Customer when there's no job) -- reused for every send/
 * resend instead of creating a new row each time, which is what keeps an
 * automated request from ever duplicating for the same job.
 */
export interface ReviewRequestControlsProps {
  customer: Customer | null | undefined;
  jobId?: string;
  jobDescription?: string;
  invoiceId?: string;
}

export const ReviewRequestControls: React.FC<ReviewRequestControlsProps> = ({ customer, jobId, jobDescription, invoiceId }) => {
  const { reviewRequests, setReviewRequests, reviewAutomationSettings } = useDomainData();
  const { triggerNotification } = useNavTelemetry();
  const { loggedInUser } = useAuth();
  const [isSendOpen, setIsSendOpen] = useState(false);

  if (!customer) {
    return <p className="text-[10px] font-bold text-slate-400">No matching customer record -- link this to a customer first.</p>;
  }

  const existing = reviewRequests.find(r => jobId ? r.jobId === jobId : (r.customerId === customer.id && !r.jobId && !invoiceId));

  const ensureRequest = (): ReviewRequest => {
    if (existing) return existing;
    const now = new Date().toISOString();
    const created: ReviewRequest = {
      id: uid("review"),
      customerId: customer.id,
      customerName: customer.contact || customer.company,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      jobId,
      invoiceId,
      trigger: "manual",
      status: "Not Sent",
      message: reviewAutomationSettings.message,
      reviewLink: reviewAutomationSettings.reviewLink,
      createdAt: now,
      createdBy: loggedInUser?.email,
      activity: [{ id: uid("act"), timestamp: now, action: "Review request created", by: loggedInUser?.name || loggedInUser?.email || "Staff" }]
    };
    setReviewRequests(prev => [created, ...prev]);
    return created;
  };

  const openSend = () => {
    if (!reviewAutomationSettings.message.trim() || !reviewAutomationSettings.reviewLink.trim()) {
      triggerNotification("Set up your review message and link in Settings > Automate Reviews first.");
      return;
    }
    ensureRequest();
    setIsSendOpen(true);
  };

  const markSent = (channel: "email" | "sms") => {
    const now = new Date().toISOString();
    setReviewRequests(prev => prev.map(r => {
      if (r.jobId ? r.jobId !== jobId : !(r.customerId === customer.id && !r.jobId && !invoiceId)) return r;
      return {
        ...r,
        status: "Sent",
        sentAt: now,
        channel,
        sendCount: (r.sendCount || 0) + 1,
        activity: [...(r.activity || []), { id: uid("act"), timestamp: now, action: r.sendCount ? "Review request resent" : "Review request sent", by: loggedInUser?.name || loggedInUser?.email || "Staff" }]
      };
    }));
  };

  const setStatus = (status: "Completed" | "Canceled") => {
    if (!existing) return;
    const now = new Date().toISOString();
    setReviewRequests(prev => prev.map(r => r.id === existing.id ? {
      ...r,
      status,
      completedAt: status === "Completed" ? now : r.completedAt,
      canceledAt: status === "Canceled" ? now : r.canceledAt,
      activity: [...(r.activity || []), { id: uid("act"), timestamp: now, action: status === "Completed" ? "Marked review completed" : "Review request canceled", by: loggedInUser?.name || loggedInUser?.email || "Staff" }]
    } : r));
  };

  const status = existing?.status || "Not Sent";
  const messageBody = `${reviewAutomationSettings.message}\n\n${reviewAutomationSettings.reviewLink}`.trim();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${STATUS_COLOR[status] || "bg-slate-100 text-slate-600"}`}>{status}</span>
      <button type="button" onClick={openSend} className="flex items-center gap-1.5 rounded-xl bg-[#315C9F] px-3 py-2 text-xs font-bold text-white">
        <Send className="w-3.5 h-3.5" /> Send Review Request
      </button>
      {existing && status !== "Completed" && status !== "Canceled" && (
        <button type="button" onClick={() => setStatus("Completed")} className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" /> Mark Completed
        </button>
      )}
      {existing && status !== "Canceled" && status !== "Completed" && (
        <button type="button" onClick={() => setStatus("Canceled")} className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">
          <XCircle className="w-3.5 h-3.5" /> Cancel
        </button>
      )}

      <SendChoiceModal
        isOpen={isSendOpen}
        onClose={() => setIsSendOpen(false)}
        label={`Review Request${jobDescription ? ` — ${jobDescription}` : ""}`}
        phone={customer.phone}
        email={customer.email}
        subject="We'd love your feedback"
        body={messageBody}
        onSent={markSent}
      />
    </div>
  );
};
