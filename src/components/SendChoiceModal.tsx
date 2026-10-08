import React from "react";
import { Mail, MessageCircle, X } from "lucide-react";
import { composeEmail, composeSms } from "../lib/deviceHandoff";

export interface SendChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** What's being sent, shown in the card title -- e.g. "Estimate E-2186". */
  label: string;
  phone?: string;
  email?: string;
  /** Pre-filled subject/body. Left blank by default -- the point of this
   * button is handing off to the device's own text/email app with the
   * recipient already filled in when available. Without a saved contact, the
   * device app still opens with a blank recipient so the user can enter one. */
  subject?: string;
  body?: string;
  attachment?: { filename: string; mimeType: string; base64: string };
  /** Fires after the device app is handed off to, so the caller can e.g.
   * mark the record "Sent". */
  onSent?: (channel: "email" | "sms") => void;
}

/**
 * The universal "Send" popup: pick Text or Email, then hand off to the
 * device's own SMS/mail app (via sms:/mailto: links) with the recipient
 * pre-filled when known. If no recipient is known, it opens a blank email or
 * text instead of blocking the user. Reusable
 * across every Save/Generate PDF flow in the app -- Estimates, Invoices,
 * Jobs, the PDF Editor -- so each only needs to pass in a label + contact.
 */
function base64ToFile(attachment: { filename: string; mimeType: string; base64: string }) {
  const clean = attachment.base64.includes(",") ? attachment.base64.split(",").pop() || "" : attachment.base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], attachment.filename, { type: attachment.mimeType });
}

export default function SendChoiceModal({ isOpen, onClose, label, phone, email, subject, body, attachment, onSent }: SendChoiceModalProps) {
  if (!isOpen) return null;
  const hasPhone = !!phone?.trim();
  const hasEmail = !!email?.trim();
  const send = async (channel: "email" | "sms") => {
    if (attachment && navigator.share) {
      const file = base64ToFile(attachment);
      const sharePayload = { title: subject || label, text: body || "", files: [file] };
      if (!navigator.canShare || navigator.canShare(sharePayload)) {
        try {
          await navigator.share(sharePayload);
          onSent?.(channel);
          onClose();
          return;
        } catch (error) {
          if ((error as DOMException).name === "AbortError") return;
        }
      }
    }
    if (channel === "email") composeEmail({ to: email, subject, body });
    else composeSms({ to: phone, body });
    onSent?.(channel);
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full text-left" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-sm font-display font-black text-[#1F3557] uppercase tracking-wider">Send {label}</h3>
          <button type="button" onClick={onClose} className="text-[#5E7393] hover:text-[#1F3557] cursor-pointer shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-[#5E7393] font-semibold mb-4">{attachment ? "Text or email it? If your phone supports file sharing, the PDF is handed to your messaging or mail app with the message." : "Text or email it? This opens your phone's own messaging or mail app, ready to send."}</p>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => send("sms")}
            className="p-3.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1.5 text-center cursor-pointer transition-colors"
          >
            <MessageCircle className="w-5 h-5 text-[#315C9F]" />
            <span className="text-[10px] font-black uppercase text-[#1F3557]">Text</span>
            <span className="text-[9px] text-[#5E7393] truncate w-full">{hasPhone ? phone : "Enter number in text app"}</span>
          </button>
          <button
            type="button"
            onClick={() => send("email")}
            className="p-3.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1.5 text-center cursor-pointer transition-colors"
          >
            <Mail className="w-5 h-5 text-[#315C9F]" />
            <span className="text-[10px] font-black uppercase text-[#1F3557]">Email</span>
            <span className="text-[9px] text-[#5E7393] truncate w-full">{hasEmail ? email : "Enter email in mail app"}</span>
          </button>
        </div>
        {!hasPhone && !hasEmail && (
          <p className="text-[10px] text-[#5E7393] font-semibold mt-3">No contact selected. Choose Text or Email, then enter the recipient in your phone's app.</p>
        )}
      </div>
    </div>
  );
}
