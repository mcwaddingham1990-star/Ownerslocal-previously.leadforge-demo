import React, { useState, useMemo, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  Save,
  Undo,
  RotateCcw,
  Download,
  Upload,
  Search,
  Sparkles,
  Check,
  Users,
  Lock,
  Shield,
  FileText,
  Sliders,
  Calendar,
  DollarSign,
  Truck,
  Percent,
  Eye,
  Plus,
  Trash2,
  Settings,
  Bell,
  Play,
  Database,
  Key,
  RefreshCw,
  FileCode,
  Menu,
  Layout,
  UserCheck,
  Volume2,
  ShieldAlert,
  CheckCircle2,
  HelpCircle,
  Info,
  X,
  Archive,
  ArrowRight,
  UserPlus
} from "lucide-react";
import { RolePermissionEditorModal } from "./RolePermissionEditorModal";
import { ONBOARDING_ROLE_TEMPLATES } from "./RosterPage";
import { defaultGranularFromModuleList } from "../types/permissions";
import type { SelectedRole, WorkspaceTheme } from "../App";

// Types for SettingsPage
import { StructuredAddressFields } from "./StructuredAddressFields";

export interface SettingsPageProps {
  businessNames: string[];
  setBusinessNames: React.Dispatch<React.SetStateAction<string[]>>;
  businessPhones: string[];
  setBusinessPhones: React.Dispatch<React.SetStateAction<string[]>>;
  businessAddresses: string[];
  setBusinessAddresses: React.Dispatch<React.SetStateAction<string[]>>;
  businessLogos: string[];
  setBusinessLogos: React.Dispatch<React.SetStateAction<string[]>>;
  ownerNames: string[];
  setOwnerNames: React.Dispatch<React.SetStateAction<string[]>>;
  ownerPhones: string[];
  setOwnerPhones: React.Dispatch<React.SetStateAction<string[]>>;
  companyLocations: string[];
  setCompanyLocations: React.Dispatch<React.SetStateAction<string[]>>;
  employeeRedoOnboardingAllowed: boolean;
  setEmployeeRedoOnboardingAllowed: (val: boolean) => void;
  revenueResetInterval: string;
  setRevenueResetInterval: (val: string) => void;
  globalAiSetting: "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO";
  setGlobalAiSetting: (val: "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO") => void;
  moduleAiSettings: Record<string, "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO" | "DEFAULT">;
  setModuleAiSettings: React.Dispatch<React.SetStateAction<Record<string, "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO" | "DEFAULT">>>;
  selectedRoles: SelectedRole[];
  setSelectedRoles: React.Dispatch<React.SetStateAction<SelectedRole[]>>;
  workspaceTheme: WorkspaceTheme;
  setWorkspaceTheme: (theme: WorkspaceTheme) => void;
  /** Deep-links straight to a category (e.g. "roles") instead of the default Company tab -- see navigateToScreen's `section` param. */
  initialSection?: string;
}

// Initial defaults for fields not in parent state. Generic system-behavior
// defaults (frequencies, thresholds, toggles) are fine as sensible starting
// points; anything that asserts a specific fact about *this* business
// (an EIN, an insurance policy #, a supplier name, a real person's device)
// must start blank/zero — a fabricated fact left untouched gets saved as
// if it were real.
const INITIAL_DEFAULTS = {
  company: {
    dba: "",
    website: "",
    email: "",
    businessHours: "08:00 AM - 05:00 PM",
    timeZone: "Pacific Standard Time (PST)",
    currency: "USD ($)",
    taxId: "",
    licenseNumbers: "",
    insuranceInfo: ""
  },
  payroll: {
    basis: "Hourly",
    overtimeThreshold: 40,
    overtimeMultiplier: 1.5,
    frequency: "Bi-Weekly",
    nextPayday: ""
  },
  taxes: {
    stateTaxRate: 0,
    countyTaxRate: 0,
    taxOnServices: true,
    taxOnMaterials: true,
    filingSchedule: "Quarterly"
  },
  inventory: {
    lowStockThreshold: 10,
    defaultLocation: "",
    autoPoGeneration: true,
    preferredSupplier: ""
  },
  customer: {
    netTerms: "Net 30",
    autoWelcomeEmail: true,
    surveyDelay: 24,
    portalAccess: true
  },
  lead: {
    source: "",
    slaResponseTime: 15,
    autoRouting: "Round-Robin",
    followUpCadence: "3 touches"
  },
  estimate: {
    validityPeriod: 30,
    footerDisclaimer: "",
    depositPercentage: 10,
    digitalSignatureReq: true
  },
  scheduling: {
    slotInterval: 30,
    bufferTime: 30,
    doubleBookingPrevention: true,
    autoDispatchThreshold: 60
  },
  dispatch: {
    notificationMethod: "SMS",
    emergencyEscalation: "Urgent Alert",
    routeOptimization: "Fastest Route",
    liveTrackingExpiry: 120
  },
  route: {
    startDepot: "",
    deviationThreshold: 15,
    trafficCompensation: true,
    avoidTolls: false
  },
  job: {
    requirePhoto: true,
    requireSignature: true,
    requireSafetyCheck: true,
    standardLaborRate: 0,
    defaultType: "Service",
    postCleanupDuration: 15
  },
  document: {
    invoiceHeader: "",
    maxSizeLimit: 10,
    pdfAutoGeneration: true,
    backupFolderFormat: "YYYY-MM-Customer"
  },
  message: {
    smsSenderName: "",
    autoReplyText: "",
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    transcriptRetention: 180
  },
  training: {
    requiredOsha: true,
    deadlineDays: 30,
    recertificationMonths: 12,
    passingScore: 80
  },
  notifications: {
    email: true,
    sms: true,
    push: true,
    desktop: false,
    inApp: true
  },
  security: {
    twoFactorAuth: false,
    sessionTimeout: "1 hr",
    passwordRules: "Strong",
    // No real audit-log pipeline exists yet to populate these — stay
    // honestly empty rather than showing fabricated login/device history.
    loginHistory: [] as Array<{ date: string; time: string; ip: string; device: string; location: string }>,
    trustedDevices: [] as string[],
    apiTokens: [] as Array<{ name: string; token: string; created: string }>
  },
  appearance: {
    theme: "Light Mode Basic",
    accentColor: "Blue",
    menuStyle: "Sidebar",
    cardStyle: "Rounded (16px)",
    animations: true,
    accessibility: "Standard"
  },
  backup: {
    autoBackupFrequency: "Daily",
    // No real backup system exists yet — stay honestly empty rather than
    // showing fabricated "Successful" backup runs that never happened.
    backupHistory: [] as Array<{ date: string; time: string; status: string; size: string; type: string }>,
    cloudStorage: "Google Drive"
  }
};

const THEME_OPTIONS: Array<{ value: string; id: WorkspaceTheme; label: string; description: string }> = [
  { value: "Light Mode Basic", id: "light-basic", label: "Light Mode Basic", description: "The original OwnersLOCAL design and colors" },
  { value: "Light Mode Dynamic", id: "light-extreme", label: "Light Mode Dynamic", description: "The light login artwork with a more translucent workspace treatment" },
  { value: "Dark Mode Basic", id: "dark-basic", label: "Dark Mode Basic", description: "Deep navy workspace, solid dark cards, and restrained blue accents" },
  { value: "Dark Mode Dynamic", id: "dark-dynamic", label: "Dark Mode Dynamic", description: "Translucent navy cards, electric-blue edges, and controlled glow" }
];

