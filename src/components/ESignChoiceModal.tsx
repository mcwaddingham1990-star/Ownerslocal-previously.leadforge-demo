import React, { useState } from "react";
import { Send, UserCheck, FileDown, X, Clock } from "lucide-react";
import { ESignLegalInfoModal, ESignComplianceFooter } from "./ESignLegalInfoModal";

export interface ESignChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** What's being signed, shown in the card title -- e.g. "Estimate E-2186". */
  label: string;
  onSendRemote: () => void;
  onSignInPerson: () => void;
  onSkip: () => void;
  skipLabel?: string;
  /** A caller-specific 5th option alongside the standard three, e.g. an
   * Invoice's "Send for Payment" -- rendered between Sign in Person and Skip. */
  extraAction?: { label: string; icon?: React.ReactNode; onClick: () => void };
  /** Omit to hide the Remind Me Later option entirely -- not every call site
   * (e.g. Invoice Send) wants it. */
  onRemindLater?: () => void;
}

/**
 * The front-door eSign choice: "Send for Remote eSign" / "Sign in Person" /
 * an optional extra action / "Skip" / an optional "Remind Me Later" -- reused
 * across Estimate Send, Estimate Convert to Job, and Invoice Send so the same
 * choice is offered the same way everywhere a document could be signed.
 *
 * The two signing options both hand off to the real signing mechanics
 * already built into SelfieSaveEditor (in-person stylus/typed, or a genuine
 * remote signing link) via generatedPdfDraft's autoCaptureSignatures +
 * autoOpenSignSetup flags -- this modal only captures intent, it doesn't
 * duplicate the signing UI itself.
 */
export default function ESignChoiceModal({ isOpen, onClose, label, onSendRemote, onSignInPerson, onSkip, skipLabel = "Save as PDF & Skip Signing", extraAction, onRemindLater }: ESignChoiceModalProps) {
  const [showLegalInfo, setShowLegalInfo] = useState(false);
  if (!isOpen) return null;
  const pick = (fn: () => void) => {
    fn();
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full text-left" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-sm font-display font-black text-[#1F3557] uppercase tracking-wider">Sign {label}?</h3>
          <button type="button" onClick={onClose} className="text-[#5E7393] hover:text-[#1F3557] cursor-pointer shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-[#5E7393] font-semibold mb-4">Optional -- set up e-signing now, or skip it for later.</p>
        <div className="space-y-2">
          <button type="button" onClick={() => pick(onSendRemote)} className="w-full flex items-center gap-2.5 p-3 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-2xl text-left cursor-pointer transition-colors">
            <Send className="w-4 h-4 text-[#315C9F] shrink-0" />
            <span className="text-xs font-black text-[#1F3557] uppercase tracking-wide">Send for Remote eSign</span>
          </button>
          <button type="button" onClick={() => pick(onSignInPerson)} className="w-full flex items-center gap-2.5 p-3 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-2xl text-left cursor-pointer transition-colors">
            <UserCheck className="w-4 h-4 text-[#315C9F] shrink-0" />
            <span className="text-xs font-black text-[#1F3557] uppercase tracking-wide">Sign in Person</span>
          </button>
          {extraAction && (
            <button type="button" onClick={() => pick(extraAction.onClick)} className="w-full flex items-center gap-2.5 p-3 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-2xl text-left cursor-pointer transition-colors">
              {extraAction.icon || <Send className="w-4 h-4 text-[#315C9F] shrink-0" />}
              <span className="text-xs font-black text-[#1F3557] uppercase tracking-wide">{extraAction.label}</span>
            </button>
          )}
          <button type="button" onClick={() => pick(onSkip)} className="w-full flex items-center gap-2.5 p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-left cursor-pointer transition-colors">
            <FileDown className="w-4 h-4 text-[#5E7393] shrink-0" />
            <span className="text-xs font-bold text-[#5E7393] uppercase tracking-wide">{skipLabel}</span>
          </button>
        </div>
        {onRemindLater && (
          <button type="button" onClick={() => pick(onRemindLater)} className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wide text-[#5E7393] hover:text-[#1F3557] cursor-pointer">
            <Clock className="w-3.5 h-3.5" /> Remind Me Later
          </button>
        )}
        <ESignComplianceFooter onLearnMore={() => setShowLegalInfo(true)} />
      </div>
      {showLegalInfo && <div onClick={e => e.stopPropagation()}><ESignLegalInfoModal onClose={() => setShowLegalInfo(false)} /></div>}
    </div>
  );
}
