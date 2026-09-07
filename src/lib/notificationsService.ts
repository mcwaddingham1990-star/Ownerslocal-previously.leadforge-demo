import type { Dispatch, SetStateAction } from "react";
import type { AppNotification, EmployeeRecord, TimeClockLog } from "../types/domain";

/**
 * Owner/Manager-role heuristic, matching the same check TimeClockPage's
 * manager-verification flow and firestore.rules' isManager() already use --
 * kept in one place so "who counts as a manager" can't drift between them.
 */
export function isManagerRole(role: string | undefined): boolean {
  if (!role) return false;
  return role === "Owner" || role.toLowerCase().includes("manager");
}

/**
 * Who should be notified to review a given employee's clock in/out: their
 * specifically assigned manager if one is set, otherwise every Owner/
 * Manager-role staff member in the business, plus the account owner
 * themselves as a guaranteed fallback (the owner may not have their own
 * EmployeeRecord row).
 */
export function resolveApproverEmails(
  employee: EmployeeRecord | undefined,
  allEmployees: EmployeeRecord[],
  businessEmail: string | undefined
): string[] {
  if (employee?.assignedManagerEmail) return [employee.assignedManagerEmail];
  const emails = new Set(
    allEmployees.filter(e => isManagerRole(e.role)).map(e => e.email)
  );
  if (businessEmail) emails.add(businessEmail);
  emails.delete(employee?.email || "");
  return Array.from(emails);
}

export function buildTimeClockApprovalNotifications(params: {
  businessId: string;
  employeeName: string;
  logId: string;
  punchType: string;
  time: string;
  recipientEmails: string[];
}): AppNotification[] {
  const now = new Date().toISOString();
  return params.recipientEmails.map((recipientEmail, index) => ({
    id: `notif_tc_${params.logId}_${index}`,
    businessId: params.businessId,
    recipientEmail,
    type: "time_clock_approval",
    title: "Clock Verification Needed",
    description: `${params.employeeName} needs approval for ${params.punchType} at ${params.time}.`,
    time: params.time,
    isRead: false,
    screenId: "timeclock",
    relatedLogId: params.logId,
    actionable: true,
    createdAt: now
  }));
}

/**
 * Parses a "YYYY-MM-DD" date plus a "H:MM AM/PM" or "HH:MM" (24h) time back
 * into a real ISO timestamp. Falls back to the original timestamp on
 * anything unparseable rather than ever writing a corrupt/garbage time --
 * computeHoursFromLogs (TimeClockPage) sorts and sums strictly off
 * `timestamp`, never off the display date/time strings, so this is the only
 * value that actually matters for hours worked, overtime, and payroll.
 */
export function parseAdjustedTimestamp(dateStr: string, timeStr: string, fallbackIso: string): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!dateMatch) return fallbackIso;
  const [, y, m, d] = dateMatch;

  const ampmMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(timeStr.trim());
  const militaryMatch = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  let hour: number;
  let minute: number;
  if (ampmMatch) {
    hour = parseInt(ampmMatch[1], 10) % 12;
    if (/pm/i.test(ampmMatch[3])) hour += 12;
    minute = parseInt(ampmMatch[2], 10);
  } else if (militaryMatch) {
    hour = parseInt(militaryMatch[1], 10);
    minute = parseInt(militaryMatch[2], 10);
  } else {
    return fallbackIso;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallbackIso;

  const dt = new Date(Number(y), Number(m) - 1, Number(d), hour, minute, 0, 0);
  if (Number.isNaN(dt.getTime())) return fallbackIso;
  return dt.toISOString();
}

/**
 * Approves or rejects one specific pending punch -- the remote-approval
 * step, performed entirely from the manager's own already-authenticated
 * session (Time Clock page or the sidebar Alert Center), never by anyone
 * entering credentials on the employee's device. Shared by both surfaces so
 * the approval logic can't drift between them.
 *
 * adjustedDate/adjustedTime let the manager correct the punch's actual time
 * as part of approving it (e.g. the employee forgot to clock in on time).
 * These update `timestamp` for real, not just the display date/time fields
 * -- see parseAdjustedTimestamp above for why that distinction matters.
 */