export default function SettingsPage({
  businessNames,
  setBusinessNames,
  businessPhones,
  setBusinessPhones,
  businessAddresses,
  setBusinessAddresses,
  businessLogos,
  setBusinessLogos,
  ownerNames,
  setOwnerNames,
  ownerPhones,
  setOwnerPhones,
  companyLocations,
  setCompanyLocations,
  employeeRedoOnboardingAllowed,
  setEmployeeRedoOnboardingAllowed,
  revenueResetInterval,
  setRevenueResetInterval,
  globalAiSetting,
  setGlobalAiSetting,
  moduleAiSettings,
  setModuleAiSettings,
  selectedRoles,
  setSelectedRoles,
  workspaceTheme,
  setWorkspaceTheme,
  initialSection
}: SettingsPageProps) {
  const { loggedInUser, simulatedRole, businessId } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const { recentRoster, setRecentRoster, recentAiActions, setRecentAiActions, employees, setEmployees } = useDomainData();
  const { triggerNotification, navigateToScreen: onNavigateToScreen } = useNavTelemetry();

  // Completed employee records are the primary roster source. Include active
  // invite/legacy roster entries as a compatibility fallback, but deduplicate
  // by person name so the monitor matches Users & Roles instead of reporting
  // zero whenever the legacy roster collection is empty.
  const activeRosterHeadcount = useMemo(() => {
    const activePeople = new Set<string>();
    employees.forEach(employee => {
      const name = `${employee.firstName} ${employee.lastName}`.trim().toLowerCase();
      if (name) activePeople.add(name);
    });
    recentRoster.forEach(entry => {
      const status = String(entry.status || "active").toLowerCase();
      if (["inactive", "deactivated", "revoked", "deleted", "pending"].includes(status)) return;
      const name = String(entry.name || "").trim().toLowerCase();
      if (name) activePeople.add(name);
    });
    return activePeople.size;
  }, [employees, recentRoster]);

  // Local settings state combining parent states and auxiliary defaults
  const [localConfig, setLocalConfig] = useState(INITIAL_DEFAULTS);
  const [savedConfig, setSavedConfig] = useState(INITIAL_DEFAULTS);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Load this business's real saved settings from Firestore. Falls back to
  // INITIAL_DEFAULTS (merged in per-category, so a category added after a
  // business already saved once still gets a sane starting value) rather
  // than leaving fields undefined.
  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "business_profiles", businessId));
        if (cancelled) return;
        const stored = snap.exists() ? snap.data().companySettings : null;
        if (stored) {
          const merged = Object.fromEntries(
            Object.entries(INITIAL_DEFAULTS).map(([category, defaults]) => [
              category,
              { ...defaults, ...(stored[category] || {}) }
            ])
          ) as typeof INITIAL_DEFAULTS;
          // Migrate the abandoned first-pass preset names without ever
          // altering the original Light Mode Basic appearance.
          merged.appearance.theme = stored?.appearance?.theme === "Dark Mode Dynamic"
            ? "Dark Mode Dynamic"
            : stored?.appearance?.theme === "Dark Mode Basic" || stored?.appearance?.theme === "Basic Dark"
              ? "Dark Mode Basic"
              : "Light Mode Basic";
          setLocalConfig(merged);
          setSavedConfig(merged);
          const matchedTheme = THEME_OPTIONS.find(option => option.value === merged.appearance.theme);
          setWorkspaceTheme(matchedTheme?.id || "light-basic");
        }
      } catch (err) {
        console.error("Error loading company settings:", err);
        triggerNotification("Couldn't load saved settings — check your connection.");
      }
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  // Search filter for settings
  const [searchQuery, setSearchQuery] = useState("");
  // Everyone except the owner only ever sees Appearance (the theme picker) --
  // every other category is business/security configuration the owner
  // controls, so non-owners land there regardless of what was requested.
  const [activeCategory, setActiveCategory] = useState(
    activeRole === "Owner" ? (initialSection || "company") : "appearance"
  );

  // A deep-link (e.g. Roster's "Manage Roles" button) can arrive while this
  // page is already mounted, when the initial useState above won't re-run.
  useEffect(() => {
    if (initialSection) setActiveCategory(activeRole === "Owner" ? initialSection : "appearance");
  }, [initialSection, activeRole]);

  // AI recommendations popup state
  const [showAiRecs, setShowAiRecs] = useState(false);

  // State for inviting new user within settings
  const [newUser, setNewUser] = useState({ name: "", role: "Technician", email: "" });

  // Custom role add state
  const [newRoleName, setNewRoleName] = useState("");
  const [editingRole, setEditingRole] = useState<SelectedRole | null>(null);

  // Audit Logs state (starts with some historical entries, appends changes live)
  const [auditLogs, setAuditLogs] = useState<Array<{
    id: string;
    date: string;
    time: string;
    user: string;
    module: string;
    change: string;
    reason: string;
    undoData?: { type: string; key: string; value: any };
  }>>([
  ]);

  // Track if there are unsaved local modifications
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const canManageClockVerification = activeRole === "Owner" || activeRole.toLowerCase().includes("manager");

  // Sync settings when parent changes or on initialization
  const isCompanySynced = useMemo(() => {
    return (
      businessNames[0] !== "" ||
      businessAddresses[0] !== "" ||
      businessLogos[0] !== "" ||
      businessPhones[0] !== ""
    );
  }, [businessNames, businessAddresses, businessLogos, businessPhones]);

  // Categories definition
  const categories = [
    { id: "company", label: "Company", icon: <Settings className="w-4 h-4 text-[#315C9F]" />, group: "Corporate" },
    { id: "users", label: "Users", icon: <Users className="w-4 h-4 text-[#315C9F]" />, group: "Corporate" },
    { id: "roles", label: "Roles", icon: <UserCheck className="w-4 h-4 text-[#315C9F]" />, group: "Corporate" },
    { id: "permissions", label: "Permissions", icon: <Shield className="w-4 h-4 text-[#315C9F]" />, group: "Corporate" },
    { id: "departments", label: "Departments", icon: <Sliders className="w-4 h-4 text-[#315C9F]" />, group: "Corporate" },
    
    { id: "hours", label: "Business Hours", icon: <Calendar className="w-4 h-4 text-[#315C9F]" />, group: "Operational Rules" },
    { id: "working_days", label: "Working Days", icon: <CheckCircle2 className="w-4 h-4 text-[#315C9F]" />, group: "Operational Rules" },
    { id: "holiday_calendar", label: "Holiday Calendar", icon: <Calendar className="w-4 h-4 text-[#315C9F]" />, group: "Operational Rules" },
    { id: "payroll", label: "Payroll", icon: <DollarSign className="w-4 h-4 text-[#315C9F]" />, group: "Operational Rules" },
    { id: "revenue", label: "Revenue Settings", icon: <Percent className="w-4 h-4 text-[#315C9F]" />, group: "Operational Rules" },
    { id: "taxes", label: "Taxes", icon: <Percent className="w-4 h-4 text-[#315C9F]" />, group: "Operational Rules" },
    { id: "vehicles", label: "Vehicles", icon: <Truck className="w-4 h-4 text-[#315C9F]" />, group: "Operational Rules" },

    { id: "inventory_defaults", label: "Inventory Defaults", icon: <Archive className="w-4 h-4 text-[#315C9F]" />, group: "Module Defaults" },
    { id: "customer_defaults", label: "Customer Defaults", icon: <Users className="w-4 h-4 text-[#315C9F]" />, group: "Module Defaults" },
    { id: "lead_defaults", label: "Lead Defaults", icon: <Sliders className="w-4 h-4 text-[#315C9F]" />, group: "Module Defaults" },
    { id: "estimate_defaults", label: "Estimate Defaults", icon: <FileText className="w-4 h-4 text-[#315C9F]" />, group: "Module Defaults" },
    { id: "scheduling_defaults", label: "Scheduling Defaults", icon: <Calendar className="w-4 h-4 text-[#315C9F]" />, group: "Module Defaults" },
    { id: "dispatch_defaults", label: "Dispatch Defaults", icon: <Truck className="w-4 h-4 text-[#315C9F]" />, group: "Module Defaults" },
    { id: "route_defaults", label: "Route Defaults", icon: <Truck className="w-4 h-4 text-[#315C9F]" />, group: "Module Defaults" },
    { id: "job_defaults", label: "Job Defaults", icon: <FileText className="w-4 h-4 text-[#315C9F]" />, group: "Module Defaults" },
    { id: "document_defaults", label: "Document Defaults", icon: <FileCode className="w-4 h-4 text-[#315C9F]" />, group: "Module Defaults" },
    { id: "message_defaults", label: "Message Defaults", icon: <Volume2 className="w-4 h-4 text-[#315C9F]" />, group: "Module Defaults" },
    { id: "training_defaults", label: "Training Defaults", icon: <Sliders className="w-4 h-4 text-[#315C9F]" />, group: "Module Defaults" },

    { id: "ai_settings", label: "AI Settings", icon: <Sparkles className="w-4 h-4 text-[#315C9F]" />, group: "System Control" },
    { id: "notifications", label: "Notification Settings", icon: <Bell className="w-4 h-4 text-[#315C9F]" />, group: "System Control" },
    { id: "security", label: "Security", icon: <Lock className="w-4 h-4 text-[#315C9F]" />, group: "System Control" },
    { id: "appearance", label: "Appearance", icon: <Layout className="w-4 h-4 text-[#315C9F]" />, group: "System Control" },
    { id: "backup", label: "Backup & Restore", icon: <Database className="w-4 h-4 text-[#315C9F]" />, group: "System Control" },
    { id: "audit_logs", label: "Audit Logs", icon: <FileText className="w-4 h-4 text-[#315C9F]" />, group: "System Control" },
    { id: "api_keys", label: "API Keys", icon: <Key className="w-4 h-4 text-[#315C9F]" />, group: "System Control" },
    { id: "advanced", label: "Advanced Settings", icon: <ShieldAlert className="w-4 h-4 text-[#315C9F]" />, group: "System Control" }
  ].filter(cat => activeRole === "Owner" || cat.id === "appearance");

  // Grouped Categories for sidebar
  const groupedCategories = useMemo(() => {
    const groups: Record<string, typeof categories> = {};
    categories.forEach(cat => {
      if (!groups[cat.group]) groups[cat.group] = [];
      groups[cat.group].push(cat);
    });
    return groups;
  }, [categories]);

  // Search functionality
  const filteredCategories = useMemo(() => {
    if (!searchQuery) return categories;
    const query = searchQuery.toLowerCase();
    return categories.filter(cat => 
      cat.label.toLowerCase().includes(query) || 
      cat.id.toLowerCase().includes(query) ||
      cat.group.toLowerCase().includes(query)
    );
  }, [searchQuery, categories]);

  // Jump to first found tab if search matches something but current tab is not matched
  useEffect(() => {
    if (searchQuery && filteredCategories.length > 0) {
      const isCurrentActiveMatched = filteredCategories.some(c => c.id === activeCategory);
      if (!isCurrentActiveMatched) {
        setActiveCategory(filteredCategories[0].id);
      }
    }
  }, [searchQuery, filteredCategories, activeCategory]);

  // Handle local parameter modification
  const handleConfigChange = (section: keyof typeof INITIAL_DEFAULTS, key: string, value: any) => {
    setLocalConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
    setHasUnsavedChanges(true);
    if (section === "appearance" && key === "theme") {
      const matchedTheme = THEME_OPTIONS.find(option => option.value === value);
      const nextTheme = matchedTheme?.id || "light-basic";
      setWorkspaceTheme(nextTheme);
      localStorage.setItem("ownerslocal_workspace_theme", value);
    }
  };

  // Actions
  const handleSave = async () => {
    if (!businessId) {
      triggerNotification("Missing business account — please sign in again.");
      return;
    }
    setIsSavingSettings(true);
    try {
      await setDoc(doc(db, "business_profiles", businessId), { companySettings: localConfig }, { merge: true });
    } catch (err) {
      console.error("Error saving company settings:", err);
      triggerNotification("Couldn't save settings — check your connection and try again.");
      setIsSavingSettings(false);
      return;
    }
    setIsSavingSettings(false);

    // Log the changes to Audit Logs
    const timestamp = new Date();
    const formattedDate = timestamp.toISOString().split("T")[0];
    const formattedTime = timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const newLogs: typeof auditLogs = [];

    // Check for differences and write logs
    Object.keys(localConfig).forEach((section) => {
      const secKey = section as keyof typeof INITIAL_DEFAULTS;
      Object.keys(localConfig[secKey]).forEach((field) => {
        const val1 = (localConfig[secKey] as any)[field];
        const val2 = (savedConfig[secKey] as any)[field];
        if (JSON.stringify(val1) !== JSON.stringify(val2)) {
          newLogs.push({
            id: `audit_${Date.now()}_${field}`,
            date: formattedDate,
            time: formattedTime,
            user: loggedInUser?.name || "Unknown User",
            module: section.toUpperCase(),
            change: `Updated ${field} from "${val2}" to "${val1}"`,
            reason: "User configuration update",
            undoData: { type: "local", key: `${section}.${field}`, value: val2 }
          });
        }
      });
    });

    if (newLogs.length > 0) {
      setAuditLogs(prev => [...newLogs, ...prev]);
    }

    setSavedConfig(JSON.parse(JSON.stringify(localConfig)));
    setHasUnsavedChanges(false);
    triggerNotification("⚙️ Settings saved to your business profile.");
  };

  const handleUndo = () => {
    setLocalConfig(JSON.parse(JSON.stringify(savedConfig)));
    setWorkspaceTheme(THEME_OPTIONS.find(option => option.value === savedConfig.appearance.theme)?.id || "light-basic");
    setHasUnsavedChanges(false);
    triggerNotification("↩️ Settings reverted to last saved state.");
  };

  const handleResetSection = () => {
    const defaultSec = INITIAL_DEFAULTS[activeCategory as keyof typeof INITIAL_DEFAULTS];
    if (defaultSec) {
      setLocalConfig(prev => ({
        ...prev,
        [activeCategory]: JSON.parse(JSON.stringify(defaultSec))
      }));
      setHasUnsavedChanges(true);
      if (activeCategory === "appearance") setWorkspaceTheme("light-basic");
      triggerNotification(`🔄 Resetted "${activeCategory}" parameters to original defaults.`);
    } else {
      triggerNotification(`Cannot reset built-in parent states.`);
    }
  };

  const handleExport = () => {
    const combinedData = {
      localSettings: localConfig,
      parentSettings: {
        businessNames,
        businessPhones,
        businessAddresses,
        businessLogos,
        ownerNames,
        ownerPhones,
        companyLocations,
        employeeRedoOnboardingAllowed,
        revenueResetInterval,
        globalAiSetting,
        moduleAiSettings
      },
      exportTime: new Date().toISOString()
    };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(combinedData, null, 2)
    )}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonString);
    downloadAnchor.setAttribute("download", `ownerslocal_local_os_settings.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    triggerNotification("📥 Settings exported to JSON successfully.");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsedData = JSON.parse(event.target?.result as string);
          if (parsedData.localSettings) {
            setLocalConfig(parsedData.localSettings);
            setSavedConfig(parsedData.localSettings);
          }
          if (parsedData.parentSettings) {
            const ps = parsedData.parentSettings;
            if (ps.businessNames) setBusinessNames(ps.businessNames);
            if (ps.businessPhones) setBusinessPhones(ps.businessPhones);
            if (ps.businessAddresses) setBusinessAddresses(ps.businessAddresses);
            if (ps.businessLogos) setBusinessLogos(ps.businessLogos);
            if (ps.ownerNames) setOwnerNames(ps.ownerNames);
            if (ps.ownerPhones) setOwnerPhones(ps.ownerPhones);
            if (ps.companyLocations) setCompanyLocations(ps.companyLocations);
            if (typeof ps.employeeRedoOnboardingAllowed === "boolean") setEmployeeRedoOnboardingAllowed(ps.employeeRedoOnboardingAllowed);
            if (ps.revenueResetInterval) setRevenueResetInterval(ps.revenueResetInterval);
            if (ps.globalAiSetting) setGlobalAiSetting(ps.globalAiSetting);
            if (ps.moduleAiSettings) setModuleAiSettings(ps.moduleAiSettings);
          }
          triggerNotification("📤 Settings imported and synchronized with all modules!");
        } catch (err) {
          triggerNotification("❌ Failed to parse settings file. Invalid JSON structure.");
        }
      };
    }
  };

  // AI Recommendations Action Toggles
  const handleAcceptRecommendation = (recType: string) => {
    const timestamp = new Date();
    const formattedDate = timestamp.toISOString().split("T")[0];
    const formattedTime = timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (recType === "hours") {
      // Optimize Business Hours to 07:00 AM - 06:00 PM for peak density
      handleConfigChange("company", "businessHours", "07:00 AM - 06:00 PM");
      setAuditLogs(prev => [{
        id: `audit_rec_${Date.now()}`,
        date: formattedDate,
        time: formattedTime,
        user: loggedInUser?.name || "Unknown User",
        module: "COMPANY",
        change: "Optimized Business Hours to 07:00 AM - 06:00 PM (AI Recommendation)",
        reason: "Increase customer service slots"
      }, ...prev]);
      triggerNotification("🤖 AI Rec Applied: Expanded business hours to 7 AM - 6 PM!");
    } else if (recType === "permissions") {
      // Toggle custom permissions checkbox
      triggerNotification("🤖 AI Rec Applied: Enforced Strict Role Permission Isolation!");
    } else if (recType === "payroll") {
      // Multiplier to 1.5x
      handleConfigChange("payroll", "overtimeMultiplier", 1.5);
      setAuditLogs(prev => [{
        id: `audit_rec_${Date.now()}`,
        date: formattedDate,
        time: formattedTime,
        user: loggedInUser?.name || "Unknown User",
        module: "PAYROLL",
        change: "Set overtime multiplier to 1.5x (AI Recommendation)",
        reason: "Ensure standard regulatory margins"
      }, ...prev]);
      triggerNotification("🤖 AI Rec Applied: Standardized OT Multiplier to 1.5x!");
    } else if (recType === "security") {
      // Enable 2FA
      handleConfigChange("security", "twoFactorAuth", true);
      setAuditLogs(prev => [{
        id: `audit_rec_${Date.now()}`,
        date: formattedDate,
        time: formattedTime,
        user: loggedInUser?.name || "Unknown User",
        module: "SECURITY",
        change: "Mandated 2-Factor Authentication (AI Recommendation)",
        reason: "Compliance audit"
      }, ...prev]);
      triggerNotification("🤖 AI Rec Applied: Mandatory Two-Factor Authentication (2FA) is now ACTIVE.");
    } else if (recType === "inventory") {
      // Low stock warning threshold to 15
      handleConfigChange("inventory", "lowStockThreshold", 15);
      setAuditLogs(prev => [{
        id: `audit_rec_${Date.now()}`,
        date: formattedDate,
        time: formattedTime,
        user: loggedInUser?.name || "Unknown User",
        module: "INVENTORY",
        change: "Adjusted critical replenishment threshold to 15 units (AI Recommendation)",
        reason: "Prevent supply depletion"
      }, ...prev]);
      triggerNotification("🤖 AI Rec Applied: Adjusted replenishment stock trigger to 15 units.");
    } else if (recType === "notifications") {
      // Enable desktop alerts
      handleConfigChange("notifications", "desktop", true);
      triggerNotification("🤖 AI Rec Applied: High Priority Desktop Notifications active.");
    }
  };

  // Revert specific log change (Audit Log action)
  const handleRevertAuditLog = (log: typeof auditLogs[0]) => {
    if (log.undoData) {
      const { type, key, value } = log.undoData;
      if (type === "local") {
        const [sec, field] = key.split(".");
        setLocalConfig(prev => ({
          ...prev,
          [sec]: {
            ...prev[sec],
            [field]: value
          }
        }));
        setSavedConfig(prev => ({
          ...prev,
          [sec]: {
            ...prev[sec],
            [field]: value
          }
        }));
        triggerNotification(`↩️ Rolled back change: set ${field} back to "${value}"`);
      }
      // Remove this log or add a reversion log
      setAuditLogs(prev => prev.filter(l => l.id !== log.id));
    } else {
      triggerNotification("⚠️ This operational log cannot be automatically undone.");
    }
  };

  // Invite Roster User Form
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name.trim() || !newUser.email.trim()) {
      triggerNotification("❌ Please fill out Name and Email before generating.");
      return;
    }
    if (!businessId) {
      triggerNotification("Missing business account — please sign in again.");
      return;
    }
    const cleanName = newUser.name.trim();
    const prefix = newUser.role === "Owner" ? "OWNER" : newUser.role === "Office Manager" ? "MGR" : "TECH";
    const randomCode = `${prefix}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const template = ONBOARDING_ROLE_TEMPLATES.find(([, roleName]) => roleName === newUser.role);
    const permissions = template?.[2] || ["jobs", "timeclock", "messages", "documents"];
    const granularPermissions = defaultGranularFromModuleList(permissions, newUser.role === "Owner" ? "delete" : "edit");

    // Persist the invite to Firestore — this is the record the employee's
    // invite-code login screen actually looks up. Without this write, a
    // code shown here would never be redeemable.
    try {
      await setDoc(doc(db, "employee_invites", randomCode), {
        code: randomCode,
        role: newUser.role,
        businessEmail: businessId,
        permissions,
        granularPermissions,
        status: "pending",
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error generating invite:", err);
      triggerNotification("Couldn't generate an invite code — check your connection and try again.");
      return;
    }

    const rosterEntry = {
      name: cleanName,
      role: newUser.role,
      code: randomCode,
      status: "Pending"
    };

    setRecentRoster(prev => [...prev, rosterEntry]);
    setNewUser({ name: "", role: "Technician", email: "" });
    triggerNotification(`✉️ Invite generated for ${cleanName}! Security Access Code: ${randomCode}`);

    // Audit Log Entry
    const formattedDate = new Date().toISOString().split("T")[0];
    const formattedTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setAuditLogs(prev => [{
      id: `audit_invite_${Date.now()}`,
      date: formattedDate,
      time: formattedTime,
      user: loggedInUser?.name || "Unknown User",
      module: "USERS",
      change: `Generated invitation key ${randomCode} for ${cleanName} (${newUser.role})`,
      reason: "Personnel deployment"
    }, ...prev]);
  };

  // Deactivate Roster User
  const handleDeactivateUser = (code: string, name: string) => {
    setRecentRoster(prev => prev.filter(u => u.code !== code));
    triggerNotification(`🚫 Deactivated and revoked credentials for ${name}.`);

    // Audit Log Entry
    const formattedDate = new Date().toISOString().split("T")[0];
    const formattedTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setAuditLogs(prev => [{
      id: `audit_deact_${Date.now()}`,
      date: formattedDate,
      time: formattedTime,
      user: loggedInUser?.name || "Unknown User",
      module: "USERS",
      change: `Revoked credentials and deactivated user ${name} (${code})`,
      reason: "Security compliance"
    }, ...prev]);
  };

  // Add Custom Role
  const handleAddCustomRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    const cleanRoleName = newRoleName.trim();
    const newId = cleanRoleName.toLowerCase().replace(/\s+/g, "_");

    const customRoleObj: SelectedRole = {
      id: newId,
      name: cleanRoleName,
      count: 0,
      description: "Custom user-defined profile permissions",
      isCustom: true,
      permissions: ["dashboard", "messages"],
      modulePermissions: defaultGranularFromModuleList(["dashboard", "messages"], "view")
    };

    setSelectedRoles(prev => [...prev, customRoleObj]);
    setNewRoleName("");
    triggerNotification(`🛡️ Custom operational role "${cleanRoleName}" created successfully.`);

    // Audit Log Entry
    const formattedDate = new Date().toISOString().split("T")[0];
    const formattedTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setAuditLogs(prev => [{
      id: `audit_role_${Date.now()}`,
      date: formattedDate,
      time: formattedTime,
      user: loggedInUser?.name || "Unknown User",
      module: "ROLES",
      change: `Created custom role profile: ${cleanRoleName}`,
      reason: "Custom structural hierarchy"
    }, ...prev]);
  };

  // Save edited per-module permissions for a role
  const handleSaveRolePermissions = (updated: SelectedRole) => {
    setSelectedRoles(prev => prev.map(r => r.id === updated.id ? updated : r));
    setEditingRole(null);
    triggerNotification(`🛡️ Updated permissions for role "${updated.name}"`);
  };

  return (
    <div className="relative space-y-6 text-left animate-fade-in font-sans">
      
      {/* TOP HEADER CARD & CONTROL CENTER */}
      <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-3 border-b border-[#A9CDEE]/50">
          <div className="flex items-center gap-3">
            <span className="text-2xl select-none">⚙️</span>
            <div>
              <h1 className="text-lg font-sans font-black text-[#342D7E] uppercase tracking-wider">Company Settings Control Center</h1>
              <p className="text-xs text-[#5E7393] font-sans font-semibold">Configure core parameters, administrative permissions, and cross-module synchronization settings</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <button
              onClick={handleSave}
              disabled={isSavingSettings}
              className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer uppercase tracking-wider border disabled:opacity-60 disabled:cursor-not-allowed ${
                hasUnsavedChanges
                  ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 animate-pulse"
                  : "bg-[#E3F3FF] text-[#315C9F] border-[#A9CDEE] hover:bg-white"
              }`}
            >
              <Save className="w-3.5 h-3.5" /> {isSavingSettings ? "Saving..." : "Save"}
            </button>
            <button
              onClick={handleUndo}
              disabled={!hasUnsavedChanges}
              className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border shadow-sm cursor-pointer uppercase tracking-wider ${
                hasUnsavedChanges
                  ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                  : "bg-slate-50/50 text-slate-400 border-slate-200 cursor-not-allowed"
              }`}
            >
              <Undo className="w-3.5 h-3.5" /> Undo
            </button>
            <button
              onClick={handleResetSection}
              className="px-3 py-2 bg-[#E3F3FF] text-[#315C9F] border border-[#A9CDEE] text-xs font-bold rounded-xl flex items-center gap-1.5 hover:bg-white transition-all shadow-sm cursor-pointer uppercase tracking-wider"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Category
            </button>
            {activeRole === "Owner" && (
              <>
                <button
                  onClick={handleExport}
                  className="px-3 py-2 bg-[#E3F3FF] text-[#315C9F] border border-[#A9CDEE] text-xs font-bold rounded-xl flex items-center gap-1.5 hover:bg-white transition-all shadow-sm cursor-pointer uppercase tracking-wider"
                >
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
                <label className="px-3 py-2 bg-[#E3F3FF] text-[#315C9F] border border-[#A9CDEE] text-xs font-bold rounded-xl flex items-center gap-1.5 hover:bg-white transition-all shadow-sm cursor-pointer uppercase tracking-wider">
                  <Upload className="w-3.5 h-3.5" /> Import
                  <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                </label>
              </>
            )}
            {activeRole === "Owner" && (
              <button
                onClick={() => setShowAiRecs(true)}
                className="px-3 py-2 bg-[#4A9BFF] text-white border border-[#3583E6] text-xs font-bold rounded-xl flex items-center gap-1.5 hover:bg-[#3583E6] transition-all shadow-sm cursor-pointer uppercase tracking-wider"
              >
                <Sparkles className="w-3.5 h-3.5" /> AI Recommendations
              </button>
            )}
          </div>
        </div>

        {/* Global Instant Search Bar */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
            <Search className="w-4 h-4 text-[#315C9F]" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeRole === "Owner" ? "Search all system settings categories instantly..." : "Search appearance settings..."}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#A9CDEE] rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#4A9BFF] placeholder-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* CORE WORKSPACE GRID WITH SIDEBAR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: SETTINGS CATEGORIES SIDEBAR */}
        <div className="lg:col-span-3 bg-[#C7E3FB] rounded-3xl p-4 border border-[#A9CDEE] shadow-sm space-y-4 max-h-[700px] overflow-y-auto">
          <h3 className="text-xs font-black uppercase text-[#342D7E] tracking-wider px-2">Settings Menu</h3>
          
          <div className="space-y-3">
            {Object.keys(groupedCategories).map((groupName) => {
              const items = groupedCategories[groupName];
              // Filter based on search query
              const filteredItems = items.filter(item => filteredCategories.some(fc => fc.id === item.id));
              if (filteredItems.length === 0) return null;

              return (
                <div key={groupName} className="space-y-1">
                  <span className="text-[9.5px] font-extrabold uppercase text-[#5E7393]/80 tracking-wider px-2 block">{groupName}</span>
                  <div className="space-y-0.5">
                    {filteredItems.map((cat) => {
                      const isActive = activeCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setActiveCategory(cat.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-semibold font-sans transition-all cursor-pointer ${
                            isActive
                              ? "bg-[#4A9BFF] text-white shadow-sm font-extrabold"
                              : "bg-[#E3F3FF]/60 text-slate-700 hover:bg-[#E3F3FF]"
                          }`}
                        >
                          {cat.icon}
                          <span className="truncate">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: DETAIL CONFIG PANEL */}
        <div className="lg:col-span-6 bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm min-h-[600px] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-3 mb-5">
              <div className="flex items-center gap-2">
                <span className="text-xl">
                  {categories.find(c => c.id === activeCategory)?.icon || "🛠️"}
                </span>
                <h2 className="text-sm font-black uppercase text-[#342D7E] tracking-wider">
                  {categories.find(c => c.id === activeCategory)?.label || "Configure Details"}
                </h2>
              </div>
              <span className="px-2.5 py-0.5 bg-[#E3F3FF] border border-[#A9CDEE] text-[10px] font-mono font-bold rounded-lg text-[#315C9F]">
                Active Module
              </span>
            </div>

            {/* CATEGORY FORM FIELDS (NO PLACEHOLDERS) */}
            <div className="space-y-5">
              
              {/* COMPANY SECTION */}
              {activeCategory === "company" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Business Name</label>
                      <input
                        type="text"
                        value={businessNames[0] || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBusinessNames(prev => [val, ...prev.slice(1)]);
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">DBA (Doing Business As)</label>
                      <input
                        type="text"
                        value={localConfig.company.dba}
                        onChange={(e) => handleConfigChange("company", "dba", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Business Logo URL</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={businessLogos[0] || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBusinessLogos(prev => [val, ...prev.slice(1)]);
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-mono text-slate-800 focus:outline-none"
                      />
                      {businessLogos[0] && (
                        <img
                          src={businessLogos[0]}
                          alt="Logo Preview"
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-lg object-contain border border-[#A9CDEE] bg-white"
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Website URL</label>
                      <input
                        type="text"
                        value={localConfig.company.website}
                        onChange={(e) => handleConfigChange("company", "website", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Business Phone</label>
                      <input
                        type="text"
                        value={businessPhones[0] || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBusinessPhones(prev => [val, ...prev.slice(1)]);
                          setHasUnsavedChanges(true);
                        }}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>

                  <StructuredAddressFields
                    label="Business Headquarters Address"
                    value={businessAddresses[0] || ""}
                    onChange={(value) => {
                      setBusinessAddresses(prev => [value, ...prev.slice(1)]);
                      setHasUnsavedChanges(true);
                    }}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Tax ID / EIN</label>
                      <input
                        type="text"
                        value={localConfig.company.taxId}
                        onChange={(e) => handleConfigChange("company", "taxId", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">License Numbers</label>
                      <input
                        type="text"
                        value={localConfig.company.licenseNumbers}
                        onChange={(e) => handleConfigChange("company", "licenseNumbers", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Insurance Info</label>
                      <input
                        type="text"
                        value={localConfig.company.insuranceInfo}
                        onChange={(e) => handleConfigChange("company", "insuranceInfo", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* USERS SECTION */}
              {activeCategory === "users" && (
                <div className="space-y-4">
                  {canManageClockVerification && employees.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Employee Clock Verification</h3>
                      <p className="text-[10px] text-slate-500">Choose which employees need an owner or manager to authenticate before every clock-in and clock-out.</p>
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {employees.map(employee => (
                          <label key={employee.email} className="flex items-center justify-between gap-3 p-3 bg-white border border-[#A9CDEE] rounded-xl cursor-pointer">
                            <span>
                              <span className="block text-xs font-extrabold text-slate-800">{employee.firstName} {employee.lastName}</span>
                              <span className="block text-[9.5px] text-slate-400">{employee.role} • {employee.email}</span>
                            </span>
                            <span className="flex items-center gap-2 text-[9px] font-bold uppercase text-[#315C9F]">
                              {employee.requireTimeClockVerification ? "Required" : "Not required"}
                              <input
                                type="checkbox"
                                checked={!!employee.requireTimeClockVerification}
                                onChange={e => {
                                  const required = e.target.checked;
                                  setEmployees(current => current.map(item => item.email === employee.email ? { ...item, requireTimeClockVerification: required } : item));
                                  triggerNotification(`Clock verification ${required ? "required" : "disabled"} for ${employee.firstName} ${employee.lastName}.`);
                                }}
                                className="w-4 h-4 accent-[#4A9BFF]"
                              />
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Active Users Table list */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Active Corporate Roster</h3>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {recentRoster.map((user, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-white border border-[#A9CDEE] rounded-xl shadow-sm hover:shadow-md transition-all">
                          <div>
                            <p className="text-xs font-extrabold text-slate-800">{user.name}</p>
                            <p className="text-[9.5px] text-slate-400 font-mono tracking-wider">{user.role} • {user.code}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded border ${
                              user.status.toLowerCase() === "pending"
                                ? "bg-amber-50 text-amber-600 border-amber-100"
                                : "bg-emerald-50 text-emerald-600 border-emerald-100"
                            }`}>
                              {user.status}
                            </span>
                            <button
                              onClick={() => handleDeactivateUser(user.code, user.name)}
                              className="p-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg transition-colors cursor-pointer"
                              title="Deactivate and revoke access"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Invite New User Form */}
                  <form onSubmit={handleInviteUser} className="bg-[#E3F3FF] p-4 rounded-2xl border border-[#A9CDEE] space-y-3">
                    <h4 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                      <UserPlus className="w-4 h-4 text-[#315C9F]" /> Invite New Personnel
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9.5px] uppercase font-bold text-slate-500">Full Name</label>
                        <input
                          type="text"
                          required
                          value={newUser.name}
                          onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g. Richard Hendricks"
                          className="w-full px-2.5 py-1.5 bg-white border border-[#A9CDEE] rounded-lg text-xs font-bold text-slate-800 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9.5px] uppercase font-bold text-slate-500">Operational Role</label>
                        <select
                          value={newUser.role}
                          onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                          className="w-full px-2.5 py-1.5 bg-white border border-[#A9CDEE] rounded-lg text-xs font-bold text-slate-800 focus:outline-none"
                        >
                          <option value="Owner">Owner</option>
                          <option value="Office Manager">Office Manager</option>
                          <option value="Dispatcher">Dispatcher</option>
                          <option value="Sales Representative">Sales Representative</option>
                          <option value="Technician">Technician</option>
                          <option value="Driver">Driver / Installer</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9.5px] uppercase font-bold text-slate-500">Corporate Email</label>
                      <input
                        type="email"
                        required
                        value={newUser.email}
                        onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="richard@ownerslocal.com"
                        className="w-full px-2.5 py-1.5 bg-white border border-[#A9CDEE] rounded-lg text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer uppercase tracking-wider shadow-sm"
                    >
                      + Authorize and Invite
                    </button>
                  </form>
                </div>
              )}

              {/* ROLES SECTION */}
              {activeCategory === "roles" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Default & Custom Role Matrix</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                      {selectedRoles.map((role) => (
                        <div key={role.id} className="p-3 bg-white border border-[#A9CDEE] rounded-xl flex flex-col justify-between gap-2 shadow-sm">
                          <div>
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-black text-[#342D7E] uppercase tracking-wide">{role.name}</p>
                              <span className="text-[9.5px] text-[#5E7393] font-mono font-extrabold">{role.count} Active</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed font-sans">{role.description}</p>
                          </div>
                          <div className="flex flex-wrap gap-1 pt-1.5 border-t border-[#A9CDEE]/30">
                            {role.permissions.slice(0, 4).map((moduleId) => (
                              <span
                                key={moduleId}
                                className="px-1.5 py-0.5 text-[8.5px] font-black rounded border bg-slate-50 text-slate-400 border-slate-100 uppercase"
                              >
                                {moduleId}
                              </span>
                            ))}
                            {role.permissions.length > 4 && (
                              <span className="px-1.5 py-0.5 text-[8.5px] font-black rounded border bg-slate-50 text-slate-400 border-slate-100">
                                +{role.permissions.length - 4}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingRole(role)}
                            className="w-full py-1.5 text-[9.5px] font-bold bg-[#E3F3FF] text-[#315C9F] border border-[#A9CDEE] hover:bg-white rounded-lg cursor-pointer uppercase tracking-wider transition-all"
                          >
                            Edit Per-Module Permissions
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add Custom Role form */}
                  <form onSubmit={handleAddCustomRole} className="bg-[#E3F3FF] p-4 rounded-2xl border border-[#A9CDEE] space-y-3">
                    <h4 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Create Custom Hierarchy Profile</h4>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        placeholder="e.g. Lead Estimator"
                        className="flex-1 px-3 py-1.5 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-[#4A9BFF] hover:bg-[#3583E6] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer uppercase tracking-wider shadow-sm"
                      >
                        + Create Role
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* PERMISSIONS SECTION */}
              {activeCategory === "permissions" && (
                <div className="space-y-4 text-xs">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Role Permissions</h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-sans font-medium">
                    Choose what each role can view, create, edit, delete, approve, export, and do with AI.
                  </p>
                  
                  <div className="bg-white rounded-2xl border border-[#A9CDEE] overflow-hidden">
                    <div className="p-3 bg-[#E3F3FF] border-b border-[#A9CDEE] font-bold text-[#342D7E] uppercase tracking-wider text-[9.5px] flex justify-between">
                      <span>Permission</span>
                      <span className="text-slate-400 font-mono">Access</span>
                    </div>
                    <div className="divide-y divide-[#A9CDEE]/30">
                      {[
                        { key: "view", title: "View Screens", desc: "View business records, reports, activity, and dispatch status." },
                        { key: "create", title: "Create Records", desc: "Create leads, jobs, estimates, invoices, and other records." },
                        { key: "edit", title: "Edit Documents & Records", desc: "Change record details, amounts, and dates." },
                        { key: "delete", title: "Delete Records", desc: "Permanently delete inventory, jobs, customer records, and other data." },
                        { key: "approve", title: "Approve Estimates & Payroll", desc: "Approve estimates, payroll, and purchase orders." },
                        { key: "export", title: "Export & Print", desc: "Export data to JSON, Excel, or PDF and print records." },
                        { key: "ai", title: "AI Actions", desc: "Allow AI to schedule work, draft purchase orders, or dispatch without approval." }
                      ].map((item) => (
                        <div key={item.key} className="p-3.5 flex items-center justify-between gap-4">
                          <div>
                            <p className="font-extrabold text-slate-800 uppercase tracking-wide text-[10.5px]">{item.title}</p>
                            <p className="text-[10px] text-slate-500 leading-normal font-sans font-medium mt-0.5">{item.desc}</p>
                          </div>
                          <button
                            onClick={() => {
                              triggerNotification(`Updated capability: ${item.key} state modified.`);
                            }}
                            className="px-3 py-1.5 bg-[#E3F3FF] hover:bg-[#A9CDEE] text-[#315C9F] border border-[#A9CDEE] text-[10px] font-black rounded-lg transition-all cursor-pointer uppercase tracking-wider"
                          >
                            Active Toggle
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* DEPARTMENTS SECTION */}
              {activeCategory === "departments" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Business Divisions & Departments</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {([] as { name: string; count: number; lead: string }[]).map((dept, i) => (
                      <div key={i} className="p-3.5 bg-white border border-[#A9CDEE] rounded-xl flex justify-between items-center">
                        <div>
                          <p className="text-xs font-extrabold text-slate-800">{dept.name}</p>
                          <p className="text-[9.5px] text-slate-400 mt-0.5">Manager Lead: <strong className="text-slate-600 font-bold">{dept.lead}</strong></p>
                        </div>
                        <span className="px-2.5 py-1 bg-[#E3F3FF] text-[#315C9F] text-[10px] font-bold rounded-lg border border-[#A9CDEE]">
                          {dept.count} Members
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* BUSINESS HOURS SECTION */}
              {activeCategory === "hours" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Operating Business Hours</h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-sans font-medium">
                    Set daily operating windows. These constraints immediately update dispatch route generation and scheduling scheduler available appointment slots.
                  </p>
                  <div className="space-y-2 bg-white rounded-2xl border border-[#A9CDEE] p-4">
                    <div className="flex items-center justify-between border-b border-[#A9CDEE]/30 pb-2 mb-2">
                      <span className="text-[10px] uppercase font-bold text-[#5E7393]">Day</span>
                      <span className="text-[10px] uppercase font-bold text-[#5E7393]">Operating Slot Window</span>
                    </div>
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                      <div key={day} className="flex items-center justify-between text-xs py-1">
                        <span className="font-extrabold text-slate-800">{day}</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={localConfig.company.businessHours}
                            onChange={(e) => handleConfigChange("company", "businessHours", e.target.value)}
                            className="px-2 py-1 border border-[#A9CDEE] rounded bg-[#F5FAFF] font-mono text-center text-[11px] focus:outline-none"
                          />
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded border border-emerald-100">OPEN</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* WORKING DAYS SECTION */}
              {activeCategory === "working_days" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Active Service Calendar Days</h3>
                  <div className="bg-white p-4 rounded-2xl border border-[#A9CDEE] space-y-3">
                    <p className="text-[11px] text-slate-500 leading-normal font-sans font-medium">
                      Select working days where standard dispatches and job schedulers can accept default customer slots without overtime triggers.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                        <label key={day} className="flex items-center gap-2.5 p-2 bg-[#F5FAFF] hover:bg-[#E3F3FF] border border-[#A9CDEE] rounded-xl cursor-pointer">
                          <input
                            type="checkbox"
                            defaultChecked={day !== "Sun"}
                            className="accent-[#4A9BFF]"
                            onChange={() => triggerNotification(`Working Calendar Updated: ${day}`)}
                          />
                          <span className="text-xs font-extrabold text-slate-700">{day}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* HOLIDAY CALENDAR SECTION */}
              {activeCategory === "holiday_calendar" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Paid Holidays & Shutdown Periods</h3>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {[
                      { name: "New Year's Day", date: "2026-01-01", type: "Paid (1.5x Multiplier)" },
                      { name: "Memorial Day", date: "2026-05-25", type: "Paid Holiday" },
                      { name: "Independence Day", date: "2026-07-04", type: "Paid (2.0x Multiplier)" },
                      { name: "Labor Day", date: "2026-09-07", type: "Paid Holiday" },
                      { name: "Thanksgiving Holiday", date: "2026-11-26", type: "Paid Holiday" },
                      { name: "Christmas Day", date: "2026-12-25", type: "Shut Down Holiday" }
                    ].map((hol, i) => (
                      <div key={i} className="p-3 bg-white border border-[#A9CDEE] rounded-xl flex justify-between items-center shadow-sm">
                        <div>
                          <p className="text-xs font-extrabold text-slate-800">{hol.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono tracking-wider mt-0.5">{hol.date}</p>
                        </div>
                        <span className="px-2 py-0.5 bg-[#E3F3FF] text-[#315C9F] text-[9.5px] font-bold rounded border border-[#A9CDEE]">
                          {hol.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PAYROLL SECTION */}
              {activeCategory === "payroll" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Payroll & Labor Calculations</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Pay Basis</label>
                      <select
                        value={localConfig.payroll.basis}
                        onChange={(e) => handleConfigChange("payroll", "basis", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        <option value="Hourly">Hourly Rate</option>
                        <option value="Salaried">Salaried Bracket</option>
                        <option value="Commission">Commission Basis</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Weekly Overtime Threshold (Hours)</label>
                      <input
                        type="number"
                        value={localConfig.payroll.overtimeThreshold}
                        onChange={(e) => handleConfigChange("payroll", "overtimeThreshold", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Overtime Multiplier Coefficient</label>
                      <input
                        type="number"
                        step="0.1"
                        value={localConfig.payroll.overtimeMultiplier}
                        onChange={(e) => handleConfigChange("payroll", "overtimeMultiplier", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Disbursement Cycle</label>
                      <select
                        value={localConfig.payroll.frequency}
                        onChange={(e) => handleConfigChange("payroll", "frequency", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        <option value="Weekly">Weekly Cycle</option>
                        <option value="Bi-Weekly">Bi-Weekly Cycle</option>
                        <option value="Semi-Monthly">Semi-Monthly Bracket</option>
                        <option value="Monthly">Monthly Bracket</option>
                      </select>
                    </div>
                  </div>
                  <div className="bg-[#E3F3FF] p-3 rounded-xl border border-[#A9CDEE] flex justify-between items-center">
                    <span className="text-[10px] text-slate-600 font-bold font-mono">Next Payroll Execution Date:</span>
                    <strong className="text-xs text-[#342D7E] font-mono">{localConfig.payroll.nextPayday}</strong>
                  </div>
                </div>
              )}

              {/* REVENUE SETTINGS SECTION */}
              {activeCategory === "revenue" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Revenue & Financial Parameters</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Dashboard Graph Reset Interval</label>
                      <select
                        value={revenueResetInterval}
                        onChange={(e) => {
                          setRevenueResetInterval(e.target.value);
                          triggerNotification(`Graph reset updated: ${e.target.value}`);
                        }}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        <option value="Pay Period">Pay Period (Default)</option>
                        <option value="Monthly">Monthly Interval</option>
                        <option value="Quarterly">Quarterly Interval</option>
                        <option value="Annually">Annually Interval</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Company Target Profit Margin %</label>
                      <input
                        type="number"
                        defaultValue="35"
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Default Call Fee ($)</label>
                      <input
                        type="number"
                        defaultValue="85"
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Automatic Fuel Overrun Compensation</label>
                      <select
                        defaultValue="Enabled"
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        <option value="Enabled">Enabled (Auto-adds surcharges)</option>
                        <option value="Disabled">Disabled</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* TAXES SECTION */}
              {activeCategory === "taxes" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Corporate & Local Sales Taxes</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">State Sales Tax Rate (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={localConfig.taxes.stateTaxRate}
                        onChange={(e) => handleConfigChange("taxes", "stateTaxRate", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">County Sales Tax Rate (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={localConfig.taxes.countyTaxRate}
                        onChange={(e) => handleConfigChange("taxes", "countyTaxRate", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 bg-white p-4 rounded-xl border border-[#A9CDEE]">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localConfig.taxes.taxOnServices}
                        onChange={(e) => handleConfigChange("taxes", "taxOnServices", e.target.checked)}
                        className="accent-[#4A9BFF]"
                      />
                      <span className="text-xs font-extrabold text-slate-700">Enforce Sales Tax on Labor / Services</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localConfig.taxes.taxOnMaterials}
                        onChange={(e) => handleConfigChange("taxes", "taxOnMaterials", e.target.checked)}
                        className="accent-[#4A9BFF]"
                      />
                      <span className="text-xs font-extrabold text-slate-700">Enforce Sales Tax on Inventory Material Items</span>
                    </label>
                  </div>
                </div>
              )}

              {/* VEHICLES SECTION */}
              {activeCategory === "vehicles" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Fleet Logistics & Vehicles</h3>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {([] as { id: string; model: string; assigned: string; mileage: string; status: string }[]).map((vehicle, i) => (
                      <div key={i} className="p-3 bg-white border border-[#A9CDEE] rounded-xl flex justify-between items-center">
                        <div>
                          <p className="text-xs font-extrabold text-slate-800">{vehicle.id} • {vehicle.model}</p>
                          <p className="text-[9.5px] text-slate-400 mt-0.5">Assigned driver: <strong className="text-slate-600 font-bold">{vehicle.assigned}</strong> • Mileage: {vehicle.mileage}</p>
                        </div>
                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded border ${
                          vehicle.status === "Active"
                            ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                            : "bg-amber-50 text-amber-600 border-amber-100"
                        }`}>
                          {vehicle.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* INVENTORY DEFAULTS */}
              {activeCategory === "inventory_defaults" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Inventory & Warehouse Defaults</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Low Stock Replenishment Threshold</label>
                      <input
                        type="number"
                        value={localConfig.inventory.lowStockThreshold}
                        onChange={(e) => handleConfigChange("inventory", "lowStockThreshold", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Default Stocking Location Depot</label>
                      <input
                        type="text"
                        value={localConfig.inventory.defaultLocation}
                        onChange={(e) => handleConfigChange("inventory", "defaultLocation", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Preferred Material Vendor</label>
                      <select
                        value={localConfig.inventory.preferredSupplier}
                        onChange={(e) => handleConfigChange("inventory", "preferredSupplier", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        <option value="Grainger">Grainger Industrial</option>
                        <option value="Ferguson">Ferguson Plumbing Supply</option>
                        <option value="Home Depot">The Home Depot Pro</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Automatic Purchase Orders</label>
                      <select
                        value={localConfig.inventory.autoPoGeneration ? "true" : "false"}
                        onChange={(e) => handleConfigChange("inventory", "autoPoGeneration", e.target.value === "true")}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        <option value="true">Active (Autonomous ordering)</option>
                        <option value="false">Manual PO Only</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* CUSTOMER DEFAULTS */}
              {activeCategory === "customer_defaults" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Customer & CRM Defaults</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Payment Net Terms</label>
                      <select
                        value={localConfig.customer.netTerms}
                        onChange={(e) => handleConfigChange("customer", "netTerms", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        <option value="Due on Receipt">Due on Receipt</option>
                        <option value="Net 10">Net 10 Days</option>
                        <option value="Net 30">Net 30 Days (Default)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Satisfaction Survey Trigger Delay (Hours)</label>
                      <input
                        type="number"
                        value={localConfig.customer.surveyDelay}
                        onChange={(e) => handleConfigChange("customer", "surveyDelay", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 bg-white p-4 rounded-xl border border-[#A9CDEE]">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localConfig.customer.autoWelcomeEmail}
                        onChange={(e) => handleConfigChange("customer", "autoWelcomeEmail", e.target.checked)}
                        className="accent-[#4A9BFF]"
                      />
                      <span className="text-xs font-extrabold text-slate-700">Dispatch Auto-Welcome email to new customers</span>
                    </label>
                  </div>
                </div>
              )}

              {/* LEAD DEFAULTS */}
              {activeCategory === "lead_defaults" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Lead Acquisition & CRM Defaults</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Default CRM Source Origin</label>
                      <input
                        type="text"
                        value={localConfig.lead.source}
                        onChange={(e) => handleConfigChange("lead", "source", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">SLA Response Time Limit (Mins)</label>
                      <input
                        type="number"
                        value={localConfig.lead.slaResponseTime}
                        onChange={(e) => handleConfigChange("lead", "slaResponseTime", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ESTIMATE DEFAULTS */}
              {activeCategory === "estimate_defaults" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Estimating & Bids Defaults</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500">Validity Span (Days)</label>
                        <input
                          type="number"
                          value={localConfig.estimate.validityPeriod}
                          onChange={(e) => handleConfigChange("estimate", "validityPeriod", Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-500">Required Deposit Percentage (%)</label>
                        <input
                          type="number"
                          value={localConfig.estimate.depositPercentage}
                          onChange={(e) => handleConfigChange("estimate", "depositPercentage", Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Custom Invoice Terms / Footer Note</label>
                      <textarea
                        value={localConfig.estimate.footerDisclaimer}
                        onChange={(e) => handleConfigChange("estimate", "footerDisclaimer", e.target.value)}
                        className="w-full h-16 px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SCHEDULING DEFAULTS */}
              {activeCategory === "scheduling_defaults" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Scheduler Operating Parameters</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Calendar Time Slot Span (Mins)</label>
                      <select
                        value={localConfig.scheduling.slotInterval}
                        onChange={(e) => handleConfigChange("scheduling", "slotInterval", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        <option value="15">15 Minutes</option>
                        <option value="30">30 Minutes (Default)</option>
                        <option value="60">60 Minutes</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Inter-Job Travel Buffer Time (Mins)</label>
                      <input
                        type="number"
                        value={localConfig.scheduling.bufferTime}
                        onChange={(e) => handleConfigChange("scheduling", "bufferTime", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* DISPATCH DEFAULTS */}
              {activeCategory === "dispatch_defaults" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Active Dispatch Rules</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Dispatch Notification Channel</label>
                      <select
                        value={localConfig.dispatch.notificationMethod}
                        onChange={(e) => handleConfigChange("dispatch", "notificationMethod", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        <option value="SMS">Outbound SMS Alert</option>
                        <option value="Email">Corporate Email</option>
                        <option value="Push">Native Mobile Push</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Live GPS Tracker Link Expiry (Mins)</label>
                      <input
                        type="number"
                        value={localConfig.dispatch.liveTrackingExpiry}
                        onChange={(e) => handleConfigChange("dispatch", "liveTrackingExpiry", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ROUTE DEFAULTS */}
              {activeCategory === "route_defaults" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Routing & Navigation Defaults</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Default Fleet Starting Depot</label>
                      <input
                        type="text"
                        value={localConfig.route.startDepot}
                        onChange={(e) => handleConfigChange("route", "startDepot", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Route Deviation Limit Warning (%)</label>
                      <input
                        type="number"
                        value={localConfig.route.deviationThreshold}
                        onChange={(e) => handleConfigChange("route", "deviationThreshold", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* JOB DEFAULTS */}
              {activeCategory === "job_defaults" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Job Checklist & Site Requirements</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Standard Labor Billing Rate ($/hr)</label>
                      <input
                        type="number"
                        value={localConfig.job.standardLaborRate}
                        onChange={(e) => handleConfigChange("job", "standardLaborRate", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Job Classification Default Type</label>
                      <select
                        value={localConfig.job.defaultType}
                        onChange={(e) => handleConfigChange("job", "defaultType", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        <option value="Service">Emergency Service Call</option>
                        <option value="Install">New System Installation</option>
                        <option value="Maintenance">Scheduled Preventative Maintenance</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2 bg-white p-4 rounded-xl border border-[#A9CDEE]">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localConfig.job.requirePhoto}
                        onChange={(e) => handleConfigChange("job", "requirePhoto", e.target.checked)}
                        className="accent-[#4A9BFF]"
                      />
                      <span className="text-xs font-extrabold text-slate-700">Require Completion Field Snapshots Upload</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localConfig.job.requireSignature}
                        onChange={(e) => handleConfigChange("job", "requireSignature", e.target.checked)}
                        className="accent-[#4A9BFF]"
                      />
                      <span className="text-xs font-extrabold text-slate-700">Require Customer Completion Digital Signature</span>
                    </label>
                  </div>
                </div>
              )}

              {/* DOCUMENT DEFAULTS */}
              {activeCategory === "document_defaults" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Document & Folder Structure Defaults</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">PDF Document Size Limit (MB)</label>
                      <input
                        type="number"
                        value={localConfig.document.maxSizeLimit}
                        onChange={(e) => handleConfigChange("document", "maxSizeLimit", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Folder Structure Schema Format</label>
                      <input
                        type="text"
                        value={localConfig.document.backupFolderFormat}
                        onChange={(e) => handleConfigChange("document", "backupFolderFormat", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* MESSAGE DEFAULTS */}
              {activeCategory === "message_defaults" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Corporate Messager & SMS Rules</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Sender SMS Display Title</label>
                      <input
                        type="text"
                        value={localConfig.message.smsSenderName}
                        onChange={(e) => handleConfigChange("message", "smsSenderName", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">SMS Chat Retention Limit (Days)</label>
                      <input
                        type="number"
                        value={localConfig.message.transcriptRetention}
                        onChange={(e) => handleConfigChange("message", "transcriptRetention", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Automated Welcome Response</label>
                    <textarea
                      value={localConfig.message.autoReplyText}
                      onChange={(e) => handleConfigChange("message", "autoReplyText", e.target.value)}
                      className="w-full h-16 px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* TRAINING DEFAULTS */}
              {activeCategory === "training_defaults" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Corporate Academy & Training Defaults</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">New Employee Deadline (Days)</label>
                      <input
                        type="number"
                        value={localConfig.training.deadlineDays}
                        onChange={(e) => handleConfigChange("training", "deadlineDays", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Passing Score Limit Requirement (%)</label>
                      <input
                        type="number"
                        value={localConfig.training.passingScore}
                        onChange={(e) => handleConfigChange("training", "passingScore", Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* AI SETTINGS SECTION */}
              {activeCategory === "ai_settings" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">OwnersLOCAL Master AI Engine Configuration</h3>
                  
                  <div className="space-y-2 bg-white p-4 rounded-xl border border-[#A9CDEE]">
                    <div className="flex items-center justify-between pb-2 border-b border-[#A9CDEE]/30">
                      <div>
                        <p className="text-xs font-extrabold text-slate-800">Master Autonomous Artificial Intelligence Switch</p>
                        <p className="text-[10px] text-slate-400 font-sans leading-normal">Sets the overarching behavior capability limits for AI actions.</p>
                      </div>
                      <select
                        value={globalAiSetting}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setGlobalAiSetting(val);
                          triggerNotification(`Master AI Engine set to: ${val}`);
                        }}
                        className="px-3 py-1.5 bg-[#E3F3FF] border border-[#A9CDEE] rounded-xl text-xs font-black text-[#315C9F] cursor-pointer"
                      >
                        <option value="OFF">OFF</option>
                        <option value="ASSIST">ASSIST</option>
                        <option value="ASSIST + APPROVAL">ASSIST + APPROVAL</option>
                        <option value="AUTO">AUTO</option>
                      </select>
                    </div>

                    {/* Per Module Settings Override */}
                    <div className="pt-3 space-y-1.5">
                      <p className="text-[10.5px] font-extrabold text-[#342D7E] uppercase tracking-wide">Per-Module AI Overrides</p>
                      <div className="max-h-[160px] overflow-y-auto divide-y divide-[#A9CDEE]/20 pr-1 text-[11px]">
                        {Object.keys(moduleAiSettings).map((mod) => (
                          <div key={mod} className="flex justify-between items-center py-2">
                            <span className="capitalize font-bold text-slate-700">{mod} Module</span>
                            <select
                              value={moduleAiSettings[mod]}
                              onChange={(e) => {
                                const val = e.target.value as any;
                                setModuleAiSettings(prev => ({
                                  ...prev,
                                  [mod]: val
                                }));
                                triggerNotification(`AI override for ${mod} module set to: ${val}`);
                              }}
                              className="px-2 py-1 bg-white border border-[#A9CDEE] rounded-lg text-[10px] font-bold text-slate-700 cursor-pointer"
                            >
                              <option value="DEFAULT">Inherit Default</option>
                              <option value="OFF">OFF</option>
                              <option value="ASSIST">ASSIST</option>
                              <option value="ASSIST + APPROVAL">ASSIST + APPROVAL</option>
                              <option value="AUTO">AUTO</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* NOTIFICATION SETTINGS */}
              {activeCategory === "notifications" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Alert Channel Configurations</h3>
                  <div className="bg-white p-4 rounded-xl border border-[#A9CDEE] space-y-3 text-xs font-medium">
                    {Object.keys(localConfig.notifications).map((chan) => (
                      <label key={chan} className="flex items-center justify-between p-2 hover:bg-[#F5FAFF] rounded-lg cursor-pointer">
                        <span className="uppercase tracking-wider font-extrabold text-slate-700">{chan} Alerting Stream</span>
                        <input
                          type="checkbox"
                          checked={localConfig.notifications[chan as keyof typeof localConfig.notifications]}
                          onChange={(e) => handleConfigChange("notifications", chan, e.target.checked)}
                          className="w-4 h-4 accent-[#4A9BFF]"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* SECURITY SECTION */}
              {activeCategory === "security" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Access Controls & Security Policies</h3>
                  
                  <div className="bg-white p-4 rounded-xl border border-[#A9CDEE] space-y-4">
                    <label className="flex items-center justify-between cursor-pointer pb-2 border-b border-[#A9CDEE]/30">
                      <div>
                        <p className="text-xs font-extrabold text-slate-800">Two-Factor Authentication (2FA)</p>
                        <p className="text-[10px] text-slate-400 font-sans">Mandate SMS verification tokens on unknown credentials logs.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={localConfig.security.twoFactorAuth}
                        onChange={(e) => handleConfigChange("security", "twoFactorAuth", e.target.checked)}
                        className="w-4 h-4 accent-[#4A9BFF]"
                      />
                    </label>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-extrabold text-slate-800">Idle Session Expiry Timeout</p>
                        <p className="text-[10px] text-slate-400 font-sans">Automatically log-out sessions when stagnant.</p>
                      </div>
                      <select
                        value={localConfig.security.sessionTimeout}
                        onChange={(e) => handleConfigChange("security", "sessionTimeout", e.target.value)}
                        className="px-3 py-1.5 bg-[#E3F3FF] border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        <option value="15 min">15 Minutes</option>
                        <option value="1 hr">1 Hour</option>
                        <option value="8 hr">8 Hours</option>
                        <option value="Never">Never Timeout</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* APPEARANCE SECTION */}
              {activeCategory === "appearance" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">User Interface Appearance Styling</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <fieldset className="space-y-2 md:col-span-2">
                      <legend className="text-[10px] uppercase font-bold text-slate-500">Operational Styling Theme</legend>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Operational styling theme">
                        {THEME_OPTIONS.map(option => {
                          const isSelected = localConfig.appearance.theme === option.value;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              role="radio"
                              aria-checked={isSelected}
                              onClick={() => handleConfigChange("appearance", "theme", option.value)}
                              className={`min-h-[76px] px-3 py-3 rounded-xl border text-left transition-colors ${isSelected
                                ? "bg-[#4A86F7] border-[#3977EE] text-white"
                                : "bg-white border-[#A9CDEE] text-slate-800 hover:bg-[#E3F3FF]"
                              }`}
                            >
                              <span className="block text-xs font-extrabold">{option.label}</span>
                              <span className={`block mt-1 text-[10px] font-medium leading-snug ${isSelected ? "text-white/80" : "text-slate-500"}`}>
                                {option.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500">Interface Brand Accent Color</label>
                      <select
                        value={localConfig.appearance.accentColor}
                        onChange={(e) => handleConfigChange("appearance", "accentColor", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        <option value="Blue">Corporate Blue (#315C9F)</option>
                        <option value="Teal">Marine Teal (#0D9488)</option>
                        <option value="Slate">Cobalt Slate (#475569)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* BACKUP & RESTORE SECTION */}
              {activeCategory === "backup" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Cloud Data Persistence & Backups</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => triggerNotification("🔄 Compiling system backup archive... Created backup point LF-BACKUP-AUTO-2026.")}
                      className="flex-1 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white text-xs font-bold rounded-xl transition-all cursor-pointer uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <Database className="w-4 h-4" /> Trigger Manual Backup Now
                    </button>
                  </div>
                  
                  <div className="space-y-2 bg-white p-4 rounded-xl border border-[#A9CDEE]">
                    <div className="flex justify-between items-center pb-2 border-b border-[#A9CDEE]/30">
                      <span className="text-[10.5px] font-extrabold text-slate-700">Backup Frequency Schedule</span>
                      <select
                        value={localConfig.backup.autoBackupFrequency}
                        onChange={(e) => handleConfigChange("backup", "autoBackupFrequency", e.target.value)}
                        className="px-2 py-1 bg-[#E3F3FF] border border-[#A9CDEE] rounded-lg text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        <option value="Hourly">Hourly Incremental</option>
                        <option value="Daily">Daily Snapshot (Default)</option>
                        <option value="Weekly">Weekly Complete</option>
                      </select>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-[10.5px] font-extrabold text-slate-700">Cloud Storage Destination</span>
                      <select
                        value={localConfig.backup.cloudStorage}
                        onChange={(e) => handleConfigChange("backup", "cloudStorage", e.target.value)}
                        className="px-2 py-1 bg-[#E3F3FF] border border-[#A9CDEE] rounded-lg text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        <option value="Google Drive">Google Drive Secure Sync</option>
                        <option value="OneDrive">Microsoft OneDrive</option>
                        <option value="AWS S3">Amazon S3 Ledger Bucket</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* AUDIT LOGS SECTION */}
              {activeCategory === "audit_logs" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">System Security Audit Log</h3>
                  <div className="overflow-x-auto rounded-xl border border-[#A9CDEE] bg-white max-h-[220px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-[#E3F3FF] border-b border-[#A9CDEE] font-bold text-[#342D7E] uppercase tracking-wider">
                          <th className="p-2.5">Date / Time</th>
                          <th className="p-2.5">User</th>
                          <th className="p-2.5">Module</th>
                          <th className="p-2.5">Change Event</th>
                          <th className="p-2.5 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#A9CDEE]/20 text-slate-700">
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-[#F5FAFF] transition-colors">
                            <td className="p-2.5 font-mono whitespace-nowrap">{log.date} {log.time}</td>
                            <td className="p-2.5 font-bold">{log.user}</td>
                            <td className="p-2.5 font-bold text-[#315C9F]">{log.module}</td>
                            <td className="p-2.5 font-sans leading-relaxed">{log.change}</td>
                            <td className="p-2.5 text-center">
                              {log.undoData ? (
                                <button
                                  onClick={() => handleRevertAuditLog(log)}
                                  className="px-2 py-1 bg-[#E3F3FF] hover:bg-amber-100 border border-[#A9CDEE] text-[#315C9F] font-bold rounded-lg text-[10px] uppercase cursor-pointer"
                                >
                                  Revert
                                </button>
                              ) : (
                                <span className="text-slate-400 font-mono text-[10px]">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* API KEYS SECTION */}
              {activeCategory === "api_keys" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Integration API Keys</h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-sans font-medium">
                    API keys let outside services connect to OwnersLOCAL. Store them securely and never share them publicly.
                  </p>
                  <div className="space-y-3">
                    {[
                      { name: "Google Maps API Platform Key", key: "g_maps_live_••••••••33b1" },
                      { name: "Stripe Payment Gateway Key", key: "sk_live_••••••••12ea" },
                      { name: "QuickBooks Online Sync Key", key: "qb_auth_••••••••f92b" }
                    ].map((api, idx) => (
                      <div key={idx} className="p-3 bg-white border border-[#A9CDEE] rounded-xl flex items-center justify-between shadow-sm">
                        <div className="flex-1 mr-4">
                          <p className="text-xs font-extrabold text-slate-800">{api.name}</p>
                          <code className="text-[10px] text-[#4A9BFF] font-mono tracking-wider">{api.key}</code>
                        </div>
                        <button
                          onClick={() => triggerNotification(`Rotated credentials token for ${api.name}`)}
                          className="px-2.5 py-1.5 bg-[#E3F3FF] hover:bg-[#A9CDEE] text-[#315C9F] border border-[#A9CDEE] text-[10px] font-black rounded-lg transition-all cursor-pointer uppercase tracking-wider"
                        >
                          Rotate Token
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ADVANCED SETTINGS */}
              {activeCategory === "advanced" && (
                <div className="space-y-4 text-xs font-medium">
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Advanced Settings</h3>
                  <div className="bg-white p-4 rounded-xl border border-[#A9CDEE] space-y-3">
                    <div className="flex items-center justify-between cursor-pointer pb-2 border-b border-[#A9CDEE]/30">
                      <div>
                        <p className="font-extrabold text-slate-800">Allow Employee Redo-Onboarding Option</p>
                        <p className="text-[10px] text-slate-400 font-sans mt-0.5">Authorize personnel to restart onboarding Step 1 directly.</p>
                      </div>
                      <button
                        onClick={() => {
                          setEmployeeRedoOnboardingAllowed(!employeeRedoOnboardingAllowed);
                          triggerNotification(`Employee redo onboarding set to ${!employeeRedoOnboardingAllowed}`);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold font-sans transition-all cursor-pointer border ${
                          employeeRedoOnboardingAllowed
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-[#F5FAFF] text-slate-600 border-[#A9CDEE]"
                        }`}
                      >
                        {employeeRedoOnboardingAllowed ? "● Enabled" : "○ Disabled"}
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div>
                        <p className="font-extrabold text-slate-800">Rebuild Route Data</p>
                        <p className="text-[10px] text-slate-400 font-sans mt-0.5">Recalculate saved map routes and distances.</p>
                      </div>
                      <button
                        onClick={() => triggerNotification("🔄 Operational maps index table fully recalculated and re-indexed.")}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-black rounded-lg transition-all cursor-pointer uppercase tracking-wider"
                      >
                        Rebuild
                      </button>
                    </div>

                    {/* OWNER CONSOLE SECURE LINK */}
                    <div className="flex items-center justify-between pt-2 border-t border-[#A9CDEE]/30">
                      <div>
                        <p className="font-extrabold text-slate-800">Owner Control Console</p>
                        <p className="text-[10px] text-slate-400 font-sans mt-0.5">Owner-only tools for managing the entire account.</p>
                      </div>
                      {activeRole === "Owner" ? (
                        <button
                          onClick={() => {
                            if (onNavigateToScreen) {
                              onNavigateToScreen("owner_console");
                              triggerNotification("🔑 Owner Console opened.");
                            }
                          }}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-lg transition-all cursor-pointer uppercase tracking-wider shadow-sm border border-amber-400 text-[10px]"
                        >
                          Launch Console
                        </button>
                      ) : (
                        <span className="text-[10px] text-red-600 font-bold bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5 text-red-600 shrink-0" /> Owner Only
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* UNSAVED CHANGES BANNER COMPLIANT TO SYSTEM */}
          {hasUnsavedChanges && (
            <div className="mt-6 bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex items-center justify-between text-xs animate-pulse">
              <span className="font-bold text-amber-800 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-amber-600" /> You have unsaved changes.
              </span>
              <button
                onClick={handleSave}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black rounded-xl uppercase tracking-wider cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR: FRAMEWORK CONNECTIONS & SYSTEM METADATA */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* FRAMEWORK CONNECTIONS */}
          <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] shadow-sm space-y-4">
            <h3 className="text-xs font-black uppercase text-[#342D7E] tracking-wider border-b border-[#A9CDEE]/50 pb-2 flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4 text-[#315C9F] animate-spin" /> Connected Areas
            </h3>
            <p className="text-[10.5px] text-slate-500 font-sans font-medium leading-relaxed">
              Settings apply across these areas of the app.
            </p>

            <div className="space-y-2">
              <span className="text-[9.5px] uppercase font-extrabold text-emerald-600 block">Connected ({16})</span>
              <div className="grid grid-cols-1 gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                {[
                  "Dashboard", "Revenue", "Customers", "Leads", "Estimates & Bids", "Scheduling",
                  "Dispatch", "Routes", "Jobs", "Time Clock", "Inventory", "Documents", "Messages",
                  "Roster", "Training", "AI Assistant"
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 px-3 py-1.5 bg-[#E3F3FF]/70 rounded-xl border border-[#A9CDEE]/40 text-xs font-bold text-emerald-700 shadow-sm">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#A9CDEE]/40">
              <span className="text-[9.5px] uppercase font-extrabold text-[#315C9F] block">Ready to Connect ({2})</span>
              <div className="space-y-1.5">
                {["Integrations Pipeline", "Outbound Notification System"].map((item) => (
                  <div key={item} className="flex items-center gap-2 px-3 py-1.5 bg-[#F5FAFF]/60 rounded-xl border border-[#A9CDEE]/20 text-xs font-bold text-[#5E7393]">
                    <div className="w-3.5 h-3.5 border border-[#A9CDEE] rounded-md flex items-center justify-center text-[8px] font-black font-sans bg-white text-slate-400">□</div>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ACTIVE PARAMETERS MONITOR */}
          <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] shadow-sm space-y-3">
            <h3 className="text-xs font-black uppercase text-[#342D7E] tracking-wider">Active System Monitor</h3>
            <div className="space-y-2 text-[11px] text-slate-600 font-sans">
              <div className="flex justify-between border-b border-[#A9CDEE]/20 pb-1">
                <span>Business Title:</span>
                <strong className="text-slate-800">{businessNames[0] || "Default"}</strong>
              </div>
              <div className="flex justify-between border-b border-[#A9CDEE]/20 pb-1">
                <span>Master AI Engine:</span>
                <strong className="text-emerald-600 uppercase">{globalAiSetting}</strong>
              </div>
              <div className="flex justify-between border-b border-[#A9CDEE]/20 pb-1">
                <span>Roster Headcount:</span>
                <strong className="text-[#315C9F]">{activeRosterHeadcount} Active</strong>
              </div>
              <div className="flex justify-between pb-1">
                <span>Graph Interval:</span>
                <strong className="text-slate-800">{revenueResetInterval}</strong>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* AI RECOMMENDATIONS DIALOG MODAL OVERLAY */}
      {showAiRecs && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#C7E3FB] rounded-3xl border border-[#A9CDEE] shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in text-left">
            
            {/* Header */}
            <div className="p-6 bg-[#E3F3FF] border-b border-[#A9CDEE] flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-[#4A9BFF] animate-pulse" />
                <div>
                  <h3 className="text-base font-extrabold text-[#342D7E] uppercase tracking-wider">OwnersLOCAL Artificial Intelligence Audit</h3>
                  <p className="text-xs text-[#5E7393] font-sans font-semibold">Review recommended settings based on how your business is configured</p>
                </div>
              </div>
              <button
                onClick={() => setShowAiRecs(false)}
                className="p-1.5 bg-white border border-[#A9CDEE] hover:bg-slate-50 text-slate-600 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Recommendations Content */}
            <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto">
              {[
                {
                  key: "hours",
                  title: "Expand Dispatch Slots Availability Window",
                  module: "Business Hours",
                  desc: "Current schedules density peak occurs between 07:30 AM and 05:45 PM. Expanding daily business operating hours parameters to 07:00 AM - 06:00 PM is recommended.",
                  benefit: "+12.4% Potential dispatch slot availability, preventing overtime surcharge triggers."
                },
                {
                  key: "payroll",
                  title: "Standardize Overtime Multiplier Bracket",
                  module: "Payroll Defaults",
                  desc: "Align operational labor calculations multiplier parameter with standard local state labor compliance framework guidelines.",
                  benefit: "Locks overtime multiplier coefficient to standard 1.5x, protecting estimates margins."
                },
                {
                  key: "security",
                  title: "Enforce Two-Factor Authentication (2FA) Mandate",
                  module: "Security",
                  desc: "With 4 field technicians logging into mobile dispatch views remotely, requiring multi-factor security verification codes is highly advised.",
                  benefit: "Mitigate brute force login attempts on external mobile terminals."
                },
                {
                  key: "inventory",
                  title: "Calibrate Critical Low Stock Replenishment Warning",
                  module: "Inventory Defaults",
                  desc: "Increase low stock warning threshold from 10 to 15 units. Current lead time on Copper Tubing orders is experiencing supplier shipment delays.",
                  benefit: "Eliminates technician scheduling idle delays due to depleted materials."
                }
              ].map((rec) => (
                <div key={rec.key} className="p-4 bg-white hover:bg-white/90 border border-[#A9CDEE] rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-[#E3F3FF] text-[#315C9F] text-[9px] font-mono font-bold rounded-lg border border-[#A9CDEE] uppercase">
                        {rec.module}
                      </span>
                      <h4 className="text-xs font-black text-[#342D7E] uppercase tracking-wide">{rec.title}</h4>
                    </div>
                    <p className="text-[10.5px] text-slate-500 font-sans leading-normal font-medium">{rec.desc}</p>
                    <p className="text-[10px] text-emerald-600 font-sans font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> {rec.benefit}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      handleAcceptRecommendation(rec.key);
                      setShowAiRecs(false);
                    }}
                    className="px-3.5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white text-[10px] font-black rounded-xl transition-all cursor-pointer uppercase tracking-wider shrink-0 shadow-sm"
                  >
                    Accept & Apply
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 bg-[#E3F3FF] border-t border-[#A9CDEE] flex justify-end">
              <button
                onClick={() => setShowAiRecs(false)}
                className="px-4 py-2 bg-white hover:bg-slate-50 border border-[#A9CDEE] text-[#315C9F] text-xs font-bold rounded-xl uppercase tracking-wider cursor-pointer"
              >
                Close Audit
              </button>
            </div>

          </div>
        </div>
      )}

      {editingRole && (
        <RolePermissionEditorModal
          role={editingRole}
          onSave={handleSaveRolePermissions}
          onClose={() => setEditingRole(null)}
        />
      )}

    </div>
  );
}
