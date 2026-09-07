import React, { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  Search,
  Filter,
  User,
  Users,
  Truck,
  MapPin,
  Clock,
  Phone,
  Mail,
  MessageSquare,
  Navigation,
  Calendar,
  AlertCircle,
  CheckCircle,
  XCircle,
  Sliders,
  Map,
  Edit,
  Eye,
  Lock,
  ChevronRight,
  Sparkles,
  Info,
  ExternalLink,
  Plus,
  RefreshCw,
  PhoneCall,
  Check
} from "lucide-react";

// Reuse the SchedulingEvent type or extend it dynamically for Dispatch
export interface DispatchEvent {
  id: string;
  eventType: string;
  customType?: string;
  date: string;
  startTime: string;
  endTime: string;
  customer: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  assignedEmployee: string;
  assignedCrew?: string;
  assignedVehicle?: string; // New field for Dispatch
  location?: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  notes?: string;
  status: "Unassigned" | "Assigned" | "En Route" | "Arrived" | "Working" | "On Hold" | "Completed" | "Cancelled" | "Scheduled";
  estimatedDuration?: string; // New field for Dispatch
  department?: string; // e.g. Plumbing, HVAC, Electrical
}

const DEPARTMENTS = ["Plumbing", "HVAC", "Electrical", "General"];
const EVENT_TYPES = ["Job", "Site Visit", "Estimate", "Consultation", "Meeting", "Custom"];

const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

const STATUSES: Array<DispatchEvent["status"]> = [
  "Unassigned",
  "Assigned",
  "En Route",
  "Arrived",
  "Working",
  "On Hold",
  "Completed",
  "Cancelled"
];

