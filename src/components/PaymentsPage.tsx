import React, { useEffect, useMemo, useState, useCallback } from "react";
import { loadConnectAndInitialize, type StripeConnectInstance } from "@stripe/connect-js";
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
  ConnectPayments,
  ConnectPayouts,
  ConnectAccountManagement,
  ConnectNotificationBanner,
} from "@stripe/react-connect-js";
import {
  CreditCard,
  Landmark,
  Receipt,
  ShieldAlert,
  Smartphone,
  Percent,
  RefreshCw,
  Wallet,
  Loader2,
} from "lucide-react";
import { authedFetch } from "../lib/apiClient";
import { useNavTelemetry } from "../context/NavTelemetryContext";

type ConnectStatus =
  | { state: "loading" }
  | { state: "not_connected" }
  | { state: "onboarding_incomplete" }
  | { state: "ready" }
  | { state: "error"; message: string };

// Shown (grayed out) before Stripe is connected, so an owner can see
// everything Payments will unlock without having to go find out elsewhere.
const FEATURE_PREVIEW: Array<{ icon: React.ReactNode; label: string; description: string }> = [
  { icon: <CreditCard className="h-4 w-4" />, label: "Accept customer payments", description: "Card payments on invoices and estimates, with a Pay button customers can use directly." },
  { icon: <Receipt className="h-4 w-4" />, label: "Send Stripe invoices", description: "Invoices with a built-in Pay button, tracked automatically." },
  { icon: <Smartphone className="h-4 w-4" />, label: "In-person payments", description: "Stripe Terminal / Tap to Pay for payment collected on-site." },
  { icon: <Percent className="h-4 w-4" />, label: "Automatic sales tax", description: "Stripe Tax calculates the right rate for every transaction." },
  { icon: <RefreshCw className="h-4 w-4" />, label: "Refunds", description: "Issue a refund straight from this tab." },
  { icon: <ShieldAlert className="h-4 w-4" />, label: "Disputes & fraud alerts", description: "See and respond to chargebacks and fraud warnings here." },
  { icon: <Wallet className="h-4 w-4" />, label: "Balance & payouts", description: "Real-time balance, payout history, and Instant Payout when eligible." },
  { icon: <Landmark className="h-4 w-4" />, label: "Automatic status updates", description: "Payments, invoices, jobs, and revenue/accounting stay in sync automatically." },
];

const STRIPE_APPEARANCE = {
  overlays: "dialog" as const,
  variables: {
    colorPrimary: "#315C9F",
    colorText: "#1F3557",
    borderRadius: "10px",
    fontFamily: "inherit",
  },
};

