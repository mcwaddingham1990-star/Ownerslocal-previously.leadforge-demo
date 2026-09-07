import React, { useState, useMemo, useRef } from "react";
import { downloadCsv, parseCsv } from "../lib/csv";
import { parseAddress } from "./StructuredAddressFields";
import { useDomainActions } from "../hooks/useDomainActions";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { buildLeadPdf, bytesToBase64 } from "../lib/pdfExport";
import { MAX_INLINE_BASE64_LENGTH } from "../lib/firestoreDocumentLimits";
import type { DocumentItem } from "../types/domain";
import {
  Search,
  Plus,
  Upload,
  Download,
  Target,
  Users,
  CheckCircle,
  TrendingUp,
  Clock,
  DollarSign,
  Briefcase,
  FileText,
  Calendar,
  MessageSquare,
  UserCheck,
  Award,
  ChevronRight,
  Filter,
  Check,
  Sparkles,
  ArrowUpRight,
  PhoneCall,
  Activity,
  Globe,
  Facebook,
  Instagram,
  User,
  AlertCircle,
  Camera,
  X,
  Minus
} from "lucide-react";

export type { Lead } from "../types/domain";
import type { Lead } from "../types/domain";

// 10 high-quality realistic OwnersLOCAL leads
export const INITIAL_LEADS: Lead[] = [];

