import React from "react";
import { Scale, X, ShieldCheck, Fingerprint, Archive, HelpCircle, AlertTriangle, ListChecks } from "lucide-react";

interface ESignLegalInfoModalProps {
  onClose: () => void;
}

const CHECKLIST: Array<{ done: boolean; text: string }> = [
  { done: true, text: "Explicit signer action required to sign (draw, type, or upload) — nothing is signed automatically" },
  { done: true, text: "Signer's name and role captured with every signature" },
  { done: true, text: "Signer confirms intent to sign electronically before a signature is applied" },
  { done: true, text: "Tamper-evident record: a SHA-256 hash is generated for every signing event, tied to that document, signer, and timestamp" },
  { done: true, text: "Full audit trail retained with each signature: timestamp, device type, IP address (when it can be determined)" },
  { done: true, text: "Signing order can be enforced when multiple parties must sign in sequence" },
  { done: true, text: "Signed documents and their audit trail are retained in persistent storage, viewable after signing" },
  { done: false, text: "Government-ID or biometric identity verification (not built — see \"Identity Verification\" below)" },
  { done: false, text: "Automated email/SMS delivery of signature requests to remote signers (no email/SMS provider connected yet)" }
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Is an electronic signature made in OwnersLOCAL as legally binding as a wet-ink signature?",
    a: "For most ordinary business contracts, yes. Federal law (the ESIGN Act) and state law (UETA, or your state's own equivalent statute) generally give a properly-executed electronic signature the same legal effect as a handwritten one. That depends on the requirements below actually being met, and on the document type itself being eligible (see the next question)."
  },
  {
    q: "Are there documents that can't be signed electronically, no matter what tool is used?",
    a: "Yes. ESIGN and UETA both carve out categories that federal or state law excludes regardless of the signing tool — common examples include wills and testamentary trusts, certain family-law documents (divorce, adoption), court orders and official court filings, and certain statutory notices (utility cancellation, eviction, foreclosure, product recalls) depending on your state. This is a general summary, not a complete list — check with an attorney before relying on e-signature for anything in a gray area."
  },
  {
    q: "Does using OwnersLOCAL replace the need for a lawyer to review my contracts?",
    a: "No. This feature provides the electronic signing mechanism — capturing intent, consent, the signature itself, and a verifiable audit trail. It doesn't draft, review, or guarantee the legal sufficiency of whatever terms are actually written into your document."
  },
  {
    q: "What happens if a signature is disputed later?",
    a: "The audit trail — timestamp, signer name/role, device and IP info when available, and the cryptographic hash — is the evidence record available to help show a signing event happened and wasn't altered afterward. Whether that's sufficient in any particular dispute is a legal question for a court or attorney to evaluate; this app can't guarantee an outcome."
  }
];

