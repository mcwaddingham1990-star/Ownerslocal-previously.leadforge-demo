import { TimeClockLog } from "../types/domain";
import {
  activeShifts,
  deleteActiveShift,
  shiftRoutes,
  upsertActiveShift
} from "./mockGpsStore";

/**
 * Standalone demo build: the real version of this file writes clock-in/out
 * state and live GPS fixes directly to Firestore (`active_shifts`,
 * `shift_routes`) via runTransaction/setDoc/updateDoc -- entirely bypassing
 * useFirestoreCollection.ts's mock, since it never goes through that hook.
 * This mock keeps the exact same exported function signatures every caller
 * (TimeClockPage.tsx, App.tsx's live-location watcher, RecentRoutesSection)
 * already uses, backed by the in-memory store in mockGpsStore.ts instead of
 * real Firestore, so the demo has no real network dependency here either.
 */

export interface LiveLocationFix {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  capturedAt: string; // ISO timestamp of the real device fix, not of the write
}

export interface ShiftRoute {
  id: string;
  businessId: string;
  employeeEmail: string;
  employeeName: string;
  clockInLogId: string;
  startedAt: string;
  updatedAt: string;
  points: LiveLocationFix[];
}

const activeShiftId = (businessId: string, employeeEmail: string) =>
  encodeURIComponent(`${businessId}::${employeeEmail.toLowerCase()}`);

export async function clockInTransaction(businessId: string, log: TimeClockLog): Promise<void> {
  const id = activeShiftId(businessId, log.employeeEmail);
  if (activeShifts.has(id)) throw new Error("This employee is already clocked in.");
  upsertActiveShift(id, {
    id,
    businessId,
    employeeEmail: log.employeeEmail,
    employeeName: log.employeeName,
    clockInLogId: log.id,
    clockedInAt: log.timestamp,
    updatedAt: log.timestamp
  });
}

export async function clockOutTransaction(
  businessId: string,
  log: TimeClockLog,
  _legacyLogsShowActive: boolean
): Promise<void> {
  const id = activeShiftId(businessId, log.employeeEmail);
  if (!activeShifts.has(id)) throw new Error("No active shift exists to clock out.");
  deleteActiveShift(id);
}

export async function updateLiveLocation(
  businessId: string,
  employeeEmail: string,
  employeeName: string,
  clockInLogId: string | undefined,
  location: LiveLocationFix
): Promise<void> {
  const id = activeShiftId(businessId, employeeEmail);
  const existing = activeShifts.get(id);
  if (existing) {
    upsertActiveShift(id, {
      ...existing,
      lastLocation: location,
      lastLocationAt: location.capturedAt,
      updatedAt: location.capturedAt
    });
  }
  if (clockInLogId) {
    const existingRoute = shiftRoutes.get(clockInLogId);
    const points = existingRoute ? [...existingRoute.points, location] : [location];
    shiftRoutes.set(clockInLogId, {
      id: existingRoute?.id || `route_${clockInLogId}`,
      businessId,
      employeeEmail,
      employeeName,
      clockInLogId,
      updatedAt: location.capturedAt,
      points
    });
  }
}

/** One shift's full route, or null if tracking was never on for it. */
export async function fetchShiftRoute(clockInLogId: string): Promise<ShiftRoute | null> {
  const route = shiftRoutes.get(clockInLogId);
  if (!route) return null;
  return { ...route, startedAt: route.points[0]?.capturedAt || route.updatedAt };
}

/**
 * An employee's most recent recorded routes, newest first.
 */
export async function fetchRecentRoutes(businessId: string, employeeEmail: string, limitCount = 20): Promise<ShiftRoute[]> {
  const routes = Array.from(shiftRoutes.values())
    .filter(r => r.businessId === businessId && r.employeeEmail === employeeEmail)
    .map(r => ({ ...r, startedAt: r.points[0]?.capturedAt || r.updatedAt }));
  return routes
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limitCount);
}

// Kept separate for administrative repair tools that may need to clear an
// orphaned active marker after deleting/correcting its source punch.
export async function clearActiveShift(businessId: string, employeeEmail: string): Promise<void> {
  deleteActiveShift(activeShiftId(businessId, employeeEmail));
}
