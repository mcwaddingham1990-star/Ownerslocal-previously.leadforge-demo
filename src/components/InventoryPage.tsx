import React, { useState, useMemo, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { hasPermission } from "../types/permissions";
import { downscaleImageToBase64 } from "../lib/imageCompression";
import { buildScanSnapshotDocument, SNAPSHOT_PHOTO_MAX_BASE64_LENGTH } from "../lib/scanSnapshotDocument";
import {
  Search,
  Plus,
  Camera,
  Filter,
  Check,
  X,
  Trash2,
  Edit,
  RefreshCw,
  Download,
  Upload,
  History,
  Eye,
  Star,
  Info,
  Layers,
  Hammer,
  Briefcase,
  DollarSign,
  Activity,
  FileText,
  QrCode,
  CheckSquare,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ShoppingCart,
  ArrowRight,
  Package,
  Wrench,
  Flame,
  Truck,
  Droplet,
  Grid,
  FileSpreadsheet,
  Settings,
  Shield,
  Clock,
  MapPin,
  Barcode
} from "lucide-react";
import { SchedulingEvent } from "./SchedulingPage";
import { postTransactionEntry } from "../lib/accountingEngine";

export type { ScannedLineItem, ScannedReceipt } from "../types/scannedReceipt";
import type { ScannedLineItem, ScannedReceipt } from "../types/scannedReceipt";

export type { InventoryItem, PurchaseRecord } from "../types/domain";
import type { InventoryItem, PurchaseRecord, Transaction } from "../types/domain";

export interface InventoryPageProps {}

const INITIAL_PURCHASES: PurchaseRecord[] = [];

export const INITIAL_INVENTORY: InventoryItem[] = [];

const INVENTORY_CATEGORIES = [
  { name: "Materials", icon: "🧱" },
  { name: "Tools", icon: "🔧" },
  { name: "Equipment", icon: "⚙️" },
  { name: "Electrical", icon: "⚡" },
  { name: "Plumbing", icon: "💧" },
  { name: "Concrete", icon: "🪨" },
  { name: "Lumber", icon: "🪵" },
  { name: "Tile", icon: "◼️" },
  { name: "Drywall", icon: "⬜" },
  { name: "Fasteners", icon: "🔩" },
  { name: "Paint", icon: "🎨" },
  { name: "Roofing", icon: "🏠" },
  { name: "HVAC", icon: "🔥" },
  { name: "Landscaping", icon: "🌱" },
  { name: "Safety", icon: "🛡️" },
  { name: "Office Supplies", icon: "📎" },
  { name: "Cleaning", icon: "🧹" },
  { name: "Vehicles", icon: "🚚" },
  { name: "Fuel", icon: "⛽" }
] as const;

const MATERIAL_CATEGORIES = [
  "Materials",
  "Lumber",
  "Concrete",
  "Tile",
  "Fasteners",
  "Electrical",
  "Plumbing",
  "Drywall",
  "Paint",
  "Roofing",
  "HVAC",
  "Landscaping",
  "Safety",
  "Cleaning"
] as const;

const MATERIAL_CATEGORY_SET = new Set<string>(MATERIAL_CATEGORIES);
const INVENTORY_NAVIGATION_CATEGORIES = INVENTORY_CATEGORIES.filter(category =>
  !MATERIAL_CATEGORY_SET.has(category.name) || category.name === "Materials"
);

const DEFAULT_CATEGORY_SHORTCUTS = ["Materials", "Tools", "Equipment", "Office Supplies", "Fuel"];
const CATEGORY_SHORTCUTS_STORAGE_KEY = "owners-inventory-category-shortcuts";

// These catalog categories are consumable job materials. Previously only the
// literal "Materials" category triggered the expense prompt, so lumber,
// concrete, electrical supplies, etc. could be added without ever reducing
// company cash.
const MATERIAL_EXPENSE_CATEGORIES = MATERIAL_CATEGORY_SET;

export const TimeClockPage: React.FC = () => null; // Placeholder to avoid compilation issues if imported directly
export const TimeClockPageProps: any = null;

export const InventoryPage: React.FC<InventoryPageProps> = () => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const {
    schedulingEvents: events,
    setSchedulingEvents: setEvents,
    inventoryList: propsInventoryList,
    setInventoryList: propsSetInventoryList,
    transactions,
    setTransactions,
    setJournalEntries,
    saveTransaction,
    setDocuments
  } = useDomainData();
  const {
    openPlaceholderPage: onOpenPlaceholder,
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    navigateToScreen: onNavigateToScreen,
    logOperationalEvent
  } = useNavTelemetry();
  // State variables — real, Firestore-backed inventory from context.
  const inventoryList = propsInventoryList;
  const setInventoryList = propsSetInventoryList;

  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTabFilter, setActiveTabFilter] = useState<string>("all"); // "all", "low_stock", "out_of_stock", "favorites", "recently_added"
  const [activeFilterDrawer, setActiveFilterDrawer] = useState(false);
  const [filterWarehouse, setFilterWarehouse] = useState("all");
  const [filterVendor, setFilterVendor] = useState("all");
  const [activeSummaryCard, setActiveSummaryCard] = useState<string | null>(null);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const inventoryListRef = useRef<HTMLDivElement>(null);
  const [addedCategoryShortcuts, setAddedCategoryShortcuts] = useState<string[]>(() => {
    try {
      const saved = window.localStorage.getItem(CATEGORY_SHORTCUTS_STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.filter((name): name is string =>
            typeof name === "string" &&
            !DEFAULT_CATEGORY_SHORTCUTS.includes(name) &&
            INVENTORY_CATEGORIES.some(category => category.name === name)
          )
        : [];
    } catch {
      return [];
    }
  });

  // Popup Modals
  const [isAddPopupOpen, setIsAddPopupOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDetailsPopupOpen, setIsDetailsPopupOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);
  const [reorderModalOpen, setReorderModalOpen] = useState(false);
  const [reorderCandidates, setReorderCandidates] = useState<InventoryItem[]>([]);

  // Snapshot AI Camera — real OCR via Gemini vision (POST /api/ai/scan-receipt), not simulated.
  const [isSnapshotAIModalOpen, setIsSnapshotAIModalOpen] = useState(false);
  const [snapshotStage, setSnapshotStage] = useState<"camera" | "processing" | "review">("camera");
  const [aiSuggestions, setAiSuggestions] = useState<ScannedReceipt | null>(null);
  // Per-item "add to inventory" checkbox, indexed to aiSuggestions.items. All checked by default.
  const [selectedScanItems, setSelectedScanItems] = useState<boolean[]>([]);
  // Whether to also post the receipt's total as a Materials expense -- separate from which
  // items get tracked into inventory, since the money was spent either way.
  const [logScanExpense, setLogScanExpense] = useState(true);
  const [ocrError, setOcrError] = useState<string | null>(null);
  // The downscaled photo behind the current scan, kept around so it can be
  // filed into Documents > Snapshots once the user actually confirms -- not
  // saved for a scan that gets canceled or retaken.
  const [scannedPhoto, setScannedPhoto] = useState<{ base64: string; mimeType: string } | null>(null);

  // Barcode / QR Scanner Simulator Modal
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [scannerType, setScannerType] = useState<"barcode" | "qr">("barcode");
  const [scanInputCode, setScanInputCode] = useState("");

  // Import / Export states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState("");

  // Quick Action State inside details
  const [isQuickActionModalOpen, setIsQuickActionModalOpen] = useState(false);
  const [quickActionType, setQuickActionType] = useState<string>("Receive"); // Receive, Remove, Transfer, Correct, Waste, Damage, Reserve, AssignJob, AssignVehicle, AssignEmployee
  const [quickActionQty, setQuickActionQty] = useState(1);
  const [quickActionNotes, setQuickActionNotes] = useState("");
  const [quickActionTarget, setQuickActionTarget] = useState("");

  // Add Item / Edit Item Form State
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("Materials");
  const [formVendor, setFormVendor] = useState("");
  const [formManufacturer, setFormManufacturer] = useState("");
  const [formSku, setFormSku] = useState("");
  const [formBarcode, setFormBarcode] = useState("");
  const [formQrCode, setFormQrCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formQuantity, setFormQuantity] = useState(0);
  const [formMinQty, setFormMinQty] = useState(5);
  const [formMaxQty, setFormMaxQty] = useState(100);
  const [formLocation, setFormLocation] = useState("Warehouse A");
  const [formUnitCost, setFormUnitCost] = useState(0);
  const [formSellingPrice, setFormSellingPrice] = useState(0);
  const [formNotes, setFormNotes] = useState("");
  const [formPhoto, setFormPhoto] = useState("📦");
  const [formIsFavorite, setFormIsFavorite] = useState(false);
  const [formLogExpense, setFormLogExpense] = useState(false);
  const [formCustomFields, setFormCustomFields] = useState<Array<{ key: string; value: string }>>([]);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  // Views Toggle (List view vs Purchase History view)
  const [currentView, setCurrentView] = useState<"list" | "purchases">("list");

  // Role permissions checking
  const canEdit = useMemo(() => {
    const role = activeRole || "Owner";
    const legacyRoleCheck = ["Owner", "General Manager", "Office Manager", "Operations Manager", "Warehouse / Inventory Manager", "Inventory Manager", "Warehouse Manager"].includes(role);
    return legacyRoleCheck || hasPermission(loggedInUser?.granularPermissions, "inventory", "delete");
  }, [activeRole, loggedInUser]);
  const canCreateInventory = hasPermission(loggedInUser?.granularPermissions, "inventory", "edit") || canEdit;

  // Calculations
  const stats = useMemo(() => {
    let totalItems = inventoryList.length;
    let totalVal = inventoryList.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);
    let lowStockCount = inventoryList.filter(item => item.quantity > 0 && item.quantity <= item.minQuantity).length;
    let outOfStockCount = inventoryList.filter(item => item.quantity === 0).length;
    let favoriteCount = inventoryList.filter(item => item.isFavorite).length;

    return {
      totalItems,
      totalVal,
      lowStockCount,
      outOfStockCount,
      favoriteCount
    };
  }, [inventoryList]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const usedTodayItems = useMemo(() => inventoryList.flatMap(item =>
    (item.usageHistory || [])
      .filter(entry => entry.date.slice(0, 10) === todayKey)
      .map(entry => ({ item, entry, value: entry.amount * item.unitCost }))
  ), [inventoryList, todayKey]);
  const pendingDeliveries = useMemo(() => (events || []).filter(event =>
    event.eventType === "Inventory Delivery" &&
    !["Completed", "Cancelled"].includes(event.status)
  ), [events]);
  const dailyUsageValue = usedTodayItems.reduce((total, usage) => total + usage.value, 0);

  const showInventorySelection = (filter: string, category: string | null = null) => {
    setCurrentView("list");
    setActiveTabFilter(filter);
    setSelectedCategory(category);
    window.requestAnimationFrame(() => {
      inventoryListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openInventoryItem = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsDetailsPopupOpen(true);
  };

  const visibleCategoryShortcuts = INVENTORY_NAVIGATION_CATEGORIES.filter(category =>
    DEFAULT_CATEGORY_SHORTCUTS.includes(category.name) || addedCategoryShortcuts.includes(category.name)
  );
  const availableCategoryShortcuts = INVENTORY_NAVIGATION_CATEGORIES.filter(category =>
    !DEFAULT_CATEGORY_SHORTCUTS.includes(category.name) && !addedCategoryShortcuts.includes(category.name)
  );

  useEffect(() => {
    window.localStorage.setItem(CATEGORY_SHORTCUTS_STORAGE_KEY, JSON.stringify(addedCategoryShortcuts));
  }, [addedCategoryShortcuts]);

  const addCategoryShortcut = (categoryName: string) => {
    setAddedCategoryShortcuts(current =>
      current.includes(categoryName) ? current : [...current, categoryName]
    );
    setSelectedCategory(categoryName);
    setIsCategoryMenuOpen(false);
  };

  // Filter & Search Logic
  const filteredInventory = useMemo(() => {
    return inventoryList.filter(item => {
      // Search Box matching
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          item.name.toLowerCase().includes(query) ||
          item.sku.toLowerCase().includes(query) ||
          item.vendor.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query) ||
          item.barcode.toLowerCase().includes(query) ||
          item.qrCode.toLowerCase().includes(query) ||
          item.manufacturer.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.location.toLowerCase().includes(query);

        if (!matchesSearch) return false;
      }

      // Summary Card / Tab filter
      if (activeTabFilter === "low_stock" && !(item.quantity > 0 && item.quantity <= item.minQuantity)) return false;
      if (activeTabFilter === "out_of_stock" && item.quantity !== 0) return false;
      if (activeTabFilter === "favorites" && !item.isFavorite) return false;

      // Category Icon click matching
      if (selectedCategory === "Materials" && !MATERIAL_CATEGORY_SET.has(item.category)) return false;
      if (selectedCategory && selectedCategory !== "Materials" && item.category !== selectedCategory) return false;

      // Drawer detailed filters
      if (filterWarehouse !== "all" && !item.location.toLowerCase().includes(filterWarehouse.toLowerCase())) return false;
      if (filterVendor !== "all" && item.vendor !== filterVendor) return false;

      return true;
    }).sort((a, b) => {
      // Favorites appear first
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return 0;
    });
  }, [inventoryList, searchQuery, selectedCategory, activeTabFilter, filterWarehouse, filterVendor]);

  const triggerToast = (msg: string) => {
    if (logOperationalEvent) {
      logOperationalEvent("Inventory Update", msg, "📦");
    }
  };

  // Native window.confirm() blocks the JS main thread until dismissed -- in
  // some embedded/automated contexts it never gets dismissed, which reads as
  // the whole page freezing. Route confirmations through in-app UI instead.
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const requestConfirm = (message: string, onConfirm: () => void) => setConfirmState({ message, onConfirm });

  // Actions
  const handleRefresh = () => {
    triggerToast("Inventory cache successfully updated!");
  };

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + ["Name,Category,Vendor,SKU,Barcode,Quantity,Unit,UnitCost,SellingPrice,Location"].join(",") + "\n"
      + inventoryList.map(item => `"${item.name}","${item.category}","${item.vendor}","${item.sku}","${item.barcode}",${item.quantity},"${item.unit}",${item.unitCost},${item.sellingPrice},"${item.location}"`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ownerslocal_inventory_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast("Inventory ledger exported to local spreadsheet format!");
  };

  const handleImport = () => {
    if (!importText.trim()) {
      triggerToast("Import cancelled: Empty spreadsheet contents");
      return;
    }
    const lines = importText.split("\n");
    let count = 0;
    const newItems: InventoryItem[] = [];
    lines.forEach((line, idx) => {
      if (idx === 0 || !line.trim()) return;
      const parts = line.split(",");
      if (parts.length >= 6) {
        newItems.push({
          id: `imported_${Date.now()}_${idx}`,
          name: parts[0]?.trim() || "Imported Item",
          category: parts[1]?.trim() || "Materials",
          vendor: parts[2]?.trim() || "Various",
          manufacturer: "Imported",
          sku: parts[3]?.trim() || `SKU-IMP-${idx}`,
          barcode: parts[4]?.trim() || "",
          qrCode: "",
          description: "Spreadsheet imported stock",
          quantity: parseFloat(parts[5]?.trim()) || 0,
          unit: parts[6]?.trim() || "pcs",
          minQuantity: 5,
          maxQuantity: 100,
          location: parts[7]?.trim() || "Warehouse A",
          unitCost: parseFloat(parts[8]?.trim()) || 1.00,
          sellingPrice: parseFloat(parts[9]?.trim()) || 1.50,
          notes: "Imported via ledger script",
          photo: "📦",
          isFavorite: false,
          lastUpdated: new Date().toISOString(),
          quantityHistory: [{ date: "2026-07-06", type: "Correction", amount: parseFloat(parts[5]?.trim()) || 0, previous: 0, current: parseFloat(parts[5]?.trim()) || 0, notes: "Imported" }],
          purchaseHistory: [],
          usageHistory: []
        });
        count++;
      }
    });

    if (newItems.length > 0) {
      setInventoryList(prev => [...prev, ...newItems]);
      triggerToast(`Successfully loaded ${count} items from sheet!`);
    } else {
      triggerToast("Failed to parse sheet columns. Ensure comma-separated layout is correct.");
    }
    setIsImportModalOpen(false);
    setImportText("");
  };

  // Add Item Submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingItem) return;
    if (isEditMode ? !canEdit : !canCreateInventory) {
      triggerToast("Access Denied: you don't have permission to do that.");
      return;
    }
    if (!formName.trim()) return;

    const newItem: InventoryItem = {
      id: isEditMode && selectedItem ? selectedItem.id : `item_${Date.now()}`,
      name: formName,
      category: formCategory,
      vendor: formVendor || "Unknown Vendor",
      manufacturer: formManufacturer || "Unknown Manufacturer",
      sku: formSku || `SKU-${Math.floor(Math.random() * 900000)}`,
      barcode: formBarcode || `${Math.floor(Math.random() * 1000000000000)}`,
      qrCode: formQrCode || `QR-${Math.floor(Math.random() * 90000)}`,
      description: formDescription,
      quantity: formQuantity,
      unit: formUnitCost > 0 ? "pcs" : "bags",
      minQuantity: formMinQty,
      maxQuantity: formMaxQty,
      location: formLocation,
      unitCost: formUnitCost,
      sellingPrice: formSellingPrice,
      notes: formNotes,
      photo: formPhoto,
      isFavorite: formIsFavorite,
      customFields: formCustomFields,
      lastUpdated: "2026-07-06 04:00 PM",
      quantityHistory: isEditMode && selectedItem ? selectedItem.quantityHistory : [
        { date: "2026-07-06", type: "Correction", amount: formQuantity, previous: 0, current: formQuantity, notes: "Initial provision" }
      ],
      purchaseHistory: isEditMode && selectedItem ? selectedItem.purchaseHistory : [],
      usageHistory: isEditMode && selectedItem ? selectedItem.usageHistory : []
    };

    const previousInventoryValue = isEditMode && selectedItem
      ? selectedItem.quantity * selectedItem.unitCost
      : 0;
    const newInventoryValue = newItem.quantity * newItem.unitCost;
    const inventoryValueIncrease = Math.round(
      Math.max(0, newInventoryValue - previousInventoryValue) * 100
    ) / 100;
    const normalizedName = formName.trim().toLowerCase();
    const normalizedVendor = formVendor.trim().toLowerCase();
    const hasExistingInventoryExpense = isEditMode && selectedItem && transactions.some(transaction => {
      if (transaction.type !== "expense") return false;
      if (transaction.inventoryItemId === selectedItem.id) return true;
      const description = transaction.description.trim().toLowerCase();
      const matchesLegacyDescription = description === normalizedName || (!!normalizedVendor && description === normalizedVendor);
      return matchesLegacyDescription && Math.abs(transaction.amount - previousInventoryValue) < 0.01;
    });
    // Editing an item must never post an expense unless the user opted in via
    // the "log as expense" checkbox — otherwise routine quantity/cost
    // corrections silently corrupt the books (see release blocker #1).
    const editShouldLogExpense = isEditMode
      && formLogExpense
      && MATERIAL_EXPENSE_CATEGORIES.has(formCategory);
    // Records edited before inventory expenses were linked need one catch-up entry.
    // Once linked, later edits post only the increase instead of duplicating the full value.
    const expenseToLog = editShouldLogExpense
      ? (!hasExistingInventoryExpense
        ? Math.round(Math.max(0, newInventoryValue) * 100) / 100
        : inventoryValueIncrease)
      : 0;

    const logInventoryExpense = (amount: number) => {
      const now = new Date();
      const inventoryExpense: Transaction = {
        id: `txn_inventory_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: "expense",
        source: "manual",
        amount,
        description: formName.trim(),
        category: "Materials",
        date: now.toISOString().slice(0, 10),
        createdAt: now.toISOString(),
        inventoryItemId: newItem.id,
        ...(loggedInUser?.email ? { createdBy: loggedInUser.email } : {})
      };
      const journalEntry = postTransactionEntry(inventoryExpense);
      setTransactions(prev => [...prev, inventoryExpense]);
      setJournalEntries(prev => [...prev, journalEntry]);
    };

    setIsSavingItem(true);
    try {
    if (isEditMode) {
      setInventoryList(prev => prev.map(item => item.id === newItem.id ? newItem : item));
      if (expenseToLog > 0) {
        logInventoryExpense(expenseToLog);
        triggerToast(`Updated ${formName} and added $${expenseToLog.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} to Revenue expenses.`);
      } else {
        triggerToast(`Updated inventory records for ${formName}`);
      }
    } else {
      // Do not hide the inventory save behind a native confirmation dialog.
      // Mobile/PWA browser chrome can hide that dialog and make the save look
      // frozen. The accounting choice is explicit in the form instead.
      const shouldLogInventoryExpense = formLogExpense
        && MATERIAL_EXPENSE_CATEGORIES.has(formCategory)
        && inventoryValueIncrease > 0;

      if (shouldLogInventoryExpense) {
        const now = new Date();
        const expenseTransaction: Omit<Transaction, "id"> = {
          type: "expense",
          source: "manual",
          amount: inventoryValueIncrease,
          description: formName.trim(),
          category: "Materials",
          date: now.toISOString().slice(0, 10),
          createdAt: now.toISOString(),
          inventoryItemId: newItem.id,
          ...(loggedInUser?.email ? { createdBy: loggedInUser.email } : {})
        };

        // Inventory state is the primary save for this form and is already
        // persisted by the shared Firestore-backed setter. Do not hold the
        // entire modal hostage while the separate accounting batch waits for
        // the network; Firestore can acknowledge that write later.
        setInventoryList(prev => [...prev, newItem]);
        setIsAddPopupOpen(false);
        resetForm();
        setIsSavingItem(false);
        triggerToast(`Added ${newItem.name} to inventory. Logging the Materials expense in the background…`);
        void saveTransaction(expenseTransaction)
          .then(() => triggerToast(`Logged $${inventoryValueIncrease.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for ${newItem.name} as a Materials expense.`))
          .catch(error => {
            console.error("Inventory saved, but its expense could not be logged:", error);
            triggerToast(`${newItem.name} was saved to inventory, but the expense did not post. You can log it from Revenue when the connection recovers.`);
          });
        return;
      } else {
        setInventoryList(prev => [...prev, newItem]);
        triggerToast(`Added ${formName} to inventory!`);
      }
    }

      setIsAddPopupOpen(false);
      resetForm();
    } catch (error) {
      console.error("Failed to add inventory material and expense:", error);
      triggerToast(`Couldn't add ${formName}. The expense was not saved, so company overhead was not changed. Please try again.`);
    } finally {
      setIsSavingItem(false);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormCategory("Materials");
    setFormVendor("");
    setFormManufacturer("");
    setFormSku("");
    setFormBarcode("");
    setFormQrCode("");
    setFormDescription("");
    setFormQuantity(0);
    setFormMinQty(5);
    setFormMaxQty(100);
    setFormLocation("Warehouse A");
    setFormUnitCost(0);
    setFormSellingPrice(0);
    setFormNotes("");
    setFormPhoto("📦");
    setFormIsFavorite(false);
    setFormLogExpense(false);
    setFormCustomFields([]);
    setIsEditMode(false);
  };

  const handleEditClick = (item: InventoryItem) => {
    setSelectedItem(item);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormVendor(item.vendor);
    setFormManufacturer(item.manufacturer);
    setFormSku(item.sku);
    setFormBarcode(item.barcode);
    setFormQrCode(item.qrCode);
    setFormDescription(item.description);
    setFormQuantity(item.quantity);
    setFormMinQty(item.minQuantity);
    setFormMaxQty(item.maxQuantity);
    setFormLocation(item.location);
    setFormUnitCost(item.unitCost);
    setFormSellingPrice(item.sellingPrice);
    setFormNotes(item.notes);
    setFormPhoto(item.photo);
    setFormIsFavorite(item.isFavorite);
    setFormCustomFields(item.customFields || []);
    setFormLogExpense(false);
    setIsEditMode(true);
    setIsAddPopupOpen(true);
    setIsDetailsPopupOpen(false);
  };

  const handleDeleteItem = (id: string) => {
    if (!canEdit) {
      triggerToast("Access Denied: Technicians cannot delete inventory.");
      return;
    }
    const item = inventoryList.find(e => e.id === id);
    if (item) {
      setDeletingItem(item);
    }
  };

  const handleConfirmDelete = () => {
    if (!deletingItem) return;
    setInventoryList(prev => prev.filter(item => item.id !== deletingItem.id));
    triggerToast(`Removed ${deletingItem.name} from inventory!`);
    setIsDetailsPopupOpen(false);
    setDeletingItem(null);
  };

  const addCustomField = () => {
    if (newKey.trim() && newValue.trim()) {
      setFormCustomFields(prev => [...prev, { key: newKey.trim(), value: newValue.trim() }]);
      setNewKey("");
      setNewValue("");
    }
  };

  // Perform Quick Action Adjustments
  const executeQuickAction = () => {
    if (!selectedItem) return;

    let qtyChange = 0;
    let desc = "";

    switch (quickActionType) {
      case "Receive":
        qtyChange = Math.abs(quickActionQty);
        desc = `Received shipment of ${qtyChange} ${selectedItem.unit}`;
        break;
      case "Remove":
        qtyChange = -Math.abs(quickActionQty);
        desc = `Removed ${Math.abs(qtyChange)} ${selectedItem.unit} for field consumption`;
        break;
      case "Transfer":
        qtyChange = -Math.abs(quickActionQty);
        desc = `Transferred ${Math.abs(qtyChange)} ${selectedItem.unit} to ${quickActionTarget}`;
        break;
      case "Correct":
        qtyChange = quickActionQty - selectedItem.quantity;
        desc = `Adjusted stock count. Set to absolute ${quickActionQty}`;
        break;
      case "Waste":
        qtyChange = -Math.abs(quickActionQty);
        desc = `Scrapped ${Math.abs(qtyChange)} ${selectedItem.unit} as waste. Reason: ${quickActionNotes || "Not specified"}`;
        break;
      case "Damage":
        qtyChange = -Math.abs(quickActionQty);
        desc = `Logged damaged stock of ${Math.abs(qtyChange)} units.`;
        break;
      case "Reserve":
        desc = `Reserved ${quickActionQty} units for future Job schedule.`;
        break;
      case "AssignJob":
        qtyChange = -Math.abs(quickActionQty);
        desc = `Assigned ${Math.abs(qtyChange)} units to Active Job #${quickActionTarget || "Unassigned"}`;
        // EVENT ENGINE INTEGRATION
        if (setEvents && events) {
          const newEvent: SchedulingEvent = {
            id: `evt_inv_${Date.now()}`,
            eventType: "Inventory Delivery",
            date: "2026-07-06",
            startTime: "16:00",
            endTime: "17:00",
            customer: `Material Dispatch: ${selectedItem.name}`,
            location: quickActionTarget || "Main Site",
            priority: "Medium",
            notes: `Auto dispatched ${Math.abs(qtyChange)} ${selectedItem.unit} to Job site.`,
            status: "Scheduled",
            assignedEmployee: selectedItem.assignedEmployee || loggedInUser?.name || "Unassigned"
          };
          setEvents(prev => [...prev, newEvent]);
        }
        break;
      case "AssignVehicle":
        desc = `Dispatched storage of ${selectedItem.name} onto ${quickActionTarget}`;
        break;
      case "AssignEmployee":
        desc = `Assigned tracking custodian for ${selectedItem.name} to ${quickActionTarget}`;
        break;
    }

    const currentQty = quickActionType === "Correct" ? quickActionQty : (selectedItem.quantity + qtyChange);

    const updatedItem: InventoryItem = {
      ...selectedItem,
      quantity: Math.max(0, currentQty),
      assignedVehicle: quickActionType === "AssignVehicle" ? quickActionTarget : selectedItem.assignedVehicle,
      assignedEmployee: quickActionType === "AssignEmployee" ? quickActionTarget : selectedItem.assignedEmployee,
      quantityHistory: [
        {
          date: "2026-07-06",
          type: quickActionType,
          amount: qtyChange !== 0 ? qtyChange : quickActionQty,
          previous: selectedItem.quantity,
          current: Math.max(0, currentQty),
          notes: quickActionNotes || desc
        },
        ...selectedItem.quantityHistory
      ],
      lastUpdated: "2026-07-06 03:10 PM"
    };

    setInventoryList(prev => prev.map(item => item.id === selectedItem.id ? updatedItem : item));
    setSelectedItem(updatedItem);
    triggerToast(desc);
    setIsQuickActionModalOpen(false);
    setQuickActionNotes("");
    setQuickActionTarget("");
  };

  // Barcode / QR Simulation scanning
  const handleScannerSubmit = () => {
    if (!scanInputCode.trim()) return;
    const found = inventoryList.find(item => 
      item.barcode === scanInputCode || 
      item.sku.toLowerCase() === scanInputCode.toLowerCase() ||
      item.qrCode.toLowerCase() === scanInputCode.toLowerCase()
    );

    if (found) {
      setSelectedItem(found);
      setIsScannerModalOpen(false);
      setIsDetailsPopupOpen(true);
      triggerToast(`Barcode recognized! Loaded ${found.name}`);
    } else {
      const code = scanInputCode;
      requestConfirm(`Product SKU/Code "${code}" was not found in inventory. Add it as a new inventory item?`, () => {
        setIsScannerModalOpen(false);
        resetForm();
        setFormSku(code);
        setFormBarcode(code);
        setIsAddPopupOpen(true);
      });
    }
    setScanInputCode("");
  };

  const localCameraInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleLocalCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    downscaleImageToBase64(file)
      .then(({ base64, mimeType }) => { setScannedPhoto({ base64, mimeType }); runCameraAI(base64, mimeType); })
      .catch(() => {
        setOcrError("Couldn't process that photo. Try again with a clearer, well-lit shot.");
        setSnapshotStage("camera");
      });
  };

  // Real OCR via Gemini vision (server-side, see server/aiHandler.ts handleScanReceipt).
  // Every field can come back null — the model is instructed not to guess, so this
  // never fabricates data the way the old hardcoded mock did.
  const runCameraAI = async (imageBase64: string, mimeType: string) => {
    setSnapshotStage("processing");
    setOcrError(null);
    try {
      const res = await fetch("/api/ai/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      const scanned = data as ScannedReceipt;
      if (scanned.unreadable || !scanned.items?.length) {
        setOcrError(scanned.unreadable
          ? "Couldn't identify a receipt, label, or physical stock in that photo. Try a clearer, well-lit shot of the item's label/receipt, or of the items themselves."
          : "No items could be read or identified in that photo. Try a clearer, well-lit shot.");
        setSnapshotStage("camera");
        return;
      }
      setAiSuggestions(scanned);
      setSelectedScanItems(scanned.items.map(() => true));
      setLogScanExpense(true);
      setSnapshotStage("review");
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : "Scan failed. Make sure GEMINI_API_KEY is configured on the server.");
      setSnapshotStage("camera");
    }
  };

  const findInventoryMatch = (item: ScannedLineItem) =>
    inventoryList.find(i =>
      (!!item.barcode && i.barcode === item.barcode) ||
      (!!item.sku && i.sku === item.sku)
    ) || null;

  // The receipt's own printed total is preferred for the expense amount;
  // summing quantity × unitCost per line is only a fallback for receipts
  // where no clean total was legible.
  const scanReceiptTotal = (receipt: ScannedReceipt) =>
    receipt.total ?? receipt.items.reduce((sum, item) => sum + (item.quantity ?? 0) * (item.unitCost ?? 0), 0);

  const toggleAllScanItems = (checked: boolean) => {
    if (!aiSuggestions) return;
    setSelectedScanItems(aiSuggestions.items.map(() => checked));
  };

  const handleApproveAISuggestion = () => {
    if (!aiSuggestions) return;
    const today = new Date().toISOString().slice(0, 10);
    const updatedNames: string[] = [];

    aiSuggestions.items.forEach((item, index) => {
      if (!selectedScanItems[index]) return;
      const scannedQty = item.quantity ?? 0;
      const scannedCost = item.unitCost ?? 0;
      const match = findInventoryMatch(item);

      if (match) {
        setInventoryList(prev => prev.map(i => i.id === match.id ? {
          ...i,
          quantity: i.quantity + scannedQty,
          quantityHistory: [
            {
              date: today,
              type: "AI Receipt Scan",
              amount: scannedQty,
              previous: i.quantity,
              current: i.quantity + scannedQty,
              notes: aiSuggestions.vendor ? `Scanned at ${aiSuggestions.vendor}` : "Scanned via camera OCR"
            },
            ...i.quantityHistory
          ]
        } : i));
        updatedNames.push(match.name);
      } else {
        const newItem: InventoryItem = {
          id: `ai_${Date.now()}_${index}`,
          name: item.name || "Unnamed scanned item",
          category: item.category || "Uncategorized",
          vendor: aiSuggestions.vendor || "",
          manufacturer: item.manufacturer || "",
          sku: item.sku || "",
          barcode: item.barcode || "",
          qrCode: "",
          description: "Added from a scanned receipt/label photo",
          quantity: scannedQty,
          unit: item.unit || "pcs",
          minQuantity: 5,
          maxQuantity: Math.max(scannedQty * 2, 10),
          location: "Warehouse A",
          unitCost: scannedCost,
          sellingPrice: scannedCost * 1.5,
          notes: "Created via camera OCR scan",
          photo: "📦",
          isFavorite: false,
          lastUpdated: new Date().toLocaleTimeString(),
          quantityHistory: [{ date: today, type: "AI Scanned New", amount: scannedQty, previous: 0, current: scannedQty, notes: "Created from scanned receipt/label" }],
          purchaseHistory: [],
          usageHistory: []
        };
        setInventoryList(prev => [...prev, newItem]);
        updatedNames.push(newItem.name);
      }
    });

    // The purchase log and expense reflect the whole receipt regardless of
    // which items were checked for inventory tracking -- that money was
    // spent either way.
    const receiptTotal = scanReceiptTotal(aiSuggestions);
    const newPurchase: PurchaseRecord = {
      id: `P-${Math.floor(100 + Math.random() * 900)}`,
      vendor: aiSuggestions.vendor || "Unknown vendor",
      receiptNumber: `AI-${Math.floor(100000 + Math.random() * 900000)}`,
      date: aiSuggestions.purchaseDate || today,
      employee: loggedInUser?.name || "Unknown",
      itemsPurchased: aiSuggestions.items.map(item => `${item.name || "Item"} (${item.quantity ?? 0})`).join(", "),
      totalCost: receiptTotal
    };
    setPurchases(prev => [newPurchase, ...prev]);

    if (logScanExpense && receiptTotal > 0) {
      const vendorName = aiSuggestions.vendor || "Scanned receipt";
      const itemCount = aiSuggestions.items.length;
      void saveTransaction({
        type: "expense",
        source: "manual",
        amount: receiptTotal,
        description: `${vendorName} (${itemCount} item${itemCount === 1 ? "" : "s"} via AI receipt scan)`,
        category: "Materials",
        date: aiSuggestions.purchaseDate || today,
        createdAt: new Date().toISOString(),
        ...(loggedInUser?.email ? { createdBy: loggedInUser.email } : {})
      }).then(() => triggerToast(`Logged $${receiptTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} as a Materials expense.`))
        .catch(error => {
          console.error("Inventory updated, but its expense could not be logged:", error);
          triggerToast("Inventory was updated, but the expense did not post. Log it from Revenue when the connection recovers.");
        });
    }

    if (scannedPhoto && scannedPhoto.base64.length <= SNAPSHOT_PHOTO_MAX_BASE64_LENGTH) {
      setDocuments(prev => [buildScanSnapshotDocument({
        photoBase64: scannedPhoto.base64,
        mimeType: scannedPhoto.mimeType,
        vendor: aiSuggestions.vendor,
        date: aiSuggestions.purchaseDate || today,
        docType: "Receipts",
        uploadedBy: loggedInUser?.name
      }), ...prev]);
    }

    const label = updatedNames.length
      ? `Updated inventory: ${updatedNames.join(", ")}.`
      : "No items were added to inventory.";

    setIsSnapshotAIModalOpen(false);
    setSnapshotStage("camera");
    setAiSuggestions(null);
    setSelectedScanItems([]);
    setScannedPhoto(null);
    triggerToast(label);
  };

  // Generate a automatic Purchase order list from low stock items
  const generateLowStockPurchaseList = () => {
    const lowStock = inventoryList.filter(item => item.quantity <= item.minQuantity);
    if (lowStock.length === 0) {
      triggerToast("No stock items are currently below minimum levels!");
      return;
    }
    setReorderCandidates(lowStock);
    setReorderModalOpen(true);
  };

  const handleReplenishStock = () => {
    if (reorderCandidates.length === 0) return;
    setInventoryList(prev => prev.map(item => {
      const match = reorderCandidates.find(rc => rc.id === item.id);
      if (match) {
        const reorderAmount = match.maxQuantity - match.quantity;
        return {
          ...item,
          quantity: match.maxQuantity,
          quantityHistory: [
            {
              date: new Date().toISOString().slice(0, 10),
              type: "Purchase" as const,
              amount: reorderAmount,
              previous: match.quantity,
              current: match.maxQuantity,
              notes: `Auto-replenishment order from ${match.vendor}`
            },
            ...(item.quantityHistory || [])
          ]
        };
      }
      return item;
    }));

    triggerToast(`🎉 Successfully reordered and replenished ${reorderCandidates.length} low-stock items!`);
    setReorderModalOpen(false);
    setReorderCandidates([]);
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* TOP INVENTORY MANAGEMENT CARD */}
      <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#E3F3FF]/30 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="px-3 py-1 bg-[#E3F3FF] text-[#4A9BFF] text-[9.5px] font-mono font-bold rounded-xl border border-[#A9CDEE] uppercase">
              Operational Ledger
            </span>
            <h1 className="text-xl font-sans font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-2">
              <Package className="w-5 h-5 text-[#4A9BFF]" /> Inventory Management
            </h1>
            <p className="text-xs text-slate-500 font-sans font-semibold">
              Master material database with dynamic geofencing, receipts optical character logic, and asset tracking.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                resetForm();
                setIsAddPopupOpen(true);
              }}
              className="px-3 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>

            <button
              onClick={() => {
                setSnapshotStage("camera");
                setIsSnapshotAIModalOpen(true);
              }}
              className="px-3 py-2 bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all hover:opacity-90 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" /> Snapshot AI
            </button>

            <button
              onClick={() => {
                setScannerType("barcode");
                setIsScannerModalOpen(true);
              }}
              className="px-3 py-2 bg-[#E3F3FF] text-[#342D7E] border border-[#A9CDEE] hover:bg-[#D5EAFF] text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Barcode className="w-3.5 h-3.5" /> Scan Barcode
            </button>

            <button
              onClick={() => {
                setScannerType("qr");
                setIsScannerModalOpen(true);
              }}
              className="px-3 py-2 bg-[#E3F3FF] text-[#342D7E] border border-[#A9CDEE] hover:bg-[#D5EAFF] text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" /> Scan QR
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-2.5 py-2 bg-[#E3F3FF] text-slate-600 border border-[#A9CDEE] hover:bg-[#D5EAFF] text-xs font-bold rounded-xl transition-all cursor-pointer"
              title="Import spreadsheet CSV ledger data"
            >
              <Upload className="w-3.5 h-3.5 inline mr-1" /> Import
            </button>

            <button
              onClick={handleExport}
              className="px-2.5 py-2 bg-[#E3F3FF] text-slate-600 border border-[#A9CDEE] hover:bg-[#D5EAFF] text-xs font-bold rounded-xl transition-all cursor-pointer"
              title="Export dynamic spreadsheet CSV"
            >
              <Download className="w-3.5 h-3.5 inline mr-1" /> Export
            </button>

            <button
              onClick={() => setCurrentView(currentView === "list" ? "purchases" : "list")}
              className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 border transition-all cursor-pointer ${
                currentView === "purchases" 
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : "bg-[#E3F3FF] text-[#342D7E] border-[#A9CDEE] hover:bg-[#D5EAFF]"
              }`}
            >
              <History className="w-3.5 h-3.5" /> Purchase History
            </button>

            <button
              onClick={handleRefresh}
              className="p-2 bg-[#E3F3FF] text-slate-600 border border-[#A9CDEE] hover:bg-[#D5EAFF] rounded-xl transition-all cursor-pointer"
              title="Refresh inventory system state"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* LIVE INVENTORY CONNECTIONS */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        
        <button type="button"
          onClick={() => { showInventorySelection("all"); setActiveSummaryCard(activeSummaryCard === "catalog" ? null : "catalog"); }}
          className={`bg-[#E3F3FF] p-3.5 rounded-2xl border transition-all cursor-pointer ${activeTabFilter === "all" && !selectedCategory ? "border-blue-500 ring-2 ring-blue-200" : "border-[#A9CDEE] hover:border-blue-400"}`}
        >
          <span className="p-1.5 bg-[#C7E3FB] rounded-lg inline-block mb-1.5 text-[#342D7E]">
            <Layers className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Total Inventory</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">{stats.totalItems}</p>
        </button>

        <button type="button"
          onClick={() => setActiveSummaryCard(activeSummaryCard === "value" ? null : "value")}
          className="bg-[#E3F3FF] p-3.5 rounded-2xl border border-[#A9CDEE] hover:border-blue-400 transition-all cursor-pointer"
        >
          <span className="p-1.5 bg-[#C7E3FB] rounded-lg inline-block mb-1.5 text-emerald-600">
            <DollarSign className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Ledger Value</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">${stats.totalVal.toLocaleString()}</p>
        </button>

        <button type="button"
          onClick={() => { showInventorySelection("low_stock"); setActiveSummaryCard(activeSummaryCard === "low" ? null : "low"); }}
          className={`bg-[#E3F3FF] p-3.5 rounded-2xl border transition-all cursor-pointer ${activeTabFilter === "low_stock" ? "border-amber-500 ring-2 ring-amber-100" : "border-[#A9CDEE] hover:border-amber-400"}`}
        >
          <span className="p-1.5 bg-amber-100 rounded-lg inline-block mb-1.5 text-amber-600">
            <AlertTriangle className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Low Stock</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">{stats.lowStockCount}</p>
        </button>

        <button type="button"
          onClick={() => { showInventorySelection("out_of_stock"); setActiveSummaryCard(activeSummaryCard === "out" ? null : "out"); }}
          className={`bg-[#E3F3FF] p-3.5 rounded-2xl border transition-all cursor-pointer ${activeTabFilter === "out_of_stock" ? "border-rose-500 ring-2 ring-rose-100" : "border-[#A9CDEE] hover:border-rose-400"}`}
        >
          <span className="p-1.5 bg-rose-100 rounded-lg inline-block mb-1.5 text-rose-600">
            <Trash2 className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Out of Stock</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">{stats.outOfStockCount}</p>
        </button>

        <button type="button"
          onClick={() => { showInventorySelection("favorites"); setActiveSummaryCard(activeSummaryCard === "favorites" ? null : "favorites"); }}
          className={`bg-[#E3F3FF] p-3.5 rounded-2xl border transition-all cursor-pointer ${activeTabFilter === "favorites" ? "border-indigo-500 ring-2 ring-indigo-100" : "border-[#A9CDEE] hover:border-indigo-400"}`}
        >
          <span className="p-1.5 bg-indigo-100 rounded-lg inline-block mb-1.5 text-indigo-600">
            <Star className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">My Favorites</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">{stats.favoriteCount}</p>
        </button>

        <button type="button"
          onClick={() => setActiveSummaryCard(activeSummaryCard === "used" ? null : "used")}
          className="bg-[#E3F3FF] p-3.5 rounded-2xl border border-[#A9CDEE] hover:border-blue-400 transition-all cursor-pointer"
        >
          <span className="p-1.5 bg-sky-100 rounded-lg inline-block mb-1.5 text-sky-600">
            <CheckSquare className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Used Today</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">{usedTodayItems.length} items</p>
        </button>

        <button type="button"
          onClick={() => setActiveSummaryCard(activeSummaryCard === "deliveries" ? null : "deliveries")}
          className="bg-[#E3F3FF] p-3.5 rounded-2xl border border-[#A9CDEE] hover:border-blue-400 transition-all cursor-pointer"
        >
          <span className="p-1.5 bg-orange-100 rounded-lg inline-block mb-1.5 text-orange-600">
            <Truck className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Pending Deliveries</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">{pendingDeliveries.length}</p>
        </button>

        <button type="button"
          onClick={() => setActiveSummaryCard(activeSummaryCard === "usage" ? null : "usage")}
          className="bg-[#E3F3FF] p-3.5 rounded-2xl border border-[#A9CDEE] hover:border-blue-400 transition-all cursor-pointer"
        >
          <span className="p-1.5 bg-purple-100 rounded-lg inline-block mb-1.5 text-purple-600">
            <FileSpreadsheet className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Daily Usage</p>
          <p className="text-lg font-mono font-black text-[#342D7E] mt-0.5">${dailyUsageValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </button>

      </div>

      {activeSummaryCard && (
        <div className="bg-[#F5FAFF] border border-[#A9CDEE] rounded-2xl p-4 shadow-sm" role="region" aria-live="polite">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-[#342D7E]">
                {{ catalog: "Inventory Items", value: "Inventory Value by Category", low: "Low Stock Items", out: "Out of Stock Items", favorites: "Favorite Items", used: "Items Used Today", deliveries: "Pending Inventory Deliveries", usage: "Today's Usage Value" }[activeSummaryCard]}
              </h3>
              <p className="text-[10px] font-semibold text-slate-500">Live information from inventory and scheduling. Select a row to open the connected record.</p>
            </div>
            <button type="button" onClick={() => setActiveSummaryCard(null)} className="p-1.5 rounded-lg hover:bg-[#D5EAFF] text-slate-500" aria-label="Close summary"><X className="w-4 h-4" /></button>
          </div>

          {(activeSummaryCard === "catalog" || activeSummaryCard === "low" || activeSummaryCard === "out" || activeSummaryCard === "favorites") && (() => {
            const items = activeSummaryCard === "low"
              ? inventoryList.filter(item => item.quantity > 0 && item.quantity <= item.minQuantity)
              : activeSummaryCard === "out"
                ? inventoryList.filter(item => item.quantity === 0)
                : activeSummaryCard === "favorites"
                  ? inventoryList.filter(item => item.isFavorite)
                  : inventoryList;
            return items.length ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{items.map(item => (
              <button type="button" key={item.id} onClick={() => openInventoryItem(item)} className="flex items-center justify-between gap-3 rounded-xl border border-[#A9CDEE] bg-white px-3 py-2 text-left hover:border-[#4A9BFF]">
                <span className="min-w-0"><span className="block truncate text-xs font-extrabold text-slate-800">{item.photo} {item.name}</span><span className="block text-[10px] text-slate-500">{item.category} · {item.location}</span></span>
                <span className="shrink-0 text-xs font-black text-[#342D7E]">{item.quantity} {item.unit}</span>
              </button>
            ))}</div> : <p className="text-xs font-semibold text-slate-500">No connected inventory records yet.</p>;
          })()}

          {activeSummaryCard === "value" && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {INVENTORY_NAVIGATION_CATEGORIES.map(category => {
                const items = inventoryList.filter(item => category.name === "Materials"
                  ? MATERIAL_CATEGORY_SET.has(item.category)
                  : item.category === category.name
                );
                const value = items.reduce((total, item) => total + item.quantity * item.unitCost, 0);
                if (!items.length) return null;
                return <button type="button" key={category.name} onClick={() => showInventorySelection("all", category.name)} className="flex items-center justify-between rounded-xl border border-[#A9CDEE] bg-white px-3 py-2 hover:border-[#4A9BFF]"><span className="text-xs font-bold text-slate-700">{category.icon} {category.name} ({items.length})</span><span className="text-xs font-black text-emerald-700">${value.toLocaleString()}</span></button>;
              })}
              {!inventoryList.length && <p className="text-xs font-semibold text-slate-500">No inventory value has been recorded yet.</p>}
            </div>
          )}

          {(activeSummaryCard === "used" || activeSummaryCard === "usage") && (
            usedTodayItems.length ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{usedTodayItems.map(({ item, entry, value }, index) => (
              <button type="button" key={`${item.id}-${index}`} onClick={() => openInventoryItem(item)} className="flex items-center justify-between rounded-xl border border-[#A9CDEE] bg-white px-3 py-2 text-left hover:border-[#4A9BFF]"><span><span className="block text-xs font-extrabold text-slate-800">{item.name}</span><span className="block text-[10px] text-slate-500">{entry.amount} {item.unit} · {entry.jobName}</span></span><span className="text-xs font-black text-purple-700">${value.toFixed(2)}</span></button>
            ))}</div> : <p className="text-xs font-semibold text-slate-500">No inventory usage has been recorded today.</p>
          )}

          {activeSummaryCard === "deliveries" && (
            <div className="space-y-2">
              {pendingDeliveries.length ? pendingDeliveries.map(delivery => <button type="button" key={delivery.id} onClick={() => onNavigateToScreen ? onNavigateToScreen("scheduling") : onOpenPlaceholder("Scheduling", "📅")} className="flex w-full items-center justify-between rounded-xl border border-[#A9CDEE] bg-white px-3 py-2 text-left hover:border-[#4A9BFF]"><span><span className="block text-xs font-extrabold text-slate-800">{delivery.customer}</span><span className="block text-[10px] text-slate-500">{delivery.date} · {delivery.location}</span></span><span className="text-[10px] font-black uppercase text-orange-700">{delivery.status}</span></button>) : <p className="text-xs font-semibold text-slate-500">No pending inventory deliveries are on the schedule.</p>}
              <button type="button" onClick={() => onNavigateToScreen ? onNavigateToScreen("scheduling") : onOpenPlaceholder("Scheduling", "📅")} className="text-xs font-extrabold text-[#4A9BFF] hover:underline">Open Scheduling <ArrowRight className="inline w-3 h-3" /></button>
            </div>
          )}
        </div>
      )}

      {/* SEARCH AND FILTERS */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            type="text"
            placeholder="Search by name, SKU, manufacturer, barcode, storage location, vendor..."
            className="w-full text-xs bg-[#E3F3FF] border border-[#A9CDEE] rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2 w-full md:w-auto shrink-0 justify-end">
          <button
            onClick={() => setActiveFilterDrawer(!activeFilterDrawer)}
            className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeFilterDrawer 
                ? "bg-blue-100 border-blue-400 text-blue-800" 
                : "bg-[#E3F3FF] border-[#A9CDEE] text-slate-700 hover:bg-[#D5EAFF]"
            }`}
          >
            <Filter className="w-4 h-4" />
            {activeFilterDrawer ? "Close Filters" : "Filters"}
          </button>

          {activeTabFilter !== "all" || selectedCategory || filterWarehouse !== "all" || filterVendor !== "all" ? (
            <button
              onClick={() => {
                setActiveTabFilter("all");
                setSelectedCategory(null);
                setFilterWarehouse("all");
                setFilterVendor("all");
              }}
              className="px-3 py-2 bg-slate-100 text-slate-600 border border-slate-300 rounded-xl text-xs font-semibold cursor-pointer hover:bg-slate-200 transition-all"
            >
              Clear Active Filters
            </button>
          ) : null}

          <button
            onClick={generateLowStockPurchaseList}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" /> Reorder Low Stock
          </button>
        </div>

      </div>

      {/* FILTER DRAWER ACCORDION */}
      {activeFilterDrawer && (
        <div className="p-4 bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-medium text-slate-600 animate-slide-in-right">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-[#342D7E]">Storage Warehouse</label>
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="w-full p-2 bg-[#F5FAFF] border border-[#A9CDEE] rounded-lg focus:outline-none cursor-pointer"
            >
              <option value="all">All Warehouses & Vehicles</option>
              <option value="Warehouse A">Warehouse A</option>
              <option value="Warehouse B">Warehouse B</option>
              <option value="Truck 4">Truck 4</option>
              <option value="Truck 1">Truck 1</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-[#342D7E]">Default Supplier / Vendor</label>
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="w-full p-2 bg-[#F5FAFF] border border-[#A9CDEE] rounded-lg focus:outline-none cursor-pointer"
            >
              <option value="all">All Vendors</option>
              <option value="Home Depot Pro">Home Depot Pro</option>
              <option value="Grainger Industrial">Grainger Industrial</option>
              <option value="Platt Electric">Platt Electric</option>
            </select>
          </div>

          <div className="space-y-1.5 flex flex-col justify-end">
            <div className="flex gap-2">
              <button
                onClick={() => { setSelectedCategory("Materials"); setActiveFilterDrawer(false); }}
                className="flex-1 p-2 bg-[#F5FAFF] border border-[#A9CDEE] hover:border-blue-400 rounded-lg text-center font-bold"
              >
                Materials Only
              </button>
              <button
                onClick={() => { setSelectedCategory("Tools"); setActiveFilterDrawer(false); }}
                className="flex-1 p-2 bg-[#F5FAFF] border border-[#A9CDEE] hover:border-blue-400 rounded-lg text-center font-bold"
              >
                Tools Only
              </button>
              <button
                onClick={() => { setSelectedCategory("Equipment"); setActiveFilterDrawer(false); }}
                className="flex-1 p-2 bg-[#F5FAFF] border border-[#A9CDEE] hover:border-blue-400 rounded-lg text-center font-bold"
              >
                Equipment Only
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONDITIONAL RENDER: LIST VIEW VS PURCHASE HISTORY */}
      {currentView === "purchases" ? (
        <div className="bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-3">
            <div>
              <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Purchase History Ledger</h3>
              <p className="text-[10.5px] mt-0.5 text-slate-500">Chronological list of all scanned invoices, receipts, and material procurements.</p>
            </div>
            <button
              onClick={() => {
                if (onNavigateToScreen) {
                  onNavigateToScreen("documents");
                } else {
                  onOpenPlaceholder("Documents", "📁");
                }
              }}
              className="text-xs text-[#4A9BFF] font-bold hover:underline flex items-center gap-1"
            >
              Open Documents Cabinet <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#A9CDEE]/40 text-[#342D7E] uppercase text-[10px] font-bold">
                  <th className="py-2.5 px-3">Receipt #</th>
                  <th className="py-2.5 px-3">Vendor</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Purchased By</th>
                  <th className="py-2.5 px-3">Items Included</th>
                  <th className="py-2.5 px-3 text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map(rec => (
                  <tr 
                    key={rec.id}
                    onClick={() => {
                      if (onNavigateToScreen) {
                        onNavigateToScreen("documents");
                      } else {
                        onOpenPlaceholder("Documents", "📁");
                      }
                      triggerToast(`Opening receipt document: ${rec.receiptNumber}`);
                    }}
                    className="border-b border-[#A9CDEE]/20 hover:bg-[#F5FAFF]/50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3 font-mono font-black text-[#4A9BFF]">{rec.receiptNumber}</td>
                    <td className="py-3 px-3 font-semibold text-slate-700">{rec.vendor}</td>
                    <td className="py-3 px-3 font-mono text-slate-500">{rec.date}</td>
                    <td className="py-3 px-3 text-slate-600 font-medium">{rec.employee}</td>
                    <td className="py-3 px-3 text-slate-500 italic max-w-xs truncate">{rec.itemsPurchased}</td>
                    <td className="py-3 px-3 text-right font-mono font-black text-slate-800">${rec.totalCost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* MAIN INVENTORY LIST AND DETAILS */
        <div ref={inventoryListRef} className="space-y-4 scroll-mt-4">

          {selectedCategory && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-blue-300 bg-blue-50 px-4 py-3">
              <p className="text-xs font-extrabold text-blue-900">
                Viewing: {selectedCategory === "Materials" ? "All Materials (including Fasteners)" : selectedCategory}
                <span className="ml-2 font-semibold text-blue-700">({filteredInventory.length} items)</span>
              </p>
              <button type="button" onClick={() => showInventorySelection("all", null)} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[10px] font-black text-blue-700 shadow-sm hover:bg-blue-100">
                View All Inventory
              </button>
            </div>
          )}
          
          <div className="bg-[#E3F3FF] border border-[#A9CDEE] rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#C7E3FB] text-[#342D7E] font-extrabold uppercase text-[9.5px] border-b border-[#A9CDEE] tracking-wider">
                    <th className="py-3 px-3 text-center w-12">Photo</th>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Vendor</th>
                    <th className="py-3 px-3 font-mono">SKU / Model</th>
                    <th className="py-3 px-3 text-right font-mono">On Hand</th>
                    <th className="py-3 px-2">Unit</th>
                    <th className="py-3 px-3 text-right">Unit Cost</th>
                    <th className="py-3 px-3 text-right">Selling Price</th>
                    <th className="py-3 px-3 text-right">Value</th>
                    <th className="py-3 px-3">Storage Pin</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-slate-400 font-semibold uppercase tracking-wider">
                        No inventory items match your search. Try changing the search or filters.
                      </td>
                    </tr>
                  ) : (
                    filteredInventory.map(item => {
                      const value = item.quantity * item.unitCost;
                      const isLow = item.quantity > 0 && item.quantity <= item.minQuantity;
                      const isOut = item.quantity === 0;

                      return (
                        <tr
                          key={item.id}
                          onClick={() => {
                            setSelectedItem(item);
                            setIsDetailsPopupOpen(true);
                          }}
                          className={`border-b border-[#A9CDEE]/30 hover:bg-[#F5FAFF] transition-all cursor-pointer relative group ${item.isFavorite ? "bg-amber-50/20" : ""}`}
                        >
                          <td className="py-2.5 px-3 text-center text-lg">{item.photo}</td>
                          <td className="py-2.5 px-4 font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                            {item.isFavorite && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                            {item.name}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-500 uppercase tracking-tight text-[10px]">{item.category}</td>
                          <td className="py-2.5 px-3 text-slate-600 font-medium">{item.vendor}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-400 font-bold">{item.sku}</td>
                          <td className={`py-2.5 px-3 text-right font-mono font-extrabold text-xs ${isOut ? "text-rose-600" : isLow ? "text-amber-600" : "text-slate-800"}`}>
                            {item.quantity}
                          </td>
                          <td className="py-2.5 px-2 text-slate-400 font-mono text-[10px]">{item.unit}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-500">${item.unitCost.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">${item.sellingPrice.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-800">${value.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-slate-500 font-medium flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-[#4A9BFF]" /> {item.location}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              isOut 
                                ? "bg-rose-100 text-rose-700 border border-rose-300"
                               : isLow
                                ? "bg-amber-100 text-amber-700 border border-amber-300"
                                : "bg-emerald-100 text-emerald-700 border border-emerald-300"
                            }`}>
                              {isOut ? "Out" : isLow ? "Low" : "In Stock"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditClick(item);
                                }}
                                className="p-1 bg-white hover:bg-blue-100 border border-[#A9CDEE] rounded-lg text-[#315C9F] transition-colors cursor-pointer"
                                title="Edit Item"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteItem(item.id);
                                }}
                                className="p-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-rose-600 transition-colors cursor-pointer"
                                title="Delete Item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* VISUAL CATEGORY GRID */}
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Fast Category Navigators</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 items-start">
              {visibleCategoryShortcuts.map(cat => (
                <button
                  key={cat.name}
                  onClick={() => showInventorySelection("all", selectedCategory === cat.name ? null : cat.name)}
                  className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                    selectedCategory === cat.name
                      ? "bg-blue-100 border-blue-500 text-blue-900 ring-2 ring-blue-100"
                      : "bg-[#E3F3FF] border-[#A9CDEE] text-slate-700 hover:bg-[#D5EAFF]"
                  }`}
                >
                  <span className="text-xl select-none">{cat.icon}</span>
                  <span className="text-[9.5px] font-extrabold tracking-tight truncate w-full">{cat.name}</span>
                </button>
              ))}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsCategoryMenuOpen(open => !open)}
                  aria-expanded={isCategoryMenuOpen}
                  className="w-full p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 bg-[#E3F3FF] border-dashed border-[#4A9BFF] text-[#342D7E] hover:bg-[#D5EAFF]"
                >
                  <span className="flex items-center text-xl select-none">
                    <Plus className="w-5 h-5" />
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCategoryMenuOpen ? "rotate-180" : ""}`} />
                  </span>
                  <span className="text-[9.5px] font-extrabold tracking-tight w-full">Add Item to Inventory</span>
                </button>

                {isCategoryMenuOpen && (
                  <div className="absolute bottom-full left-0 z-30 mb-2 w-56 max-h-72 overflow-y-auto rounded-2xl border border-[#A9CDEE] bg-[#F5FAFF] p-2 shadow-xl">
                    <p className="px-2 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
                      Choose a category
                    </p>
                    {availableCategoryShortcuts.length > 0 ? availableCategoryShortcuts.map(category => (
                      <button
                        key={category.name}
                        type="button"
                        onClick={() => addCategoryShortcut(category.name)}
                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold text-slate-700 hover:bg-[#D5EAFF]"
                      >
                        <span className="text-base">{category.icon}</span>
                        <span>{category.name}</span>
                      </button>
                    )) : (
                      <p className="px-2.5 py-3 text-xs font-semibold text-slate-500">All categories have been added.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ADD / EDIT ITEM POPUP MODAL */}
      {isAddPopupOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 text-left space-y-5">
            
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/50 pb-3">
              <h3 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-5 h-5 text-[#4A9BFF]" /> {isEditMode ? "Edit Inventory Item" : "Add Inventory Item"}
              </h3>
              <button 
                onClick={() => { setIsAddPopupOpen(false); resetForm(); }}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs font-semibold text-slate-700">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Item Name *</label>
                  <input
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    type="text"
                    placeholder="e.g. Copper Pipe Type L"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none focus:border-[#4A9BFF]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Inventory Category</label>
                  <select
                    value={MATERIAL_CATEGORY_SET.has(formCategory) ? "Materials" : formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none cursor-pointer"
                  >
                    {INVENTORY_NAVIGATION_CATEGORIES.map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
                    <option value="Custom">Custom / Special</option>
                  </select>
                </div>
              </div>

              {MATERIAL_CATEGORY_SET.has(formCategory) && (
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Material Type *</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none cursor-pointer"
                  >
                    {MATERIAL_CATEGORIES.map(category => (
                      <option key={category} value={category}>{category === "Lumber" ? "Wood / Lumber" : category}</option>
                    ))}
                  </select>
                  <p className="text-[10px] font-medium text-slate-500">Fasteners, wood, concrete, tile, and the other choices here are all grouped under Materials.</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Vendor / Supplier</label>
                  <input
                    value={formVendor}
                    onChange={(e) => setFormVendor(e.target.value)}
                    type="text"
                    placeholder="Home Depot, Platt, etc."
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Manufacturer</label>
                  <input
                    value={formManufacturer}
                    onChange={(e) => setFormManufacturer(e.target.value)}
                    type="text"
                    placeholder="Weyerhaeuser, Southwire"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">SKU / Model Number</label>
                  <input
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    type="text"
                    placeholder="SPF-248-KD"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Barcode (UPC)</label>
                  <input
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                    type="text"
                    placeholder="e.g. 032054110022"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">QR Code Label</label>
                  <input
                    value={formQrCode}
                    onChange={(e) => setFormQrCode(e.target.value)}
                    type="text"
                    placeholder="QR-SPF-248"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Storage Location Pin</label>
                  <input
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    type="text"
                    placeholder="e.g. Warehouse A - Bay 2"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Qty On Hand</label>
                  <input
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.currentTarget.select()}
                    type="number"
                    min="0"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono text-right"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Min Threshold</label>
                  <input
                    value={formMinQty}
                    onChange={(e) => setFormMinQty(parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.currentTarget.select()}
                    type="number"
                    min="0"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono text-right"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Max Threshold</label>
                  <input
                    value={formMaxQty}
                    onChange={(e) => setFormMaxQty(parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.currentTarget.select()}
                    type="number"
                    min="0"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono text-right"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Unit Cost ($)</label>
                  <input
                    value={formUnitCost}
                    onChange={(e) => setFormUnitCost(parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.currentTarget.select()}
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono text-right"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Selling Price ($)</label>
                  <input
                    value={formSellingPrice}
                    onChange={(e) => setFormSellingPrice(parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.currentTarget.select()}
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono text-right"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Item Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Technical specifications, structural usage guidelines..."
                  rows={2}
                  className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between border-t border-[#A9CDEE]/50 pt-4">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      checked={formIsFavorite}
                      onChange={(e) => setFormIsFavorite(e.target.checked)}
                      type="checkbox"
                      className="w-4 h-4 rounded text-blue-500 border-slate-300"
                    />
                    Save to Favorite Materials
                  </label>

                  {MATERIAL_EXPENSE_CATEGORIES.has(formCategory) && (
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        checked={formLogExpense}
                        onChange={(e) => setFormLogExpense(e.target.checked)}
                        type="checkbox"
                        className="w-4 h-4 rounded text-blue-500 border-slate-300"
                      />
                      {isEditMode ? "Also log this change as a Materials expense" : "Also log purchase as a Materials expense"}
                    </label>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-[9.5px] uppercase font-bold text-slate-400">Selector Glyph:</span>
                    <select
                      value={formPhoto}
                      onChange={(e) => setFormPhoto(e.target.value)}
                      className="p-1 border border-[#A9CDEE] rounded cursor-pointer"
                    >
                      <option value="📦">📦 Generic Box</option>
                      <option value="🪵">🪵 Lumber Wood</option>
                      <option value="🔧">🔧 Tool Wrench</option>
                      <option value="🔌">🔌 Drill Plug</option>
                      <option value="💧">💧 Fluid/Copper</option>
                      <option value="⚡">⚡ Electrical wire</option>
                      <option value="🧱">🧱 Concrete brick</option>
                      <option value="⚙️">⚙️ Heavy Equipment</option>
                      <option value="🎨">🎨 Paint can</option>
                      <option value="🛡️">🛡️ Safety shield</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setIsAddPopupOpen(false); resetForm(); }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingItem}
                    className="px-5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] disabled:cursor-not-allowed disabled:opacity-60 text-white rounded-xl text-xs font-black shadow-sm"
                  >
                    {isSavingItem ? "Saving…" : isEditMode ? "Save Inventory Item" : "Add Inventory Item"}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* INVENTORY DETAILS POPUP MODAL */}
      {isDetailsPopupOpen && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 text-left space-y-6">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/50 pb-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl select-none">{selectedItem.photo}</span>
                <div>
                  <h3 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                    {selectedItem.name}
                    {selectedItem.isFavorite && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
                    SKU: {selectedItem.sku} • Category: {selectedItem.category}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsDetailsPopupOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              
              <div className="bg-[#F5FAFF] p-3.5 rounded-2xl border border-[#A9CDEE]/60">
                <p className="text-[9.5px] uppercase text-slate-400 font-bold">Qty On Hand</p>
                <p className="text-2xl font-mono font-black text-slate-800 mt-0.5">{selectedItem.quantity} <span className="text-xs text-slate-400 font-sans font-semibold">{selectedItem.unit}</span></p>
                <span className="text-[9px] text-slate-400 block mt-1">Min Level: {selectedItem.minQuantity} | Max: {selectedItem.maxQuantity}</span>
              </div>

              <div className="bg-[#F5FAFF] p-3.5 rounded-2xl border border-[#A9CDEE]/60">
                <p className="text-[9.5px] uppercase text-slate-400 font-bold">Unit Cost</p>
                <p className="text-2xl font-mono font-black text-slate-800 mt-0.5">${selectedItem.unitCost.toFixed(2)}</p>
                <span className="text-[9px] text-slate-400 block mt-1">Avg Cost: ${(selectedItem.unitCost * 0.98).toFixed(2)} (Last Order)</span>
              </div>

              <div className="bg-[#F5FAFF] p-3.5 rounded-2xl border border-[#A9CDEE]/60">
                <p className="text-[9.5px] uppercase text-slate-400 font-bold">Selling / Retail Price</p>
                <p className="text-2xl font-mono font-black text-[#4A9BFF] mt-0.5">${selectedItem.sellingPrice.toFixed(2)}</p>
                <span className="text-[9px] text-slate-400 block mt-1">Gross Margin: {(((selectedItem.sellingPrice - selectedItem.unitCost) / selectedItem.sellingPrice) * 100).toFixed(1)}%</span>
              </div>

              <div className="bg-[#F5FAFF] p-3.5 rounded-2xl border border-[#A9CDEE]/60">
                <p className="text-[9.5px] uppercase text-slate-400 font-bold">Calculated Assets Value</p>
                <p className="text-2xl font-mono font-black text-emerald-600 mt-0.5">${(selectedItem.quantity * selectedItem.unitCost).toLocaleString()}</p>
                <span className="text-[9px] text-slate-400 block mt-1">Selling Value: ${(selectedItem.quantity * selectedItem.sellingPrice).toLocaleString()}</span>
              </div>

            </div>

            {/* Left/Right Main layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs text-slate-600 font-semibold">
              
              {/* Left 2 Columns */}
              <div className="lg:col-span-2 space-y-5">
                
                <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#A9CDEE]/40 space-y-3">
                  <h4 className="text-[10px] uppercase font-bold text-[#342D7E] tracking-wider">Specifications & Coordinates</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-4">
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Barcode (UPC)</span>
                      <span className="font-mono text-slate-700 font-black">{selectedItem.barcode || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">QR Label</span>
                      <span className="font-mono text-slate-700 font-black">{selectedItem.qrCode || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Manufacturer</span>
                      <span className="text-slate-700 font-black">{selectedItem.manufacturer || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Storage Coordinates</span>
                      <span className="text-slate-700 font-black">{selectedItem.location}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Custodian Employee</span>
                      <span className="text-slate-700 font-black">{selectedItem.assignedEmployee || "Unassigned"}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Primary Supplier</span>
                      <span className="text-slate-700 font-black">{selectedItem.vendor}</span>
                    </div>
                  </div>

                  {selectedItem.customFields && selectedItem.customFields.length > 0 && (
                    <div className="border-t border-[#A9CDEE]/20 pt-3 space-y-1.5">
                      <span className="text-[9.5px] uppercase text-[#342D7E] font-bold block">Special Custom Attributes</span>
                      <div className="flex flex-wrap gap-2">
                        {selectedItem.customFields.map((field, i) => (
                          <span key={i} className="px-2 py-1 bg-[#E3F3FF] border border-[#A9CDEE]/40 rounded text-[10.5px] font-bold text-slate-700">
                            <span className="text-blue-700">{field.key}:</span> {field.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-[#A9CDEE]/20 pt-3 space-y-1">
                    <span className="text-[9px] text-slate-400 block uppercase font-bold">Usage Description</span>
                    <p className="text-slate-600 leading-normal font-sans font-medium">{selectedItem.description || "No manual product description logged yet."}</p>
                  </div>
                  
                  {selectedItem.notes && (
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-slate-600 text-[11px] font-sans font-medium">
                      <span className="font-bold text-blue-700 block mb-0.5">Custody & Handling Notes</span>
                      {selectedItem.notes}
                    </div>
                  )}
                </div>

                {/* HISTORICAL QUANTITY ADJUSTMENT JOURNAL */}
                <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#A9CDEE]/40 space-y-3">
                  <h4 className="text-[10px] uppercase font-bold text-[#342D7E] tracking-wider flex items-center justify-between">
                    <span>Audit Trail & Quantity History</span>
                    <span className="text-[9px] font-mono text-slate-400 font-bold">Activity Log</span>
                  </h4>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto">
                    {selectedItem.quantityHistory.length === 0 ? (
                      <p className="text-slate-400 text-center py-4">No logged adjustments for this material node.</p>
                    ) : (
                      selectedItem.quantityHistory.map((log, idx) => (
                        <div key={idx} className="p-2.5 bg-white border border-[#A9CDEE]/20 rounded-xl flex items-center justify-between text-[11px]">
                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-700">{log.notes || `Stock adjusted via ${log.type}`}</p>
                            <span className="text-[9px] text-slate-400 font-mono">{log.date} • {log.type}</span>
                          </div>
                          <div className="text-right">
                            <span className={`font-mono font-black text-xs block ${log.amount > 0 ? "text-emerald-600" : log.amount < 0 ? "text-rose-600" : "text-slate-600"}`}>
                              {log.amount > 0 ? `+${log.amount}` : log.amount}
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono block">End Stock: {log.current}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Right Sidebar actions */}
              <div className="space-y-4">
                
                <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#A9CDEE]/40 space-y-2.5">
                  <h4 className="text-[10px] uppercase font-bold text-[#342D7E] tracking-wider">Custodian Dispatch</h4>
                  
                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-400 block uppercase font-bold">Assigned Crew / Vehicle</span>
                    <span className="text-slate-700 font-bold block bg-white p-2 border border-[#A9CDEE]/30 rounded-lg">
                      {selectedItem.assignedVehicle || "Unassigned (Main Warehouse Stock)"}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-400 block uppercase font-bold">Material Custodian</span>
                    <span className="text-slate-700 font-bold block bg-white p-2 border border-[#A9CDEE]/30 rounded-lg">
                      {selectedItem.assignedEmployee || "Unassigned"}
                    </span>
                  </div>
                </div>

                <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#A9CDEE]/40 space-y-2">
                  <h4 className="text-[10px] uppercase font-bold text-[#342D7E] tracking-wider">Actions Registry</h4>

                  <button
                    onClick={() => {
                      setQuickActionType("Receive");
                      setIsQuickActionModalOpen(true);
                    }}
                    className="w-full text-left p-2.5 bg-white hover:bg-slate-50 border border-[#A9CDEE]/40 rounded-xl text-xs font-bold text-[#342D7E] flex items-center justify-between"
                  >
                    <span>Receive / Check-in Shipment</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    onClick={() => {
                      setQuickActionType("Remove");
                      setIsQuickActionModalOpen(true);
                    }}
                    className="w-full text-left p-2.5 bg-white hover:bg-slate-50 border border-[#A9CDEE]/40 rounded-xl text-xs font-bold text-[#342D7E] flex items-center justify-between"
                  >
                    <span>Remove / Consume Inventory</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    onClick={() => {
                      setQuickActionType("Transfer");
                      setIsQuickActionModalOpen(true);
                    }}
                    className="w-full text-left p-2.5 bg-white hover:bg-slate-50 border border-[#A9CDEE]/40 rounded-xl text-xs font-bold text-[#342D7E] flex items-center justify-between"
                  >
                    <span>Transfer Storage Location</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    onClick={() => {
                      setQuickActionType("AssignJob");
                      setIsQuickActionModalOpen(true);
                    }}
                    className="w-full text-left p-2.5 bg-white hover:bg-slate-50 border border-[#A9CDEE]/40 rounded-xl text-xs font-bold text-blue-700 flex items-center justify-between"
                  >
                    <span>Dispatch Material to Active Job</span>
                    <Briefcase className="w-4 h-4 text-blue-400" />
                  </button>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={() => handleEditClick(selectedItem)}
                      className="p-2.5 bg-white hover:bg-slate-50 border border-[#A9CDEE]/40 rounded-xl text-center font-bold text-slate-600 text-xs"
                    >
                      Edit Inventory Item
                    </button>
                    <button
                      onClick={() => handleDeleteItem(selectedItem.id)}
                      className="p-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-center font-bold text-rose-600 text-xs"
                    >
                      Delete Item
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-[#F5FAFF] rounded-2xl border border-[#A9CDEE]/40 space-y-2">
                  <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Module Integrations</h4>
                  <div className="flex flex-col gap-1.5 text-[10.5px]">
                    <button
                      onClick={() => {
                        setIsDetailsPopupOpen(false);
                        if (onNavigateToScreen) {
                          onNavigateToScreen("jobs");
                        } else {
                          onOpenPlaceholder("Jobs", "💼");
                        }
                        triggerToast(`Opening jobs related to ${selectedItem.name}`);
                      }}
                      className="text-left font-bold text-[#4A9BFF] hover:underline block"
                    >
                      💼 View Jobs Using This Material
                    </button>
                    <button
                      onClick={() => {
                        setIsDetailsPopupOpen(false);
                        if (onNavigateToScreen) {
                          onNavigateToScreen("revenue");
                        } else {
                          onOpenPlaceholder("Revenue", "📈");
                        }
                      }}
                      className="text-left font-bold text-[#4A9BFF] hover:underline block"
                    >
                      📈 View Cost / Revenue Contribution
                    </button>
                    <button
                      onClick={() => {
                        setIsDetailsPopupOpen(false);
                        if (onNavigateToScreen) {
                          onNavigateToScreen("documents");
                        } else {
                          onOpenPlaceholder("Documents", "📁");
                        }
                      }}
                      className="text-left font-bold text-[#4A9BFF] hover:underline block"
                    >
                      📁 View Material Quality Certificates
                    </button>
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* QUICK ACTIONS MODAL DIALOG (INSIDE DETAILS) */}
      {isQuickActionModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[60] p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-md shadow-2xl p-6 text-left space-y-4">
            
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-2">
              <h4 className="text-xs font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
                Quick Action: {quickActionType}
              </h4>
              <button 
                onClick={() => setIsQuickActionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold text-slate-700">
              
              {["Receive", "Remove", "Correct", "Waste", "Damage", "Reserve", "AssignJob"].includes(quickActionType) && (
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Quantity ({selectedItem.unit})</label>
                  <input
                    value={quickActionQty}
                    onChange={(e) => setQuickActionQty(parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.currentTarget.select()}
                    type="number"
                    min="1"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl font-mono text-right"
                  />
                </div>
              )}

              {["Transfer", "AssignJob", "AssignVehicle", "AssignEmployee"].includes(quickActionType) && (
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                    {quickActionType === "Transfer" ? "New Warehouse Bin / Shelf" :
                     quickActionType === "AssignJob" ? "Target Job / Coordinates" :
                     quickActionType === "AssignVehicle" ? "Target Vehicle / Truck" : "Target Employee Name"}
                  </label>
                  <input
                    value={quickActionTarget}
                    onChange={(e) => setQuickActionTarget(e.target.value)}
                    type="text"
                    placeholder="e.g. Truck 4, Job #1021, Warehouse B"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Adjustment Audit Note</label>
                <input
                  value={quickActionNotes}
                  onChange={(e) => setQuickActionNotes(e.target.value)}
                  type="text"
                  placeholder="e.g. Restocked post framing repairs"
                  className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl"
                />
              </div>

              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-[10.5px] font-sans font-medium text-slate-600 flex items-start gap-1.5">
                <Info className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Every manual inventory adjustment triggers an activity log for tracking purposes.</span>
              </div>

              <div className="flex gap-2 justify-end border-t border-[#A9CDEE]/40 pt-3">
                <button
                  onClick={() => setIsQuickActionModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={executeQuickAction}
                  className="px-5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-bold rounded-lg"
                >
                  Verify & Log Adjustments
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* SNAPSHOT AI CAMERA POPUP DIALOG */}
      {isSnapshotAIModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-xl shadow-2xl p-6 text-left space-y-4">
            
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-2">
              <h3 className="text-xs font-sans font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-5 h-5 text-indigo-500 animate-pulse" /> OwnersLOCAL Snapshot AI Camera
              </h3>
              <button 
                onClick={() => { 
                  setIsSnapshotAIModalOpen(false); 
                  setSnapshotStage("camera"); 
                  triggerToast("Inventory update canceled.");
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {snapshotStage === "camera" && (
              <div className="space-y-4">
                <input
                  type="file"
                  ref={localCameraInputRef}
                  onChange={handleLocalCameraCapture}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  style={{ display: "none" }}
                />

                {ocrError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-[11px] font-sans font-medium text-rose-700">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{ocrError}</span>
                  </div>
                )}

                <div
                  onClick={() => localCameraInputRef.current?.click()}
                  className="bg-slate-950 aspect-video rounded-2xl relative overflow-hidden flex items-center justify-center border-2 border-dashed border-[#A9CDEE] cursor-pointer hover:border-indigo-400 transition-colors"
                >
                  <div className="text-center p-6 text-slate-500 space-y-1.5 z-10">
                    <Camera className="w-10 h-10 mx-auto text-slate-600" />
                    <p className="text-xs font-bold font-sans text-slate-400">Tap to take a photo or upload an image</p>
                    <p className="text-[10px] font-mono text-slate-600">Receipt, delivery slip, product label/barcode -- or just the items themselves</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => localCameraInputRef.current?.click()}
                  className="w-full py-3 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-all hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-4 h-4" /> Take or Upload Photo
                </button>
              </div>
            )}

            {snapshotStage === "processing" && (
              <div className="py-12 text-center space-y-4">
                <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">Processing Scanned Items</h4>
                  <p className="text-[10.5px] text-slate-500 max-w-xs mx-auto leading-relaxed font-sans font-medium">
                    Reading receipt text (or visually counting the items in the photo) and matching against the company master inventory index...
                  </p>
                </div>
              </div>
            )}

            {snapshotStage === "review" && aiSuggestions && (() => {
              const receiptTotal = scanReceiptTotal(aiSuggestions);
              const allChecked = aiSuggestions.items.length > 0 && selectedScanItems.every(Boolean);
              // No vendor/total/cost/sku on any item -- there's no receipt or label at
              // all, so these came from the AI visually counting physical stock in the
              // photo rather than reading text. Quantities there are estimates, not
              // reads, so let the owner correct the count before it hits inventory.
              const isVisualScan = !aiSuggestions.vendor && aiSuggestions.total == null
                && aiSuggestions.items.every(item => item.unitCost == null && !item.sku && !item.barcode);
              return (
              <div className="space-y-4 text-xs text-slate-600 font-semibold">
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-2 text-[11px] font-sans font-medium">
                  <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-indigo-800 block">Scan complete — {aiSuggestions.items.length} item{aiSuggestions.items.length === 1 ? "" : "s"} found</span>
                    <span>{isVisualScan ? "Visually estimated from the photo -- check the counts below before confirming." : `${aiSuggestions.vendor || "Vendor not detected"}${aiSuggestions.purchaseDate ? ` · ${aiSuggestions.purchaseDate}` : ""}`}</span>
                  </div>
                </div>

                <div className="bg-[#F5FAFF] border border-[#A9CDEE]/50 rounded-xl overflow-hidden">
                  <label className="flex items-center gap-2.5 p-3 border-b border-[#A9CDEE]/40 bg-[#E3F3FF] cursor-pointer">
                    <input type="checkbox" checked={allChecked} onChange={e => toggleAllScanItems(e.target.checked)} className="w-4 h-4 accent-[#4A9BFF]" />
                    <span className="text-[11px] font-black text-[#1F3557] uppercase tracking-wide">Add all items to inventory</span>
                  </label>

                  <div className="divide-y divide-[#A9CDEE]/30">
                    {aiSuggestions.items.map((item, index) => {
                      const match = findInventoryMatch(item);
                      const lineCost = item.unitCost != null ? item.unitCost : null;
                      return (
                        <div key={index} className="flex items-start gap-2.5 p-3 hover:bg-white/60">
                          <input
                            type="checkbox"
                            checked={!!selectedScanItems[index]}
                            onChange={e => setSelectedScanItems(prev => prev.map((v, i) => i === index ? e.target.checked : v))}
                            className="w-4 h-4 mt-0.5 accent-[#4A9BFF] shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                              {isVisualScan ? (
                                <span className="flex items-center gap-1.5 text-slate-800 font-black">
                                  <input
                                    type="number"
                                    min={0}
                                    value={item.quantity ?? 0}
                                    onChange={e => setAiSuggestions(prev => prev ? { ...prev, items: prev.items.map((it, i) => i === index ? { ...it, quantity: Number(e.target.value) } : it) } : prev)}
                                    onClick={e => e.stopPropagation()}
                                    className="w-14 rounded-lg border border-[#A9CDEE] px-1.5 py-1 text-xs font-mono font-black text-center"
                                  /> × {item.name || "Unnamed item"}{item.unit ? ` (${item.unit})` : ""}
                                </span>
                              ) : (
                                <span className="text-slate-800 font-black">
                                  {item.quantity != null ? `${item.quantity} × ` : ""}{item.name || "Unnamed item"}
                                </span>
                              )}
                              {!isVisualScan && <span className="font-mono text-slate-800 font-black">{lineCost != null ? `$${lineCost.toFixed(2)} ea` : "Cost not detected"}</span>}
                            </div>
                            <div className="text-[9.5px] text-slate-400 font-medium mt-0.5">
                              {isVisualScan ? "Visually estimated -- adjust the count if it's off" : (item.sku ? `SKU ${item.sku}` : "No SKU detected")}
                              {match ? ` · Restocks existing "${match.name}" (${match.quantity} on hand)` : " · Will be added as a new item"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between p-3 border-t border-[#A9CDEE]/40 bg-[#E3F3FF]">
                    <span className="text-[10px] uppercase font-bold text-[#5E7393] tracking-wide">Receipt Total</span>
                    <span className="font-mono text-sm text-[#1F3557] font-black">{receiptTotal > 0 ? `$${receiptTotal.toFixed(2)}` : "Not detected"}</span>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 p-3 bg-white border border-[#A9CDEE]/60 rounded-xl cursor-pointer">
                  <input type="checkbox" checked={logScanExpense} onChange={e => setLogScanExpense(e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#4A9BFF]" />
                  <span>
                    <span className="text-slate-800 font-black block">
                      {receiptTotal > 0 ? `Log $${receiptTotal.toFixed(2)} to Materials expenses` : "Log this receipt as a Materials expense"}
                    </span>
                    <span className="text-[9.5px] text-slate-400 font-medium">Posts to Accounting and reduces revenue, regardless of which items above are added to inventory.</span>
                  </span>
                </label>
                {receiptTotal <= 0 && (
                  <p className="text-[10px] text-amber-700 font-sans font-semibold">No receipt total or per-item costs were legible — confirming will update inventory but won't log an expense. Log it manually from Revenue if needed.</p>
                )}

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={() => {
                      setIsSnapshotAIModalOpen(false);
                      setSnapshotStage("camera");
                      setAiSuggestions(null);
                      setSelectedScanItems([]);
                      setScannedPhoto(null);
                      triggerToast("Inventory update canceled.");
                    }}
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setSnapshotStage("camera"); setAiSuggestions(null); setSelectedScanItems([]); setScannedPhoto(null); }}
                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold"
                  >
                    Retake Photo
                  </button>
                  <button
                    onClick={handleApproveAISuggestion}
                    className="px-5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-black rounded-lg uppercase tracking-wider"
                  >
                    Confirm & Update Ledger
                  </button>
                </div>
              </div>
              );
            })()}

          </div>
        </div>
      )}

      {/* BARCODE / QR SCANNER SIMULATION POPUP */}
      {isScannerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-sm shadow-2xl p-6 text-left space-y-4">
            
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-2">
              <h3 className="text-xs font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
                Simulated {scannerType === "barcode" ? "Barcode Scan" : "QR Code Scan"}
              </h3>
              <button 
                onClick={() => setIsScannerModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold text-slate-700">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-[10.5px]">
                Type an existing SKU or code below to simulate a laser scan, or enter a new SKU to test adding an inventory item.
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Simulated Optical Scan Code</label>
                <input
                  value={scanInputCode}
                  onChange={(e) => setScanInputCode(e.target.value)}
                  type="text"
                  placeholder="e.g. SPF-248-KD, 032054110022"
                  className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl font-mono text-center text-sm font-bold tracking-widest uppercase focus:outline-none"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleScannerSubmit(); }}
                />
              </div>

              <div className="flex flex-col gap-1 text-[10px] text-slate-400">
                <p>💡 Sample SKUs to scan:</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span 
                    onClick={() => setScanInputCode("032054110022")}
                    className="px-2 py-0.5 bg-white border rounded cursor-pointer hover:border-blue-400 font-mono font-bold"
                  >
                    032054110022
                  </span>
                  <span 
                    onClick={() => setScanInputCode("DEW-DCD771")}
                    className="px-2 py-0.5 bg-white border rounded cursor-pointer hover:border-blue-400 font-mono font-bold"
                  >
                    DEW-DCD771
                  </span>
                  <span 
                    onClick={() => setScanInputCode("COP-34-10")}
                    className="px-2 py-0.5 bg-white border rounded cursor-pointer hover:border-blue-400 font-mono font-bold"
                  >
                    COP-34-10
                  </span>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-[#A9CDEE]/30">
                <button
                  onClick={() => setIsScannerModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleScannerSubmit}
                  className="px-5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-bold rounded-lg"
                >
                  Submit Code
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* SPREADSHEET IMPORT MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-lg shadow-2xl p-6 text-left space-y-4">
            
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-2">
              <h3 className="text-xs font-sans font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                <Upload className="w-5 h-5 text-blue-500" /> Import Ledger Columns
              </h3>
              <button 
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-semibold text-slate-700">
              <p className="text-[11px] text-slate-500 font-sans font-medium">
                Upload a CSV spreadsheet file, or paste comma-separated rows directly below.
              </p>

              <div className="bg-white p-3 rounded-xl border border-[#A9CDEE] space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 block">Select CSV or Excel (.xlsx, .xls) File</label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const fileExt = file.name.split('.').pop()?.toLowerCase();
                      if (fileExt === 'xlsx' || fileExt === 'xls') {
                        const fileReader = new FileReader();
                        fileReader.onload = (event) => {
                          try {
                            const data = new Uint8Array(event.target?.result as ArrayBuffer);
                            const workbook = XLSX.read(data, { type: 'array' });
                            const firstSheetName = workbook.SheetNames[0];
                            const worksheet = workbook.Sheets[firstSheetName];
                            const csv = XLSX.utils.sheet_to_csv(worksheet);
                            setImportText(csv);
                            triggerToast(`📂 Excel sheet loaded: ${file.name}`);
                          } catch (err) {
                            triggerToast("⚠️ Failed to parse Excel spreadsheet file.");
                          }
                        };
                        fileReader.readAsArrayBuffer(file);
                      } else {
                        const fileReader = new FileReader();
                        fileReader.onload = (event) => {
                          const text = event.target?.result as string;
                          setImportText(text);
                          triggerToast(`📂 CSV file loaded: ${file.name}`);
                        };
                        fileReader.readAsText(file);
                      }
                    }
                  }}
                  className="w-full text-xs text-slate-600 cursor-pointer focus:outline-none"
                />
              </div>

              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Name,Category,Vendor,SKU,Barcode,Quantity,Unit,Location,UnitCost,SellingPrice&#10;OSB Framing Sheet,Lumber,Home Depot,OSB-12-8,03992110292,80,pcs,Warehouse B,21.50,34.00"
                rows={4}
                className="w-full p-2.5 bg-white border border-[#A9CDEE] rounded-xl font-mono text-xs focus:outline-none"
              />

              <div className="flex gap-2 justify-end pt-2 border-t border-[#A9CDEE]/30">
                <button
                  onClick={() => { setIsImportModalOpen(false); setImportText(""); }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="px-5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-bold rounded-lg cursor-pointer"
                >
                  Import Rows Now
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-md shadow-2xl p-6 text-left space-y-4">
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-2">
              <h3 className="text-xs font-sans font-extrabold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                <Trash2 className="w-5 h-5 text-rose-500" /> Remove Inventory Item
              </h3>
              <button 
                onClick={() => setDeletingItem(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="text-xs font-semibold text-slate-700 space-y-2">
              <p className="text-sm text-slate-800">
                Are you sure you want to permanently delete <span className="font-extrabold text-rose-600">{deletingItem.name}</span> from inventory?
              </p>
              <p className="text-[11px] text-slate-500">
                SKU: {deletingItem.sku} | Location: {deletingItem.location}
              </p>
              <p className="text-[10px] text-amber-600 font-bold bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                ⚠️ Warning: This action cannot be undone. All transaction and usage logs for this item will be removed.
              </p>
            </div>

            <div className="flex gap-2.5 justify-end pt-2 border-t border-[#A9CDEE]/30">
              <button
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs cursor-pointer transition-colors"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REORDER LOW STOCK MODAL */}
      {reorderModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-xl shadow-2xl p-6 text-left space-y-4">
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-2">
              <h3 className="text-sm font-sans font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingCart className="w-5 h-5 text-amber-500 animate-bounce" /> Auto-Generate Purchase Reorder
              </h3>
              <button 
                onClick={() => setReorderModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs font-semibold text-slate-700 space-y-3">
              <p className="text-xs text-slate-600 font-medium">
                These {reorderCandidates.length} items are below their minimum stock level. Suggested order quantities will restore them to their target level:
              </p>

              <div className="max-h-[220px] overflow-y-auto border border-[#A9CDEE] rounded-2xl bg-white divide-y divide-slate-100">
                {reorderCandidates.map(e => {
                  const reorderQty = e.maxQuantity - e.quantity;
                  const totalCost = reorderQty * e.unitCost;
                  return (
                    <div key={e.id} className="p-3 flex justify-between items-center hover:bg-slate-50 transition-colors">
                      <div>
                        <span className="text-lg mr-2 select-none">{e.photo}</span>
                        <span className="font-extrabold text-slate-800 text-xs">{e.name}</span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          SKU: {e.sku} | Vendor: {e.vendor}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs font-black text-[#342D7E]">
                          +{reorderQty} {e.unit}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Est. Cost: ${totalCost.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex justify-between items-center">
                <span className="text-[11px] text-blue-700 font-extrabold uppercase tracking-wider">Total Proposed Purchase Order:</span>
                <span className="font-mono text-xs font-black text-blue-900">
                  ${reorderCandidates.reduce((acc, e) => acc + ((e.maxQuantity - e.quantity) * e.unitCost), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex gap-2.5 justify-end pt-2 border-t border-[#A9CDEE]/30">
              <button
                onClick={() => setReorderModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-200 transition-colors"
              >
                Cancel PO
              </button>
              <button
                onClick={handleReplenishStock}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs cursor-pointer transition-colors shadow-md flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Approve & Replenish Stock Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FRAMEWORK CONNECTIONS SUMMARY */}
      <div className="p-4 bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl space-y-3 font-sans font-medium text-slate-600">
        <h4 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Inventory Connections</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Dashboard</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Revenue</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Customers</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Leads</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Estimates & Bids</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Scheduling</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Dispatch</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Routes</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Jobs</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Time Clock</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Documents</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Messages</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Roster</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>AI Assistant</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Training</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Settings</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Integrations</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Notifications</span>
          </div>
        </div>
      </div>

      {confirmState && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4" onMouseDown={e => e.target === e.currentTarget && setConfirmState(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <p className="text-sm font-bold text-[#1F3557]">{confirmState.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmState(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
              <button onClick={() => { const run = confirmState.onConfirm; setConfirmState(null); run(); }} className="rounded-xl bg-[#315C9F] px-4 py-2 text-xs font-black text-white">Confirm</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