export function ESignLegalInfoModal({ onClose }: ESignLegalInfoModalProps) {
  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
      <div className="bg-white text-slate-800 rounded-[28px] w-[95%] max-w-[720px] max-h-[92vh] shadow-2xl border border-blue-100 flex flex-col overflow-hidden">

        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0 bg-gradient-to-r from-[#1F3557] to-[#315C9F] text-white">
          <div className="flex items-center gap-2.5">
            <Scale className="w-5 h-5" />
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider">ESIGN Act &amp; UETA Compliance</h2>
              <p className="text-[10px] text-blue-100 font-sans font-medium">How OwnersLOCAL's eSign feature is designed to work</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs leading-relaxed scrollbar-thin">

          <section className="space-y-1.5">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-[#1F3557]">Overview of ESIGN &amp; UETA</h3>
            <p>
              The <strong>ESIGN Act</strong> (Electronic Signatures in Global and National Commerce Act, 2000) is a federal law that
              gives electronic signatures and electronic records the same legal standing as handwritten signatures and paper
              documents for transactions in interstate and foreign commerce, provided certain conditions are met. Nearly every
              state has adopted <strong>UETA</strong> (the Uniform Electronic Transactions Act) or a substantively similar statute
              that provides the same recognition at the state level (a few states, notably New York and Illinois, use their own
              separate e-signature laws instead of UETA, with materially similar requirements).
            </p>
          </section>

          <section className="space-y-2.5">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-[#1F3557] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#315C9F]" /> Legal Requirements &amp; How OwnersLOCAL Addresses Them
            </h3>
            <div className="space-y-3">
              {[
                {
                  req: "Intent to sign",
                  plain: "The signer must clearly mean to sign — not be tricked into it or have it happen incidentally.",
                  how: "Signing requires an explicit action on a clearly labeled \"Complete Signature Field\" screen — drawing, typing, or uploading a signature image. Nothing is ever signed automatically."
                },
                {
                  req: "Consent to do business electronically",
                  plain: "The signer must agree to use electronic records and signatures instead of paper for this transaction.",
                  how: "The signing screen requires the signer to check a real consent statement (\"I agree to sign this document electronically\") before the Apply Signature action is enabled."
                },
                {
                  req: "Association of the signature with the record",
                  plain: "The signature has to be clearly and logically tied to the specific document being signed, and show who signed it.",
                  how: "Every signing event generates a SHA-256 hash built from the document ID, signer name, role, action, and timestamp together, and that signature is written directly into that document's own record."
                },
                {
                  req: "Retention & accessibility of the record",
                  plain: "The signed record must be kept in a form that can be accurately reproduced later for everyone entitled to see it.",
                  how: "Signed documents and their full audit trail are stored as real, persistent records in your account's Documents system, retrievable and viewable indefinitely unless an authorized user deliberately deletes them."
                }
              ].map((item) => (
                <div key={item.req} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                  <p className="font-black text-[#1F3557] text-[10.5px] mb-1">{item.req}</p>
                  <p className="text-slate-600 mb-1.5"><span className="font-bold text-slate-500">Plain English: </span>{item.plain}</p>
                  <p className="text-emerald-700"><span className="font-bold">How OwnersLOCAL addresses it: </span>{item.how}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-[#1F3557] flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5 text-[#315C9F]" /> Compliance Checklist
            </h3>
            <div className="space-y-1.5">
              {CHECKLIST.map((item) => (
                <div key={item.text} className="flex items-start gap-2 p-2 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className={`mt-0.5 shrink-0 w-4 h-4 rounded flex items-center justify-center text-[9px] font-black ${item.done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {item.done ? "✓" : "!"}
                  </span>
                  <span className="text-slate-700">{item.text}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-[#1F3557]">Audit Trail Explanation</h3>
            <p>
              Every time someone signs, initials, or otherwise acts on a signature field, the app records a real event: the
              exact timestamp, the name and role entered for that signer, the action taken, the device type and browser in
              use, the requesting device's IP address when it can be determined (client-side code can't detect its own public
              IP directly, so the app asks its own server — if that lookup fails, it honestly records "Unavailable" instead of
              inventing an address), and a SHA-256 cryptographic hash computed from the document ID, signer name, role,
              action, and timestamp together. If any of those underlying details were altered after the fact, recomputing the
              hash would produce a different value — making tampering detectable, not physically impossible to attempt. This
              trail is saved alongside the signed document and stays viewable to anyone with access to that document.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-[#1F3557] flex items-center gap-1.5">
              <Fingerprint className="w-3.5 h-3.5 text-[#315C9F]" /> Identity Verification Explanation
            </h3>
            <p>
              Today, OwnersLOCAL confirms who is signing through: being logged into an authenticated account (for employees
              and owners) or being the person physically present at the device at the time of signing (for in-person customer
              signing), combined with the signer's typed name, role, and a real drawn/typed/uploaded signature, all captured
              in the audit trail above. This is the same standard most everyday e-signature tools use for routine business
              paperwork. It does <strong>not</strong> currently include stronger verification some higher-stakes transactions
              use — government-ID document scanning, biometric matching, knowledge-based authentication questions, or a
              one-time code sent to a signer's verified phone/email. For most service-business paperwork (estimates, work
              orders, service agreements) this level is standard and accepted; for higher-value or higher-risk contracts, ask
              your attorney whether stronger verification is appropriate for that specific document.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-[#1F3557] flex items-center gap-1.5">
              <Archive className="w-3.5 h-3.5 text-[#315C9F]" /> Record Retention Explanation
            </h3>
            <p>
              Signed documents, their embedded signature fields, and their full audit trail are stored as real records in
              your account's Documents system — a live database record, not a static export — and remain there indefinitely
              unless a user with delete permission removes them. Signed documents can be reopened, viewed, and (where your
              plan and permissions allow) exported at any time after signing.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-[#1F3557] flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-[#315C9F]" /> FAQ
            </h3>
            <div className="space-y-2.5">
              {FAQ.map((item) => (
                <div key={item.q}>
                  <p className="font-black text-[#1F3557] text-[10.5px]">{item.q}</p>
                  <p className="text-slate-600 mt-0.5">{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-amber-800">
              <strong>Disclaimer:</strong> This page provides general, plain-English information about the ESIGN Act, UETA, and
              how OwnersLOCAL's eSign feature works. It is provided for informational purposes only and is <strong>not legal
              advice</strong>. Laws vary by state and by document type, and applying them to your specific situation requires a
              licensed attorney. OwnersLOCAL and its developers are not a law firm and do not provide legal advice.
            </p>
          </section>

        </div>

        <div className="p-4 border-t border-slate-100 shrink-0 text-right">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl uppercase tracking-wider cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

/**
 * The short disclosure line + "Learn More" trigger meant to sit at the
 * bottom of every real eSign surface (the signing modal, the eSign
 * configuration sidebar, etc.) — deliberately small and out of the way so
 * it doesn't clutter the actual signing flow, per the intended "99% of
 * users never need to click it" balance.
 */
export function ESignComplianceFooter({ onLearnMore }: { onLearnMore: () => void }) {
  return (
    <div className="flex items-center justify-center gap-1.5 text-[9px] text-[#5E7393] font-sans font-medium pt-2 border-t border-[#9EC8EF]/30 text-center">
      <Scale className="w-3 h-3 shrink-0" />
      <span>
        Designed around the U.S. ESIGN Act and applicable state UETA laws.{" "}
        <button
          type="button"
          onClick={onLearnMore}
          className="text-[#315C9F] font-bold underline cursor-pointer hover:text-[#1F3557]"
        >
          Learn More
        </button>
      </span>
    </div>
  );
}
