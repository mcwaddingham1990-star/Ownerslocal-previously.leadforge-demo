import { auth } from "../firebase";

/**
 * Standalone demo build: there's no server at all, so any /api/* call falls
 * through render.yaml's SPA rewrite and comes back as index.html, which
 * fails res.json() with a raw "Unexpected token '<'" parse error instead of
 * whatever friendly "not configured"/demo message the caller actually has
 * for this case. The two GET status checks below run unprompted on page
 * load (BillingPage, PaymentsPage/useStripeConnectStatus), so that parse
 * error shows up as a red banner nobody clicked into -- worth a real canned
 * response. Every other /api/* call (AI features, Stripe checkout/portal,
 * payroll submit) only errors on an explicit button click and is left
 * alone; a real fetch attempt there still ends the same way, just later.
 */
const DEMO_MOCK_RESPONSES: Record<string, unknown> = {
  "/api/subscription/status": { configured: false },
  "/api/stripe/connect/status": { connected: false, detailsSubmitted: false, chargesEnabled: false }
};

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/**
 * Awaits any promise while honoring an AbortSignal even if the underlying
 * operation itself (Firebase getIdToken, for example) doesn't accept one.
 *
 * This matters because authedFetch used to wait for getIdToken() before the
 * actual fetch began. Callers such as PaymentsPage correctly supplied a
 * 15-second AbortSignal, but that signal only reached fetch(), so a stalled
 * Firebase token refresh could leave the UI in "loading" forever.
 */
async function awaitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw abortError();

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });

    promise.then(
      value => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

/**
 * fetch wrapper that attaches the signed-in user's Firebase ID token as a
 * Bearer Authorization header -- required by authenticated API routes.
 *
 * The caller's AbortSignal covers BOTH Firebase token acquisition and the
 * network fetch. This keeps retryable screens from hanging indefinitely if
 * Firebase token refresh stalls before a request is ever sent.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const mock = DEMO_MOCK_RESPONSES[input];
  if (mock && (!init.method || init.method === "GET")) {
    return new Response(JSON.stringify(mock), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const signal = init.signal ?? null;
  const user = auth.currentUser;

  const token = user
    ? await awaitWithSignal(user.getIdToken(), signal)
    : undefined;

  if (signal?.aborted) throw abortError();

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
