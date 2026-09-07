import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { resolveApproverEmails, buildTimeClockApprovalNotifications, sendPushBestEffort } from "../lib/notificationsService";
import { TimeClockApprovalModal } from "./TimeClockApprovalModal";
import {
  Clock,
  User,
  Users,
  CheckCircle,
  TrendingUp,
  Plus,
  Search,
  Filter,
  RefreshCw,
  MapPin,
  Truck,
  Navigation,
  Calendar,
  DollarSign,
  Activity,
  FileText,
  Check,
  Edit,
  PlusCircle,
  Lock,
  Unlock,
  ThumbsUp,
  AlertCircle,
  Briefcase,
  Layers,
  ChevronRight,
  Info,
  ExternalLink,
  SlidersHorizontal,
  X
} from "lucide-react";
import { SchedulingEvent } from "./SchedulingPage";
import { TimeClockLog } from "../types/domain";
import { clockInTransaction, clockOutTransaction } from "../lib/timeClockService";

export interface TimeLog {
  id: string;
  employeeName: string;
  type: "Clock In" | "Clock Out" | "Break Start" | "Break End";
  date: string; // YYYY-MM-DD
  time: string; // HH:MM AM/PM
  gps: string; // simulated coordinates
  jobId?: string;
  jobTitle?: string;
  route?: string;
  vehicle?: string;
  approved?: boolean;
  approvalStatus?: "pending" | "approved" | "rejected";
  rejectionReason?: string;
}

export interface EmployeeClockState {
  id: string;
  name: string;
  title: string;
  hourlyRate: number;
  status: "Off Duty" | "Clocked In" | "On Break" | "Traveling" | "Working" | "Overtime" | "Clocked Out";
  currentJobId?: string;
  currentJobTitle?: string;
  currentCustomer?: string;
  assignedVehicle?: string;
  assignedRoute?: string;
  hoursToday: number;
  hoursThisWeek: number;
  hoursThisPayPeriod: number;
  overtimeHours: number;
  approved: boolean;
  history: TimeLog[];
}

export interface TimeClockPageProps {
  isClockedIn: boolean;
  setIsClockedIn: (val: boolean) => void;
  clockInTime: string | null;
  setClockInTime: (val: string | null) => void;
  clockInDuration: number;
  setClockInDuration: React.Dispatch<React.SetStateAction<number>>;
}

