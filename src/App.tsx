import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useVisualViewportBottomRight } from "./hooks/useVisualViewportBottomRight";
import { db, auth } from "./firebase";
import { doc, setDoc, getDoc, getDocFromServer, writeBatch } from "firebase/firestore";
import { fullAccessGranular, defaultGranularFromModuleList, hasPermission, GranularPermissions } from "./types/permissions";
import { RevenueEvent, EmployeeRecord, TimeClockLog, Transaction } from "./types/domain";
import { Account, JournalEntry, Invoice, Bill, Vendor, BankAccount, RecurringTransaction, MileageLog, Budget, SalesTaxRate, DEFAULT_CHART_OF_ACCOUNTS, computeAccountBalance } from "./types/accounting";
import type { GeneratedPdfDraft, EstimatePrefill } from "./types/generatedPdf";
import { buildStyleGuidance } from "./lib/aiStyle";
import { postTransactionEntry, invoiceTotal } from "./lib/accountingEngine";
import { registerForPushNotifications } from "./lib/pushNotifications";
import { buildTextDocumentPdf, bytesToBase64 } from "./lib/pdfExport";
import { MAX_INLINE_BASE64_LENGTH } from "./lib/firestoreDocumentLimits";
import { downloadCsv } from "./lib/csv";
import { getRemoteSigningTokenFromUrl } from "./lib/remoteSigningClient";
import { updateLiveLocation } from "./lib/timeClockService";
import RemoteSigningPage from "./components/RemoteSigningPage";
import { TimeClockApprovalModal } from "./components/TimeClockApprovalModal";
import { RolePermissionEditorModal, MODULE_CATALOG } from "./components/RolePermissionEditorModal";
import { LogTransactionModal } from "./components/LogTransactionModal";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { 
  Mail, 
  Lock, 
  User, 
  UserPlus, 
  Eye, 
  EyeOff, 
  HelpCircle, 
  Shield, 
  Info, 
  CheckCircle, 
  AlertCircle,
  LogOut,
  ChevronRight,
  Sparkles,
  ExternalLink,
  Laptop,
  Check,
  RotateCcw,
  ArrowLeft,
  ChevronDown,
  Plus,
  Minus,
  Copy,
  Users,
  Settings,
  ShieldAlert,
  Edit,
  Trash2,
  CopyIcon,
  CheckSquare,
  // New icons for sidebar and dashboard
  LayoutDashboard,
  Target,
  FileText,
  Calendar,
  Truck,
  MapPin,
  Briefcase,
  Clock,
  Package,
  FolderOpen,
  MessageSquare,
  GraduationCap,
  Link,
  ChevronLeft,
  Moon,
  Sun,
  Maximize2,
  Minimize2,
  RefreshCw,
  Megaphone,
  Trophy,
  Flame,
  UserCheck,
  Compass,
  PlusCircle,
  Wrench,
  Bell,
  BellRing,
  Menu,
  Sliders,
  PhoneMissed
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ComposedChart } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Search, Filter, Landmark, Box, CreditCard, Camera, Star } from "lucide-react";

import { CustomersPage, Customer, INITIAL_CUSTOMERS } from "./components/CustomersPage";
import { LeadsPage, INITIAL_LEADS, Lead } from "./components/LeadsPage";
import { SnapshotsPage } from "./components/SnapshotsPage";
import { UniversalAIIntake } from "./components/UniversalAIIntake";
import { EstimatesPage, INITIAL_ESTIMATES, Estimate } from "./components/EstimatesPage";
import { SchedulingPage, SchedulingEvent } from "./components/SchedulingPage";
import { DispatchPage } from "./components/DispatchPage";
import { JobsPage } from "./components/JobsPage";
import { TimeClockPage } from "./components/TimeClockPage";
import { InventoryPage, INITIAL_INVENTORY, InventoryItem } from "./components/InventoryPage";
import { InteractiveMapPage } from "./components/InteractiveMapPage";
import { DocumentsPage, DocumentItem } from "./components/DocumentsPage";
import { AccountingPage } from "./components/AccountingPage";
import { PlaidConnectButton } from "./components/PlaidConnectButton";
import { RosterPage } from "./components/RosterPage";
import { MessagesPage } from "./components/MessagesPage";
import { TrainingPage } from "./components/TrainingPage";
import { AIAssistantPage } from "./components/AIAssistantPage";
import SettingsPage from "./components/SettingsPage";
import { StructuredAddressFields } from "./components/StructuredAddressFields";
import { IntegrationsPage } from "./components/IntegrationsPage";
import { NotificationsPage } from "./components/NotificationsPage";
import { MissedCallTextBackPage } from "./components/MissedCallTextBackPage";
import { OwnerConsolePage } from "./components/OwnerConsolePage";
import {
  INITIAL_DASHBOARD_LEADS,
  INITIAL_RECENT_ROSTER,
  INITIAL_DOCUMENTS,
  INITIAL_SCHEDULING_EVENTS,
  INITIAL_RECENT_AI_ACTIONS,
  INITIAL_SNAPSHOTS
} from "./initialData";
import { validateConnection } from "./lib/firestoreService";
import { onSyncError } from "./lib/syncErrorBus";
import { useFirestoreCollection } from "./hooks/useFirestoreCollection";
import { AuthContext, AuthContextValue } from "./context/AuthContext";
import { DomainDataContext, DomainDataContextValue } from "./context/DomainDataContext";
import { NavTelemetryContext, NavTelemetryContextValue } from "./context/NavTelemetryContext";
import { useEventEngineSubscribers } from "./hooks/useEventEngineSubscribers";
import darkLoginBackground from "../Src/Assets/Login/Darkloginbg.png";
import darkLoginCard from "../Src/Assets/Login/Darkmodecard.png";
import lightLoginCard from "../Src/Assets/Login/Lightmodecard.png";
import lightLoginBackground from "../Src/Assets/Login/Lightloginbg.png";

type PrivacyPolicySection = { heading: string; paragraphs: string[] };

const OWNERS_LOCAL_PRIVACY_POLICY: PrivacyPolicySection[] = [
  {
    heading: "Owner'sLOCAL Privacy Policy",
    paragraphs: [
      "Effective Date: August 28, 2026",
      "This Privacy Policy explains how Owner'sLOCAL, operated by Stuffapp (collectively, \"Owner'sLOCAL,\" \"we,\" \"us,\" or \"our\"), handles information when you visit ownerslocal.com or use the Owner'sLOCAL website, web application, mobile application, demo, or related services (collectively, the \"Service\")."
    ]
  },
  {
    heading: "1. Our Commitment",
    paragraphs: [
      "Your business data is not our product. We do not sell or rent your personal information or business data, and we do not use it for unrelated advertising. The founder does not routinely open, read, or review customers' sensitive information. Access may occur only when reasonably necessary to provide support you request, investigate fraud or security problems, maintain or repair the Service, enforce our agreements, or comply with law.",
      "Owner'sLOCAL is an independently conceived, developed, and privately funded Texas business platform created by Matthew through Stuffapp. Its design is informed by direct experience owning and operating local service businesses and working in tile installation, lawn maintenance, landscaping, remodeling, contracting, construction-related trades, field operations, customer service, and business management.",
      "That experience shaped Owner'sLOCAL as a practical operating system for small and locally owned service companies rather than a collection of disconnected, single-purpose tools. The Service is designed to connect leads and customer records with estimates, accepted jobs, scheduling, dispatch, routes and maps, job progress, invoices and payments, revenue, bills and expenses, accounting and banking functions, inventory, documents and electronic signatures, employee onboarding, training, roles and permissions, timekeeping, payroll calculations, team communications, reports, AI-assisted data entry, integrations, and missed-call text-back where supported.",
      "Owner'sLOCAL exists to help working owners and their teams manage operations through one coordinated system while retaining control of their business information. Consistent with that purpose, personal information and business data are processed only to operate, secure, support, and improve the Service—not to create a separate data-selling business.",
      "The founder of Owner'sLOCAL believes that independent workers, family-owned companies, and small and middle-class businesses deserve technology that serves them—not technology that studies, exploits, or controls them. Owner'sLOCAL stands with the individual against unnecessary surveillance, invasive data collection, and the concentration of information and power in the hands of large technology companies.",
      "The platform is built on a straightforward principle: business owners should remain in control of their operations, their customer relationships, and their information. Customer data will never be treated as a product for sale, and technology should help local businesses become stronger and more independent—not make them dependent on the companies providing it."
    ]
  },
  {
    heading: "2. Information Processed Through the Service",
    paragraphs: [
      "Depending on how you use the Service, the following categories may be processed:",
      "• Account and login information: Name, email address, phone number, account identifier, authentication records, device information, IP address, and login or security events.",
      "• Business and app data: Company details; customer, lead, estimate, job, schedule, invoice, inventory, document, employee, time-clock, payroll-calculation, message, and other information you choose to enter or upload.",
      "• Payment and transaction information: Subscription status, amount, date, payment status, refunds, disputes, and limited payment identifiers. Full card or bank credentials are collected and processed by Stripe, not stored directly by Owner'sLOCAL.",
      "• Technical and usage information: Browser or device type, operating system, diagnostic logs, crash information, feature interactions, approximate location derived from an IP address, and cookies or similar technologies necessary to operate and secure the Service.",
      "• Support communications: Information you provide when requesting help, reporting an error, or contacting us.",
      "Do not submit Social Security numbers, complete bank credentials, protected health information, or other highly sensitive information unless a feature clearly requires it and the Service expressly indicates that it is supported."
    ]
  },
  {
    heading: "3. Stripe Handles Payment Information",
    paragraphs: [
      "Stripe provides our payment-processing infrastructure. When you enter payment information, Stripe collects and processes that information under Stripe's own terms and privacy practices.",
      "Stripe may process card or bank details, billing information, transaction information, device and network information, fraud signals, refunds, and disputes.",
      "Owner'sLOCAL receives only the payment and account information reasonably needed to confirm access, maintain billing records, provide support, and address refunds or disputes. We do not directly store your full payment-card number, security code, or online-banking credentials.",
      "Stripe's privacy policy is available at: https://stripe.com/privacy"
    ]
  },
  {
    heading: "4. Firebase Handles Login Information and App Data",
    paragraphs: [
      "Google Firebase provides infrastructure used for authentication and storage or processing of app data.",
      "Firebase Authentication processes login and account information and may process IP addresses, device or browser information, and security events. Firebase services also store or process the business and app data you submit so the Service can function.",
      "Google processes this information under its Firebase terms, data-processing terms, and privacy and security practices.",
      "Firebase privacy and security information is available at: https://firebase.google.com/support/privacy"
    ]
  },
  {
    heading: "5. How Information Is Used",
    paragraphs: [
      "Information is processed only as reasonably necessary to:",
      "• Create, authenticate, and secure accounts.",
      "• Provide and maintain the Service and requested features.",
      "• Save, synchronize, display, and organize app data.",
      "• Process payments, confirm subscriptions, and address billing errors, refunds, fraud, chargebacks, or disputes.",
      "• Provide customer support and respond to requests.",
      "• Diagnose errors, prevent abuse, improve reliability, and protect users and the Service.",
      "• Communicate operational, security, billing, or material policy updates.",
      "• Comply with law, court orders, or valid governmental requests and protect legal rights."
    ]
  },
  {
    heading: "6. When Information May Be Disclosed",
    paragraphs: [
      "We do not sell personal information or business data.",
      "Information may be disclosed only:",
      "• To service providers that help operate the Service, including Stripe, Google/Firebase, hosting, email, analytics, security, and support providers, subject to their applicable agreements.",
      "• At your direction or with your consent, including when you invite employees or share information through the Service.",
      "• When required by law or valid legal process.",
      "• When reasonably necessary to investigate fraud, abuse, security incidents, or threats to rights or safety.",
      "• As part of a merger, financing, acquisition, reorganization, bankruptcy, or sale of assets, subject to appropriate confidentiality and any notice required by law."
    ]
  },
  {
    heading: "7. Data Retention",
    paragraphs: [
      "We retain information only as long as reasonably necessary to provide the Service, maintain legitimate business and security records, resolve disputes, enforce agreements, and comply with legal, tax, accounting, or payment obligations.",
      "Stripe and Google/Firebase maintain information according to their own retention practices. Backup copies and transaction or security records may remain for a limited period after account deletion."
    ]
  },
  {
    heading: "8. Security",
    paragraphs: [
      "We use reasonable administrative, technical, and organizational safeguards appropriate to the nature of the information processed.",
      "Payment data is handled through Stripe, and account and app data are handled through Firebase.",
      "No online system is completely secure, and we cannot guarantee absolute security. You are responsible for using a strong, unique password, protecting your devices, and limiting account access to authorized users."
    ]
  },
  {
    heading: "9. Your Choices and Rights",
    paragraphs: [
      "You may review or update certain information in your account.",
      "You may request access, correction, deletion, or a copy of personal information by contacting The.Owner@ownerslocal.com.",
      "We may need to verify your identity and may retain information where required or permitted by law.",
      "Depending on where you live, you may have additional privacy rights, including the right to appeal a denied privacy request. We will not discriminate against you for exercising a legally protected privacy right.",
      "You may control optional device permissions through your device settings. Disabling a permission may prevent the related feature from working."
    ]
  },
  {
    heading: "10. Children",
    paragraphs: [
      "The Service is intended for business users age 18 or older and is not directed to children under 13.",
      "We do not knowingly collect personal information directly from children under 13. Contact us if you believe a child provided information to the Service without appropriate authorization."
    ]
  },
  {
    heading: "11. Third-Party Links and Services",
    paragraphs: [
      "The Service may link to or integrate with third-party products.",
      "Their privacy practices are governed by their own policies, and Owner'sLOCAL is not responsible for their independent practices."
    ]
  },
  {
    heading: "12. Changes to This Policy",
    paragraphs: [
      "We may update this Privacy Policy as the Service changes.",
      "We will post the revised policy with a new effective date and provide any additional notice required by law.",
      "Continued use after the effective date of a revision means the revised policy applies, to the extent permitted by law."
    ]
  },
  {
    heading: "13. Contact",
    paragraphs: [
      "For privacy questions or requests, contact:",
      "Owner'sLOCAL / Stuffapp",
      "Email: The.Owner@ownerslocal.com",
      "Dallas–Fort Worth, Texas, United States"
    ]
  }
];

const OWNERS_LOCAL_USER_AGREEMENT: PrivacyPolicySection[] = [
  {
    heading: "Owner'sLOCAL User Agreement",
    paragraphs: [
      "Effective Date: August 28, 2026",
      "This User Agreement (\"Agreement\") is a binding contract between you and Owner'sLOCAL, operated by Stuffapp (\"Owner'sLOCAL,\" \"we,\" \"us,\" or \"our\").",
      "It governs your access to and use of ownerslocal.com and the Owner'sLOCAL website, web application, mobile application, demo, downloads, and related services (collectively, the \"Service\").",
      "BY CREATING AN ACCOUNT, PURCHASING ACCESS, DOWNLOADING OR INSTALLING AN APPLICATION, OR USING THE SERVICE, YOU AGREE TO THIS AGREEMENT AND THE PRIVACY POLICY.",
      "IF YOU DO NOT AGREE, DO NOT PURCHASE OR USE THE SERVICE.",
      "YOU MUST BE AT LEAST 18 YEARS OLD AND LEGALLY ABLE TO ENTER A CONTRACT."
    ]
  },
  {
    heading: "1. Owner'sLOCAL, Its Purpose, and the Scope of the Service",
    paragraphs: [
      "Owner'sLOCAL is an independently created and privately funded Texas software platform developed by Matthew through Stuffapp.",
      "The platform is based on practical experience owning, operating, and working within local service businesses, including tile installation, lawn maintenance, landscaping, remodeling, contracting, construction-related work, field-service operations, customer service, and business management.",
      "It was developed to give small-business owners and authorized employees a unified way to manage business operations that would otherwise require multiple unrelated products, subscriptions, accounts, and data systems.",
      "The Service may include:",
      "• Customer-relationship and lead management.",
      "• Estimates and bids.",
      "• Conversion of accepted work into customers and jobs.",
      "• Scheduling and dispatch.",
      "• Route planning and maps.",
      "• Location-based functions.",
      "• Customer and job-progress tools.",
      "• Invoices and payments.",
      "• Revenue tracking.",
      "• Bills, material expenses, and service expenses.",
      "• Accounting records.",
      "• Banking connections or imports.",
      "• Financial reports and graphs.",
      "• Inventory.",
      "• Document creation and PDF tools.",
      "• Electronic signatures and signer-verification features.",
      "• Employee invitations and onboarding.",
      "• Training.",
      "• Roles and permissions.",
      "• Timekeeping and payroll calculations.",
      "• Team messaging.",
      "• Dashboards and reports.",
      "• AI-assisted intake and Snapshot data extraction.",
      "• Integrations.",
      "• Missed-call text-back for supported Android or VoIP numbers.",
      "Available functions may differ by version, subscription, device, operating system, telephone service, integration status, or development stage.",
      "A feature description does not guarantee that every feature is available in every version or at all times.",
      "Owner'sLOCAL is intended to support landscapers, lawn-care businesses, house-cleaning companies, contractors, remodelers, and other local or field-service businesses.",
      "Owner'sLOCAL is a software tool. It is not a partner, employer, payroll provider, bank, accountant, attorney, insurer, licensed trade professional, telecommunications carrier, or guarantor of a user's business results.",
      "Its independent origin and continuing development do not reduce any nonwaivable legal right, but users acknowledge that the Service may be revised, expanded, repaired, or refined as the privately developed platform grows."
    ]
  },
  {
    heading: "2. Account Access and Responsibility",
    paragraphs: [
      "You must provide accurate account and billing information and keep it current.",
      "You are responsible for protecting your credentials and devices, assigning appropriate employee permissions, and all activity occurring through your account unless caused by our breach of this Agreement.",
      "Notify us promptly of suspected unauthorized access.",
      "You may use the Service only for lawful business purposes.",
      "You may not:",
      "• Misuse the Service.",
      "• Interfere with its operation.",
      "• Bypass access or payment controls.",
      "• Introduce malicious code.",
      "• Scrape or reverse engineer the Service except where applicable law expressly permits it.",
      "• Access another customer's information without authorization.",
      "• Use the Service to violate another person's rights."
    ]
  },
  {
    heading: "3. Your Data and Legal Responsibilities",
    paragraphs: [
      "You retain ownership of information and content you submit through the Service (\"Your Data\").",
      "You grant us and our service providers a limited, nonexclusive license to host, process, transmit, back up, and display Your Data only as reasonably necessary to provide, secure, support, and improve the Service, comply with law, and enforce this Agreement.",
      "You represent that you have the rights and legally required notices, permissions, and consents to enter and process Your Data, including customer and employee information.",
      "You are responsible for your:",
      "• Business records.",
      "• Employment practices.",
      "• Payroll decisions.",
      "• Taxes.",
      "• Estimates.",
      "• Contracts.",
      "• Invoices.",
      "• Signatures.",
      "• Routes.",
      "• Safety procedures.",
      "• Permits.",
      "• Licenses.",
      "• Insurance.",
      "• Legal compliance.",
      "The Service is a business tool and is not legal, tax, accounting, payroll, employment, financial, or other professional advice."
    ]
  },
  {
    heading: "4. Third-Party Services",
    paragraphs: [
      "Stripe handles payment processing and related financial transaction records.",
      "Google Firebase handles authentication and app-data infrastructure.",
      "Other third-party services and integrations may be offered.",
      "Third-party services are governed by their own terms and may experience independent outages, changes, or errors.",
      "We are not responsible for third-party products or events outside our reasonable control, except to the extent liability cannot legally be excluded."
    ]
  },
  {
    heading: "5. Prices, Subscriptions, and Authorization",
    paragraphs: [
      "Prices, billing periods, included features, and taxes are shown at checkout or in the applicable offer.",
      "By submitting a payment method, you authorize Stripe and Owner'sLOCAL to charge the disclosed amount, including recurring charges if the checkout page clearly identifies a subscription.",
      "You are responsible for canceling a recurring subscription before the next renewal date through the method provided in the Service or by contacting support.",
      "Cancellation stops future renewals but does not retroactively refund prior charges."
    ]
  },
  {
    heading: "6. Refund Policy—Transactions Generally Final",
    paragraphs: [
      "EXCEPT WHERE A REFUND IS REQUIRED BY LAW OR EXPRESSLY STATED BELOW, ALL TRANSACTIONS ARE FINAL.",
      "Purchasing access causes digital services, account access, infrastructure, and payment-processing obligations to be provided or incurred immediately.",
      "For that reason, we cannot issue refunds merely because a user:",
      "• Changes their mind.",
      "• Decides they do not like the Service.",
      "• No longer needs the Service.",
      "• Expected an unadvertised feature.",
      "• Failed to cancel before renewal.",
      "• Did not fully use the available features.",
      "A refund may be considered in the following limited situations:",
      "A. Completely Inoperable Service — If a verified defect makes the purchased Service completely inoperable for you and we cannot restore materially usable access within a reasonable time after you report it and cooperate with reasonable troubleshooting, we may provide a full or proportional refund as required by law or determined appropriate under the circumstances.",
      "B. Accidental Purchase With No Use — If you accidentally purchase access and never log in to or use the purchased Service, contact us promptly. We will review the request and may issue a refund in our discretion after confirming that the account was not accessed or used. This is not a guaranteed refund.",
      "C. Duplicate Charge or Payment Error — We will investigate verified duplicate charges, incorrect amounts, or other payment-processing errors and correct them when confirmed.",
      "To request help with a payment error or refund, email The.Owner@ownerslocal.com with: the email address associated with the account, the transaction date, the transaction amount, and a brief explanation of the problem.",
      "Do not email full payment-card or bank-account numbers.",
      "Nothing in this policy limits refund or cancellation rights that cannot legally be waived."
    ]
  },
  {
    heading: "7. Beta Features, Changes, and Availability",
    paragraphs: [
      "The Service may contain beta, preview, experimental, or developing features.",
      "We may add, change, suspend, or discontinue features, integrations, or supported devices.",
      "We do not promise uninterrupted or error-free operation or that every feature will always remain available.",
      "We will not materially reduce prepaid access without providing a reasonable substitute, account credit, proportional refund, or other remedy where required by law."
    ]
  },
  {
    heading: "8. Electronic Signatures and Records",
    paragraphs: [
      "If the Service offers electronic-signature or document features, you are responsible for:",
      "• Deciding whether the feature is appropriate for a particular transaction.",
      "• Obtaining signer consent.",
      "• Verifying signer identity.",
      "• Preserving final records.",
      "• Complying with applicable law.",
      "We do not guarantee that any document or signature will be enforceable in every jurisdiction or circumstance.",
      "Download and retain copies of important final documents."
    ]
  },
  {
    heading: "9. Suspension and Termination",
    paragraphs: [
      "We may suspend or terminate access when reasonably necessary to address:",
      "• Nonpayment.",
      "• Fraud.",
      "• Security risks.",
      "• Unlawful conduct.",
      "• Abuse.",
      "• A material breach of this Agreement.",
      "• Threats to the Service or others.",
      "When practical, we will provide notice and an opportunity to cure.",
      "You may stop using the Service at any time.",
      "Sections that by their nature should survive—including payment obligations, ownership, disclaimers, liability limits, indemnity, and dispute terms—survive termination."
    ]
  },
  {
    heading: "10. Intellectual Property",
    paragraphs: [
      "The Service, software, designs, branding, workflows, documentation, and other materials provided by us are owned by Owner'sLOCAL, Stuffapp, or their licensors and are protected by law.",
      "This Agreement gives you a limited, revocable, nontransferable right to use the Service for your internal lawful business operations during your authorized access.",
      "It does not transfer ownership or permit resale, copying, or creation of a competing derivative service."
    ]
  },
  {
    heading: "11. Disclaimer of Warranties",
    paragraphs: [
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED \"AS IS\" AND \"AS AVAILABLE.\"",
      "OWNER'SLOCAL DISCLAIMS ALL EXPRESS OR IMPLIED WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, RELIABILITY, AND RESULTS.",
      "WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, COMPLETELY SECURE, OR SUITABLE FOR EVERY BUSINESS.",
      "Some jurisdictions do not allow certain warranty exclusions, so some exclusions may not apply to you."
    ]
  },
  {
    heading: "12. Limitation of Liability",
    paragraphs: [
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW, OWNER'SLOCAL, STUFFAPP, THE FOUNDER, AND THEIR AFFILIATES, CONTRACTORS, AND SERVICE PROVIDERS WILL NOT BE LIABLE FOR: INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, PUNITIVE, OR CONSEQUENTIAL DAMAGES; LOST PROFITS, REVENUE, BUSINESS, GOODWILL, OR DATA; BUSINESS INTERRUPTION; OR THE COST OF SUBSTITUTE SERVICES.",
      "This limitation applies to damages arising from or related to the Service or this Agreement, even if we were advised that such damages were possible.",
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW, THEIR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING FROM OR RELATED TO THE SERVICE OR THIS AGREEMENT WILL NOT EXCEED THE GREATER OF: (A) THE AMOUNT YOU PAID OWNER'SLOCAL FOR THE SERVICE DURING THE SIX MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM; OR (B) $100.",
      "These limits do not apply to liability that cannot legally be limited, and they apply regardless of the legal theory asserted."
    ]
  },
  {
    heading: "13. Indemnification",
    paragraphs: [
      "To the maximum extent permitted by law, you agree to defend, indemnify, and hold harmless Owner'sLOCAL, Stuffapp, the founder, and their affiliates and contractors from third-party claims, damages, penalties, and reasonable costs arising from:",
      "• Your Data.",
      "• Your misuse of the Service.",
      "• Your violation of law or another person's rights.",
      "• Your customer or employment relationships.",
      "• Your material breach of this Agreement.",
      "This obligation does not apply to the extent a claim was caused by our own negligence, willful misconduct, or violation of law."
    ]
  },
  {
    heading: "14. Dispute Resolution and Individual Arbitration",
    paragraphs: [
      "Please contact The.Owner@ownerslocal.com first and provide a description of the dispute and requested resolution.",
      "The parties agree to attempt in good faith to resolve the dispute informally for 30 days after written notice.",
      "If the dispute is not resolved, either party may bring an individual claim in a court that qualifies as small-claims court.",
      "Any other dispute arising from or relating to this Agreement or the Service will be resolved by binding individual arbitration under the Federal Arbitration Act and the Consumer Arbitration Rules of the American Arbitration Association (\"AAA\"), unless applicable law prohibits arbitration.",
      "Arbitration may occur by video, telephone, written submissions, or in person in the Texas county where you reside, unless the parties agree otherwise.",
      "Owner'sLOCAL will pay arbitration fees to the extent required by the AAA rules or applicable law.",
      "NO CLASS ACTIONS OR JURY TRIALS",
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW, YOU AND OWNER'SLOCAL WAIVE THE RIGHT TO A JURY TRIAL AND AGREE TO BRING CLAIMS ONLY IN AN INDIVIDUAL CAPACITY.",
      "CLAIMS MAY NOT BE BROUGHT AS A PLAINTIFF OR CLASS MEMBER IN A CLASS, CONSOLIDATED, COLLECTIVE, OR REPRESENTATIVE ACTION.",
      "You may opt out of arbitration by emailing The.Owner@ownerslocal.com within 30 days after first accepting this Agreement.",
      "Your opt-out notice must include: your name, your account email address, and an unambiguous statement that you opt out of arbitration.",
      "Opting out will not affect your account.",
      "If the arbitration or class-waiver provision is found unenforceable for a particular claim, that claim may proceed in a court of competent jurisdiction, and the remaining provisions remain effective."
    ]
  },
  {
    heading: "15. Texas Law",
    paragraphs: [
      "This Agreement is governed by the laws of the State of Texas, without regard to conflict-of-law rules, except that the Federal Arbitration Act governs the arbitration provision.",
      "For any dispute permitted to proceed in court, the parties consent to the state or federal courts serving the Texas county in which Owner'sLOCAL has its principal place of business, unless applicable consumer law requires another location."
    ]
  },
  {
    heading: "16. Changes to This Agreement",
    paragraphs: [
      "We may update this Agreement to reflect Service, legal, or operational changes.",
      "We will post the revised version and provide additional notice of material changes where required.",
      "Changes apply prospectively from their effective date.",
      "Continued use after that date constitutes acceptance to the extent permitted by law."
    ]
  },
  {
    heading: "17. General Terms",
    paragraphs: [
      "This Agreement and the Privacy Policy are the entire agreement concerning the Service unless a separate signed agreement applies.",
      "If part of this Agreement is unenforceable, it will be enforced to the maximum lawful extent and the remainder will continue.",
      "Our failure to enforce a provision is not a waiver.",
      "You may not transfer this Agreement without our written consent.",
      "We may transfer it as part of a merger, reorganization, financing, sale, or transfer of the Service.",
      "Headings are for convenience only."
    ]
  },
  {
    heading: "18. Contact",
    paragraphs: [
      "For account help, payment errors, or refund requests, contact:",
      "Owner'sLOCAL / Stuffapp",
      "Email: The.Owner@ownerslocal.com",
      "Dallas–Fort Worth, Texas, United States"
    ]
  }
];

const validPersonName = (value: unknown): string => {
  const name = typeof value === "string" ? value.trim() : "";
  return name && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name) ? name : "";
};

export type WorkspaceTheme = "light-basic" | "light-extreme" | "dark-basic" | "dark-dynamic";

const workspaceThemeFromSetting = (value?: string): WorkspaceTheme => {
  // "Light Mode Dynamic" was previously labeled "Light Mode Extreme" --
  // accept the old saved string so existing businesses don't get bumped
  // back to Light Mode Basic after the rename.
  if (value === "Light Mode Dynamic" || value === "Light Mode Extreme") return "light-extreme";
  if (value === "Dark Mode Dynamic") return "dark-dynamic";
  if (value === "Dark Mode Basic" || value === "Basic Dark") return "dark-basic";
  return "light-basic";
};

const workspaceThemeSettingValue = (theme: WorkspaceTheme): string => {
  if (theme === "light-extreme") return "Light Mode Dynamic";
  if (theme === "dark-dynamic") return "Dark Mode Dynamic";
  if (theme === "dark-basic") return "Dark Mode Basic";
  return "Light Mode Basic";
};

// Exact fingerprints of demo records used by the original prototype. Older
// accounts may still have these rows in Firestore even though the seed arrays
// are now empty. Matching record content protects legitimate user data.
const LEGACY_INVENTORY_FINGERPRINTS = new Set([
  "2x4 Stud Spruce-Pine-Fir|SPF-248-KD",
  "DeWalt DCD771C2 Hammer Drill|DEW-DCD771",
  "Copper Pipe Type L 3/4in x 10ft|COP-34-10",
  "14/2 Romex NMB Wire 250ft|ROM-142-250",
  "Quikrete Concrete Mix 80lb|QUIK-80-BAG",
  "Generac GP6500 CO Sense Generator|GEN-GP6500"
]);

const LEGACY_TIME_LOG_NAMES = new Set(["Theresa W.", "Albert F.", "Esther H.", "James W.", "Brandon M."]);

const isLegacyInventoryItem = (item: InventoryItem) =>
  LEGACY_INVENTORY_FINGERPRINTS.has(`${item.name}|${item.sku}`);

const isLegacyTimeLog = (log: TimeClockLog) =>
  /^log_[1-8]$/.test(log.id) && log.date === "2026-07-06" && LEGACY_TIME_LOG_NAMES.has(log.employeeName);

class MapPageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  declare readonly props: Readonly<{ children: React.ReactNode }>;
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Interactive map failed safely:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="rounded-3xl border border-red-200 bg-white p-6 text-left shadow-sm">
          <h2 className="text-base font-extrabold text-slate-800">The map could not load</h2>
          <p className="mt-2 text-sm text-slate-600">
            OwnersLOCAL is still running. Close this page and reopen the map to try again.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export interface SelectedRole {
  id: string;
  name: string;
  count: number;
  description: string;
  isCustom?: boolean;
  permissions: string[];
  // Real per-module capabilities — e.g. this role can have Routes: Edit
  // while another role has Routes: View only, instead of one flat
  // view/create/edit/... set applied uniformly across every module.
  modulePermissions: GranularPermissions;
}

export const DEFAULT_ROLES_DATA: Record<string, { name: string; description: string; permissions: string[] }> = {
  owner: {
    name: "Owner",
    description: "Everything",
    permissions: ["dashboard", "leads", "jobs", "customers", "messages", "scheduling", "dispatch", "timeclock", "routes", "estimates", "documents", "ai_assistant", "inventory", "settings", "training"]
  },
  general_manager: {
    name: "General Manager",
    description: "Everything except ownership and account deletion",
    permissions: ["dashboard", "leads", "jobs", "customers", "messages", "scheduling", "dispatch", "timeclock", "routes", "estimates", "documents", "ai_assistant", "inventory", "settings", "training"]
  },
  office_manager: {
    name: "Office Manager",
    description: "Day-to-day office and field operations",
    permissions: ["dashboard", "revenue", "accounting", "customers", "leads", "estimates", "scheduling", "dispatch", "routes", "jobs", "timeclock", "inventory", "documents", "messages", "roster", "training", "settings"]
  },
  operations_manager: {
    name: "Operations Manager",
    description: "Dashboard, Scheduling, Dispatch, Routes, Jobs, Inventory, etc.",
    permissions: ["dashboard", "scheduling", "dispatch", "routes", "jobs", "inventory", "documents", "messages", "training", "settings"]
  },
  dispatcher: {
    name: "Dispatcher",
    description: "Dispatch, Routes, Map, Jobs, Sched",
    permissions: ["dashboard", "scheduling", "dispatch", "routes", "jobs", "customers", "messages", "settings"]
  },
  scheduler: {
    name: "Scheduler",
    description: "Dashboard, Scheduling, Customers, Jobs, Messages",
    permissions: ["dashboard", "scheduling", "customers", "jobs", "messages", "settings"]
  },
  sales_manager: {
    name: "Sales Manager",
    description: "Dashboard, Customers, Leads, Estimates, Messages, AI Assistant",
    permissions: ["dashboard", "customers", "leads", "estimates", "messages", "ai_assistant", "scheduling", "settings"]
  },
  sales_representative: {
    name: "Sales Representative",
    description: "Leads, CRM, Estimates, Docs",
    permissions: ["dashboard", "customers", "leads", "estimates", "messages", "ai_assistant", "scheduling", "settings"]
  },
  estimator: {
    name: "Estimator",
    description: "Estimates, Bids, Takeoffs, Reports",
    permissions: ["dashboard", "customers", "leads", "estimates", "documents", "messages", "ai_assistant", "scheduling", "settings"]
  },
  project_manager: {
    name: "Project Manager",
    description: "Dashboard, Customers, Scheduling, Dispatch, Routes, Jobs, Inventory, Documents, Messages",
    permissions: ["dashboard", "customers", "scheduling", "dispatch", "routes", "jobs", "inventory", "documents", "messages", "settings"]
  },
  field_supervisor: {
    name: "Field Supervisor",
    description: "Dashboard, Jobs, Scheduling, Dispatch, Routes, Inventory, Documents, Messages, Training",
    permissions: ["dashboard", "jobs", "scheduling", "dispatch", "routes", "inventory", "documents", "messages", "training", "settings"]
  },
  technician: {
    name: "Technician",
    description: "Dashboard, Jobs, Time Clock, Messages, Documents, Training",
    permissions: ["dashboard", "jobs", "timeclock", "messages", "documents", "training", "scheduling", "settings"]
  },
  laborer: {
    name: "Laborer",
    description: "Dashboard, Jobs, Time Clock, Training, Messages",
    permissions: ["dashboard", "jobs", "timeclock", "training", "messages", "scheduling", "settings"]
  },
  apprentice: {
    name: "Apprentice",
    description: "Dashboard, Jobs, Time Clock, Training, Messages",
    permissions: ["dashboard", "jobs", "timeclock", "training", "messages", "scheduling", "settings"]
  },
  installer: {
    name: "Installer",
    description: "Dashboard, Jobs, Time Clock, Inventory, Documents, Messages",
    permissions: ["dashboard", "jobs", "timeclock", "inventory", "documents", "messages", "scheduling", "settings"]
  },
  driver: {
    name: "Driver",
    description: "Dashboard, Routes, Jobs, Time Clock, Messages",
    permissions: ["dashboard", "routes", "jobs", "timeclock", "messages", "scheduling", "settings"]
  },
  warehouse_manager: {
    name: "Warehouse / Inventory Manager",
    description: "Dashboard, Inventory, Documents, Messages",
    permissions: ["dashboard", "inventory", "documents", "messages", "scheduling", "settings"]
  },
  purchasing_manager: {
    name: "Purchasing Manager",
    description: "Dashboard, Inventory, Documents",
    permissions: ["dashboard", "inventory", "documents", "messages", "scheduling", "settings"]
  },
  customer_service: {
    name: "Customer Service Representative",
    description: "Dashboard, Customers, Leads, Scheduling, Messages",
    permissions: ["dashboard", "customers", "leads", "scheduling", "messages", "settings"]
  },
  marketing_manager: {
    name: "Marketing Manager",
    description: "Dashboard, Customers, Leads, AI Assistant",
    permissions: ["dashboard", "customers", "leads", "ai_assistant", "messages", "scheduling", "settings"]
  },
  accountant: {
    name: "Accountant / Bookkeeper",
    description: "Dashboard, Customers, Estimates",
    permissions: ["dashboard", "customers", "estimates", "messages", "scheduling", "settings"]
  },
  hr_manager: {
    name: "HR Manager",
    description: "Dashboard, Documents, Training",
    permissions: ["dashboard", "documents", "training", "messages", "scheduling", "settings"]
  },
  safety_manager: {
    name: "Safety Manager",
    description: "Dashboard, Jobs, Training, Documents",
    permissions: ["dashboard", "jobs", "training", "documents", "messages", "scheduling", "settings"]
  },
  it_administrator: {
    name: "IT Administrator",
    description: "Everything except Owner company settings",
    permissions: ["dashboard", "leads", "jobs", "customers", "messages", "scheduling", "dispatch", "timeclock", "routes", "estimates", "documents", "ai_assistant", "inventory", "training", "settings"]
  }
};

/** Repairs legacy onboarding role payloads before they reach the UI/invite loop. */
export function normalizeSelectedRoles(value: unknown): SelectedRole[] {
  if (!Array.isArray(value)) return [];
  const roles = new Map<string, SelectedRole>();

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<SelectedRole>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) continue;
    const fallbackId = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : `custom_${fallbackId}`;
    const defaults = DEFAULT_ROLES_DATA[id] || (id === "field_technician" ? DEFAULT_ROLES_DATA.technician : undefined);
    const suppliedPermissions = Array.isArray(candidate.permissions)
      ? candidate.permissions.filter((permission): permission is string => typeof permission === "string" && !!permission)
      : [];
    // Built-in roles evolve as operational modules become real. Union their
    // current defaults into saved onboarding payloads so an older profile
    // cannot keep generating permanently under-permissioned invite codes.
    const permissions = [...new Set([...(defaults?.permissions || []), ...suppliedPermissions])];
    if (!permissions.length) permissions.push("dashboard", "messages");
    const rawCount = (candidate as { count?: unknown }).count;
    const numericCount = rawCount === null || rawCount === undefined || rawCount === "" ? Number.NaN : Number(rawCount);
    const count = Number.isFinite(numericCount) ? Math.max(id === "owner" ? 1 : 0, Math.floor(numericCount)) : 1;
    const fallbackLevel = id === "owner" ? "delete" : id.includes("manager") ? "edit" : "view";
    const fallbackModulePermissions = defaultGranularFromModuleList(permissions, fallbackLevel);
    const modulePermissions = candidate.modulePermissions && typeof candidate.modulePermissions === "object"
      ? { ...fallbackModulePermissions, ...candidate.modulePermissions }
      : fallbackModulePermissions;
    const normalized: SelectedRole = {
      id,
      name,
      count,
      description: typeof candidate.description === "string" ? candidate.description : defaults?.description || "Custom user defined role",
      isCustom: candidate.isCustom ?? !defaults,
      permissions,
      modulePermissions
    };
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const existing = roles.get(key);
    roles.set(key, existing ? {
      ...existing,
      count: Math.max(existing.count, normalized.count),
      permissions: [...new Set([...existing.permissions, ...normalized.permissions])],
      modulePermissions: { ...existing.modulePermissions, ...normalized.modulePermissions }
    } : normalized);
  }

  return [...roles.values()];
}

// Asset URLs from OwnersLOCAL GitHub
const BRAND_ICON_DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAXqBgADASIAAhEBAxEB/8QAHgAAAQUAAwEBAAAAAAAAAAAAAAECAwQFBgcICQr/xABUEAACAQMBBQUACwwIBgEDBAMAAQIDBBExBRITIWEGBxRBUQgWIjJSVHGBkaGxCRcZNDZCU2Jzg6PRFSMkJSYzN5I1Q0STosFysuHwRVVjgvEnGP/EAB0BAAEFAQEBAQAAAAAAAAAAAAABAgMEBQYHCAn/xAA+EQACAgECAggDBwMDBAIDAQAAAQIDEQQSBRMGFCExNFFScRZBkQcVIjI1YXIkM1MjQrFDgaHBJWKC0fBE/9oADAMBAAIRAxEAPwD5VAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+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…41644 tokens truncated…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";
const SIGNIN_BUTTON_URL = "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Assets/Signinbuttom.png";
const GO_BUTTON_URL = "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Assets/Gobutton.png";

// Operating System Screens mapping
const OS_SCREENS = [
  { id: "dashboard", label: "Dashboard", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightdashboard.jpg", icon: "📊", top: "12%", bottom: "17%" },
  { id: "revenue", label: "Revenue", url: "", icon: "📈", top: "12%", bottom: "17%" },
  { id: "accounting", label: "Accounting", url: "", icon: "🧮", top: "12%", bottom: "17%" },
  { id: "customers", label: "Customers", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightcustomers.jpg", icon: "👥", top: "27%", bottom: "32%" },
  { id: "leads", label: "Leads", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightleads.jpg", icon: "🎯", top: "17%", bottom: "22%" },
  { id: "estimates", label: "Estimates & Bids", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightestimatesbids.jpg", icon: "📝", top: "57%", bottom: "62%" },
  { id: "scheduling", label: "Scheduling", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightscheduling.jpg", icon: "📅", top: "37%", bottom: "42%" },
  { id: "dispatch", label: "Dispatch", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightdispatch.jpg", icon: "🚚", top: "42%", bottom: "47%" },
  { id: "routes", label: "Interactive Map & Routes", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightroutes.jpg", icon: "🗺️", top: "52%", bottom: "57%" },
  { id: "jobs", label: "Jobs", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightjobs.jpg", icon: "💼", top: "22%", bottom: "27%" },
  { id: "timeclock", label: "Time Clock", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lighttimeclock.jpg", icon: "⏱️", top: "47%", bottom: "52%" },
  { id: "payroll", label: "Payroll", url: "", icon: "💵", top: "47%", bottom: "52%" },
  { id: "inventory", label: "Inventory", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightinventory.jpg", icon: "📦", top: "72%", bottom: "77%" },
  { id: "documents", label: "Documents", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightdocuments.jpg", icon: "📁", top: "62%", bottom: "67%" },
  { id: "messages", label: "Messages", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightmessages.jpg", icon: "💬", top: "32%", bottom: "37%" },
  { id: "training", label: "Training", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lighttraining.jpg", icon: "🎓", top: "82%", bottom: "87%" },
  { id: "ai_assistant", label: "AI Assistant", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightaiassistant.jpg", icon: "🤖", top: "67%", bottom: "72%", badge: "AI" },
  { id: "settings", label: "Settings", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightsettings.png", icon: "⚙️", top: "77%", bottom: "82%" },
  { id: "integrations", label: "Integrations", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightsettings.png", icon: "🔗", top: "77%", bottom: "82%" },
  { id: "roster", label: "Roster", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightsettings.png", icon: "📋", top: "77%", bottom: "82%" },
  { id: "bulletins", label: "Bulletins", url: "", icon: "📌", top: "77%", bottom: "82%" },
  { id: "snapshots", label: "Snapshots Folder", url: "", icon: "📸", top: "82%", bottom: "87%" },
  { id: "notifications", label: "Notifications", url: "", icon: "🔔", top: "82%", bottom: "87%" },
  { id: "missed_call_textback", label: "Missed Call Text-Back", url: "", icon: "📵", top: "82%", bottom: "87%" },
  { id: "owner_console", label: "Owner Console", url: "", icon: "🛠️", top: "82%", bottom: "87%" }
];

// The real expense categories shown in the Revenue page's statement table
// ("Expenses by Category" view). "Bills" comes from the bills collection;
// "Material Expenses" is a bucket of several transaction categories; every
// other entry matches a transaction's `category` field exactly.
const EXPENSE_CATEGORY_NAMES = [
  "Bills", "Material Expenses", "Fuel", "Vehicle Maintenance", "Equipment", "Tools",
  "Insurance", "Taxes", "Marketing", "Software & Subs", "Utilities", "Office Supplies", "Custom Expense"
] as const;

/**
 * Buckets the real revenueEvents log (written by the Event Engine's
 * job-completion cascade) and real transactions log (manual/scanned/payroll
 * entries — see LogTransactionModal + handleRunPayroll) into real calendar
 * periods for the revenue chart, plus real prior-period/current-period
 * totals for the comparison badge and summary cards. Accrued Taxes is
 * deliberately not derived here — there's no real tax engine anywhere in
 * the app to compute a real liability from.
 */
function getRevenueChartData(
  filter: string,
  revenueEvents: RevenueEvent[],
  transactions: Transaction[] = [],
  bills: Bill[] = []
): {
  series: Array<{ time: string; Revenue: number; Expenses: number; TotalExpenses: number; Bills: number; MaterialExpenses: number; Payroll: number; OtherExpenses: number; Profit: number }>;
  currentTotal: number;
  priorTotal: number;
  currentExpenseTotal: number;
  currentPayrollTotal: number;
  priorExpenseTotal: number;
} {
  const now = new Date();
  const expenseTx = transactions.filter((t) => t.type === "expense");
  const payrollTx = expenseTx.filter((t) => t.category === "Payroll");
  const materialOperationalCategories = new Set(["Material Expenses", "Materials", "Equipment", "Fuel", "Office Supplies", "Tools", "Supplies", "Inventory"]);
  const materialTx = expenseTx.filter((t) => materialOperationalCategories.has(t.category || ""));
  const otherExpenseTx = expenseTx.filter((t) => t.category !== "Payroll" && !materialOperationalCategories.has(t.category || ""));
  const billCosts = bills.filter((bill) => bill.status !== "void").map((bill) => ({
    amount: bill.totalCost ?? bill.estimatedCost ?? bill.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    date: bill.issuedDate
  }));
  const allExpenseCosts = [...expenseTx, ...billCosts];

  // Real revenue = job-completion events (revenueEvents) + manually-logged
  // or scanned income transactions (e.g. a photographed check) — both are
  // real money in, and logging one should actually move these totals.
  const incomeTx = transactions.filter((t) => t.type === "income");
  const revenueSource: Array<{ amount: number; date: string }> = [...revenueEvents, ...incomeTx];

  const sumInRange = (items: Array<{ amount: number; date: string }>, start: Date, end: Date) =>
    items
      .filter((e) => {
        const d = new Date(e.date);
        return d >= start && d < end;
      })
      .reduce((sum, e) => sum + e.amount, 0);

  const buildRow = (time: string, start: Date, end: Date) => {
    const Revenue = sumInRange(revenueSource, start, end);
    const Bills = sumInRange(billCosts, start, end);
    const MaterialExpenses = sumInRange(materialTx, start, end);
    const Payroll = sumInRange(payrollTx, start, end);
    const OtherExpenses = sumInRange(otherExpenseTx, start, end);
    const TotalExpenses = Bills + MaterialExpenses + Payroll + OtherExpenses;
    return { time, Revenue, Expenses: TotalExpenses, TotalExpenses, Bills, MaterialExpenses, Payroll, OtherExpenses, Profit: Revenue - TotalExpenses };
  };

  const buildDays = (count: number, labelFn: (d: Date) => string) => {
    const days: ReturnType<typeof buildRow>[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
      days.push(buildRow(labelFn(dayStart), dayStart, dayEnd));
    }
    return days;
  };

  const withTotals = (
    series: ReturnType<typeof buildRow>[],
    periodStart: Date,
    periodEnd: Date,
    priorTotal: number
  ) => {
    const periodDuration = Math.max(0, periodEnd.getTime() - periodStart.getTime());
    return {
      series,
      currentTotal: filter === "Day"
        ? series.reduce((s, d) => s + d.Revenue, 0)
        : (series[series.length - 1]?.Revenue || 0),
      priorTotal,
      currentExpenseTotal: filter === "Day"
        ? series.reduce((s, d) => s + d.Expenses, 0)
        : (series[series.length - 1]?.Expenses || 0),
      currentPayrollTotal: sumInRange(payrollTx, periodStart, periodEnd),
      priorExpenseTotal: sumInRange(allExpenseCosts, new Date(periodStart.getTime() - periodDuration), periodStart)
    };
  };

  // Daily view intentionally shows each day's activity. Every wider view is
  // cumulative so a later expense lowers the running profit by only that
  // expense instead of making the graph look as though earlier income vanished.
  const cumulative = (rows: ReturnType<typeof buildRow>[]) => {
    let revenue = 0, billsTotal = 0, materialTotal = 0, payrollTotal = 0, otherTotal = 0;
    return rows.map((row) => {
      revenue += row.Revenue;
      billsTotal += row.Bills; materialTotal += row.MaterialExpenses; payrollTotal += row.Payroll; otherTotal += row.OtherExpenses;
      const expenses = billsTotal + materialTotal + payrollTotal + otherTotal;
      return { ...row, Revenue: revenue, Bills: billsTotal, MaterialExpenses: materialTotal, Payroll: payrollTotal, OtherExpenses: otherTotal, Expenses: expenses, TotalExpenses: expenses, Profit: revenue - expenses };
    });
  };

  if (filter === "Day") {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const series = buildDays(30, (d) => d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }));
    const priorTotal = sumInRange(
      revenueSource,
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 59),
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
    );
    return withTotals(series, periodStart, periodEnd, priorTotal);
  }

  if (filter === "Week") {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dailyRows = buildDays(7, (d) => d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }));
    const priorTotal = sumInRange(
      revenueSource,
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13),
      periodStart
    );
    return withTotals(cumulative(dailyRows), periodStart, periodEnd, priorTotal);
  }

  if (filter === "Pay Period") {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dailyRows = buildDays(14, (d) => d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }));
    const priorTotal = sumInRange(
      revenueSource,
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 27),
      periodStart
    );
    return withTotals(cumulative(dailyRows), periodStart, periodEnd, priorTotal);
  }

  if (filter === "Month") {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysInMonth = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000);
    const dailyRows: ReturnType<typeof buildRow>[] = [];
    for (let i = 0; i < daysInMonth; i++) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), 1 + i);
      const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
      dailyRows.push(buildRow(dayStart.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }), dayStart, dayEnd));
    }
    const priorMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const priorTotal = sumInRange(revenueSource, priorMonthStart, periodStart);
    return withTotals(cumulative(dailyRows), periodStart, periodEnd, priorTotal);
  }

  if (filter === "Quarter") {
    const months: ReturnType<typeof buildRow>[] = [];
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    for (let month = quarterStartMonth; month <= now.getMonth(); month++) {
      const monthStart = new Date(now.getFullYear(), month, 1);
      const monthEnd = new Date(now.getFullYear(), month + 1, 1);
      months.push(buildRow(monthStart.toLocaleDateString(undefined, { month: "short" }), monthStart, monthEnd));
    }
    const periodStart = new Date(now.getFullYear(), quarterStartMonth, 1);
    const periodEnd = new Date(now.getFullYear(), quarterStartMonth + 3, 1);
    const priorTotal = sumInRange(
      revenueSource,
      new Date(now.getFullYear(), quarterStartMonth - 3, 1),
      periodStart
    );
    return withTotals(cumulative(months), periodStart, periodEnd, priorTotal);
  }

  if (filter === "Annual") {
    const months: ReturnType<typeof buildRow>[] = [];
    for (let month = 0; month <= now.getMonth(); month++) {
      const monthStart = new Date(now.getFullYear(), month, 1);
      const monthEnd = new Date(now.getFullYear(), month + 1, 1);
      months.push(buildRow(monthStart.toLocaleDateString(undefined, { month: "short" }), monthStart, monthEnd));
    }
    const periodStart = new Date(now.getFullYear(), 0, 1);
    const periodEnd = new Date(now.getFullYear() + 1, 0, 1);
    const priorTotal = sumInRange(
      revenueSource,
      new Date(now.getFullYear() - 1, 0, 1),
      periodStart
    );
    return withTotals(cumulative(months), periodStart, periodEnd, priorTotal);
  }

  // Total: group the complete ledger by year, then show lifetime running totals.
  const allDates = [...revenueSource, ...expenseTx, ...billCosts]
    .map((item) => new Date(item.date))
    .filter((date) => !Number.isNaN(date.getTime()));
  const firstYear = allDates.length ? Math.min(...allDates.map((date) => date.getFullYear())) : now.getFullYear();
  const years: ReturnType<typeof buildRow>[] = [];
  for (let year = firstYear; year <= now.getFullYear(); year++) {
    years.push(buildRow(String(year), new Date(year, 0, 1), new Date(year + 1, 0, 1)));
  }
  const periodStart = new Date(firstYear, 0, 1);
  const periodEnd = new Date(now.getFullYear() + 1, 0, 1);
  return withTotals(cumulative(years), periodStart, periodEnd, 0);
}

interface RevenueStepPoint {
  x: number;
  label: string;
  Payments: number;
  Expenses: number;
  Net: number;
}

/**
 * A true event-driven step series for the Revenue page's own graph (the
 * Dashboard mini-widget keeps using getRevenueChartData's fixed-bucket
 * trend above -- different chart, different job). Each real payment or
 * expense event -- a completed job, a logged/scanned income or expense
 * transaction, an issued bill -- plots one point at its real timestamp,
 * carrying the running cumulative total for Payments/Expenses/Net as of
 * that moment. The series starts at zero at the period's start and holds
 * flat out to "now" so the line visibly stays at its last value until the
 * next real event -- exactly what a step chart (type="stepAfter") draws.
 */
function getRevenueStepSeries(
  filter: string,
  revenueEvents: RevenueEvent[],
  transactions: Transaction[] = [],
  bills: Bill[] = []
): { points: RevenueStepPoint[]; periodStart: Date; periodEnd: Date } {
  const now = new Date();
  let periodStart: Date;

  if (filter === "Day") {
    periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (filter === "Week") {
    periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  } else if (filter === "Pay Period") {
    periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
  } else if (filter === "Month") {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (filter === "Quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    periodStart = new Date(now.getFullYear(), quarterStartMonth, 1);
  } else if (filter === "Annual") {
    periodStart = new Date(now.getFullYear(), 0, 1);
  } else {
    const allDates = [
      ...revenueEvents.map((e) => new Date(e.date)),
      ...transactions.map((t) => new Date(t.date)),
      ...bills.map((b) => new Date(b.issuedDate))
    ].filter((d) => !Number.isNaN(d.getTime()));
    periodStart = allDates.length ? new Date(Math.min(...allDates.map((d) => d.getTime()))) : now;
  }
  const periodEnd = now;

  type Ev = { time: number; kind: "payment" | "expense"; amount: number };
  const events: Ev[] = [];
  const inRange = (t: number) => !Number.isNaN(t) && t >= periodStart.getTime() && t <= periodEnd.getTime();

  for (const e of revenueEvents) {
    const t = new Date(e.date).getTime();
    if (inRange(t)) events.push({ time: t, kind: "payment", amount: e.amount });
  }
  for (const t of transactions) {
    if (t.type !== "income" && t.type !== "expense") continue;
    const time = new Date(t.date).getTime();
    if (inRange(time)) events.push({ time, kind: t.type === "income" ? "payment" : "expense", amount: t.amount });
  }
  for (const b of bills) {
    if (b.status === "void") continue;
    const time = new Date(b.issuedDate).getTime();
    if (!inRange(time)) continue;
    const amount = b.totalCost ?? b.estimatedCost ?? b.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
    events.push({ time, kind: "expense", amount });
  }
  events.sort((a, b) => a.time - b.time);
  // Dates without a time-of-day (a bill's issued date, a logged transaction's
  // date) all land on that day's midnight, so two real events on the same
  // calendar day collide at the exact same x -- which draws as a genuinely
  // vertical segment, not just a steep one. Spread same-timestamp events by
  // a nominal minute each, in their already-sorted order, so the line is a
  // real (if steep) diagonal between them. No amount or ordering changes.
  for (let i = 1; i < events.length; i++) {
    if (events[i].time <= events[i - 1].time) {
      events[i].time = events[i - 1].time + 60000;
    }
  }

  const fmtLabel = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const points: RevenueStepPoint[] = [{ x: periodStart.getTime(), label: fmtLabel(periodStart.getTime()), Payments: 0, Expenses: 0, Net: 0 }];
  let runningPayments = 0;
  let runningExpenses = 0;
  for (const ev of events) {
    if (ev.kind === "payment") runningPayments += ev.amount; else runningExpenses += ev.amount;
    points.push({ x: ev.time, label: fmtLabel(ev.time), Payments: runningPayments, Expenses: runningExpenses, Net: runningPayments - runningExpenses });
  }
  if (points[points.length - 1].x < periodEnd.getTime()) {
    points.push({ x: periodEnd.getTime(), label: fmtLabel(periodEnd.getTime()), Payments: runningPayments, Expenses: runningExpenses, Net: runningPayments - runningExpenses });
  }

  return { points, periodStart, periodEnd };
}

/**
 * Real hours worked in the trailing `sinceDaysAgo` days, computed by
 * pairing Clock In/Break End with Clock Out/Break Start the same way
 * TimeClockPage and handleRunPayroll do. Shared here so the Revenue page's
 * Payroll Overview table shows the same real numbers Run Payroll acts on.
 */
function computeRecentHours(logs: TimeClockLog[], sinceDaysAgo: number): number {
  return computeRecentPayrollHours(logs, sinceDaysAgo).hours;
}

type PayrollSchedule = "weekly_friday" | "biweekly" | "semimonthly" | "monthly" | "custom";
const US_PAYROLL_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const dateInputValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
function scheduledPayrollPeriod(schedule: PayrollSchedule, anchor = new Date()): { start: string; end: string } {
  const day = new Date(anchor); day.setHours(12, 0, 0, 0);
  if (schedule === "semimonthly") {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() <= 15 ? 1 : 16);
    const end = day.getDate() <= 15 ? new Date(day.getFullYear(), day.getMonth(), 15) : new Date(day.getFullYear(), day.getMonth() + 1, 0);
    return { start: dateInputValue(start), end: dateInputValue(end) };
  }
  if (schedule === "monthly") return { start: dateInputValue(new Date(day.getFullYear(), day.getMonth(), 1)), end: dateInputValue(new Date(day.getFullYear(), day.getMonth() + 1, 0)) };
  const sunday = new Date(day); sunday.setDate(day.getDate() - day.getDay());
  if (schedule === "biweekly") {
    const epoch = new Date(2024, 0, 7, 12);
    const weeks = Math.floor((sunday.getTime() - epoch.getTime()) / (7 * 86400000));
    if (Math.abs(weeks % 2) === 1) sunday.setDate(sunday.getDate() - 7);
    const end = new Date(sunday); end.setDate(end.getDate() + 13);
    return { start: dateInputValue(sunday), end: dateInputValue(end) };
  }
  const end = new Date(sunday); end.setDate(end.getDate() + 6);
  return { start: dateInputValue(sunday), end: dateInputValue(end) };
}

/** Splits worked time into Sunday-Saturday workweeks. The FLSA does not
 * allow a biweekly 80-hour average: each seven-day workweek stands alone. */
function computeRecentPayrollHours(logs: TimeClockLog[], sinceDaysAgo: number): { hours: number; regularHours: number; overtimeHours: number } {
  const since = new Date(Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000);
  return computePayrollHoursForRange(logs, dateInputValue(since), dateInputValue(new Date()), 0);
}

function computePayrollHoursForRange(logs: TimeClockLog[], startDate: string, endDate: string, workweekStartDay: number): { hours: number; regularHours: number; overtimeHours: number } {
  const since = new Date(`${startDate}T00:00:00`);
  const through = new Date(`${endDate}T23:59:59.999`);
  const sorted = [...logs]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const weekHours = new Map<string, number>();
  let segmentStart: number | null = null;
  const addSegment = (startMs: number, endMs: number) => {
    let cursor = Math.max(startMs, since.getTime());
    while (cursor < endMs) {
      const date = new Date(cursor);
      const weekStart = new Date(date);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() - workweekStartDay + 7) % 7));
      const nextWeek = new Date(weekStart);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const sliceEnd = Math.min(endMs, nextWeek.getTime());
      const key = weekStart.toISOString().slice(0, 10);
      weekHours.set(key, (weekHours.get(key) || 0) + Math.max(0, sliceEnd - cursor) / 3600000);
      cursor = sliceEnd;
    }
  };
  for (const log of sorted) {
    const ts = new Date(log.timestamp).getTime();
    if (log.type === "Clock In" || log.type === "Break End") {
      segmentStart = Math.max(ts, since.getTime());
    } else if ((log.type === "Clock Out" || log.type === "Break Start") && segmentStart !== null) {
      if (ts >= since.getTime() && segmentStart <= through.getTime()) addSegment(segmentStart, Math.min(ts, through.getTime()));
      segmentStart = null;
    }
  }
  if (segmentStart !== null && segmentStart <= through.getTime()) addSegment(segmentStart, Math.min(Date.now(), through.getTime()));
  let regularHours = 0;
  let overtimeHours = 0;
  weekHours.forEach(hours => {
    regularHours += Math.min(hours, 40);
    overtimeHours += Math.max(0, hours - 40);
  });
  return { hours: regularHours + overtimeHours, regularHours, overtimeHours };
}

const BrandIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <img
    src="/branding/owners-sidebar-icon-1000043699.png"
    alt=""
    aria-hidden="true"
    className={`object-contain ${className}`}
  />
);

const PayrollIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <img
    src="/branding/payroll-gear-dollar.png"
    alt=""
    aria-hidden="true"
    className={`object-contain ${className}`}
  />
);

const getScreenIcon = (screenId: string, className: string = "w-4 h-4") => {
  switch (screenId) {
    case "owner_console":
      return <ShieldAlert className={className} />;
    case "dashboard":
      return <LayoutDashboard className={className} />;
    case "revenue":
      return <BrandIcon className={className} />;
    case "accounting":
      return <Landmark className={className} />;
    case "customers":
      return <Users className={className} />;
    case "leads":
      return <Target className={className} />;
    case "estimates":
      return <FileText className={className} />;
    case "scheduling":
      return <Calendar className={className} />;
    case "dispatch":
      return <Truck className={className} />;
    case "routes":
      return <Compass className={className} />;
    case "jobs":
      return <Briefcase className={className} />;
    case "timeclock":
      return <Clock className={className} />;
    case "payroll":
      return <PayrollIcon className={className} />;
    case "inventory":
      return <Package className={className} />;
    case "documents":
      return <FolderOpen className={className} />;
    case "messages":
      return <MessageSquare className={className} />;
    case "training":
      return <GraduationCap className={className} />;
    case "ai_assistant":
      return <Sparkles className={className} />;
    case "settings":
      return <Settings className={className} />;
    case "integrations":
      return <Link className={className} />;
    case "roster":
      return <Users className={className} />;
    case "bulletins":
      return <Megaphone className={className} />;
    case "snapshots":
      return <Camera className={className} />;
    case "notifications":
      return <Bell className={className} />;
    case "missed_call_textback":
      return <PhoneMissed className={className} />;
    default:
      return <BrandIcon className={className} />;
  }
};

interface DynamicFieldListProps {
  label: string;
  items: string[];
  setter: React.Dispatch<React.SetStateAction<string[]>>;
  placeholder: string;
  scale: number;
  error?: string;
}

const DynamicFieldList: React.FC<DynamicFieldListProps> = ({
  label,
  items,
  setter,
  placeholder,
  scale,
  error
}) => {
  const [localItems, setLocalItems] = useState<{ id: string; value: string }[]>(() =>
    items.map(val => ({ id: Math.random().toString(36).substring(2, 9), value: val }))
  );

  const prevItemsRef = React.useRef(items);
  if (prevItemsRef.current !== items) {
    prevItemsRef.current = items;
    const prevValues = localItems.map(p => p.value);
    if (JSON.stringify(prevValues) !== JSON.stringify(items)) {
      setLocalItems(
        items.map((val, idx) => {
          const existingId = localItems[idx]?.id || Math.random().toString(36).substring(2, 9);
          return { id: existingId, value: val };
        })
      );
    }
  }

  const handleAdd = () => {
    const newItem = { id: Math.random().toString(36).substring(2, 9), value: "" };
    const updated = [...localItems, newItem];
    setLocalItems(updated);
    setter(updated.map(x => x.value));
  };

  const handleChange = (index: number, newValue: string) => {
    const updated = [...localItems];
    updated[index] = { ...updated[index], value: newValue };
    setLocalItems(updated);
    setter(updated.map(x => x.value));
  };

  const handleRemove = (index: number) => {
    if (localItems.length <= 1) return;
    const updated = localItems.filter((_, i) => i !== index);
    setLocalItems(updated);
    setter(updated.map(x => x.value));
  };

  const getFontSize = (baseSize: number) => {
    return { fontSize: `${Math.max(10, Math.round(baseSize * scale))}px` };
  };

  return (
    <div className="space-y-1.5 mb-4">
      <div className="flex items-center justify-between px-1">
        <label style={getFontSize(11)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider">
          {label}
        </label>
        <button
          type="button"
          onClick={handleAdd}
          style={{ padding: `${3 * scale}px ${8 * scale}px`, borderRadius: `${6 * scale}px`, ...getFontSize(10) }}
          className="bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold flex items-center gap-1 transition-colors cursor-pointer border border-blue-200/50 animate-fade-in"
        >
          <span>+ Add</span>
        </button>
      </div>
      <div className="space-y-1.5">
        {localItems.map((item, idx) => {
          const isEmpty = !item.value || !item.value.trim();
          const hasError = !!error && isEmpty;
          return (
            <div key={item.id} className="flex gap-1.5 items-center">
              <input
                type="text"
                value={item.value}
                onChange={(e) => handleChange(idx, e.target.value)}
                placeholder={placeholder}
                style={{
                  height: `${42 * scale}px`,
                  borderRadius: `${12 * scale}px`,
                  paddingLeft: `${14 * scale}px`,
                  paddingRight: `${14 * scale}px`,
                  ...getFontSize(12.5)
                }}
                className={`flex-1 bg-white border focus:ring-1 focus:outline-none transition-all placeholder:text-slate-400/70 shadow-sm font-medium ${
                  hasError 
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500 text-rose-900" 
                    : "border-slate-200 focus:border-blue-500 focus:ring-blue-500 text-slate-800"
                }`}
              />
              {localItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  style={{ width: `${30 * scale}px`, height: `${30 * scale}px`, borderRadius: `${8 * scale}px` }}
                  className="hover:bg-rose-50 text-rose-500 hover:text-rose-700 font-bold transition-colors cursor-pointer flex items-center justify-center text-xs shrink-0 border border-transparent hover:border-rose-100"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p className="text-rose-600 font-bold text-[10.5px] mt-1 pl-1 flex items-center gap-1 animate-pulse">
          <span className="w-1.5 h-1.5 bg-rose-500 rounded-full shrink-0 animate-ping" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};

const DAILY_VIEW_OPTIONS = [
  { value: "revenue", label: "📊 Company Revenue Graph" },
  { value: "leads", label: "🎯 Active Leads Count" },
  { value: "scheduling", label: "📅 Jobs Scheduled Today" },
  { value: "fleet", label: "🚚 Fleet Status" },
  { value: "messages", label: "💬 Messages Feed Board" },
  { value: "inventory", label: "📦 Warehouse Inventory Scans" },
];

interface CustomDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  scale: number;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({ value, onChange, options, scale }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value) || options[0];

  const getFontSize = (baseSize: number) => {
    return { fontSize: `${Math.max(10, Math.round(baseSize * scale))}px` };
  };

  return (
    <div ref={dropdownRef} className="relative w-full z-30">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          height: `${42 * scale}px`,
          borderRadius: `${12 * scale}px`,
          ...getFontSize(12.5),
          backgroundColor: "#ffffff",
          color: "#1F3557",
        }}
        className="w-full flex items-center justify-between border border-[#9EC8EF] px-3.5 focus:outline-none focus:border-[#4A86F7] font-bold cursor-pointer transition-all hover:bg-slate-50 text-left custom-dropdown-popover"
      >
        <span>{selectedOption.label}</span>
        <ChevronDown className={`w-4 h-4 text-[#315C9F] transition-transform duration-200 shrink-0 ml-2 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          style={{
            borderRadius: `${12 * scale}px`,
            marginTop: `${4 * scale}px`,
            backgroundColor: "#ffffff",
            color: "#1f3557",
          }}
          className="absolute left-0 w-full border border-[#9EC8EF] shadow-2xl py-1.5 z-[100] max-h-48 overflow-y-auto animate-fade-in text-left block custom-dropdown-popover"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                style={{
                  ...getFontSize(12),
                  backgroundColor: isSelected ? "#EAF5FF" : "#ffffff",
                  color: isSelected ? "#4A86F7" : "#1F3557",
                }}
                className={`w-full text-left px-4 py-2.5 font-bold transition-all block cursor-pointer border-0 custom-dropdown-item ${
                  isSelected ? "custom-dropdown-item-active font-extrabold" : ""
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Mounts the Event Engine's cascade subscribers (see src/hooks/useEventEngineSubscribers.ts).
// Renders nothing — must be rendered inside DomainDataContext/NavTelemetryContext.
const EventEngineEffects: React.FC = () => {
  useEventEngineSubscribers();
  return null;
};

export default function App() {
  // A remote-signing link (texted/emailed from the PDF Editor's "Send
  // remotely" option) has no OwnersLocal login of its own -- render the
  // public signing page instead of the normal logged-in app shell entirely.
  // Safe ahead of every hook below: window.location.search is fixed for the
  // life of this mounted instance, so which branch runs never changes
  // between re-renders of the same instance.
  const remoteSignToken = getRemoteSigningTokenFromUrl();
  if (remoteSignToken) return <RemoteSigningPage token={remoteSignToken} />;

  // Logged in user profile (null if guest/default owner, or set when authenticated)
  // Standalone demo build: no Firebase Auth, no login screen -- opens
  // straight in as this fake Owner user. See src/hooks/useFirestoreCollection.ts
  // for how every collection this user "owns" is seeded instead of read
  // from Firestore. Email is one of the app's built-in demo accounts
  // (see the isDemoUser check a few hundred lines down) so the real
  // "wipe seed data + fetch this user's real business profile from
  // Firestore" effect skips itself instead of clearing our mock data.
  const [loggedInUser, setLoggedInUser] = useState<{
    email: string;
    role: string;
    permissions: string[];
    granularPermissions?: GranularPermissions;
    isEmployee?: boolean;
    name?: string;
    goals?: string;
    /** The owner's business email — the real multi-tenant scoping key for employee sessions (an employee's own `email` is not it). */
    businessEmail?: string;
  } | null>({
    email: "admin@ownerslocal.com",
    role: "Owner",
    permissions: ["ALL"],
    name: "Mike Donovan"
  });
  const [workspaceTheme, setWorkspaceTheme] = useState<WorkspaceTheme>(() =>
    workspaceThemeFromSetting(localStorage.getItem("ownerslocal_workspace_theme") || undefined)
  );
  const isDarkTheme = workspaceTheme === "dark-basic" || workspaceTheme === "dark-dynamic";

  // Authentication & Form States
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem("rememberMe") === "true";
  });
  const [email, setEmail] = useState(() => {
    if (localStorage.getItem("rememberMe") === "true") {
      return localStorage.getItem("rememberedEmail") || "";
    }
    return "";
  });
  const [password, setPassword] = useState(() => {
    if (localStorage.getItem("rememberMe") === "true") {
      return localStorage.getItem("rememberedPassword") || "";
    }
    return "";
  });
  const [inviteCode, setInviteCode] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [onboardingErrors, setOnboardingErrors] = useState<Record<string, string>>({});
  
  // Proportional Scaling State for Mobile viewport compatibility
  const [cardWidth, setCardWidth] = useState(440);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const pendingSnapshotRef = React.useRef<{ pageId: string; pageName: string; metaData?: any } | null>(null);
  const refSecurityLogged = React.useRef<Record<string, boolean>>({});
  const isTimeClockLoadedRef = React.useRef(false);
  const [revenueConfirmAction, setRevenueConfirmAction] = useState<{ label: string; icon: string } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setCardWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const scale = cardWidth / 440;
  const getScaled = (size: number) => `${Math.max(6, Math.round(size * scale))}px`;
  const getFontSize = (size: number) => ({ fontSize: `${Math.max(8, Math.round(size * scale))}px` });

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginMethod, setLoginMethod] = useState<"password" | "invite" | "google" | null>(null);

  // Sign Up Flow State
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [signUpUsername, setSignUpUsername] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("");
  const [signUpError, setSignUpError] = useState("");
  const [isSignUpSubmitting, setIsSignUpSubmitting] = useState(false);
  
  // Navigation & Flow states
  // Standalone demo build: always logged in, no Firebase Auth gate.
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState<string>("login");
  const [activeScreen, setActiveScreen] = useState(() => {
    const savedId = sessionStorage.getItem("ownerslocal_active_screen");
    return OS_SCREENS.find(screen => screen.id === savedId) || OS_SCREENS[0];
  });
  const [showNotification, setShowNotification] = useState<string | null>(null);
  const [employeeRedoOnboardingAllowed, setEmployeeRedoOnboardingAllowed] = useState(false);

  // New Sidebar & Workspace Simulation states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [simulatedRole, setSimulatedRole] = useState<string | null>(null);
  const [liveTime, setLiveTime] = useState(new Date());

  // Notification system states
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [reviewingClockNotifLogId, setReviewingClockNotifLogId] = useState<string | null>(null);

  useEffect(() => {
    sessionStorage.setItem("ownerslocal_active_screen", activeScreen.id);
  }, [activeScreen]);

  // Dashboard & Operational Interactive states
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [clockInDuration, setClockInDuration] = useState(0);
  const [dashboardLeads, setDashboardLeads] = useState<Array<{
    id: string;
    name: string;
    phone: string;
    service: string;
    status: string;
    date: string;
  }>>([]);
  const [integrationStatuses, setIntegrationStatuses] = useState({
    quickbooks: true,
    stripe: true,
    google_maps: true,
    gmail: false
  });
  // Core Event Engine & CRM Shared States back-ended by Firestore.
  // Each collection is backed by useFirestoreCollection, which centralizes the
  // sync-to-Firestore + realtime-subscribe + clear-on-logout behavior that used
  // to be hand-duplicated per collection (see src/hooks/useFirestoreCollection.ts).
  // The real multi-tenant scoping key. For an owner this is their own
  // email; for an employee it must be the owner's businessEmail — an
  // employee's own email is a different tenant and would resolve every
  // collection to empty. (TrainingPage.tsx already used this exact
  // ternary, anticipating businessEmail would be populated here.)
  const businessId = loggedInUser?.isEmployee ? loggedInUser?.businessEmail : loggedInUser?.email;

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    getDoc(doc(db, "business_profiles", businessId)).then(snapshot => {
      if (cancelled) return;
      const savedTheme = snapshot.data()?.companySettings?.appearance?.theme;
      const nextTheme = workspaceThemeFromSetting(savedTheme);
      setWorkspaceTheme(nextTheme);
      localStorage.setItem("ownerslocal_workspace_theme", savedTheme || "Light Mode Basic");
    }).catch(error => console.error("Couldn't load workspace theme:", error));
    return () => { cancelled = true; };
  }, [businessId]);

  useEffect(() => {
    document.documentElement.dataset.ownerslocalTheme = workspaceTheme;
  }, [workspaceTheme]);
  const [customers, setCustomers] = useFirestoreCollection<Customer>("customers", businessId, {
    normalize: (customer) => {
      const legacyName = String((customer as Customer & { name?: string }).name || "").trim();
      const contact = String(customer.contact || legacyName || customer.company || "Unnamed Customer").trim();
      return {
        ...customer,
        company: String(customer.company || legacyName || contact).trim(),
        contact,
        phone: String(customer.phone || ""),
        email: String(customer.email || ""),
        address: String(customer.address || "")
      };
    }
  });
  const [leads, setLeads] = useFirestoreCollection<Lead>("leads", businessId);
  const [estimates, setEstimates] = useFirestoreCollection<Estimate>("estimates", businessId);
  const [schedulingEvents, setSchedulingEvents] = useFirestoreCollection<SchedulingEvent>("scheduling_events", businessId);
  const [inventoryList, setInventoryList] = useFirestoreCollection<InventoryItem>("inventory", businessId);
  const [documents, setDocuments] = useFirestoreCollection<DocumentItem>("documents", businessId);
  const [recentRoster, setRecentRoster] = useFirestoreCollection<{ id?: string; name: string; role: string; code: string; status: string }>(
    "roster",
    businessId,
    { normalize: (item) => ({ ...item, id: item.id || item.code }) }
  );
  const [bulletins, setBulletins] = useFirestoreCollection<any>("bulletins", businessId);
  const [notifications, setNotifications] = useFirestoreCollection<any>("notifications", businessId, {
    // Firestore denies the whole listen request unless the query itself
    // guarantees every result satisfies the security rule, and reads are
    // scoped to `resource.data.recipientEmail == request.auth.token.email`
    // (see firestore.rules) -- so this must filter by recipientEmail too.
    extraFilter: { field: "recipientEmail", value: loggedInUser?.email }
  });
  const [recentAiActions, setRecentAiActions] = useFirestoreCollection<any>("recent_ai_actions", businessId);
  const [snapshots, setSnapshots] = useFirestoreCollection<any>("snapshots", businessId);
  const [revenueEvents, setRevenueEvents] = useFirestoreCollection<RevenueEvent>("revenue_events", businessId);
  const [employees, setEmployees, refreshEmployees] = useFirestoreCollection<EmployeeRecord>("employees", businessId, { tenantField: "businessEmail" });
  const [timeClockLogs, setTimeClockLogs, refreshTimeClockLogs] = useFirestoreCollection<TimeClockLog>("time_clock_logs", businessId);
  const [transactions, setTransactions] = useFirestoreCollection<Transaction>("transactions", businessId);
  const [accounts, setAccounts] = useFirestoreCollection<Account>("chart_of_accounts", businessId);
  const [journalEntries, setJournalEntries] = useFirestoreCollection<JournalEntry>("journal_entries", businessId);
  const [invoices, setInvoices] = useFirestoreCollection<Invoice>("invoices", businessId);
  const [generatedPdfDraft, setGeneratedPdfDraft] = useState<GeneratedPdfDraft | null>(null);
  const [estimatePrefill, setEstimatePrefill] = useState<EstimatePrefill | null>(null);
  const [pendingSignatureCapture, setPendingSignatureCapture] = useState<{ customerName?: string; customerPhone?: string; customerEmail?: string } | null>(null);
  const [bills, setBills] = useFirestoreCollection<Bill>("bills", businessId);
  const [vendors, setVendors] = useFirestoreCollection<Vendor>("vendors", businessId);
  // Read-only mirror for the Dashboard's Messages summary card -- MessagesPage
  // owns the real read/write subscription for the actual Messages screen.
  const [dashboardConversations] = useFirestoreCollection<any>("conversations", businessId);
  const [bankAccounts, setBankAccounts] = useFirestoreCollection<BankAccount>("bank_accounts", businessId);
  const [recurringTransactions, setRecurringTransactions] = useFirestoreCollection<RecurringTransaction>("recurring_transactions", businessId);
  const [mileageLogs, setMileageLogs] = useFirestoreCollection<MileageLog>("mileage_logs", businessId);
  const [budgets, setBudgets] = useFirestoreCollection<Budget>("budgets", businessId);
  const [salesTaxRates, setSalesTaxRates] = useFirestoreCollection<SalesTaxRate>("sales_tax_rates", businessId);
  const migratedCustomersForBusinessRef = useRef(new Set<string>());

  // Recover customer records saved by earlier builds before Firestore became
  // the canonical store. The migration runs once per business per session and
  // preserves record IDs, making it idempotent rather than duplicate seed.
  useEffect(() => {
    if (!businessId || loggedInUser?.isEmployee) return;
    const migrationKey = businessId.toLowerCase();
    if (migratedCustomersForBusinessRef.current.has(migrationKey)) return;
    migratedCustomersForBusinessRef.current.add(migrationKey);
    try {
      const raw = localStorage.getItem("ownerslocal_customers") || localStorage.getItem("leadforge_customers");
      const cached = raw ? JSON.parse(raw) : [];
      if (Array.isArray(cached) && cached.length > 0) {
        setCustomers(current => {
          const merged = new Map<string, Customer>();
          cached.forEach((customer: Customer) => customer?.id && merged.set(customer.id, customer));
          current.forEach(customer => merged.set(customer.id, customer));
          return [...merged.values()];
        });
      }
    } catch (error) {
      console.error("Couldn't migrate cached customers:", error);
    }
  }, [businessId, loggedInUser?.isEmployee, setCustomers]);

  // Delete only the original prototype's known demo rows if they were
  // persisted by an older build. Real inventory and time entries remain.
  useEffect(() => {
    if (inventoryList.some(isLegacyInventoryItem)) {
      setInventoryList((current) => current.filter((item) => !isLegacyInventoryItem(item)));
    }
  }, [inventoryList, setInventoryList]);

  useEffect(() => {
    if (timeClockLogs.some(isLegacyTimeLog)) {
      setTimeClockLogs((current) => current.filter((log) => !isLegacyTimeLog(log)));
    }
  }, [timeClockLogs, setTimeClockLogs]);

  // Seed the standard Chart of Accounts once per business -- every account
  // the app's own event-posting logic writes to must already exist so
  // journal entries never get silently dropped for lacking a target
  // account. Owners can still add unlimited custom accounts afterward.
  useEffect(() => {
    if (!businessId || accounts.length > 0) return;
    const seeded: Account[] = DEFAULT_CHART_OF_ACCOUNTS.map(a => ({ ...a, createdAt: new Date().toISOString() }));
    setAccounts(seeded);
  }, [businessId, accounts.length, setAccounts]);

  // Derived, never a separately-tracked number — a running total kept in
  // its own useState would silently reset to 0 on every reload/re-login
  // instead of reflecting what's actually been recognized. Includes both
  // job-completion revenue (revenueEvents) and manually-logged/scanned
  // income (transactions of type "income" — e.g. a photographed check) so
  // logging income actually moves this number, not just an ignored ledger.
  const completedJobsRevenue =
    revenueEvents.reduce((sum, e) => sum + e.amount, 0) +
    transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const [preSelectedDate, setPreSelectedDate] = useState<string | undefined>(undefined);
  const [preSelectedCustomerId, setPreSelectedCustomerId] = useState<string | undefined>(undefined);
  // Lets other pages deep-link into a specific Settings sub-section (e.g.
  // Roster's "Manage Roles" button) instead of dead-ending in an alert/toast
  // telling the user to go find it themselves.
  const [preSelectedSettingsSection, setPreSelectedSettingsSection] = useState<string | undefined>(undefined);

  // Test connection on boot
  useEffect(() => {
    validateConnection();
  }, []);

  // Track the logged-in-user email in localStorage across login/logout
  useEffect(() => {
    if (businessId) {
      localStorage.setItem("ownerslocal_logged_in_user_email", businessId);
    } else {
      localStorage.removeItem("ownerslocal_logged_in_user_email");
    }
  }, [businessId]);

  // Timer for Clocked In Duration
  useEffect(() => {
    let interval: any = null;
    if (isClockedIn) {
      interval = setInterval(() => {
        setClockInDuration(d => d + 1);
      }, 1000);
    } else {
      setClockInDuration(0);
    }
    return () => clearInterval(interval);
  }, [isClockedIn]);

  // Real field GPS tracking: while the employee is clocked in, keep
  // reporting real device fixes (not a fabricated moving dot) so managers
  // can see where field staff actually are on the Interactive Map, not just
  // their position at the moment they punched in. Runs app-wide (not just
  // while the Time Clock page is open) so tracking doesn't stop the second
  // someone navigates away, and stops the instant they clock out because the
  // effect's own dependency on isClockedIn tears the watch down -- no
  // separate location keeps reporting off the clock. Opt-in per employee
  // (set at invite time or later from Settings/Roster) -- an owner has no
  // employees record at all and is never tracked by this.
  const currentEmployeeGpsTrackingEnabled = !!employees.find(e => e.email === loggedInUser?.email)?.gpsTrackingEnabled;
  // Opt-in, per employee: the Snapshot camera feature (receipts, fuel
  // purchases, forms) is off for a field employee until an owner/manager
  // grants it from Documents -> Employee Snapshot -> Customize Employee
  // Folder. The owner and every non-employee account keep full access
  // regardless -- this only ever restricts an *employee* account.
  const currentEmployeeSnapshotPermissionEnabled = !!employees.find(e => e.email === loggedInUser?.email)?.snapshotPermissionEnabled;
  const canUseSnapshot = !loggedInUser?.isEmployee || currentEmployeeSnapshotPermissionEnabled;
  // The specific clock-in log this GPS trail belongs to -- lets every fix
  // get appended onto that one shift's permanent route record (see
  // ShiftRoute) in addition to the live position, without a second lookup.
  const currentClockInLogId = useMemo(() => {
    if (!loggedInUser?.email) return undefined;
    const myLogs = timeClockLogs
      .filter(log => log.employeeEmail === loggedInUser.email)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (!myLogs.length || myLogs[myLogs.length - 1].type === "Clock Out") return undefined;
    return [...myLogs].reverse().find(log => log.type === "Clock In")?.id;
  }, [timeClockLogs, loggedInUser?.email]);
  useEffect(() => {
    if (!isClockedIn || !loggedInUser?.email || !businessId) return;
    if (!currentEmployeeGpsTrackingEnabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let lastSentAt = 0;
    const MIN_INTERVAL_MS = 30000; // throttle writes; watchPosition can fire far more often than that

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSentAt < MIN_INTERVAL_MS) return;
        lastSentAt = now;
        void updateLiveLocation(businessId, loggedInUser.email, loggedInUser.name || loggedInUser.email, currentClockInLogId, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          capturedAt: new Date(pos.timestamp).toISOString()
        });
      },
      () => {
        // Denied/unavailable -- the map simply keeps showing the last real
        // fix it has (clock-in punch or an earlier live update) rather than
        // a fabricated position.
      },
      { enableHighAccuracy: true, maximumAge: 20000, timeout: 25000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isClockedIn, loggedInUser?.email, businessId, currentEmployeeGpsTrackingEnabled, currentClockInLogId]);

  // Firestore clock events are the source of truth. Rebuild the active
  // shift after navigation, reload, or returning from another page so the
  // employee remains clocked in until an explicit Clock Out event exists.
  useEffect(() => {
    if (!loggedInUser?.email) return;
    const myLogs = timeClockLogs
      .filter(log => log.employeeEmail === loggedInUser.email)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (!myLogs.length) return;
    const latest = myLogs[myLogs.length - 1];
    const active = latest.type !== "Clock Out";
    setIsClockedIn(active);
    if (active) {
      const lastClockIn = [...myLogs].reverse().find(log => log.type === "Clock In");
      setClockInTime(lastClockIn?.time || latest.time);
      let sessionStart = myLogs.map(log => log.type).lastIndexOf("Clock Out") + 1;
      const sessionLogs = myLogs.slice(sessionStart);
      let seconds = 0;
      let segmentStart: number | null = null;
      for (const log of sessionLogs) {
        const timestamp = new Date(log.timestamp).getTime();
        if (log.type === "Clock In" || log.type === "Break End") segmentStart = timestamp;
        if ((log.type === "Clock Out" || log.type === "Break Start") && segmentStart !== null) {
          seconds += Math.max(0, timestamp - segmentStart) / 1000;
          segmentStart = null;
        }
      }
      if (segmentStart !== null) seconds += Math.max(0, Date.now() - segmentStart) / 1000;
      setClockInDuration(Math.floor(seconds));
    } else {
      setClockInTime(null);
      setClockInDuration(0);
    }
  }, [timeClockLogs, loggedInUser?.email]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Keep digital clock updated
  useEffect(() => {
    if (!isLoggedIn) return;
    const timer = setInterval(() => {
      setLiveTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [isLoggedIn]);

  // Register this device for real push notifications (e.g. "clock in/out
  // needs your approval") once signed in. A clean no-op until
  // FIREBASE_VAPID_KEY is configured -- the real-time in-app Alert Center
  // above already works fully without it.
  useEffect(() => {
    if (!isLoggedIn || !loggedInUser?.email || !businessId) return;
    void registerForPushNotifications({ email: loggedInUser.email, businessId });
  }, [isLoggedIn, loggedInUser?.email, businessId]);

  const getVisibleScreens = () => {
    if (!loggedInUser) return [];

    // Determine which role we are currently viewing/simulating
    const activeRole = simulatedRole || loggedInUser.role;

    // The real owner account is never an employee record (only invited
    // staff get isEmployee: true) -- that's the reliable signal for full
    // access, not a role-string match. An older/inconsistent stored
    // `role` value must never silently lock the actual owner out of
    // screens. Workspace Simulator previews still go through the
    // restricted logic below on purpose.
    if (!simulatedRole && !loggedInUser.isEmployee) {
      return OS_SCREENS;
    }

    if (activeRole === "Owner") {
      return OS_SCREENS;
    }

    let perms: string[] = [];

    if (simulatedRole) {
      // Owner is previewing a role template before any real employee is
      // using it yet — there's no real employee profile to read, so fall
      // back to the template's own module list.
      const normalizedRoleKey = activeRole.toLowerCase().replace(/ /g, "_");
      const customRoleMatch = selectedRoles.find(r => r.name === activeRole || r.id === normalizedRoleKey);
      if (customRoleMatch) {
        perms = [...customRoleMatch.permissions];
      } else {
        const defaultRoleMatch = DEFAULT_ROLES_DATA[normalizedRoleKey];
        perms = defaultRoleMatch ? [...defaultRoleMatch.permissions] : [...(loggedInUser.permissions || ["dashboard"])];
      }
    } else if (loggedInUser.granularPermissions) {
      // Real logged-in employee — their own stored per-module permission
      // is authoritative. A module belongs in the sidebar when any of its
      // independently configurable capabilities is enabled; otherwise a
      // role can show Time Clock (or another module) in the permission
      // matrix while leaving the employee with no way to open it. Older
      // employee profiles can have the module in the flat permissions list
      // without a granular entry, so retain that access until the profile is
      // next saved in the current format.
      perms = OS_SCREENS
        .map(s => s.id)
        .filter(id => {
          const granularEntry = loggedInUser.granularPermissions?.[id];
          if (granularEntry === undefined) {
            return loggedInUser.permissions?.includes(id) ?? false;
          }
          return (["view", "edit", "delete"] as const).some(action =>
            hasPermission(loggedInUser.granularPermissions, id, action)
          );
        });
    } else {
      // Legacy account from before granular permissions existed.
      perms = [...(loggedInUser.permissions || ["dashboard"])];
    }

    // Always allow the Dashboard to be viewed by everyone -- it isn't part
    // of the configurable module permission catalog (MODULE_CATALOG), same
    // as bulletins/snapshots/notifications below.
    if (!perms.includes("dashboard")) {
      perms.push("dashboard");
    }

    // Always allow bulletins to be viewed by everyone
    if (!perms.includes("bulletins")) {
      perms.push("bulletins");
    }

    // Always allow snapshots folder to be viewed by everyone
    if (!perms.includes("snapshots")) {
      perms.push("snapshots");
    }

    // Always allow notifications to be viewed by everyone
    if (!perms.includes("notifications")) {
      perms.push("notifications");
    }

    // Allow revenue & accounting for specific management/accounting roles
    const highPrivilegeRoles = ["Owner", "General Manager", "Office Manager", "Accountant", "Accountant / Bookkeeper"];
    if (highPrivilegeRoles.includes(activeRole)) {
      if (!perms.includes("revenue")) perms.push("revenue");
      if (!perms.includes("accounting")) perms.push("accounting");
    }

    return OS_SCREENS.filter(s => perms.includes(s.id));
  };

  // Onboarding Profile Settings States (start empty for every new account)
  const [ownerNames, setOwnerNames] = useState<string[]>([""]);
  const [ownerPhones, setOwnerPhones] = useState<string[]>([""]);
  const [businessNames, setBusinessNames] = useState<string[]>(["GreenPoint Lawn & Landscape"]);
  const [businessPhones, setBusinessPhones] = useState<string[]>(["(555) 200-1000"]);
  const [businessAddresses, setBusinessAddresses] = useState<string[]>(["4400 Ridgeview Dr, Suite 3, Haslet, TX 76052"]);
  const [businessLogos, setBusinessLogos] = useState<string[]>([""]);
  const [companyLocations, setCompanyLocations] = useState<string[]>([""]);

  // Keep the visible Business Setup form in sync when reviewed AI intake
  // updates the same Firestore business profile.
  useEffect(() => {
    const applyAiProfileUpdate = (event: Event) => {
      const update = (event as CustomEvent<Record<string, unknown>>).detail || {};
      if (Array.isArray(update.ownerNames)) setOwnerNames(update.ownerNames as string[]);
      if (Array.isArray(update.ownerPhones)) setOwnerPhones(update.ownerPhones as string[]);
      if (Array.isArray(update.businessNames)) setBusinessNames(update.businessNames as string[]);
      if (Array.isArray(update.businessPhones)) setBusinessPhones(update.businessPhones as string[]);
      if (Array.isArray(update.businessAddresses)) setBusinessAddresses(update.businessAddresses as string[]);
      if (Array.isArray(update.companyLocations)) setCompanyLocations(update.companyLocations as string[]);
    };
    window.addEventListener("ownerslocal:business-profile-updated", applyAiProfileUpdate);
    return () => window.removeEventListener("ownerslocal:business-profile-updated", applyAiProfileUpdate);
  }, []);

  const [optionalProfileFields, setOptionalProfileFields] = useState<string[]>([]);
  const [showOptionalProfileWarning, setShowOptionalProfileWarning] = useState(false);

  // Custom dialog overlays
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  
  // Sign Up Instructions Modal States
  const [showSignUpInstructions, setShowSignUpInstructions] = useState(false);
  const [signUpInstructionsStep, setSignUpInstructionsStep] = useState<"input" | "pending">("input");
  const [signUpInstructionsEmail, setSignUpInstructionsEmail] = useState("");
  const [signUpInstructionsBusinessName, setSignUpInstructionsBusinessName] = useState("");
  const [signUpInstructionsOwnerName, setSignUpInstructionsOwnerName] = useState("");
  const [signUpInstructionsPassword, setSignUpInstructionsPassword] = useState("");
  const [signUpInstructionsConfirmPassword, setSignUpInstructionsConfirmPassword] = useState("");
  const [signUpInstructionsError, setSignUpInstructionsError] = useState("");
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  
  // Forgot password email field
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitted, setForgotSubmitted] = useState(false);

  // New states for Dashboard Customizations, Bulletins, and Revenue Graph
  const [customCardTargets, setCustomCardTargets] = useState({
    card1: "revenue",
    card2: "leads",
    card3: "scheduling"
  });
  const [isCustomizingDailyViewOpen, setIsCustomizingDailyViewOpen] = useState(false);
  const [revenueResetInterval, setRevenueResetInterval] = useState("Pay Period");
  // None, some, or all three can show on the graph at once.
  const [graphDataTypes, setGraphDataTypes] = useState<Array<"revenue" | "expenses" | "profit">>(["revenue", "expenses", "profit"]);
  // Category filter for each of the two statement tables below the graph.
  // "all" is each table's default (every payment / every expense).
  const [paymentsTableFilter, setPaymentsTableFilter] = useState("all");
  const [expensesTableFilter, setExpensesTableFilter] = useState("all");
  const [newBulletinTitle, setNewBulletinTitle] = useState("");
  const [newBulletinContent, setNewBulletinContent] = useState("");
  const [isAddingBulletin, setIsAddingBulletin] = useState(false);
  const [payrollSearch, setPayrollSearch] = useState("");
  const [payrollSchedule, setPayrollSchedule] = useState<PayrollSchedule>("biweekly");
  const initialPayrollPeriod = scheduledPayrollPeriod("biweekly");
  const [payrollPeriodStart, setPayrollPeriodStart] = useState(initialPayrollPeriod.start);
  const [payrollPeriodEnd, setPayrollPeriodEnd] = useState(initialPayrollPeriod.end);
  const [payrollWorkweekStart, setPayrollWorkweekStart] = useState(0);
  const [payrollPayday, setPayrollPayday] = useState(5);
  const [payrollState, setPayrollState] = useState("TX");
  const [revenuePageFilter, setRevenuePageFilter] = useState("Pay Period");
  const [isFinancialSnapshotOpen, setIsFinancialSnapshotOpen] = useState(false);
  const [pinnedChartPoint, setPinnedChartPoint] = useState<{ label: number; payload: any[] } | null>(null);
  const [financialSnapshotCategory, setFinancialSnapshotCategory] = useState<
    "all" | "balance" | "unpaid_invoices" | "outstanding_expenses" | "payments_collected" | "expenses_paid"
  >("all");
  const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Same real double-entry numbers Accounting & Bookkeeping shows, reused
  // here so "View Financial Reports" doesn't have to navigate away --
  // each category's items come straight from the journal entries and open
  // invoices/bills those real actions already posted, nothing fabricated.
  const financialSnapshotData = useMemo(() => {
    const cashBalances: Record<string, number> = {};
    for (const acct of accounts) cashBalances[acct.id] = computeAccountBalance(acct, journalEntries);

    const cashLine = (entry: JournalEntry) => entry.lines.find(l => l.accountId === "acct_cash");
    const byDateDesc = <T extends { date: string }>(rows: T[]) => [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const byDateAsc = <T extends { date: string }>(rows: T[]) => [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const balanceItems = byDateDesc(
      journalEntries
        .filter(entry => cashLine(entry))
        .map(entry => {
          const line = cashLine(entry)!;
          return { id: entry.id, date: entry.date, memo: entry.memo, amount: line.debit - line.credit };
        })
    );

    const paymentsCollectedItems = byDateDesc(
      journalEntries
        .filter(entry => entry.source === "invoice_payment" || entry.source === "income")
        .map(entry => ({ id: entry.id, date: entry.date, memo: entry.memo, amount: cashLine(entry)?.debit || 0 }))
    );

    const expensesPaidItems = byDateDesc(
      journalEntries
        .filter(entry => entry.source === "bill_payment" || entry.source === "expense" || entry.source === "payroll")
        .map(entry => ({ id: entry.id, date: entry.date, memo: entry.memo, amount: cashLine(entry)?.credit || 0 }))
    );

    const unpaidInvoiceItems = byDateAsc(
      invoices
        .filter(inv => inv.status !== "paid" && inv.status !== "void")
        .map(inv => ({
          id: inv.id,
          date: inv.dueDate,
          memo: `Invoice ${inv.invoiceNumber} - ${inv.customer}`,
          amount: Math.max(0, invoiceTotal(inv) - inv.amountPaid)
        }))
    );

    const outstandingExpenseItems = byDateAsc(
      bills
        .filter(bill => bill.status !== "paid" && bill.status !== "void")
        .map(bill => ({
          id: bill.id,
          date: bill.dueDate,
          memo: bill.billNumber ? `Bill ${bill.billNumber} - ${bill.vendor}` : bill.vendor,
          amount: Math.max(0, bill.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0) - bill.amountPaid)
        }))
    );

    return {
      all: { label: "All Transactions", total: cashBalances["acct_cash"] || 0, items: balanceItems },
      balance: { label: "Current Balance", total: cashBalances["acct_cash"] || 0, items: balanceItems },
      unpaid_invoices: { label: "Unpaid Invoices", total: cashBalances["acct_ar"] || 0, items: unpaidInvoiceItems },
      outstanding_expenses: { label: "Outstanding Expenses", total: cashBalances["acct_ap"] || 0, items: outstandingExpenseItems },
      payments_collected: { label: "Payments Collected", total: paymentsCollectedItems.reduce((s, i) => s + i.amount, 0), items: paymentsCollectedItems },
      expenses_paid: { label: "Expenses Paid", total: expensesPaidItems.reduce((s, i) => s + i.amount, 0), items: expensesPaidItems }
    };
  }, [accounts, journalEntries, invoices, bills]);
  const [isGeneratingFinancialStatement, setIsGeneratingFinancialStatement] = useState(false);

  // Builds a real PDF statement from whichever category is currently open
  // in the Financial Reports pane -- same real numbers, saved to Documents
  // and opened for review, exactly like every other "Generate PDF" action
  // in the app.
  const handleGenerateFinancialStatementPdf = async () => {
    const category = financialSnapshotData[financialSnapshotCategory];
    setIsGeneratingFinancialStatement(true);
    try {
      const business = {
        name: businessNames[0] || "",
        phone: businessPhones[0] || "",
        address: businessAddresses[0] || "",
        email: businessId || "",
        logo: businessLogos[0] || ""
      };
      const transactionLines = category.items.length
        ? category.items.map(item => `${item.date}   ${item.memo}   ${fmtMoney(item.amount)}`)
        : ["No transactions in this category yet."];
      const bytes = await buildTextDocumentPdf(
        `Financial Statement - ${category.label}`,
        [
          { heading: "Summary", body: `${category.label}: ${fmtMoney(category.total)}\nGenerated ${new Date().toLocaleString()}` },
          { heading: "Transactions", body: transactionLines.join("\n") }
        ],
        business
      );
      const pdfBase64 = bytesToBase64(bytes);
      const filename = `Financial Statement - ${category.label} - ${new Date().toISOString().slice(0, 10)}.pdf`;
      const newDoc: DocumentItem = {
        id: `doc_statement_${Date.now()}`,
        name: filename,
        customer: "None",
        employee: loggedInUser?.name || "Staff Administrator",
        vendor: "None",
        job: "None",
        type: "Reports",
        folder: "Company",
        uploadedBy: loggedInUser?.name || "Staff Administrator",
        date: new Date().toISOString().split("T")[0],
        size: `${Math.max(1, Math.ceil(bytes.length / 1024))} KB`,
        status: "Draft",
        isFavorite: false,
        isArchived: false,
        notes: "Generated from Financial Reports.",
        tags: ["Financial Statement", "Generated"],
        estimateId: "None",
        invoiceId: "None",
        lastModified: new Date().toISOString().replace("T", " ").substring(0, 19)
      };
      if (pdfBase64.length <= MAX_INLINE_BASE64_LENGTH) {
        (newDoc as any).pdfBase64 = pdfBase64;
      } else {
        triggerNotification("This statement is too large to store inline -- the Documents record was saved, but regenerate it for a fresh copy since the file itself wasn't attached.");
      }
      setDocuments(prev => [...prev, newDoc]);
      setGeneratedPdfDraft({
        filename,
        title: `Financial Statement — ${category.label}`,
        sourceType: "Report",
        sourceId: financialSnapshotCategory,
        customerName: "",
        representativeName: loggedInUser?.name || "Company Representative",
        lines: [],
        pdfBase64
      });
      setIsFinancialSnapshotOpen(false);
      navigateToScreen("documents");
      if (logOperationalEvent) logOperationalEvent("Financial Statement Generated", filename, "📄");
    } finally {
      setIsGeneratingFinancialStatement(false);
    }
  };

  const [logTransactionType, setLogTransactionType] = useState<"income" | "expense" | null>(() => {
    const saved = sessionStorage.getItem("ownerslocal_pending_financial_scan");
    return saved === "income" || saved === "expense" ? saved : null;
  });
  const [isRunningPayroll, setIsRunningPayroll] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    const key = `ownerslocal_payroll_settings:${businessId}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved) {
        setPayrollSchedule(saved.schedule || "biweekly");
        setPayrollWorkweekStart(Number.isInteger(saved.workweekStart) ? saved.workweekStart : 0);
        setPayrollPayday(Number.isInteger(saved.payday) ? saved.payday : 5);
        setPayrollState(saved.state || "TX");
        const period = saved.schedule === "custom" && saved.start && saved.end ? { start: saved.start, end: saved.end } : scheduledPayrollPeriod(saved.schedule || "biweekly");
        setPayrollPeriodStart(period.start); setPayrollPeriodEnd(period.end);
      }
    } catch { /* fall back to safe defaults */ }
    getDoc(doc(db, "business_profiles", businessId)).then(snapshot => {
      const saved = snapshot.data()?.payrollSettings;
      if (!saved) return;
      setPayrollSchedule(saved.schedule || "biweekly");
      setPayrollWorkweekStart(Number.isInteger(saved.workweekStart) ? saved.workweekStart : 0);
      setPayrollPayday(Number.isInteger(saved.payday) ? saved.payday : 5);
      setPayrollState(saved.state || "TX");
      const period = saved.schedule === "custom" && saved.start && saved.end ? { start: saved.start, end: saved.end } : scheduledPayrollPeriod(saved.schedule || "biweekly");
      setPayrollPeriodStart(period.start); setPayrollPeriodEnd(period.end);
    }).catch(error => console.error("Couldn't load payroll settings:", error));
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    const payrollSettings = { schedule: payrollSchedule, start: payrollPeriodStart, end: payrollPeriodEnd, workweekStart: payrollWorkweekStart, payday: payrollPayday, state: payrollState, updatedAt: new Date().toISOString() };
    localStorage.setItem(`ownerslocal_payroll_settings:${businessId}`, JSON.stringify(payrollSettings));
    const timer = window.setTimeout(() => {
      setDoc(doc(db, "business_profiles", businessId), { payrollSettings }, { merge: true })
        .catch(error => console.error("Couldn't save payroll settings:", error));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [businessId, payrollSchedule, payrollPeriodStart, payrollPeriodEnd, payrollWorkweekStart, payrollPayday, payrollState]);

  // Pay Period is the first-use default. After the user picks another
  // graph interval, remember it per business through refreshes and logout/login.
  useEffect(() => {
    if (!businessId) return;
    const saved = localStorage.getItem(`ownerslocal_balance_view:${businessId}`);
    setRevenuePageFilter(["Day", "Week", "Pay Period", "Quarter", "Annual", "Total"].includes(saved || "") ? saved! : "Pay Period");
  }, [businessId]);

  const changeRevenuePageFilter = (view: string) => {
    setRevenuePageFilter(view);
    setPinnedChartPoint(null);
    if (businessId) localStorage.setItem(`ownerslocal_balance_view:${businessId}`, view);
  };

  // Global AI Widget States
  const [globalAiSetting, setGlobalAiSetting] = useState<"OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO">("ASSIST");
  const [moduleAiSettings, setModuleAiSettings] = useState<Record<string, "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO" | "DEFAULT">>({
    dashboard: "DEFAULT",
    revenue: "DEFAULT",
    customers: "DEFAULT",
    leads: "DEFAULT",
    estimates: "DEFAULT",
    scheduling: "DEFAULT",
    dispatch: "DEFAULT",
    routes: "DEFAULT",
    jobs: "DEFAULT",
    timeclock: "DEFAULT",
    inventory: "DEFAULT",
    documents: "DEFAULT",
    messages: "DEFAULT",
    training: "DEFAULT",
    settings: "DEFAULT",
    integrations: "DEFAULT",
    roster: "DEFAULT",
    bulletins: "DEFAULT",
    snapshots: "DEFAULT",
  });

  // Real, persisted "what your assistant knows" config -- fed into every
  // AI request's prompt (see buildBusinessSummary/openPageAIAnalysis) so
  // the tone/creativity/style notes the owner sets on the AI Assistant
  // page's Config tab actually change what comes back, and so it's still
  // there after a reload instead of resetting to defaults.
  const [aiKnowledgeBase, setAiKnowledgeBase] = useState<{
    selectedKBDoc: string;
    creativityLevel: number;
    aiTone: string;
    styleNotes: string;
  }>({ selectedKBDoc: "pricebook", creativityLevel: 70, aiTone: "analytical", styleNotes: "" });
  const aiSettingsLoadedRef = React.useRef(false);
  const aiSettingsHydratingRef = React.useRef(false);

  // Auto-persists globalAiSetting/moduleAiSettings/aiKnowledgeBase to this
  // business's Firestore profile the moment any of them change -- this is
  // the real save path "Save Changes" (AI Assistant Config tab), the
  // global/per-module dropdowns (AI Assistant, Settings), and Owner
  // Console's Pause/Resume AI button all share, instead of each holding
  // its own throwaway local state.
  useEffect(() => {
    if (!businessId || !aiSettingsLoadedRef.current || aiSettingsHydratingRef.current) return;
    const handle = setTimeout(() => {
      setDoc(doc(db, "business_profiles", businessId), { globalAiSetting, moduleAiSettings, aiKnowledgeBase }, { merge: true }).catch(err => console.error("Error saving AI settings:", err));
    }, 500);
    return () => clearTimeout(handle);
  }, [businessId, globalAiSetting, moduleAiSettings, aiKnowledgeBase]);

  // Floating AI Widget UI States
  const [isFloatingAiOpen, setIsFloatingAiOpen] = useState(false);
  // Draggable position for the Owner's AI floating widget -- null means
  // "use the default bottom-right dock." Persisted so it stays wherever the
  // owner last dragged it, across reloads, and clamped to the viewport so it
  // can never end up stuck off-screen or covering something unreachable.
  const aiWidgetViewportInset = useVisualViewportBottomRight();
  const [aiWidgetPos, setAiWidgetPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem("ownersLocalOS_aiWidgetPos");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const aiDragState = React.useRef<{ dragging: boolean; startX: number; startY: number; originX: number; originY: number }>({
    dragging: false, startX: 0, startY: 0, originX: 0, originY: 0
  });

  const clampAiWidgetPos = (x: number, y: number, width: number, height: number) => ({
    x: Math.min(Math.max(x, 8), window.innerWidth - width - 8),
    y: Math.min(Math.max(y, 8), window.innerHeight - height - 8)
  });

  // Re-clamp whenever the panel opens (it's much larger than the toggle
  // pill) so a position saved while collapsed can never open partly
  // off-screen or hidden behind the edge of the viewport.
  useEffect(() => {
    if (isFloatingAiOpen && aiWidgetPos) {
      setAiWidgetPos((prev) => (prev ? clampAiWidgetPos(prev.x, prev.y, 384, 550) : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFloatingAiOpen]);

  const startAiWidgetDrag = (e: React.PointerEvent, widthGuess: number, heightGuess: number) => {
    const target = e.currentTarget as HTMLElement;
    const widget = target.closest("#floating-ai-widget") as HTMLElement | null;
    const rect = widget?.getBoundingClientRect();
    const originX = aiWidgetPos?.x ?? (rect ? rect.left : window.innerWidth - widthGuess - 24);
    const originY = aiWidgetPos?.y ?? (rect ? rect.top : window.innerHeight - heightGuess - 96);
    aiDragState.current = { dragging: false, startX: e.clientX, startY: e.clientY, originX, originY };

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - aiDragState.current.startX;
      const dy = moveEvent.clientY - aiDragState.current.startY;
      if (!aiDragState.current.dragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        aiDragState.current.dragging = true;
      }
      if (aiDragState.current.dragging) {
        const next = clampAiWidgetPos(aiDragState.current.originX + dx, aiDragState.current.originY + dy, widthGuess, heightGuess);
        setAiWidgetPos(next);
      }
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (aiDragState.current.dragging) {
        setAiWidgetPos((prev) => {
          try {
            if (prev) localStorage.setItem("ownersLocalOS_aiWidgetPos", JSON.stringify(prev));
          } catch {
            // ignore storage failures
          }
          return prev;
        });
      }
      aiDragState.current.dragging = false;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };
  const [floatingAiTab, setFloatingAiTab] = useState<"ask" | "actions" | "settings" | "recent">("ask");
  const [floatingAiInput, setFloatingAiInput] = useState("");
  const [floatingAiMessages, setFloatingAiMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([
    {
      sender: "ai",
      text: "### 🤖 Owner's AI Companion\n\nI am connected to your live Local OS viewport. Ask me anything, or run automated actions for this workspace module!\n\n*Try asking me to perform an action, or select one from the Page Actions tab.*"
    }
  ]);
  const [floatingAiLoading, setFloatingAiLoading] = useState(false);

  // SNAPSHOT ARCHIVES STATE & MUTATIONS
  const [isFlashing, setIsFlashing] = useState(false);

  const createAndAddSnapshot = (pageId: string, pageName: string, metaData?: any) => {
    setIsFlashing(true);
    setTimeout(() => {
      setIsFlashing(false);
    }, 450);

    const now = new Date();
    const formattedDate = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timestampStr = `${formattedDate}, ${formattedTime}`;

    const dateSlug = now.toISOString().slice(0, 10).replace(/-/g, '_');
    const timeSlug = now.toTimeString().slice(0, 5).replace(/:/g, '');
    const filenameStr = `ownerslocal_snap_${pageId}_${dateSlug}_${timeSlug}.png`;

    const newSnapshot = {
      id: `snap_${now.getTime()}_${Math.random().toString(36).substring(2, 7)}`,
      pageId,
      pageName,
      timestamp: timestampStr,
      filename: filenameStr,
      fileSize: `${Math.floor(400 + Math.random() * 200)} KB`,
      meta: {
        recordCount: Number(metaData?.recordCount) || 0,
        filters: String(metaData?.filters || "Default Filters"),
        details: String(metaData?.details || `${pageName} operational snapshot captured during the current user session.`)
      },
      createdAt: now.toISOString()
    };

    setSnapshots(prev => [newSnapshot, ...prev]);
    triggerNotification(`Snapshot captured: ${filenameStr} saved to Snapshots Folder`);
  };

  // Standalone demo build: no real Firebase Auth session to listen for --
  // loggedInUser/isLoggedIn are already set to the fake demo Owner as their
  // initial state above. Skip the listener entirely (it would otherwise
  // fire once with user=null against the disconnected config and reset
  // both back to logged-out).
  useEffect(() => {
    setAuthReady(true);
  }, []);

  // Sync Time Clock state to Firestore
  useEffect(() => {
    if (!loggedInUser?.email || !isTimeClockLoadedRef.current) return;
    const saveTimeClock = async () => {
      try {
        await setDoc(doc(db, "timeclock_states", loggedInUser.email), {
          isClockedIn,
          clockInTime,
          clockInDuration,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.error("Failed to save time clock state:", err);
      }
    };
    saveTimeClock();
  }, [isClockedIn, clockInTime, loggedInUser]);

  const takeSnapshot = (pageId: string, pageName: string, metaData?: any) => {
    // A Snapshot is an archive of the module's state, not a camera upload.
    // Saving used to wait for a hidden file chooser; cancelling it produces
    // no change event, so both module and AI snapshot actions silently did
    // nothing. Persist the lightweight state archive immediately. Avoiding a
    // base64 screenshot also keeps the Firestore document below its 1 MiB
    // limit on high-resolution phones.
    createAndAddSnapshot(pageId, pageName, metaData);
  };

  const handleCameraCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      // Fallback if no file was selected or camera was closed
      if (pendingSnapshotRef.current) {
        const { pageId, pageName, metaData } = pendingSnapshotRef.current;
        createAndAddSnapshot(pageId, pageName, metaData);
        pendingSnapshotRef.current = null;
      }
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      if (pendingSnapshotRef.current) {
        const { pageId, pageName, metaData } = pendingSnapshotRef.current;
        createAndAddSnapshot(pageId, pageName, metaData);
        pendingSnapshotRef.current = null;
      }
    };
    reader.readAsDataURL(file);

    // Reset input value so same file can be captured again
    event.target.value = "";
  };

  const deleteSnapshot = (id: string) => {
    setSnapshots(prev => prev.filter(s => s.id !== id));
    triggerNotification("Snapshot deleted from folder index");
  };

  function logOperationalEvent(type: string, desc: string, icon: string = "🤖", target?: { screen?: string; customerId?: string }) {
    triggerNotification(`${icon} ${type}: ${desc}`);
    const recipientEmail = loggedInUser?.email;
    if (recipientEmail) {
      const normalizedType = type.toLowerCase();
      // Doubles as the screen this notification opens when clicked (see
      // NotificationsPage), so every value here must be a real OS_SCREENS id.
      const category = normalizedType.includes("estimate") ? "estimates"
        : normalizedType.includes("job") ? "jobs"
        : normalizedType.includes("customer") ? "customers"
        : normalizedType.includes("lead") ? "leads"
        : normalizedType.includes("inventory") ? "inventory"
        : normalizedType.includes("invoice") || normalizedType.includes("payment") || normalizedType.includes("financial") ? "revenue"
        : normalizedType.includes("message") ? "messages"
        : normalizedType.includes("schedule") ? "scheduling"
        : normalizedType.includes("document") || normalizedType.includes("snapshot") ? "documents"
        : "system";
      const now = new Date();
      setNotifications(prev => [{
        id: `notif_event_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
        category,
        title: type,
        description: desc,
        icon,
        time: now.toISOString().slice(0, 16).replace("T", " "),
        isRead: false,
        isArchived: false,
        isPinned: false,
        priority: "Normal",
        assignedUser: loggedInUser?.name || loggedInUser?.role || "Owner",
        recipientEmail,
        createdBy: loggedInUser?.name || recipientEmail,
        history: [`${now.toISOString()}: ${type} completed.`],
        screenId: target?.screen || (category === "system" ? undefined : category),
        relatedCustomerId: target?.customerId
      }, ...prev]);
    }
    const newAct = {
      id: "act_sec_" + Math.random().toString(36).substring(2, 9),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      module: type,
      action: desc,
      reason: "Security tracking log",
      status: "Completed" as const,
      approvedBy: loggedInUser?.name || "System"
    };
    setRecentAiActions(prev => [newAct, ...prev]);
  }

  // AI PAGE ANALYSIS STATE & DIALOG ENGINE
  const [isAIAnalysisOpen, setIsAIAnalysisOpen] = useState(false);
  const [aiPageId, setAiPageId] = useState("");
  const [aiPageName, setAiPageName] = useState("");
  const [aiCustomContext, setAiCustomContext] = useState("");
  const [aiMessages, setAiMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([]);
  const [aiInputMessage, setAiInputMessage] = useState("");
  const [aiIsLoading, setAiIsLoading] = useState(false);
  const [pendingAiAction, setPendingAiAction] = useState<{ type: "drawer" | "floating"; query: string; customText?: string } | null>(null);

  // Grounded, confirmation-gated data actions for the floating AI widget. Unlike the old
  // fake "autonomous actions" (which fabricated PO numbers/vendors and mutated data from
  // keyword matching with zero confirmation), these are computed from real live data and
  // require an explicit approval click before anything is written.
  type PendingDataAction =
    | { type: "reorder"; item: InventoryItem; suggestedQty: number }
    | { type: "reschedule"; event: SchedulingEvent; newDate: string };
  const [pendingDataAction, setPendingDataAction] = useState<PendingDataAction | null>(null);

  const proposeReorderAction = () => {
    const lowStock = inventoryList.filter(i => i.quantity <= i.minQuantity);
    if (lowStock.length === 0) {
      setFloatingAiMessages(prev => [...prev, { sender: "ai", text: "No inventory items are currently at or below their minimum stock threshold — nothing needs reordering right now." }]);
      return;
    }
    const item = lowStock[0];
    const suggestedQty = Math.max(item.maxQuantity - item.quantity, 1);
    setPendingDataAction({ type: "reorder", item, suggestedQty });
  };

  const proposeRescheduleAction = () => {
    const upcoming = schedulingEvents
      .filter(e => e.status === "Scheduled")
      .sort((a, b) => a.date.localeCompare(b.date));
    if (upcoming.length === 0) {
      setFloatingAiMessages(prev => [...prev, { sender: "ai", text: "There are no scheduled jobs to reschedule." }]);
      return;
    }
    const event = upcoming[0];
    const [y, m, d] = event.date.split("-").map(Number);
    const next = new Date(y, (m || 1) - 1, (d || 1) + 1);
    const newDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    setPendingDataAction({ type: "reschedule", event, newDate });
  };

  const confirmPendingDataAction = () => {
    if (!pendingDataAction) return;
    if (pendingDataAction.type === "reorder") {
      const { item, suggestedQty } = pendingDataAction;
      logOperationalEvent(
        "Reorder Flagged",
        `${item.name}: ${item.quantity} on hand (min ${item.minQuantity}). Flagged for reorder of ${suggestedQty} units${item.vendor ? ` from ${item.vendor}` : " (no vendor on file)"}.`,
        "📦"
      );
      triggerNotification(`Reorder flagged for ${item.name} (${suggestedQty} units)`);
    } else {
      const { event, newDate } = pendingDataAction;
      setSchedulingEvents(prev => prev.map(e => (e.id === event.id ? { ...e, date: newDate } : e)));
      logOperationalEvent("Job Rescheduled", `Moved ${event.customer}'s job from ${event.date} to ${newDate}.`, "📅");
      triggerNotification(`Moved ${event.customer}'s job to ${newDate}`);
    }
    setFloatingAiMessages(prev => [...prev, { sender: "ai", text: "✅ Done — approved and applied." }]);
    setPendingDataAction(null);
  };

  // Resolves what a given module (page) is actually allowed to do right
  // now: the module's own dropdown wins when set, otherwise it inherits
  // the global setting -- and the global setting itself is what Owner
  // Console's Pause/Resume AI button controls (OFF).
  const resolveAiMode = (pageId: string): "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO" => {
    const moduleSetting = moduleAiSettings[pageId];
    if (!moduleSetting || moduleSetting === "DEFAULT") return globalAiSetting;
    return moduleSetting;
  };

  const openPageAIAnalysis = (pageId: string, pageName: string, customContext?: string) => {
    setAiPageId(pageId);
    setAiPageName(pageName);
    const resolvedContext = customContext || "";
    setAiCustomContext(resolvedContext);
    setIsAIAnalysisOpen(true);

    if (resolveAiMode(pageId) === "OFF") {
      setAiMessages([{ sender: "ai", text: `The AI assistant is turned off for ${pageName} (Owner Console or the AI Assistant's module settings). Turn it back on to ask a question here.` }]);
      return;
    }

    setAiIsLoading(true);
    const isOwnerOrAdmin = (simulatedRole || loggedInUser?.role || "Owner") === "Owner" || (simulatedRole || loggedInUser?.role || "Owner") === "Admin";
    const businessSummary = buildBusinessSummary(pageId);

    fetch("/api/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, pageName, customContext: resolvedContext, businessSummary, isOwnerOrAdmin, styleGuidance: buildStyleGuidance(aiKnowledgeBase) })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "AI request failed");
        setAiMessages([{ sender: "ai", text: data.text }]);
      })
      .catch((err) => {
        setAiMessages([{
          sender: "ai",
          text: `⚠️ AI request failed: ${err instanceof Error ? err.message : "Unknown error"}. Make sure GEMINI_API_KEY is configured on the server.`
        }]);
      })
      .finally(() => setAiIsLoading(false));
  };

  // Builds a real (not fabricated) summary of live business data for the AI prompt, scoped to the page being analyzed.
  const buildBusinessSummary = (pageId: string): string => {
    const pastDue = customers.filter(c => c.status === "Past Due");
    const totalPastDue = pastDue.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
    const topCustomer = [...customers].sort((a, b) => (b.lifetimeValue || 0) - (a.lifetimeValue || 0))[0];

    switch (pageId) {
      case "dashboard":
        return [
          `Customers: ${customers.length} total, ${pastDue.length} past due ($${totalPastDue.toLocaleString()} outstanding)`,
          `Leads: ${leads.length} total, ${leads.filter(l => l.status === "New").length} new`,
          `Estimates: ${estimates.length} total, ${estimates.filter(e => e.status === "Sent" || e.status === "Viewed").length} awaiting response`,
          `Scheduled jobs: ${schedulingEvents.filter(e => e.status === "Scheduled").length} upcoming, ${schedulingEvents.filter(e => e.status === "Completed").length} completed`,
          `Revenue recognized from completed jobs: $${completedJobsRevenue.toLocaleString()}`
        ].join("\n");
      case "customers":
        return [
          `Total customers: ${customers.length}`,
          `Past due: ${pastDue.length} accounts, $${totalPastDue.toLocaleString()} total outstanding`,
          `VIP customers: ${customers.filter(c => c.isVIP).length}`,
          topCustomer ? `Highest lifetime value: ${topCustomer.company} at $${(topCustomer.lifetimeValue || 0).toLocaleString()}` : ""
        ].filter(Boolean).join("\n");
      case "leads":
        return [
          `Total leads: ${leads.length}`,
          `By status: ${Object.entries(leads.reduce((acc: Record<string, number>, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {})).map(([s, c]) => `${s}: ${c}`).join(", ")}`,
          `Total pipeline value: $${leads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0).toLocaleString()}`
        ].join("\n");
      case "estimates":
        return [
          `Total estimates: ${estimates.length}`,
          `By status: ${Object.entries(estimates.reduce((acc: Record<string, number>, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc; }, {})).map(([s, c]) => `${s}: ${c}`).join(", ")}`,
          `Total estimate value: $${estimates.reduce((sum, e) => sum + (e.amount || 0), 0).toLocaleString()}`
        ].join("\n");
      case "inventory":
        return [
          `Total inventory items: ${inventoryList.length}`,
          `Low stock (below minimum): ${inventoryList.filter(i => i.quantity <= i.minQuantity).length}`
        ].join("\n");
      default:
        return `${customers.length} customers, ${leads.length} leads, ${estimates.length} estimates, ${schedulingEvents.length} scheduled events on record.`;
    }
  };

  const executeConfirmedAIMessage = (query: string) => {
    if (resolveAiMode(aiPageId) === "OFF") {
      setAiMessages(prev => [...prev, { sender: "ai", text: `The AI assistant is turned off for ${aiPageName}. Turn it back on in Owner Console or the AI Assistant's module settings.` }]);
      return;
    }
    setAiIsLoading(true);
    const isOwnerOrAdmin = (simulatedRole || loggedInUser?.role || "Owner") === "Owner" || (simulatedRole || loggedInUser?.role || "Owner") === "Admin";
    const conversation = aiMessages.map(m => ({ role: (m.sender === "user" ? "user" : "model") as "user" | "model", text: m.text }));

    fetch("/api/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageId: aiPageId,
        pageName: aiPageName,
        businessSummary: buildBusinessSummary(aiPageId),
        isOwnerOrAdmin,
        conversation,
        query,
        styleGuidance: buildStyleGuidance(aiKnowledgeBase)
      })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "AI request failed");
        setAiMessages(prev => [...prev, { sender: "ai", text: data.text }]);
      })
      .catch((err) => {
        setAiMessages(prev => [...prev, {
          sender: "ai",
          text: `⚠️ AI request failed: ${err instanceof Error ? err.message : "Unknown error"}.`
        }]);
      })
      .finally(() => setAiIsLoading(false));
  };

  const handleSendAIMessage = () => {
    if (!aiInputMessage.trim()) return;

    const userMsgText = aiInputMessage;
    setAiMessages(prev => [...prev, { sender: "user", text: userMsgText }]);
    setAiInputMessage("");

    const lower = userMsgText.toLowerCase();
    const isFinancialQuery = lower.includes("past due") || lower.includes("balance") || lower.includes("unpaid") || lower.includes("debt") || lower.includes("highest") || lower.includes("top") || lower.includes("best") || lower.includes("profit") || lower.includes("revenue") || lower.includes("expense") || lower.includes("billing") || lower.includes("ltv") || lower.includes("lifetime") || lower.includes("financial") || lower.includes("invoice");

    const isOwnerOrAdmin = (simulatedRole || loggedInUser?.role || "Owner") === "Owner" || (simulatedRole || loggedInUser?.role || "Owner") === "Admin";

    if (isFinancialQuery) {
      if (!isOwnerOrAdmin) {
        setAiIsLoading(true);
        setTimeout(() => {
          let blockedText = "";
          if (lower.includes("past due") || lower.includes("balance") || lower.includes("unpaid") || lower.includes("debt") || lower.includes("invoice")) {
            blockedText = "🚫 **Access Denied (Role Check Failed)**: You are simulating or logged in with a lower-permission role. Access to sensitive unpaid balances, customer debt records, or billing sheets is strictly restricted to Owner or Admin roles.";
          } else {
            const topCustomer = customers.length > 0 ? [...customers].sort((a, b) => b.lifetimeValue - a.lifetimeValue)[0] : null;
            const topLead = leads.length > 0 ? [...leads].sort((a, b) => b.estimatedValue - a.estimatedValue)[0] : null;
            if (aiPageId === "customers") {
              blockedText = topCustomer
                ? `Your highest value client is **${topCustomer.contact}** representing **${topCustomer.company}** with a Lifetime Value of **[REDACTED - OWNER ONLY]**. They have ${topCustomer.openJobs} open jobs currently.`
                : "No customers on record yet.";
            } else if (aiPageId === "leads") {
              blockedText = topLead
                ? `The highest value lead is **${topLead.name}** representing **${topLead.source}** source with an estimated contract value of **[REDACTED - OWNER ONLY]**, currently marked in '${topLead.status}' status.`
                : "No leads on record yet.";
            } else if (topCustomer) {
              const sourceCounts: Record<string, number> = {};
              leads.forEach((l) => { sourceCounts[l.source] = (sourceCounts[l.source] || 0) + 1; });
              const topSourceEntry = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];
              blockedText = `Based on our records, **${topCustomer.contact} (${topCustomer.company})** is the top customer (**[REDACTED - OWNER ONLY]** LTV)${topSourceEntry ? `, and your most consistent acquisition source is ${topSourceEntry[0]}` : ""}.`;
            } else {
              blockedText = "No customer or lead data on record yet.";
            }
          }
          setAiMessages(prev => [...prev, { sender: "ai", text: blockedText }]);
          setAiIsLoading(false);
        }, 600);
        return;
      }

      setPendingAiAction({
        type: "drawer",
        query: userMsgText
      });
      return;
    }

    executeConfirmedAIMessage(userMsgText);
  };

  const executeConfirmedFloatingAiMessage = (query: string, _customText?: string) => {
    setFloatingAiLoading(true);
    const isOwnerOrAdmin = (simulatedRole || loggedInUser?.role || "Owner") === "Owner" || (simulatedRole || loggedInUser?.role || "Owner") === "Admin";
    const conversation = floatingAiMessages.map(m => ({ role: (m.sender === "user" ? "user" : "model") as "user" | "model", text: m.text }));

    fetch("/api/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageId: activeScreen.id,
        pageName: activeScreen.label,
        businessSummary: buildBusinessSummary(activeScreen.id),
        isOwnerOrAdmin,
        conversation,
        query
      })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "AI request failed");
        setFloatingAiMessages(prev => [...prev, { sender: "ai", text: data.text }]);
      })
      .catch((err) => {
        setFloatingAiMessages(prev => [...prev, {
          sender: "ai",
          text: `⚠️ AI request failed: ${err instanceof Error ? err.message : "Unknown error"}.`
        }]);
      })
      .finally(() => setFloatingAiLoading(false));
  };

  const handleSendFloatingAiMessage = (customText?: string) => {
    const textToSend = customText || floatingAiInput;
    if (!textToSend.trim()) return;

    setFloatingAiMessages(prev => [...prev, { sender: "user", text: textToSend }]);
    setFloatingAiInput("");

    const lowerText = textToSend.toLowerCase();
    const isFinancialQuery = lowerText.includes("past due") || lowerText.includes("balance") || lowerText.includes("unpaid") || lowerText.includes("debt") || lowerText.includes("highest") || lowerText.includes("top") || lowerText.includes("best") || lowerText.includes("profit") || lowerText.includes("revenue") || lowerText.includes("expense") || lowerText.includes("billing") || lowerText.includes("ltv") || lowerText.includes("lifetime") || lowerText.includes("financial") || lowerText.includes("invoice");

    const isOwnerOrAdmin = (simulatedRole || loggedInUser?.role || "Owner") === "Owner" || (simulatedRole || loggedInUser?.role || "Owner") === "Admin";

    if (isFinancialQuery) {
      if (!isOwnerOrAdmin) {
        setFloatingAiLoading(true);
        setTimeout(() => {
          let blockedText = "";
          if (lowerText.includes("why did profit drop") || lowerText.includes("past due") || lowerText.includes("balance") || lowerText.includes("unpaid") || lowerText.includes("debt") || lowerText.includes("invoice")) {
            blockedText = "🚫 **Access Denied (Role Check Failed)**: You are simulating or logged in with a lower-permission role. Access to sensitive unpaid balances, customer debt records, or billing sheets is strictly restricted to Owner or Admin roles.";
          } else {
            blockedText = `### 🤖 Owner's AI Solution
Processed context query for **${activeScreen.label} Page**:
- **User Role**: ${simulatedRole || loggedInUser?.role || "Owner"}
- **Lifetime Value**: **[REDACTED - OWNER ONLY]**
- **Outstanding Balance**: **[REDACTED - OWNER ONLY]**

Access to full financial telemetry is restricted.`;
          }
          setFloatingAiMessages(prev => [...prev, { sender: "ai", text: blockedText }]);
          setFloatingAiLoading(false);
        }, 600);
        return;
      }

      setPendingAiAction({
        type: "floating",
        query: textToSend,
        customText: customText
      });
      return;
    }

    // Grounded, confirmation-gated actions: these PROPOSE a real change computed from live
    // data and require an explicit Approve click (see pendingDataAction) before anything is
    // written — no data mutation happens directly from parsing this text.
    if (lowerText.includes("order more") && activeScreen.id === "inventory") {
      proposeReorderAction();
      return;
    }
    if (lowerText.includes("move") && lowerText.includes("tomorrow") && activeScreen.id === "scheduling") {
      proposeRescheduleAction();
      return;
    }

    executeConfirmedFloatingAiMessage(textToSend);
  };

  // TEAM BUILDER STATE - Owner always gets every module at full access;
  // every other starter role gets an independent per-module level, not one
  // tier applied blanket -- managers default to Create & Edit on their
  // department's modules, base employees default to View except on the
  // handful of modules their job actually requires editing.
  const [selectedRoles, setSelectedRoles] = useState<SelectedRole[]>([
    {
      id: "owner",
      name: "Owner",
      count: 1,
      description: "Full access to every module",
      permissions: MODULE_CATALOG.map(m => m.id),
      modulePermissions: fullAccessGranular(MODULE_CATALOG.map(m => m.id))
    }
  ]);
  
  // Custom dialogs & UI states for team setup
  const [customizingRole, setCustomizingRole] = useState<SelectedRole | null>(null);
  const [showRoleInfoPopup, setShowRoleInfoPopup] = useState<string | null>(null);
  const [showCustomRoleModal, setShowCustomRoleModal] = useState(false);
  const [customRoleName, setCustomRoleName] = useState("");
  const [roleIdPendingDelete, setRoleIdPendingDelete] = useState<string | null>(null);
  
  // Generated invites state for modal
  const [generatedInvites, setGeneratedInvites] = useState<Array<{ code: string; role: string; permissions: string[]; granularPermissions?: GranularPermissions }>>([]);
  const [showInvitesModal, setShowInvitesModal] = useState(false);

  useEffect(() => {
    refSecurityLogged.current = {};
  }, [loggedInUser, simulatedRole]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const activeRole = simulatedRole || loggedInUser?.role || "Owner";
    if (activeRole === "Technician" && (activeScreen.id === "owner_console" || activeScreen.id === "revenue")) {
      if (!refSecurityLogged.current[activeScreen.id]) {
        refSecurityLogged.current[activeScreen.id] = true;
        logOperationalEvent("Security Violation", `Blocked unauthorized attempt to access page: ${activeScreen.label}`, "🚨");
      }
    }
  }, [activeScreen, isLoggedIn, loggedInUser, simulatedRole]);

  useEffect(() => {
    if (!loggedInUser) return;
    const isDemoUser = loggedInUser.email === "admin@ownerslocal.com" || loggedInUser.email === "sec_manager@ownerslocal.com";
    if (!isDemoUser) {
      // Clear all Ironclad Plumbing & HVAC demo data for a fresh start
      setCustomers([]);
      setDashboardLeads([]);
      setRecentRoster([]);
      setDocuments([]);
      setSchedulingEvents([]);
      
      // Load any existing profile settings if they exist in firestore
      const loadBizProfile = async () => {
        try {
          const bizSnap = await getDoc(doc(db, "business_profiles", loggedInUser.email));
          if (bizSnap.exists()) {
            const bizData = bizSnap.data();
            if (bizData.businessNames) setBusinessNames(bizData.businessNames);
            if (bizData.ownerNames) setOwnerNames(bizData.ownerNames);
            if (bizData.businessPhones) setBusinessPhones(bizData.businessPhones);
            if (bizData.businessAddresses) setBusinessAddresses(bizData.businessAddresses);
            if (bizData.businessLogos) setBusinessLogos(bizData.businessLogos.map((logo: string) => logo === "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=120&auto=format&fit=crop&q=60" ? "" : logo));
            if (bizData.companyLocations) setCompanyLocations(bizData.companyLocations);
          } else {
            // For brand-new accounts, start completely blank
            setBusinessNames([]);
            setOwnerNames([]);
            setBusinessPhones([]);
            setBusinessAddresses([]);
            setBusinessLogos([]);
            setCompanyLocations([]);
          }
        } catch (err) {
          console.error("Error loading non-demo business profile:", err);
        }
      };
      
      if (!loggedInUser.isEmployee) {
        loadBizProfile();
      }
    }
  }, [loggedInUser]);

  // Employee Onboarding form states
  const [empInviteCode, setEmpInviteCode] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empPassword, setEmpPassword] = useState("");
  const [empFirstName, setEmpFirstName] = useState("");
  const [empLastName, setEmpLastName] = useState("");
  const [empAddress, setEmpAddress] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empPhoto, setEmpPhoto] = useState("");
  const [empGoals, setEmpGoals] = useState("");
  const [empHourlyRate, setEmpHourlyRate] = useState("");

  // Trigger brief floating notifications
  const triggerNotification = (message: string) => {
    setShowNotification(message);
    setTimeout(() => {
      setShowNotification(null);
    }, 4000);
  };

  // Surface a real, user-facing warning whenever any Firestore-backed
  // collection's optimistic local write actually fails to save -- previously
  // the failure was only console.error'd, so the change looked saved for the
  // rest of the session and then silently vanished on the next reload.
  useEffect(() => {
    return onSyncError((message) => triggerNotification(message));
  }, []);

  const openPlaceholderPage = (label: string, icon: string) => {
    setActiveScreen({
      id: "placeholder_screen",
      label: label,
      icon: icon,
      url: ""
    });
    triggerNotification(`Navigated to Placeholder for: ${label}`);
  };

  // Canonical cross-page navigation: every page-to-page link (map pin, table
  // row, dropdown, card) should route through this so "many roads lead to the
  // same record" behaves identically everywhere, instead of each page call
  // site redefining its own copy of this logic.
  const navigateToScreen = (screenId: string, params?: { customerId?: string; date?: string; section?: string }) => {
    setPreSelectedCustomerId(params?.customerId ?? undefined);
    setPreSelectedDate(params?.date ?? undefined);
    setPreSelectedSettingsSection(params?.section ?? undefined);
    const matched = OS_SCREENS.find(s => s.id === screenId);
    if (matched) {
      setActiveScreen(matched);
    }
  };

  const handleOwnerSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = signUpInstructionsEmail.trim().toLowerCase();
    const cleanUser = signUpInstructionsBusinessName.trim();
    const cleanOwner = signUpInstructionsOwnerName.trim();
    const cleanPass = signUpInstructionsPassword.trim();

    if (!cleanUser || !cleanOwner || !cleanEmail || !cleanPass) {
      setSignUpInstructionsError("All fields are required.");
      return;
    }

    if (!validPersonName(cleanOwner)) {
      setSignUpInstructionsError("Enter the owner's name, not an email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setSignUpInstructionsError("Please enter a valid email address.");
      return;
    }

    if (cleanPass.length < 6) {
      setSignUpInstructionsError("Password must be at least 6 characters.");
      return;
    }

    if (cleanPass !== signUpInstructionsConfirmPassword) {
      setSignUpInstructionsError("Create Password and Confirm Password must match.");
      return;
    }

    setSignUpInstructionsError("");
    setIsSignUpSubmitting(true);

    // Keep the submitted company identity locally until both Auth and Firestore
    // finish. Firebase Auth can succeed just before a transient network failure;
    // this lets the next sign-in repair the otherwise orphaned owner account.
    localStorage.setItem("ownerslocalPendingOwnerSignup", JSON.stringify({
      email: cleanEmail,
      businessName: cleanUser,
      ownerName: cleanOwner
    }));

    try {
      // 1. Create real authentication user
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
      const user = userCredential.user;

      // 2. Create owner user profile document
      const ownerPermissions = ["dashboard", "customers", "leads", "estimates", "scheduling", "dispatch", "routes", "jobs", "timeclock", "inventory", "documents", "messages", "training", "ai_assistant", "settings", "integrations", "roster"];
      const userProfile = {
        uid: user.uid,
        email: cleanEmail,
        role: "Owner",
        permissions: ownerPermissions,
        granularPermissions: fullAccessGranular(ownerPermissions),
        name: cleanOwner,
        isEmployee: false,
        businessEmail: cleanEmail,
        isOnboarded: false,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, "user_profiles", user.uid), userProfile);

      // 3. Create owner business profile document in Firestore
      await setDoc(doc(db, "business_profiles", cleanEmail), {
        businessNames: [cleanUser],
        ownerNames: [cleanOwner],
        businessPhones: [""],
        businessAddresses: [""],
        businessLogos: [""],
        companyLocations: [""],
        updatedAt: new Date().toISOString()
      });
      // Brand-new account -- there are no existing AI settings to clobber,
      // so it's safe to start persisting real changes right away.
      aiSettingsLoadedRef.current = true;
      localStorage.removeItem("ownerslocalPendingOwnerSignup");

      let verificationEmailSent = false;
      try {
        await sendEmailVerification(user);
        verificationEmailSent = true;
      } catch (verificationError) {
        console.error("Could not send owner verification email:", verificationError);
      }

      // Update relevant states for consistency
      setEmail(cleanEmail);
      setPassword(cleanPass);
      setBusinessNames([cleanUser]);
      setOwnerNames([cleanOwner]);

      setLoggedInUser({
        email: cleanEmail,
        role: "Owner",
        permissions: userProfile.permissions,
        granularPermissions: userProfile.granularPermissions,
        isEmployee: false,
        name: cleanOwner,
        goals: ""
      });

      // Directly show Step 1 of Onboarding!
      setCurrentView("placeholder_password");
      setShowSignUpInstructions(false);
      triggerNotification(verificationEmailSent
        ? `Verification email sent to ${cleanEmail}. Check your inbox or spam folder.`
        : "Account created, but the verification email could not be sent. Try again from Account Settings.");
    } catch (err: any) {
      console.error("Error signing up:", err);
      let errMsg = err.message || "Unknown error";
      if (err.code === "auth/email-already-in-use") {
        errMsg = "This email address is already registered.";
      }
      setSignUpInstructionsError("Sign up failed: " + errMsg);
    } finally {
      setIsSignUpSubmitting(false);
    }
  };

  // Real Firebase Auth Password sign-in
  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (rememberMe) {
      localStorage.setItem("rememberMe", "true");
      localStorage.setItem("rememberedEmail", email);
      localStorage.setItem("rememberedPassword", password);
    } else {
      localStorage.removeItem("rememberMe");
      localStorage.removeItem("rememberedEmail");
      localStorage.removeItem("rememberedPassword");
    }

    // 1. Business Email must be a valid email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setLoginError("Please enter a valid business email address.");
      triggerNotification("Invalid email format.");
      return;
    }

    // 2. Password cannot be empty
    if (!cleanPass) {
      setLoginError("Password cannot be empty.");
      triggerNotification("Password cannot be empty.");
      return;
    }

    setLoginError(null);
    setIsSubmitting(true);
    setLoginMethod("password");
    
    try {
      // Authenticate with real Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
      const user = userCredential.user;

      // Fetch user profile from user_profiles to load their role and permissions
      const profileSnap = await getDoc(doc(db, "user_profiles", user.uid));
      if (profileSnap.exists()) {
        const profileData = profileSnap.data();
        const isEmployeeAcct = profileData.isEmployee ?? false;
        const resolvedPerms = profileData.permissions || ["dashboard", "customers", "leads", "estimates", "scheduling", "inventory", "documents", "messages", "settings"];
        setLoggedInUser({
          email: user.email || "",
          role: profileData.role || "Owner",
          permissions: resolvedPerms,
          granularPermissions: profileData.granularPermissions || (isEmployeeAcct ? defaultGranularFromModuleList(resolvedPerms, "edit") : fullAccessGranular(resolvedPerms)),
          isEmployee: isEmployeeAcct,
          name: validPersonName(profileData.name) || validPersonName(user.displayName) || "Owner",
          goals: profileData.goals || "",
          businessEmail: isEmployeeAcct ? profileData.businessEmail : (user.email || "")
        });
        setIsLoggedIn(true);

        const isEmployee = profileData.isEmployee ?? false;
        if (isEmployee) {
          const firstPermitted = OS_SCREENS.find(s => (profileData.permissions || []).includes(s.id)) || OS_SCREENS[0];
          setActiveScreen(firstPermitted);
          triggerNotification(`Signed in as employee: ${profileData.name || "User"} (${profileData.role})`);
        } else {
          setActiveScreen(OS_SCREENS[0]);
          triggerNotification(`Signed in as Owner`);
        }
      } else {
        const ownerPerms = DEFAULT_ROLES_DATA.owner.permissions;
        const pendingRaw = localStorage.getItem("ownerslocalPendingOwnerSignup");
        let pending: { email?: string; businessName?: string; ownerName?: string } | null = null;
        try { pending = pendingRaw ? JSON.parse(pendingRaw) : null; } catch { pending = null; }
        const recoverable = pending?.email?.toLowerCase() === cleanEmail;
        const ownerName = validPersonName(recoverable ? pending?.ownerName : user.displayName) || "Owner";

        if (recoverable) {
          await setDoc(doc(db, "user_profiles", user.uid), {
            uid: user.uid, email: cleanEmail, role: "Owner", permissions: ownerPerms,
            granularPermissions: fullAccessGranular(ownerPerms), name: ownerName,
            isEmployee: false, businessEmail: cleanEmail, isOnboarded: false,
            createdAt: new Date().toISOString()
          });
          await setDoc(doc(db, "business_profiles", cleanEmail), {
            businessNames: [pending?.businessName || "Your Business"], ownerNames: [ownerName],
            businessPhones: [""], businessAddresses: [""], businessLogos: [""],
            companyLocations: [""],
            updatedAt: new Date().toISOString()
          });
          localStorage.removeItem("ownerslocalPendingOwnerSignup");
        }
        setLoggedInUser({
          email: user.email || "",
          role: "Owner",
          permissions: ownerPerms,
          granularPermissions: fullAccessGranular(ownerPerms),
          isEmployee: false,
          name: ownerName,
          goals: ""
        });
        setIsLoggedIn(true);
        setActiveScreen(OS_SCREENS[0]);
        triggerNotification(`Signed in successfully.`);
      }
    } catch (err: any) {
      console.error("Error signing in with Firebase Auth:", err);
      let errMsg = "Incorrect password or email. Please try again.";
      if (err.code === "auth/user-not-found") {
        errMsg = "User account not found. Please sign up.";
      } else if (err.code === "auth/wrong-password") {
        errMsg = "Incorrect password. Please try again.";
      } else if (err.code === "auth/invalid-credential") {
        errMsg = "Invalid login credentials. Please check your email and password.";
      }
      setLoginError(errMsg);
      triggerNotification("Sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async () => {
    if (!forgotEmail) {
      triggerNotification("Please provide an email.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, forgotEmail.trim());
      setForgotSubmitted(true);
      triggerNotification("Password recovery email transmitted successfully!");
    } catch (err: any) {
      console.error("Password reset failed:", err);
      triggerNotification("Reset failed: " + (err.message || "Unknown error"));
    }
  };

  // Real Firestore check for Employee Invite code
  const handleInviteSignIn = async () => {
    const codeTrim = inviteCode.trim().toUpperCase();

    if (!codeTrim) {
      triggerNotification("Please enter an employee invite code.");
      return;
    }
    
    setIsSubmitting(true);
    setLoginMethod("invite");
    
    try {
      const inviteSnap = await getDoc(doc(db, "employee_invites", codeTrim));
      if (inviteSnap.exists()) {
        const inviteData = inviteSnap.data();
        if (inviteData.status === "completed") {
          triggerNotification("This code is already registered. Sign in with email above.");
          setIsSubmitting(false);
          return;
        }
        
        // Start Employee Onboarding Step 1 of 1
        setEmpInviteCode(codeTrim);
        setEmpEmail("");
        setEmpPassword("");
        setEmpFirstName("");
        setEmpLastName("");
        setEmpAddress("");
        setEmpPhone("");
        setEmpGoals("");
        setCurrentView("employee_onboarding");
        triggerNotification(`Invite verified for: ${inviteData.role}! Complete setup.`);
      } else {
        triggerNotification("Invite code not found in database. Please ask your owner or manager for a valid code.");
      }
    } catch (err) {
      console.error("Error verifying invite:", err);
      triggerNotification("Couldn't verify the invite code right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Real Google OAuth via Firebase Auth. This used to be a fake account
  // picker with 3 hardcoded emails that logged the user in as whichever
  // identity was clicked, with zero verification — a full authentication
  // bypass. signInWithPopup performs a real Google sign-in; the existing
  // onAuthStateChanged listener above already loads the resulting user's
  // real profile from user_profiles/{uid}, so no duplicate state-setting
  // logic is needed here.
  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setLoginMethod("google");
    try {
      const provider = new GoogleAuthProvider();
      if (Capacitor.isNativePlatform()) {
        // signInWithPopup needs real multi-window support, which Capacitor's
        // Android WebView doesn't have -- it just silently fails/hangs there.
        // signInWithRedirect navigates the WebView itself instead, which it
        // does support; the onAuthStateChanged listener above picks up the
        // result the same way either way.
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (err: any) {
      console.error("Google sign in error:", err);
      if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        setLoginError("Google sign-in failed. Please try again.");
        triggerNotification("Google sign-in failed.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Back to Login routine
  const handleBackToLogin = () => {
    setCurrentView("login");
  };

  const openBusinessProfileEditor = () => {
    setOnboardingErrors({});
    setShowOptionalProfileWarning(false);
    setCurrentView("placeholder_password");
    setIsLoggedIn(false);
    triggerNotification("Business Setup opened. Update Steps 1–2 and save when finished.");
  };

  // Logout routine
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsLoggedIn(false);
      setCurrentView("login");
      setLoginMethod(null);
      setPassword("••••••••••••••••");
      triggerNotification("Logged out of OwnersLOCAL.");
    } catch (err) {
      console.error("Logout error:", err);
      // Fallback
      setIsLoggedIn(false);
      setCurrentView("login");
      setLoginMethod(null);
      setPassword("••••••••••••••••");
    }
  };

  // Load business profile from Firestore on mount or when view transitions to onboarding
  useEffect(() => {
    const loadProfile = async () => {
      const profileEmail = businessId || email;
      if (!profileEmail) return;
      try {
        const docRef = doc(db, "business_profiles", profileEmail);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.ownerNames) setOwnerNames(data.ownerNames);
          if (data.ownerPhones) setOwnerPhones(data.ownerPhones);
          if (data.businessNames) setBusinessNames(data.businessNames);
          if (data.businessPhones) setBusinessPhones(data.businessPhones);
          if (data.businessAddresses) setBusinessAddresses(data.businessAddresses);
          if (data.businessLogos) setBusinessLogos(data.businessLogos.map((logo: string) => logo === "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=120&auto=format&fit=crop&q=60" ? "" : logo));
          if (data.companyLocations) setCompanyLocations(data.companyLocations);
          if (Array.isArray(data.selectedRoles) && data.selectedRoles.length) setSelectedRoles(normalizeSelectedRoles(data.selectedRoles));
          triggerNotification("Synced business profile from cloud database!");
        }
      } catch (err) {
        console.error("Error loading profile from Firestore:", err);
      }
    };

    if (currentView === "placeholder_google" || currentView === "placeholder_password" || currentView === "placeholder_invite") {
      loadProfile();
    }
  }, [currentView, email, businessId]);

  const saveProfileToFirestore = async () => {
    const profileEmail = businessId || email;
    if (!profileEmail) return;
    try {
      const docRef = doc(db, "business_profiles", profileEmail);
      await setDoc(docRef, {
        ownerNames,
        ownerPhones,
        businessNames,
        businessPhones,
        businessAddresses,
        businessLogos,
        companyLocations,
        selectedRoles: normalizeSelectedRoles(selectedRoles),
        updatedAt: new Date().toISOString()
      });
      triggerNotification("Saved to cloud Firestore successfully!");
    } catch (err) {
      console.error("Error saving profile to Firestore:", err);
      triggerNotification("Cloud save failed. Please check connection.");
    }
  };

  const finishBusinessProfileStep = async () => {
    setShowOptionalProfileWarning(false);
    setOnboardingErrors({});
    setIsSubmitting(true);
    await saveProfileToFirestore();
    setIsSubmitting(false);
    setCurrentView("placeholder_team_setup");
  };

  const reviewBusinessProfileStep = async () => {
    const errors: Record<string, string> = {};
    const firstValue = (values: string[]) => String(values?.[0] || "").trim();
    const businessEmail = String(businessId || email || "").trim();

    if (!firstValue(ownerNames)) errors["account administrator name"] = "Account Administrator Name is required.";
    if (!firstValue(businessNames)) errors["business name"] = "Business Name is required.";
    if (!businessEmail) errors["business email"] = "Business Email is required.";

    if (Object.keys(errors).length) {
      setOnboardingErrors(errors);
      triggerNotification("Add the three required business-profile fields.");
      return;
    }

    const optional = [
      ["Administrator phone", firstValue(ownerPhones)],
      ["Business phone", firstValue(businessPhones)],
      ["Business headquarters address", firstValue(businessAddresses)],
      ["Business logo", firstValue(businessLogos)],
      ["Company locations", firstValue(companyLocations)]
    ].filter(([, value]) => !value).map(([label]) => label);

    if (optional.length) {
      setOptionalProfileFields(optional);
      setShowOptionalProfileWarning(true);
      return;
    }

    await finishBusinessProfileStep();
  };

  // Increment/Decrement role count
  const handleIncrementRoleCount = (roleId: string) => {
    setSelectedRoles(prev => prev.map(r => r.id === roleId ? { ...r, count: (Number.isFinite(Number(r.count)) ? Number(r.count) : 0) + 1 } : r));
  };

  const handleDecrementRoleCount = (roleId: string) => {
    setSelectedRoles(prev => {
      return prev.map(r => {
        if (r.id === roleId) {
          const newCount = (Number.isFinite(Number(r.count)) ? Number(r.count) : 0) - 1;
          return { ...r, count: Math.max(0, newCount) };
        }
        return r;
      });
    });
  };

  const handleRemoveRole = (roleId: string) => {
    if (roleId === "owner") {
      triggerNotification("Cannot remove the Owner role.");
      return;
    }
    setSelectedRoles(prev => prev.filter(r => r.id !== roleId));
    triggerNotification("Role removed successfully.");
  };

  // Add a role from the dropdown selection
  const handleAddRole = (roleId: string) => {
    if (roleId === "__create_custom__") {
      setShowCustomRoleModal(true);
      return;
    }
    const defaultData = DEFAULT_ROLES_DATA[roleId];
    if (!defaultData) return;
    
    // Check if already selected
    const exists = selectedRoles.find(r => r.id === roleId);
    if (exists) {
      handleIncrementRoleCount(roleId);
      triggerNotification(`Increased count for ${defaultData.name}`);
      return;
    }

    const newRole: SelectedRole = {
      id: roleId,
      name: defaultData.name,
      count: 1,
      description: defaultData.description,
      permissions: [...defaultData.permissions],
      modulePermissions: defaultGranularFromModuleList(defaultData.permissions, "edit")
    };
    setSelectedRoles(prev => [...prev, newRole]);
    triggerNotification(`Added role: ${defaultData.name}`);
  };

  // Duplicate an existing role
  const handleDuplicateRole = (role: SelectedRole) => {
    const randomId = "custom_" + Math.random().toString(36).substring(2, 7);
    const newRole: SelectedRole = {
      ...role,
      id: randomId,
      name: `${role.name} Copy`,
      isCustom: true,
      count: 1,
      modulePermissions: JSON.parse(JSON.stringify(role.modulePermissions))
    };
    setSelectedRoles(prev => [...prev, newRole]);
    triggerNotification(`Duplicated ${role.name}`);
  };

  // Create a brand new custom role
  const handleCreateCustomRole = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = customRoleName.trim();
    if (!cleanName) {
      triggerNotification("Please enter a custom role name.");
      return;
    }
    const existingRole = selectedRoles.find(role => role.name.trim().toLowerCase() === cleanName.toLowerCase());
    if (existingRole) {
      handleIncrementRoleCount(existingRole.id);
      setShowCustomRoleModal(false);
      setCustomRoleName("");
      triggerNotification(`${existingRole.name} already exists, so another seat was added instead.`);
      return;
    }
    const randomId = "custom_" + Math.random().toString(36).substring(2, 7);
    const newRole: SelectedRole = {
      id: randomId,
      name: cleanName,
      count: 1,
      description: "Custom user defined role",
      isCustom: true,
      permissions: ["dashboard", "messages"],
      modulePermissions: defaultGranularFromModuleList(["dashboard", "messages"], "view")
    };
    setSelectedRoles(prev => [...prev, newRole]);
    setShowCustomRoleModal(false);
    setCustomRoleName("");
    setCustomizingRole(newRole); // Open customize modal immediately for custom roles
    triggerNotification(`Created custom role: ${cleanName}`);
  };

  // Save customized permissions
  const handleSaveCustomPermissions = (updated: SelectedRole) => {
    setSelectedRoles(prev => prev.map(r => r.id === updated.id ? updated : r));
    setCustomizingRole(null);
    triggerNotification(`Updated permissions for ${updated.name}`);
  };

  // Save a real income/expense transaction -- typed manually or scanned via
  // real Gemini vision, always confirmed/edited by the user before saving.
  const handleSaveTransaction = async (t: Omit<Transaction, "id">) => {
    try {
      const newTxn: Transaction = { ...t, id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
      const journalEntry = postTransactionEntry(newTxn);
      if (!businessId) throw new Error("Missing business account");
      // Firestore rejects `undefined` values. Category and createdBy are
      // intentionally optional in the manual-entry form, so omit them from
      // the persisted documents instead of letting an uncategorized expense
      // make the entire batch fail.
      const persistedTxn = Object.fromEntries(
        Object.entries({ ...newTxn, businessId, updatedAt: new Date().toISOString() })
          .filter(([, value]) => value !== undefined)
      );
      const persistedJournalEntry = Object.fromEntries(
        Object.entries({ ...journalEntry, businessId, updatedAt: new Date().toISOString() })
          .filter(([, value]) => value !== undefined)
      );
      const batch = writeBatch(db);
      batch.set(doc(db, "transactions", newTxn.id), persistedTxn);
      batch.set(doc(db, "journal_entries", journalEntry.id), persistedJournalEntry);
      await batch.commit();
      setTransactions(prev => [...prev, newTxn]);
      // Real double-entry posting -- every logged transaction moves the
      // real ledger (Cash + Revenue or Cash + the matching expense
      // account), not just a line in a list. See accountingEngine.ts.
      setJournalEntries(prev => [...prev, journalEntry]);
      setLogTransactionType(null);
      sessionStorage.removeItem("ownerslocal_pending_financial_scan");
      triggerNotification(`${t.type === "income" ? "Income" : "Expense"} logged: $${t.amount.toLocaleString()}`);
    } catch (err) {
      console.error("Error saving transaction:", err);
      triggerNotification("Couldn't save that — check your connection and try again.");
      throw err;
    }
  };

  const selectPayrollSchedule = (schedule: PayrollSchedule) => {
    setPayrollSchedule(schedule);
    if (schedule !== "custom") {
      const period = scheduledPayrollPeriod(schedule);
      setPayrollPeriodStart(period.start); setPayrollPeriodEnd(period.end);
    }
  };
  const movePayrollPeriod = (direction: -1 | 1) => {
    if (payrollSchedule === "custom") return;
    const anchor = new Date(`${direction < 0 ? payrollPeriodStart : payrollPeriodEnd}T12:00:00`);
    anchor.setDate(anchor.getDate() + direction);
    const period = scheduledPayrollPeriod(payrollSchedule, anchor);
    setPayrollPeriodStart(period.start); setPayrollPeriodEnd(period.end);
  };
  const useCurrentPayrollPeriod = () => {
    if (payrollSchedule === "custom") return;
    const period = scheduledPayrollPeriod(payrollSchedule);
    setPayrollPeriodStart(period.start); setPayrollPeriodEnd(period.end);
  };

  // Runs payroll for the employer-selected pay period: real hours from
  // time_clock_logs x each real employee's real hourlyRate. The
  // calculation is fully automatic and real -- there's no real background
  // cron infrastructure in a client-side app, so a manual click is what
  // starts it, same as any payroll software's "Run Payroll" action.
  const handleRunPayroll = async () => {
    if (payrollState !== "TX") return triggerNotification(`${payrollState} payroll tax rules are not configured yet. No payroll was created.`);
    setIsRunningPayroll(true);
    try {
      const newPayrollTransactions: Transaction[] = [];
      let totalPayroll = 0;
      for (const emp of employees) {
        const { hours, regularHours: regHours, overtimeHours: otHours } = computePayrollHoursForRange(timeClockLogs.filter(l => l.employeeEmail === emp.email), payrollPeriodStart, payrollPeriodEnd, payrollWorkweekStart);
        if (hours <= 0 || !emp.hourlyRate) continue;
        const pay = regHours * emp.hourlyRate + otHours * emp.hourlyRate * 1.5;
        if (pay <= 0) continue;
        totalPayroll += pay;
        const payrollId = `txn_payroll_${payrollPeriodStart}_${payrollPeriodEnd}_${emp.email}`.replace(/[^a-zA-Z0-9_-]/g, "_");
        if (transactions.some(tx => tx.id === payrollId)) continue;
        newPayrollTransactions.push({
          id: payrollId,
          type: "expense",
          source: "payroll",
          amount: Math.round(pay * 100) / 100,
          description: `${emp.firstName} ${emp.lastName}`.trim(),
          category: "Payroll",
          date: new Date().toISOString().split("T")[0],
          createdAt: new Date().toISOString(),
          createdBy: loggedInUser?.email
        });
      }

      if (newPayrollTransactions.length === 0) {
        triggerNotification("No unpaid hours exist in the selected pay period.");
        return;
      }

      const finalizedPayrollTransactions = newPayrollTransactions;
      setTransactions(prev => [...prev, ...finalizedPayrollTransactions]);
      // Real double-entry posting for every payroll transaction -- Debit
      // Payroll Expense, Credit Cash, same as any other logged expense.
      setJournalEntries(prev => [...prev, ...finalizedPayrollTransactions.map(postTransactionEntry)]);
      triggerNotification(`Payroll run: $${totalPayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} across ${newPayrollTransactions.length} employee${newPayrollTransactions.length === 1 ? "" : "s"}, based on real logged hours.`);
    } catch (err) {
      console.error("Error running payroll:", err);
      triggerNotification("Couldn't run payroll — check your connection and try again.");
    } finally {
      setIsRunningPayroll(false);
    }
  };

  const getPayrollExportRows = () => employees.map(emp => {
    const { regularHours, overtimeHours } = computePayrollHoursForRange(timeClockLogs.filter(log => log.employeeEmail === emp.email), payrollPeriodStart, payrollPeriodEnd, payrollWorkweekStart);
    const rate = Number(emp.hourlyRate) || 0;
    const grossPay = regularHours * rate + overtimeHours * rate * 1.5;
    const employeeName = `${emp.firstName} ${emp.lastName}`.trim();
    const year = new Date().getFullYear();
    const priorYearPayroll = transactions
      .filter(tx => tx.source === "payroll" && tx.description === employeeName && new Date(tx.date).getFullYear() === year)
      .reduce((sum, tx) => sum + tx.amount, 0);
    const socialSecurityWages = Math.max(0, Math.min(grossPay, 184500 - priorYearPayroll));
    const socialSecurity = socialSecurityWages * 0.062;
    const medicare = grossPay * 0.0145;
    const additionalMedicareWages = Math.max(0, priorYearPayroll + grossPay - 200000) - Math.max(0, priorYearPayroll - 200000);
    const additionalMedicare = additionalMedicareWages * 0.009;
    const federalIncomeTax = 0; // Requires the employee's current signed W-4 elections.
    const texasIncomeTax = 0; // Texas has no individual state income tax.
    const deductions = socialSecurity + medicare + additionalMedicare + federalIncomeTax + texasIncomeTax;
    const texasSutaWages = Math.max(0, Math.min(grossPay, 9000 - priorYearPayroll));
    const employerTexasSuta = texasSutaWages * 0.027; // 2026 new-employer rate; configurable rate comes next.
    return {
      name: employeeName, email: emp.email,
      role: emp.role, regularHours, overtimeHours, rate,
      grossPay, socialSecurity, medicare, additionalMedicare,
      federalIncomeTax, texasIncomeTax, deductions, netPay: grossPay - deductions,
      employerSocialSecurity: socialSecurityWages * 0.062,
      employerMedicare: grossPay * 0.0145,
      employerTexasSuta
    };
  });

  const downloadPayrollCsv = () => {
    if (payrollState !== "TX") return triggerNotification(`${payrollState} payroll tax rules are not configured yet. CSV export is blocked.`);
    const rows = getPayrollExportRows();
    if (!rows.length) return triggerNotification("No employees are available to export.");
    const period = { start: payrollPeriodStart, end: payrollPeriodEnd };
    const safe = (value: string | number) => {
      const text = String(value);
      const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${protectedText.replace(/"/g, '""')}"`;
    };
    const header = ["Pay Period Start","Pay Period End","Employee","Email","Role","Regular Hours","Overtime Hours","Hourly Rate","Gross Pay","Employee Social Security","Employee Medicare","Additional Medicare","Federal Income Tax (W-4 Required)","Texas Income Tax","Total Employee Deductions","Net Pay","Employer Social Security","Employer Medicare","Employer Texas SUTA Estimate","Payment Method","Check/Confirmation Number"];
    const csv = [header.map(safe).join(","), ...rows.map(row => [
      period.start, period.end, row.name, row.email, row.role,
      row.regularHours.toFixed(2), row.overtimeHours.toFixed(2), row.rate.toFixed(2),
      row.grossPay.toFixed(2), row.socialSecurity.toFixed(2), row.medicare.toFixed(2), row.additionalMedicare.toFixed(2),
      row.federalIncomeTax.toFixed(2), row.texasIncomeTax.toFixed(2), row.deductions.toFixed(2), row.netPay.toFixed(2),
      row.employerSocialSecurity.toFixed(2), row.employerMedicare.toFixed(2), row.employerTexasSuta.toFixed(2), "", ""
    ].map(safe).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `ownerslocal-payroll-${period.start}-to-${period.end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    triggerNotification("Payroll CSV downloaded.");
  };

  const printPayrollSummary = () => {
    if (payrollState !== "TX") return triggerNotification(`${payrollState} payroll tax rules are not configured yet. PDF export is blocked.`);
    const rows = getPayrollExportRows();
    if (!rows.length) return triggerNotification("No employees are available to print.");
    const period = { start: payrollPeriodStart, end: payrollPeriodEnd };
    const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
    const money = (value: number) => `$${value.toFixed(2)}`;
    const totals = rows.reduce((sum, row) => ({ hours: sum.hours + row.regularHours, overtime: sum.overtime + row.overtimeHours, gross: sum.gross + row.grossPay, deductions: sum.deductions + row.deductions, net: sum.net + row.netPay }), { hours: 0, overtime: 0, gross: 0, deductions: 0, net: 0 });
    const report = window.open("", "_blank", "noopener,noreferrer");
    if (!report) return triggerNotification("Allow pop-ups to print the payroll summary.");
    report.document.write(`<!doctype html><html><head><title>Payroll ${period.start} to ${period.end}</title><style>body{font:11px Arial,sans-serif;color:#17233b;padding:24px}h1{margin:0}p{color:#60708a}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #d9e3f1;padding:6px;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#eef5fc}tfoot{font-weight:bold}.note{margin-top:16px;font-size:10px}@media print{button{display:none}}</style></head><body><h1>${escape(businessNames[0] || "OwnersLOCAL")} Texas Payroll Summary</h1><p>Pay period: ${period.start} through ${period.end}</p><table><thead><tr><th>Employee</th><th>Regular</th><th>OT</th><th>Gross</th><th>Social Security</th><th>Medicare</th><th>Add'l Medicare</th><th>Federal W/H</th><th>Texas W/H</th><th>Net Check</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(row.name)}<br><small>${escape(row.role)}</small></td><td>${row.regularHours.toFixed(2)}</td><td>${row.overtimeHours.toFixed(2)}</td><td>${money(row.grossPay)}</td><td>${money(row.socialSecurity)}</td><td>${money(row.medicare)}</td><td>${money(row.additionalMedicare)}</td><td>${money(row.federalIncomeTax)}*</td><td>${money(row.texasIncomeTax)}</td><td>${money(row.netPay)}</td></tr>`).join("")}</tbody><tfoot><tr><td>Total</td><td>${totals.hours.toFixed(2)}</td><td>${totals.overtime.toFixed(2)}</td><td>${money(totals.gross)}</td><td colspan="5">Employee deductions: ${money(totals.deductions)}</td><td>${money(totals.net)}</td></tr></tfoot></table><p class="note">* Federal income-tax withholding is $0 until the employee's signed W-4 elections are configured. Texas has no individual state income tax. Employer Social Security, Medicare, and estimated Texas unemployment amounts are included in the CSV. Review all records before issuing payment.</p><button onclick="window.print()">Print / Save as PDF</button><script>window.onload=()=>window.print()<\/script></body></html>`);
    report.document.close();
    logOperationalEvent("Payroll Export", `Printed payroll summary for ${period.start} through ${period.end}`, "👥");
  };

  // Launch Local OS: generates invites, saves to db, triggers invites modal
  const handleLaunchOS = async () => {
    if (!email) {
      triggerNotification("Missing your business email — please sign in again.");
      return;
    }
    setIsSubmitting(true);
    try {
      // 1. Save owner business profile
      await saveProfileToFirestore();
      
      // 2. Generate invite codes for all staff
      const generated: Array<{ code: string; role: string; permissions: string[]; granularPermissions: GranularPermissions }> = [];
      for (const r of normalizeSelectedRoles(selectedRoles)) {
        // Skip main owner seat (count = 1) since owner is already logged in
        const startIndex = r.id === "owner" ? 1 : 0;
        const granularPermissions = r.id === "owner"
          ? fullAccessGranular(r.permissions)
          // Only keep entries for currently-authorized modules — a module
          // toggled off after being configured shouldn't leave a stale
          // permission entry behind.
          : Object.fromEntries(
              Object.entries(r.modulePermissions).filter(([moduleId]) => r.permissions.includes(moduleId))
            ) as GranularPermissions;
        for (let i = startIndex; i < r.count; i++) {
          const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
          const cleanRolePrefix = r.name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
          const code = `${cleanRolePrefix}-${randomStr}`;
          generated.push({
            code,
            role: r.name,
            permissions: r.permissions,
            granularPermissions
          });
        }
      }

      // 3. Save codes to Firestore
      for (const inv of generated) {
        await setDoc(doc(db, "employee_invites", inv.code), {
          code: inv.code,
          role: inv.role,
          businessEmail: email,
          permissions: inv.permissions,
          granularPermissions: inv.granularPermissions,
          status: "pending",
          createdAt: new Date().toISOString()
        });
      }
      
      setGeneratedInvites(generated);
      setShowInvitesModal(true);
      triggerNotification("Generated secure team invite codes!");
    } catch (err) {
      console.error("Error launching OS:", err);
      triggerNotification("Couldn't generate invite codes — check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Complete Employee Onboarding Flow
  const handleCompleteEmployeeOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = empEmail.trim();
    if (!cleanEmail || !empPassword || !empFirstName || !empLastName || !empPhone || !empAddress) {
      triggerNotification("Please fill in all required employee fields.");
      return;
    }
    
    setIsSubmitting(true);
    
    // Look up role & permissions from the real invite record. This must
    // succeed and resolve a real businessEmail — falling back to a fake
    // default here would attach a new employee to a business that doesn't
    // exist, or worse, to whichever fake default every failed lookup shares.
    let inviteRole = "Driver";
    let invitePermissions = ["dashboard", "routes", "jobs", "timeclock", "messages"];
    let inviteGranularPermissions: GranularPermissions = defaultGranularFromModuleList(invitePermissions, "view");
    let inviteRequiresClockVerification = false;
    let inviteGpsTrackingEnabled = false;
    let businessEmail: string | null = null;

    try {
      if (!empInviteCode) {
        triggerNotification("No invite code found. Please start from the invite code screen.");
        setIsSubmitting(false);
        return;
      }
      const inviteSnap = await getDoc(doc(db, "employee_invites", empInviteCode));
      if (!inviteSnap.exists()) {
        triggerNotification("This invite code is no longer valid. Please request a new one.");
        setIsSubmitting(false);
        return;
      }
      const inviteData = inviteSnap.data();
      inviteRole = inviteData.role || inviteRole;
      invitePermissions = inviteData.permissions || invitePermissions;
      inviteGranularPermissions = inviteData.granularPermissions || inviteGranularPermissions;
      inviteRequiresClockVerification = !!inviteData.requireTimeClockVerification;
      inviteGpsTrackingEnabled = !!inviteData.gpsTrackingEnabled;
      businessEmail = inviteData.businessEmail || null;
      if (!businessEmail) {
        triggerNotification("This invite is missing a business account. Please ask your owner for a new invite.");
        setIsSubmitting(false);
        return;
      }
    } catch (lookupErr) {
      console.error("Invite lookup failed:", lookupErr);
      triggerNotification("Couldn't verify your invite code right now. Please try again.");
      setIsSubmitting(false);
      return;
    }

    try {
      // 1. Create real Auth User
      const authResult = await createUserWithEmailAndPassword(auth, cleanEmail, empPassword);
      const user = authResult.user;

      // 2. Initialize user_profile
      await setDoc(doc(db, "user_profiles", user.uid), {
        role: inviteRole,
        permissions: invitePermissions,
        granularPermissions: inviteGranularPermissions,
        isEmployee: true,
        businessEmail,
        requireTimeClockVerification: inviteRequiresClockVerification,
        isOnboarded: true,
        name: `${empFirstName} ${empLastName}`,
        goals: empGoals,
        createdAt: new Date().toISOString()
      });

      // 3. Save detailed employees entry
      const newEmployee = {
        id: cleanEmail,
        userUid: user.uid,
        email: cleanEmail,
        firstName: empFirstName,
        lastName: empLastName,
        address: empAddress,
        phone: empPhone,
        photo: empPhoto || "",
        goals: empGoals,
        hourlyRate: parseFloat(empHourlyRate) || 0,
        role: inviteRole,
        permissions: invitePermissions,
        granularPermissions: inviteGranularPermissions,
        requireTimeClockVerification: inviteRequiresClockVerification,
        gpsTrackingEnabled: inviteGpsTrackingEnabled,
        businessEmail,
        // Also tagged as businessId (same value) so this collection is
        // queryable through the same convention every other Firestore
        // collection uses (see subscribeToCollection).
        businessId: businessEmail,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, "employees", cleanEmail), newEmployee);

      // 4. Update invite status
      if (empInviteCode && empInviteCode !== "DRIVER-X4F91") {
        await setDoc(doc(db, "employee_invites", empInviteCode), { status: "completed", usedBy: cleanEmail }, { merge: true });
      }

      let verificationEmailSent = false;
      try {
        await sendEmailVerification(user);
        verificationEmailSent = true;
      } catch (verificationError) {
        console.error("Could not send employee verification email:", verificationError);
      }

      // 5. Update UI local state
      setLoggedInUser({
        email: cleanEmail,
        role: inviteRole,
        permissions: invitePermissions,
        granularPermissions: inviteGranularPermissions,
        isEmployee: true,
        name: `${empFirstName} ${empLastName}`,
        goals: empGoals,
        businessEmail
      });
      setIsLoggedIn(true);
      
      // Redirect to Employee Training (Coming Soon)
      const trainingScreen = OS_SCREENS.find(s => s.id === "training") || OS_SCREENS[0];
      setActiveScreen(trainingScreen);
      triggerNotification(verificationEmailSent
        ? `Employee registered. Verification email sent to ${cleanEmail}.`
        : "Employee registered, but the verification email could not be sent.");
    } catch (err: any) {
      console.error("Employee onboarding database save failed:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      triggerNotification(`Registration failed: ${errMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDynamicField = (
    label: string, 
    items: string[], 
    setter: React.Dispatch<React.SetStateAction<string[]>>, 
    placeholder: string
  ) => {
    return (
      <DynamicFieldList
        label={label}
        items={items}
        setter={setter}
        placeholder={placeholder}
        scale={scale}
        error={onboardingErrors[label.toLowerCase()]}
      />
    );
  };

  const authContextValue: AuthContextValue = {
    loggedInUser,
    isLoggedIn,
    currentView,
    setCurrentView,
    simulatedRole,
    setSimulatedRole,
    businessId,
    handleLogout
  };

  const domainDataContextValue: DomainDataContextValue = {
    customers,
    setCustomers,
    leads,
    setLeads,
    estimates,
    setEstimates,
    schedulingEvents,
    setSchedulingEvents,
    inventoryList,
    setInventoryList,
    documents,
    setDocuments,
    recentRoster,
    setRecentRoster,
    bulletins,
    setBulletins,
    notifications,
    setNotifications,
    recentAiActions,
    setRecentAiActions,
    snapshots,
    setSnapshots,
    revenueEvents,
    setRevenueEvents,
    completedJobsRevenue,
    employees,
    setEmployees,
    refreshEmployees,
    timeClockLogs,
    setTimeClockLogs,
    refreshTimeClockLogs,
    transactions,
    setTransactions,
    saveTransaction: handleSaveTransaction,
    accounts,
    setAccounts,
    journalEntries,
    setJournalEntries,
    invoices,
    setInvoices,
    bills,
    setBills,
    vendors,
    setVendors,
    bankAccounts,
    setBankAccounts,
    recurringTransactions,
    setRecurringTransactions,
    mileageLogs,
    setMileageLogs,
    budgets,
    setBudgets,
    salesTaxRates,
    setSalesTaxRates,
    preSelectedDate,
    setPreSelectedDate,
    preSelectedCustomerId,
    setPreSelectedCustomerId,
    generatedPdfDraft,
    setGeneratedPdfDraft,
    estimatePrefill,
    setEstimatePrefill,
    pendingSignatureCapture,
    setPendingSignatureCapture,
    globalAiSetting,
    setGlobalAiSetting,
    aiKnowledgeBase,
    setAiKnowledgeBase,
    businessProfile: {
      name: businessNames[0] || "",
      phone: businessPhones[0] || "",
      address: businessAddresses[0] || "",
      email: businessId || "",
      logo: businessLogos[0] || ""
    }
  };

  const navTelemetryContextValue: NavTelemetryContextValue = {
    activeScreen,
    setActiveScreen,
    navigateToScreen,
    logOperationalEvent,
    takeSnapshot,
    deleteSnapshot,
    openPageAIAnalysis,
    openPlaceholderPage,
    triggerNotification
  };

  return (
    <AuthContext.Provider value={authContextValue}>
    <DomainDataContext.Provider value={domainDataContextValue}>
    <NavTelemetryContext.Provider value={navTelemetryContextValue}>
    <EventEngineEffects />
    {isLoggedIn && canUseSnapshot && (
      <UniversalAIIntake snapshotFolder={loggedInUser?.isEmployee ? "Employee Snapshot" : undefined} />
    )}
    <div
      className={`min-h-screen ${isLoggedIn ? (isDarkTheme ? 'bg-[#050f1a]' : 'bg-[#F5FAFF]') : isDarkTheme ? 'login-theme-dark-basic' : 'login-theme-light-basic'} text-[#342D7E] flex flex-col justify-between font-sans overflow-x-hidden relative select-none`}
      style={!isLoggedIn ? { backgroundImage: `url(${isDarkTheme ? darkLoginBackground : lightLoginBackground})` } : undefined}
    >
      {!authReady && (
        <div className="fixed inset-0 z-[100] bg-[#edf4fa] flex items-center justify-center">
          <div className="text-[#315C9F] text-xs font-bold uppercase tracking-wider animate-pulse">Restoring secure session…</div>
        </div>
      )}
      {/* Hidden device camera capture input */}
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleCameraCapture}
        accept="image/*"
        capture="environment"
        className="hidden"
        style={{ display: "none" }}
      />
      
      {/* Background ambient light effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-cyan-500/10 blur-[150px] rounded-full pointer-events-none" />

      {/* Header section (only shown when logged out to present the gateway metadata) */}
      {!isLoggedIn && (
        <header className="hidden sm:flex w-full max-w-7xl mx-auto px-4 py-3 sm:py-4 flex-col sm:flex-row items-center justify-between gap-3 border-b border-blue-200/50 bg-white/45 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-xs tracking-wider text-[#342D7E]/60">OWNER'S LOCAL OS CLOUD GATEWAY v2.8.4</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-[#342D7E]/75 font-mono bg-blue-100/60 px-2 py-1 rounded">
              PORT: 3000 (SECURE)
            </div>
          </div>
        </header>
      )}

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-0 sm:p-4 md:p-8 z-10 w-full overflow-y-auto">
        
        {/* VIEW 1: INTERACTIVE LOGIN CARD */}
        {!isLoggedIn ? (
          <div className="w-full min-h-[100dvh] sm:min-h-0 flex flex-col items-center justify-center sm:py-6">
            
            {/* Aspect ratio bounding box for the login card */}
            <div
              id="login-card-container"
              ref={containerRef}
              className={`relative max-w-[440px] rounded-[32px] sm:rounded-[44px] overflow-hidden shadow-[0_20px_50px_rgba(8,112,184,0.2)] ${isDarkTheme ? "" : "border border-blue-200/20"} bg-cover bg-center select-none transition-transform duration-500 ease-out hover:scale-[1.015] focus-within:scale-[1.015]`}
              style={{
                width: "min(440px, calc(100% - 24px))",
                // Same width formula as before ("keep the sides") -- height
                // is the full 1440:3200 ratio at the actual measured width
                // (cardWidth, already tracked via ResizeObserver for the
                // scale factor below), minus a flat 100px off the top and
                // 100px off the bottom.
                height: `${Math.max(200, cardWidth * (3200 / 1440) - 200)}px`,
                backgroundImage: `url(${isDarkTheme ? darkLoginCard : lightLoginCard})`,
                // Slight overscan + centering so the browser's rounded-corner
                // clip never reveals a subpixel seam at the image's edge.
                backgroundSize: "101% 101%",
                backgroundPosition: "center"
              }}
            >
              {/* Inner glassmorphic shading overlay */}
              <div className="absolute inset-0 bg-blue-500/[0.02] pointer-events-none" />

              {/* INNER ROUTING VIEW: LOGIN OR PLACEHOLDER */}
              {currentView === "login" ? (
                <>
                  {/* CONTINUE WITH GOOGLE BUTTON */}
                  <div
                    style={{ top: "20.0%", left: "6%", width: "88%", height: `${50 * scale}px` }}
                    className="absolute"
                  >
                    <button
                      type="button"
                      onClick={() => handleGoogleSignIn()}
                      style={{
                        borderRadius: `${14 * scale}px`,
                        gap: `${8 * scale}px`,
                        ...getFontSize(14.5)
                      }}
                      className="w-full h-full bg-white hover:bg-slate-50 border border-slate-200/80 flex items-center justify-center font-bold text-slate-700 shadow-sm hover:shadow active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <svg 
                        style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} 
                        viewBox="0 0 24 24"
                      >
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Continue with Google</span>
                    </button>
                  </div>

                  {/* SEPARATOR - OR SIGN IN WITH PASSWORD */}
                  <div
                    style={{ top: "29.0%", left: "6%", width: "88%", gap: `${8 * scale}px` }}
                    className="absolute flex items-center justify-between"
                  >
                    <div className="h-[1px] flex-1 bg-blue-900/30 shadow-[0_0_1px_rgba(0,240,255,0.4)]" />
                    <span
                      style={{
                        letterSpacing: "0.12em",
                        ...getFontSize(10.5)
                      }}
                      className="font-bold text-blue-900/60 font-sans"
                    >
                      OR SIGN IN WITH PASSWORD
                    </span>
                    <div className="h-[1px] flex-1 bg-blue-900/30 shadow-[0_0_1px_rgba(0,240,255,0.4)]" />
                  </div>

                  {/* PASSWORD SIGN-IN FORM VIEW */}
                  <form onSubmit={handlePasswordSignIn}>
                    
                    {/* BUSINESS EMAIL FIELD */}
                    <div
                      style={{ top: "33.35%", left: "6%", width: "88%" }}
                      className="absolute"
                    >
                      <label
                        style={{
                          letterSpacing: "0.05em",
                          marginBottom: `${6 * scale}px`,
                          ...getFontSize(11.5)
                        }}
                        className="block font-bold text-blue-900/80"
                      >
                        BUSINESS EMAIL
                      </label>
                      <div
                        style={{ height: `${50 * scale}px` }}
                        className="relative w-full"
                      >
                        <div
                          style={{ left: `${14 * scale}px` }}
                          className="absolute top-1/2 -translate-y-1/2 text-blue-800/50 pointer-events-none"
                        >
                          <Mail style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} />
                        </div>
                        <input
                          type="text"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          style={{
                            paddingLeft: `${42 * scale}px`,
                            paddingRight: `${14 * scale}px`,
                            borderRadius: `${12 * scale}px`,
                            ...getFontSize(13.5)
                          }}
                          className="w-full h-full bg-[#f0f6ff]/95 hover:bg-white focus:bg-white text-slate-800 font-medium border border-slate-200/50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner-sm transition-all placeholder:text-slate-400"
                        />
                      </div>
                    </div>

                    {/* PASSWORD FIELD */}
                    <div
                      style={{ top: "45.53%", left: "6%", width: "88%" }}
                      className="absolute"
                    >
                      <div
                        style={{ marginBottom: `${6 * scale}px` }}
                        className="flex items-center justify-between"
                      >
                        <label
                          style={{
                            letterSpacing: "0.05em",
                            ...getFontSize(11.5)
                          }}
                          className="block font-bold text-blue-900/80"
                        >
                          PASSWORD
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowForgotPassword(true)}
                          style={getFontSize(11.5)}
                          className="font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                        >
                          Forgot?
                        </button>
                      </div>
                      <div
                        style={{ height: `${50 * scale}px` }}
                        className="relative w-full"
                      >
                        <div
                          style={{ left: `${14 * scale}px` }}
                          className="absolute top-1/2 -translate-y-1/2 text-blue-800/50 pointer-events-none"
                        >
                          <Lock style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} />
                        </div>
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          style={{
                            paddingLeft: `${42 * scale}px`,
                            paddingRight: `${42 * scale}px`,
                            borderRadius: `${12 * scale}px`,
                            ...getFontSize(13.5)
                          }}
                          className="w-full h-full bg-[#f0f6ff]/95 hover:bg-white focus:bg-white text-slate-800 font-medium border border-slate-200/50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner-sm transition-all placeholder:text-slate-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          style={{ right: `${14 * scale}px` }}
                          className="absolute top-1/2 -translate-y-1/2 text-blue-800/50 hover:text-blue-800/80 transition-colors cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} />
                          ) : (
                            <Eye style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} />
                          )}
                        </button>
                      </div>

                      {/* REMEMBER ME CHECKBOX */}
                      <div
                        style={{ marginTop: `${8 * scale}px`, gap: `${6 * scale}px` }}
                        className="flex items-center select-none"
                      >
                        <input
                          type="checkbox"
                          id="remember-me-checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          style={{ width: `${14 * scale}px`, height: `${14 * scale}px` }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <label 
                          htmlFor="remember-me-checkbox"
                          style={getFontSize(11.5)}
                          className="font-bold text-blue-900/80 cursor-pointer"
                        >
                          Remember Me
                        </label>
                      </div>
                    </div>

                    {/* SIGN IN GENERATED GLOWING BUTTON */}
                    <div
                      style={{ top: "61.16%", left: "6%", width: "88%", height: `${50 * scale}px` }}
                      className="absolute flex items-center"
                    >
                      <button
                        type="submit"
                        style={{
                          borderRadius: `${14 * scale}px`,
                          ...getFontSize(14.5)
                        }}
                        className="w-full h-full border-0 font-sans font-bold uppercase tracking-[0.08em] text-white cursor-pointer select-none relative overflow-hidden transition-all duration-300 bg-gradient-to-r from-[#00b0ff] to-[#0055ff] hover:brightness-110 hover:shadow-[0_0_24px_rgba(0,176,255,0.5)] active:shadow-[0_0_35px_rgba(0,176,255,0.7)] active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        <span>Sign In ➔</span>
                      </button>
                    </div>

                    {loginError && (
                      <div
                        style={{ top: "52.5%", left: "6%", width: "88%" }}
                        className="absolute text-rose-600 font-bold text-[10px] sm:text-[11px] leading-tight flex items-center gap-1.5 bg-rose-50/95 py-1 px-2 border border-rose-200/50 rounded-lg shadow-sm"
                      >
                        <span className="w-1.5 h-1.5 bg-rose-500 rounded-full shrink-0" />
                        <span>{loginError}</span>
                      </div>
                    )}

                  </form>

                  {/* DYNAMIC OR SIGN UP LINK */}
                  <div
                    style={{
                      top: "70.16%",
                      left: "6%",
                      width: "88%",
                    }}
                    className="absolute flex items-center justify-center"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSignUpInstructionsEmail("");
                        setSignUpInstructionsBusinessName("");
                        setSignUpInstructionsOwnerName("");
                        setSignUpInstructionsPassword("");
                        setSignUpInstructionsError("");
                        setSignUpInstructionsStep("input");
                        setShowSignUpInstructions(true);
                      }}
                      style={getFontSize(11.5)}
                      className="font-bold text-[#1E3A8A] hover:text-[#2563EB] transition-colors cursor-pointer flex items-center justify-center gap-1 hover:underline"
                    >
                      <span>Don't have an account?</span>
                      <span className="font-extrabold text-[#315C9F] underline">Or Sign Up</span>
                    </button>
                  </div>

                  {/* SEPARATOR - FIELD SERVICE LOG IN */}
                  <div
                    style={{ top: "74.76%", left: "6%", width: "88%", gap: `${8 * scale}px` }}
                    className="absolute flex items-center justify-between"
                  >
                    <div className="h-[1px] flex-1 bg-blue-900/30 shadow-[0_0_1px_rgba(0,240,255,0.4)]" />
                    <span 
                      style={{
                        letterSpacing: "0.12em",
                        ...getFontSize(10.5)
                      }}
                      className="font-bold text-blue-900/60 font-sans"
                    >
                      FIELD SERVICE LOG IN
                    </span>
                    <div className="h-[1px] flex-1 bg-blue-900/30 shadow-[0_0_1px_rgba(0,240,255,0.4)]" />
                  </div>

                  {/* INVITE CODE SECTION */}
                  <div
                    style={{ top: "79.11%", left: "6%", width: "61%" }}
                    className="absolute"
                  >
                    <label
                      style={{
                        letterSpacing: "0.03em",
                        marginBottom: `${6 * scale}px`,
                        ...getFontSize(10.5)
                      }}
                      className="block font-bold text-blue-900/80"
                    >
                      ENTER EMPLOYEE INVITE CODE
                    </label>
                    <div
                      style={{ height: `${50 * scale}px` }}
                      className="relative w-full"
                    >
                      <div
                        style={{ left: `${14 * scale}px` }}
                        className="absolute top-1/2 -translate-y-1/2 text-blue-800/50 pointer-events-none"
                      >
                        <User style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} />
                      </div>
                      <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value)}
                        placeholder="DRIVER-X4F91"
                        style={{
                          paddingLeft: `${42 * scale}px`,
                          paddingRight: `${12 * scale}px`,
                          borderRadius: `${12 * scale}px`,
                          ...getFontSize(13.5)
                        }}
                        className="w-full h-full bg-[#f0f6ff]/95 hover:bg-white focus:bg-white text-slate-800 font-mono font-bold uppercase border border-slate-200/50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner-sm transition-all placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* GO GENERATED GLOWING BUTTON */}
                  <div
                    style={{ top: "82.3%", left: "70%", width: "24%", height: `${50 * scale}px` }}
                    className="absolute"
                  >
                    <button
                      type="button"
                      onClick={handleInviteSignIn}
                      style={{
                        borderRadius: `${14 * scale}px`,
                        ...getFontSize(14.5)
                      }}
                      className="w-full h-full border-0 font-sans font-bold uppercase tracking-[0.05em] text-white cursor-pointer select-none relative overflow-hidden transition-all duration-300 bg-gradient-to-r from-[#00b0ff] to-[#0055ff] hover:brightness-110 hover:shadow-[0_0_24px_rgba(0,176,255,0.5)] active:shadow-[0_0_35px_rgba(0,176,255,0.7)] active:scale-[0.98] flex items-center justify-center"
                    >
                      <span>Go ➔</span>
                    </button>
                  </div>

                  {/* FOOTER NAV LINKS */}
                  <div
                    style={{
                      bottom: "6%",
                      left: "6%",
                      width: "88%",
                      gap: `${24 * scale}px`
                    }}
                    className="absolute flex items-center justify-center text-blue-700 font-sans"
                  >
                    <button
                      onClick={() => setCurrentView("placeholder_agreement")}
                      style={{ gap: `${5 * scale}px`, ...getFontSize(13.5) }}
                      className="flex items-center font-bold hover:text-blue-900 transition-colors cursor-pointer"
                    >
                      <FileText style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} />
                      <span>User Agreement</span>
                    </button>

                    <div style={{ height: `${14 * scale}px` }} className="w-[1px] bg-blue-300" />

                    <button
                      onClick={() => setCurrentView("placeholder_privacy")}
                      style={{ gap: `${5 * scale}px`, ...getFontSize(13.5) }}
                      className="flex items-center font-bold hover:text-blue-900 transition-colors cursor-pointer"
                    >
                      <Shield style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} />
                      <span>Privacy Policy</span>
                    </button>
                  </div>

                </>
              ) : (
                <>
                  {/* ONBOARDING FLOW SCREEN - STEP 1 (CREATE YOUR BUSINESS) */}
                  {(currentView === "placeholder_google" || currentView === "placeholder_password" || currentView === "placeholder_invite") ? (
                    <div 
                      style={{
                        padding: `${20 * scale}px ${16 * scale}px`,
                      }}
                      className="login-onboarding-card absolute inset-0 bg-[#f5f8ff] flex flex-col justify-between overflow-hidden select-none"
                    >
                      {/* Subtle decorative glowing backgrounds inside card */}
                      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-400/10 blur-xl rounded-full pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-cyan-400/10 blur-xl rounded-full pointer-events-none" />
                      
                      {/* ONBOARDING HEADER MODULE */}
                      <div className="relative z-10 flex items-center justify-between mb-4 pb-3 border-b border-slate-200/50 shrink-0">
                        <div className="flex items-center gap-2.5">
                          {/* Reuse the exact heartbeat asset shown throughout Owners Local OS. */}
                          <div
                            style={{
                              width: `${36 * scale}px`,
                              height: `${36 * scale}px`,
                              borderRadius: `${9 * scale}px`,
                            }}
                            className="bg-white flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0 overflow-hidden border border-blue-100"
                          >
                            <BrandIcon className="w-full h-full" />
                          </div>
                          <div>
                            <h2 style={getFontSize(14.5)} className="font-sans font-bold text-slate-900 tracking-tight leading-tight uppercase">
                              Create Your Business
                            </h2>
                            <p style={getFontSize(10.5)} className="font-sans text-slate-500 font-medium">
                              Step 1 of 2. Profile settings
                            </p>
                          </div>
                        </div>
                        {/* Badge */}
                        <span 
                          style={{
                            padding: `${2 * scale}px ${6 * scale}px`,
                            borderRadius: `${10 * scale}px`,
                            ...getFontSize(9)
                          }}
                          className="font-sans font-bold text-blue-700 bg-blue-50 border border-blue-200 uppercase tracking-wider select-none shrink-0"
                        >
                          Onboarding
                        </span>
                      </div>

                      {/* FORM FIELDS - SCROLLABLE GROUP */}
                      <div className="relative z-10 flex-1 space-y-3.5 overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-blue-200/50">
                        {renderDynamicField("account administrator name", ownerNames, setOwnerNames, "e.g. John Doe")}
                        {renderDynamicField("administrator phone (optional)", ownerPhones, setOwnerPhones, "e.g. (206) 555-0199")}
                        {renderDynamicField("business name", businessNames, setBusinessNames, "e.g. Ironclad Plumbing & HVAC")}
                        <div className="space-y-1.5">
                          <label style={getFontSize(11)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider px-1">
                            Business Email
                          </label>
                          <input
                            type="email"
                            value={businessId || email}
                            readOnly
                            aria-readonly="true"
                            style={{ height: `${42 * scale}px`, borderRadius: `${12 * scale}px`, ...getFontSize(12.5) }}
                            className="w-full bg-blue-50 border border-blue-200 px-3.5 text-slate-700 font-semibold cursor-not-allowed"
                          />
                          {onboardingErrors["business email"] && <p className="text-[10px] font-bold text-rose-600 px-1">{onboardingErrors["business email"]}</p>}
                        </div>
                        {renderDynamicField("business phone (optional)", businessPhones, setBusinessPhones, "e.g. (206) 565-0144")}
                        <StructuredAddressFields
                          label="Business Headquarters Address (Optional)"
                          value={businessAddresses[0] || ""}
                          onChange={(value) => setBusinessAddresses(prev => [value, ...prev.slice(1)])}
                        />
                        {renderDynamicField("business logo (optional)", businessLogos, setBusinessLogos, "e.g. https://logo-url.png")}
                        {renderDynamicField("company locations (optional)", companyLocations, setCompanyLocations, "e.g. Seattle HQ")}
                        <div className="rounded-xl border border-blue-200 bg-blue-50/90 p-3 text-[10px] leading-relaxed text-blue-950">
                          <p className="flex items-center gap-1.5 font-black uppercase tracking-wide">
                            <Shield className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                            Your information and privacy
                          </p>
                          <p className="mt-1 font-semibold text-slate-600">
                            Owners Local OS does not sell or disseminate user data. Information is handled through integrated databases and services using appropriate security and encryption. Authorized Stuffapp personnel or service providers may have limited access when needed to operate, secure, support, or comply with legal requirements.
                          </p>
                        </div>
                      </div>

                      {/* BOTTOM ACTION BUTTONS */}
                      <div className="relative z-10 flex items-center justify-between gap-2.5 pt-3 mt-3 border-t border-slate-200/50 bg-white/10 shrink-0">
                        <button
                          type="button"
                          onClick={handleBackToLogin}
                          style={{
                            height: `${38 * scale}px`,
                            borderRadius: `${12 * scale}px`,
                            paddingLeft: `${14 * scale}px`,
                            paddingRight: `${14 * scale}px`,
                            ...getFontSize(12.5)
                          }}
                          className="font-sans font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100/80 border border-slate-200 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 bg-white shadow-sm"
                        >
                          Back
                        </button>

                        <button
                          type="button"
                          onClick={reviewBusinessProfileStep}
                          style={{
                            height: `${38 * scale}px`,
                            borderRadius: `${12 * scale}px`,
                            paddingLeft: `${16 * scale}px`,
                            paddingRight: `${16 * scale}px`,
                            ...getFontSize(12.5)
                          }}
                          className="flex-1 font-sans font-bold text-white bg-gradient-to-r from-[#00b0ff] to-[#0055ff] hover:brightness-105 active:scale-[0.98] shadow-md hover:shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>Continue</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : currentView === "placeholder_team_setup" ? (
                    <div 
                      style={{
                        padding: `${18 * scale}px ${16 * scale}px`,
                        backgroundImage: `url("https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Step1step2blank.png")`,
                        backgroundSize: "cover",
                        backgroundPosition: "center"
                      }}
                      className="absolute inset-0 flex flex-col justify-between overflow-hidden select-none"
                    >
                      {/* Subtle floating glow effects inside card */}
                      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-400/10 blur-xl rounded-full pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-cyan-400/10 blur-xl rounded-full pointer-events-none" />
                      
                      {/* STEP 2 HEADER */}
                      <div className="relative z-10 flex items-center justify-between mb-2 pb-2 border-b border-slate-200/50 shrink-0">
                        <div className="flex items-center gap-2">
                          {/* Heartbeat/Pulse logo in bright blue */}
                          <div 
                            style={{
                              width: `${32 * scale}px`,
                              height: `${32 * scale}px`,
                              borderRadius: `${8 * scale}px`
                            }}
                            className="bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 animate-pulse"
                          >
                            <Users style={{ width: `${16 * scale}px`, height: `${16 * scale}px` }} />
                          </div>
                          <div>
                            <h2 style={getFontSize(14)} className="font-sans font-extrabold text-blue-950 uppercase tracking-tight">
                              Build Your Team
                            </h2>
                            <p style={getFontSize(9.5)} className="text-slate-400 font-sans font-medium">
                              Step 2 of 2 • Assign initial roles & codes
                            </p>
                          </div>
                        </div>
                        {/* Pill badge matching image */}
                        <span 
                          style={{
                            padding: `${2 * scale}px ${6 * scale}px`,
                            borderRadius: `${10 * scale}px`,
                            ...getFontSize(8.5)
                          }}
                          className="font-sans font-bold text-blue-700 bg-blue-50 border border-blue-200 uppercase tracking-wider select-none shrink-0"
                        >
                          Team Assignment
                        </span>
                      </div>

                      {/* TEAM SYSTEM INITIATED NOTICE BOX */}
                      <div 
                        style={{
                          padding: `${8 * scale}px ${10 * scale}px`,
                          borderRadius: `${10 * scale}px`,
                          marginBottom: `${8 * scale}px`
                        }}
                        className="relative z-10 bg-emerald-50/90 border border-emerald-100 flex gap-2 shrink-0"
                      >
                        <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <p style={getFontSize(10)} className="font-sans font-bold text-emerald-950">
                            Role-Based System Permissions Initiated
                          </p>
                          <p style={getFontSize(8.5)} className="text-emerald-800 leading-normal font-sans font-medium">
                            Each staff member receives an individual invite code. Employees only see sidebar tabs corresponding directly to assigned permissions.
                          </p>
                        </div>
                      </div>

                      {/* DROPDOWN SELECTOR & HELP INFO LINK */}
                      <div className="relative z-10 space-y-1.5 mb-2 shrink-0">
                        <div className="flex items-center justify-between px-1">
                          <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider flex items-center gap-1">
                            <span>Select Roles to Add</span>
                            {/* Floating panel explanation icon */}
                            <button
                              type="button"
                              onClick={() => setShowRoleInfoPopup(showRoleInfoPopup ? null : "info")}
                              className="text-blue-500 hover:text-blue-700 focus:outline-none flex items-center justify-center cursor-pointer"
                            >
                              <Info className="w-3.5 h-3.5 animate-bounce" />
                            </button>
                          </label>
                          <span style={getFontSize(9)} className="text-slate-400 font-mono">
                            {normalizeSelectedRoles(selectedRoles).reduce((acc, role) => acc + role.count, 0)} Seats Configured
                          </span>
                        </div>
                        
                        <div className="relative">
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAddRole(e.target.value);
                                e.target.value = ""; // Reset after selection
                              }
                            }}
                            style={{
                              height: `${38 * scale}px`,
                              borderRadius: `${10 * scale}px`,
                              paddingLeft: `${12 * scale}px`,
                              paddingRight: `${32 * scale}px`,
                              ...getFontSize(12)
                            }}
                            className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 font-bold focus:outline-none transition-all shadow-sm appearance-none cursor-pointer"
                          >
                            <option value="">+ Add a team role...</option>
                            <option value="__create_custom__" className="text-blue-600 font-bold">
                              ★ + Create Custom Role from scratch...
                            </option>
                            {/* Custom Role stays first; Owner is already added. */}
                            {Object.entries(DEFAULT_ROLES_DATA)
                              .filter(([key]) => key !== "owner")
                              .map(([key, role]) => {
                                const isAdded = selectedRoles.some(r => r.id === key);
                                return (
                                  <option key={key} value={key}>
                                    {role.name} {isAdded ? "• Add another seat" : ""}
                                  </option>
                                );
                              })}
                          </select>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            <ChevronDown className="w-4 h-4" />
                          </div>
                        </div>
                      </div>

                      {/* STAFF ROLES SCROLLABLE LIST */}
                      <div className="relative z-10 flex-1 overflow-y-auto pr-0.5 space-y-2 mb-3 scrollbar-thin scrollbar-thumb-blue-200/50">
                        {selectedRoles.map((role) => (
                          <div 
                            key={role.id}
                            style={{
                              padding: `${10 * scale}px ${12 * scale}px`,
                              borderRadius: `${12 * scale}px`
                            }}
                            className="bg-white border border-slate-200/80 shadow-sm flex flex-col gap-2 relative group hover:border-blue-200 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 style={getFontSize(12)} className="font-sans font-bold text-blue-950 flex items-center gap-1">
                                  <span>{role.name}</span>
                                  {role.isCustom && (
                                    <span style={getFontSize(8)} className="px-1 py-0.5 bg-purple-50 text-purple-600 border border-purple-200 rounded font-bold uppercase">
                                      Custom
                                    </span>
                                  )}
                                </h4>
                                <p style={getFontSize(9.5)} className="text-slate-400 font-sans font-medium line-clamp-1">
                                  {role.description}
                                </p>
                              </div>

                              {/* COUNTER MODULE */}
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleDecrementRoleCount(role.id)}
                                  style={{
                                    width: `${24 * scale}px`,
                                    height: `${24 * scale}px`
                                  }}
                                  className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-90 flex items-center justify-center cursor-pointer font-bold border border-slate-200/30"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span style={getFontSize(12)} className="font-mono font-bold text-slate-800 w-4 text-center">
                                  {role.count}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleIncrementRoleCount(role.id)}
                                  style={{
                                    width: `${24 * scale}px`,
                                    height: `${24 * scale}px`
                                  }}
                                  className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-90 flex items-center justify-center cursor-pointer font-bold border border-blue-200/30"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* PERMISSIONS SNAPSHOT TAGS */}
                            <div className="flex flex-wrap gap-1">
                              {role.permissions.slice(0, 4).map((p) => (
                                <span 
                                  key={p} 
                                  style={{
                                    padding: `${1 * scale}px ${4 * scale}px`,
                                    borderRadius: `${4 * scale}px`,
                                    ...getFontSize(8.5)
                                  }}
                                  className="bg-blue-50/50 text-blue-600 font-mono font-bold capitalize border border-blue-100/50"
                                >
                                  {p}
                                </span>
                              ))}
                              {role.permissions.length > 4 && (
                                <span 
                                  style={{
                                    padding: `${1 * scale}px ${4 * scale}px`,
                                    borderRadius: `${4 * scale}px`,
                                    ...getFontSize(8.5)
                                  }}
                                  className="bg-slate-50 text-slate-400 font-mono font-bold"
                                >
                                  +{role.permissions.length - 4} more
                                </span>
                              )}
                            </div>

                            {/* CARD SUB-ACTIONS */}
                            {roleIdPendingDelete === role.id ? (
                              <div className="flex items-center justify-between w-full bg-rose-50/90 px-2 py-1 rounded border border-rose-100/50 animate-fade-in mt-1">
                                <span style={getFontSize(9.5)} className="text-rose-700 font-bold flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full shrink-0" />
                                  <span>Remove this role?</span>
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleRemoveRole(role.id);
                                      setRoleIdPendingDelete(null);
                                    }}
                                    className="font-sans font-extrabold text-rose-600 hover:text-rose-800 bg-rose-100 hover:bg-rose-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
                                    style={getFontSize(9.5)}
                                  >
                                    Yes, Remove
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRoleIdPendingDelete(null)}
                                    className="font-sans font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
                                    style={getFontSize(9.5)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between pt-1 border-t border-slate-100/50 text-[10px] text-slate-500">
                                <button
                                  type="button"
                                  onClick={() => setCustomizingRole(role)}
                                  className="font-sans font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                                >
                                  <Settings className="w-3 h-3 text-blue-500 animate-spin-slow" />
                                  <span>Customize Permissions</span>
                                </button>

                                <div className="flex items-center gap-2.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDuplicateRole(role)}
                                    className="font-sans font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                                  >
                                    <Copy className="w-3 h-3 text-slate-400" />
                                    <span>Duplicate</span>
                                  </button>

                                  {role.id !== "owner" && (
                                    <button
                                      type="button"
                                      onClick={() => setRoleIdPendingDelete(role.id)}
                                      className="font-sans font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3 text-rose-400" />
                                      <span>Remove Role</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                          </div>
                        ))}
                      </div>

                      {/* BOTTOM ACTION BUTTONS */}
                      <div className="relative z-10 flex items-center justify-between gap-2.5 pt-3 mt-1 border-t border-slate-200/50 bg-white/10 shrink-0">
                        <button
                          type="button"
                          onClick={() => setCurrentView("placeholder_password")}
                          style={{
                            height: `${38 * scale}px`,
                            borderRadius: `${12 * scale}px`,
                            paddingLeft: `${14 * scale}px`,
                            paddingRight: `${14 * scale}px`,
                            ...getFontSize(12.5)
                          }}
                          className="font-sans font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100/80 border border-slate-200 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 bg-white shadow-sm"
                        >
                          Back
                        </button>

                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={handleLaunchOS}
                          style={{
                            height: `${38 * scale}px`,
                            borderRadius: `${12 * scale}px`,
                            paddingLeft: `${16 * scale}px`,
                            paddingRight: `${16 * scale}px`,
                            ...getFontSize(12.5)
                          }}
                          className="flex-1 font-sans font-bold text-white bg-gradient-to-r from-[#00b0ff] to-[#0055ff] hover:brightness-105 active:scale-[0.98] shadow-md hover:shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {isSubmitting ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <span>Launch OS</span>
                              <ChevronRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </div>

                    </div>
                  ) : currentView === "employee_onboarding" ? (
                    /* EMPLOYEE ONBOARDING VIEW (STEP 1 OF 1) */
                    <div 
                      style={{
                        padding: `${16 * scale}px ${16 * scale}px`,
                        backgroundColor: "#f8faff"
                      }}
                      className="absolute inset-0 flex flex-col justify-between overflow-hidden select-none animate-fade-in"
                    >
                      {/* Decorative elements */}
                      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-xl rounded-full pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/5 blur-xl rounded-full pointer-events-none" />

                      {/* Header */}
                      <div className="relative z-10 flex items-center justify-between mb-3 pb-2 border-b border-slate-200/50 shrink-0">
                        <div className="flex items-center gap-2">
                          <div 
                            style={{
                              width: `${32 * scale}px`,
                              height: `${32 * scale}px`,
                              borderRadius: `${8 * scale}px`
                            }}
                            className="bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/10"
                          >
                            <User style={{ width: `${16 * scale}px`, height: `${16 * scale}px` }} />
                          </div>
                          <div>
                            <h2 style={getFontSize(14)} className="font-sans font-extrabold text-blue-950 uppercase tracking-tight">
                              Employee Onboarding
                            </h2>
                            <p style={getFontSize(9.5)} className="text-indigo-600 font-sans font-medium">
                              Step 1 of 1 • Create Your Profile
                            </p>
                          </div>
                        </div>
                        <span 
                          style={{
                            padding: `${2 * scale}px ${6 * scale}px`,
                            borderRadius: `${10 * scale}px`,
                            ...getFontSize(8.5)
                          }}
                          className="font-sans font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 uppercase tracking-wider select-none shrink-0"
                        >
                          Registration
                        </span>
                      </div>

                      {/* SCROLLABLE REGISTRATION FORM */}
                      <form 
                        onSubmit={handleCompleteEmployeeOnboarding}
                        className="relative z-10 flex-1 flex flex-col justify-between overflow-hidden"
                      >
                        <div className="flex-1 overflow-y-auto pr-0.5 space-y-3 scrollbar-thin scrollbar-thumb-blue-100">
                          
                          {/* Invite Code field (Disabled) */}
                          <div className="space-y-1">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Invite Code (Verified)
                            </label>
                            <input
                              type="text"
                              name="ownerName"
                              autoComplete="name"
                              value={empInviteCode}
                              disabled
                              style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-slate-100 border border-slate-200 px-3 text-slate-500 font-mono font-bold uppercase"
                            />
                          </div>

                          {/* Personal Info Row */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                                First Name
                              </label>
                              <input
                                type="text"
                                value={empFirstName}
                                onChange={(e) => setEmpFirstName(e.target.value)}
                                placeholder="John"
                                required
                                style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                                className="w-full bg-white border border-slate-200 px-3 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                              />
                            </div>
                            <div className="space-y-1">
                              <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                                Last Name
                              </label>
                              <input
                                type="text"
                                value={empLastName}
                                onChange={(e) => setEmpLastName(e.target.value)}
                                placeholder="Smith"
                                required
                                style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                                className="w-full bg-white border border-slate-200 px-3 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                              />
                            </div>
                          </div>

                          {/* Email Input */}
                          <div className="space-y-1">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Verify Email Address
                            </label>
                            <input
                              type="email"
                              value={empEmail}
                              onChange={(e) => setEmpEmail(e.target.value)}
                              placeholder="john.smith@ironclad.com"
                              required
                              style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-white border border-slate-200 px-3 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                            />
                          </div>

                          {/* Create Password */}
                          <div className="space-y-1">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Create Password
                            </label>
                            <input
                              type="password"
                              value={empPassword}
                              onChange={(e) => setEmpPassword(e.target.value)}
                              placeholder="••••••••"
                              required
                              style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-white border border-slate-200 px-3 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                            />
                          </div>

                          {/* Contact Details */}
                          <div className="space-y-1">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Contact Phone
                            </label>
                            <input
                              type="tel"
                              value={empPhone}
                              onChange={(e) => setEmpPhone(e.target.value)}
                              placeholder="(206) 555-0199"
                              required
                              style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-white border border-slate-200 px-3 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                            />
                          </div>

                          <StructuredAddressFields
                            label="Home Address"
                            value={empAddress}
                            onChange={setEmpAddress}
                            required
                            compact
                            inputClassName="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-sans text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                          />

                          <div className="space-y-1">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Hourly Pay Rate (Optional)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={empHourlyRate}
                              onChange={(e) => setEmpHourlyRate(e.target.value)}
                              placeholder="e.g. 28.50"
                              style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-white border border-slate-200 px-3 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                            />
                          </div>

                          {/* Avatar Selection (Optional Profile Photo) */}
                          <div className="space-y-2">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Select Avatar Photo (Optional)
                            </label>
                            <div className="flex gap-3 items-center">
                              {[
                                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80",
                                "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80",
                                "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80",
                                "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80"
                              ].map((url, i) => {
                                const isSelected = empPhoto === url;
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => setEmpPhoto(url)}
                                    className={`relative rounded-full overflow-hidden w-10 h-10 border-2 cursor-pointer transition-all ${
                                      isSelected ? "border-indigo-600 scale-110 shadow-md" : "border-slate-200 opacity-60 hover:opacity-100"
                                    }`}
                                  >
                                    <img src={url} alt="Avatar" className="w-full h-full object-cover" />
                                    {isSelected && (
                                      <div className="absolute inset-0 bg-indigo-600/30 flex items-center justify-center">
                                        <Check className="w-4 h-4 text-white font-bold" />
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Employment Goals */}
                          <div className="space-y-1">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Employment Goals & Career Plan
                            </label>
                            <textarea
                              value={empGoals}
                              onChange={(e) => setEmpGoals(e.target.value)}
                              placeholder="e.g., Aspiring to become lead technician and coordinate regional operations."
                              rows={2}
                              style={{ borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-white border border-slate-200 p-2.5 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
                            />
                          </div>

                        </div>

                        {/* Actions */}
                        <div className="relative z-10 flex items-center justify-between gap-3 pt-3 mt-2 border-t border-slate-200/50 bg-white/10 shrink-0">
                          <button
                            type="button"
                            onClick={() => setCurrentView("login")}
                            style={{
                              height: `${38 * scale}px`,
                              borderRadius: `${12 * scale}px`,
                              paddingLeft: `${16 * scale}px`,
                              paddingRight: `${16 * scale}px`,
                              ...getFontSize(12.5)
                            }}
                            className="font-sans font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer flex items-center justify-center bg-white shadow-sm"
                          >
                            Cancel
                          </button>

                          <button
                            type="submit"
                            disabled={isSubmitting}
                            style={{
                              height: `${38 * scale}px`,
                              borderRadius: `${12 * scale}px`,
                              paddingLeft: `${18 * scale}px`,
                              paddingRight: `${18 * scale}px`,
                              ...getFontSize(12.5)
                            }}
                            className="flex-1 font-sans font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            {isSubmitting ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <span>Complete Onboarding</span>
                                <ChevronRight className="w-4 h-4" />
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    /* ORIGINAL HELP / PRIVACY PLACEHOLDER VIEWS */
                    <div className="absolute inset-0 bg-gradient-to-b from-[#f0f6ff] to-[#e6efff] flex flex-col items-center justify-center p-8">
                      {/* Subtle glowing ambient lights inside the card */}
                      <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-400/10 blur-2xl rounded-full pointer-events-none" />
                      <div className="absolute bottom-1/4 right-1/4 w-32 h-32 bg-cyan-400/10 blur-2xl rounded-full pointer-events-none" />
                      
                      {/* Premium sleek Back button */}
                      <button
                        onClick={handleBackToLogin}
                        style={{
                          top: `${24 * scale}px`,
                          left: `${24 * scale}px`,
                          borderRadius: `${12 * scale}px`,
                          padding: `${8 * scale}px ${16 * scale}px`,
                          gap: `${6 * scale}px`,
                          ...getFontSize(12.5)
                        }}
                        className="absolute flex items-center font-bold text-blue-600 hover:text-blue-800 bg-white/80 hover:bg-white border border-blue-100 shadow-sm active:scale-95 transition-all cursor-pointer animate-fade-in"
                      >
                        <ArrowLeft style={{ width: `${16 * scale}px`, height: `${16 * scale}px` }} />
                        <span>Back</span>
                      </button>

                      {(() => {
                        const isAgreement = currentView === "placeholder_agreement";
                        const docTitle = isAgreement ? "Owner'sLOCAL User Agreement" : "Owner'sLOCAL Privacy Policy";
                        const docIcon = isAgreement
                          ? <FileText className="mx-auto h-8 w-8 text-blue-600" />
                          : <Shield className="mx-auto h-8 w-8 text-blue-600" />;
                        const docSections = isAgreement ? OWNERS_LOCAL_USER_AGREEMENT : OWNERS_LOCAL_PRIVACY_POLICY;
                        return (
                          <div className="relative z-10 w-full max-w-sm mt-10 max-h-[85%] rounded-3xl border border-blue-100 bg-white/95 shadow-xl backdrop-blur animate-fade-in flex flex-col overflow-hidden">
                            <div className="shrink-0 px-5 pt-6 pb-3 border-b border-blue-100 text-center">
                              {docIcon}
                              <h1 className="mt-2 text-sm font-black text-blue-950 uppercase tracking-wide">{docTitle}</h1>
                              <p className="mt-1 text-[10px] font-semibold text-slate-400">Effective Date: August 28, 2026</p>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 text-left space-y-3 text-[10.5px] leading-relaxed text-slate-600 scrollbar-thin scrollbar-thumb-blue-200/50">
                              {docSections.map((section, i) => (
                                <div key={i}>
                                  <p className="font-black text-blue-950 uppercase tracking-wide text-[10.5px] mb-1">{section.heading}</p>
                                  {section.paragraphs.map((paragraph, j) => (
                                    <p key={j} className="mb-1.5 font-semibold whitespace-pre-line">{paragraph}</p>
                                  ))}
                                </div>
                              ))}
                            </div>
                            <div className="shrink-0 px-5 py-3 border-t border-blue-100 text-center">
                              <a
                                href="mailto:The.Owner@ownerslocal.com"
                                className="text-[10px] font-bold text-blue-600 hover:text-blue-800"
                              >
                                The.Owner@ownerslocal.com · Dallas–Fort Worth, Texas
                              </a>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {showOptionalProfileWarning && (
                    <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                      <div className="w-[92%] max-w-[360px] rounded-3xl border border-blue-100 bg-white p-5 text-left shadow-2xl">
                        <h3 className="text-sm font-black uppercase tracking-tight text-blue-950">Optional profile information is missing</h3>
                        <p className="mt-2 text-[11px] font-semibold leading-relaxed text-slate-600">
                          These fields are not required, but leaving them blank may limit address-based tools, contact workflows, maps, branding, and other relevant features.
                        </p>
                        <ul className="mt-3 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10.5px] font-bold text-amber-900">
                          {optionalProfileFields.map(field => <li key={field}>• {field}</li>)}
                        </ul>
                        <div className="mt-4 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setShowOptionalProfileWarning(false)}
                            className="flex-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100"
                          >
                            Complete Profile
                          </button>
                          <button
                            type="button"
                            onClick={finishBusinessProfileStep}
                            className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow hover:bg-blue-700"
                          >
                            Continue Anyway
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 2 MODAL 1: SYSTEM PERMISSIONS EXPLANATION INFO POPUP */}
                  {showRoleInfoPopup && (
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-30 animate-fade-in">
                      <div className="bg-white text-slate-800 rounded-3xl p-5 w-[90%] max-w-[350px] shadow-2xl border border-blue-100 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-200">
                              <Info className="w-4 h-4 text-blue-600 animate-pulse" />
                            </div>
                            <h3 className="text-sm font-extrabold text-blue-950 uppercase tracking-tight font-sans">
                              OwnersLOCAL Role Matrix
                            </h3>
                          </div>
                          <p style={getFontSize(11.5)} className="text-slate-600 leading-relaxed font-sans mb-3.5">
                            Our local operating system employs strict **Role-Based Access Control (RBAC)** guidelines. 
                            Each employee instance only renders screens and tabs associated directly with their authorized template.
                          </p>
                          <div className="bg-slate-50 border border-slate-150/50 p-2.5 rounded-2xl mb-4 space-y-1.5">
                            <p style={getFontSize(10.5)} className="font-sans font-bold text-slate-700 uppercase tracking-wider">
                              Default Access Profiles:
                            </p>
                            <div className="grid grid-cols-2 gap-1.5 font-sans">
                              <div>
                                <span className="font-bold text-[10px] text-blue-600 block">Office Manager</span>
                                <span className="text-[9px] text-slate-400">Leads, Jobs, Docs, Sched, Msg</span>
                              </div>
                              <div>
                                <span className="font-bold text-[10px] text-blue-600 block">Technician / Driver</span>
                                <span className="text-[9px] text-slate-400">Routes, Jobs, Messages, Clock</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowRoleInfoPopup(null)}
                          className="w-full py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-all cursor-pointer font-sans"
                        >
                          I Understand
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2 MODAL 2: CREATE CUSTOM ROLE FROM SCRATCH */}
                  {showCustomRoleModal && (
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-30 animate-fade-in">
                      <form 
                        onSubmit={handleCreateCustomRole}
                        className="bg-white text-slate-800 rounded-3xl p-5 w-[90%] max-w-[340px] shadow-2xl border border-blue-100 flex flex-col gap-3"
                      >
                        <div>
                          <h3 className="text-sm font-extrabold text-blue-950 uppercase tracking-tight flex items-center gap-1.5 mb-1 font-sans">
                            <Sparkles className="w-4 h-4 text-blue-600" /> New Custom Role
                          </h3>
                          <p style={getFontSize(10.5)} className="text-slate-400 font-sans leading-relaxed">
                            Define a brand new staff category. You can custom-configure their permissions on the next screen.
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                            Role Title Name
                          </label>
                          <input
                            type="text"
                            required
                            value={customRoleName}
                            onChange={(e) => setCustomRoleName(e.target.value)}
                            placeholder="e.g., Lead Appraiser"
                            style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                            className="w-full bg-slate-50 border border-slate-200 px-3 text-slate-800 font-sans font-bold focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-400"
                          />
                        </div>

                        <div className="flex gap-2.5 mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCustomRoleModal(false);
                              setCustomRoleName("");
                            }}
                            className="flex-1 py-2 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl shadow-md transition-all cursor-pointer"
                          >
                            Create Role
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* STEP 2 MODAL 3: GRANULAR ROLE PERMISSION CUSTOMIZER MATRIX */}
                  {customizingRole && (
                    <RolePermissionEditorModal
                      role={customizingRole}
                      onSave={handleSaveCustomPermissions}
                      onClose={() => setCustomizingRole(null)}
                      position="absolute"
                    />
                  )}

                  {/* STEP 2 MODAL 4: SECURE GENERATED INVITE CODES PANEL */}
                  {showInvitesModal && (
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-3 z-30 animate-fade-in">
                      <div className="bg-white text-slate-800 rounded-3xl p-5 w-[95%] max-w-[420px] max-h-[92%] shadow-2xl border border-blue-100 flex flex-col justify-between overflow-hidden">
                        
                        <div className="text-center shrink-0 pb-3 border-b border-slate-100">
                          <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mb-2 shadow-sm">
                            <CheckCircle className="w-5 h-5 text-emerald-600 animate-bounce" />
                          </div>
                          <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight font-sans">
                            Staff Invites Generated!
                          </h3>
                          <p style={getFontSize(9.5)} className="text-slate-400 max-w-[85%] mx-auto font-sans font-medium mt-0.5 leading-normal">
                            Single-use activation codes are prepared. Share these with team members to onboard them securely.
                          </p>
                        </div>

                        {/* CODES LIST */}
                        <div className="flex-1 overflow-y-auto my-3 pr-1 space-y-2 scrollbar-thin scrollbar-thumb-blue-100">
                          {generatedInvites.map((inv, index) => (
                            <div 
                              key={index}
                              style={{ padding: `${8 * scale}px ${10 * scale}px`, borderRadius: `${10 * scale}px` }}
                              className="bg-slate-50 border border-slate-150/50 flex items-center justify-between gap-3 font-sans group hover:bg-slate-100/50 transition-colors"
                            >
                              <div>
                                <span className="text-[10px] font-bold text-slate-900 block font-sans">
                                  {inv.role} Profile Seat
                                </span>
                                <span className="text-[9px] font-mono font-bold text-slate-400 block uppercase">
                                  KEY: {inv.code}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(inv.code);
                                  triggerNotification(`Copied key: ${inv.code}`);
                                }}
                                className="px-2.5 py-1 text-[9.5px] font-sans font-bold text-blue-600 hover:text-blue-800 bg-white hover:bg-blue-50 border border-blue-100 rounded-lg shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3 text-blue-500" />
                                <span>Copy</span>
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* BOTTOM ACTIONS */}
                        <div className="space-y-2.5 pt-2 border-t border-slate-100 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const allCodes = generatedInvites.map(i => `${i.role}: ${i.code}`).join("\n");
                              navigator.clipboard.writeText(allCodes);
                              triggerNotification("Copied all invite keys to clipboard!");
                            }}
                            className="w-full py-2 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50/50 hover:bg-blue-50 border border-blue-100 rounded-xl transition-all cursor-pointer text-center block"
                          >
                            Copy All Invite Keys
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                if (auth.currentUser) {
                                  await setDoc(doc(db, "user_profiles", auth.currentUser.uid), {
                                    isOnboarded: true
                                  }, { merge: true });
                                }
                              } catch (err) {
                                console.error("Error setting onboarded flag:", err);
                              }
                              const ownerDashboardPerms = ["dashboard", "leads", "jobs", "customers", "messages", "scheduling", "dispatch", "timeclock", "routes", "estimates", "documents", "ai_assistant", "inventory", "settings", "training"];
                              setLoggedInUser({
                                email,
                                role: "Owner",
                                permissions: ownerDashboardPerms,
                                granularPermissions: fullAccessGranular(ownerDashboardPerms)
                              });
                              setIsLoggedIn(true);
                              setActiveScreen(OS_SCREENS[0]); // Go to dashboard
                              setShowInvitesModal(false);
                              triggerNotification("Welcome to OwnersLOCAL Dashboard!");
                            }}
                            className="w-full py-2.5 text-xs font-extrabold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:brightness-105 active:scale-[0.98] rounded-xl shadow-md transition-all cursor-pointer text-center block font-sans uppercase tracking-wider"
                          >
                            Proceed to Local OS Dashboard ➔
                          </button>
                        </div>

                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Loading spinner overlay */}
              {isSubmitting && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex flex-col items-center justify-center z-20">
                  <div className="relative flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                    <Sparkles className="w-5 h-5 text-blue-600 absolute animate-pulse" />
                  </div>
                  <p className="text-blue-950 font-bold mt-4 text-xs md:text-sm tracking-wider font-sans animate-pulse">
                    {loginMethod === "google" && "Signing in..."}
                    {loginMethod === "password" && "Signing in..."}
                    {loginMethod === "invite" && "Verifying invite..."}
                  </p>
                </div>
              )}

              {/* SUB-MODAL 1: PASSWORD RECOVERY */}
              {showForgotPassword && (
                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-30 animate-fade-in">
                  <div className="bg-white text-slate-800 rounded-3xl p-6 w-[90%] max-w-[340px] shadow-2xl border border-blue-100 flex flex-col">
                    <h3 className="text-sm font-bold text-blue-950 tracking-tight flex items-center gap-1.5 mb-2">
                      <Sparkles className="w-4 h-4 text-blue-600" /> Password Recovery
                    </h3>
                    
                    {!forgotSubmitted ? (
                      <>
                        <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                          Enter your registered business email and we'll transmit a secure password recovery link.
                        </p>
                        <div className="relative mb-4">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="email"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            placeholder="Enter business email"
                            className="w-full py-2 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowForgotPassword(false);
                              setForgotEmail("");
                            }}
                            className="flex-1 py-2 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleForgotPasswordSubmit}
                            className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl shadow-md transition-colors cursor-pointer"
                          >
                            Send Link
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-2">
                        <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                        <p className="text-xs font-bold text-slate-800 mb-1">Transmission Transmitted!</p>
                        <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
                          If {forgotEmail} is in our system registry, you will receive a code shortly.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setShowForgotPassword(false);
                            setForgotSubmitted(false);
                            setForgotEmail("");
                          }}
                          className="w-full py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-colors cursor-pointer"
                        >
                          Return to Terminal
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUB-MODAL 2: NEED HELP? */}
              {showHelpDialog && (
                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-30 animate-fade-in">
                  <div className="bg-white text-slate-800 rounded-3xl p-5 w-[90%] max-w-[340px] shadow-2xl border border-blue-100">
                    <h3 className="text-sm font-bold text-blue-950 tracking-tight flex items-center gap-1.5 mb-2">
                      <HelpCircle className="w-4 h-4 text-blue-600" /> OwnersLOCAL Support Desk
                    </h3>
                    <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                      Need help accessing the Local OS platform? Here are your secure options:
                    </p>
                    <div className="space-y-2 mb-4">
                      <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-100 text-[10px] text-blue-950">
                        <span className="font-bold">Password Log In:</span> Use your primary corporate email and registered password to log in.
                      </div>
                      <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-100 text-[10px] text-blue-950">
                        <span className="font-bold">Employee Invite Log In:</span> Use a custom invite code generated in settings.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowHelpDialog(false)}
                      className="w-full py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-colors cursor-pointer"
                    >
                      Dismiss Desk
                    </button>
                  </div>
                </div>
              )}

              {/* SUB-MODAL 3: PRIVACY POLICY */}
              {showPrivacyDialog && (
                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-30 animate-fade-in">
                  <div className="bg-white text-slate-800 rounded-3xl p-5 w-[90%] max-w-[340px] shadow-2xl border border-blue-100">
                    <h3 className="text-sm font-bold text-blue-950 tracking-tight flex items-center gap-1.5 mb-2">
                      <Shield className="w-4 h-4 text-emerald-600" /> Platform Privacy Protocol
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-relaxed space-y-2 max-h-[160px] overflow-y-auto pr-1 mb-4">
                      <span>We use industry-standard AES-256 encryption to protect your business data.</span>
                      <br /><br />
                      <span>Information stored locally stays on this device. Your password is not sent to outside services.</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowPrivacyDialog(false)}
                      className="w-full py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-colors cursor-pointer"
                    >
                      Acknowledge & Close
                    </button>
                  </div>
                </div>
              )}

              {/* SUB-MODAL 5: SIGN UP INSTRUCTIONS WITH REAL FIREBASE AUTH */}
              {showSignUpInstructions && (
                <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4 z-30 animate-fade-in">
                  <div className="bg-white text-slate-800 rounded-3xl p-5 w-[90%] max-w-[340px] shadow-2xl border border-blue-100 flex flex-col justify-between max-h-[92%] overflow-y-auto font-sans">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-xl">
                          <UserPlus className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-blue-950 tracking-tight uppercase">
                            Create Owner Account
                          </h3>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                            Secure business setup
                          </p>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 mb-4 leading-relaxed font-semibold">
                        Register your business and verify your email to continue.
                      </p>

                      <form onSubmit={handleOwnerSignUp} className="space-y-3">
                        {/* OWNER NAME */}
                        <div>
                          <label className="block text-[9.5px] font-bold text-blue-900/80 uppercase tracking-wider mb-1">
                            Owner Full Name
                          </label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-800/50" />
                            <input
                              type="text"
                              name="organization"
                              autoComplete="organization"
                              required
                              value={signUpInstructionsOwnerName}
                              onChange={(e) => setSignUpInstructionsOwnerName(e.target.value)}
                              placeholder="e.g. John Doe"
                              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-semibold focus:outline-none transition-all placeholder:text-slate-300"
                            />
                          </div>
                        </div>

                        {/* BUSINESS NAME */}
                        <div>
                          <label className="block text-[9.5px] font-bold text-blue-900/80 uppercase tracking-wider mb-1">
                            Business Name
                          </label>
                          <div className="relative">
                            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-800/50" />
                            <input
                              type="text"
                              required
                              value={signUpInstructionsBusinessName}
                              onChange={(e) => setSignUpInstructionsBusinessName(e.target.value)}
                              placeholder="e.g. Ironclad Plumbing"
                              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-semibold focus:outline-none transition-all placeholder:text-slate-300"
                            />
                          </div>
                        </div>

                        {/* BUSINESS EMAIL */}
                        <div>
                          <label className="block text-[9.5px] font-bold text-blue-900/80 uppercase tracking-wider mb-1">
                            Business Email
                          </label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-800/50" />
                            <input
                              type="email"
                              name="email"
                              autoComplete="email"
                              required
                              value={signUpInstructionsEmail}
                              onChange={(e) => setSignUpInstructionsEmail(e.target.value)}
                              placeholder="e.g. owner@ironclad.com"
                              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-semibold focus:outline-none transition-all placeholder:text-slate-300"
                            />
                          </div>
                        </div>

                        {/* PASSWORD */}
                        <div>
                          <label className="block text-[9.5px] font-bold text-blue-900/80 uppercase tracking-wider mb-1">
                            Create Password
                          </label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-800/50" />
                            <input
                              type="password"
                              required
                              value={signUpInstructionsPassword}
                              onChange={(e) => setSignUpInstructionsPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-semibold focus:outline-none transition-all placeholder:text-slate-300"
                            />
                          </div>
                        </div>

                        {/* CONFIRM PASSWORD */}
                        <div>
                          <label className="block text-[9.5px] font-bold text-blue-900/80 uppercase tracking-wider mb-1">
                            Confirm Password
                          </label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-800/50" />
                            <input
                              type="password"
                              required
                              value={signUpInstructionsConfirmPassword}
                              onChange={(e) => setSignUpInstructionsConfirmPassword(e.target.value)}
                              placeholder="••••••••"
                              aria-invalid={Boolean(signUpInstructionsConfirmPassword && signUpInstructionsPassword !== signUpInstructionsConfirmPassword)}
                              className={`w-full pl-9 pr-3 py-1.5 bg-slate-50 border rounded-xl text-xs font-semibold focus:outline-none transition-all placeholder:text-slate-300 ${signUpInstructionsConfirmPassword && signUpInstructionsPassword !== signUpInstructionsConfirmPassword ? "border-rose-400 focus:border-rose-500" : "border-slate-200 focus:border-blue-500"}`}
                            />
                          </div>
                        </div>

                        {signUpInstructionsError && (
                          <p className="text-[9px] text-rose-600 font-bold bg-rose-50 p-2 rounded-lg border border-rose-200/50 animate-pulse leading-snug">
                            {signUpInstructionsError}
                          </p>
                        )}

                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowSignUpInstructions(false);
                              setSignUpInstructionsError("");
                              setSignUpInstructionsConfirmPassword("");
                            }}
                            className="flex-1 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer text-center"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSignUpSubmitting}
                            className="flex-1 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer text-center disabled:opacity-50"
                          >
                            {isSignUpSubmitting ? "Registering..." : "Sign Up"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              )}



            </div>

            {/* AI ASSISTANT BUTTON - lives below the card now, not clipped inside it */}
            {currentView === "login" && (
              <div
                style={{ marginTop: `${14 * scale}px` }}
                className="flex items-center justify-center pointer-events-auto"
              >
                <button
                  type="button"
                  onClick={() => setIsFloatingAiOpen(true)}
                  style={{
                    padding: `${8 * scale}px ${14 * scale}px`,
                    borderRadius: `${12 * scale}px`,
                    ...getFontSize(11.5)
                  }}
                  className="flex items-center gap-2 bg-gradient-to-r from-[#1F3557] to-[#315C9F] text-white font-black uppercase tracking-wider shadow-md hover:shadow-lg hover:scale-105 active:scale-[0.98] border border-blue-300/30 transition-all cursor-pointer"
                >
                  <span className="relative flex" style={{ width: `${7 * scale}px`, height: `${7 * scale}px` }}>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full bg-emerald-500" style={{ width: `${7 * scale}px`, height: `${7 * scale}px` }}></span>
                  </span>
                  <span>Owner's AI</span>
                </button>
              </div>
            )}

          </div>
        ) : (

          /* VIEW 2: THE INTERACTIVE SHOWCASE OPERATING SYSTEM */
          <div
            style={{
              borderRadius: "24px",
              // Dark Mode Dynamic uses the real starscape art (the same asset
              // as the dynamic login backgrounds) instead of a CSS-simulated
              // starfield -- set here rather than in index.css since a CSS
              // background-image can't reference a bundled/hashed asset URL.
              ...(workspaceTheme === "dark-dynamic" ? {
                backgroundImage: `url(${darkLoginBackground})`,
                backgroundSize: "cover",
                backgroundPosition: "center"
              } : {})
            }}
            className={`w-full h-[calc(100vh-100px)] min-h-[650px] bg-[#EAF5FF] border border-[#9EC8EF] overflow-hidden flex flex-row shadow-2xl relative animate-scale-up select-none max-w-7xl mx-auto workspace-theme theme-${workspaceTheme}`}
          >

            {/* COLLAPSIBLE LEFT NAV MENU */}
            <div 
              style={{
                width: isSidebarCollapsed ? "72px" : "240px",
                backgroundColor: "#C7E3FA",
                transition: "width 0.2s ease-in-out"
              }}
              className="flex flex-col border-r border-[#9EC8EF] text-[#1F3557] shrink-0 relative"
            >
              {/* Menu Header with Badges */}
              <div className="p-4 border-b border-[#9EC8EF] flex flex-col gap-2 relative">
                <div className="flex items-center justify-between">
                  {!isSidebarCollapsed ? (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                        <BrandIcon className="w-full h-full" />
                      </div>
                      <span className="font-sans font-black tracking-tight text-sm text-[#1F3557] select-none">OwnersLOCAL</span>
                      <span className="text-[7.5px] px-1.5 py-0.5 bg-[#4A86F7]/10 text-[#1F3557] rounded font-black uppercase tracking-wider select-none">Local OS</span>
                    </div>
                  ) : (
                    <div className="mx-auto w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center">
                      <BrandIcon className="w-full h-full" />
                    </div>
                  )}

                  {/* Collapse/Expand Toggle Button - ALWAYS visible on the right border! */}
                  <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    style={{
                      width: "24px",
                      height: "24px",
                    }}
                    className="absolute -right-3 top-5 bg-[#4A86F7] hover:bg-[#3977EE] border border-[#9EC8EF] rounded-full flex items-center justify-center text-white shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer z-20"
                    title={isSidebarCollapsed ? "Expand Menu" : "Collapse Menu"}
                  >
                    {isSidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Plain Text Business Name Header below Badges */}
                {!isSidebarCollapsed && (
                  <div className="mt-2.5 px-0.5 animate-fade-in text-left">
                    <p className="font-sans font-black text-xs text-[#1F3557] tracking-wider uppercase leading-normal">
                      {businessNames?.[0] || "Your Business"}
                    </p>
                    {["Owner", "Manager", "General Manager", "Office Manager"].includes(simulatedRole || loggedInUser?.role || "") && (
                      <button
                        type="button"
                        onClick={openBusinessProfileEditor}
                        className="mt-2 w-full rounded-lg border border-[#9EC8EF] bg-[#EAF5FF] px-2 py-1.5 text-left text-[9px] font-black uppercase tracking-wide text-[#315C9F] hover:border-[#4A86F7] hover:bg-white"
                      >
                        Business Setup / Edit Business Profile
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Dynamic Menu List (Role-Based Visibility) */}
              <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-none">
                {getVisibleScreens().filter(screen => screen.id !== "owner_console").map((screen) => {
                  const isCurrent = activeScreen.id === screen.id;
                  // Calculate unread count for this screen
                  const pendingCustomerCount = screen.id === "customers" ? customers.filter(customer => customer.pendingConfirmation).length : 0;
                  const unreadCount = Math.max(notifications.filter(n => n.screenId === screen.id && !n.isRead).length, pendingCustomerCount);

                  return (
                    <button
                      key={screen.id}
                      onClick={() => {
                        setActiveScreen(screen);
                        setNotifications(prev => prev.map(n => n.screenId === screen.id ? { ...n, isRead: true } : n));
                        triggerNotification(`Navigated to: ${screen.label}`);
                      }}
                      className={`w-full rounded-xl transition-all duration-200 cursor-pointer flex items-center relative group ${
                        isSidebarCollapsed ? "justify-center p-2" : "px-3 py-2"
                      } ${
                        isCurrent
                          ? "bg-gradient-to-r from-[#2E7BEF] to-[#1485F4] text-white font-bold shadow-[0_0_10px_rgba(20,133,244,0.45)]"
                          : "hover:bg-[#BDDDF8] text-[#5E7393] hover:text-[#1F3557] border border-transparent"
                      }`}
                      title={screen.label}
                    >
                      {isSidebarCollapsed ? (
                        /* Only show menu icons when collapsed */
                        <span className={`shrink-0 select-none ${isCurrent ? "text-white" : "text-[#5E7393] group-hover:text-[#1F3557]"}`}>
                          {getScreenIcon(screen.id, "w-[18px] h-[18px] text-current")}
                        </span>
                      ) : (
                        /* Show both icon and label when expanded */
                        <div className="flex items-center gap-2.5 w-full min-w-0">
                          <span className={`shrink-0 select-none ${isCurrent ? "text-white" : "text-[#5E7393] group-hover:text-[#1F3557]"}`}>
                            {getScreenIcon(screen.id, "w-[18px] h-[18px] text-current")}
                          </span>
                          <span className={`font-sans font-bold tracking-wide text-xs flex-1 text-left truncate ${isCurrent ? "text-white" : "text-[#5E7393] group-hover:text-[#1F3557]"}`}>
                            {screen.label}
                          </span>
                        </div>
                      )}
                      
                      {/* Badge for AI Assistant */}
                      {!isSidebarCollapsed && screen.badge && (
                        <span className="text-[7.5px] bg-[#1F3557]/10 text-[#1F3557] px-1 py-0.5 rounded font-black tracking-wider uppercase select-none">
                          {screen.badge}
                        </span>
                      )}

                      {/* Subtle red notification dot next to menu item (no count, extremely refined!) */}
                      {unreadCount > 0 && (
                        <span className="absolute top-2 right-2 flex h-2 w-2 items-center justify-center rounded-full bg-red-500 ring-1 ring-white" />
                      )}
                    </button>
                  );
                })}

                {/* Role preview card */}
                {!isSidebarCollapsed && !loggedInUser?.isEmployee && (
                  <div className="mx-1 my-3 p-4 bg-[#1F3557]/5 border border-[#1F3557]/10 rounded-2xl flex flex-col gap-1.5 text-left animate-fade-in">
                    <p className="text-[8.5px] font-black text-[#1F3557]/80 uppercase tracking-wider">ROLE PREVIEW</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-[#1F3557]">Preview employee access</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#1F3557]" />
                    </div>
                    <p className="text-[10px] text-[#1F3557]/60 leading-relaxed font-sans font-medium">
                      Instantly switch roles to preview permission-guarded tools.
                    </p>
                  </div>
                )}
              </div>

              {/* Bottom profile info block */}
              <div className="p-3 border-t border-[#9EC8EF] bg-transparent flex flex-col gap-2 relative">
                
                {/* Notification Panel Popover */}
                {showNotificationPanel && (
                  <div className="absolute bottom-16 left-4 right-4 bg-[#C7E3FA] text-[#1F3557] rounded-2xl p-4 shadow-2xl border border-[#9EC8EF] z-50 flex flex-col max-h-[300px] overflow-hidden animate-slide-up">
                    <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <BellRing className="w-4 h-4 text-red-500 animate-bounce" />
                        <span className="text-xs font-black text-[#1F3557] uppercase tracking-wider">Operational Alerts</span>
                      </div>
                      <button 
                        onClick={() => setShowNotificationPanel(false)}
                        className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold"
                      >
                        ✕
                      </button>
                    </div>
                    
                    {/* List of active notifications */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                      {notifications.length === 0 ? (
                        <div className="text-center py-6 text-[#5E7393] text-xs font-sans">
                          No pending alerts. Clear board!
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div 
                            key={notif.id} 
                            onClick={() => {
                              // Mark as read
                              setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
                              if (notif.screenId) {
                                const matched = OS_SCREENS.find(s => s.id === notif.screenId);
                                if (matched) setActiveScreen(matched);
                              }
                              triggerNotification(`Viewed alert: ${notif.title}`);
                            }}
                            className={`p-2 rounded-xl text-left border transition-all cursor-pointer hover:bg-[#BDDDF8] ${
                              notif.isRead 
                                ? "bg-[#EAF5FF] border-[#9EC8EF] text-[#5E7393]" 
                                : "bg-[#BDDDF8] border-[#9EC8EF] font-semibold text-[#1F3557]"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] uppercase font-black tracking-wider text-[#4A86F7]">{notif.title}</span>
                              <span className="text-[8px] text-[#5E7393] font-mono">{notif.time}</span>
                            </div>
                            <p className="text-[10px] mt-0.5 leading-normal truncate">{notif.description}</p>
                            {notif.type === "time_clock_approval" && notif.actionable && !notif.actionedAt && (
                              <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => setReviewingClockNotifLogId(notif.relatedLogId)}
                                  className="px-2 py-1 bg-[#315C9F] hover:bg-[#1F3557] text-white rounded-lg text-[9px] font-black uppercase cursor-pointer"
                                >
                                  Review & Approve
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                    
                    <div className="border-t border-[#9EC8EF] pt-2 flex items-center justify-between text-[10px] mt-2 font-bold">
                      <button 
                        onClick={() => {
                          setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                          triggerNotification("Marked all alerts as read");
                        }}
                        className="text-[#4A86F7] hover:underline cursor-pointer"
                      >
                        Mark all read
                      </button>
                      <button
                        onClick={() => {
                          setNotifications([]);
                          triggerNotification("Cleared all alert logs");
                        }}
                        className="text-red-500 hover:underline cursor-pointer"
                      >
                        Clear all
                      </button>
                    </div>
                  </div>
                )}

                {reviewingClockNotifLogId && (() => {
                  const reviewingLog = timeClockLogs.find(l => l.id === reviewingClockNotifLogId);
                  if (!reviewingLog) return null;
                  return (
                    <TimeClockApprovalModal
                      log={reviewingLog}
                      timeClockLogs={timeClockLogs}
                      setTimeClockLogs={setTimeClockLogs}
                      setNotifications={setNotifications}
                      businessId={businessId}
                      actingUserEmail={loggedInUser?.email}
                      actingUserName={loggedInUser?.name}
                      logOperationalEvent={logOperationalEvent}
                      notify={triggerNotification}
                      onClose={() => setReviewingClockNotifLogId(null)}
                    />
                  );
                })()}

                <div className={`flex ${isSidebarCollapsed ? "flex-col items-center gap-2.5" : "items-center gap-2 justify-between"} overflow-hidden`}>
                  <div className={`flex ${isSidebarCollapsed ? "flex-col items-center" : "items-center gap-2"} min-w-0`}>
                    <div className="w-10 h-10 rounded-full bg-[#A9CEF5] text-[#1F3557] flex items-center justify-center text-xs font-black shrink-0 border border-[#9EC8EF] uppercase select-none">
                      {loggedInUser?.name ? loggedInUser.name.slice(0, 2) : (loggedInUser?.role === "Owner" ? "SJ" : "EM")}
                    </div>
                    {!isSidebarCollapsed && (
                      <div className="flex-1 min-w-0 animate-fade-in text-left">
                        <p className="text-xs font-sans font-extrabold text-[#1F3557] truncate leading-tight">
                           {loggedInUser?.name || (loggedInUser?.email ? loggedInUser.email.split("@")[0] : "waterdrops2001")}
                        </p>
                        <div 
                          className="flex items-center gap-1.5 mt-0.5 cursor-pointer hover:opacity-80"
                          onClick={() => {
                            const actRole = simulatedRole || loggedInUser?.role || "Owner";
                            if (actRole === "Owner") {
                              const scr = OS_SCREENS.find((s) => s.id === "owner_console");
                              if (scr) {
                                setActiveScreen(scr);
                                triggerNotification("🔑 Secure shortcut activated: Entering Owner Control Console.");
                              }
                            }
                          }}
                          title={ (simulatedRole || loggedInUser?.role || "Owner") === "Owner" ? "Launch Owner Console" : undefined }
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <p className="text-[10px] font-mono text-[#1F3557]/60 truncate uppercase tracking-wider leading-none">
                            {simulatedRole || loggedInUser?.role || "Owner"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Block: Notification Bell + Redo Onboarding Trigger + Sign out */}
                  <div className={`flex items-center gap-1.5 ${isSidebarCollapsed ? "flex-col w-full mt-1.5" : ""}`}>
                    {/* Notification bell button */}
                    <button
                      onClick={() => setShowNotificationPanel(!showNotificationPanel)}
                      className="relative p-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[#315C9F] transition-all cursor-pointer flex items-center justify-center"
                      title="Alert Center"
                    >
                      <Bell className="w-3.5 h-3.5 text-[#315C9F]" />
                      
                      {/* Quiet red notification dot */}
                      {notifications.some(n => !n.isRead) && (
                        <span className="absolute top-1 right-1 flex h-1.5 w-1.5 items-center justify-center rounded-full bg-red-500" />
                      )}
                    </button>

                    {/* Redo Onboarding reset simulation */}
                    <button
                      onClick={() => {
                        setCurrentView("login");
                        setIsLoggedIn(false);
                        triggerNotification("System onboarding sequence re-triggered!");
                      }}
                      className="p-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[#315C9F] transition-all cursor-pointer flex items-center justify-center"
                      title="Redo Onboarding Sequence"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>

                    {/* Standard Sign out */}
                    <button
                      onClick={handleLogout}
                      className="p-1.5 bg-[#EAF5FF] hover:bg-rose-100/50 border border-[#9EC8EF] hover:border-rose-200 rounded-xl text-[#315C9F] hover:text-rose-600 transition-all cursor-pointer flex items-center justify-center"
                      title="Sign Out Session"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* MAIN APP BODY CONTENT AREA */}
            <div className="flex-1 flex flex-col min-w-0 min-h-[640px] overflow-hidden relative bg-[#EAF5FF]">
              
              {/* Workspace Top Toolbar Header */}
              {activeScreen.id !== "dashboard" && (
                <div className="px-5 py-3 border-b border-[#9EC8EF] bg-[#C7E3FA] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[#5E7393] uppercase font-mono tracking-wider">Workspace:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-extrabold text-[#1F3557] bg-[#EAF5FF] border border-[#9EC8EF] px-2.5 py-1 rounded-xl">
                      {activeScreen.label}
                    </span>
                  </div>

                  {/* Simulated Role Dropdown (Only visible to Owners) */}
                  {loggedInUser?.role === "Owner" && (
                    <div className="relative flex items-center gap-1.5 ml-2 pl-2 border-l border-[#9EC8EF]">
                      <span className="text-[9px] text-[#5E7393] font-mono">SIMULATION:</span>
                      <select
                        value={simulatedRole || "Owner"}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSimulatedRole(val === "Owner" ? null : val);
                          triggerNotification(`Simulating permissions for: ${val}`);
                        }}
                        className="text-[10px] font-extrabold text-[#1F3557] bg-[#EAF5FF] hover:bg-[#EAF5FF]/80 border border-[#9EC8EF] rounded-lg px-2 py-0.5 focus:outline-none cursor-pointer"
                      >
                        <option value="Owner">Owner (View All 17)</option>
                        <option value="Office Manager">Office Manager (View 11)</option>
                        <option value="Technician">Technician</option>
                        <option value="Salesperson">Sales Representative</option>
                        <option value="Driver">Driver / Installer</option>
                      </select>
                    </div>
                  )}
                </div>

              </div>
              )}

              {/* RENDER DYNAMIC SECTION */}
              {(

                /* LIVE RESPONSIVE OPERATIONAL WORKSPACE (Custom implementation of all views!) */
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-thin">

                  {simulatedRole && (
                    <div className="sticky top-0 z-40 bg-amber-500 text-amber-950 rounded-2xl px-4 py-2.5 shadow-lg flex items-center justify-between gap-3 font-bold text-xs">
                      <span>⚠️ PREVIEWING AS "{simulatedRole}" — some tabs and data are hidden to match that role's real permissions. This is not your real Owner view.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSimulatedRole(null);
                          triggerNotification("Exited simulation — back to your real Owner view.");
                        }}
                        className="shrink-0 px-3 py-1 bg-amber-950 text-amber-50 rounded-lg text-[10.5px] uppercase tracking-wide cursor-pointer hover:bg-amber-900"
                      >
                        Exit Simulation
                      </button>
                    </div>
                  )}

                  {activeScreen.id === "dashboard" ? ( (() => {
                    // NOTE: there's no persisted pay-period hours ledger yet (TimeClockPage logs
                    // individual clock in/out events but nothing here aggregates them into a
                    // pay-period total) — this only reflects the current live clock-in session,
                    // not fabricated baseline hours.
                    const totalHours = (clockInDuration / 3600).toFixed(1);
                    const isAuthorizedToCustomize = ["Owner", "General Manager", "Office Manager", "Operations Manager", "Accountant / Bookkeeper", "Accountant"].includes(simulatedRole || loggedInUser?.role || "Owner");

                    // Keep the dashboard widget on the exact same selected period and
                    // financial series as the Revenue page graph.
                    const getDashboardGraphData = () => getRevenueChartData(revenuePageFilter, revenueEvents, transactions).series;
                    const dashboardFinancials = getRevenueChartData(revenuePageFilter, revenueEvents, transactions);
                    const dashboardNetRevenue = dashboardFinancials.currentTotal - dashboardFinancials.currentExpenseTotal;

                    // Dashboard widgets show real company data -- each slot maps to the
                    // real module permission that governs it, so an employee only ever
                    // sees the widgets their role/granular permissions actually grant
                    // (same source of truth as the sidebar nav / getVisibleScreens()),
                    // instead of every widget being visible with only some individually
                    // locked by ad hoc role-name checks.
                    const screenIdForCardTarget: Record<string, string> = {
                      revenue: "revenue",
                      leads: "leads",
                      scheduling: "scheduling",
                      fleet: "routes",
                      messages: "messages",
                      inventory: "inventory",
                    };

                    // Renders card by slot target ID
                    const renderCardSlot = (targetId: string, slotLabel: string) => {
                      const requiredScreenId = screenIdForCardTarget[targetId];
                      if (requiredScreenId && !getVisibleScreens().some(s => s.id === requiredScreenId)) {
                        return (
                          <div
                            key={slotLabel}
                            className="bg-[#C7E3FA] border border-dashed border-red-300 p-4 rounded-[24px] shadow-sm flex flex-col items-center justify-center h-[240px] text-center gap-2"
                          >
                            <span className="text-2xl">🔒</span>
                            <span className="text-[10px] font-black tracking-wider uppercase text-red-700">Restricted Widget</span>
                            <p className="text-[9.5px] text-slate-500 font-sans font-medium leading-tight px-3">
                              Your role does not have permission to view this metric.
                            </p>
                          </div>
                        );
                      }
                      switch (targetId) {
                        case "revenue":
                          {
                            const activeRoleVal = simulatedRole || loggedInUser?.role || "Owner";
                            const isFinAuthorized = getVisibleScreens().some(s => s.id === "revenue");
                            return (
                              <div 
                                key={slotLabel}
                                onClick={() => {
                                  if (!isFinAuthorized) {
                                    triggerNotification("⚠️ Access Denied: Financial metrics are restricted to Owners/Admins.");
                                    logOperationalEvent("Security Violation", `User with role ${activeRoleVal} attempted to navigate to financial details via dashboard widget`, "🚨");
                                    return;
                                  }
                                  const matched = OS_SCREENS.find(s => s.id === "revenue");
                                  if (matched) setActiveScreen(matched);
                                  triggerNotification("Navigated to Revenue details");
                                }}
                                className="bg-[#C7E3FA] border border-[#9EC8EF] p-4 rounded-[24px] shadow-sm flex flex-col justify-between h-[240px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer relative text-left"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 text-[#1F3557]">
                                    {getScreenIcon("revenue", "w-4 h-4 text-[#315C9F]")}
                                    <span className="text-[10px] font-black tracking-wider uppercase">COMPANY REVENUE</span>
                                  </div>
                                  <span className="text-[8px] bg-[#315C9F]/10 text-[#315C9F] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                    {revenuePageFilter}
                                  </span>
                                </div>
                                
                                <div className="my-1 text-left">
                                  <p className="text-lg font-sans font-black text-[#1F3557] tracking-tight leading-none">
                                    {isFinAuthorized ? (
                                      <>
                                        {`${dashboardNetRevenue < 0 ? "-" : ""}$${Math.abs(dashboardNetRevenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                      </>
                                    ) : (
                                      <span className="text-sm font-sans font-extrabold text-red-600 bg-red-100 px-2 py-0.5 rounded-md border border-red-200">
                                        [REDACTED - OWNER ONLY]
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[9px] text-[#5E7393] font-bold mt-0.5">Live Income vs Expenses & Taxes</p>
                                </div>

                                <div className="flex-1 w-full min-h-[100px] mt-2 relative">
                                  {isFinAuthorized ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart data={getDashboardGraphData()} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#9EC8EF" vertical={false} />
                                        <XAxis
                                          dataKey="time"
                                          stroke="#5E7393"
                                          fontSize={8}
                                          tickLine={false}
                                          axisLine={false}
                                          className="font-mono"
                                        />
                                        <YAxis
                                          stroke="#5E7393"
                                          fontSize={8}
                                          tickLine={false}
                                          axisLine={false}
                                          className="font-mono"
                                        />
                                        <Line
                                          type="monotone"
                                          dataKey="Revenue"
                                          stroke="#4A86F7"
                                          strokeWidth={1.5}
                                          dot={{ r: 1 }}
                                          activeDot={{ r: 3 }}
                                          name="Revenue"
                                        />
                                        <Line
                                          type="monotone"
                                          dataKey="Expenses"
                                          stroke="#F43F5E"
                                          strokeWidth={1.5}
                                          dot={{ r: 1 }}
                                          activeDot={{ r: 3 }}
                                          name="Expenses"
                                        />
                                        <Line
                                          type="monotone"
                                          dataKey="Profit"
                                          stroke="#22C55E"
                                          strokeWidth={1.5}
                                          dot={{ r: 1 }}
                                          activeDot={{ r: 3 }}
                                          name="Profit"
                                        />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950/5 border border-dashed border-red-300 rounded-2xl p-2 text-center">
                                      <span className="text-lg">🔒</span>
                                      <p className="text-[10px] font-sans font-bold text-red-700 mt-1 uppercase tracking-wider">Financial Visualization Locked</p>
                                      <p className="text-[8px] text-slate-500 font-sans mt-0.5 font-medium leading-tight">Your current role ({activeRoleVal}) does not have permissions to view business financial data.</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                        case "leads":
                          return (
                            <div 
                              key={slotLabel}
                              onClick={() => {
                                const matched = OS_SCREENS.find(s => s.id === "leads");
                                if (matched) setActiveScreen(matched);
                                triggerNotification("Navigated to Leads Center");
                              }}
                              className="bg-[#C7E3FA] border border-[#9EC8EF] p-4 rounded-[24px] shadow-sm flex flex-col justify-between h-[240px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-1.5 text-[#1F3557]">
                                {getScreenIcon("leads", "w-4 h-4 text-[#315C9F]")}
                                <span className="text-[10px] font-black tracking-wider uppercase">ACTIVE LEADS</span>
                              </div>
                              
                              <div className="my-1.5 text-left flex-1 flex flex-col justify-between">
                                <div>
                                  <p className="text-xl font-sans font-black text-[#1F3557] tracking-tight leading-none">{leads.length} Leads</p>
                                  <p className="text-[9px] text-[#5E7393] font-bold mt-1">Adjusted from connected sources</p>
                                </div>

                                <div className="space-y-1 my-3 text-[10px] text-[#1F3557]/85 font-semibold">
                                  {leads.length === 0 ? (
                                    <p className="text-[9px] text-[#5E7393]/70 italic">No active leads yet.</p>
                                  ) : (
                                    [...leads]
                                      .sort((a, b) => (a.addedDaysAgo ?? 0) - (b.addedDaysAgo ?? 0))
                                      .slice(0, 3)
                                      .map((lead) => (
                                        <div key={lead.id} className="flex items-center justify-between border-b border-blue-200/40 pb-1 last:border-b-0">
                                          <span className="flex items-center gap-1 text-[#1F3557]/90 truncate">👤 {lead.name}</span>
                                          <span className="bg-[#315C9F]/10 text-[#315C9F] px-1.5 py-0.2 rounded text-[8px] font-bold shrink-0">{lead.source}</span>
                                        </div>
                                      ))
                                  )}
                                </div>

                                <span className="text-[8.5px] uppercase tracking-wider font-black text-[#315C9F] flex items-center gap-1 mt-1">
                                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                                  Active Live CRM Sync OK
                                </span>
                              </div>
                            </div>
                          );
                        case "scheduling": {
                          const todayStr = `${liveTime.getFullYear()}-${String(liveTime.getMonth() + 1).padStart(2, "0")}-${String(liveTime.getDate()).padStart(2, "0")}`;
                          const todayEvents = schedulingEvents.filter(e => e.date === todayStr);
                          return (
                            <div 
                              key={slotLabel}
                              onClick={() => {
                                const matched = OS_SCREENS.find(s => s.id === "scheduling");
                                if (matched) setActiveScreen(matched);
                                triggerNotification("Navigated to Schedule calendar");
                              }}
                              className="bg-[#C7E3FA] border border-[#9EC8EF] p-4 rounded-[24px] shadow-sm flex flex-col justify-between h-[240px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-1.5 text-[#1F3557]">
                                {getScreenIcon("scheduling", "w-4 h-4 text-[#315C9F]")}
                                <span className="text-[10px] font-black tracking-wider uppercase">ACTIVE JOBS TODAY</span>
                              </div>
                              
                              <div className="my-1.5 text-left flex-1 flex flex-col justify-between">
                                <div>
                                  <p className="text-xl font-sans font-black text-[#1F3557] tracking-tight leading-none">{todayEvents.length} Jobs Scheduled</p>
                                  <p className="text-[9px] text-[#5E7393] font-bold mt-1">Populated from monthly calendar</p>
                                </div>

                                <div className="space-y-1.5 my-3 text-[9.5px] font-semibold text-[#1F3557]/85">
                                  {todayEvents.slice(0, 3).map((e) => (
                                    <div key={e.id} className="flex items-center gap-1.5 truncate">
                                      <span className="w-1.5 h-1.5 bg-[#315C9F]/40 rounded-full shrink-0" />
                                      <span className="font-mono text-[8px] text-[#5E7393]">{e.startTime}</span>
                                      <span className="truncate text-[#1F3557]/90 font-bold">{e.notes || e.eventType} - {e.customer}</span>
                                    </div>
                                  ))}
                                  {todayEvents.length === 0 && (
                                    <p className="text-[10px] text-slate-500 italic">No events scheduled for today</p>
                                  )}
                                </div>

                                <span className="text-[8.5px] uppercase tracking-wider font-black text-[#315C9F] hover:underline">
                                  View Interactive Calendar ➔
                                </span>
                              </div>
                            </div>
                          );
                        }
                        case "fleet":
                          return (
                            <div 
                              key={slotLabel}
                              onClick={() => {
                                const matched = OS_SCREENS.find(s => s.id === "routes");
                                if (matched) setActiveScreen(matched);
                                triggerNotification("Navigated to Fleet Routes");
                              }}
                              className="bg-[#C7E3FA] border border-[#9EC8EF] p-4 rounded-[24px] shadow-sm flex flex-col justify-between h-[240px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-1.5 text-[#1F3557]">
                                {getScreenIcon("dispatch", "w-4 h-4 text-[#315C9F]")}
                                <span className="text-[10px] font-black tracking-wider uppercase">FLEET TELEMETRY</span>
                              </div>
                              
                              <div className="my-1.5 text-left flex-1 flex flex-col justify-between">
                                <div>
                                  <p className="text-xl font-sans font-black text-[#1F3557] tracking-tight leading-none">3 Drivers Online</p>
                                  <p className="text-[9px] text-[#5E7393] font-bold mt-1">GPX Navigation tracking active</p>
                                </div>

                                <div className="space-y-1.5 my-3 text-[9.5px] font-semibold text-[#1F3557]/85">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[#1F3557]/90 font-bold">Truck #1 (John D.)</span>
                                    <span className="text-[#5E7393] font-mono text-[8.5px]">En Route</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[#1F3557]/90 font-bold">Truck #2 (Pete M.)</span>
                                    <span className="text-[#315C9F] font-mono text-[8.5px]">On Site</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[#1F3557]/90 font-bold">Truck #3 (Sarah T.)</span>
                                    <span className="text-[#5E7393] font-mono text-[8.5px]">Staged</span>
                                  </div>
                                </div>

                                <span className="text-[8.5px] uppercase tracking-wider font-black text-[#315C9F]">
                                  GPS tracking connected
                                </span>
                              </div>
                            </div>
                          );
                        case "messages":
                          return (
                            <div 
                              key={slotLabel}
                              onClick={() => {
                                const matched = OS_SCREENS.find(s => s.id === "messages");
                                if (matched) setActiveScreen(matched);
                                triggerNotification("Navigated to Messages Board");
                              }}
                              className="bg-[#C7E3FA] border border-[#9EC8EF] p-4 rounded-[24px] shadow-sm flex flex-col justify-between h-[240px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-1.5 text-[#1F3557]">
                                {getScreenIcon("messages", "w-4 h-4 text-[#315C9F]")}
                                <span className="text-[10px] font-black tracking-wider uppercase">MESSAGES FEED</span>
                              </div>
                              
                              <div className="my-1.5 text-left flex-1 flex flex-col justify-between">
                                <div>
                                  <p className="text-xl font-sans font-black text-[#1F3557] tracking-tight leading-none">{dashboardConversations.reduce((s: number, c: any) => s + (c.unreadCount || 0), 0)} Unread Chats</p>
                                  <p className="text-[9px] text-[#5E7393] font-bold mt-1">{dashboardConversations.length} conversation{dashboardConversations.length === 1 ? "" : "s"} total</p>
                                </div>

                                {dashboardConversations.length === 0 ? (
                                  <p className="text-[9px] text-[#5E7393] font-sans font-semibold my-2">No conversations yet.</p>
                                ) : (
                                  <div className="space-y-1.5 my-2 text-[9px] text-[#1F3557]/85 leading-normal">
                                    {[...dashboardConversations]
                                      .sort((a: any, b: any) => (b.lastMessageTime || "").localeCompare(a.lastMessageTime || ""))
                                      .slice(0, 2)
                                      .map((c: any) => (
                                        <p key={c.id} className="border-l-2 border-[#315C9F] pl-1.5 font-sans font-semibold truncate">
                                          <strong className="text-[#1F3557]">{c.lastMessageSender || c.title}:</strong> "{c.lastMessage || "No messages yet"}"
                                        </p>
                                      ))}
                                  </div>
                                )}

                                {dashboardConversations.some((c: any) => (c.unreadCount || 0) > 0) && (
                                  <span className="text-[8.5px] uppercase tracking-wider font-black text-[#315C9F] flex items-center gap-1 mt-1">
                                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                                    New Messages Available
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        case "inventory": {
                          const lowStockItems = inventoryList
                            .filter(i => i.quantity <= i.minQuantity)
                            .sort((a, b) => (a.quantity - a.minQuantity) - (b.quantity - b.minQuantity));
                          return (
                            <div
                              key={slotLabel}
                              onClick={() => {
                                const matched = OS_SCREENS.find(s => s.id === "inventory");
                                if (matched) setActiveScreen(matched);
                                triggerNotification("Navigated to Inventory");
                              }}
                              className="bg-[#C7E3FA] border border-[#9EC8EF] p-4 rounded-[24px] shadow-sm flex flex-col justify-between h-[240px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-1.5 text-[#1F3557]">
                                {getScreenIcon("inventory", "w-4 h-4 text-[#315C9F]")}
                                <span className="text-[10px] font-black tracking-wider uppercase">INVENTORY MONITORS</span>
                              </div>

                              <div className="my-1.5 text-left flex-1 flex flex-col justify-between">
                                <div>
                                  <p className="text-xl font-sans font-black text-[#1F3557] tracking-tight leading-none">{lowStockItems.length} Alert{lowStockItems.length === 1 ? "" : "s"} Active</p>
                                  <p className="text-[9px] text-[#5E7393] font-bold mt-1">{inventoryList.length} item{inventoryList.length === 1 ? "" : "s"} on file</p>
                                </div>

                                {lowStockItems.length === 0 ? (
                                  <p className="text-[9.5px] text-[#5E7393]/70 italic my-3">
                                    {inventoryList.length === 0 ? "No inventory items yet." : "All items above their minimum quantity."}
                                  </p>
                                ) : (
                                  <div className="space-y-1.5 my-3 text-[9.5px] font-semibold text-[#1F3557]/85">
                                    {lowStockItems.slice(0, 2).map(item => (
                                      <div key={item.id} className="flex items-center justify-between text-[#1F3557]/90">
                                        <span className="flex items-center gap-1 truncate">
                                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.quantity === 0 ? "bg-red-500" : "bg-[#F59E0B]"}`} />
                                          <span className="truncate">{item.name}</span>
                                        </span>
                                        <span className="shrink-0">Qty: {item.quantity}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {lowStockItems.length > 0 && (
                                  <span className="text-[8.5px] uppercase tracking-wider font-black text-[#315C9F] hover:underline">
                                    Review low stock ➔
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }
                        default:
                          return null;
                      }
                    };

                    return (
                      <>
                      <div className="flex justify-end">
                        <PlaidConnectButton />
                      </div>
                      <div className="flex-1 flex flex-col gap-5 animate-fade-in text-[#1F3557]">
                        
                        {/* TEAM MEMBER TERMINAL (Top side-to-side card) */}
                        <div className="w-full bg-[#C7E3FA] border border-[#9EC8EF] p-5 rounded-[24px] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden text-left">
                          {/* Left contents */}
                          <div className="text-left space-y-1 bg-transparent border-none p-0 shadow-none">
                            <div className="flex items-center gap-1.5 text-[10px] font-black text-[#1F3557] uppercase tracking-wider">
                              <Laptop className="w-3.5 h-3.5 text-[#315C9F]" />
                              <span>TEAM DASHBOARD</span>
                            </div>
                            <h2 className="text-base md:text-lg font-sans font-black tracking-tight text-[#1F3557] flex items-center gap-2">
                              Welcome, {loggedInUser?.name || (loggedInUser?.email ? loggedInUser.email.split("@")[0] : "waterdrops2001")}!
                              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse border-2 border-white" />
                            </h2>
                            <p className="text-[11px] font-sans font-bold text-[#5E7393]">
                              Role: <span className="text-[#1F3557] uppercase font-mono">{simulatedRole || loggedInUser?.role || "Owner"}</span> • Hours Clocked This Session: <strong className="text-[#1F3557]">{totalHours} hours</strong>
                            </p>
                          </div>

                          {/* Right clock & date block & action buttons */}
                          <div className="flex flex-col sm:flex-row md:flex-col items-stretch md:items-end gap-2 shrink-0 w-full md:w-auto">
                            <div className="bg-[#4A86F7] hover:bg-[#3977EE] text-white p-3 px-4 rounded-2xl flex flex-col items-center justify-center min-w-[170px] shadow-md border border-[#9EC8EF]/40 text-center">
                              <span className="text-[9px] font-black tracking-widest text-blue-100 uppercase leading-none mb-1.5">
                                {liveTime.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}
                              </span>
                              <span className="text-base font-mono font-black tracking-wider leading-none select-all text-white">
                                {liveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                              </span>
                              <span className="text-[8px] font-bold text-blue-200 font-mono mt-1 uppercase tracking-widest leading-none">
                                Secure Workspace
                              </span>
                            </div>
                            <div className="flex gap-2 w-full">
                              <button
                                onClick={() => takeSnapshot("dashboard", "Dashboard", {
                                  recordCount: 3,
                                  filters: `Role: ${simulatedRole || loggedInUser?.role || "Owner"}`,
                                  details: "Dashboard quick capture. Modules rendered successfully."
                                })}
                                className="flex-1 px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-[10px] uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                                title="Take Page Snapshot"
                              >
                                <Camera className="w-3.5 h-3.5 text-[#315C9F]" />
                                Snapshot
                              </button>
                              <button
                                onClick={() => openPageAIAnalysis("dashboard", "Dashboard")}
                                className="flex-1 px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-[10px] uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                                title="AI Option"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                                AI Option
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* MIDDLE ROW: 3 SEPARATE SQUARE SHAPED NEUTRAL CARDS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {renderCardSlot(customCardTargets.card1, "Slot 1")}
                          {renderCardSlot(customCardTargets.card2, "Slot 2")}
                          {renderCardSlot(customCardTargets.card3, "Slot 3")}
                        </div>

                        {/* Configure Dashboard -- opens the same slot-picker modal the old
                            "Customize Daily View" card used to trigger, now a single button
                            sitting directly above Company Bulletins instead of its own card. */}
                        <button
                          onClick={() => {
                            if (!isAuthorizedToCustomize) {
                              triggerNotification("Access Denied: Only Owners, Managers, and Accountants can customize the daily view panels.");
                              return;
                            }
                            setIsCustomizingDailyViewOpen(true);
                            triggerNotification("Opening dashboard daily view customizer...");
                          }}
                          className={`w-full py-2.5 rounded-xl text-[10.5px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            isAuthorizedToCustomize
                              ? "bg-[#4A86F7] hover:bg-[#3977EE] text-white shadow-sm"
                              : "bg-blue-100/50 text-blue-400 border border-blue-200/50 cursor-not-allowed"
                          }`}
                        >
                          {isAuthorizedToCustomize ? (
                            <>
                              <Sliders className="w-3.5 h-3.5" />
                              <span>Configure Dashboard ➔</span>
                            </>
                          ) : (
                            <span>Restricted To Management 🔒</span>
                          )}
                        </button>

                        {/* BOTTOM ROW: COMPANY BULLETINS (Side to side rectangular card) */}
                        <div
                          onClick={() => {
                            const matched = OS_SCREENS.find(s => s.id === "bulletins");
                            if (matched) setActiveScreen(matched);
                            triggerNotification("Navigated to Company Bulletin Board");
                          }}
                          className="w-full bg-[#C7E3FA] border border-[#9EC8EF] p-5 rounded-[24px] shadow-sm flex flex-col gap-3 text-left hover:scale-[1.002] transition-all cursor-pointer relative"
                        >
                          <div className="flex items-center justify-between border-b border-[#9EC8EF]/30 pb-2">
                            <div className="flex items-center gap-1.5 text-[#1F3557]">
                              {getScreenIcon("bulletins", "w-4 h-4 text-[#315C9F]")}
                              <span>COMPANY BULLETIN BOARD</span>
                            </div>
                            <span className="text-[9.5px] font-black text-[#315C9F] hover:underline flex items-center gap-1">
                              View Bulletin Board ➔
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
                            {bulletins.filter(b => b.status === "approved").slice(0, 2).map((bulletin) => (
                              <div key={bulletin.id} className="p-4 bg-[#EAF5FF] border border-[#9EC8EF]/60 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow transition-shadow">
                                <div className="flex items-center justify-between text-[9px] font-bold text-[#1F3557]">
                                  <span className="uppercase tracking-wider text-[#5E7393]">{bulletin.author} ({bulletin.role})</span>
                                  <span className="font-mono text-[#5E7393]">{bulletin.date}</span>
                                </div>
                                <h4 className="text-xs font-black text-[#1F3557] uppercase tracking-wider leading-tight">{bulletin.title}</h4>
                                <p className="text-[10.5px] text-[#5E7393] line-clamp-2 leading-relaxed font-sans font-medium">{bulletin.content}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* CUSTOMIZATION DIALOG MODAL PANEL */}
                        {isCustomizingDailyViewOpen && (
                          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                            <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[420px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up">
                              <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3.5 mb-4">
                                <div className="flex items-center gap-2">
                                  <Sliders className="w-5 h-5 text-[#315C9F]" />
                                  <h3 className="text-sm font-black text-[#1F3557] uppercase tracking-wider">Customize Daily View</h3>
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCustomizingDailyViewOpen(false);
                                  }}
                                  className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold"
                                >
                                  ✕
                                </button>
                              </div>

                              <p className="text-xs text-[#5E7393] font-sans font-semibold mb-4 leading-relaxed">
                                Select which metric cards populate your primary three dashboard panel slots. Save to update immediately.
                              </p>

                              <div className="space-y-4">
                                <div className="space-y-1 flex flex-col">
                                  <label className="text-[9.5px] uppercase tracking-wider text-[#5E7393] font-bold">Slot 1 Metric Card</label>
                                  <CustomDropdown
                                    value={customCardTargets.card1}
                                    onChange={(val) => setCustomCardTargets(prev => ({ ...prev, card1: val }))}
                                    options={DAILY_VIEW_OPTIONS}
                                    scale={scale}
                                  />
                                </div>

                                <div className="space-y-1 flex flex-col">
                                  <label className="text-[9.5px] uppercase tracking-wider text-[#5E7393] font-bold">Slot 2 Metric Card</label>
                                  <CustomDropdown
                                    value={customCardTargets.card2}
                                    onChange={(val) => setCustomCardTargets(prev => ({ ...prev, card2: val }))}
                                    options={DAILY_VIEW_OPTIONS}
                                    scale={scale}
                                  />
                                </div>

                                <div className="space-y-1 flex flex-col">
                                  <label className="text-[9.5px] uppercase tracking-wider text-[#5E7393] font-bold">Slot 3 Metric Card</label>
                                  <CustomDropdown
                                    value={customCardTargets.card3}
                                    onChange={(val) => setCustomCardTargets(prev => ({ ...prev, card3: val }))}
                                    options={DAILY_VIEW_OPTIONS}
                                    scale={scale}
                                  />
                                </div>
                              </div>

                              <div className="flex gap-2.5 mt-6 pt-3 border-t border-[#9EC8EF]">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCustomizingDailyViewOpen(false);
                                  }}
                                  className="flex-1 py-2.5 border border-[#9EC8EF] bg-[#EAF5FF] hover:bg-[#BDDDF8] text-[#1F3557] font-bold rounded-xl text-xs transition-colors cursor-pointer text-center"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCustomizingDailyViewOpen(false);
                                    triggerNotification("Dashboard Daily View slots successfully updated!");
                                  }}
                                  className="flex-1 py-2.5 bg-[#4A86F7] hover:bg-[#3977EE] text-white font-bold rounded-xl text-xs transition-colors cursor-pointer text-center shadow-sm uppercase tracking-wider"
                                >
                                  Save Layout
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                      </>
                    );
                  })()

                  ) : activeScreen.id === "customers" ? (
                    <CustomersPage
                      onOpenPlaceholder={(screenId) => {
                        const matched = OS_SCREENS.find(s => s.id === screenId);
                        if (matched) {
                          setActiveScreen(matched);
                          triggerNotification(`Navigated to Placeholder for: ${matched.label}`);
                        }
                      }}
                    />

                  ) : activeScreen.id === "leads" ? (
                    <LeadsPage />

                  ) : activeScreen.id === "snapshots" ? (
                    <SnapshotsPage />

                  ) : activeScreen.id === "estimates" ? (
                    <EstimatesPage />

                  ) : activeScreen.id === "roster" ? (
                    <RosterPage />

                  ) : activeScreen.id === "timeclock" ? (
                    <TimeClockPage
                      isClockedIn={isClockedIn}
                      setIsClockedIn={setIsClockedIn}
                      clockInTime={clockInTime}
                      setClockInTime={setClockInTime}
                      clockInDuration={clockInDuration}
                      setClockInDuration={setClockInDuration}
                    />

                  ) : activeScreen.id === "inventory" ? (
                    <InventoryPage />

                  ) : activeScreen.id === "documents" ? (
                    <DocumentsPage />

                  ) : activeScreen.id === "accounting" ? (
                    <AccountingPage />

                  ) : activeScreen.id === "messages" ? (
                    <MessagesPage />

                  ) : activeScreen.id === "training" ? (
                    <TrainingPage />

                  ) : activeScreen.id === "ai_assistant" ? (
                    <AIAssistantPage
                      globalAiSetting={globalAiSetting}
                      setGlobalAiSetting={setGlobalAiSetting}
                      moduleAiSettings={moduleAiSettings}
                      setModuleAiSettings={setModuleAiSettings}
                    />

                  ) : activeScreen.id === "integrations" ? (
                    
                    <IntegrationsPage
                      dashboardLeads={dashboardLeads}
                      setDashboardLeads={setDashboardLeads}
                    />

                  ) : activeScreen.id === "settings" ? (
                    
                    <SettingsPage
                      initialSection={preSelectedSettingsSection}
                      businessNames={businessNames}
                      setBusinessNames={setBusinessNames}
                      businessPhones={businessPhones}
                      setBusinessPhones={setBusinessPhones}
                      businessAddresses={businessAddresses}
                      setBusinessAddresses={setBusinessAddresses}
                      businessLogos={businessLogos}
                      setBusinessLogos={setBusinessLogos}
                      ownerNames={ownerNames}
                      setOwnerNames={setOwnerNames}
                      ownerPhones={ownerPhones}
                      setOwnerPhones={setOwnerPhones}
                      companyLocations={companyLocations}
                      setCompanyLocations={setCompanyLocations}
                      employeeRedoOnboardingAllowed={employeeRedoOnboardingAllowed}
                      setEmployeeRedoOnboardingAllowed={setEmployeeRedoOnboardingAllowed}
                      revenueResetInterval={revenueResetInterval}
                      setRevenueResetInterval={setRevenueResetInterval}
                      globalAiSetting={globalAiSetting}
                      setGlobalAiSetting={setGlobalAiSetting}
                      moduleAiSettings={moduleAiSettings}
                      setModuleAiSettings={setModuleAiSettings}
                      selectedRoles={selectedRoles}
                      setSelectedRoles={setSelectedRoles}
                      workspaceTheme={workspaceTheme}
                      setWorkspaceTheme={setWorkspaceTheme}
                    />

                  ) : activeScreen.id === "owner_console" ? (
                    (simulatedRole || loggedInUser?.role || "Owner") === "Technician" ? (
                      <div className="p-8 bg-slate-900 border border-red-500/30 rounded-[28px] text-center max-w-md mx-auto my-12 space-y-4">
                        <ShieldAlert className="w-16 h-16 text-red-500 mx-auto animate-bounce" />
                        <h2 className="text-xl font-bold text-white">Restricted Access – Owner only</h2>
                        <p className="text-xs text-slate-400 font-sans leading-relaxed">
                          Your account role (Technician) does not have permissions to access the Owner Console. This event has been logged for security audit purposes.
                        </p>
                        <button
                          onClick={() => setActiveScreen(OS_SCREENS[0])}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          Return to Dashboard
                        </button>
                      </div>
                    ) : (
                      <OwnerConsolePage
                        dashboardLeads={dashboardLeads}
                        setDashboardLeads={setDashboardLeads}
                        revenueResetInterval={revenueResetInterval}
                      />
                    )

                  ) : activeScreen.id === "revenue" ? (
                    !getVisibleScreens().some(screen => screen.id === "revenue") ? (
                      <div className="p-8 bg-slate-900 border border-red-500/30 rounded-[28px] text-center max-w-md mx-auto my-12 space-y-4">
                        <ShieldAlert className="w-16 h-16 text-red-500 mx-auto animate-bounce" />
                        <h2 className="text-xl font-bold text-white">Restricted Access</h2>
                        <p className="text-xs text-slate-400 font-sans leading-relaxed">
                          Your account does not have permission to access the Revenue Page or view financial data.
                        </p>
                        <button
                          onClick={() => setActiveScreen(OS_SCREENS[0])}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          Return to Dashboard
                        </button>
                      </div>
                    ) : (
                      /* HIGHLY POLISHED COMPREHENSIVE REVENUE PAGE */
                      <div className="space-y-3 animate-fade-in text-left">
                      {/* QUICK ACTIONS - 4 BUTTONS + Plaid connect, ONE SLEEK LINE (scrolls horizontally rather than wrapping) */}
                      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' as any }}>
                        <div className="flex flex-nowrap gap-2 w-max">
                          {[
                            { label: "Record Expense", action: "expense", icon: DollarSign },
                            { label: "Add Custom Payment", action: "payment", icon: CreditCard },
                            { label: "Run Payroll", action: "payroll", icon: Users },
                            { label: "Create Invoice", action: "invoice", icon: FileText }
                          ].map((btn, idx) => (
                            <button
                              key={idx}
                              disabled={btn.action === "payroll" && isRunningPayroll}
                              onClick={() => {
                                if (btn.action === "expense") {
                                  sessionStorage.setItem("ownerslocal_pending_financial_scan", "expense");
                                  setLogTransactionType("expense");
                                  return;
                                }
                                if (btn.action === "payment") {
                                  // Same real income-transaction pipeline as Money
                                  // Tracker's own "+ Log Income" button, so a custom
                                  // payment shows up everywhere a payment already
                                  // does -- the graph, the Payments table, CSV
                                  // exports, the Revenue Breakdown donut.
                                  sessionStorage.setItem("ownerslocal_pending_financial_scan", "income");
                                  setLogTransactionType("income");
                                  return;
                                }
                                if (btn.action === "payroll") {
                                  handleRunPayroll();
                                  return;
                                }
                                const accounting = OS_SCREENS.find(screen => screen.id === "accounting");
                                if (accounting) setActiveScreen(accounting);
                                triggerNotification("Open Invoices to create a customer invoice.");
                              }}
                              className="shrink-0 bg-gradient-to-r from-[#2E7BEF] to-[#1485F4] hover:from-[#1E6EE0] hover:to-[#0D5FCB] border border-white/40 rounded-xl px-3.5 py-2 flex items-center gap-1.5 cursor-pointer transition-all shadow-[0_0_10px_rgba(20,133,244,0.35)] disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <btn.icon className="w-3.5 h-3.5 text-white shrink-0" style={{ filter: 'drop-shadow(0 1px 2px rgba(4,20,46,0.85))' }} />
                              <span
                                className="text-[10.5px] font-extrabold text-white uppercase tracking-wide whitespace-nowrap"
                                style={{ textShadow: '0 1px 2px rgba(4,20,46,0.85), 0 0 1px rgba(4,20,46,0.9)' }}
                              >
                                {btn.action === "payroll" && isRunningPayroll ? "Running Payroll..." : btn.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* TOP SECTION - MONEY TRACKER CARD (graph, real stat tiles, real breakdowns, real cash flow, upcoming ticker) */}
                      <div className="mt-card relative overflow-hidden bg-[linear-gradient(145deg,rgba(220,240,255,0.98),rgba(190,225,251,0.96)_48%,rgba(213,239,255,0.98))] rounded-xl p-4 sm:p-5 border border-white/95 shadow-[0_0_28px_rgba(56,189,248,0.52),inset_0_0_34px_rgba(255,255,255,0.86)] space-y-3 text-[#07599a]">
                        {/* HUD decoration: grid texture, corner brackets -- all decorative, sit behind the real content below */}
                        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: 'linear-gradient(rgba(14,116,180,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(14,116,180,0.055) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
                        <span className="pointer-events-none absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-white" />
                        <span className="pointer-events-none absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-white" />
                        <span className="pointer-events-none absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-white" />
                        <span className="pointer-events-none absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-white" />
                        {(() => {
                          const stepData = getRevenueStepSeries(revenuePageFilter, revenueEvents, transactions, bills);
                          const { points, periodStart, periodEnd } = stepData;
                          const latest = points[points.length - 1];
                          const paymentsTotal = latest.Payments;
                          const expensesTotal = latest.Expenses;
                          const netTotal = latest.Net;

                          const { priorTotal, priorExpenseTotal } = getRevenueChartData(revenuePageFilter, revenueEvents, transactions, bills);
                          const priorNet = priorTotal - priorExpenseTotal;
                          const pctChange = (cur: number, prior: number) => (prior !== 0 ? ((cur - prior) / Math.abs(prior)) * 100 : null);
                          const paymentsPct = pctChange(paymentsTotal, priorTotal);
                          const expensesPct = pctChange(expensesTotal, priorExpenseTotal);
                          const netPct = pctChange(netTotal, priorNet);

                          const inPeriod = (d: string) => {
                            const t = new Date(d).getTime();
                            return !Number.isNaN(t) && t >= periodStart.getTime() && t <= periodEnd.getTime();
                          };
                          const jobRevenueThisPeriod = revenueEvents.filter(e => inPeriod(e.date)).reduce((s, e) => s + e.amount, 0);
                          const loggedIncomeThisPeriod = transactions.filter(t => t.type === "income" && inPeriod(t.date)).reduce((s, t) => s + t.amount, 0);

                          const materialCategories = new Set(["Material Expenses", "Materials", "Equipment", "Fuel", "Office Supplies", "Tools", "Supplies", "Inventory"]);
                          const categoryTotalsThisPeriod = EXPENSE_CATEGORY_NAMES.map(name => {
                            const values = name === "Bills"
                              ? bills.filter(b => b.status !== "void" && inPeriod(b.issuedDate)).map(b => b.totalCost ?? b.estimatedCost ?? b.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0))
                              : name === "Material Expenses"
                                ? transactions.filter(t => t.type === "expense" && materialCategories.has(t.category || "") && inPeriod(t.date)).map(t => t.amount)
                                : transactions.filter(t => t.type === "expense" && t.category === name && inPeriod(t.date)).map(t => t.amount);
                            return { name: name as string, total: values.reduce((s, v) => s + v, 0) };
                          }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

                          const topCategories = categoryTotalsThisPeriod.slice(0, 4);
                          const otherCategoriesTotal = categoryTotalsThisPeriod.slice(4).reduce((s, c) => s + c.total, 0);
                          const expenseSlices = [
                            ...topCategories.map((c, i) => ({ label: c.name, value: c.total, color: ["#FB7185", "#FBBF24", "#A78BFA", "#94A3B8"][i % 4] })),
                            ...(otherCategoriesTotal > 0 ? [{ label: "Other", value: otherCategoriesTotal, color: "#64748B" }] : [])
                          ];
                          const revenueSlicesRaw = [
                            { label: "Completed Job Revenue", value: jobRevenueThisPeriod, color: "#22D3EE" },
                            { label: "Logged Income", value: loggedIncomeThisPeriod, color: "#60A5FA" }
                          ];
                          const revenueSlices = revenueSlicesRaw.filter(s => s.value > 0);
                          const revenueSlicesTotal = revenueSlices.reduce((s, r) => s + r.value, 0);
                          const expenseSlicesTotal = expenseSlices.reduce((s, r) => s + r.value, 0);

                          const cashFlowSeries = getRevenueChartData(revenuePageFilter, revenueEvents, transactions, bills).series;

                          const todayStr = new Date().toISOString().slice(0, 10);
                          const upcomingJobs = schedulingEvents
                            .filter(e => e.eventType === "Job" && e.date >= todayStr && e.status !== "Completed" && e.status !== "Cancelled")
                            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
                            .map(e => ({ id: e.id, label: e.title || e.customer || "Job", amount: e.budget || 0 }));
                          const upcomingBills = bills
                            .filter(b => b.status !== "paid" && b.status !== "void")
                            .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
                            .map(b => ({ id: b.id, label: b.billNumber ? `Bill ${b.billNumber} — ${b.vendor}` : b.vendor, amount: Math.max(0, b.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0) - b.amountPaid) }));

                          const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          const xTickFormat = (ms: number) => {
                            const d = new Date(ms);
                            return revenuePageFilter === "Day"
                              ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                              : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                          };
                          // Per-filter calendar tick structure: a labeled "major" tick plus
                          // unlabeled hash-mark ticks at finer resolution, matching a real
                          // calendar axis instead of ticks auto-derived from sparse event data.
                          // Week: every day, all labeled. Month: every day hash-marked, every
                          // week labeled. Quarter: every day hash-marked, every month labeled.
                          // Annual: every week hash-marked, every month labeled. Day/Pay
                          // Period/Total keep Recharts' own auto ticks (empty ticks array).
                          const DAY_MS = 86400000;
                          const buildAxisTicks = (): { ticks: number[]; isMajor: (t: number) => boolean; majorLabel: (t: number) => string } => {
                            const startMs = periodStart.getTime();
                            const endMs = periodEnd.getTime();
                            if (revenuePageFilter === "Week") {
                              const ticks: number[] = [];
                              for (let t = startMs; t <= endMs; t += DAY_MS) ticks.push(t);
                              return { ticks, isMajor: () => true, majorLabel: (t) => new Date(t).toLocaleDateString(undefined, { weekday: "short" }) };
                            }
                            if (revenuePageFilter === "Month") {
                              const ticks: number[] = [];
                              for (let t = startMs; t <= endMs; t += DAY_MS) ticks.push(t);
                              return {
                                ticks,
                                isMajor: (t) => Math.round((t - startMs) / DAY_MS) % 7 === 0,
                                majorLabel: (t) => `Wk ${Math.floor(Math.round((t - startMs) / DAY_MS) / 7) + 1}`
                              };
                            }
                            if (revenuePageFilter === "Quarter") {
                              const ticks: number[] = [];
                              for (let t = startMs; t <= endMs; t += DAY_MS) ticks.push(t);
                              return { ticks, isMajor: (t) => new Date(t).getDate() === 1, majorLabel: (t) => new Date(t).toLocaleDateString(undefined, { month: "short" }) };
                            }
                            if (revenuePageFilter === "Annual") {
                              const ticks: number[] = [];
                              for (let t = startMs; t <= endMs; t += DAY_MS * 7) ticks.push(t);
                              return { ticks, isMajor: (t) => new Date(t).getDate() <= 7, majorLabel: (t) => new Date(t).toLocaleDateString(undefined, { month: "short" }) };
                            }
                            return { ticks: [], isMajor: () => true, majorLabel: xTickFormat };
                          };
                          const axisTicks = buildAxisTicks();
                          // Diamond-shaped marker (matches the approved reference chart's
                          // square/diamond points) instead of Recharts' default circle dot.
                          const diamondDot = (color: string) => (dotProps: any) => {
                            const { cx, cy, index } = dotProps;
                            const s = 6.5;
                            return (
                              <rect
                                key={`diamond-${color}-${index}`}
                                x={cx - s / 2}
                                y={cy - s / 2}
                                width={s}
                                height={s}
                                fill={color}
                                stroke="#fff"
                                strokeWidth={1.25}
                                transform={`rotate(45 ${cx} ${cy})`}
                              />
                            );
                          };

                          // One shared ticker renderer -- Upcoming Job Payments and
                          // Upcoming Bills & Expenses are two independent scrolling
                          // columns, each looping the same way.
                          const renderTicker = (items: Array<{ id: string; label: string; amount: number }>, emptyText: string, tone: "income" | "expense") => (
                            <div className="bg-[linear-gradient(145deg,rgba(224,242,255,0.94),rgba(195,227,251,0.96))] rounded-lg border border-white/95 shadow-[0_0_14px_rgba(56,189,248,0.36),inset_0_0_18px_rgba(255,255,255,0.82)] h-28 overflow-hidden relative">
                              {items.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-[11px] font-mono text-[#2473aa]/60">{emptyText}</div>
                              ) : (
                                <div
                                  className="absolute inset-x-0 top-0 hover:[animation-play-state:paused]"
                                  style={{ animation: `ticker-scroll ${Math.max(12, items.length * 3)}s linear infinite` }}
                                >
                                  {[0, 1].map(copy => (
                                    <div key={copy}>
                                      {items.map((item, idx) => (
                                        <div key={`${copy}_${item.id}_${idx}`} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-sky-500/15 text-xs font-mono">
                                          <span className={`font-semibold truncate ${tone === "income" ? "text-[#00C853]" : "text-[#FF1744]"}`} style={{ textShadow: tone === "income" ? '0 0 6px rgba(0,230,118,0.85), 0 0 14px rgba(0,200,83,0.5)' : '0 0 6px rgba(255,23,68,0.85), 0 0 14px rgba(255,23,68,0.5)' }}>{item.label}</span>
                                          <span className={`font-mono font-bold shrink-0 ${tone === "income" ? "text-[#00C853]" : "text-[#FF1744]"}`} style={{ textShadow: tone === "income" ? '0 0 7px rgba(0,230,118,0.9), 0 0 16px rgba(0,200,83,0.6)' : '0 0 7px rgba(255,23,68,0.9), 0 0 16px rgba(255,23,68,0.55)' }}>{fmt(item.amount)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );

                          return (
                            <>
                              {/* HEADER: Money Tracker + graph-interval dropdown (top-left), Live badge (top-right) */}
                              <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/90 pb-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="select-none text-xl" style={{ filter: 'drop-shadow(0 0 6px rgba(14,165,233,0.55))' }}>💰</span>
                                  <h2 className="text-base font-mono font-black text-[#07599a] uppercase tracking-[0.2em]" style={{ textShadow: '0 0 10px rgba(255,255,255,0.95)' }}>Money Tracker</h2>
                                  <select
                                    aria-label="Graph interval"
                                    value={revenuePageFilter}
                                    onChange={(e) => {
                                      changeRevenuePageFilter(e.target.value);
                                      triggerNotification(`Graph interval updated to: ${e.target.options[e.target.selectedIndex].text}`);
                                    }}
                                    className="text-[10.5px] font-mono font-bold text-[#07599a] bg-[#e8f6ff]/90 border border-white rounded-md px-3 py-2 focus:outline-none cursor-pointer shadow-[0_0_10px_rgba(56,189,248,0.34),inset_0_0_8px_rgba(255,255,255,0.9)]"
                                  >
                                    <option value="Day">Day</option>
                                    <option value="Week">Week</option>
                                    <option value="Pay Period">Pay Period</option>
                                    <option value="Month">Month</option>
                                    <option value="Quarter">Quarter</option>
                                    <option value="Annual">Annual</option>
                                    <option value="Total">Total</option>
                                  </select>
                                </div>
                                <span className="flex items-center gap-1.5 text-[10px] font-mono font-black text-[#078e64] uppercase tracking-wider bg-white/45 border border-white px-2.5 py-1 rounded-md shadow-[0_0_10px_rgba(56,189,248,0.28)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.9)' }} />
                                  Live Data
                                </span>
                              </div>

                              {logTransactionType && (
                                <LogTransactionModal
                                  type={logTransactionType}
                                  createdBy={loggedInUser?.email}
                                  onSave={handleSaveTransaction}
                                  onClose={() => { sessionStorage.removeItem("ownerslocal_pending_financial_scan"); setLogTransactionType(null); }}
                                />
                              )}

                              {/* GRAPH -- full width HUD readout */}
                              <div>
                                <div className="relative overflow-hidden rounded-lg bg-[linear-gradient(145deg,rgba(225,243,255,0.96),rgba(194,227,251,0.96))] border border-white shadow-[0_0_18px_rgba(56,189,248,0.40),inset_0_0_24px_rgba(255,255,255,0.82)] p-2">
                                  <span className="pointer-events-none absolute top-1.5 left-1.5 w-3 h-3 border-t border-l border-cyan-400/60" />
                                  <span className="pointer-events-none absolute top-1.5 right-1.5 w-3 h-3 border-t border-r border-cyan-400/60" />
                                  <span className="pointer-events-none absolute bottom-1.5 left-1.5 w-3 h-3 border-b border-l border-cyan-400/60" />
                                  <span className="pointer-events-none absolute bottom-1.5 right-1.5 w-3 h-3 border-b border-r border-cyan-400/60" />
                                  {/* Purely decorative twinkle accents -- fixed positions, not derived from data */}
                                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                                    <span className="absolute text-white/80" style={{ top: '14%', left: '24%', fontSize: 9, textShadow: '0 0 6px rgba(255,255,255,0.9)' }}>✦</span>
                                    <span className="absolute text-white/70" style={{ top: '58%', left: '70%', fontSize: 7, textShadow: '0 0 5px rgba(255,255,255,0.85)' }}>✦</span>
                                    <span className="absolute text-white/60" style={{ top: '32%', left: '84%', fontSize: 6, textShadow: '0 0 5px rgba(255,255,255,0.8)' }}>✦</span>
                                    <span className="absolute text-white/70" style={{ top: '74%', left: '14%', fontSize: 8, textShadow: '0 0 6px rgba(255,255,255,0.85)' }}>✦</span>
                                    <span className="absolute text-white/60" style={{ top: '20%', left: '55%', fontSize: 6, textShadow: '0 0 5px rgba(255,255,255,0.8)' }}>✦</span>
                                  </div>
                                  <ResponsiveContainer width="100%" height={580}>
                                  <ComposedChart
                                    data={points}
                                    margin={{ top: 10, right: 20, left: 8, bottom: 0 }}
                                    onClick={(state: any) => {
                                      if (state && state.activeLabel !== undefined && state.activePayload && state.activePayload.length) {
                                        setPinnedChartPoint({ label: state.activeLabel, payload: state.activePayload });
                                      }
                                    }}
                                  >
                                    <defs>
                                      <linearGradient id="mtGlowPayments" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#168BFF" stopOpacity={0.48} />
                                        <stop offset="100%" stopColor="#168BFF" stopOpacity={0} />
                                      </linearGradient>
                                      <linearGradient id="mtGlowExpenses" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#FF6E91" stopOpacity={0.46} />
                                        <stop offset="100%" stopColor="#FF6E91" stopOpacity={0} />
                                      </linearGradient>
                                      <linearGradient id="mtGlowNet" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#14E6D1" stopOpacity={0.50} />
                                        <stop offset="100%" stopColor="#14E6D1" stopOpacity={0} />
                                      </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="1 3" stroke="#68A9CF" strokeOpacity={0.38} vertical={true} />
                                    <XAxis
                                      dataKey="x"
                                      type="number"
                                      domain={[periodStart.getTime(), periodEnd.getTime()]}
                                      {...(axisTicks.ticks.length ? { ticks: axisTicks.ticks, interval: 0 } : { interval: "preserveStartEnd" as const, minTickGap: 24 })}
                                      tickFormatter={(t: number) => axisTicks.ticks.length ? (axisTicks.isMajor(t) ? axisTicks.majorLabel(t) : "") : xTickFormat(t)}
                                      stroke="#12689E"
                                      fontSize={10}
                                      tickLine={true}
                                      axisLine={false}
                                      dy={10}
                                      className="font-mono"
                                    />
                                    <YAxis
                                      domain={[0, (max: number) => Math.ceil(max * 1.04)]}
                                      stroke="#12689E"
                                      fontSize={10}
                                      tickLine={false}
                                      axisLine={false}
                                      tickFormatter={(val) => val >= 1000 ? `$${(val / 1000).toFixed(0)}k` : `$${val}`}
                                      className="font-mono"
                                      width={44}
                                    />
                                    <Legend
                                      verticalAlign="top"
                                      height={36}
                                      iconType="circle"
                                      iconSize={8}
                                      className="font-mono font-bold text-[11px]"
                                      wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', color: '#07599A' }}
                                    />
                                    {graphDataTypes.includes("revenue") && <Area type="linear" dataKey="Payments" stroke="none" fill="url(#mtGlowPayments)" isAnimationActive={false} legendType="none" tooltipType="none" />}
                                    {graphDataTypes.includes("expenses") && <Area type="linear" dataKey="Expenses" stroke="none" fill="url(#mtGlowExpenses)" isAnimationActive={false} legendType="none" tooltipType="none" />}
                                    {graphDataTypes.includes("profit") && <Area type="linear" dataKey="Net" stroke="none" fill="url(#mtGlowNet)" isAnimationActive={false} legendType="none" tooltipType="none" />}
                                    {graphDataTypes.includes("revenue") && <Line type="linear" dataKey="Payments" stroke="#168BFF" strokeWidth={3} dot={diamondDot("#168BFF")} activeDot={{ r: 7 }} name="Payments Collected" isAnimationActive={false} style={{ filter: 'drop-shadow(0 0 7px #168BFF) drop-shadow(0 0 16px rgba(22,139,255,0.65)) drop-shadow(0 0 34px rgba(22,139,255,0.42))' }} />}
                                    {graphDataTypes.includes("expenses") && <Line type="linear" dataKey="Expenses" stroke="#FF6E91" strokeWidth={3} dot={diamondDot("#FF6E91")} activeDot={{ r: 7 }} name="Expenses" isAnimationActive={false} style={{ filter: 'drop-shadow(0 0 7px #FF6E91) drop-shadow(0 0 16px rgba(255,110,145,0.62)) drop-shadow(0 0 34px rgba(255,110,145,0.40))' }} />}
                                    {graphDataTypes.includes("profit") && <Line type="linear" dataKey="Net" stroke="#14E6D1" strokeWidth={3} dot={diamondDot("#14E6D1")} activeDot={{ r: 7 }} name="Net Revenue" isAnimationActive={false} style={{ filter: 'drop-shadow(0 0 7px #14E6D1) drop-shadow(0 0 16px rgba(20,230,209,0.68)) drop-shadow(0 0 34px rgba(20,230,209,0.44))' }} />}
                                  </ComposedChart>
                                  </ResponsiveContainer>
                                  {pinnedChartPoint && (
                                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 min-w-[190px] bg-[#e2f3ff]/95 border border-white shadow-[0_0_20px_rgba(56,189,248,0.45)] p-3 rounded-lg text-left text-xs font-mono">
                                      <button
                                        type="button"
                                        onClick={() => setPinnedChartPoint(null)}
                                        aria-label="Close"
                                        className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-white text-[#07599a] hover:bg-[#c7e3fa] cursor-pointer"
                                      >
                                        ✕
                                      </button>
                                      <p className="font-bold text-[#07599a] mb-1.5 pr-5 border-b border-sky-500/20 pb-1">{new Date(pinnedChartPoint.label).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                                      <div className="space-y-1">
                                        {pinnedChartPoint.payload.map((entry: any, index: number) => (
                                          <div key={index} className="flex items-center justify-between gap-6">
                                            <span className="flex items-center gap-1.5 font-semibold text-[#2473aa] text-[11px]">
                                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color, boxShadow: `0 0 6px ${entry.color}` }} />
                                              {entry.name}:
                                            </span>
                                            <span className="font-mono font-bold text-[#07599a] text-[11px]">
                                              ${entry.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Graph series toggles, then View Financial Reports */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {([
                                  { value: "revenue",  label: "Payments Collected" },
                                  { value: "expenses", label: "Expenses" },
                                  { value: "profit",   label: "Net Revenue" },
                                ] as const).map(({ value, label }) => {
                                  const selected = graphDataTypes.includes(value);
                                  return (
                                    <button
                                      key={value}
                                      onClick={() => setGraphDataTypes(current => selected ? current.filter(v => v !== value) : [...current, value])}
                                      className={`min-h-10 px-3 py-2 text-[10.5px] font-mono rounded-md font-bold transition-all duration-200 cursor-pointer ${
                                        selected
                                          ? "bg-[#dff4ff] text-[#07599a] border border-white shadow-[0_0_15px_rgba(56,189,248,0.52),inset_0_0_10px_rgba(255,255,255,0.95)]"
                                          : "bg-[#cce8fb]/85 border border-white/80 text-[#2473aa]/65 hover:text-[#07599a]"
                                      }`}
                                    >
                                      {selected ? "✓ " : ""}{label}
                                    </button>
                                  );
                                })}
                                <button
                                  onClick={() => setIsFinancialSnapshotOpen(true)}
                                  className="min-h-10 px-3.5 py-2 text-[10.5px] font-mono font-extrabold uppercase tracking-wide rounded-md bg-gradient-to-r from-[#0EA5E9] to-[#1485F4] text-white cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_0_18px_rgba(14,165,233,0.72),inset_0_0_7px_rgba(255,255,255,0.42)]"
                                >
                                  <Landmark className="w-3.5 h-3.5" /> View Financial Reports
                                </button>
                              </div>

                              {/* REVENUE BREAKDOWN / EXPENSE BREAKDOWN / CASH FLOW -- all real, this-period data */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-[linear-gradient(145deg,rgba(225,243,255,0.96),rgba(194,227,251,0.96))] rounded-lg p-4 border border-white shadow-[0_0_15px_rgba(56,189,248,0.35),inset_0_0_18px_rgba(255,255,255,0.82)]">
                                  <p className="text-[10px] font-mono font-black text-[#07599a] uppercase tracking-widest mb-2">Revenue Breakdown</p>
                                  {revenueSlices.length === 0 ? (
                                    <p className="text-[10.5px] text-[#2473aa]/55 font-mono text-center py-8">No revenue this period yet.</p>
                                  ) : (
                                    <div className="flex items-center gap-3">
                                      <div style={{ filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.5))' }}>
                                        <ResponsiveContainer width={90} height={90}>
                                          <PieChart>
                                            <Pie data={revenueSlices} dataKey="value" nameKey="label" innerRadius={26} outerRadius={40} paddingAngle={2} stroke="none">
                                              {revenueSlices.map((s, i) => <Cell key={i} fill={s.color} />)}
                                            </Pie>
                                          </PieChart>
                                        </ResponsiveContainer>
                                      </div>
                                      <div className="space-y-1.5 flex-1 min-w-0">
                                        {revenueSlices.map((s, i) => (
                                          <div key={i} className="flex items-center justify-between gap-2 text-[10px] font-mono">
                                            <span className="flex items-center gap-1.5 truncate text-[#07599a] font-semibold">
                                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} /> {s.label}
                                            </span>
                                            <span className="font-mono font-bold text-[#07599a] shrink-0">{Math.round((s.value / revenueSlicesTotal) * 100)}%</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="bg-[linear-gradient(145deg,rgba(225,243,255,0.96),rgba(194,227,251,0.96))] rounded-lg p-4 border border-white shadow-[0_0_15px_rgba(56,189,248,0.35),inset_0_0_18px_rgba(255,255,255,0.82)]">
                                  <p className="text-[10px] font-mono font-black text-[#07599a] uppercase tracking-widest mb-2">Expense Breakdown</p>
                                  {expenseSlices.length === 0 ? (
                                    <p className="text-[10.5px] text-[#2473aa]/55 font-mono text-center py-8">No expenses this period yet.</p>
                                  ) : (
                                    <div className="flex items-center gap-3">
                                      <div style={{ filter: 'drop-shadow(0 0 8px rgba(251,113,133,0.5))' }}>
                                        <ResponsiveContainer width={90} height={90}>
                                          <PieChart>
                                            <Pie data={expenseSlices} dataKey="value" nameKey="label" innerRadius={26} outerRadius={40} paddingAngle={2} stroke="none">
                                              {expenseSlices.map((s, i) => <Cell key={i} fill={s.color} />)}
                                            </Pie>
                                          </PieChart>
                                        </ResponsiveContainer>
                                      </div>
                                      <div className="space-y-1.5 flex-1 min-w-0">
                                        {expenseSlices.map((s, i) => (
                                          <div key={i} className="flex items-center justify-between gap-2 text-[10px] font-mono">
                                            <span className="flex items-center gap-1.5 truncate text-[#07599a] font-semibold">
                                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} /> {s.label}
                                            </span>
                                            <span className="font-mono font-bold text-[#07599a] shrink-0">{Math.round((s.value / expenseSlicesTotal) * 100)}%</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="bg-[linear-gradient(145deg,rgba(225,243,255,0.96),rgba(194,227,251,0.96))] rounded-lg p-4 border border-white shadow-[0_0_15px_rgba(56,189,248,0.35),inset_0_0_18px_rgba(255,255,255,0.82)]">
                                  <p className="text-[10px] font-mono font-black text-[#07599a] uppercase tracking-widest mb-2">Cash Flow</p>
                                  <div style={{ filter: 'drop-shadow(0 0 6px rgba(74,222,128,0.4))' }}>
                                    <ResponsiveContainer width="100%" height={100}>
                                      <BarChart data={cashFlowSeries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                        <XAxis dataKey="time" stroke="#12689E" fontSize={8} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#12689E" fontSize={8} tickLine={false} axisLine={false} tickFormatter={(v) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} width={30} />
                                        <Tooltip formatter={(v: number) => [`$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Net"]} contentStyle={{ background: "#E2F3FF", border: "1px solid #FFFFFF", borderRadius: 8, fontFamily: "monospace", fontSize: 11, color: "#07599A" }} />
                                        <Bar dataKey="Profit" radius={[3, 3, 0, 0]}>
                                          {cashFlowSeries.map((row, i) => <Cell key={i} fill={row.Profit >= 0 ? "#4ADE80" : "#FB7185"} />)}
                                        </Bar>
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>
                              </div>

                              {/* REAL STAT TILES -- own row, below the breakdowns */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {([
                                  { label: "Payments Collected", val: paymentsTotal, pct: paymentsPct, icon: DollarSign, color: "#22D3EE", bg: "bg-cyan-400/10" },
                                  { label: "Expenses", val: expensesTotal, pct: expensesPct, icon: TrendingDown, color: "#FB7185", bg: "bg-rose-400/10" },
                                  { label: "Net Revenue", val: netTotal, pct: netPct, icon: TrendingUp, color: "#4ADE80", bg: "bg-emerald-400/10" }
                                ]).map((tile, idx) => (
                                  <div key={idx} className="bg-[linear-gradient(145deg,rgba(225,243,255,0.96),rgba(194,227,251,0.96))] rounded-lg p-4 border border-white shadow-[0_0_15px_rgba(56,189,248,0.35),inset_0_0_18px_rgba(255,255,255,0.82)]">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-[9px] font-mono font-bold text-[#07599a] uppercase tracking-widest">{tile.label}</span>
                                      <div className={`w-7 h-7 rounded-full border flex items-center justify-center ${tile.bg}`} style={{ borderColor: tile.color, color: tile.color, boxShadow: `0 0 8px ${tile.color}66` }}>
                                        <tile.icon className="w-3.5 h-3.5" />
                                      </div>
                                    </div>
                                    <p className="text-lg font-mono font-black" style={{ color: tile.color, textShadow: `0 0 10px ${tile.color}88` }}>{fmt(tile.val)}</p>
                                    {tile.pct !== null && (
                                      <p className={`text-[9.5px] font-mono font-bold mt-0.5 ${tile.pct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                                        {tile.pct >= 0 ? "▲" : "▼"} {Math.abs(tile.pct).toFixed(1)}% vs last period
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>

                              {/* Upcoming Job Payments (left) and Upcoming Bills & Expenses (right) --
                                  two independent scrolling columns, bottom to top */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-[10px] font-mono font-black text-[#07599a] uppercase tracking-widest mb-2">Upcoming Job Payments</p>
                                  {renderTicker(upcomingJobs, "No upcoming jobs yet.", "income")}
                                </div>
                                <div>
                                  <p className="text-[10px] font-mono font-black text-[#07599a] uppercase tracking-widest mb-2">Upcoming Bills &amp; Expenses</p>
                                  {renderTicker(upcomingBills, "No upcoming bills yet.", "expense")}
                                </div>
                              </div>

                              {/* Plaid connect -- lives at the bottom of the card, out of the way of the graph and quick actions */}
                              <div className="flex justify-end pt-1">
                                <PlaidConnectButton />
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* TWO STATEMENT TABLES - PAYMENTS (TOP), THEN EXPENSES (BELOW) */}
                      {(() => {
                        const materialCategories = new Set(["Material Expenses", "Materials", "Equipment", "Fuel", "Office Supplies", "Tools", "Supplies", "Inventory"]);
                        const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                        const allPaymentItems = [
                          ...revenueEvents.map(e => ({ id: e.id, date: e.date, memo: `Completed job — ${e.customer}`, amount: e.amount, source: "Completed Job Revenue" })),
                          ...transactions.filter(t => t.type === "income").map(t => ({ id: t.id, date: t.date, memo: t.description || "Logged income", amount: t.amount, source: "Logged Income" }))
                        ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
                        const paymentItems = paymentsTableFilter === "all" ? allPaymentItems : allPaymentItems.filter(i => i.source === paymentsTableFilter);
                        const paymentsTotal = paymentItems.reduce((s, i) => s + i.amount, 0);

                        const getCategoryItems = (name: string) => {
                          if (name === "Bills") {
                            return bills.filter(b => b.status !== "void").map(b => ({
                              id: b.id,
                              date: b.issuedDate,
                              memo: b.billNumber ? `Bill ${b.billNumber} — ${b.vendor}` : b.vendor,
                              amount: b.totalCost ?? b.estimatedCost ?? b.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0)
                            }));
                          }
                          if (name === "Material Expenses") {
                            return transactions
                              .filter(t => t.type === "expense" && materialCategories.has(t.category || ""))
                              .map(t => ({ id: t.id, date: t.date, memo: t.description || "Material expense", amount: t.amount }));
                          }
                          return transactions
                            .filter(t => t.type === "expense" && t.category === name)
                            .map(t => ({ id: t.id, date: t.date, memo: t.description || name, amount: t.amount }));
                        };
                        const allExpenseItems = EXPENSE_CATEGORY_NAMES.flatMap(name =>
                          getCategoryItems(name).map(item => ({ ...item, category: name as string }))
                        ).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
                        const expenseItems = expensesTableFilter === "all" ? allExpenseItems : allExpenseItems.filter(i => i.category === expensesTableFilter);
                        const expensesTotal = expenseItems.reduce((s, i) => s + i.amount, 0);

                        const saveTotalStatement = () => downloadCsv(
                          `Total Statement - ${new Date().toISOString().slice(0, 10)}.csv`,
                          ["Type", "Category / Source", "Date", "Description", "Amount"],
                          [
                            ...allPaymentItems.map(i => ["Payment", i.source, i.date, i.memo, i.amount.toFixed(2)]),
                            ...allExpenseItems.map(i => ["Expense", i.category, i.date, i.memo, i.amount.toFixed(2)])
                          ]
                        );

                        return (
                          <div className="space-y-5">
                            {/* PAYMENTS TABLE */}
                            <div className="space-y-3">
                              <div className="flex justify-between items-center px-1">
                                <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">Payments</h3>
                                <span className="text-[10px] font-mono font-bold text-[#5E7393] uppercase">{paymentItems.length} line item{paymentItems.length === 1 ? "" : "s"}</span>
                              </div>
                              <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    value={paymentsTableFilter}
                                    onChange={(e) => setPaymentsTableFilter(e.target.value)}
                                    className="bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 text-[11px] font-bold text-[#1F3557] focus:outline-none cursor-pointer"
                                  >
                                    <option value="all">All Payments</option>
                                    <option value="Completed Job Revenue">Completed Job Revenue</option>
                                    <option value="Logged Income">Logged Income</option>
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => downloadCsv(
                                      `Payments - ${new Date().toISOString().slice(0, 10)}.csv`,
                                      ["Source", "Date", "Description", "Amount"],
                                      paymentItems.map(i => [i.source, i.date, i.memo, i.amount.toFixed(2)])
                                    )}
                                    className="px-3 py-2 text-[11px] font-bold rounded-xl bg-white text-[#315C9F] border border-[#9EC8EF] hover:bg-[#EAF5FF] cursor-pointer flex items-center gap-1.5"
                                  >
                                    <FileText className="w-3.5 h-3.5" /> Save Payments as CSV
                                  </button>
                                </div>

                                <div className="flex items-center justify-between border-t border-[#9EC8EF]/30 pt-2.5">
                                  <span className="text-[10px] font-bold text-[#5E7393] uppercase tracking-wide">Total</span>
                                  <span className="text-base font-black text-[#1F3557]">{fmt(paymentsTotal)}</span>
                                </div>

                                <div className="max-h-64 overflow-y-auto rounded-xl border border-[#9EC8EF]/50 divide-y divide-[#9EC8EF]/20">
                                  {paymentItems.length === 0 ? (
                                    <div className="py-10 text-center text-xs text-[#5E7393] font-sans font-medium">No payments in this selection yet.</div>
                                  ) : (
                                    paymentItems.map((item, idx) => (
                                      <div key={`${item.id}_${idx}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs bg-white/40">
                                        <div className="min-w-0">
                                          <p className="font-semibold text-[#1F3557] truncate">{item.memo}</p>
                                          <p className="text-[10px] text-[#5E7393] font-mono">{item.date} — {item.source}</p>
                                        </div>
                                        <span className="font-mono font-bold text-[#1F3557] shrink-0">{fmt(item.amount)}</span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* EXPENSES TABLE */}
                            <div className="space-y-3">
                              <div className="flex justify-between items-center px-1">
                                <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">Expenses</h3>
                                <span className="text-[10px] font-mono font-bold text-[#5E7393] uppercase">{expenseItems.length} line item{expenseItems.length === 1 ? "" : "s"}</span>
                              </div>
                              <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    value={expensesTableFilter}
                                    onChange={(e) => setExpensesTableFilter(e.target.value)}
                                    className="bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 text-[11px] font-bold text-[#1F3557] focus:outline-none cursor-pointer"
                                  >
                                    <option value="all">All Expenses</option>
                                    {EXPENSE_CATEGORY_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => downloadCsv(
                                      `Expenses - ${new Date().toISOString().slice(0, 10)}.csv`,
                                      ["Category", "Date", "Description", "Amount"],
                                      expenseItems.map(i => [i.category, i.date, i.memo, i.amount.toFixed(2)])
                                    )}
                                    className="px-3 py-2 text-[11px] font-bold rounded-xl bg-white text-[#315C9F] border border-[#9EC8EF] hover:bg-[#EAF5FF] cursor-pointer flex items-center gap-1.5"
                                  >
                                    <FileText className="w-3.5 h-3.5" /> Save Expenses as CSV
                                  </button>
                                </div>

                                <div className="flex items-center justify-between border-t border-[#9EC8EF]/30 pt-2.5">
                                  <span className="text-[10px] font-bold text-[#5E7393] uppercase tracking-wide">Total</span>
                                  <span className="text-base font-black text-[#1F3557]">{fmt(expensesTotal)}</span>
                                </div>

                                <div className="max-h-64 overflow-y-auto rounded-xl border border-[#9EC8EF]/50 divide-y divide-[#9EC8EF]/20">
                                  {expenseItems.length === 0 ? (
                                    <div className="py-10 text-center text-xs text-[#5E7393] font-sans font-medium">No expenses in this selection yet.</div>
                                  ) : (
                                    expenseItems.map((item, idx) => (
                                      <div key={`${item.id}_${idx}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs bg-white/40">
                                        <div className="min-w-0">
                                          <p className="font-semibold text-[#1F3557] truncate">{item.memo}</p>
                                          <p className="text-[10px] text-[#5E7393] font-mono">{item.date} — {item.category}</p>
                                        </div>
                                        <span className="font-mono font-bold text-[#1F3557] shrink-0">{fmt(item.amount)}</span>
                                      </div>
                                    ))
                                  )}
                                </div>

                                <div className="flex justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={saveTotalStatement}
                                    className="px-3.5 py-2 text-[11px] font-bold rounded-xl bg-[#4A86F7] hover:bg-[#3977EE] text-white cursor-pointer flex items-center gap-1.5"
                                  >
                                    <FileText className="w-3.5 h-3.5" /> Compile and Save Total Statement as CSV
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* FUTURE INTEGRATIONS SECTION (Bottom Card) */}
                      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
                        <div className="border-b border-[#9EC8EF]/30 pb-3">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-[#5E7393]">Automations & Ecosystems</span>
                          <h3 className="text-base font-sans font-black text-[#1F3557] tracking-tight">Future Integrations</h3>
                          <p className="text-xs text-[#5E7393] font-sans font-semibold">Connect OwnersLOCAL with your accounting software</p>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {[
                            { name: "Plaid", icon: Landmark, desc: "Bank account connectivity" },
                            { name: "Teller", icon: Landmark, desc: "Secure banking data" },
                            { name: "Stripe", icon: CreditCard, desc: "Payment processing" }
                          ].map((integ, idx) => (
                            <div
                              key={idx}
                              className="border border-dashed border-[#9EC8EF] rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2.5 opacity-80 bg-[#EAF5FF]/50 hover:opacity-100 transition-opacity"
                            >
                              <div className="w-9 h-9 rounded-full bg-[#EAF5FF] text-[#315C9F] border border-[#9EC8EF] flex items-center justify-center text-sm shadow-sm">
                                <integ.icon className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="text-[11px] font-extrabold text-[#1F3557] leading-none">{integ.name}</p>
                                <p className="text-[9px] text-[#5E7393] font-medium mt-0.5">{integ.desc}</p>
                              </div>
                              <span className="px-2 py-0.5 bg-[#9EC8EF]/30 text-[#1F3557] border border-[#9EC8EF]/50 text-[8.5px] font-bold rounded">
                                Coming Soon
                              </span>
                            </div>
                          ))}
                        </div>
                        
                        <div className="text-center pt-2">
                          <button
                            onClick={() => {
                              const matched = OS_SCREENS.find(s => s.id === "integrations");
                              if (matched) {
                                setActiveScreen(matched);
                                triggerNotification("Navigated to Integrations & Gateways Settings");
                              }
                            }}
                            className="text-[#315C9F] hover:text-[#1F3557] font-bold text-xs hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            View All Integrations ➔
                          </button>
                        </div>
                      </div>

                      {/* FINANCIAL REPORTS FLOATING PANE */}
                      {isFinancialSnapshotOpen && (
                        <div
                          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-xs"
                          onClick={() => setIsFinancialSnapshotOpen(false)}
                        >
                          <div
                            className="bg-[#EAF5FF] max-w-lg w-full rounded-3xl p-6 border border-[#9EC8EF] shadow-2xl flex flex-col gap-4 text-left max-h-[85vh]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3">
                              <div>
                                <h3 className="text-sm font-sans font-extrabold text-[#1F3557] uppercase tracking-wider">
                                  Financial Reports
                                </h3>
                                <p className="text-[11px] text-[#5E7393] font-sans font-semibold">
                                  Live numbers from Accounting &amp; Bookkeeping
                                </p>
                              </div>
                              <button
                                onClick={() => setIsFinancialSnapshotOpen(false)}
                                className="text-sm text-[#5E7393] hover:text-[#1F3557] font-bold p-1 hover:bg-white/40 rounded-xl transition-colors cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              <select
                                value={financialSnapshotCategory}
                                onChange={(e) => setFinancialSnapshotCategory(e.target.value as typeof financialSnapshotCategory)}
                                className="flex-1 bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 text-xs font-bold text-[#1F3557] focus:outline-none"
                              >
                                <option value="all">All Transactions</option>
                                <option value="balance">Current Balance</option>
                                <option value="unpaid_invoices">Unpaid Invoices</option>
                                <option value="outstanding_expenses">Outstanding Expenses</option>
                                <option value="payments_collected">Payments Collected</option>
                                <option value="expenses_paid">Expenses Paid</option>
                              </select>
                              <button
                                type="button"
                                onClick={handleGenerateFinancialStatementPdf}
                                disabled={isGeneratingFinancialStatement}
                                className="shrink-0 px-3.5 py-2 bg-[#315C9F] hover:bg-[#27498C] disabled:opacity-60 text-white rounded-xl text-[11px] font-bold uppercase tracking-wide transition-colors cursor-pointer disabled:cursor-not-allowed"
                              >
                                {isGeneratingFinancialStatement ? "Generating…" : "Generate PDF"}
                              </button>
                            </div>

                            {(() => {
                              const category = financialSnapshotData[financialSnapshotCategory];
                              return (
                                <>
                                  <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] flex items-center justify-between shrink-0">
                                    <span className="text-[10.5px] font-bold text-[#5E7393] uppercase tracking-wide">{category.label}</span>
                                    <span className="text-xl font-black text-[#1F3557]">{fmtMoney(category.total)}</span>
                                  </div>

                                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-[140px]">
                                    {category.items.length === 0 ? (
                                      <div className="py-10 text-center text-xs text-[#5E7393] font-sans font-medium">
                                        Nothing here yet.
                                      </div>
                                    ) : (
                                      category.items.map((item) => (
                                        <div
                                          key={item.id}
                                          className="flex items-center justify-between gap-3 p-2.5 bg-white border border-[#9EC8EF]/50 rounded-xl text-xs"
                                        >
                                          <div className="min-w-0">
                                            <p className="font-semibold text-[#1F3557] truncate">{item.memo}</p>
                                            <p className="text-[10px] text-[#5E7393] font-mono">{item.date}</p>
                                          </div>
                                          <span className={`font-mono font-bold shrink-0 ${item.amount < 0 ? "text-rose-600" : "text-[#1F3557]"}`}>
                                            {fmtMoney(Math.abs(item.amount))}
                                          </span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                    </div>
                    )

                  ) : activeScreen.id === "payroll" ? (
                    !getVisibleScreens().some(screen => screen.id === "payroll") ? (
                      <div className="p-8 bg-slate-900 border border-red-500/30 rounded-[28px] text-center max-w-md mx-auto my-12 space-y-4">
                        <ShieldAlert className="w-16 h-16 text-red-500 mx-auto animate-bounce" />
                        <h2 className="text-xl font-bold text-white">Restricted Access</h2>
                        <p className="text-xs text-slate-400 font-sans leading-relaxed">
                          Your account does not have permission to access Payroll.
                        </p>
                        <button
                          onClick={() => setActiveScreen(OS_SCREENS[0])}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          Return to Dashboard
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6 animate-fade-in text-left">
                      {/* HEADER SECTION */}
                      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <h2 className="text-lg font-sans font-extrabold text-[#1F3557] uppercase tracking-wider flex items-center gap-2">
                            <span className="select-none text-xl">💵</span> Payroll
                          </h2>
                          <p className="text-xs text-[#5E7393] font-sans font-semibold">Run payroll, track hours, and manage pay periods for your crew</p>
                        </div>
                      </div>

                      /* PAYROLL SECTION - PAYROLL OVERVIEW AND SEARCHABLE TABLE */
                      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#9EC8EF]/30 pb-4">
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-[#5E7393]">Personnel Overview</span>
                            <h3 className="text-base font-sans font-black text-[#1F3557] tracking-tight">Payroll Overview</h3>
                            <p className="text-xs text-[#5E7393] font-sans font-semibold">Active crew hours, overtime coefficients, and cumulative gross wages</p>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                            {/* Employee Search Bar */}
                            <div className="relative flex-1 sm:w-60">
                              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                                <Search className="w-4 h-4 text-[#5E7393]" />
                              </span>
                              <input
                                value={payrollSearch}
                                onChange={(e) => setPayrollSearch(e.target.value)}
                                type="text"
                                placeholder="Search employees..."
                                className="w-full pl-9.5 pr-4 py-2 text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl focus:outline-none focus:border-[#4A86F7] text-[#1F3557] font-medium placeholder-[#5E7393]/70"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={downloadPayrollCsv}
                              className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] text-[#315C9F] border border-[#9EC8EF] font-bold rounded-xl text-xs transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Download CSV
                            </button>

                            <button
                              type="button"
                              onClick={printPayrollSummary}
                              className="px-3 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white border border-[#315C9F] font-bold rounded-xl text-xs transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Print / PDF
                            </button>
                            
                            <button
                              onClick={() => {
                                const matched = OS_SCREENS.find(s => s.id === "roster");
                                if (matched) setActiveScreen(matched);
                              }}
                              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] text-[#315C9F] border border-[#9EC8EF] font-bold rounded-xl text-xs transition-colors cursor-pointer text-center uppercase tracking-wider shrink-0"
                            >
                              View Roster
                            </button>
                          </div>
                        </div>

                        <div className="grid gap-3 rounded-2xl border border-[#9EC8EF] bg-[#EAF5FF] p-4 lg:grid-cols-6">
                          <label className="text-[9px] font-black uppercase text-[#5E7393]">Work state
                            <select value={payrollState} onChange={e => setPayrollState(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#9EC8EF] bg-white px-2 py-2 text-xs font-bold text-[#1F3557]">
                              {US_PAYROLL_STATES.map(state => <option key={state} value={state}>{state}{state === "TX" ? " — configured" : " — setup required"}</option>)}
                            </select>
                          </label>
                          <label className="text-[9px] font-black uppercase text-[#5E7393] lg:col-span-2">Pay schedule
                            <select value={payrollSchedule} onChange={e => selectPayrollSchedule(e.target.value as PayrollSchedule)} className="mt-1 block w-full rounded-lg border border-[#9EC8EF] bg-white px-3 py-2 text-xs font-bold text-[#1F3557]">
                              <option value="weekly_friday">Weekly — payday Friday</option>
                              <option value="biweekly">Every two weeks</option>
                              <option value="semimonthly">Semimonthly — 1–15 / 16–end</option>
                              <option value="monthly">Monthly</option>
                              <option value="custom">Custom date range</option>
                            </select>
                          </label>
                          <label className="text-[9px] font-black uppercase text-[#5E7393]">Period start
                            <input type="date" value={payrollPeriodStart} max={payrollPeriodEnd} onChange={e => { setPayrollSchedule("custom"); setPayrollPeriodStart(e.target.value); }} className="mt-1 block w-full rounded-lg border border-[#9EC8EF] bg-white px-2 py-2 text-xs" />
                          </label>
                          <label className="text-[9px] font-black uppercase text-[#5E7393]">Period end
                            <input type="date" value={payrollPeriodEnd} min={payrollPeriodStart} onChange={e => { setPayrollSchedule("custom"); setPayrollPeriodEnd(e.target.value); }} className="mt-1 block w-full rounded-lg border border-[#9EC8EF] bg-white px-2 py-2 text-xs" />
                          </label>
                          <label className="text-[9px] font-black uppercase text-[#5E7393]">Workweek starts
                            <select value={payrollWorkweekStart} onChange={e => setPayrollWorkweekStart(Number(e.target.value))} className="mt-1 block w-full rounded-lg border border-[#9EC8EF] bg-white px-2 py-2 text-xs">
                              {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((day,index)=><option key={day} value={index}>{day}</option>)}
                            </select>
                          </label>
                          <label className="text-[9px] font-black uppercase text-[#5E7393]">Payday
                            <select value={payrollPayday} onChange={e => setPayrollPayday(Number(e.target.value))} className="mt-1 block w-full rounded-lg border border-[#9EC8EF] bg-white px-2 py-2 text-xs">
                              {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((day,index)=><option key={day} value={index}>{day}</option>)}
                            </select>
                          </label>
                          <div className="flex flex-wrap gap-2 lg:col-span-6">
                            <button type="button" disabled={payrollSchedule === "custom"} onClick={()=>movePayrollPeriod(-1)} className="rounded-lg border border-[#9EC8EF] bg-white px-3 py-1.5 text-[10px] font-bold disabled:opacity-40">← Previous</button>
                            <button type="button" disabled={payrollSchedule === "custom"} onClick={useCurrentPayrollPeriod} className="rounded-lg border border-[#9EC8EF] bg-white px-3 py-1.5 text-[10px] font-bold disabled:opacity-40">Current period</button>
                            <button type="button" disabled={payrollSchedule === "custom"} onClick={()=>movePayrollPeriod(1)} className="rounded-lg border border-[#9EC8EF] bg-white px-3 py-1.5 text-[10px] font-bold disabled:opacity-40">Next →</button>
                            <span className="self-center text-[10px] font-semibold text-[#5E7393]">Saved automatically for this business.</span>
                          </div>
                        </div>

                        {/* Real payroll rows: real employees x real time_clock_logs x real hourlyRate,
                            using the selected pay period and workweek rules above. recentRoster is a separate
                            onboarding-invite list without email/hourlyRate, so it can't be cross-referenced
                            to real hours — this table uses the real `employees` collection instead. */}
                        {(() => {
                          const rows = employees
                            .filter(e => `${e.firstName} ${e.lastName}`.toLowerCase().includes(payrollSearch.toLowerCase()) || e.role.toLowerCase().includes(payrollSearch.toLowerCase()))
                            .map((emp) => {
                              const myLogs = timeClockLogs.filter(l => l.employeeEmail === emp.email);
                              const { hours, overtimeHours: otHours } = computePayrollHoursForRange(myLogs, payrollPeriodStart, payrollPeriodEnd, payrollWorkweekStart);
                              const regHours = hours - otHours;
                              const pay = emp.hourlyRate ? regHours * emp.hourlyRate + otHours * emp.hourlyRate * 1.5 : 0;
                              const lastPayroll = transactions
                                .filter(t => t.source === "payroll" && t.description === `${emp.firstName} ${emp.lastName}`.trim())
                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                              const lastLog = [...myLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                              const status = !lastLog ? "Off Duty" : lastLog.type === "Break Start" ? "On Break" : lastLog.type === "Clock Out" ? "Off Duty" : "Clocked In";
                              return { emp, hours, otHours, pay, lastPayroll, status };
                            });
                          return (
                            <>
                              {payrollSearch && (
                                <div className="text-[11px] font-sans font-bold text-[#1F3557] bg-[#EAF5FF] px-3.5 py-1.5 rounded-lg border border-[#9EC8EF]/50 inline-block">
                                  Found {rows.length} employees matching "{payrollSearch}"
                                </div>
                              )}

                              <div className="overflow-x-auto rounded-xl border border-[#9EC8EF] shadow-sm">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-[#EAF5FF] border-b border-[#9EC8EF] text-[10px] font-bold text-[#1F3557] uppercase tracking-wider">
                                      <th className="px-4 py-3">Employee</th>
                                      <th className="px-4 py-3 text-right">Current Hours</th>
                                      <th className="px-4 py-3 text-right">Overtime Hours</th>
                                      <th className="px-4 py-3 text-right">Current Pay</th>
                                      <th className="px-4 py-3 text-center">Last Payroll Date</th>
                                      <th className="px-4 py-3 text-center">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#9EC8EF]/30 text-xs font-sans">
                                    {rows.length === 0 && (
                                      <tr>
                                        <td colSpan={6} className="px-4 py-6 text-center text-[#5E7393] font-sans font-medium">
                                          No real employees onboarded yet.
                                        </td>
                                      </tr>
                                    )}
                                    {rows.map(({ emp, hours, otHours, pay, lastPayroll, status }) => {
                                      const initials = `${emp.firstName[0] || ""}${emp.lastName[0] || ""}`.toUpperCase();
                                      const statusColor = status === "Clocked In" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : status === "On Break" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-slate-500/10 text-slate-600 border-slate-500/20";
                                      return (
                                        <tr
                                          key={emp.email}
                                          onClick={() => {
                                            const matched = OS_SCREENS.find(s => s.id === "roster");
                                            if (matched) setActiveScreen(matched);
                                          }}
                                          className="hover:bg-[#BDDDF8] transition-colors cursor-pointer"
                                        >
                                          <td className="px-4 py-3 flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-[#EAF5FF] text-[#315C9F] border-[#9EC8EF] font-black text-xs flex items-center justify-center border shadow-sm">
                                              {initials}
                                            </div>
                                            <div>
                                              <p className="font-extrabold text-[#1F3557]">{emp.firstName} {emp.lastName}</p>
                                              <p className="text-[10px] text-[#5E7393] font-mono tracking-wider">{emp.role}</p>
                                            </div>
                                          </td>
                                          <td className="px-4 py-3 text-right font-mono font-bold text-[#1F3557]">{hours.toFixed(2)}</td>
                                          <td className="px-4 py-3 text-right font-mono font-bold text-[#1F3557]">{otHours.toFixed(2)}</td>
                                          <td className="px-4 py-3 text-right font-mono font-bold text-[#1F3557]">${pay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                          <td className="px-4 py-3 text-center font-mono text-[#5E7393]">{lastPayroll ? lastPayroll.date : "—"}</td>
                                          <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 border text-[9.5px] font-bold rounded ${statusColor}`}>
                                              {status}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          );
                        })()}
                        
                        <div className="text-center pt-2">
                          <button
                            onClick={() => setRevenueConfirmAction({ label: "Complete Payroll & Wages", icon: "👥" })}
                            className="text-[#315C9F] hover:text-[#1F3557] font-bold text-xs hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            View All Employees ➔
                          </button>
                        </div>
                      </div>
                      </div>
                    )

                  ) : activeScreen.id === "scheduling" ? (
                    <SchedulingPage />

                  ) : activeScreen.id === "dispatch" ? (
                    <DispatchPage />

                  ) : activeScreen.id === "jobs" ? (
                    <JobsPage />

                  ) : activeScreen.id === "routes" ? (
                    <MapPageErrorBoundary>
                      <InteractiveMapPage
                        businessAddresses={businessAddresses}
                      />
                    </MapPageErrorBoundary>

                  ) : activeScreen.id === "bulletins" ? (
                    
                    /* BULLETINS PAGE */
                    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-6 animate-fade-in text-left">
                      <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-4">
                        <div>
                          <h2 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">Company Bulletins Center</h2>
                          <p className="text-xs text-slate-500">Read official notifications or post announcements for administrative approval</p>
                        </div>
                        <span className="px-3 py-1 bg-[#E3F3FF] text-[#4A9BFF] text-xs font-mono font-bold rounded-xl border border-[#A9CDEE]">
                          Active Notices
                        </span>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Post bulletin form */}
                        <div className="bg-[#E3F3FF] p-5 rounded-2xl border border-[#A9CDEE] space-y-4 h-fit">
                          <div>
                            <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Post New Notice</h3>
                            <p className="text-[10.5px] text-slate-600 mt-1">
                              Note: If you are not an owner, manager, or scheduler, your bulletin will require approval.
                            </p>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Bulletin Title</label>
                            <input
                              value={newBulletinTitle}
                              onChange={(e) => setNewBulletinTitle(e.target.value)}
                              type="text"
                              placeholder="e.g. Safety Regulations"
                              className="w-full text-xs bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A9BFF] font-medium font-sans text-slate-700"
                            />
                          </div>

                          <div className="space-y-1 flex flex-col">
                            <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold text-left">Content</label>
                            <textarea
                              value={newBulletinContent}
                              onChange={(e) => setNewBulletinContent(e.target.value)}
                              placeholder="Describe details clearly..."
                              rows={4}
                              className="w-full text-xs bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A9BFF] font-medium font-sans text-slate-700"
                            />
                          </div>

                          <button
                            onClick={() => {
                              if (!newBulletinTitle.trim() || !newBulletinContent.trim()) {
                                triggerNotification("Please fill in both title and content.");
                                return;
                              }
                              const activeRole = simulatedRole || loggedInUser?.role || "Owner";
                              const nameClean = loggedInUser?.name || (loggedInUser?.email ? loggedInUser.email.split("@")[0] : "waterdrops2001");
                              
                              const directApprovalRoles = ["Owner", "General Manager", "Office Manager", "Operations Manager", "Scheduler"];
                              const isDirect = directApprovalRoles.includes(activeRole);
                              
                              const newBulletinItem = {
                                id: `${bulletins.length + 1}`,
                                title: newBulletinTitle.trim(),
                                content: newBulletinContent.trim(),
                                author: nameClean,
                                role: activeRole,
                                date: "Today, " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                status: isDirect ? ("approved" as const) : ("pending" as const)
                              };
                              
                              setBulletins(prev => [newBulletinItem, ...prev]);
                              setNewBulletinTitle("");
                              setNewBulletinContent("");
                              
                              if (isDirect) {
                                triggerNotification("Bulletin posted successfully!");
                              } else {
                                triggerNotification("Bulletin submitted! Awaiting Manager/Owner approval.");
                              }
                            }}
                            className="w-full py-2.5 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-bold rounded-xl text-xs transition-colors cursor-pointer text-center uppercase tracking-wider shadow-sm"
                          >
                            Post Bulletin
                          </button>
                        </div>

                        {/* Bulletins listing feed */}
                        <div className="lg:col-span-2 space-y-4">
                          {/* Pending approvals section (for management roles) */}
                          {["Owner", "General Manager", "Office Manager"].includes(simulatedRole || loggedInUser?.role || "Owner") && bulletins.some(b => b.status === "pending") && (
                            <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl space-y-3">
                              <h3 className="text-xs font-extrabold text-amber-800 uppercase tracking-wider">Awaiting Manager Approval</h3>
                              <div className="space-y-3">
                                {bulletins.filter(b => b.status === "pending").map((b) => (
                                  <div key={b.id} className="p-3.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl flex flex-col justify-between gap-3 shadow-sm">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <p className="text-xs font-black text-slate-800">{b.title}</p>
                                        <p className="text-[10px] text-slate-400 font-medium">By {b.author} ({b.role}) • {b.date}</p>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={() => {
                                            setBulletins(prev => prev.map(item => item.id === b.id ? { ...item, status: "approved" as const } : item));
                                            triggerNotification("Bulletin approved and published!");
                                          }}
                                          className="px-2.5 py-1 bg-emerald-500 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          onClick={() => {
                                            setBulletins(prev => prev.filter(item => item.id !== b.id));
                                            triggerNotification("Bulletin submission rejected.");
                                          }}
                                          className="px-2.5 py-1 bg-rose-500 text-white text-[10px] font-bold rounded-lg hover:bg-rose-600 transition-colors cursor-pointer"
                                        >
                                          Reject
                                        </button>
                                      </div>
                                    </div>
                                    <p className="text-xs text-slate-600 leading-normal font-sans font-medium">{b.content}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Active Bulletins Board</h3>
                          <div className="space-y-3.5">
                            {bulletins.filter(b => b.status === "approved").length === 0 ? (
                              <div className="text-center py-8 text-slate-400 text-xs">
                                No announcements active currently.
                              </div>
                            ) : (
                              bulletins.filter(b => b.status === "approved").map((b) => (
                                <div key={b.id} className="p-4 bg-[#E3F3FF] hover:bg-[#E3F3FF]/80 border border-[#A9CDEE] rounded-2xl flex flex-col gap-2 shadow-sm transition-all">
                                  <div className="flex items-center justify-between text-[10.5px] font-bold text-[#4A9BFF] border-b border-[#A9CDEE]/40 pb-1.5">
                                    <span className="uppercase tracking-wider">{b.author} ({b.role})</span>
                                    <span className="font-mono text-slate-400">{b.date}</span>
                                  </div>
                                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{b.title}</h4>
                                  <p className="text-xs text-slate-500 leading-relaxed font-sans font-medium">{b.content}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                  ) : activeScreen.id === "notifications" ? (
                    <NotificationsPage />

                  ) : activeScreen.id === "missed_call_textback" ? (

                    <MissedCallTextBackPage />

                  ) : (
                    
                    /* Screens that don't have a dedicated real implementation yet -- shown
                       honestly as "not built yet" rather than dressed up with fake activity. */
                    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm min-h-[420px] flex flex-col justify-between gap-5 animate-fade-in text-left">
                      <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl select-none">{activeScreen.icon}</span>
                          <div>
                            <h2 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">{activeScreen.label}</h2>
                            <p className="text-xs text-slate-500 font-sans font-semibold">This feature isn't built yet</p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-[#E3F3FF] text-[#4A9BFF] text-[9px] font-mono font-bold rounded-xl border border-[#A9CDEE] uppercase">
                          Not Built Yet
                        </span>
                      </div>

                      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#E3F3FF] rounded-2xl border border-dashed border-[#A9CDEE]">
                        <div className="w-12 h-12 rounded-full bg-[#F5FAFF] text-[#4A9BFF] flex items-center justify-center text-xl font-bold border border-[#A9CDEE] shadow-sm mb-4">
                          {activeScreen.icon}
                        </div>
                        <h4 className="text-xs font-black text-slate-700 font-sans uppercase tracking-wider">{activeScreen.label}</h4>
                        <p className="text-slate-600 text-[11px] mt-1.5 max-w-xs leading-relaxed font-sans font-semibold">
                          We haven't built this screen yet. Use the sidebar to get back to a working part of the app.
                        </p>
                      </div>
                    </div>
                  )}

                </div>

              )}

            </div>

            {/* Sidebar toggle button is now integrated into the header of the narrow sidebar itself! */}
          </div>
        )}

      </main>

      {!isLoggedIn && (
        <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-30">
          <label className="sr-only" htmlFor="login-theme-selector">Color scheme</label>
          <select
            id="login-theme-selector"
            aria-label="Color scheme"
            value={workspaceTheme}
            onChange={(event) => {
              const nextTheme = event.target.value as WorkspaceTheme;
              setWorkspaceTheme(nextTheme);
              localStorage.setItem("ownerslocal_workspace_theme", workspaceThemeSettingValue(nextTheme));
            }}
            className={`max-w-[150px] rounded-lg border px-2 py-1.5 text-[10px] font-bold shadow-sm backdrop-blur-md outline-none cursor-pointer ${isDarkTheme
              ? "border-blue-400/30 bg-[#06152b]/70 text-blue-50"
              : "border-blue-200/60 bg-white/60 text-[#315C9F]"
            }`}
          >
            <option value="light-basic">Light Mode Basic</option>
            <option value="light-extreme">Light Mode Dynamic</option>
            <option value="dark-basic">Dark Mode Basic</option>
            <option value="dark-dynamic">Dark Mode Dynamic</option>
          </select>
        </div>
      )}

      {!isLoggedIn && (
        <div
          aria-label="Created by Stuffapp"
          className="fixed bottom-3 right-4 z-20 pointer-events-none font-sans text-[10px] sm:text-xs font-semibold tracking-[0.08em] text-[#315C9F]/55"
        >
          by Stuffapp
        </div>
      )}

      {/* CAMERA SHUTTER SNAPSHOT FLASH SIMULATION */}
      {isFlashing && (
        <div 
          className="fixed inset-0 bg-white z-[9999] pointer-events-none transition-opacity duration-300 ease-out opacity-100 animate-pulse" 
          style={{ animationDuration: "150ms", animationIterationCount: 1 }}
        />
      )}

      {/* REVENUE SENSITIVE OPERATIONS CONFIRMATION DIALOG */}
      {revenueConfirmAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full mx-4 shadow-xl border border-blue-100 space-y-4 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
              <Lock className="w-6 h-6 animate-pulse" />
            </div>
            <h3 className="text-base font-extrabold text-[#1F3557] uppercase tracking-wider">Confirm Financial Report Download</h3>
            <p className="text-xs text-[#5E7393] leading-relaxed font-sans font-medium">
              You are requesting to generate and load: <strong className="text-red-600">{revenueConfirmAction.label}</strong>. 
              This contains confidential company revenue, profit margins, and payroll balances. 
              Please confirm your administrative override to compile this data.
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={() => setRevenueConfirmAction(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const target = revenueConfirmAction;
                  setRevenueConfirmAction(null);
                  openPlaceholderPage(target.label, target.icon);
                  logOperationalEvent("Financial Export", `User authorized download of sensitive report: ${target.label}`, "📊");
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1 shadow-md shadow-blue-500/15"
              >
                Authorize & Load
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI OPTION COMPANION WORKSPACE CHATBOT DRAWER */}
      {isAIAnalysisOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          {/* Backdrop Click */}
          <div className="absolute inset-0" onClick={() => setIsAIAnalysisOpen(false)} />

          {/* Drawer content panel */}
          <div className="relative w-full max-w-lg h-full bg-[#EAF5FF] border-l border-[#9EC8EF] shadow-2xl flex flex-col justify-between overflow-hidden animate-slide-in-right">
            
            {/* Header */}
            <div className="p-5 bg-[#C7E3FA] border-b border-[#9EC8EF] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#EAF5FF] rounded-xl border border-[#9EC8EF]">
                  <Sparkles className="w-5 h-5 text-[#315C9F] animate-pulse" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-sans font-extrabold text-[#1F3557] uppercase tracking-wider">
                    Owner's AI Option
                  </h3>
                  <p className="text-[10px] text-[#5E7393] font-bold uppercase tracking-widest">
                    AI help for this page • {aiPageName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAIAnalysisOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold text-sm transition-colors flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Message Area */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-[#EAF5FF]">
              {aiMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex flex-col max-w-[85%] text-left ${
                    msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"
                  }`}
                >
                  <span className="text-[9px] uppercase tracking-wider font-bold text-[#5E7393] mb-1">
                    {msg.sender === "user" ? "You" : "Owner's AI"}
                  </span>
                  <div
                    className={`p-3.5 rounded-2xl text-xs leading-relaxed border shadow-sm ${
                      msg.sender === "user"
                        ? "bg-[#315C9F] border-[#1F3557] text-white rounded-tr-none"
                        : "bg-[#C7E3FA] border-[#9EC8EF] text-[#1F3557] rounded-tl-none whitespace-pre-wrap"
                    }`}
                  >
                    {msg.sender === "ai" ? (
                      <div className="prose prose-sm max-w-none">
                        {msg.text.split("\n").map((line, lIdx) => {
                          if (line.startsWith("###")) {
                            return <h4 key={lIdx} className="font-extrabold text-sm text-[#1F3557] mt-2 mb-1 uppercase">{line.replace("###", "").trim()}</h4>;
                          }
                          if (line.startsWith("1.") || line.startsWith("2.") || line.startsWith("3.")) {
                            return <p key={lIdx} className="ml-1.5 mt-1 text-[#1F3557] font-medium">{line}</p>;
                          }
                          if (line.startsWith("-")) {
                            return <li key={lIdx} className="ml-3 mt-0.5 text-slate-700">{line.replace("-", "").trim()}</li>;
                          }
                          return <p key={lIdx} className="mt-1">{line}</p>;
                        })}
                      </div>
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
              ))}

              {aiIsLoading && (
                <div className="flex items-center gap-2 mr-auto text-xs text-[#5E7393] font-semibold bg-[#C7E3FA] border border-[#9EC8EF] px-3.5 py-2.5 rounded-2xl rounded-tl-none animate-pulse">
                  <div className="w-2.5 h-2.5 bg-[#315C9F] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2.5 h-2.5 bg-[#315C9F] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2.5 h-2.5 bg-[#315C9F] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span>AI Agent is analyzing workspace data...</span>
                </div>
              )}

              {pendingAiAction && pendingAiAction.type === "drawer" && (
                <div className="bg-[#FFF5F5] border-2 border-red-200 rounded-2xl p-4 shadow-sm space-y-3 animate-fade-in text-left">
                  <div className="flex items-start gap-2.5">
                    <span className="p-1.5 bg-red-100 rounded-lg text-red-600 font-bold text-sm">🔒</span>
                    <div>
                      <h4 className="text-xs font-extrabold text-red-800 uppercase tracking-wider">Financial Data Clearance Check</h4>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed font-semibold">
                        Your query involves sensitive financial parameters (e.g. lifetime value, unpaid balances, or margin indexes). Do you confirm you have authorization to reveal these metrics in this session?
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-8 pt-1">
                    <button
                      onClick={() => {
                        const queryToRun = pendingAiAction.query;
                        setPendingAiAction(null);
                        executeConfirmedAIMessage(queryToRun);
                      }}
                      className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10.5px] font-extrabold rounded-lg shadow-sm transition-all uppercase cursor-pointer tracking-wider"
                    >
                      Confirm & Reveal
                    </button>
                    <button
                      onClick={() => {
                        setPendingAiAction(null);
                      }}
                      className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-[10.5px] font-bold rounded-lg transition-all uppercase cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Suggestions list */}
            <div className="px-5 py-2 bg-[#C7E3FA]/40 border-t border-[#9EC8EF]/40 flex flex-wrap gap-1.5 justify-start">
              {[
                "Who is our top performer?",
                "How can we grow conversions?",
                "Analyze outstanding unpaid invoices"
              ].map((sug, sIdx) => (
                <button
                  key={sIdx}
                  disabled={!!pendingAiAction}
                  onClick={() => {
                    setAiInputMessage(sug);
                  }}
                  className={`px-2.5 py-1 text-[10px] font-sans font-bold text-[#315C9F] hover:text-white hover:bg-[#315C9F] bg-white border border-[#9EC8EF] rounded-lg transition-all cursor-pointer shadow-sm shrink-0 ${pendingAiAction ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {sug}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div className="p-4 bg-[#C7E3FA] border-t border-[#9EC8EF] flex items-center gap-2">
              <input
                type="text"
                value={aiInputMessage}
                disabled={!!pendingAiAction}
                onChange={(e) => setAiInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !pendingAiAction) handleSendAIMessage();
                }}
                placeholder={pendingAiAction ? "Confirmation pending... make a selection above" : `Ask about ${aiPageName} metrics or suggestions...`}
                className={`flex-1 bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-4 py-3 text-xs text-[#1F3557] placeholder-[#5E7393]/70 focus:outline-none focus:border-[#315C9F] font-semibold ${pendingAiAction ? "opacity-60 cursor-not-allowed" : ""}`}
              />
              <button
                onClick={handleSendAIMessage}
                disabled={!!pendingAiAction}
                className={`px-4 py-3 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl transition-all uppercase tracking-wider cursor-pointer shadow-sm ${pendingAiAction ? "opacity-55 cursor-not-allowed" : ""}`}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL FLOATING AI WIDGET -- draggable; remembers where the owner last left it.
          Portaled straight to document.body so position:fixed is always relative to the
          real viewport, never trapped by some ancestor's transform/overflow -- it must
          stay pinned to the screen corner no matter how far the page underneath scrolls. */}
      {isLoggedIn && createPortal(
      <div
        id="floating-ai-widget"
        className="fixed z-40 select-none"
        style={
          isFloatingAiOpen && aiWidgetPos
            ? { left: aiWidgetPos.x, top: aiWidgetPos.y }
            : { bottom: 24 + aiWidgetViewportInset.bottom, right: 24 + aiWidgetViewportInset.right }
        }
      >

        {/* Toggle Trigger Pill (drag by pressing and moving) */}
        {!isFloatingAiOpen && isLoggedIn && (
          <button
            onClick={() => { if (!aiDragState.current.dragging) setIsFloatingAiOpen(true); }}
            onPointerDown={(e) => startAiWidgetDrag(e, 180, 52)}
            className="flex items-center gap-2 px-4 py-3.5 bg-gradient-to-r from-[#1F3557] to-[#315C9F] text-white rounded-2xl shadow-[0_4px_25px_rgba(31,53,87,0.35)] hover:shadow-[0_4px_30px_rgba(74,134,247,0.5)] hover:scale-105 border border-[#9EC8EF]/40 transition-all cursor-grab active:cursor-grabbing group font-sans font-black text-xs uppercase tracking-wider"
            title="Drag to move, click to open"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span>Owner's AI</span>
            <Sparkles className="w-4 h-4 text-amber-300 group-hover:rotate-12 transition-transform" />
          </button>
        )}

        {/* Slide-Up Panel Overlay */}
        {isFloatingAiOpen && (
          <div className="w-96 h-[550px] bg-white rounded-3xl border border-[#9EC8EF] shadow-2xl flex flex-col overflow-hidden animate-slide-up select-text">

            {/* Drawer Header (drag handle) */}
            <div
              onPointerDown={(e) => startAiWidgetDrag(e, 384, 550)}
              className="bg-[#1F3557] text-white px-4 py-3 flex items-center justify-between border-b border-white/10 shrink-0 cursor-grab active:cursor-grabbing"
              title="Drag to move"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#315C9F] to-[#4A86F7] text-white flex items-center justify-center text-lg font-bold">
                  🤖
                </div>
                <div className="text-left">
                  <h3 className="text-xs font-black uppercase tracking-wider">OwnersLOCAL AI</h3>
                  <p className="text-[9.5px] text-slate-300 font-mono">Module: {activeScreen.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Collapse button */}
                <button
                  onClick={() => setIsFloatingAiOpen(false)}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-xs font-bold cursor-pointer"
                  title="Collapse Panel"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* TAB BAR NAVIGATION */}
            <div className="flex bg-[#EAF5FF] border-b border-[#9EC8EF]/30 p-1 shrink-0">
              {[
                { id: "ask", label: "Ask AI", icon: "💬" },
                { id: "actions", label: "Actions", icon: "⚡" },
                { id: "settings", label: "Settings", icon: "⚙️" },
                { id: "recent", label: "Activity", icon: "📋" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFloatingAiTab(tab.id as any)}
                  className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wide rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    floatingAiTab === tab.id
                      ? "bg-[#315C9F] text-white border-[#315C9F] shadow-sm"
                      : "bg-transparent text-[#5E7393] border-transparent hover:bg-white/50"
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Current page context (real — reflects the actual active screen) */}
            <div className="bg-[#FFF9EA] border-b border-amber-200/50 px-3.5 py-2 flex items-center justify-between text-left text-[9.5px] text-[#855D00] font-sans font-bold uppercase tracking-wider">
              <span className="text-[8.5px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-300 text-amber-700">Viewing: {activeScreen.label}</span>
            </div>

            {/* PANEL BODY CONTENT AREA */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#F8FBFF]">
              
              {/* ASK AI CHAT TAB */}
              {floatingAiTab === "ask" && (
                <div className="h-full flex flex-col justify-between gap-3 text-left">
                  <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 select-text">
                    {floatingAiMessages.map((m, idx) => (
                      <div key={idx} className={`flex flex-col max-w-[85%] ${m.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"}`}>
                        <span className="text-[8.5px] font-bold text-slate-400 uppercase mb-0.5 tracking-wider">
                          {m.sender === "user" ? "You" : "Owner's AI"}
                        </span>
                        <div className={`p-3 rounded-2xl text-[11px] leading-relaxed border shadow-xs ${
                          m.sender === "user"
                            ? "bg-[#315C9F] text-white border-[#315C9F]"
                            : "bg-white text-slate-700 border-[#9EC8EF]/40"
                        }`}>
                          {m.sender === "ai" ? (
                            <div className="prose prose-sm max-w-none text-left">
                              {/* Simple Markdown Render helpers */}
                              {m.text.split("\n\n").map((para, pIdx) => {
                                if (para.startsWith("###")) {
                                  return <h4 key={pIdx} className="text-xs font-black uppercase text-[#1F3557] mb-1.5 mt-2">{para.replace("###", "").trim()}</h4>;
                                }
                                if (para.startsWith("*") || para.startsWith("-")) {
                                  return (
                                    <ul key={pIdx} className="list-disc pl-4 space-y-1 my-1.5 text-[10.5px]">
                                      {para.split("\n").map((li, lIdx) => (
                                        <li key={lIdx}>{li.replace(/^[*\-\s]+/, "").trim()}</li>
                                      ))}
                                    </ul>
                                  );
                                }
                                return <p key={pIdx} className="mb-1.5 font-medium leading-relaxed">{para}</p>;
                              })}
                            </div>
                          ) : (
                            <p className="font-semibold leading-relaxed">{m.text}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {floatingAiLoading && (
                      <div className="flex items-center gap-1.5 p-2 text-[10px] text-[#5E7393] font-bold font-mono">
                        <span className="animate-bounce">●</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>●</span>
                        <span className="text-[9px]">Model is processing viewport...</span>
                      </div>
                    )}
                  </div>

                  {pendingAiAction && pendingAiAction.type === "floating" && (
                    <div className="bg-[#FFF5F5] border border-red-200 rounded-xl p-3 shadow-xs space-y-2.5 animate-fade-in text-left shrink-0">
                      <div className="flex items-start gap-2">
                        <span className="p-1 bg-red-100 rounded text-red-600 font-bold text-xs">🔒</span>
                        <div>
                          <h4 className="text-[10px] font-black text-red-800 uppercase tracking-wider">Access Clearance Confirmation</h4>
                          <p className="text-[9.5px] text-slate-600 mt-0.5 leading-relaxed font-semibold">
                            Revealing company accounts, VIP Lifetime Values (LTV), or past-due debt records requires session verification. Do you confirm your Owner/Admin permission level?
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 pl-6">
                        <button
                          onClick={() => {
                            const queryToRun = pendingAiAction.query;
                            const cTxt = pendingAiAction.customText;
                            setPendingAiAction(null);
                            executeConfirmedFloatingAiMessage(queryToRun, cTxt);
                          }}
                          className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-[9px] font-black rounded transition-all uppercase cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => {
                            setPendingAiAction(null);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 text-[9px] font-bold rounded transition-all uppercase cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Grounded data-action confirmation: shows the exact real record(s) affected and
                      requires explicit approval before anything is written. */}
                  {pendingDataAction && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 shadow-xs space-y-2.5 animate-fade-in text-left shrink-0">
                      <div className="flex items-start gap-2">
                        <span className="p-1 bg-amber-100 rounded text-amber-700 font-bold text-xs">⚠️</span>
                        <div>
                          <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-wider">Confirm Action</h4>
                          {pendingDataAction.type === "reorder" ? (
                            <p className="text-[9.5px] text-slate-700 mt-0.5 leading-relaxed font-semibold">
                              Flag <strong>{pendingDataAction.item.name}</strong> for reorder — currently <strong>{pendingDataAction.item.quantity}</strong> on hand (minimum {pendingDataAction.item.minQuantity}). Suggested reorder quantity: <strong>{pendingDataAction.suggestedQty} units</strong>{pendingDataAction.item.vendor ? ` from ${pendingDataAction.item.vendor}` : " (no vendor on file)"}.
                            </p>
                          ) : (
                            <p className="text-[9.5px] text-slate-700 mt-0.5 leading-relaxed font-semibold">
                              Move <strong>{pendingDataAction.event.customer}</strong>'s job from <strong>{pendingDataAction.event.date}</strong> to <strong>{pendingDataAction.newDate}</strong>.
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 pl-6">
                        <button
                          onClick={confirmPendingDataAction}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[9px] font-black rounded transition-all uppercase cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setPendingDataAction(null)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 text-[9px] font-bold rounded transition-all uppercase cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Smart suggestion chips based on active module */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1 bg-white p-2 rounded-xl border border-slate-100 shrink-0">
                    <span className="text-[8px] text-slate-400 font-extrabold uppercase w-full mb-1">Context Shortcuts:</span>
                    {activeScreen.id === "inventory" && (
                      <button
                        onClick={() => !pendingAiAction && !pendingDataAction && handleSendFloatingAiMessage("Order more.")}
                        disabled={!!pendingAiAction || !!pendingDataAction}
                        className={`px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-[9.5px] font-black cursor-pointer uppercase tracking-wider ${pendingAiAction || pendingDataAction ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        ⚡ Order more
                      </button>
                    )}
                    {activeScreen.id === "scheduling" && (
                      <button
                        onClick={() => !pendingAiAction && !pendingDataAction && handleSendFloatingAiMessage("Move him to tomorrow.")}
                        disabled={!!pendingAiAction || !!pendingDataAction}
                        className={`px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[9.5px] font-black cursor-pointer uppercase tracking-wider ${pendingAiAction || pendingDataAction ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        ⚡ Move to tomorrow
                      </button>
                    )}
                    {activeScreen.id === "revenue" && (
                      <button
                        onClick={() => !pendingAiAction && !pendingDataAction && handleSendFloatingAiMessage("Why did profit drop?")}
                        disabled={!!pendingAiAction || !!pendingDataAction}
                        className={`px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[9.5px] font-black cursor-pointer uppercase tracking-wider ${pendingAiAction || pendingDataAction ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        ⚡ Analyze drop
                      </button>
                    )}
                    <span className="text-[9px] text-slate-400 font-medium">Ask simple or complex queries using input below.</span>
                  </div>

                  {/* Input form */}
                  <div className="flex gap-1.5 pt-2 border-t border-slate-100 shrink-0">
                    <input
                      type="text"
                      value={floatingAiInput}
                      disabled={!!pendingAiAction || !!pendingDataAction}
                      onChange={(e) => setFloatingAiInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !pendingAiAction && !pendingDataAction) handleSendFloatingAiMessage();
                      }}
                      placeholder={pendingAiAction ? "Clearance check active..." : pendingDataAction ? "Confirmation pending... approve or cancel above" : `Ask Owner's AI about ${activeScreen.label}...`}
                      className={`flex-1 bg-slate-50 border border-[#9EC8EF]/40 rounded-xl px-3 py-2 text-[11px] text-[#1F3557] focus:outline-none focus:border-[#315C9F] font-semibold ${pendingAiAction || pendingDataAction ? "opacity-60 cursor-not-allowed" : ""}`}
                    />
                    <button
                      onClick={() => !pendingAiAction && !pendingDataAction && handleSendFloatingAiMessage()}
                      disabled={!!pendingAiAction || !!pendingDataAction}
                      className={`px-3.5 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-[10px] font-black rounded-xl transition-all uppercase tracking-wider cursor-pointer ${pendingAiAction || pendingDataAction ? "opacity-55 cursor-not-allowed" : ""}`}
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}

              {/* MODULE-SPECIFIC AI ACTIONS TAB */}
              {floatingAiTab === "actions" && (
                <div className="space-y-3.5 text-left">
                  <div className="bg-[#FFF9EA] p-3 rounded-2xl border border-amber-200 text-[10px] leading-relaxed text-amber-800 font-sans font-bold uppercase tracking-wider flex items-start gap-1.5">
                    <span className="text-sm shrink-0">⚡</span>
                    <span>Ready-to-Run operations for {activeScreen.label}</span>
                  </div>

                  <div className="space-y-2">
                    {/* Map of page actions */}
                    {(
                      activeScreen.id === "dashboard" ? ["Analyze Business", "Daily Summary", "Weekly Summary", "Monthly Summary"] :
                      activeScreen.id === "revenue" ? ["Analyze Profit", "Forecast Revenue", "Analyze Expenses", "Payroll Summary"] :
                      activeScreen.id === "customers" ? ["Customer Insights", "Follow-up Suggestions", "Customer Timeline"] :
                      activeScreen.id === "leads" ? ["Prioritize Leads", "Draft Follow-up", "Predict Closing Probability"] :
                      activeScreen.id === "estimates" ? ["Improve Estimate", "Suggest Pricing", "Compare Similar Jobs"] :
                      activeScreen.id === "scheduling" ? ["Optimize Schedule", "Detect Conflicts", "Assign Technician"] :
                      activeScreen.id === "dispatch" ? ["Assign Crew", "Optimize Dispatch"] :
                      activeScreen.id === "routes" ? ["Optimize Route", "Reduce Drive Time"] :
                      activeScreen.id === "jobs" ? ["Review Job", "Suggest Next Step"] :
                      activeScreen.id === "inventory" ? ["Detect Low Inventory", "Generate Purchase Order", "Scan Receipt", "Analyze Inventory"] :
                      activeScreen.id === "documents" ? ["Summarize Document", "Organize Files"] :
                      activeScreen.id === "messages" ? ["Draft Reply", "Rewrite Message", "Summarize Conversation"] :
                      activeScreen.id === "training" ? ["Assign Courses", "Generate Quiz", "Build Course"] :
                      activeScreen.id === "settings" ? ["Explain Settings", "Recommend Configuration"] :
                      activeScreen.id === "integrations" ? ["Diagnose Integration", "Sync Status"] :
                      activeScreen.id === "roster" ? ["Employee Summary", "Performance Review"] :
                      ["Post Bulletin Alert", "Summarize Announcements"]
                    ).map((act, aIdx) => (
                      <button
                        key={aIdx}
                        onClick={() => {
                          setFloatingAiTab("ask");
                          handleSendFloatingAiMessage(`Perform standard action: ${act}`);
                        }}
                        className="w-full p-3 bg-white hover:bg-[#EAF5FF] border border-slate-200 hover:border-[#315C9F] rounded-2xl text-[10.5px] font-black text-[#1F3557] flex items-center justify-between transition-all cursor-pointer uppercase tracking-wider"
                      >
                        <span className="truncate">{act}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#315C9F]" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* MODULE AI SETTINGS TAB */}
              {floatingAiTab === "settings" && (
                <div className="space-y-4 text-left">
                  <div className="bg-white p-3.5 rounded-2xl border border-[#9EC8EF]/40 space-y-1.5">
                    <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wider">Module Override AI Level</h4>
                    <p className="text-[9px] text-slate-400 font-sans font-medium">
                      Control parameters for {activeScreen.label} specifically. Specific overrides customize the global fallback configured below.
                    </p>
                    <select
                      value={moduleAiSettings[activeScreen.id] || "DEFAULT"}
                      onChange={(e) => {
                        const val = e.target.value;
                        setModuleAiSettings(prev => ({ ...prev, [activeScreen.id]: val as any }));
                        triggerNotification(`⚙️ Override for ${activeScreen.label} set to ${val}`);
                      }}
                      className="w-full mt-2 text-[10px] font-bold text-[#1F3557] bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer"
                    >
                      <option value="DEFAULT">INHERIT DEFAULT ({globalAiSetting})</option>
                      <option value="OFF">OFF</option>
                      <option value="ASSIST">ASSIST</option>
                      <option value="ASSIST + APPROVAL">ASSIST + APPROVAL</option>
                      <option value="AUTO">AUTO (AUTONOMOUS)</option>
                    </select>
                  </div>

                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
                    <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wider">Default Global Policy</h4>
                    <p className="text-[9px] text-slate-400 font-sans font-medium">
                      Baseline fallback for all workspaces.
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      {["OFF", "ASSIST", "ASSIST + APPROVAL", "AUTO"].map((mode) => (
                        <button
                          key={mode}
                          onClick={() => {
                            setGlobalAiSetting(mode as any);
                            triggerNotification(`🤖 Global AI baseline updated to ${mode}`);
                          }}
                          className={`p-1.5 rounded-lg border text-center text-[9px] font-black uppercase transition-all cursor-pointer ${
                            globalAiSetting === mode
                              ? "bg-[#315C9F] text-white border-transparent"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {mode === "ASSIST + APPROVAL" ? "ASSIST + APP" : mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* RECENT AI ACTIONS LEDGER TAB */}
              {floatingAiTab === "recent" && (
                <div className="space-y-3.5 text-left">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wider">Audit Log Checklist</h4>
                    <span className="text-[8.5px] bg-[#EAF5FF] text-[#315C9F] px-2 py-0.5 rounded font-mono font-black">
                      {recentAiActions.filter(a => a.status === "Completed").length} Active
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {recentAiActions.map((act) => (
                      <div key={act.id} className={`p-3 rounded-2xl border transition-all text-left ${
                        act.status === "Undone" 
                          ? "bg-rose-50/50 border-rose-100 text-slate-400" 
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:border-[#315C9F]"
                      }`}>
                        <div className="flex justify-between items-center w-full">
                          <span className="text-[8px] bg-slate-200 px-1.5 py-0.5 rounded font-mono font-bold uppercase">{act.module}</span>
                          {act.status !== "Undone" && (
                            <button
                              onClick={() => {
                                // NOTE: this only marks the log entry as undone (audit annotation).
                                // Recent AI actions don't currently carry structured revert data, so
                                // this deliberately does not attempt to reverse the underlying change —
                                // doing that with guessed/hardcoded values would silently corrupt data.
                                setRecentAiActions(prev => prev.map(a => a.id === act.id ? { ...a, status: "Undone" } : a));
                                triggerNotification(`Marked as undone: ${act.action}. Reverse the change manually on the relevant page if needed.`);
                              }}
                              className="px-1.5 py-0.5 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-100 rounded text-[8px] font-black uppercase transition-colors cursor-pointer"
                            >
                              Undo
                            </button>
                          )}
                        </div>
                        <h5 className={`text-[10.5px] font-black uppercase mt-1.5 ${act.status === "Undone" ? "line-through text-slate-400" : "text-slate-800"}`}>{act.action}</h5>
                        <p className="text-[9.5px] leading-relaxed text-slate-500 font-sans font-semibold mt-0.5">{act.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

          </div>
        )}

      </div>,
      document.body
      )}

      {/* FLOATING SUCCESS/WARNING NOTIFICATIONS SYSTEM */}
      {showNotification && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-blue-500/30 shadow-[0_10px_30px_rgba(30,144,255,0.2)] rounded-2xl px-4 py-3.5 flex items-center gap-3 z-50 text-xs md:text-sm animate-fade-in text-slate-100 max-w-sm">
          <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-white mb-0.5">System Alert</p>
            <p className="text-slate-400 font-medium text-xs leading-tight">{showNotification}</p>
          </div>
        </div>
      )}





      {/* Universal footer */}
      <footer className="w-full py-4 text-center border-t border-white/5 bg-slate-950/80 backdrop-blur text-[11px] font-mono tracking-wider text-slate-500 z-10">
        OWNER'S LOCAL OS • CLOUD RUN PREVIEW SECURED CLIENT ENVIRONMENT • © 2026
      </footer>

    </div>
    </NavTelemetryContext.Provider>
    </DomainDataContext.Provider>
    </AuthContext.Provider>
  );
}
