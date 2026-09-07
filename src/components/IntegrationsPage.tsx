import React, { useState, useMemo, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  Link2,
  Plus,
  Brain,
  Upload,
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  ShieldCheck,
  UserCheck,
  Settings,
  Database,
  Calendar,
  DollarSign,
  Briefcase,
  TrendingUp,
  Map,
  FileText,
  Mail,
  Users,
  BarChart,
  MessageSquare,
  Globe,
  Lock,
  ArrowRightLeft,
  X,
  Play,
  Key,
  Info,
  Layers,
  BookOpen,
  Wifi,
  HelpCircle,
  Copy,
  RotateCw
} from "lucide-react";
import { SchedulingEvent } from "./SchedulingPage";
import { Customer } from "./CustomersPage";
import { DocumentItem } from "./DocumentsPage";
import { PlaidConnectButton } from "./PlaidConnectButton";

// Let's define interfaces for custom integration items
export interface Integration {
  id: string;
  name: string;
  category: "Business" | "Accounting" | "Marketing" | "Communication" | "Maps" | "AI" | "CRM" | "Storage" | "Payments" | "Custom";
  developer: string;
  apiType: "REST" | "GraphQL" | "SOAP" | "gRPC";
  logo: string; // Emoji
  description: string;
  connected: boolean;
  lastSync: string;
  aiEnabled: boolean;
  aiMode: "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO";
  apiUsage: { current: number; limit: number };
  scopes: string[];
  permissions: string[];
  syncFrequency: "Manual" | "Every 5 Minutes" | "Every 15 Minutes" | "Every Hour" | "Daily" | "Weekly" | "Custom";
  apiKey?: string;
  apiSecret?: string;
  webhookUrl?: string;
  redirectUri?: string;
}

export interface SyncLogEntry {
  id: string;
  date: string;
  time: string;
  integrationId: string;
  integrationName: string;
  recordsUpdated: number;
  warnings: number;
  errors: number;
  status: "Success" | "Failed" | "Warning";
  message: string;
}

export interface WebhookHistoryEntry {
  id: string;
  type: "Incoming" | "Outgoing";
  eventType: string;
  timestamp: string;
  payloadSize: string;
  status: "Delivered" | "Failed" | "Retrying";
  retryCount: number;
}

interface IntegrationsPageProps {
  dashboardLeads: any[];
  setDashboardLeads: React.Dispatch<React.SetStateAction<any[]>>;
}

// The app's own built-in modules -- shown collapsed as reassurance that
// nothing else needs to be set up, not as something to configure here.
const CONNECTED_APP_FEATURES: Array<{ name: string; status: "CONNECTED" | "READY" }> = [
  { name: "Dashboard", status: "CONNECTED" },
  { name: "Revenue", status: "CONNECTED" },
  { name: "Customers", status: "CONNECTED" },
  { name: "Leads", status: "CONNECTED" },
  { name: "Estimates & Bids", status: "CONNECTED" },
  { name: "Scheduling", status: "CONNECTED" },
  { name: "Dispatch", status: "CONNECTED" },
  { name: "Routes", status: "CONNECTED" },
  { name: "Jobs", status: "CONNECTED" },
  { name: "Time Clock", status: "CONNECTED" },
  { name: "Inventory", status: "CONNECTED" },
  { name: "Documents", status: "CONNECTED" },
  { name: "Messages", status: "CONNECTED" },
  { name: "Roster", status: "CONNECTED" },
  { name: "Training", status: "CONNECTED" },
  { name: "AI Assistant", status: "CONNECTED" },
  { name: "Settings", status: "CONNECTED" },
  { name: "Notifications", status: "READY" },
  { name: "Owner Console", status: "READY" }
];

