// Client-side counterpart to server/remoteSigning.ts -- talks to the two
// unauthenticated /api/sign/:token endpoints so a customer can review and
// sign a document from a link, with no OwnersLocal login of their own.

export interface RemoteSigningInfo {
  ok: boolean;
  error?: string;
  documentName?: string;
  businessName?: string;
  signerLabel?: string;
  signMethod?: "typed" | "drawn" | "both";
  alreadySigned?: boolean;
  pdfBase64?: string;
}

export async function fetchRemoteSigningInfo(token: string): Promise<RemoteSigningInfo> {
  try {
    const res = await fetch(`/api/sign/${encodeURIComponent(token)}`);
    return await res.json();
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

export interface RemoteSignSubmission {
  signerName: string;
  method: "typed" | "drawn";
  signatureImage?: string;
  consent: boolean;
}

export async function submitRemoteSignature(token: string, submission: RemoteSignSubmission): Promise<{ ok: boolean; error?: string; customerInviteCode?: string; businessName?: string }> {
  try {
    const res = await fetch(`/api/sign/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission)
    });
    return await res.json();
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

/** The link an owner shares to a customer for remote signing. */
export function buildRemoteSigningLink(token: string): string {
  return `${window.location.origin}/?sign=${encodeURIComponent(token)}`;
}

function base64ToPdfFile(base64: string, filename: string): File {
  const clean = base64.includes(",") ? base64.split(",").pop() || "" : base64;
  const binary = window.atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const safeName = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
  return new File([bytes], safeName, { type: "application/pdf" });
}

export type RemoteSigningShareResult = "shared" | "copied" | "cancelled";

/**
 * One canonical "Send for signing" delivery path.
 *
 * Native share gets BOTH the review copy of the PDF and the live signing
 * URL whenever the browser/share target supports file+text sharing. Some
 * Android targets reject mixed file/text payloads; in that case we retry
 * the native share sheet with the live signing link alone. The recipient
 * can always review/sign from that URL, so we never fall back to a second
 * in-app "text or email?" chooser.
 */
export async function shareRemoteSigningPackage(args: {
  documentName: string;
  signingLink: string;
  pdfBase64?: string;
  signerName?: string;
}): Promise<RemoteSigningShareResult> {
  const name = args.signerName?.trim();
  const text = `${name ? `Hi ${name}, p` : "P"}lease review and sign ${args.documentName}:\n\n${args.signingLink}`;
  const title = `Sign ${args.documentName}`;

  if (navigator.share) {
    if (args.pdfBase64) {
      try {
        const file = base64ToPdfFile(args.pdfBase64, args.documentName);
        const payload: ShareData = { title, text, files: [file] };
        const canShareFiles = !navigator.canShare || navigator.canShare(payload);
        if (canShareFiles) {
          try {
            await navigator.share(payload);
            return "shared";
          } catch (error) {
            if ((error as DOMException)?.name === "AbortError") return "cancelled";
            // Retry below with the signing URL only. Android share targets
            // vary in whether they accept a PDF and text in one invocation.
          }
        }
      } catch {
        // Bad/oversized base64 should not block the live signing URL.
      }
    }

    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return "cancelled";
    }
  }

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return "copied";
  }

  throw new Error("This browser cannot open the native share sheet or copy the signing link.");
}

/** True when the current URL is a remote-signing link -- checked once at
 * the very top of the app, before the normal login gate, so a customer with
 * no account of their own can still reach the signing page. */
export function getRemoteSigningTokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("sign");
}
