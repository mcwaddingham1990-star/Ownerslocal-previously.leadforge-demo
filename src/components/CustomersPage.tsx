import React, { useState, useMemo, useEffect } from "react";
import { parseAddress } from "./StructuredAddressFields";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useAuth } from "../context/AuthContext";
import { hasPermission } from "../types/permissions";
import {
  Search,
  Plus,
  Upload,
  Download,
  Users,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  Building,
  Home,
  Briefcase,
  FileText,
  Calendar,
  CreditCard,
  MessageSquare,
  FolderOpen,
  Activity,
  User,
  MapPin,
  Mail,
  Phone,
  Filter,
  Sparkles,
  Camera,
  Trash2,
  Edit3,
  X,
  Save,
  Minus
} from "lucide-react";

export type { Customer } from "../types/domain";
import type { Customer, DocumentItem } from "../types/domain";
import type { ProjectCompletionPlan } from "../types/completion";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection";
import { buildCustomerProfilePdf, buildEstimatePdf, buildInvoicePdf, buildTextDocumentPdf, mergePdfs, base64ToBytes, bytesToBase64 } from "../lib/pdfExport";
import { MAX_INLINE_BASE64_LENGTH } from "../lib/firestoreDocumentLimits";
import { composeEmail, composeSms, callNumber } from "../lib/deviceHandoff";

export interface CustomersPageProps {
  // NOTE: this page calls onOpenPlaceholder("estimates")/("scheduling", "icon")
  // with real screen IDs, not (label, icon) placeholder pairs like every other
  // page — App.tsx wires a special-cased closure for this one call site to
  // compensate. Left as a distinct prop rather than folded into
  // NavTelemetryContext's openPlaceholderPage to avoid changing behavior here.
  onOpenPlaceholder: (label: string, icon: string) => void;
}

// 10 high-quality realistic OwnersLOCAL customers
export const INITIAL_CUSTOMERS: Customer[] = [];

