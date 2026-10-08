import React, { useMemo, useState } from "react";
import { MapPin, Navigation, Search, Gauge, ShieldCheck, ShieldOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useActiveTechnicians } from "../hooks/useActiveTechnicians";
import { formatFixAge } from "../lib/gpsFormatting";
import { GpsPrivacyNotice } from "./GpsPrivacyNotice";
import { RecentRoutesSection } from "./RecentRoutesSection";

const STATUS_STYLES: Record<string, string> = {
  Available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Traveling: "bg-orange-50 text-orange-700 border-orange-200",
  Lunch: "bg-amber-50 text-amber-700 border-amber-200",
  Offline: "bg-slate-100 text-slate-500 border-slate-200",
  "Clocked Out": "bg-slate-100 text-slate-500 border-slate-200"
};

type StatusFilter = "All" | "Live" | "Tracking On" | "Tracking Off";

/**
 * The one dedicated home for everything about where employees are: real
 * position/status/speed (same data + hook the Interactive Map uses), who
 * currently has GPS tracking permission, and each employee's past routes.
 * The Interactive Map keeps its own lightweight Technician Location filter
 * for viewing pins on the map itself -- this page is the fuller interface
 * (roster-wide status, permission management, route history) that a
 * "View Employee Locations" button on the Map and Dispatch pages opens.
 */
