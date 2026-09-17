import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "../lib/apiClient";

/**
 * OwnersLOCAL's own SaaS subscription status (the owner paywall) -- NOT the
 * same thing as useStripeConnectStatus, which is a business's own Stripe
 * Connect account for charging THEIR customers. See
 * server/subscriptionRoutes.ts for the server side of this.
 */
export interface SeatPricing {
  includedEmployees: number;
  employeesPerAdditionalBlock: number;
  additionalBlockPriceDollars: number;
  employeeCount: number;
  extraSeatBlocks: number;
  additionalMonthlyCostDollars: number;
}

const DEFAULT_SEAT_PRICING: SeatPricing = {
  includedEmployees: 5,
  employeesPerAdditionalBlock: 5,
  additionalBlockPriceDollars: 20,
  employeeCount: 0,
  extraSeatBlocks: 0,
  additionalMonthlyCostDollars: 0,
};

export type SubscriptionState =
  | {
      loading: true;
      configured: false;
      subscriptionActive: false;
      status: null;
      hasBillingAccount: false;
      currentPeriodEnd: null;
      cancelAtPeriodEnd: false;
      seatPricing: SeatPricing;
    }
  | {
      loading: false;
      configured: boolean;
      subscriptionActive: boolean;
      status: string | null;
      hasBillingAccount: boolean;
      currentPeriodEnd: number | null;
      cancelAtPeriodEnd: boolean;
      seatPricing: SeatPricing;
      error?: string;
    };

const initialState: SubscriptionState = {
  loading: true,
  configured: false,
  subscriptionActive: false,
  status: null,
  hasBillingAccount: false,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  seatPricing: DEFAULT_SEAT_PRICING,
};

export function useSubscriptionStatus(): SubscriptionState & { refresh: () => void } {
  const [state, setState] = useState<SubscriptionState>(initialState);

  const refresh = useCallback(() => {
    setState(initialState);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    (async () => {
      try {
        const res = await authedFetch("/api/subscription/status", { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) {
          setState({
            loading: false,
            configured: false,
            subscriptionActive: false,
            status: null,
            hasBillingAccount: false,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            seatPricing: DEFAULT_SEAT_PRICING,
            error: data.error || "Could not check subscription status.",
          });
          return;
        }
        setState({
          loading: false,
          configured: !!data.configured,
          subscriptionActive: !!data.subscriptionActive,
          status: data.status ?? null,
          hasBillingAccount: !!data.hasBillingAccount,
          currentPeriodEnd: typeof data.currentPeriodEnd === "number" ? data.currentPeriodEnd : null,
          cancelAtPeriodEnd: !!data.cancelAtPeriodEnd,
          seatPricing: data.seatPricing || DEFAULT_SEAT_PRICING,
        });
      } catch (err) {
        const timedOut = err instanceof DOMException && err.name === "AbortError";
        setState({
          loading: false,
          configured: false,
          subscriptionActive: false,
          status: null,
          hasBillingAccount: false,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          seatPricing: DEFAULT_SEAT_PRICING,
          error: timedOut ? "Checking subscription status timed out." : (err instanceof Error ? err.message : "Could not check subscription status."),
        });
      } finally {
        clearTimeout(timeout);
      }
    })();
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, refresh };
}
