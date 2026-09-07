import React from "react";
import type { LiveLocationFix } from "../lib/timeClockService";

export interface RoutePreviewSvgProps {
  points: LiveLocationFix[];
  className?: string;
}

/**
 * A dependency-free path visualization for one shift's real GPS breadcrumb
 * trail -- no Google Maps API key required, so this works anywhere a route
 * needs reviewing (Roster, Time Clock) without pulling in the map bundle.
 * Projects real lat/lng points onto a simple flat viewBox scaled to fit
 * whatever area the route actually covers; a route with only one point (a
 * very short shift, or a device that only ever reported once) renders as a
 * single dot rather than a fabricated line.
 */
export const RoutePreviewSvg: React.FC<RoutePreviewSvgProps> = ({ points, className }) => {
  if (!points.length) {
    return (
      <div className={`flex items-center justify-center text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200 rounded-xl ${className || "h-40"}`}>
        No GPS points recorded for this shift.
      </div>
    );
  }

  const W = 300, H = 180, PAD = 16;
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 0.0005;
  const lngSpan = maxLng - minLng || 0.0005;

  const project = (p: LiveLocationFix) => {
    const x = PAD + ((p.lng - minLng) / lngSpan) * (W - PAD * 2);
    // Screen y grows downward; latitude grows northward, so flip.
    const y = PAD + (1 - (p.lat - minLat) / latSpan) * (H - PAD * 2);
    return { x, y };
  };

  const projected = points.map(project);
  const pathStr = projected.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const start = projected[0];
  const end = projected[projected.length - 1];

  return (
    <div className={className || ""}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40 bg-slate-50 border border-slate-200 rounded-xl">
        {points.length > 1 && (
          <polyline points={pathStr} fill="none" stroke="#4A9BFF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        )}
        <circle cx={start.x} cy={start.y} r={4.5} fill="#10b981" stroke="white" strokeWidth={1.5} />
        {points.length > 1 && <circle cx={end.x} cy={end.y} r={4.5} fill="#ef4444" stroke="white" strokeWidth={1.5} />}
      </svg>
      <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 mt-1 px-0.5">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Start</span>
        <span>{points.length} GPS point{points.length === 1 ? "" : "s"}</span>
        {points.length > 1 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Last known</span>}
      </div>
    </div>
  );
};