export const CustomersPage: React.FC<CustomersPageProps> = ({
  onOpenPlaceholder
}) => {
  const { customers: propCustomers, setCustomers: propSetCustomers, estimates, invoices, schedulingEvents, documents, setDocuments, setGeneratedPdfDraft, setPendingSignatureCapture, preSelectedCustomerId, setPreSelectedCustomerId, businessProfile } = useDomainData();
  const {
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    navigateToScreen: onNavigateToScreen,
    logOperationalEvent,
    triggerNotification
  } = useNavTelemetry();
  const { loggedInUser, businessId } = useAuth();
  // Real job-completion plans (summary, per-goal notes, the completing
  // employee's name, materials used) -- same collection JobsPage feeds into
  // ProjectCompletionTracking. Read-only here, just to fold real job notes
  // into "Compile Documents."
  const [completionPlans] = useFirestoreCollection<ProjectCompletionPlan>("project_completion_plans", businessId);
  const canCreateCustomer = hasPermission(loggedInUser?.granularPermissions, "customers", "edit");
  const canDeleteCustomer = hasPermission(loggedInUser?.granularPermissions, "customers", "delete");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "All" | "Residential" | "Commercial" | "Active" | "Inactive" | "Past Due" | "VIP" | "Recently Added"
  >("All");

  const [localCustomers, setLocalCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem("ownerslocal_customers");
    return saved ? JSON.parse(saved) : INITIAL_CUSTOMERS;
  });

  const customers = propCustomers || localCustomers;
  const setCustomers = propSetCustomers || setLocalCustomers;
  const pendingCustomers = useMemo(() => customers.filter(customer => customer.pendingConfirmation), [customers]);
  // Real "Compile Documents": builds one actual merged PDF containing the
  // customer's estimate(s), invoice(s), job planning/summary + the
  // completing employee's notes and checklist, and any receipts/other
  // documents on file -- not a text list of ID numbers.
  const compileCustomerDocuments = async (customer: Customer) => {
    const names = [customer.id, customer.contact, customer.company].filter(Boolean);
    const customerEstimates = estimates.filter(item => names.includes(item.customerName) || names.includes(item.company));
    const customerInvoices = invoices.filter(item => names.includes(item.customer));
    const customerJobs = schedulingEvents.filter(item => names.includes(item.customer) || item.customerId === customer.id);
    const customerDocs = documents.filter(item => names.includes(item.customer));
    triggerNotification("Compiling documents into one PDF…");

    const parts: Uint8Array[] = [];
    parts.push(await buildCustomerProfilePdf(customer, { estimates: customerEstimates, invoices: customerInvoices }, businessProfile));

    for (const est of customerEstimates) {
      const savedDoc = customerDocs.find(d => d.estimateId === est.id && (d as any).pdfBase64);
      parts.push(savedDoc ? base64ToBytes((savedDoc as any).pdfBase64) : await buildEstimatePdf(est, customer, businessProfile));
    }
    for (const inv of customerInvoices) {
      const savedDoc = customerDocs.find(d => d.invoiceId === inv.id && (d as any).pdfBase64);
      parts.push(savedDoc ? base64ToBytes((savedDoc as any).pdfBase64) : await buildInvoicePdf(inv, customer, businessProfile));
    }
    for (const job of customerJobs) {
      const plan = completionPlans.find(p => p.jobId === job.id);
      const sections: Array<{ heading?: string; body: string }> = [
        { heading: "Job", body: `${job.title || job.jobNumber || job.id} — ${job.eventType}${job.customType ? ` (${job.customType})` : ""}\n${job.date} ${job.startTime}-${job.endTime} · Status: ${job.status}\nAssigned: ${job.assignedEmployee || "Unassigned"}` },
        { heading: "Notes", body: job.notes || plan?.summary || "No notes on file." }
      ];
      if (job.checklist?.length) {
        sections.push({ heading: "Completion checklist", body: job.checklist.map(c => `${c.completed ? "[x]" : "[ ]"} ${c.label}${c.completedBy ? ` — ${c.completedBy}${c.completedAt ? ` (${c.completedAt})` : ""}` : ""}`).join("\n") });
      }
      if (plan) {
        if (plan.overallGoal) sections.push({ heading: "Overall goal", body: plan.overallGoal });
        plan.goals.forEach(goal => {
          const goalLines = [goal.instructions, goal.projectNotes, goal.issuesDuringCompletion ? `Issues: ${goal.issuesDuringCompletion}` : "", goal.lastEmployeeName ? `Completed by: ${goal.lastEmployeeName}` : ""].filter(Boolean).join("\n");
          sections.push({ heading: `Goal: ${goal.title} (${goal.status})`, body: goalLines || "—" });
          if (goal.materials.length) {
            sections.push({ heading: `Materials used — ${goal.title}`, body: goal.materials.map(m => `${m.quantity} × ${m.inventoryItemName}${m.notes ? ` (${m.notes})` : ""}`).join("\n") });
          }
        });
      }
      parts.push(await buildTextDocumentPdf(`Job Summary — ${job.title || job.jobNumber || job.id}`, sections, businessProfile));
    }
    // Receipts and any other real document already on file for this
    // customer/job that isn't one of the estimates/invoices already merged
    // above (e.g. a photographed receipt saved with its own PDF).
    const usedDocIds = new Set(parts.length ? customerDocs.filter(d => d.estimateId !== "None" && customerEstimates.some(e => e.id === d.estimateId)).map(d => d.id) : []);
    for (const doc of customerDocs) {
      if (usedDocIds.has(doc.id)) continue;
      if (doc.estimateId && doc.estimateId !== "None" && customerEstimates.some(e => e.id === doc.estimateId)) continue;
      if (doc.invoiceId && doc.invoiceId !== "None" && customerInvoices.some(i => i.id === doc.invoiceId)) continue;
      const pdfBase64 = (doc as any).pdfBase64;
      if (pdfBase64) parts.push(base64ToBytes(pdfBase64));
    }

    const merged = await mergePdfs(parts);
    const pdfBase64 = bytesToBase64(merged);
    const filename = `${(customer.company || customer.contact || "Customer").replace(/[\\/:*?"<>|]+/g, "-")}-compiled-documents.pdf`;
    const docId = `doc_compiled_${customer.id}_${Date.now()}`;
    const newDoc: DocumentItem = {
      id: docId,
      name: filename,
      customer: customer.contact || customer.company,
      employee: loggedInUser?.name || "Staff Administrator",
      vendor: "None",
      job: "None",
      type: "Contracts",
      folder: "Customers",
      uploadedBy: loggedInUser?.name || "Staff Administrator",
      date: new Date().toISOString().split("T")[0],
      size: `${Math.max(1, Math.ceil(merged.length / 1024))} KB`,
      status: "Draft",
      isFavorite: false,
      isArchived: false,
      notes: `Compiled from ${customerEstimates.length} estimate(s), ${customerInvoices.length} invoice(s), ${customerJobs.length} job(s).`,
      tags: ["Compiled", "Customer Package"],
      estimateId: "None",
      invoiceId: "None",
      lastModified: new Date().toISOString().replace("T", " ").substring(0, 19)
    };
    // A merged PDF (multiple estimates/invoices/jobs) that would push this
    // Firestore document over the ~1 MiB cap fails the write silently (see
    // MAX_INLINE_BASE64_LENGTH) -- skip attaching the bytes rather than lose
    // the whole record, so it still shows up in Documents.
    if (pdfBase64.length <= MAX_INLINE_BASE64_LENGTH) {
      (newDoc as any).pdfBase64 = pdfBase64;
    } else {
      triggerNotification("This compiled PDF is too large to store inline -- the Documents record was saved, but regenerate it for a fresh copy since the file itself wasn't attached.");
    }
    setDocuments(prev => [...prev, newDoc]);
    setGeneratedPdfDraft({
      filename,
      title: "Compiled Customer Documents",
      sourceType: "Customer",
      sourceId: customer.id,
      customerName: customer.contact || customer.company,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      representativeName: loggedInUser?.name || "Company Representative",
      lines: [],
      pdfBase64
    });
    onNavigateToScreen("documents");
    if (logOperationalEvent) logOperationalEvent("Documents Compiled", `${filename} (${customerEstimates.length} estimates, ${customerInvoices.length} invoices, ${customerJobs.length} jobs)`, "📎");
  };

  useEffect(() => {
    if (!propCustomers) {
      localStorage.setItem("ownerslocal_customers", JSON.stringify(localCustomers));
    }
  }, [localCustomers, propCustomers]);

  // Modal & Details States
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  // Which summary tile's customer list is showing in the floating popup.
  const [activeInsightPopup, setActiveInsightPopup] = useState<"Total" | "Active" | "PastDue" | "Ltv" | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFileError, setImportFileError] = useState<string | null>(null);
  const [importPreviewList, setImportPreviewList] = useState<Customer[]>([]);

  // Cross-navigation: opening Customers from an estimate/invoice/job's
  // "Open Customer" link (or any other page) lands here with that
  // customer's card already selected.
  useEffect(() => {
    if (!preSelectedCustomerId) return;
    const match = customers.find(c => c.id === preSelectedCustomerId);
    if (match) setSelectedCustomer(match);
    setPreSelectedCustomerId(undefined);
  }, [preSelectedCustomerId, customers, setPreSelectedCustomerId]);

  const openCollectSignatures = (customer: Customer) => {
    setPendingSignatureCapture({ customerName: customer.contact || customer.company, customerPhone: customer.phone, customerEmail: customer.email });
    onNavigateToScreen("documents");
  };

  const handleExportCSV = () => {
    const headers = ["ID", "Company Name", "Contact Person", "Phone", "Email", "Address", "Open Jobs", "Outstanding Balance ($)", "Lifetime Value ($)", "Status", "Customer Type", "VIP Status"];
    
    const rows = customers.map(c => [
      c.id,
      c.company.replace(/"/g, '""'),
      c.contact.replace(/"/g, '""'),
      c.phone,
      c.email,
      c.address.replace(/"/g, '""'),
      c.openJobs,
      c.outstandingBalance,
      c.lifetimeValue,
      c.status,
      c.type,
      c.isVIP ? "Yes" : "No"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(fields => fields.map(val => {
        const strVal = String(val);
        if (strVal.includes(",") || strVal.includes('"') || strVal.includes("\n")) {
          return `"${strVal}"`;
        }
        return strVal;
      }).join(","))
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "ownerslocal_customer_database.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (logOperationalEvent) {
      logOperationalEvent("CSV Exported", `Exported ${customers.length} customer records to CSV file`, "📥");
    }
  };

  const handleImportCSVData = (text: string) => {
    try {
      const lines = text.split(/\r?\n/);
      if (lines.length <= 1) {
        setImportFileError("The file seems to be empty or contains no headers.");
        return;
      }

      const parsedList: Customer[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields: string[] = [];
        let cur = "";
        let inQuotes = false;
        for (let charIdx = 0; charIdx < line.length; charIdx++) {
          const char = line[charIdx];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            fields.push(cur.trim().replace(/^["']|["']$/g, ""));
            cur = "";
          } else {
            cur += char;
          }
        }
        fields.push(cur.trim().replace(/^["']|["']$/g, ""));

        let company = fields[0] || "";
        let contact = fields[1] || "";
        let phone = fields[2] || "";
        let email = fields[3] || "";
        let address = fields[4] || "";
        let typeStr = fields[5] || "Residential";
        let statusStr = fields[6] || "Active";
        let vipStr = fields[7] || "No";

        if (!contact && company) {
          contact = company;
        }
        if (!contact && !company) continue;

        const importedCustomer: Customer = {
          id: "cust_csv_" + Math.random().toString(36).substring(2, 9),
          company: company || contact,
          contact: contact || company,
          phone: phone || "",
          email: email || "",
          address: address || "No address supplied",
          openJobs: 0,
          outstandingBalance: 0,
          lifetimeValue: 0,
          status: (statusStr.toLowerCase().includes("past") || statusStr.toLowerCase().includes("due"))
            ? "Past Due"
            : statusStr.toLowerCase().includes("inactive")
            ? "Inactive"
            : "Active",
          type: (typeStr.toLowerCase().includes("commercial") || typeStr.toLowerCase().includes("comm"))
            ? "Commercial"
            : "Residential",
          isVIP: vipStr.toLowerCase() === "yes" || vipStr.toLowerCase() === "true" || vipStr.toLowerCase() === "y" || vipStr.toLowerCase() === "vip",
          recentlyAdded: true
        };
        parsedList.push(importedCustomer);
      }

      if (parsedList.length === 0) {
        setImportFileError("Could not extract any valid customer records. Please verify headers.");
      } else {
        setImportPreviewList(parsedList);
        setImportFileError(null);
      }
    } catch (err) {
      setImportFileError("Failed to parse the CSV file. Please check the file formatting.");
    }
  };

  const loadPresetImport = (presetName: string) => {
    let presetText = "";
    if (presetName === "hvac") {
      presetText = `Company Name,Contact Person,Phone,Email,Address,Customer Type,Status,VIP Status\n"Titan Air Conditioning","Ray Nelson","(555) 304-9811","ray@titanair.com","452 Industrial Parkway, Ste E","Commercial","Active","Yes"\n"Linda Geller Residential","Linda Geller","(555) 881-2356","linda.geller@gmail.com","128 Maple Lane","Residential","Active","No"\n"Metro Cold Storage Inc","Victor Stone","(555) 441-9022","vstone@metrocold.org","99 Waterfront Rd","Commercial","Past Due","No"`;
    } else {
      presetText = `Company Name,Contact Person,Phone,Email,Address,Customer Type,Status,VIP Status\n"Stark Remodeling","Howard Stark","(555) 902-1144","howard@starkremodel.com","10880 Malibu Point","Commercial","Active","Yes"\n"Green Acres Farms","Bruce Banner","(555) 234-9900","bruce@hulkscience.org","14 Outer Ridge Road","Residential","Active","No"`;
    }
    handleImportCSVData(presetText);
  };

  // Form states
  const [formCompany, setFormCompany] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formPhones, setFormPhones] = useState<string[]>([""]);
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCityState, setFormCityState] = useState("");
  const [formZip, setFormZip] = useState("");
  const [formType, setFormType] = useState<"Residential" | "Commercial">("Residential");
  const [formStatus, setFormStatus] = useState<"Active" | "Inactive" | "Past Due">("Active");
  const [formIsVIP, setFormIsVIP] = useState(false);

  const openAddModal = () => {
    setFormCompany("");
    setFormContact("");
    setFormPhones([""]);
    setFormEmail("");
    setFormAddress("");
    setFormCityState("");
    setFormZip("");
    setFormType("Residential");
    setFormStatus("Active");
    setFormIsVIP(false);
    setIsAddModalOpen(true);
  };

  const openEditModal = (cust: Customer) => {
    setSelectedCustomer(cust);
    setFormCompany(cust.company);
    setFormContact(cust.contact);
    
    // Parse phones
    const phones = (cust.phone || "").split(",").map(p => p.trim()).filter(Boolean);
    setFormPhones(phones.length > 0 ? phones : [""]);
    
    setFormEmail(cust.email);
    
    // Parse address
    const parts = (cust.address || "").split(",").map(s => s.trim());
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
    
    setFormType(cust.type);
    setFormStatus(cust.status);
    setFormIsVIP(cust.isVIP);
    setIsEditModalOpen(true);
  };

  // Builds a real PDF of the customer profile (contact info, account
  // summary, estimates/invoices on file) right now, saves it to the
  // Documents Hub, then opens the PDF Editor for review/signing.
  const generateCustomerPdf = async (cust: Customer) => {
    const customerEstimates = estimates.filter(item => [cust.id, cust.contact, cust.company].filter(Boolean).includes(item.customerName) || [cust.id, cust.contact, cust.company].filter(Boolean).includes(item.company));
    const customerInvoices = invoices.filter(item => [cust.id, cust.contact, cust.company].filter(Boolean).includes(item.customer));
    const bytes = await buildCustomerProfilePdf(cust, { estimates: customerEstimates, invoices: customerInvoices }, businessProfile);
    const pdfBase64 = bytesToBase64(bytes);
    const filename = `${(cust.company || cust.contact || "Customer").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`;
    const docId = `doc_customer_${cust.id}_${Date.now()}`;
    const newDoc: DocumentItem = {
      id: docId,
      name: filename,
      customer: cust.contact || cust.company,
      employee: loggedInUser?.name || "Staff Administrator",
      vendor: "None",
      job: "None",
      type: "Contracts",
      folder: "Customers",
      uploadedBy: loggedInUser?.name || "Staff Administrator",
      date: new Date().toISOString().split("T")[0],
      size: `${Math.max(1, Math.ceil(bytes.length / 1024))} KB`,
      status: "Draft",
      isFavorite: false,
      isArchived: false,
      notes: "Generated from the Customer PDF Editor.",
      tags: ["Customer", "Generated"],
      estimateId: "None",
      invoiceId: "None",
      lastModified: new Date().toISOString().replace("T", " ").substring(0, 19)
    };
    // A PDF that would push this Firestore document over the ~1 MiB cap
    // fails the write silently (see MAX_INLINE_BASE64_LENGTH) -- skip
    // attaching the bytes rather than lose the whole record, so it still
    // shows up in Documents even if it can't be re-opened inline later.
    if (pdfBase64.length <= MAX_INLINE_BASE64_LENGTH) {
      (newDoc as any).pdfBase64 = pdfBase64;
    } else {
      triggerNotification("This PDF is too large to store inline -- the Documents record was saved, but regenerate it for a fresh copy since the file itself wasn't attached.");
    }
    setDocuments(prev => [...prev, newDoc]);
    setGeneratedPdfDraft({
      filename,
      title: "Customer Record",
      sourceType: "Customer",
      sourceId: cust.id,
      customerName: cust.contact || cust.company,
      customerPhone: cust.phone,
      customerEmail: cust.email,
      representativeName: loggedInUser?.name || "Company Representative",
      lines: [],
      pdfBase64
    });
    onNavigateToScreen("documents");
    if (logOperationalEvent) logOperationalEvent("Customer PDF Generated", filename, "📄");
  };

  const handleAddCustomer = (openPdf = false) => {
    if (!formContact.trim()) return;
    if (!canCreateCustomer) {
      triggerNotification("You don't have permission to add customers.");
      return;
    }
    const phoneStr = formPhones.map(p => p.trim()).filter(Boolean).join(", ");
    const combinedAddress = [formAddress.trim(), formCityState.trim(), formZip.trim()].filter(Boolean).join(", ");

    const newCust: Customer = {
      id: "cust_" + Math.random().toString(36).substring(2, 9),
      company: formCompany.trim() || formContact.trim() + " Inc",
      contact: formContact.trim(),
      phone: phoneStr,
      email: formEmail.trim(),
      address: combinedAddress,
      openJobs: 0,
      outstandingBalance: 0,
      lifetimeValue: 0,
      status: formStatus,
      type: formType,
      isVIP: formIsVIP,
      recentlyAdded: true,
      upcomingJobDate: undefined,
      requireFollowUp: false
    };

    setCustomers(prev => [newCust, ...prev]);
    setIsAddModalOpen(false);

    if (logOperationalEvent) {
      logOperationalEvent("Customer Added", `New Customer '${newCust.contact}' registered`, "👤", { screen: "customers", customerId: newCust.id });
    }
    if (openPdf) void generateCustomerPdf(newCust);
  };

  const handleEditCustomer = (openPdf = false) => {
    if (!selectedCustomer) return;
    const phoneStr = formPhones.map(p => p.trim()).filter(Boolean).join(", ");
    const combinedAddress = [formAddress.trim(), formCityState.trim(), formZip.trim()].filter(Boolean).join(", ");
    const updated: Customer = {
      ...selectedCustomer,
      company: formCompany.trim() || formContact.trim() + " Inc",
      contact: formContact.trim(),
      phone: phoneStr,
      email: formEmail.trim(),
      address: combinedAddress,
      type: formType,
      status: formStatus,
      isVIP: formIsVIP,
      pendingConfirmation: false
    };

    setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? updated : c));
    setIsEditModalOpen(false);
    setSelectedCustomer(null);

    if (logOperationalEvent) {
      logOperationalEvent("Customer Updated", `Customer Profile for '${formContact}' updated`, "📝", { screen: "customers", customerId: updated.id });
    }
    if (openPdf) void generateCustomerPdf(updated);
  };

  const handleDeleteCustomer = () => {
    if (!selectedCustomer) return;
    if (!canDeleteCustomer) {
      triggerNotification("You don't have permission to delete customers.");
      setIsDeleteConfirmOpen(false);
      return;
    }
    setCustomers(prev => prev.filter(c => c.id !== selectedCustomer.id));
    setIsDeleteConfirmOpen(false);
    setSelectedCustomer(null);

    if (logOperationalEvent) {
      logOperationalEvent("Customer Deleted", `Customer '${selectedCustomer.contact}' profile removed`, "🗑️");
    }
  };

  // Filtered and searched customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter((cust) => {
      // Search logic (Name, Company, Phone, Email, Address)
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === "" ||
        cust.company.toLowerCase().includes(q) ||
        cust.contact.toLowerCase().includes(q) ||
        cust.phone.toLowerCase().includes(q) ||
        cust.email.toLowerCase().includes(q) ||
        cust.address.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // Filter logic
      switch (activeFilter) {
        case "Residential":
          return cust.type === "Residential";
        case "Commercial":
          return cust.type === "Commercial";
        case "Active":
          return cust.status === "Active";
        case "Inactive":
          return cust.status === "Inactive";
        case "Past Due":
          return cust.status === "Past Due";
        case "VIP":
          return cust.isVIP;
        case "Recently Added":
          return cust.recentlyAdded;
        default:
          return true;
      }
    });
  }, [customers, searchQuery, activeFilter]);

  // Metrics calculators
  const metrics = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => c.status === "Active").length;
    const pastDue = customers.filter((c) => c.status === "Past Due").length;
    const totalLtv = customers.reduce((acc, c) => acc + c.lifetimeValue, 0);

    return { total, active, pastDue, totalLtv };
  }, [customers]);

  // Which customers to list in the floating popup for each clickable
  // summary tile. Lifetime Value has no single matching status, so its
  // popup shows everyone ranked by LTV -- the customers that make up the
  // total shown on that tile.
  const insightPopupData = useMemo(() => {
    const configs: Record<NonNullable<typeof activeInsightPopup>, { title: string; customers: Customer[] }> = {
      Total: { title: "All Customers", customers },
      Active: { title: "Active Customers", customers: customers.filter((c) => c.status === "Active") },
      PastDue: { title: "Past Due Customers", customers: customers.filter((c) => c.status === "Past Due") },
      Ltv: { title: "Customers by Lifetime Value", customers: [...customers].sort((a, b) => b.lifetimeValue - a.lifetimeValue) }
    };
    return activeInsightPopup ? configs[activeInsightPopup] : null;
  }, [customers, activeInsightPopup]);

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {pendingCustomers.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black text-amber-900">Edit and confirm new customer</h3>
              <p className="mt-0.5 text-xs font-semibold text-amber-800">Added while creating or scheduling a job. Check the details, then save to confirm.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {pendingCustomers.map(customer => (
                  <button key={customer.id} onClick={() => openEditModal(customer)} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-left text-xs font-bold text-[#1F3557] shadow-sm hover:bg-amber-100">
                    {customer.contact || customer.company}<span className="ml-2 text-[9px] font-black uppercase text-amber-700">Review</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 1. TOP CARD */}
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-extrabold text-[#1F3557] tracking-tight uppercase">
              Customer Database
            </h2>
            <p className="text-xs text-[#5E7393] font-sans font-semibold mt-1">
              Complete operational log, filters, and client statistics hub
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {canCreateCustomer && (
              <button
                onClick={openAddModal}
                className="px-4 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white border border-[#9EC8EF] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Customer
              </button>
            )}
            <button
              onClick={() => {
                setImportFileError(null);
                setImportPreviewList([]);
                setIsImportModalOpen(true);
              }}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Customers
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export Customers
            </button>
            {onTakeSnapshot && (
              <button
                onClick={() => onTakeSnapshot("customers", "Customers", {
                  recordCount: filteredCustomers.length,
                  filters: activeFilter,
                  details: `Total listed customers: ${customers.length}. Total VIP clients: ${customers.filter(c => c.isVIP).length}. LTV total is $${metrics.totalLtv.toLocaleString()}.`
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
                onClick={() => onOpenAIAnalysis("customers", "Customers")}
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
              placeholder="Search customers..."
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
          </div>
        </div>
      </div>

      {/* 2. SUMMARY CARDS -- each opens a popup listing the customers it counts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1 */}
        <button
          type="button"
          onClick={() => setActiveInsightPopup("Total")}
          className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5 cursor-pointer transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF] flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Total Customers
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.total}
            </p>
          </div>
        </button>

        {/* CARD 2 */}
        <button
          type="button"
          onClick={() => setActiveInsightPopup("Active")}
          className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5 cursor-pointer transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-emerald-600 border border-[#9EC8EF] flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Active Customers
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.active}
            </p>
          </div>
        </button>

        {/* CARD 3 */}
        <button
          type="button"
          onClick={() => setActiveInsightPopup("PastDue")}
          className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5 cursor-pointer transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-rose-600 border border-[#9EC8EF] flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Past Due Customers
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.pastDue}
            </p>
          </div>
        </button>

        {/* CARD 4 */}
        <button
          type="button"
          onClick={() => setActiveInsightPopup("Ltv")}
          className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5 cursor-pointer transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF] flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Lifetime Value
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              ${metrics.totalLtv.toLocaleString()}
            </p>
          </div>
        </button>
      </div>

      {/* Grid containing QUICK ACTIONS + TABLE */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        <div className="space-y-4 lg:col-span-1">
          {/* QUICK ACTIONS CARD */}
          <div className="bg-[#C7E3FA] rounded-2xl p-4.5 border border-[#9EC8EF] shadow-sm">
            <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b border-[#9EC8EF]/40 pb-2">
              <Activity className="w-3.5 h-3.5 text-[#1F3557]" />
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
              <button
                onClick={() => onNavigateToScreen("estimates", { customerId: selectedCustomer?.id })}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <FileText className="w-3.5 h-3.5 text-[#1F3557]" />
                Create Estimate
              </button>
              <button
                onClick={() => {
                  if (onNavigateToScreen) {
                    onNavigateToScreen("scheduling", { customerId: selectedCustomer?.id });
                    if (logOperationalEvent) {
                      logOperationalEvent("Navigate", `Opened scheduling calendar for ${selectedCustomer ? selectedCustomer.company : "new booking"}`, "📅");
                    }
                  } else {
                    onOpenPlaceholder("scheduling", "📅");
                  }
                }}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <Calendar className="w-3.5 h-3.5 text-[#1F3557]" />
                Schedule Job
              </button>
              <button
                onClick={() => selectedCustomer && onNavigateToScreen("jobs", { customerId: selectedCustomer.id })}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <Briefcase className="w-3.5 h-3.5 text-[#1F3557]" />
                View Jobs
              </button>
              <button
                onClick={() => selectedCustomer && onNavigateToScreen("accounting", { customerId: selectedCustomer.id })}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <CreditCard className="w-3.5 h-3.5 text-[#1F3557]" />
                Create Invoice
              </button>
              <button
                onClick={() => selectedCustomer && onNavigateToScreen("messages", { customerId: selectedCustomer.id })}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <MessageSquare className="w-3.5 h-3.5 text-[#1F3557]" />
                Message Customer
              </button>
              <button
                onClick={() => selectedCustomer && void compileCustomerDocuments(selectedCustomer)}
                className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl text-[11px] font-bold text-emerald-800 text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <FileText className="w-3.5 h-3.5" /> Compile Documents
              </button>
              <button
                onClick={() => selectedCustomer && onNavigateToScreen("documents", { customerId: selectedCustomer.id })}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#1F3557]" />
                View Documents
              </button>
              <button
                onClick={() => selectedCustomer && openCollectSignatures(selectedCustomer)}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#1F3557]" />
                Collect Signatures
              </button>
            </div>
          </div>
        </div>

        {/* CUSTOMER TABLE */}
        <div className="lg:col-span-3 bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider">
              Customer List
            </h3>
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5E7393] pointer-events-none" />
              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)}
                className="pl-8 pr-3 py-2 bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] uppercase tracking-wider focus:outline-none focus:border-[#4A86F7] cursor-pointer appearance-none"
              >
                {(
                  [
                    "All",
                    "Residential",
                    "Commercial",
                    "Active",
                    "Inactive",
                    "Past Due",
                    "VIP",
                    "Recently Added"
                  ] as const
                ).map((filter) => (
                  <option key={filter} value={filter}>{filter}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-[#9EC8EF] text-[10px] font-extrabold uppercase text-[#1F3557] tracking-wider bg-[#EAF5FF]/30">
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Primary Contact</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Address</th>
                  <th className="py-3 px-4 text-center">Open Jobs</th>
                  <th className="py-3 px-4 text-right">Outstanding</th>
                  <th className="py-3 px-4 text-right">Lifetime Value</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#9EC8EF]/40">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-[#5E7393] text-xs font-semibold">
                      No matching customers found. Try altering your filter or search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => (
                    <tr
                      key={cust.id}
                      onClick={() => setSelectedCustomer(cust)}
                      className="hover:bg-[#BDDDF8]/70 transition-colors cursor-pointer text-xs"
                    >
                      <td className="py-3 px-4 font-bold text-[#1F3557]">
                        <span className="flex items-center gap-1.5">
                          {cust.company}
                          {cust.isVIP && (
                            <span className="px-1 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-extrabold uppercase rounded">
                              VIP
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#5E7393] font-medium">{cust.contact}</td>
                      <td className="py-3 px-4 font-mono text-[#5E7393]">{cust.phone}</td>
                      <td className="py-3 px-4 text-[#5E7393] truncate max-w-[120px]">{cust.email}</td>
                      <td className="py-3 px-4 text-[#5E7393] truncate max-w-[140px]">{cust.address}</td>
                      <td className="py-3 px-4 text-center font-bold text-[#1F3557] font-mono">{cust.openJobs}</td>
                      <td className={`py-3 px-4 text-right font-bold font-mono ${cust.outstandingBalance > 0 ? "text-rose-600" : "text-[#5E7393]"}`}>
                        ${cust.outstandingBalance.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-bold font-mono text-[#1F3557]">
                        ${cust.lifetimeValue.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            cust.status === "Active"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : cust.status === "Past Due"
                              ? "bg-rose-100 text-rose-800 border border-rose-200"
                              : "bg-gray-100 text-gray-800 border border-gray-200"
                          }`}
                        >
                          {cust.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Footer of the table card showing counter */}
          <div className="mt-4 pt-3 border-t border-[#9EC8EF]/40 flex justify-between items-center text-[10.5px] font-sans font-bold text-[#5E7393]">
            <span>
              Showing {filteredCustomers.length} of {customers.length} total customers
            </span>
            <span className="px-2 py-0.5 bg-[#EAF5FF] border border-[#9EC8EF]/60 rounded-lg text-[#1F3557]">
              Database Active
            </span>
          </div>
        </div>
        
      </div>

      {/* Summary tile popup -- lists the customers behind whichever tile was clicked */}
      {insightPopupData && (
        <div
          className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => setActiveInsightPopup(null)}
        >
          <div
            className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">
                {insightPopupData.title} ({insightPopupData.customers.length})
              </h3>
              <button
                onClick={() => setActiveInsightPopup(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-2">
              {insightPopupData.customers.length === 0 ? (
                <p className="text-xs text-[#5E7393] font-medium py-8 text-center">No customers in this group yet.</p>
              ) : (
                insightPopupData.customers.map((cust) => (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => {
                      setActiveInsightPopup(null);
                      setSelectedCustomer(cust);
                    }}
                    className="w-full text-left bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl px-4 py-3 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1F3557] flex items-center gap-1.5 truncate">
                        {cust.company || cust.contact}
                        {cust.isVIP && (
                          <span className="px-1 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-extrabold uppercase rounded shrink-0">VIP</span>
                        )}
                      </p>
                      <p className="text-[10.5px] text-[#5E7393] font-medium truncate">{cust.contact} · {cust.phone}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold font-mono text-[#1F3557]">${cust.lifetimeValue.toLocaleString()}</p>
                      <span
                        className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[8.5px] font-extrabold uppercase ${
                          cust.status === "Active"
                            ? "bg-emerald-100 text-emerald-800"
                            : cust.status === "Past Due"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {cust.status}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-white" />
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">Add New Customer</h3>
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
                    value={formContact}
                    onChange={e => setFormContact(e.target.value)}
                    placeholder="e.g. Jane Smith"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Company Name</label>
                  <input 
                    type="text" 
                    value={formCompany}
                    onChange={e => setFormCompany(e.target.value)}
                    placeholder="e.g. Riverside Apartments"
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
                        placeholder="e.g. (555) 234-5678"
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
                  placeholder="e.g. marcus@apexplumb.com"
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
                    placeholder="e.g. 1024 Industrial Pkwy, Ste B"
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
                      placeholder="e.g. Seattle, WA"
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Zip Code</label>
                    <input 
                      type="text" 
                      value={formZip}
                      onChange={e => setFormZip(e.target.value)}
                      placeholder="e.g. 98101"
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Customer Type</label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as any)}
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                  >
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Initial Status</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as any)}
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Past Due">Past Due</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox"
                  id="isVIPAdd"
                  checked={formIsVIP}
                  onChange={e => setFormIsVIP(e.target.checked)}
                  className="w-4 h-4 text-[#315C9F] bg-[#EAF5FF] border-[#9EC8EF] rounded focus:ring-blue-400 cursor-pointer"
                />
                <label htmlFor="isVIPAdd" className="text-xs font-bold text-[#1F3557] select-none cursor-pointer">
                  Mark as VIP Client
                </label>
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
                disabled={!formContact.trim()}
                onClick={() => handleAddCustomer(false)}
                className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                  formContact.trim() ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                }`}
              >
                Save Customer
              </button>
              <button
                type="button"
                disabled={!formContact.trim()}
                onClick={() => handleAddCustomer(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300 transition-colors cursor-pointer"
              >
                Generate PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Customers Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-white" />
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">CSV Customer Importer</h3>
              </div>
              <button 
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFileError(null);
                  setImportPreviewList([]);
                }}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-[#1F3557]">
              <div className="space-y-1">
                <h4 className="text-xs font-bold">Import Instructions:</h4>
                <p className="text-[11px] text-[#5E7393] leading-relaxed">
                  Upload a standard comma-separated values (CSV) file. The file should contain headers like 
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] mx-1 text-slate-800">Company Name</code>, 
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] mx-1 text-slate-800">Contact Person</code>, 
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] mx-1 text-slate-800">Phone</code>, 
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] mx-1 text-slate-800">Email</code>, and 
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] mx-1 text-slate-800">Address</code>.
                </p>
              </div>

              {/* Drag & Drop Zone */}
              <div className="relative border-2 border-dashed border-[#9EC8EF] hover:border-[#315C9F] bg-[#EAF5FF]/30 hover:bg-[#EAF5FF]/50 rounded-2xl p-6 transition-colors text-center cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        const text = evt.target?.result as string;
                        handleImportCSVData(text);
                      };
                      reader.readAsText(file);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-[#315C9F]" />
                  <p className="text-xs font-extrabold">Click to select or drag & drop a CSV file</p>
                  <p className="text-[10px] text-[#5E7393]">Supported files: .csv (Max 5MB)</p>
                </div>
              </div>

              {/* Preset Simulators */}
              <div className="bg-[#EAF5FF]/50 p-3 rounded-2xl border border-[#9EC8EF]/40 space-y-2 text-left">
                <span className="text-[10px] uppercase font-bold text-[#5E7393] block">No CSV on hand? Load instant test dataset:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => loadPresetImport("construction")}
                    className="px-3 py-1.5 bg-[#C7E3FA] hover:bg-[#BDDDF8] text-[#1F3557] text-[10.5px] font-bold rounded-xl transition-all border border-[#9EC8EF]/40 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-[#1F3557]" /> Stark Remodeling Preset (2 Leads)
                  </button>
                  <button
                    type="button"
                    onClick={() => loadPresetImport("hvac")}
                    className="px-3 py-1.5 bg-[#C7E3FA] hover:bg-[#BDDDF8] text-[#1F3557] text-[10.5px] font-bold rounded-xl transition-all border border-[#9EC8EF]/40 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-[#1F3557]" /> Ray Nelson HVAC Preset (3 Leads)
                  </button>
                </div>
              </div>

              {/* Error box */}
              {importFileError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl flex items-center gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="font-semibold">{importFileError}</span>
                </div>
              )}

              {/* Previews */}
              {importPreviewList.length > 0 && (
                <div className="space-y-2.5 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">
                      Previewing parsed customers ({importPreviewList.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() => setImportPreviewList([])}
                      className="text-[10.5px] font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      Clear Preview
                    </button>
                  </div>
                  
                  <div className="border border-[#9EC8EF]/40 rounded-xl overflow-hidden max-h-40 overflow-y-auto divide-y divide-[#9EC8EF]/20 bg-slate-50">
                    {importPreviewList.map((parsed, idx) => (
                      <div key={idx} className="p-2.5 text-[11px] flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-bold truncate">{parsed.company}</p>
                          <p className="text-[10px] text-[#5E7393] font-medium mt-0.5 truncate">Contact: {parsed.contact} | {parsed.email}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-[#1F3557] rounded font-bold uppercase">{parsed.type}</span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold uppercase">{parsed.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFileError(null);
                  setImportPreviewList([]);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importPreviewList.length === 0}
                onClick={() => {
                  setCustomers(prev => [...importPreviewList, ...prev]);
                  if (logOperationalEvent) {
                    logOperationalEvent("CSV Imported", `Imported ${importPreviewList.length} customer records into CRM database`, "📥");
                  }
                  setIsImportModalOpen(false);
                  setImportPreviewList([]);
                }}
                className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 ${
                  importPreviewList.length > 0 ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Confirm Import ({importPreviewList.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Details & Edit Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isEditModalOpen ? (
                  <Edit3 className="w-5 h-5 text-white" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">
                  {isEditModalOpen ? "Edit Customer Profile" : "Customer Details"}
                </h3>
              </div>
              <button 
                onClick={() => {
                  setSelectedCustomer(null);
                  setIsEditModalOpen(false);
                  setIsDeleteConfirmOpen(false);
                }}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isEditModalOpen ? (
              /* EDIT FORM MODE */
              <>
                <div className="p-6 overflow-y-auto space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1 col-span-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Contact Person *</label>
                      <input 
                        type="text" 
                        value={formContact}
                        onChange={e => setFormContact(e.target.value)}
                        placeholder="e.g. Jane Smith"
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                    
                    <div className="space-y-1 col-span-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Company Name</label>
                      <input 
                        type="text" 
                        value={formCompany}
                        onChange={e => setFormCompany(e.target.value)}
                        placeholder="e.g. Riverside Apartments"
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
                            placeholder="e.g. (555) 234-5678"
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
                      placeholder="e.g. marcus@apexplumb.com"
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
                        placeholder="e.g. 1024 Industrial Pkwy, Ste B"
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
                          placeholder="e.g. Seattle, WA"
                          className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-[#5E7393]">Zip Code</label>
                        <input 
                          type="text" 
                          value={formZip}
                          onChange={e => setFormZip(e.target.value)}
                          placeholder="e.g. 98101"
                          className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1 col-span-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Customer Type</label>
                      <select
                        value={formType}
                        onChange={e => setFormType(e.target.value as any)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                      >
                        <option value="Residential">Residential</option>
                        <option value="Commercial">Commercial</option>
                      </select>
                    </div>

                    <div className="space-y-1 col-span-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Initial Status</label>
                      <select
                        value={formStatus}
                        onChange={e => setFormStatus(e.target.value as any)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="Past Due">Past Due</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input 
                      type="checkbox"
                      id="isVIPEdit"
                      checked={formIsVIP}
                      onChange={e => setFormIsVIP(e.target.checked)}
                      className="w-4 h-4 text-[#315C9F] bg-[#EAF5FF] border-[#9EC8EF] rounded focus:ring-blue-400 cursor-pointer"
                    />
                    <label htmlFor="isVIPEdit" className="text-xs font-bold text-[#1F3557] select-none cursor-pointer">
                      Mark as VIP Client
                    </label>
                  </div>
                </div>

                <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!formContact.trim()}
                    onClick={() => handleEditCustomer(false)}
                    className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                      formContact.trim() ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                    }`}
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    disabled={!formContact.trim()}
                    onClick={() => handleEditCustomer(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300 transition-colors cursor-pointer"
                  >
                    Generate PDF
                  </button>
                </div>
              </>
            ) : isDeleteConfirmOpen ? (
              /* DELETE CONFIRM MODE */
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-3 text-rose-600">
                  <AlertTriangle className="w-8 h-8 text-rose-500 shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm text-[#1F3557]">Delete Customer Record?</h4>
                    <p className="text-xs text-rose-700/80 font-medium">This action cannot be undone and will permanently remove this customer's record.</p>
                  </div>
                </div>

                <p className="text-xs text-[#5E7393] font-semibold">
                  Are you sure you want to delete <span className="text-[#1F3557] font-bold">"{selectedCustomer.company}"</span> (Contact: {selectedCustomer.contact})?
                </p>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsDeleteConfirmOpen(false)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCustomer}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Permanently Delete
                  </button>
                </div>
              </div>
            ) : (
              /* VIEW DETAILS MODE */
              <>
                <div className="p-6 overflow-y-auto space-y-6 text-[#1F3557] text-left">
                  
                  {/* Profile Info */}
                  <div className="flex items-center gap-4 border-b border-[#9EC8EF]/30 pb-4">
                    <div className="w-14 h-14 rounded-2xl bg-[#C7E3FA] text-[#1F3557] border border-[#9EC8EF] flex items-center justify-center font-display text-xl font-black shrink-0 select-none">
                      {selectedCustomer.contact.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base font-extrabold tracking-tight flex items-center gap-1.5 flex-wrap">
                        <span>{selectedCustomer.company}</span>
                        {selectedCustomer.isVIP && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[8px] font-black uppercase rounded-lg border border-amber-200/50">
                            VIP Partner
                          </span>
                        )}
                      </h4>
                      <p className="text-xs font-semibold text-[#5E7393] mt-0.5">Primary Contact: {selectedCustomer.contact}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded-lg text-[8.5px] font-extrabold uppercase ${
                          selectedCustomer.status === "Active"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : selectedCustomer.status === "Past Due"
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : "bg-gray-100 text-gray-800 border border-gray-200"
                        }`}>
                          {selectedCustomer.status}
                        </span>
                        <span className="inline-block px-2 py-0.5 rounded-lg text-[8.5px] bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF] font-extrabold uppercase">
                          {selectedCustomer.type}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Contact Info -- tapping Call/Text/Email hands off to
                      this device's real phone, messaging, or mail app. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1.5 bg-[#EAF5FF]/40 p-3 rounded-2xl border border-[#9EC8EF]/30">
                      <span className="text-[9px] uppercase font-bold text-[#5E7393] block">Phone</span>
                      <span className="font-mono font-bold flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[#315C9F]" />
                        {selectedCustomer.phone || "—"}
                      </span>
                      {selectedCustomer.phone && (
                        <div className="flex gap-1.5 pt-0.5">
                          <button onClick={() => callNumber(selectedCustomer.phone)} className="flex-1 px-2 py-1 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-lg text-[9px] font-bold text-[#315C9F] uppercase cursor-pointer">Call</button>
                          <button onClick={() => composeSms({ to: selectedCustomer.phone })} className="flex-1 px-2 py-1 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-lg text-[9px] font-bold text-[#315C9F] uppercase cursor-pointer">Text</button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5 bg-[#EAF5FF]/40 p-3 rounded-2xl border border-[#9EC8EF]/30">
                      <span className="text-[9px] uppercase font-bold text-[#5E7393] block">Email</span>
                      <span className="font-semibold truncate block flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-[#315C9F]" />
                        {selectedCustomer.email || "—"}
                      </span>
                      {selectedCustomer.email && (
                        <button onClick={() => composeEmail({ to: selectedCustomer.email })} className="w-full px-2 py-1 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-lg text-[9px] font-bold text-[#315C9F] uppercase cursor-pointer">Email</button>
                      )}
                    </div>
                    {(() => {
                      const ap = parseAddress(selectedCustomer.address || "");
                      return (
                        <div className="sm:col-span-2 bg-[#EAF5FF]/40 p-3 rounded-2xl border border-[#9EC8EF]/30 space-y-2">
                          <span className="text-[9px] uppercase font-bold text-[#5E7393] flex items-center gap-1.5"><MapPin className="w-3 h-3 text-[#315C9F]"/>Billing / Service Address</span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div><span className="text-[9px] uppercase font-bold text-slate-400 block">Street</span><span className="text-xs font-semibold text-[#1F3557]">{ap.street || "—"}</span></div>
                            <div><span className="text-[9px] uppercase font-bold text-slate-400 block">City, State</span><span className="text-xs font-semibold text-[#1F3557]">{ap.cityState || "—"}</span></div>
                            <div><span className="text-[9px] uppercase font-bold text-slate-400 block">ZIP</span><span className="text-xs font-semibold text-[#1F3557]">{ap.zip || "—"}</span></div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                      <span className="text-[8px] uppercase font-bold text-[#5E7393] block">Open Jobs</span>
                      <span className="text-sm font-black font-mono block mt-1">{selectedCustomer.openJobs}</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                      <span className="text-[8px] uppercase font-bold text-[#5E7393] block">Outstanding</span>
                      <span className={`text-sm font-black font-mono block mt-1 ${selectedCustomer.outstandingBalance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        ${selectedCustomer.outstandingBalance.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                      <span className="text-[8px] uppercase font-bold text-[#5E7393] block">Lifetime Value</span>
                      <span className="text-sm font-black font-mono block mt-1">${selectedCustomer.lifetimeValue.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Action Shortcuts */}
                  <div className="space-y-2">
                    <span className="text-[9px] uppercase font-bold text-[#5E7393] block">Quick Actions</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          if (onNavigateToScreen) {
                            onNavigateToScreen("scheduling", { customerId: selectedCustomer.id });
                          } else {
                            onOpenPlaceholder("scheduling");
                          }
                          setSelectedCustomer(null);
                        }}
                        className="p-2.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-left text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <Calendar className="w-4 h-4 text-[#315C9F]" />
                        Schedule Job
                      </button>
                      <button
                        onClick={() => {
                          onNavigateToScreen("estimates", { customerId: selectedCustomer.id });
                          setSelectedCustomer(null);
                        }}
                        className="p-2.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-left text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <FileText className="w-4 h-4 text-[#315C9F]" />
                        Create Estimate
                      </button>
                    </div>
                    {onOpenAIAnalysis && (
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <button
                          onClick={() => onOpenAIAnalysis("customers", `AI Estimate — ${selectedCustomer.contact || selectedCustomer.company}`, `Draft a proposed estimate for ${selectedCustomer.company || selectedCustomer.contact} (${selectedCustomer.type}, address: ${selectedCustomer.address || "on file"}). Base pricing/scope on this business's real past estimates for similar customers when available.`)}
                          className="p-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-center text-[10px] font-bold rounded-xl flex flex-col items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          AI Estimate
                        </button>
                        <button
                          onClick={() => onOpenAIAnalysis("customers", `AI Invoice — ${selectedCustomer.contact || selectedCustomer.company}`, `Draft a proposed invoice for ${selectedCustomer.company || selectedCustomer.contact}, using this customer's real open jobs/estimates and outstanding balance ($${selectedCustomer.outstandingBalance.toLocaleString()}) on file.`)}
                          className="p-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-center text-[10px] font-bold rounded-xl flex flex-col items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          AI Invoice
                        </button>
                        <button
                          onClick={() => onOpenAIAnalysis("customers", `AI Job Planning — ${selectedCustomer.contact || selectedCustomer.company}`, `Draft a job plan (scope, sequence of tasks, estimated duration, materials to prep) for ${selectedCustomer.company || selectedCustomer.contact} based on this customer's real job/estimate history on file.`)}
                          className="p-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-center text-[10px] font-bold rounded-xl flex flex-col items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          AI Job Planning
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex justify-between items-center shrink-0">
                  {canDeleteCustomer && (
                    <button
                      type="button"
                      onClick={() => setIsDeleteConfirmOpen(true)}
                      className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 hover:text-rose-800 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Record
                    </button>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(selectedCustomer)}
                      className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(null)}
                      className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