export const DispatchPage: React.FC = () => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const { schedulingEvents: events, setSchedulingEvents: setEvents, customers: customersList, employees } = useDomainData();
  const AVAILABLE_TECHNICIANS = useMemo(() => employees
    .map(employee => `${employee.firstName} ${employee.lastName}`.trim())
    .filter((name, index, names) => name.length > 0 && names.indexOf(name) === index)
    .sort((a, b) => a.localeCompare(b)), [employees]);
  const AVAILABLE_CREWS = useMemo(() => ["None", ...Array.from(new Set(events.map(event => event.assignedCrew).filter((crew): crew is string => !!crew && crew !== "None"))).sort()], [events]);
  const AVAILABLE_VEHICLES = useMemo(() => ["None", ...Array.from(new Set(events.map(event => event.assignedVehicle).filter((vehicle): vehicle is string => !!vehicle && vehicle !== "None"))).sort()], [events]);
  const {
    openPlaceholderPage: onOpenPlaceholder,
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    navigateToScreen: onNavigateToScreen,
    logOperationalEvent,
    triggerNotification
  } = useNavTelemetry();
  // Current Selected Date in Dispatch view - Defaults to "2026-07-05" (Today in system context)
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const initialDateAligned = useRef(false);
  
  // Search query
  const [searchQuery, setSearchQuery] = useState("");

  // Quick Filters (Header Panel)
  const [filterEmployee, setFilterEmployee] = useState("All");
  const [filterCrew, setFilterCrew] = useState("All");
  const [filterVehicle, setFilterVehicle] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterDepartment, setFilterDepartment] = useState("All");
  const [filterEventType, setFilterEventType] = useState("All");

  // Show/Hide filter advanced bar
  const [showFilters, setShowFilters] = useState(false);

  // Active Summary Card Filter (None, Unassigned, Assigned, InProgress, CompletedToday, TechsAvailable, CrewsAvailable)
  const [activeSummaryFilter, setActiveSummaryFilter] = useState<string>("All");

  // Selected event for dispatch operations
  const [selectedEvent, setSelectedEvent] = useState<DispatchEvent | null>(null);
  
  // Dialog States
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignType, setAssignType] = useState<"technician" | "crew" | "vehicle" | "all">("all");
  
  // Fields for the assignment modal
  const [tempEmployee, setTempEmployee] = useState("");
  const [tempCrew, setTempCrew] = useState("");
  const [tempVehicle, setTempVehicle] = useState("");
  const [tempStatus, setTempStatus] = useState<DispatchEvent["status"]>("Assigned");

  // Determine if active user role has WRITE PERMISSIONS for dispatch
  // Owners, Managers, Schedulers, Dispatchers can assign and modify.
  // Technicians, Drivers, Installers can only view dispatches assigned to them.
  const hasWriteAccess = useMemo(() => {
    const roleLower = activeRole.toLowerCase();
    return (
      roleLower.includes("owner") ||
      roleLower.includes("manager") ||
      roleLower.includes("scheduler") ||
      roleLower.includes("dispatcher") ||
      activeRole === "Office Manager"
    );
  }, [activeRole]);

  // Handle setting status / assigning dispatch
  const handleUpdateDispatch = (
    eventId: string,
    updates: {
      assignedEmployee?: string;
      assignedCrew?: string;
      assignedVehicle?: string;
      status?: DispatchEvent["status"];
      notes?: string;
    }
  ) => {
    if (!hasWriteAccess) {
      if (logOperationalEvent) {
        logOperationalEvent("Permission Denied", "Attempted to modify dispatch without write permissions", "⚠️");
      }
      return;
    }

    setEvents((prev) =>
      prev.map((evt) => {
        if (evt.id === eventId) {
          const updated = {
            ...evt,
            ...updates,
            // If we are assigning an employee/crew/vehicle, we auto-update status to "Assigned" if it was "Unassigned"
            status: updates.status || (evt.status === "Unassigned" || evt.status === "Scheduled" ? "Assigned" : evt.status)
          };
          
          // Trigger logs & notifications
          if (logOperationalEvent) {
            let desc = `Dispatch #${evt.id.replace("evt_", "")} updated.`;
            if (updates.assignedEmployee) desc += ` Assigned to: ${updates.assignedEmployee}.`;
            if (updates.assignedCrew) desc += ` Crew: ${updates.assignedCrew}.`;
            if (updates.assignedVehicle) desc += ` Vehicle: ${updates.assignedVehicle}.`;
            if (updates.status) desc += ` Status: ${updates.status}.`;
            logOperationalEvent("Dispatch Update", desc, "🚚");
          }
          
          return updated;
        }
        return evt;
      })
    );

    // If selected event is being viewed in Details, sync state
    if (selectedEvent && selectedEvent.id === eventId) {
      setSelectedEvent((prev) => (prev ? { ...prev, ...updates, status: updates.status || prev.status } : null));
    }
  };

  // Standardize existing events to fit Dispatch fields safely (defaulting values if missing)
  const normalizedEvents = useMemo<DispatchEvent[]>(() => {
    return events.map((evt) => {
      // Fallback/enrich status to fit the dispatch list
      let status: DispatchEvent["status"] = evt.status || "Scheduled";
      if (!evt.assignedEmployee || evt.assignedEmployee === "None" || evt.assignedEmployee === "") {
        status = "Unassigned";
      } else if (status === "Scheduled") {
        status = "Assigned";
      }

      return {
        ...evt,
        assignedVehicle: evt.assignedVehicle || "None",
        estimatedDuration: evt.estimatedDuration || "",
        department: evt.department || (evt.notes?.toLowerCase().includes("hvac") ? "HVAC" : evt.notes?.toLowerCase().includes("water") ? "Plumbing" : "General"),
        status
      };
    });
  }, [events]);

  useEffect(() => {
    if (initialDateAligned.current || !normalizedEvents.length) return;
    initialDateAligned.current = true;
    if (normalizedEvents.some(event => event.date === selectedDate)) return;
    const dates = Array.from(new Set(normalizedEvents.map(event => event.date).filter(Boolean))).sort();
    const nextDate = dates.find(date => date >= selectedDate) || dates[dates.length - 1];
    if (nextDate) setSelectedDate(nextDate);
  }, [normalizedEvents, selectedDate]);

  // Compute stats for summary cards
  const stats = useMemo(() => {
    // We only compute stats for the currently selected date to match real-time operations
    const dayEvents = normalizedEvents.filter(e => e.date === selectedDate);
    
    const unassigned = dayEvents.filter(e => e.status === "Unassigned" || !e.assignedEmployee || e.assignedEmployee === "None").length;
    const assigned = dayEvents.filter(e => e.status === "Assigned").length;
    const inProgress = dayEvents.filter(e => ["En Route", "Arrived", "Working"].includes(e.status)).length;
    const completedToday = dayEvents.filter(e => e.status === "Completed").length;

    // Available count based on preset list vs active schedule today
    const activeTechsToday = new Set(dayEvents.map(e => e.assignedEmployee).filter(name => name && name !== "None"));
    const techsAvailable = AVAILABLE_TECHNICIANS.filter(t => !activeTechsToday.has(t)).length;

    const activeCrewsToday = new Set(dayEvents.map(e => e.assignedCrew).filter(c => c && c !== "None"));
    const crewsAvailable = AVAILABLE_CREWS.filter(c => c !== "None" && !activeCrewsToday.has(c)).length;

    return {
      unassigned,
      assigned,
      inProgress,
      completedToday,
      techsAvailable,
      crewsAvailable
    };
  }, [normalizedEvents, selectedDate]);

  // Filter events according to:
  // 1. Role Restrictions (Technicians, Drivers, Installers can only view their own dispatches)
  // 2. Selected Date
  // 3. Search query
  // 4. Advanced Filters
  // 5. Active Summary Card selection
  const filteredEvents = useMemo(() => {
    let result = [...normalizedEvents];

    // 1. Role Restrictions -- compare against the real logged-in user's
    // real name, not a hardcoded fake name or their role title (a job
    // title like "technician" isn't a person's name, so that comparison
    // never matched either — restricted roles would have seen almost
    // nothing, not even their own real assigned jobs).
    const roleLower = activeRole.toLowerCase();
    const isRestrictedRole = roleLower.includes("technician") || roleLower.includes("driver") || roleLower.includes("installer");
    if (isRestrictedRole) {
      const myName = (loggedInUser?.name || "").trim().toLowerCase();
      result = result.filter(
        (e) => !!myName && e.assignedEmployee.trim().toLowerCase() === myName
      );
    }

    // 2. Selected Date
    result = result.filter((e) => e.date === selectedDate);

    // 3. Search Query (Customer, address, employee, crew)
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.customer.toLowerCase().includes(q) ||
          e.customerAddress?.toLowerCase().includes(q) ||
          e.assignedEmployee.toLowerCase().includes(q) ||
          e.assignedCrew?.toLowerCase().includes(q) ||
          e.notes?.toLowerCase().includes(q)
      );
    }

    // 4. Advanced Filters
    if (filterEmployee !== "All") {
      result = result.filter((e) => e.assignedEmployee === filterEmployee);
    }
    if (filterCrew !== "All") {
      result = result.filter((e) => e.assignedCrew === filterCrew);
    }
    if (filterVehicle !== "All") {
      result = result.filter((e) => e.assignedVehicle === filterVehicle);
    }
    if (filterStatus !== "All") {
      result = result.filter((e) => e.status === filterStatus);
    }
    if (filterPriority !== "All") {
      result = result.filter((e) => e.priority === filterPriority);
    }
    if (filterDepartment !== "All") {
      result = result.filter((e) => e.department === filterDepartment);
    }
    if (filterEventType !== "All") {
      result = result.filter((e) => e.eventType === filterEventType);
    }

    // 5. Summary Card click filters
    if (activeSummaryFilter === "Unassigned") {
      result = result.filter((e) => e.status === "Unassigned" || !e.assignedEmployee || e.assignedEmployee === "None");
    } else if (activeSummaryFilter === "Assigned") {
      result = result.filter((e) => e.status === "Assigned");
    } else if (activeSummaryFilter === "InProgress") {
      result = result.filter((e) => ["En Route", "Arrived", "Working"].includes(e.status));
    } else if (activeSummaryFilter === "CompletedToday") {
      result = result.filter((e) => e.status === "Completed");
    }

    return result;
  }, [
    normalizedEvents,
    activeRole,
    selectedDate,
    searchQuery,
    filterEmployee,
    filterCrew,
    filterVehicle,
    filterStatus,
    filterPriority,
    filterDepartment,
    filterEventType,
    activeSummaryFilter,
    loggedInUser
  ]);

  // Open Assign Modal with preloaded details
  const openAssignModal = (evt: DispatchEvent, type: typeof assignType) => {
    if (!hasWriteAccess) return;
    setSelectedEvent(evt);
    setTempEmployee(evt.assignedEmployee === "None" ? "" : evt.assignedEmployee);
    setTempCrew(evt.assignedCrew || "");
    setTempVehicle(evt.assignedVehicle || "");
    setTempStatus(
      (evt.status === "Unassigned" || evt.status === "Scheduled") && type !== "all"
        ? "Assigned"
        : evt.status
    );
    setAssignType(type);
    setShowAssignModal(true);
  };

  // Navigate trigger helpers that direct to unbuilt page placeholders or active modules
  const handleNavigateToScreen = (targetId: string, alertText: string) => {
    if (onNavigateToScreen) {
      onNavigateToScreen(targetId);
      if (logOperationalEvent) {
        logOperationalEvent("Navigate", `Navigated to ${targetId} page via Dispatch shortcut.`, "🔗");
      }
    } else {
      onOpenPlaceholder(targetId, "🚚");
    }
  };

  return (
    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm min-h-[420px] flex flex-col justify-between gap-5 animate-fade-in text-left">
      
      {/* 1. Header Bar following exact placeholder style but loaded with controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-[#A9CDEE] pb-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-[#1F3557] flex items-center justify-center border border-[#9EC8EF] shadow-2xs">
            <Truck className="w-5 h-5 text-[#315C9F]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-sans font-extrabold text-[#1F3557] uppercase tracking-wider">Dispatch Center</h2>
              {!hasWriteAccess && (
                <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-md font-bold">
                  <Lock className="w-2.5 h-2.5" /> View-Only (Technician View)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-sans font-semibold">Real-time scheduling, tracking, and fleet distribution hub</p>
          </div>
        </div>
        
        {/* Date Selector & Refresh Buttons */}
        <div className="flex items-center gap-2 self-stretch md:self-auto">
          <div 
            onClick={() => {
              const inputEl = document.getElementById("dispatch-date-picker");
              if (inputEl) {
                try {
                  (inputEl as any).focus();
                  (inputEl as any).showPicker();
                } catch (err) {}
              }
            }}
            className="flex items-center bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-1.5 shadow-2xs cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-[#315C9F] mr-2 shrink-0" />
            <input
              id="dispatch-date-picker"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              onClick={(e) => {
                e.stopPropagation();
                try {
                  (e.target as any).showPicker();
                } catch (err) {}
              }}
              className="bg-transparent border-none text-xs font-bold text-[#1F3557] outline-none cursor-pointer w-full"
            />
          </div>

          <button
            onClick={() => {
              if (onOpenAIAnalysis) {
                onOpenAIAnalysis("dispatch", "Dispatch Operations", `We have ${filteredEvents.length} active dispatches for ${selectedDate}.`);
              }
            }}
            className="px-3 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-xs font-black shadow-md hover:from-violet-700 hover:to-indigo-700 transition-all flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" /> Ask AI
          </button>
        </div>
      </div>

      {/* 2. Top Action Controls & Quick Filters Panel */}
      <div className="bg-[#E3F3FF] p-4 rounded-2xl border border-[#9EC8EF] flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (!hasWriteAccess) return;
                const firstUnassigned = filteredEvents.find(e => e.status === "Unassigned");
                if (firstUnassigned) {
                  openAssignModal(firstUnassigned, "technician");
                } else {
                  triggerNotification("No unassigned jobs found on this day to allocate. Modify a job below directly.");
                }
              }}
              disabled={!hasWriteAccess}
              className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs ${
                hasWriteAccess
                  ? "bg-[#EAF5FF] text-[#1F3557] border-[#9EC8EF] hover:bg-[#BDDDF8] cursor-pointer"
                  : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
              }`}
            >
              <User className="w-3.5 h-3.5 text-[#315C9F]" /> Assign Tech
            </button>

            <button
              onClick={() => {
                if (!hasWriteAccess) return;
                const firstUnassigned = filteredEvents.find(e => e.status === "Unassigned");
                if (firstUnassigned) {
                  openAssignModal(firstUnassigned, "crew");
                } else {
                  triggerNotification("No unassigned jobs found on this day. Select a job in the list to dispatch.");
                }
              }}
              disabled={!hasWriteAccess}
              className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs ${
                hasWriteAccess
                  ? "bg-[#EAF5FF] text-[#1F3557] border-[#9EC8EF] hover:bg-[#BDDDF8] cursor-pointer"
                  : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
              }`}
            >
              <Users className="w-3.5 h-3.5 text-[#315C9F]" /> Assign Crew
            </button>

            <button
              onClick={() => {
                if (!hasWriteAccess) return;
                const firstUnassigned = filteredEvents.find(e => e.status === "Unassigned");
                if (firstUnassigned) {
                  openAssignModal(firstUnassigned, "vehicle");
                } else {
                  triggerNotification("Select a job below to modify vehicle allocation.");
                }
              }}
              disabled={!hasWriteAccess}
              className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs ${
                hasWriteAccess
                  ? "bg-[#EAF5FF] text-[#1F3557] border-[#9EC8EF] hover:bg-[#BDDDF8] cursor-pointer"
                  : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
              }`}
            >
              <Truck className="w-3.5 h-3.5 text-[#315C9F]" /> Assign Vehicle
            </button>

            <button
              onClick={() => {
                if (!hasWriteAccess) return;
                const firstAssigned = filteredEvents.find(e => e.status !== "Unassigned");
                if (firstAssigned) {
                  openAssignModal(firstAssigned, "all");
                } else {
                  triggerNotification("No active dispatches available for reassignment.");
                }
              }}
              disabled={!hasWriteAccess}
              className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs ${
                hasWriteAccess
                  ? "bg-[#EAF5FF] text-[#1F3557] border-[#9EC8EF] hover:bg-[#BDDDF8] cursor-pointer"
                  : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#315C9F]" /> Reassign
            </button>
          </div>

          {/* Search bar & Filter toggler */}
          <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[#5E7393]" />
              <input
                type="text"
                placeholder="Search dispatch logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl focus:outline-none focus:border-[#315C9F] text-[#1F3557] font-bold placeholder-[#5E7393]/60 shadow-inner-sm"
              />
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs ${
                showFilters
                  ? "bg-[#315C9F] text-white border-[#315C9F]"
                  : "bg-[#EAF5FF] text-[#1F3557] border-[#9EC8EF] hover:bg-[#BDDDF8]"
              }`}
            >
              <Filter className="w-3.5 h-3.5" /> Filters
            </button>
          </div>
        </div>

        {/* 3. Advanced Filtering Row (Dropdowns) */}
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 bg-[#EAF5FF] p-3 rounded-xl border border-[#9EC8EF] animate-fade-in text-[11px]">
            <div>
              <label className="block text-[9px] font-black text-[#5E7393] uppercase mb-1">Employee</label>
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="w-full bg-white border border-[#9EC8EF] rounded-lg p-1 text-[11px] font-bold text-[#1F3557] outline-none"
              >
                <option value="All">All Employees</option>
                {AVAILABLE_TECHNICIANS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-black text-[#5E7393] uppercase mb-1">Crew</label>
              <select
                value={filterCrew}
                onChange={(e) => setFilterCrew(e.target.value)}
                className="w-full bg-white border border-[#9EC8EF] rounded-lg p-1 text-[11px] font-bold text-[#1F3557] outline-none"
              >
                <option value="All">All Crews</option>
                {AVAILABLE_CREWS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-black text-[#5E7393] uppercase mb-1">Vehicle</label>
              <select
                value={filterVehicle}
                onChange={(e) => setFilterVehicle(e.target.value)}
                className="w-full bg-white border border-[#9EC8EF] rounded-lg p-1 text-[11px] font-bold text-[#1F3557] outline-none"
              >
                <option value="All">All Fleet</option>
                {AVAILABLE_VEHICLES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-black text-[#5E7393] uppercase mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-white border border-[#9EC8EF] rounded-lg p-1 text-[11px] font-bold text-[#1F3557] outline-none"
              >
                <option value="All">All Statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-black text-[#5E7393] uppercase mb-1">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full bg-white border border-[#9EC8EF] rounded-lg p-1 text-[11px] font-bold text-[#1F3557] outline-none"
              >
                <option value="All">All Priorities</option>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-black text-[#5E7393] uppercase mb-1">Department</label>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="w-full bg-white border border-[#9EC8EF] rounded-lg p-1 text-[11px] font-bold text-[#1F3557] outline-none"
              >
                <option value="All">All Depts</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-black text-[#5E7393] uppercase mb-1">Event Type</label>
              <select
                value={filterEventType}
                onChange={(e) => setFilterEventType(e.target.value)}
                className="w-full bg-white border border-[#9EC8EF] rounded-lg p-1 text-[11px] font-bold text-[#1F3557] outline-none"
              >
                <option value="All">All Types</option>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilterEmployee("All");
                  setFilterCrew("All");
                  setFilterVehicle("All");
                  setFilterStatus("All");
                  setFilterPriority("All");
                  setFilterDepartment("All");
                  setFilterEventType("All");
                  setSearchQuery("");
                }}
                className="w-full bg-slate-200 hover:bg-slate-300 border border-slate-300 rounded-lg py-1 px-2 text-[10px] font-black text-[#1F3557] uppercase text-center transition-all cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Interactive Summary Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { id: "Unassigned", label: "Unassigned Jobs", val: stats.unassigned, color: "border-rose-400 bg-rose-50 text-rose-900", icon: "🚨" },
          { id: "Assigned", label: "Assigned Jobs", val: stats.assigned, color: "border-blue-300 bg-blue-50 text-blue-900", icon: "📋" },
          { id: "InProgress", label: "In Progress", val: stats.inProgress, color: "border-amber-400 bg-amber-50 text-amber-900", icon: "⚡" },
          { id: "CompletedToday", label: "Completed Today", val: stats.completedToday, color: "border-emerald-400 bg-emerald-50 text-emerald-900", icon: "✅" },
          { id: "TechsAvailable", label: "Techs Available", val: stats.techsAvailable, color: "border-teal-400 bg-teal-50 text-teal-900", icon: "👤" },
          { id: "CrewsAvailable", label: "Crews Available", val: stats.crewsAvailable, color: "border-purple-400 bg-purple-50 text-purple-900", icon: "👥" }
        ].map((card) => {
          const isSelected = activeSummaryFilter === card.id;
          return (
            <div
              key={card.id}
              onClick={() => {
                if (card.id === "TechsAvailable") {
                  // Direct to roster or set filter
                  setFilterEmployee("All");
                  setActiveSummaryFilter("All");
                  triggerNotification(`There are ${stats.techsAvailable} technicians without any assignment on ${selectedDate}.`);
                } else if (card.id === "CrewsAvailable") {
                  setFilterCrew("All");
                  setActiveSummaryFilter("All");
                  triggerNotification(`There are ${stats.crewsAvailable} crews with zero scheduled events on ${selectedDate}.`);
                } else {
                  setActiveSummaryFilter(isSelected ? "All" : card.id);
                }
              }}
              className={`p-3 border rounded-2xl cursor-pointer transition-all flex flex-col justify-between hover:shadow-md h-20 text-left ${
                isSelected
                  ? "ring-2 ring-[#315C9F] shadow-sm transform scale-102"
                  : "opacity-90 hover:opacity-100"
              } ${card.color}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider">{card.label}</span>
                <span className="text-sm">{card.icon}</span>
              </div>
              <p className="text-xl font-sans font-black tracking-tight leading-none">{card.val}</p>
            </div>
          );
        })}
      </div>

      {/* 5. Main Double Column (Dispatch Board List vs Map) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-stretch">
        
        {/* Left Hand: Live Dispatch Board List (7 Columns) */}
        <div className="lg:col-span-7 flex flex-col gap-3 min-h-[350px]">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <span>📋 Dispatch Queue</span>
              <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-mono font-bold rounded-lg">
                {filteredEvents.length} active
              </span>
            </h3>
            {activeSummaryFilter !== "All" && (
              <span className="text-[9px] bg-[#EAF5FF] text-[#1F3557] px-2 py-0.5 border border-[#9EC8EF] rounded-lg font-black uppercase">
                Filtered: {activeSummaryFilter}
              </span>
            )}
          </div>

          <div className="flex-1 bg-[#E3F3FF] border border-[#9EC8EF] rounded-2xl p-4 overflow-y-auto max-h-[500px] flex flex-col gap-3">
            {filteredEvents.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/50 rounded-xl border border-dashed border-[#A9CDEE]">
                <AlertCircle className="w-8 h-8 text-[#5E7393]/60 mb-2" />
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">No Dispatches Found</h4>
                <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-relaxed">
                  No active events meet the filter requirements for {selectedDate}. Adjust filters or add scheduling assignments.
                </p>
              </div>
            ) : (
              filteredEvents.map((evt) => {
                const isUrgent = evt.priority === "Urgent" || evt.priority === "High";
                return (
                  <div
                    key={evt.id}
                    className="bg-white border border-[#9EC8EF]/50 hover:border-[#315C9F]/70 rounded-xl p-3.5 shadow-sm hover:shadow transition-all flex flex-col justify-between gap-3 text-left relative"
                  >
                    {/* Top Row: Event Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                            evt.status === "Completed" ? "bg-green-100 text-green-800" :
                            evt.status === "Working" ? "bg-amber-100 text-amber-800 animate-pulse" :
                            evt.status === "Unassigned" ? "bg-rose-100 text-rose-800" :
                            "bg-blue-100 text-blue-800"
                          }`}>
                            {evt.status}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                            isUrgent ? "bg-red-50 text-red-700 border border-red-200" : "bg-slate-50 text-slate-600"
                          }`}>
                            {evt.priority} Priority
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold">•</span>
                          <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider">{evt.eventType}</span>
                        </div>
                        <h4 className="text-xs font-black text-[#1F3557] mt-1.5 font-sans leading-tight hover:underline cursor-pointer" onClick={() => setSelectedEvent(evt)}>
                          {evt.customer}
                        </h4>
                        <p className="text-[10.5px] text-[#5E7393] font-semibold flex items-center gap-1 mt-1 leading-snug">
                          <MapPin className="w-3 h-3 text-[#315C9F] shrink-0" /> {evt.customerAddress || evt.location}
                        </p>
                      </div>

                      {/* Time Window Info */}
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-[#315C9F] text-xs font-mono font-bold justify-end">
                          <Clock className="w-3.5 h-3.5" /> {evt.startTime}
                        </div>
                        <p className="text-[9px] text-[#5E7393] font-bold mt-1">Dur: {evt.estimatedDuration}</p>
                      </div>
                    </div>

                    {/* Middle Row: Allocation Indicators */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 text-[10px] font-sans">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-400 uppercase">Technician</span>
                        <span className="font-bold text-[#1F3557] truncate flex items-center gap-1">
                          <User className="w-2.5 h-2.5 text-[#315C9F]" /> {evt.assignedEmployee || "Unassigned"}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-400 uppercase">Crew</span>
                        <span className="font-bold text-[#1F3557] truncate flex items-center gap-1">
                          <Users className="w-2.5 h-2.5 text-[#315C9F]" /> {evt.assignedCrew || "None"}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-400 uppercase">Vehicle</span>
                        <span className="font-bold text-[#1F3557] truncate flex items-center gap-1">
                          <Truck className="w-2.5 h-2.5 text-[#315C9F]" /> {evt.assignedVehicle || "None"}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row: Inline Quick Re-assignment Controls */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] flex-wrap gap-2">
                      {evt.notes && (
                        <p className="text-[10px] text-slate-500 italic truncate max-w-xs">
                          "{evt.notes}"
                        </p>
                      )}
                      
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          onClick={() => setSelectedEvent(evt)}
                          className="px-2 py-1 bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF] rounded-lg font-bold hover:bg-[#BDDDF8] flex items-center gap-1 transition-all"
                        >
                          <Eye className="w-3 h-3" /> Details
                        </button>

                        {hasWriteAccess && (
                          <button
                            onClick={() => openAssignModal(evt, "all")}
                            className="px-2 py-1 bg-gradient-to-r from-blue-600 to-[#315C9F] text-white rounded-lg font-black hover:opacity-95 shadow-2xs flex items-center gap-1 transition-all"
                          >
                            <Edit className="w-3 h-3 text-white" /> Dispatch
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Hand: today's real dispatch summary, linking out to the
            actual live map (Interactive Map & Routes) for real GPS pins --
            no simulated positions or invented street names here. */}
        <div className="lg:col-span-5 flex flex-col gap-3 min-h-[350px]">
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <span>🗺️ Today's Dispatch</span>
          </h3>

          <div className="flex-1 bg-[#E3F3FF] border border-[#9EC8EF] rounded-2xl p-4 flex flex-col gap-4 shadow-inner">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white rounded-xl border border-[#9EC8EF] p-3">
                <p className="text-xl font-black text-[#1F3557]">{filteredEvents.length}</p>
                <p className="text-[9px] font-bold uppercase text-[#5E7393] mt-1">Jobs Today</p>
              </div>
              <div className="bg-white rounded-xl border border-[#9EC8EF] p-3">
                <p className="text-xl font-black text-[#1F3557]">{AVAILABLE_TECHNICIANS.filter(tech => filteredEvents.some(e => e.assignedEmployee === tech)).length}</p>
                <p className="text-[9px] font-bold uppercase text-[#5E7393] mt-1">Techs Assigned</p>
              </div>
              <div className="bg-white rounded-xl border border-[#9EC8EF] p-3">
                <p className="text-xl font-black text-[#1F3557]">{filteredEvents.filter(e => e.status === "Unassigned").length}</p>
                <p className="text-[9px] font-bold uppercase text-[#5E7393] mt-1">Unassigned</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#9EC8EF] divide-y divide-[#9EC8EF]/40 overflow-y-auto max-h-[220px]">
              {filteredEvents.length === 0 ? (
                <p className="text-center text-[10px] font-semibold text-[#5E7393] py-6">No jobs scheduled for this day.</p>
              ) : filteredEvents.map(evt => (
                <button key={evt.id} onClick={() => setSelectedEvent(evt)} className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#EAF5FF] cursor-pointer">
                  <span>
                    <span className="block text-[11px] font-bold text-[#1F3557]">{evt.customer}</span>
                    <span className="block text-[9px] font-semibold text-[#5E7393]">{evt.assignedEmployee || "Unassigned"} · {evt.startTime}</span>
                  </span>
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${evt.status === "Unassigned" ? "bg-rose-100 text-rose-700" : evt.status === "Completed" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{evt.status}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => handleNavigateToScreen("routes", "Opening the live map.")}
              className="w-full py-2.5 bg-[#315C9F] hover:bg-[#1F3557] text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Map className="w-3.5 h-3.5" /> Open Live Map <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

      </div>

      {/* 6. Dispatch Details Popover Modal */}
      {selectedEvent && !showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs animate-fade-in p-4">
          <div className="bg-[#C7E3FB] rounded-2xl border border-[#A9CDEE] shadow-2xl p-6 max-w-md w-full animate-fade-in text-left">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-[#315C9F]" />
                <div>
                  <h3 className="font-sans font-black text-[#1F3557] text-sm uppercase tracking-wider">Dispatch Event Card</h3>
                  <p className="text-[10px] text-[#5E7393] font-bold">ID: {selectedEvent.id.toUpperCase()}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="w-6 h-6 rounded-lg bg-[#E3F3FF] hover:bg-slate-200 border border-[#A9CDEE] flex items-center justify-center text-[#1F3557] font-bold cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Customer Details info blocks */}
            <div className="flex flex-col gap-3 bg-white/85 p-4 rounded-xl border border-[#A9CDEE]/60 mb-4 text-xs">
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase">Customer Profile</span>
                <p className="font-black text-[#1F3557] text-sm leading-snug">{selectedEvent.customer}</p>
                <div className="flex items-center gap-3 mt-1 text-[#5E7393]">
                  {selectedEvent.customerPhone && (
                    <span className="flex items-center gap-1 font-bold">
                      <Phone className="w-3 h-3" /> {selectedEvent.customerPhone}
                    </span>
                  )}
                  {selectedEvent.customerEmail && (
                    <span className="flex items-center gap-1 font-bold">
                      <Mail className="w-3 h-3" /> {selectedEvent.customerEmail}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase">Service Location</span>
                <p className="font-bold text-[#1F3557]">{selectedEvent.customerAddress || selectedEvent.location}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-2.5">
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase">Scheduled Time</span>
                  <p className="font-bold text-[#1F3557]">{selectedEvent.startTime} - {selectedEvent.endTime}</p>
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase">Event Type</span>
                  <p className="font-bold text-[#1F3557]">{selectedEvent.eventType}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5 text-[11px]">
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Crew</span>
                  <span className="font-extrabold text-[#1F3557]">{selectedEvent.assignedCrew || "None"}</span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Vehicle</span>
                  <span className="font-extrabold text-[#1F3557]">{selectedEvent.assignedVehicle || "None"}</span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Current Status</span>
                  <span className={`inline-block px-1.5 py-0.5 text-[9px] font-black uppercase rounded mt-0.5 ${
                    selectedEvent.status === "Completed" ? "bg-green-100 text-green-800" :
                    selectedEvent.status === "Unassigned" ? "bg-rose-100 text-rose-800" :
                    "bg-blue-100 text-blue-800"
                  }`}>
                    {selectedEvent.status}
                  </span>
                </div>
              </div>

              {selectedEvent.notes && (
                <div className="border-t border-slate-100 pt-2.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase">Operational Notes</span>
                  <p className="text-[#1F3557] italic mt-0.5">"{selectedEvent.notes}"</p>
                </div>
              )}
            </div>

            {/* Action Buttons Row */}
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    if (!hasWriteAccess) {
                      triggerNotification("Permission denied. Ask owner/dispatcher.");
                      return;
                    }
                    setTempEmployee(selectedEvent.assignedEmployee);
                    setTempCrew(selectedEvent.assignedCrew || "");
                    setTempVehicle(selectedEvent.assignedVehicle || "");
                    setTempStatus(selectedEvent.status);
                    setAssignType("all");
                    setShowAssignModal(true);
                  }}
                  className={`py-2 px-3 border rounded-xl text-xs font-black text-center transition-all ${
                    hasWriteAccess
                      ? "bg-[#EAF5FF] hover:bg-[#BDDDF8] border-[#9EC8EF] text-[#1F3557] cursor-pointer"
                      : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  }`}
                >
                  Assign Dispatch
                </button>

                <button
                  onClick={() => {
                    if (!hasWriteAccess) return;
                    setTempEmployee(selectedEvent.assignedEmployee);
                    setTempCrew(selectedEvent.assignedCrew || "");
                    setTempVehicle(selectedEvent.assignedVehicle || "");
                    setTempStatus(selectedEvent.status);
                    setAssignType("all");
                    setShowAssignModal(true);
                  }}
                  className={`py-2 px-3 border rounded-xl text-xs font-black text-center transition-all ${
                    hasWriteAccess
                      ? "bg-[#EAF5FF] hover:bg-[#BDDDF8] border-[#9EC8EF] text-[#1F3557] cursor-pointer"
                      : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  }`}
                >
                  Reassign Fleet
                </button>
              </div>

              {/* Secondary Navigation actions */}
              <div className="grid grid-cols-3 gap-1.5 text-[10px] mt-2">
                <button
                  onClick={() => {
                    // Messaging popup
                    handleNavigateToScreen("messages", "Open active SMS thread");
                    setSelectedEvent(null);
                  }}
                  className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-[#1F3557] border border-slate-200 rounded-lg font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[#315C9F]" /> Msg Tech
                </button>

                <button
                  onClick={() => {
                    if (selectedEvent.customerPhone) window.location.href = `tel:${selectedEvent.customerPhone}`;
                  }}
                  disabled={!selectedEvent.customerPhone}
                  className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-[#1F3557] border border-slate-200 rounded-lg font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <PhoneCall className="w-3.5 h-3.5 text-emerald-600" /> Call Client
                </button>

                <button
                  onClick={() => {
                    if (onNavigateToScreen) {
                      onNavigateToScreen("customers");
                      if (logOperationalEvent) {
                        logOperationalEvent("Client Lookup", `Inspected ${selectedEvent.customer} records`, "👥");
                      }
                    } else {
                      onOpenPlaceholder("customers", "👥");
                    }
                    setSelectedEvent(null);
                  }}
                  className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-[#1F3557] border border-slate-200 rounded-lg font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-indigo-500" /> Client
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-1 text-[10px]">
                <button
                  onClick={() => {
                    handleNavigateToScreen("jobs", "Job Operations Portal");
                    setSelectedEvent(null);
                  }}
                  className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-[#1F3557] border border-slate-200 rounded-lg font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-600" /> View Job File
                </button>

                <button
                  onClick={() => {
                    handleNavigateToScreen("routes", "Route Operations System");
                    setSelectedEvent(null);
                  }}
                  className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-[#1F3557] border border-slate-200 rounded-lg font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5 text-[#315C9F]" /> Route GPS
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 7. Assign / Reassign Dispatch Allocation Dialog */}
      {showAssignModal && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs animate-fade-in p-4">
          <div className="bg-[#C7E3FB] rounded-2xl border border-[#A9CDEE] shadow-2xl p-6 max-w-sm w-full text-left">
            <h3 className="font-sans font-black text-[#1F3557] text-sm uppercase tracking-wider mb-4 border-b border-[#A9CDEE] pb-2 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#315C9F]" /> Allocate Resources
            </h3>

            <div className="flex flex-col gap-3 text-xs mb-5">
              <p className="text-slate-600 font-sans font-semibold mb-1 leading-relaxed">
                Approve dispatch specifications for <strong>{selectedEvent.customer}</strong> on {selectedDate}.
              </p>

              {/* Employee Assignee */}
              {(assignType === "technician" || assignType === "all") && (
                <div>
                  <label className="block text-[10px] font-black text-[#5E7393] uppercase mb-1">Technician Assignee</label>
                  <select
                    value={tempEmployee}
                    onChange={(e) => setTempEmployee(e.target.value)}
                    className="w-full bg-white border border-[#A9CDEE] rounded-lg p-2 font-bold text-[#1F3557] outline-none"
                  >
                    <option value="">Unassigned</option>
                    {AVAILABLE_TECHNICIANS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}

              {/* Crew Assignee */}
              {(assignType === "crew" || assignType === "all") && (
                <div>
                  <label className="block text-[10px] font-black text-[#5E7393] uppercase mb-1">Crew Allocation</label>
                  <select
                    value={tempCrew}
                    onChange={(e) => setTempCrew(e.target.value)}
                    className="w-full bg-white border border-[#A9CDEE] rounded-lg p-2 font-bold text-[#1F3557] outline-none"
                  >
                    {AVAILABLE_CREWS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              {/* Vehicle Assignee */}
              {(assignType === "vehicle" || assignType === "all") && (
                <div>
                  <label className="block text-[10px] font-black text-[#5E7393] uppercase mb-1">Dispatch Vehicle</label>
                  <select
                    value={tempVehicle}
                    onChange={(e) => setTempVehicle(e.target.value)}
                    className="w-full bg-white border border-[#A9CDEE] rounded-lg p-2 font-bold text-[#1F3557] outline-none"
                  >
                    {AVAILABLE_VEHICLES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}

              {/* Dispatch Progress Status */}
              {assignType === "all" && (
                <div>
                  <label className="block text-[10px] font-black text-[#5E7393] uppercase mb-1">Dispatch Progress Status</label>
                  <select
                    value={tempStatus}
                    onChange={(e) => setTempStatus(e.target.value as any)}
                    className="w-full bg-white border border-[#A9CDEE] rounded-lg p-2 font-bold text-[#1F3557] outline-none"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-2 border-t border-[#A9CDEE] pt-3">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-3 py-1.5 bg-white hover:bg-slate-200 border border-[#A9CDEE] text-[#1F3557] text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const hasResourceAssignment = Boolean(
                    (assignType === "technician" && tempEmployee) ||
                    (assignType === "crew" && tempCrew && tempCrew !== "None") ||
                    (assignType === "vehicle" && tempVehicle && tempVehicle !== "None") ||
                    (assignType === "all" && (tempEmployee || (tempCrew && tempCrew !== "None") || (tempVehicle && tempVehicle !== "None")))
                  );
                  const nextStatus = hasResourceAssignment && (tempStatus === "Unassigned" || tempStatus === "Scheduled")
                    ? "Assigned"
                    : tempStatus;
                  handleUpdateDispatch(selectedEvent.id, {
                    assignedEmployee: tempEmployee || "None",
                    assignedCrew: tempCrew || "None",
                    assignedVehicle: tempVehicle || "None",
                    status: nextStatus
                  });
                  setSelectedEvent(prev => prev ? {
                    ...prev,
                    assignedEmployee: tempEmployee || "None",
                    assignedCrew: tempCrew || "None",
                    assignedVehicle: tempVehicle || "None",
                    status: nextStatus
                  } : null);
                  setShowAssignModal(false);
                }}
                className="px-4 py-1.5 bg-[#315C9F] text-white rounded-xl text-xs font-black shadow hover:opacity-95 transition-all flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" /> Apply Allocation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Bottom Information Banner matching Sandbox Simulation exact footer style */}
      <div className="bg-[#E3F3FF] p-3 rounded-xl border border-[#A9CDEE] text-[10.5px] font-sans font-semibold text-slate-600 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping shrink-0" />
          <span>Fleet telemetry operational • Regional dispatch loop synced with Scheduling calendar database</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => handleNavigateToScreen("timeclock", "Clock details")} className="hover:underline text-[#315C9F] font-bold">⏱️ Clock-in Tracker</button>
          <span className="text-slate-300">|</span>
          <button onClick={() => handleNavigateToScreen("ai_assistant", "AI chat helper")} className="hover:underline text-indigo-600 font-bold">🤖 Operational Assistant</button>
        </div>
      </div>

    </div>
  );
};