export const PaymentsPage: React.FC = () => {
  const { triggerNotification } = useNavTelemetry();
  const [status, setStatus] = useState<ConnectStatus>({ state: "loading" });
  const [connectInstance, setConnectInstance] = useState<StripeConnectInstance | null>(null);
  const [isStartingOnboarding, setIsStartingOnboarding] = useState(false);
  const [activeSection, setActiveSection] = useState<"payments" | "payouts" | "account">("payments");

  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";

  const fetchClientSecret = useCallback(async () => {
    const res = await authedFetch("/api/stripe/connect/account-session", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not start Stripe onboarding.");
    return data.clientSecret as string;
  }, []);

  // A hung request upstream (a stalled Firebase token refresh, or the
  // server's own outbound call to Google's Identity Toolkit inside
  // requireAuth never returning) previously left this page spinning on
  // "Loading…" forever, with no timeout and no way for the user to recover
  // short of a full page reload. Bounding the request means this always
  // lands on real data, "not connected", or a retryable error within 15s.
  const refreshStatus = useCallback(async () => {
    setStatus({ state: "loading" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await authedFetch("/api/stripe/connect/status", { signal: controller.signal });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ state: "error", message: data.error || "Could not check Stripe status." });
        return;
      }
      if (!data.connected) {
        setStatus({ state: "not_connected" });
      } else if (!data.detailsSubmitted || !data.chargesEnabled) {
        setStatus({ state: "onboarding_incomplete" });
      } else {
        setStatus({ state: "ready" });
      }
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "AbortError";
      setStatus({ state: "error", message: timedOut ? "Checking Stripe status timed out. Try again." : (err instanceof Error ? err.message : "Could not check Stripe status.") });
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const startOnboarding = async () => {
    if (!publishableKey) {
      triggerNotification("Stripe isn't configured on this deployment yet (missing publishable key).");
      return;
    }
    setIsStartingOnboarding(true);
    try {
      // Creates the connected account (if one doesn't already exist) before
      // the embedded component ever loads, so fetchClientSecret always has
      // a real account to attach the session to.
      const accountRes = await authedFetch("/api/stripe/connect/account", { method: "POST" });
      const accountData = await accountRes.json();
      if (!accountRes.ok) throw new Error(accountData.error || "Could not set up Stripe for this business.");

      const instance = loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret,
        appearance: STRIPE_APPEARANCE,
      });
      setConnectInstance(instance);
      setStatus({ state: "onboarding_incomplete" });
    } catch (err) {
      triggerNotification(err instanceof Error ? err.message : "Could not start Stripe onboarding.");
    } finally {
      setIsStartingOnboarding(false);
    }
  };

  // Once onboarding_incomplete is reached (either just now, or on a repeat
  // visit before finishing it last time), make sure the embedded component
  // actually has an instance to render into.
  useEffect(() => {
    if (status.state === "onboarding_incomplete" && !connectInstance && publishableKey) {
      setConnectInstance(
        loadConnectAndInitialize({ publishableKey, fetchClientSecret, appearance: STRIPE_APPEARANCE })
      );
    }
    if (status.state === "ready" && !connectInstance && publishableKey) {
      setConnectInstance(
        loadConnectAndInitialize({ publishableKey, fetchClientSecret, appearance: STRIPE_APPEARANCE })
      );
    }
  }, [status.state, connectInstance, publishableKey, fetchClientSecret]);

  const lockedOverlay = useMemo(
    () => (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-40 pointer-events-none select-none">
        {FEATURE_PREVIEW.map((f) => (
          <div key={f.label} className="bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl p-4 flex items-start gap-3">
            <span className="p-1.5 bg-[#C7E3FB] text-[#342D7E] rounded-xl border border-[#A9CDEE] shrink-0">{f.icon}</span>
            <div>
              <div className="text-xs font-extrabold text-slate-800">{f.label}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{f.description}</div>
            </div>
          </div>
        ))}
      </div>
    ),
    []
  );

  if (status.state === "loading") {
    return (
      <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm text-left animate-fade-in flex items-center justify-between gap-2 text-xs text-slate-500 font-sans font-semibold">
        <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking Stripe status…</span>
        <button onClick={() => void refreshStatus()} className="text-[#315C9F] font-bold underline cursor-pointer shrink-0">
          Taking a while? Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-6 animate-fade-in text-left">
      <div className="bg-[#E3F3FF] p-6 rounded-2xl border border-[#A9CDEE] flex items-center gap-2.5">
        <span className="p-1.5 bg-[#C7E3FB] text-[#342D7E] rounded-xl border border-[#A9CDEE]">
          <CreditCard className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">Payments</h1>
          <p className="text-xs text-slate-500 font-sans font-medium">
            Accept payments, manage payouts, and keep revenue in sync — powered by Stripe.
          </p>
        </div>
      </div>

      {status.state === "error" && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-sans font-semibold rounded-xl p-3 flex items-center justify-between gap-3">
          <span>{status.message}</span>
          <button onClick={() => void refreshStatus()} className="shrink-0 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-[10px] font-bold uppercase tracking-wide cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {(status.state === "not_connected" || status.state === "error") && (
        <>
          {lockedOverlay}
          <div className="flex justify-center pt-2">
            <button
              onClick={startOnboarding}
              disabled={isStartingOnboarding}
              className="px-5 py-3 bg-[#315C9F] hover:bg-[#254A84] text-white rounded-xl text-xs font-bold font-sans cursor-pointer shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {isStartingOnboarding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Integrate Stripe for financial updates and customer payment options
            </button>
          </div>
        </>
      )}

      {status.state === "onboarding_incomplete" && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs font-sans font-semibold rounded-xl p-3">
            Finish setting up Stripe below to start accepting payments.
          </div>
          {connectInstance && (
            <div className="bg-[#E3F3FF] p-4 rounded-2xl border border-[#A9CDEE]">
              <ConnectComponentsProvider connectInstance={connectInstance}>
                <ConnectAccountOnboarding onExit={() => void refreshStatus()} />
              </ConnectComponentsProvider>
            </div>
          )}
        </div>
      )}

      {status.state === "ready" && connectInstance && (
        <div className="space-y-4">
          <ConnectComponentsProvider connectInstance={connectInstance}>
            <ConnectNotificationBanner />

            <div className="flex gap-1.5 border-b border-[#A9CDEE] pb-px text-xs">
              {([
                { key: "payments", label: "Payments" },
                { key: "payouts", label: "Payouts & Balance" },
                { key: "account", label: "Account & Tax" },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveSection(tab.key)}
                  className={`px-3 py-1.5 font-sans font-bold uppercase tracking-wider transition-all cursor-pointer rounded-t-lg ${
                    activeSection === tab.key
                      ? "bg-[#E3F3FF] text-[#342D7E] border-t border-x border-[#A9CDEE]"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="bg-[#E3F3FF] p-4 rounded-2xl border border-[#A9CDEE]">
              {activeSection === "payments" && <ConnectPayments />}
              {activeSection === "payouts" && <ConnectPayouts />}
              {activeSection === "account" && <ConnectAccountManagement />}
            </div>
          </ConnectComponentsProvider>
        </div>
      )}
    </div>
  );
};

export default PaymentsPage;
