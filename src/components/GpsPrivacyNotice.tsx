import React from "react";
import { ShieldCheck } from "lucide-react";

/**
 * The one disclosure sentence every GPS-tracking surface in the app must
 * carry, verbatim, so an employee never has to go hunting for it: tracking
 * is real while clocked in, and just as real an absence the moment they
 * clock out. Centralized here so the wording can't drift between Roster,
 * Settings, Time Clock, and the Interactive Map.
 */
export const GPS_PRIVACY_DISCLOSURE =
  "Location tracking only works while an employee is clocked in. Tracking stops when they clock out. Their off-duty location is never shown.";

export const GpsPrivacyNotice: React.FC<{ className?: string; dark?: boolean }> = ({ className, dark }) => (
  <div className={`flex items-start gap-2 rounded-xl border p-3 text-[10px] font-semibold ${
    dark
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
      : "border-emerald-200 bg-emerald-50 text-emerald-800"
  } ${className || ""}`}>
    <ShieldCheck className={`w-4 h-4 shrink-0 mt-0.5 ${dark ? "text-emerald-400" : "text-emerald-600"}`} />
    <span>{GPS_PRIVACY_DISCLOSURE}</span>
  </div>
);
