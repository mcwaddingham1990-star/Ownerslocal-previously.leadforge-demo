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
  ChevronDown,
  Edit3,
  Send,
  FileSignature,
  Link,
  AlertCircle,
  X,
  Users
} from "lucide-react";
import { CustomerPickerModal } from "./CustomerPickerModal";
import { buildEstimatePdf, bytesToBase64 } from "../lib/pdfExport";
import { MAX_INLINE_BASE64_LENGTH } from "../lib/firestoreDocumentLimits";
import ESignChoiceModal from "./ESignChoiceModal";
import SendChoiceModal from "./SendChoiceModal";
import { downloadCsv, parseCsv } from "../lib/csv";
import type { DocumentItem, WorkOrder } from "../types/domain";
import { WorkOrderBuilder } from "./WorkOrderBuilder";
import { CreateMembershipPicker } from "./CreateMembershipPicker";
import type { Membership } from "../types/membership";
import { CustomerPortalControls } from "./CustomerPortalControls";
import { resolveCustomerByIdOrName } from "../lib/resolveCustomer";
import { PriceBookModal } from "./PriceBookModal";
import { buildRemoteSigningLink, shareRemoteSigningPackage } from "../lib/remoteSigningClient";
import { normalizeContactPhone, normalizeEstimateCompany } from "../lib/contactNormalization";
import { calculateEstimatePricing, clampPercent } from "../lib/estimatePricing";

export type { Estimate } from "../types/domain";
import type { Estimate } from "../types/domain";

// 8 high-quality realistic Estimates
export const INITIAL_ESTIMATES: Estimate[] = [];