export const TimeClockPage: React.FC<TimeClockPageProps> = ({
  isClockedIn,
  setIsClockedIn,
  clockInTime,
  setClockInTime,
  clockInDuration,
  setClockInDuration
}) => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const {
    schedulingEvents: events,
    employees: employeeRecords,
    timeClockLogs,
    setTimeClockLogs,
    refreshTimeClockLogs,
    refreshEmployees,
    setNotifications
  } = useDomainData();
  const {
    openPlaceholderPage: onOpenPlaceholder,
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    navigateToScreen: onNavigateToScreen,
    logOperationalEvent
  } = useNavTelemetry();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSummaryFilter, setActiveSummaryFilter] = useState<string>("All");

  // Advanced filters state
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [filterDepartment, setFilterDepartment] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterJob, setFilterJob] = useState("All");
  const [filterPayPeriod, setFilterPayPeriod] = useState("Current");

  // Selected Employee for Details Panel
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  // Modal states
  const [showClockInModal, setShowClockInModal] = useState(false);
  const [showManualTimeModal, setShowManualTimeModal] = useState(false);
  const [showEditTimeModal, setShowEditTimeModal] = useState(false);
  const [punchPending, setPunchPending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Clock In fields
  const [clockInJobId, setClockInJobId] = useState("");
  const [clockInRoute, setClockInRoute] = useState("");
  const [clockInVehicle, setClockInVehicle] = useState("");

  // Manual Time fields
  const [manualEmpId, setManualEmpId] = useState("");
  const [manualDate, setManualDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [manualType, setManualType] = useState<"Clock In" | "Clock Out" | "Break Start" | "Break End">("Clock In");
  const [manualTimeStr, setManualTimeStr] = useState("08:00 AM");
  const [manualJobId, setManualJobId] = useState("");
  const [manualRoute, setManualRoute] = useState("");
  const [manualVehicle, setManualVehicle] = useState("");

  // Edit Time fields
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editType, setEditType] = useState<"Clock In" | "Clock Out" | "Break Start" | "Break End">("Clock In");
  const [editTimeStr, setEditTimeStr] = useState("");
  const [editDateStr, setEditDateStr] = useState("");
  const [editGpsStr, setEditGpsStr] = useState("");

  // Real GPS via the browser Geolocation API — no fabricated coordinates. Falls back to an
  // honest "unavailable" string (not a fake location) when unsupported/denied/timed out.
  // The `timeout` option only bounds the browser's own position-acquisition attempt — some
  // mobile browsers/WebViews never invoke either callback if the permission prompt itself
  // stalls, which would hang the clock-in/out button (stuck on punchPending) forever. The
  // outer race guarantees this always resolves.
  const getCurrentGPSString = (): Promise<string> => {
    const geolocationAttempt = new Promise<string>((resolve) => {
      if (!navigator.geolocation) {
        resolve("Location unavailable (not supported by this browser)");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const latStr = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}`;
          const lngStr = `${Math.abs(lng).toFixed(4)}°${lng >= 0 ? "E" : "W"}`;
          resolve(`${latStr}, ${lngStr} (±${Math.round(pos.coords.accuracy)}m)`);
        },
        (err) => {
          resolve(`Location unavailable (${err.code === err.PERMISSION_DENIED ? "permission denied" : "signal error"})`);
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    });
    const hardTimeout = new Promise<string>((resolve) => {
      setTimeout(() => resolve("Location unavailable (timed out)"), 9000);
    });
    return Promise.race([geolocationAttempt, hardTimeout]);
  };

  // Is current user allowed to edit records, and see the whole team's data
  // at all? (Owner, Manager, Office, Payroll). Everyone else -- Technicians,
  // Drivers, Laborers, etc. -- only ever sees their own time clock data.
  const isManagementRole = useMemo(() => {
    const rolesWithPermission = ["Owner", "General Manager", "Office Manager", "Operations Manager", "Payroll", "Accountant / Bookkeeper", "Accountant"];
    return rolesWithPermission.includes(activeRole);
  }, [activeRole]);
  const canEditAllRecords = isManagementRole;
  const canViewAllRecords = isManagementRole;

  // List of active jobs for dropdowns
  const activeJobs = useMemo(() => {
    return events.filter(e => e.eventType === "Job" || e.eventType === "Estimate");
  }, [events]);

  // Sums real Clock In/Break End -> Clock Out/Break Start segments since a
  // given point in time. An open (not yet closed) segment counts its
  // elapsed time up to "now" — this is what makes a currently-clocked-in
  // employee's hours keep ticking up without a separately fabricated
  // running counter that could drift from what actually happened.
  const computeHoursFromLogs = (logs: TimeClockLog[], since: Date): number => {
    const sorted = [...logs]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    let totalMs = 0;
    let segmentStart: number | null = null;
    for (const log of sorted) {
      const ts = new Date(log.timestamp).getTime();
      if (log.type === "Clock In" || log.type === "Break End") {
        segmentStart = Math.max(ts, since.getTime());
      } else if ((log.type === "Clock Out" || log.type === "Break Start") && segmentStart !== null) {
        if (ts >= since.getTime()) totalMs += Math.max(0, ts - segmentStart);
        segmentStart = null;
      }
    }
    if (segmentStart !== null) {
      totalMs += Date.now() - segmentStart;
    }
    return totalMs / 3600000;
  };

  const deriveStatus = (logs: TimeClockLog[]): EmployeeClockState["status"] => {
    if (logs.length === 0) return "Off Duty";
    const last = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    if (last.type === "Break Start") return "On Break";
    if (last.type === "Clock Out") return "Off Duty";
    return "Clocked In"; // Clock In or Break End
  };

  // The real, live team roster — every invited employee who's completed
  // onboarding, plus the current user if they aren't in that list yet (the
  // owner never gets an `employees` doc). Status/hours/overtime are all
  // derived from the real time_clock_logs collection, never tracked as a
  // separate counter that could drift from what actually happened.
  const employees: EmployeeClockState[] = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const payPeriodStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const buildFromLogs = (email: string, name: string, title: string, hourlyRate: number): EmployeeClockState => {
      const myLogs = timeClockLogs.filter(l => l.employeeEmail === email);
      const hoursToday = computeHoursFromLogs(myLogs, todayStart);
      const hoursThisWeek = computeHoursFromLogs(myLogs, weekStart);
      const hoursThisPayPeriod = computeHoursFromLogs(myLogs, payPeriodStart);
      const lastLog = [...myLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      return {
        id: email,
        name,
        title,
        hourlyRate,
        status: deriveStatus(myLogs),
        currentJobId: lastLog?.jobId,
        currentJobTitle: lastLog?.jobTitle,
        assignedVehicle: lastLog?.vehicle,
        assignedRoute: lastLog?.route,
        hoursToday: parseFloat(hoursToday.toFixed(2)),
        hoursThisWeek: parseFloat(hoursThisWeek.toFixed(2)),
        hoursThisPayPeriod: parseFloat(hoursThisPayPeriod.toFixed(2)),
        // Real, disclosed methodology: hours beyond 40 in the trailing
        // 14-day window count as overtime. No configured pay-period
        // boundary exists yet to derive this from more precisely.
        overtimeHours: parseFloat(Math.max(0, hoursThisPayPeriod - 40).toFixed(2)),
        approved: myLogs.length > 0 && myLogs.every(l => l.approved),
        history: [...myLogs]
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .map((l): TimeLog => ({
            id: l.id,
            employeeName: l.employeeName,
            type: l.type,
            date: l.date,
            time: l.time,
            gps: l.gps,
            jobId: l.jobId,
            jobTitle: l.jobTitle,
            route: l.route,
            vehicle: l.vehicle,
            approved: l.approved,
            approvalStatus: l.approvalStatus,
            rejectionReason: l.rejectionReason
          }))
      };
    };

    const roster = employeeRecords.map(er =>
      buildFromLogs(er.email, `${er.firstName} ${er.lastName}`.trim(), er.role, er.hourlyRate || 0)
    );

    // Ensure the current user always has an entry, even before they're a
    // real `employees` doc (owners never get one) or before their first
    // real clock event exists.
    if (loggedInUser?.email && !roster.some(e => e.id === loggedInUser.email)) {
      roster.push(buildFromLogs(loggedInUser.email, loggedInUser.name || loggedInUser.email, activeRole, 0));
    }

    return roster;
  }, [employeeRecords, timeClockLogs, loggedInUser, activeRole, clockInDuration]);

  // Reset Filters helper
  const handleResetFilters = () => {
    setSearchQuery("");
    setFilterDepartment("All");
    setFilterStatus("All");
    setFilterJob("All");
    setFilterPayPeriod("Current");
    setActiveSummaryFilter("All");
    if (logOperationalEvent) {
      logOperationalEvent("Filters Reset", "All time clock search queries and dropdown filters have been cleared", "🔄");
    }
  };

  // Pulls a fresh server read of punch logs and roster data. The realtime
  // listeners that normally keep this page current don't retry after a
  // permission/connectivity error, so this is the recovery path when the
  // dashboard stops reflecting new punches.
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([refreshTimeClockLogs(), refreshEmployees()]);
      triggerLocalNotification("Time clock data refreshed");
    } catch (error) {
      triggerLocalNotification(error instanceof Error ? error.message : "Refresh failed.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Core filter logic
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      // Search Box matches name or title
      const matchesSearch = searchQuery === "" ||
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.title.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // Summary Card selection filters
      if (activeSummaryFilter === "ClockedIn" && emp.status === "Off Duty") return false;
      if (activeSummaryFilter === "Working" && emp.status !== "Clocked In") return false;
      if (activeSummaryFilter === "OnBreak" && emp.status !== "On Break") return false;
      if (activeSummaryFilter === "Overtime" && emp.overtimeHours === 0) return false;

      // Dropdown filters -- filters by the employee's real role (there is
      // no crew/department assignment system to filter on instead).
      if (filterDepartment !== "All" && emp.title !== filterDepartment) return false;
      if (filterStatus !== "All" && emp.status !== filterStatus) return false;
      if (filterJob !== "All") {
        if (filterJob === "Unassigned" && emp.currentJobId) return false;
        if (filterJob !== "Unassigned" && emp.currentJobId !== filterJob) return false;
      }

      return true;
    });
  }, [employees, searchQuery, activeSummaryFilter, filterDepartment, filterStatus, filterJob]);

  // Selected Employee object -- non-management roles always resolve to
  // themselves, regardless of what selectedEmpId holds.
  const selectedEmployee = useMemo(() => {
    const ownRecord = employees.find(e => e.id === loggedInUser?.email);
    if (!canViewAllRecords) return ownRecord || employees[0];
    return employees.find(e => e.id === selectedEmpId) || ownRecord || employees[0];
  }, [employees, selectedEmpId, loggedInUser, canViewAllRecords]);

  // Top Summary Metric Cards calculations
  const summaryMetrics = useMemo(() => {
    const clockedIn = employees.filter(e => e.status !== "Off Duty").length;
    const working = employees.filter(e => e.status === "Clocked In").length;
    const onBreak = employees.filter(e => e.status === "On Break").length;
    const totalHoursToday = employees.reduce((sum, e) => sum + e.hoursToday, 0);
    const overtimeHours = employees.reduce((sum, e) => sum + e.overtimeHours, 0);

    // Real payroll from real hours x real hourly rates (0 for anyone
    // without a rate on file yet — never a fabricated number).
    const totalPayroll = employees.reduce((sum, e) => {
      const regHrs = Math.max(0, e.hoursThisPayPeriod - e.overtimeHours);
      const regPay = regHrs * e.hourlyRate;
      const otPay = e.overtimeHours * e.hourlyRate * 1.5;
      return sum + regPay + otPay;
    }, 0);

    return {
      clockedIn,
      working,
      onBreak,
      totalHoursToday: parseFloat(totalHoursToday.toFixed(2)),
      overtimeHours: parseFloat(overtimeHours.toFixed(2)),
      totalPayroll: Math.round(totalPayroll)
    };
  }, [employees]);

  const nowStamp = () => {
    const now = new Date();
    return {
      timeStr: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      dateStr: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      iso: now.toISOString()
    };
  };

  // Action: Clock In
  const currentEmployeeRecord = employeeRecords.find(employee => employee.email === loggedInUser?.email);
  const requiresVerification = !!loggedInUser?.isEmployee && !!currentEmployeeRecord?.requireTimeClockVerification;
  const businessId = loggedInUser?.isEmployee ? loggedInUser.businessEmail : loggedInUser?.email;
  const currentUserLogs = timeClockLogs
    .filter(log => log.employeeEmail === loggedInUser?.email)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const latestCurrentUserLog = currentUserLogs[currentUserLogs.length - 1];
  const logsShowActiveShift = !!latestCurrentUserLog && latestCurrentUserLog.type !== "Clock Out";

  // Notifies the employee's assigned manager (or every Owner/Manager-role
  // staff member when none is assigned) that a punch needs review -- purely
  // remote: the manager acts from their own device/session (see the Approve/
  // Reject actions on pending entries below, and App.tsx's Alert Center),
  // never by anyone entering credentials on the employee's own device.
  const notifyApproversOfPendingPunch = (log: TimeClockLog) => {
    const recipientEmails = resolveApproverEmails(currentEmployeeRecord, employeeRecords, loggedInUser?.businessEmail);
    if (!recipientEmails.length || !businessId) return;
    const notifs = buildTimeClockApprovalNotifications({
      businessId,
      employeeName: log.employeeName,
      logId: log.id,
      punchType: log.type,
      time: log.time,
      recipientEmails
    });
    setNotifications(prev => [...prev, ...notifs]);
    void sendPushBestEffort(
      recipientEmails,
      "Clock Verification Needed",
      `${log.employeeName} needs approval for ${log.type} at ${log.time}.`,
      { type: "time_clock_approval", logId: log.id }
    );
  };

  const performClockIn = async (jobId: string, route: string, vehicle: string) => {
    if (punchPending) return;
    if (!loggedInUser?.email || !businessId) {
      triggerLocalNotification("Your session isn't ready yet — please reload and try again.");
      return;
    }
    if (logsShowActiveShift) {
      triggerLocalNotification("You are already clocked in.");
      setIsClockedIn(true);
      return;
    }
    setPunchPending(true);
    const { timeStr, dateStr, iso } = nowStamp();
    try {
      const gps = await getCurrentGPSString();
      const userName = loggedInUser?.name || "Unknown User";
      const selectedJob = activeJobs.find(j => j.id === jobId);
      const log: TimeClockLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      employeeEmail: loggedInUser.email,
      employeeName: userName,
      type: "Clock In",
      date: dateStr,
      time: timeStr,
      timestamp: iso,
      gps,
      jobId: jobId || undefined,
      jobTitle: selectedJob?.eventType ? `${selectedJob.eventType} - ${selectedJob.customer}` : undefined,
      route: route || undefined,
      vehicle: vehicle || undefined,
      approvalStatus: requiresVerification ? "pending" : undefined
      };
      await clockInTransaction(businessId, log);
      // Update every clock-status consumer immediately. The Firestore
      // listener will reconcile this optimistic entry with the same id.
      setTimeClockLogs(previous => previous.some(entry => entry.id === log.id) ? previous : [...previous, log]);
      setIsClockedIn(true);
      setClockInTime(timeStr);
      setClockInDuration(0);

    // Update shared Event Engine (create framework action / log event)
      if (logOperationalEvent) {
        logOperationalEvent("Clocked In", `${userName} punched in to shift. Assigned: ${route}, vehicle ${vehicle}.`, "⏱️");
      }

      if (requiresVerification) {
        notifyApproversOfPendingPunch(log);
        triggerLocalNotification(`Punched in at ${timeStr} — your manager has been notified for approval.`);
      } else {
        triggerLocalNotification(`Punched in successfully at ${timeStr}`);
      }
      setShowClockInModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clock-in could not be saved.";
      if (message.includes("already clocked in")) {
        // clockInTransaction found a backend active_shifts record this
        // device's local time_clock_logs didn't know about (e.g. a clock-in
        // that landed but never synced down here). Without this, the button
        // stays stuck on "Clock In" forever -- every retry hits the same
        // error, with only an easy-to-miss toast as feedback and no way to
        // recover except an admin repair tool nothing in the UI calls.
        // Trust the backend and reflect the real state instead, so the
        // employee can proceed to Clock Out normally, which cleans up the
        // stale record.
        setIsClockedIn(true);
        setClockInTime(timeStr);
        triggerLocalNotification("You're already clocked in from an earlier session — showing Clock Out instead.");
        setShowClockInModal(false);
      } else {
        triggerLocalNotification(message);
      }
    } finally {
      setPunchPending(false);
    }
  };

  const handleClockIn = async (jobId: string, route: string, vehicle: string) => {
    await performClockIn(jobId, route, vehicle);
  };

  // Action: Clock Out
  const performClockOut = async () => {
    if (punchPending) return;
    if (!loggedInUser?.email || !businessId) {
      triggerLocalNotification("Your session isn't ready yet — please reload and try again.");
      return;
    }
    if (!logsShowActiveShift) {
      triggerLocalNotification("No active shift exists to clock out.");
      setIsClockedIn(false);
      return;
    }
    setPunchPending(true);
    const { timeStr, dateStr, iso } = nowStamp();
    try {
      const gps = await getCurrentGPSString();
      const userName = loggedInUser?.name || "Unknown User";
      const log: TimeClockLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      employeeEmail: loggedInUser.email,
      employeeName: userName,
      type: "Clock Out",
      date: dateStr,
      time: timeStr,
      timestamp: iso,
      gps,
      approvalStatus: requiresVerification ? "pending" : undefined
      };
      await clockOutTransaction(businessId, log, logsShowActiveShift);

      setIsClockedIn(false);
      setClockInTime(null);
      setClockInDuration(0);

      if (logOperationalEvent) {
        logOperationalEvent("Clocked Out", `${userName} punched out of shift safely. Completed operational telemetry.`, "🚪");
      }
      if (requiresVerification) {
        notifyApproversOfPendingPunch(log);
        triggerLocalNotification(`Punched out at ${timeStr} — your manager has been notified for approval.`);
      } else {
        triggerLocalNotification(`Punched out successfully at ${timeStr}`);
      }
    } catch (error) {
      triggerLocalNotification(error instanceof Error ? error.message : "Clock-out could not be saved.");
    } finally {
      setPunchPending(false);
    }
  };

  const handleClockOut = async () => {
    await performClockOut();
  };

  // Action: Start Break
  const handleStartBreak = async () => {
    if (!loggedInUser?.email) return;
    const { timeStr, dateStr, iso } = nowStamp();
    const userName = loggedInUser?.name || "Unknown User";
    const gps = await getCurrentGPSString();

    setTimeClockLogs(prev => [...prev, {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      employeeEmail: loggedInUser.email,
      employeeName: userName,
      type: "Break Start",
      date: dateStr,
      time: timeStr,
      timestamp: iso,
      gps
    }]);

    if (logOperationalEvent) {
      logOperationalEvent("Break Started", `${userName} started an administrative break.`, "☕");
    }
    triggerLocalNotification(`Break started at ${timeStr}`);
  };

  // Action: End Break
  const handleEndBreak = async () => {
    if (!loggedInUser?.email) return;
    const { timeStr, dateStr, iso } = nowStamp();
    const userName = loggedInUser?.name || "Unknown User";
    const gps = await getCurrentGPSString();

    setTimeClockLogs(prev => [...prev, {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      employeeEmail: loggedInUser.email,
      employeeName: userName,
      type: "Break End",
      date: dateStr,
      time: timeStr,
      timestamp: iso,
      gps
    }]);

    if (logOperationalEvent) {
      logOperationalEvent("Break Ended", `${userName} resumed active shift duty.`, "🛠️");
    }
    triggerLocalNotification(`Break ended at ${timeStr}`);
  };

  // Action: Add Manual Time Entry
  const handleAddManualTime = () => {
    const selectedEmp = employees.find(e => e.id === manualEmpId);
    if (!selectedEmp) return;

    const parsedManualTimestamp = new Date(`${manualDate} ${manualTimeStr}`);
    const timestamp = isNaN(parsedManualTimestamp.getTime()) ? new Date().toISOString() : parsedManualTimestamp.toISOString();

    setTimeClockLogs(prev => [...prev, {
      id: `log_manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      employeeEmail: selectedEmp.id,
      employeeName: selectedEmp.name,
      type: manualType,
      date: manualDate,
      time: manualTimeStr,
      timestamp,
      gps: "Manual Entry (Overridden by Admin)",
      jobId: manualJobId || undefined,
      route: manualRoute || undefined,
      vehicle: manualVehicle || undefined,
      approved: true,
      enteredManually: true
    }]);

    if (logOperationalEvent) {
      logOperationalEvent("Manual Time Inserted", `Admin manually posted a ${manualType} entry for ${selectedEmp.name}.`, "📝");
    }
    triggerLocalNotification(`Manual ${manualType} entry added for ${selectedEmp.name}`);
    setShowManualTimeModal(false);
  };

  // Action: Approve Employee Time
  const handleApproveEmployeeTime = (empId: string) => {
    setTimeClockLogs(prev => prev.map(l => l.employeeEmail === empId ? { ...l, approved: true } : l));

    const targetEmp = employees.find(e => e.id === empId);
    if (logOperationalEvent && targetEmp) {
      logOperationalEvent("Time Card Approved", `Time logs for ${targetEmp.name} have been fully approved for current pay period.`, "✅");
    }
    triggerLocalNotification(`Timecard approved for ${targetEmp?.name}`);
  };

  // Review/Approve/Reject one specific pending punch -- the remote-approval
  // step, performed entirely from the manager's own already-authenticated
  // session, never by anyone entering credentials on the employee's device.
  // The actual approve/reject logic lives in notificationsService.ts and
  // renders through TimeClockApprovalModal, shared with App.tsx's sidebar
  // Alert Center so a manager can act from either place identically.
  const [reviewingLogId, setReviewingLogId] = useState<string | null>(null);
  const reviewingLog = reviewingLogId ? timeClockLogs.find(l => l.id === reviewingLogId) || null : null;

  // Action: Edit Time History Entry
  const handleEditTimeEntry = () => {
    if (!editingLogId) return;

    setTimeClockLogs(prev => prev.map(l => {
      if (l.id !== editingLogId) return l;
      return {
        ...l,
        type: editType,
        time: editTimeStr,
        date: editDateStr,
        gps: editGpsStr
      };
    }));

    if (logOperationalEvent) {
      logOperationalEvent("Time Entry Overwritten", `Time entry log ID ${editingLogId} was successfully modified by administrator.`, "🔧");
    }
    triggerLocalNotification("Time record modified successfully");
    setShowEditTimeModal(false);
    setEditingLogId(null);
  };

  const triggerLocalNotification = (text: string) => {
    const alertBox = document.createElement("div");
    alertBox.className = "fixed bottom-5 right-5 bg-slate-900 text-white font-sans text-xs font-bold px-4 py-3 rounded-xl border border-slate-700 shadow-2xl z-[9999] transition-all duration-300 transform translate-y-0 opacity-100 flex items-center gap-2 animate-fade-in";
    alertBox.innerHTML = `<span>🔔</span> <span>${text}</span>`;
    document.body.appendChild(alertBox);
    setTimeout(() => {
      alertBox.style.opacity = "0";
      setTimeout(() => alertBox.remove(), 300);
    }, 3000);
  };

  return (
    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-6 animate-fade-in text-left">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-[#A9CDEE] pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#E3F3FF] text-[#4A9BFF] rounded-xl border border-[#A9CDEE]">
              <Clock className="w-5 h-5" />
            </span>
            <h2 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
              {canViewAllRecords ? "Corporate Time Clock Dashboard" : "My Time Clock"}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-sans font-semibold">
            {canViewAllRecords
              ? "Track shifts and breaks, then send approved hours to payroll."
              : "Clock in, take breaks, and see your own hours and pay estimate."}
          </p>
        </div>
        
        {/* Connection status tag */}
        <span className="px-3 py-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-mono font-bold rounded-xl border border-emerald-200 uppercase tracking-wider flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          Event Sync Connected
        </span>
      </div>

      {/* TOP ACTION CONTROL BAR */}
      <div className="bg-[#E3F3FF] p-4.5 rounded-2xl border border-[#A9CDEE] space-y-3.5 shadow-xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          
          {/* Punch Actions */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {!isClockedIn ? (
              <button
                onClick={() => {
                  setClockInJobId("");
                  setClockInRoute("");
                  setClockInVehicle("");
                  setShowClockInModal(true);
                }}
                className="px-4.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle className="w-4 h-4" />
                Clock In
              </button>
            ) : (
              <button
                onClick={handleClockOut}
                disabled={punchPending}
                className="px-4.5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-60 disabled:cursor-wait"
              >
                <X className="w-4 h-4" />
                {punchPending ? "Clocking Out…" : "Clock Out"}
              </button>
            )}

            <button
              onClick={handleStartBreak}
              disabled={!isClockedIn || selectedEmployee.status === "On Break"}
              className={`px-4 py-2.5 rounded-xl text-xs uppercase font-extrabold tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
                isClockedIn && selectedEmployee.status !== "On Break"
                  ? "bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF]"
                  : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
              }`}
            >
              Break Start
            </button>

            <button
              onClick={handleEndBreak}
              disabled={!isClockedIn || selectedEmployee.status !== "On Break"}
              className={`px-4 py-2.5 rounded-xl text-xs uppercase font-extrabold tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
                isClockedIn && selectedEmployee.status === "On Break"
                  ? "bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF]"
                  : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
              }`}
            >
              Break End
            </button>

            {canViewAllRecords && (
              <button
                onClick={() => {
                  setShowFiltersPanel(!showFiltersPanel);
                }}
                className={`px-4 py-2.5 border rounded-xl text-xs uppercase font-extrabold tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
                  showFiltersPanel || filterDepartment !== "All" || filterStatus !== "All" || filterJob !== "All"
                    ? "bg-[#315C9F] text-white border-[#315C9F]"
                    : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
              </button>
            )}

            <button
              onClick={() => {
                void handleRefresh();
                handleResetFilters();
              }}
              disabled={isRefreshing}
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-extrabold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
              title="Refresh time logs from the server"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Quick Search Box -- only meaningful when viewing the whole team */}
          {canViewAllRecords && (
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search employee name/title..."
                className="w-full text-xs bg-white border border-slate-200 rounded-xl pl-9.5 pr-4 py-2.5 focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
              />
            </div>
          )}

        </div>

        {/* ADVANCED FILTER PANEL */}
        {canViewAllRecords && showFiltersPanel && (
          <div className="bg-white border border-slate-200 p-4 rounded-xl mt-3 grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
            <div className="space-y-1">
              <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">Role</label>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
              >
                <option value="All">All Roles</option>
                {[...new Set(employees.map(e => e.title).filter(Boolean))].sort().map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">Current Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
              >
                <option value="All">All Statuses</option>
                <option value="Off Duty">Off Duty</option>
                <option value="Clocked In">Clocked In</option>
                <option value="On Break">On Break</option>
                <option value="Traveling">Traveling</option>
                <option value="Working">Working</option>
                <option value="Overtime">Overtime</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">Assigned Job</label>
              <select
                value={filterJob}
                onChange={(e) => setFilterJob(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
              >
                <option value="All">All Jobs</option>
                <option value="Unassigned">Unassigned / Admin</option>
                {activeJobs.map(j => (
                  <option key={j.id} value={j.id}>{j.eventType} - {j.customer}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* SUMMARY STATS METRIC CARDS -- company-wide, management only */}
      {canViewAllRecords && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3.5">
          {[
            { key: "ClockedIn", label: "Clocked In", value: summaryMetrics.clockedIn, sub: "Active shift", color: "text-[#315C9F] border-blue-200 bg-blue-50/50" },
            { key: "Working", label: "Working", value: summaryMetrics.working, sub: "Field & dispatch", color: "text-emerald-700 border-emerald-200 bg-emerald-50/40" },
            { key: "OnBreak", label: "On Break", value: summaryMetrics.onBreak, sub: "Rest periods", color: "text-amber-700 border-amber-200 bg-amber-50/40" },
            { key: "TotalHours", label: "Labor Hours Today", value: `${summaryMetrics.totalHoursToday} hrs`, sub: "Accrued shift total", color: "text-slate-800 border-slate-200 bg-slate-50/50" },
            { key: "Payroll", label: "Payroll Projected", value: `$${summaryMetrics.totalPayroll.toLocaleString()}`, sub: "This period gross", color: "text-purple-700 border-purple-200 bg-purple-50/40" },
            { key: "Overtime", label: "Overtime Hours", value: `${summaryMetrics.overtimeHours} hrs`, sub: "1.5x Premium rate", color: "text-rose-700 border-rose-200 bg-rose-50/40" }
          ].map((card) => {
            const isSelected = activeSummaryFilter === card.key;
            return (
              <div
                key={card.key}
                onClick={() => {
                  if (card.key === "TotalHours" || card.key === "Payroll") return; // static metrics
                  setActiveSummaryFilter(prev => prev === card.key ? "All" : card.key);
                }}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left space-y-1 hover:scale-[1.02] shadow-xs ${card.color} ${
                  isSelected ? "ring-2 ring-blue-500 ring-offset-2 scale-[1.02]" : ""
                }`}
              >
                <p className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 font-sans leading-none">{card.label}</p>
                <p className="text-lg font-black font-mono tracking-tight leading-none mt-1">{card.value}</p>
                <p className="text-[9.5px] font-sans font-bold text-slate-500 leading-none">{card.sub}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* TEAM STATUS ROW (LIVE INDICATORS) -- other employees, management only */}
      {canViewAllRecords && (
        <div className="bg-[#E3F3FF] p-4 rounded-2xl border border-[#A9CDEE]">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-[#342D7E] mb-3 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[#4A9BFF] animate-pulse" /> Live Operational Team Status
          </h4>
          <div className="flex flex-wrap gap-2.5">
            {employees.map((emp) => {
              const statusColors: Record<string, string> = {
                "Off Duty": "bg-slate-100 text-slate-600 border-slate-200",
                "Clocked In": "bg-blue-100 text-[#315C9F] border-[#9EC8EF]",
                "On Break": "bg-amber-100 text-amber-700 border-amber-200",
                "Traveling": "bg-teal-50 text-teal-700 border-teal-200 animate-pulse",
                "Working": "bg-emerald-100 text-emerald-800 border-emerald-200",
                "Overtime": "bg-rose-100 text-rose-700 border-rose-200",
                "Clocked Out": "bg-slate-100 text-slate-400 border-slate-200"
              };

              return (
                <div
                  key={emp.id}
                  onClick={() => setSelectedEmpId(emp.id)}
                  className={`px-3 py-2 rounded-xl border flex items-center gap-2 cursor-pointer transition-all hover:translate-y-[-1px] shadow-xs bg-white ${
                    selectedEmpId === emp.id ? "ring-2 ring-blue-400" : ""
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-300 relative">
                    <span className={`absolute inset-0 rounded-full ${
                      emp.status === "Off Duty" ? "bg-slate-400" :
                      emp.status === "On Break" ? "bg-amber-500" :
                      emp.status === "Traveling" ? "bg-teal-500 animate-ping" :
                      emp.status === "Working" ? "bg-emerald-500" :
                      emp.status === "Overtime" ? "bg-rose-500 animate-pulse" : "bg-blue-500"
                    }`} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-black text-slate-800 font-sans leading-tight">{emp.name}</p>
                    <p className={`text-[9px] font-bold tracking-wider uppercase ${statusColors[emp.status] || "text-slate-500"}`}>
                      {emp.status}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CORE TWO-COLUMN GRID (EMPLOYEE LIST VS SELECTED DETAILS) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">

        {/* EMPLOYEE LIST TABLE (7 cols) -- other employees, management only */}
        {canViewAllRecords && (
        <div className="xl:col-span-7 bg-white rounded-2xl border border-[#A9CDEE] overflow-hidden shadow-sm">
          <div className="bg-[#E3F3FF]/50 px-4 py-3.5 border-b border-[#A9CDEE] flex items-center justify-between">
            <h3 className="text-xs font-black uppercase text-[#342D7E] tracking-wider font-sans">
              Active Shift Ledger ({filteredEmployees.length} listed)
            </h3>
            {activeSummaryFilter !== "All" && (
              <button
                onClick={() => setActiveSummaryFilter("All")}
                className="text-[9.5px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-all uppercase"
              >
                Clear Card Filter
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Employee / Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Hours Today</th>
                  <th className="px-4 py-3 text-right">Period Hours</th>
                  <th className="px-4 py-3 text-right">Overtime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-400 font-medium">
                      No employees match current filters or search term.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    const isSelected = selectedEmpId === emp.id;
                    const statusStyles: Record<string, string> = {
                      "Off Duty": "bg-slate-100 text-slate-500",
                      "Clocked In": "bg-blue-100 text-blue-700 font-bold",
                      "On Break": "bg-amber-100 text-amber-800",
                      "Traveling": "bg-teal-100 text-teal-800",
                      "Working": "bg-emerald-100 text-emerald-800 font-semibold",
                      "Overtime": "bg-rose-100 text-rose-800 font-bold"
                    };

                    return (
                      <tr
                        key={emp.id}
                        onClick={() => setSelectedEmpId(emp.id)}
                        className={`hover:bg-[#E3F3FF]/40 transition-colors cursor-pointer ${
                          isSelected ? "bg-[#E3F3FF] font-medium" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-50 text-[#315C9F] border border-blue-200 text-xs font-black flex items-center justify-center shadow-xs">
                              {emp.name.split(" ").map(n => n[0]).join("")}
                            </div>
                            <div>
                              <p className="font-extrabold text-slate-800 font-sans">{emp.name}</p>
                              <p className="text-[10px] text-slate-400 font-medium">{emp.title}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-lg text-[9.5px] uppercase tracking-wider font-extrabold ${statusStyles[emp.status] || "bg-slate-100"}`}>
                            {emp.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 font-bold">
                          {emp.hoursToday.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 font-bold">
                          {emp.hoursThisPayPeriod.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {emp.overtimeHours > 0 ? (
                            <span className="text-rose-600 font-black">+{emp.overtimeHours.toFixed(2)}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* EMPLOYEE DETAILS PANEL (5 cols, or full width when the roster list is hidden) */}
        <div className={`${canViewAllRecords ? "xl:col-span-5" : "xl:col-span-12"} bg-white rounded-2xl border border-[#A9CDEE] shadow-sm overflow-hidden flex flex-col`}>
          <div className="bg-[#E3F3FF]/50 px-4 py-3.5 border-b border-[#A9CDEE] flex items-center justify-between">
            <h3 className="text-xs font-black uppercase text-[#342D7E] tracking-wider font-sans">
              Employee Ledger Details
            </h3>
            {selectedEmployee.approved ? (
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded text-[9px] font-mono font-bold uppercase">
                Approved
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded text-[9px] font-mono font-bold uppercase">
                Pending Approval
              </span>
            )}
          </div>

          <div className="p-5 space-y-5 text-left">
            
            {/* Primary Info Header */}
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-base font-sans font-black text-slate-800 leading-tight">
                  {selectedEmployee.name}
                </h4>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  {selectedEmployee.title}{selectedEmployee.crew ? ` • ${selectedEmployee.crew}` : ""}
                </p>
                <p className="text-[10px] text-slate-400 font-mono mt-1">
                  Rate: ${selectedEmployee.hourlyRate}/hr regular • ${selectedEmployee.hourlyRate * 1.5}/hr Overtime
                </p>
              </div>

              <span className="px-3 py-1 bg-[#F3F4F6] text-slate-700 text-xs font-bold rounded-lg border border-slate-200 uppercase tracking-wider">
                {selectedEmployee.department || "Unassigned"}
              </span>
            </div>

            {/* Current Work State details */}
            {selectedEmployee.status !== "Off Duty" && (
              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 space-y-1.5">
                <p className="text-[9px] font-black uppercase text-[#315C9F] tracking-wider">Active Assignment Duty</p>
                <div className="text-xs font-sans text-slate-700 space-y-1">
                  <p className="font-extrabold flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5 text-[#4A9BFF]" />
                    Job: {selectedEmployee.currentJobTitle || "General Corporate Admin"}
                  </p>
                  {selectedEmployee.currentCustomer && (
                    <p className="text-slate-500 text-[11px] font-semibold">
                      Customer: {selectedEmployee.currentCustomer}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500 pt-1 border-t border-blue-200/40">
                    {selectedEmployee.assignedVehicle && (
                      <span className="flex items-center gap-0.5"><Truck className="w-3 h-3" /> {selectedEmployee.assignedVehicle}</span>
                    )}
                    {selectedEmployee.assignedRoute && (
                      <span className="flex items-center gap-0.5"><Navigation className="w-3 h-3" /> {selectedEmployee.assignedRoute}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Accrued Labor Hours Card */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#F9FAFB] border border-slate-100 rounded-xl p-2.5 text-center">
                <p className="text-[8.5px] font-black text-slate-400 uppercase">Today</p>
                <p className="text-sm font-black font-mono text-slate-700 mt-1">{selectedEmployee.hoursToday.toFixed(2)}</p>
                <p className="text-[8px] text-slate-400">hours</p>
              </div>
              <div className="bg-[#F9FAFB] border border-slate-100 rounded-xl p-2.5 text-center">
                <p className="text-[8.5px] font-black text-slate-400 uppercase">Weekly</p>
                <p className="text-sm font-black font-mono text-slate-700 mt-1">{selectedEmployee.hoursThisWeek.toFixed(2)}</p>
                <p className="text-[8px] text-slate-400">hours</p>
              </div>
              <div className="bg-[#F9FAFB] border border-slate-100 rounded-xl p-2.5 text-center">
                <p className="text-[8.5px] font-black text-slate-400 uppercase">Pay Period</p>
                <p className="text-sm font-black font-mono text-slate-700 mt-1">{selectedEmployee.hoursThisPayPeriod.toFixed(2)}</p>
                <p className="text-[8px] text-slate-400">total hours</p>
              </div>
            </div>

            {/* Payroll calculation values */}
            <div className="bg-[#F9FAFB] border border-slate-200 rounded-xl p-3.5 space-y-2">
              <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Period Payroll Estimate</h5>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between font-semibold text-slate-600">
                  <span>Regular (Max 40 hrs):</span>
                  <span className="font-mono">${Math.min(40, selectedEmployee.hoursThisPayPeriod - selectedEmployee.overtimeHours) * selectedEmployee.hourlyRate}</span>
                </div>
                {selectedEmployee.overtimeHours > 0 && (
                  <div className="flex justify-between font-semibold text-rose-600">
                    <span>Overtime Premium (1.5x):</span>
                    <span className="font-mono">+${selectedEmployee.overtimeHours * selectedEmployee.hourlyRate * 1.5}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-slate-800 border-t border-slate-200 pt-1.5 text-sm">
                  <span>Gross Pay:</span>
                  <span className="font-mono text-emerald-600">
                    ${(
                      Math.min(40, selectedEmployee.hoursThisPayPeriod - selectedEmployee.overtimeHours) * selectedEmployee.hourlyRate +
                      selectedEmployee.overtimeHours * selectedEmployee.hourlyRate * 1.5
                    ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* History logs & break histories */}
            <div className="space-y-2">
              <h5 className="text-[10px] font-black text-[#342D7E] uppercase tracking-wider">Punch Log History</h5>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {selectedEmployee.history.length === 0 ? (
                  <p className="text-xs text-slate-400 font-semibold italic text-center py-4">No logged history for current pay period.</p>
                ) : (
                  selectedEmployee.history.map((log) => (
                    <div key={log.id} className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex justify-between items-start text-xs transition-colors">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            log.type === "Clock In" ? "bg-emerald-500" :
                            log.type === "Clock Out" ? "bg-rose-500" : "bg-amber-500"
                          }`} />
                          <p className="font-extrabold text-slate-800">{log.type}</p>
                        </div>
                        {log.jobTitle && (
                          <p className="text-[10.5px] text-slate-500 font-semibold leading-tight">{log.jobTitle}</p>
                        )}
                        <p className="text-[9.5px] text-slate-400 font-semibold font-mono flex items-center gap-0.5">
                          <MapPin className="w-2.5 h-2.5" /> {log.gps}
                        </p>
                        {log.approvalStatus === "pending" && (
                          <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded text-[8px] font-mono font-bold uppercase mt-0.5">
                            Awaiting Manager Approval
                          </span>
                        )}
                        {log.approvalStatus === "rejected" && (
                          <span className="inline-block px-1.5 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded text-[8px] font-mono font-bold uppercase mt-0.5" title={log.rejectionReason || undefined}>
                            Rejected
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-slate-600">{log.time}</p>
                        <p className="text-[9px] text-slate-400 font-semibold">{log.date}</p>

                        {canEditAllRecords && log.approvalStatus === "pending" && (
                          <button
                            onClick={() => setReviewingLogId(log.id)}
                            className="text-[9.5px] font-black text-[#315C9F] hover:underline uppercase mt-1 inline-block"
                          >
                            Review & Approve
                          </button>
                        )}
                        {canEditAllRecords && (
                          <button
                            onClick={() => {
                              setEditingLogId(log.id);
                              setEditType(log.type);
                              setEditTimeStr(log.time);
                              setEditDateStr(log.date);
                              setEditGpsStr(log.gps);
                              setShowEditTimeModal(true);
                            }}
                            className="text-[9.5px] font-black text-blue-500 hover:underline mt-1 inline-block uppercase"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* BUTTON BAR */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
              <button
                onClick={() => onNavigateToScreen ? onNavigateToScreen("roster") : onOpenPlaceholder("Corporate Roster Database", "📋")}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer flex items-center gap-1"
                title="Navigate to Roster page"
              >
                <User className="w-3.5 h-3.5" />
                View Employee
              </button>

              <button
                onClick={() => onNavigateToScreen ? onNavigateToScreen("jobs") : onOpenPlaceholder("Active Operational Jobs Ledger", "💼")}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer flex items-center gap-1"
                title="Navigate to Jobs placeholder"
              >
                <Briefcase className="w-3.5 h-3.5" />
                View Job
              </button>

              <button
                onClick={() => onNavigateToScreen ? onNavigateToScreen("routes") : onOpenPlaceholder("Live Dispatch Map Routing", "🗺️")}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer flex items-center gap-1"
                title="Navigate to Routes placeholder"
              >
                <Navigation className="w-3.5 h-3.5" />
                View Route
              </button>

              <button
                onClick={() => onNavigateToScreen ? onNavigateToScreen("scheduling") : onOpenPlaceholder("Calendar Shift Dispatcher", "📅")}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer flex items-center gap-1"
                title="Navigate to Scheduling Calendar"
              >
                <Calendar className="w-3.5 h-3.5" />
                View Schedule
              </button>

              {canEditAllRecords && (
                <>
                  <button
                    onClick={() => {
                      setManualEmpId(selectedEmployee.id);
                      setShowManualTimeModal(true);
                    }}
                    className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-extrabold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Manual Time
                  </button>

                  <button
                    onClick={() => handleApproveEmployeeTime(selectedEmployee.id)}
                    disabled={selectedEmployee.approved}
                    className={`px-3 py-2 font-extrabold rounded-lg text-[10px] uppercase tracking-wider flex items-center gap-1 ${
                      selectedEmployee.approved
                        ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    {selectedEmployee.approved ? "Approved" : "Approve Time"}
                  </button>
                </>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* PAYROLL REPORT ARCHIVE GRID & HISTORY -- company-wide totals, management only */}
      {canViewAllRecords && (
      <div className="bg-white rounded-2xl border border-[#A9CDEE] p-5 space-y-4">
        <div>
          <h4 className="text-xs font-black uppercase text-[#342D7E] tracking-wider font-sans">
            Historical Payroll & Timecard Ledger
          </h4>
          <p className="text-[11px] text-slate-400 font-semibold font-sans mt-0.5">
            Audit logs matching company-wide active tax projections. Search for any technician to reveal pay historicals.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#F5FAFF] border border-[#A9CDEE]/50 p-4 rounded-xl text-xs">
          <div className="space-y-0.5">
            <span className="text-[9px] font-black text-slate-400 uppercase">Regular Shift Hours</span>
            <p className="text-base font-mono font-black text-slate-800">
              {employees.reduce((sum, e) => sum + Math.min(40, e.hoursThisPayPeriod - e.overtimeHours), 0).toFixed(2)} hrs
            </p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[9px] font-black text-slate-400 uppercase">Premium Overtime Hours</span>
            <p className="text-base font-mono font-black text-rose-600">
              {employees.reduce((sum, e) => sum + e.overtimeHours, 0).toFixed(2)} hrs
            </p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[9px] font-black text-slate-400 uppercase">Estimated Period Gross Payroll</span>
            <p className="text-base font-mono font-black text-emerald-600">
              ${employees.reduce((sum, e) => {
                const reg = Math.min(40, e.hoursThisPayPeriod - e.overtimeHours);
                return sum + (reg * e.hourlyRate) + (e.overtimeHours * e.hourlyRate * 1.5);
              }, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[9px] font-black text-slate-400 uppercase">Audit Status</span>
            <span className="px-2.5 py-1 bg-blue-100 text-[#315C9F] border border-[#9EC8EF] text-[10px] font-mono font-bold rounded-lg uppercase tracking-wider block w-fit mt-1">
              Active Pay Period
            </span>
          </div>
        </div>

        {/* Quick link to Roster */}
        <div className="flex items-center justify-between bg-amber-50/50 border border-amber-100 p-3 rounded-xl text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <Info className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Need to change employee profile rates, job roles, or authorization codes?</span>
          </div>
          <button
            onClick={() => onNavigateToScreen ? onNavigateToScreen("roster") : onOpenPlaceholder("Corporate Roster Database", "📋")}
            className="px-3.5 py-1.5 bg-white hover:bg-amber-100/50 text-slate-700 border border-slate-200 rounded-lg text-[10.5px] font-extrabold uppercase tracking-wider cursor-pointer flex items-center gap-1 transition-all"
          >
            Go to Corporate Roster
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
      )}

      {/* CLOCK IN MODAL */}
      {showClockInModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[9999] animate-fade-in p-4">
          <div className="bg-[#C7E3FB] max-w-md w-full rounded-3xl p-6 border border-[#A9CDEE] shadow-2xl space-y-4 text-left">
            <div className="flex justify-between items-center border-b border-[#A9CDEE] pb-3">
              <h4 className="text-sm font-black uppercase text-[#342D7E] tracking-wider font-sans">
                Active Terminal Clock In
              </h4>
              <button onClick={() => setShowClockInModal(false)} className="text-slate-500 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">

              {/* Wage — read-only, sourced from the employee's roster record, never editable here */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Wage</label>
                <div className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-mono font-bold text-slate-700">
                  ${(currentEmployeeRecord?.hourlyRate ?? 0).toFixed(2)}/hr
                </div>
              </div>

              {/* Route/vehicle only apply to the Driver role */}
              {activeRole === "Driver" && (
                <>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Assigned Dispatch Route</label>
                    <input
                      type="text"
                      value={clockInRoute}
                      onChange={(e) => setClockInRoute(e.target.value)}
                      placeholder="Optional route"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Assigned Service Vehicle</label>
                    <input
                      type="text"
                      value={clockInVehicle}
                      onChange={(e) => setClockInVehicle(e.target.value)}
                      placeholder="Optional vehicle"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
                    />
                  </div>
                </>
              )}

              {/* Real GPS captured via the browser's Geolocation API at the moment of clock-in/out */}
              <div className="p-3 bg-[#E3F3FF] rounded-xl border border-[#A9CDEE] text-[10.5px] leading-tight space-y-1">
                <p className="font-bold text-slate-700 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#4A9BFF]" />
                  Location Verification
                </p>
                <p className="text-slate-500 font-medium">Your device location will be captured when you confirm this action. Requires location permission.</p>
              </div>

            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowClockInModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold rounded-xl text-xs uppercase"
              >
                Cancel
              </button>
              <button
                onClick={() => handleClockIn(clockInJobId, clockInRoute, clockInVehicle)}
                disabled={punchPending}
                className="px-4.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold rounded-xl text-xs uppercase shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
                {punchPending ? "Clocking In…" : "Confirm Clock In"}
              </button>
            </div>
          </div>
        </div>
      )}


      {showManualTimeModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[9999] animate-fade-in p-4">
          <div className="bg-[#C7E3FB] max-w-md w-full rounded-3xl p-6 border border-[#A9CDEE] shadow-2xl space-y-4 text-left">
            <div className="flex justify-between items-center border-b border-[#A9CDEE] pb-3">
              <h4 className="text-sm font-black uppercase text-[#342D7E] tracking-wider font-sans">
                Insert Administrative Manual Time Record
              </h4>
              <button onClick={() => setShowManualTimeModal(false)} className="text-slate-500 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Select Employee</label>
                <select
                  value={manualEmpId}
                  onChange={(e) => setManualEmpId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                >
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.title})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Punch Date</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Punch Time (e.g. 08:30 AM)</label>
                  <input
                    type="text"
                    value={manualTimeStr}
                    onChange={(e) => setManualTimeStr(e.target.value)}
                    placeholder="08:00 AM"
                    className="w-full p-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Action Type</label>
                <select
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as any)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                >
                  <option value="Clock In">Clock In</option>
                  <option value="Clock Out">Clock Out</option>
                  <option value="Break Start">Break Start</option>
                  <option value="Break End">Break End</option>
                </select>
                <p className="text-[9px] text-slate-400 font-medium pt-0.5">To credit a specific number of hours, add a Clock In and a Clock Out entry at the right times -- hours are always computed from real punch timestamps, never typed in directly.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Link to Job Event</label>
                <select
                  value={manualJobId}
                  onChange={(e) => setManualJobId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                >
                  <option value="">No Job Linkage</option>
                  {activeJobs.map(j => (
                    <option key={j.id} value={j.id}>{j.eventType} for {j.customer}</option>
                  ))}
                </select>
              </div>

            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowManualTimeModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold rounded-xl text-xs uppercase"
              >
                Cancel
              </button>
              <button
                onClick={handleAddManualTime}
                className="px-4.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold rounded-xl text-xs uppercase shadow-xs cursor-pointer"
              >
                Confirm Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TIME RECORD MODAL */}
      {showEditTimeModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[9999] animate-fade-in p-4">
          <div className="bg-[#C7E3FB] max-w-md w-full rounded-3xl p-6 border border-[#A9CDEE] shadow-2xl space-y-4 text-left">
            <div className="flex justify-between items-center border-b border-[#A9CDEE] pb-3">
              <h4 className="text-sm font-black uppercase text-[#342D7E] tracking-wider font-sans">
                Override Extant Punch Log Record
              </h4>
              <button onClick={() => setShowEditTimeModal(false)} className="text-slate-500 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Punch Type Action</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as any)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                >
                  <option value="Clock In">Clock In</option>
                  <option value="Clock Out">Clock Out</option>
                  <option value="Break Start">Break Start</option>
                  <option value="Break End">Break End</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Date</label>
                  <input
                    type="text"
                    value={editDateStr}
                    onChange={(e) => setEditDateStr(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:outline-none font-mono text-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Time</label>
                  <input
                    type="text"
                    value={editTimeStr}
                    onChange={(e) => setEditTimeStr(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:outline-none font-mono text-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Override GPS Location Coordinates</label>
                <input
                  type="text"
                  value={editGpsStr}
                  onChange={(e) => setEditGpsStr(e.target.value)}
                  className="w-full p-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                />
              </div>

            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowEditTimeModal(false);
                  setEditingLogId(null);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold rounded-xl text-xs uppercase"
              >
                Cancel
              </button>
              <button
                onClick={handleEditTimeEntry}
                className="px-4.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-xs uppercase shadow-xs cursor-pointer"
              >
                Save Log Override
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewingLog && (
        <TimeClockApprovalModal
          log={reviewingLog}
          timeClockLogs={timeClockLogs}
          setTimeClockLogs={setTimeClockLogs}
          setNotifications={setNotifications}
          businessId={loggedInUser?.isEmployee ? loggedInUser.businessEmail : loggedInUser?.email}
          actingUserEmail={loggedInUser?.email}
          actingUserName={loggedInUser?.name}
          logOperationalEvent={logOperationalEvent}
          notify={triggerLocalNotification}
          onClose={() => setReviewingLogId(null)}
        />
      )}

      {/* FRAMEWORK CONNECTIONS (As required by the guideline exactly) */}
      <div className="bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl p-4 text-left">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-[#342D7E] mb-2">
          Time Clock Connections
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] font-sans">
          <div>
            <p className="font-extrabold text-[#315C9F] uppercase text-[9px] mb-1">CONNECTED</p>
            <div className="grid grid-cols-2 gap-1 font-semibold text-slate-600">
              <span className="flex items-center gap-1 text-emerald-600">✓ Dashboard</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Revenue</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Scheduling</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Dispatch</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Routes</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Jobs</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Inventory</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Documents</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Messages</span>
            </div>
          </div>
          <div>
            <p className="font-extrabold text-[#315C9F] uppercase text-[9px] mb-1">READY TO CONNECT</p>
            <div className="grid grid-cols-2 gap-1 font-semibold text-slate-400">
              <span className="flex items-center gap-1 text-slate-600 font-bold">✓ Roster (Active)</span>
              <span className="flex items-center gap-1">□ AI Assistant</span>
              <span className="flex items-center gap-1">□ Notifications</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
