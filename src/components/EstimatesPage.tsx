import React, { useState, useMemo, useRef, useEffect } from "react";
import { useDomainActions } from "../hooks/useDomainActions";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { hasPermission } from "../types/permissions";
import { generateEstimateNumber, formatEstimateDate, estimateExpirationDate } from "../lib/estimateDefaults";
import {
  Search,
  Plus,
  Upload,
  Download,
  FileText,
  DollarSign,
  User,
  Calendar,
  MessageSquare,
  Sparkles,
  Camera,
  Activity,
  Briefcase,
  Layers,
  Wrench,
  Percent,
  CheckCircle,
  Clock,
  ArrowRight,
  Database,
  Cpu,
  TrendingUp,
  FileSpreadsheet,
  Trash2,
  Lock,
  ChevronRight,
  AlertCircle,
  X,
  Users
} from "lucide-react";
import { CustomerPickerModal } from "./CustomerPickerModal";
import { buildEstimatePdf, bytesToBase64 } from "../lib/pdfExport";
import { MAX_INLINE_BASE64_LENGTH } from "../lib/firestoreDocumentLimits";
import SendChoiceModal from "./SendChoiceModal";
import { downloadCsv, parseCsv } from "../lib/csv";
import type { DocumentItem } from "../types/domain";

export type { Estimate } from "../types/domain";
import type { Estimate } from "../types/domain";

// 8 high-quality realistic Estimates
export const INITIAL_ESTIMATES: Estimate[] = [];