export const EstimatesPage: React.FC = () => {
  const { upsertPotentialCustomer } = useDomainActions();
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
  const { estimates: propsEstimates, setEstimates, schedulingEvents, customers, recentRoster, setGeneratedPdfDraft, documents, setDocuments, businessProfile, estimatePrefill, setEstimatePrefill, setBuildJobPrefill } = useDomainData();
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
  const [actionMenuEstimate, setActionMenuEstimate] = useState<Estimate | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [sendTargetEstimate, setSendTargetEstimate] = useState<Estimate | null>(null);
  const [sendMatch, setSendMatch] = useState<{ email?: string; phone?: string } | null>(null);
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [attachEstimate, setAttachEstimate] = useState<Estimate | null>(null);
  const [attachTargetType, setAttachTargetType] = useState<"Customer" | "Job" | "Employee">("Customer");
  const [attachValue, setAttachValue] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isConversionPickerOpen, setIsConversionPickerOpen] = useState(false);
  // Convert-to-job and draft-save still use the optional signing chooser.
  // The explicit "Send for Signing" action does NOT: it goes straight to
  // the device native share sheet with the PDF + live signing link.
  const [esignConvertTarget, setEsignConvertTarget] = useState<Estimate | null>(null);
  const [sendingForSigningId, setSendingForSigningId] = useState<string | null>(null);
  // The proactive, skippable "set up e-signing on this estimate" prompt --
  // fires on a plain Save (not on the PDF/Collect Signatures/Convert
  // actions, which already are the e-sign path themselves), so every
  // estimate gets offered the choice once, right after it's drafted.
  const [esignDraftTarget, setEsignDraftTarget] = useState<Estimate | null>(null);
  const [isWorkOrderBuilderOpen, setIsWorkOrderBuilderOpen] = useState(false);
  const [workOrderPrefill, setWorkOrderPrefill] = useState<Partial<WorkOrder> | undefined>(undefined);
  const [isMembershipPickerOpen, setIsMembershipPickerOpen] = useState(false);
  const [membershipPrefillBase, setMembershipPrefillBase] = useState<Partial<Membership> | undefined>(undefined);
  const [isPriceBookOpen, setIsPriceBookOpen] = useState(false);
  const [priceBookPickerMode, setPriceBookPickerMode] = useState(false);

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
  const [formLineItems, setFormLineItems] = useState<NonNullable<Estimate["lineItems"]>>([]);
  const [formDiscountPercent, setFormDiscountPercent] = useState(0);
  const [formTaxRate, setFormTaxRate] = useState(0);
  const formPricing = useMemo(
    () => calculateEstimatePricing(formLineItems, formDiscountPercent, formTaxRate),
    [formLineItems, formDiscountPercent, formTaxRate]
  );
  // One Create Estimate popup session must produce exactly one estimate.
  // Refs change synchronously, so a rapid double tap cannot race a second
  // record creation before React has time to re-render.
  const createEstimateLockedRef = useRef(false);
  const createEstimateSessionRef = useRef<{ id: string; number: string } | null>(null);

  // Set when the form was opened as a change order for an existing job
  // (Owner Protection's "Create Change Order"). Cleared for ordinary estimates.
  const [changeOrderTarget, setChangeOrderTarget] = useState<{ jobId: string; label: string } | null>(null);

  const beginCreateEstimateSession = () => {
    setChangeOrderTarget(null);
    createEstimateLockedRef.current = false;
    createEstimateSessionRef.current = {
      id: `est_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      number: generateEstimateNumber()
    };
  };

  // Opens the Add Estimate modal pre-filled when another page (e.g. a
  // Lead's "Build Estimate" button) queues a prefill via the shared
  // estimatePrefill handoff -- same "one page sets it, the destination
  // consumes and clears it" pattern generatedPdfDraft already uses.
  useEffect(() => {
    if (!estimatePrefill) return;
    setFormCustomerName(estimatePrefill.customerName);
    setFormCompany(estimatePrefill.company || "");
    setFormPhone(normalizeContactPhone(estimatePrefill.phone || ""));
    setFormAddress(estimatePrefill.address || "");
    setFormAmount(0);
    setFormStatus("Draft");
    setFormSalesRep("Self");
    setFormNotes(estimatePrefill.notes || "");
    setFormProjectSpecifics("");
    setFormLineItems([]);
    setFormDiscountPercent(0);
    setFormTaxRate(0);
    beginCreateEstimateSession();
    if (estimatePrefill.changeOrderForJobId) {
      setChangeOrderTarget({ jobId: estimatePrefill.changeOrderForJobId, label: estimatePrefill.changeOrderJobLabel || "this job" });
    }
    setIsAddModalOpen(true);
    setEstimatePrefill(null);
  }, [estimatePrefill, setEstimatePrefill]);

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
        company: (iCompany >= 0 ? r[iCompany]?.trim() : "") || "",
        status: (iStatus >= 0 && (["Draft","Pending","Sent","Viewed","Signed","Accepted","Declined","Expired","Completed"] as string[]).includes(r[iStatus]?.trim())) ? r[iStatus].trim() as Estimate["status"] : "Draft",
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
    setFormProjectSpecifics("");
    setFormLineItems([]);
    setFormDiscountPercent(0);
    setFormTaxRate(0);
    beginCreateEstimateSession();
    setIsAddModalOpen(true);
  };

  const addEstimateLine = (line?: Partial<NonNullable<Estimate["lineItems"]>[number]>) => {
    setFormLineItems(prev => [...prev, {
      id: line?.id || `eli_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      description: line?.description || "",
      quantity: Math.max(0, Number(line?.quantity ?? 1) || 0),
      unitPrice: Math.max(0, Number(line?.unitPrice ?? 0) || 0),
      ...(line?.priceBookModelId ? { priceBookModelId: line.priceBookModelId } : {})
    }]);
  };

  const updateEstimateLine = (
    id: string,
    patch: Partial<NonNullable<Estimate["lineItems"]>[number]>
  ) => {
    setFormLineItems(prev => prev.map(line => line.id === id ? { ...line, ...patch } : line));
  };

  const cleanEstimateLines = () => formLineItems
    .map(line => ({
      ...line,
      description: line.description.trim(),
      quantity: Math.max(0, Number(line.quantity) || 0),
      unitPrice: Math.max(0, Number(line.unitPrice) || 0)
    }))
    .filter(line => line.description || line.unitPrice > 0);

  const resolveEstimateCustomer = (est: Pick<Estimate, "customerId" | "customerName" | "company">) => {
    const byPrimaryName = resolveCustomerByIdOrName(customers, est.customerId, est.customerName);
    if (byPrimaryName) return byPrimaryName;
    const company = normalizeEstimateCompany(est.customerName, est.company);
    return company ? resolveCustomerByIdOrName(customers, undefined, company) || undefined : undefined;
  };

  // Builds a real PDF from the actual estimate data right now (no signing
  // required) and saves it to the Documents Hub immediately. Shared by
  // "Save (and Store as PDF)" (stops here) and "Save & Generate PDF" (goes
  // on to open the PDF Editor) -- see generateEstimatePdf below.
  const buildAndStoreEstimatePdf = async (est: Estimate) => {
    const matchedCustomer = resolveEstimateCustomer(est);
    const bytes = await buildEstimatePdf(est, matchedCustomer, businessProfile);
    const pdfBase64 = bytesToBase64(bytes);

    // Reuse an existing unsigned document for this estimate. Repeated
    // Generate/Send actions should update one working record, not create
    // another Draft every time.
    const existingDoc = documents.find(doc =>
      doc.estimateId === est.id &&
      !["Signed", "Completed"].includes(String(doc.status || ""))
    );
    const docId = existingDoc?.id || `doc_estimate_${est.id}_${Date.now()}`;
    const newDoc: DocumentItem = {
      ...(existingDoc || {}),
      id: docId,
      name: `${est.number}.pdf`,
      customer: est.customerName,
      employee: loggedInUser?.name || "Staff Administrator",
      vendor: "None",
      job: "None",
      type: "Estimates",
      folder: existingDoc?.folder || "Estimates",
      uploadedBy: loggedInUser?.name || "Staff Administrator",
      date: existingDoc?.date || new Date().toISOString().split("T")[0],
      size: `${Math.max(1, Math.ceil(bytes.length / 1024))} KB`,
      status: existingDoc?.status || "Draft",
      isFavorite: existingDoc?.isFavorite || false,
      isArchived: existingDoc?.isArchived || false,
      notes: existingDoc?.notes || "Generated from the Estimates PDF Editor.",
      tags: existingDoc?.tags || ["Estimate", "Generated"],
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
    setDocuments(prev => {
      const exists = prev.some(doc => doc.id === docId);
      return exists ? prev.map(doc => doc.id === docId ? newDoc : doc) : [...prev, newDoc];
    });
    return { pdfBase64, matchedCustomer, document: newDoc };
  };

  // Builds + stores the PDF, then opens the PDF Editor so the owner can
  // review it and optionally capture signatures. This is the estimate's
  // "Save & Generate PDF" action everywhere it appears (create form, review
  // screen).
  const generateEstimatePdf = async (est: Estimate, autoCaptureSignatures = false, autoOpenSignSetup = false, signatureOnlyMode = false) => {
    const { pdfBase64, matchedCustomer, document } = await buildAndStoreEstimatePdf(est);
    setGeneratedPdfDraft({
      filename: `${est.number}.pdf`,
      title: `Estimate ${est.number}`,
      sourceType: "Estimate",
      sourceId: est.id,
      documentId: document.id,
      customerName: est.customerName,
      customerPhone: normalizeContactPhone(est.phone || matchedCustomer?.phone),
      customerEmail: matchedCustomer?.email,
      representativeName: est.salesRep || loggedInUser?.name || "Company Representative",
      lines: [],
      pdfBase64,
      autoCaptureSignatures,
      autoOpenSignSetup,
      signatureOnlyMode
    });
    onNavigateToScreen("documents");
    if (logOperationalEvent) logOperationalEvent("Estimate PDF Generated", `${est.number} for ${est.customerName}`, "📄");
  };

  // "Save (and Store as PDF)" -- builds + stores the PDF into Documents same
  // as above, but stays on this page instead of opening the PDF Editor.
  const storeEstimatePdf = async (est: Estimate) => {
    await buildAndStoreEstimatePdf(est);
    if (logOperationalEvent) logOperationalEvent("Estimate PDF Stored", `${est.number} for ${est.customerName} saved to Documents`, "📄");
  };

  // Explicit "Send for Signing" is deliberately one step: create/update the
  // PDF record, attach a live remote-signing token, then open Android/iOS's
  // native share sheet with the PDF + signing link. No text/email chooser
  // and no trip through the PDF editor.
  const sendEstimateForSigning = async (est: Estimate) => {
    if (sendingForSigningId) return;
    setSendingForSigningId(est.id);
    try {
      const { pdfBase64, matchedCustomer, document } = await buildAndStoreEstimatePdf(est);
      if (pdfBase64.length > MAX_INLINE_BASE64_LENGTH) {
        triggerNotification("This estimate is too large for remote signing. Reduce embedded images, then try Send for Signing again.");
        return;
      }

      const existingOptions = (document as any).signingOptions || {};
      const existingToken = existingOptions.remoteToken && !existingOptions.remoteTokenUsedAt
        ? String(existingOptions.remoteToken)
        : "";
      const token = existingToken || `sign_${crypto.randomUUID().replace(/-/g, "")}`;
      const remoteTokenExpiresAt = existingOptions.remoteTokenExpiresAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const signingDocument = {
        ...document,
        folder: "eSign",
        status: "Awaiting Signature",
        lastModified: new Date().toISOString().replace("T", " ").substring(0, 19),
        pdfBase64,
        signingOptions: {
          ...existingOptions,
          signMethod: "both",
          remoteToken: token,
          remoteTokenExpiresAt,
          remoteSignerName: matchedCustomer?.contact || est.customerName
        }
      } as DocumentItem;

      setDocuments(prev => prev.some(doc => doc.id === signingDocument.id)
        ? prev.map(doc => doc.id === signingDocument.id ? signingDocument : doc)
        : [...prev, signingDocument]);

      const result = await shareRemoteSigningPackage({
        documentName: signingDocument.name,
        signingLink: buildRemoteSigningLink(token),
        pdfBase64,
        signerName: matchedCustomer?.contact || est.customerName
      });

      if (result === "shared") {
        if (setEstimates) setEstimates(prev => prev.map(item => item.id === est.id ? { ...item, status: "Sent" } : item));
        else setLocalEstimates(prev => prev.map(item => item.id === est.id ? { ...item, status: "Sent" } : item));
        setSelectedEstimate(prev => prev?.id === est.id ? { ...prev, status: "Sent" } : prev);
        triggerNotification("Signable PDF and live signing link opened in your device share menu.");
      } else if (result === "copied") {
        triggerNotification("Native sharing is unavailable here, so the live signing link was copied.");
      }
    } catch (error) {
      console.error(error);
      triggerNotification("Could not prepare this estimate for signing.");
    } finally {
      setSendingForSigningId(null);
    }
  };

  const handleAddEstimate = (action: "save" | "pdf" | "pdf-store" | "signatures" | "send-signing" | "convert" = "save") => {
    if (!formCustomerName.trim()) return;
    if (createEstimateLockedRef.current) return;
    createEstimateLockedRef.current = true;

    const session = createEstimateSessionRef.current || {
      id: `est_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      number: generateEstimateNumber()
    };
    createEstimateSessionRef.current = session;
    // Inherit the real source from an existing customer record when one
    // already matches (so a repeat customer's estimates keep rolling up
    // under their original Lead source); a brand-new name typed straight
    // into this form has no Lead behind it at all, so "Manual Entry" is
    // the honest attribution rather than leaving it blank.
    const cleanCustomerName = formCustomerName.trim();
    const cleanCompany = formCompany.trim();
    const matchedCustomer =
      resolveCustomerByIdOrName(customers, undefined, cleanCustomerName) ||
      (cleanCompany ? resolveCustomerByIdOrName(customers, undefined, cleanCompany) : null);
    const source = matchedCustomer?.source || "Manual Entry";
    const sourceLeadId = matchedCustomer?.sourceLeadId;
    const cleanLineItems = cleanEstimateLines();
    const pricing = calculateEstimatePricing(cleanLineItems, formDiscountPercent, formTaxRate);
    const newEst: Estimate = {
      id: session.id,
      number: session.number,
      customerId: matchedCustomer?.id,
      customerName: cleanCustomerName,
      company: cleanCompany,
      status: formStatus,
      salesRep: formSalesRep.trim() || "Self",
      amount: cleanLineItems.length ? pricing.total : Math.max(0, Number(formAmount) || 0),
      ...(cleanLineItems.length ? { lineItems: cleanLineItems } : {}),
      ...(cleanLineItems.length && pricing.discountPercent > 0 ? { discountPercent: pricing.discountPercent } : {}),
      ...(cleanLineItems.length && pricing.taxRate > 0 ? { taxRate: pricing.taxRate } : {}),
      notes: formNotes.trim(),
      projectSpecifics: formProjectSpecifics.trim() || undefined,
      address: formAddress.trim() || undefined,
      phone: normalizeContactPhone(formPhone) || undefined,
      createdDate: formatEstimateDate(new Date()),
      expirationDate: estimateExpirationDate(),
      source,
      sourceLeadId,
      ...(changeOrderTarget ? { changeOrderForJobId: changeOrderTarget.jobId } : {})
    };

    if (setEstimates) {
      setEstimates(prev => prev.some(existing => existing.id === newEst.id) ? prev : [newEst, ...prev]);
    } else {
      setLocalEstimates(prev => prev.some(existing => existing.id === newEst.id) ? prev : [newEst, ...prev]);
    }
    // Auto-create a "Potential" customer in the CRM if this person isn't
    // already in the system, carrying over whatever phone/address was
    // captured here -- previously this always created a blank-contact
    // customer, so converting the estimate to a job later always left
    // customerPhone/customerAddress empty on that job no matter what.
    // When the estimate is accepted the status upgrades to "Active"
    // automatically via approveEstimateToJob.
    upsertPotentialCustomer(newEst.customerName, newEst.company, newEst.phone, newEst.address, source, sourceLeadId);
    if (logOperationalEvent) {
      logOperationalEvent("Estimate Created", `${newEst.number} for ${newEst.customerName}`, "📝");
    }
    setIsAddModalOpen(false);
    if (action === "pdf") void generateEstimatePdf(newEst);
    if (action === "pdf-store") void storeEstimatePdf(newEst);
    if (action === "signatures") void generateEstimatePdf(newEst, true, false, true);
    if (action === "send-signing") void sendEstimateForSigning(newEst);
    if (action === "convert") {
      setEsignConvertTarget(newEst);
    }
    if (action === "save") {
      setEsignDraftTarget(newEst);
    }
  };

  const openViewModal = (est: Estimate) => {
    setSelectedEstimate(est);
    setFormCustomerName(est.customerName);
    setFormCompany(normalizeEstimateCompany(est.customerName, est.company));
    setFormPhone(normalizeContactPhone(est.phone || ""));
    setFormAddress(est.address || "");
    setFormAmount(est.amount);
    setFormStatus(est.status);
    setFormSalesRep(est.salesRep);
    setFormNotes(est.notes || "");
    setFormProjectSpecifics(est.projectSpecifics || "");
    setFormLineItems(est.lineItems || []);
    setFormDiscountPercent(clampPercent(est.discountPercent));
    setFormTaxRate(clampPercent(est.taxRate));
    setIsEditMode(false);
  };

  const duplicateEstimate = (source: Estimate) => {
    const duplicate: Estimate = {
      ...source,
      id: `est_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      number: generateEstimateNumber(),
      status: "Draft",
      createdDate: formatEstimateDate(new Date()),
      expirationDate: estimateExpirationDate(),
      lineItems: source.lineItems?.map(line => ({
        ...line,
        id: `eli_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
      }))
    };
    if (setEstimates) {
      setEstimates(prev => [duplicate, ...prev]);
    } else {
      setLocalEstimates(prev => [duplicate, ...prev]);
    }
    openViewModal(duplicate);
    logOperationalEvent?.("Estimate Duplicated", `${source.number} copied to ${duplicate.number}`, "📋", { screen: "estimates" });
    triggerNotification(`Duplicated ${source.number} as ${duplicate.number}.`);
  };

  const closeEstimateActionMenu = () => {
    setActionMenuEstimate(null);
    setActionMenuPosition(null);
  };

  const openEstimateDropdown = (est: Estimate, row: HTMLElement) => {
    const rect = row.getBoundingClientRect();
    setActionMenuEstimate(est);
    setActionMenuPosition({
      top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 360)),
      left: Math.max(8, Math.min(rect.left + 24, window.innerWidth - 260))
    });
  };

  const openEstimateSend = (est: Estimate) => {
    const match = resolveEstimateCustomer(est) || null;
    setSendTargetEstimate(est);
    setSendMatch(match ? { email: match.email, phone: normalizeContactPhone(est.phone || match.phone) } : { phone: normalizeContactPhone(est.phone) });
    closeEstimateActionMenu();
    setIsSendOpen(true);
  };

  const openEstimateAttach = (est: Estimate, targetType: "Customer" | "Job" | "Employee") => {
    const linkedDoc = documents.find(doc => doc.estimateId === est.id);
    const matchedCustomer = resolveEstimateCustomer(est) || null;
    const linkedJob = schedulingEvents.find(event => event.sourceEstimateId === est.id);

    let initialValue = "";
    if (targetType === "Customer") {
      initialValue = linkedDoc?.customer && linkedDoc.customer !== "None"
        ? linkedDoc.customer
        : matchedCustomer?.company || "";
    } else if (targetType === "Job") {
      initialValue = linkedDoc?.job && linkedDoc.job !== "None"
        ? linkedDoc.job
        : linkedJob?.id || "";
    } else {
      initialValue = linkedDoc?.employee && linkedDoc.employee !== "None"
        ? linkedDoc.employee
        : recentRoster.some(person => person.name === est.salesRep) ? est.salesRep : "";
    }

    setAttachEstimate(est);
    setAttachTargetType(targetType);
    setAttachValue(initialValue);
    closeEstimateActionMenu();
    setIsAttachModalOpen(true);
  };

  const handleEstimateAttachSubmit = async () => {
    if (!attachEstimate || !attachValue.trim()) return;
    const { document } = await buildAndStoreEstimatePdf(attachEstimate);
    setDocuments(prev => prev.map(doc => doc.id === document.id ? {
      ...doc,
      customer: attachTargetType === "Customer" ? attachValue : doc.customer,
      job: attachTargetType === "Job" ? attachValue : doc.job,
      employee: attachTargetType === "Employee" ? attachValue : doc.employee,
      lastModified: "Just now"
    } : doc));
    if (logOperationalEvent) {
      logOperationalEvent("Estimate Connected", `${attachEstimate.number} connected to ${attachTargetType}: ${attachValue}`, "🔗");
    }
    triggerNotification(`🔗 Attached ${attachEstimate.number} to ${attachTargetType}: ${attachValue}`);
    setIsAttachModalOpen(false);
    setAttachEstimate(null);
    setAttachValue("");
  };

  const handleDeleteEstimate = (est: Estimate) => {
    closeEstimateActionMenu();
    if (!window.confirm(`Delete estimate ${est.number}? This removes the estimate record only.`)) return;
    if (setEstimates) {
      setEstimates(prev => prev.filter(item => item.id !== est.id));
    } else {
      setLocalEstimates(prev => prev.filter(item => item.id !== est.id));
    }
    if (selectedEstimate?.id === est.id) setSelectedEstimate(null);
    if (logOperationalEvent) {
      logOperationalEvent("Estimate Deleted", `${est.number} for ${est.customerName}`, "🗑️");
    }
    triggerNotification(`🗑️ Deleted estimate ${est.number}`);
  };

  const handleSaveEdit = (action: "save" | "pdf" | "pdf-store" | "signatures" | "convert" = "save") => {
    if (!selectedEstimate) return;
    const cleanLineItems = cleanEstimateLines();
    const pricing = calculateEstimatePricing(cleanLineItems, formDiscountPercent, formTaxRate);
    const updated: Estimate = {
      ...selectedEstimate,
      customerName: formCustomerName.trim(),
      company: formCompany.trim(),
      phone: normalizeContactPhone(formPhone) || undefined,
      address: formAddress.trim() || undefined,
      amount: cleanLineItems.length ? pricing.total : Math.max(0, Number(formAmount) || 0),
      lineItems: cleanLineItems.length ? cleanLineItems : undefined,
      discountPercent: cleanLineItems.length && pricing.discountPercent > 0 ? pricing.discountPercent : undefined,
      taxRate: cleanLineItems.length && pricing.taxRate > 0 ? pricing.taxRate : undefined,
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
    if (action === "pdf-store") void storeEstimatePdf(updated);
    if (action === "signatures") void generateEstimatePdf(updated, true, false, true);
    const autoAccepting = selectedEstimate.status !== "Accepted" && updated.status === "Accepted";
    if (action === "convert" || autoAccepting) {
      setEsignConvertTarget(updated);
    } else if (action === "save") {
      setEsignDraftTarget(updated);
    }
  };

  // Queues the shared Build Job popup pre-filled with this estimate's info
  // (including its accepted value as the job's estimated value) via the
  // buildJobPrefill handoff, then navigates to Jobs -- the same "one
  // canonical popup, pre-seeded" pattern the Lead's "Build Estimate" button
  // already uses for openEstimateFromLead. sourceEstimateId is what makes
  // createJob's idempotency check work, so reopening an already-converted
  // estimate here can never create a duplicate job.
  const openBuildJobFromEstimate = (estimate: Estimate) => {
    const matchedCustomer = resolveEstimateCustomer(estimate);
    setBuildJobPrefill({
      customerId: matchedCustomer?.id,
      customerName: estimate.customerName,
      customerPhone: normalizeContactPhone(estimate.phone || matchedCustomer?.phone),
      customerEmail: matchedCustomer?.email,
      customerAddress: estimate.address || matchedCustomer?.address,
      description: estimate.projectSpecifics || undefined,
      notes: estimate.notes,
      budget: estimate.amount,
      sourceEstimateId: estimate.id,
      source: matchedCustomer?.source
    });
    setSelectedEstimate(null);
    onNavigateToScreen("jobs");
  };

  const estimates = propsEstimates || localEstimates;
  const selectedEstimateJob = selectedEstimate
    ? schedulingEvents.find(event => event.sourceEstimateId === selectedEstimate.id)
    : undefined;

  const isEstimateReadyForJob = (estimate: Estimate) =>
    (estimate.status === "Signed" || estimate.status === "Accepted") &&
    !schedulingEvents.some(event => event.sourceEstimateId === estimate.id);

  const convertibleEstimates = estimates.filter(isEstimateReadyForJob);

  const persistEstimateAccepted = (estimate: Estimate): Estimate => {
    if (estimate.status === "Accepted") return estimate;
    const accepted: Estimate = { ...estimate, status: "Accepted" };
    if (setEstimates) {
      setEstimates(prev => prev.map(item => item.id === accepted.id ? accepted : item));
    } else {
      setLocalEstimates(prev => prev.map(item => item.id === accepted.id ? accepted : item));
    }
    setSelectedEstimate(prev => prev?.id === accepted.id ? accepted : prev);
    logOperationalEvent?.("Estimate Accepted", `${accepted.number} accepted for job conversion`, "✅", { screen: "estimates" });
    return accepted;
  };

  const chooseEstimateForConversion = (estimate: Estimate) => {
    setIsConversionPickerOpen(false);
    const accepted = persistEstimateAccepted(estimate);
    openBuildJobFromEstimate(accepted);
  };

  // The Convert to Job eSign prompt's three real choices -- whichever one is
  // picked, the job conversion always follows right after (job creation
  // isn't gated on signing, per "every step after job creation needs to be
  // skippable"). "Send for Remote eSign"/"Sign in Person" additionally save
  // the estimate to Documents first so there's something to open and sign;
  // the actual signing UI is reached from there rather than blocking the Jobs
  // navigation this action always ends on.
  const handleEsignThenConvert = async (estimate: Estimate | null, savePdfFirst: boolean, remindNote?: string) => {
    if (!estimate) return;
    const accepted = persistEstimateAccepted(estimate);
    if (savePdfFirst) {
      await buildAndStoreEstimatePdf(accepted);
      triggerNotification(`${accepted.number} saved to Documents -- open it anytime to send it for signing.`);
    } else if (remindNote) {
      triggerNotification(remindNote);
    }
    openBuildJobFromEstimate(accepted);
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
    "Signed",
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
    Signed: "✍️",
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

  const renderEstimatePricingEditor = () => (
    <div className="rounded-2xl border border-[#9EC8EF] bg-[#F8FCFF] p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#1F3557]">Itemized Pricing</p>
          <p className="text-[9px] text-[#5E7393]">Add labor, materials, services, tax, and discount. Total updates automatically.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => addEstimateLine()}
            className="rounded-lg border border-[#9EC8EF] bg-white px-2.5 py-1.5 text-[10px] font-black text-[#315C9F]"
          >
            <Plus className="mr-1 inline h-3 w-3" />Add Line Item
          </button>
          <button
            type="button"
            onClick={() => { setPriceBookPickerMode(true); setIsPriceBookOpen(true); }}
            className="rounded-lg bg-[#315C9F] px-2.5 py-1.5 text-[10px] font-black text-white"
          >
            💲 Add from Price Book
          </button>
        </div>
      </div>

      {formLineItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#9EC8EF] bg-white px-3 py-2 text-[10px] text-[#5E7393]">
          No line items yet. You can still use a single quoted amount below, or add itemized pricing here.
        </div>
      ) : (
        <div className="space-y-2">
          {formLineItems.map((line, index) => (
            <div key={line.id} className="rounded-xl border border-[#C8DDEE] bg-white p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase text-[#5E7393]">Line {index + 1}</span>
                <button
                  type="button"
                  onClick={() => setFormLineItems(prev => prev.filter(item => item.id !== line.id))}
                  className="rounded-md bg-transparent p-1 text-rose-600"
                  aria-label={`Remove line ${index + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                type="text"
                value={line.description}
                onChange={e => updateEstimateLine(line.id, { description: e.target.value })}
                placeholder="Description — e.g. Replace 2-ton condenser"
                className="mb-2 w-full rounded-lg border border-[#9EC8EF] bg-[#F5FAFF] px-2.5 py-2 text-xs font-semibold text-[#1F3557]"
              />
              <div className="grid grid-cols-3 gap-2">
                <label className="text-[9px] font-bold text-[#5E7393]">
                  Qty
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.quantity}
                    onChange={e => updateEstimateLine(line.id, { quantity: Math.max(0, Number(e.target.value) || 0) })}
                    className="mt-1 w-full rounded-lg border border-[#9EC8EF] bg-[#F5FAFF] px-2 py-1.5 text-xs text-[#1F3557]"
                  />
                </label>
                <label className="text-[9px] font-bold text-[#5E7393]">
                  Unit Price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={e => updateEstimateLine(line.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                    className="mt-1 w-full rounded-lg border border-[#9EC8EF] bg-[#F5FAFF] px-2 py-1.5 text-xs text-[#1F3557]"
                  />
                </label>
                <div className="text-[9px] font-bold text-[#5E7393]">
                  Line Total
                  <div className="mt-1 rounded-lg border border-[#9EC8EF] bg-slate-50 px-2 py-1.5 text-xs font-black text-[#1F3557]">
                    ${(Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPrice) || 0)).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {formLineItems.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[9px] font-black uppercase text-[#5E7393]">
              Discount %
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formDiscountPercent}
                onChange={e => setFormDiscountPercent(clampPercent(Number(e.target.value)))}
                className="mt-1 w-full rounded-lg border border-[#9EC8EF] bg-white px-2.5 py-2 text-xs font-bold text-[#1F3557]"
              />
            </label>
            <label className="text-[9px] font-black uppercase text-[#5E7393]">
              Tax %
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formTaxRate}
                onChange={e => setFormTaxRate(clampPercent(Number(e.target.value)))}
                className="mt-1 w-full rounded-lg border border-[#9EC8EF] bg-white px-2.5 py-2 text-xs font-bold text-[#1F3557]"
              />
            </label>
          </div>
          <div className="rounded-xl bg-[#EAF5FF] p-3 text-xs text-[#1F3557]">
            <div className="flex justify-between"><span>Subtotal</span><b>${formPricing.subtotal.toFixed(2)}</b></div>
            {formPricing.discountAmount > 0 && <div className="mt-1 flex justify-between"><span>Discount ({formPricing.discountPercent}%)</span><b>−${formPricing.discountAmount.toFixed(2)}</b></div>}
            {formPricing.taxAmount > 0 && <div className="mt-1 flex justify-between"><span>Tax ({formPricing.taxRate}%)</span><b>${formPricing.taxAmount.toFixed(2)}</b></div>}
            <div className="mt-2 flex justify-between border-t border-[#9EC8EF] pt-2 text-sm font-black"><span>Total</span><span>${formPricing.total.toFixed(2)}</span></div>
          </div>
        </>
      ) : (
        <label className="block text-[10px] uppercase font-bold text-[#5E7393]">
          Quoted Amount ($)
          <input
            type="number"
            min="0"
            step="0.01"
            value={formAmount || ""}
            onChange={e => setFormAmount(Math.max(0, Number(e.target.value) || 0))}
            placeholder="e.g. 12500"
            className="mt-1 w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
          />
        </label>
      )}
    </div>
  );

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
              onClick={() => { setPriceBookPickerMode(false); setIsPriceBookOpen(true); }}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              💲 Price Book
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
            Still being worked
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
            Waiting to be scheduled
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
            Ready to turn into a job
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
            Needs changes
          </span>
        </div>

        <div className="col-span-2 md:col-span-1 bg-[#315C9F] border border-[#1F3557] p-4 rounded-2xl flex flex-col items-start gap-1 shadow-md text-white">
          <span className="text-[10px] text-blue-100 font-extrabold uppercase tracking-widest">
            Possible Income
          </span>
          <span className="text-xl font-mono font-black text-white">
            ${metrics.revenuePending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[9px] text-blue-200/90 font-bold uppercase tracking-wider">
            Total Value of Open Estimates
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
                Showing {filteredEstimates.length} estimates
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
                    No estimates found. Clear your filters or create a new estimate.
                  </td>
                </tr>
              ) : (
                filteredEstimates.map((est) => {
                  // Style badge depending on status
                  let badgeStyle = "bg-slate-100 text-slate-700 border-slate-300";
                  if (est.status === "Signed" || est.status === "Accepted" || est.status === "Completed") {
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
                      onClick={(event) => openEstimateDropdown(est, event.currentTarget)}
                      className="hover:bg-[#EAF5FF] transition-all cursor-pointer group bg-white"
                    >
                      <td className="py-3.5 px-4 font-mono font-black text-[#315C9F] group-hover:underline">
                        {est.number}
                        {est.changeOrderForJobId && (
                          <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 font-sans text-[8px] font-black uppercase tracking-wide text-amber-800 no-underline">Change Order</span>
                        )}
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

      {/* ESTIMATE ROW ACTION MENU */}
      {actionMenuEstimate && actionMenuPosition && (
        <div className="fixed inset-0 z-50" onClick={closeEstimateActionMenu}>
          <div
            className="absolute w-[250px] bg-white text-[#1F3557] border border-[#9EC8EF] rounded-xl shadow-xl p-1.5 text-left"
            style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-2.5 py-2 border-b border-[#9EC8EF]/50">
              <p className="text-[10px] font-black uppercase tracking-wider truncate">{actionMenuEstimate.number}</p>
            </div>
            <button
              onClick={() => {
                const estimate = actionMenuEstimate;
                closeEstimateActionMenu();
                openViewModal(estimate);
                setIsEditMode(true);
              }}
              className="w-full px-2.5 py-2 hover:bg-[#EAF5FF] rounded-lg flex items-center gap-2 text-[11px] font-black uppercase"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#315C9F]" />
              Edit
            </button>
            <button
              onClick={() => openEstimateSend(actionMenuEstimate)}
              className="w-full px-2.5 py-2 hover:bg-[#EAF5FF] rounded-lg flex items-center gap-2 text-[11px] font-black uppercase"
            >
              <Send className="w-3.5 h-3.5 text-emerald-600" />
              Send
            </button>
            <button
              disabled={sendingForSigningId !== null}
              onClick={() => {
                const estimate = actionMenuEstimate;
                closeEstimateActionMenu();
                void sendEstimateForSigning(estimate);
              }}
              className="w-full px-2.5 py-2 hover:bg-[#EAF5FF] rounded-lg flex items-center gap-2 text-[11px] font-black uppercase disabled:opacity-50"
            >
              <FileSignature className="w-3.5 h-3.5 text-amber-600" />
              Send for Signing
            </button>
            {canCollectSignatures && (
              <button
                onClick={() => {
                  const estimate = actionMenuEstimate;
                  closeEstimateActionMenu();
                  void generateEstimatePdf(estimate, true, false, true);
                }}
                className="w-full px-2.5 py-2 hover:bg-[#EAF5FF] rounded-lg flex items-center gap-2 text-[11px] font-black uppercase"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#315C9F]" />
                Collect Signatures
              </button>
            )}
            <button
              onClick={() => {
                const estimate = actionMenuEstimate;
                closeEstimateActionMenu();
                chooseEstimateForConversion(estimate);
              }}
              className="w-full px-2.5 py-2 hover:bg-[#EAF5FF] rounded-lg flex items-center gap-2 text-[11px] font-black uppercase"
            >
              <Wrench className="w-3.5 h-3.5 text-[#315C9F]" />
              Convert to Job
            </button>
            <details className="group">
              <summary className="list-none w-full px-2.5 py-2 hover:bg-[#EAF5FF] rounded-lg flex items-center justify-between gap-2 text-[11px] font-black uppercase cursor-pointer">
                <span className="flex items-center gap-2">
                  <Link className="w-3.5 h-3.5 text-[#315C9F]" />
                  Attach To
                </span>
                <ChevronDown className="w-3.5 h-3.5" />
              </summary>
              <div className="pl-4 pr-1 pb-1 grid gap-1">
                <button
                  onClick={() => openEstimateAttach(actionMenuEstimate, "Customer")}
                  className="w-full px-2.5 py-1.5 hover:bg-[#EAF5FF] rounded-lg flex items-center gap-2 text-[10px] font-bold uppercase"
                >
                  <User className="w-3 h-3" />
                  Customer
                </button>
                <button
                  onClick={() => openEstimateAttach(actionMenuEstimate, "Job")}
                  className="w-full px-2.5 py-1.5 hover:bg-[#EAF5FF] rounded-lg flex items-center gap-2 text-[10px] font-bold uppercase"
                >
                  <Briefcase className="w-3 h-3" />
                  Job
                </button>
                <button
                  onClick={() => openEstimateAttach(actionMenuEstimate, "Employee")}
                  className="w-full px-2.5 py-1.5 hover:bg-[#EAF5FF] rounded-lg flex items-center gap-2 text-[10px] font-bold uppercase"
                >
                  <Users className="w-3 h-3" />
                  Employee
                </button>
              </div>
            </details>
            <button
              onClick={() => handleDeleteEstimate(actionMenuEstimate)}
              className="w-full px-2.5 py-2 hover:bg-rose-50 text-rose-600 rounded-lg flex items-center gap-2 text-[11px] font-black uppercase"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
      )}

      {isAttachModalOpen && attachEstimate && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[400px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3 mb-4">
              <h3 className="text-sm font-black uppercase text-[#1F3557] tracking-wider">Attach Estimate</h3>
              <button
                onClick={() => {
                  setIsAttachModalOpen(false);
                  setAttachEstimate(null);
                  setAttachValue("");
                }}
                className="text-xs font-bold text-[#5E7393]"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 text-xs font-bold text-[#1F3557]">
              <div className="space-y-1">
                <label className="text-[#5E7393]">Link Record Name / ID</label>
                {attachTargetType === "Customer" ? (
                  <select
                    value={attachValue}
                    onChange={(event) => setAttachValue(event.target.value)}
                    className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none text-[#1F3557]"
                  >
                    <option value="">-- Choose Customer --</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.company}>{customer.company}</option>
                    ))}
                  </select>
                ) : attachTargetType === "Job" ? (
                  <select
                    value={attachValue}
                    onChange={(event) => setAttachValue(event.target.value)}
                    className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none text-[#1F3557]"
                  >
                    <option value="">-- Choose Job --</option>
                    {schedulingEvents.filter(event => event.eventType === "Job").map(event => (
                      <option key={event.id} value={event.id}>{event.customer} - {event.date}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={attachValue}
                    onChange={(event) => setAttachValue(event.target.value)}
                    className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none text-[#1F3557]"
                  >
                    <option value="">-- Choose Employee --</option>
                    {recentRoster.map(person => (
                      <option key={person.id || person.name} value={person.name}>{person.name} ({person.role})</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => {
                    setIsAttachModalOpen(false);
                    setAttachEstimate(null);
                    setAttachValue("");
                  }}
                  className="flex-1 py-2 bg-blue-100 hover:bg-blue-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={!attachValue.trim()}
                  onClick={() => void handleEstimateAttachSubmit()}
                  className="flex-1 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white rounded-xl cursor-pointer shadow-md disabled:opacity-50"
                >
                  Apply Connection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                Download, copy, schedule, or send an estimate.
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
                  } else if (btn.label === "Duplicate Estimate") {
                    const target = selectedEstimate || estimates[0];
                    if (target) duplicateEstimate(target);
                    else triggerNotification("Create or select an estimate first.");
                  } else if (btn.label === "Convert to Job") {
                    if (convertibleEstimates.length === 0) {
                      triggerNotification("No signed or accepted estimates are waiting to be converted.");
                    } else if (convertibleEstimates.length === 1) {
                      chooseEstimateForConversion(convertibleEstimates[0]);
                    } else {
                      setIsConversionPickerOpen(true);
                    }
                  } else if (btn.label === "Schedule Appointment") {
                    onNavigateToScreen("scheduling");
                  } else if (btn.label === "Message Customer") {
                    onNavigateToScreen("messages");
                  } else if (btn.label === "View Documents") {
                    onNavigateToScreen("documents");
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
                Get help with pricing, materials, labor, and profit.
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
                onClick={() => {
                  const target = selectedEstimate || estimates[0];
                  const estimateContext = target
                    ? `Focus on ${card.title} for estimate ${target.number}: customer ${target.customerName}, status ${target.status}, amount ${target.amount.toFixed(2)}, scope ${target.projectSpecifics || target.notes || "not provided"}.`
                    : `Focus on ${card.title} for the Estimates & Bids page using the real estimate data currently shown.`;
                  onOpenAIAnalysis("estimates", `Estimates & Bids — ${card.title}`, estimateContext);
                }}
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
              onClick={() => {
                const estimate = estimates.find(item => item.id === act.id);
                if (estimate) openViewModal(estimate);
                else triggerNotification("That estimate is no longer available.");
              }}
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
            WHAT HAPPENS AFTER ACCEPTANCE
          </span>
        </div>

        <p className="text-slate-600 text-[11px] leading-relaxed font-sans font-semibold">
          When you approve an accepted estimate, Owner’sLOCAL creates one job and adds it to Jobs, Scheduling, Dispatch, and the Map.
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
            { id: "dashboard", label: "Dashboard", icon: "📊" },
            { id: "shared_events", label: "History", icon: "⚙️" }
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
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[92vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-white" />
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">{changeOrderTarget ? "Create Change Order" : "Create New Estimate"}</h3>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 min-h-0">
              {changeOrderTarget && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                  Change order for {changeOrderTarget.label}. Price only the added work, then get the customer's signature. Once signed, it's added to the job's approved amount.
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#5E7393]">Select Customer</label>
                <select
                  value=""
                  onChange={(event) => {
                    const customer = customers.find(item => item.id === event.target.value);
                    if (!customer) return;
                    const customerName = customer.contact || customer.company;
                    setFormCustomerName(customerName);
                    setFormCompany(customer.contact ? normalizeEstimateCompany(customer.contact, customer.company) : customer.company);
                    setFormPhone(normalizeContactPhone(customer.phone || ""));
                    setFormAddress(customer.address || "");
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
                    onChange={e => setFormPhone(normalizeContactPhone(e.currentTarget.value))}
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

              {renderEstimatePricingEditor()}

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#5E7393]">Initial Status</label>
                <select
                  value={formStatus}
                  onChange={e => setFormStatus(e.target.value as Estimate["status"])}
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                >
                  <option value="Draft">Draft</option>
                  <option value="Pending">Pending</option>
                  <option value="Sent">Sent</option>
                  <option value="Viewed">Viewed</option>
                  <option value="Signed">Signed</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Declined">Declined</option>
                  <option value="Expired">Expired</option>
                </select>
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
                onClick={() => handleAddEstimate("pdf-store")}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-emerald-600 text-emerald-700 font-bold rounded-xl text-xs uppercase tracking-wider disabled:border-slate-300 disabled:text-slate-300 transition-colors cursor-pointer"
              >
                Save (and Store as PDF)
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
                <>
                  <button
                    type="button"
                    disabled={!formCustomerName.trim()}
                    onClick={() => handleAddEstimate("signatures")}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300 transition-colors cursor-pointer"
                  >
                    Collect Signatures
                  </button>
                  <button
                    type="button"
                    disabled={!formCustomerName.trim() || sendingForSigningId !== null}
                    onClick={() => handleAddEstimate("send-signing")}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300 transition-colors cursor-pointer"
                  >
                    {sendingForSigningId ? "Preparing…" : "Send for Signing"}
                  </button>
                </>
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
            const customerName = c.contact || c.company;
            setFormCustomerName(customerName);
            setFormCompany(c.contact ? normalizeEstimateCompany(c.contact, c.company) : c.company);
            setFormPhone(normalizeContactPhone(c.phone || ""));
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
                        onChange={e => setFormPhone(normalizeContactPhone(e.currentTarget.value))}
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

                  {renderEstimatePricingEditor()}

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Quotation Status</label>
                    <select
                      value={formStatus}
                      onChange={e => setFormStatus(e.target.value as Estimate["status"])}
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                    >
                      <option value="Draft">Draft</option>
                      <option value="Pending">Pending</option>
                      <option value="Sent">Sent</option>
                      <option value="Viewed">Viewed</option>
                      <option value="Signed">Signed</option>
                      <option value="Accepted">Accepted</option>
                      <option value="Declined">Declined</option>
                      <option value="Expired">Expired</option>
                    </select>
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
                        <p className="text-xs text-[#5E7393] font-semibold">{normalizeEstimateCompany(selectedEstimate.customerName, selectedEstimate.company) || "No Company"}</p>
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

                  {!!selectedEstimate.lineItems?.length && (() => {
                    const pricing = calculateEstimatePricing(
                      selectedEstimate.lineItems,
                      selectedEstimate.discountPercent,
                      selectedEstimate.taxRate
                    );
                    return (
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Itemized Pricing</p>
                        {selectedEstimate.lineItems.map(li => (
                          <div key={li.id} className="rounded-lg bg-[#EAF5FF]/50 border border-[#9EC8EF]/30 p-2 text-xs">
                            <div className="flex items-start justify-between gap-3">
                              <span className="font-bold text-[#1F3557]">{li.description}</span>
                              <b className="shrink-0 text-[#1F3557]">${(li.quantity * li.unitPrice).toFixed(2)}</b>
                            </div>
                            <div className="mt-0.5 text-[9.5px] text-[#5E7393]">{li.quantity} × ${li.unitPrice.toFixed(2)}</div>
                          </div>
                        ))}
                        <div className="rounded-xl border border-[#9EC8EF] bg-white p-3 text-xs text-[#1F3557]">
                          <div className="flex justify-between"><span>Subtotal</span><b>${pricing.subtotal.toFixed(2)}</b></div>
                          {pricing.discountAmount > 0 && <div className="mt-1 flex justify-between"><span>Discount ({pricing.discountPercent}%)</span><b>−${pricing.discountAmount.toFixed(2)}</b></div>}
                          {pricing.taxAmount > 0 && <div className="mt-1 flex justify-between"><span>Tax ({pricing.taxRate}%)</span><b>${pricing.taxAmount.toFixed(2)}</b></div>}
                          <div className="mt-2 flex justify-between border-t border-[#9EC8EF] pt-2 font-black"><span>Total</span><span>${pricing.total.toFixed(2)}</span></div>
                        </div>
                      </div>
                    );
                  })()}

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
                        {selectedEstimate.status === "Accepted"
                          ? "Accepted — ready to schedule"
                          : selectedEstimate.status === "Signed"
                            ? "Signed — ready to convert"
                            : "Confirm customer acceptance"}
                      </p>
                      <button
                        onClick={() => {
                          if (selectedEstimate.status === "Signed" || selectedEstimate.status === "Accepted") {
                            chooseEstimateForConversion(selectedEstimate);
                          } else {
                            setEsignConvertTarget({ ...selectedEstimate, status: "Accepted" });
                          }
                        }}
                        className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {selectedEstimate.status === "Signed" || selectedEstimate.status === "Accepted" ? "Convert to Job" : "Accept & Schedule Job"}
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

            <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-4 sm:px-6 py-4 shrink-0 max-h-[42vh] overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {!isEditMode && (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="flex-1 min-w-[120px] px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Edit Proposal
                  </button>
                )}
                {!isEditMode && (() => {
                  const match = resolveEstimateCustomer(selectedEstimate);
                  return (
                    <>
                      <button
                        onClick={() => match ? onNavigateToScreen("customers", { customerId: match.id }) : triggerNotification("No matching customer record found.")}
                        className="flex-1 min-w-[120px] px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Open Customer
                      </button>
                      <button
                        onClick={() => void sendEstimateForSigning(selectedEstimate)}
                        disabled={sendingForSigningId === selectedEstimate.id}
                        className="flex-1 min-w-[140px] px-3 py-2 bg-indigo-600 hover:bg-indigo-700 border border-indigo-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        {sendingForSigningId === selectedEstimate.id ? "Preparing…" : "Send for Signing"}
                      </button>
                    </>
                  );
                })()}
                {!isEditMode && selectedEstimate && <button type="button" onClick={()=>void storeEstimatePdf(selectedEstimate)} className="flex-1 min-w-[120px] px-3 py-2 bg-white border border-emerald-600 text-emerald-700 font-bold rounded-xl text-xs uppercase tracking-wider">Store as PDF</button>}
                {!isEditMode && selectedEstimate && <button type="button" onClick={()=>void generateEstimatePdf(selectedEstimate)} className="flex-1 min-w-[120px] px-3 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider">Generate PDF</button>}
                {!isEditMode && selectedEstimate && canCollectSignatures && <button type="button" onClick={()=>void generateEstimatePdf(selectedEstimate, true, false, true)} className="flex-1 min-w-[140px] px-3 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider">Collect Signatures</button>}
                {!isEditMode && selectedEstimate && !schedulingEvents.some(event => event.sourceEstimateId === selectedEstimate.id) && (
                  <button type="button" onClick={() => {
                    if (selectedEstimate.status === "Signed" || selectedEstimate.status === "Accepted") chooseEstimateForConversion(selectedEstimate);
                    else setEsignConvertTarget({ ...selectedEstimate, status: "Accepted" });
                  }} className="flex-1 min-w-[120px] px-3 py-2 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider">Convert to Job</button>
                )}
                {!isEditMode && selectedEstimate && (
                  <button
                    type="button"
                    onClick={() => {
                      const linkedJob = schedulingEvents.find(event => event.sourceEstimateId === selectedEstimate.id);
                      setWorkOrderPrefill({
                        sourceEstimateId: selectedEstimate.id,
                        sourceJobId: linkedJob?.id,
                        customerName: selectedEstimate.customerName,
                        address: selectedEstimate.address,
                        customerPhone: normalizeContactPhone(selectedEstimate.phone),
                        jobDescription: selectedEstimate.projectSpecifics || selectedEstimate.notes || `${normalizeEstimateCompany(selectedEstimate.customerName, selectedEstimate.company) || selectedEstimate.customerName} project`,
                        estimatedValue: selectedEstimate.amount,
                        date: new Date().toISOString().slice(0, 10)
                      });
                      setIsWorkOrderBuilderOpen(true);
                    }}
                    className="flex-1 min-w-[140px] px-3 py-2 bg-white border border-[#9EC8EF] text-[#315C9F] font-bold rounded-xl text-xs uppercase tracking-wider"
                  >
                    Create Work Order
                  </button>
                )}
                {!isEditMode && selectedEstimate && (
                  <button
                    type="button"
                    onClick={() => {
                      setMembershipPrefillBase({
                        sourceEstimateId: selectedEstimate.id,
                        customerName: selectedEstimate.customerName,
                        address: selectedEstimate.address,
                        customerPhone: normalizeContactPhone(selectedEstimate.phone)
                      });
                      setIsMembershipPickerOpen(true);
                    }}
                    className="flex-1 min-w-[140px] px-3 py-2 bg-white border border-[#9EC8EF] text-[#315C9F] font-bold rounded-xl text-xs uppercase tracking-wider"
                  >
                    Add Membership
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedEstimate(null)}
                  className="flex-1 min-w-[100px] px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Close
                </button>
                {isEditMode && (
                  <button
                    type="button"
                    disabled={!formCustomerName.trim()}
                    onClick={() => handleSaveEdit("save")}
                    className={`flex-1 min-w-[130px] px-3 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                      formCustomerName.trim() ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                    }`}
                  >
                    Save Changes
                  </button>
                )}
                {isEditMode && <button type="button" disabled={!formCustomerName.trim()} onClick={()=>handleSaveEdit("pdf-store")} className="flex-1 min-w-[150px] px-3 py-2 bg-white border border-emerald-600 text-emerald-700 font-bold rounded-xl text-xs uppercase tracking-wider disabled:border-slate-300 disabled:text-slate-300">Save & Store PDF</button>}
                {isEditMode && <button type="button" disabled={!formCustomerName.trim()} onClick={()=>handleSaveEdit("pdf")} className="flex-1 min-w-[150px] px-3 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300">Save & Generate PDF</button>}
                {isEditMode && canCollectSignatures && <button type="button" disabled={!formCustomerName.trim()} onClick={()=>handleSaveEdit("signatures")} className="flex-1 min-w-[140px] px-3 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300">Collect Signatures</button>}
                {isEditMode && <button type="button" disabled={!formCustomerName.trim()} onClick={()=>handleSaveEdit("convert")} className="flex-1 min-w-[120px] px-3 py-2 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300 disabled:text-slate-500">Convert to Job</button>}
              </div>
              {!isEditMode && selectedEstimate && (
                <div className="mt-3 border-t border-[#9EC8EF] pt-3">
                  <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-[#5E7393]">Customer Portal</p>
                  <CustomerPortalControls customer={resolveCustomerByIdOrName(customers, selectedEstimate.customerId, selectedEstimate.customerName)} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isConversionPickerOpen && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[#1F3557]/75 p-3 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-xl overflow-hidden rounded-3xl border-2 border-[#9EC8EF] bg-[#F5FAFF] shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#9EC8EF] bg-white px-5 py-4">
              <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#4A86F7]">Convert to job</p><h3 className="mt-1 text-lg font-black text-[#1F3557]">Choose a signed or accepted estimate</h3></div>
              <button aria-label="Close estimate chooser" onClick={() => setIsConversionPickerOpen(false)} className="rounded-lg p-2 text-[#5E7393] hover:bg-[#EAF5FF]"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[65vh] space-y-2 overflow-y-auto p-4">
              {convertibleEstimates.map(estimate => (
                <button key={estimate.id} onClick={() => chooseEstimateForConversion(estimate)} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-[#9EC8EF] bg-white p-4 text-left hover:bg-[#EAF5FF]">
                  <span><span className="block text-sm font-black text-[#1F3557]">{estimate.customerName}</span><span className="text-[10px] font-bold text-[#5E7393]">{estimate.number} · {estimate.status}{estimate.company ? ` · ${estimate.company}` : ""}</span></span>
                  <span className="shrink-0 text-sm font-black text-emerald-600">${estimate.amount.toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <SendChoiceModal
        isOpen={isSendOpen}
        onClose={() => {
          setIsSendOpen(false);
          setSendTargetEstimate(null);
          setSendMatch(null);
        }}
        label={`Estimate ${sendTargetEstimate?.number || ""}`}
        phone={sendMatch?.phone}
        email={sendMatch?.email}
      />

      <ESignChoiceModal
        isOpen={!!esignConvertTarget}
        onClose={() => setEsignConvertTarget(null)}
        label={`Estimate ${esignConvertTarget?.number || ""}`}
        onSendRemote={() => void handleEsignThenConvert(esignConvertTarget, true)}
        onSignInPerson={() => void handleEsignThenConvert(esignConvertTarget, true)}
        onSkip={() => void handleEsignThenConvert(esignConvertTarget, false)}
        skipLabel="Skip"
        onRemindLater={() => void handleEsignThenConvert(esignConvertTarget, false, `We'll remind you to set up e-signing for ${esignConvertTarget?.number}.`)}
      />
      <ESignChoiceModal
        isOpen={!!esignDraftTarget}
        onClose={() => setEsignDraftTarget(null)}
        label={`Estimate ${esignDraftTarget?.number || ""}`}
        onSendRemote={() => esignDraftTarget && void generateEstimatePdf(esignDraftTarget, true, true)}
        onSignInPerson={() => esignDraftTarget && void generateEstimatePdf(esignDraftTarget, true, true)}
        onSkip={() => {}}
        skipLabel="Skip for Now"
        onRemindLater={() => triggerNotification(`We'll remind you to set up e-signing for ${esignDraftTarget?.number}.`)}
      />
      <WorkOrderBuilder isOpen={isWorkOrderBuilderOpen} onClose={() => setIsWorkOrderBuilderOpen(false)} prefill={workOrderPrefill} />
      <CreateMembershipPicker isOpen={isMembershipPickerOpen} onClose={() => setIsMembershipPickerOpen(false)} prefillBase={membershipPrefillBase} />
      <PriceBookModal
        isOpen={isPriceBookOpen}
        onClose={() => { setIsPriceBookOpen(false); setPriceBookPickerMode(false); }}
        pickerMode={priceBookPickerMode ? {
          onPick: item => addEstimateLine(item)
        } : undefined}
      />
    </div>
  );
};
