import { auth } from "../firebase";

/**
 * Standalone demo build: there's no server at all, so any /api/* call falls
 * through render.yaml's SPA rewrite and comes back as index.html, which
 * fails res.json() with a raw "Unexpected token '<'" parse error instead of
 * whatever friendly "not configured" message the caller actually has for
 * this case. The two GET status checks below run unprompted on page load
 * (BillingPage, PaymentsPage/useStripeConnectStatus), so that parse error
 * shows up as a red banner nobody clicked into -- worth a real canned
 * response. Every other /api/* call (AI features, Stripe checkout/portal,
 * payroll submit) only errors on an explicit button click and is left
 * alone; a real fetch attempt there still ends the same way, just later.
 */
const DEMO_MOCK_RESPONSES: Record<string, unknown> = {
  "/api/subscription/status": { configured: false },
  "/api/stripe/connect/status": { connected: false, detailsSubmitted: false, chargesEnabled: false }
};

/**
 * fetch wrapper that attaches the signed-in user's Firebase ID token as a
 * Bearer Authorization header -- required by every /api/ai/* and
 * /api/notifications/send-push route (see server.ts's requireAuth /
 * vite.config.ts's dev-mode equivalent). Falls back to a plain fetch (and
 * lets the server's 401 explain why) if there's no signed-in user yet.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const mock = DEMO_MOCK_RESPONSES[input];
  if (mock && (!init.method || init.method === "GET")) {
    return new Response(JSON.stringify(mock), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const token = await auth.currentUser?.getIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
