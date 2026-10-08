import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "../firebase";
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
      bypassActive: false;
      bypassExpiresAt: null;
      isAdminBusiness: false;
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
      /** A redeemed platform-admin access code, valid for 30 days from redemption -- see server/paywallBypass.ts. */
      bypassActive: boolean;
      bypassExpiresAt: number | null;
      /** The hardcoded platform-admin business (the.owner@ownerslocal.com) -- never gated regardless of the fields above. */
      isAdminBusiness: boolean;
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
  bypassActive: false,
  bypassExpiresAt: null,
  isAdminBusiness: false,
  seatPricing: DEFAULT_SEAT_PRICING,
};

const failedState = (error: string): SubscriptionState => ({
  loading: false,
  configured: false,
  subscriptionActive: false,
  status: null,
  hasBillingAccount: false,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  bypassActive: false,
  bypassExpiresAt: null,
  isAdminBusiness: false,
  seatPricing: DEFAULT_SEAT_PRICING,
  error,
});

export function useSubscriptionStatus(): SubscriptionState & { refresh: () => void } {
  const [state, setState] = useState<SubscriptionState>(initialState);
  const requestGeneration = useRef(0);

  const refresh = useCallback(() => {
    const generation = ++requestGeneration.current;
    setState(initialState);

    const run = async (attempt: number): Promise<void> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await authedFetch("/api/subscription/status", { signal: controller.signal });
        const data = await res.json();
        if (generation !== requestGeneration.current) return;

        if (!res.ok) {
          // A brand-new Firebase user becomes authenticated just before its
          // user/business profile documents finish writing. Retry that short
          // handoff instead of permanently caching the early 401/503.
          const profileMayStillBeLinking = (res.status === 401 || res.status === 503) && attempt < 4 && !!auth.currentUser;
          if (profileMayStillBeLinking) {
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            if (generation === requestGeneration.current) await run(attempt + 1);
            return;
          }

          setState(failedState(data.error || "Could not verify subscription status."));
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
          bypassActive: !!data.bypassActive,
          bypassExpiresAt: typeof data.bypassExpiresAt === "number" ? data.bypassExpiresAt : null,
          isAdminBusiness: !!data.isAdminBusiness,
          seatPricing: data.seatPricing || DEFAULT_SEAT_PRICING,
        });
      } catch (err) {
        if (generation !== requestGeneration.current) return;
        const timedOut = err instanceof DOMException && err.name === "AbortError";
        setState(failedState(
          timedOut
            ? "Checking subscription status timed out."
            : (err instanceof Error ? err.message : "Could not verify subscription status.")
        ));
      } finally {
        clearTimeout(timeout);
      }
    };

    void run(0);
  }, []);

  useEffect(() => {
    // Do not make the subscription request before Firebase has a real user.
    // This listener also guarantees a fresh check on every signup, login,
    // logout, or account switch.
    return onAuthStateChanged(auth, user => {
      if (user) {
        refresh();
      } else {
        requestGeneration.current += 1;
        setState(initialState);
      }
    });
  }, [refresh]);

  return { ...state, refresh };
}
