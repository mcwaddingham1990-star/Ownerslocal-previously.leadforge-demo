import React, { useEffect, useMemo, useState } from "react";
import { FileSignature, FileText, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import SignaturePad from "./SignaturePad";
import { base64ToBytes } from "../lib/pdfExport";
import { fetchRemoteSigningInfo, submitRemoteSignature, type RemoteSigningInfo } from "../lib/remoteSigningClient";

/**
 * The page a customer lands on when they open a remote-signing link (texted
 * or emailed from the PDF Editor's "Send remotely" option). Public and
 * unauthenticated -- gated only by the random token in the URL -- so it's
 * mounted directly by App.tsx before the normal login gate, not as a screen
 * inside the logged-in workspace shell.
 */
export default function RemoteSigningPage({ token }: { token: string }) {
  const [info, setInfo] = useState<RemoteSigningInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<"typed" | "drawn">("typed");
  const [signerName, setSignerName] = useState("");
  const [signatureImage, setSignatureImage] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchRemoteSigningInfo(token);
      if (cancelled) return;
      setInfo(result);
      setLoading(false);
      if (result.signMethod === "drawn") setMethod("drawn");
      if (result.signerLabel) setSignerName(result.signerLabel);
    })();
    return () => { cancelled = true; };
  }, [token]);

  const documentUrl = useMemo(() => {
    if (!info?.pdfBase64) return "";
    try {
      const blob = new Blob([base64ToBytes(info.pdfBase64)], { type: "application/pdf" });
      return URL.createObjectURL(blob);
    } catch {
      return "";
    }
  }, [info?.pdfBase64]);
  useEffect(() => () => { if (documentUrl) URL.revokeObjectURL(documentUrl); }, [documentUrl]);

  const canSubmit = signerName.trim() && consent && (method === "typed" || !!signatureImage);

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    const result = await submitRemoteSignature(token, { signerName: signerName.trim(), method, signatureImage: method === "drawn" ? signatureImage : undefined, consent });
    setSubmitting(false);
    if (!result.ok) { setSubmitError(result.error || "That didn't go through -- try again."); return; }
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-[#EAF5FF] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-[#9EC8EF] p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-5">
          <FileSignature className="w-6 h-6 text-[#315C9F]" />
          <span className="text-xs font-black uppercase tracking-widest text-[#5E7393]">Document Signing</span>
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-3 py-14 text-[#5E7393]">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm font-semibold">Loading your document…</p>
          </div>
        )}

        {!loading && info && !info.ok && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="w-10 h-10 text-rose-500" />
            <h1 className="text-lg font-black text-[#1F3557]">Can't open this link</h1>
            <p className="text-sm text-[#5E7393]">{info.error}</p>
          </div>
        )}

        {!loading && info?.ok && (info.alreadySigned || done) && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <h1 className="text-lg font-black text-[#1F3557]">Signed and sent!</h1>
            <p className="text-sm text-[#5E7393]">{info.businessName || "The business"} has been notified. You're all set -- you can close this page.</p>
          </div>
        )}

        {!loading && info?.ok && !info.alreadySigned && !done && (
          <>
            <h1 className="text-xl font-black text-[#1F3557] mb-1">{info.businessName ? `${info.businessName} sent you a document to sign` : "You have a document to sign"}</h1>
            <p className="text-sm text-[#5E7393] font-semibold mb-4">{info.documentName}</p>
            {documentUrl && (
              <a href={documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#315C9F] hover:text-[#1F3557] underline mb-5">
                <FileText className="w-4 h-4" /> Review the document before signing
              </a>
            )}

            {info.signMethod === "both" && (
              <div className="flex gap-2 mb-4">
                <button type="button" onClick={() => setMethod("typed")} className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wide border cursor-pointer ${method === "typed" ? "bg-[#315C9F] text-white border-[#1F3557]" : "bg-[#EAF5FF] text-[#1F3557] border-[#9EC8EF]"}`}>Type my name</button>
                <button type="button" onClick={() => setMethod("drawn")} className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wide border cursor-pointer ${method === "drawn" ? "bg-[#315C9F] text-white border-[#1F3557]" : "bg-[#EAF5FF] text-[#1F3557] border-[#9EC8EF]"}`}>Draw my signature</button>
              </div>
            )}

            <label className="block mb-3">
              <span className="text-xs font-bold text-[#1F3557]">Full legal name</span>
              <input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Type your legal name" className="mt-1 w-full px-3 py-2.5 border border-[#9EC8EF] rounded-xl text-sm focus:outline-none focus:border-[#315C9F]" />
            </label>

            {method === "drawn" && (
              <div className="mb-3">
                <span className="text-xs font-bold text-[#1F3557]">Your signature</span>
                <div className="mt-1"><SignaturePad onChange={setSignatureImage} /></div>
              </div>
            )}

            <label className="flex items-start gap-2 mb-4 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5" />
              <span className="text-xs text-[#5E7393] font-semibold">I consent to sign this document electronically and intend this action as my legal signature.</span>
            </label>

            {submitError && <p className="text-xs font-bold text-rose-600 mb-3">{submitError}</p>}

            <button type="button" disabled={!canSubmit || submitting} onClick={submit} className="w-full py-3 bg-[#315C9F] hover:bg-[#1F3557] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-black uppercase tracking-wide cursor-pointer transition-colors">
              {submitting ? "Submitting…" : "Sign document"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
