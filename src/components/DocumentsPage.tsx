import React, { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection";
import SelfieSaveEditor from "./SelfieSaveEditor";
import {
  Search,
  Plus,
  Upload,
  Download,
  FileText,
  Camera,
  RefreshCw,
  Filter,
  CheckCircle,
  AlertTriangle,
  Clock,
  DollarSign,
  FolderOpen,
  Folder,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit3,
  Share2,
  Printer,
  User,
  Briefcase,
  Users,
  Eye,
  Star,
  Archive,
  ArrowUpRight,
  Sparkles,
  X,
  PlusCircle,
  Check,
  Send,
  Info,
  Layers,
  Image,
  Video,
  FileSpreadsheet,
  FileSignature,
  FilePlus,
  FolderPlus,
  BookOpen,
  Smartphone,
  Cloud,
  Images,
  Link,
  Mail,
  MessageCircle,
  ExternalLink,
  QrCode
} from "lucide-react";

export type { DocumentItem } from "../types/domain";
import type { DocumentItem } from "../types/domain";

// The deliberately small filing structure selected for Owners Local OS.
export const FOLDER_TAXONOMY: Array<{ id: string; icon: string; subfolders: string[] }> = [
  { id: "Estimates", icon: "📝", subfolders: ["Estimates"] },
  { id: "Invoices", icon: "💳", subfolders: ["Invoices"] },
  { id: "Customer Notes", icon: "🗒️", subfolders: ["Customer Notes"] },
  { id: "Employees", icon: "👤", subfolders: ["Employee Files"] },
  { id: "Taxes", icon: "🏛️", subfolders: ["Tax Documents"] },
  { id: "Expenses/Receipts", icon: "🧾", subfolders: ["Expenses", "Receipts"] },
  // Original photos captured by every AI scan flow (receipts, invoices,
  // bills, checks) -- auto-filed here, never manually uploaded.
  { id: "Snapshots", icon: "📸", subfolders: ["Receipts", "Invoices", "Bills", "Checks"] }
];

/**
 * Real, deterministic best-effort folder assignment for documents that
 * predate this taxonomy (folder is undefined) -- so nothing a real user
 * already uploaded silently disappears from the new cabinet view. Priority
 * mirrors how the fields are actually populated elsewhere in this file.
 */
export function inferFolderForDoc(doc: DocumentItem): string {
  if (doc.type === "Employee Files") return "Employees";
  if (doc.type === "Invoices") return "Invoices";
  if (doc.type === "Estimates") return "Estimates";
  if (doc.type === "Receipts" || doc.type === "Expenses") return "Expenses/Receipts";
  if (doc.type.toLowerCase().includes("tax")) return "Taxes";
  return "Customer Notes";
}

interface CustomDocumentFolder { id: string; name: string }


const STOCK_TEMPLATES = [
  { id: "tpl-w2",       name: "W-2 Wage Statement",         icon: "📋", desc: "IRS W-2 — employee annual wages",           color: "from-violet-700 to-violet-500",   action: "link"  as const, url: "https://www.irs.gov/pub/irs-pdf/fw2.pdf"            },
  { id: "tpl-1099nec",  name: "1099-NEC Contractor",        icon: "📋", desc: "IRS 1099-NEC — non-employee compensation",  color: "from-amber-700 to-amber-500",     action: "link"  as const, url: "https://www.irs.gov/pub/irs-pdf/f1099nec.pdf"        },
  { id: "tpl-i9",       name: "I-9 Employment Eligibility", icon: "🪪", desc: "USCIS I-9 — employment eligibility form",   color: "from-teal-700 to-teal-500",       action: "link"  as const, url: "https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf" },
] as const;

export const DocumentsPage: React.FC = () => {
  const { loggedInUser, simulatedRole, businessId } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const { documents, setDocuments, customers: customersList, recentRoster, schedulingEvents, employees, generatedPdfDraft, setGeneratedPdfDraft, pendingSignatureCapture, setPendingSignatureCapture, preSelectedCustomerId, setPreSelectedCustomerId, businessProfile } = useDomainData();
  const {
    openPlaceholderPage: onOpenPlaceholder,
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    navigateToScreen: onNavigateToScreen,
    logOperationalEvent
  } = useNavTelemetry();
  // Navigation filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string | null>(null);
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string | null>(null);
  const [searchByField, setSearchByField] = useState<string>("all");

  // Advanced filters state
  const [filterCustomer, setFilterCustomer] = useState("All");
  const [filterEmployee, setFilterEmployee] = useState("All");
  const [filterVendor, setFilterVendor] = useState("All");
  const [filterJob, setFilterJob] = useState("All");
  const [filterDocType, setFilterDocType] = useState("All");
  const [filterSignedStatus, setFilterSignedStatus] = useState<"All" | "Signed" | "Unsigned">("All");
  const [filterFavorite, setFilterFavorite] = useState<boolean>(false);
  const [filterArchived, setFilterArchived] = useState<boolean>(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Selected Document for details pane
  const [selectedDocId, setSelectedDocId] = useState<string | null>("doc_1");
  const activeDoc = useMemo(() => {
    return documents.find((d) => d.id === selectedDocId) || documents[0] || null;
  }, [documents, selectedDocId]);

  // Native PDF / eSign editor state. Nothing is saved to the Documents Hub
  // just from opening the editor -- a real document row only gets created
  // when the user actually saves (SelfieSaveEditor's onSave -> below),
  // so opening/closing without saving never leaves junk drafts behind.
  const [isPDFEditorOpen, setIsPDFEditorOpen] = useState(false);
  const [pdfEditorDocId, setPdfEditorDocId] = useState<string | null>(null);
  const [pdfEditorDocName, setPdfEditorDocName] = useState("");
  const [pdfEditorBase64, setPdfEditorBase64] = useState("");
  const [pdfEditorAutoOpenPicker, setPdfEditorAutoOpenPicker] = useState(false);

  useEffect(() => {
    if (!generatedPdfDraft) return;
    setPdfEditorDocId(null);
    setPdfEditorDocName(generatedPdfDraft.filename);
    setPdfEditorBase64("");
    setPdfEditorAutoOpenPicker(false);
    setIsPDFEditorOpen(true);
  }, [generatedPdfDraft]);

  // "Collect Signatures" from a customer card -- open the PDF Editor
  // straight to its file picker so the owner can choose the real document
  // (from Device / Drive) they want signed, pre-filling that customer's
  // name onto the default signer role.
  useEffect(() => {
    if (!pendingSignatureCapture) return;
    setPdfEditorDocId(null);
    setPdfEditorDocName("");
    setPdfEditorBase64("");
    setPdfEditorAutoOpenPicker(true);
    setIsPDFEditorOpen(true);
  }, [pendingSignatureCapture]);
  const signatureCaptureHint = pendingSignatureCapture ? { customerName: pendingSignatureCapture.customerName } : null;

  // Cross-navigation: "View Documents" from a customer card lands here
  // already filtered to that customer's documents.
  useEffect(() => {
    if (!preSelectedCustomerId) return;
    const match = customersList.find(c => c.id === preSelectedCustomerId);
    if (match) {
      setFilterCustomer(match.contact || match.company);
      setShowAdvancedFilters(true);
    }
    setPreSelectedCustomerId(undefined);
  }, [preSelectedCustomerId, customersList, setPreSelectedCustomerId]);

  // Documents hub tab
  type DocTab = 'all' | 'estimates' | 'invoices' | 'templates' | 'taxes' | 'signed';
  const [activeDocTab, setActiveDocTab] = useState<DocTab>('all');

  const closePDFEditor = () => {
    setIsPDFEditorOpen(false);
    setGeneratedPdfDraft(null);
    setPendingSignatureCapture(null);
  };

  // Dynamic directory lists for Create Folder action
  // Owner-created folders are tenant-scoped and persist beside documents.
  const [customFolderRecords, setCustomFolderRecords] = useFirestoreCollection<CustomDocumentFolder>("document_folders", businessId);
  const foldersList = useMemo(() => customFolderRecords.map(folder => folder.name), [customFolderRecords]);

  // Secondary high-fidelity interactive modals
  const [isGoogleDriveModalOpen, setIsGoogleDriveModalOpen] = useState(false);
  const [isPhoneUploadModalOpen, setIsPhoneUploadModalOpen] = useState(false);
  const [isPhotoToPDFModalOpen, setIsPhotoToPDFModalOpen] = useState(false);
  const [isMainShareModalOpen, setIsMainShareModalOpen] = useState(false);
  const [shareDocItem, setShareDocItem] = useState<DocumentItem | null>(null);
  const [shareRecipient, setShareRecipient] = useState("");

  // Photo-to-PDF selection state
  const [photoToPdfName, setPhotoToPdfName] = useState("Photo Compilation.pdf");
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);

  // Real one-time migration: any document uploaded/scanned/generated before
  // the folder taxonomy existed has no `folder` field. Backfill a real,
  // deterministic inferred folder for each so nothing a user already saved
  // silently vanishes from the new cabinet view.
  useEffect(() => {
    const needsBackfill = documents.some(d => !d.folder);
    if (needsBackfill) {
      setDocuments(prev => prev.map(d => (d.folder ? d : { ...d, folder: inferFolderForDoc(d) })));
    }
  }, [documents, setDocuments]);

  // Handler to open the native SelfieSave eSign editor. When autoOpenPdfPicker
  // is set (the Documents Hub "Open PDF" / "Edit PDF" buttons), the editor
  // immediately triggers its own native file picker on mount -- no extra
  // click, no intermediate screen.
  const handleOpenPDFEditor = (doc: DocumentItem | null, autoOpenPdfPicker: boolean = false) => {
    setPdfEditorDocId(doc?.id || null);
    setPdfEditorDocName(doc?.name || "");
    setPdfEditorBase64((doc as any)?.pdfBase64 || "");
    setPdfEditorAutoOpenPicker(autoOpenPdfPicker);
    setIsPDFEditorOpen(true);
    if (doc) {
      triggerNotification(`Opening ${doc.name} in SelfieSave eSign`);
    }
  };

  // Handler to save PDF Editor modifications
  const handleSavePDFEditor = (docId: string, updatedName: string, metaProperties?: any) => {
    setDocuments(prev => {
      const exists = prev.some(d => d.id === docId);
      if (exists) {
        return prev.map(d => {
          if (d.id === docId) {
            // Anti-frustration: protect standard templates from being altered!
            if (d.id.startsWith("doc_template_")) {
              triggerNotification("⚠️ Standard templates are locked. Creating a custom copy with your edits!");
              const copyId = `doc_dup_${Date.now()}`;
              return {
                ...d,
                id: copyId,
                name: `Copy of ${updatedName}`,
                isFavorite: false,
                status: metaProperties?.status || "Awaiting Signature",
                folder: "eSign",
                lastModified: new Date().toISOString().replace('T', ' ').substring(0, 19),
                metaObjects: metaProperties?.objects || [],
                auditTrail: metaProperties?.auditTrail || [],
                signingOptions: metaProperties?.signingOptions || {}
              };
            }
            return {
              ...d,
              name: updatedName,
              status: metaProperties?.status || d.status,
              lastModified: new Date().toISOString().replace('T', ' ').substring(0, 19),
              metaObjects: metaProperties?.objects || [],
              auditTrail: metaProperties?.auditTrail || (d as any).auditTrail || [],
              signingOptions: metaProperties?.signingOptions || (d as any).signingOptions || {},
              pdfBase64: metaProperties?.pdfBase64 || (d as any).pdfBase64,
              size: metaProperties?.actualSizeBytes ? `${Math.max(1, Math.ceil(metaProperties.actualSizeBytes / 1024))} KB` : d.size
            };
          }
          return d;
        });
      } else {
        // Create brand new blank PDF document item
        const newDoc: DocumentItem = {
          id: docId,
          name: updatedName,
          customer: generatedPdfDraft?.customerName || pendingSignatureCapture?.customerName || "None",
          employee: loggedInUser?.name || "Staff Administrator",
          vendor: "None",
          job: generatedPdfDraft?.sourceType === "Job" ? generatedPdfDraft.sourceId : "None",
          type: generatedPdfDraft?.sourceType === "Invoice" ? "Invoices" : generatedPdfDraft?.sourceType === "Estimate" ? "Estimates" : "Contracts",
          uploadedBy: loggedInUser?.name || "Staff Administrator",
          date: new Date().toISOString().split('T')[0],
          size: metaProperties?.actualSizeBytes ? `${Math.max(1, Math.ceil(metaProperties.actualSizeBytes / 1024))} KB` : "Draft",
          status: metaProperties?.status || "Awaiting Signature",
          folder: "eSign",
          isFavorite: false,
          isArchived: false,
          notes: "Generated from OwnersLOCAL Native PDF Editor tool.",
          tags: ["Editor", "Draft"],
          estimateId: generatedPdfDraft?.sourceType === "Estimate" ? generatedPdfDraft.sourceId : "None",
          invoiceId: generatedPdfDraft?.sourceType === "Invoice" ? generatedPdfDraft.sourceId : "None",
          lastModified: new Date().toISOString().replace('T', ' ').substring(0, 19),
          metaObjects: metaProperties?.objects || []
        };
        (newDoc as any).auditTrail = metaProperties?.auditTrail || [];
        (newDoc as any).signingOptions = metaProperties?.signingOptions || {};
        (newDoc as any).pdfBase64 = metaProperties?.pdfBase64 || "";
        return [...prev, newDoc];
      }
    });

    // A signer committing their portion mid-session needs the Documents list
    // to pick up the new lock/status right away without booting the drafter
    // out of the editor (they may still be waiting on other signers, or
    // about to finalize) -- see SelfieSaveEditor's commitParty.
    if (metaProperties?.keepEditorOpen) return;

    closePDFEditor();
    triggerNotification(`💾 Saved changes to: ${updatedName}`);
    if (logOperationalEvent) {
      logOperationalEvent("PDF Editor Save", `Updated elements inside ${updatedName}`, "💾");
    }
  };

  const handleCreateFolder = () => {
    const name = prompt("Enter new folder directory name:");
    if (name && name.trim()) {
      const trimmed = name.trim();
      const existingNames = [...FOLDER_TAXONOMY.map(folder => folder.id), ...foldersList];
      if (existingNames.some(existing => existing.toLowerCase() === trimmed.toLowerCase())) {
        triggerNotification("⚠️ Folder directory already exists");
        return;
      }
      setCustomFolderRecords(prev => [...prev, { id: `folder_${Date.now()}`, name: trimmed }]);
      triggerNotification(`📁 Created folder directory: ${trimmed}`);
      if (logOperationalEvent) {
        logOperationalEvent("Folder Created", `New directory '${trimmed}' added to local structure`, "📁");
      }
    }
  };

  // Modal States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "json" | "tsv">("csv");
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [exportContent, setExportContent] = useState<string>("");

  // Snapshot Camera Simulation States
  const [snapshotStep, setSnapshotStep] = useState<"camera" | "scanning" | "ai_review" | "done">("camera");
  const [scannedDocType, setScannedDocType] = useState<string>("Receipts");
  const [cameraProgress, setCameraProgress] = useState(0);
  const [aiConfidenceCheck, setAiConfidenceCheck] = useState(true);
  const [aiInterpretationIssue, setAiInterpretationIssue] = useState<"customer" | "vendor" | "none">("none");
  const [resolvedCustomer, setResolvedCustomer] = useState("");
  const [resolvedVendor, setResolvedVendor] = useState("");
  const [tempDocName, setTempDocName] = useState("");

  // Form states
  const [uploadName, setUploadName] = useState("");
  const [uploadFolder, setUploadFolder] = useState("Estimates");
  const [uploadType, setUploadType] = useState("Estimates");
  const [uploadCustomer, setUploadCustomer] = useState("None");
  const [uploadEmployee, setUploadEmployee] = useState("None");
  const [uploadVendor, setUploadVendor] = useState("None");
  const [uploadJob, setUploadJob] = useState("None");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"Signed" | "Unsigned" | "Pending">("Signed");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [renameName, setRenameName] = useState("");

  // Attach state
  const [attachTargetType, setAttachTargetType] = useState<"Customer" | "Job" | "Employee">("Customer");
  const [attachValue, setAttachValue] = useState("");

  // Helper arrays for unique list values
  const customers = useMemo(() => {
    const list = new Set(documents.map(d => d.customer).filter(c => c !== "None"));
    return ["All", "None", ...Array.from(list)];
  }, [documents]);

  const employeeDocNames = useMemo(() => {
    const list = new Set(documents.map(d => d.employee).filter(e => e !== "None"));
    return ["All", "None", ...Array.from(list)];
  }, [documents]);

  const vendors = useMemo(() => {
    const list = new Set(documents.map(d => d.vendor).filter(v => v !== "None"));
    return ["All", "None", ...Array.from(list)];
  }, [documents]);

  const jobs = useMemo(() => {
    const list = new Set(documents.map(d => d.job).filter(j => j !== "None"));
    return ["All", "None", ...Array.from(list)];
  }, [documents]);

  // Document Types List -- every real subfolder name across the whole
  // taxonomy, flattened and deduped (some names like "Photos"/"Insurance"
  // repeat across folders; this list is for the flat cross-folder
  // "Document Type" advanced filter, not folder navigation).
  const docTypes = useMemo(
    () => Array.from(new Set(FOLDER_TAXONOMY.flatMap(f => f.subfolders))).concat("Custom"),
    []
  );

  // Role permissions check
  const hasManagePermission = useMemo(() => {
    const managers = ["Owner", "General Manager", "Office Manager", "Operations Manager", "HR", "Payroll", "HR Manager", "Payroll Manager"];
    return managers.includes(activeRole);
  }, [activeRole]);

  // Filtered documents
  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      // Role permission security check
      if (!hasManagePermission) {
        // Regular employees can only see files they uploaded or related to them
        const uName = loggedInUser?.name || "Unknown User";
        if (doc.type === "Employee Files" || doc.type === "Payroll Documents") {
          if (doc.employee !== uName && doc.uploadedBy !== uName) {
            return false;
          }
        }
      }

      // Sidebar Folder Filter -- real cabinet taxonomy (FOLDER_TAXONOMY)
      if (selectedFolderFilter) {
        if (selectedFolderFilter === "Favorites") {
          if (!doc.isFavorite) return false;
        } else if (selectedFolderFilter === "Archived") {
          if (!doc.isArchived) return false;
        } else if (selectedFolderFilter === "Standard Templates") {
          if (!doc.tags.includes("Template") && !doc.tags.includes("Standard")) return false;
        } else if (FOLDER_TAXONOMY.some(f => f.id === selectedFolderFilter)) {
          if ((doc.folder || inferFolderForDoc(doc)) !== selectedFolderFilter) return false;
        } else {
          if (doc.folder !== selectedFolderFilter && !doc.tags.includes(selectedFolderFilter)) return false;
        }
      }

      // Summary Card / Subfolder Type Filter
      if (selectedTypeFilter) {
        if (selectedTypeFilter === "Recently Added") {
          // Simulated last 5 days
          const docDate = new Date(doc.date);
          const limitDate = new Date("2026-07-02");
          if (docDate < limitDate) return false;
        } else if (selectedTypeFilter === "Employee Documents") {
          if (doc.type !== "Employee Files" && doc.type !== "Payroll Documents") return false;
        } else if (selectedFolderFilter === "eSign" && ["Pending", "Sent", "Viewed", "Rejected", "Expired"].includes(selectedTypeFilter)) {
          // eSign subfolders track real signature status, not doc.type.
          if (doc.status !== selectedTypeFilter) return false;
        } else if (selectedFolderFilter === "eSign" && selectedTypeFilter === "Completed") {
          if (doc.status !== "Signed") return false;
        } else {
          if (doc.type !== selectedTypeFilter) return false;
        }
      }

      // Search Match
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = doc.name.toLowerCase().includes(query);
        const matchesCustomer = doc.customer.toLowerCase().includes(query);
        const matchesEmployee = doc.employee.toLowerCase().includes(query);
        const matchesVendor = doc.vendor.toLowerCase().includes(query);
        const matchesJob = doc.job.toLowerCase().includes(query);
        const matchesInvoice = doc.invoiceId.toLowerCase().includes(query);
        const matchesEstimate = doc.estimateId.toLowerCase().includes(query);
        const matchesType = doc.type.toLowerCase().includes(query);
        const matchesTags = doc.tags.some(t => t.toLowerCase().includes(query));

        if (searchByField === "all") {
          if (!matchesName && !matchesCustomer && !matchesEmployee && !matchesVendor && !matchesJob && !matchesInvoice && !matchesEstimate && !matchesType && !matchesTags) {
            return false;
          }
        } else if (searchByField === "customer") {
          if (!matchesCustomer) return false;
        } else if (searchByField === "employee") {
          if (!matchesEmployee) return false;
        } else if (searchByField === "vendor") {
          if (!matchesVendor) return false;
        } else if (searchByField === "job") {
          if (!matchesJob) return false;
        } else if (searchByField === "invoice") {
          if (!matchesInvoice) return false;
        } else if (searchByField === "estimate") {
          if (!matchesEstimate) return false;
        } else if (searchByField === "name") {
          if (!matchesName) return false;
        } else if (searchByField === "tags") {
          if (!matchesTags) return false;
        }
      }

      // Advanced Filters
      if (filterCustomer !== "All") {
        if (doc.customer !== filterCustomer) return false;
      }
      if (filterEmployee !== "All") {
        if (doc.employee !== filterEmployee) return false;
      }
      if (filterVendor !== "All") {
        if (doc.vendor !== filterVendor) return false;
      }
      if (filterJob !== "All") {
        if (doc.job !== filterJob) return false;
      }
      if (filterDocType !== "All") {
        if (doc.type !== filterDocType) return false;
      }
      if (filterSignedStatus === "Signed") {
        if (doc.status !== "Signed") return false;
      } else if (filterSignedStatus === "Unsigned") {
        if (doc.status !== "Unsigned") return false;
      }
      if (filterFavorite && !doc.isFavorite) return false;
      if (filterArchived) {
        if (!doc.isArchived) return false;
      } else {
        if (doc.isArchived) return false;
      }

      return true;
    });
  }, [documents, searchQuery, selectedTypeFilter, selectedFolderFilter, searchByField, filterCustomer, filterEmployee, filterVendor, filterJob, filterDocType, filterSignedStatus, filterFavorite, filterArchived, hasManagePermission, loggedInUser]);

  // Metrics calculators
  const typeMetrics = useMemo(() => {
    const total = documents.length;
    const contracts = documents.filter(d => d.type === "Contracts").length;
    const estimates = documents.filter(d => d.type === "Estimates").length;
    const invoices = documents.filter(d => d.type === "Invoices").length;
    const receipts = documents.filter(d => d.type === "Receipts").length;
    const photos = documents.filter(d => d.type === "Photos").length;
    const empDocs = documents.filter(d => d.type === "Employee Files" || d.type === "Payroll Documents").length;
    const recentlyAdded = documents.filter(d => new Date(d.date) >= new Date("2026-07-02")).length;

    return { total, contracts, estimates, invoices, receipts, photos, empDocs, recentlyAdded };
  }, [documents]);

  // Tab-level secondary filter
  const tabFilteredDocs = useMemo(() => {
    if (activeDocTab === "estimates") return filteredDocs.filter((d: any) => d.type === "Estimates");
    if (activeDocTab === "invoices")  return filteredDocs.filter((d: any) => d.type === "Invoices");
    if (activeDocTab === "taxes")     return filteredDocs.filter((d: any) =>
      d.type === "Tax Documents" || (d.tags ?? []).some((t: string) => /tax|w-?2|1099|i-?9/i.test(t))
    );
    if (activeDocTab === "signed")    return filteredDocs.filter((d: any) =>
      d.status === "Signed" || d.type === "Contracts" || d.folder === "eSign"
    );
    return filteredDocs;
  }, [filteredDocs, activeDocTab]);

  // Trigger simulated Refresh
  const handleRefresh = () => {
    if (logOperationalEvent) {
      logOperationalEvent("Documents Refreshed", "Operational files system synced with Cloud Storage nodes", "🔄");
    }
    setSearchQuery("");
    setSelectedTypeFilter(null);
    setSelectedFolderFilter(null);
    triggerNotification("📁 Documents Database synchronized successfully");
  };

  // State utility for alerts
  const [alertText, setAlertText] = useState<string | null>(null);
  const triggerNotification = (text: string) => {
    setAlertText(text);
    setTimeout(() => {
      setAlertText(null);
    }, 3000);
  };

  // Upload actions
  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      triggerNotification("⚠️ Please select a file to upload.");
      return;
    }
    if (!uploadName.trim()) {
      triggerNotification("⚠️ Please specify a document name.");
      return;
    }

    const tagsArray = uploadTags.split(",").map(t => t.trim()).filter(t => t.length > 0);
    const uName = loggedInUser?.name || "Unknown User";

    // Use actual file size
    const sizeStr = uploadFile.size > 1024 * 1024
      ? `${(uploadFile.size / (1024 * 1024)).toFixed(2)} MB`
      : `${(uploadFile.size / 1024).toFixed(1)} KB`;

    // Retain exact original extension if they didn't specify one
    const hasExtension = uploadName.includes(".");
    const fileExt = uploadFile.name.split(".").pop() || "pdf";
    const finalName = hasExtension ? uploadName : `${uploadName}.${fileExt}`;

    const newDoc: DocumentItem = {
      id: "doc_" + Math.random().toString(36).substring(2, 9),
      name: finalName,
      customer: uploadCustomer,
      employee: uploadEmployee,
      vendor: uploadVendor,
      job: uploadJob,
      type: uploadType,
      folder: uploadFolder,
      uploadedBy: uName,
      date: new Date().toISOString().slice(0, 10),
      size: sizeStr,
      status: uploadStatus === "Pending" ? "Pending" : uploadStatus,
      isFavorite: false,
      isArchived: false,
      notes: uploadNotes.trim() || `Uploaded via document dashboard console. File type: ${uploadFile.type || "unknown"}`,
      tags: tagsArray.length > 0 ? tagsArray : [uploadType.replace("s", "")],
      // Uploading a file does not create an estimate or invoice record.
      // A real relationship is added only when the user attaches one.
      estimateId: "None",
      invoiceId: "None",
      lastModified: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      url: URL.createObjectURL(uploadFile)
    };

    setDocuments(prev => [newDoc, ...prev]);
    setIsUploadModalOpen(false);
    setSelectedDocId(newDoc.id);

    // Event engine integration
    if (logOperationalEvent) {
      logOperationalEvent("Document Uploaded", `New document '${newDoc.name}' attached to ${uploadCustomer !== "None" ? uploadCustomer : "General Folder"}`, "📤");
    }

    triggerNotification(`✅ Document uploaded successfully: ${newDoc.name}`);

    // Reset fields
    setUploadName("");
    setUploadNotes("");
    setUploadTags("");
    setUploadFile(null);
  };

  // Rename action
  const handleRenameSubmit = () => {
    if (!renameName.trim() || !activeDoc) return;
    const oldName = activeDoc.name;
    const finalName = renameName.includes(".") ? renameName : `${renameName}.pdf`;

    setDocuments(prev => prev.map(d => d.id === activeDoc.id ? { ...d, name: finalName, lastModified: "Just now" } : d));
    setIsRenameModalOpen(false);

    if (logOperationalEvent) {
      logOperationalEvent("Document Renamed", `Renamed '${oldName}' to '${finalName}'`, "📝");
    }
    triggerNotification(`📝 Document renamed to ${finalName}`);
  };

  // Delete action
  const handleDeleteSubmit = () => {
    if (!activeDoc) return;
    setDocuments(prev => prev.filter(d => d.id !== activeDoc.id));
    setIsDeleteModalOpen(false);
    setSelectedDocId(null);

    if (logOperationalEvent) {
      logOperationalEvent("Document Deleted", `Document '${activeDoc.name}' deleted permanently`, "🗑️");
    }
    triggerNotification(`🗑️ Document deleted successfully`);
  };

  // Archive action
  const handleToggleArchive = (doc: DocumentItem) => {
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, isArchived: !d.isArchived, lastModified: "Just now" } : d));
    if (logOperationalEvent) {
      logOperationalEvent(doc.isArchived ? "Document Restored" : "Document Archived", `'${doc.name}' ${doc.isArchived ? "restored from archive" : "moved to archives"}`, "📁");
    }
    triggerNotification(doc.isArchived ? "📁 Document restored to active index" : "📦 Document moved to Archive Folder");
  };

  // Favorite action
  const handleToggleFavorite = (doc: DocumentItem) => {
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, isFavorite: !d.isFavorite } : d));
    triggerNotification(doc.isFavorite ? "⭐ Removed from Favorites" : "⭐ Added to Favorites");
  };

  // Attach action
  const handleAttachSubmit = () => {
    if (!activeDoc || !attachValue.trim()) return;

    setDocuments(prev => prev.map(d => {
      if (d.id === activeDoc.id) {
        return {
          ...d,
          customer: attachTargetType === "Customer" ? attachValue : d.customer,
          job: attachTargetType === "Job" ? attachValue : d.job,
          employee: attachTargetType === "Employee" ? attachValue : d.employee,
          lastModified: "Just now"
        };
      }
      return d;
    }));

    setIsAttachModalOpen(false);
    if (logOperationalEvent) {
      logOperationalEvent("Document Connected", `Document '${activeDoc.name}' connected to ${attachTargetType}: ${attachValue}`, "🔗");
    }
    triggerNotification(`🔗 Attached to ${attachTargetType}: ${attachValue}`);
  };

  // Export actions
  const convertToCSV = (docs: DocumentItem[]) => {
    const headers = ["ID", "Document Name", "Customer Link", "Employee Link", "Vendor Link", "Job Link", "Type", "Uploaded By", "Date Created", "File Size", "Status", "Is Favorite", "Is Archived", "Notes", "Tags", "Estimate ID", "Invoice ID", "Last Modified"];
    const rows = docs.map(d => [
      d.id,
      `"${(d.name || "").replace(/"/g, '""')}"`,
      `"${(d.customer || "").replace(/"/g, '""')}"`,
      `"${(d.employee || "").replace(/"/g, '""')}"`,
      `"${(d.vendor || "").replace(/"/g, '""')}"`,
      `"${(d.job || "").replace(/"/g, '""')}"`,
      `"${(d.type || "").replace(/"/g, '""')}"`,
      `"${(d.uploadedBy || "").replace(/"/g, '""')}"`,
      d.date,
      d.size,
      d.status,
      d.isFavorite ? "TRUE" : "FALSE",
      d.isArchived ? "TRUE" : "FALSE",
      `"${(d.notes || "").replace(/"/g, '""')}"`,
      `"${(d.tags || []).join(", ").replace(/"/g, '""')}"`,
      d.estimateId,
      d.invoiceId,
      d.lastModified
    ]);
    return [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
  };

  const convertToTSV = (docs: DocumentItem[]) => {
    const headers = ["ID", "Document Name", "Customer Link", "Employee Link", "Vendor Link", "Job Link", "Type", "Uploaded By", "Date Created", "File Size", "Status", "Is Favorite", "Is Archived", "Notes", "Tags", "Estimate ID", "Invoice ID", "Last Modified"];
    const rows = docs.map(d => [
      d.id,
      (d.name || "").replace(/\t/g, ' '),
      (d.customer || "").replace(/\t/g, ' '),
      (d.employee || "").replace(/\t/g, ' '),
      (d.vendor || "").replace(/\t/g, ' '),
      (d.job || "").replace(/\t/g, ' '),
      (d.type || "").replace(/\t/g, ' '),
      (d.uploadedBy || "").replace(/\t/g, ' '),
      d.date,
      d.size,
      d.status,
      d.isFavorite ? "TRUE" : "FALSE",
      d.isArchived ? "TRUE" : "FALSE",
      (d.notes || "").replace(/\t/g, ' '),
      (d.tags || []).join(", ").replace(/\t/g, ' '),
      d.estimateId,
      d.invoiceId,
      d.lastModified
    ]);
    return [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\r\n");
  };

  const executeExport = (format: "csv" | "json" | "tsv") => {
    let content = "";
    let fileName = "";
    let mimeType = "";

    if (format === "json") {
      content = JSON.stringify(documents, null, 2);
      fileName = "ownerslocal_documents_database.json";
      mimeType = "application/json";
    } else if (format === "tsv") {
      content = convertToTSV(documents);
      fileName = "ownerslocal_documents_database.tsv";
      mimeType = "text/tab-separated-values";
    } else {
      content = convertToCSV(documents);
      fileName = "ownerslocal_documents_database.csv";
      mimeType = "text/csv";
    }

    setExportContent(content);
    setExportSuccessMessage(`Generating database export in ${format.toUpperCase()} format...`);

    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setExportSuccessMessage(`Successfully downloaded ${fileName}!`);
      if (logOperationalEvent) {
        logOperationalEvent("Database Exported", `Documents database exported as ${format.toUpperCase()}`, "📥");
      }
      triggerNotification(`✅ Export downloaded: ${fileName}`);
    } catch (err) {
      console.error(err);
      setExportSuccessMessage(`Download initiated. Since you are in an iframe workspace, we've also provided a copy/paste option below!`);
    }
  };

  // Snapshot AI simulated scan step trigger
  const runCameraSnapshotAI = () => {
    setSnapshotStep("scanning");
    setCameraProgress(0);

    const interval = setInterval(() => {
      setCameraProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setSnapshotStep("ai_review");
          const initialDocName = `AI_SCAN_${scannedDocType}_${Math.floor(100 + Math.random() * 900)}.pdf`;
          setTempDocName(initialDocName);
          // No real OCR/AI extraction runs here -- leave customer/vendor
          // unresolved so the owner fills in the real values themselves
          // rather than showing a fabricated match.
          setResolvedCustomer("None");
          setResolvedVendor("None");
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  };

  // Approve Snapshot AI Document
  const handleApproveSnapshotAI = () => {
    const docName = tempDocName || `AI_SCAN_${scannedDocType}_${Math.floor(100 + Math.random() * 900)}.pdf`;
    const uName = loggedInUser?.name || "Unknown User";

    const newDoc: DocumentItem = {
      id: "doc_ai_" + Math.random().toString(36).substring(2, 9),
      name: docName,
      customer: resolvedCustomer || "None",
      employee: uName,
      vendor: resolvedVendor || "None",
      // No real OCR/AI extraction runs here (see the comment above in
      // runCameraSnapshotAI) -- leave job/estimate/invoice unresolved and the
      // document unsigned, same as customer/vendor, rather than fabricating a
      // link to an unrelated job or a signature that was never captured.
      job: "None",
      type: scannedDocType,
      uploadedBy: "Owner's AI Scanner",
      date: new Date().toISOString().slice(0, 10),
      size: "240 KB",
      status: "Unsigned",
      isFavorite: false,
      isArchived: false,
      notes: `Scanned and generated via Snapshot AI Scanner. Automatically categorized under ${scannedDocType}.`,
      tags: ["AI Scanned", scannedDocType.replace("s", "")],
      estimateId: "None",
      invoiceId: "None",
      lastModified: "Just now"
    };

    setDocuments(prev => [newDoc, ...prev]);
    setIsSnapshotModalOpen(false);
    setSelectedDocId(newDoc.id);

    if (logOperationalEvent) {
      logOperationalEvent("Snapshot AI Scan", `Snapshot AI successfully scanned and cataloged '${docName}'`, "🤖");
    }

    triggerNotification(`🤖 Snapshot AI scanned & saved: ${docName}`);
  };

  // Helper function to return nice file icons
  const getFileIcon = (type: string) => {
    switch (type) {
      case "Contracts":
        return <FileSignature className="w-8 h-8 text-blue-600" />;
      case "Estimates":
        return <FileText className="w-8 h-8 text-emerald-600" />;
      case "Invoices":
        return <FileSpreadsheet className="w-8 h-8 text-indigo-600" />;
      case "Receipts":
        return <DollarSign className="w-8 h-8 text-amber-600" />;
      case "Blueprints":
        return <Layers className="w-8 h-8 text-cyan-600" />;
      case "Photos":
        return <Image className="w-8 h-8 text-pink-600" />;
      case "Videos":
        return <Video className="w-8 h-8 text-rose-600" />;
      default:
        return <FileText className="w-8 h-8 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {alertText && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-blue-500/30 shadow-lg rounded-2xl px-4 py-3.5 flex items-center gap-3 z-50 text-xs md:text-sm animate-fade-in text-slate-100 max-w-sm">
          <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-white mb-0.5">Documents Alert</p>
            <p className="text-slate-400 font-medium text-xs leading-tight">{alertText}</p>
          </div>
        </div>
      )}

      {/* TOP CARD */}
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col gap-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-extrabold text-[#1F3557] tracking-tight uppercase">
              Documents Hub
            </h2>
            <p className="text-xs text-[#5E7393] font-sans font-semibold mt-1">
              Upload, find, and open your business documents
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setUploadName("");
                setUploadNotes("");
                setIsUploadModalOpen(true);
              }}
              className="px-3.5 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Document
            </button>
            <button
              onClick={() => {
                setSnapshotStep("camera");
                setIsSnapshotModalOpen(true);
              }}
              className="px-3.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              Snapshot AI
            </button>
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`px-3.5 py-2 border rounded-xl text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer ${
                showAdvancedFilters
                  ? "bg-[#315C9F] border-[#315C9F] text-white"
                  : "bg-[#EAF5FF] border-[#9EC8EF] text-[#1F3557] hover:bg-[#BDDDF8]"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
            </button>
            <button
              onClick={() => {
                setIsExportModalOpen(true);
                setExportSuccessMessage(null);
                setExportContent("");
              }}
              className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
            >
              Export
            </button>
            <button
              onClick={handleRefresh}
              className="p-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] rounded-xl cursor-pointer"
              title="Refresh Sync"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="bg-[#EAF5FF] p-4.5 rounded-2xl border border-[#9EC8EF] space-y-3">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E7393]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents by name, customer, employee, tags, invoice #, estimate #..."
                className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#4A86F7] font-medium font-sans text-[#1F3557]"
              />
            </div>
            <select
              value={searchByField}
              onChange={(e) => setSearchByField(e.target.value)}
              className="bg-[#EAF5FF] border border-[#9EC8EF] text-xs text-[#1F3557] font-bold rounded-xl px-3 py-2.5 focus:outline-none"
            >
              <option value="all">Search All Fields</option>
              <option value="name">Document Name</option>
              <option value="customer">Customer</option>
              <option value="employee">Employee</option>
              <option value="vendor">Vendor</option>
              <option value="job">Job #</option>
              <option value="invoice">Invoice #</option>
              <option value="estimate">Estimate #</option>
              <option value="tags">Tags</option>
            </select>
          </div>

        </div>

        {/* ADVANCED FILTERS PANEL */}
        {showAdvancedFilters && (
          <div className="bg-[#EAF5FF] p-4.5 rounded-2xl border border-[#9EC8EF] grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs font-bold text-[#1F3557] animate-fade-in">
            <div className="space-y-1 flex flex-col text-left">
              <label>Customer</label>
              <select
                value={filterCustomer}
                onChange={(e) => setFilterCustomer(e.target.value)}
                className="bg-[#F5FAFF] border border-[#9EC8EF] rounded-xl px-2.5 py-2 focus:outline-none"
              >
                {customers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 flex flex-col text-left">
              <label>Employee</label>
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="bg-[#F5FAFF] border border-[#9EC8EF] rounded-xl px-2.5 py-2 focus:outline-none"
              >
                {employeeDocNames.map((emp) => (
                  <option key={emp} value={emp}>{emp}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 flex flex-col text-left">
              <label>Vendor</label>
              <select
                value={filterVendor}
                onChange={(e) => setFilterVendor(e.target.value)}
                className="bg-[#F5FAFF] border border-[#9EC8EF] rounded-xl px-2.5 py-2 focus:outline-none"
              >
                {vendors.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 flex flex-col text-left">
              <label>Job Related</label>
              <select
                value={filterJob}
                onChange={(e) => setFilterJob(e.target.value)}
                className="bg-[#F5FAFF] border border-[#9EC8EF] rounded-xl px-2.5 py-2 focus:outline-none"
              >
                {jobs.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 flex flex-col text-left">
              <label>Document Type</label>
              <select
                value={filterDocType}
                onChange={(e) => setFilterDocType(e.target.value)}
                className="bg-[#F5FAFF] border border-[#9EC8EF] rounded-xl px-2.5 py-2 focus:outline-none"
              >
                <option value="All">All Types</option>
                {docTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 flex flex-col text-left">
              <label>Signed Status</label>
              <select
                value={filterSignedStatus}
                onChange={(e) => setFilterSignedStatus(e.target.value as any)}
                className="bg-[#F5FAFF] border border-[#9EC8EF] rounded-xl px-2.5 py-2 focus:outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="Signed">Signed Only</option>
                <option value="Unsigned">Unsigned/Pending Only</option>
              </select>
            </div>

            <div className="flex items-center gap-5 mt-5">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterFavorite}
                  onChange={(e) => setFilterFavorite(e.target.checked)}
                  className="rounded border-[#9EC8EF] text-[#315C9F] focus:ring-[#315C9F] w-4 h-4"
                />
                <span>Favorites ⭐</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterArchived}
                  onChange={(e) => setFilterArchived(e.target.checked)}
                  className="rounded border-[#9EC8EF] text-[#315C9F] focus:ring-[#315C9F] w-4 h-4"
                />
                <span>Archived Only</span>
              </label>
            </div>

            <div className="flex items-end justify-end">
              <button
                onClick={() => {
                  setFilterCustomer("All");
                  setFilterEmployee("All");
                  setFilterVendor("All");
                  setFilterJob("All");
                  setFilterDocType("All");
                  setFilterSignedStatus("All");
                  setFilterFavorite(false);
                  setFilterArchived(false);
                  triggerNotification("Filters Reset");
                }}
                className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-[#1F3557] rounded-xl cursor-pointer"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SUMMARY CARDS (HORIZONTAL CARDS FILTERING DOCUMENTS LIST) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { key: "all", label: "Total Documents", count: typeMetrics.total, icon: "📁", filterVal: null },
          { key: "Contracts", label: "Contracts", count: typeMetrics.contracts, icon: "✍️", filterVal: "Contracts" },
          { key: "Estimates", label: "Estimates", count: typeMetrics.estimates, icon: "📝", filterVal: "Estimates" },
          { key: "Invoices", label: "Invoices", count: typeMetrics.invoices, icon: "💳", filterVal: "Invoices" },
          { key: "Receipts", label: "Receipts", count: typeMetrics.receipts, icon: "🧾", filterVal: "Receipts" },
          { key: "Photos", label: "Photos", count: typeMetrics.photos, icon: "📸", filterVal: "Photos" },
          { key: "Employee Documents", label: "Employee Files", count: typeMetrics.empDocs, icon: "👥", filterVal: "Employee Documents" },
          { key: "Recently Added", label: "Recently Added", count: typeMetrics.recentlyAdded, icon: "⚡", filterVal: "Recently Added" }
        ].map((card) => {
          const isActive = selectedTypeFilter === card.filterVal;
          return (
            <div
              key={card.key}
              onClick={() => {
                setSelectedTypeFilter(isActive ? null : card.filterVal);
                triggerNotification(`Filtered by: ${card.label}`);
              }}
              className={`p-3 rounded-2xl border transition-all cursor-pointer text-left flex flex-col justify-between h-[105px] shadow-sm select-none ${
                isActive
                  ? "bg-[#315C9F] text-white border-[#1F3557] scale-[1.03]"
                  : "bg-[#C7E3FA] hover:bg-[#BDDDF8] text-[#1F3557] border-[#9EC8EF]"
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="text-lg">{card.icon}</span>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
              </div>
              <div>
                <p className={`text-[15px] font-mono font-black ${isActive ? "text-white" : "text-[#1F3557]"}`}>
                  {card.count}
                </p>
                <p className={`text-[9px] font-sans font-black uppercase tracking-wider leading-tight ${isActive ? "text-blue-100" : "text-[#5E7393]"} mt-0.5`}>
                  {card.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ACTION BUTTONS */}
      <div className="flex flex-wrap gap-2 items-center">
        {hasManagePermission && (
          <button
            onClick={() => handleOpenPDFEditor(null)}
            className="px-4 py-2.5 bg-[#315C9F] hover:bg-[#1F3557] text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <FilePlus className="w-4 h-4" />
            Create New Document
          </button>
        )}
        <button
          onClick={() => handleOpenPDFEditor(null, true)}
          className="px-4 py-2.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer"
        >
          <FolderOpen className="w-4 h-4" />
          Open PDF — Device / Drive
        </button>
        <button
          onClick={() => handleOpenPDFEditor(null, true)}
          className="px-4 py-2.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer"
        >
          <Edit3 className="w-4 h-4" />
          Edit PDF
        </button>
      </div>

      {/* Simple filing controls: six defaults plus owner-created folders. */}
      <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl p-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setSelectedFolderFilter(null); setSelectedTypeFilter(null); }}
          className={`px-3 py-2 rounded-xl text-xs font-black transition-colors ${selectedFolderFilter === null ? "bg-[#315C9F] text-white" : "bg-white text-[#1F3557] hover:bg-[#C7E3FA]"}`}
        >
          All Documents
        </button>
        {FOLDER_TAXONOMY.map(folder => (
          <button
            key={folder.id}
            onClick={() => { setSelectedFolderFilter(folder.id); setSelectedTypeFilter(null); }}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 ${selectedFolderFilter === folder.id ? "bg-[#315C9F] text-white" : "bg-white text-[#1F3557] hover:bg-[#C7E3FA]"}`}
          >
            <span>{folder.icon}</span>{folder.id}
          </button>
        ))}
        {foldersList.map(folder => (
          <button
            key={folder}
            onClick={() => { setSelectedFolderFilter(folder); setSelectedTypeFilter(null); }}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 ${selectedFolderFilter === folder ? "bg-[#315C9F] text-white" : "bg-white text-[#1F3557] hover:bg-[#C7E3FA]"}`}
          >
            <Folder className="w-3.5 h-3.5" />{folder}
          </button>
        ))}
        {hasManagePermission && (
          <button
            onClick={handleCreateFolder}
            className="px-3 py-2 rounded-xl text-xs font-black border border-dashed border-[#315C9F] text-[#315C9F] hover:bg-[#C7E3FA] flex items-center gap-1.5"
          >
            <FolderPlus className="w-3.5 h-3.5" /> Add Custom Folder
          </button>
        )}
      </div>

      {/* TAB BAR */}
      <div className="flex gap-1 bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl p-1 overflow-x-auto shrink-0">
        {([
          { id: "all",       label: "All Documents",   icon: "📁" },
          { id: "estimates", label: "Estimates",        icon: "📝" },
          { id: "invoices",  label: "Invoices",         icon: "💳" },
          { id: "templates", label: "Templates",        icon: "🗂️" },
          { id: "taxes",     label: "Taxes",            icon: "🏛️" },
          { id: "signed",    label: "Signed Contracts", icon: "✍️" },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveDocTab(tab.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
              activeDocTab === tab.id
                ? "bg-[#315C9F] text-white shadow-sm"
                : "text-[#5E7393] hover:text-[#1F3557] hover:bg-[#C7E3FA]"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* DOCUMENTS CONTENT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* DOCUMENTS TABLE (7 COLS) */}
        {/* DOCUMENTS TABLE (7 COLS) */}
        <div className="lg:col-span-7 bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex flex-col justify-between overflow-hidden">
          {activeDocTab === "templates" ? (
            <div className="flex flex-col gap-4 pb-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#5E7393]">
                Stock templates — click to open in the eSign editor, or download the official form
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(STOCK_TEMPLATES as readonly any[]).map((tpl: any) => (
                  <button
                    key={tpl.id}
                    onClick={() => {
                      if (tpl.action === "esign") {
                        setPdfEditorDocId(null);
                        setPdfEditorDocName(tpl.name + ".pdf");
                        setPdfEditorAutoOpenPicker(false);
                        setIsPDFEditorOpen(true);
                      } else {
                        window.open(tpl.url, "_blank", "noopener,noreferrer");
                      }
                    }}
                    className={`flex items-start gap-3 p-4 rounded-2xl bg-gradient-to-br ${tpl.color} text-white text-left hover:scale-[1.02] active:scale-[0.99] transition-transform cursor-pointer shadow-md`}
                  >
                    <span className="text-2xl shrink-0 mt-0.5">{tpl.icon}</span>
                    <div>
                      <p className="text-sm font-black leading-tight">{tpl.name}</p>
                      <p className="text-[10px] font-medium opacity-80 mt-0.5 leading-snug">{tpl.desc}</p>
                      <p className="text-[9px] font-black uppercase tracking-wider mt-2 opacity-70">
                        {tpl.action === "esign" ? "Open in eSign Editor →" : "Download Official PDF →"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="border-b border-[#9EC8EF] text-[10px] font-extrabold uppercase text-[#1F3557] tracking-wider bg-[#EAF5FF]/30">
                  <th className="py-2.5 px-3">Doc Name</th>
                  <th className="py-2.5 px-3">Connection</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Uploaded</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#9EC8EF]/40">
                {activeDocTab === "templates" ? null : tabFilteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#5E7393] text-xs font-semibold">
                      No matching files or documents located.
                    </td>
                  </tr>
                ) : (
                  tabFilteredDocs.map((doc) => {
                    const isSelected = doc.id === selectedDocId;
                    return (
                      <tr
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className={`hover:bg-[#BDDDF8]/50 transition-colors cursor-pointer text-xs ${
                          isSelected ? "bg-[#EAF5FF] border-l-4 border-l-[#315C9F]" : ""
                        }`}
                      >
                        <td className="py-2.5 px-3 font-bold text-[#1F3557]">
                          <div className="flex items-center gap-1.5 max-w-[140px] truncate">
                            <span className="shrink-0">{doc.name.endsWith(".png") || doc.name.endsWith(".jpg") ? "📸" : "📄"}</span>
                            <span className="truncate" title={doc.name}>{doc.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[#5E7393] font-medium max-w-[100px] truncate">
                          {doc.customer !== "None" ? doc.customer : doc.vendor !== "None" ? doc.vendor : doc.job !== "None" ? doc.job : "General"}
                        </td>
                        <td className="py-2.5 px-3 text-[#5E7393] font-mono text-[10px] font-bold">
                          {doc.type}
                        </td>
                        <td className="py-2.5 px-3 text-[#5E7393] font-mono text-[10px]">
                          {doc.date}
                        </td>
                        <td className="py-2.5 px-3 text-[#5E7393] font-mono text-[10px]">
                          {doc.size}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                              doc.status === "Signed"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : doc.status === "Awaiting Signature"
                                ? "bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"
                                : doc.status === "Sent"
                                ? "bg-blue-100 text-blue-800 border border-blue-300"
                                : doc.status === "Viewed"
                                ? "bg-indigo-100 text-indigo-800 border border-indigo-300"
                                : doc.status === "Declined"
                                ? "bg-rose-100 text-rose-800 border border-rose-300"
                                : doc.status === "Expired"
                                ? "bg-slate-100 text-slate-500 border border-slate-300"
                                : doc.status === "Draft"
                                ? "bg-sky-100 text-sky-800 border border-sky-300"
                                : "bg-slate-100 text-slate-800 border border-slate-300"
                            }`}
                          >
                            {doc.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            {hasManagePermission && (
                            <button
                              onClick={() => handleOpenPDFEditor(doc)}
                              className="p-1 hover:bg-[#BDDDF8]/50 text-[#315C9F] rounded transition-colors"
                              title="Open in eSign Editor"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            )}
                            <button
                              onClick={() => {
                                setShareDocItem(doc);
                                setIsMainShareModalOpen(true);
                              }}
                              className="p-1 hover:bg-[#BDDDF8]/50 text-sky-600 rounded transition-colors"
                              title="Share Document"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                            {hasManagePermission && (
                            <button
                              onClick={() => {
                                setSelectedDocId(doc.id);
                                setIsDeleteModalOpen(true);
                              }}
                              className="p-1 hover:bg-rose-100 text-rose-600 rounded transition-colors"
                              title="Delete Document"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          )}
          <div className="mt-4 pt-3 border-t border-[#9EC8EF]/40 flex justify-between items-center text-[10px] font-sans font-bold text-[#5E7393]">
            <span>
              Showing {tabFilteredDocs.length} of {documents.length} files
            </span>
            <span className="px-2 py-0.5 bg-[#EAF5FF] border border-[#9EC8EF]/60 rounded-lg text-[#1F3557]">
              Synced Storage Active
            </span>
          </div>
        </div>

        {/* DOCUMENT DETAILS PANEL (5 COLS) */}
        <div className="lg:col-span-5 bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#9EC8EF]/40 pb-2">
            <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Document Inspector
            </h3>
            {activeDoc && (
              <button
                onClick={() => handleToggleFavorite(activeDoc)}
                className="p-1 hover:bg-[#BDDDF8] rounded-lg"
                title="Favorite"
              >
                <Star className={`w-4 h-4 ${activeDoc.isFavorite ? "text-amber-500 fill-amber-500" : "text-[#1F3557]"}`} />
              </button>
            )}
          </div>

          {activeDoc ? (
            <div className="space-y-4">
              {/* Document Mockup Preview Container */}
              <div className="bg-[#EAF5FF] rounded-xl border border-[#9EC8EF] p-4 flex flex-col items-center justify-center text-center min-h-[140px] relative overflow-hidden group shadow-inner">
                {getFileIcon(activeDoc.type)}
                <p className="text-xs font-extrabold text-[#1F3557] mt-2 max-w-[200px] truncate uppercase">{activeDoc.name}</p>
                <p className="text-[9px] font-mono text-slate-400 mt-1 uppercase tracking-widest">{activeDoc.size} • {activeDoc.type}</p>
                <div className="absolute inset-0 bg-[#315C9F]/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="bg-[#315C9F] text-white px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider">Simulated Preview</span>
                </div>
              </div>

              {/* ESIGN EDITOR LAUNCH — managers/owners only */}
              {hasManagePermission ? (
                <button
                  onClick={() => handleOpenPDFEditor(activeDoc)}
                  className="w-full py-3 bg-gradient-to-r from-[#1F3557] to-[#315C9F] hover:from-[#315C9F] hover:to-[#1F3557] text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  <FileSignature className="w-4 h-4 text-amber-400 animate-pulse" />
                  Open eSign Editor
                </button>
              ) : (
                <div className="w-full py-3 bg-slate-100 text-slate-400 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-not-allowed select-none">
                  <FileSignature className="w-4 h-4" />
                  eSign — Manager Access Only
                </div>
              )}

              {/* Information Ledger */}
              <div className="space-y-2 text-xs font-bold text-[#1F3557]">
                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Customer</span>
                  <span className="text-right">{activeDoc.customer !== "None" ? activeDoc.customer : <span className="text-slate-400 font-normal">—</span>}</span>
                </div>

                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Employee</span>
                  <span className="text-right">{activeDoc.employee !== "None" ? activeDoc.employee : <span className="text-slate-400 font-normal">—</span>}</span>
                </div>

                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Vendor</span>
                  <span className="text-right">{activeDoc.vendor !== "None" ? activeDoc.vendor : <span className="text-slate-400 font-normal">—</span>}</span>
                </div>

                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Job</span>
                  <span className="text-right">{activeDoc.job !== "None" ? activeDoc.job : <span className="text-slate-400 font-normal">—</span>}</span>
                </div>

                {activeDoc.estimateId !== "None" && (
                  <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                    <span className="text-[#5E7393] uppercase text-[9px]">Estimate ID</span>
                    <span className="font-mono text-right">{activeDoc.estimateId}</span>
                  </div>
                )}

                {activeDoc.invoiceId !== "None" && (
                  <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                    <span className="text-[#5E7393] uppercase text-[9px]">Invoice ID</span>
                    <span className="font-mono text-right">{activeDoc.invoiceId}</span>
                  </div>
                )}

                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Uploaded</span>
                  <span className="font-mono text-[#5E7393]">{activeDoc.date} · {activeDoc.uploadedBy}</span>
                </div>

                <div className="space-y-1 pt-1">
                  <span className="text-[#5E7393] uppercase text-[9px] block">Notes & Overview</span>
                  <p className="text-[11px] font-sans font-medium text-slate-600 bg-[#EAF5FF] p-2.5 rounded-xl border border-[#9EC8EF]/60 leading-relaxed">
                    {activeDoc.notes}
                  </p>
                </div>

                {/* Tags chips */}
                <div className="space-y-1.5 pt-1.5">
                  <span className="text-[#5E7393] uppercase text-[9px] block">Document Tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeDoc.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-[#EAF5FF] border border-[#9EC8EF] text-[10px] text-[#315C9F] rounded-lg">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS (NO DEAD BUTTONS) */}
              <div className="grid grid-cols-2 gap-1.5 pt-2">
                <button
                  onClick={() => {
                    if (activeDoc.url) {
                      const link = document.createElement('a');
                      link.href = activeDoc.url;
                      link.target = "_blank";
                      link.rel = "noopener noreferrer";
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }
                    triggerNotification(`📂 Opened document file: ${activeDoc.name}`);
                  }}
                  className="px-2.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-xs font-bold text-[#1F3557] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Open File
                </button>
                <button
                  onClick={() => {
                    if (activeDoc.url) {
                      const link = document.createElement('a');
                      link.href = activeDoc.url;
                      link.download = activeDoc.name;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      triggerNotification(`📥 Downloading document: ${activeDoc.name}`);
                    } else {
                      // Create simulated plain text file download for seed data
                      const textContent = `OwnersLOCAL Document Meta: ${JSON.stringify(activeDoc, null, 2)}`;
                      const blob = new Blob([textContent], { type: 'text/plain' });
                      const blobUrl = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = blobUrl;
                      link.download = activeDoc.name.endsWith(".pdf") ? activeDoc.name.replace(".pdf", ".txt") : activeDoc.name + ".txt";
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(blobUrl);
                      triggerNotification(`📥 Downloading document: ${activeDoc.name}`);
                    }
                  }}
                  className="px-2.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-xs font-bold text-[#1F3557] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  onClick={() => {
                    setRenameName(activeDoc.name);
                    setIsRenameModalOpen(true);
                  }}
                  className="px-2.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-xs font-bold text-[#1F3557] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Rename
                </button>
                <button
                  onClick={() => {
                    setUploadName(activeDoc.name);
                    setUploadFolder(activeDoc.folder || inferFolderForDoc(activeDoc));
                    setUploadType(activeDoc.type);
                    setUploadCustomer(activeDoc.customer);
                    setUploadEmployee(activeDoc.employee);
                    setUploadVendor(activeDoc.vendor);
                    setUploadJob(activeDoc.job);
                    setUploadNotes(activeDoc.notes);
                    setUploadTags(activeDoc.tags.join(", "));
                    setIsUploadModalOpen(true);
                  }}
                  className="px-2.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-xs font-bold text-[#1F3557] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Replace
                </button>
                <button
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="px-2.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-bold text-rose-600 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
                <button
                  onClick={() => handleToggleArchive(activeDoc)}
                  className="px-2.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-xs font-bold text-[#1F3557] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" />
                  {activeDoc.isArchived ? "Restore" : "Archive"}
                </button>
              </div>

              <div className="border-t border-[#9EC8EF]/40 my-2 pt-2" />

              {/* QUICK CONNECTIONS CARD */}
              <div className="space-y-1.5 text-left">
                <span className="text-[#5E7393] uppercase text-[9.5px] font-extrabold block">Attach To</span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => {
                      setAttachTargetType("Customer");
                      setAttachValue(activeDoc.customer !== "None" ? activeDoc.customer : "");
                      setIsAttachModalOpen(true);
                    }}
                    className="px-2 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[10px] font-bold text-[#1F3557] text-center transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <User className="w-3 h-3" />
                    Customer
                  </button>
                  <button
                    onClick={() => {
                      setAttachTargetType("Job");
                      setAttachValue(activeDoc.job !== "None" ? activeDoc.job : "");
                      setIsAttachModalOpen(true);
                    }}
                    className="px-2 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[10px] font-bold text-[#1F3557] text-center transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Briefcase className="w-3 h-3" />
                    Job
                  </button>
                  <button
                    onClick={() => {
                      setAttachTargetType("Employee");
                      setAttachValue(activeDoc.employee !== "None" ? activeDoc.employee : "");
                      setIsAttachModalOpen(true);
                    }}
                    className="px-2 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[10px] font-bold text-[#1F3557] text-center transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Users className="w-3 h-3" />
                    Employee
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-[#5E7393] text-xs font-semibold">
              Select a file on the table to inspect details and triggers.
            </div>
          )}
        </div>
      </div>

      {/* SELFIESAVE ESIGN — the real editor, native in this app. No iframe,
          no external site, no popup window: SelfieSaveEditor is a genuine
          React component living in src/components/SelfieSaveEditor.tsx. */}
      {isPDFEditorOpen && (
        <SelfieSaveEditor
          accountEmail={loggedInUser?.email || "owner@ownerslocal.app"}
          accountName={loggedInUser?.name}
          documentId={pdfEditorDocId}
          initialFilename={pdfEditorDocName ? pdfEditorDocName.replace(/\.pdf$/i, "") : undefined}
          initialPdfBase64={pdfEditorBase64 || generatedPdfDraft?.pdfBase64 || undefined}
          autoOpenPdfPicker={pdfEditorAutoOpenPicker}
          initialDraft={generatedPdfDraft?.pdfBase64 ? null : generatedPdfDraft}
          signerHint={generatedPdfDraft ? { customerName: generatedPdfDraft.customerName, representativeName: generatedPdfDraft.representativeName } : signatureCaptureHint}
          autoCaptureSignatures={generatedPdfDraft?.autoCaptureSignatures}
          businessProfile={businessProfile}
          onClose={closePDFEditor}
          onSave={handleSavePDFEditor}
        />
      )}

      {/* GOOGLE DRIVE SYNC IMPORT MODAL */}
      {isGoogleDriveModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[500px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#9EC8EF]/45 pb-3 mb-4">
              <div className="flex items-center gap-1.5">
                <Cloud className="w-5 h-5 text-cyan-600 animate-pulse" />
                <h3 className="text-sm font-black uppercase tracking-wider text-[#1F3557]">Google Drive Cloud Picker</h3>
              </div>
              <button onClick={() => setIsGoogleDriveModalOpen(false)} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
            </div>
            <div className="space-y-3.5 text-xs">
              <div className="py-8 text-center space-y-2">
                <Cloud className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-500">Google Drive isn't connected yet</p>
                <p className="text-[10.5px] text-slate-400 max-w-sm mx-auto">Connect your Google account in Settings → Integrations to import files directly from Drive. Nothing here is imported until that's set up.</p>
              </div>
            </div>
            <button
              onClick={() => setIsGoogleDriveModalOpen(false)}
              className="w-full py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] text-[#1F3557] font-bold rounded-xl text-xs uppercase cursor-pointer mt-4 text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* SMARTPHONE REMOTE CAMERA CAPTURE CONNECT MODAL */}
      {isPhoneUploadModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[420px] shadow-2xl border border-[#9EC8EF] text-center animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-[#9EC8EF]/45 pb-3 text-left">
              <div className="flex items-center gap-1.5">
                <Smartphone className="w-5 h-5 text-indigo-600 animate-bounce" />
                <h3 className="text-sm font-black uppercase tracking-wider text-[#1F3557]">Upload from Phone</h3>
              </div>
              <button onClick={() => setIsPhoneUploadModalOpen(false)} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-[#9EC8EF]/50 flex flex-col items-center gap-3">
              {/* QR code simulation */}
              <div className="bg-slate-100 p-3 rounded-xl border border-slate-300 shadow-inner flex items-center justify-center">
                <QrCode className="w-32 h-32 text-slate-800" />
              </div>
              <p className="text-[10px] text-[#5E7393] leading-relaxed font-sans font-semibold">
                Remote phone pairing isn't built yet. For now, upload photos from your phone the normal way: open this app in your phone's browser and use the regular Upload button.
              </p>
            </div>
            <button
              onClick={() => setIsPhoneUploadModalOpen(false)}
              className="w-full py-2 bg-white border border-[#9EC8EF] text-[#1F3557] hover:bg-slate-50 font-bold rounded-xl text-xs uppercase cursor-pointer text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* PHOTO-TO-PDF MULTI-IMAGE COMPILER */}
      {isPhotoToPDFModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[500px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-[#9EC8EF]/45 pb-3">
              <div className="flex items-center gap-1.5">
                <Images className="w-5 h-5 text-amber-500 animate-pulse" />
                <h3 className="text-sm font-black uppercase tracking-wider text-[#1F3557]">Compile PDF from Photos</h3>
              </div>
              <button onClick={() => setIsPhotoToPDFModalOpen(false)} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
            </div>
            <div className="space-y-3.5 text-xs font-bold text-[#1F3557]">
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-[#5E7393]">Output Document Name</label>
                <input
                  type="text"
                  className="w-full bg-white border border-[#9EC8EF] rounded-xl px-3.5 py-2.5 focus:outline-none"
                  value={photoToPdfName}
                  onChange={(e) => setPhotoToPdfName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase text-[#5E7393]">Selected Photos to Compile (Click to Select)</label>
                {documents.filter(d => d.type === "Photos" && d.url).length === 0 ? (
                  <p className="text-[10px] text-[#5E7393]/70 italic py-2">
                    No real photos uploaded yet — upload a photo document first to compile it into a PDF.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {documents.filter(d => d.type === "Photos" && d.url).map((photo) => {
                      const isSel = selectedPhotos.includes(photo.url!);
                      return (
                        <button
                          key={photo.id}
                          onClick={() => {
                            if (isSel) {
                              setSelectedPhotos(prev => prev.filter(u => u !== photo.url));
                            } else {
                              setSelectedPhotos(prev => [...prev, photo.url!]);
                            }
                          }}
                          className={`relative rounded-xl border p-1 transition-all text-left ${
                            isSel ? "border-[#315C9F] bg-white ring-2 ring-[#315C9F]" : "border-slate-300 bg-slate-100"
                          }`}
                        >
                          <img src={photo.url} alt={photo.name} className="w-full h-24 object-cover rounded-lg" referrerPolicy="no-referrer" />
                          <div className="p-1 text-[9px] truncate">{photo.name}</div>
                          {isSel && (
                            <div className="absolute top-2 right-2 bg-[#315C9F] text-white rounded-full w-4.5 h-4.5 flex items-center justify-center text-[9px] font-black">
                              {selectedPhotos.indexOf(photo.url!) + 1}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                if (selectedPhotos.length === 0) {
                  triggerNotification("⚠️ Please select at least one photo to compile");
                  return;
                }
                // SelfieSave manages its own canvas — just open it with the doc name
                setPdfEditorDocId(null);
                setPdfEditorDocName(photoToPdfName);
                setPdfEditorAutoOpenPicker(false);
                setIsPhotoToPDFModalOpen(false);
                setIsPDFEditorOpen(true);
                triggerNotification("📸 Photo compiling session complete! Opening compiled documents inside Editor.");
              }}
              className="w-full py-2.5 bg-[#315C9F] hover:bg-[#1F3557] text-white font-black rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              Compile into PDF & Edit
            </button>
          </div>
        </div>
      )}

      {/* UNIVERSAL DOCUMENT SHARE FLOW MODAL */}
      {isMainShareModalOpen && shareDocItem && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] border border-[#9EC8EF] rounded-[28px] p-6 w-[95%] max-w-[450px] shadow-2xl animate-scale-up text-left">
            <div className="flex items-center justify-between border-b border-[#9EC8EF]/45 pb-3 mb-4">
              <div className="flex items-center gap-1.5">
                <Share2 className="w-4.5 h-4.5 text-[#315C9F]" />
                <h3 className="text-xs font-black uppercase tracking-wider">Share: {shareDocItem.name}</h3>
              </div>
              <button onClick={() => { setIsMainShareModalOpen(false); setShareDocItem(null); }} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] text-[#5E7393] uppercase tracking-wider">Choose Delivery / Export Channels:</p>

              <div className="bg-white/70 border border-[#9EC8EF] rounded-2xl p-3 space-y-1.5">
                <label className="text-[9px] uppercase tracking-wider font-black text-[#5E7393]">Customer or employee recipient</label>
                <select
                  value={shareRecipient}
                  onChange={(e) => setShareRecipient(e.target.value)}
                  className="w-full bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 text-xs font-bold"
                >
                  <option value="">Choose a contact…</option>
                  {customersList.map((customer) => (
                    <option key={`customer-${customer.id}`} value={`customer|${customer.contact}|${customer.email || ""}|${customer.phone || ""}`}>
                      Customer — {customer.contact || customer.company}
                    </option>
                  ))}
                  {recentRoster.map((employee: any) => (
                    <option key={`employee-${employee.id || employee.email}`} value={`employee|${employee.name || `${employee.firstName || ""} ${employee.lastName || ""}`.trim()}|${employee.email || employee.businessEmail || ""}|${employee.phone || ""}`}>
                      Employee — {employee.name || `${employee.firstName || ""} ${employee.lastName || ""}`.trim()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Share Channels */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    const [, name = "", email = ""] = shareRecipient.split("|");
                    if (!email) return triggerNotification("Choose a contact with an email address first.");
                    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(shareDocItem.name)}&body=${encodeURIComponent(`Hi ${name},\n\nPlease review the attached OwnersLOCAL document: ${shareDocItem.name}`)}`;
                    setDocuments(prev => prev.map(d => d.id === shareDocItem.id ? { ...d, folder: "eSign", status: "Sent" } : d));
                    setIsMainShareModalOpen(false);
                    setShareDocItem(null);
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <Mail className="w-5 h-5 text-sky-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Send Email</span>
                </button>

                <button
                  onClick={() => {
                    const [, name = "", , phone = ""] = shareRecipient.split("|");
                    if (!phone) return triggerNotification("Choose a contact with a mobile number first.");
                    window.location.href = `sms:${phone}?body=${encodeURIComponent(`Hi ${name}, please review ${shareDocItem.name} from OwnersLOCAL.`)}`;
                    setDocuments(prev => prev.map(d => d.id === shareDocItem.id ? { ...d, folder: "eSign", status: "Sent" } : d));
                    setIsMainShareModalOpen(false);
                    setShareDocItem(null);
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <MessageCircle className="w-5 h-5 text-emerald-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Send Text SMS</span>
                </button>

                <button
                  onClick={() => {
                    // No real public document-hosting/share-link backend
                    // exists yet, so there is nothing real to link to —
                    // copying a URL that resolves nowhere would be worse
                    // than saying so plainly.
                    triggerNotification("🔗 Public share links aren't available yet — this needs real file hosting to be wired up.");
                    setIsMainShareModalOpen(false);
                    setShareDocItem(null);
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <Link className="w-5 h-5 text-indigo-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Copy Link</span>
                </button>

                <button
                  onClick={() => {
                    if (shareDocItem.url) {
                      const link = document.createElement("a");
                      link.href = shareDocItem.url;
                      link.download = shareDocItem.name;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      triggerNotification(`📥 Downloading: ${shareDocItem.name}`);
                      if (logOperationalEvent) {
                        logOperationalEvent("Document Downloaded", shareDocItem.name, "📥");
                      }
                    } else {
                      triggerNotification("No file is attached to this document record yet.");
                    }
                    setIsMainShareModalOpen(false);
                    setShareDocItem(null);
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <Download className="w-5 h-5 text-blue-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Download PDF</span>
                </button>

                <button
                  onClick={() => {
                    setIsMainShareModalOpen(false);
                    setShareDocItem(null);
                    window.print();
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <Printer className="w-5 h-5 text-slate-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Print Document</span>
                </button>

                <button
                  onClick={async () => {
                    const docName = shareDocItem.name;
                    setIsMainShareModalOpen(false);
                    setShareDocItem(null);
                    if (navigator.share) {
                      try {
                        await navigator.share({
                          title: docName,
                          text: `Document: ${docName}`,
                          url: window.location.href
                        });
                      } catch {
                        // User cancelled the native share sheet — no error to surface.
                      }
                    } else {
                      triggerNotification("Native sharing isn't supported by this browser.");
                    }
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <ExternalLink className="w-5 h-5 text-pink-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Other Apps</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => { setIsMainShareModalOpen(false); setShareDocItem(null); }}
              className="w-full py-2 bg-blue-100 hover:bg-blue-200 text-[#1F3557] font-bold rounded-xl text-xs uppercase cursor-pointer mt-5 text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* MODAL 1: UPLOAD / REPLACE DOCUMENT */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[480px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3.5 mb-4">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-[#315C9F]" />
                <h3 className="text-sm font-black text-[#1F3557] uppercase tracking-wider">Upload New Document</h3>
              </div>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs font-bold text-[#1F3557]">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Select File (Required)</label>
                <div 
                  className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all duration-200 cursor-pointer ${
                    dragActive 
                      ? "border-[#4A86F7] bg-[#EAF5FF]" 
                      : uploadFile 
                        ? "border-emerald-500 bg-[#EAF5FF]/30" 
                        : "border-[#9EC8EF] hover:border-[#4A86F7] bg-[#EAF5FF]/15"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const file = e.dataTransfer.files?.[0] || null;
                    if (file) {
                      setUploadFile(file);
                      setUploadName(file.name.substring(0, file.name.lastIndexOf('.')) || file.name);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setUploadFile(file);
                      if (file) {
                        setUploadName(file.name.substring(0, file.name.lastIndexOf('.')) || file.name);
                      }
                    }}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center justify-center gap-1">
                    <Upload className="w-6 h-6 text-[#315C9F] animate-pulse" />
                    <p className="text-xs font-bold text-[#1F3557] max-w-full truncate">
                      {uploadFile ? `Selected: ${uploadFile.name}` : "Drag & drop file here, or click to browse"}
                    </p>
                    <p className="text-[9px] text-[#5E7393]">PDF, PNG, JPG, DOCX (Max 50MB)</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Document Title</label>
                <input
                  type="text"
                  placeholder="e.g. Master Lease Suite B"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 flex flex-col">
                  <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Folder</label>
                  <select
                    value={uploadFolder}
                    onChange={(e) => {
                      const newFolder = e.target.value;
                      setUploadFolder(newFolder);
                      const match = FOLDER_TAXONOMY.find(f => f.id === newFolder);
                      setUploadType(match?.subfolders[0] || "Custom");
                    }}
                    className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  >
                    {FOLDER_TAXONOMY.map((f) => (
                      <option key={f.id} value={f.id}>{f.icon} {f.id}</option>
                    ))}
                    {foldersList.map(folder => (
                      <option key={folder} value={folder}>📁 {folder}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 flex flex-col">
                  <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Document Type</label>
                  <select
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                    className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  >
                    {(FOLDER_TAXONOMY.find(f => f.id === uploadFolder)?.subfolders || docTypes).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1 flex flex-col">
                <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Signed Status</label>
                <select
                  value={uploadStatus}
                  onChange={(e) => setUploadStatus(e.target.value as any)}
                  className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                >
                  <option value="Signed">Signed</option>
                  <option value="Unsigned">Unsigned</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 flex flex-col">
                  <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Customer Link</label>
                  <select
                    value={uploadCustomer}
                    onChange={(e) => setUploadCustomer(e.target.value)}
                    className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  >
                    <option value="None">None</option>
                    {customersList.map(c => (
                      <option key={c.id} value={c.company}>{c.company}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 flex flex-col">
                  <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Job Link</label>
                  <select
                    value={uploadJob}
                    onChange={(e) => setUploadJob(e.target.value)}
                    className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  >
                    <option value="None">None</option>
                    {schedulingEvents.filter(e => e.eventType === "Job").map(e => (
                      <option key={e.id} value={`${e.customer} - ${e.date}`}>{e.customer} - {e.date}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 flex flex-col">
                  <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Employee Link</label>
                  <select
                    value={uploadEmployee}
                    onChange={(e) => setUploadEmployee(e.target.value)}
                    className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  >
                    <option value="None">None</option>
                    {recentRoster.map(r => (
                      <option key={r.id || r.name} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 flex flex-col">
                  <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Vendor Link</label>
                  {/* No dedicated Vendor CRM exists yet -- free text instead of a
                      hardcoded closed list, so a real vendor name always works. */}
                  <input
                    type="text"
                    list="vendor-link-options"
                    value={uploadVendor === "None" ? "" : uploadVendor}
                    onChange={(e) => setUploadVendor(e.target.value.trim() === "" ? "None" : e.target.value)}
                    placeholder="None"
                    className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  />
                  <datalist id="vendor-link-options">
                    {vendors.filter(v => v !== "All" && v !== "None").map(v => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="space-y-1 flex flex-col">
                <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Description & Notes</label>
                <textarea
                  placeholder="Specify descriptive file notes..."
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2 focus:outline-none font-medium font-sans"
                  rows={2}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Metadata Tags (Comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. Legal, Contract, Lease"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                />
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="flex-1 py-2.5 bg-blue-100 hover:bg-blue-200 rounded-xl transition-colors cursor-pointer text-center font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#315C9F] hover:bg-[#1F3557] text-white rounded-xl transition-colors cursor-pointer text-center font-bold shadow-md"
                >
                  Confirm Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SNAPSHOT AI OCR CAMERA */}
      {isSnapshotModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-[#315C9F]/40 rounded-[28px] p-6 w-[95%] max-w-[500px] shadow-2xl text-left text-slate-100 animate-scale-up">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Snapshot AI Scanner</h3>
              </div>
              <button onClick={() => { setIsSnapshotModalOpen(false); triggerNotification("Document processing canceled."); }} className="text-slate-400 hover:text-white font-bold text-sm">✕</button>
            </div>

            {snapshotStep === "camera" && (
              <div className="space-y-4">
                <p className="text-[11px] text-slate-300">
                  Select a document format and trigger the camera simulation to parse content using Google LLM OCR models.
                </p>

                <div className="space-y-1.5 text-xs font-bold text-slate-200">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400">Document Type to Scan</label>
                  <select
                    value={scannedDocType}
                    onChange={(e) => setScannedDocType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 focus:outline-none"
                  >
                    <option value="Receipts">Receipts (Auto detects Vendor / Total)</option>
                    <option value="Contracts">Contracts (Auto detects Customer / MSA terms)</option>
                    <option value="Estimates">Estimates (Auto detects Client / Approved items)</option>
                    <option value="Invoices">Invoices (Auto detects Invoice # / Balances)</option>
                    <option value="Blueprints">Blueprints (Auto parses subterranean plans)</option>
                    <option value="Employee Files">Employee IDs / Permits</option>
                  </select>
                </div>

                {/* Camera Viewfinder Simulation */}
                <div className="relative aspect-video bg-slate-950 rounded-2xl border border-slate-800 flex flex-col items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.15)_0%,transparent_70%)]" />
                  {/* Focus Overlays */}
                  <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-blue-500 rounded-tl" />
                  <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-blue-500 rounded-tr" />
                  <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-blue-500 rounded-bl" />
                  <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-blue-500 rounded-br" />

                  {/* Simulated Document Sheet */}
                  <div className="w-28 h-36 bg-slate-800 rounded border border-slate-700 p-2 shadow-lg flex flex-col gap-1 text-[4px] text-slate-500 select-none animate-pulse">
                    <div className="w-12 h-2 bg-slate-600 rounded mb-2" />
                    <div className="w-20 h-1 bg-slate-700 rounded" />
                    <div className="w-16 h-1 bg-slate-700 rounded" />
                    <div className="w-18 h-1 bg-slate-700 rounded" />
                    <div className="flex justify-between mt-auto">
                      <div className="w-6 h-1.5 bg-slate-600 rounded" />
                      <div className="w-8 h-1.5 bg-blue-500 rounded" />
                    </div>
                  </div>

                  <span className="text-[9px] uppercase tracking-widest text-slate-500 font-mono mt-3">Viewfinder active • 1080p 60fps</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsSnapshotModalOpen(false); triggerNotification("Document processing canceled."); }}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-bold rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={runCameraSnapshotAI}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-lg flex items-center justify-center gap-1.5 uppercase tracking-wider"
                  >
                    <Camera className="w-4 h-4" />
                    Capture Photo
                  </button>
                </div>
              </div>
            )}

            {snapshotStep === "scanning" && (
              <div className="space-y-6 text-center py-6">
                <div className="relative w-16 h-16 mx-auto bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/30">
                  <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">AI Reading Optical Vectors</h4>
                  <p className="text-[10px] text-slate-400 font-mono">Confidence rating: {(70 + cameraProgress * 0.25).toFixed(1)}%</p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full transition-all" style={{ width: `${cameraProgress}%` }} />
                </div>
                <p className="text-[10.5px] text-slate-300">Parsing itemized figures, vendor billing logs, and signature validation fields...</p>
              </div>
            )}

            {snapshotStep === "ai_review" && (
              <div className="space-y-4">
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-400 shrink-0" />
                  <p className="text-[10.5px] text-blue-200">
                    <strong>No customer detected automatically.</strong> Pick one from your real customer list below, or leave it unlinked.
                  </p>
                </div>

                {/* Confidence issue mock simulation */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-3.5 space-y-2.5">
                  <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Verify and Edit Parsed Fields
                  </h4>

                  {customersList.length > 0 && (
                    <div className="grid grid-cols-1 gap-1.5">
                      {customersList.slice(0, 5).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setResolvedCustomer(c.company);
                            triggerNotification(`Linked to customer: ${c.company}`);
                          }}
                          className={`w-full text-left text-[11px] p-2 rounded-lg font-bold border transition-colors ${
                            resolvedCustomer === c.company
                              ? "bg-blue-600 border-blue-500 text-white"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                          }`}
                        >
                          {resolvedCustomer === c.company ? "✓ " : ""}
                          {c.company}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-700 text-[10.5px] text-slate-300 space-y-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Document Name</label>
                      <input 
                        type="text" 
                        value={tempDocName} 
                        onChange={(e) => setTempDocName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors" 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Vendor Name</label>
                        <input 
                          type="text" 
                          value={resolvedVendor} 
                          onChange={(e) => setResolvedVendor(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors" 
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Customer Link</label>
                        <input 
                          type="text" 
                          value={resolvedCustomer} 
                          onChange={(e) => setResolvedCustomer(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors" 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsSnapshotModalOpen(false); triggerNotification("Document processing canceled."); }}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-bold rounded-xl cursor-pointer text-center"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApproveSnapshotAI}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-lg text-center uppercase tracking-wider"
                  >
                    Approve & Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: RENAME */}
      {isRenameModalOpen && activeDoc && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[380px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3 mb-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-[#1F3557]">Rename Document</h3>
              <button onClick={() => setIsRenameModalOpen(false)} className="text-xs font-bold text-[#5E7393]">✕</button>
            </div>

            <div className="space-y-4 text-xs font-bold">
              <div className="space-y-1">
                <label className="text-[#5E7393]">Specify New File Name</label>
                <input
                  type="text"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none text-[#1F3557]"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setIsRenameModalOpen(false)}
                  className="flex-1 py-2 bg-blue-100 hover:bg-blue-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRenameSubmit}
                  className="flex-1 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white rounded-xl cursor-pointer shadow-md"
                >
                  Rename File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE CONFIRMATION */}
      {isDeleteModalOpen && activeDoc && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[380px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3 mb-4">
              <h3 className="text-sm font-black uppercase text-rose-600 tracking-wider">Confirm permanent deletion</h3>
              <button onClick={() => setIsDeleteModalOpen(false)} className="text-xs font-bold text-[#5E7393]">✕</button>
            </div>

            <div className="space-y-4 text-xs font-bold">
              <p className="text-[#5E7393] font-sans font-medium leading-relaxed">
                Are you certain you wish to delete <strong>'{activeDoc.name}'</strong> from Cloud Storage? This action is permanent and cannot be undone.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 py-2 bg-blue-100 hover:bg-blue-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteSubmit}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl cursor-pointer shadow-md"
                >
                  Delete permanently
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: ATTACH TO RECORD */}
      {isAttachModalOpen && activeDoc && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[400px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3 mb-4">
              <h3 className="text-sm font-black uppercase text-[#1F3557] tracking-wider">Attach Document</h3>
              <button onClick={() => setIsAttachModalOpen(false)} className="text-xs font-bold text-[#5E7393]">✕</button>
            </div>

            <div className="space-y-4 text-xs font-bold text-[#1F3557]">
              <div className="space-y-1.5 flex flex-col">
                <label className="text-[#5E7393]">Select Connection Target</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["Customer", "Job", "Employee"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAttachTargetType(t)}
                      className={`py-2 rounded-xl border text-[11px] font-bold text-center transition-all ${
                        attachTargetType === t
                          ? "bg-[#315C9F] text-white border-[#315C9F]"
                          : "bg-white border-[#9EC8EF] text-[#5E7393] hover:bg-[#EAF5FF]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[#5E7393]">Link Record Name / ID</label>
                {attachTargetType === "Customer" ? (
                  <select
                    value={attachValue}
                    onChange={(e) => setAttachValue(e.target.value)}
                    className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none text-[#1F3557]"
                  >
                    <option value="">-- Choose Customer --</option>
                    {customersList.map(c => (
                      <option key={c.id} value={c.company}>{c.company}</option>
                    ))}
                  </select>
                ) : attachTargetType === "Job" ? (
                  <select
                    value={attachValue}
                    onChange={(e) => setAttachValue(e.target.value)}
                    className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none text-[#1F3557]"
                  >
                    <option value="">-- Choose Job --</option>
                    {schedulingEvents.filter(e => e.eventType === "Job").map(e => (
                      <option key={e.id} value={e.id}>{e.customer} - {e.date}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={attachValue}
                    onChange={(e) => setAttachValue(e.target.value)}
                    className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none text-[#1F3557]"
                  >
                    <option value="">-- Choose Employee --</option>
                    {recentRoster.map(r => (
                      <option key={r.id || r.name} value={r.name}>{r.name} ({r.role})</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setIsAttachModalOpen(false)}
                  className="flex-1 py-2 bg-blue-100 hover:bg-blue-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAttachSubmit}
                  className="flex-1 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white rounded-xl cursor-pointer shadow-md"
                >
                  Apply Connection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: EXPORT CONFIGURATION */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[480px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3.5 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-[#315C9F]" />
                <h3 className="text-sm font-black text-[#1F3557] uppercase tracking-wider">Export Documents</h3>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
            </div>

            <div className="space-y-4 text-xs font-bold text-[#1F3557] overflow-y-auto pr-1">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Choose Export Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["csv", "json", "tsv"] as const).map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => {
                        setExportFormat(format);
                        setExportSuccessMessage(null);
                        setExportContent("");
                      }}
                      className={`py-2.5 rounded-xl border text-[11px] font-bold text-center transition-all ${
                        exportFormat === format
                          ? "bg-[#315C9F] text-white border-[#315C9F]"
                          : "bg-white border-[#9EC8EF] text-[#5E7393] hover:bg-[#EAF5FF]"
                      }`}
                    >
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#5E7393] leading-relaxed font-sans font-medium">
                  {exportFormat === "csv" && "• CSV Format: Perfect for importing into Microsoft Excel, Google Sheets, or any other spreadsheet editor."}
                  {exportFormat === "json" && "• JSON Format: Full structured data backup of all document meta-properties, tags, links, and details."}
                  {exportFormat === "tsv" && "• TSV Format: Tab-Separated Values, ideal for copy-pasting directly into active spreadsheet cells."}
                </p>
              </div>

              <div className="bg-[#EAF5FF] rounded-2xl p-4 border border-[#9EC8EF]/40 space-y-2">
                <p className="text-[11px] text-[#1F3557] font-extrabold">Data Summary to Export:</p>
                <ul className="text-[10px] text-[#5E7393] space-y-1 font-medium font-sans">
                  <li>• Total Documents: <strong className="text-[#1F3557] font-bold">{documents.length}</strong></li>
                  <li>• Database Schema: ID, Name, Customer, Employee, Vendor, Job, Type, Date, Size, Status</li>
                </ul>
              </div>

              <button
                onClick={() => executeExport(exportFormat)}
                className="w-full py-3 bg-[#4A86F7] hover:bg-[#3977EE] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download {exportFormat.toUpperCase()} Export File
              </button>

              {exportSuccessMessage && (
                <div className="mt-3 bg-emerald-50 border border-emerald-300 text-emerald-800 p-3.5 rounded-2xl space-y-2 animate-fade-in">
                  <div className="flex items-start gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-extrabold text-emerald-900">{exportSuccessMessage}</p>
                      <p className="text-[10px] text-emerald-700/80 font-sans font-medium">If the automatic file download did not start, you can view or copy the exported data below.</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] uppercase tracking-wider text-emerald-700">Raw Data Content</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(exportContent);
                          triggerNotification("📋 Copied exported data to clipboard!");
                        }}
                        className="text-[10px] text-emerald-800 hover:underline font-bold animate-pulse"
                      >
                        Copy Data
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={exportContent}
                      className="w-full h-24 bg-white/70 border border-emerald-200 rounded-lg p-2 font-mono text-[9px] text-emerald-950 focus:outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[#9EC8EF] pt-3.5 mt-4 shrink-0">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="w-full py-2 bg-blue-100 hover:bg-blue-200 text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer text-center"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
