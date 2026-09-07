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

export async function submitRemoteSignature(token: string, submission: RemoteSignSubmission): Promise<{ ok: boolean; error?: string }> {
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

/** The link an owner texts/emails to a customer for remote signing. */
export function buildRemoteSigningLink(token: string): string {
  return `${window.location.origin}${window.location.pathname}?sign=${encodeURIComponent(token)}`;
}

/** True when the current URL is a remote-signing link -- checked once at
 * the very top of the app, before the normal login gate, so a customer with
 * no account of their own can still reach the signing page. */
export function getRemoteSigningTokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("sign");
}
