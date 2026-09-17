import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "../lib/apiClient";

/**
 * The one real, live Stripe Connect status check -- same request PaymentsPage
 * itself uses (GET /api/stripe/connect/status), shared here so Dashboard,
 * Revenue, Integrations, and Accounting can all show the SAME answer instead
 * of each keeping its own independent (and, before this, inconsistent --
 * IntegrationsPage hardcoded `connected: false`, App.tsx's cached
 * `integrationStatuses.stripe` defaulted to `true` and was never written to,
 * Dashboard/Revenue showed no status at all) copy.
 */
export type StripeConnectState =
  | { loading: true; connected: false; ready: false }
  | { loading: false; connected: boolean; ready: boolean; error?: string };

const initialState: StripeConnectState = { loading: true, connected: false, ready: false };

export function useStripeConnectStatus(): StripeConnectState & { refresh: () => void } {
  const [state, setState] = useState<StripeConnectState>(initialState);

  const refresh = useCallback(() => {
    setState(initialState);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    (async () => {
      try {
        const res = await authedFetch("/api/stripe/connect/status", { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) {
          setState({ loading: false, connected: false, ready: false, error: data.error || "Could not check Stripe status." });
          return;
        }
        const ready = !!data.connected && !!data.detailsSubmitted && !!data.chargesEnabled;
        setState({ loading: false, connected: !!data.connected, ready });
      } catch (err) {
        const timedOut = err instanceof DOMException && err.name === "AbortError";
        setState({ loading: false, connected: false, ready: false, error: timedOut ? "Checking Stripe status timed out." : (err instanceof Error ? err.message : "Could not check Stripe status.") });
      } finally {
        clearTimeout(timeout);
      }
    })();
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, refresh };
}
