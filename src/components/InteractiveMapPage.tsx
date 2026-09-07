import React, { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useDomainActions } from "../hooks/useDomainActions";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  Search, 
  MapPin, 
  User, 
  Wrench, 
  FileText, 
  Sparkles, 
  Navigation, 
  CheckCircle, 
  Plus, 
  Minus,
  Layers, 
  SlidersHorizontal, 
  X, 
  RefreshCw, 
  Truck, 
  Box, 
  DollarSign, 
  Clock, 
  AlertTriangle, 
  ChevronRight, 
  Calendar,
  Building,
  Package,
  ArrowRight,
  TrendingUp,
  FileSpreadsheet,
  Phone,
  Mail,
  Send,
  Trash2,
  Sliders,
  Shield,
  Star,
  Skull,
  UserCheck,
  Zap,
  Activity,
  Maximize2,
  Compass,
  FileCode,
  Sparkle,
  MessageSquare,
  DollarSign as Money,
  Target,
  Edit2,
  Check,
  Eye,
  Camera,
  Layers as LayersIcon,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { composeEmail, composeSms, callNumber } from "../lib/deviceHandoff";

const DFW_FALLBACK = { lat: 32.7767, lng: -96.7970 };

const FitMapToPins: React.FC<{ pins: Array<{ lat: number; lng: number }> }> = ({ pins }) => {
  const map = useMap();
  useEffect(() => {
    if (!map || !pins.length || typeof google === "undefined") return;
    const validPins = pins.filter(pin => Number.isFinite(pin.lat) && Number.isFinite(pin.lng));
    if (!validPins.length) return;
    if (validPins.length === 1) {
      map.setCenter(validPins[0]);
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    validPins.forEach(pin => bounds.extend(pin));
    map.fitBounds(bounds, 64);
  }, [map, pins]);
  return null;
};

// A missing geocode must never be presented as a real location. Callers filter
// non-finite coordinates until Google returns the verified address position.
export function geocodeAddress(address: string, id: string = ""): { lat: number; lng: number } {
  void address;
  void id;
  return { lat: Number.NaN, lng: Number.NaN };
}

export interface InteractiveMapPageProps {
  businessAddresses?: string[];
}

// Territory Schema
interface ServiceTerritory {
  id: string;
  name: string;
  color: string;
  points: Array<{ lat: number; lng: number }>; // coordinate boundaries for Google maps / SVGs
  revenue: number;
  customersCount: number;
  leadsCount: number;
  jobsCount: number;
  techniciansCount: number;
  completionRate: number;
}

const TERRITORY_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];

