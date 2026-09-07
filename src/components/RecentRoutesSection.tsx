import React, { useEffect, useState } from "react";
import { ChevronDown, Navigation } from "lucide-react";
import { fetchRecentRoutes, ShiftRoute } from "../lib/timeClockService";
import { RoutePreviewSvg } from "./RoutePreviewSvg";

export interface RecentRoutesSectionProps {
  businessId: string | undefined;
  employeeEmail: string;
  /** Restrict to one specific shift instead of listing every recent one (Time Clock's per-entry "View Route"). */
  onlyClockInLogId?: string;
}

/**
 * Real, on-demand route history for one employee -- fetched only when
 * opened, never pre-loaded for every employee in a list. Shared by Roster
 * (per-employee GPS settings) and Time Clock (per-shift history) so the
 * lookup, loading state, and empty state stay identical everywhere a
 * manager can review where a technician actually went.
 */
export const RecentRoutesSection: React.FC<RecentRoutesSectionProps> = ({ businessId, employeeEmail, onlyClockInLogId }) => {
  const [open, setOpen] = useState(!!onlyClockInLogId);
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<ShiftRoute[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || routes !== null || !businessId) return;
    setLoading(true);
    fetchRecentRoutes(businessId, employeeEmail, 20)
      .then(fetched => {
        const filtered = onlyClockInLogId ? fetched.filter(r => r.clockInLogId === onlyClockInLogId) : fetched;
        setRoutes(filtered);
        setSelectedId(filtered[0]?.id || null);
      })
      .catch(() => setRoutes([]))
      .finally(() => setLoading(false));
  }, [open, routes, businessId, employeeEmail, onlyClockInLogId]);

  const selected = routes?.find(r => r.id === selectedId) || null;
  const formatWhen = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 font-bold text-[#1F3557] text-xs cursor-pointer"
      >
        <span className="flex items-center gap-1.5"><Navigation className="w-3.5 h-3.5 text-[#4A9BFF]" /> {onlyClockInLogId ? "View Route" : "Recent Routes"}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="p-3 space-y-2">
          {loading && <p className="text-[10px] text-slate-400 font-semibold">Loading real GPS history…</p>}
          {!loading && routes !== null && routes.length === 0 && (
            <p className="text-[10px] text-slate-400 font-semibold">
              No GPS route recorded {onlyClockInLogId ? "for this shift" : "yet"} -- either tracking wasn't on, or no fix has landed yet.
            </p>
          )}
          {!loading && routes && routes.length > 0 && (
            <>
              {!onlyClockInLogId && routes.length > 1 && (
                <select
                  value={selectedId || ""}
                  onChange={e => setSelectedId(e.target.value)}
                  className="w-full text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[#1F3557]"
                >
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>{formatWhen(r.startedAt)} — {r.points.length} pts</option>
                  ))}
                </select>
              )}
              {selected && (
                <>
                  <p className="text-[9.5px] font-bold text-slate-500">
                    Shift started {formatWhen(selected.startedAt)} • last real fix {formatWhen(selected.updatedAt)}
                  </p>
                  <RoutePreviewSvg points={selected.points} />
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
