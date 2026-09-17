import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { subscribeToCollection } from "../lib/firestoreService";

export interface ActiveTechnician {
  id: string;
  name: string;
  vehicle: string;
  status: "Available" | "Traveling" | "Lunch" | "Offline" | "Clocked Out";
  lat: number;
  lng: number;
  jobId?: string;
  routeProgress?: number; // 0 to 100 -- local-only dispatch overlay, see InteractiveMapPage's handleAssignTechnician
  routePath?: Array<{ lat: number; lng: number }>;
  lastLocationAt?: string; // real timestamp of the fix behind lat/lng, when known
  speedMph?: number; // real device-reported speed from the live GPS fix, when the device provided one
}

const parseGpsString = (gps: string): { lat: number; lng: number } | null => {
  const match = gps.match(/(\d+(?:\.\d+)?)\s*°\s*([NS])\s*,\s*(\d+(?:\.\d+)?)\s*°\s*([EW])/);
  if (!match) return null;
  const [, latStr, latDir, lngStr, lngDir] = match;
  return {
    lat: parseFloat(latStr) * (latDir === "S" ? -1 : 1),
    lng: parseFloat(lngStr) * (lngDir === "W" ? -1 : 1)
  };
};

/**
 * The single real source of technician position/status/speed, shared by the
 * Interactive Map (which also overlays a local, ephemeral "dispatched to a
 * job" state via the returned setter) and the Employee Locations page.
 * Extracted here so both pages read the exact same real data -- a live GPS
 * fix reported while clocked in (see updateLiveLocation in
 * timeClockService.ts) when one exists, otherwise the single fix captured
 * at the employee's last clock event. Nothing here is ever fabricated or
 * animated; a technician's position only changes when a real fix says it did.
 */
export function useActiveTechnicians(businessAddresses?: string[]) {
  const { loggedInUser } = useAuth();
  const businessId = loggedInUser?.isEmployee ? loggedInUser?.businessEmail : loggedInUser?.email;
  const { employees, timeClockLogs, schedulingEvents } = useDomainData();

  const [activeShifts, setActiveShifts] = useState<Array<{
    id: string;
    employeeEmail: string;
    lastLocation?: { lat: number; lng: number; accuracy?: number; heading?: number | null; speed?: number | null; capturedAt: string };
    lastLocationAt?: string;
  }>>([]);

  useEffect(() => {
    if (!businessId) {
      setActiveShifts([]);
      return;
    }
    return subscribeToCollection("active_shifts", businessId, docs => setActiveShifts(docs as any));
  }, [businessId]);

  const [activeTechnicians, setActiveTechnicians] = useState<ActiveTechnician[]>([]);

  useEffect(() => {
    setActiveTechnicians(prev => employees.map(er => {
      const existing = prev.find(t => t.id === er.email);
      const myLogs = timeClockLogs.filter(l => l.employeeEmail === er.email);
      const lastLog = [...myLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      const realStatus: "Available" | "Lunch" | "Offline" =
        !lastLog || lastLog.type === "Clock Out" ? "Offline" :
        lastLog.type === "Break Start" ? "Lunch" : "Available";
      const myShift = activeShifts.find(s => s.employeeEmail === er.email);
      const liveFix = myShift?.lastLocation;
      const lastRealFix = liveFix || (lastLog ? parseGpsString(lastLog.gps) : null);
      // No geocode fallback here (no address -> fake location) -- a
      // technician with no real fix at all just doesn't get a position, the
      // same "never fabricate" behavior the map's pin filtering relies on.
      const fallbackFix = { lat: Number.NaN, lng: Number.NaN };
      void businessAddresses;
      const speedMph = liveFix?.speed != null ? liveFix.speed * 2.23694 : undefined;
      return {
        id: er.email,
        name: `${er.firstName} ${er.lastName}`.trim(),
        vehicle: lastLog?.vehicle || "Unassigned",
        status: existing?.jobId ? "Traveling" : realStatus,
        lat: existing?.jobId ? existing.lat : (lastRealFix?.lat ?? existing?.lat ?? fallbackFix.lat),
        lng: existing?.jobId ? existing.lng : (lastRealFix?.lng ?? existing?.lng ?? fallbackFix.lng),
        jobId: existing?.jobId,
        routeProgress: existing?.routeProgress,
        routePath: existing?.routePath,
        lastLocationAt: existing?.jobId ? existing.lastLocationAt : (myShift?.lastLocationAt ?? existing?.lastLocationAt),
        speedMph
      };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, timeClockLogs, businessAddresses, activeShifts]);

  // Vehicles are real -- one per technician who's clocked in and typed a
  // vehicle name at clock-in (no separate fleet CRUD exists). Speed is that
  // technician's own real device-reported speed. There is no fuel-telemetry
  // integration of any kind, so fuel is never shown rather than invented.
  const vehicles = useMemo(() => activeTechnicians
    .filter(t => t.vehicle !== "Unassigned" && t.status !== "Offline")
    .map(t => ({
      id: `veh_${t.id}`,
      name: t.vehicle,
      driver: t.name,
      driverId: t.id,
      speedMph: t.speedMph,
      assignedJobs: schedulingEvents.filter(e => e.assignedEmployee === t.name && e.status !== "Completed").length
    })), [activeTechnicians, schedulingEvents]);

  return { businessId, activeTechnicians, setActiveTechnicians, vehicles };
}
