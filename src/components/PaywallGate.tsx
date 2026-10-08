import React from "react";
import { Lock, LogOut } from "lucide-react";
import { BillingPage } from "./BillingPage";

interface PaywallGateProps {
  isEmployee: boolean;
  onLogout: () => void | Promise<void>;
  onAccessGranted: (bypassExpiresAt?: number) => void;
}

/**
 * Full-screen block rendered instead of the whole app shell whenever
 * useSubscriptionStatus resolves to "not paid and no valid access code" --
 * see App.tsx's gate check, which decides when this renders (it never
 * renders for the.owner@ownerslocal.com's own business; see
 * isAdminBusiness in server/subscriptionRoutes.ts). BillingPage already has
 * everything needed to resolve this (Subscribe, Manage Billing, and the
 * access-code box), so this just wraps it with an explanation and a way
 * out (log into a different account) rather than duplicating any of that
 * logic here.
 */
export const PaywallGate: React.FC<PaywallGateProps> = ({ isEmployee, onLogout, onAccessGranted }) => {
  return (
    <div className="ownerslocal-paywall-screen min-h-screen bg-[#F5FAFF] flex items-center justify-center p-4">
      <div className="ownerslocal-paywall-shell max-w-lg w-full space-y-5">
        <div className="ownerslocal-paywall-card bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#E3F3FF] text-[#315C9F] rounded-xl border border-[#A9CDEE]">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-[#1F3557]">Subscription Required</h1>
              <p className="text-[11px] text-slate-500 font-semibold">
                {isEmployee
                  ? "Your employer's OwnersLOCAL subscription needs attention before you can continue."
                  : "Subscribe to continue using OwnersLOCAL, or enter an access code if you have one."}
              </p>
            </div>
          </div>
          <BillingPage onAccessGranted={onAccessGranted} />
        </div>
        <button
          onClick={() => void onLogout()}
          className="ownerslocal-paywall-logout w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 text-xs font-bold rounded-xl uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign in to a different account
        </button>
      </div>
    </div>
  );
};

export default PaywallGate;