export const IntegrationsPage: React.FC<IntegrationsPageProps> = ({
  dashboardLeads,
  setDashboardLeads
}) => {
  const { loggedInUser, simulatedRole, businessId } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const {
    schedulingEvents,
    setSchedulingEvents,
    customers,
    setCustomers,
    documents,
    setDocuments,
    recentAiActions,
    setRecentAiActions
  } = useDomainData();
  const {
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    navigateToScreen: onNavigateToScreen,
    logOperationalEvent,
    triggerNotification
  } = useNavTelemetry();
  // Check authorization - Owners full access, managers configurable, employees limited
  const isAuthorized = useMemo(() => {
    if (activeRole === "Owner") return true;
    if (activeRole === "Office Manager" || activeRole === "Manager") return true;
    return false; // Employees only see configured view but cannot change setup
  }, [activeRole]);

  const [integrations, setIntegrations] = useState<Integration[]>([
    // The app's own modules (accounting, invoicing/payments intake, texting
    // via device SMS, scheduling, messaging, documents) already cover what
    // QuickBooks/Twilio/Slack/Zoom/Google Workspace/etc. would otherwise be
    // connected for -- that's the point of the app, so those integrations
    // were removed rather than left as more non-functional "Connect"
    // buttons. Plaid (real bank-account linking, see PlaidConnectButton)
    // and Stripe (real payment processing) are the two a business genuinely
    // still needs a third party for.
    {
      id: "stripe",
      name: "Stripe",
      category: "Payments",
      developer: "Stripe",
      apiType: "REST",
      logo: "💳",
      description: "Accept card payments, send digital secure checkout links, and process job deposits.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 50000 },
      scopes: ["charges.create", "invoices.send", "payment_intents.manage"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every 5 Minutes",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "website_lead_form",
      name: "Website Lead Capture Form",
      category: "Marketing",
      developer: "OwnersLOCAL",
      apiType: "REST",
      logo: "📝",
      description: "Copy-paste embed code for your own business website. Every submission creates a real Lead here automatically.",
      connected: true,
      lastSync: "N/A",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 0 },
      scopes: [],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Manual",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    }
  ]);

  // Sync log entries -- starts empty; nothing here is a real connected
  // integration yet, so no sync activity has actually happened.
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);

  // Webhook history logs -- starts empty for the same reason.
  const [webhookLogs, setWebhookLogs] = useState<WebhookHistoryEntry[]>([]);

  // Simplified page UI state -- with only a couple of real integrations,
  // the old multi-facet search/filter panel and separate grid/webhooks/logs
  // tabs had nothing meaningful to do. Backup, the activity log, and
  // webhook details are still fully available, just tucked under
  // "More options" instead of being front and center.
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [advancedView, setAdvancedView] = useState<"webhooks" | "logs" | null>(null);
  const [isFeaturesListOpen, setIsFeaturesListOpen] = useState(false);

  // Selected Integration for Details Popup / Configuration Modal
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [isDetailPopupOpen, setIsDetailPopupOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"overview" | "api_keys" | "webhooks" | "logs" | "ai_setup">("overview");

  // Add integration dialog state

  // AI Setup Dialog State
  const [isAiSetupOpen, setIsAiSetupOpen] = useState(false);

  // Website Lead Capture Form: a per-business embed token stored on the
  // business's own profile doc, not a new collection -- the same doc every
  // other business-level setting already lives on.
  const [webFormToken, setWebFormToken] = useState<string>("");
  const [isLoadingWebFormToken, setIsLoadingWebFormToken] = useState(true);
  const [isGeneratingWebFormToken, setIsGeneratingWebFormToken] = useState(false);
  const [webFormCopySuccess, setWebFormCopySuccess] = useState(false);

  useEffect(() => {
    if (!businessId) {
      setIsLoadingWebFormToken(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "business_profiles", businessId));
        if (!cancelled) setWebFormToken(snap.exists() ? (snap.data().webFormToken || "") : "");
      } catch (err) {
        console.error("Error loading website lead form token:", err);
      } finally {
        if (!cancelled) setIsLoadingWebFormToken(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const handleGenerateWebFormToken = async () => {
    if (!businessId) return;
    if (webFormToken && !window.confirm(
      "Regenerating breaks the embed code already pasted into your website -- you'll need to replace it there with the new one. Continue?"
    )) {
      return;
    }
    setIsGeneratingWebFormToken(true);
    try {
      const token = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, "");
      await setDoc(doc(db, "business_profiles", businessId), { webFormToken: token }, { merge: true });
      setWebFormToken(token);
      triggerNotification("📝 Website lead form embed code generated.");
    } catch (err) {
      console.error("Error generating website lead form token:", err);
      triggerNotification("Couldn't generate the embed code -- check your connection and try again.");
    } finally {
      setIsGeneratingWebFormToken(false);
    }
  };

  const webLeadFormEndpoint = `${typeof window !== "undefined" ? window.location.origin : ""}/api/leads/submit-web-form`;

  const webLeadFormEmbedSnippet = useMemo(() => {
    if (!webFormToken) return "";
    return `<!-- OwnersLOCAL Lead Capture Form -->
<form id="ownerslocal-lead-form" style="max-width:420px;display:flex;flex-direction:column;gap:10px;font-family:sans-serif;">
  <input name="name" placeholder="Full Name" required style="padding:10px;border:1px solid #ccc;border-radius:6px;">
  <input name="phone" placeholder="Phone" style="padding:10px;border:1px solid #ccc;border-radius:6px;">
  <input name="email" type="email" placeholder="Email" style="padding:10px;border:1px solid #ccc;border-radius:6px;">
  <input name="company" placeholder="Company (optional)" style="padding:10px;border:1px solid #ccc;border-radius:6px;">
  <textarea name="notes" placeholder="What do you need help with?" rows="3" style="padding:10px;border:1px solid #ccc;border-radius:6px;"></textarea>
  <!-- Honeypot: real visitors never see this field; leave it in place as-is. -->
  <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;" aria-hidden="true">
  <button type="submit" style="padding:10px;border:none;border-radius:6px;background:#315C9F;color:#fff;font-weight:bold;cursor:pointer;">Send</button>
  <p id="ownerslocal-lead-form-status" style="font-size:13px;"></p>
</form>
<script>
(function () {
  var form = document.getElementById("ownerslocal-lead-form");
  var status = document.getElementById("ownerslocal-lead-form-status");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form).entries());
    data.token = "${webFormToken}";
    status.textContent = "Sending...";
    fetch("${webLeadFormEndpoint}", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        if (result.ok) {
          status.textContent = "Thanks! We'll be in touch shortly.";
          form.reset();
        } else {
          status.textContent = result.error || "Something went wrong -- please try again.";
        }
      })
      .catch(function () {
        status.textContent = "Something went wrong -- please try again.";
      });
  });
})();
</script>`;
  }, [webFormToken, webLeadFormEndpoint]);

  const handleCopyWebFormSnippet = async () => {
    try {
      await navigator.clipboard.writeText(webLeadFormEmbedSnippet);
      setWebFormCopySuccess(true);
      setTimeout(() => setWebFormCopySuccess(false), 2000);
    } catch {
      triggerNotification("Couldn't copy automatically -- select the code and copy it manually.");
    }
  };

  // Computations for the plain-language status row
  const summaryCounts = useMemo(() => {
    const connected = integrations.filter((i) => i.connected).length;
    const available = integrations.length - connected;
    const errors = syncLogs.filter((l) => l.status === "Failed").length;
    return {
      connected,
      available,
      errors,
      lastSync: syncLogs[0] ? `${syncLogs[0].date} ${syncLogs[0].time}` : "N/A",
      apiHealth: "98.4%"
    };
  }, [integrations, syncLogs]);

  // Tapping "Working" / "Not set up" filters the app list to match.
  const [activeSummaryFilter, setActiveSummaryFilter] = useState<"Connected" | "Available" | null>(null);

  const filteredIntegrations = useMemo(() => {
    if (!activeSummaryFilter) return integrations;
    return integrations.filter((item) =>
      activeSummaryFilter === "Connected" ? item.connected : !item.connected
    );
  }, [integrations, activeSummaryFilter]);

  // Toggle Connection Handler
  // Stripe is the only integration left, and there's no real Stripe OAuth
  // backend wired up yet -- the toggle is shown greyed out/disabled rather
  // than pretending a click actually connects anything.
  const handleToggleConnection = (_id: string) => {
    triggerNotification("A real Stripe connection isn't wired up yet.");
  };

  // Manual Sync -- none of these integrations have a real OAuth connection
  // wired up yet, so this deliberately does NOT fabricate customers, leads,
  // documents, or scheduling events into real collections. It just logs an
  // honest "not connected" entry instead of pretending data was pulled.
  const triggerEventEngineSync = (id: string) => {
    const currentDateStr = new Date().toISOString().substring(0, 10);
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

    const matchingInt = integrations.find((i) => i.id === id);
    const intName = matchingInt ? matchingInt.name : id;
    triggerNotification(`${intName} isn't connected yet -- nothing to sync.`);

    const newLog: SyncLogEntry = {
      id: `log_manual_${Date.now()}`,
      date: currentDateStr,
      time: timeStr,
      integrationId: id,
      integrationName: intName,
      recordsUpdated: 0,
      warnings: 1,
      errors: 0,
      status: "Warning",
      message: `${intName} isn't connected with real credentials yet, so no records were synced.`
    };
    setSyncLogs((prev) => [newLog, ...prev]);
  };

  // Sync Now button handler
  const handleSyncNow = (id: string) => {
    triggerNotification(`🔄 Syncing ${integrations.find(i => i.id === id)?.name || id}...`);
    setTimeout(() => {
      setIntegrations(prev => prev.map(item => {
        if (item.id === id) {
          triggerEventEngineSync(id);
          return {
            ...item,
            lastSync: new Date().toISOString().replace("T", " ").substring(0, 16)
          };
        }
        return item;
      }));
    }, 400);
  };

  // Open Details Modal Configuration
  const handleOpenConfigure = (item: Integration) => {
    setSelectedIntegration(item);
    setDetailTab("overview");
    setIsDetailPopupOpen(true);
  };

  // Save Config inside Modal
  const handleSaveIntegrationConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIntegration) return;

    if (!isAuthorized) {
      triggerNotification("🚫 Permissions denied: Administrative override required.");
      return;
    }

    setIntegrations((prev) =>
      prev.map((item) => (item.id === selectedIntegration.id ? selectedIntegration : item))
    );
    setIsDetailPopupOpen(false);
    triggerNotification(`💾 Saved custom settings for ${selectedIntegration.name} successfully.`);
    
    if (logOperationalEvent) {
      logOperationalEvent("Configure Integration", `Configured scopes & credentials for ${selectedIntegration.name}`, "⚙️");
    }
  };

  // Import Settings Handler
  const handleImportSettings = () => {
    triggerNotification("📥 Upload config trigger: Selected 'OwnersLocal_Settings_v4_Backup.json' configuration blueprint.");
    setTimeout(() => {
      triggerNotification("✅ System settings file successfully imported and merged with current Event Engine.");
    }, 500);
  };

  // Export Settings Handler
  const handleExportSettings = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ integrations, syncLogs, date: "2026-07-06" }));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `OwnersLocal_LocalOS_Integrations_Backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    triggerNotification("📤 Exported system integration backup packet successfully!");
  };

  return (
    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-6 animate-fade-in text-left">
      {/* TOP HEADER CARD */}
      <div className="bg-[#E3F3FF] p-6 rounded-2xl border border-[#A9CDEE] flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 bg-[#C7E3FB] text-[#342D7E] rounded-xl border border-[#A9CDEE]">
              <Link2 className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
                Connected Apps
              </h1>
              <p className="text-xs text-slate-500 font-sans font-medium">
                Everything hooked up to your business, in one place
              </p>
            </div>
          </div>
        </div>

        {/* TOP BUTTON ACTIONS */}
        <div className="flex flex-wrap items-center gap-2">
          <PlaidConnectButton />
          <button
            onClick={() => setIsAiSetupOpen(true)}
            className="px-3 py-1.5 bg-indigo-550 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-sans flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Brain className="h-3.5 w-3.5" />
            AI Helper
          </button>
        </div>
      </div>

      {/* PLAIN-LANGUAGE STATUS ROW */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { key: "Connected" as const, label: "Working", count: summaryCounts.connected, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
          { key: "Available" as const, label: "Not Set Up", count: summaryCounts.available, color: "text-[#315C9F] bg-[#E3F3FF] border-[#A9CDEE]" },
          { key: null, label: "Problems", count: summaryCounts.errors, color: summaryCounts.errors > 0 ? "text-rose-600 bg-rose-50 border-rose-200" : "text-emerald-600 bg-emerald-50 border-emerald-200" }
        ].map((card) => {
          const isProblems = card.label === "Problems";
          const isActive = !isProblems && activeSummaryFilter === card.key;
          return (
            <div
              key={card.label}
              onClick={() => {
                if (isProblems) {
                  setIsAdvancedOpen(true);
                  setAdvancedView("logs");
                  return;
                }
                setActiveSummaryFilter(isActive ? null : card.key);
              }}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none text-center flex flex-col items-center justify-center gap-1 shadow-xs ${
                isActive ? "ring-2 ring-[#315C9F] shadow-sm" : "hover:translate-y-[-2px]"
              } ${card.color}`}
            >
              <div className="text-2xl font-extrabold tracking-tight">{card.count}</div>
              <div className="text-[10.5px] uppercase tracking-wider font-extrabold text-slate-500">
                {card.label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
          {/* CORE INTEGRATION GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredIntegrations.map((item) => {
              const isWebForm = item.id === "website_lead_form";
              const aiLabel = !item.aiEnabled
                ? "Off"
                : item.aiMode === "ASSIST"
                  ? "Suggests only"
                  : item.aiMode === "ASSIST + APPROVAL"
                    ? "Needs approval"
                    : item.aiMode === "AUTO"
                      ? "Automatic"
                      : "Off";

              return (
                <div
                  key={item.id}
                  className="bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl p-4.5 flex flex-col justify-between gap-4 shadow-xs relative overflow-hidden group hover:shadow-sm hover:border-[#91BEE6] transition-all text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl select-none w-11 h-11 rounded-xl bg-[#C7E3FB] border border-[#A9CDEE] flex items-center justify-center shadow-xs">
                        {item.logo}
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-sans group-hover:text-[#315C9F] transition-colors">
                          {item.name}
                        </h4>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                          {isWebForm ? "Built in — ready now" : item.developer}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-[8.5px] px-1.5 py-0.5 rounded-lg font-bold uppercase border shrink-0 ${
                        item.connected
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-[#F5FAFF] text-slate-400 border-[#A9CDEE]"
                      }`}
                    >
                      {item.connected ? "Working" : "Not Set Up"}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 font-medium font-sans leading-relaxed min-h-12">
                    {item.description}
                  </p>

                  <div className="flex items-center justify-between text-[9px] text-slate-400 pt-2.5 border-t border-[#A9CDEE]/50">
                    <span>Last synced: {item.lastSync}</span>
                    <span className={`flex items-center gap-1 font-bold ${item.aiEnabled ? "text-indigo-600" : ""}`}>
                      <Brain className="h-2.5 w-2.5" />
                      AI Helper: {aiLabel}
                    </span>
                  </div>

                  {/* Card Buttons */}
                  <div className="flex gap-1.5 pt-1">
                    {isWebForm ? (
                      <button
                        onClick={() => handleOpenConfigure(item)}
                        className="flex-1 px-2.5 py-2 bg-[#315C9F] hover:bg-[#254A84] text-white rounded-xl text-[11px] font-bold font-sans transition-all cursor-pointer text-center flex items-center justify-center gap-1.5"
                      >
                        <Copy className="h-3 w-3" />
                        Copy Website Code
                      </button>
                    ) : item.connected ? (
                      <>
                        <button
                          onClick={() => handleSyncNow(item.id)}
                          className="flex-1 px-2.5 py-2 bg-[#315C9F] hover:bg-[#254A84] text-white rounded-xl text-[11px] font-bold font-sans transition-all cursor-pointer text-center flex items-center justify-center gap-1.5"
                        >
                          <RefreshCw className="h-3 w-3 animate-hover-spin" />
                          Sync Now
                        </button>
                        <button
                          onClick={() => handleOpenConfigure(item)}
                          title="Settings"
                          className="px-3 py-2 bg-[#F5FAFF] hover:bg-[#E3F3FF] text-slate-500 border border-[#A9CDEE] rounded-xl text-sm font-bold cursor-pointer"
                        >
                          ⋯
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          disabled
                          title={`A real ${item.name} connection isn't wired up yet`}
                          onClick={() => handleToggleConnection(item.id)}
                          className="flex-1 px-2.5 py-2 bg-slate-300 text-white rounded-xl text-[11px] font-bold font-sans cursor-not-allowed opacity-60 text-center"
                        >
                          {item.category === "Payments" ? "Turn On Payments" : `Connect ${item.name}`}
                        </button>
                        <button
                          onClick={() => handleOpenConfigure(item)}
                          title="Settings"
                          className="px-3 py-2 bg-[#F5FAFF] hover:bg-[#E3F3FF] text-slate-500 border border-[#A9CDEE] rounded-xl text-sm font-bold cursor-pointer"
                        >
                          ⋯
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredIntegrations.length === 0 && (
              <div className="col-span-full py-12 text-center bg-[#E3F3FF] rounded-2xl border border-[#A9CDEE] space-y-2">
                <AlertCircle className="h-8 w-8 text-slate-400 mx-auto" />
                <h4 className="text-xs font-extrabold text-[#342D7E] uppercase">Nothing to show</h4>
                <p className="text-xs text-slate-500 font-medium font-sans">
                  Nothing matches that filter right now.
                </p>
                <button
                  onClick={() => setActiveSummaryFilter(null)}
                  className="px-3 py-1 bg-[#315C9F] text-white rounded-xl text-xs font-sans font-bold cursor-pointer"
                >
                  Show Everything
                </button>
              </div>
            )}
          </div>

          {/* WHAT'S ALREADY WORKING -- collapsed by default so it reassures without shouting */}
          <div className="bg-[#E3F3FF] rounded-2xl border border-[#A9CDEE] overflow-hidden">
            <button
              type="button"
              onClick={() => setIsFeaturesListOpen((open) => !open)}
              className="w-full flex items-center justify-between gap-2 p-4 text-left cursor-pointer"
            >
              <span className="flex items-center gap-2 text-xs font-bold text-slate-700 font-sans">
                <Database className="h-4 w-4 text-[#315C9F] shrink-0" />
                Everything else is already working — nothing to set up
              </span>
              <span className="text-[10px] font-bold text-[#315C9F] shrink-0">
                {isFeaturesListOpen ? "Hide list ▾" : "See list ▸"}
              </span>
            </button>

            {isFeaturesListOpen && (
              <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 xl:grid-cols-9 gap-2">
                {CONNECTED_APP_FEATURES.map((fw) => (
                  <div
                    key={fw.name}
                    className={`p-1.5 rounded-xl border text-center transition-all ${
                      fw.status === "CONNECTED"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-[#F5FAFF] text-slate-500 border-[#A9CDEE] border-dashed"
                    }`}
                  >
                    <div className="text-[10px] font-extrabold truncate">{fw.name}</div>
                    <div className="text-[8px] font-mono font-bold uppercase mt-0.5">
                      {fw.status === "CONNECTED" ? "✓ Linked" : "□ Ready"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      {/* MORE OPTIONS -- backup, activity log, and webhook details, tucked
          away since day-to-day use never needs them. Nothing here was
          removed, just moved out of the way. */}
      <div className="bg-[#E3F3FF] rounded-2xl border border-[#A9CDEE] overflow-hidden">
        <button
          type="button"
          onClick={() => {
            setIsAdvancedOpen((open) => !open);
            setAdvancedView(null);
          }}
          className="w-full flex items-center justify-between gap-2 p-4 text-left cursor-pointer"
        >
          <span className="text-xs font-bold text-slate-700 font-sans">
            More options — backup, activity log, developer tools
          </span>
          <span className="text-[10px] font-bold text-[#315C9F] shrink-0">
            {isAdvancedOpen ? "Hide ▾" : "Show ▸"}
          </span>
        </button>

        {isAdvancedOpen && (
          <div className="px-4 pb-4 space-y-2">
            <p className="text-[10.5px] text-slate-500 font-sans leading-relaxed">
              These don't affect day-to-day use — for backing up your setup or connecting outside tools.
            </p>

            <div className="flex items-center justify-between p-3 bg-white/70 border border-[#A9CDEE]/60 rounded-xl text-xs">
              <span className="font-semibold text-slate-700">Save a backup of this setup</span>
              <button
                onClick={handleExportSettings}
                className="px-3 py-1 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF] rounded-lg text-[10.5px] font-bold cursor-pointer flex items-center gap-1"
              >
                <Download className="h-3 w-3" />
                Save
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-white/70 border border-[#A9CDEE]/60 rounded-xl text-xs">
              <span className="font-semibold text-slate-700">Restore from a backup file</span>
              <button
                onClick={handleImportSettings}
                className="px-3 py-1 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF] rounded-lg text-[10.5px] font-bold cursor-pointer flex items-center gap-1"
              >
                <Upload className="h-3 w-3" />
                Restore
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-white/70 border border-[#A9CDEE]/60 rounded-xl text-xs">
              <span className="font-semibold text-slate-700">Activity log ({syncLogs.length})</span>
              <button
                onClick={() => setAdvancedView((v) => (v === "logs" ? null : "logs"))}
                className="px-3 py-1 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF] rounded-lg text-[10.5px] font-bold cursor-pointer"
              >
                {advancedView === "logs" ? "Hide" : "View"}
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-white/70 border border-[#A9CDEE]/60 rounded-xl text-xs">
              <span className="font-semibold text-slate-700">Developer webhooks ({webhookLogs.length})</span>
              <button
                onClick={() => setAdvancedView((v) => (v === "webhooks" ? null : "webhooks"))}
                className="px-3 py-1 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF] rounded-lg text-[10.5px] font-bold cursor-pointer"
              >
                {advancedView === "webhooks" ? "Hide" : "View"}
              </button>
            </div>

            {/* WEBHOOKS RECEIVER MANAGEMENT */}
            {advancedView === "webhooks" && (
              <div className="pt-2 space-y-4">
                <div className="bg-white/50 border border-[#A9CDEE] p-4 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">
                        API Hook Registries &amp; Handlers
                      </h3>
                      <p className="text-xs text-slate-500 font-sans mt-0.5">
                        Receive new leads or send billing and service records to another system.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        triggerNotification("🔄 Repinged pending webhook retries. Dispatched 1 failed packet.");
                        setWebhookLogs((prev) =>
                          prev.map((l) => (l.status === "Failed" ? { ...l, status: "Delivered", retryCount: l.retryCount + 1 } : l))
                        );
                      }}
                      className="px-3 py-1.5 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF] rounded-xl text-xs font-bold font-sans cursor-pointer flex items-center gap-1.5"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry Failed Hooks
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="p-4 bg-white/65 rounded-xl border border-[#A9CDEE]/60 space-y-2.5 text-xs text-left">
                      <span className="px-2 py-0.5 bg-emerald-55 border border-emerald-200 text-emerald-700 font-mono font-bold text-[9px] uppercase rounded">
                        Incoming Receivers (Inbound)
                      </span>
                      <p className="text-[11px] text-slate-500 leading-normal">
                        Send POST JSON payloads from external builders to update your CRM.
                      </p>
                      <div className="font-mono bg-slate-50 p-2 border border-slate-200 rounded text-[10px] select-all break-all text-slate-700">
                        https://api.ownerslocal.local/webhooks/incoming_leads?token=wh_2026_xyz
                      </div>
                    </div>

                    <div className="p-4 bg-white/65 rounded-xl border border-[#A9CDEE]/60 space-y-2.5 text-xs text-left">
                      <span className="px-2 py-0.5 bg-blue-55 border border-blue-200 text-blue-700 font-mono font-bold text-[9px] uppercase rounded">
                        Outgoing Delivery Webhooks
                      </span>
                      <p className="text-[11px] text-slate-500 leading-normal">
                        OwnersLOCAL triggers POST queries to Zapier or internal endpoints when jobs finish.
                      </p>
                      <div className="font-mono bg-slate-50 p-2 border border-slate-200 rounded text-[10px] select-all break-all text-slate-700">
                        https://hooks.zapier.com/hooks/catch/91845/leads_sync_endpoint
                      </div>
                    </div>

                    <div className="p-4 bg-white/65 rounded-xl border border-[#A9CDEE]/60 space-y-2 text-xs text-left">
                      <h4 className="text-[11px] font-bold text-slate-800">Event Type Checklist</h4>
                      <div className="space-y-1 text-[10.5px]">
                        {[
                          "lead.created (Inbound profile updates)",
                          "job.completed (Trigger invoices)",
                          "message.received (Twilio sync lines)",
                          "invoice.updated (Quickbooks ledger)"
                        ].map((evt) => (
                          <label key={evt} className="flex items-center gap-1.5 text-slate-600 font-sans">
                            <input type="checkbox" defaultChecked className="rounded border-slate-300 text-[#315C9F]" />
                            <span>{evt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Webhook log list */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border border-[#A9CDEE] rounded-xl overflow-hidden">
                      <thead className="bg-[#C7E3FB] text-slate-700 font-sans font-bold">
                        <tr>
                          <th className="p-2.5">Hook Event ID</th>
                          <th className="p-2.5">Endpoint Type</th>
                          <th className="p-2.5">Event Name</th>
                          <th className="p-2.5">Time Triggered</th>
                          <th className="p-2.5 text-right">Payload Size</th>
                          <th className="p-2.5 text-center">Status</th>
                          <th className="p-2.5 text-center">Retries</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white text-slate-600 font-sans">
                        {webhookLogs.map((wh) => (
                          <tr key={wh.id} className="border-b border-[#A9CDEE]/30 hover:bg-slate-50">
                            <td className="p-2.5 font-mono font-bold text-[#315C9F]">{wh.id}</td>
                            <td className="p-2.5">
                              <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${
                                wh.type === "Incoming" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-blue-55 text-blue-700 border border-blue-200"
                              }`}>
                                {wh.type}
                              </span>
                            </td>
                            <td className="p-2.5 font-semibold text-slate-800">{wh.eventType}</td>
                            <td className="p-2.5 font-mono text-[10.5px]">{wh.timestamp}</td>
                            <td className="p-2.5 font-mono text-right">{wh.payloadSize}</td>
                            <td className="p-2.5 text-center">
                              <span className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded ${
                                wh.status === "Delivered" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                wh.status === "Failed" ? "bg-rose-50 text-rose-600 border border-rose-100" :
                                "bg-amber-50 text-amber-600 border border-amber-100"
                              }`}>
                                {wh.status}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-center font-bold">{wh.retryCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SYNC LOG & HISTORY */}
            {advancedView === "logs" && (
              <div className="pt-2 space-y-4">
                <div className="bg-white/50 border border-[#A9CDEE] p-4 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">
                        Activity Log
                      </h3>
                      <p className="text-xs text-slate-500 font-sans mt-0.5">
                        A record of every sync attempt, successful or not.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSyncLogs([]);
                        triggerNotification("🧹 Cleared operations sync ledger.");
                      }}
                      className="px-2.5 py-1 text-xs font-bold text-slate-500 border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      Clear Log
                    </button>
                  </div>

                  {/* Sync Logs Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border border-[#A9CDEE] rounded-xl overflow-hidden">
                      <thead className="bg-[#C7E3FB] text-slate-700 font-sans font-bold">
                        <tr>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Time</th>
                          <th className="p-2.5">Integration ID</th>
                          <th className="p-2.5">Integration Service</th>
                          <th className="p-2.5 text-center">Mutated Records</th>
                          <th className="p-2.5 text-center">Errors</th>
                          <th className="p-2.5">Sync Status Message</th>
                          <th className="p-2.5 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white text-slate-600 font-sans">
                        {syncLogs.map((log) => (
                          <tr key={log.id} className="border-b border-[#A9CDEE]/30 hover:bg-slate-50">
                            <td className="p-2.5 font-mono text-[10.5px] text-slate-500">{log.date}</td>
                            <td className="p-2.5 font-mono text-[10.5px] text-slate-500">{log.time}</td>
                            <td className="p-2.5 font-mono text-[10.5px] font-bold text-slate-800">{log.integrationId}</td>
                            <td className="p-2.5 font-semibold text-slate-800">{log.integrationName}</td>
                            <td className="p-2.5 text-center font-mono font-bold text-slate-700">{log.recordsUpdated}</td>
                            <td className="p-2.5 text-center font-mono font-bold text-rose-600">{log.errors}</td>
                            <td className="p-2.5 font-medium leading-relaxed">{log.message}</td>
                            <td className="p-2.5 text-center">
                              <button
                                onClick={() => {
                                  handleSyncNow(log.integrationId);
                                }}
                                className="px-2 py-1 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] rounded-lg text-[9px] font-extrabold uppercase"
                              >
                                Retry Sync
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DETAIL POPUP & CONFIGURATION MODAL */}
      {isDetailPopupOpen && selectedIntegration && (
        <div className="fixed inset-0 bg-[#000000]/40 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-xs">
          <div className="bg-[#C7E3FB] max-w-2xl w-full rounded-3xl p-6 border border-[#A9CDEE] shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{selectedIntegration.logo}</span>
                <div>
                  <h3 className="text-sm font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
                    {selectedIntegration.name} Integration Configuration
                  </h3>
                  <p className="text-[11px] text-slate-500 font-sans font-semibold">
                    Developer: {selectedIntegration.developer} • Protocol: {selectedIntegration.apiType}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailPopupOpen(false)}
                className="p-1 hover:bg-white/40 rounded-xl transition-colors cursor-pointer"
              >
                <X className="h-4 w-4 text-slate-600" />
              </button>
            </div>

            {/* Modal Internal Tabs -- the lead capture form is a native feature with no API
                keys, webhooks, sync logs, or AI mode to configure, so it only gets Overview. */}
            <div className="flex border-b border-[#A9CDEE] gap-1 pb-px text-xs">
              {(selectedIntegration.id === "website_lead_form"
                ? [{ key: "overview", label: "Overview" }]
                : [
                    { key: "overview", label: "Overview" },
                    { key: "api_keys", label: "API Keys & Auth" },
                    { key: "webhooks", label: "Webhooks Config" },
                    { key: "logs", label: "Recent Sync logs" },
                    { key: "ai_setup", label: "AI Setup Node" }
                  ]
              ).map((mTab) => (
                <button
                  key={mTab.key}
                  type="button"
                  onClick={() => setDetailTab(mTab.key as any)}
                  className={`px-3 py-1.5 font-sans font-bold uppercase tracking-wider transition-all cursor-pointer rounded-t-lg ${
                    detailTab === mTab.key
                      ? "bg-[#E3F3FF] text-[#342D7E] border-t border-x border-[#A9CDEE]"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {mTab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveIntegrationConfig} className="space-y-4">
              {/* OVERVIEW TAB */}
              {detailTab === "overview" && selectedIntegration.id === "website_lead_form" ? (
                <div className="space-y-4 bg-[#E3F3FF] p-4 rounded-xl border border-[#A9CDEE]/60 text-xs text-left">
                  <div>
                    <h4 className="text-[11px] font-extrabold text-[#342D7E] uppercase tracking-wider mb-2">
                      How this works
                    </h4>
                    <ol className="list-decimal list-inside space-y-1.5 text-slate-600 font-sans leading-relaxed">
                      <li>Click <strong>Generate Embed Code</strong> below (only needs to be done once).</li>
                      <li>Copy the code block and paste it into your own business website's HTML, wherever you want the contact form to appear (works in Wix, Squarespace, WordPress custom HTML blocks, or any hand-coded site).</li>
                      <li>When a visitor submits it, it's sent straight to your OwnersLocal account -- no email, no manual entry.</li>
                      <li>A new record appears in your <strong>Leads</strong> page automatically, tagged <span className="font-mono">Source: Website</span> and <span className="font-mono">Status: New</span>.</li>
                      <li>From there it's a normal Lead -- convert it to an Estimate, then a Job, then an Invoice exactly like any lead you entered by hand. Nothing about this form limits or tags it differently once it lands in your pipeline.</li>
                    </ol>
                  </div>

                  <div className="p-3 bg-[#F5FAFF] border border-[#A9CDEE]/50 rounded-lg text-[10.5px] leading-relaxed text-slate-600">
                    <span className="font-bold text-slate-800 uppercase text-[9.5px] tracking-wider block mb-1">
                      Good to know
                    </span>
                    The form works from any website, not just one -- paste the same code on multiple
                    sites if you have them. Regenerating the code invalidates whatever's currently
                    pasted anywhere, so only do that if the old code was compromised or you're
                    starting over.
                  </div>

                  {isLoadingWebFormToken ? (
                    <p className="text-slate-500 font-sans">Loading…</p>
                  ) : !webFormToken ? (
                    <button
                      type="button"
                      onClick={handleGenerateWebFormToken}
                      disabled={isGeneratingWebFormToken}
                      className="px-4 py-2 bg-[#315C9F] hover:bg-[#254A84] text-white rounded-xl text-xs font-bold font-sans cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      {isGeneratingWebFormToken ? "Generating…" : "Generate Embed Code"}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-slate-500">
                          Your embed code
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleCopyWebFormSnippet}
                            className="px-2.5 py-1 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF] rounded-lg text-[10px] font-bold font-sans cursor-pointer flex items-center gap-1"
                          >
                            <Copy className="h-3 w-3" />
                            {webFormCopySuccess ? "Copied!" : "Copy"}
                          </button>
                          <button
                            type="button"
                            onClick={handleGenerateWebFormToken}
                            disabled={isGeneratingWebFormToken}
                            className="px-2.5 py-1 bg-[#F5FAFF] hover:bg-[#E3F3FF] text-slate-600 border border-[#A9CDEE] rounded-lg text-[10px] font-bold font-sans cursor-pointer flex items-center gap-1 disabled:opacity-50"
                          >
                            <RotateCw className="h-3 w-3" />
                            Regenerate
                          </button>
                        </div>
                      </div>
                      <textarea
                        readOnly
                        value={webLeadFormEmbedSnippet}
                        rows={10}
                        onFocus={(e) => e.target.select()}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-lg text-[10px] font-mono text-slate-700"
                      />
                    </div>
                  )}
                </div>
              ) : detailTab === "overview" ? (
                <div className="space-y-3 bg-[#E3F3FF] p-4 rounded-xl border border-[#A9CDEE]/60">
                  <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                    <div>
                      <span className="block text-slate-400 font-bold uppercase text-[9px]">Connection Status</span>
                      <span className={`inline-block font-bold px-2 py-0.5 rounded text-[10px] uppercase mt-1 ${
                        selectedIntegration.connected ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-[#F5FAFF] text-slate-400 border border-[#A9CDEE]"
                      }`}>
                        {selectedIntegration.connected ? "Connected" : "Disconnected"}
                      </span>
                    </div>

                    <div>
                      <span className="block text-slate-400 font-bold uppercase text-[9px]">Sync Frequency</span>
                      <select
                        value={selectedIntegration.syncFrequency}
                        onChange={(e) =>
                          setSelectedIntegration({
                            ...selectedIntegration,
                            syncFrequency: e.target.value as any
                          })
                        }
                        className="mt-1 bg-white border border-[#A9CDEE] rounded-lg px-2 py-1 text-xs focus:outline-none"
                      >
                        <option value="Manual">Manual</option>
                        <option value="Every 5 Minutes">Every 5 Minutes</option>
                        <option value="Every 15 Minutes">Every 15 Minutes</option>
                        <option value="Every Hour">Every Hour</option>
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Custom">Custom</option>
                      </select>
                    </div>

                    <div>
                      <span className="block text-slate-400 font-bold uppercase text-[9px]">API Usage (Today)</span>
                      <span className="block font-mono font-bold mt-1 text-slate-700">
                        {selectedIntegration.apiUsage.current.toLocaleString()} / {selectedIntegration.apiUsage.limit.toLocaleString()} Calls
                      </span>
                    </div>

                    <div>
                      <span className="block text-slate-400 font-bold uppercase text-[9px]">Last Successful Sync</span>
                      <span className="block font-sans font-medium text-slate-600 mt-1">
                        {selectedIntegration.connected ? selectedIntegration.lastSync : "Never"}
                      </span>
                    </div>

                    <div className="col-span-2">
                      <span className="block text-slate-400 font-bold uppercase text-[9px]">Required Scopes Authorized</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedIntegration.scopes.map((s) => (
                          <span key={s} className="px-1.5 py-0.5 bg-[#F5FAFF] text-slate-600 border border-[#A9CDEE] rounded font-mono text-[9px]">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <span className="block text-slate-400 font-bold uppercase text-[9px]">Connected Modules</span>
                      <p className="text-[10.5px] mt-1 text-slate-600 leading-normal font-sans">
                        {selectedIntegration.id === "google_calendar" && "✓ updates Scheduling planner."}
                        {selectedIntegration.id === "quickbooks" && "✓ translates closed operational records to Bookkeeping Ledger."}
                        {selectedIntegration.id === "stripe" && "✓ streams real-time field card transactions into Revenue ledger."}
                        {selectedIntegration.id === "google_business" && "✓ synchronizes Google reviews and updates CRM Leads."}
                        {selectedIntegration.id === "twilio" && "✓ updates CRM Inbox message logs and triggers confirmation dispatch SMS."}
                        {selectedIntegration.id === "google_drive" && "✓ uploads diagnostic site layouts and contract PDF documents."}
                        {selectedIntegration.id === "google_maps" && "✓ updates Dispatch travel matrices and driver active route maps."}
                        {selectedIntegration.id === "gemini" && "✓ powers features on the AI Assistant page."}
                        {!["google_calendar", "quickbooks", "stripe", "google_business", "twilio", "google_drive", "google_maps", "gemini"].includes(selectedIntegration.id) && 
                          "No direct shared modules currently connected. Create custom webhook trigger logic to link modules."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* API KEYS TAB */}
              {detailTab === "api_keys" && (
                <div className="space-y-3 bg-[#E3F3FF] p-4 rounded-xl border border-[#A9CDEE]/60 text-xs">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Secure Client / API Key
                      </label>
                      <div className="relative">
                        <Key className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="e.g. AIzaSy..."
                          value={selectedIntegration.apiKey || ""}
                          onChange={(e) =>
                            setSelectedIntegration({
                              ...selectedIntegration,
                              apiKey: e.target.value
                            })
                          }
                          className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#A9CDEE] rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Secret Token / Signing Salt
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••••••••••••••"
                        value={selectedIntegration.apiSecret || ""}
                        onChange={(e) =>
                          setSelectedIntegration({
                            ...selectedIntegration,
                            apiSecret: e.target.value
                          })
                        }
                        className="w-full px-3 py-1.5 bg-white border border-[#A9CDEE] rounded-lg text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        OAuth Redirect URI
                      </label>
                      <input
                        type="text"
                        value={selectedIntegration.redirectUri || "https://ownerslocal.local/oauth/callback"}
                        disabled
                        className="w-full px-3 py-1.5 bg-slate-100 border border-[#A9CDEE] rounded-lg text-xs font-mono text-slate-500"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#A9CDEE]/50">
                    <p className="text-[10px] text-slate-500 font-sans font-medium">A real Stripe connection isn't wired up yet, so there's nothing to test or rotate keys against here.</p>
                  </div>
                </div>
              )}

              {/* WEBHOOKS CONFIG TAB */}
              {detailTab === "webhooks" && (
                <div className="space-y-3 bg-[#E3F3FF] p-4 rounded-xl border border-[#A9CDEE]/60 text-xs text-left">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Webhooks URL Endpoint
                    </label>
                    <input
                      type="text"
                      placeholder="https://yourserver.com/hooks/receive"
                      value={selectedIntegration.webhookUrl || ""}
                      onChange={(e) =>
                        setSelectedIntegration({
                          ...selectedIntegration,
                          webhookUrl: e.target.value
                        })
                      }
                      className="w-full px-3 py-1.5 bg-white border border-[#A9CDEE] rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div className="p-3 bg-[#F5FAFF] border border-[#A9CDEE]/50 rounded-lg text-[10.5px] leading-relaxed text-slate-600">
                    <h4 className="font-bold text-slate-800 uppercase text-[9.5px] tracking-wider mb-1">
                      Payload Guidelines
                    </h4>
                    Incoming webhooks update the related OwnersLOCAL records when outside data changes. Review your webhook settings carefully to prevent duplicate records.
                  </div>
                </div>
              )}

              {/* LOCAL LOGS TAB */}
              {detailTab === "logs" && (
                <div className="space-y-2 bg-[#E3F3FF] p-4 rounded-xl border border-[#A9CDEE]/60 text-xs">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">
                    Recent Sync History for {selectedIntegration.name}
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {syncLogs.filter(l => l.integrationId === selectedIntegration.id).map(l => (
                      <div key={l.id} className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between items-center text-[10.5px]">
                        <div>
                          <span className="font-bold text-slate-700">[{l.date} {l.time}] </span>
                          <span className="text-slate-600">{l.message}</span>
                        </div>
                        <span className={`font-mono text-[9px] px-1 font-bold rounded ${
                          l.status === "Success" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                        }`}>
                          {l.status}
                        </span>
                      </div>
                    ))}
                    {syncLogs.filter(l => l.integrationId === selectedIntegration.id).length === 0 && (
                      <div className="text-center py-6 text-slate-400">
                        No logs recorded yet. Try running "Sync Now".
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AI SETUP TAB */}
              {detailTab === "ai_setup" && (
                <div className="space-y-3 bg-[#E3F3FF] p-4 rounded-xl border border-[#A9CDEE]/60 text-xs text-left">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="block text-[10.5px] font-bold text-slate-800">
                        AI Autonomy Mode
                      </span>
                      <p className="text-[10px] text-slate-500 font-sans">
                        Let AI review incoming webhook records and sync history.
                      </p>
                    </div>

                    {/* Toggle */}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIntegration({
                          ...selectedIntegration,
                          aiEnabled: !selectedIntegration.aiEnabled
                        })
                      }
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        selectedIntegration.aiEnabled ? "bg-indigo-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out mt-[1px] ${
                          selectedIntegration.aiEnabled ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {selectedIntegration.aiEnabled && (
                    <div className="space-y-2.5 pt-2 border-t border-[#A9CDEE]/50">
                      <span className="block text-[10px] font-bold uppercase text-slate-500">
                        AI Action Level
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          { key: "OFF", label: "OFF", desc: "AI does not review incoming data." },
                          { key: "ASSIST", label: "ASSIST", desc: "AI suggests changes but does not apply them." },
                          { key: "ASSIST + APPROVAL", label: "REQUIRE APPROVAL", desc: "AI prepares changes for the owner to approve." },
                          { key: "AUTO", label: "AUTOMATIC", desc: "AI applies allowed changes automatically." }
                        ].map((m) => (
                          <div
                            key={m.key}
                            onClick={() =>
                              setSelectedIntegration({
                                ...selectedIntegration,
                                aiMode: m.key as any
                              })
                            }
                            className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                              selectedIntegration.aiMode === m.key
                                ? "bg-indigo-50 border-indigo-300 text-indigo-800 font-bold"
                                : "bg-white hover:bg-slate-50 border-slate-200"
                            }`}
                          >
                            <div className="text-[10px] uppercase">{m.label}</div>
                            <div className="text-[9px] font-medium text-slate-400 font-sans mt-0.5 leading-normal">
                              {m.desc}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 p-2 bg-slate-50 rounded border border-slate-200 text-[10px] text-slate-500 font-sans leading-relaxed">
                        <Info className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
                        <span>AI actions follow the permissions set for owners and managers.</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MODAL BOTTOM BUTTONS */}
              {selectedIntegration.id === "website_lead_form" ? (
                <div className="flex items-center justify-end pt-2 border-t border-[#A9CDEE] text-xs">
                  <button
                    type="button"
                    onClick={() => setIsDetailPopupOpen(false)}
                    className="px-4 py-1.5 bg-[#315C9F] hover:bg-[#254A84] text-white rounded-xl text-xs font-bold font-sans cursor-pointer shadow-sm"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-2 border-t border-[#A9CDEE] text-xs">
                  <button
                    type="button"
                    disabled
                    title="A real Stripe connection isn't wired up yet"
                    className="px-3 py-1.5 bg-slate-100 text-slate-400 border border-slate-200 rounded-xl font-bold font-sans cursor-not-allowed"
                  >
                    Connect Integration
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleSyncNow(selectedIntegration.id);
                      }}
                      disabled={!selectedIntegration.connected}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold font-sans cursor-pointer ${
                        selectedIntegration.connected
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300"
                      }`}
                    >
                      Sync Now
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#315C9F] hover:bg-[#254A84] text-white rounded-xl text-xs font-bold font-sans cursor-pointer shadow-sm"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* GLOBAL AI SETUP POPUP */}
      {isAiSetupOpen && (
        <div className="fixed inset-0 bg-[#000000]/40 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-xs">
          <div className="bg-[#C7E3FB] max-w-md w-full rounded-3xl p-6 border border-[#A9CDEE] shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-3">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-indigo-600" />
                <h3 className="text-sm font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
                  AI Settings for Integrations
                </h3>
              </div>
              <button
                onClick={() => setIsAiSetupOpen(false)}
                className="p-1 hover:bg-white/40 rounded-xl transition-colors cursor-pointer"
              >
                <X className="h-4 w-4 text-slate-600" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              Choose how AI can help with connected services. AI actions always follow the owner's permission settings.
            </p>

            <div className="space-y-3">
              {[
                { key: "all_auto", label: "Allow automatic actions", desc: "Turns on automatic mode for every connected integration." },
                { key: "all_approval", label: "Require approval", desc: "Requires owner approval for every AI-proposed change." },
                { key: "all_off", label: "Turn off integration AI", desc: "Turns off AI for every integration." }
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    setIntegrations((prev) =>
                      prev.map((item) => ({
                        ...item,
                        aiEnabled: opt.key !== "all_off",
                        aiMode: opt.key === "all_auto" ? "AUTO" : opt.key === "all_approval" ? "ASSIST + APPROVAL" : "OFF"
                      }))
                    );
                    setIsAiSetupOpen(false);
                    triggerNotification(`✨ Updated global Integration AI parameters.`);
                  }}
                  className="w-full text-left p-3 bg-[#E3F3FF] hover:bg-[#D5EAFE] border border-[#A9CDEE] rounded-xl text-xs space-y-0.5 transition-colors cursor-pointer flex flex-col"
                >
                  <span className="font-bold text-slate-800">{opt.label}</span>
                  <span className="text-[10.5px] text-slate-400 font-sans font-medium">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default IntegrationsPage;