export const LeadsPage: React.FC = () => {
  const { convertLeadToCustomer } = useDomainActions();
  const { leads: propsLeads, setLeads, setDocuments, businessProfile, setGeneratedPdfDraft, setEstimatePrefill } = useDomainData();
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
  const [activeSourceFilter, setActiveSourceFilter] = useState<string>("All");
  const [localLeads, setLocalLeads] = useState<Lead[]>(INITIAL_LEADS);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Form states
  const [formName, setFormName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formPhones, setFormPhones] = useState<string[]>([""]);
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCityState, setFormCityState] = useState("");
  const [formZip, setFormZip] = useState("");
  const [formSource, setFormSource] = useState<Lead["source"]>("Manual Entry");
  const [formStatus, setFormStatus] = useState<Lead["status"]>("New");
  const [formEstimatedValue, setFormEstimatedValue] = useState<number>(0);
  const [formNotes, setFormNotes] = useState("");

  const importInputRef = useRef<HTMLInputElement>(null);
  const LEAD_SOURCES = ["Google Business Profile", "Website", "Facebook", "Instagram", "Referral", "Phone Call", "Walk-In", "Manual Entry", "Other"];
  const LEAD_STATUSES = ["New", "Contacted", "Qualified", "Estimate Sent", "Follow-Up Needed", "Won", "Lost", "Archived"];

  const handleExportCSV = () => {
    const headers = ["Name", "Company", "Phone", "Email", "Source", "Sales Rep", "Status", "Estimated Value", "Date Added", "Address", "Notes"];
    const rows = filteredLeads.map(l => [l.name, l.company, l.phone, l.email, l.source, l.salesRep, l.status, l.estimatedValue, l.dateAdded, l.address || "", l.notes || ""]);
    downloadCsv("leads_export.csv", headers, rows);
    if (logOperationalEvent) logOperationalEvent("CSV Exported", `Exported ${filteredLeads.length} leads to CSV`, "📤");
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(text => {
      const rows = parseCsv(text);
      if (!rows.length) { triggerNotification?.("That CSV file has no rows to import."); return; }
      const header = rows[0].map(h => h.trim().toLowerCase());
      const col = (name: string) => header.indexOf(name);
      const iName = col("name"), iCompany = col("company"), iPhone = col("phone"), iEmail = col("email"), iSource = col("source"), iRep = col("sales rep"), iStatus = col("status"), iValue = col("estimated value"), iAddress = col("address"), iNotes = col("notes");
      const today = new Date();
      const imported: Lead[] = rows.slice(1).filter(r => r[iName]?.trim()).map(r => ({
        id: "lead_" + Math.random().toString(36).substring(2, 9),
        name: r[iName]?.trim() || "",
        company: (iCompany >= 0 ? r[iCompany]?.trim() : "") || "",
        phone: iPhone >= 0 ? r[iPhone]?.trim() : "",
        email: iEmail >= 0 ? r[iEmail]?.trim() : "",
        source: (iSource >= 0 && LEAD_SOURCES.includes(r[iSource]?.trim())) ? r[iSource].trim() as Lead["source"] : "Manual Entry",
        salesRep: (iRep >= 0 ? r[iRep]?.trim() : "") || "Unassigned",
        status: (iStatus >= 0 && LEAD_STATUSES.includes(r[iStatus]?.trim())) ? r[iStatus].trim() as Lead["status"] : "New",
        estimatedValue: (iValue >= 0 ? Number(r[iValue]) : 0) || 0,
        dateAdded: today.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }),
        addedDaysAgo: 0,
        address: iAddress >= 0 ? r[iAddress]?.trim() : "",
        notes: iNotes >= 0 ? r[iNotes]?.trim() : ""
      }));
      if (!imported.length) { triggerNotification?.("No valid rows found -- make sure the CSV has a Name column."); return; }
      if (setLeads) setLeads(prev => [...imported, ...prev]);
      else setLocalLeads(prev => [...imported, ...prev]);
      triggerNotification?.(`Imported ${imported.length} lead(s) from CSV.`);
      if (logOperationalEvent) logOperationalEvent("CSV Imported", `Imported ${imported.length} leads from CSV`, "📥");
    }).catch(() => triggerNotification?.("Couldn't read that CSV file."));
    e.target.value = "";
  };

  const openAddModal = () => {
    setFormName("");
    setFormCompany("");
    setFormPhones([""]);
    setFormEmail("");
    setFormAddress("");
    setFormCityState("");
    setFormZip("");
    setFormSource("Manual Entry");
    setFormStatus("New");
    setFormEstimatedValue(0);
    setFormNotes("");
    setIsAddModalOpen(true);
  };

  // Builds a real PDF from the lead's own data, saves it to the Documents
  // Hub, then opens the PDF Editor so it can be reviewed/finished and
  // mailed -- same pattern as EstimatesPage's generateEstimatePdf.
  const generateLeadPdf = async (lead: Lead) => {
    const bytes = await buildLeadPdf(lead, businessProfile);
    const pdfBase64 = bytesToBase64(bytes);
    const docId = `doc_lead_${lead.id}_${Date.now()}`;
    const newDoc: DocumentItem = {
      id: docId,
      name: `${lead.name.replace(/\s+/g, "_")}_Lead_Summary.pdf`,
      customer: lead.name,
      employee: "Staff Administrator",
      vendor: "None",
      job: "None",
      type: "Contracts",
      folder: "Leads",
      uploadedBy: "Staff Administrator",
      date: new Date().toISOString().split("T")[0],
      size: `${Math.max(1, Math.ceil(bytes.length / 1024))} KB`,
      status: "Draft",
      isFavorite: false,
      isArchived: false,
      notes: "Generated from the Leads PDF Editor.",
      tags: ["Lead", "Generated"],
      estimateId: "None",
      invoiceId: "None",
      lastModified: new Date().toISOString().replace("T", " ").substring(0, 19)
    };
    if (pdfBase64.length <= MAX_INLINE_BASE64_LENGTH) {
      (newDoc as any).pdfBase64 = pdfBase64;
    } else {
      triggerNotification?.("This PDF is too large to store inline -- the Documents record was saved, but regenerate it for a fresh copy since the file itself wasn't attached.");
    }
    setDocuments(prev => [...prev, newDoc]);
    setGeneratedPdfDraft({
      filename: newDoc.name,
      title: `Lead Summary — ${lead.name}`,
      sourceType: "Lead",
      sourceId: lead.id,
      customerName: lead.name,
      customerPhone: lead.phone,
      customerEmail: lead.email,
      representativeName: lead.salesRep || "Company Representative",
      lines: [],
      pdfBase64
    });
    onNavigateToScreen("documents");
    if (logOperationalEvent) logOperationalEvent("Lead PDF Generated", `Lead summary for ${lead.name}`, "📄");
  };

  // Queues the Estimate form to open pre-filled with this lead's info
  // (including notes) via the shared estimatePrefill handoff, then
  // navigates to Estimates -- the same "one canonical form, pre-seeded"
  // pattern the PDF handoff already uses.
  const openEstimateFromLead = (lead: Lead) => {
    setEstimatePrefill({
      customerName: lead.name,
      company: lead.company,
      phone: lead.phone,
      address: lead.address,
      notes: lead.notes,
      sourceLeadId: lead.id
    });
    onNavigateToScreen("estimates");
  };

  const buildNewLeadFromForm = (): Lead | null => {
    if (!formName.trim()) return null;
    const phoneStr = formPhones.map(p => p.trim()).filter(Boolean).join(", ") || "(555) 000-0000";
    const combinedAddress = [formAddress.trim(), formCityState.trim(), formZip.trim()].filter(Boolean).join(", ");

    return {
      id: "lead_" + Math.random().toString(36).substring(2, 9),
      name: formName.trim(),
      company: formCompany.trim(),
      phone: phoneStr,
      email: formEmail.trim() || `${formName.toLowerCase().replace(/\s+/g, "")}@example.com`,
      source: formSource,
      salesRep: "Self",
      status: formStatus,
      estimatedValue: Number(formEstimatedValue) || 0,
      dateAdded: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      addedDaysAgo: 0,
      address: combinedAddress,
      notes: formNotes.trim()
    };
  };

  const handleAddLead = (action: "save" | "pdf" | "estimate" = "save") => {
    const newLead = buildNewLeadFromForm();
    if (!newLead) return;

    if (setLeads) {
      setLeads(prev => [newLead, ...prev]);
    } else {
      setLocalLeads(prev => [newLead, ...prev]);
    }
    setIsAddModalOpen(false);
    if (logOperationalEvent) logOperationalEvent("Lead Added", `New lead '${newLead.name}' added`, "🎯", { screen: "leads" });
    if (action === "pdf") void generateLeadPdf(newLead);
    if (action === "estimate") openEstimateFromLead(newLead);
  };

  const openViewModal = (ld: Lead) => {
    setSelectedLead(ld);
    setFormName(ld.name);
    setFormCompany(ld.company || "");
    
    // Parse phone list
    const phones = (ld.phone || "").split(",").map(p => p.trim()).filter(Boolean);
    setFormPhones(phones.length > 0 ? phones : [""]);
    
    setFormEmail(ld.email);
    
    // Parse address
    const parts = (ld.address || "").split(",").map(s => s.trim());
    const street = parts[0] || "";
    let cityState = "";
    let zip = "";
    if (parts.length >= 3) {
      cityState = parts[1];
      zip = parts[2];
    } else if (parts.length === 2) {
      const lastPart = parts[1];
      const zipMatch = lastPart.match(/\d{5}(-\d{4})?$/);
      if (zipMatch) {
        zip = zipMatch[0];
        cityState = lastPart.replace(zip, "").trim();
      } else {
        cityState = lastPart;
      }
    }
    setFormAddress(street);
    setFormCityState(cityState);
    setFormZip(zip);
    
    setFormSource(ld.source);
    setFormStatus(ld.status);
    setFormEstimatedValue(ld.estimatedValue);
    setFormNotes(ld.notes || "");
    setIsEditMode(false);
  };

  const handleSaveEdit = () => {
    if (!selectedLead) return;
    const phoneStr = formPhones.map(p => p.trim()).filter(Boolean).join(", ");
    const combinedAddress = [formAddress.trim(), formCityState.trim(), formZip.trim()].filter(Boolean).join(", ");
    
    const updated = {
      ...selectedLead,
      name: formName.trim(),
      company: formCompany.trim(),
      phone: phoneStr,
      email: formEmail.trim(),
      address: combinedAddress,
      source: formSource,
      status: formStatus,
      estimatedValue: Number(formEstimatedValue) || 0,
      notes: formNotes.trim()
    };

    if (setLeads) {
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? updated : l));
    } else {
      setLocalLeads(prev => prev.map(l => l.id === selectedLead.id ? updated : l));
    }
    setSelectedLead(updated);
    setIsEditMode(false);
  };

  const handleConvertLead = () => {
    if (!selectedLead) return;
    convertLeadToCustomer(selectedLead.id);
    setSelectedLead(null);
  };

  const handleCreateEstimate = () => {
    if (!selectedLead) return;
    openEstimateFromLead(selectedLead);
    setSelectedLead(null);
  };

  const leads = propsLeads || localLeads;

  // Filtered and searched leads list
  const filteredLeads = useMemo(() => {
    return leads.filter((ld) => {
      // Search logic (Name, Company, Phone, Email, Address placeholder, Lead Source)
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === "" ||
        ld.name.toLowerCase().includes(q) ||
        ld.company.toLowerCase().includes(q) ||
        ld.phone.toLowerCase().includes(q) ||
        ld.email.toLowerCase().includes(q) ||
        ld.source.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // Status Filter logic
      const matchesStatus =
        activeStatusFilter === "All" || ld.status === activeStatusFilter;

      // Source Filter logic
      const matchesSource =
        activeSourceFilter === "All" || ld.source === activeSourceFilter;

      return matchesStatus && matchesSource;
    });
  }, [leads, searchQuery, activeStatusFilter, activeSourceFilter]);

  // Metrics calculations
  const metrics = useMemo(() => {
    const total = leads.length;
    const newToday = leads.filter((l) => l.addedDaysAgo === 0).length;
    const qualified = leads.filter((l) => l.status === "Qualified").length;
    const wonLeads = leads.filter((l) => l.status === "Won").length;
    const lostLeads = leads.filter((l) => l.status === "Lost").length;
    const totalConversions = wonLeads;
    const closedLeads = wonLeads + lostLeads;
    const conversionRate = closedLeads > 0 ? (totalConversions / closedLeads) * 100 : 75;

    return { total, newToday, qualified, conversionRate };
  }, [leads]);

  // Stage pipeline values
  const pipelineStages = useMemo(() => {
    const stages = [
      { key: "New", label: "New", count: leads.filter((l) => l.status === "New").length, color: "bg-blue-100 border-blue-200" },
      { key: "Contacted", label: "Contacted", count: leads.filter((l) => l.status === "Contacted").length, color: "bg-indigo-100 border-indigo-200" },
      { key: "Qualified", label: "Qualified", count: leads.filter((l) => l.status === "Qualified").length, color: "bg-emerald-100 border-emerald-200" },
      { key: "Estimate Sent", label: "Estimate Sent", count: leads.filter((l) => l.status === "Estimate Sent").length, color: "bg-amber-100 border-amber-200" },
      { key: "Won", label: "Won", count: leads.filter((l) => l.status === "Won").length, color: "bg-teal-100 border-teal-200" },
      { key: "Lost", label: "Lost", count: leads.filter((l) => l.status === "Lost").length, color: "bg-rose-100 border-rose-200" }
    ];
    return stages;
  }, [leads]);

  // Real recent leads instead of a fabricated activity feed -- there's no
  // real per-lead change-history collection to derive individual "call
  // logged"/"appointment scheduled" timestamped events from, so this
  // shows real leads by their real current status instead.
  const STATUS_ICON: Record<string, string> = {
    New: "✨",
    Contacted: "📞",
    Qualified: "👍",
    "Estimate Sent": "📝",
    "Follow-Up Needed": "📅",
    Won: "🏆",
    Lost: "⚠️",
    Archived: "🗄️"
  };
  const activities = [...leads]
    .sort((a, b) => (a.addedDaysAgo ?? 0) - (b.addedDaysAgo ?? 0))
    .slice(0, 6)
    .map((lead) => ({
      id: lead.id,
      type: lead.status,
      desc: `${lead.name} (${lead.company}) — ${lead.status}${lead.estimatedValue ? ` ($${lead.estimatedValue.toLocaleString()} value)` : ""}`,
      time: lead.dateAdded,
      icon: STATUS_ICON[lead.status] || "📌"
    }));

  // Real, derived-from-actual-data insight metrics -- no fabricated figures.
  const newThisWeek = leads.filter(l => (l.addedDaysAgo ?? 999) <= 7).length;
  const highestValueLead = leads.length === 0 ? null : [...leads].sort((a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0))[0];
  const oldestUncontacted = leads
    .filter(l => l.status === "New" || l.status === "Contacted")
    .sort((a, b) => (b.addedDaysAgo ?? 0) - (a.addedDaysAgo ?? 0))[0] || null;
  const closedLeads = leads.filter(l => l.status === "Won" || l.status === "Lost");
  const wonLeads = leads.filter(l => l.status === "Won");
  const conversionRate = closedLeads.length === 0 ? null : Math.round((wonLeads.length / closedLeads.length) * 100);
  const openPipelineValue = leads
    .filter(l => l.status !== "Won" && l.status !== "Lost" && l.status !== "Archived")
    .reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* 1. TOP CARD */}
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-extrabold text-[#1F3557] tracking-tight uppercase">
              Lead Management
            </h2>
            <p className="text-xs text-[#5E7393] font-sans font-semibold mt-1">
              Track new opportunities, follow-ups, and sales progress
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white border border-[#9EC8EF] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Lead
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Leads
            </button>
            <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCSV} />
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export Leads
            </button>
            {onTakeSnapshot && (
              <button
                onClick={() => onTakeSnapshot("leads", "Leads", {
                  recordCount: filteredLeads.length,
                  filters: `Status: ${activeStatusFilter} | Source: ${activeSourceFilter}`,
                  details: `Total listed leads: ${leads.length}. New today: ${metrics.newToday}. High value lead estimated value: $${Math.max(...leads.map(l => l.estimatedValue)).toLocaleString()}.`
                })}
                className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                title="Take Page Snapshot"
              >
                <Camera className="w-3.5 h-3.5 text-[#315C9F]" />
                Snapshot
              </button>
            )}
            {onOpenAIAnalysis && (
              <button
                onClick={() => onOpenAIAnalysis("leads", "Leads")}
                className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                title="AI Option"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                AI Option
              </button>
            )}
          </div>
        </div>

        {/* Search input and "Search by" indicator */}
        <div className="bg-[#EAF5FF] p-4.5 rounded-2xl border border-[#9EC8EF] space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E7393]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search leads..."
              className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#4A86F7] font-medium font-sans text-[#1F3557]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-sans font-bold text-[#5E7393]">
            <span>Search by:</span>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#C7E3FA] text-[#1F3557] rounded-lg border border-[#9EC8EF]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F3557]" /> Name
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#C7E3FA] text-[#1F3557] rounded-lg border border-[#9EC8EF]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F3557]" /> Company
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#C7E3FA] text-[#1F3557] rounded-lg border border-[#9EC8EF]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F3557]" /> Phone
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#C7E3FA] text-[#1F3557] rounded-lg border border-[#9EC8EF]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F3557]" /> Email
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#C7E3FA] text-[#1F3557] rounded-lg border border-[#9EC8EF]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F3557]" /> Address
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#C7E3FA] text-[#1F3557] rounded-lg border border-[#9EC8EF]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F3557]" /> Lead Source
            </span>
          </div>
        </div>
      </div>

      {/* 2. SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1 */}
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF] flex items-center justify-center">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Total Leads
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.total}
            </p>
          </div>
        </div>

        {/* CARD 2 */}
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              New Leads Today
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.newToday}
            </p>
          </div>
        </div>

        {/* CARD 3 */}
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-indigo-600 border border-[#9EC8EF] flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Qualified Leads
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.qualified}
            </p>
          </div>
        </div>

        {/* CARD 4 */}
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-amber-600 border border-[#9EC8EF] flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Conversion Rate
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.conversionRate.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* 3. VISUAL SALES PIPELINE STAGES */}
      <div className="bg-[#C7E3FA] rounded-2xl p-5 border border-[#9EC8EF] shadow-sm space-y-4">
        <div>
          <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider">
            Sales Pipeline Breakdown
          </h3>
          <p className="text-[10.5px] text-[#5E7393] font-sans font-semibold mt-0.5">
            Interactive metrics. Click any funnel phase below to apply an instant table filter.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {pipelineStages.map((stage) => {
            const isFiltering = activeStatusFilter === stage.key;
            return (
              <div
                key={stage.key}
                onClick={() => setActiveStatusFilter(isFiltering ? "All" : stage.key)}
                className={`p-3 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between h-20 ${
                  isFiltering
                    ? "bg-[#EAF5FF] border-[#4A86F7] shadow-sm ring-1 ring-[#4A86F7]"
                    : "bg-[#EAF5FF]/60 hover:bg-[#EAF5FF] border-[#9EC8EF]/50"
                }`}
              >
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393] truncate">
                  {stage.label}
                </span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-xl font-display font-bold text-[#1F3557]">{stage.count}</span>
                  <span className="text-[9px] text-[#5E7393] font-mono font-bold">Leads</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid containing FILTERS + TABLE */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* FILTERS PANEL */}
        <div className="space-y-4 lg:col-span-1">
          {/* STATUS FILTERS CARD */}
          <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm">
            <label htmlFor="lead-status-filter" className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#1F3557]" />
              Status Filter
            </label>
            <select
              id="lead-status-filter"
              value={activeStatusFilter}
              onChange={(event) => setActiveStatusFilter(event.target.value)}
              className="w-full px-3 py-2.5 bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl text-xs font-bold text-[#1F3557] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6FAFE7]"
            >
              <option value="All">Show All</option>
              {["New", "Contacted", "Qualified", "Estimate Sent", "Follow-Up Needed", "Won", "Lost", "Archived"].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          {/* LEAD SOURCES FILTERS CARD */}
          <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm">
            <label htmlFor="lead-source-filter" className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#1F3557]" />
              Lead Sources
            </label>
            <select
              id="lead-source-filter"
              value={activeSourceFilter}
              onChange={(event) => setActiveSourceFilter(event.target.value)}
              className="w-full px-3 py-2.5 bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl text-xs font-bold text-[#1F3557] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6FAFE7]"
            >
              <option value="All">All Sources</option>
              {["Google Business Profile", "Website", "Facebook", "Instagram", "Referral", "Phone Call", "Walk-In", "Manual Entry", "Other"].map((source) => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>

          {/* QUICK ACTIONS CARD */}
          <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm">
            <label htmlFor="lead-quick-action" className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#1F3557]" />
              Quick Actions
            </label>
            <select
              id="lead-quick-action"
              defaultValue=""
              onChange={(event) => {
                const action = event.target.value;
                if (action === "customer") onOpenPlaceholder("Convert Lead to Customer Profile", "👤");
                if (action === "estimate") onOpenPlaceholder("Lead Estimate Creation Builder", "📝");
                if (action === "schedule") {
                  if (onNavigateToScreen) onNavigateToScreen("scheduling");
                  else onOpenPlaceholder("Lead Dispatch Calendar", "📅");
                }
                if (action === "message") onOpenPlaceholder("Lead SMS & Email Board", "💬");
                if (action === "follow-up") onOpenPlaceholder("Lead Follow-Up Automator", "⏰");
                event.currentTarget.value = "";
              }}
              className="w-full px-3 py-2.5 bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl text-xs font-bold text-[#1F3557] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6FAFE7]"
            >
              <option value="" disabled>Select an action...</option>
              <option value="customer">Create Customer</option>
              <option value="estimate">Create Estimate</option>
              <option value="schedule">Schedule Appointment</option>
              <option value="message">Send Message</option>
              <option value="follow-up">Create Follow-Up</option>
            </select>
          </div>
        </div>

        {/* LEADS TABLE */}
        <div className="lg:col-span-3 bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-[#9EC8EF] text-[10px] font-extrabold uppercase text-[#1F3557] tracking-wider bg-[#EAF5FF]/30">
                  <th className="py-3 px-4">Lead Name</th>
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Lead Source</th>
                  <th className="py-3 px-4">Sales Rep</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Est. Value</th>
                  <th className="py-3 px-4 text-center">Date Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#9EC8EF]/40">
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-[#5E7393] text-xs font-semibold">
                      No matching leads found. Try relaxing your search query or filters.
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((ld) => (
                    <tr
                      key={ld.id}
                      onClick={() => openViewModal(ld)}
                      className="hover:bg-[#BDDDF8]/70 transition-colors cursor-pointer text-xs"
                    >
                      <td className="py-3 px-4 font-bold text-[#1F3557]">{ld.name}</td>
                      <td className="py-3 px-4 text-[#5E7393] font-semibold">{ld.company || "—"}</td>
                      <td className="py-3 px-4 font-mono text-[#5E7393]">{ld.phone}</td>
                      <td className="py-3 px-4 text-[#5E7393] truncate max-w-[120px]">{ld.email}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 bg-[#EAF5FF] text-[#1F3557] font-sans font-bold text-[10px] rounded-lg border border-[#9EC8EF]/40">
                          {ld.source}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#5E7393] font-medium">{ld.salesRep}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            ld.status === "New"
                              ? "bg-blue-100 text-blue-800 border border-blue-200"
                              : ld.status === "Won"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : ld.status === "Lost"
                              ? "bg-rose-100 text-rose-800 border border-rose-200"
                              : ld.status === "Estimate Sent"
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : ld.status === "Follow-Up Needed"
                              ? "bg-orange-100 text-orange-800 border border-orange-200"
                              : "bg-indigo-100 text-indigo-800 border border-indigo-200"
                          }`}
                        >
                          {ld.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold font-mono text-[#1F3557]">
                        ${ld.estimatedValue.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-[#5E7393]">{ld.dateAdded}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Footer of table */}
          <div className="mt-4 pt-3 border-t border-[#9EC8EF]/40 flex justify-between items-center text-[10.5px] font-sans font-bold text-[#5E7393]">
            <span>
              Showing {filteredLeads.length} of {leads.length} opportunities loaded
            </span>
            <span className="px-2 py-0.5 bg-[#EAF5FF] border border-[#9EC8EF]/60 rounded-lg text-[#1F3557]">
              Pipeline Connected
            </span>
          </div>
        </div>
        
      </div>

      {/* 4. AI INSIGHTS SECTION */}
      <div className="space-y-3.5">
        <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Lead Insights & Performance
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          
          {/* INSIGHT 1: New Leads This Week (real) */}
          <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex flex-col justify-between h-40 text-left">
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-[#9EC8EF] text-[#1F3557] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  New Opportunities
                </span>
                <Clock className="w-4 h-4 text-[#1F3557]" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">Incoming This Week</p>
              <p className="text-[11px] text-[#5E7393] font-medium mt-1 leading-normal">
                {newThisWeek === 0 ? "No new leads in the last 7 days." : `${newThisWeek} new lead${newThisWeek === 1 ? "" : "s"} added in the last 7 days.`}
              </p>
            </div>
          </div>

          {/* INSIGHT 2: Highest Value Lead (real) */}
          <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex flex-col justify-between h-40 text-left">
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-[#9EC8EF] text-[#1F3557] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Highest Value
                </span>
                <DollarSign className="w-4 h-4 text-[#1F3557]" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">Top Value Pipeline</p>
              <p className="text-[11px] text-[#5E7393] font-medium mt-1 leading-normal">
                {highestValueLead ? `${highestValueLead.name} (${highestValueLead.company}) valued at $${(highestValueLead.estimatedValue || 0).toLocaleString()}.` : "No leads yet."}
              </p>
            </div>
          </div>

          {/* INSIGHT 3: Oldest Uncontacted (real) */}
          <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex flex-col justify-between h-40 text-left">
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-rose-300 text-rose-600 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Attention Required
                </span>
                <AlertCircle className="w-4 h-4 text-rose-600" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">Oldest Uncontacted</p>
              <p className="text-[11px] text-[#5E7393] font-medium mt-1 leading-normal">
                {oldestUncontacted ? `${oldestUncontacted.name} — no touchpoint for ${oldestUncontacted.addedDaysAgo} day${oldestUncontacted.addedDaysAgo === 1 ? "" : "s"}.` : "No uncontacted leads."}
              </p>
            </div>
          </div>

          {/* INSIGHT 4: Conversion Rate (real) */}
          <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex flex-col justify-between h-40 text-left">
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-[#9EC8EF] text-[#1F3557] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Acquisition
                </span>
                <TrendingUp className="w-4 h-4 text-[#1F3557]" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">Win Rate</p>
              <p className="text-[11px] text-[#5E7393] font-medium mt-1 leading-normal">
                {conversionRate === null ? "No closed leads yet." : `${conversionRate}% of closed leads were won (${wonLeads.length} of ${closedLeads.length}).`}
              </p>
            </div>
          </div>

          {/* INSIGHT 5: Open Pipeline Value (real) */}
          <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex flex-col justify-between h-40 text-left">
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-[#9EC8EF] text-[#1F3557] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Pipeline
                </span>
                <Briefcase className="w-4 h-4 text-[#1F3557]" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">Open Pipeline Value</p>
              <p className="text-[11px] text-[#5E7393] font-medium mt-1 leading-normal">
                {openPipelineValue === 0 ? "No open leads with a value yet." : `$${openPipelineValue.toLocaleString()} across all open leads.`}
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* 5. LEAD ACTIVITY FEED */}
      <div className="space-y-3">
        <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider">
          Lead Activity Feed
        </h3>
        
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm divide-y divide-[#9EC8EF]/40">
          {activities.map((act) => (
            <div
              key={act.id}
              onClick={() => onOpenPlaceholder(act.type + " Operation Details", act.icon)}
              className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 cursor-pointer hover:bg-[#BDDDF8]/40 px-2 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-base select-none">{act.icon}</span>
                <div>
                  <p className="text-xs font-bold text-[#1F3557]">{act.desc}</p>
                  <p className="text-[10px] text-[#5E7393] font-medium mt-0.5">
                    Category: {act.type}
                  </p>
                </div>
              </div>
              <span className="text-[10.5px] font-mono text-[#5E7393]">{act.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add Lead Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-white" />
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">Add New Sales Lead</h3>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Contact Person *</label>
                  <input 
                    type="text" 
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. John Connor"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Company Name</label>
                  <input 
                    type="text" 
                    value={formCompany}
                    onChange={e => setFormCompany(e.target.value)}
                    placeholder="e.g. Connor Resistance Gear"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>
              </div>

              {/* Phone Numbers with Plus / Minus */}
              <div className="space-y-1.5 bg-[#F5FAFF] p-3 rounded-2xl border border-blue-100/50">
                <label className="text-[10px] uppercase font-bold text-[#5E7393] flex items-center justify-between">
                  <span>Phone Numbers *</span>
                  <button 
                    type="button" 
                    onClick={() => setFormPhones(prev => [...prev, ""])}
                    className="text-[#4A86F7] hover:text-[#1E52C9] font-extrabold text-[11px] flex items-center gap-1 bg-[#EAF5FF] px-2.5 py-1 rounded-lg border border-[#9EC8EF]/50 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Phone
                  </button>
                </label>
                <div className="space-y-2">
                  {formPhones.map((phone, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={phone}
                        onChange={e => {
                          const updated = [...formPhones];
                          updated[index] = e.target.value;
                          setFormPhones(updated);
                        }}
                        placeholder="e.g. (555) 111-2222"
                        className="flex-1 text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                      {formPhones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setFormPhones(prev => prev.filter((_, i) => i !== index))}
                          className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-xl p-2.5 shrink-0 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#5E7393]">Email Address</label>
                <input 
                  type="email" 
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  placeholder="e.g. john@resistance.com"
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                />
              </div>

              <div className="bg-[#F5FAFF] p-3 rounded-2xl border border-blue-100/50 space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Street Address</label>
                  <input 
                    type="text" 
                    value={formAddress}
                    onChange={e => setFormAddress(e.target.value)}
                    placeholder="e.g. 742 Evergreen Terrace"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">City, State</label>
                    <input 
                      type="text" 
                      value={formCityState}
                      onChange={e => setFormCityState(e.target.value)}
                      placeholder="e.g. Springfield, OR"
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Zip Code</label>
                    <input 
                      type="text" 
                      value={formZip}
                      onChange={e => setFormZip(e.target.value)}
                      placeholder="e.g. 97477"
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Lead Source</label>
                  <select
                    value={formSource}
                    onChange={e => setFormSource(e.target.value as any)}
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                  >
                    <option value="Google Business Profile">Google Business Profile</option>
                    <option value="Website">Website</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Referral">Referral</option>
                    <option value="Phone Call">Phone Call</option>
                    <option value="Walk-In">Walk-In</option>
                    <option value="Manual Entry">Manual Entry</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Initial Status</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as any)}
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                  >
                    <option value="New">New</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Qualified">Qualified</option>
                    <option value="Estimate Sent">Estimate Sent</option>
                    <option value="Follow-Up Needed">Follow-Up Needed</option>
                    <option value="Won">Won</option>
                    <option value="Lost">Lost</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Estimated Deal Value ($)</label>
                  <input 
                    type="number" 
                    value={formEstimatedValue || ""}
                    onChange={e => setFormEstimatedValue(Number(e.target.value))}
                    placeholder="e.g. 4500"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#5E7393]">Sales Notes / Requirements</label>
                <textarea 
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Enter initial lead specifications, service needed, budget details..."
                  rows={3}
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557] resize-none"
                />
              </div>
            </div>

            <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!formName.trim()}
                onClick={() => handleAddLead("save")}
                className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                  formName.trim() ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                }`}
              >
                Save Lead
              </button>
              <button
                type="button"
                disabled={!formName.trim()}
                onClick={() => handleAddLead("pdf")}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300 transition-colors cursor-pointer"
              >
                Generate PDF
              </button>
              <button
                type="button"
                disabled={!formName.trim()}
                onClick={() => handleAddLead("estimate")}
                className="px-4 py-2 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300 disabled:text-slate-500 transition-colors cursor-pointer"
              >
                Build Estimate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Details & Operations Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-white" />
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">
                  {isEditMode ? "Edit Sales Lead" : "Sales Lead Details"}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedLead(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {isEditMode ? (
                // Edit Form fields
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Contact Person *</label>
                      <input 
                        type="text" 
                        value={formName}
                        onChange={e => setFormName(e.target.value)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Company Name</label>
                      <input 
                        type="text" 
                        value={formCompany}
                        onChange={e => setFormCompany(e.target.value)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                  </div>

                  {/* Phone Numbers with Plus / Minus */}
                  <div className="space-y-1.5 bg-[#F5FAFF] p-3 rounded-2xl border border-blue-100/50">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393] flex items-center justify-between">
                      <span>Phone Numbers *</span>
                      <button 
                        type="button" 
                        onClick={() => setFormPhones(prev => [...prev, ""])}
                        className="text-[#4A86F7] hover:text-[#1E52C9] font-extrabold text-[11px] flex items-center gap-1 bg-[#EAF5FF] px-2.5 py-1 rounded-lg border border-[#9EC8EF]/50 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add Phone
                      </button>
                    </label>
                    <div className="space-y-2">
                      {formPhones.map((phone, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input 
                            type="text" 
                            value={phone}
                            onChange={e => {
                              const updated = [...formPhones];
                              updated[index] = e.target.value;
                              setFormPhones(updated);
                            }}
                            placeholder="e.g. (555) 111-2222"
                            className="flex-1 text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                          />
                          {formPhones.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setFormPhones(prev => prev.filter((_, i) => i !== index))}
                              className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-xl p-2.5 shrink-0 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Email Address</label>
                    <input 
                      type="email" 
                      value={formEmail}
                      onChange={e => setFormEmail(e.target.value)}
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                    />
                  </div>

                  <div className="bg-[#F5FAFF] p-3 rounded-2xl border border-blue-100/50 space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Street Address</label>
                      <input 
                        type="text" 
                        value={formAddress}
                        onChange={e => setFormAddress(e.target.value)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-[#5E7393]">City, State</label>
                        <input 
                          type="text" 
                          value={formCityState}
                          onChange={e => setFormCityState(e.target.value)}
                          placeholder="e.g. Springfield, OR"
                          className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-[#5E7393]">Zip Code</label>
                        <input 
                          type="text" 
                          value={formZip}
                          onChange={e => setFormZip(e.target.value)}
                          placeholder="e.g. 97477"
                          className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Lead Source</label>
                      <select
                        value={formSource}
                        onChange={e => setFormSource(e.target.value as any)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                      >
                        <option value="Google Business Profile">Google Business Profile</option>
                        <option value="Website">Website</option>
                        <option value="Facebook">Facebook</option>
                        <option value="Instagram">Instagram</option>
                        <option value="Referral">Referral</option>
                        <option value="Phone Call">Phone Call</option>
                        <option value="Walk-In">Walk-In</option>
                        <option value="Manual Entry">Manual Entry</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Lead Status</label>
                      <select
                        value={formStatus}
                        onChange={e => setFormStatus(e.target.value as any)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                      >
                        <option value="New">New</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Qualified">Qualified</option>
                        <option value="Estimate Sent">Estimate Sent</option>
                        <option value="Follow-Up Needed">Follow-Up Needed</option>
                        <option value="Won">Won</option>
                        <option value="Lost">Lost</option>
                        <option value="Archived">Archived</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Estimated Deal Value ($)</label>
                      <input 
                        type="number" 
                        value={formEstimatedValue || ""}
                        onChange={e => setFormEstimatedValue(Number(e.target.value))}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Sales Notes / Requirements</label>
                    <textarea 
                      value={formNotes}
                      onChange={e => setFormNotes(e.target.value)}
                      rows={3}
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557] resize-none"
                    />
                  </div>
                </div>
              ) : (
                // View Details mode with operational integrations
                <div className="space-y-4">
                  <div className="bg-[#EAF5FF] p-4.5 rounded-2xl border border-[#9EC8EF]/60 space-y-3.5">
                    <div className="flex justify-between items-start border-b border-[#9EC8EF]/40 pb-2.5">
                      <div>
                        <h4 className="text-sm font-bold text-[#1F3557]">{selectedLead.name}</h4>
                        <p className="text-xs text-[#5E7393] font-semibold">{selectedLead.company || "No Company"}</p>
                      </div>
                      <span className="px-2.5 py-0.5 bg-[#315C9F] text-white font-extrabold uppercase text-[9px] rounded-lg border border-[#9EC8EF]/40">
                        {selectedLead.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Phone</p>
                        <p className="font-mono text-[#1F3557] font-bold mt-0.5">{selectedLead.phone}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Email</p>
                        <p className="text-[#1F3557] font-bold mt-0.5">{selectedLead.email}</p>
                      </div>
                      {(() => {
                        const addrParts = parseAddress(selectedLead.address || "");
                        return (
                          <>
                            <div className="col-span-2">
                              <p className="text-[10px] uppercase font-bold text-[#5E7393]">Street Address</p>
                              <p className="text-[#1F3557] font-bold mt-0.5">{addrParts.street || "No street provided."}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase font-bold text-[#5E7393]">City, State</p>
                              <p className="text-[#1F3557] font-bold mt-0.5">{addrParts.cityState || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase font-bold text-[#5E7393]">ZIP Code</p>
                              <p className="text-[#1F3557] font-bold mt-0.5">{addrParts.zip || "—"}</p>
                            </div>
                          </>
                        );
                      })()}
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Source</p>
                        <p className="text-[#1F3557] font-bold mt-0.5">{selectedLead.source}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Value</p>
                        <p className="text-[#1F3557] font-extrabold font-mono mt-0.5 text-blue-600">
                          ${selectedLead.estimatedValue.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-[#5E7393]">Lead Notes</p>
                    <p className="text-xs bg-[#EAF5FF]/40 border border-[#9EC8EF]/30 p-3 rounded-xl font-medium text-[#1F3557] min-h-[60px]">
                      {selectedLead.notes || "No notes available for this sales lead."}
                    </p>
                  </div>

                  {/* Core Operations Engine Actions */}
                  <div className="pt-3 border-t border-[#9EC8EF]/40">
                    <p className="text-[10px] uppercase font-bold text-[#5E7393] mb-2.5">CRM System Operations</p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        onClick={handleConvertLead}
                        className="px-4 py-2.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] hover:text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <UserCheck className="w-4 h-4 text-emerald-600" />
                        Convert to Client
                      </button>
                      <button
                        onClick={handleCreateEstimate}
                        className="px-4 py-2.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] hover:text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <FileText className="w-4 h-4 text-blue-600" />
                        Build Estimate
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex justify-between shrink-0">
              <div>
                {!isEditMode && (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Edit Profile
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Close
                </button>
                {isEditMode && (
                  <button
                    type="button"
                    disabled={!formName.trim()}
                    onClick={handleSaveEdit}
                    className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                      formName.trim() ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                    }`}
                  >
                    Save Changes
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