export const EstimatesPage: React.FC = () => {
  const { approveEstimateToJob, upsertPotentialCustomer } = useDomainActions();
  const { loggedInUser, simulatedRole } = useAuth();
  // The real owner account's stored granularPermissions can predate a
  // permission added after their profile was first created (this one only
  // exists as of this feature) -- Manage Roles shows it as fully granted
  // because it computes that display fresh, but the owner's own persisted
  // profile was never rewritten to include it. Same bypass App.tsx's
  // sidebar nav uses for the real owner: never gate them on a stale
  // snapshot; only simulated-role previews and real employees go through
  // the actual granular check.
  const isRealOwnerAccount = !simulatedRole && !loggedInUser?.isEmployee;
  const canCollectSignatures = isRealOwnerAccount || hasPermission(loggedInUser?.granularPermissions, "collect_signatures", "edit");
  const { estimates: propsEstimates, setEstimates, schedulingEvents, recentRoster, employees, customers, setGeneratedPdfDraft, documents, setDocuments, businessProfile, estimatePrefill, setEstimatePrefill } = useDomainData();
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const {
    openPlaceholderPage: onOpenPlaceholder,
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    navigateToScreen: onNavigateToScreen,
    logOperationalEvent,
    triggerNotification
  } = useNavTelemetry();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>("All");
  const [localEstimates, setLocalEstimates] = useState<Estimate[]>(INITIAL_ESTIMATES);

  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isConversionOpen, setIsConversionOpen] = useState(false);
  const [isConversionPickerOpen, setIsConversionPickerOpen] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [sendMatch, setSendMatch] = useState<{ email?: string; phone?: string } | null>(null);
  const [conversionComplete, setConversionComplete] = useState(false);
  const [jobDate, setJobDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [jobStartTime, setJobStartTime] = useState("09:00");
  const [jobEndTime, setJobEndTime] = useState("12:00");
  const [jobEmployee, setJobEmployee] = useState("");
  const [jobCrew, setJobCrew] = useState("");
  const [jobPriority, setJobPriority] = useState<"Low" | "Medium" | "High" | "Urgent">("Medium");
  const [jobNotes, setJobNotes] = useState("");

  // Form states
  const [formCustomerName, setFormCustomerName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formStatus, setFormStatus] = useState<Estimate["status"]>("Draft");
  const [formSalesRep, setFormSalesRep] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formProjectSpecifics, setFormProjectSpecifics] = useState("");

  // Opens the Add Estimate modal pre-filled when another page (e.g. a
  // Lead's "Build Estimate" button) queues a prefill via the shared
  // estimatePrefill handoff -- same "one page sets it, the destination
  // consumes and clears it" pattern generatedPdfDraft already uses.
  useEffect(() => {
    if (!estimatePrefill) return;
    setFormCustomerName(estimatePrefill.customerName);
    setFormCompany(estimatePrefill.company || "");
    setFormPhone(estimatePrefill.phone || "");
    setFormAddress(estimatePrefill.address || "");
    setFormAmount(0);
    setFormStatus("Draft");
    setFormSalesRep("Self");
    setFormNotes(estimatePrefill.notes || "");
    setFormProjectSpecifics("");
    setIsAddModalOpen(true);
    setEstimatePrefill(null);
  }, [estimatePrefill, setEstimatePrefill]);

  const assignmentCandidates = useMemo(() => {
    const byName = new Map<string, { id: string; name: string; role: string }>();
    recentRoster
      .filter(person => person.status?.toLowerCase() !== "inactive")
      .forEach(person => byName.set(person.name.trim().toLowerCase(), {
        id: person.id || person.code || person.name,
        name: person.name,
        role: person.role
      }));
    employees.forEach(employee => {
      const name = `${employee.firstName} ${employee.lastName}`.trim();
      if (name) byName.set(name.toLowerCase(), { id: employee.id || employee.email, name, role: employee.role });
    });
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [recentRoster, employees]);

  const importInputRef = useRef<HTMLInputElement>(null);

  const handleExportCSV = () => {
    const headers = ["Number", "Customer", "Company", "Status", "Sales Rep", "Amount", "Created", "Expires", "Notes"];
    const rows = filteredEstimates.map(e => [e.number, e.customerName, e.company, e.status, e.salesRep, e.amount, e.createdDate, e.expirationDate, e.notes || ""]);
    downloadCsv("estimates_export.csv", headers, rows);
    if (logOperationalEvent) logOperationalEvent("CSV Exported", `Exported ${filteredEstimates.length} estimates to CSV`, "📤");
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(text => {
      const rows = parseCsv(text);
      if (!rows.length) { triggerNotification("That CSV file has no rows to import."); return; }
      const header = rows[0].map(h => h.trim().toLowerCase());
      const col = (name: string) => header.indexOf(name);
      const iCustomer = col("customer"), iCompany = col("company"), iStatus = col("status"), iRep = col("sales rep"), iAmount = col("amount"), iNotes = col("notes");
      const imported: Estimate[] = rows.slice(1).filter(r => r[iCustomer]?.trim()).map(r => ({
        id: "est_" + Math.random().toString(36).substring(2, 9),
        number: "EST-2026-" + Math.floor(100 + Math.random() * 900),
        customerName: r[iCustomer]?.trim() || "",
        company: (iCompany >= 0 ? r[iCompany]?.trim() : "") || `${r[iCustomer]?.trim()} Inc`,
        status: (iStatus >= 0 && (["Draft","Pending","Sent","Viewed","Accepted","Declined","Expired","Completed"] as string[]).includes(r[iStatus]?.trim())) ? r[iStatus].trim() as Estimate["status"] : "Draft",
        salesRep: (iRep >= 0 ? r[iRep]?.trim() : "") || "Self",
        amount: (iAmount >= 0 ? Number(r[iAmount]) : 0) || 0,
        notes: iNotes >= 0 ? r[iNotes]?.trim() : "",
        createdDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }),
        expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
      }));
      if (!imported.length) { triggerNotification("No valid rows found -- make sure the CSV has a Customer column."); return; }
      if (setEstimates) setEstimates(prev => [...imported, ...prev]);
      else setLocalEstimates(prev => [...imported, ...prev]);
      triggerNotification(`Imported ${imported.length} estimate(s) from CSV.`);
      if (logOperationalEvent) logOperationalEvent("CSV Imported", `Imported ${imported.length} estimates from CSV`, "📥");
    }).catch(() => triggerNotification("Couldn't read that CSV file."));
    e.target.value = "";
  };

  const openAddModal = () => {
    setFormCustomerName("");
    setFormCompany("");
    setFormPhone("");
    setFormAddress("");
    setFormAmount(0);
    setFormStatus("Draft");
    setFormSalesRep("Self");
    setFormNotes("");
    setIsAddModalOpen(true);
  };

  // Builds a real PDF from the actual estimate data right now (no signing
  // required), saves it to the Documents Hub immediately, then opens the
  // PDF Editor so the owner can review it and optionally capture
  // signatures. This is the estimate's "Generate PDF" action everywhere it
  // appears (create form, review screen).
  const generateEstimatePdf = async (est: Estimate, autoCaptureSignatures = false) => {
    const matchedCustomer = customers.find(c => c.contact === est.customerName || c.company === est.company);
    const bytes = await buildEstimatePdf(est, matchedCustomer, businessProfile);
    const pdfBase64 = bytesToBase64(bytes);
    const docId = `doc_estimate_${est.id}_${Date.now()}`;
    const newDoc: DocumentItem = {
      id: docId,
      name: `${est.number}.pdf`,
      customer: est.customerName,
      employee: loggedInUser?.name || "Staff Administrator",
      vendor: "None",
      job: "None",
      type: "Estimates",
      folder: "Estimates",
      uploadedBy: loggedInUser?.name || "Staff Administrator",
      date: new Date().toISOString().split("T")[0],
      size: `${Math.max(1, Math.ceil(bytes.length / 1024))} KB`,
      status: "Draft",
      isFavorite: false,
      isArchived: false,
      notes: "Generated from the Estimates PDF Editor.",
      tags: ["Estimate", "Generated"],
      estimateId: est.id,
      invoiceId: "None",
      lastModified: new Date().toISOString().replace("T", " ").substring(0, 19)
    };
    // A PDF that would push this Firestore document over the ~1 MiB cap
    // fails the write silently (see MAX_INLINE_BASE64_LENGTH) -- skip
    // attaching the bytes rather than lose the whole record, so the estimate
    // still shows up in Documents even if it can't be re-opened inline later.
    if (pdfBase64.length <= MAX_INLINE_BASE64_LENGTH) {
      (newDoc as any).pdfBase64 = pdfBase64;
    } else {
      triggerNotification("This PDF is too large to store inline -- the Documents record was saved, but regenerate it for a fresh copy since the file itself wasn't attached.");
    }
    setDocuments(prev => [...prev, newDoc]);
    setGeneratedPdfDraft({
      filename: `${est.number}.pdf`,
      title: `Estimate ${est.number}`,
      sourceType: "Estimate",
      sourceId: est.id,
      customerName: est.customerName,
      customerPhone: matchedCustomer?.phone,
      customerEmail: matchedCustomer?.email,
      representativeName: est.salesRep || loggedInUser?.name || "Company Representative",
      lines: [],
      pdfBase64,
      autoCaptureSignatures
    });
    onNavigateToScreen("documents");
    if (logOperationalEvent) logOperationalEvent("Estimate PDF Generated", `${est.number} for ${est.customerName}`, "📄");
  };

  const handleAddEstimate = (action: "save" | "pdf" | "signatures" | "convert" = "save") => {
    if (!formCustomerName.trim()) return;
    const newEst: Estimate = {
      id: "est_" + Math.random().toString(36).substring(2, 9),
      number: generateEstimateNumber(),
      customerName: formCustomerName.trim(),
      company: formCompany.trim() || formCustomerName.trim() + " Inc",
      status: formStatus,
      salesRep: formSalesRep.trim() || "Self",
      amount: Number(formAmount) || 0,
      notes: formNotes.trim(),
      projectSpecifics: formProjectSpecifics.trim() || undefined,
      address: formAddress.trim() || undefined,
      phone: formPhone.trim() || undefined,
      createdDate: formatEstimateDate(new Date()),
      expirationDate: estimateExpirationDate()
    };

    if (setEstimates) {
      setEstimates(prev => [newEst, ...prev]);
    } else {
      setLocalEstimates(prev => [newEst, ...prev]);
    }
    // Auto-create a "Potential" customer in the CRM if this person isn't
    // already in the system, carrying over whatever phone/address was
    // captured here -- previously this always created a blank-contact
    // customer, so converting the estimate to a job later always left
    // customerPhone/customerAddress empty on that job no matter what.
    // When the estimate is accepted the status upgrades to "Active"
    // automatically via approveEstimateToJob.
    upsertPotentialCustomer(newEst.customerName, newEst.company, newEst.phone, newEst.address);
    if (logOperationalEvent) {
      logOperationalEvent("Estimate Created", `${newEst.number} for ${newEst.customerName}`, "📝");
    }
    setIsAddModalOpen(false);
    if (action === "pdf") void generateEstimatePdf(newEst);
    if (action === "signatures") void generateEstimatePdf(newEst, true);
    if (action === "convert") {
      setSelectedEstimate(newEst);
      setConversionComplete(false);
      setIsConversionOpen(true);
    }
  };

  const openViewModal = (est: Estimate) => {
    setSelectedEstimate(est);
    setFormCustomerName(est.customerName);
    setFormCompany(est.company || "");
    setFormPhone(est.phone || "");
    setFormAddress(est.address || "");
    setFormAmount(est.amount);
    setFormStatus(est.status);
    setFormSalesRep(est.salesRep);
    setFormNotes(est.notes || "");
    setFormProjectSpecifics(est.projectSpecifics || "");
    setIsEditMode(false);
  };

  const handleSaveEdit = (action: "save" | "pdf" | "signatures" | "convert" = "save") => {
    if (!selectedEstimate) return;
    const updated = {
      ...selectedEstimate,
      customerName: formCustomerName.trim(),
      company: formCompany.trim(),
      phone: formPhone.trim() || undefined,
      address: formAddress.trim() || undefined,
      amount: Number(formAmount) || 0,
      status: formStatus,
      salesRep: formSalesRep.trim(),
      notes: formNotes.trim(),
      projectSpecifics: formProjectSpecifics.trim() || undefined
    };

    if (setEstimates) {
      setEstimates(prev => prev.map(e => e.id === selectedEstimate.id ? updated : e));
    } else {
      setLocalEstimates(prev => prev.map(e => e.id === selectedEstimate.id ? updated : e));
    }
    if (logOperationalEvent) {
      logOperationalEvent("Estimate Updated", `${updated.number} saved`, "📝");
    }
    setSelectedEstimate(updated);
    setIsEditMode(false);
    if (action === "pdf") void generateEstimatePdf(updated);
    if (action === "signatures") void generateEstimatePdf(updated, true);
    if (action === "convert" || (selectedEstimate.status !== "Accepted" && updated.status === "Accepted")) {
      setConversionComplete(false);
      setIsConversionOpen(true);
    }
  };

  const openConversion = () => {
    setConversionComplete(false);
    setIsConversionOpen(true);
  };

  const handleApproveEstimate = () => {
    if (!selectedEstimate) return;
    approveEstimateToJob(selectedEstimate.id, {
      date: jobDate,
      startTime: jobStartTime,
      endTime: jobEndTime,
      assignedEmployee: jobEmployee,
      assignedCrew: jobCrew,
      priority: jobPriority,
      notes: jobNotes
    });
    setSelectedEstimate({ ...selectedEstimate, status: "Accepted" });
    setConversionComplete(true);
  };

  const estimates = propsEstimates || localEstimates;
  const selectedEstimateJob = selectedEstimate
    ? schedulingEvents.find(event => event.sourceEstimateId === selectedEstimate.id)
    : undefined;
  const convertibleEstimates = estimates.filter(est =>
    est.status === "Accepted" && !schedulingEvents.some(event => event.sourceEstimateId === est.id)
  );

  const chooseEstimateForConversion = (estimate: Estimate) => {
    openViewModal(estimate);
    setConversionComplete(false);
    setIsConversionPickerOpen(false);
    setIsConversionOpen(true);
  };

  // Filtered estimates list
  const filteredEstimates = useMemo(() => {
    return estimates.filter((est) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === "" ||
        est.customerName.toLowerCase().includes(q) ||
        est.number.toLowerCase().includes(q) ||
        est.company.toLowerCase().includes(q) ||
        est.salesRep.toLowerCase().includes(q) ||
        est.amount.toString().includes(q);

      if (!matchesSearch) return false;

      const matchesStatus =
        activeStatusFilter === "All" || est.status === activeStatusFilter;

      return matchesStatus;
    });
  }, [estimates, searchQuery, activeStatusFilter]);

  // Metrics sums
  const metrics = useMemo(() => {
    const totalEstimates = estimates.length;
    const openEstimates = estimates.filter(
      (e) => e.status === "Draft" || e.status === "Pending" || e.status === "Sent" || e.status === "Viewed"
    ).length;
    const pendingApproval = estimates.filter((e) => e.status === "Pending").length;
    const accepted = estimates.filter((e) => e.status === "Accepted").length;
    const declined = estimates.filter((e) => e.status === "Declined").length;
    
    // Revenue pending calculation
    const revenuePending = estimates.filter(
      (e) => e.status === "Pending" || e.status === "Sent" || e.status === "Viewed"
    ).reduce((sum, e) => sum + e.amount, 0);

    return {
      totalEstimates,
      openEstimates,
      pendingApproval,
      accepted,
      declined,
      revenuePending
    };
  }, [estimates]);

  // Status lists for rendering filters
  const STATUS_FILTERS = [
    "Draft",
    "Pending",
    "Sent",
    "Viewed",
    "Accepted",
    "Declined",
    "Expired",
    "Completed"
  ];

  // Real recent estimates instead of a fabricated activity log — there's
  // no real per-estimate change-history collection to derive individual
  // "sent"/"viewed" events from, so this shows real estimates by real
  // current status rather than inventing fake historical events.
  const STATUS_ICON: Record<string, string> = {
    Draft: "📝",
    Pending: "⏳",
    Sent: "📨",
    Viewed: "👁️",
    Accepted: "✅",
    Declined: "❌",
    Expired: "⌛",
    Completed: "🛠️"
  };
  const activities = [...estimates]
    .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())
    .slice(0, 6)
    .map((est) => ({
      id: est.id,
      type: `Estimate ${est.status}`,
      desc: `Estimate #${est.number} for ${est.customerName} — ${est.status} ($${est.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
      time: est.createdDate,
      icon: STATUS_ICON[est.status] || "📄"
    }));

  // Handle navigation with safety checks
  const handleLinkNavigation = (screenId: string, fallbackLabel: string, icon: string) => {
    if (onNavigateToScreen && ["customers", "leads", "dashboard"].includes(screenId)) {
      onNavigateToScreen(screenId);
    } else {
      onOpenPlaceholder(fallbackLabel, icon);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* 1. TOP CARD */}
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-extrabold text-[#1F3557] tracking-tight uppercase flex items-center gap-2">
              <span>📝</span> Estimates & Bids
            </h2>
            <p className="text-xs text-[#5E7393] font-bold mt-1 uppercase tracking-wider">
              Create, review, send, and track customer estimates
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              New Estimate
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
            <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCSV} />
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            {onTakeSnapshot && (
              <button
                onClick={() =>
                  onTakeSnapshot("estimates", "Estimates & Bids", {
                    recordCount: filteredEstimates.length,
                    filters: `Status: ${activeStatusFilter}`,
                    details: `Estimate summary created. Open estimates: ${metrics.openEstimates}. Pending revenue: $${metrics.revenuePending.toLocaleString()}`
                  })
                }
                className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                title="Take Page Snapshot"
              >
                <Camera className="w-3.5 h-3.5 text-[#315C9F]" />
                Snapshot
              </button>
            )}
            {onOpenAIAnalysis && (
              <button
                onClick={() => onOpenAIAnalysis("estimates", "Estimates & Bids")}
                className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                title="AI Option"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                AI Option
              </button>
            )}
          </div>
        </div>

        {/* SEARCH AND FILTERS */}
        <div className="bg-[#EAF5FF] p-4 rounded-2xl border border-[#9EC8EF] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5E7393] pointer-events-none">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Customer, Estimate Number, Company, Phone, Address, Sales Rep..."
              className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#315C9F] text-[#1F3557] font-sans font-semibold placeholder-[#5E7393]/60"
            />
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] text-[#5E7393] font-bold uppercase tracking-wider block md:inline mr-2">
              Search parameters index:
            </span>
            <div className="inline-flex gap-1.5 flex-wrap">
              {["Customer", "Estimate Number", "Company", "Phone", "Address"].map((item) => (
                <span
                  key={item}
                  className="px-2 py-1 bg-white border border-[#9EC8EF]/60 text-[#315C9F] text-[9px] font-mono font-bold rounded-lg uppercase tracking-wide shadow-2xs"
                >
                  • {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2. SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-[#EAF5FF] border border-[#9EC8EF] p-4 rounded-2xl flex flex-col items-start gap-1 shadow-sm">
          <span className="text-[10px] text-[#5E7393] font-extrabold uppercase tracking-widest">
            Open Estimates
          </span>
          <span className="text-xl font-mono font-black text-[#1F3557]">
            {metrics.openEstimates}
          </span>
          <span className="text-[9px] text-[#5E7393]/80 font-bold uppercase tracking-wider">
            In active workflow
          </span>
        </div>

        <div className="bg-[#EAF5FF] border border-[#9EC8EF] p-4 rounded-2xl flex flex-col items-start gap-1 shadow-sm">
          <span className="text-[10px] text-[#5E7393] font-extrabold uppercase tracking-widest">
            Pending Approval
          </span>
          <span className="text-xl font-mono font-black text-amber-600">
            {metrics.pendingApproval}
          </span>
          <span className="text-[9px] text-[#5E7393]/80 font-bold uppercase tracking-wider">
            Awaiting dispatch
          </span>
        </div>

        <div className="bg-[#EAF5FF] border border-[#9EC8EF] p-4 rounded-2xl flex flex-col items-start gap-1 shadow-sm">
          <span className="text-[10px] text-[#5E7393] font-extrabold uppercase tracking-widest">
            Accepted
          </span>
          <span className="text-xl font-mono font-black text-emerald-600">
            {metrics.accepted}
          </span>
          <span className="text-[9px] text-[#5E7393]/80 font-bold uppercase tracking-wider">
            Ready to build job
          </span>
        </div>

        <div className="bg-[#EAF5FF] border border-[#9EC8EF] p-4 rounded-2xl flex flex-col items-start gap-1 shadow-sm">
          <span className="text-[10px] text-[#5E7393] font-extrabold uppercase tracking-widest">
            Declined
          </span>
          <span className="text-xl font-mono font-black text-rose-500">
            {metrics.declined}
          </span>
          <span className="text-[9px] text-[#5E7393]/80 font-bold uppercase tracking-wider">
            Needs review / edit
          </span>
        </div>

        <div className="col-span-2 md:col-span-1 bg-[#315C9F] border border-[#1F3557] p-4 rounded-2xl flex flex-col items-start gap-1 shadow-md text-white">
          <span className="text-[10px] text-blue-100 font-extrabold uppercase tracking-widest">
            Revenue Pending
          </span>
          <span className="text-xl font-mono font-black text-white">
            ${metrics.revenuePending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[9px] text-blue-200/90 font-bold uppercase tracking-wider">
            Outstanding volume
          </span>
        </div>
      </div>

      {/* 3. STATUS FILTERS BAR & ESTIMATES LIST TABLE CONTAINER */}
      <div className="bg-white rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
        
        {/* FILTERS */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-[#EAF5FF] pb-4 gap-4">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#EAF5FF] rounded-lg border border-[#9EC8EF]">
              <Activity className="w-4 h-4 text-[#315C9F]" />
            </span>
            <div>
              <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">
                Estimates
              </h3>
              <p className="text-[10px] text-[#5E7393] font-bold">
                Filtered: {filteredEstimates.length} of {estimates.length} proposals
              </p>
            </div>
          </div>

          {/* HORIZONTAL BUTTON FILTERS */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <button
              onClick={() => setActiveStatusFilter("All")}
              className={`px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded-xl transition-all cursor-pointer border ${
                activeStatusFilter === "All"
                  ? "bg-[#315C9F] border-[#1F3557] text-white"
                  : "bg-[#EAF5FF] border-[#9EC8EF]/50 text-[#1F3557] hover:bg-[#BDDDF8]"
              }`}
            >
              All Statuses
            </button>
            {STATUS_FILTERS.map((f) => {
              const count = estimates.filter((e) => e.status === f).length;
              return (
                <button
                  key={f}
                  onClick={() => setActiveStatusFilter(f)}
                  className={`px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded-xl transition-all cursor-pointer border ${
                    activeStatusFilter === f
                      ? "bg-[#315C9F] border-[#1F3557] text-white shadow-xs"
                      : "bg-[#EAF5FF] border-[#9EC8EF]/50 text-[#1F3557] hover:bg-[#BDDDF8]"
                  }`}
                >
                  {f} <span className="font-mono text-[9px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. ESTIMATES TABLE */}
        <div className="overflow-x-auto rounded-2xl border border-[#9EC8EF]/60 bg-[#F5FAFF]/50 shadow-inner">
          <table className="w-full min-w-[1000px] text-left border-collapse">
            <thead>
              <tr className="bg-[#C7E3FA]/60 text-[10px] font-sans font-bold text-[#1F3557] uppercase border-b border-[#9EC8EF]/60">
                <th className="py-3.5 px-4">Estimate #</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Company</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Sales Representative</th>
                <th className="py-3.5 px-4 text-right">Amount</th>
                <th className="py-3.5 px-4">Created</th>
                <th className="py-3.5 px-4">Expiration Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAF5FF] text-xs text-slate-700">
              {filteredEstimates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#5E7393] font-bold uppercase tracking-wider bg-white">
                    No matching estimates found in this system node partition.
                  </td>
                </tr>
              ) : (
                filteredEstimates.map((est) => {
                  // Style badge depending on status
                  let badgeStyle = "bg-slate-100 text-slate-700 border-slate-300";
                  if (est.status === "Accepted" || est.status === "Completed") {
                    badgeStyle = "bg-emerald-50 border-emerald-200 text-emerald-700";
                  } else if (est.status === "Pending" || est.status === "Sent" || est.status === "Viewed") {
                    badgeStyle = "bg-amber-50 border-amber-200 text-amber-700";
                  } else if (est.status === "Declined") {
                    badgeStyle = "bg-rose-50 border-rose-200 text-rose-700";
                  } else if (est.status === "Expired") {
                    badgeStyle = "bg-slate-200 border-slate-400 text-slate-500";
                  }

                  return (
                    <tr
                      key={est.id}
                      onClick={() => openViewModal(est)}
                      className="hover:bg-[#EAF5FF] transition-all cursor-pointer group bg-white"
                    >
                      <td className="py-3.5 px-4 font-mono font-black text-[#315C9F] group-hover:underline">
                        {est.number}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#1F3557]">
                        {est.customerName}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-600">
                        {est.company}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-1 rounded-xl text-[9px] font-bold uppercase border tracking-wider ${badgeStyle}`}>
                          {est.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-500">
                        {est.salesRep}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-black text-[#1F3557]">
                        ${est.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {est.createdDate}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {est.expirationDate}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* 6. QUICK ACTIONS & AI ESTIMATE ASSISTANT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* QUICK ACTIONS */}
        <div className="bg-white rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-[#EAF5FF] pb-3">
            <span className="p-1.5 bg-[#EAF5FF] rounded-lg border border-[#9EC8EF]">
              <Cpu className="w-4.5 h-4.5 text-[#315C9F]" />
            </span>
            <div>
              <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">
                Estimate Actions
              </h3>
              <p className="text-[10px] text-[#5E7393] font-semibold">
                Generate PDFs, duplicate contract drafts, or dispatch direct alerts
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {[
              { label: "Generate PDF", icon: "📄" },
              { label: "Duplicate Estimate", icon: "📋" },
              { label: "Convert to Job", icon: "🛠️" },
              { label: "Schedule Appointment", icon: "📅" },
              { label: "Message Customer", icon: "💬" },
              { label: "View Documents", icon: "📂" }
            ].map((btn) => (
              <button
                key={btn.label}
                onClick={() => {
                  if (btn.label === "Generate PDF") {
                    const target = selectedEstimate || estimates[0];
                    if (target) void generateEstimatePdf(target);
                    else triggerNotification("Create or select an estimate first.");
                  } else if (btn.label === "Convert to Job") {
                    if (convertibleEstimates.length === 0) {
                      triggerNotification("No accepted estimates are waiting to be converted.");
                      setActiveStatusFilter("Accepted");
                    } else if (convertibleEstimates.length === 1) {
                      chooseEstimateForConversion(convertibleEstimates[0]);
                    } else {
                      setIsConversionPickerOpen(true);
                    }
                  } else if (btn.label === "Schedule Appointment") {
                    if (onNavigateToScreen) {
                      onNavigateToScreen("scheduling");
                    } else {
                      onOpenPlaceholder("scheduling", "📅");
                    }
                  } else if (btn.label === "Message Customer") {
                    onNavigateToScreen?.("messages");
                  } else {
                    onOpenPlaceholder(`${btn.label} Action`, btn.icon);
                  }
                }}
                className="p-3.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF]/60 text-[#1F3557] font-extrabold rounded-xl text-[10.5px] uppercase tracking-wide transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-1.5 shadow-2xs"
              >
                <span className="text-lg">{btn.icon}</span>
                <span>{btn.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* AI ESTIMATE ASSISTANT */}
        <div className="bg-white rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-[#EAF5FF] pb-3">
            <span className="p-1.5 bg-[#EAF5FF] rounded-lg border border-[#9EC8EF]">
              <Sparkles className="w-4.5 h-4.5 text-amber-500 animate-pulse" />
            </span>
            <div>
              <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">
                AI Estimate Tools
              </h3>
              <p className="text-[10px] text-[#5E7393] font-semibold">
                Predict profit margins, recommend catalog items, and scan cost indices
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {[
              { title: "Estimate Suggestions", icon: "💡", color: "bg-blue-50/50 border-blue-200" },
              { title: "Material Recommendations", icon: "📦", color: "bg-indigo-50/50 border-indigo-200" },
              { title: "Profit Margin", icon: "📈", color: "bg-emerald-50/50 border-emerald-200" },
              { title: "Labor Suggestions", icon: "⚙️", color: "bg-amber-50/50 border-amber-200" },
              { title: "Pricing Analysis", icon: "📊", color: "bg-rose-50/50 border-rose-200" }
            ].map((card) => (
              <div
                key={card.title}
                onClick={() => onOpenPlaceholder(`AI Recommendation: ${card.title}`, "🤖")}
                className={`p-3 rounded-xl border ${card.color} text-slate-800 hover:scale-[1.02] cursor-pointer transition-all flex flex-col justify-between h-20 shadow-2xs text-left group`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-base">{card.icon}</span>
                  <Sparkles className="w-3 h-3 text-amber-500 animate-pulse opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider text-[#1F3557] leading-tight">
                  {card.title}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 7. BOTTOM SECTION - RECENT ESTIMATE ACTIVITY */}
      <div className="bg-white rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-[#EAF5FF] pb-3">
          <span className="p-1.5 bg-[#EAF5FF] rounded-lg border border-[#9EC8EF]">
            <Clock className="w-4.5 h-4.5 text-[#315C9F]" />
          </span>
          <div>
            <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">
              Recent Estimates
            </h3>
            <p className="text-[10px] text-[#5E7393] font-semibold">
              Your most recently created estimates and their current status
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {activities.map((act) => (
            <div
              key={act.id}
              onClick={() => onOpenPlaceholder(`Activity Details: ${act.type}`, "📋")}
              className="p-3.5 bg-[#F5FAFF] hover:bg-[#EAF5FF] border border-[#9EC8EF]/40 rounded-xl flex items-start gap-3 cursor-pointer transition-all shadow-2xs text-left"
            >
              <span className="text-lg select-none shrink-0">{act.icon}</span>
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#315C9F]">
                    {act.type}
                  </span>
                  <span className="text-[9px] font-mono font-medium text-slate-400">
                    {act.time}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-semibold leading-snug">
                  {act.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 8. FUTURE CONNECTIONS SYSTEM DIAGRAM & LEGACY MAP */}
      <div className="bg-[#EAF5FF] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-4 border-b border-[#9EC8EF]/30 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-white rounded-lg border border-[#9EC8EF] text-[#315C9F]">
              <Database className="w-4.5 h-4.5" />
            </span>
            <div>
              <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">
                Connected Features
              </h3>
              <p className="text-[10px] text-[#5E7393] font-semibold">
                Keep estimates connected with accounting, scheduling, and field teams
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-800 text-[8px] font-mono font-bold rounded-lg uppercase tracking-widest">
            Pending Core Map
          </span>
        </div>

        <p className="text-slate-600 text-[11px] leading-relaxed font-sans font-semibold">
          <strong>Accepted estimate workflow:</strong> After you confirm the job details, OwnersLOCAL creates one linked <strong>Job</strong> and adds it to Jobs, Scheduling, Dispatch, and Map.
        </p>

        {/* CLICKABLE CONNECTION NODES */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 pt-1.5">
          {[
            { id: "customers", label: "Customers Module", icon: "👥" },
            { id: "leads", label: "Leads Module", icon: "🎯" },
            { id: "inventory", label: "Inventory", icon: "📦" },
            { id: "scheduling", label: "Scheduling Grid", icon: "📅" },
            { id: "jobs", label: "Jobs Dispatch", icon: "🛠️" },
            { id: "documents", label: "Documents", icon: "📂" },
            { id: "revenue", label: "Revenue", icon: "💰" },
            { id: "ai_assistant", label: "AI Assistant", icon: "🤖" },
            { id: "dashboard", label: "HQ Dashboard", icon: "📊" },
            { id: "shared_events", label: "Activity", icon: "⚙️" }
          ].map((node) => (
            <button
              key={node.id}
              onClick={() => handleLinkNavigation(node.id, node.label, node.icon)}
              className="p-2.5 bg-white hover:bg-[#C7E3FA] border border-[#9EC8EF] text-[#1F3557] rounded-xl text-[10px] uppercase font-black tracking-wider transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <span>{node.icon}</span>
              <span>{node.label}</span>
              <ChevronRight className="w-2.5 h-2.5 text-[#315C9F]/70 ml-auto" />
            </button>
          ))}
        </div>
      </div>

      {/* Add Estimate Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-white" />
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">Create New Estimate</h3>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#5E7393]">Select Customer</label>
                <select
                  value=""
                  onChange={(event) => {
                    const customer = customers.find(item => item.id === event.target.value);
                    if (!customer) return;
                    setFormCustomerName(customer.contact || customer.company);
                    setFormCompany(customer.company);
                  }}
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                >
                  <option value="">Select customer...</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.contact || customer.company}{customer.contact && customer.company ? ` — ${customer.company}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsCustomerPickerOpen(true)}
                  className="text-[10.5px] font-bold text-[#315C9F] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Users className="w-3 h-3" /> Link an existing customer
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Client Name *</label>
                  <input
                    type="text"
                    value={formCustomerName}
                    onChange={e => setFormCustomerName(e.target.value)}
                    placeholder="e.g. Smith Residence"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Company / Account Name</label>
                  <input
                    type="text"
                    value={formCompany}
                    onChange={e => setFormCompany(e.target.value)}
                    placeholder="e.g. Riverside Apartments"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Phone</label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    placeholder="e.g. (555) 123-4567"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Job Site Address</label>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={e => setFormAddress(e.target.value)}
                    placeholder="e.g. 123 Main St, Dallas, TX"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>
              </div>
              <p className="text-[9.5px] text-slate-400 -mt-1">Carries through automatically if this estimate is later converted to a job.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Quoted Amount ($) *</label>
                  <input
                    type="number"
                    value={formAmount || ""}
                    onChange={e => setFormAmount(Number(e.target.value))}
                    placeholder="e.g. 12500"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Initial Status</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as any)}
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Pending">Pending</option>
                    <option value="Sent">Sent</option>
                    <option value="Viewed">Viewed</option>
                    <option value="Accepted">Accepted</option>
                    <option value="Declined">Declined</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#5E7393]">Assigned Sales Representative</label>
                <input 
                  type="text" 
                  value={formSalesRep}
                  onChange={e => setFormSalesRep(e.target.value)}
                  placeholder="e.g. Jane Smith"
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#5E7393]">Scope of Work Notes</label>
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Enter detailed description of proposed services, pricing terms, materials, exclusions..."
                  rows={4}
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557] resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#5E7393]">Project Specifics</label>
                <textarea
                  value={formProjectSpecifics}
                  onChange={e => setFormProjectSpecifics(e.target.value)}
                  placeholder="Describe the actual work to be done on this job..."
                  rows={4}
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557] resize-none"
                />
                <p className="text-[9.5px] text-slate-400">Included in the generated PDF, separate from the scope-of-work notes above.</p>
              </div>
            </div>

            <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex flex-wrap justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!formCustomerName.trim()}
                onClick={() => handleAddEstimate("save")}
                className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                  formCustomerName.trim() ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                }`}
              >
                Save Estimate
              </button>
              <button
                type="button"
                disabled={!formCustomerName.trim()}
                onClick={() => handleAddEstimate("pdf")}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300 transition-colors cursor-pointer"
              >
                Save &amp; Generate PDF
              </button>
              {canCollectSignatures && (
                <button
                  type="button"
                  disabled={!formCustomerName.trim()}
                  onClick={() => handleAddEstimate("signatures")}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300 transition-colors cursor-pointer"
                >
                  Collect Signatures
                </button>
              )}
              <button
                type="button"
                disabled={!formCustomerName.trim()}
                onClick={() => handleAddEstimate("convert")}
                className="px-4 py-2 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300 disabled:text-slate-500 transition-colors cursor-pointer"
              >
                Convert to Job
              </button>
            </div>
          </div>
        </div>
      )}

      {isCustomerPickerOpen && (
        <CustomerPickerModal
          customers={customers}
          onClose={() => setIsCustomerPickerOpen(false)}
          onSelect={(c) => {
            setFormCustomerName(c.contact || c.company);
            setFormCompany(c.company);
            setFormPhone(c.phone || "");
            setFormAddress(c.address || "");
            setIsCustomerPickerOpen(false);
          }}
        />
      )}

      {/* View / Edit Estimate Modal with Auto-Job Conversion */}
      {selectedEstimate && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-white" />
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">
                  {isEditMode ? "Edit Quotation Form" : `Estimate details: ${selectedEstimate.number}`}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedEstimate(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {isEditMode ? (
                // Edit fields
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Client Name *</label>
                      <input 
                        type="text" 
                        value={formCustomerName}
                        onChange={e => setFormCustomerName(e.target.value)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Company / Account Name</label>
                      <input
                        type="text"
                        value={formCompany}
                        onChange={e => setFormCompany(e.target.value)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Phone</label>
                      <input
                        type="tel"
                        value={formPhone}
                        onChange={e => setFormPhone(e.target.value)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Job Site Address</label>
                      <input
                        type="text"
                        value={formAddress}
                        onChange={e => setFormAddress(e.target.value)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Quoted Amount ($) *</label>
                      <input 
                        type="number" 
                        value={formAmount}
                        onChange={e => setFormAmount(Number(e.target.value))}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Quotation Status</label>
                      <select
                        value={formStatus}
                        onChange={e => setFormStatus(e.target.value as any)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                      >
                        <option value="Draft">Draft</option>
                        <option value="Pending">Pending</option>
                        <option value="Sent">Sent</option>
                        <option value="Viewed">Viewed</option>
                        <option value="Accepted">Accepted</option>
                        <option value="Declined">Declined</option>
                        <option value="Expired">Expired</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Assigned Sales Representative</label>
                    <input
                      type="text"
                      value={formSalesRep}
                      onChange={e => setFormSalesRep(e.target.value)}
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Scope of Work Notes</label>
                    <textarea
                      value={formNotes}
                      onChange={e => setFormNotes(e.target.value)}
                      placeholder="Enter detailed description of proposed services, pricing terms, materials, exclusions..."
                      rows={3}
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557] resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Project Specifics</label>
                    <textarea
                      value={formProjectSpecifics}
                      onChange={e => setFormProjectSpecifics(e.target.value)}
                      placeholder="Describe the actual work to be done on this job..."
                      rows={3}
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557] resize-none"
                    />
                  </div>
                </div>
              ) : (
                // Detailed view mode
                <div className="space-y-4">
                  <div className="bg-[#EAF5FF] p-4.5 rounded-2xl border border-[#9EC8EF]/60 space-y-3.5">
                    <div className="flex justify-between items-start border-b border-[#9EC8EF]/40 pb-2.5">
                      <div>
                        <h4 className="text-sm font-bold text-[#1F3557]">{selectedEstimate.customerName}</h4>
                        <p className="text-xs text-[#5E7393] font-semibold">{selectedEstimate.company || "No Company"}</p>
                      </div>
                      <span className="px-2.5 py-0.5 bg-[#315C9F] text-white font-extrabold uppercase text-[9px] rounded-lg border border-[#9EC8EF]/40">
                        {selectedEstimate.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Estimate ID</p>
                        <p className="font-mono text-[#1F3557] font-bold mt-0.5">{selectedEstimate.number}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Quoted Amount</p>
                        <p className="text-[#315C9F] font-extrabold font-mono mt-0.5 text-blue-600">
                          ${selectedEstimate.amount.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Created Date</p>
                        <p className="text-[#1F3557] font-bold mt-0.5">{selectedEstimate.createdDate}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Expiration Date</p>
                        <p className="text-[#1F3557] font-bold mt-0.5">{selectedEstimate.expirationDate}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Representative</p>
                        <p className="text-[#1F3557] font-bold mt-0.5">{selectedEstimate.salesRep}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-[#5E7393]">Scope notes / exclusions</p>
                    <p className="text-xs bg-[#EAF5FF]/40 border border-[#9EC8EF]/30 p-3 rounded-xl font-medium text-[#1F3557] min-h-[60px]">
                      {selectedEstimate.notes || "No scope notes compiled for this proposal. Default labor and material warranty applies."}
                    </p>
                  </div>

                  {/* Accepted estimate confirmation and job conversion workflow */}
                  {selectedEstimate.status !== "Completed" && !selectedEstimateJob && (
                    <div className="pt-3 border-t border-[#9EC8EF]/40">
                      <p className="text-[10px] uppercase font-bold text-[#5E7393] mb-2">
                        {selectedEstimate.status === "Accepted" ? "Accepted — ready to schedule" : "Confirm customer acceptance"}
                      </p>
                      <button
                        onClick={openConversion}
                        className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {selectedEstimate.status === "Accepted" ? "Confirm & Schedule Job" : "Accept & Schedule Job"}
                      </button>
                    </div>
                  )}
                  {selectedEstimateJob && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Converted to scheduled job</p>
                      <p className="mt-1 text-xs font-bold text-[#1F3557]">
                        {selectedEstimateJob.date} · {selectedEstimateJob.startTime}–{selectedEstimateJob.endTime}
                      </p>
                      <button onClick={() => onNavigateToScreen?.("jobs")} className="mt-3 text-[10px] font-black uppercase text-[#315C9F] hover:underline">
                        Open job →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex justify-between shrink-0">
              <div className="flex gap-2">
                {!isEditMode && (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Edit Proposal
                  </button>
                )}
                {!isEditMode && (() => {
                  const match = customers.find(c => c.contact === selectedEstimate.customerName || c.company === selectedEstimate.company);
                  return (
                    <>
                      <button
                        onClick={() => match ? onNavigateToScreen("customers", { customerId: match.id }) : triggerNotification("No matching customer record found.")}
                        className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Open Customer
                      </button>
                      <button
                        disabled={!match?.email && !match?.phone}
                        onClick={() => { setSendMatch(match || null); setIsSendOpen(true); }}
                        className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Send
                      </button>
                    </>
                  );
                })()}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEstimate(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Close
                </button>
                {isEditMode && (
                  <button
                    type="button"
                    disabled={!formCustomerName.trim()}
                    onClick={() => handleSaveEdit("save")}
                    className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                      formCustomerName.trim() ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                    }`}
                  >
                    Save Changes
                  </button>
                )}
                {isEditMode && <button type="button" disabled={!formCustomerName.trim()} onClick={()=>handleSaveEdit("pdf")} className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300">Save &amp; Generate PDF</button>}
                {!isEditMode && selectedEstimate && <button type="button" onClick={()=>void generateEstimatePdf(selectedEstimate)} className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider">Generate PDF</button>}
                {isEditMode && canCollectSignatures && <button type="button" disabled={!formCustomerName.trim()} onClick={()=>handleSaveEdit("signatures")} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300">Collect Signatures</button>}
                {!isEditMode && selectedEstimate && canCollectSignatures && <button type="button" onClick={()=>void generateEstimatePdf(selectedEstimate, true)} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider">Collect Signatures</button>}
                {isEditMode && <button type="button" disabled={!formCustomerName.trim()} onClick={()=>handleSaveEdit("convert")} className="px-4 py-2 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300 disabled:text-slate-500">Convert to Job</button>}
                {!isEditMode && selectedEstimate && !schedulingEvents.some(event => event.sourceEstimateId === selectedEstimate.id) && (
                  <button type="button" onClick={openConversion} className="px-4 py-2 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider">Convert to Job</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedEstimate && isConversionOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1F3557]/75 p-3 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-3xl border-2 border-[#9EC8EF] bg-[#F5FAFF] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#9EC8EF] bg-white px-5 py-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#4A86F7]">Accepted estimate · final confirmation</p>
                <h3 className="mt-1 text-lg font-black text-[#1F3557]">Convert to scheduled job</h3>
                <p className="mt-1 text-xs font-semibold text-[#5E7393]">{selectedEstimate.number} · {selectedEstimate.customerName}</p>
              </div>
              <button aria-label="Close conversion" onClick={() => setIsConversionOpen(false)} className="rounded-lg p-2 text-[#5E7393] hover:bg-[#EAF5FF]"><X className="h-4 w-4" /></button>
            </div>

            {conversionComplete ? (
              <div className="p-6 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100"><CheckCircle className="h-8 w-8 text-emerald-600" /></span>
                <h4 className="mt-4 text-lg font-black text-[#1F3557]">Job scheduled successfully</h4>
                <p className="mt-2 text-sm text-[#5E7393]">The accepted estimate is now linked to a job and visible in Jobs, Scheduling, and Dispatch.</p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button onClick={() => setIsConversionOpen(false)} className="rounded-xl border border-[#9EC8EF] bg-white px-4 py-3 text-xs font-black uppercase text-[#315C9F]">Stay here</button>
                  <button onClick={() => { setIsConversionOpen(false); setSelectedEstimate(null); onNavigateToScreen?.("jobs"); }} className="rounded-xl bg-[#315C9F] px-4 py-3 text-xs font-black uppercase text-white">Open job</button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-5 p-5">
                  <section className="rounded-2xl border border-[#9EC8EF] bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div><p className="text-[9px] font-black uppercase text-[#5E7393]">Customer</p><p className="text-sm font-black text-[#1F3557]">{selectedEstimate.customerName}</p><p className="text-xs text-[#5E7393]">{selectedEstimate.company}</p></div>
                      <div className="text-right"><p className="text-[9px] font-black uppercase text-[#5E7393]">Approved value</p><p className="text-lg font-black text-emerald-600">${selectedEstimate.amount.toLocaleString()}</p></div>
                    </div>
                  </section>

                  <section>
                    <h4 className="mb-3 text-[10px] font-black uppercase tracking-wider text-[#1F3557]">Schedule details</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="sm:col-span-2"><span className="mb-1 block text-[9px] font-black uppercase text-[#5E7393]">Job date *</span><input type="date" min={new Date().toISOString().slice(0, 10)} value={jobDate} onChange={e => setJobDate(e.target.value)} className="w-full rounded-xl border border-[#9EC8EF] bg-white px-3 py-2.5 text-xs font-bold text-[#1F3557]" /></label>
                      <label><span className="mb-1 block text-[9px] font-black uppercase text-[#5E7393]">Start time *</span><input type="time" value={jobStartTime} onChange={e => setJobStartTime(e.target.value)} className="w-full rounded-xl border border-[#9EC8EF] bg-white px-3 py-2.5 text-xs font-bold text-[#1F3557]" /></label>
                      <label><span className="mb-1 block text-[9px] font-black uppercase text-[#5E7393]">End time *</span><input type="time" value={jobEndTime} onChange={e => setJobEndTime(e.target.value)} className="w-full rounded-xl border border-[#9EC8EF] bg-white px-3 py-2.5 text-xs font-bold text-[#1F3557]" /></label>
                      <label><span className="mb-1 block text-[9px] font-black uppercase text-[#5E7393]">Assign technician</span><select value={jobEmployee} onChange={e => setJobEmployee(e.target.value)} className="w-full rounded-xl border border-[#9EC8EF] bg-white px-3 py-2.5 text-xs font-bold text-[#1F3557]"><option value="">Leave unassigned</option>{assignmentCandidates.map(person => <option key={person.id} value={person.name}>{person.name} · {person.role}</option>)}</select></label>
                      <label><span className="mb-1 block text-[9px] font-black uppercase text-[#5E7393]">Crew</span><input value={jobCrew} onChange={e => setJobCrew(e.target.value)} placeholder="Optional crew name" className="w-full rounded-xl border border-[#9EC8EF] bg-white px-3 py-2.5 text-xs font-bold text-[#1F3557]" /></label>
                      <label><span className="mb-1 block text-[9px] font-black uppercase text-[#5E7393]">Priority</span><select value={jobPriority} onChange={e => setJobPriority(e.target.value as typeof jobPriority)} className="w-full rounded-xl border border-[#9EC8EF] bg-white px-3 py-2.5 text-xs font-bold text-[#1F3557]">{["Low", "Medium", "High", "Urgent"].map(value => <option key={value}>{value}</option>)}</select></label>
                      <label className="sm:col-span-2"><span className="mb-1 block text-[9px] font-black uppercase text-[#5E7393]">Scheduling notes</span><textarea rows={3} value={jobNotes} onChange={e => setJobNotes(e.target.value)} placeholder="Access details, prep instructions, customer requests…" className="w-full rounded-xl border border-[#9EC8EF] bg-white px-3 py-2.5 text-xs font-semibold text-[#1F3557]" /></label>
                    </div>
                  </section>

                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[10px] font-semibold leading-relaxed text-[#315C9F]">
                    Confirming will mark the estimate Accepted and create one linked job. Reopening the estimate cannot create a duplicate.
                  </div>
                </div>
                <div className="sticky bottom-0 flex gap-2 border-t border-[#9EC8EF] bg-white p-4">
                  <button onClick={() => setIsConversionOpen(false)} className="flex-1 rounded-xl border border-[#9EC8EF] bg-white px-4 py-3 text-xs font-black uppercase text-[#315C9F]">Not yet</button>
                  <button disabled={!jobDate || !jobStartTime || !jobEndTime || jobEndTime <= jobStartTime} onClick={handleApproveEstimate} className="flex-[1.6] rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase text-white disabled:cursor-not-allowed disabled:bg-slate-300"><CheckCircle className="mr-1 inline h-4 w-4" />Confirm & create job</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {isConversionPickerOpen && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[#1F3557]/75 p-3 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-xl overflow-hidden rounded-3xl border-2 border-[#9EC8EF] bg-[#F5FAFF] shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#9EC8EF] bg-white px-5 py-4">
              <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#4A86F7]">Convert to job</p><h3 className="mt-1 text-lg font-black text-[#1F3557]">Choose an accepted estimate</h3></div>
              <button aria-label="Close estimate chooser" onClick={() => setIsConversionPickerOpen(false)} className="rounded-lg p-2 text-[#5E7393] hover:bg-[#EAF5FF]"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[65vh] space-y-2 overflow-y-auto p-4">
              {convertibleEstimates.map(estimate => (
                <button key={estimate.id} onClick={() => chooseEstimateForConversion(estimate)} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-[#9EC8EF] bg-white p-4 text-left hover:bg-[#EAF5FF]">
                  <span><span className="block text-sm font-black text-[#1F3557]">{estimate.customerName}</span><span className="text-[10px] font-bold text-[#5E7393]">{estimate.number} · {estimate.company}</span></span>
                  <span className="shrink-0 text-sm font-black text-emerald-600">${estimate.amount.toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <SendChoiceModal isOpen={isSendOpen} onClose={() => setIsSendOpen(false)} label={`Estimate ${selectedEstimate?.number || ""}`} phone={sendMatch?.phone} email={sendMatch?.email} />
    </div>
  );
};
