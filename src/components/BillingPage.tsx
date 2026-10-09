import React, { useEffect, useRef, useState } from "react";
import { CreditCard, CheckCircle2, AlertTriangle, Loader2, Receipt, KeyRound } from "lucide-react";
import { authedFetch } from "../lib/apiClient";
import { redeemBypassCode } from "../lib/paywallClient";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";
import { FREE_TRIAL_DAYS, freeTrialDaysLeft } from "../lib/freeTrial";

// Mirrors the discount server/subscriptionRoutes.ts actually applies
// (FIRST_MONTH_PRICE_CENTS via the "once" coupon) -- shown as copy here so
// this can't say something the checkout session doesn't back up.
const FIRST_MONTH_PRICE = "$49.50";
const REGULAR_PRICE = "$99";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due -- update your payment method",
  unpaid: "Unpaid -- update your payment method",
  canceled: "Canceled",
  incomplete: "Incomplete -- payment did not complete",
  incomplete_expired: "Expired before payment completed",
  paused: "Paused",
};

/**
 * OwnersLOCAL's own SaaS subscription (the owner paywall) -- the business
 * owner subscribing to and paying OwnersLOCAL itself, not Stripe Connect
 * (PaymentsPage.tsx), which is a business collecting payment from ITS OWN
 * customers. See server/subscriptionRoutes.ts.
 */
interface BillingPageProps {
  /** Called after the server has accepted an access code. PaywallGate uses
   * this to refresh the app-level subscription state and leave the gate. */
  onAccessGranted?: (bypassExpiresAt?: number) => void;
}

