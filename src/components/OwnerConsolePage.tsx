import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { onCollectionEvent, CollectionEvent } from "../lib/eventBus";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Award,
  Bell,
  Briefcase,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code,
  Cpu,
  Database,
  Download,
  Eye,
  FileText,
  Filter,
  FolderOpen,
  Globe,
  HardDrive,
  History,
  Info,
  Laptop,
  LayoutDashboard,
  Lock,
  Megaphone,
  MessageSquare,
  Network,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  Truck,
  UserCheck,
  UserPlus,
  Users,
  Volume2,
  Wifi,
  Zap
} from "lucide-react";

// Types for Event Engine and Database Logs
export interface EventEngineNode {
  id: string;
  label: string;
  category: string;
  description: string;
  origin: string;
  destination: string;
  changesMade: string;
  triggeredModules: string[];
  x: number;
  y: number;
}

/**
 * One real create/update/delete event observed on the shared Event Bus
 * (see src/lib/eventBus.ts). Every Firestore-backed collection auto-emits
 * through that bus via useFirestoreCollection, so this is a genuine rolling
 * log of what actually happened in this account's data -- never simulated.
 */
export interface RealActivityEvent {
  id: string;
  timestamp: string; // real wall-clock time the event was observed, via new Date()
  collection: string;
  type: "created" | "updated" | "deleted";
  description: string;
}

export interface DecisionLogEntry {
  id: string;
  time: string;
  module: string;
  reason: string;
  decision: string;
  approvedBy: string;
  executed: boolean;
  undoAvailable: boolean;
}

// Every Firestore-backed collection in this app, plus a human-friendly label
// for the ones the Live Event Queue subscribes to below (item 3 of the
// no-fake-data pass). Matches the collection names used in App.tsx's
// useFirestoreCollection(...) calls and the "roster" collection powering
// recentRoster.
const REAL_COLLECTION_LABELS: Record<string, string> = {
  customers: "Customers",
  leads: "Leads",
  estimates: "Estimates",
  scheduling_events: "Scheduling",
  inventory: "Inventory",
  documents: "Documents",
  bulletins: "Bulletins",
  notifications: "Notifications",
  recent_ai_actions: "AI Actions",
  snapshots: "Snapshots",
  revenue_events: "Revenue",
  employees: "Employees",
  time_clock_logs: "Time Clock",
  transactions: "Transactions",
  chart_of_accounts: "Chart of Accounts",
  journal_entries: "Journal Entries",
  invoices: "Invoices",
  bills: "Bills",
  vendors: "Vendors",
  conversations: "Messages",
  bank_accounts: "Bank Accounts",
  recurring_transactions: "Recurring Transactions",
  mileage_logs: "Mileage Logs",
  budgets: "Budgets",
  sales_tax_rates: "Sales Tax Rates",
  roster: "Roster"
};

/**
 * Short, honest description of a real CollectionEvent for the activity log.
 * Only uses field names verified against src/types/domain.ts and
 * src/types/accounting.ts; anything not verified falls back to a generic
 * description rather than guessing a field that might not exist.
 */
function describeRealCollectionEvent(collection: string, evt: CollectionEvent): string {
  const item: any = evt.item || {};
  switch (collection) {
    case "customers":
      return item.company ? `Customer "${item.company}"` : "A customer record";
    case "leads":
      return item.company || item.name ? `Lead "${item.company || item.name}"` : "A lead record";
    case "estimates":
      return item.number ? `Estimate ${item.number}` : "An estimate record";
    case "scheduling_events":
      return item.customer ? `Scheduling event for "${item.customer}"` : "A scheduling event";
    case "inventory":
      return item.name ? `Inventory item "${item.name}"` : "An inventory record";
    case "documents":
      return item.name ? `Document "${item.name}"` : "A document record";
    case "invoices":
      return item.invoiceNumber ? `Invoice ${item.invoiceNumber}` : "An invoice record";
    case "bills":
      return item.billNumber ? `Bill ${item.billNumber}` : "A bill record";
    case "vendors":
      return item.name ? `Vendor "${item.name}"` : "A vendor record";
    case "bank_accounts":
      return item.name ? `Bank account "${item.name}"` : "A bank account record";
    case "employees": {
      const fullName = [item.firstName, item.lastName].filter(Boolean).join(" ");
      return fullName ? `Employee ${fullName}` : "An employee record";
    }
    case "transactions":
      return item.description ? `Transaction "${item.description}"` : "A transaction record";
    default:
      return `A record in ${REAL_COLLECTION_LABELS[collection] || collection}`;
  }
}

interface OwnerConsolePageProps {
  dashboardLeads: any[];
  setDashboardLeads: React.Dispatch<React.SetStateAction<any[]>>;
  revenueResetInterval?: string;
  setRevenueResetInterval?: (val: string) => void;
}

