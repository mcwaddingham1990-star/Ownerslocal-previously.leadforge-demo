// Standalone demo build: in-memory stand-in for the `active_shifts` /
// `shift_routes` Firestore collections that src/lib/timeClockService.ts
// writes to directly and the one active_shifts subscription in
// InteractiveMapPage.tsx (via src/lib/firestoreService.ts) reads directly --
// both bypass useFirestoreCollection.ts's per-collection mock entirely, so
// GPS field tracking needs its own seam. Both of those mock files import
// this single shared store so clocking an employee in/out on the Time Clock
// page is reflected immediately in the Interactive Map's live feed, the way
// the real onSnapshot listener would behave.

export interface MockLiveLocationFix {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  capturedAt: string;
}

export interface MockActiveShift {
  id: string;
  businessId: string;
  employeeEmail: string;
  employeeName: string;
  clockInLogId?: string;
  clockedInAt: string;
  updatedAt: string;
  lastLocation?: MockLiveLocationFix;
  lastLocationAt?: string;
}

export interface MockShiftRoute {
  id: string;
  businessId: string;
  employeeEmail: string;
  employeeName: string;
  clockInLogId: string;
  updatedAt: string;
  points: MockLiveLocationFix[];
}

// Matches the fake demo Owner's email in App.tsx -- businessId is always
// this for the single-tenant demo.
const BIZ = "admin@ownerslocal.com";

const now = Date.now();
const minsAgo = (m: number) => new Date(now - m * 60000).toISOString();
const hoursAgo = (h: number) => new Date(now - h * 3600000).toISOString();

export const activeShifts = new Map<string, MockActiveShift>();
export const shiftRoutes = new Map<string, MockShiftRoute>();

const seedActive = (
  id: string,
  employeeEmail: string,
  employeeName: string,
  clockInLogId: string,
  clockedInAt: string,
  lat: number,
  lng: number
) => {
  const fixTime = minsAgo(2);
  activeShifts.set(id, {
    id,
    businessId: BIZ,
    employeeEmail,
    employeeName,
    clockInLogId,
    clockedInAt,
    updatedAt: fixTime,
    lastLocation: { lat, lng, accuracy: 12, heading: 90, speed: 4.5, capturedAt: fixTime },
    lastLocationAt: fixTime
  });
};

// Three field crew members currently clocked in (matches mockSeedData.ts's
// time_clock_logs), each near the job site they're seeded to be working
// today (see scheduling_events) around Haslet, TX.
seedActive("shift_danny", "danny@greenpointlandscape.com", "Danny Reyes", "tcl_2", hoursAgo(3), 32.9722, -97.3648);
seedActive("shift_jalvarez", "jalvarez@greenpointlandscape.com", "J. Alvarez", "tcl_1", hoursAgo(3.1), 32.9592, -97.3798);
seedActive("shift_priya", "priya@greenpointlandscape.com", "Priya Nair", "tcl_3", hoursAgo(2.8), 32.9648, -97.3552);

const seedRoute = (
  id: string,
  employeeEmail: string,
  employeeName: string,
  clockInLogId: string,
  points: MockLiveLocationFix[]
) => {
  shiftRoutes.set(clockInLogId, {
    id,
    businessId: BIZ,
    employeeEmail,
    employeeName,
    clockInLogId,
    updatedAt: points[points.length - 1].capturedAt,
    points
  });
};

// In-progress breadcrumb trails for this morning's active shifts above, so
// "View Route" on a currently-clocked-in employee shows something.
seedRoute("route_danny_today", "danny@greenpointlandscape.com", "Danny Reyes", "tcl_2", [
  { lat: 32.9668, lng: -97.3714, capturedAt: hoursAgo(3) },
  { lat: 32.9695, lng: -97.368, capturedAt: hoursAgo(2) },
  { lat: 32.9722, lng: -97.3648, capturedAt: minsAgo(2) }
]);
seedRoute("route_jalvarez_today", "jalvarez@greenpointlandscape.com", "J. Alvarez", "tcl_1", [
  { lat: 32.9668, lng: -97.3714, capturedAt: hoursAgo(3.1) },
  { lat: 32.963, lng: -97.3755, capturedAt: hoursAgo(2.1) },
  { lat: 32.9592, lng: -97.3798, capturedAt: minsAgo(3) }
]);
seedRoute("route_priya_today", "priya@greenpointlandscape.com", "Priya Nair", "tcl_3", [
  { lat: 32.9668, lng: -97.3714, capturedAt: hoursAgo(2.8) },
  { lat: 32.9658, lng: -97.363, capturedAt: minsAgo(2) }
]);

// Completed historical shifts so "Recent Routes" has more than one entry to
// review, even before anyone clocks in during the demo.
seedRoute("route_danny_hist1", "danny@greenpointlandscape.com", "Danny Reyes", "tcl_hist_danny_1", [
  { lat: 32.9668, lng: -97.3714, capturedAt: new Date(now - 26 * 3600000).toISOString() },
  { lat: 32.97, lng: -97.369, capturedAt: new Date(now - 25 * 3600000).toISOString() },
  { lat: 32.9722, lng: -97.3648, capturedAt: new Date(now - 24 * 3600000).toISOString() },
  { lat: 32.97, lng: -97.369, capturedAt: new Date(now - 22 * 3600000).toISOString() },
  { lat: 32.9668, lng: -97.3714, capturedAt: new Date(now - 21 * 3600000).toISOString() }
]);
seedRoute("route_priya_hist1", "priya@greenpointlandscape.com", "Priya Nair", "tcl_hist_priya_1", [
  { lat: 32.9668, lng: -97.3714, capturedAt: new Date(now - 50 * 3600000).toISOString() },
  { lat: 32.964, lng: -97.36, capturedAt: new Date(now - 49 * 3600000).toISOString() },
  { lat: 32.9648, lng: -97.3552, capturedAt: new Date(now - 47 * 3600000).toISOString() }
]);

type Listener = (shifts: MockActiveShift[]) => void;
const listeners = new Set<Listener>();

function notify() {
  const snapshot = Array.from(activeShifts.values());
  listeners.forEach(listener => listener(snapshot));
}

export function subscribeActiveShifts(listener: Listener): () => void {
  listeners.add(listener);
  listener(Array.from(activeShifts.values()));
  return () => {
    listeners.delete(listener);
  };
}

export function upsertActiveShift(id: string, shift: MockActiveShift) {
  activeShifts.set(id, shift);
  notify();
}

export function deleteActiveShift(id: string) {
  activeShifts.delete(id);
  notify();
}
