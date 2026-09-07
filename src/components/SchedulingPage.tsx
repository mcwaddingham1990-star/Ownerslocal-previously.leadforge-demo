import React, { useState, useMemo, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Plus,
  Clock,
  Users,
  MapPin,
  AlertCircle,
  Check,
  X,
  Trash2,
  Edit3,
  Copy,
  Sparkles,
  XCircle,
  Building,
  Phone,
  Mail,
  User,
  CalendarDays,
  ShieldAlert,
  ArrowRight
} from "lucide-react";

import { StructuredAddressFields } from "./StructuredAddressFields";

export type { SchedulingEvent } from "../types/domain";
import type { SchedulingEvent } from "../types/domain";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";

const DEFAULT_EVENT_TYPES = [
  "Estimate",
  "Consultation",
  "Meeting",
  "Job",
  "Project Review",
  "Site Visit",
  "Follow-Up",
  "Inspection",
  "Delivery",
  "Training",
  "PTO",
  "Vacation",
  "Sick Day",
  "Vehicle Maintenance",
  "Equipment Maintenance",
  "Inventory Delivery",
  "Reminder",
  "Task",
  "Custom"
];


const PRIORITIES: Array<"Low" | "Medium" | "High" | "Urgent"> = ["Low", "Medium", "High", "Urgent"];