export const EmployeeLocationsPage: React.FC = () => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const canManage = activeRole === "Owner" || activeRole.toLowerCase().includes("manager") || activeRole.toLowerCase().includes("admin");
  const { employees, setEmployees } = useDomainData();
  const { navigateToScreen, triggerNotification } = useNavTelemetry();
  const { activeTechnicians } = useActiveTechnicians();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

  const rows = useMemo(() => {
    return employees.map(emp => {
      const name = `${emp.firstName} ${emp.lastName}`.trim();
      const tech = activeTechnicians.find(t => t.id === emp.email);
      return { employee: emp, name, tech };
    }).filter(row => {
      if (searchQuery && !row.name.toLowerCase().includes(searchQuery.toLowerCase()) && !row.employee.role.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (statusFilter === "Live") {
        return !!row.tech?.lastLocationAt && formatFixAge(row.tech.lastLocationAt) === "Live";
      }
      if (statusFilter === "Tracking On") return !!row.employee.gpsTrackingEnabled;
      if (statusFilter === "Tracking Off") return !row.employee.gpsTrackingEnabled;
      return true;
    });
  }, [employees, activeTechnicians, searchQuery, statusFilter]);

  const summary = useMemo(() => {
    const liveNow = employees.filter(emp => {
      const tech = activeTechnicians.find(t => t.id === emp.email);
      return !!tech?.lastLocationAt && formatFixAge(tech.lastLocationAt) === "Live";
    }).length;
    const trackingOn = employees.filter(e => e.gpsTrackingEnabled).length;
    return { liveNow, trackingOn, total: employees.length };
  }, [employees, activeTechnicians]);

  const toggleTracking = (email: string, enabled: boolean) => {
    setEmployees(prev => prev.map(e => e.email === email ? { ...e, gpsTrackingEnabled: enabled } : e));
    const emp = employees.find(e => e.email === email);
    triggerNotification?.(`GPS tracking ${enabled ? "enabled" : "disabled"} for ${emp ? `${emp.firstName} ${emp.lastName}` : email}.`);
  };

  return (
    <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-5 animate-fade-in text-left">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#9EC8EF]/60 pb-4">
        <div>
          <h2 className="text-base font-sans font-extrabold text-[#1F3557] uppercase tracking-wider flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-600" /> Employee Locations
          </h2>
          <p className="text-xs text-[#5E7393] mt-1 font-sans font-semibold">
            See an employee’s location and route while they are clocked in.
          </p>
        </div>
        <button
          onClick={() => navigateToScreen?.("routes")}
          className="px-3.5 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-black rounded-xl uppercase tracking-wide flex items-center gap-1.5"
        >
          <Navigation className="w-4 h-4" /> Open Interactive Map
        </button>
      </div>

      <GpsPrivacyNotice />

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl p-3.5">
          <p className="text-[9.5px] font-black uppercase tracking-wider text-[#5E7393]">Clocked In and Sharing Location</p>
          <p className="text-xl font-extrabold text-emerald-600 mt-1">{summary.liveNow}</p>
        </div>
        <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl p-3.5">
          <p className="text-[9.5px] font-black uppercase tracking-wider text-[#5E7393]">Location Allowed</p>
          <p className="text-xl font-extrabold text-[#1F3557] mt-1">{summary.trackingOn}</p>
        </div>
        <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl p-3.5">
          <p className="text-[9.5px] font-black uppercase tracking-wider text-[#5E7393]">Total Employees</p>
          <p className="text-xl font-extrabold text-[#1F3557] mt-1">{summary.total}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E7393]" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search name or role..."
            className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl pl-9 pr-3 py-2.5 text-[#1F3557] placeholder:text-[#5E7393] focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["All", "Live", "Tracking On", "Tracking Off"] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${
                statusFilter === f ? "bg-emerald-500 text-white" : "bg-white text-[#1F3557] border border-[#9EC8EF] hover:bg-[#EAF5FF]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-10 text-[#5E7393] text-xs font-semibold">
          {employees.length === 0 ? "No employees on the roster yet." : "No employees match this search/filter."}
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map(({ employee, name, tech }) => {
            const fresh = tech?.lastLocationAt ? formatFixAge(tech.lastLocationAt) : null;
            const isLive = fresh === "Live";
            const isExpanded = expandedEmail === employee.email;
            return (
              <div key={employee.email} className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl overflow-hidden">
                <div className="p-3.5 flex flex-wrap items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white text-[#315C9F] border border-[#9EC8EF] text-xs font-black flex items-center justify-center shrink-0">
                    {(employee.firstName?.[0] || "").toUpperCase()}{(employee.lastName?.[0] || "").toUpperCase()}
                  </div>
                  <div className="min-w-[140px]">
                    <p className="text-xs font-extrabold text-[#1F3557]">{name}</p>
                    <p className="text-[10px] text-[#5E7393] font-semibold">{employee.role}</p>
                  </div>

                  <span className={`px-2 py-1 rounded-lg text-[9.5px] font-black uppercase tracking-wider border ${STATUS_STYLES[tech?.status || "Offline"] || STATUS_STYLES.Offline}`}>
                    {tech?.status || "Offline"}
                  </span>

                  <span className={`text-[10px] font-bold flex items-center gap-1 ${isLive ? "text-emerald-600" : "text-[#5E7393]"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                    {fresh || "No GPS fix yet"}
                  </span>

                  {tech?.speedMph != null && (
                    <span className="text-[10px] font-bold text-[#1F3557] flex items-center gap-1">
                      <Gauge className="w-3 h-3 text-cyan-600" /> {Math.round(tech.speedMph)} mph
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-2">
                    {employee.gpsTrackingEnabled ? (
                      <span className="text-[9.5px] font-black uppercase text-emerald-600 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Tracking On</span>
                    ) : (
                      <span className="text-[9.5px] font-black uppercase text-[#5E7393] flex items-center gap-1"><ShieldOff className="w-3.5 h-3.5" /> Tracking Off</span>
                    )}
                    {canManage && (
                      <button
                        onClick={() => toggleTracking(employee.email, !employee.gpsTrackingEnabled)}
                        className={`px-2.5 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider ${
                          employee.gpsTrackingEnabled ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100" : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                        }`}
                      >
                        {employee.gpsTrackingEnabled ? "Turn Off" : "Turn On"}
                      </button>
                    )}
                    <button
                      onClick={() => navigateToScreen?.("routes", { technicianId: employee.email })}
                      className="px-2.5 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider bg-white text-[#315C9F] border border-[#9EC8EF] hover:bg-[#BDDDF8]"
                    >
                      View on Map
                    </button>
                    <button
                      onClick={() => setExpandedEmail(isExpanded ? null : employee.email)}
                      className="px-2.5 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider bg-white text-[#1F3557] border border-[#9EC8EF] hover:bg-[#BDDDF8]"
                    >
                      {isExpanded ? "Hide Routes" : "Routes"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-[#9EC8EF] p-3.5 bg-[#C7E3FA]/60">
                    {/* RecentRoutesSection is themed for the app's light pages (Roster/Time Clock) -- wrapped in its own light card here so it stays legible on this page's dark background. */}
                    <div className="bg-white rounded-xl p-2">
                      <RecentRoutesSection businessId={loggedInUser?.isEmployee ? loggedInUser.businessEmail : loggedInUser?.email} employeeEmail={employee.email} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
