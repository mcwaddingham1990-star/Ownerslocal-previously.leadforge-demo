import React, { useEffect, useState } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { usePlaidLink } from "react-plaid-link";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { BankAccount } from "../types/accounting";

interface PlaidConnectButtonProps {
  className?: string;
  compact?: boolean;
}

export const PlaidConnectButton: React.FC<PlaidConnectButtonProps> = ({ className = "", compact = false }) => {
  const { businessId } = useAuth();
  const { bankAccounts, setBankAccounts } = useDomainData();
  const { triggerNotification } = useNavTelemetry();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      try {
        setIsConnecting(true);
        const response = await fetch("/api/plaid/exchange-public-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicToken, institutionName: metadata.institution?.name }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to connect bank account.");

        const connectedAccounts: BankAccount[] = result.accounts.map((account: any) => ({
          id: `plaid_${account.account_id}`,
          name: account.official_name || account.name,
          type: account.type === "credit" ? "credit_card" : account.type === "loan" ? "loan" : account.subtype === "savings" ? "savings" : "checking",
          accountNumberLast4: account.mask || undefined,
          openingBalance: account.current_balance || 0,
          openingBalanceDate: new Date().toISOString().slice(0, 10),
          isPlaidConnected: true,
          plaidAccountId: account.account_id,
          plaidItemId: result.item_id,
          plaidInstitutionName: result.institution_name,
          createdAt: new Date().toISOString(),
        }));

        setBankAccounts((previous: BankAccount[]) => {
          const connectedIds = new Set(connectedAccounts.map(account => account.plaidAccountId));
          return [...previous.filter(account => !connectedIds.has(account.plaidAccountId)), ...connectedAccounts];
        });
        triggerNotification(`Connected ${connectedAccounts.length} account${connectedAccounts.length === 1 ? "" : "s"} through Plaid.`);
      } catch (error) {
        triggerNotification(error instanceof Error ? error.message : "Plaid connection failed.");
      } finally {
        setIsConnecting(false);
        setLinkToken(null);
      }
    },
    onExit: error => {
      if (error) triggerNotification(error.display_message || "Plaid connection was not completed.");
      setIsConnecting(false);
      setLinkToken(null);
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const connect = async () => {
    try {
      setIsConnecting(true);
      const response = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientUserId: businessId || "ownerslocal-sandbox-owner" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to start Plaid Link.");
      setLinkToken(result.link_token);
    } catch (error) {
      setIsConnecting(false);
      triggerNotification(error instanceof Error ? error.message : "Unable to start Plaid Link.");
    }
  };

  const connectedCount = bankAccounts.filter(account => account.isPlaidConnected).length;

  return (
    <button
      type="button"
      onClick={connect}
      disabled={isConnecting}
      title={connectedCount ? `${connectedCount} Plaid account${connectedCount === 1 ? "" : "s"} connected` : "Securely connect a bank account with Plaid"}
      className={`px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors ${className}`}
    >
      {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Landmark className="w-3.5 h-3.5" />}
      {compact ? "Plaid" : "Connect bank with Plaid"}
      {connectedCount > 0 && <span className="ml-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px]">{connectedCount}</span>}
    </button>
  );
};