export const SchedulingPage: React.FC = () => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const {
    schedulingEvents: events,
    setSchedulingEvents: setEvents,
    customers: customersList,
    setCustomers,
    setNotifications,
    preSelectedDate,
    preSelectedCustomerId,
    employees
  } = useDomainData();
  const EMPLOYEES = useMemo(() => employees
    .map(employee => `${employee.firstName} ${employee.lastName}`.trim())
    .filter((name, index, names) => name.length > 0 && names.indexOf(name) === index)
    .sort((a, b) => a.localeCompare(b)), [employees]);
  const selectableCustomers = useMemo(() => {
    const byKey = new Map<string, { id: string; contact: string; company: string; phone: string; email: string; address: string }>();
    customersList.forEach(customer => byKey.set(customer.id, customer));
    events.forEach(event => {
      const name = event.customer?.trim();
      if (!name) return;
      const existing = customersList.find(customer => customer.id === event.customerId || customer.contact === name || customer.company === name);
      const key = existing?.id || event.customerId || `event_customer_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
      if (!byKey.has(key)) byKey.set(key, {
        id: key, contact: name, company: "", phone: event.customerPhone || "",
        email: event.customerEmail || "", address: event.customerAddress || event.location || ""
      });
    });
    return [...byKey.values()].sort((a, b) => (a.contact || a.company).localeCompare(b.contact || b.company));
  }, [customersList, events]);
  const {
    openPlaceholderPage: onOpenPlaceholder,
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    navigateToScreen: onNavigateToScreen,
    logOperationalEvent,
    triggerNotification
  } = useNavTelemetry();
  // Native window.alert()/confirm() block the JS main thread until dismissed
  // -- in some embedded/automated contexts they never get dismissed, which
  // reads as the whole page freezing. Route confirmations through in-app UI.
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const requestConfirm = (message: string, onConfirm: () => void) => setConfirmState({ message, onConfirm });
  // Navigation states
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (preSelectedDate) {
      return new Date(preSelectedDate);
    }
    return new Date();
  });

  const [activeView, setActiveView] = useState<"month" | "week" | "day">("month");
  const [timeFormat24, setTimeFormat24] = useState<boolean>(false); // false = 12-hour, true = 24-hour
  const [searchQuery, setSearchQuery] = useState("");

  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState("All");
  const [filterCrew, setFilterCrew] = useState("All");
  const [filterCustomer, setFilterCustomer] = useState("All");
  const [filterEventType, setFilterEventType] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterCompleted, setFilterCompleted] = useState("All"); // All, Completed, Incomplete
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");

  // Popups/Modals
  const [isNewEventOpen, setIsNewEventOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<SchedulingEvent | null>(null);
  const [isEditingEvent, setIsEditingEvent] = useState(false);

  // New/Edit Event Form Fields
  const [formType, setFormType] = useState("Job");
  const [formCustomType, setFormCustomType] = useState("");
  // The only other required field besides the date -- everything else
  // (customer, employee, crew, location, etc.) is optional context you can
  // fill in later. Doubles as the event's display label when no customer
  // is attached.
  const [formDescriptor, setFormDescriptor] = useState("");
  const [formDate, setFormDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [formStartHour, setFormStartHour] = useState("09");
  const [formStartMin, setFormStartMin] = useState("00");
  const [formStartAmPm, setFormStartAmPm] = useState("AM");
  const [formEndHour, setFormEndHour] = useState("10");
  const [formEndMin, setFormEndMin] = useState("30");
  const [formEndAmPm, setFormEndAmPm] = useState("AM");
  
  const [formCustomerMode, setFormCustomerMode] = useState<"search" | "custom">("search");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [formCustomName, setFormCustomName] = useState("");
  const [formCustomPhone, setFormCustomPhone] = useState("");
  const [formCustomEmail, setFormCustomEmail] = useState("");
  const [formCustomAddress, setFormCustomAddress] = useState("");
  const [formCustomCityState, setFormCustomCityState] = useState("");
  const [formCustomZip, setFormCustomZip] = useState("");

  const [formEmployee, setFormEmployee] = useState("");
  const crews = useMemo(() => ["None", ...Array.from(new Set(events.map(event => event.assignedCrew).filter((crew): crew is string => !!crew && crew !== "None"))).sort()], [events]);
  const [formCrew, setFormCrew] = useState("None");
  const [formLocation, setFormLocation] = useState("");
  const [formPriority, setFormPriority] = useState<"Low" | "Medium" | "High" | "Urgent">("Medium");
  const [formNotes, setFormNotes] = useState("");
  // Expected $ value for a Job event -- every job needs this populated the
  // same way regardless of how it was created (manually here, from an
  // accepted estimate, from the Jobs page, or approved off the map), so
  // anything reading a job's budget (Money Tracker's ticker, reports) sees
  // a real number instead of one code path leaving it blank.
  const [formBudget, setFormBudget] = useState("");

  // Check if role has create/edit permissions
  // Schedulers, Dispatchers, Owners, Managers can do everything.
  const isHighPrivilege = useMemo(() => {
    const editRoles = ["Owner", "General Manager", "Office Manager", "Operations Manager", "Scheduler", "Dispatcher", "Admin"];
    return editRoles.includes(activeRole);
  }, [activeRole]);

  // Handle pre-populated customer from Customers/Leads
  useEffect(() => {
    if (preSelectedCustomerId && customersList.length > 0) {
      const match = customersList.find(c => c.id === preSelectedCustomerId);
      if (match) {
        setSelectedCustomerId(match.id);
        setFormCustomerMode("search");
        setFormLocation(match.address || "");
        setIsNewEventOpen(true);
      }
    }
  }, [preSelectedCustomerId, customersList]);

  // Convert hours and minutes to 24h standard HH:MM
  const formatTimeTo24h = (hour: string, min: string, ampm: string): string => {
    let h = parseInt(hour, 10);
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    const hStr = h.toString().padStart(2, "0");
    return `${hStr}:${min}`;
  };

  // Convert 24h string (HH:MM) to separate fields for state
  const parse24hTime = (time24: string) => {
    const [hStr, mStr] = time24.split(":");
    let h = parseInt(hStr, 10);
    let ampm = "AM";
    if (h >= 12) {
      ampm = "PM";
      if (h > 12) h -= 12;
    }
    if (h === 0) h = 12;
    return {
      hour: h.toString().padStart(2, "0"),
      min: mStr || "00",
      ampm
    };
  };

  // Human legible time formatting helper
  const formatTimeDisplay = (time24: string) => {
    if (!time24) return "";
    if (timeFormat24) return time24; // military format "15:26"
    const { hour, min, ampm } = parse24hTime(time24);
    return `${parseInt(hour, 10)}:${min} ${ampm}`;
  };

  // Clear Form Fields
  const resetForm = (dateStr?: string) => {
    setFormType("Job");
    setFormCustomType("");
    setFormDescriptor("");
    setFormDate(dateStr || formatDateString(currentDate));
    setFormStartHour("09");
    setFormStartMin("00");
    setFormStartAmPm("AM");
    setFormEndHour("10");
    setFormEndMin("30");
    setFormEndAmPm("AM");
    setFormCustomerMode("search");
    // Nothing pre-selected -- customer and employee are optional, so the
    // form shouldn't open looking like they're already (or need to be) set.
    setSelectedCustomerId("");
    setFormCustomName("");
    setFormCustomPhone("");
    setFormCustomEmail("");
    setFormCustomAddress("");
    setFormCustomCityState("");
    setFormCustomZip("");
    setFormEmployee("");
    setFormCrew("None");
    setFormLocation("");
    setFormPriority("Medium");
    setFormNotes("");
    setFormBudget("");
    setIsEditingEvent(false);
  };

  // Select customer callback to pre-fill address
  const handleCustomerSelect = (id: string) => {
    setSelectedCustomerId(id);
    const match = selectableCustomers.find(c => c.id === id);
    if (match) {
      setFormLocation(match.address || "");
    }
  };

  // Date Formatting Helpers
  const formatDateString = (d: Date): string => {
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getMonthName = (d: Date): string => {
    return d.toLocaleString("default", { month: "long" });
  };

  const getDayName = (d: Date): string => {
    return d.toLocaleString("default", { weekday: "long" });
  };

  // Navigation handlers
  const handleToday = () => {
    setCurrentDate(new Date("2026-07-05"));
  };

  const handlePrev = () => {
    const newD = new Date(currentDate);
    if (activeView === "month") {
      newD.setMonth(newD.getMonth() - 1);
    } else if (activeView === "week") {
      newD.setDate(newD.getDate() - 7);
    } else {
      newD.setDate(newD.getDate() - 1);
    }
    setCurrentDate(newD);
  };

  const handleNext = () => {
    const newD = new Date(currentDate);
    if (activeView === "month") {
      newD.setMonth(newD.getMonth() + 1);
    } else if (activeView === "week") {
      newD.setDate(newD.getDate() + 7);
    } else {
      newD.setDate(newD.getDate() + 1);
    }
    setCurrentDate(newD);
  };

  // Filter application
  const filteredEvents = useMemo(() => {
    return events.filter(evt => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const customerMatch = evt.customer.toLowerCase().includes(query);
        const employeeMatch = evt.assignedEmployee.toLowerCase().includes(query);
        const notesMatch = (evt.notes || "").toLowerCase().includes(query);
        const locationMatch = (evt.location || "").toLowerCase().includes(query);
        const typeMatch = evt.eventType.toLowerCase().includes(query) || (evt.customType || "").toLowerCase().includes(query);
        if (!customerMatch && !employeeMatch && !notesMatch && !locationMatch && !typeMatch) {
          return false;
        }
      }

      // 2. Employee filter
      if (filterEmployee !== "All" && evt.assignedEmployee !== filterEmployee) return false;

      // 3. Crew filter
      if (filterCrew !== "All" && evt.assignedCrew !== filterCrew) return false;

      // 4. Customer filter
      if (filterCustomer !== "All" && evt.customer !== filterCustomer) return false;

      // 5. Event Type filter
      if (filterEventType !== "All") {
        if (filterEventType === "Custom Only" && evt.eventType !== "Custom") return false;
        if (filterEventType !== "Custom Only" && evt.eventType !== filterEventType) return false;
      }

      // 6. Priority filter
      if (filterPriority !== "All" && evt.priority !== filterPriority) return false;

      // 7. Status filter
      if (filterStatus !== "All" && evt.status !== filterStatus) return false;

      // 8. Completed / Incomplete filter
      if (filterCompleted === "Completed" && evt.status !== "Completed") return false;
      if (filterCompleted === "Incomplete" && evt.status === "Completed") return false;

      // 9. Date Range filter
      if (filterDateStart && evt.date < filterDateStart) return false;
      if (filterDateEnd && evt.date > filterDateEnd) return false;

      // Role check for view restrictions: Technicians, Drivers, Installers, and other
      // non-privileged employees can only view events assigned to them. Previously this
      // computed an `isAssigned` flag but never applied it (see git history) — every
      // employee could see every customer's name/phone/email/address regardless of role.
      // Real fix: compare against the actual logged-in user's name, not their role title
      // (the old heuristic compared assignedEmployee to activeRole, which are different
      // concepts — a job title isn't a person's name).
      if (!isHighPrivilege) {
        const myName = (loggedInUser?.name || "").trim().toLowerCase();
        const isAssigned = !!myName && evt.assignedEmployee.trim().toLowerCase() === myName;
        if (!isAssigned) return false;
      }

      return true;
    });
  }, [events, searchQuery, filterEmployee, filterCrew, filterCustomer, filterEventType, filterPriority, filterStatus, filterCompleted, filterDateStart, filterDateEnd, isHighPrivilege, activeRole, loggedInUser]);

  // Month View Days Generation
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // First day of current month
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Total days in current month
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Days from previous month to fill the starting row
    const prevMonthDays = [];
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      prevMonthDays.push({
        dayNum: prevMonthTotalDays - i,
        dateStr: formatDateString(new Date(year, month - 1, prevMonthTotalDays - i)),
        isCurrentMonth: false
      });
    }

    // Days of current month
    const currentMonthDays = [];
    for (let i = 1; i <= totalDays; i++) {
      currentMonthDays.push({
        dayNum: i,
        dateStr: formatDateString(new Date(year, month, i)),
        isCurrentMonth: true
      });
    }

    // Days of next month to fill the ending row
    const nextMonthDays = [];
    const remainingSlots = 42 - (prevMonthDays.length + currentMonthDays.length);
    for (let i = 1; i <= remainingSlots; i++) {
      nextMonthDays.push({
        dayNum: i,
        dateStr: formatDateString(new Date(year, month + 1, i)),
        isCurrentMonth: false
      });
    }

    return [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];
  }, [currentDate]);

  // Week View Days Generation
  const weekDays = useMemo(() => {
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    // Set to Sunday of the current week
    startOfWeek.setDate(startOfWeek.getDate() - day);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push({
        name: d.toLocaleString("default", { weekday: "short" }),
        dayNum: d.getDate(),
        dateStr: formatDateString(d),
        dateObj: d
      });
    }
    return days;
  }, [currentDate]);

  // Create Event Handler
  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();

    // Permission Guard
    if (!isHighPrivilege) {
      triggerNotification(`Role Restricted: Only Owners, Managers, Schedulers, and Dispatchers can create or edit events. Your current role is '${activeRole}'.`);
      return;
    }

    const descriptor = formDescriptor.trim();
    if (!descriptor) {
      triggerNotification("Please enter a description for this event.");
      return;
    }

    let customerName = formCustomName.trim();
    let customerPhone = formCustomPhone.trim();
    let customerEmail = formCustomEmail.trim();
    let customerAddress = [formCustomAddress.trim(), formCustomCityState.trim(), formCustomZip.trim()].filter(Boolean).join(", ");

    let resolvedCustomerId = selectedCustomerId;
    if (formCustomerMode === "search" && selectedCustomerId) {
      const match = selectableCustomers.find(c => c.id === selectedCustomerId);
      if (match) {
        customerName = match.contact;
        customerPhone = match.phone || "";
        customerEmail = match.email || "";
        customerAddress = match.address || "";
      }
    }
    // No customer attached -- the descriptor doubles as the display label
    // everywhere this event's .customer field is read.
    if (!customerName) customerName = descriptor;

    // Only create a customer record if a real contact name was actually
    // typed -- not just because "Add Customer" mode was left selected while
    // the field itself stayed empty (customerName would otherwise silently
    // fall back to the descriptor text above).
    if (formCustomerMode === "custom" && formCustomName.trim()) {
      resolvedCustomerId = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setCustomers(prev => [{
        id: resolvedCustomerId, company: customerName, contact: customerName,
        phone: customerPhone, email: customerEmail, address: customerAddress,
        openJobs: 0, outstandingBalance: 0, lifetimeValue: 0,
        status: "Active", type: "Residential", isVIP: false, recentlyAdded: true,
        requireFollowUp: false, pendingConfirmation: true, createdFrom: "schedule_job"
      }, ...prev]);
      setNotifications(prev => [{
        id: `customer_review_${resolvedCustomerId}`, screenId: "customers",
        title: "Edit and confirm new customer",
        message: `${customerName} was added while scheduling a job. Review and confirm the customer record.`,
        isRead: false, timestamp: new Date().toISOString()
      }, ...prev]);
    }

    const tStart = formatTimeTo24h(formStartHour, formStartMin, formStartAmPm);
    const tEnd = formatTimeTo24h(formEndHour, formEndMin, formEndAmPm);

    if (isEditingEvent && selectedEvent) {
      // Edit existing
      setEvents(prev => prev.map(evt => evt.id === selectedEvent.id ? {
        ...evt,
        eventType: formType,
        customType: formType === "Custom" ? formCustomType.trim() : undefined,
        date: formDate,
        startTime: tStart,
        endTime: tEnd,
        customerId: resolvedCustomerId,
        customer: customerName,
        title: descriptor,
        customerPhone,
        customerEmail,
        customerAddress,
        assignedEmployee: formEmployee,
        assignedCrew: formCrew !== "None" ? formCrew : undefined,
        location: formLocation.trim() || customerAddress,
        priority: formPriority,
        notes: formNotes.trim(),
        budget: formType === "Job" ? (Number(formBudget) || 0) : evt.budget
      } : evt));

      if (logOperationalEvent) {
        logOperationalEvent("Event Updated", `Shared scheduled ${formType} event for ${customerName} was updated`, "📅");
      }
    } else {
      // Create new
      const newEvt: SchedulingEvent = {
        id: "evt_" + Math.random().toString(36).substring(2, 9),
        eventType: formType,
        customType: formType === "Custom" ? formCustomType.trim() : undefined,
        date: formDate,
        startTime: tStart,
        endTime: tEnd,
        customerId: resolvedCustomerId,
        customer: customerName,
        title: descriptor,
        customerPhone,
        customerEmail,
        customerAddress,
        assignedEmployee: formEmployee,
        assignedCrew: formCrew !== "None" ? formCrew : undefined,
        location: formLocation.trim() || customerAddress,
        priority: formPriority,
        notes: formNotes.trim(),
        status: "Scheduled",
        budget: formType === "Job" ? (Number(formBudget) || 0) : undefined
      };

      setEvents(prev => [...prev, newEvt]);

      if (logOperationalEvent) {
        logOperationalEvent("Event Scheduled", `Created new ${formType} event for ${customerName} on ${formDate}`, "📅");
      }
    }

    setIsNewEventOpen(false);
    setIsDetailsOpen(false);
    setSelectedEvent(null);
  };

  // Open Edit Form for Event
  const handleOpenEditForm = (evt: SchedulingEvent) => {
    // Check permission
    if (!isHighPrivilege) {
      triggerNotification(`Role Restricted: Only Owners, Managers, Schedulers, and Dispatchers can edit event times/dates.`);
      return;
    }

    setSelectedEvent(evt);
    setFormType(evt.eventType);
    setFormCustomType(evt.customType || "");
    setFormDescriptor(evt.title || evt.description || "");
    setFormDate(evt.date);

    const startFields = parse24hTime(evt.startTime);
    setFormStartHour(startFields.hour);
    setFormStartMin(startFields.min);
    setFormStartAmPm(startFields.ampm);

    const endFields = parse24hTime(evt.endTime);
    setFormEndHour(endFields.hour);
    setFormEndMin(endFields.min);
    setFormEndAmPm(endFields.ampm);

    // See if customer exists in search list to bind
    const customerMatch = customersList.find(c => c.contact === evt.customer);
    if (customerMatch) {
      setFormCustomerMode("search");
      setSelectedCustomerId(customerMatch.id);
    } else {
      setFormCustomerMode("custom");
      setFormCustomName(evt.customer);
      setFormCustomPhone(evt.customerPhone || "");
      setFormCustomEmail(evt.customerEmail || "");
      
      const parts = (evt.customerAddress || "").split(",").map(s => s.trim());
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
      setFormCustomAddress(street);
      setFormCustomCityState(cityState);
      setFormCustomZip(zip);
    }

    setFormEmployee(evt.assignedEmployee);
    setFormCrew(evt.assignedCrew || "None");
    setFormLocation(evt.location || "");
    setFormPriority(evt.priority);
    setFormNotes(evt.notes || "");
    setFormBudget(evt.budget ? String(evt.budget) : "");

    setIsEditingEvent(true);
    setIsNewEventOpen(true);
  };

  // Status mutation handlers
  const handleUpdateStatus = (evtId: string, newStatus: "Scheduled" | "Completed" | "Cancelled") => {
    // Techs / employees CAN update status of their assigned jobs
    const eventToUpdate = events.find(e => e.id === evtId);
    if (!eventToUpdate) return;

    const isAssigned = eventToUpdate.assignedEmployee.toLowerCase().includes(activeRole.toLowerCase()) || 
                       activeRole.toLowerCase() === "owner" || 
                       activeRole.toLowerCase() === "general manager" || 
                       activeRole.toLowerCase() === "office manager" ||
                       activeRole.toLowerCase() === "operations manager" ||
                       activeRole.toLowerCase() === "scheduler" ||
                       activeRole.toLowerCase() === "dispatcher";

    if (!isAssigned) {
      triggerNotification("Role Permission Error: You can only update the status of events assigned directly to you.");
      return;
    }

    setEvents(prev => prev.map(e => e.id === evtId ? { ...e, status: newStatus } : e));
    if (selectedEvent && selectedEvent.id === evtId) {
      setSelectedEvent(prev => prev ? { ...prev, status: newStatus } : null);
    }

    if (logOperationalEvent) {
      logOperationalEvent("Status Changed", `Event status for ${eventToUpdate.customer} changed to ${newStatus}`, "🔄");
    }
  };

  const handleDuplicateEvent = (evt: SchedulingEvent) => {
    if (!isHighPrivilege) {
      triggerNotification("Permission Restricted: Duplicate is only available to coordinators.");
      return;
    }
    const dup: SchedulingEvent = {
      ...evt,
      id: "evt_" + Math.random().toString(36).substring(2, 9),
      status: "Scheduled"
    };
    setEvents(prev => [...prev, dup]);
    if (logOperationalEvent) {
      logOperationalEvent("Event Duplicated", `Duplicated appointment of type ${evt.eventType} for ${evt.customer}`, "📅");
    }
    setIsDetailsOpen(false);
  };

  const handleDeleteEvent = (evtId: string) => {
    if (!isHighPrivilege) {
      triggerNotification("Permission Restricted: Deletion is only available to managers/schedulers.");
      return;
    }
    const match = events.find(e => e.id === evtId);
    if (!match) return;

    requestConfirm(`Are you sure you want to delete this scheduled event for '${match.customer}'?`, () => {
      setEvents(prev => prev.filter(e => e.id !== evtId));
      if (logOperationalEvent) {
        logOperationalEvent("Event Deleted", `Removed event for ${match.customer} on ${match.date}`, "🗑️");
      }
      setIsDetailsOpen(false);
      setSelectedEvent(null);
    });
  };

  // Helper colors for events
  const getEventBadgeColor = (type: string) => {
    switch (type) {
      case "Estimate":
        return "bg-amber-100 text-amber-800 border-amber-300";
      case "Consultation":
        return "bg-cyan-100 text-cyan-800 border-cyan-300";
      case "Job":
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "Meeting":
        return "bg-indigo-100 text-indigo-800 border-indigo-300";
      case "PTO":
      case "Vacation":
      case "Sick Day":
        return "bg-pink-100 text-pink-800 border-pink-300";
      case "Vehicle Maintenance":
      case "Equipment Maintenance":
        return "bg-rose-100 text-rose-800 border-rose-300";
      case "Training":
        return "bg-purple-100 text-purple-800 border-purple-300";
      default:
        return "bg-slate-100 text-slate-800 border-slate-300";
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "Urgent":
        return "bg-red-500 text-white";
      case "High":
        return "bg-orange-500 text-white";
      case "Medium":
        return "bg-blue-500 text-white";
      default:
        return "bg-slate-400 text-white";
    }
  };

  // Specific Minute / Hour Day View selection
  const handleSelectTimeSlot = (hour24: number, minute: number = 0) => {
    const hStr = hour24.toString().padStart(2, "0");
    const mStr = minute.toString().padStart(2, "0");
    
    // Parse to 12h representation for state
    let h12 = hour24;
    let ampm = "AM";
    if (h12 >= 12) {
      ampm = "PM";
      if (h12 > 12) h12 -= 12;
    }
    if (h12 === 0) h12 = 12;

    const hour12Str = h12.toString().padStart(2, "0");

    setFormStartHour(hour12Str);
    setFormStartMin(mStr);
    setFormStartAmPm(ampm);

    // End time is 1 hour later
    let endHour24 = (hour24 + 1) % 24;
    let eh12 = endHour24;
    let eampm = "AM";
    if (eh12 >= 12) {
      eampm = "PM";
      if (eh12 > 12) eh12 -= 12;
    }
    if (eh12 === 0) eh12 = 12;

    setFormEndHour(eh12.toString().padStart(2, "0"));
    setFormEndMin(mStr);
    setFormEndAmPm(eampm);

    setFormDate(formatDateString(currentDate));
    setIsNewEventOpen(true);
  };

  // This week's (Sun-Sat) jobs, split into two live-scrolling tickers --
  // same rolling-ticker treatment as Money Tracker's upcoming jobs/bills.
  // Still-upcoming jobs scroll on the left in green; once a job's date
  // passes without it being marked Completed, it drops off the left and
  // starts scrolling on the right in red instead.
  const renderJobTickers = () => {
    const todayStr = formatDateString(new Date());
    const weekStart = new Date(currentDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = formatDateString(weekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = formatDateString(weekEnd);

    const thisWeeksJobs = events.filter(evt =>
      evt.date >= weekStartStr && evt.date <= weekEndStr && evt.status !== "Completed" && evt.status !== "Cancelled"
    );
    const upcoming = thisWeeksJobs
      .filter(evt => evt.date >= todayStr)
      .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date < b.date ? -1 : 1))
      .map(evt => ({ id: evt.id, label: evt.title || evt.customer || "Job", sub: evt.date }));
    const pastDue = thisWeeksJobs
      .filter(evt => evt.date < todayStr)
      .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date < b.date ? -1 : 1))
      .map(evt => ({ id: evt.id, label: evt.title || evt.customer || "Job", sub: evt.date }));

    const renderTicker = (items: Array<{ id: string; label: string; sub: string }>, emptyText: string, tone: "upcoming" | "pastDue") => (
      <div className="bg-[linear-gradient(145deg,rgba(224,242,255,0.94),rgba(195,227,251,0.96))] rounded-lg border border-white/95 shadow-[0_0_14px_rgba(56,189,248,0.36),inset_0_0_18px_rgba(255,255,255,0.82)] h-40 overflow-hidden relative">
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
                    <span
                      className={`font-semibold truncate ${tone === "upcoming" ? "text-[#00C853]" : "text-[#FF1744]"}`}
                      style={{ textShadow: tone === "upcoming" ? "0 0 6px rgba(0,230,118,0.85), 0 0 14px rgba(0,200,83,0.5)" : "0 0 6px rgba(255,23,68,0.85), 0 0 14px rgba(255,23,68,0.5)" }}
                    >
                      {item.label}
                    </span>
                    <span
                      className={`font-mono font-bold shrink-0 ${tone === "upcoming" ? "text-[#00C853]" : "text-[#FF1744]"}`}
                      style={{ textShadow: tone === "upcoming" ? "0 0 7px rgba(0,230,118,0.9), 0 0 16px rgba(0,200,83,0.6)" : "0 0 7px rgba(255,23,68,0.9), 0 0 16px rgba(255,23,68,0.55)" }}
                    >
                      {new Date(item.sub + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );

    return (
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm">
        <div className="border-b border-[#9EC8EF] pb-3 mb-4 text-left">
          <h3 className="text-sm font-sans font-extrabold text-[#1F3557] uppercase tracking-wider">This Week's Jobs</h3>
          <p className="text-xs text-slate-500">Sun–Sat &middot; unfinished jobs drop to Past Due once their date passes</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-mono font-black text-[#07599a] uppercase tracking-widest mb-2">Upcoming</p>
            {renderTicker(upcoming, "Nothing left scheduled this week.", "upcoming")}
          </div>
          <div>
            <p className="text-[10px] font-mono font-black text-[#07599a] uppercase tracking-widest mb-2">Past Due</p>
            {renderTicker(pastDue, "Nothing overdue -- nice.", "pastDue")}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* 1. TOP CARD */}
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-[#315C9F]" />
              <h2 className="text-xl font-display font-extrabold text-[#1F3557] tracking-tight uppercase">
                Scheduling Center
              </h2>
            </div>
            <p className="text-xs text-[#5E7393] font-sans font-semibold mt-1">
              Plan appointments, assign crews, and keep dispatch schedules up to date
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {isHighPrivilege ? (
              <button
                onClick={() => { resetForm(); setIsNewEventOpen(true); }}
                className="px-4 py-2.5 bg-[#315C9F] hover:bg-[#1F3557] text-white border border-[#9EC8EF] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                New Event
              </button>
            ) : (
              <div className="px-3.5 py-2 bg-slate-200 text-slate-500 rounded-xl text-xs font-bold uppercase border border-slate-300 flex items-center gap-1.5 cursor-not-allowed" title="Create is restricted for your role">
                <ShieldAlert className="w-3.5 h-3.5" />
                View Only mode
              </div>
            )}
            
            <button
              onClick={handleToday}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center"
            >
              Today
            </button>
            <div className="flex rounded-xl overflow-hidden border border-[#9EC8EF]">
              <button
                onClick={handlePrev}
                className="p-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] text-[#1F3557] font-bold transition-colors cursor-pointer"
                title="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNext}
                className="p-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] text-[#1F3557] font-bold transition-colors cursor-pointer"
                title="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 border rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${showFilters ? "bg-[#315C9F] text-white border-[#315C9F]" : "bg-[#EAF5FF] hover:bg-[#BDDDF8] border-[#9EC8EF] text-[#1F3557]"}`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {showFilters && <span className="ml-1 w-2 h-2 bg-white rounded-full animate-pulse" />}
            </button>

            {onTakeSnapshot && (
              <button
                onClick={() => onTakeSnapshot("scheduling", "Scheduling", {
                  eventCount: filteredEvents.length,
                  viewMode: activeView,
                  currentDate: formatDateString(currentDate)
                })}
                className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                title="Snapshot Page state"
              >
                Snapshot
              </button>
            )}
          </div>
        </div>

        {/* TIME FORMAT AND VIEW CHOOSER CONTROLS */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#E3F3FF]/60 p-4 rounded-2xl border border-[#A9CDEE]/60 text-xs">
          <div className="flex items-center gap-4">
            <span className="font-extrabold text-[#1F3557] uppercase tracking-wider text-sm">
              {getMonthName(currentDate)} {currentDate.getFullYear()}
            </span>
            <div className="flex gap-1.5 bg-[#E3F3FF] p-1 rounded-xl border border-[#9EC8EF]">
              <button
                onClick={() => setActiveView("month")}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${activeView === "month" ? "bg-[#315C9F] text-white shadow-xs" : "text-[#1F3557] hover:bg-[#BDDDF8]/50"}`}
              >
                Month
              </button>
              <button
                onClick={() => setActiveView("week")}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${activeView === "week" ? "bg-[#315C9F] text-white shadow-xs" : "text-[#1F3557] hover:bg-[#BDDDF8]/50"}`}
              >
                Week
              </button>
              <button
                onClick={() => setActiveView("day")}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${activeView === "day" ? "bg-[#315C9F] text-white shadow-xs" : "text-[#1F3557] hover:bg-[#BDDDF8]/50"}`}
              >
                Day
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative w-full sm:w-60">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-[#5E7393]">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events, clients..."
                className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl pl-9 pr-3 py-1.5 text-xs font-medium text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#315C9F] font-sans"
              />
            </div>

            {/* Time Format Switcher */}
            <div className="flex items-center gap-2 bg-[#E3F3FF] px-3 py-1.5 rounded-xl border border-[#9EC8EF]">
              <span className="text-[10px] uppercase font-bold text-[#5E7393]">Time Format:</span>
              <button
                onClick={() => setTimeFormat24(!timeFormat24)}
                className="px-2 py-0.5 bg-white text-[#315C9F] border border-[#9EC8EF] font-bold uppercase rounded text-[9px]"
              >
                {timeFormat24 ? "24-Hour (Military)" : "12-Hour (AM/PM)"}
              </button>
            </div>
          </div>
        </div>

        {/* 2. ADVANCED SEARCH FILTERS (TOGGLEABLE) */}
        {showFilters && (
          <div className="bg-[#E3F3FF]/70 p-5 rounded-2xl border border-[#A9CDEE] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs animate-fade-in">
            {/* Employee Filter */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Assigned Employee</label>
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="w-full bg-white border border-[#A9CDEE] rounded-xl p-2 font-medium text-slate-700"
              >
                <option value="All">All Employees</option>
                {EMPLOYEES.map(emp => (
                  <option key={emp} value={emp}>{emp}</option>
                ))}
              </select>
            </div>

            {/* Crew Filter */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Assigned Crew</label>
              <select
                value={filterCrew}
                onChange={(e) => setFilterCrew(e.target.value)}
                className="w-full bg-white border border-[#A9CDEE] rounded-xl p-2 font-medium text-slate-700"
              >
                <option value="All">All Crews</option>
                {crews.map(cr => (
                  <option key={cr} value={cr}>{cr}</option>
                ))}
              </select>
            </div>

            {/* Event Type */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Event Type</label>
              <select
                value={filterEventType}
                onChange={(e) => setFilterEventType(e.target.value)}
                className="w-full bg-white border border-[#A9CDEE] rounded-xl p-2 font-medium text-slate-700"
              >
                <option value="All">All Event Types</option>
                <option value="Custom Only">Custom Types Only</option>
                {DEFAULT_EVENT_TYPES.filter(t => t !== "Custom").map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full bg-white border border-[#A9CDEE] rounded-xl p-2 font-medium text-slate-700"
              >
                <option value="All">All Priorities</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>

            {/* Status */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-white border border-[#A9CDEE] rounded-xl p-2 font-medium text-slate-700"
              >
                <option value="All">All Statuses</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {/* Date Start */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Date Range Start</label>
              <input
                value={filterDateStart}
                onChange={(e) => setFilterDateStart(e.target.value)}
                type="date"
                className="w-full bg-white border border-[#A9CDEE] rounded-xl p-1.5 font-medium text-slate-700 font-mono"
              />
            </div>

            {/* Date End */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Date Range End</label>
              <input
                value={filterDateEnd}
                onChange={(e) => setFilterDateEnd(e.target.value)}
                type="date"
                className="w-full bg-white border border-[#A9CDEE] rounded-xl p-1.5 font-medium text-slate-700 font-mono"
              />
            </div>

            {/* Reset Filters button */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilterEmployee("All");
                  setFilterCrew("All");
                  setFilterCustomer("All");
                  setFilterEventType("All");
                  setFilterPriority("All");
                  setFilterStatus("All");
                  setFilterCompleted("All");
                  setFilterDateStart("");
                  setFilterDateEnd("");
                  setSearchQuery("");
                }}
                className="w-full px-4 py-2 bg-[#F5FAFF] hover:bg-[#EAF5FF] border border-[#9EC8EF] text-[#315C9F] font-bold rounded-xl text-[11px] uppercase tracking-wider"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. CORE CALENDAR VIEWS CONTAINER */}
      <div className="bg-[#EAF5FF] p-6 rounded-[32px] border border-[#9EC8EF] shadow-2xs">
        
        {/* MONTH VIEW CALENDAR GRID */}
        {activeView === "month" && (
          <div className="space-y-2">
            {/* Weekdays indicator heading row */}
            <div className="grid grid-cols-7 gap-2 text-center">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
                <div key={dayName} className="py-2.5 bg-[#C7E3FA] rounded-xl text-xs font-extrabold text-[#1F3557] uppercase tracking-wider border border-[#A9CDEE]/60 shadow-2xs">
                  {dayName}
                </div>
              ))}
            </div>

            {/* Dates Grid */}
            <div className="grid grid-cols-7 gap-2 min-h-[480px]">
              {monthDays.map(({ dayNum, dateStr, isCurrentMonth }) => {
                // Get events for this specific day
                const dayEvents = filteredEvents.filter(e => e.date === dateStr);
                const isToday = dateStr === "2026-07-05";

                return (
                  <div
                    key={dateStr}
                    onClick={() => {
                      // Clicking a date opens that date in Day View
                      setCurrentDate(new Date(dateStr));
                      setActiveView("day");
                    }}
                    className={`p-2 bg-white rounded-2xl border flex flex-col justify-between min-h-[90px] hover:border-[#315C9F] cursor-pointer transition-all ${isCurrentMonth ? "border-[#A9CDEE]/50" : "border-dashed border-slate-200 opacity-60 bg-[#F5FAFF]"} ${isToday ? "ring-2 ring-[#315C9F] shadow-sm bg-[#EBF5FF]" : ""}`}
                  >
                    <div className="flex justify-between items-center pb-1">
                      <span className={`text-xs font-black px-2 py-0.5 rounded-full ${isToday ? "bg-[#315C9F] text-white" : "text-[#1F3557]"}`}>
                        {dayNum}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="text-[9px] bg-slate-100 border border-slate-200 text-slate-500 font-mono font-bold px-1.5 rounded-full">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    {/* Display up to 3 major events */}
                    <div className="flex-1 space-y-1 overflow-hidden mt-1.5">
                      {dayEvents.slice(0, 3).map(evt => (
                        <div
                          key={evt.id}
                          onClick={(e) => {
                            e.stopPropagation(); // Avoid triggering day select
                            setSelectedEvent(evt);
                            setIsDetailsOpen(true);
                          }}
                          className={`px-1.5 py-0.5 rounded-md border text-[9px] font-semibold truncate hover:shadow-xs transition-shadow flex items-center gap-1 ${getEventBadgeColor(evt.eventType)}`}
                          title={`${evt.eventType} - ${evt.customer}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                            backgroundColor: evt.priority === "Urgent" ? "#EF4444" : evt.priority === "High" ? "#F97316" : evt.priority === "Medium" ? "#3B82F6" : "#94A3B8"
                          }} />
                          <span className="font-mono text-[8px] opacity-85 shrink-0">{formatTimeDisplay(evt.startTime)}</span>
                          <span className="truncate font-sans font-extrabold">{evt.eventType === "Custom" ? evt.customType : evt.eventType}: {evt.customer}</span>
                        </div>
                      ))}

                      {dayEvents.length > 3 && (
                        <div className="text-[8.5px] text-[#315C9F] text-center font-extrabold uppercase mt-0.5">
                          + {dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* WEEK VIEW CALENDAR GRID */}
        {activeView === "week" && (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3 text-xs min-h-[420px]">
            {weekDays.map(({ name, dayNum, dateStr, dateObj }) => {
              const dayEvents = filteredEvents.filter(e => e.date === dateStr);
              const isToday = dateStr === "2026-07-05";

              return (
                <div
                  key={dateStr}
                  className={`bg-white p-4 rounded-2xl border flex flex-col min-h-[300px] transition-all hover:shadow-sm ${isToday ? "ring-2 ring-[#315C9F] border-[#315C9F]" : "border-[#A9CDEE]/50"}`}
                >
                  <div
                    onClick={() => {
                      setCurrentDate(dateObj);
                      setActiveView("day");
                    }}
                    className="flex flex-col items-center justify-center border-b border-blue-50/70 pb-3 mb-3 cursor-pointer group"
                  >
                    <span className="text-[10px] text-[#5E7393] uppercase font-black tracking-wider group-hover:text-[#315C9F]">{name}</span>
                    <span className={`text-base font-black px-2.5 py-0.5 rounded-full mt-1 transition-all ${isToday ? "bg-[#315C9F] text-white" : "text-[#1F3557] group-hover:bg-[#EAF5FF]"}`}>
                      {dayNum}
                    </span>
                  </div>

                  <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[350px] scrollbar-thin">
                    {dayEvents.length === 0 ? (
                      <div className="text-slate-300 font-medium text-[10px] text-center py-8">
                        Empty
                      </div>
                    ) : (
                      dayEvents.map(evt => (
                        <div
                          key={evt.id}
                          onClick={() => {
                            setSelectedEvent(evt);
                            setIsDetailsOpen(true);
                          }}
                          className={`p-2.5 rounded-xl border hover:shadow-md transition-all cursor-pointer flex flex-col gap-1 ${getEventBadgeColor(evt.eventType)} text-left`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[8.5px] font-bold opacity-80">
                              {formatTimeDisplay(evt.startTime)}
                            </span>
                            <span className={`text-[8px] font-bold px-1 rounded-sm uppercase ${getPriorityColor(evt.priority)}`}>
                              {evt.priority}
                            </span>
                          </div>
                          <h4 className="font-extrabold text-[10px] uppercase tracking-wider text-slate-800 line-clamp-1">
                            {evt.eventType === "Custom" ? evt.customType : evt.eventType}
                          </h4>
                          <p className="text-[9.5px] text-slate-600 truncate font-semibold">
                            👤 {evt.customer}
                          </p>
                          {evt.location && (
                            <p className="text-[8.5px] text-slate-400 truncate flex items-center gap-0.5 font-sans">
                              <MapPin className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                              {evt.location}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setCurrentDate(dateObj);
                      resetForm(dateStr);
                      setIsNewEventOpen(true);
                    }}
                    className="mt-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] text-[#315C9F] text-[10px] font-extrabold uppercase rounded-lg border border-dashed border-[#9EC8EF] transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Slot
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* DAY VIEW CALENDAR - 24 HOURS GRID WITH SPECIFIC SLOT RESOLUTION */}
        {activeView === "day" && (
          <div className="bg-white rounded-3xl border border-[#A9CDEE]/50 overflow-hidden text-xs">
            {/* Day Header details */}
            <div className="p-4 bg-[#C7E3FA] border-b border-[#A9CDEE]/50 flex justify-between items-center text-[#1F3557]">
              <div>
                <h3 className="font-sans font-black text-sm uppercase tracking-wider">
                  {getDayName(currentDate)}, {getMonthName(currentDate)} {currentDate.getDate()}, {currentDate.getFullYear()}
                </h3>
                <p className="text-[10px] text-[#5E7393] font-bold uppercase tracking-wider mt-0.5">
                  Click on any empty slot or minute picker to schedule specific events
                </p>
              </div>
              <div className="bg-[#E3F3FF] border border-[#9EC8EF] px-3.5 py-1.5 rounded-xl text-center text-[10.5px]">
                <strong className="text-[#315C9F] uppercase font-mono">Date selected:</strong> {formatDateString(currentDate)}
              </div>
            </div>

            {/* Hourly layout list */}
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto scrollbar-thin">
              {Array.from({ length: 24 }).map((_, hourIdx) => {
                // Formatting military vs 12hr string for slot
                let hourLabel = "";
                if (timeFormat24) {
                  hourLabel = `${hourIdx.toString().padStart(2, "0")}:00`;
                } else {
                  const label12 = hourIdx % 12 === 0 ? 12 : hourIdx % 12;
                  const ampm = hourIdx >= 12 ? "PM" : "AM";
                  hourLabel = `${label12}:00 ${ampm}`;
                }

                const currentDayStr = formatDateString(currentDate);
                
                // Find events matching this specific hour index (using 24h standard hh of hh:mm)
                const hourEvents = filteredEvents.filter(e => {
                  if (e.date !== currentDayStr) return false;
                  const [hStr] = e.startTime.split(":");
                  return parseInt(hStr, 10) === hourIdx;
                });

                return (
                  <div key={hourIdx} className="group flex min-h-[65px] hover:bg-[#F5FAFF]/50 transition-colors">
                    {/* Time Column */}
                    <div className="w-20 md:w-28 p-3 bg-slate-50/50 border-r border-slate-100 flex flex-col justify-between text-right select-none font-mono font-bold text-slate-400 text-[10px]">
                      <span>{hourLabel}</span>
                      {/* Minute selection sub-trigger */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-1 text-[8.5px] text-[#315C9F]">
                        <button onClick={() => handleSelectTimeSlot(hourIdx, 15)} className="hover:underline hover:text-[#1F3557] font-bold">:15</button>
                        <button onClick={() => handleSelectTimeSlot(hourIdx, 30)} className="hover:underline hover:text-[#1F3557] font-bold">:30</button>
                        <button onClick={() => handleSelectTimeSlot(hourIdx, 45)} className="hover:underline hover:text-[#1F3557] font-bold">:45</button>
                      </div>
                    </div>

                    {/* Events Row Content */}
                    <div className="flex-1 p-2 relative flex flex-wrap gap-2 items-center">
                      {hourEvents.length > 0 ? (
                        hourEvents.map(evt => (
                          <div
                            key={evt.id}
                            onClick={() => {
                              setSelectedEvent(evt);
                              setIsDetailsOpen(true);
                            }}
                            className={`p-2 rounded-xl border shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col gap-0.5 max-w-sm flex-1 ${getEventBadgeColor(evt.eventType)} text-left`}
                          >
                            <div className="flex items-center justify-between text-[9px] font-mono font-bold">
                              <span>⏱️ {formatTimeDisplay(evt.startTime)} - {formatTimeDisplay(evt.endTime)}</span>
                              <span className={`px-1 text-[8px] rounded uppercase ${getPriorityColor(evt.priority)}`}>
                                {evt.priority}
                              </span>
                            </div>
                            <h4 className="font-extrabold text-[10.5px] uppercase tracking-wider text-slate-800">
                              {evt.eventType === "Custom" ? evt.customType : evt.eventType}
                            </h4>
                            <p className="font-semibold text-slate-600 text-[9.5px]">
                              Client: {evt.customer}
                            </p>
                            {evt.assignedEmployee && (
                              <p className="text-[9px] text-slate-400 font-semibold font-mono">
                                Assigned: {evt.assignedEmployee} {evt.assignedCrew ? `(${evt.assignedCrew})` : ""}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div
                          onClick={() => handleSelectTimeSlot(hourIdx, 0)}
                          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer bg-[#315C9F]/5 transition-all text-[#315C9F] text-[10px] font-bold uppercase tracking-wider"
                        >
                          + Schedule Slot at {hourLabel}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 4. UPCOMING / PAST DUE JOBS TICKERS */}
      {renderJobTickers()}

      {/* 5. POPUP: NEW / EDIT EVENT CREATION FORM (FLOATING MODAL) */}
      {isNewEventOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-[32px] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-up text-xs font-sans text-slate-700">
            {/* Modal Header */}
            <div className="p-6 bg-[#C7E3FA] border-b border-[#9EC8EF] flex items-center justify-between text-left">
              <div>
                <h3 className="text-sm font-sans font-extrabold text-[#1F3557] uppercase tracking-wider">
                  {isEditingEvent ? "Edit Scheduled Job" : "Schedule New Job"}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {isEditingEvent ? "Update this job's schedule and customer details" : "Add a job to the OwnersLOCAL shared schedule"}
                </p>
              </div>
              <button
                onClick={() => setIsNewEventOpen(false)}
                className="w-8 h-8 rounded-full bg-[#E3F3FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEvent} className="p-6 space-y-4 text-left">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Event Type selector */}
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">Event Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 focus:outline-none focus:border-[#315C9F] font-semibold text-slate-700"
                  >
                    {DEFAULT_EVENT_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {/* Custom Event type input */}
                {formType === "Custom" && (
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">Specify Custom Type</label>
                    <input
                      value={formCustomType}
                      onChange={(e) => setFormCustomType(e.target.value)}
                      placeholder="e.g. In-person review"
                      required
                      type="text"
                      className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 focus:outline-none focus:border-[#315C9F] font-medium"
                    />
                  </div>
                )}

                {/* Event Date */}
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">Event Date</label>
                  <input
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    type="date"
                    required
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 focus:outline-none focus:border-[#315C9F] font-medium font-mono"
                  />
                </div>

                {/* Descriptor -- the only other required field. Everything
                    below (customer, employee, crew, location...) is optional
                    context you can fill in now or leave for later. */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">Description</label>
                  <input
                    value={formDescriptor}
                    onChange={(e) => setFormDescriptor(e.target.value)}
                    placeholder="e.g. Mow & trim, Site visit, Follow up call..."
                    required
                    type="text"
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 focus:outline-none focus:border-[#315C9F] font-medium"
                  />
                </div>
              </div>

              {/* Start & End Times Picker (Select Minute option) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#E3F3FF]/50 p-4 rounded-2xl border border-[#A9CDEE]/40">
                
                {/* Start Time Selectors */}
                <div className="space-y-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-[#315C9F] font-extrabold block">Start Time</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <select
                      value={formStartHour}
                      onChange={(e) => setFormStartHour(e.target.value)}
                      className="bg-white border border-[#A9CDEE] rounded-lg p-1 font-bold text-center w-12"
                    >
                      {Array.from({ length: 12 }).map((_, i) => {
                        const val = (i + 1).toString().padStart(2, "0");
                        return <option key={val} value={val}>{val}</option>;
                      })}
                    </select>
                    <span>:</span>
                    <select
                      value={formStartMin}
                      onChange={(e) => setFormStartMin(e.target.value)}
                      className="bg-white border border-[#A9CDEE] rounded-lg p-1 font-bold text-center w-12"
                    >
                      {Array.from({ length: 60 }).map((_, i) => {
                        const val = i.toString().padStart(2, "0");
                        return <option key={val} value={val}>{val}</option>;
                      })}
                    </select>
                    <select
                      value={formStartAmPm}
                      onChange={(e) => setFormStartAmPm(e.target.value)}
                      className="bg-white border border-[#A9CDEE] rounded-lg p-1 font-bold text-center"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                    <span className="text-[9.5px] font-sans font-medium text-slate-400 pl-1">
                      ({formatTimeTo24h(formStartHour, formStartMin, formStartAmPm)})
                    </span>
                  </div>
                </div>

                {/* End Time Selectors */}
                <div className="space-y-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-[#315C9F] font-extrabold block">End Time</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <select
                      value={formEndHour}
                      onChange={(e) => setFormEndHour(e.target.value)}
                      className="bg-white border border-[#A9CDEE] rounded-lg p-1 font-bold text-center w-12"
                    >
                      {Array.from({ length: 12 }).map((_, i) => {
                        const val = (i + 1).toString().padStart(2, "0");
                        return <option key={val} value={val}>{val}</option>;
                      })}
                    </select>
                    <span>:</span>
                    <select
                      value={formEndMin}
                      onChange={(e) => setFormEndMin(e.target.value)}
                      className="bg-white border border-[#A9CDEE] rounded-lg p-1 font-bold text-center w-12"
                    >
                      {Array.from({ length: 60 }).map((_, i) => {
                        const val = i.toString().padStart(2, "0");
                        return <option key={val} value={val}>{val}</option>;
                      })}
                    </select>
                    <select
                      value={formEndAmPm}
                      onChange={(e) => setFormEndAmPm(e.target.value)}
                      className="bg-white border border-[#A9CDEE] rounded-lg p-1 font-bold text-center"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                    <span className="text-[9.5px] font-sans font-medium text-slate-400 pl-1">
                      ({formatTimeTo24h(formEndHour, formEndMin, formEndAmPm)})
                    </span>
                  </div>
                </div>

              </div>

              {/* Customer selection block */}
              <div className="bg-white p-4 rounded-2xl border border-[#A9CDEE]/50 space-y-3">
                <div className="flex justify-between items-center border-b border-blue-50 pb-2">
                  <span className="text-[9.5px] uppercase tracking-wider text-slate-500 font-extrabold">Customer Settings</span>
                  <div className="flex gap-1.5 bg-[#E3F3FF] p-0.5 rounded-lg border border-[#9EC8EF]">
                    <button
                      type="button"
                      onClick={() => setFormCustomerMode("search")}
                      className={`px-2 py-1 rounded font-bold text-[9px] uppercase ${formCustomerMode === "search" ? "bg-[#315C9F] text-white" : "text-[#1F3557]"}`}
                    >
                      Select Customer
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormCustomerMode("custom")}
                      className={`px-2 py-1 rounded font-bold text-[9px] uppercase ${formCustomerMode === "custom" ? "bg-[#315C9F] text-white" : "text-[#1F3557]"}`}
                    >
                      Add Customer
                    </button>
                  </div>
                </div>

                {formCustomerMode === "search" ? (
                  <div className="space-y-2">
                    <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold block">Select Customer</label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => handleCustomerSelect(e.target.value)}
                      className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 font-semibold text-slate-700"
                    >
                      <option value="">Select customer...</option>
                      {selectableCustomers.map(cust => (
                        <option key={cust.id} value={cust.id}>
                          {cust.contact} {cust.company ? `(${cust.company})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-500">Contact Name</label>
                      <input
                        value={formCustomName}
                        onChange={(e) => setFormCustomName(e.target.value)}
                        placeholder="e.g. Jane Smith"
                        type="text"
                        className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl p-2 font-medium"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-500">Phone</label>
                      <input
                        value={formCustomPhone}
                        onChange={(e) => setFormCustomPhone(e.target.value)}
                        placeholder="(555) 012-3456"
                        type="text"
                        className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl p-2 font-medium font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-500">Email</label>
                      <input
                        value={formCustomEmail}
                        onChange={(e) => setFormCustomEmail(e.target.value)}
                        placeholder="client@mail.com"
                        type="email"
                        className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl p-2 font-medium"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-500">Billing Address</label>
                      <input
                        value={formCustomAddress}
                        onChange={(e) => setFormCustomAddress(e.target.value)}
                        placeholder="123 Metropolis Ave"
                        type="text"
                        className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl p-2 font-medium"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9.5px] font-bold text-slate-500">City, State</label>
                        <input
                          value={formCustomCityState}
                          onChange={(e) => setFormCustomCityState(e.target.value)}
                          placeholder="Seattle, WA"
                          type="text"
                          className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl p-2 font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9.5px] font-bold text-slate-500">Zip Code</label>
                        <input
                          value={formCustomZip}
                          onChange={(e) => setFormCustomZip(e.target.value)}
                          placeholder="98101"
                          type="text"
                          className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl p-2 font-medium"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Team Assigns & Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">Assign Employee</label>
                  <select
                    value={formEmployee}
                    onChange={(e) => setFormEmployee(e.target.value)}
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 font-semibold"
                  >
                    {EMPLOYEES.length === 0 && <option value="">No team members yet</option>}
                    {formEmployee === "" && EMPLOYEES.length > 0 && <option value="" disabled>Select employee...</option>}
                    {EMPLOYEES.map(emp => (
                      <option key={emp} value={emp}>{emp}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">Assign Crew</label>
                  <select
                    value={formCrew}
                    onChange={(e) => setFormCrew(e.target.value)}
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 font-semibold"
                  >
                    {crews.map(cr => (
                      <option key={cr} value={cr}>{cr}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">Priority</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as any)}
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 font-semibold text-slate-700"
                  >
                    {PRIORITIES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {formType === "Job" && (
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">Expected Job Value</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formBudget}
                      onChange={(e) => setFormBudget(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 focus:outline-none font-semibold"
                    />
                    <p className="text-[9px] text-slate-400 font-medium">
                      The real expected payout for this job -- shown wherever job value is tracked (Money Tracker's upcoming payouts, reports), the same as a job created from an accepted estimate.
                    </p>
                  </div>
                )}

                {/* Specific Location field */}
                <StructuredAddressFields
                  label="Site / Job Location"
                  value={formLocation}
                  onChange={setFormLocation}
                  inputClassName="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 focus:outline-none"
                />

                {/* Notes */}
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">Scheduling Notes</label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Specific appointment specifications, gate codes, etc."
                    rows={2.5}
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 focus:outline-none focus:border-[#315C9F] font-medium"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 border-t border-blue-50/75 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setIsNewEventOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-[#9EC8EF] text-slate-600 font-bold rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white border border-[#9EC8EF] font-bold rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-sm transition-colors"
                >
                  {isEditingEvent ? "Save Changes" : "Create Schedule Slot"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 6. POPUP: DETAILED EVENT SPECS (DETAILS DRAWER) */}
      {isDetailsOpen && selectedEvent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#9EC8EF] rounded-[32px] w-full max-w-lg shadow-2xl animate-scale-up text-xs font-sans text-slate-700 overflow-hidden">
            
            {/* Header branding */}
            <div className={`p-5 text-white flex justify-between items-center ${getPriorityColor(selectedEvent.priority)}`}>
              <div className="text-left">
                <span className="text-[9px] uppercase font-black tracking-widest bg-white/20 px-2 py-0.5 rounded">
                  {selectedEvent.priority} Priority {selectedEvent.eventType}
                </span>
                <h3 className="text-base font-extrabold uppercase font-sans mt-1">
                  {selectedEvent.eventType === "Custom" ? selectedEvent.customType : selectedEvent.eventType}
                </h3>
              </div>
              <button
                onClick={() => setIsDetailsOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center font-bold text-white cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Event Info fields list */}
            <div className="p-6 space-y-4 text-left">
              
              <div className="space-y-1.5 border-b border-slate-50 pb-3">
                <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold block">Customer Profile</span>
                <p className="text-sm font-black text-[#1F3557] flex items-center gap-1.5">
                  <User className="w-4 h-4 text-[#315C9F]" />
                  {selectedEvent.customer}
                </p>
                <div className="grid grid-cols-2 gap-2 mt-2 font-semibold text-slate-500 text-[11px]">
                  {selectedEvent.customerPhone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {selectedEvent.customerPhone}
                    </span>
                  )}
                  {selectedEvent.customerEmail && (
                    <span className="flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3" /> {selectedEvent.customerEmail}
                    </span>
                  )}
                </div>
              </div>

              {/* Location */}
              {selectedEvent.location && (
                <div className="space-y-1.5 border-b border-slate-50 pb-3">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold block">Location Staging Address</span>
                  <p className="font-semibold text-slate-600 flex items-start gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    {selectedEvent.location}
                  </p>
                </div>
              )}

              {/* Time Staging */}
              <div className="grid grid-cols-2 gap-4 border-b border-slate-50 pb-3">
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold block">Staging Date</span>
                  <p className="font-bold text-slate-700 flex items-center gap-1">
                    <CalendarIcon className="w-3.5 h-3.5 text-[#315C9F]" />
                    {selectedEvent.date}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold block">Active Window</span>
                  <p className="font-bold text-slate-700 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#315C9F]" />
                    {formatTimeDisplay(selectedEvent.startTime)} - {formatTimeDisplay(selectedEvent.endTime)}
                  </p>
                </div>
              </div>

              {/* Assigned Employees */}
              <div className="grid grid-cols-2 gap-4 border-b border-slate-50 pb-3 font-semibold">
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold block">Assigned Technician</span>
                  <p className="text-slate-600 flex items-center gap-1 font-sans">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {selectedEvent.assignedEmployee}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold block">Assigned Dispatch Crew</span>
                  <p className="text-slate-600 flex items-center gap-1 font-sans">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    {selectedEvent.assignedCrew || "No Crew Attached"}
                  </p>
                </div>
              </div>

              {/* Notes */}
              {selectedEvent.notes && (
                <div className="space-y-1 border-b border-slate-50 pb-3">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold block">Internal Job / Scheduler Notes</span>
                  <p className="text-slate-600 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100 leading-relaxed">
                    "{selectedEvent.notes}"
                  </p>
                </div>
              )}

              {/* Current Status */}
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold">Status:</span>
                  <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[8.5px] ${selectedEvent.status === "Completed" ? "bg-green-100 text-green-800" : selectedEvent.status === "Cancelled" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}`}>
                    {selectedEvent.status}
                  </span>
                </div>

                {/* Inline Status triggers for employees or highprivs */}
                <div className="flex gap-1.5">
                  {selectedEvent.status === "Scheduled" && (
                    <>
                      <button
                        onClick={() => handleUpdateStatus(selectedEvent.id, "Completed")}
                        className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white font-bold rounded text-[8.5px] uppercase transition-colors"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(selectedEvent.id, "Cancelled")}
                        className="px-2 py-1 bg-red-400 hover:bg-red-500 text-white font-bold rounded text-[8.5px] uppercase transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {selectedEvent.status !== "Scheduled" && (
                    <button
                      onClick={() => handleUpdateStatus(selectedEvent.id, "Scheduled")}
                      className="px-2.5 py-1 bg-[#315C9F] hover:bg-[#1F3557] text-white font-bold rounded text-[8.5px] uppercase transition-colors"
                    >
                      Re-Schedule Slot
                    </button>
                  )}
                </div>
              </div>

              {/* Management Action buttons */}
              <div className="flex flex-wrap justify-between items-center gap-2 border-t border-slate-50 pt-4 mt-6">
                <div className="flex gap-2">
                  {isHighPrivilege ? (
                    <>
                      <button
                        onClick={() => handleOpenEditForm(selectedEvent)}
                        className="px-3.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] font-bold rounded-xl transition-colors flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDuplicateEvent(selectedEvent)}
                        className="px-3.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] font-bold rounded-xl transition-colors flex items-center gap-1.5"
                        title="Duplicate Slot"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Duplicate
                      </button>
                    </>
                  ) : null}
                </div>

                {isHighPrivilege && (
                  <button
                    onClick={() => handleDeleteEvent(selectedEvent.id)}
                    className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Slot
                  </button>
                )}
              </div>

            </div>

          </div>
        </div>
      )}

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