export const OwnerConsolePage: React.FC<OwnerConsolePageProps> = ({
  dashboardLeads,
  setDashboardLeads,
  revenueResetInterval,
  setRevenueResetInterval
}) => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const { customers, setCustomers, schedulingEvents, setSchedulingEvents, recentAiActions, setRecentAiActions, leads, estimates, inventoryList, documents, employees, invoices, transactions, globalAiSetting, setGlobalAiSetting } = useDomainData();
  const { triggerNotification, navigateToScreen } = useNavTelemetry();
  // Check permission: Only accessible by Owner role
  const isAuthorized = activeRole === "Owner";

  if (!isAuthorized) {
    return (
      <div className="bg-red-50 border border-red-200 p-6 rounded-3xl max-w-lg mx-auto mt-12 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-red-600 mx-auto animate-bounce" />
        <h3 className="text-sm font-black uppercase tracking-wider text-red-800">Access Restricted</h3>
        <p className="text-xs text-red-600 leading-relaxed font-sans font-medium">
          Only the business owner can open Owner Settings. You are currently viewing the app as <strong>{activeRole}</strong>. Switch back to Owner to continue.
        </p>
      </div>
    );
  }

  // --- 1. CORE SIMULATION STATE ---
  const [activeTab, setActiveTab] = useState<"engine" | "database" | "ai" | "security" | "backups" | "system">("security");
  const [isConfirmReportModalOpen, setIsConfirmReportModalOpen] = useState<boolean>(false);
  const [devModeActive, setDevModeActive] = useState<boolean>(true);

  // NOTE: This console previously showed simulated CPU/memory/network/
  // active-user/AI-and-API-cost telemetry (cpuUsage, memoryUsage,
  // storageUsage, networkUsage, activeUsersCount, todayRequests,
  // todayAiRequests, monthlyAiCost, monthlyApiCost, overallHealthStatus).
  // This is a client-side React/Firebase app with no server process to
  // sample and no metrics/health endpoint, so none of that could ever be
  // real -- it has been removed rather than faked. See the honest note in
  // the "Infrastructure Diagnostics" card below.

  // Dynamic signal flow index
  const [selectedEventNode, setSelectedEventNode] = useState<string | null>("cust_created");
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [signalAnimationActive, setSignalAnimationActive] = useState<boolean>(false);
  const [animatedPacketIndex, setAnimatedPacketIndex] = useState<number>(-1);

  // Search/Filter for Logs & History
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [eventHistoryFilter, setEventHistoryFilter] = useState<string>("all");
  const [logsFilterLevel, setLogsFilterLevel] = useState<string>("all");
  const [logsSearch, setLogsSearch] = useState<string>("");

  // Real, persisted global AI on/off -- the same value the AI Assistant's
  // Settings tab and Settings page read/write, and what every AI request
  // (App.tsx openPageAIAnalysis/executeConfirmedAIMessage) actually checks
  // before firing.
  const aiEngineRunning = globalAiSetting !== "OFF";
  const previousAiSettingRef = useRef<"ASSIST" | "ASSIST + APPROVAL" | "AUTO">("ASSIST");
  if (globalAiSetting !== "OFF") previousAiSettingRef.current = globalAiSetting;

  // --- Event Node definition & placement for SVG flow diagram ---
  const EVENT_NODES: EventEngineNode[] = [
    { id: "cust_created", label: "Customer Created", category: "customer", description: "Customer profile added to local database registry.", origin: "OwnersLOCAL Portal / Roster Intake", destination: "Leads Processor", changesMade: "Added name, contact, physical dispatch coordinates.", triggeredModules: ["Customers", "Leads"], x: 60, y: 50 },
    { id: "lead_created", label: "Lead Created", category: "leads", description: "A new sales opportunity was added.", origin: "Customer Intake", destination: "Estimates", changesMade: "Added the lead and started tracking its progress.", triggeredModules: ["Leads", "AI Assistant"], x: 260, y: 50 },
    { id: "est_created", label: "Estimate Created", category: "estimates", description: "Quote or service bid generated.", origin: "Leads AI Analyzer", destination: "Scheduling Dispatcher", changesMade: "Saved price quotes, materials array, and signature hooks.", triggeredModules: ["Estimates", "Revenue Matrix"], x: 460, y: 50 },
    { id: "sched_updated", label: "Schedule Updated", category: "scheduling", description: "Appointment allocated on central scheduling board.", origin: "Estimates Approval Pipeline", destination: "Dispatch Controller", changesMade: "Pinned block on Gantt dispatch layout, reserved the assigned crew.", triggeredModules: ["Scheduling", "Notifications Center"], x: 60, y: 180 },
    { id: "disp_updated", label: "Dispatch Updated", category: "dispatch", description: "Crew allocation instructions pushed to field technician dashboard.", origin: "Scheduling Event Trigger", destination: "Routes Optimizer", changesMade: "Sent dispatch ticket, mobile app coordinates activated.", triggeredModules: ["Dispatch", "Time Clock"], x: 260, y: 180 },
    { id: "job_updated", label: "Job Updated", category: "jobs", description: "Work ticket moves from pending to in-progress.", origin: "Dispatch Mobile Sync", destination: "Inventory Allocator", changesMade: "Logged start stamp, activated site-safety hazard checklist.", triggeredModules: ["Jobs", "Roster Control"], x: 460, y: 180 },
    { id: "inv_updated", label: "Inventory Updated", category: "inventory", description: "Stock levels subtracted for job parts consumption.", origin: "Jobs Parts Checklist", destination: "Revenue Calculator", changesMade: "Subtracted PVC pipe bundles & brass fittings.", triggeredModules: ["Inventory", "Documents Drawer"], x: 60, y: 310 },
    { id: "rev_updated", label: "Revenue Updated", category: "revenue", description: "Finance engine recalculates direct margins & labor metrics.", origin: "Inventory Depletion Log", destination: "Dashboard KPI Compiler", changesMade: "Pushed invoice approval, verified stripe transaction ledger.", triggeredModules: ["Revenue", "Settings Configuration"], x: 260, y: 310 },
    { id: "dash_updated", label: "Dashboard Updated", category: "dashboard", description: "System dashboard widgets updated with latest cash metrics.", origin: "Revenue Financial Sweep", destination: "Notifications Dispatcher", changesMade: "Refreshed charts, recalculated gross margin gauge.", triggeredModules: ["Dashboard", "AI Business Insights"], x: 460, y: 310 },
    { id: "notif_sent", label: "Notifications Sent", category: "notifications", description: "Multi-channel notification alerts pushed to correct users.", origin: "Dashboard KPI Updates", destination: "AI Context Optimizer", changesMade: "Emailed owner report, text-messaged technician status.", triggeredModules: ["Notifications", "Messages Suite"], x: 160, y: 440 },
    { id: "ai_context", label: "AI Context Updated", category: "ai", description: "Gemini received the latest business metrics.", origin: "Notifications", destination: "App Data", changesMade: "Added current sales and revenue figures to the AI context.", triggeredModules: ["AI Assistant", "Integrations"], x: 360, y: 440 }
  ];

  // --- 2. LIVE EVENT QUEUE DATA STATE ---
  // Real rolling activity log fed by the shared Event Bus (see the
  // useEffect below that subscribes to onCollectionEvent for every real
  // Firestore-backed collection). Starts empty -- a brand-new account has
  // no history, so it should show none rather than pre-seeded fake activity.
  const [eventsQueue, setEventsQueue] = useState<RealActivityEvent[]>([]);
  const MAX_EVENT_QUEUE_LENGTH = 50;

  // --- 3. SYSTEM LOG RECORDS ---
  // There is no real application logging backend in this app (no server
  // process emitting structured logs), so this starts empty and the UI
  // shows an honest "no logs recorded" state rather than fabricated lines.
  // handleRefreshSystem below appends a genuine entry when the owner
  // actually clicks that button -- that's real (an event that really
  // happened, with a real timestamp), not simulated infrastructure output.
  const [systemLogs, setSystemLogs] = useState<Array<{ id: string; time: string; level: "Error" | "Warning" | "Info" | "Debug"; source: string; message: string }>>([]);

  // --- 4. DATABASE CENTER RECORDS & CHECKS ---
  // Real, live document counts pulled straight from the same
  // Firestore-backed collections every other screen in the app reads via
  // useDomainData(). There is no Firebase Admin SDK available client-side,
  // so per-collection storage footprint and index status can never be real
  // here -- both have been removed rather than faked (see the "not
  // available" note next to the collections table below).
  const dbCollections = useMemo(() => ([
    { name: "Customers", docCount: customers.length },
    { name: "Leads", docCount: leads.length },
    { name: "Estimates", docCount: estimates.length },
    { name: "Scheduling", docCount: schedulingEvents.length },
    { name: "Inventory", docCount: inventoryList.length },
    { name: "Documents", docCount: documents.length },
    { name: "Employees", docCount: employees.length },
    { name: "Invoices", docCount: invoices.length },
    { name: "Transactions", docCount: transactions.length }
  ]), [customers, leads, estimates, schedulingEvents, inventoryList, documents, employees, invoices, transactions]);

  // --- 5. AI DECISION LOG TABLE ---
  // Driven entirely from recentAiActions (real, Firestore-backed -- the
  // same log AIAssistantPage.tsx reads/writes for every real AI-driven
  // action taken across the app). No local fake decision entries.
  const aiDecisionLogs: DecisionLogEntry[] = useMemo(() => (
    recentAiActions.map((a: any) => ({
      id: a.id,
      time: `${a.date || ""} ${a.time || ""}`.trim(),
      module: a.module || "—",
      reason: a.reason || "—",
      decision: a.action || "—",
      approvedBy: a.approvedBy || "—",
      executed: a.status !== "Undone",
      undoAvailable: a.status !== "Undone"
    }))
  ), [recentAiActions]);

  // --- 6. MODULE HEALTH REGISTRY ---
  // Removed. There is no real per-module timing/health telemetry anywhere
  // in this app (no server process, no APM), so a "module health" table
  // could only ever be fabricated numbers. See the honest note in the
  // System tab where this table used to render.

  // --- 7. SECURITY INCIDENTS & ACTIVITY LEDGER ---
  // No real security-scanning backend exists in this app, so this starts
  // empty with an honest empty state instead of fabricated incident rows.
  const [securityLogs, setSecurityLogs] = useState<Array<{ id: string; time: string; type: string; user: string; severity: "Low" | "Medium" | "High"; status: string }>>([]);

  // --- 8. FEATURE FLAGS STATE ---
  // Real local settings state -- these toggles genuinely flip when clicked
  // and their value is genuinely reflected in the UI below. None of them
  // currently gate any other real feature elsewhere in the codebase (grepped
  // each flag id app-wide); they're decorative previews of planned work
  // rather than fabricated data, so they're left in place per the audit's
  // lower-priority guidance for this category.
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({
    voice_assistant: false,
    predictive_scheduling: true,
    advanced_revenue_forecast: true,
    experimental_ai_v2: false,
    beta_websocket_sync: true,
    future_mobile_geofencing: false
  });

  // --- 9. BACKUP MATRIX ---
  // There is no real backup system in this app. Starts empty; nothing
  // pushes fabricated entries into it (see handleBackupNow below, which now
  // shows an honest "not available" message instead of faking a record).
  const [backupHistory] = useState<Array<{ id: string; name: string; date: string; sizeMb: number; verified: boolean; type: "Manual" | "Automatic" }>>([]);

  // --- 10. AI BUSINESS INSIGHT DIAGNOSTICS ---
  // Removed. These were hardcoded fake scores ("Business Health Score: 94%",
  // etc.) with explanations referencing a fabricated customer name. There is
  // no real scoring model behind this in the app, so it's been replaced
  // with an honest "not available" note where it used to render (AI tab).

  // Subscribe the Live Event Queue to every real Firestore-backed collection
  // via the shared Event Bus. Every create/update/delete that actually
  // happens anywhere in the app already emits through this bus (see
  // useFirestoreCollection), so this is a genuine rolling activity log --
  // never simulated. Capped to the most recent MAX_EVENT_QUEUE_LENGTH
  // entries, newest first.
  useEffect(() => {
    const collectionNames = Object.keys(REAL_COLLECTION_LABELS);

    const unsubscribers = collectionNames.map((name) =>
      onCollectionEvent(name, (evt: CollectionEvent) => {
        const entry: RealActivityEvent = {
          id: `evq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toLocaleString(),
          collection: REAL_COLLECTION_LABELS[name] || name,
          type: evt.type,
          description: describeRealCollectionEvent(name, evt)
        };
        setEventsQueue(prev => [entry, ...prev].slice(0, MAX_EVENT_QUEUE_LENGTH));
      })
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  // --- ACTIONS HANDLERS ---
  const handleRefreshSystem = () => {
    triggerNotification("🔄 Owner Command: Refresh acknowledged.");

    // Append a real log entry -- this genuinely happened (the owner just
    // clicked this button, right now), unlike the old fabricated
    // infrastructure-refresh claims.
    const timestampStr = new Date().toLocaleTimeString();
    setSystemLogs(prev => [
      { id: `log_${Date.now()}`, time: timestampStr, level: "Info", source: "Owner Console", message: "Owner manually requested a system refresh from the Owner Console." },
      ...prev
    ]);
  };

  const handleAISystemAudit = () => {
    // There is no real automated AI audit/security-scan pipeline in this
    // deployment -- be honest about that instead of fabricating a "104
    // prompts analyzed, 0 threats found" result.
    triggerNotification("ℹ️ There's no automated AI audit pipeline available in this deployment yet.");
  };

  const handleExportSystemReport = () => {
    setIsConfirmReportModalOpen(true);
  };

  const executeExportSystemReport = () => {
    setIsConfirmReportModalOpen(false);
    triggerNotification("📥 Owner Command: Preparing report from real account data...");

    // Only real, live data -- no simulated CPU/memory/cost telemetry.
    const telemetryBundle = {
      collections: dbCollections,
      aiEngineRunning,
      aiActionsLogged: recentAiActions.length,
      featureFlags,
      backupCount: backupHistory.length,
      timestamp: new Date().toISOString()
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(telemetryBundle, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `OwnersLocal_OS_Report_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    triggerNotification("📥 Report exported successfully!");
  };

  const handleBackupNow = () => {
    // There is no real backup system wired up in this app -- be honest
    // instead of fabricating a "backup completed" record.
    triggerNotification("💾 Backups aren't available in this deployment yet.");
  };

  // Run SVG Signal packet flow animation. This is a static diagram of how
  // the Event Engine cascades between modules (see item 2 of the no-fake-
  // data pass) -- it no longer writes anything into the Live Event Queue,
  // which is reserved for real events observed on the Event Bus.
  const triggerSignalPacketFlow = () => {
    if (signalAnimationActive) return;
    setSignalAnimationActive(true);
    setAnimatedPacketIndex(0);
    triggerNotification("⚡ Showing how updates move through the app...");

    const intervals = [800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800];
    let currentIndex = 0;

    const walkNextNode = () => {
      if (currentIndex < EVENT_NODES.length) {
        setAnimatedPacketIndex(currentIndex);
        setSelectedEventNode(EVENT_NODES[currentIndex].id);
        currentIndex++;
        setTimeout(walkNextNode, intervals[currentIndex - 1] || 800);
      } else {
        setSignalAnimationActive(false);
        setAnimatedPacketIndex(-1);
      }
    };

    walkNextNode();
  };

  // AI CONTROL TRIGGERS -- flips the real global AI setting every AI
  // request in the app actually checks (App.tsx resolveAiMode), and
  // restores whatever mode was active before pausing rather than always
  // resetting to ASSIST.
  const handleToggleAiEngine = () => {
    const next = aiEngineRunning ? "OFF" : previousAiSettingRef.current;
    setGlobalAiSetting(next);
    triggerNotification(`🤖 Gemini AI Engine set to ${next === "OFF" ? "PAUSED" : "ENABLED"}`);
  };

  // UNDO AI DECISION -- marks the underlying real recentAiActions entry as
  // undone (same audit-annotation pattern as App.tsx / AIAssistantPage.tsx).
  // This does not attempt to reverse the original change automatically:
  // recentAiActions entries don't carry structured revert data, so doing
  // that with guessed values would risk silently corrupting real data.
  const handleUndoDecision = (id: string) => {
    setRecentAiActions(prev => prev.map((a: any) => a.id === id ? { ...a, status: "Undone" } : a));
    triggerNotification("🔄 Marked as undone. Reverse the change manually on the relevant page if needed.");
  };

  // FILTERED EVENT LISTS
  const filteredEventsHistory = useMemo(() => {
    return eventsQueue.filter(ev => {
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        return (
          ev.collection.toLowerCase().includes(q) ||
          ev.description.toLowerCase().includes(q) ||
          ev.type.toLowerCase().includes(q)
        );
      }
      if (eventHistoryFilter !== "all" && ev.type.toLowerCase() !== eventHistoryFilter.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [eventsQueue, searchQuery, eventHistoryFilter]);

  // FILTERED LOGS
  const filteredLogsList = useMemo(() => {
    return systemLogs.filter(log => {
      if (logsSearch.trim() !== "") {
        const q = logsSearch.toLowerCase();
        if (!log.message.toLowerCase().includes(q) && !log.source.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (logsFilterLevel !== "all" && log.level.toLowerCase() !== logsFilterLevel.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [systemLogs, logsSearch, logsFilterLevel]);

  // Selected event node lookup
  const selectedNodeData = useMemo(() => {
    return EVENT_NODES.find(n => n.id === selectedEventNode) || null;
  }, [selectedEventNode]);

  return (
    <div className="max-w-2xl space-y-4 text-left animate-fade-in font-sans">
      <div>
        <h1 className="text-xl font-black text-[#1F3557]">Owner Settings</h1>
        <p className="mt-1 text-xs text-[#5E7393]">The technical monitoring screens were removed because they were not needed to run the business.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => navigateToScreen("roster")}
          className="rounded-2xl border border-[#9EC8EF] bg-white p-5 text-left hover:bg-[#EAF5FF] transition-colors"
        >
          <Users className="w-5 h-5 text-[#315C9F] mb-3" />
          <span className="block text-sm font-black text-[#1F3557]">Employee Permissions</span>
          <span className="block mt-1 text-xs text-[#5E7393]">Manage employees, roles, and access.</span>
        </button>
        <button
          onClick={() => navigateToScreen("settings")}
          className="rounded-2xl border border-[#9EC8EF] bg-white p-5 text-left hover:bg-[#EAF5FF] transition-colors"
        >
          <Settings className="w-5 h-5 text-[#315C9F] mb-3" />
          <span className="block text-sm font-black text-[#1F3557]">Business Settings</span>
          <span className="block mt-1 text-xs text-[#5E7393]">Manage company and app settings.</span>
        </button>
      </div>
    </div>
  );

  /* Legacy diagnostic console retained temporarily in source for reference,
     but intentionally unreachable and no longer shipped in the visible UI. */

  return (
    <div className="space-y-6 text-left animate-fade-in font-sans">
      <div>
        <h1 className="text-xl font-black text-[#1F3557]">Owner Settings</h1>
        <p className="text-xs text-[#5E7393] mt-1">Manage permissions, AI activity, and backups.</p>
      </div>

      {/* TABS DECK */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#BDDDF8] pb-1">
        {[
          { id: "security", label: "Permissions", icon: <Lock className="w-3.5 h-3.5" /> },
          { id: "ai", label: "AI Activity", icon: <Sparkles className="w-3.5 h-3.5" /> },
          { id: "backups", label: "Backups", icon: <HardDrive className="w-3.5 h-3.5" /> }
        ].map((tab) => {
          const isAct = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                triggerNotification(`Tab changed to ${tab.label}`);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-t-xl transition-all cursor-pointer ${
                isAct 
                  ? "bg-[#EAF5FF] text-[#1F3557] border-t-2 border-[#1F3557] font-bold" 
                  : "text-[#5E7393] hover:text-[#1F3557] hover:bg-slate-100"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* --- TAB CONTENT: EVENT ENGINE --- */}
      {activeTab === "engine" && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fade-in text-left">
          
          {/* VISUALIZER DIAGRAM SVG */}
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm xl:col-span-8 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider flex items-center gap-1.5">
                  <span className="animate-pulse">🟢</span> Live Event Engine Visualizer Diagram
                </h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                  See how updates move through the app. Scroll to zoom and double-click an item for details.
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 self-stretch sm:self-auto">
                <div className="flex items-center gap-1 bg-[#F5FAFF] p-1 border border-[#BDDDF8] rounded-xl text-xs font-black">
                  <button 
                    onClick={() => setZoomLevel(prev => Math.max(0.6, prev - 0.1))}
                    className="px-2 py-1 bg-white hover:bg-[#BDDDF8] rounded cursor-pointer transition-all"
                  >
                    Zoom Out
                  </button>
                  <span className="px-1 text-[10px] font-mono text-[#1F3557]">{Math.round(zoomLevel * 100)}%</span>
                  <button 
                    onClick={() => setZoomLevel(prev => Math.min(1.6, prev + 0.1))}
                    className="px-2 py-1 bg-white hover:bg-[#BDDDF8] rounded cursor-pointer transition-all"
                  >
                    Zoom In
                  </button>
                </div>

                <button
                  onClick={triggerSignalPacketFlow}
                  disabled={signalAnimationActive}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1.5 ${
                    signalAnimationActive 
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                      : "bg-[#315C9F] text-white hover:bg-[#25467A]"
                  }`}
                >
                  <Play className="w-3 h-3" />
                  <span>Simulate Signal</span>
                </button>
              </div>
            </div>

            {/* FLOW DIAGRAM CONTAINER */}
            <div className="border border-dashed border-[#BDDDF8] rounded-2xl bg-slate-50/50 p-4 relative overflow-auto h-[460px] scrollbar-thin">
              
              <div 
                style={{ 
                  transform: `scale(${zoomLevel})`, 
                  transformOrigin: "top left",
                  width: "550px", 
                  height: "500px" 
                }} 
                className="relative transition-transform duration-300"
              >
                {/* SVG CONNECTIONS WITH FLOWING ANIMS */}
                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none select-none">
                  {/* Dynamic path lines between sequence of nodes */}
                  {/* cust_created -> lead_created */}
                  <path d="M 130 50 L 190 50" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 0 && (
                    <circle cx="130" cy="50" r="4.5" fill="#315C9F" className="animate-ping">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                  {/* lead_created -> est_created */}
                  <path d="M 330 50 L 390 50" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 1 && (
                    <circle cx="330" cy="50" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                  {/* est_created -> sched_updated (cascade downward curve) */}
                  <path d="M 460 65 C 460 120, 60 120, 60 165" stroke="#BDDDF8" strokeWidth="2.5" fill="none" strokeDasharray="4 4" />
                  {animatedPacketIndex === 2 && (
                    <circle cx="460" cy="65" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 C 0 55, -400 55, -400 100" />
                    </circle>
                  )}
                  {/* sched_updated -> disp_updated */}
                  <path d="M 130 180 L 190 180" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 3 && (
                    <circle cx="130" cy="180" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                  {/* disp_updated -> job_updated */}
                  <path d="M 330 180 L 390 180" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 4 && (
                    <circle cx="330" cy="180" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                  {/* job_updated -> inv_updated */}
                  <path d="M 460 195 C 460 250, 60 250, 60 295" stroke="#BDDDF8" strokeWidth="2.5" fill="none" strokeDasharray="4 4" />
                  {animatedPacketIndex === 5 && (
                    <circle cx="460" cy="195" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 C 0 55, -400 55, -400 100" />
                    </circle>
                  )}
                  {/* inv_updated -> rev_updated */}
                  <path d="M 130 310 L 190 310" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 6 && (
                    <circle cx="130" cy="310" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                  {/* rev_updated -> dash_updated */}
                  <path d="M 330 310 L 390 310" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 7 && (
                    <circle cx="330" cy="310" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                  {/* dash_updated -> notif_sent */}
                  <path d="M 460 325 C 460 380, 160 380, 160 425" stroke="#BDDDF8" strokeWidth="2.5" fill="none" strokeDasharray="4 4" />
                  {animatedPacketIndex === 8 && (
                    <circle cx="460" cy="325" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 C 0 55, -300 55, -300 100" />
                    </circle>
                  )}
                  {/* notif_sent -> ai_context */}
                  <path d="M 230 440 L 290 440" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 9 && (
                    <circle cx="230" cy="440" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                </svg>

                {/* NODES LAYER */}
                {EVENT_NODES.map((node) => {
                  const isSelected = selectedEventNode === node.id;
                  const isAnimatingNode = EVENT_NODES[animatedPacketIndex]?.id === node.id;
                  
                  return (
                    <button
                      key={node.id}
                      onClick={() => setSelectedEventNode(node.id)}
                      style={{ left: `${node.x}px`, top: `${node.y}px` }}
                      className={`absolute w-[140px] px-2.5 py-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col justify-between h-[64px] ${
                        isSelected
                          ? "bg-[#315C9F] text-white border-[#1F3557] shadow-md scale-105 z-10"
                          : isAnimatingNode
                          ? "bg-[#BDDDF8] border-[#315C9F] text-[#1F3557] ring-4 ring-[#A9CDEE] z-10"
                          : "bg-white text-slate-800 hover:border-[#315C9F] border-slate-200"
                      }`}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider block truncate">
                        {node.label}
                      </span>
                      <span className={`text-[8.5px] px-1 bg-black/5 rounded font-bold font-mono tracking-wider ${
                        isSelected ? "text-blue-100" : "text-slate-500"
                      }`}>
                        #{node.category}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* TELEMETRY DESCRIPTION SIDE CARD */}
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm xl:col-span-4 flex flex-col gap-4 text-left">
            <div>
              <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Update Details</h4>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5">See how a change moves through connected areas of the app.</p>
            </div>

            {selectedNodeData ? (
              <div className="space-y-4 animate-fade-in text-xs font-medium font-sans">
                <div className="p-3.5 bg-[#EAF5FF] rounded-2xl border border-[#BDDDF8] text-slate-800 space-y-1">
                  <span className="text-[8.5px] font-black uppercase tracking-widest text-[#315C9F] font-mono block">Selected State</span>
                  <h5 className="font-extrabold uppercase text-sm text-[#1F3557]">{selectedNodeData.label}</h5>
                  <p className="text-[11px] text-slate-600 leading-relaxed mt-1 font-sans">{selectedNodeData.description}</p>
                </div>

                <div className="space-y-2.5 font-medium">
                  <div>
                    <span className="text-[9px] uppercase font-black text-slate-400 block tracking-wider">Signal Source</span>
                    <p className="font-bold text-slate-800 font-mono text-[10px]">{selectedNodeData.origin}</p>
                  </div>

                  <div>
                    <span className="text-[9px] uppercase font-black text-slate-400 block tracking-wider">Target Endpoint</span>
                    <p className="font-bold text-slate-800 font-mono text-[10px]">{selectedNodeData.destination}</p>
                  </div>

                  <div>
                    <span className="text-[9px] uppercase font-black text-slate-400 block tracking-wider">Payload Changes Made</span>
                    <p className="font-bold text-slate-700 bg-slate-50 p-2 border border-slate-100 rounded-lg">{selectedNodeData.changesMade}</p>
                  </div>

                  <div>
                    <span className="text-[9px] uppercase font-black text-slate-400 block tracking-wider mb-1">Triggered Modules Cascade</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedNodeData.triggeredModules.map((mod, i) => (
                        <span key={i} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-bold font-mono">
                          🟢 {mod}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <p className="text-xs">Select any node on the diagram to inspect transaction telemetry.</p>
              </div>
            )}
          </div>

          {/* ACTIVE QUEUE LEDGER */}
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm xl:col-span-12 space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Live Activity Log</h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">Real create/update/delete events observed on the shared Event Bus as they happen this session. Nothing here is simulated.</p>
              </div>

              {/* Type Tabs */}
              <div className="flex gap-1 bg-slate-50 p-1 border border-slate-200 rounded-xl text-[10px] font-black">
                {["all", "created", "updated", "deleted"].map((state) => {
                  const isS = eventHistoryFilter === state.toLowerCase();
                  return (
                    <button
                      key={state}
                      onClick={() => setEventHistoryFilter(state.toLowerCase())}
                      className={`px-3 py-1.5 rounded-lg cursor-pointer uppercase transition-all ${
                        isS ? "bg-[#315C9F] text-white" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {state}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs text-left border-collapse font-sans font-medium">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Collection</th>
                    <th className="p-3 text-center">Event Type</th>
                    <th className="p-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {filteredEventsHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400">
                        No activity recorded yet this session. Real create/update/delete events across the app will appear here as they happen.
                      </td>
                    </tr>
                  ) : (
                    filteredEventsHistory.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono text-[10.5px] text-slate-500">{ev.timestamp}</td>
                        <td className="p-3"><span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-bold">{ev.collection}</span></td>
                        <td className="p-3 text-center">
                          <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${
                            ev.type === "created"
                              ? "bg-emerald-50 text-emerald-700"
                              : ev.type === "deleted"
                              ? "bg-red-50 text-red-700"
                              : "bg-blue-50 text-blue-700"
                          }`}>
                            {ev.type}
                          </span>
                        </td>
                        <td className="p-3 max-w-md truncate" title={ev.description}>{ev.description}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* --- TAB CONTENT: DATABASE CENTER --- */}
      {activeTab === "database" && (
        <div className="space-y-6 animate-fade-in text-left">
          
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Firestore Document Explorer Registry</h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">Real, live document counts pulled from this account's own collections.</p>
              </div>
            </div>

            {/* Collections list table */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

              <div className="md:col-span-7 overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left border-collapse font-sans font-medium">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="p-3">Collection Name</th>
                      <th className="p-3 text-right">Active Docs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {dbCollections.map((col) => (
                      <tr key={col.name} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold text-slate-800">📂 {col.name}</td>
                        <td className="p-3 text-right font-mono font-bold">{col.docCount} records</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Honest note sidebar -- replaces the old fabricated "0
                  duplicates / 0 broken references / Analyze / Repair /
                  Rebuild Indexes" diagnostics, none of which could ever be
                  real from a client-side app without the Firebase Admin SDK. */}
              <div className="md:col-span-5 bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
                <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Database Integrity Diagnostics</h5>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Index status, storage footprint, and integrity checks (duplicate documents, broken references, unused space) aren't available client-side in this deployment — they require the Firebase Admin SDK, which this app doesn't run. Nothing is fabricated here in its place.
                </p>
              </div>

            </div>
          </div>

        </div>
      )}

      {/* --- TAB CONTENT: AI CONTROL CENTER --- */}
      {activeTab === "ai" && (
        <div className="space-y-6 animate-fade-in text-left">
          
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Gemini Context Settings</h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">Review AI usage, costs, and recent actions.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleToggleAiEngine}
                  className={`px-3 py-1.5 text-xs font-black uppercase rounded-xl transition-all cursor-pointer border shadow-sm ${
                    aiEngineRunning
                      ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                      : "bg-[#315C9F] text-white border-[#1F3557] hover:bg-[#25467A]"
                  }`}
                >
                  {aiEngineRunning ? "Pause AI" : "Resume AI"}
                </button>

                <button
                  onClick={() => {
                    if (recentAiActions.length === 0) {
                      triggerNotification("There are no AI actions logged yet to export.");
                      return;
                    }
                    const header = "id,date,time,module,action,reason,status,approvedBy\n";
                    const rows = recentAiActions.map((a: any) => [a.id, a.date, a.time, a.module, a.action, a.reason, a.status, a.approvedBy]
                      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
                    const csv = header + rows.join("\n");
                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `ai_action_log_${Date.now()}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    triggerNotification(`📥 Exported ${recentAiActions.length} real AI action log entries.`);
                  }}
                  className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-black uppercase rounded-xl cursor-pointer"
                >
                  Export AI Logs
                </button>
              </div>
            </div>

            {/* AI activity summary -- real counts derived from recentAiActions,
                replacing the old hardcoded "310ms latency / $0.15 cost /
                100% success / 3,410 tokens" fake metrics, none of which had
                any real source. */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-medium font-sans">

              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <span className="text-[9.5px] uppercase font-black text-slate-400 block tracking-wider">AI Actions Logged</span>
                <p className="text-lg font-black text-slate-800 font-mono mt-1">{recentAiActions.length}</p>
                <p className="text-[10px] text-slate-500 leading-none mt-1">All-time, this account</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <span className="text-[9.5px] uppercase font-black text-slate-400 block tracking-wider">Executed</span>
                <p className="text-lg font-black text-slate-800 font-mono mt-1">{recentAiActions.filter((a: any) => a.status !== "Undone").length}</p>
                <p className="text-[10px] text-slate-500 leading-none mt-1">Currently standing actions</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <span className="text-[9.5px] uppercase font-black text-slate-400 block tracking-wider">Reverted</span>
                <p className="text-lg font-black text-slate-800 font-mono mt-1">{recentAiActions.filter((a: any) => a.status === "Undone").length}</p>
                <p className="text-[10px] text-slate-500 leading-none mt-1">Marked undone by the owner</p>
              </div>

            </div>

            {/* AI Business Insight Diagnostics -- removed. This used to be
                hardcoded fake scores ("Business Health Score: 94%", etc.)
                with explanations referencing a fabricated customer name.
                There's no real scoring model behind this in the app. */}
            <div className="bg-[#F5FAFF] p-5 rounded-2xl border border-[#BDDDF8] text-xs font-sans text-slate-500 leading-relaxed">
              <h5 className="text-[10px] font-black uppercase text-[#315C9F] tracking-widest flex items-center gap-1 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> AI Business Insight Diagnostics
              </h5>
              AI-generated business health scoring isn't available in this deployment yet — there's no real model computing it, so nothing is shown here rather than a fabricated score.
            </div>

            {/* AI Decision log table -- driven entirely by recentAiActions
                (real, Firestore-backed). No local fake decision entries. */}
            <div className="space-y-3">
              <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Historical AI Decision Log Ledger</h5>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs text-left border-collapse font-sans font-medium">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="p-3">Time</th>
                      <th className="p-3">AI Module</th>
                      <th className="p-3">Decision Reasoning</th>
                      <th className="p-3">Final Decision Action</th>
                      <th className="p-3">Approved By</th>
                      <th className="p-3 text-center">State</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {aiDecisionLogs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          No AI-driven actions logged yet. Real actions the AI takes across the app will show up here.
                        </td>
                      </tr>
                    ) : (
                      aiDecisionLogs.map((dec) => (
                        <tr key={dec.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-mono text-slate-500">{dec.time}</td>
                          <td className="p-3"><span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-bold">{dec.module}</span></td>
                          <td className="p-3 max-w-xs truncate" title={dec.reason}>{dec.reason}</td>
                          <td className="p-3 font-mono text-[11px] text-[#315C9F]">{dec.decision}</td>
                          <td className="p-3 text-slate-500">{dec.approvedBy}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${
                              dec.executed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                            }`}>
                              {dec.executed ? "Executed" : "Reverted"}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {dec.undoAvailable && dec.executed && (
                              <button
                                onClick={() => handleUndoDecision(dec.id)}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-[9.5px] font-black uppercase tracking-wider rounded cursor-pointer"
                              >
                                Undo Action
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* --- TAB CONTENT: SECURITY --- */}
      {activeTab === "security" && (
        <div className="space-y-6 animate-fade-in text-left">
          
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Administrative Security Console</h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">Control API key rotations, review suspicious login patterns, or invoke master lockout blocks.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => triggerNotification("Access-log review isn't available in this deployment yet — there's no real session-tracking backend to check.")}
                  className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-black uppercase rounded-xl cursor-pointer"
                >
                  Review Access Logs
                </button>

                <button
                  onClick={() => {
                    triggerNotification("Forced logouts aren't available in this deployment yet — there's no real session-management backend wired up.");
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase rounded-xl cursor-pointer shadow-sm border border-amber-500"
                >
                  Force Logouts
                </button>

                <button
                  onClick={() => {
                    triggerNotification("API key rotation isn't available from this console yet — it isn't wired up to any real secrets backend.");
                  }}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase rounded-xl cursor-pointer shadow-sm"
                >
                  Rotate API Keys
                </button>
              </div>
            </div>

            {/* Security Logs list -- no real security-scanning backend
                exists in this app, so this starts empty with an honest
                empty state instead of fabricated incident rows. */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs text-left border-collapse font-sans font-medium">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="p-3">Time</th>
                    <th className="p-3">Security Event</th>
                    <th className="p-3">User</th>
                    <th className="p-3 text-center">Threat Level</th>
                    <th className="p-3 text-right">Status State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {securityLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">
                        No security incidents recorded. This app doesn't run real security scanning yet, so this ledger stays honestly empty rather than showing fabricated incidents.
                      </td>
                    </tr>
                  ) : (
                    securityLogs.map((sec, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono text-slate-500">{sec.time}</td>
                        <td className="p-3 font-bold text-slate-800">🛡️ {sec.type}</td>
                        <td className="p-3 text-slate-600 font-mono">{sec.user}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${
                            sec.severity === "Low"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : sec.severity === "Medium"
                              ? "bg-amber-50 text-amber-700 border border-amber-100"
                              : "bg-red-50 text-red-700 border border-red-100 animate-pulse"
                          }`}>
                            {sec.severity}
                          </span>
                        </td>
                        <td className="p-3 text-right text-slate-500 font-mono">{sec.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* --- TAB CONTENT: BACKUPS --- */}
      {activeTab === "backups" && (
        <div className="space-y-6 animate-fade-in text-left font-sans text-xs">
          
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Central Backup Registry Ledger</h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">There is no real backup system in this app yet.</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleBackupNow}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-black uppercase rounded-xl cursor-pointer shadow-sm transition-all"
                >
                  Create Backup Now
                </button>

                <button
                  onClick={() => {
                    triggerNotification("Cloud backup storage isn't available in this deployment yet.");
                  }}
                  className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-black uppercase rounded-xl cursor-pointer"
                >
                  Verify Cloud Storage
                </button>
              </div>
            </div>

            {/* List -- there is no real backup system in this app, so this
                starts (and stays) empty with an honest message rather than
                fabricated backup records. */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs text-left border-collapse font-sans font-medium">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="p-3">Archive File Name</th>
                    <th className="p-3 text-center">Timestamp Date</th>
                    <th className="p-3 text-center">Data Footprint</th>
                    <th className="p-3 text-center">Verified Registry</th>
                    <th className="p-3 text-center">Type</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {backupHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        No backups on file. Backups aren't available in this deployment yet.
                      </td>
                    </tr>
                  ) : (
                    backupHistory.map((bk) => (
                      <tr key={bk.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono font-bold text-slate-800">📦 {bk.name}</td>
                        <td className="p-3 text-center text-slate-500 font-mono">{bk.date}</td>
                        <td className="p-3 text-center font-mono text-slate-500">{bk.sizeMb} MB</td>
                        <td className="p-3 text-center">
                          <span className="inline-block text-[9px] px-2 py-0.5 rounded-full font-black bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-widest">
                            {bk.verified ? "Verified ✅" : "Unverified"}
                          </span>
                        </td>
                        <td className="p-3 text-center text-slate-600 font-bold">{bk.type}</td>
                        <td className="p-3 text-right">
                          <button
                            className="px-2.5 py-1 bg-slate-100 hover:bg-[#BDDDF8] text-[#1F3557] text-[10px] font-black uppercase tracking-wider border border-slate-200 rounded cursor-pointer"
                          >
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* --- TAB CONTENT: SYSTEM SETTINGS & DEV TOOLS --- */}
      {activeTab === "system" && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fade-in text-left">
          
          {/* FEATURE FLAGS */}
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm xl:col-span-4 space-y-4 text-xs font-medium font-sans">
            <div>
              <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Future Module Feature Flags</h4>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5">Toggle advanced capabilities under development loops.</p>
            </div>

            <div className="space-y-3 font-bold">
              {[
                { id: "voice_assistant", label: "Interactive Voice Assistant", desc: "Allows microphone-based schedule audits." },
                { id: "predictive_scheduling", label: "Predictive Schedule Optimizer", desc: "Auto-shifts Crew paths to prevent overlapping conflicts." },
                { id: "advanced_revenue_forecast", label: "Advanced Revenue Forecast Engine", desc: "Gemini-compiled profit trend calculations." },
                { id: "experimental_ai_v2", label: "Experimental AI Model (Gemini Ultra)", desc: "Enables deeper diagnostic reasoning logs." },
                { id: "beta_websocket_sync", label: "Multi-User WebSocket Synchronization", desc: "Eliminates reload latency loops." },
                { id: "future_mobile_geofencing", label: "Future Mobile Geofencing Trigger", desc: "Automated check-ins for field technicians." }
              ].map((flag) => (
                <div key={flag.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/50 rounded-2xl">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-[#1F3557] font-black truncate">{flag.label}</p>
                    <p className="text-[10px] text-slate-400 font-medium leading-tight font-sans mt-0.5">{flag.desc}</p>
                  </div>
                  <button
                    onClick={() => {
                      setFeatureFlags(prev => {
                        const nextVal = !prev[flag.id];
                        triggerNotification(`⚙️ Flag [${flag.label}] set to ${nextVal ? "ACTIVE" : "INACTIVE"}`);
                        return { ...prev, [flag.id]: nextVal };
                      });
                    }}
                    className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer border transition-all ${
                      featureFlags[flag.id]
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-400 border-slate-200"
                    }`}
                  >
                    {featureFlags[flag.id] ? "Active" : "Inactive"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* DEVELOPER MODE LEDGER & SYSTEM LOGS */}
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm xl:col-span-8 flex flex-col gap-4">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Developer Debug Console</h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">Inspect system level framework handshakes and error logs in real-time.</p>
              </div>

              {/* Log filter controls */}
              <div className="flex items-center gap-2 self-stretch sm:self-auto">
                <select
                  value={logsFilterLevel}
                  onChange={(e) => setLogsFilterLevel(e.target.value)}
                  className="bg-[#F5FAFF] border border-[#BDDDF8] text-[#1F3557] font-bold text-xs p-1.5 rounded-xl outline-none"
                >
                  <option value="all">All Levels</option>
                  <option value="info">Info Logs</option>
                  <option value="warning">Warning Logs</option>
                  <option value="error">Error Logs</option>
                  <option value="debug">Debug Logs</option>
                </select>

                <input
                  type="text"
                  placeholder="Search debug logs..."
                  value={logsSearch}
                  onChange={(e) => setLogsSearch(e.target.value)}
                  className="bg-[#F5FAFF] border border-[#BDDDF8] text-[#1F3557] text-xs p-1.5 rounded-xl outline-none font-medium w-full sm:w-44"
                />
              </div>
            </div>

            {/* Debug Log view -- there is no real application logging
                backend in this app, so this starts (and stays) empty
                except for genuine entries the owner's own actions append
                (see handleRefreshSystem). No fabricated log lines. */}
            <div className="bg-slate-900 rounded-2xl p-4 font-mono text-[10.5px] text-amber-100 space-y-2 h-[340px] overflow-y-auto shadow-inner border border-slate-950">
              {filteredLogsList.length === 0 ? (
                <p className="text-slate-500 select-none">No system logs recorded this session.</p>
              ) : (
                filteredLogsList.map((log) => (
                  <div key={log.id} className="leading-relaxed">
                    <span className="text-slate-400 mr-1 select-none">[{log.time}]</span>
                    <span className={`font-black uppercase mr-1.5 ${
                      log.level === "Error"
                        ? "text-red-400"
                        : log.level === "Warning"
                        ? "text-orange-400"
                        : log.level === "Debug"
                        ? "text-indigo-400"
                        : "text-blue-400"
                    }`}>
                      [{log.level}]
                    </span>
                    <span className="text-slate-400 font-bold mr-1 select-none">[{log.source}]:</span>
                    <span className="text-slate-100">{log.message}</span>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end items-center text-[10.5px] font-semibold text-slate-500">
              <button
                onClick={() => {
                  setSystemLogs([]);
                  triggerNotification("🧹 Log matrices cleared.");
                }}
                className="text-[#315C9F] hover:text-[#1F3557] font-black uppercase tracking-wider"
              >
                Clear Screen Logs
              </button>
            </div>

          </div>

          {/* Module Health Registry removed -- there is no real per-module
              timing/health telemetry anywhere in this app (no server
              process, no APM), so the old table ("Dashboard: Healthy, 14ms",
              etc.) was entirely fabricated. Not replaced with a stand-in;
              simply not shown rather than faked. */}

        </div>
      )}

      {/* --- OWNER QUICK ACTIONS DECK --- */}
      <div className="bg-[#EAF5FF] rounded-3xl p-6 border border-[#BDDDF8] shadow-sm space-y-4">
        <h3 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider flex items-center gap-1.5">
          <span>⚡</span> Owner Fast-Intake Maintenance Commands
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            { label: "Create Backup", action: handleBackupNow, icon: "💾", color: "bg-white hover:bg-[#BDDDF8] border-[#9EC8EF]" },
            { label: "Clear Activity Log", action: () => {
              setEventsQueue([]);
              triggerNotification("Cleared the live activity log for this session.");
            }, icon: "⚙️", color: "bg-white hover:bg-[#BDDDF8] border-[#9EC8EF]" },
            { label: "Run System Audit", action: handleAISystemAudit, icon: "🛡️", color: "bg-white hover:bg-[#BDDDF8] border-[#9EC8EF]" },
            { label: "Verify Permissions", action: () => {
              triggerNotification(`🛡️ Owner-only access confirmed for this console (role: ${activeRole}).`);
            }, icon: "🔑", color: "bg-white hover:bg-[#BDDDF8] border-[#9EC8EF]" }
          ].map((act, i) => (
            <button
              key={i}
              onClick={act.action}
              className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${act.color}`}
            >
              <span className="text-lg select-none">{act.icon}</span>
              <span className="text-[10px] font-black uppercase text-[#1F3557] tracking-wider leading-tight block">{act.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      {isConfirmReportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full mx-4 shadow-xl border border-blue-100 space-y-4 text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-blue-600">
              <Shield className="w-6 h-6 animate-pulse" />
            </div>
            <h3 className="text-base font-extrabold text-[#1F3557] uppercase tracking-wider">Confirm Report Generation</h3>
            <p className="text-xs text-[#5E7393] leading-relaxed font-sans font-medium">
              This action compiles and downloads a JSON report from your account's real data (collection counts, AI action log size, feature flag state).
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={() => setIsConfirmReportModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeExportSystemReport}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1 shadow-md shadow-blue-500/15"
              >
                Authorize & Download
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
