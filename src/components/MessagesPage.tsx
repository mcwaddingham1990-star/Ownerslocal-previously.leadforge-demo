import React, { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  MessageSquare,
  Users,
  Search,
  Filter,
  RefreshCw,
  Send,
  Paperclip,
  Camera,
  Mic,
  Smile,
  MapPin,
  User,
  FileText,
  Package,
  TrendingUp,
  Briefcase,
  Layers,
  Sparkles,
  ChevronRight,
  Info,
  Archive,
  Trash2,
  Bell,
  CheckCircle2,
  Volume2,
  Pin,
  Check,
  AlertTriangle,
  FileSpreadsheet,
  Settings,
  Shield,
  Clock,
  Eye,
  CheckSquare,
  ChevronDown,
  CornerDownLeft,
  BookOpen,
  UserCheck,
  Building,
  DollarSign
} from "lucide-react";
import { Customer } from "./CustomersPage";
import { DocumentItem } from "./DocumentsPage";
import { geocodeAddress } from "./InteractiveMapPage";
import { collection, doc, setDoc, deleteDoc, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { hasPermission } from "../types/permissions";

// Let's define the Types
export interface MessageAttachment {
  id: string;
  type: "Photo" | "Video" | "PDF" | "Document" | "Voice Note" | "Receipt" | "Estimate" | "Invoice" | "Inventory" | "GPS Location";
  name: string;
  size?: string;
  meta?: any; // stores coordinates, amount, estimateId, sku, etc.
}

export interface Message {
  id: string;
  sender: string;
  senderRole: string;
  avatar?: string;
  content: string;
  timestamp: string; // e.g. "2026-07-06 14:32"
  attachments?: MessageAttachment[];
  isAiSuggested?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  type: "Direct Message" | "Customer Chat" | "Team Chat" | "Crew Chat" | "Office Chat" | "Dispatch Chat" | "Project Chat" | "Announcement" | "System Notification" | "AI Conversation";
  participants: string[];
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: string;
  lastMessageSender: string;
  isRead: boolean;
  isFavorite?: boolean;
  isArchived: boolean;
  isMuted?: boolean;
  isPinned?: boolean;
  priority: "High" | "Normal" | "Low";
  onlineStatus?: "Online" | "Offline" | "Away";
  
  // Event engine links
  customerId?: string;
  customerName?: string;
  jobId?: string;
  jobName?: string;
  estimateId?: string;
  routeId?: string;
  routeName?: string;
  scheduleId?: string;
  scheduleDate?: string;
  documentIds?: string[];
  revenueAmount?: number;
  
  messages: Message[];
  createdDate: string;
}

export const MessagesPage: React.FC = () => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  // Everyone with Messages access can view and send -- deleting a
  // conversation is owner-only by default, unless a role has explicitly
  // been granted Delete on the Messages module.
  const canDeleteMessages = activeRole === "Owner" || hasPermission(loggedInUser?.granularPermissions, "messages", "delete");
  const { documents, setDocuments, customers: customersList, recentRoster, employees, schedulingEvents, estimates, invoices, preSelectedCustomerId, setPreSelectedCustomerId } = useDomainData();
  const {
    openPlaceholderPage: onOpenPlaceholder,
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    navigateToScreen: onNavigateToScreen,
    logOperationalEvent
  } = useNavTelemetry();
  const currentUserName = loggedInUser?.name || "Unknown User";
  const currentUserEmail = loggedInUser?.email || "";
  const businessId = loggedInUser?.isEmployee ? loggedInUser.businessEmail : loggedInUser?.email;

  const [conversations, _setConversations] = useState<Conversation[]>([]);

  // Real-time synchronization helper for conversations
  const syncConversationsToFirestore = async (oldArray: Conversation[], newArray: Conversation[], bid: string) => {
    const oldMap = new Map(oldArray.map(item => [item.id, item]));
    for (const item of newArray) {
      const oldItem = oldMap.get(item.id);
      if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
        try {
          await setDoc(doc(db, "conversations", item.id), {
            ...item,
            businessId: bid,
            updatedAt: new Date().toISOString()
          });
        } catch (err) {
          console.error("Error saving conversation:", err);
          triggerRealTimeNotification(`Message failed to save: ${err instanceof Error ? err.message : "unknown error"}. It will disappear on reload.`);
        }
      }
    }
    const newSet = new Set(newArray.map(item => item.id));
    for (const item of oldArray) {
      if (!newSet.has(item.id)) {
        try {
          await deleteDoc(doc(db, "conversations", item.id));
        } catch (err) {
          console.error("Error deleting conversation:", err);
          triggerRealTimeNotification(`Failed to delete conversation: ${err instanceof Error ? err.message : "unknown error"}`);
        }
      }
    }
  };

  const setConversations = (value: React.SetStateAction<Conversation[]>) => {
    _setConversations((prev) => {
      const nextList = typeof value === "function" ? (value as Function)(prev) : value;
      if (businessId) {
        syncConversationsToFirestore(prev, nextList, businessId);
      }
      return nextList;
    });
  };

  // Subscribe and seed conversations from Firestore based on multi-tenant businessId
  useEffect(() => {
    if (!businessId) return;

    const q = query(collection(db, "conversations"), where("businessId", "==", businessId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: Conversation[] = [];
      snapshot.forEach((docSnap) => {
        const { businessId: _, updatedAt: __, ...convData } = docSnap.data();
        const stored = convData as Partial<Conversation>;
        items.push({
          ...stored,
          id: stored.id || docSnap.id,
          title: stored.title || "Untitled conversation",
          lastMessage: stored.lastMessage || "",
          lastMessageTime: stored.lastMessageTime || "",
          lastMessageSender: stored.lastMessageSender || "",
          participants: Array.isArray(stored.participants) ? stored.participants : [],
          messages: Array.isArray(stored.messages) ? stored.messages : [],
          unreadCount: Number(stored.unreadCount) || 0,
          isArchived: Boolean(stored.isArchived),
          isRead: stored.isRead !== false
        } as Conversation);
      });
      _setConversations(items);
    });

    return () => unsubscribe();
  }, [businessId]);


  // Selected active conversation logic
  const [selectedConvId, setSelectedConvId] = useState<string>("conv_1");
  const activeConv = useMemo(() => {
    return conversations.find(c => c.id === selectedConvId) || conversations.find(c => !c.isArchived) || conversations[0];
  }, [conversations, selectedConvId]);

  // Read state tracker
  useEffect(() => {
    if (activeConv && !activeConv.isRead) {
      setConversations(prev => prev.map(c => {
        if (c.id === activeConv.id) {
          return { ...c, isRead: true, unreadCount: 0 };
        }
        return c;
      }));
    }
  }, [selectedConvId]);

  // Navigation and Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBy, setSearchBy] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all"); // "all", "unread", "direct", "customer", "team", "ai", "archived", "flagged", "high_priority"
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(true);

  // Message compose input
  const [inputText, setInputText] = useState("");
  
  // Attachments in draft
  const [draftAttachments, setDraftAttachments] = useState<MessageAttachment[]>([]);

  // Modals for creating conversations
  const [isNewMsgModalOpen, setIsNewMsgModalOpen] = useState(false);
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);

  // Snapshot AI simulation state
  const [isSnapshotAiOpen, setIsSnapshotAiOpen] = useState(false);
  const [scannedDoc, setScannedDoc] = useState<any>(null);
  const [scanningStatus, setScanningStatus] = useState<"idle" | "capturing" | "analyzing" | "extracted">("idle");
  const [extractedSuggestions, setExtractedSuggestions] = useState<any[]>([]);

  // Custom AI prompt composer states
  const [isAiComposeOpen, setIsAiComposeOpen] = useState(false);
  const [aiCommandInput, setAiCommandInput] = useState("");
  const [aiGeneratedDraft, setAiGeneratedDraft] = useState("");

  // Attachment Picker Popovers
  const [activePicker, setActivePicker] = useState<string | null>(null); // "customer", "job", "estimate", "invoice", "document", "inventory", "location"

  // Draft Message attachments options
  const [newConvTitle, setNewConvTitle] = useState("");
  const [newConvType, setNewConvType] = useState<any>("Customer Chat");
  const [newConvRecipient, setNewConvRecipient] = useState("");
  const [newConvJobId, setNewConvJobId] = useState("");
  const [newConvEstimateId, setNewConvEstimateId] = useState("");
  const [newConvPriority, setNewConvPriority] = useState<"High" | "Normal" | "Low">("Normal");

  useEffect(() => {
    if (!preSelectedCustomerId) return;
    const customer = customersList.find(c => c.id === preSelectedCustomerId);
    if (customer) {
      setNewConvRecipient(`customer:${customer.id}`);
      setNewConvTitle(`Chat with ${customer.contact || customer.company}`);
      setNewConvType("Customer Chat");
      setIsNewMsgModalOpen(true);
    }
    setPreSelectedCustomerId(undefined);
  }, [preSelectedCustomerId, customersList, setPreSelectedCustomerId]);
  
  // Roster or staff for group setup, from the real team roster
  const mockStaff = useMemo(() => {
    const byName = new Map<string, { name: string; role: string }>();
    recentRoster
      .filter(person => person.status?.toLowerCase() !== "inactive")
      .forEach(person => byName.set(person.name.trim().toLowerCase(), { name: person.name, role: person.role }));
    employees.forEach(employee => {
      const name = `${employee.firstName} ${employee.lastName}`.trim();
      if (name) byName.set(name.toLowerCase(), { name, role: employee.role });
    });
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [recentRoster, employees]);

  // Real active jobs (scheduling events), pulled live from the shared Event Engine.
  const mockJobs = schedulingEvents
    .filter(e => e.status !== "Cancelled")
    .map(e => ({ id: e.id, name: `${e.eventType}${e.customType ? ` — ${e.customType}` : ""}`, customer: e.customer }));

  // Real estimates on file.
  const mockEstimates = estimates.map(e => ({ id: e.number, name: `${e.customerName} (${e.company})`, amount: `$${(e.amount || 0).toLocaleString()}` }));

  // Real invoices on file.
  const mockInvoices = invoices.map(i => ({ id: i.invoiceNumber, name: i.customer, amount: `$${(i.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0)).toLocaleString()}`, status: i.status }));

  // Real customer addresses, deterministically placed on the map (no true geocoding backend yet).
  const mockLocations = customersList
    .filter(c => c.address?.trim())
    .map(c => ({ name: c.company, address: c.address, ...geocodeAddress(c.address, c.id) }));

  // Simple Notification banner for real-time alerts simulation
  const [latestNotification, setLatestNotification] = useState<string | null>(null);

  // Role Security restrictions:
  // Owners, Managers, Office, Dispatch, Schedulers can access all conversations allowed by permissions.
  // Employees only access conversations related to themselves, assigned customers, assigned jobs, assigned crews, or custom permissions.
  const hasFullAccess = useMemo(() => {
    const permRoles = ["Owner", "General Manager", "Office Manager", "Operations Manager", "Scheduler", "Dispatcher"];
    return permRoles.includes(activeRole);
  }, [activeRole]);

  // Filter conversations list based on role restriction + search query + selected filters
  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      // 1. Role permission security check
      if (!hasFullAccess) {
        // Must contain simulated currentUserName as participant or author, or link to assigned entities
        const hasMe = conv.participants.includes(currentUserName);
        const isPublicSystem = conv.type === "Announcement" || conv.type === "System Notification";
        if (!hasMe && !isPublicSystem) return false;
      }

      // 2. Archived filter
      const isArchivedMatched = filterType === "archived" ? conv.isArchived : !conv.isArchived;
      if (!isArchivedMatched) return false;

      // 3. Search query
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        let matchesSearch = false;
        
        if (searchBy === "all" || searchBy === "keyword") {
          matchesSearch = conv.title.toLowerCase().includes(query) ||
                          conv.lastMessage.toLowerCase().includes(query) ||
                          conv.participants.some(p => p.toLowerCase().includes(query)) ||
                          (conv.customerName && conv.customerName.toLowerCase().includes(query)) ||
                          (conv.jobName && conv.jobName.toLowerCase().includes(query));
        } else if (searchBy === "customer") {
          matchesSearch = conv.customerName ? conv.customerName.toLowerCase().includes(query) : false;
        } else if (searchBy === "employee") {
          matchesSearch = conv.participants.some(p => mockStaff.some(s => s.name === p) && p.toLowerCase().includes(query));
        } else if (searchBy === "job") {
          matchesSearch = conv.jobId ? conv.jobId.toLowerCase().includes(query) || (conv.jobName && conv.jobName.toLowerCase().includes(query)) : false;
        } else if (searchBy === "estimate") {
          matchesSearch = conv.estimateId ? conv.estimateId.toLowerCase().includes(query) : false;
        } else if (searchBy === "phone") {
          // Check linked customer contact number
          const linkedCust = customersList.find(c => c.company === conv.customerName || c.contact === conv.title);
          matchesSearch = linkedCust ? linkedCust.phone.includes(query) : false;
        } else if (searchBy === "attachment") {
          matchesSearch = conv.messages.some(m => m.attachments && m.attachments.some(a => a.name.toLowerCase().includes(query)));
        }

        if (!matchesSearch) return false;
      }

      // 4. Category/Summary Card Filters
      if (filterType === "unread") {
        return conv.unreadCount > 0;
      } else if (filterType === "direct") {
        return conv.type === "Direct Message";
      } else if (filterType === "customer") {
        return conv.type === "Customer Chat";
      } else if (filterType === "team") {
        return ["Team Chat", "Crew Chat", "Office Chat", "Dispatch Chat", "Project Chat"].includes(conv.type);
      } else if (filterType === "ai") {
        return conv.type === "AI Conversation";
      } else if (filterType === "flagged") {
        return conv.isFavorite;
      } else if (filterType === "high_priority") {
        return conv.priority === "High";
      }

      return true;
    });
  }, [conversations, searchQuery, searchBy, filterType, activeRole, hasFullAccess, currentUserName]);

  // Compute stats for Summary Cards
  const stats = useMemo(() => {
    let unread = 0;
    let direct = 0;
    let cust = 0;
    let team = 0;
    let ai = 0;
    let archived = 0;

    conversations.forEach(c => {
      if (c.isArchived) {
        archived++;
      } else {
        if (c.unreadCount > 0) unread += c.unreadCount;
        if (c.type === "Direct Message") direct++;
        else if (c.type === "Customer Chat") cust++;
        else if (["Team Chat", "Crew Chat", "Office Chat", "Dispatch Chat", "Project Chat"].includes(c.type)) team++;
        else if (c.type === "AI Conversation") ai++;
      }
    });

    return { unread, direct, cust, team, ai, archived };
  }, [conversations]);

  // Simulated notification system triggered on incoming events
  const triggerRealTimeNotification = (text: string) => {
    setLatestNotification(text);
    if (logOperationalEvent) {
      logOperationalEvent("Message Intercom", text, "💬");
    }
    setTimeout(() => {
      setLatestNotification(null);
    }, 4000);
  };

  // Attach an item to the draft
  const attachItem = (type: any, name: string, size: string = "N/A", meta: any = {}) => {
    const newAtt: MessageAttachment = {
      id: "draft_att_" + Date.now(),
      type,
      name,
      size,
      meta
    };
    setDraftAttachments(prev => [...prev, newAtt]);
    setActivePicker(null);
    triggerRealTimeNotification(`Attached ${type}: ${name} to message draft.`);
  };

  // Real file attachment — reads the actual selected/captured file (name, size, content as a
  // data URL) instead of the old hardcoded fake "Manual_Leak_Fix.pdf"/"Field_Inspection_Main.jpg".
  const fileAttachInputRef = useRef<HTMLInputElement | null>(null);
  const photoAttachInputRef = useRef<HTMLInputElement | null>(null);
  const handleRealFileAttach = (e: React.ChangeEvent<HTMLInputElement>, type: "PDF" | "Photo" | "Document") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      attachItem(type, file.name, `${(file.size / 1024).toFixed(0)} KB`, { dataUrl: reader.result });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Sending active message
  const handleSendMessage = () => {
    if (!inputText.trim() && draftAttachments.length === 0) return;

    const newMessage: Message = {
      id: "m_" + Date.now(),
      sender: currentUserName,
      senderRole: activeRole,
      content: inputText.trim(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      attachments: draftAttachments.length > 0 ? draftAttachments : undefined
    };

    const updatedConversations = conversations.map(c => {
      if (c.id === activeConv.id) {
        return {
          ...c,
          lastMessage: newMessage.content || `[Sent ${newMessage.attachments?.[0].type || "Attachment"}]`,
          lastMessageSender: currentUserName,
          lastMessageTime: newMessage.timestamp,
          isRead: true,
          messages: [...c.messages, newMessage]
        };
      }
      return c;
    });

    setConversations(updatedConversations);
    setInputText("");
    setDraftAttachments([]);

    // Real AI conversations get a real model response; other conversation
    // types wait for an actual reply from the other real participant --
    // nothing here fabricates a fake incoming message.
    if (activeConv.type === "AI Conversation") {
      simulateAiResponse(newMessage.content);
    }
  };

  // Real Gemini call, grounded in this account's actual data.
  const simulateAiResponse = async (userPrompt: string) => {
    triggerRealTimeNotification("Owner's AI is analyzing your request...");
    const convId = activeConv.id;

    const businessSummary = [
      `Customers on file: ${customersList.length}.`,
      `Active jobs: ${mockJobs.length}.`,
      `Estimates on file: ${estimates.length}.`,
      `Invoices on file: ${invoices.length}.`
    ].join(" ");

    let aiContent = "Couldn't reach the AI right now — check your connection and try again.";
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: "messages",
          pageName: "Messages",
          isOwnerOrAdmin: true,
          businessSummary,
          query: userPrompt
        })
      });
      const data = await res.json();
      aiContent = data.text || "No response.";
    } catch {
      // aiContent already set to the fallback message above
    }

    const aiMsg: Message = {
      id: "ai_" + Date.now(),
      sender: "Owner's AI",
      senderRole: "AI Assistant",
      content: aiContent,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
    };

    setConversations(prev => prev.map(c => {
      if (c.id === convId) {
        return {
          ...c,
          lastMessage: aiMsg.content,
          lastMessageSender: "Owner's AI",
          lastMessageTime: aiMsg.timestamp,
          unreadCount: 0,
          isRead: true,
          messages: [...c.messages, aiMsg]
        };
      }
      return c;
    }));

    triggerRealTimeNotification("Owner's AI completed response generation.");
  };

  // AI Compose rewrite assistant
  const handleAiAction = (actionType: string) => {
    let result = "";
    const sourceText = inputText || "We will arrive tomorrow morning to repair the pipe leak.";

    switch (actionType) {
      case "Rewrite":
        result = `[AI Rewritten] Professional Update: This is to confirm that our specialized installation technicians are scheduled to arrive tomorrow morning to commence the leak diagnostic and repair work.`;
        break;
      case "Summarize":
        result = `[AI Summary] Customer plumbing maintenance scheduled. ETA: Tomorrow AM. Task: Pipe leak repair.`;
        break;
      case "Translate":
        result = `[AI Spanish Translation] Llegaremos mañana por la mañana para reparar la fuga de la tubería.`;
        break;
      case "Grammar":
        result = `[AI Checked] We will arrive tomorrow morning to repair the pipe leak.`;
        break;
      case "Professional":
        result = `[AI Professional Tone] Good afternoon, please be advised that our service technicians have been dispatched and will arrive tomorrow morning to resolve the pipe leakage issues at your facility.`;
        break;
      case "Suggest Reply":
        result = `Thank you for the update. Our crew is on-site and we've verified the blueprints. Please let us know if we need further materials.`;
        break;
      case "Follow-up":
        result = `Hello, following up on our recent plumbing installation work. Please let us know if the pressure readings remain stable!`;
        break;
      default:
        result = sourceText;
    }

    setInputText(result);
    setIsAiComposeOpen(false);
    triggerRealTimeNotification(`AI ${actionType} completed successfully.`);
  };

  // Snapshot AI Scanned receipt trigger flow
  const triggerSnapshotScan = (category: string) => {
    setScanningStatus("capturing");
    setScannedDoc({ category, name: `Scan_${category}_${Date.now().toString().slice(-4)}.pdf` });

    // Progress loader simulation
    setTimeout(() => {
      setScanningStatus("analyzing");
    }, 1200);

    setTimeout(() => {
      setScanningStatus("extracted");
      // Suggestions reference this account's real customer/job on file when
      // one exists; otherwise the suggestion stays generic instead of
      // inventing a business name.
      const conversationCustomer = activeConv?.customerName;
      const realJob = mockJobs[0];
      const suggestions: Array<{ action: string; target: string; reason: string }> = [];
      if (conversationCustomer) {
        suggestions.push({ action: "Attach to Customer", target: conversationCustomer, reason: "This conversation is linked to that customer." });
      }
      if (realJob) {
        suggestions.push({ action: "Attach to Job", target: realJob.name, reason: "Most recent active job on file." });
      }
      suggestions.push({ action: "Attach to Documents", target: "Documents Vault", reason: "Save to general records." });
      setExtractedSuggestions(suggestions);
    }, 2800);
  };

  // Snapshot AI suggestion confirmation flow
  const handleAcceptSuggestion = (sugg: any) => {
    // Perform operations depending on action
    if (sugg.action === "Attach to Documents") {
      const newDoc: DocumentItem = {
        id: "doc_scanned_" + Date.now(),
        name: scannedDoc.name,
        customer: activeConv.customerName || "None",
        employee: currentUserName,
        vendor: "None",
        job: activeConv.jobId || "None",
        type: scannedDoc.category,
        uploadedBy: currentUserName,
        date: new Date().toISOString().slice(0, 10),
        size: "350 KB",
        status: "Signed",
        isFavorite: false,
        isArchived: false,
        notes: `AI scan attachment auto-indexed: ${sugg.reason}`,
        tags: ["AI Scanned", scannedDoc.category],
        estimateId: activeConv.estimateId || "None",
        invoiceId: "None",
        lastModified: new Date().toLocaleString([], { month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
      };
      setDocuments(prev => [newDoc, ...prev]);
      triggerRealTimeNotification(`Success: Created formal document "${newDoc.name}" in Documents Vault.`);
    } else {
      triggerRealTimeNotification(`Success: Linked scanned receipt to ${sugg.target}.`);
    }

    // Attach as visual message bubble
    attachItem("Receipt", scannedDoc.name, "350 KB", { note: sugg.reason });

    // Filter out approved suggestion
    setExtractedSuggestions(prev => prev.filter(item => item.action !== sugg.action));
  };

  // Conversation detail controllers
  const toggleMute = (id: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, isMuted: !c.isMuted } : c));
    triggerRealTimeNotification(`Conversation notifications ${conversations.find(c => c.id === id)?.isMuted ? 'unmuted' : 'muted'}`);
  };

  const togglePin = (id: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, isPinned: !c.isPinned } : c));
    triggerRealTimeNotification(`Conversation ${conversations.find(c => c.id === id)?.isPinned ? 'unpinned' : 'pinned'}`);
  };

  const toggleArchive = (id: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, isArchived: !c.isArchived } : c));
    triggerRealTimeNotification(`Conversation ${conversations.find(c => c.id === id)?.isArchived ? 'unarchived' : 'archived'}`);
  };

  const deleteConversation = (id: string) => {
    if (!canDeleteMessages) {
      triggerRealTimeNotification("🚫 Only the owner can delete conversations.");
      return;
    }
    setConversations(prev => prev.filter(c => c.id !== id));
    triggerRealTimeNotification("Conversation deleted successfully.");
  };

  // Creating a new direct or group conversation
  const handleCreateConversation = (isGroup: boolean) => {
    if (!newConvTitle.trim()) {
      triggerRealTimeNotification("Please enter a conversation title.");
      return;
    }

    const selectedCustomer = !isGroup && newConvRecipient.startsWith("customer:")
      ? customersList.find(c => c.id === newConvRecipient.slice("customer:".length))
      : undefined;
    const recipientName = selectedCustomer
      ? selectedCustomer.contact || selectedCustomer.company
      : newConvRecipient.replace(/^staff:/, "").trim();
    if (!isGroup && !recipientName) {
      triggerRealTimeNotification("Please select a customer or team member.");
      return;
    }

    const linkedJob = schedulingEvents.find(job => job.id === newConvJobId);
    const linkedEstimate = estimates.find(estimate => estimate.id === newConvEstimateId);

    const newC: Conversation = {
      id: "conv_" + Date.now(),
      title: newConvTitle,
      type: isGroup ? "Team Chat" : selectedCustomer ? "Customer Chat" : "Direct Message",
      participants: isGroup ? [currentUserName, ...newConvRecipient.split(",").map(x => x.trim())] : [currentUserName, recipientName],
      unreadCount: 0,
      lastMessage: "Conversation created.",
      lastMessageTime: new Date().toISOString().replace('T', ' ').substring(0, 16),
      lastMessageSender: currentUserName,
      isRead: true,
      isArchived: false,
      priority: newConvPriority,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer ? selectedCustomer.contact || selectedCustomer.company : undefined,
      jobId: linkedJob?.id,
      jobName: linkedJob ? `${linkedJob.eventType} — ${linkedJob.customer}` : undefined,
      estimateId: linkedEstimate?.id,
      createdDate: new Date().toISOString().substring(0, 10),
      messages: [
        {
          id: "m_init_" + Date.now(),
          sender: "System Event Node",
          senderRole: "System Notification",
          content: `Conversation started. Participants: ${isGroup ? [currentUserName, ...newConvRecipient.split(",").map(x => x.trim())].join(', ') : currentUserName + ", " + recipientName}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
        }
      ]
    };

    setConversations(prev => [newC, ...prev]);
    setSelectedConvId(newC.id);
    setNewConvTitle("");
    setNewConvRecipient("");
    setNewConvJobId("");
    setNewConvEstimateId("");
    setIsNewMsgModalOpen(false);
    setIsNewGroupModalOpen(false);
    triggerRealTimeNotification(`Created new channel: ${newC.title}`);
  };

  if (!activeConv) {
    return (
      <div className="rounded-3xl border border-[#A9CDEE] bg-[#C7E3FB] p-6 text-left shadow-sm">
        <div className="rounded-2xl border border-[#A9CDEE] bg-[#E3F3FF] p-8 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-[#315C9F]" />
          <h2 className="mt-3 text-base font-extrabold text-[#342D7E]">No conversations yet</h2>
          <p className="mt-1 text-xs text-slate-500">Your customer and team conversations will appear here after you start one.</p>
          <button onClick={() => setIsNewMsgModalOpen(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#4A9BFF] px-4 py-2.5 text-xs font-black uppercase text-white hover:bg-[#3583E6]"><Send className="h-4 w-4" /> New message</button>
        </div>
        {isNewMsgModalOpen && (
          <div onClick={() => setIsNewMsgModalOpen(false)} className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-xs">
            <div onClick={e => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-3xl border border-[#9EC8EF] bg-white p-6 text-left shadow-2xl">
              <div className="flex items-center justify-between border-b pb-2"><h4 className="text-xs font-extrabold uppercase tracking-wider text-[#342D7E]">Start a conversation</h4><button onClick={() => setIsNewMsgModalOpen(false)} className="p-1 font-bold text-slate-400">✕</button></div>
              <label className="block text-[9px] font-bold uppercase text-slate-500">Customer or team member<select value={newConvRecipient} onChange={e => { const value=e.target.value; setNewConvRecipient(value); const customer=value.startsWith("customer:")?customersList.find(c=>c.id===value.slice(9)):undefined; const name=customer?(customer.contact||customer.company):value.replace(/^staff:/,""); setNewConvTitle(name?`Chat with ${name}`:""); }} className="mt-1 w-full rounded-xl border border-[#A9CDEE] bg-white px-3 py-2.5 text-xs text-[#1F3557]"><option value="">Select recipient…</option><optgroup label="Customers">{customersList.map(c=><option key={c.id} value={`customer:${c.id}`}>{c.contact || c.company}{c.contact&&c.company?` — ${c.company}`:""}</option>)}</optgroup><optgroup label="Team">{mockStaff.filter(s=>s.name!==currentUserName).map(s=><option key={s.name} value={`staff:${s.name}`}>{s.name} — {s.role}</option>)}</optgroup></select></label>
              <label className="block text-[9px] font-bold uppercase text-slate-500">Related job (optional)<select value={newConvJobId} onChange={e => setNewConvJobId(e.target.value)} className="mt-1 w-full rounded-xl border border-[#A9CDEE] bg-white px-3 py-2.5 text-xs text-[#1F3557]"><option value="">No job link</option>{schedulingEvents.filter(job => job.eventType === "Job").map(job => <option key={job.id} value={job.id}>{job.customer} · {job.jobNumber || job.id}</option>)}</select></label>
              <label className="block text-[9px] font-bold uppercase text-slate-500">Related estimate (optional)<select value={newConvEstimateId} onChange={e => setNewConvEstimateId(e.target.value)} className="mt-1 w-full rounded-xl border border-[#A9CDEE] bg-white px-3 py-2.5 text-xs text-[#1F3557]"><option value="">No estimate link</option>{estimates.map(estimate => <option key={estimate.id} value={estimate.id}>{estimate.customerName} · {estimate.number}</option>)}</select></label>
              <label className="block text-[9px] font-bold uppercase text-slate-500">Conversation title<input value={newConvTitle} onChange={e=>setNewConvTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-[#A9CDEE] bg-slate-50 px-3 py-2.5 text-xs" /></label>
              <button disabled={!newConvRecipient || !newConvTitle.trim()} onClick={() => handleCreateConversation(false)} className="w-full rounded-xl bg-[#4A9BFF] py-2.5 text-xs font-bold uppercase text-white disabled:bg-slate-300">Start conversation</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-6 animate-fade-in text-left">
      
      {/* Real-time Event simulation Notification banner */}
      {latestNotification && (
        <div className="fixed top-4 right-4 z-[9999] bg-[#315C9F] text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 border border-[#4A9BFF] animate-bounce">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
          <span>{latestNotification}</span>
        </div>
      )}

      {/* TOP HEADER CARD */}
      <div className="bg-[#E3F3FF] p-5 rounded-2xl border border-[#A9CDEE] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#315C9F]" />
            <h2 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
              Unified Communications Hub
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-sans mt-1">
            Keep conversations connected with customers, schedules, dispatch, and job details
          </p>
        </div>

        {/* TOP INTERACTIVE BUTTONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsNewMsgModalOpen(true)}
            className="px-3 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <User className="w-3.5 h-3.5" /> Direct Message
          </button>
          
          <button
            onClick={() => setIsNewGroupModalOpen(true)}
            className="px-3 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" /> New Group
          </button>

          <button
            onClick={() => setIsAiComposeOpen(true)}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-200" /> AI Compose
          </button>

          <button
            onClick={() => {
              setIsSnapshotAiOpen(true);
              setScanningStatus("idle");
              setScannedDoc(null);
            }}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-200" /> Snapshot AI Scan
          </button>

          <button
            onClick={() => {
              setConversations(prev => [...prev]);
              triggerRealTimeNotification("Syncing message streams with remote database...");
            }}
            className="p-2 bg-[#F5FAFF] hover:bg-[#E3F3FF] text-[#315C9F] border border-[#A9CDEE] rounded-xl transition-all"
            title="Refresh Conversations"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SEARCH & FILTER BAR */}
      <div className="bg-[#E3F3FF] p-4 rounded-2xl border border-[#A9CDEE] flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder={`Search messages by ${searchBy}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-[#4A9BFF] font-medium"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Search By:</span>
          <select
            value={searchBy}
            onChange={(e) => setSearchBy(e.target.value)}
            className="text-xs bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-2 py-2 focus:outline-none cursor-pointer text-slate-700 font-semibold"
          >
            <option value="all">🔍 All Fields</option>
            <option value="customer">🏢 Customer</option>
            <option value="employee">👷 Employee</option>
            <option value="job">🛠️ Job ID</option>
            <option value="estimate">📄 Estimate</option>
            <option value="phone">📞 Phone</option>
            <option value="keyword">💬 Keyword</option>
            <option value="attachment">📎 Attachment Name</option>
          </select>

          <button
            onClick={() => setShowFiltersModal(true)}
            className="px-3.5 py-2 bg-[#F5FAFF] hover:bg-[#E3F3FF] text-slate-700 border border-[#A9CDEE] rounded-xl transition-all text-xs font-semibold flex items-center gap-1.5"
          >
            <Filter className="w-3.5 h-3.5" /> Filters
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS - CATEGORY FILTER SELECTORS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { key: "all", label: "All Chats", val: conversations.filter(c => !c.isArchived).length, color: "bg-slate-50 border-slate-200 hover:bg-slate-100" },
          { key: "unread", label: "Unread", val: stats.unread, color: "bg-red-50 border-red-200 hover:bg-red-100/80 text-red-700", animate: stats.unread > 0 },
          { key: "direct", label: "Direct", val: stats.direct, color: "bg-blue-50 border-blue-200 hover:bg-blue-100/80 text-[#315C9F]" },
          { key: "customer", label: "Customers", val: stats.cust, color: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100/80 text-emerald-700" },
          { key: "team", label: "Team Chats", val: stats.team, color: "bg-amber-50 border-amber-200 hover:bg-amber-100/80 text-amber-700" },
          { key: "ai", label: "AI Chats", val: stats.ai, color: "bg-indigo-50 border-indigo-200 hover:bg-indigo-100/80 text-indigo-700" },
          { key: "archived", label: "Archived", val: stats.archived, color: "bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-600" }
        ].map(card => (
          <button
            key={card.key}
            onClick={() => setFilterType(card.key)}
            className={`p-3.5 rounded-xl border text-left transition-all relative ${card.color} ${
              filterType === card.key ? "ring-2 ring-[#4A9BFF] scale-[1.02]" : ""
            } cursor-pointer flex flex-col justify-between`}
          >
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider leading-none text-slate-400">{card.label}</p>
              <p className="text-xl font-sans font-black mt-1">{card.val}</p>
            </div>
            {card.animate && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* CORE SPLIT WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[560px]">
        
        {/* LEFT PANEL - CONVERSATION LIST (4 Columns) */}
        <div className="lg:col-span-4 bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl p-4 flex flex-col gap-3 max-h-[640px] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-2">
            <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-[#315C9F]" /> Conversation List
            </h3>
            <span className="text-[9px] bg-[#C7E3FB] text-[#315C9F] font-mono px-2 py-0.5 rounded-md font-bold">
              {filteredConversations.length} Active
            </span>
          </div>

          <div className="space-y-2 flex-1">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs font-semibold">
                No matching conversations found.
              </div>
            ) : (
              filteredConversations.map(conv => {
                const isSelected = conv.id === activeConv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col gap-1.5 ${
                      isSelected
                        ? "bg-[#C7E3FB] border-[#4A9BFF] shadow-sm"
                        : "bg-[#F5FAFF] border-[#A9CDEE] hover:bg-[#EAF5FF]"
                    }`}
                  >
                    {/* Header line of conversation item */}
                    <div className="flex justify-between items-start gap-1">
                      <div className="flex items-center gap-1.5">
                        {/* Type indicator or Online bullet */}
                        {conv.onlineStatus === "Online" && (
                          <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" title="Online" />
                        )}
                        {conv.onlineStatus === "Away" && (
                          <span className="w-2 h-2 bg-amber-500 rounded-full shrink-0" title="Away" />
                        )}
                        {conv.onlineStatus === "Offline" && (
                          <span className="w-2 h-2 bg-slate-300 rounded-full shrink-0" title="Offline" />
                        )}
                        
                        <h4 className="text-xs font-extrabold text-slate-800 line-clamp-1 leading-tight">
                          {conv.title}
                        </h4>
                      </div>

                      <span className="text-[9px] text-slate-400 font-mono shrink-0">
                        {conv.lastMessageTime.split(' ')[1] || conv.lastMessageTime}
                      </span>
                    </div>

                    {/* Metadata indicators line */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[8.5px] uppercase font-bold text-slate-400">
                      <span className="bg-slate-200/60 text-slate-600 px-1.5 py-0.5 rounded">
                        {conv.type}
                      </span>

                      {conv.priority === "High" && (
                        <span className="bg-rose-50 text-rose-600 px-1 rounded border border-rose-100 flex items-center gap-0.5">
                          ⚠️ PRIORITY
                        </span>
                      )}

                      {conv.isPinned && (
                        <Pin className="w-2.5 h-2.5 text-[#4A9BFF] fill-current" />
                      )}

                      {conv.isMuted && (
                        <span className="text-slate-400">🔇 Muted</span>
                      )}

                      {conv.unreadCount > 0 && (
                        <span className="bg-red-500 text-white font-black px-1.5 py-0.2 rounded-full text-[8px] animate-pulse">
                          {conv.unreadCount} unread
                        </span>
                      )}
                    </div>

                    {/* Last message preview */}
                    <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                      <strong className="text-slate-700">{conv.lastMessageSender}:</strong> {conv.lastMessage}
                    </p>

                    {/* Attachment Indicators */}
                    {conv.messages.some(m => m.attachments && m.attachments.length > 0) && (
                      <div className="flex items-center gap-1 text-[9px] text-emerald-600 font-bold">
                        <Paperclip className="w-3 h-3 text-emerald-500" /> Linked Attachments
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANEL - ACTIVE CONVERSATION WINDOW (8 Columns, or split with Details Pane) */}
        <div className={`lg:col-span-${detailsPanelOpen ? "5" : "8"} bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl p-4 flex flex-col justify-between max-h-[640px]`}>
          
          {/* Conversation Header */}
          <div className="border-b border-[#A9CDEE] pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[#C7E3FB] border border-[#9EC8EF] rounded-xl text-xl select-none">
                {activeConv.type === "AI Conversation" ? "🤖" : activeConv.type === "Customer Chat" ? "🏢" : "💬"}
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider leading-none">
                  {activeConv.title}
                </h3>
                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 font-semibold">
                  <Users className="w-3 h-3" /> {activeConv.participants.join(", ")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setDetailsPanelOpen(!detailsPanelOpen)}
                className={`p-2 rounded-xl border text-xs font-bold transition-all ${
                  detailsPanelOpen 
                    ? "bg-[#C7E3FB] text-[#315C9F] border-[#4A9BFF]" 
                    : "bg-[#F5FAFF] text-slate-600 border-[#A9CDEE] hover:bg-[#C7E3FB]"
                }`}
                title="Toggle Conversation Details"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Related Workspace Links Alert Bar */}
          {(activeConv.customerName || activeConv.jobId || activeConv.estimateId || activeConv.routeId) && (
            <div className="bg-[#C7E3FB]/40 border-b border-[#A9CDEE]/60 p-2 flex flex-wrap items-center gap-3 text-[10px] font-sans text-slate-700">
              <span className="font-extrabold uppercase text-[9px] text-slate-400 tracking-wider">EVENT LINKS:</span>
              
              {activeConv.customerName && (
                <button
                  onClick={() => {
                    if (onNavigateToScreen) {
                      onNavigateToScreen("customers", { customerId: activeConv.customerId });
                    }
                  }}
                  className="bg-[#C7E3FB] hover:bg-[#BDDDF8] px-2 py-0.5 rounded border border-[#A9CDEE] text-[#1F3557] font-semibold flex items-center gap-0.5"
                >
                  🏢 Customer: {activeConv.customerName}
                </button>
              )}

              {activeConv.jobId && (
                <button
                  onClick={() => {
                    if (onNavigateToScreen) {
                      onNavigateToScreen("dispatch", {});
                    } else {
                      onOpenPlaceholder("Dispatch", "🚚");
                    }
                  }}
                  className="bg-[#C7E3FB] hover:bg-[#BDDDF8] px-2 py-0.5 rounded border border-[#A9CDEE] text-[#1F3557] font-semibold"
                >
                  🛠️ Job: {activeConv.jobId}
                </button>
              )}

              {activeConv.estimateId && (
                <button
                  onClick={() => {
                    if (onNavigateToScreen) {
                      onNavigateToScreen("estimates", {});
                    } else {
                      onOpenPlaceholder("Estimates", "📄");
                    }
                  }}
                  className="bg-[#C7E3FB] hover:bg-[#BDDDF8] px-2 py-0.5 rounded border border-[#A9CDEE] text-[#1F3557] font-semibold"
                >
                  📄 Est: {activeConv.estimateId}
                </button>
              )}

              {activeConv.routeId && (
                <button
                  onClick={() => {
                    if (onNavigateToScreen) {
                      onNavigateToScreen("routes", {});
                    } else {
                      onOpenPlaceholder("Routes", "🗺️");
                    }
                  }}
                  className="bg-[#C7E3FB] hover:bg-[#BDDDF8] px-2 py-0.5 rounded border border-[#A9CDEE] text-[#1F3557] font-semibold"
                >
                  🗺️ Route: {activeConv.routeId}
                </button>
              )}
            </div>
          )}

          {/* Messages Chronology stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50 rounded-xl my-3 max-h-[380px] flex flex-col">
            {activeConv.messages.map(msg => {
              const isMe = msg.sender === currentUserName;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[85%] text-left ${
                    isMe ? "ml-auto items-end" : "mr-auto items-start"
                  }`}
                >
                  {/* Sender Metadata */}
                  <span className="text-[9px] font-sans font-bold uppercase text-slate-400 mb-0.5 flex items-center gap-1">
                    {msg.sender} <span className="text-[8px] font-mono px-1 bg-slate-200 text-slate-500 rounded font-normal">{msg.senderRole}</span>
                  </span>

                  {/* Message Bubble Body */}
                  <div
                    className={`p-3 rounded-2xl text-xs leading-relaxed border shadow-xs ${
                      isMe
                        ? "bg-[#315C9F] text-white border-[#1F3557] rounded-tr-none"
                        : "bg-white text-slate-800 border-[#A9CDEE] rounded-tl-none"
                    }`}
                  >
                    {/* Message Text */}
                    <p className="whitespace-pre-line font-medium font-sans">{msg.content}</p>

                    {/* Rendering Attachments Bubbles */}
                    {msg.attachments && msg.attachments.map(att => (
                      <div
                        key={att.id}
                        className={`mt-2.5 p-2 rounded-xl border flex items-center gap-2 text-left ${
                          isMe 
                            ? "bg-[#1F3557]/65 border-[#4A9BFF] text-white" 
                            : "bg-[#E3F3FF] border-[#A9CDEE] text-slate-800"
                        }`}
                      >
                        {att.type === "Photo" && (
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase font-black tracking-wider text-amber-500 flex items-center gap-1">📸 PHOTO</span>
                            <img
                              src={att.meta?.url || "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=300"}
                              alt={att.name}
                              referrerPolicy="no-referrer"
                              className="rounded-lg w-full max-w-[200px] h-24 object-cover border border-[#A9CDEE]"
                            />
                            <p className="text-[9px] opacity-70 mt-0.5">{att.name}</p>
                          </div>
                        )}

                        {att.type === "GPS Location" && (
                          <div className="text-[10.5px]">
                            <span className="text-[9px] uppercase font-bold text-sky-500 flex items-center gap-1">📍 GPS COORD</span>
                            <p className="font-extrabold">{att.name}</p>
                            <p className="text-[9px] opacity-80">{att.meta?.address}</p>
                          </div>
                        )}

                        {att.type === "Inventory" && (
                          <div className="text-[10.5px]">
                            <span className="text-[9px] uppercase font-bold text-emerald-500 flex items-center gap-1">📦 INVENTORY PART</span>
                            <p className="font-extrabold">{att.name}</p>
                            <p className="text-[9px] opacity-80">SKU: {att.meta?.sku} • Count: {att.meta?.qty}</p>
                          </div>
                        )}

                        {att.type === "Estimate" && (
                          <div className="text-[10.5px]">
                            <span className="text-[9px] uppercase font-bold text-indigo-500">📄 SYSTEM ESTIMATE</span>
                            <p className="font-extrabold">{att.name}</p>
                            <p className="text-[9px] opacity-80">Value: {att.meta?.amount}</p>
                          </div>
                        )}

                        {att.type === "Invoice" && (
                          <div className="text-[10.5px]">
                            <span className="text-[9px] uppercase font-bold text-teal-500">💳 INVOICE STATEMENT</span>
                            <p className="font-extrabold">{att.name}</p>
                            <p className="text-[9px] opacity-80">Amount: {att.meta?.amount} • Status: {att.meta?.status}</p>
                          </div>
                        )}

                        {att.type !== "Photo" && att.type !== "GPS Location" && att.type !== "Inventory" && att.type !== "Estimate" && att.type !== "Invoice" && (
                          <div className="flex items-center gap-2 text-xs">
                            <FileText className="w-5 h-5 text-[#315C9F]" />
                            <div>
                              <p className="font-bold">{att.name}</p>
                              <p className="text-[9px] opacity-80">{att.size || "N/A"} • {att.type}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[8px] text-slate-400 mt-1 font-mono">
                    {msg.timestamp}
                  </span>
                </div>
              );
            })}
          </div>

          {/* DRAFT ATTACHMENTS PREVIEW LINE */}
          {draftAttachments.length > 0 && (
            <div className="p-2 bg-[#C7E3FB] border border-[#9EC8EF] rounded-xl flex flex-wrap gap-2 mb-2">
              <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 flex items-center w-full">Draft Attachments:</span>
              {draftAttachments.map((att, i) => (
                <div key={i} className="flex items-center gap-1 text-[10px] bg-white border border-[#9EC8EF] px-2 py-1 rounded-lg">
                  <span className="font-semibold text-slate-700">{att.name}</span>
                  <span className="text-[8px] bg-slate-100 text-slate-400 px-1 rounded">{att.type}</span>
                  <button
                    onClick={() => setDraftAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-rose-500 hover:text-rose-700 font-bold ml-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* MESSAGE INPUT SECTION WITH INTEGRATED ATTACHMENT POPUPS */}
          <div className="space-y-2">
            
            {/* Attachment popover selector selectors */}
            <div className="flex flex-wrap items-center gap-1 bg-[#C7E3FB]/40 p-1.5 rounded-xl border border-[#A9CDEE]/50">
              <span className="text-[9px] uppercase font-black text-slate-400 mr-2">Attach:</span>
              
              <button
                onClick={() => setActivePicker(activePicker === "customer" ? null : "customer")}
                className="px-2 py-1 bg-white hover:bg-[#F5FAFF] border border-[#A9CDEE] text-[#1F3557] rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                🏢 Customer
              </button>

              <button
                onClick={() => setActivePicker(activePicker === "job" ? null : "job")}
                className="px-2 py-1 bg-white hover:bg-[#F5FAFF] border border-[#A9CDEE] text-[#1F3557] rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                🛠️ Job
              </button>

              <button
                onClick={() => setActivePicker(activePicker === "estimate" ? null : "estimate")}
                className="px-2 py-1 bg-white hover:bg-[#F5FAFF] border border-[#A9CDEE] text-[#1F3557] rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                📄 Estimate
              </button>

              <button
                onClick={() => setActivePicker(activePicker === "invoice" ? null : "invoice")}
                className="px-2 py-1 bg-white hover:bg-[#F5FAFF] border border-[#A9CDEE] text-[#1F3557] rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                💳 Invoice
              </button>

              <button
                onClick={() => setActivePicker(activePicker === "inventory" ? null : "inventory")}
                className="px-2 py-1 bg-white hover:bg-[#F5FAFF] border border-[#A9CDEE] text-[#1F3557] rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                📦 Inventory
              </button>

              <button
                onClick={() => setActivePicker(activePicker === "location" ? null : "location")}
                className="px-2 py-1 bg-white hover:bg-[#F5FAFF] border border-[#A9CDEE] text-[#1F3557] rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                📍 GPS Location
              </button>
            </div>

            {/* DYNAMIC ATTACHMENT PICKERS OVERLAY PANEL */}
            {activePicker && (
              <div className="p-3 bg-white border border-[#4A9BFF] rounded-xl shadow-md space-y-2 animate-fade-in text-[11px]">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <span className="font-extrabold uppercase text-slate-500 tracking-wider">Select {activePicker} to attach</span>
                  <button onClick={() => setActivePicker(null)} className="text-slate-400 font-bold hover:text-slate-600">✕</button>
                </div>

                {activePicker === "customer" && (
                  <div className="grid grid-cols-2 gap-1.5 max-h-[120px] overflow-y-auto">
                    {customersList.map(c => (
                      <button
                        key={c.id}
                        onClick={() => attachItem("Document", `Profile_${c.company}.pdf`, "220 KB", { customerId: c.id })}
                        className="p-1.5 bg-[#F5FAFF] hover:bg-[#E3F3FF] rounded border border-[#A9CDEE] text-left truncate"
                      >
                        🏢 {c.company} ({c.contact})
                      </button>
                    ))}
                  </div>
                )}

                {activePicker === "job" && (
                  <div className="grid grid-cols-2 gap-1.5 max-h-[120px] overflow-y-auto">
                    {mockJobs.map(j => (
                      <button
                        key={j.id}
                        onClick={() => attachItem("Document", `JobForm_${j.id}.pdf`, "180 KB", { jobId: j.id })}
                        className="p-1.5 bg-[#F5FAFF] hover:bg-[#E3F3FF] rounded border border-[#A9CDEE] text-left truncate"
                      >
                        🛠️ {j.id} - {j.name}
                      </button>
                    ))}
                  </div>
                )}

                {activePicker === "estimate" && (
                  <div className="grid grid-cols-1 gap-1 max-h-[120px] overflow-y-auto">
                    {mockEstimates.map(e => (
                      <button
                        key={e.id}
                        onClick={() => attachItem("Estimate", `Estimate_${e.id}.pdf`, "310 KB", { amount: e.amount, id: e.id })}
                        className="p-1.5 bg-[#F5FAFF] hover:bg-[#E3F3FF] rounded border border-[#A9CDEE] text-left flex justify-between"
                      >
                        <span>📄 {e.id} - {e.name}</span>
                        <strong className="text-indigo-600">{e.amount}</strong>
                      </button>
                    ))}
                  </div>
                )}

                {activePicker === "invoice" && (
                  <div className="grid grid-cols-1 gap-1 max-h-[120px] overflow-y-auto">
                    {mockInvoices.map(i => (
                      <button
                        key={i.id}
                        onClick={() => attachItem("Invoice", `Invoice_${i.id}.pdf`, "290 KB", { amount: i.amount, id: i.id, status: i.status })}
                        className="p-1.5 bg-[#F5FAFF] hover:bg-[#E3F3FF] rounded border border-[#A9CDEE] text-left flex justify-between"
                      >
                        <span>💳 {i.id} - {i.name}</span>
                        <strong className="text-emerald-600">{i.amount} ({i.status})</strong>
                      </button>
                    ))}
                  </div>
                )}

                {activePicker === "inventory" && (
                  <div className="grid grid-cols-2 gap-1.5 max-h-[120px] overflow-y-auto">
                    {[
                      { sku: "PVC-C-002", name: "2-inch PVC Coupler", qty: 4 },
                      { sku: "ABS-P-010", name: "3-inch ABS Drain Pipe", qty: 24 },
                      { sku: "BRS-V-005", name: "Brass Shut-off Valve", qty: 15 }
                    ].map(inv => (
                      <button
                        key={inv.sku}
                        onClick={() => attachItem("Inventory", inv.name, "N/A", { sku: inv.sku, qty: inv.qty })}
                        className="p-1.5 bg-[#F5FAFF] hover:bg-[#E3F3FF] rounded border border-[#A9CDEE] text-left text-[10px]"
                      >
                        📦 {inv.name} (Qty: {inv.qty})
                      </button>
                    ))}
                  </div>
                )}

                {activePicker === "location" && (
                  <div className="grid grid-cols-1 gap-1 max-h-[120px] overflow-y-auto">
                    {mockLocations.map((loc, idx) => (
                      <button
                        key={idx}
                        onClick={() => attachItem("GPS Location", loc.name, "N/A", { address: loc.address, lat: loc.lat, lng: loc.lng })}
                        className="p-1.5 bg-[#F5FAFF] hover:bg-[#E3F3FF] rounded border border-[#A9CDEE] text-left text-[10px]"
                      >
                        📍 <strong>{loc.name}</strong> • {loc.address}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* MESSAGE TEXT ENTRY BOX & ACTION BUTTONS */}
            <div className="flex gap-2 items-end">
              
              {/* Media tools shortcuts */}
              <div className="flex gap-1 shrink-0 bg-white p-1 rounded-xl border border-[#A9CDEE] h-10 items-center">
                <input
                  type="file"
                  ref={fileAttachInputRef}
                  onChange={(e) => handleRealFileAttach(e, "PDF")}
                  className="hidden"
                  style={{ display: "none" }}
                />
                <input
                  type="file"
                  ref={photoAttachInputRef}
                  onChange={(e) => handleRealFileAttach(e, "Photo")}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  style={{ display: "none" }}
                />
                <button
                  onClick={() => fileAttachInputRef.current?.click()}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500"
                  title="Attach File"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  onClick={() => photoAttachInputRef.current?.click()}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500"
                  title="Attach Camera Photo"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <button
                  disabled
                  className="p-1 rounded text-slate-300 cursor-not-allowed"
                  title="Voice notes aren't available yet"
                >
                  <Mic className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setInputText(prev => prev + " 😊")}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500"
                  title="Insert Emoji"
                >
                  <Smile className="w-4 h-4" />
                </button>
              </div>

              {/* Message Input Box */}
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type your secure message or attach corporate documents..."
                rows={1}
                className="flex-1 text-xs bg-white border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A9BFF] font-medium max-h-24 font-sans text-slate-700"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />

              {/* Send Button */}
              <button
                onClick={handleSendMessage}
                className="p-3 bg-[#4A9BFF] hover:bg-[#3583E6] text-white rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* DETAILS PANEL - RIGHT SIDEBAR (3 Columns, toggleable) */}
        {detailsPanelOpen && (
          <div className="lg:col-span-3 bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl p-4 flex flex-col justify-between max-h-[640px] overflow-y-auto">
            
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-2">
                <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">
                  Conversation Details
                </h3>
                <span className="text-[8px] bg-indigo-100 text-indigo-700 font-bold uppercase px-1.5 py-0.5 rounded">
                  Index Linked
                </span>
              </div>

              {/* Participants */}
              <div className="space-y-1.5">
                <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Participants Node</p>
                <div className="space-y-1">
                  {activeConv.participants.map((p, idx) => {
                    const matchRole = mockStaff.find(s => s.name === p)?.role || "Technical Node";
                    return (
                      <div key={idx} className="flex items-center justify-between bg-white/70 p-1.5 rounded-lg border border-[#A9CDEE]/40">
                        <span className="text-[11px] font-bold text-slate-700">{p}</span>
                        <span className="text-[8px] uppercase font-mono px-1 bg-[#C7E3FB] text-[#315C9F] rounded font-bold">
                          {matchRole}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Related metadata mapping */}
              <div className="space-y-2">
                <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">EVENT ENGINE LINKS</p>
                
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">Customer:</span>
                    <strong className="text-slate-700">{activeConv.customerName || "None"}</strong>
                  </div>

                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">Job ID:</span>
                    <strong className="text-slate-700">{activeConv.jobId || "None"}</strong>
                  </div>

                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">Estimate:</span>
                    <strong className="text-slate-700">{activeConv.estimateId || "None"}</strong>
                  </div>

                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">Dispatch Route:</span>
                    <strong className="text-slate-700">{activeConv.routeId || "None"}</strong>
                  </div>

                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">Linked Revenue:</span>
                    <strong className="text-emerald-700">
                      {activeConv.revenueAmount ? `$${activeConv.revenueAmount.toLocaleString()}` : "None"}
                    </strong>
                  </div>

                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">Date Created:</span>
                    <span className="text-slate-500 font-mono">{activeConv.createdDate}</span>
                  </div>
                </div>
              </div>

              {/* Linked Documents list */}
              <div className="space-y-1.5">
                <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Related Documents Hub</p>
                <div className="space-y-1">
                  {documents.filter(d => d.customer === activeConv.customerName || d.job === activeConv.jobId).length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic font-medium">No documents linked to this stream.</p>
                  ) : (
                    documents.filter(d => d.customer === activeConv.customerName || d.job === activeConv.jobId).map(doc => (
                      <div key={doc.id} className="p-1.5 bg-white/75 border border-[#A9CDEE] rounded-xl flex items-center justify-between text-[10.5px]">
                        <span className="truncate max-w-[150px] font-bold text-slate-700" title={doc.name}>{doc.name}</span>
                        <button
                          onClick={() => {
                            if (onNavigateToScreen) {
                              onNavigateToScreen("documents", {});
                            } else {
                              onOpenPlaceholder("Documents", "📂");
                            }
                          }}
                          className="text-[#315C9F] hover:underline"
                        >
                          View
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ACTION FOOTER BUTTONS */}
            <div className="pt-4 border-t border-[#A9CDEE] space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => toggleMute(activeConv.id)}
                  className="py-1.5 bg-white hover:bg-slate-100 border border-[#A9CDEE] rounded-xl text-[10.5px] font-bold text-slate-700 cursor-pointer text-center"
                >
                  {activeConv.isMuted ? "🔇 Unmute" : "🔇 Mute"}
                </button>

                <button
                  onClick={() => togglePin(activeConv.id)}
                  className="py-1.5 bg-white hover:bg-slate-100 border border-[#A9CDEE] rounded-xl text-[10.5px] font-bold text-slate-700 cursor-pointer text-center"
                >
                  {activeConv.isPinned ? "📌 Unpin" : "📌 Pin"}
                </button>
              </div>

              <button
                onClick={() => toggleArchive(activeConv.id)}
                className="w-full py-1.5 bg-[#C7E3FB] hover:bg-[#BDDDF8] border border-[#A9CDEE] text-[#1F3557] rounded-xl text-[10.5px] font-bold uppercase cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Archive className="w-3.5 h-3.5" /> {activeConv.isArchived ? "Restore Stream" : "Archive Stream"}
              </button>

              {canDeleteMessages && (
                <button
                  onClick={() => deleteConversation(activeConv.id)}
                  className="w-full py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-xl text-[10.5px] font-bold uppercase cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Stream
                </button>
              )}
            </div>

          </div>
        )}

      </div>

      {/* MODAL 1: NEW MESSAGE SECURE DIALOG */}
      {isNewMsgModalOpen && (
        <div 
          onClick={() => setIsNewMsgModalOpen(false)}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl border border-[#9EC8EF] shadow-2xl p-6 w-full max-w-md text-left space-y-4 animate-scale-up cursor-default"
          >
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#315C9F]" /> Start Secure Chat
              </h4>
              <button 
                onClick={() => setIsNewMsgModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1 cursor-pointer transition-colors"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Chat Title</label>
                <input
                  type="text"
                  placeholder="e.g., Pete Rogers (Service Truck #1)"
                  value={newConvTitle}
                  onChange={(e) => setNewConvTitle(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Recipient / Staff Node</label>
                <select
                  value={newConvRecipient}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewConvRecipient(value);
                    const customer = value.startsWith("customer:") ? customersList.find(c => c.id === value.slice("customer:".length)) : undefined;
                    const name = customer ? customer.contact || customer.company : value.replace(/^staff:/, "");
                    setNewConvTitle(name ? `Chat with ${name}` : "");
                  }}
                  className="w-full text-xs bg-white text-[#1F3557] border border-[#A9CDEE] rounded-xl px-2.5 py-2.5 cursor-pointer focus:outline-none"
                >
                  <option className="bg-white text-[#1F3557]" value="">Select customer or team member...</option>
                  <optgroup label="Customers">{customersList.map(c => <option key={c.id} value={`customer:${c.id}`}>{c.contact || c.company}{c.contact && c.company ? ` — ${c.company}` : ""}</option>)}</optgroup>
                  <optgroup label="Team">{mockStaff.filter(s => s.name !== currentUserName).map(s => <option key={s.name} value={`staff:${s.name}`}>{s.name} — {s.role}</option>)}</optgroup>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Priority Signal</label>
                <select
                  value={newConvPriority}
                  onChange={(e: any) => setNewConvPriority(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-[#A9CDEE] rounded-xl px-2.5 py-2.5 cursor-pointer focus:outline-none"
                >
                  <option value="Normal">Normal</option>
                  <option value="High">⚠️ High Priority</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Related job<select value={newConvJobId} onChange={e => setNewConvJobId(e.target.value)} className="mt-1 w-full rounded-xl border border-[#A9CDEE] bg-white px-2.5 py-2.5 text-xs text-[#1F3557]"><option value="">No job link</option>{schedulingEvents.filter(job => job.eventType === "Job").map(job => <option key={job.id} value={job.id}>{job.customer} · {job.jobNumber || job.id}</option>)}</select></label>
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Related estimate<select value={newConvEstimateId} onChange={e => setNewConvEstimateId(e.target.value)} className="mt-1 w-full rounded-xl border border-[#A9CDEE] bg-white px-2.5 py-2.5 text-xs text-[#1F3557]"><option value="">No estimate link</option>{estimates.map(estimate => <option key={estimate.id} value={estimate.id}>{estimate.customerName} · {estimate.number}</option>)}</select></label>
              </div>
            </div>

            <button
              onClick={() => handleCreateConversation(false)}
              className="w-full py-2.5 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-bold rounded-xl text-xs uppercase"
            >
              Start Chat Session
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: NEW GROUP CHAT CONFIGURE DIALOG */}
      {isNewGroupModalOpen && (
        <div 
          onClick={() => setIsNewGroupModalOpen(false)}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl border border-[#9EC8EF] shadow-2xl p-6 w-full max-w-md text-left space-y-4 animate-scale-up cursor-default"
          >
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#315C9F]" /> Configure Team Group Chat
              </h4>
              <button 
                onClick={() => setIsNewGroupModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1 cursor-pointer transition-colors"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Group Channel Name</label>
                <input
                  type="text"
                  placeholder="e.g., Seattle Excavation Crew"
                  value={newConvTitle}
                  onChange={(e) => setNewConvTitle(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Participants (Comma Separated)</label>
                <input
                  type="text"
                  placeholder="Pete Rogers, Dave Miller, Theresa W."
                  value={newConvRecipient}
                  onChange={(e) => setNewConvRecipient(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Priority Status</label>
                <select
                  value={newConvPriority}
                  onChange={(e: any) => setNewConvPriority(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-[#A9CDEE] rounded-xl px-2.5 py-2.5 cursor-pointer focus:outline-none"
                >
                  <option value="Normal">Normal</option>
                  <option value="High">⚠️ High Priority Channel</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => handleCreateConversation(true)}
              className="w-full py-2.5 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-bold rounded-xl text-xs uppercase"
            >
              Establish Group Node
            </button>
          </div>
        </div>
      )}

      {/* MODAL 3: ADVANCED FILTERS CONFIGURATION */}
      {showFiltersModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#9EC8EF] shadow-2xl p-6 w-full max-w-md text-left space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-[#315C9F]" /> Workspace Advanced Filters
              </h4>
              <button onClick={() => setShowFiltersModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] text-slate-400 font-medium">Select a direct channel parameter to isolate operational chats.</p>
              
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "all", label: "All Chats" },
                  { key: "unread", label: "Unread Signal" },
                  { key: "direct", label: "Direct Message Only" },
                  { key: "customer", label: "Customer Chat Only" },
                  { key: "team", label: "Team / Crew Chat" },
                  { key: "ai", label: "AI Conversations" },
                  { key: "flagged", label: "Starred / Flagged" },
                  { key: "high_priority", label: "⚠️ High Priority Status" }
                ].map(item => (
                  <button
                    key={item.key}
                    onClick={() => {
                      setFilterType(item.key);
                      setShowFiltersModal(false);
                      triggerRealTimeNotification(`Applied conversation filter: ${item.label}`);
                    }}
                    className={`p-2.5 text-xs font-bold rounded-xl border text-left transition-all ${
                      filterType === item.key
                        ? "bg-[#C7E3FB] border-[#4A9BFF] text-[#1F3557]"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowFiltersModal(false)}
              className="w-full py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-bold rounded-xl text-xs uppercase"
            >
              Close Filter Config
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: SNAPSHOT AI AUTOMATED REAL-TIME SCANNER */}
      {isSnapshotAiOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-[#EAF5FF] rounded-3xl border border-[#9EC8EF] shadow-2xl p-6 w-full max-w-xl text-left space-y-5 animate-scale-up">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-600 animate-pulse" />
                <div>
                  <h4 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">
                    Snapshot AI Scanner
                  </h4>
                  <p className="text-[10px] text-slate-400 font-semibold">Read text from images and organize it automatically</p>
                </div>
              </div>
              <button onClick={() => setIsSnapshotAiOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            {scanningStatus === "idle" && (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed font-sans font-semibold">
                  Scan physical business artifacts to translate invoices, parts lists, receipts, and whiteboard blueprints immediately into secure digital structures:
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "Receipts", label: "Receipts & Expense Slips", icon: "🧾" },
                    { key: "Contracts", label: "Signed Service Agreements", icon: "🖋️" },
                    { key: "Equipment", label: "Equipment Specifications", icon: "🛠️" },
                    { key: "Inventory", label: "Warehouse Inventory Barcode", icon: "📦" },
                    { key: "Whiteboards", label: "Whiteboard Schematics", icon: "🗺️" },
                    { key: "Contracts", label: "Contracts / Legal Packets", icon: "📄" }
                  ].map(scanType => (
                    <button
                      key={scanType.key}
                      onClick={() => triggerSnapshotScan(scanType.key)}
                      className="p-4 bg-white hover:bg-[#C7E3FB] border border-[#A9CDEE] rounded-2xl text-left transition-all hover:scale-[1.01] flex items-center gap-3 cursor-pointer group"
                    >
                      <span className="text-2xl">{scanType.icon}</span>
                      <div>
                        <p className="text-xs font-black text-slate-800 uppercase tracking-wider leading-none group-hover:text-[#315C9F]">
                          {scanType.key}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1 font-sans">{scanType.label}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {scanningStatus === "capturing" && (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center animate-ping">
                  <Camera className="w-8 h-8" />
                </div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Triggering Camera Optical Lens...</h4>
                <p className="text-[11px] text-slate-500 max-w-xs font-medium">Please verify document alignment within the high-contrast bounding box.</p>
              </div>
            )}

            {scanningStatus === "analyzing" && (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                <div className="w-12 h-12 rounded-full border-4 border-[#315C9F] border-t-transparent animate-spin" />
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Owner's AI OCR Parsing...</h4>
                <p className="text-[11px] text-slate-500 max-w-xs font-medium">Extracting metadata tables, dates, line-item totals, and client names.</p>
              </div>
            )}

            {scanningStatus === "extracted" && (
              <div className="space-y-4">
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <h5 className="text-xs font-black text-emerald-800 uppercase tracking-wider">Extraction Completed</h5>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                      Successfully translated artifact <strong>{scannedDoc?.name}</strong> with high confidence index.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">AI Auto-Indexing Suggestions:</p>
                  
                  <div className="space-y-2">
                    {extractedSuggestions.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-4 text-center">All suggestions reviewed and applied.</p>
                    ) : (
                      extractedSuggestions.map((sugg, idx) => (
                        <div key={idx} className="bg-white border border-[#A9CDEE] p-3 rounded-xl flex items-center justify-between gap-4">
                          <div>
                            <span className="text-[9px] uppercase font-black px-1.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded">
                              {sugg.action}
                            </span>
                            <p className="text-xs font-bold text-slate-800 mt-1">Target: {sugg.target}</p>
                            <p className="text-[10px] text-slate-500 font-medium leading-normal mt-0.5">{sugg.reason}</p>
                          </div>

                          <button
                            onClick={() => handleAcceptSuggestion(sugg)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            Approve Action
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setScanningStatus("idle");
                      setScannedDoc(null);
                    }}
                    className="flex-1 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl"
                  >
                    Scan Another Document
                  </button>
                  <button
                    onClick={() => setIsSnapshotAiOpen(false)}
                    className="flex-1 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white text-xs font-bold rounded-xl"
                  >
                    Close Scanner
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* MODAL 5: AI COMPOSE ADVANCED REWRITE DIALOG */}
      {isAiComposeOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#9EC8EF] shadow-2xl p-6 w-full max-w-lg text-left space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="text-xs font-extrabold text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" /> Owner's AI Writer
              </h4>
              <button onClick={() => setIsAiComposeOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-medium">
                Draft a raw message, or leave blank to auto-generate updates based on recent events:
              </p>

              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type raw draft or keyword signals e.g. leak scheduled tomorrow..."
                rows={3}
                className="w-full text-xs bg-slate-50 border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none"
              />

              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">AI Transformation Signals:</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { action: "Rewrite", label: "✨ Professional Expand", desc: "Turn raw bullets into stellar updates" },
                    { action: "Summarize", label: "📝 Executive Summary", desc: "Shorten message to key bullets" },
                    { action: "Translate", label: "🌐 Translate to Spanish", desc: "Convert message instantly" },
                    { action: "Grammar", label: "✓ Correct Grammar", desc: "Audit syntax and spelling" },
                    { action: "Professional", label: "💼 Professional Tone", desc: "Establish business courtesy" },
                    { action: "Suggest Reply", label: "💡 Auto Suggest Reply", desc: "Respond based on context" },
                    { action: "Follow-up", label: "📞 Client Follow-up", desc: "Generate post-service checks" }
                  ].map((act, i) => (
                    <button
                      key={i}
                      onClick={() => handleAiAction(act.action)}
                      className="p-2 bg-slate-50 hover:bg-[#C7E3FB] border border-[#A9CDEE] rounded-xl text-left transition-colors"
                    >
                      <p className="text-[10.5px] font-bold text-[#1F3557]">{act.label}</p>
                      <p className="text-[9px] text-slate-400 mt-0.5 leading-none">{act.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CORE FRAMEWORK CONNECTIONS SUMMARY */}
      <div className="p-4 bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl space-y-3.5 text-left">
        <div>
          <h4 className="text-xs font-black uppercase text-[#342D7E] tracking-wider">
            Messages Connections
          </h4>
          <p className="text-[10.5px] text-slate-500 leading-normal font-medium mt-0.5">
            Messages stay connected with the people and work across your business.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-[10px] font-bold text-emerald-600">
          <span className="flex items-center gap-1">✓ Dashboard Sync</span>
          <span className="flex items-center gap-1">✓ Revenue Feed</span>
          <span className="flex items-center gap-1">✓ Customer CRM</span>
          <span className="flex items-center gap-1">✓ Leads Tracker</span>
          <span className="flex items-center gap-1">✓ Estimates Hub</span>
          <span className="flex items-center gap-1">✓ Dispatch Board</span>
          <span className="flex items-center gap-1">✓ Routes Map</span>
          <span className="flex items-center gap-1">✓ Jobs Vault</span>
          <span className="flex items-center gap-1">✓ Inventory</span>
          <span className="flex items-center gap-1">✓ Documents</span>
          <span className="flex items-center gap-1 text-[#315C9F]">✓ Roster (Active)</span>
          <span className="flex items-center gap-1 text-indigo-600">✓ AI Companion</span>
        </div>
      </div>

    </div>
  );
};