export const InteractiveMapPage: React.FC<InteractiveMapPageProps> = ({
  businessAddresses
}) => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const {
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
    completedJobsRevenue,
    employees,
    timeClockLogs
  } = useDomainData();
  const { convertLeadToCustomer } = useDomainActions();
  const { navigateToScreen: onNavigateToScreen, logOperationalEvent, triggerNotification } = useNavTelemetry();
  const apiKey = (process.env.GOOGLE_MAPS_PLATFORM_KEY || "").trim();
  const hasValidKey = apiKey !== "";
  const [mapsApiLoaded, setMapsApiLoaded] = useState(false);
  const [mapsApiError, setMapsApiError] = useState(false);
  const [mapsApiDiagnostic, setMapsApiDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    const originalConsoleError = console.error;
    const previousAuthFailure = (window as any).gm_authFailure;

    const recordMapsError = (...args: unknown[]) => {
      const message = args
        .map((value) => {
          if (value instanceof Error) return value.message;
          if (typeof value === "string") return value;
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })
        .join(" ");

      const googleMapsError = message.match(
        /Google Maps JavaScript API error:\s*([A-Za-z0-9]+(?:MapError)?)/i
      );

      if (googleMapsError?.[1]) {
        setMapsApiDiagnostic(googleMapsError[1]);
      }
    };

    console.error = (...args: unknown[]) => {
      recordMapsError(...args);
      originalConsoleError(...args);
    };

    (window as any).gm_authFailure = () => {
      setMapsApiLoaded(false);
      setMapsApiError(true);
      setMapsApiDiagnostic((current) => current || "GoogleMapsAuthenticationFailure");

      if (typeof previousAuthFailure === "function") {
        previousAuthFailure();
      }
    };

    return () => {
      console.error = originalConsoleError;
      if (previousAuthFailure) {
        (window as any).gm_authFailure = previousAuthFailure;
      } else {
        delete (window as any).gm_authFailure;
      }
    };
  }, []);

  // Real default map center, resolved in priority order: real business
  // address -> real device GPS -> DFW fallback -> last position the owner
  // actually viewed (persisted locally). Never a hardcoded arbitrary city.
  const MAP_POSITION_STORAGE_KEY = "ownersLocalOS_lastMapPosition";
  const [resolvedDefaultCenter, setResolvedDefaultCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [currentMapCenter, setCurrentMapCenter] = useState(DFW_FALLBACK);
  const cameraSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (resolvedDefaultCenter) return;

    // 1. Real business address on file.
    // A supplied HQ is resolved by the Google geocoder below. Do not invent
    // coordinates while that request is in flight.
    if (businessAddresses?.[0]?.trim()) return;

    // 2. Last position the owner actually viewed, saved locally.
    try {
      const saved = localStorage.getItem(MAP_POSITION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.lat === "number" && typeof parsed?.lng === "number") {
          setResolvedDefaultCenter(parsed);
          return;
        }
      }
    } catch {
      // ignore malformed storage
    }

    // 3. Real device GPS, if the browser/user allows it.
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setResolvedDefaultCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setResolvedDefaultCenter(DFW_FALLBACK),
        { timeout: 5000 }
      );
      return;
    }

    // 4. DFW fallback -- never Oregon, never an arbitrary hardcoded city.
    setResolvedDefaultCenter(DFW_FALLBACK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessAddresses]);

  useEffect(() => () => {
    if (cameraSaveTimer.current) clearTimeout(cameraSaveTimer.current);
  }, []);

  const handleMapCameraChanged = (center?: { lat: number; lng: number }) => {
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
    setCurrentMapCenter(center);
    if (cameraSaveTimer.current) clearTimeout(cameraSaveTimer.current);

    // Camera events fire continuously while a finger is moving. Writing to
    // synchronous browser storage on every frame can lock up mobile Chrome.
    cameraSaveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(MAP_POSITION_STORAGE_KEY, JSON.stringify(center));
      } catch {
        // ignore storage failures (private browsing, quota, etc.)
      }
    }, 500);
  };

  // Map Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"All" | "Customer" | "Lead" | "Estimate" | "Job" | "Technician" | "Vehicle">("All");
  
  // Advanced Filter Layer Toggles
  const [showCustomers, setShowCustomers] = useState(true);
  const [showLeads, setShowLeads] = useState(true);
  const [showJobs, setShowJobs] = useState(true);
  const [showEstimates, setShowEstimates] = useState(true);
  const [showTechnicians, setShowTechnicians] = useState(true);
  const [showVehicles, setShowVehicles] = useState(true);
  const [showTerritories, setShowTerritories] = useState(true);
  const [showRevenueHeatmap, setShowRevenueHeatmap] = useState(false);
  
  // Specific Sub-Filters
  const [filterPriority, setFilterPriority] = useState("All"); // All, High, Medium, Low
  const [filterJobStatus, setFilterJobStatus] = useState("All"); // All, Scheduled, Traveling, In Progress, Paused, Completed, Emergency
  const [filterLeadStatus, setFilterLeadStatus] = useState("All"); // All, New, Contacted, Qualified, Estimate Sent, Won, Lost
  const [filterCategory, setFilterCategory] = useState("All"); // All, Residential, Commercial
  const [filterTechStatus, setFilterTechStatus] = useState("All"); // All, Available, Traveling, Lunch, Offline, Clocked Out

  const [markerClusterActive, setMarkerClusterActive] = useState(true);

  // Selected Pin State (Opens Right Inspector Panel)
  const [selectedPin, setSelectedPin] = useState<{
    id: string;
    type: "Customer" | "Lead" | "Estimate" | "Job" | "Office" | "Warehouse" | "Technician" | "Vehicle";
    title: string;
    subtitle: string;
    address: string;
    lat: number;
    lng: number;
    raw: any;
  } | null>(null);

  // Inspector Sub-Tabs: "Overview" | "Timeline" | "Notes" | "Dispatch" | "Finance"
  const [inspectorTab, setInspectorTab] = useState<"Overview" | "Timeline" | "Notes" | "Dispatch" | "Finance">("Overview");

  // Local state for interactive inspector notes logging
  const [newNoteText, setNewNoteText] = useState("");
  const [selectedInventoryItem, setSelectedInventoryItem] = useState("");
  const [allocatedInventoryQty, setAllocatedInventoryQty] = useState(1);
  const [interactiveMessages, setInteractiveMessages] = useState<Array<{ sender: string; text: string; time: string }>>([
    { sender: "System", text: "Interactive log stream initialized.", time: "12:00 PM" }
  ]);
  const [chatInput, setChatInput] = useState("");

  // Multi-Select (Lasso Basket) Mode
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedBasketIds, setSelectedBasketIds] = useState<string[]>([]);

  // Vehicles are real — one per technician who has a vehicle name assigned
  // (no fleet CRUD exists yet, so this list starts empty for a new company
  // instead of showing fabricated trucks).
  const [vehicles, setVehicles] = useState<Array<{ id: string; name: string; driver: string; fuel: number; speed: number; eta: number; currentRoute: string; assignedJobs: number }>>([]);

  // Real technicians — one per real employee. Name and clocked-in/on-break/
  // off-duty status come from the real employees + time_clock_logs
  // collections; a real last-known GPS fix (captured at their last clock
  // event) anchors their starting position when one exists. There is no
  // real live GPS feed, so once placed they still animate via the jitter
  // simulation below rather than actual tracked movement — that part
  // remains a known limitation, not something faked as real.
  const [activeTechnicians, setActiveTechnicians] = useState<Array<{
    id: string;
    name: string;
    vehicle: string;
    status: "Available" | "Traveling" | "Lunch" | "Offline" | "Clocked Out";
    lat: number;
    lng: number;
    jobId?: string;
    routeProgress?: number; // 0 to 100
    routePath?: Array<{ lat: number; lng: number }>;
  }>>([]);

  const parseGpsString = (gps: string): { lat: number; lng: number } | null => {
    const match = gps.match(/(\d+(?:\.\d+)?)\s*°\s*([NS])\s*,\s*(\d+(?:\.\d+)?)\s*°\s*([EW])/);
    if (!match) return null;
    const [, latStr, latDir, lngStr, lngDir] = match;
    return {
      lat: parseFloat(latStr) * (latDir === "S" ? -1 : 1),
      lng: parseFloat(lngStr) * (lngDir === "W" ? -1 : 1)
    };
  };

  useEffect(() => {
    setActiveTechnicians(prev => employees.map(er => {
      const existing = prev.find(t => t.id === er.email);
      const myLogs = timeClockLogs.filter(l => l.employeeEmail === er.email);
      const lastLog = [...myLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      const realStatus: "Available" | "Lunch" | "Offline" =
        !lastLog || lastLog.type === "Clock Out" ? "Offline" :
        lastLog.type === "Break Start" ? "Lunch" : "Available";
      const lastRealFix = lastLog ? parseGpsString(lastLog.gps) : null;
      const fallbackFix = geocodeAddress(businessAddresses?.[0] || "Dallas, TX", er.email);
      return {
        id: er.email,
        name: `${er.firstName} ${er.lastName}`.trim(),
        vehicle: existing?.vehicle || "Unassigned",
        // Preserve an in-progress local dispatch ("Traveling" to a job)
        // rather than overwrite it with the plain clocked-in state.
        status: existing?.jobId ? "Traveling" : realStatus,
        lat: existing?.jobId ? existing.lat : (lastRealFix?.lat ?? existing?.lat ?? fallbackFix.lat),
        lng: existing?.jobId ? existing.lng : (lastRealFix?.lng ?? existing?.lng ?? fallbackFix.lng),
        jobId: existing?.jobId,
        routeProgress: existing?.routeProgress,
        routePath: existing?.routePath
      };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, timeClockLogs, businessAddresses]);

  // Service territories start empty. Only owner-created, real territories belong here.
  const [serviceTerritories, setServiceTerritories] = useState<ServiceTerritory[]>([]);

  const territoryStorageKey = useMemo(
    () => `ownerslocal_service_territories:${loggedInUser?.email || "signed-out"}`,
    [loggedInUser?.email]
  );
  const [isCreatingTerritory, setIsCreatingTerritory] = useState(false);
  const [newTerritoryName, setNewTerritoryName] = useState("");
  const [newTerritoryRadius, setNewTerritoryRadius] = useState(8);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(territoryStorageKey);
      setServiceTerritories(saved ? JSON.parse(saved) : []);
    } catch {
      setServiceTerritories([]);
    }
  }, [territoryStorageKey]);

  useEffect(() => {
    localStorage.setItem(territoryStorageKey, JSON.stringify(serviceTerritories));
  }, [serviceTerritories, territoryStorageKey]);

  const [editingTerritoryId, setEditingTerritoryId] = useState<string | null>(null);
  const [editingTerritoryName, setEditingTerritoryName] = useState("");

  // Location Editor Popup States
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhones, setEditPhones] = useState<string[]>([""]);
  const [editAddress, setEditAddress] = useState("");
  const [editCityState, setEditCityState] = useState("");
  const [editZip, setEditZip] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const openLocationEditor = (pin: any) => {
    setSelectedPin(pin);
    
    let name = pin.title || "";
    let email = "";
    let rawPhone = "";
    let rawAddress = pin.address || "";
    
    if (pin.type === "Customer") {
      name = pin.raw?.company || pin.raw?.contact || pin.title || "";
      email = pin.raw?.email || "";
      rawPhone = pin.raw?.phone || "";
      rawAddress = pin.raw?.address || pin.address || "";
    } else if (pin.type === "Lead") {
      name = pin.raw?.name || pin.raw?.company || pin.title || "";
      email = pin.raw?.email || "";
      rawPhone = pin.raw?.phone || "";
      rawAddress = pin.raw?.address || pin.address || "";
    } else if (pin.type === "Job") {
      name = pin.raw?.customer || pin.title || "";
      email = pin.raw?.customerEmail || "";
      rawPhone = pin.raw?.customerPhone || "";
      rawAddress = pin.raw?.customerAddress || pin.raw?.location || pin.address || "";
    } else if (pin.type === "Estimate") {
      name = pin.raw?.customerName || pin.raw?.company || pin.title || "";
      email = pin.raw?.email || "";
      rawPhone = pin.raw?.phone || "";
      rawAddress = pin.raw?.address || pin.address || "";
    }

    setEditName(name);
    setEditEmail(email);

    // Parse phone list
    const parsedPhones = (rawPhone || "").split(",").map(p => p.trim()).filter(Boolean);
    setEditPhones(parsedPhones.length > 0 ? parsedPhones : [""]);

    // Parse address parts
    const parts = (rawAddress || "").split(",").map(s => s.trim()).filter(Boolean);
    const street = parts[0] || "";
    let cityState = "";
    let zip = "";
    if (parts.length >= 3) {
      const lastPart = parts[parts.length - 1];
      const zipMatch = lastPart.match(/\d{5}(?:-\d{4})?$/);
      if (zipMatch) {
        zip = zipMatch[0];
        const statePart = lastPart.slice(0, zipMatch.index).trim();
        cityState = [...parts.slice(1, -1), statePart].filter(Boolean).join(", ");
      } else {
        cityState = parts.slice(1).join(", ");
      }
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
    setEditAddress(street);
    setEditCityState(cityState);
    setEditZip(zip);

    setIsLocationModalOpen(true);
  };

  const handleSaveLocationEdits = () => {
    if (!selectedPin) return;

    const phoneStr = editPhones.map(p => p.trim()).filter(Boolean).join(", ");
    const combinedAddress = [editAddress.trim(), editCityState.trim(), editZip.trim()].filter(Boolean).join(", ");

    if (selectedPin.type === "Customer") {
      setCustomers(prev => prev.map(c => c.id === selectedPin.id ? {
        ...c,
        company: editName,
        contact: c.contact || editName,
        phone: phoneStr,
        email: editEmail,
        address: combinedAddress
      } : c));
    } else if (selectedPin.type === "Lead") {
      setLeads(prev => prev.map(l => l.id === selectedPin.id ? {
        ...l,
        name: editName,
        phone: phoneStr,
        email: editEmail,
        address: combinedAddress
      } : l));
    } else if (selectedPin.type === "Job") {
      setSchedulingEvents(prev => prev.map(evt => evt.id === selectedPin.id ? {
        ...evt,
        customer: editName,
        customerPhone: phoneStr,
        customerEmail: editEmail,
        customerAddress: combinedAddress,
        location: combinedAddress
      } : evt));
    } else if (selectedPin.type === "Estimate") {
      setEstimates(prev => prev.map(est => est.id === selectedPin.id ? {
        ...est,
        customerName: editName,
        phone: phoneStr,
        email: editEmail,
        address: combinedAddress
      } : est));
    }

    // Refresh selected pin on screen
    setSelectedPin(prev => prev ? {
      ...prev,
      title: editName,
      address: combinedAddress,
      subtitle: prev.type === "Customer" 
        ? `Contact: ${editName} | Open Jobs: ${prev.raw?.openJobs || 0} | Balance: $${prev.raw?.outstandingBalance || 0}`
        : prev.type === "Lead"
        ? `Lead Source: ${prev.raw?.source} | Value: $${(prev.raw?.estimatedValue || 0).toLocaleString()} | Status: ${prev.raw?.status || "New"}`
        : prev.subtitle,
      raw: {
        ...prev.raw,
        company: editName,
        contact: prev.raw?.contact || editName,
        phone: phoneStr,
        email: editEmail,
        address: combinedAddress,
        customer: editName,
        customerPhone: phoneStr,
        customerEmail: editEmail,
        customerAddress: combinedAddress,
        location: combinedAddress,
        customerName: editName
      }
    } : null);

    setIsLocationModalOpen(false);
    if (logOperationalEvent) {
      logOperationalEvent("Location Record Saved", `Updated file for ${editName} directly from Interactive Map`, "📍");
    }
  };

  const [geocodedCache, setGeocodedCache] = useState<Record<string, { lat: number, lng: number }>>({});
  const pendingGeocodes = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!mapsApiLoaded || typeof google === "undefined" || !google.maps?.Geocoder) return;

    const geocoder = new google.maps.Geocoder();
    const addressesToGeocode: Array<{ key: string, address: string }> = [];

    const hqAddr = businessAddresses?.find(address => address.trim().length > 0);
    if (hqAddr) {
      const cacheKey = `hq_${hqAddr}`;
      if (!geocodedCache[cacheKey] && !pendingGeocodes.current.has(cacheKey)) {
        addressesToGeocode.push({ key: cacheKey, address: hqAddr });
      }
    }

    customers.forEach(c => {
      const cacheKey = `cust_${c.id}_${c.address}`;
      if (c.address && !geocodedCache[cacheKey] && !pendingGeocodes.current.has(cacheKey)) {
        addressesToGeocode.push({ key: cacheKey, address: c.address });
      }
    });

    leads.forEach(l => {
      const addr = l.address || "";
      if (!addr) return;
      const cacheKey = `lead_${l.id}_${addr}`;
      if (!geocodedCache[cacheKey] && !pendingGeocodes.current.has(cacheKey)) {
        addressesToGeocode.push({ key: cacheKey, address: addr });
      }
    });

    estimates.forEach(e => {
      const linkedCustomer = customers.find(customer => customer.contact === e.customerName || customer.company === e.company || customer.company === e.customerName);
      const addr = e.address || linkedCustomer?.address || "";
      if (!addr) return;
      const cacheKey = `est_${e.id}_${addr}`;
      if (!geocodedCache[cacheKey] && !pendingGeocodes.current.has(cacheKey)) {
        addressesToGeocode.push({ key: cacheKey, address: addr });
      }
    });

    schedulingEvents.forEach(evt => {
      const linkedCustomer = evt.customerId ? customers.find(customer => customer.id === evt.customerId) : undefined;
      const addr = evt.customerAddress || evt.location || linkedCustomer?.address || "";
      if (!addr) return;
      const cacheKey = `evt_${evt.id}_${addr}`;
      if (!geocodedCache[cacheKey] && !pendingGeocodes.current.has(cacheKey)) {
        addressesToGeocode.push({ key: cacheKey, address: addr });
      }
    });

    if (addressesToGeocode.length > 0) {
      // Process a small subset (up to 5 at a time) to respect rate limits
      const subset = addressesToGeocode.slice(0, 5);
      subset.forEach(({ key, address }) => {
        // Geocoder callbacks are asynchronous. Without tracking requests that
        // are already in flight, each cache update starts the same requests
        // again and can overwhelm the browser immediately after map load.
        pendingGeocodes.current.add(key);
        geocoder.geocode({ address }, (results, status) => {
          pendingGeocodes.current.delete(key);
          if (status === "OK" && results?.[0]?.geometry?.location) {
            const loc = results[0].geometry.location;
            setGeocodedCache(prev => ({
              ...prev,
              [key]: { lat: loc.lat(), lng: loc.lng() }
            }));
            if (key.startsWith("hq_")) {
              const center = { lat: loc.lat(), lng: loc.lng() };
              setResolvedDefaultCenter(center);
              setCurrentMapCenter(center);
            }
          }
        });
      });
    }
  }, [mapsApiLoaded, customers, leads, estimates, schedulingEvents, businessAddresses, geocodedCache]);

  // Only show an office when the owner has supplied a real business address.
  // Never manufacture facilities or locations for a new account.
  const fixedFacilities = useMemo(() => {
    const hqAddr = businessAddresses?.find(address => address.trim().length > 0);
    if (!hqAddr) return [];
    const hqCoords = geocodedCache[`hq_${hqAddr}`] || geocodeAddress(hqAddr, "office_hq");
    return [
      { id: "office_hq", type: "Office" as const, title: "Business HQ", subtitle: "Primary business location", address: hqAddr, lat: hqCoords.lat, lng: hqCoords.lng, raw: {} }
    ];
  }, [businessAddresses, geocodedCache]);

  // Sync / Auto Geocode pins from existing lists
  const allPins = useMemo(() => {
    const list: Array<{
      id: string;
      type: "Customer" | "Lead" | "Estimate" | "Job" | "Office" | "Warehouse" | "Technician" | "Vehicle";
      title: string;
      subtitle: string;
      address: string;
      lat: number;
      lng: number;
      raw: any;
    }> = [];

    // 2. Add Offices & Warehouses
    fixedFacilities.forEach(f => list.push(f));

    // 3. Customers (Blue)
    if (showCustomers) {
      customers.forEach(c => {
        // A customer with no address on file has no real location -- pin them
        // in a fabricated city instead of just leaving them off the map, and
        // the marker looks legitimate while pointing nowhere near them.
        if (!c.address) return;
        const addressStr = c.address;
        const cacheKey = `cust_${c.id}_${addressStr}`;
        const coords = geocodedCache[cacheKey] || geocodeAddress(addressStr, c.id);
        list.push({
          id: c.id,
          type: "Customer",
          title: c.contact ? `${c.contact} (${c.company || "Residential"})` : c.company || "Unnamed Customer",
          subtitle: `Contact: ${c.contact || "N/A"} | Open Jobs: ${c.openJobs || 0} | Balance: $${c.outstandingBalance || 0}`,
          address: addressStr,
          lat: coords.lat,
          lng: coords.lng,
          raw: c
        });
      });
    }

    // 4. Leads (Purple)
    if (showLeads) {
      leads.forEach(l => {
        const address = l.address || "";
        if (!address) return;
        const cacheKey = `lead_${l.id}_${address}`;
        const coords = geocodedCache[cacheKey] || geocodeAddress(address, l.id);
        list.push({
          id: l.id,
          type: "Lead",
          title: l.name ? `${l.name} (${l.company || "Lead"})` : l.company || "Unnamed Lead",
          subtitle: `Lead Source: ${l.source} | Value: $${(l.estimatedValue || 0).toLocaleString()} | Status: ${l.status || "New"}`,
          address: address,
          lat: coords.lat,
          lng: coords.lng,
          raw: l
        });
      });
    }

    // 5. Estimates (Purple files)
    if (showEstimates) {
      estimates.forEach(e => {
        const linkedCustomer = customers.find(customer => customer.contact === e.customerName || customer.company === e.company || customer.company === e.customerName);
        const address = e.address || linkedCustomer?.address || "";
        if (!address) return;
        const cacheKey = `est_${e.id}_${address}`;
        const coords = geocodedCache[cacheKey] || geocodeAddress(address, e.id);
        list.push({
          id: e.id,
          type: "Estimate",
          title: `Estimate ${e.number}: ${e.customerName}`,
          subtitle: `Client: ${e.customerName} | Quote: $${(e.amount || 0).toLocaleString()} | Status: ${e.status}`,
          address: address,
          lat: coords.lat,
          lng: coords.lng,
          raw: e
        });
      });
    }

    // 6. Jobs (from schedulingEvents with eventType === "Job") (Orange)
    if (showJobs) {
      schedulingEvents.forEach(evt => {
        const linkedCustomer = evt.customerId ? customers.find(customer => customer.id === evt.customerId) : undefined;
        const address = evt.customerAddress || evt.location || linkedCustomer?.address || "";
        if (!address) return;
        const cacheKey = `evt_${evt.id}_${address}`;
        const coords = geocodedCache[cacheKey] || geocodeAddress(address, evt.id);
        list.push({
          id: evt.id,
          type: "Job",
          title: `Job: ${evt.customer}`,
          subtitle: `Assigned: ${evt.assignedEmployee || "None"} | Priority: ${evt.priority} | Status: ${evt.status || "Scheduled"}`,
          address: address,
          lat: coords.lat,
          lng: coords.lng,
          raw: evt
        });
      });
    }

    // 7. Technicians (Green)
    if (showTechnicians) {
      activeTechnicians.forEach(t => {
        list.push({
          id: t.id,
          type: "Technician",
          title: `Tech: ${t.name}`,
          subtitle: `Status: ${t.status} | Vehicle: ${t.vehicle}`,
          address: `Mobile Location - DFW Metro`,
          lat: t.lat,
          lng: t.lng,
          raw: t
        });
      });
    }

    // 8. Vehicles (Truck icons)
    if (showVehicles) {
      vehicles.forEach(v => {
        // Retrieve matching tech coordinates
        const tech = activeTechnicians.find(t => t.name === v.driver);
        const fallback = geocodeAddress(v.currentRoute || v.name, v.id);
        const lat = tech ? tech.lat + 0.003 : fallback.lat;
        const lng = tech ? tech.lng - 0.003 : fallback.lng;
        list.push({
          id: v.id,
          type: "Vehicle",
          title: v.name,
          subtitle: `Driver: ${v.driver} | Fuel: ${v.fuel}% | Speed: ${v.speed} mph`,
          address: `Current Route: ${v.currentRoute}`,
          lat,
          lng,
          raw: v
        });
      });
    }

    return list;
  }, [customers, leads, estimates, schedulingEvents, activeTechnicians, vehicles, showCustomers, showLeads, showEstimates, showJobs, showTechnicians, showVehicles, geocodedCache]);

  // Apply Search Query & Filter Categories
  const filteredPins = useMemo(() => {
    return allPins.filter(pin => {
      // One malformed imported record must never crash Google Maps or the
      // entire panel. AdvancedMarker requires finite, in-range coordinates.
      if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) return false;
      if (pin.lat < -90 || pin.lat > 90 || pin.lng < -180 || pin.lng > 180) return false;
      // 1. Sidebar Universal filter categories
      if (filterType !== "All") {
        if (pin.type !== filterType) return false;
      }

      // 2. Priority Levels (Jobs only)
      if (filterPriority !== "All" && pin.type === "Job") {
        if (pin.raw.priority !== filterPriority) return false;
      }

      // 3. Job Status Levels
      if (filterJobStatus !== "All" && pin.type === "Job") {
        if (pin.raw.status !== filterJobStatus) return false;
      }

      // 4. Lead Status levels
      if (filterLeadStatus !== "All" && pin.type === "Lead") {
        if (pin.raw.status !== filterLeadStatus) return false;
      }

      // 5. Tech Status levels
      if (filterTechStatus !== "All" && pin.type === "Technician") {
        if (pin.raw.status !== filterTechStatus) return false;
      }

      // 6. Business Sector (Customers)
      if (filterCategory !== "All" && pin.type === "Customer") {
        if (pin.raw.type !== filterCategory) return false;
      }

      // 7. Universal Search Bar
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchesTitle = pin.title.toLowerCase().includes(q);
        const matchesAddress = pin.address.toLowerCase().includes(q);
        const matchesSubtitle = pin.subtitle.toLowerCase().includes(q);
        const matchesId = pin.id.toLowerCase().includes(q);
        if (!matchesTitle && !matchesAddress && !matchesSubtitle && !matchesId) return false;
      }

      return true;
    });
  }, [allPins, searchQuery, filterType, filterPriority, filterJobStatus, filterLeadStatus, filterTechStatus, filterCategory]);

  // Real revenue heatmap -- one bubble per real customer pin, sized and
  // positioned from that customer's actual lifetime value and geocoded
  // location (same DFW-fallback projection as the SVG marker renderer
  // below), not fixed decorative circles.
  const revenueHeatBubbles = useMemo(() => {
    const latCenter = DFW_FALLBACK.lat;
    const lngCenter = DFW_FALLBACK.lng;
    // Same coordinate space as the SVG fallback map's territory paths below
    // (no viewBox on that <svg>, so these are raw pixel-ish units against
    // its ~900x600 box, centered at 450/300).
    return filteredPins
      .filter(pin => pin.type === "Customer" && Number(pin.raw?.lifetimeValue) > 0)
      .map(pin => {
        const x = 450 + (pin.lng - lngCenter) * 1100;
        const y = 300 - (pin.lat - latCenter) * 1200;
        const value = Number(pin.raw.lifetimeValue) || 0;
        return { id: pin.id, x, y, value };
      });
  }, [filteredPins]);
  const maxHeatValue = Math.max(1, ...revenueHeatBubbles.map(b => b.value));

  // Live Simulated Movements of Technicians & Vehicles every few seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTechnicians(prev => {
        return prev.map(tech => {
          // If Offline or Clocked out, don't move
          if (tech.status === "Offline" || tech.status === "Clocked Out") return tech;

          // Introduce minor coordinate jitter to animate movement beautifully
          const latJitter = (Math.random() - 0.5) * 0.002;
          const lngJitter = (Math.random() - 0.5) * 0.002;

          let updatedLat = tech.lat + latJitter;
          let updatedLng = tech.lng + lngJitter;

          // Keep simulated movement within the DFW fallback area.
          if (updatedLat < 32.60) updatedLat = 32.62;
          if (updatedLat > 32.95) updatedLat = 32.93;
          if (updatedLng < -97.05) updatedLng = -97.03;
          if (updatedLng > -96.55) updatedLng = -96.57;

          return {
            ...tech,
            lat: updatedLat,
            lng: updatedLng
          };
        });
      });

      // Also simulate fuel and speeds
      setVehicles(prev => {
        return prev.map(veh => {
          const matchingTech = activeTechnicians.find(t => t.name === veh.driver);
          if (!matchingTech || matchingTech.status === "Offline") {
            return { ...veh, speed: 0, fuel: Math.max(2, veh.fuel - 0.05) };
          }
          const speedOffset = Math.round((Math.random() - 0.5) * 8);
          return {
            ...veh,
            speed: Math.max(0, Math.min(65, (matchingTech.status === "Traveling" ? 40 : 0) + speedOffset)),
            fuel: Math.max(5, Math.round(veh.fuel - (Math.random() * 0.4))) // burn fuel slowly
          };
        });
      });
    }, 4500);

    return () => clearInterval(timer);
  }, [activeTechnicians]);

  // Handle estimate approvals & conversion directly from the map
  const handleApproveEstimate = (estId: string) => {
    const est = estimates.find(e => e.id === estId);
    if (!est) return;

    // 1. Update Estimate Status
    setEstimates(prev => prev.map(e => e.id === estId ? { ...e, status: "Accepted" } : e));

    // Cross-reference the real customer record for real contact info --
    // an estimate itself only stores a customer name/company, not phone/
    // email. No real match means honestly blank fields, not fabricated
    // placeholder contact details.
    const matchedCustomer = customers.find(
      c => c.contact === est.customerName || c.company === est.company
    );

    // 2. Automatically dispatch schedule event
    const newJobId = `job_gen_${Date.now()}`;
    const newJob = {
      id: newJobId,
      eventType: "Job" as const,
      date: new Date().toISOString().split("T")[0],
      startTime: "10:30",
      endTime: "13:00",
      customer: est.customerName,
      customerPhone: matchedCustomer?.phone || "",
      customerEmail: matchedCustomer?.email || "",
      customerAddress: matchedCustomer?.address || est.address || est.company || "",
      // No real rule exists for which employee should get an
      // auto-created job -- unassigned for a real dispatcher to pick is
      // honest; a hardcoded name never matching a real employee is not.
      assignedEmployee: "",
      location: matchedCustomer?.address || est.address || est.company || "",
      priority: "Medium" as const,
      notes: `Generated automatically via approved estimate ${est.number}. Amount: $${est.amount}`,
      status: "Scheduled" as const,
      // Same real expected-payout field every other job-creation path
      // populates (manual scheduling, Jobs page, accepted-estimate
      // conversion) -- the amount was already known here, just never
      // carried into the structured field anything reading job value reads.
      budget: est.amount
    };

    setSchedulingEvents(prev => [...prev, newJob]);

    // Update selection
    setSelectedPin({
      id: newJobId,
      type: "Job",
      title: `Job: ${newJob.customer}`,
      subtitle: `Assigned: Unassigned | Priority: Medium | Status: Scheduled`,
      address: newJob.location,
      lat: geocodeAddress(newJob.location, newJobId).lat,
      lng: geocodeAddress(newJob.location, newJobId).lng,
      raw: newJob
    });

    if (logOperationalEvent) {
      logOperationalEvent(
        "Estimate Accepted",
        `Estimate ${est.number} converted into live Scheduled Job ${newJobId}.`,
        "📈"
      );
    }
  };

  // Convert Lead -> Active Customer profile instantly. Uses the same
  // convertLeadToCustomer() every other lead-conversion entry point calls
  // (Leads page included) instead of a separate reimplementation here --
  // real address, real lifetime value, no fabricated "Dallas, TX" or
  // phantom open job.
  const handleConvertLead = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const newCust = convertLeadToCustomer(leadId);
    if (!newCust) return;

    setSelectedPin({
      id: newCust.id,
      type: "Customer",
      title: newCust.company,
      subtitle: `Contact: ${newCust.contact} | Open Jobs: ${newCust.openJobs}`,
      address: newCust.address,
      lat: geocodeAddress(newCust.address, newCust.id).lat,
      lng: geocodeAddress(newCust.address, newCust.id).lng,
      raw: newCust
    });
  };

  // Dispatch technician assignment
  const handleAssignTechnician = (jobId: string, techName: string) => {
    setSchedulingEvents(prev => prev.map(evt => {
      if (evt.id === jobId) {
        return {
          ...evt,
          assignedEmployee: techName,
          status: "Traveling" // Shift to Traveling immediately
        };
      }
      return evt;
    }));

    // Start movement route towards the job location
    setActiveTechnicians(prev => prev.map(tech => {
      if (tech.name === techName) {
        const dest = geocodeAddress(selectedPin?.address || "Dallas, TX", jobId);
        return {
          ...tech,
          status: "Traveling" as const,
          jobId,
          routeProgress: 0,
          routePath: [
            { lat: tech.lat, lng: tech.lng },
            { lat: (tech.lat + dest.lat) / 2 + 0.005, lng: (tech.lng + dest.lng) / 2 - 0.005 },
            dest
          ]
        };
      }
      return tech;
    }));

    // Update inspector view
    if (selectedPin && selectedPin.id === jobId) {
      setSelectedPin(prev => prev ? {
        ...prev,
        subtitle: `Assigned: ${techName} | Priority: ${prev.raw.priority} | Status: Traveling`,
        raw: {
          ...prev.raw,
          assignedEmployee: techName,
          status: "Traveling"
        }
      } : null);
    }

    if (logOperationalEvent) {
      logOperationalEvent(
        "Technician Dispatched",
        `Technician ${techName} dispatched to Job ${selectedPin?.title || jobId}. GPS Route plotted!`,
        "🚚"
      );
    }
  };

  // Complete a Job directly from the Map UI
  const handleCompleteJob = (jobId: string) => {
    setSchedulingEvents(prev => prev.map(evt => {
      if (evt.id === jobId) {
        return {
          ...evt,
          status: "Completed" as const
        };
      }
      return evt;
    }));

    // Real revenue recognition already happens via the Event Engine's
    // job-completion cascade (useEventEngineSubscribers), triggered by the
    // setSchedulingEvents status change above — it looks up the job's real
    // linked estimate amount instead of guessing a flat number here.
    const activeJob = schedulingEvents.find(e => e.id === jobId);
    const linkedEstimate = activeJob?.sourceEstimateId
      ? estimates.find(e => e.id === activeJob.sourceEstimateId)
      : undefined;

    // Update matching customer's stats
    if (activeJob) {
      setCustomers(prev => prev.map(c => {
        if (c.company === activeJob.customer || c.contact === activeJob.customer) {
          return {
            ...c,
            openJobs: Math.max(0, c.openJobs - 1),
            lifetimeValue: c.lifetimeValue + (linkedEstimate?.amount || 0)
          };
        }
        return c;
      }));
    }

    if (selectedPin && selectedPin.id === jobId) {
      setSelectedPin(prev => prev ? {
        ...prev,
        subtitle: `Assigned: ${prev.raw.assignedEmployee} | Priority: ${prev.raw.priority} | Status: Completed`,
        raw: {
          ...prev.raw,
          status: "Completed"
        }
      } : null);
    }

    if (logOperationalEvent) {
      logOperationalEvent(
        "Job Completed",
        linkedEstimate
          ? `Job completed successfully. $${linkedEstimate.amount.toLocaleString()} revenue recognized.`
          : "Job completed successfully.",
        "✅"
      );
    }
  };

  // Attach inventory to Job
  const handleAttachInventory = (jobId: string, itemId: string, qty: number) => {
    let itemName = "";
    setInventoryList(prev => prev.map(inv => {
      if (inv.id === itemId) {
        itemName = inv.name;
        return {
          ...inv,
          quantity: Math.max(0, inv.quantity - qty)
        };
      }
      return inv;
    }));

    setSchedulingEvents(prev => prev.map(evt => {
      if (evt.id === jobId) {
        return {
          ...evt,
          notes: `${evt.notes || ""}\n[Stock attached]: ${qty}x ${itemName}`
        };
      }
      return evt;
    }));

    if (selectedPin && selectedPin.id === jobId) {
      setSelectedPin(prev => prev ? {
        ...prev,
        raw: {
          ...prev.raw,
          notes: `${prev.raw.notes || ""}\n[Stock attached]: ${qty}x ${itemName}`
        }
      } : null);
    }

    if (logOperationalEvent) {
      logOperationalEvent(
        "Inventory Drawn",
        `Allocated ${qty}x ${itemName} to Job ID ${jobId}. Stock counts updated live.`,
        "📦"
      );
    }
  };

  // Mock Upload document to Job
  const handleUploadDocument = (jobId: string, filename: string) => {
    const newDoc = {
      id: `doc_gen_${Date.now()}`,
      name: filename,
      category: "Job File",
      customer: selectedPin?.title.replace("Job: ", "") || "Active Client",
      uploadedBy: "Interactive Map Console",
      dateAdded: new Date().toISOString().split("T")[0],
      fileSize: "1.4 MB",
      isFavorite: false,
      notes: `Attached directly on Map for Job: ${jobId}`
    };

    setDocuments(prev => [newDoc, ...prev]);

    if (logOperationalEvent) {
      logOperationalEvent(
        "File Attached",
        `Uploaded '${filename}' file attachments. Synchronized across dispatcher portal.`,
        "📄"
      );
    }
  };

  // Add notes directly inside the inspector
  const handleAddInspectorNote = () => {
    if (!selectedPin || !newNoteText.trim()) return;

    // Append to jobs if Job type
    if (selectedPin.type === "Job") {
      setSchedulingEvents(prev => prev.map(e => {
        if (e.id === selectedPin.id) {
          return {
            ...e,
            notes: `${e.notes || ""}\n[${new Date().toLocaleTimeString()}]: ${newNoteText}`
          };
        }
        return e;
      }));
      setSelectedPin(prev => prev ? {
        ...prev,
        raw: {
          ...prev.raw,
          notes: `${prev.raw.notes || ""}\n[${new Date().toLocaleTimeString()}]: ${newNoteText}`
        }
      } : null);
    }

    setInteractiveMessages(prev => [
      ...prev,
      { sender: "You", text: newNoteText, time: new Date().toLocaleTimeString() }
    ]);

    setNewNoteText("");

    if (logOperationalEvent) {
      logOperationalEvent(
        "Note Added",
        `New dispatcher note logged for ${selectedPin.title}`,
        "📝"
      );
    }
  };

  // Real haversine distance in miles between two geocoded points.
  const haversineMiles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 3958.8;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };

  // Real route order + distance: a greedy nearest-neighbor tour starting
  // from the business HQ (or the first selected stop if no HQ is geocoded
  // yet) across the actually-selected, actually-geocoded job pins --
  // mileage and drive time are computed from real coordinates, not random.
  const optimizedRouteSummary = useMemo(() => {
    const selectedJobs = filteredPins.filter(p => p.type === "Job" && selectedBasketIds.includes(p.id));
    if (selectedJobs.length < 2) return null;

    const start = fixedFacilities[0] ? { lat: fixedFacilities[0].lat, lng: fixedFacilities[0].lng } : selectedJobs[0];
    const remaining = [...selectedJobs];
    let current = start;
    let totalMiles = 0;
    while (remaining.length) {
      let nearestIndex = 0, nearestDist = Infinity;
      remaining.forEach((job, idx) => {
        const dist = haversineMiles(current, job);
        if (dist < nearestDist) { nearestDist = dist; nearestIndex = idx; }
      });
      totalMiles += nearestDist;
      current = remaining[nearestIndex];
      remaining.splice(nearestIndex, 1);
    }

    // Straight-line distance undercounts real road distance -- a ~1.3x
    // detour factor is a standard, honest approximation for surface streets.
    const roadMiles = totalMiles * 1.3;
    const driveTimeMinutes = Math.round((roadMiles / 30) * 60); // 30 mph average local driving speed
    const fuelCost = (roadMiles * 0.42).toFixed(2); // IRS-adjacent per-mile operating cost estimate

    return {
      mileage: roadMiles.toFixed(1),
      driveTime: driveTimeMinutes,
      fuelCost,
      stopsCount: selectedJobs.length
    };
  }, [filteredPins, selectedBasketIds, fixedFacilities]);

  // Apply One-click Dispatch Route updates to the system state
  const handleDispatchOptimizedRoute = () => {
    if (selectedBasketIds.length < 2) return;

    // There's no real rule for which technician should get a batch of
    // jobs from a one-click action -- mark them ready for dispatch
    // (Scheduled, not the fake "Traveling") rather than fake-assigning
    // them to a hardcoded name that isn't a real employee. A real
    // dispatcher assigns each one via handleAssignTechnician.
    setSchedulingEvents(prev => prev.map(evt => {
      if (selectedBasketIds.includes(evt.id)) {
        return {
          ...evt,
          status: "Scheduled"
        };
      }
      return evt;
    }));

    if (logOperationalEvent) {
      logOperationalEvent(
        "Route Grouped",
        `${selectedBasketIds.length} stops grouped for dispatch — assign a technician to each to send them out.`,
        "⚡"
      );
    }

    setSelectedBasketIds([]);
    setIsMultiSelectMode(false);
  };

  // Territory editing handlers
  const startEditingTerritory = (t: ServiceTerritory) => {
    setEditingTerritoryId(t.id);
    setEditingTerritoryName(t.name);
  };

  const saveTerritoryEdit = () => {
    if (!editingTerritoryId) return;
    setServiceTerritories(prev => prev.map(t => t.id === editingTerritoryId ? { ...t, name: editingTerritoryName } : t));
    
    if (logOperationalEvent) {
      logOperationalEvent(
        "Territory Updated",
        `Boundary metrics adjusted for sector: ${editingTerritoryName}`,
        "🗺️"
      );
    }

    setEditingTerritoryId(null);
  };

  const createTerritory = () => {
    const name = newTerritoryName.trim();
    if (!name) return;
    const radiusMiles = Math.max(1, Math.min(75, newTerritoryRadius));
    const latRadius = radiusMiles / 69;
    const center = currentMapCenter || resolvedDefaultCenter || DFW_FALLBACK;
    const lngRadius = radiusMiles / (69 * Math.cos((center.lat * Math.PI) / 180));
    const points = Array.from({ length: 24 }, (_, index) => {
      const angle = (index / 24) * Math.PI * 2;
      return {
        lat: center.lat + Math.sin(angle) * latRadius,
        lng: center.lng + Math.cos(angle) * lngRadius
      };
    });
    const territory: ServiceTerritory = {
      id: `territory_${Date.now()}`,
      name,
      color: TERRITORY_COLORS[serviceTerritories.length % TERRITORY_COLORS.length],
      points,
      revenue: 0,
      customersCount: 0,
      leadsCount: 0,
      jobsCount: 0,
      techniciansCount: 0,
      completionRate: 0
    };
    setServiceTerritories(prev => [...prev, territory]);
    setNewTerritoryName("");
    setNewTerritoryRadius(8);
    setIsCreatingTerritory(false);
    logOperationalEvent?.("Territory Created", `${name} created around the current map center (${radiusMiles} mile radius).`, "🗺️");
  };

  const deleteTerritory = (id: string) => {
    const territory = serviceTerritories.find(item => item.id === id);
    setServiceTerritories(prev => prev.filter(item => item.id !== id));
    if (territory) logOperationalEvent?.("Territory Deleted", `${territory.name} removed from the service map.`, "🗺️");
  };

  // Sidebar Counts
  const counts = useMemo(() => {
    return {
      customers: customers.length,
      todayJobs: schedulingEvents.filter(e => e.eventType === "Job" && e.date === new Date().toISOString().split("T")[0]).length,
      leads: leads.filter(l => l.status === "New").length,
      estimates: estimates.length,
      techs: activeTechnicians.filter(t => t.status !== "Offline").length,
      vehicles: vehicles.length,
      emergency: schedulingEvents.filter(e => e.priority === "High" && e.status !== "Completed").length,
      revenueToday: completedJobsRevenue
    };
  }, [customers, schedulingEvents, leads, estimates, activeTechnicians, vehicles, completedJobsRevenue]);

  const renderCommandCenter = () => (
    <div className="relative overflow-hidden bg-slate-900/80 backdrop-blur-xl rounded-[28px] p-6 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-transparent to-pink-500/10 pointer-events-none" />
      <div className="relative z-10 space-y-1">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-blue-500/20 rounded-xl border border-blue-400/30">
            <Compass className="w-5 h-5 text-blue-400 animate-spin" style={{ animationDuration: "12s" }} />
          </span>
          <h2 className="text-xl font-sans font-extrabold text-white tracking-tight">
            Interactive Map
          </h2>
        </div>
        <p className="text-xs text-slate-400 font-semibold max-w-xl leading-relaxed">
          See customers, leads, estimates, jobs, employees, and vehicles in one place.
        </p>
      </div>

      {/* TOP LEVEL ACTION RIGS */}
      <div className="relative z-10 flex flex-wrap gap-2.5">
        <button
          id="btn_toggle_heatmap"
          onClick={() => setShowRevenueHeatmap(!showRevenueHeatmap)}
          className={`px-4 py-2.5 font-extrabold rounded-xl text-[11px] uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 border ${
            showRevenueHeatmap 
              ? "bg-pink-600 border-pink-400 text-white shadow-[0_4px_12px_rgba(219,39,119,0.3)]" 
              : "bg-slate-800/80 border-white/10 text-slate-300 hover:bg-slate-800"
          }`}
        >
          <Activity className="w-4 h-4" /> Revenue Heatmap Overlay
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      
      {/* CORE LAYOUT GRID: Left Sidebar, Main Stage, Right Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Switchboard layers & Service Territories (3 Cols) */}
        <div className="xl:col-span-3 order-2 xl:order-1 space-y-6">

          {/* SMART FILTER SWITCHBOARD */}
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-[28px] p-5 shadow-lg space-y-4">
            <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider border-b border-white/10 pb-2 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-blue-400" /> Map Layers
            </h3>

            <div className="space-y-2.5 text-xs text-slate-300 font-semibold">
              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showCustomers}
                  onChange={() => setShowCustomers(!showCustomers)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-blue-500"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Show Customers Pins
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showLeads}
                  onChange={() => setShowLeads(!showLeads)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-purple-500"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Show Leads Pins
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showJobs}
                  onChange={() => setShowJobs(!showJobs)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-orange-500"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Show Jobs Pins
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showEstimates}
                  onChange={() => setShowEstimates(!showEstimates)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-yellow-500"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Show Estimates
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showTechnicians}
                  onChange={() => setShowTechnicians(!showTechnicians)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-emerald-500"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Show Technicians
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showVehicles}
                  onChange={() => setShowVehicles(!showVehicles)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-cyan-500"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Show Vehicles
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showTerritories}
                  onChange={() => setShowTerritories(!showTerritories)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-blue-500"
                />
                <span className="w-2.5 h-2.5 rounded bg-blue-400/50" /> Show Service Territories
              </label>
            </div>
          </div>

          {/* EDITABLE SERVICE TERRITORIES CONTROLLER */}
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-[28px] p-5 shadow-lg space-y-4">
            <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider border-b border-white/10 pb-2">
              Territories &amp; Sectors
            </h3>

            <button
              type="button"
              onClick={() => setIsCreatingTerritory(value => !value)}
              className="w-full rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-white transition-colors hover:bg-blue-500"
            >
              <Plus className="mr-1 inline h-3 w-3" /> Create Territory
            </button>

            {isCreatingTerritory && (
              <div className="space-y-2 rounded-2xl border border-blue-400/30 bg-slate-800/60 p-3">
                <input
                  value={newTerritoryName}
                  onChange={event => setNewTerritoryName(event.target.value)}
                  onKeyDown={event => event.key === "Enter" && createTerritory()}
                  placeholder="Territory name"
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-blue-400"
                  autoFocus
                />
                <label className="block text-[10px] font-bold text-slate-400">
                  Radius: {newTerritoryRadius} miles
                  <input
                    type="range"
                    min="1"
                    max="75"
                    value={newTerritoryRadius}
                    onChange={event => setNewTerritoryRadius(Number(event.target.value))}
                    className="mt-1 w-full accent-blue-500"
                  />
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setIsCreatingTerritory(false)} className="flex-1 rounded-lg bg-slate-700 py-1.5 text-[10px] font-bold text-slate-200">Cancel</button>
                  <button type="button" onClick={createTerritory} disabled={!newTerritoryName.trim()} className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-[10px] font-bold text-white disabled:opacity-40">Save</button>
                </div>
              </div>
            )}

            <div className="space-y-3.5">
              {serviceTerritories.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-slate-800/30 px-4 py-5 text-center">
                  <MapPin className="mx-auto mb-2 h-5 w-5 text-slate-500" />
                  <p className="text-xs font-bold text-slate-300">No service territories created</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Territories you create will appear here. OwnersLOCAL will never fill this area with demo data.</p>
                </div>
              )}
              {serviceTerritories.map(t => (
                <div key={t.id} className="bg-slate-800/40 border border-white/5 rounded-2xl p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                      {editingTerritoryId === t.id ? (
                        <input
                          type="text"
                          value={editingTerritoryName}
                          onChange={(e) => setEditingTerritoryName(e.target.value)}
                          className="px-2 py-0.5 bg-slate-700 rounded text-xs text-white border border-blue-400"
                          autoFocus
                        />
                      ) : (
                        <p className="text-xs font-extrabold text-white">{t.name}</p>
                      )}
                    </div>
                    {editingTerritoryId === t.id ? (
                      <button
                        onClick={saveTerritoryEdit}
                        className="p-1 bg-emerald-600 rounded text-white cursor-pointer hover:bg-emerald-500"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEditingTerritory(t)}
                          aria-label={`Rename ${t.name}`}
                          className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deleteTerritory(t.id)}
                          aria-label={`Delete ${t.name}`}
                          className="p-1 hover:bg-rose-950 rounded text-slate-400 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Territory KPIs */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5 text-[10px] text-slate-400 font-sans">
                    <div>
                      <p>Revenue: <strong className="text-emerald-400">${t.revenue.toLocaleString()}</strong></p>
                      <p>Completion: <strong className="text-slate-200">{t.completionRate}%</strong></p>
                    </div>
                    <div>
                      <p>Clients: <strong className="text-slate-200">{t.customersCount}</strong></p>
                      <p>Open Jobs: <strong className="text-slate-200">{t.jobsCount}</strong></p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* CENTER COLUMN: Interactive map, search, and dynamic filter stage (6 Cols) */}
        <div className="xl:col-span-6 order-1 xl:order-2 flex flex-col gap-4 relative">
          
          {/* SEARCH & WORKSPACE LAYER SELECTOR BAR */}
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-lg flex flex-col md:flex-row gap-3 items-center justify-between">
            
            {/* SEARCH CONTAINER */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, phone, job #, vehicle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* FILTER LAYER CHIPS */}
            <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
              {(["All", "Customer", "Lead", "Estimate", "Job", "Technician", "Vehicle"] as const).map(type => (
                <button
                  key={type}
                  onClick={() => {
                    setFilterType(type);
                    setSelectedPin(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border cursor-pointer transition-colors ${
                    filterType === type
                      ? "bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-500/20"
                      : "bg-slate-800/70 border-white/5 text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {type === "All" ? "🌍 All Layers" : `${type}s`}
                </button>
              ))}
            </div>
          </div>

          {/* DYNAMIC SPATIAL CRITERIA PANEL (For Sub-Filters) */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl p-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-300">
            
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Job Status:</span>
              <select
                value={filterJobStatus}
                onChange={(e) => setFilterJobStatus(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded px-2.5 py-1 text-xs text-white"
              >
                <option value="All">All Jobs</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Traveling">Traveling</option>
                <option value="In Progress">In Progress</option>
                <option value="Paused">Paused</option>
                <option value="Completed">Completed</option>
                <option value="Emergency">Emergency</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Priority:</span>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded px-2.5 py-1 text-xs text-white"
              >
                <option value="All">All Priorities</option>
                <option value="High">Emergency / High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Leads:</span>
              <select
                value={filterLeadStatus}
                onChange={(e) => setFilterLeadStatus(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded px-2.5 py-1 text-xs text-white"
              >
                <option value="All">All Leads</option>
                <option value="New">New</option>
                <option value="Contacted">Contacted</option>
                <option value="Qualified">Qualified</option>
                <option value="Estimate Sent">Estimate Sent</option>
                <option value="Won">Won</option>
                <option value="Lost">Lost</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Sector:</span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded px-2.5 py-1 text-xs text-white"
              >
                <option value="All">All Sectors</option>
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
              </select>
            </div>

            {/* LASSO / MULTI-SELECT TOGGLE CONTROL */}
            <div className="ml-auto flex items-center gap-2 border-l border-white/10 pl-4">
              <button
                onClick={() => {
                  setIsMultiSelectMode(!isMultiSelectMode);
                  setSelectedBasketIds([]);
                }}
                className={`px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                  isMultiSelectMode 
                    ? "bg-amber-500 text-slate-900 shadow-md" 
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                }`}
              >
                {isMultiSelectMode ? "🔒 Exit Lasso Mode" : "🎯 Lasso / Multi-Select Mode"}
              </button>
            </div>

          </div>

          {/* MAP CANVAS (REAL GOOGLE MAP OR HIGH-FIDELITYFALLBACK VECTOR CANVAS) */}
          <div className="bg-slate-950/60 rounded-[32px] p-2.5 border-2 border-white/10 overflow-hidden relative shadow-[0_12px_48px_rgba(0,0,0,0.5)]" style={{ height: "660px" }}>
            {mapsApiDiagnostic && (
              <div className="absolute top-5 left-5 right-5 z-50 rounded-xl border border-rose-400/60 bg-rose-950/95 p-4 text-left shadow-2xl">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-rose-300">
                  Google Maps diagnostic
                </p>
                <p className="mt-1 break-words font-mono text-sm font-bold text-white">
                  {mapsApiDiagnostic}
                </p>
                <p className="mt-1 text-[10px] text-rose-200">
                  Screenshot this exact code so the remaining Google Cloud setting can be corrected.
                </p>
              </div>
            )}
            
            {hasValidKey && !mapsApiError ? (
              // Full Google Maps implementation with our customized components
              <APIProvider
                  apiKey={apiKey}
                  onLoad={() => setMapsApiLoaded(true)}
                  onError={(error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    console.error("Google Maps failed to initialize:", error);
                    setMapsApiLoaded(false);
                    setMapsApiError(true);
                    setMapsApiDiagnostic(message || "GoogleMapsLoaderFailure");
                  }}
                >
                <Map
                  id="gmp_mcp_codeassist_v1_aistudio"
                  defaultCenter={resolvedDefaultCenter || DFW_FALLBACK}
                  defaultZoom={11}
                  onCameraChanged={(e) => handleMapCameraChanged(e?.detail?.center)}
                  style={{ width: "100%", height: "100%", borderRadius: "24px" }}
                >
                  {/* useMap() only resolves inside this Map's own subtree --
                      this was previously rendered from a filter-chip button
                      well outside the APIProvider/Map tree entirely, so it
                      threw "failed to retrieve APIProviderContext" and never
                      actually fit the camera to the pins. */}
                  <FitMapToPins pins={filteredPins} />
                  {/* Standard markers do not require a cloud Map ID and are
                      substantially more reliable on mobile browsers. */}
                  {filteredPins.map(pin => (
                    <Marker
                      key={`${pin.type}_${pin.id}`}
                      position={{ lat: pin.lat, lng: pin.lng }}
                      title={pin.title}
                      onClick={() => {
                        if (isMultiSelectMode) {
                          setSelectedBasketIds(prev =>
                            prev.includes(pin.id) ? prev.filter(x => x !== pin.id) : [...prev, pin.id]
                          );
                        } else {
                          openLocationEditor(pin);
                        }
                      }}
                    />
                  ))}
                </Map>
              </APIProvider>
            ) : (
              // DFW fallback vector map canvas
              <div className="w-full h-full bg-slate-900 rounded-[24px] relative overflow-hidden" style={{ height: "100%" }}>
                
                {/* Real Map Key Setup Splash Overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6 z-20">
                  <div className="max-w-md w-full bg-slate-900/95 border border-white/15 rounded-2xl p-6 shadow-2xl text-center space-y-4">
                    <div className="mx-auto w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center border border-blue-400/30">
                      <Compass className="w-6 h-6 text-blue-400 animate-spin" style={{ animationDuration: '12s' }} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-sans font-extrabold text-white tracking-tight">Real Google Map API Key Required</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        You are currently viewing our customized DFW Fallback Vector Map. To load the live interactive 3D satellite and street maps, you need a Google Maps Platform API key.
                      </p>
                    </div>
                    <div className="bg-slate-950/60 rounded-xl p-4 text-[10px] text-left text-slate-300 font-sans border border-white/5 space-y-2">
                      <p className="font-extrabold text-white uppercase tracking-wider text-[9px] text-blue-400">Setup Instructions:</p>
                      <p>
                        <strong className="text-white">1. Get an API key:</strong> <a href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">console.cloud.google.com <ExternalLink className="w-3 h-3 inline" /></a>
                      </p>
                      <p>
                        <strong className="text-white">2. Paste Key:</strong> When the <span className="text-amber-300">"Enter your environment variable to continue"</span> popup appears, paste your key and press <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-white">Enter</span>.
                      </p>
                      <p>
                        <strong className="text-white">3. Or Manually:</strong> Open <span className="text-white font-bold">Settings</span> (⚙️ gear icon, top-right corner) → <span className="text-white font-bold">Secrets</span> → Add secret name <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">GOOGLE_MAPS_PLATFORM_KEY</code> → paste key.
                      </p>
                      <p>
                        <strong className="text-white">4. Map ID (required too):</strong> In the same Google Cloud project, go to <span className="text-white font-bold">Maps → Map Management</span>, create a Map ID, then add secret <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">GOOGLE_MAPS_MAP_ID</code> with that value. A Map ID from a different project than your key won't work.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Visual grid background */}
                <div className="absolute inset-0 select-none opacity-20" style={{ backgroundImage: "radial-gradient(#ffffff 1.2px, transparent 1.2px)", backgroundSize: "28px 28px" }} />

                {/* SVG Stylized water bodies and geographic paths */}
                <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
                  {/* Elliot Bay water body */}
                  <path d="M 0,100 C 60,160 80,240 50,330 C 30,390 40,470 0,510 L 0,640 L 120,640 C 150,550 110,440 120,380 C 130,320 170,220 140,100 Z" fill="#1e293b" opacity="0.8" stroke="#334155" strokeWidth="2" />
                  
                  {/* Lake Union center body */}
                  <ellipse cx="440" cy="180" rx="50" ry="34" fill="#1e293b" opacity="0.8" stroke="#334155" strokeWidth="2" />
                  <path d="M 440,180 L 390,240 C 390,240 360,300 310,320" stroke="#1e293b" strokeWidth="12" fill="none" opacity="0.8" />
                  
                  {/* Lake Washington right side */}
                  <path d="M 850,50 C 780,150 810,280 790,420 C 770,520 820,590 850,640 L 1000,640 L 1000,50 Z" fill="#1e293b" opacity="0.8" stroke="#334155" strokeWidth="2" />

                  {/* Highway overlay grid networks */}
                  <path d="M 470,0 C 450,150 480,280 460,410 C 440,510 450,590 470,640" stroke="#334155" strokeWidth="4" strokeDasharray="8,6" fill="none" opacity="0.6" />
                  <path d="M 0,450 C 200,440 400,460 800,440" stroke="#334155" strokeWidth="4" strokeDasharray="8,6" fill="none" opacity="0.6" />

                  {/* SERVICE TERRITORIES COLORED OVERLAY POLYGONS */}
                  {showTerritories && serviceTerritories.map(t => {
                    // Translate coordinate points dynamically into SVG coordinate bounds
                    const svgPath = t.points.map((p, idx) => {
                      const latCenter = DFW_FALLBACK.lat;
                      const lngCenter = DFW_FALLBACK.lng;
                      const x = 450 + (p.lng - lngCenter) * 1100;
                      const y = 300 - (p.lat - latCenter) * 1200;
                      return `${idx === 0 ? "M" : "L"} ${x},${y}`;
                    }).join(" ") + " Z";

                    return (
                      <g key={t.id}>
                        <path
                          d={svgPath}
                          fill={t.color}
                          fillOpacity="0.08"
                          stroke={t.color}
                          strokeWidth="2.5"
                          strokeOpacity="0.45"
                          strokeDasharray="4,4"
                          className="transition-all hover:fill-opacity-15 cursor-pointer"
                        />
                        {/* Text center label */}
                        <foreignObject
                          x={450 + (t.points[0].lng - DFW_FALLBACK.lng) * 1100 - 40}
                          y={300 - (t.points[0].lat - DFW_FALLBACK.lat) * 1200 + 10}
                          width="120"
                          height="40"
                        >
                          <div className="bg-slate-900/90 border border-white/10 px-1.5 py-0.5 rounded text-[8px] font-sans text-slate-300 font-extrabold shadow text-center truncate select-none">
                            {t.name}
                          </div>
                        </foreignObject>
                      </g>
                    );
                  })}

                  {/* REVENUE HEATMAP GRADIENT BUBBLES -- one per real customer, sized by their actual lifetime value */}
                  {showRevenueHeatmap && (
                    <g opacity="0.45">
                      {revenueHeatBubbles.length === 0 ? (
                        <text x="500" y="300" textAnchor="middle" fill="#94a3b8" fontSize="14">No customer revenue on file yet to map.</text>
                      ) : revenueHeatBubbles.map(bubble => (
                        <circle
                          key={bubble.id}
                          cx={bubble.x}
                          cy={bubble.y}
                          r={30 + (bubble.value / maxHeatValue) * 130}
                          fill="url(#heat_radial_1)"
                        />
                      ))}
                    </g>
                  )}

                  <defs>
                    <radialGradient id="heat_radial_1" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#ec4899" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                </svg>

                {/* HQ & Warehouse HUD Floating Pins */}
                <div className="absolute top-4 left-4 bg-slate-950/90 border border-white/10 rounded-xl p-2.5 text-[9px] font-semibold text-slate-300 shadow-xl space-y-1 z-10 select-none">
                  <p className="text-blue-400 font-extrabold uppercase flex items-center gap-1">
                    <Compass className="w-3 h-3 animate-spin" /> Dispatch Grid Activated
                  </p>
                  <p>{fixedFacilities.length > 0 ? `📍 Office HQ: ${fixedFacilities[0].address}` : "No business facility added"}</p>
                </div>

                {/* DYNAMIC FALLBACK VECTOR MARKER RENDERER */}
                {filteredPins.map(pin => {
                  const latCenter = DFW_FALLBACK.lat;
                  const lngCenter = DFW_FALLBACK.lng;
                  // These pins are positioned with CSS `left/top: X%`, so x/y
                  // must be 0-100. The territory polygons above project into
                  // raw SVG pixel units against an ~1000x640 canvas (450,300
                  // center, *1100/*1200 scale) -- reusing that same pixel-space
                  // formula here (with a 50,50 center instead of 450,300) fed
                  // a pixel-scaled number straight into a percentage, so any
                  // address more than a couple miles from DFW_FALLBACK blew
                  // past 0-100 and got clamped to the 5%/95% screen edge
                  // instead of landing near its real relative position.
                  // Dividing by the same assumed canvas size converts it to
                  // a percentage on the same geographic scale as the
                  // territory shapes, so pins land inside them correctly.
                  const CANVAS_W = 1000;
                  const CANVAS_H = 640;
                  const x = ((450 + (pin.lng - lngCenter) * 1100) / CANVAS_W) * 100;
                  const y = ((300 - (pin.lat - latCenter) * 1200) / CANVAS_H) * 100;

                  // Bound percentages inside visible viewport
                  const posX = Math.max(5, Math.min(x, 95));
                  const posY = Math.max(5, Math.min(y, 95));

                  const isSelected = selectedPin?.id === pin.id;
                  const isBasketItem = selectedBasketIds.includes(pin.id);

                  // Setup specific icons and colored bullets
                  let markerBg = "bg-blue-600";
                  let markerIcon = <User className="w-3.5 h-3.5" />;
                  let pulseColor = "border-blue-400";

                  if (pin.type === "Office") {
                    markerBg = "bg-rose-600";
                    markerIcon = <Building className="w-3.5 h-3.5 animate-pulse" />;
                    pulseColor = "border-rose-400";
                  } else if (pin.type === "Warehouse") {
                    markerBg = "bg-amber-600";
                    markerIcon = <Package className="w-3.5 h-3.5" />;
                    pulseColor = "border-amber-400";
                  } else if (pin.type === "Lead") {
                    markerBg = "bg-purple-600";
                    pulseColor = "border-purple-400";
                    // State based icons for leads
                    const leadStatus = pin.raw.status || "New";
                    if (leadStatus === "Won") markerIcon = <Star className="w-3.5 h-3.5 text-yellow-300" />;
                    else if (leadStatus === "Lost") markerIcon = <Skull className="w-3.5 h-3.5" />;
                    else if (leadStatus === "Contacted") markerIcon = <Phone className="w-3.5 h-3.5" />;
                    else if (leadStatus === "Qualified") markerIcon = <Shield className="w-3.5 h-3.5 text-emerald-300" />;
                    else markerIcon = <MapPin className="w-3.5 h-3.5" />;
                  } else if (pin.type === "Estimate") {
                    markerBg = "bg-yellow-500 text-slate-900";
                    markerIcon = <FileText className="w-3.5 h-3.5" />;
                    pulseColor = "border-yellow-400";
                  } else if (pin.type === "Job") {
                    pulseColor = "border-orange-400";
                    const isHigh = pin.raw.priority === "High";
                    markerBg = isHigh ? "bg-rose-500" : "bg-orange-500";
                    markerIcon = <Wrench className="w-3.5 h-3.5" />;
                  } else if (pin.type === "Technician") {
                    markerBg = "bg-emerald-600";
                    markerIcon = <UserCheck className="w-3.5 h-3.5" />;
                    pulseColor = "border-emerald-400";
                  } else if (pin.type === "Vehicle") {
                    markerBg = "bg-cyan-600";
                    markerIcon = <Truck className="w-3.5 h-3.5 text-cyan-200 animate-bounce" />;
                    pulseColor = "border-cyan-400";
                  }

                  return (
                    <button
                      key={pin.id}
                      onClick={() => {
                        if (isMultiSelectMode) {
                          setSelectedBasketIds(prev => 
                            prev.includes(pin.id) ? prev.filter(x => x !== pin.id) : [...prev, pin.id]
                          );
                        } else {
                          openLocationEditor(pin);
                        }
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 focus:outline-none hover:scale-125 transition-transform"
                      style={{ left: `${posX}%`, top: `${posY}%` }}
                    >
                      <div className="relative">
                        
                        {/* Selected halo state */}
                        {(isSelected || isBasketItem) && (
                          <span className={`absolute -inset-3.5 rounded-full border-2 ${pulseColor} animate-ping`} />
                        )}

                        {/* Standard state indicator pulse rings */}
                        {pin.type === "Job" && pin.raw.status === "In Progress" && (
                          <span className="absolute -inset-2.5 rounded-full border border-emerald-400 animate-pulse" />
                        )}
                        {pin.type === "Job" && pin.raw.priority === "High" && (
                          <span className="absolute -inset-2.5 rounded-full border border-rose-500 animate-pulse" />
                        )}
                        {pin.type === "Technician" && pin.raw.status === "Traveling" && (
                          <span className="absolute -inset-2.5 rounded-full border border-orange-400 animate-pulse" />
                        )}

                        <div className={`${markerBg} text-white p-2 rounded-full border border-white shadow-xl flex items-center justify-center`}>
                          {markerIcon}
                        </div>

                        {/* Checked Badge in lasso multi mode */}
                        {isBasketItem && (
                          <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-slate-950 rounded-full w-4 h-4 text-[9px] font-extrabold flex items-center justify-center border border-slate-900 shadow">
                            ✓
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

              </div>
            )}

            {/* FLOATING ACTION BOTTOM BAR */}
            <div className="absolute bottom-4 left-4 right-4 bg-slate-950/90 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-wrap gap-4 items-center justify-between z-30">
              
              <div className="flex items-center gap-3">
                <span className="p-2 bg-blue-500/15 rounded-xl border border-blue-400/20">
                  <LayersIcon className="w-5 h-5 text-blue-400" />
                </span>
                <div>
                  <h4 className="text-[11px] font-extrabold text-white uppercase tracking-wider">Map Results</h4>
                  <p className="text-[10px] text-slate-400 font-bold">
                    Showing {filteredPins.length} mapped records.
                  </p>
                </div>
              </div>

              {/* STAT KPIs */}
              <div className="flex gap-4 text-xs font-semibold">
                <div className="text-center">
                  <p className="text-xs font-extrabold text-blue-400">{customers.length}</p>
                  <p className="text-[8px] text-slate-400 font-extrabold uppercase">Clients</p>
                </div>
                <div className="text-center border-l border-white/10 pl-4">
                  <p className="text-xs font-extrabold text-purple-400">{leads.length}</p>
                  <p className="text-[8px] text-slate-400 font-extrabold uppercase">Leads</p>
                </div>
                <div className="text-center border-l border-white/10 pl-4">
                  <p className="text-xs font-extrabold text-orange-400">
                    {schedulingEvents.filter(e => e.eventType === "Job" && e.status !== "Completed").length}
                  </p>
                  <p className="text-[8px] text-slate-400 font-extrabold uppercase">Active Jobs</p>
                </div>
                <div className="text-center border-l border-white/10 pl-4">
                  <p className="text-xs font-extrabold text-emerald-400">${counts.revenueToday.toLocaleString()}</p>
                  <p className="text-[8px] text-slate-400 font-extrabold uppercase">Revenue</p>
                </div>
              </div>

            </div>

          </div>

          {/* DYNAMIC MULTI-SELECT & ROUTE OPTIMIZATION FLOATING BOX */}
          <AnimatePresence>
            {isMultiSelectMode && selectedBasketIds.length > 0 && (
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl p-4 shadow-2xl space-y-4 text-slate-300 relative z-40"
              >
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
                    <p className="text-xs font-extrabold text-white uppercase tracking-wider">
                      🎯 Selected Locations ({selectedBasketIds.length})
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedBasketIds([])}
                    className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Clear Selection
                  </button>
                </div>

                {/* Optimized Route details if 2+ elements */}
                {optimizedRouteSummary ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950/80 p-3 rounded-xl border border-white/5 text-xs">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-extrabold">Total Mileage</p>
                      <p className="text-sm font-extrabold text-white">{optimizedRouteSummary.mileage} miles</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-extrabold">Est. Drive Time</p>
                      <p className="text-sm font-extrabold text-white">{optimizedRouteSummary.driveTime} mins</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-extrabold">Fuel Draw Cost</p>
                      <p className="text-sm font-extrabold text-emerald-400">${optimizedRouteSummary.fuelCost}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-extrabold">Total Stops</p>
                      <p className="text-sm font-extrabold text-white truncate">{optimizedRouteSummary.stopsCount}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 leading-relaxed font-sans font-medium">
                    Select at least two jobs to build a faster route and send it to dispatch.
                  </p>
                )}

                {/* Real mass actions: hands off to the device's own mail
                    app (all real recipients BCC'd) or opens one text thread
                    per selected contact -- there's no browser API to send
                    a real multi-recipient SMS blast, so this opens the
                    first contact's thread and names the rest in the body. */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const recipients = filteredPins.filter(p => selectedBasketIds.includes(p.id)).map(p => p.raw?.customerEmail).filter(Boolean);
                      if (!recipients.length) { triggerNotification?.("No email addresses on file for the selected jobs."); return; }
                      composeEmail({ bcc: recipients, subject: "Job update" });
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold text-[10px] uppercase rounded-lg border border-white/5 cursor-pointer"
                  >
                    📧 Mass Email
                  </button>
                  <button
                    onClick={() => {
                      const recipients = filteredPins.filter(p => selectedBasketIds.includes(p.id)).map(p => p.raw?.customerPhone).filter(Boolean);
                      if (!recipients.length) { triggerNotification?.("No phone numbers on file for the selected jobs."); return; }
                      composeSms({ to: recipients[0], body: recipients.length > 1 ? `(also selected: ${recipients.slice(1).join(", ")})` : undefined });
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold text-[10px] uppercase rounded-lg border border-white/5 cursor-pointer"
                  >
                    💬 Mass SMS Text
                  </button>
                  {selectedBasketIds.length >= 2 && (
                    <button
                      onClick={handleDispatchOptimizedRoute}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] uppercase rounded-lg shadow-md cursor-pointer ml-auto flex items-center gap-1"
                    >
                      <Zap className="w-3.5 h-3.5 text-yellow-300" /> One-Click Dispatch Route
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* RIGHT COLUMN: CORE OPERATIONAL NODES / STAT COUNTS (3 Cols) */}
        <div className="xl:col-span-3 order-3 xl:order-3 space-y-6">
          
          {/* GLASS WIDGET: STAT COUNTS */}
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-[28px] p-5 shadow-lg space-y-4">
            <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider border-b border-white/10 pb-2 flex items-center justify-between">
              <span>Map Locations</span>
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping" />
            </h3>

            <div className="grid grid-cols-2 gap-3">
              
              <div className="bg-slate-800/50 border border-white/5 p-3 rounded-2xl">
                <div className="flex justify-between items-start">
                  <span className="p-1 bg-blue-500/10 rounded-lg"><User className="w-4 h-4 text-blue-400" /></span>
                  <span className="text-xs text-slate-400 font-bold font-sans">Clients</span>
                </div>
                <p className="text-xl font-extrabold text-white mt-1.5">{counts.customers}</p>
              </div>

              <div className="bg-slate-800/50 border border-white/5 p-3 rounded-2xl">
                <div className="flex justify-between items-start">
                  <span className="p-1 bg-orange-500/10 rounded-lg"><Wrench className="w-4 h-4 text-orange-400" /></span>
                  <span className="text-xs text-slate-400 font-bold font-sans">Jobs Today</span>
                </div>
                <p className="text-xl font-extrabold text-white mt-1.5">{counts.todayJobs}</p>
              </div>

              <div className="bg-slate-800/50 border border-white/5 p-3 rounded-2xl">
                <div className="flex justify-between items-start">
                  <span className="p-1 bg-purple-500/10 rounded-lg"><MapPin className="w-4 h-4 text-purple-400" /></span>
                  <span className="text-xs text-slate-400 font-bold font-sans">New Leads</span>
                </div>
                <p className="text-xl font-extrabold text-white mt-1.5">{counts.leads}</p>
              </div>

              <div className="bg-slate-800/50 border border-white/5 p-3 rounded-2xl">
                <div className="flex justify-between items-start">
                  <span className="p-1 bg-yellow-500/10 rounded-lg"><FileText className="w-4 h-4 text-yellow-400" /></span>
                  <span className="text-xs text-slate-400 font-bold font-sans">Estimates</span>
                </div>
                <p className="text-xl font-extrabold text-white mt-1.5">{counts.estimates}</p>
              </div>

              <div className="bg-slate-800/50 border border-white/5 p-3 rounded-2xl">
                <div className="flex justify-between items-start">
                  <span className="p-1 bg-emerald-500/10 rounded-lg"><UserCheck className="w-4 h-4 text-emerald-400" /></span>
                  <span className="text-xs text-slate-400 font-bold font-sans">Techs Live</span>
                </div>
                <p className="text-xl font-extrabold text-white mt-1.5">{counts.techs}</p>
              </div>

              <div className="bg-slate-800/50 border border-white/5 p-3 rounded-2xl">
                <div className="flex justify-between items-start">
                  <span className="p-1 bg-cyan-500/10 rounded-lg"><Truck className="w-4 h-4 text-cyan-400" /></span>
                  <span className="text-xs text-slate-400 font-bold font-sans">Fleet Cars</span>
                </div>
                <p className="text-xl font-extrabold text-white mt-1.5">{counts.vehicles}</p>
              </div>

            </div>

            <div className="border-t border-white/10 pt-3 space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-400 font-bold">
                <span>Revenue Generated:</span>
                <span className="text-emerald-400 font-extrabold">${counts.revenueToday.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-400 font-bold">
                <span>Active Emergency Alerts:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] ${counts.emergency > 0 ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse" : "bg-slate-800 text-slate-400"}`}>
                  {counts.emergency} Alert{counts.emergency !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* DYNAMIC RIGHT SLIDE INSPECTOR PANEL */}
      <AnimatePresence>
        {selectedPin && (
          <motion.div
            initial={{ x: 440, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 440, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 160 }}
            className="fixed top-0 right-0 w-[440px] h-full bg-slate-900/95 backdrop-blur-2xl border-l border-white/10 shadow-3xl z-50 flex flex-col p-6 text-left"
          >
            {/* INSPECTOR HEADER */}
            <div className="flex justify-between items-start border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider rounded-md border ${
                    selectedPin.type === "Customer" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                    selectedPin.type === "Lead" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                    selectedPin.type === "Estimate" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" :
                    selectedPin.type === "Job" ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                    "bg-slate-800 text-slate-300 border-white/5"
                  }`}>
                    {selectedPin.type} Profile
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 font-semibold">ID: {selectedPin.id}</span>
                </div>
                <h3 className="text-base font-extrabold text-white tracking-tight">{selectedPin.title}</h3>
                <p className="text-xs text-slate-400 font-sans font-medium flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-400" /> {selectedPin.address}
                </p>
              </div>
              <button
                onClick={() => setSelectedPin(null)}
                className="p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* TAB SELECTORS WITHIN PANEL */}
            <div className="flex border-b border-white/5 text-xs py-2 gap-1 overflow-x-auto scrollbar-none">
              {(["Overview", "Timeline", "Notes", "Dispatch", "Finance"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setInspectorTab(tab)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                    inspectorTab === tab 
                      ? "bg-slate-800 text-white" 
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* SCROLLABLE PANEL CONTENTS */}
            <div className="flex-1 overflow-y-auto py-4 space-y-5 scrollbar-none">
              
              {inspectorTab === "Overview" && (
                <div className="space-y-4">
                  
                  {/* METADATA GRID */}
                  <div className="bg-slate-800/40 border border-white/5 rounded-2xl p-4 space-y-3">
                    <h4 className="text-[10px] font-extrabold text-slate-300 uppercase tracking-wider border-b border-white/5 pb-1">
                      Target Demographics
                    </h4>

                    {selectedPin.type === "Customer" && (
                      <div className="space-y-2 text-xs font-sans text-slate-300">
                        <p className="flex justify-between"><span className="text-slate-400">Contact:</span> <strong>{selectedPin.raw.contact}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Phone:</span> <strong>{selectedPin.raw.phone}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Email:</span> <strong>{selectedPin.raw.email}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Lifetime Revenue:</span> <strong className="text-emerald-400">${(selectedPin.raw.lifetimeValue || 0).toLocaleString()}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Outstanding Balance:</span> <strong className="text-rose-400">${(selectedPin.raw.outstandingBalance || 0).toLocaleString()}</strong></p>
                      </div>
                    )}

                    {selectedPin.type === "Lead" && (
                      <div className="space-y-2 text-xs font-sans text-slate-300">
                        <p className="flex justify-between"><span className="text-slate-400">Source:</span> <strong>{selectedPin.raw.source}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Value Estimate:</span> <strong className="text-purple-400">${(selectedPin.raw.estimatedValue || 0).toLocaleString()}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Assigned Rep:</span> <strong>{selectedPin.raw.salesRep || "None"}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Created:</span> <strong>{selectedPin.raw.dateAdded}</strong></p>
                      </div>
                    )}

                    {selectedPin.type === "Estimate" && (
                      <div className="space-y-2 text-xs font-sans text-slate-300">
                        <p className="flex justify-between"><span className="text-slate-400">Client:</span> <strong>{selectedPin.raw.customerName}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Quote:</span> <strong className="text-yellow-400">${(selectedPin.raw.amount || 0).toLocaleString()}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Expiration:</span> <strong>{selectedPin.raw.expirationDate}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Status:</span> <strong>{selectedPin.raw.status}</strong></p>
                      </div>
                    )}

                    {selectedPin.type === "Job" && (
                      <div className="space-y-2 text-xs font-sans text-slate-300">
                        <p className="flex justify-between"><span className="text-slate-400">Client:</span> <strong>{selectedPin.raw.customer}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Technician:</span> <strong>{selectedPin.raw.assignedEmployee || "Unassigned"}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Crew Unit:</span> <strong>{selectedPin.raw.assignedCrew || "None"}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Appointment:</span> <strong>{selectedPin.raw.startTime} - {selectedPin.raw.endTime}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Priority:</span> <strong className={selectedPin.raw.priority === "High" ? "text-rose-400" : "text-slate-300"}>{selectedPin.raw.priority}</strong></p>
                      </div>
                    )}

                    {selectedPin.type === "Technician" && (
                      <div className="space-y-2 text-xs font-sans text-slate-300">
                        <p className="flex justify-between"><span className="text-slate-400">Vehicle:</span> <strong>{selectedPin.raw.vehicle}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Status:</span> <strong className="text-emerald-400">{selectedPin.raw.status}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Latitude:</span> <strong>{selectedPin.raw.lat.toFixed(5)}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Longitude:</span> <strong>{selectedPin.raw.lng.toFixed(5)}</strong></p>
                      </div>
                    )}

                    {selectedPin.type === "Vehicle" && (
                      <div className="space-y-2 text-xs font-sans text-slate-300">
                        <p className="flex justify-between"><span className="text-slate-400">Driver:</span> <strong>{selectedPin.raw.driver}</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Fuel Level:</span> <strong className={selectedPin.raw.fuel < 30 ? "text-rose-400" : "text-cyan-400"}>{selectedPin.raw.fuel}%</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Speed:</span> <strong>{selectedPin.raw.speed} mph</strong></p>
                        <p className="flex justify-between"><span className="text-slate-400">Active Jobs:</span> <strong>{selectedPin.raw.assignedJobs}</strong></p>
                      </div>
                    )}

                  </div>

                  {/* DIRECT CRM ACTION BUTTONS */}
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-extrabold text-slate-400">Contact</p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => {
                          const phone = selectedPin.raw?.phone || selectedPin.raw?.customerPhone;
                          if (!phone) { triggerNotification?.("No phone number on file."); return; }
                          callNumber(phone);
                        }}
                        className="px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Phone className="w-3.5 h-3.5" /> Call Client
                      </button>
                      <button
                        onClick={() => {
                          const phone = selectedPin.raw?.phone || selectedPin.raw?.customerPhone;
                          if (!phone) { triggerNotification?.("No phone number on file."); return; }
                          composeSms({ to: phone });
                        }}
                        className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/20 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" /> SMS Text
                      </button>
                      <button
                        onClick={() => {
                          const email = selectedPin.raw?.email || selectedPin.raw?.customerEmail;
                          if (!email) { triggerNotification?.("No email address on file."); return; }
                          composeEmail({ to: email });
                        }}
                        className="px-3 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Mail className="w-3.5 h-3.5" /> Send Email
                      </button>
                    </div>
                  </div>

                  {/* QUICK CONVERT BUTTONS FOR LEADS / ESTIMATES */}
                  {selectedPin.type === "Lead" && selectedPin.raw.status !== "Won" && (
                    <button
                      onClick={() => handleConvertLead(selectedPin.id)}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 shadow"
                    >
                      <UserCheck className="w-4 h-4" /> Convert Lead to Customer Profile
                    </button>
                  )}

                  {selectedPin.type === "Estimate" && selectedPin.raw.status !== "Accepted" && (
                    <button
                      onClick={() => handleApproveEstimate(selectedPin.id)}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 shadow"
                    >
                      <CheckCircle className="w-4 h-4" /> Approve Quote &amp; Dispatch Job
                    </button>
                  )}

                </div>
              )}

              {inspectorTab === "Timeline" && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-extrabold text-slate-300 uppercase tracking-wider">
                    Interactive Activity Log
                  </h4>
                  
                  <div className="space-y-3 font-sans text-xs">
                    <div className="border-l-2 border-blue-500 pl-3 py-1 space-y-0.5">
                      <p className="text-slate-400 text-[10px] font-bold">10 mins ago - Dispatch Engine</p>
                      <p className="text-white font-semibold">Geospatial coordinate geocoded successfully.</p>
                    </div>
                    <div className="border-l-2 border-purple-500 pl-3 py-1 space-y-0.5">
                      <p className="text-slate-400 text-[10px] font-bold">1 hour ago - CRM Ledger</p>
                      <p className="text-white font-semibold">Record updated instantly without duplicate entries.</p>
                    </div>
                    <div className="border-l-2 border-yellow-500 pl-3 py-1 space-y-0.5">
                      <p className="text-slate-400 text-[10px] font-bold">Yesterday - System Dispatch</p>
                      <p className="text-white font-semibold">Route travel optimizations applied to dispatch queue.</p>
                    </div>
                  </div>
                </div>
              )}

              {inspectorTab === "Notes" && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-extrabold text-slate-300 uppercase tracking-wider">
                    Notes &amp; Photo Logs
                  </h4>

                  {/* Render existing notes */}
                  <div className="bg-slate-950/60 rounded-xl p-3 max-h-48 overflow-y-auto space-y-2 border border-white/5">
                    {selectedPin.type === "Job" && selectedPin.raw.notes ? (
                      <p className="text-xs text-slate-300 font-sans whitespace-pre-line leading-relaxed">
                        {selectedPin.raw.notes}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 italic font-sans">No dispatcher notes yet.</p>
                    )}
                  </div>

                  {/* Add Notes Form */}
                  <div className="space-y-2">
                    <textarea
                      placeholder="Type a note or log updates..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleAddInspectorNote}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Save Note
                    </button>
                  </div>

                  {/* Interactive Photos Attachments Grid */}
                  <div className="border-t border-white/5 pt-4 space-y-2">
                    <p className="text-[10px] uppercase font-extrabold text-slate-400">Photo Ledger</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="relative bg-slate-800 border border-white/5 rounded-xl aspect-square flex flex-col items-center justify-center text-slate-500 hover:text-white cursor-pointer transition-colors">
                        <Camera className="w-5 h-5 mb-1" />
                        <span className="text-[8px] font-extrabold uppercase">Add Photo</span>
                      </div>
                      <div className="bg-slate-800 border border-white/5 rounded-xl overflow-hidden aspect-square relative group">
                        <img referrerPolicy="no-referrer" src="https://images.unsplash.com/photo-1581094288338-2314dddb7eed?w=120&auto=format&fit=crop&q=60" className="w-full h-full object-cover" alt="site work" />
                        <span className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[8px] text-white uppercase font-bold">View</span>
                      </div>
                      <div className="bg-slate-800 border border-white/5 rounded-xl overflow-hidden aspect-square relative group">
                        <img referrerPolicy="no-referrer" src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=120&auto=format&fit=crop&q=60" className="w-full h-full object-cover" alt="site work" />
                        <span className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[8px] text-white uppercase font-bold">View</span>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {inspectorTab === "Dispatch" && (
                <div className="space-y-4">
                  
                  {/* TECH DISPATCH ASSIGNER */}
                  {selectedPin.type === "Job" && (
                    <div className="space-y-4">
                      
                      {selectedPin.raw.status !== "Completed" && (
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-extrabold text-slate-400 flex items-center gap-1">
                            <Navigation className="w-3.5 h-3.5 text-blue-400 animate-pulse" /> Dispatch Technician
                          </label>
                          <select
                            value={selectedPin.raw.assignedEmployee || ""}
                            onChange={(e) => handleAssignTechnician(selectedPin.id, e.target.value)}
                            className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                          >
                            <option value="">Unassigned...</option>
                            {activeTechnicians.length === 0 ? (
                              <option value="" disabled>No employees on roster yet</option>
                            ) : (
                              activeTechnicians.map(t => (
                                <option key={t.id} value={t.name}>{t.name}{t.vehicle && t.vehicle !== "Unassigned" ? ` (${t.vehicle})` : ""}</option>
                              ))
                            )}
                          </select>
                        </div>
                      )}

                      {/* INVENTORY ALLOCATOR */}
                      {selectedPin.raw.status !== "Completed" && (
                        <div className="space-y-2 border-t border-white/5 pt-3">
                          <label className="text-[10px] uppercase font-extrabold text-slate-400 flex items-center gap-1">
                            <Package className="w-3.5 h-3.5 text-blue-400" /> Allocate Stock Parts
                          </label>
                          <div className="flex gap-2">
                            <select
                              value={selectedInventoryItem}
                              onChange={(e) => setSelectedInventoryItem(e.target.value)}
                              className="flex-1 px-3 py-2 bg-slate-800 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                            >
                              <option value="">Select inventory part...</option>
                              {inventoryList.filter(i => i.quantity > 0).map(i => (
                                <option key={i.id} value={i.id}>{i.name} (Qty: {i.quantity})</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                if (selectedInventoryItem) {
                                  handleAttachInventory(selectedPin.id, selectedInventoryItem, 1);
                                  setSelectedInventoryItem("");
                                }
                              }}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer"
                            >
                              Allocate
                            </button>
                          </div>
                        </div>
                      )}

                      {/* DOCUMENT LOG MOCK ATTACHMENT */}
                      {selectedPin.raw.status !== "Completed" && (
                        <div className="space-y-2 border-t border-white/5 pt-3">
                          <label className="text-[10px] uppercase font-extrabold text-slate-400 flex items-center gap-1">
                            <FileCode className="w-3.5 h-3.5 text-blue-400" /> Upload Signed Files
                          </label>
                          <input
                            type="file"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                handleUploadDocument(selectedPin.id, e.target.files[0].name);
                              }
                            }}
                            className="w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-white file:hover:bg-slate-700 cursor-pointer"
                          />
                        </div>
                      )}

                    </div>
                  )}

                  {selectedPin.type !== "Job" && (
                    <p className="text-xs text-slate-500 italic">No direct route or tech assignments needed for this node type.</p>
                  )}

                </div>
              )}

              {inspectorTab === "Finance" && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-extrabold text-slate-300 uppercase tracking-wider">
                    Financial Ledger
                  </h4>

                  {selectedPin.type === "Customer" && (
                    <div className="space-y-3 font-sans text-xs text-slate-300 bg-slate-800/40 p-3 rounded-xl border border-white/5">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Total Lifetime Invoiced:</span>
                        <strong className="text-emerald-400">${(selectedPin.raw.lifetimeValue || 0).toLocaleString()}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Total Outstanding Balance:</span>
                        <strong className="text-rose-400">${(selectedPin.raw.outstandingBalance || 0).toLocaleString()}</strong>
                      </div>
                      <div className="flex justify-between border-t border-white/5 pt-2 font-bold text-white">
                        <span>Net Value Yield:</span>
                        <span>${((selectedPin.raw.lifetimeValue || 0) - (selectedPin.raw.outstandingBalance || 0)).toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  {selectedPin.type === "Job" && (
                    <div className="space-y-3">
                      <div className="bg-slate-800/40 p-3 rounded-xl border border-white/5 text-xs text-slate-300 font-sans space-y-2">
                        <div className="flex justify-between">
                          <span>Standard Flat Service Fee:</span>
                          <strong>$150.00</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Labor cost (Estimated):</span>
                          <strong>$400.00</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Parts &amp; Inventory allocations:</span>
                          <strong>$900.00</strong>
                        </div>
                        <div className="flex justify-between border-t border-white/5 pt-2 font-bold text-white">
                          <span>Total Job Bid Quote:</span>
                          <span className="text-emerald-400">$1,450.00</span>
                        </div>
                      </div>

                      {selectedPin.raw.status !== "Completed" && (
                        <button
                          onClick={() => handleCompleteJob(selectedPin.id)}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-md"
                        >
                          <CheckCircle className="w-4 h-4" /> Mark Job Complete &amp; Invoice
                        </button>
                      )}
                    </div>
                  )}

                  {selectedPin.type !== "Customer" && selectedPin.type !== "Job" && (
                    <p className="text-xs text-slate-500 italic">No core financial data recorded for this node type.</p>
                  )}

                </div>
              )}

            </div>

            {/* INSPECTOR FOOTER BUTTONS */}
            <div className="border-t border-white/10 pt-4 flex gap-2">
              <button
                onClick={() => {
                  if (onNavigateToScreen) {
                    if (selectedPin.type === "Customer") onNavigateToScreen("customers", { customerId: selectedPin.id });
                    else if (selectedPin.type === "Lead") onNavigateToScreen("leads");
                    else if (selectedPin.type === "Estimate") onNavigateToScreen("estimates");
                    else if (selectedPin.type === "Job") onNavigateToScreen("scheduling", { date: selectedPin.raw.date });
                  }
                }}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider transition-colors cursor-pointer text-center"
              >
                🔍 Open Full Workspace View
              </button>
              <button
                onClick={() => setSelectedPin(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* INTERACTIVE LOCATION MASTER FILE & EDITOR POPUP MODAL */}
      <AnimatePresence>
        {isLocationModalOpen && selectedPin && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-slate-900 border border-white/15 rounded-[24px] p-6 shadow-3xl text-left flex flex-col space-y-4 max-h-[90vh] overflow-y-auto scrollbar-none"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20 text-blue-400">
                    <MapPin className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-extrabold text-white tracking-wider uppercase">
                      📍 {selectedPin.type} Master File
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold font-mono">
                      ID Reference: {selectedPin.id}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsLocationModalOpen(false)}
                  className="p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Form */}
              <div className="space-y-4 py-2">
                
                {/* Name / Business Name */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-extrabold text-slate-400">
                    Lead / Customer / Business Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter Name or Business Name"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none transition-colors"
                  />
                </div>

                {/* Email (if applicable) */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-extrabold text-slate-400">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="e.g. contact@domain.com"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none transition-colors"
                  />
                </div>

                {/* Phone Numbers array with +/- widgets */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-extrabold text-slate-400 flex justify-between items-center">
                    <span>Phone Numbers</span>
                    <span className="text-[9px] text-slate-500 font-normal">Add up to 5 contact lines</span>
                  </label>
                  
                  <div className="space-y-2">
                    {editPhones.map((phone, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={phone}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditPhones(prev => prev.map((p, i) => i === idx ? val : p));
                          }}
                          placeholder="(206) 555-0100"
                          className="flex-1 px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none transition-colors"
                        />
                        
                        <div className="flex gap-1.5">
                          {/* Plus button */}
                          {idx === editPhones.length - 1 && editPhones.length < 5 && (
                            <button
                              type="button"
                              onClick={() => setEditPhones([...editPhones, ""])}
                              className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/20 transition-all cursor-pointer"
                              title="Add Phone Number"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}

                          {/* Minus button */}
                          {(editPhones.length > 1 || phone.trim() !== "") && (
                            <button
                              type="button"
                              onClick={() => {
                                if (editPhones.length > 1) {
                                  setEditPhones(prev => prev.filter((_, i) => i !== idx));
                                } else {
                                  setEditPhones([""]);
                                }
                              }}
                              className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/20 transition-all cursor-pointer"
                              title="Remove Phone Number"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Structured Addresses Inputs */}
                <div className="border-t border-white/5 pt-3 space-y-3">
                  <p className="text-[10px] uppercase font-extrabold text-blue-400 tracking-wider">
                    Geospatial Location Data
                  </p>

                  {/* Street Address */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-extrabold text-slate-400">
                      Street Address
                    </label>
                    <input
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      placeholder="e.g. 1200 4th Ave"
                      className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Row of City/State and Zip */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-extrabold text-slate-400">
                        City, State
                      </label>
                      <input
                        type="text"
                        value={editCityState}
                        onChange={(e) => setEditCityState(e.target.value)}
                        placeholder="e.g. Seattle, WA"
                        className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none transition-colors"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-extrabold text-slate-400">
                        Zip Code
                      </label>
                      <input
                        type="text"
                        value={editZip}
                        onChange={(e) => setEditZip(e.target.value)}
                        placeholder="e.g. 98101"
                        className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Action Buttons */}
              <div className="border-t border-white/10 pt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsLocationModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveLocationEdits}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all shadow-md cursor-pointer hover:shadow-lg"
                >
                  Save Master File
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