export const BillingPage: React.FC<BillingPageProps> = ({ onAccessGranted }) => {
  const { triggerNotification } = useNavTelemetry();
  const subscription = useSubscriptionStatus();
  const [isRedirecting, setIsRedirecting] = useState<"checkout" | "portal" | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  // Set immediately after the server accepts a free code so the paid
  // checkout controls disappear before any status-refresh round trip.
  const [accessGrantedNow, setAccessGrantedNow] = useState(false);
  const freeAccessActive = subscription.bypassActive || accessGrantedNow;

  const submitAccessCode = async () => {
    if (!accessCode.trim()) return;
    setIsRedeeming(true);
    setRedeemError(null);
    const result = await redeemBypassCode(accessCode.trim());
    setIsRedeeming(false);
    if (!result.success) {
      setRedeemError(result.error || "Could not redeem that code.");
      return;
    }
    setAccessCode("");
    setAccessGrantedNow(true);
    onAccessGranted?.(result.bypassExpiresAt);
    subscription.refresh();
    triggerNotification("✅ Free access activated. Returning to onboarding…");
  };

  // Stripe redirects back to success_url as soon as Checkout completes,
  // which can be BEFORE the customer.subscription.created webhook has
  // actually landed and updated business_profiles -- without this, a user
  // returning from a successful checkout can briefly (or, if the webhook is
  // slow/misconfigured, indefinitely) see "No active subscription" even
  // though they just paid. Poll a few times to catch up; give up after 10
  // tries (~20s) rather than looping forever.
  const [justCheckedOut, setJustCheckedOut] = useState(false);
  const pollAttemptsRef = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success" || checkout === "cancel") {
      setJustCheckedOut(checkout === "success");
      params.delete("checkout");
      const rest = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }
  }, []);

  useEffect(() => {
    if (!justCheckedOut || subscription.loading) return;
    if (subscription.subscriptionActive) {
      setJustCheckedOut(false);
      return;
    }
    if (pollAttemptsRef.current >= 10) {
      setJustCheckedOut(false);
      return;
    }
    pollAttemptsRef.current += 1;
    const timeout = setTimeout(() => subscription.refresh(), 2000);
    return () => clearTimeout(timeout);
  }, [justCheckedOut, subscription.loading, subscription.subscriptionActive, subscription.refresh]);

  const startCheckout = async () => {
    // Never allow a checkout click after this page has already received a
    // successful free-access response, even while subscription.refresh() is
    // still catching up.
    if (freeAccessActive) {
      onAccessGranted?.();
      return;
    }
    setIsRedirecting("checkout");
    try {
      const res = await authedFetch("/api/subscription/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout.");
      window.location.href = data.url;
    } catch (err) {
      triggerNotification(err instanceof Error ? err.message : "Could not start checkout.");
      setIsRedirecting(null);
    }
  };

  const openBillingPortal = async () => {
    setIsRedirecting("portal");
    try {
      const res = await authedFetch("/api/subscription/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not open the billing portal.");
      window.location.href = data.url;
    } catch (err) {
      triggerNotification(err instanceof Error ? err.message : "Could not open the billing portal.");
      setIsRedirecting(null);
    }
  };

  return (
    <div className="ownerslocal-paywall-billing flex-1 flex flex-col gap-5 animate-fade-in text-[#1F3557] max-w-2xl">
      <div className="flex items-center gap-2">
        <Receipt className="w-5 h-5 text-[#315C9F]" />
        <h1 className="text-lg font-black">Billing</h1>
      </div>
      <p className="ownerslocal-paywall-detail text-xs text-slate-500 -mt-3">
        This page manages your Owner’sLOCAL subscription. To accept payments from customers, open Payments and connect Stripe.
      </p>

      {justCheckedOut && !subscription.subscriptionActive && (
        <div className="bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl p-4 flex items-start gap-3">
          <Loader2 className="w-4 h-4 text-[#315C9F] shrink-0 mt-0.5 animate-spin" />
          <div className="text-xs text-[#1F3557]">Finalizing your subscription -- this can take a few seconds.</div>
        </div>
      )}

      {subscription.loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking subscription status...
        </div>
      ) : !subscription.configured ? (
        <div className="bg-[#FFF6E3] border border-[#F0D999] rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-[#8A6D1F] shrink-0 mt-0.5" />
          <div className="text-xs text-[#5B4A15]">
            Billing isn't necessary for this demo.
          </div>
        </div>
      ) : subscription.error ? (
        <div className="bg-[#FEE9E9] border border-[#F3B9B9] rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-[#9F3535] shrink-0 mt-0.5" />
          <div className="text-xs text-[#7A2A2A]">{subscription.error}</div>
        </div>
      ) : subscription.subscriptionActive ? (
        <div className="bg-[#E7F7EE] border border-[#A9E0C0] rounded-2xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-[#1F7A46] shrink-0 mt-0.5" />
          <div className="text-xs text-[#1F5C36] space-y-1">
            <div className="font-bold">
              {STATUS_LABELS[subscription.status || ""] || "Active"}
            </div>
            {subscription.currentPeriodEnd && (
              <div>
                {subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"} on{" "}
                {new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      ) : freeAccessActive ? (
        <div className="bg-[#E7F7EE] border border-[#A9E0C0] rounded-2xl p-4 flex items-start gap-3">
          <KeyRound className="w-4 h-4 text-[#1F7A46] shrink-0 mt-0.5" />
          <div className="text-xs text-[#1F5C36] space-y-1">
            <div className="font-bold">Free access active (access code)</div>
            {subscription.bypassExpiresAt && (
              <div>Re-enter the code on {new Date(subscription.bypassExpiresAt).toLocaleDateString()} to keep access.</div>
            )}
          </div>
        </div>
      ) : subscription.trialActive ? (
        <div className="bg-[#E7F7EE] border border-[#A9E0C0] rounded-2xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-[#1F7A46] shrink-0 mt-0.5" />
          <div className="text-xs text-[#1F5C36] space-y-1">
            <div className="font-bold">
              Free trial: {freeTrialDaysLeft(subscription.trialEndsAt)} day{freeTrialDaysLeft(subscription.trialEndsAt) === 1 ? "" : "s"} left
            </div>
            {subscription.trialEndsAt && (
              <div>Your {FREE_TRIAL_DAYS}-day free trial ends {new Date(subscription.trialEndsAt).toLocaleDateString()}. No card needed until then. Subscribe anytime to keep access; your first month starts the day you subscribe.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl p-4 flex items-start gap-3">
          <CreditCard className="w-4 h-4 text-[#315C9F] shrink-0 mt-0.5" />
          <div className="text-xs text-[#1F3557]">
            {!subscription.status && subscription.trialBlocked && (
              <div className="font-bold">This business matches one that already used Owner’sLOCAL’s free trial, so it isn’t eligible for another. Subscribe to continue.</div>
            )}
            {!subscription.status && !subscription.trialBlocked && subscription.trialEndsAt && subscription.trialEndsAt <= Date.now() && (
              <div className="font-bold">Your {FREE_TRIAL_DAYS}-day free trial has ended. Subscribe to keep using Owner’sLOCAL.</div>
            )}
            {subscription.status
              ? STATUS_LABELS[subscription.status] || `Subscription status: ${subscription.status}`
              : "No active subscription."}
          </div>
        </div>
      )}

      {!subscription.loading && !subscription.subscriptionActive && !freeAccessActive && (
        <div className="ownerslocal-paywall-access-panel bg-white border border-[#DDE8F5] rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#1F3557]">
            <KeyRound className="w-3.5 h-3.5 text-[#315C9F]" />
            Enter a discount or access code
          </div>
          <div className="ownerslocal-paywall-access-row flex gap-2">
            <input
              type="password"
              autoComplete="off"
              value={accessCode}
              onChange={e => setAccessCode(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submitAccessCode()}
              placeholder="Enter code"
              className="ownerslocal-paywall-access-input flex-1 px-3 py-2 text-xs border border-[#DDE8F5] rounded-xl focus:outline-none focus:border-[#315C9F]"
            />
            <button
              onClick={submitAccessCode}
              disabled={isRedeeming || !accessCode.trim()}
              className="ownerslocal-paywall-apply-code px-4 py-2 bg-[#315C9F] hover:bg-[#1F3557] disabled:opacity-50 text-white text-xs font-bold rounded-xl uppercase cursor-pointer flex items-center gap-1.5"
            >
              {isRedeeming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apply Code"}
            </button>
          </div>
          {redeemError && <p className="text-[11px] text-rose-600 font-semibold">{redeemError}</p>}
        </div>
      )}

      {subscription.configured && !subscription.subscriptionActive && !freeAccessActive && !subscription.loading && (
        <div className="bg-white border border-[#DDE8F5] rounded-2xl p-4 flex items-baseline gap-2">
          <span className="ownerslocal-paywall-price text-2xl font-black text-[#1F3557]">{FIRST_MONTH_PRICE}</span>
          <span className="ownerslocal-paywall-price-detail text-xs text-slate-500">first month, then {REGULAR_PRICE}/month. Cancel anytime.</span>
        </div>
      )}

      {!subscription.loading && (
        <div className="ownerslocal-paywall-plan-details bg-white border border-[#DDE8F5] rounded-2xl p-4 text-xs text-slate-600 space-y-1">
          <div className="font-bold text-[#1F3557]">
            Includes you (the owner) plus {subscription.seatPricing.includedEmployees} employees.
          </div>
          <div>
            Every additional {subscription.seatPricing.employeesPerAdditionalBlock} employees adds ${subscription.seatPricing.additionalBlockPriceDollars}/month.
          </div>
          <div className="pt-1">
            You have {subscription.seatPricing.employeeCount} employee{subscription.seatPricing.employeeCount === 1 ? "" : "s"}
            {subscription.seatPricing.extraSeatBlocks > 0
              ? ` — ${subscription.seatPricing.extraSeatBlocks} extra block${subscription.seatPricing.extraSeatBlocks === 1 ? "" : "s"} of 5 = +$${subscription.seatPricing.additionalMonthlyCostDollars}/month.`
              : " — within the included amount, no extra charge."}
          </div>
        </div>
      )}

      <div className="ownerslocal-paywall-actions flex flex-wrap gap-2">
        {subscription.configured && !subscription.subscriptionActive && !freeAccessActive && !subscription.isAdminBusiness && (
          <button
            onClick={startCheckout}
            disabled={isRedirecting !== null}
            className="ownerslocal-paywall-subscribe px-4 py-2.5 bg-[#315C9F] hover:bg-[#1F3557] disabled:opacity-50 text-white text-xs font-bold rounded-xl uppercase flex items-center gap-1.5 cursor-pointer"
          >
            {isRedirecting === "checkout" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
            Subscribe
          </button>
        )}
        {subscription.hasBillingAccount && (
          <button
            onClick={openBillingPortal}
            disabled={isRedirecting !== null}
            className="ownerslocal-paywall-manage-billing px-4 py-2.5 bg-white hover:bg-[#E3F3FF] disabled:opacity-50 text-[#315C9F] border border-[#A9CDEE] text-xs font-bold rounded-xl uppercase flex items-center gap-1.5 cursor-pointer"
          >
            {isRedirecting === "portal" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}
            Manage Billing
          </button>
        )}
      </div>
    </div>
  );
};
