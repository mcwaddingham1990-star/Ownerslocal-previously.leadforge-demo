import React, { useState } from "react";
import { ExternalLink, Send, Settings, X, UserPlus } from "lucide-react";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import type { Customer } from "../types/domain";
import { buildCustomerPortalLink } from "../lib/customerPortalClient";
import { createBusinessInviteCode, disconnectCustomerAccount } from "../lib/customerAccountClient";
import SendChoiceModal from "./SendChoiceModal";

const newPortalToken = () => `portal_${crypto.randomUUID().replace(/-/g, "")}`;

/**
 * The shared "Open Customer Portal / Send Portal Link" control every entry
 * point (Customers, Jobs, Estimates, Invoices, Documents, Scheduling) drops
 * in, given whichever real Customer record it already has on hand. Portal
 * access lives directly on that same Customer doc (portalEnabled/
 * portalToken) -- there's no separate portal-access collection and no
 * duplicate customer data.
 */
export interface CustomerPortalControlsProps {
  customer: Customer | null | undefined;
  /** Compact renders as a single small button group (for tight toolbars); the default is two full buttons plus a "Manage Access" link. */
  compact?: boolean;
}

export const CustomerPortalControls: React.FC<CustomerPortalControlsProps> = ({ customer, compact }) => {
  const { setCustomers } = useDomainData();
  const { triggerNotification } = useNavTelemetry();
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isInviteSendOpen, setIsInviteSendOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [disconnectBusy, setDisconnectBusy] = useState(false);

  if (!customer) {
    return <p className="text-[10px] font-bold text-slate-400">No matching customer record -- link this to a customer first.</p>;
  }

  const ensureAccess = (): Customer => {
    if (customer.portalEnabled && customer.portalToken) return customer;
    const updated: Customer = { ...customer, portalEnabled: true, portalToken: customer.portalToken || newPortalToken(), portalTokenCreatedAt: customer.portalTokenCreatedAt || new Date().toISOString() };
    setCustomers(prev => prev.map(c => c.id === customer.id ? updated : c));
    return updated;
  };

  const openPortal = () => {
    const withAccess = ensureAccess();
    window.open(buildCustomerPortalLink(withAccess.portalToken!), "_blank");
  };

  const sendLink = () => {
    ensureAccess();
    setIsSendOpen(true);
  };

  const toggleEnabled = () => {
    const nowEnabled = !customer.portalEnabled;
    setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, portalEnabled: nowEnabled, portalToken: nowEnabled ? (c.portalToken || newPortalToken()) : c.portalToken } : c));
    triggerNotification(nowEnabled ? "Portal access turned on." : "Portal access turned off.");
  };

  const revoke = () => {
    setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, portalToken: newPortalToken(), portalEnabled: true, portalTokenCreatedAt: new Date().toISOString() } : c));
    triggerNotification("Old link is now dead. A new link is ready to send.");
    setIsSendOpen(true);
  };

  const portalLink = customer.portalToken ? buildCustomerPortalLink(customer.portalToken) : "";

  const generateInvite = async () => {
    setInviteBusy(true);
    setInviteError("");
    const result = await createBusinessInviteCode(customer.id);
    setInviteBusy(false);
    if (result.ok && result.code) {
      setInviteCode(result.code);
      setIsInviteOpen(true);
    } else {
      setInviteError(result.error || "Could not create an invite code.");
      setIsInviteOpen(true);
    }
  };

  const disconnectAccount = async () => {
    setDisconnectBusy(true);
    const result = await disconnectCustomerAccount(customer.id);
    setDisconnectBusy(false);
    triggerNotification(result.ok ? "Customer's app access has been disconnected." : (result.error || "Could not disconnect this customer."));
  };

  const inviteLink = inviteCode ? `${window.location.origin}/?joinCode=${encodeURIComponent(inviteCode)}` : "";

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "flex flex-wrap items-center gap-2"}>
      <button type="button" onClick={openPortal} className="flex items-center gap-1.5 rounded-xl border border-[#9EC8EF] bg-white px-3 py-2 text-xs font-bold text-[#315C9F]">
        <ExternalLink className="w-3.5 h-3.5" /> Open Customer Portal
      </button>
      <button type="button" onClick={sendLink} className="flex items-center gap-1.5 rounded-xl bg-[#315C9F] px-3 py-2 text-xs font-bold text-white">
        <Send className="w-3.5 h-3.5" /> Send Portal Link
      </button>
      <button type="button" onClick={() => setIsManageOpen(true)} className="p-2 text-[#5E7393] hover:text-[#1F3557]" aria-label="Manage portal access">
        <Settings className="w-4 h-4" />
      </button>
      <button type="button" disabled={inviteBusy} onClick={generateInvite} className="flex items-center gap-1.5 rounded-xl border border-[#9EC8EF] bg-white px-3 py-2 text-xs font-bold text-[#315C9F] disabled:opacity-50">
        <UserPlus className="w-3.5 h-3.5" /> Invite to Free App Account
      </button>

      <SendChoiceModal
        isOpen={isSendOpen}
        onClose={() => setIsSendOpen(false)}
        label="Portal Link"
        phone={customer.phone}
        email={customer.email}
        subject="Your customer portal"
        body={`Here's your secure link to view your jobs, estimates, invoices, and more: ${portalLink}`}
      />

      {isManageOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/60 p-4" onMouseDown={e => e.target === e.currentTarget && setIsManageOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-[#1F3557]">Manage Portal Access</h3>
              <button onClick={() => setIsManageOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <p className="mt-2 text-xs text-[#5E7393]">Status: <b className={customer.portalEnabled ? "text-emerald-600" : "text-rose-600"}>{customer.portalEnabled ? "Enabled" : "Disabled"}</b></p>
            <div className="mt-4 space-y-2">
              <button onClick={toggleEnabled} className="w-full rounded-xl border border-[#9EC8EF] bg-white py-2.5 text-xs font-bold text-[#1F3557]">
                {customer.portalEnabled ? "Disable Portal Access" : "Enable Portal Access"}
              </button>
              <button onClick={revoke} className="w-full rounded-xl border border-rose-300 bg-rose-50 py-2.5 text-xs font-bold text-rose-700">
                Revoke Link &amp; Send a New One
              </button>
              <button disabled={disconnectBusy} onClick={disconnectAccount} className="w-full rounded-xl border border-rose-300 bg-rose-50 py-2.5 text-xs font-bold text-rose-700 disabled:opacity-50">
                Disconnect Free App Account
              </button>
            </div>
          </div>
        </div>
      )}

      {isInviteOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/60 p-4" onMouseDown={e => e.target === e.currentTarget && setIsInviteOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-[#1F3557]">Invite to Free App Account</h3>
              <button onClick={() => setIsInviteOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            {inviteError ? (
              <p className="mt-3 text-xs font-bold text-rose-600">{inviteError}</p>
            ) : (
              <>
                <p className="mt-2 text-xs text-[#5E7393]">
                  One free Owner'sLOCAL account works with every business a customer uses. Send this code or link -- it expires in 14 days and works once.
                </p>
                <p className="mt-3 text-center text-2xl font-black tracking-[0.3em] text-[#1F3557]">{inviteCode}</p>
                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => { navigator.clipboard?.writeText(inviteLink); triggerNotification("Invite link copied."); }}
                    className="w-full rounded-xl border border-[#9EC8EF] bg-white py-2.5 text-xs font-bold text-[#1F3557]"
                  >
                    Copy Invite Link
                  </button>
                  <button onClick={() => { setIsInviteOpen(false); setIsInviteSendOpen(true); }} className="w-full rounded-xl bg-[#315C9F] py-2.5 text-xs font-bold text-white">
                    Send It
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SendChoiceModal
        isOpen={isInviteSendOpen}
        onClose={() => setIsInviteSendOpen(false)}
        label="App Invite"
        phone={customer.phone}
        email={customer.email}
        subject="Connect your free Owner'sLOCAL account"
        body={`Use this link to connect your free account (works with every business you use, not just us): ${inviteLink}`}
      />
    </div>
  );
};