export function resolveTimeClockApproval(params: {
  logId: string;
  decision: "approved" | "rejected";
  rejectionReason?: string;
  adjustedDate?: string;
  adjustedTime?: string;
  timeClockLogs: TimeClockLog[];
  setTimeClockLogs: Dispatch<SetStateAction<TimeClockLog[]>>;
  setNotifications: Dispatch<SetStateAction<AppNotification[]>>;
  businessId: string | undefined;
  actingUserEmail: string | undefined;
  actingUserName: string | undefined;
  logOperationalEvent?: (type: string, desc: string, icon: string) => void;
  notify?: (message: string) => void;
}): void {
  const { logId, decision, rejectionReason, adjustedDate, adjustedTime, timeClockLogs, setTimeClockLogs, setNotifications, businessId, actingUserEmail, actingUserName, logOperationalEvent, notify } = params;
  const targetLog = timeClockLogs.find(l => l.id === logId);
  if (!targetLog) return;
  const now = new Date().toISOString();

  const timeWasAdjusted = decision === "approved" &&
    ((adjustedDate && adjustedDate !== targetLog.date) || (adjustedTime && adjustedTime !== targetLog.time));
  const finalDate = timeWasAdjusted ? (adjustedDate || targetLog.date) : targetLog.date;
  const finalTime = timeWasAdjusted ? (adjustedTime || targetLog.time) : targetLog.time;
  const finalTimestamp = timeWasAdjusted ? parseAdjustedTimestamp(finalDate, finalTime, targetLog.timestamp) : targetLog.timestamp;

  setTimeClockLogs(prev => prev.map(l => l.id === logId ? {
    ...l,
    date: finalDate,
    time: finalTime,
    timestamp: finalTimestamp,
    approvalStatus: decision,
    ...(decision === "approved"
      ? { approved: true, approvedBy: actingUserEmail, approvedAt: now }
      : { rejectedBy: actingUserEmail, rejectedAt: now, rejectionReason: rejectionReason || "" })
  } : l));

  setNotifications(prev => prev.map(n =>
    n.relatedLogId === logId ? { ...n, isRead: true, actionedAt: now } : n
  ));

  if (businessId) {
    setNotifications(prev => [...prev, {
      id: `notif_tc_result_${logId}_${Date.now()}`,
      businessId,
      recipientEmail: targetLog.employeeEmail,
      type: "general",
      title: decision === "approved" ? "Punch Approved" : "Punch Rejected",
      description: decision === "approved"
        ? (timeWasAdjusted
            ? `Your ${targetLog.type} was approved with a corrected time: ${finalTime} on ${finalDate}.`
            : `Your ${targetLog.type} at ${targetLog.time} on ${targetLog.date} was approved.`)
        : `Your ${targetLog.type} at ${targetLog.time} on ${targetLog.date} was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isRead: false,
      screenId: "timeclock",
      createdAt: now
    }]);
  }

  if (logOperationalEvent) {
    logOperationalEvent(
      decision === "approved" ? "Punch Approved" : "Punch Rejected",
      timeWasAdjusted
        ? `${actingUserName || "A manager"} approved ${targetLog.employeeName}'s ${targetLog.type} with a corrected time (${targetLog.time} on ${targetLog.date} -> ${finalTime} on ${finalDate}).`
        : `${actingUserName || "A manager"} ${decision} ${targetLog.employeeName}'s ${targetLog.type} at ${targetLog.time}.`,
      decision === "approved" ? "✅" : "🚫"
    );
  }
  notify?.(decision === "approved" ? (timeWasAdjusted ? "Punch approved with corrected time." : "Punch approved.") : "Punch rejected.");
}

/**
 * Best-effort push to each recipient's registered device(s), on top of the
 * real-time in-app notification (App.tsx's Alert Center, wired to the same
 * Firestore-backed `notifications` collection these are written into).
 * Silently no-ops if push isn't configured yet -- see server/pushNotifications.ts
 * for exactly what's needed (VAPID key + Firebase service account) and how
 * this degrades gracefully without them. Never throws: a failed push must
 * never block the clock-in/out itself from completing.
 */
export async function sendPushBestEffort(recipientEmails: string[], title: string, body: string, data?: Record<string, string>): Promise<void> {
  try {
    await fetch("/api/notifications/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientEmails, title, body, data }),
    });
  } catch {
    // Push is a nice-to-have on top of the in-app notification; never let a
    // network hiccup here surface as a clock-in/out failure to the user.
  }
}
