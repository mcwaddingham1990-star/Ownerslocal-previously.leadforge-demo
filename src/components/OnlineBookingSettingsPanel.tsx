import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { CalendarCheck, Copy, Plus, Trash2 } from "lucide-react";
import { db } from "../firebase";
import {
  BOOKING_TIME_ZONES, normalizeOnlineBookingConfig, normalizeOrigin, slugifyServiceId,
  type OnlineBookingConfig
} from "../types/onlineBooking";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fieldClass = "w-full px-2.5 py-1.5 bg-white border border-[#A9CDEE] rounded-lg text-xs text-slate-700 focus:outline-none";
const labelClass = "block text-[9px] font-bold uppercase text-slate-500 mb-1";

/**
 * Online Booking settings, shown inside the Website Lead Capture
 * integration (it extends that integration: same embed token, same
 * business_profiles doc). One config powers BOTH Customer Portal "Book
 * Service" and website booking -- see server/onlineBooking.ts, which is the
 * only place slots are actually computed and bookings validated.
 */
export function OnlineBookingSettingsPanel({ businessId, webFormToken, onNotify }: {
  businessId: string;
  webFormToken: string;
  onNotify: (message: string) => void;
}) {
  const [config, setConfig] = useState<OnlineBookingConfig | null>(null);
  const [originsText, setOriginsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<"" | "embed" | "combined" | "api">("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "business_profiles", businessId));
        const data = snap.exists() ? snap.data() : {};
        const loaded = normalizeOnlineBookingConfig(data.onlineBooking, data.companySettings);
        if (!cancelled) {
          setConfig(loaded);
          setOriginsText(loaded.allowedOrigins.join("\n"));
        }
      } catch (err) {
        console.error("Error loading online booking settings:", err);
        if (!cancelled) setConfig(normalizeOnlineBookingConfig(undefined));
      }
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const embedSnippet = useMemo(() => webFormToken ? `<!-- Owner'sLOCAL Online Booking -->
<div id="ownerslocal-booking"></div>
<script src="${origin}/embed/ownerslocal-booking.js" data-token="${webFormToken}" async></script>` : "", [origin, webFormToken]);

  const combinedSnippet = useMemo(() => webFormToken ? `<!-- Owner'sLOCAL Contact + Online Booking (all-in-one) -->
<div id="ownerslocal-booking"></div>
<script src="${origin}/embed/ownerslocal-booking.js" data-token="${webFormToken}" data-mode="combined" async></script>` : "", [origin, webFormToken]);

  const apiReference = useMemo(() => webFormToken ? `Base URL: ${origin}/api/booking/web/${webFormToken}

GET  /info
     -> { ok, businessName, phone, email, address, hours, bookingEnabled }
GET  /options
     -> { ok, businessName, services: [{ id, name, durationMinutes }], timeZone, maxDaysAhead }
GET  /availability?serviceId=ID&from=YYYY-MM-DD&days=1-14
     -> { ok, timeZone, days: [{ date, slots: [{ startTime, endTime }] }] }
POST /book   (JSON)
     { serviceId, date, startTime, name, phone, email, address,
       description?, photos?: ["data:image/jpeg;base64,..."], idempotencyKey? }
     -> 200 { ok: true, confirmation: { bookingId, jobNumber, date, startTime, endTime, serviceName, address, businessName } }
     -> 409 { ok: false, code: "SLOT_UNAVAILABLE", error, availability: [...] }

Existing lead webhook also accepts bookings:
POST ${origin}/api/leads/submit-web-form
     { token: "${webFormToken}", serviceId, date, startTime, name, phone, email, address, ... }
     (without serviceId/startTime it stays an ordinary website lead)` : "", [origin, webFormToken]);

  if (!config) return <p className="text-slate-500 font-sans text-xs">Loading Online Booking…</p>;

  const update = (patch: Partial<OnlineBookingConfig>) => setConfig(prev => prev ? { ...prev, ...patch } : prev);
  const updateService = (index: number, patch: Partial<OnlineBookingConfig["services"][number]>) =>
    update({ services: config.services.map((s, i) => i === index ? { ...s, ...patch } : s) });

  const save = async () => {
    setSaving(true);
    try {
      const origins = originsText.split(/[\s,]+/).filter(Boolean);
      const invalid = origins.filter(o => !normalizeOrigin(o));
      if (invalid.length) {
        onNotify(`Not a valid website address: ${invalid[0]} (use e.g. https://www.example.com)`);
        return;
      }
      const normalized = normalizeOnlineBookingConfig({ ...config, allowedOrigins: origins });
      await setDoc(doc(db, "business_profiles", businessId), { onlineBooking: normalized }, { merge: true });
      setConfig(normalized);
      setOriginsText(normalized.allowedOrigins.join("\n"));
      onNotify("📅 Online Booking settings saved.");
    } catch (err) {
      console.error("Error saving online booking settings:", err);
      onNotify("Couldn't save Online Booking settings -- check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (text: string, which: "embed" | "combined" | "api") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      onNotify("Couldn't copy automatically -- select the text and copy it manually.");
    }
  };

  return (
    // The surrounding integration modal is a <form>; Enter inside these
    // inputs must not submit it.
    <div
      className="space-y-3 p-3 bg-[#F5FAFF] border border-[#A9CDEE]/60 rounded-lg"
      onKeyDown={e => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault(); }}
    >
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-4 w-4 text-[#315C9F]" />
        <h4 className="text-[11px] font-extrabold text-[#342D7E] uppercase tracking-wider">Online Booking</h4>
      </div>
      <p className="text-[10.5px] text-slate-600 leading-relaxed">
        Let customers pick a real open time from your Scheduling calendar -- from their Customer Portal ("Book Service") and,
        optionally, from your own website. Each booking creates a scheduled Job for the right customer and notifies you.
        Visitors who just fill in the lead form above still become ordinary Leads.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={config.enabled} onChange={e => update({ enabled: e.target.checked })} />
          Turn on Online Booking
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={config.websiteEnabled} onChange={e => update({ websiteEnabled: e.target.checked })} />
          Allow booking from my website
        </label>
      </div>

      <div>
        <span className={labelClass}>Bookable services</span>
        <div className="space-y-1.5">
          {config.services.map((service, index) => (
            <div key={index} className="grid grid-cols-[1fr_80px_auto] gap-1.5 items-center">
              <input
                value={service.name}
                onChange={e => updateService(index, { name: e.target.value })}
                placeholder="Service name"
                className={fieldClass}
              />
              <select value={service.durationMinutes} onChange={e => updateService(index, { durationMinutes: Number(e.target.value) })} className={fieldClass} aria-label="Duration">
                {[15, 30, 45, 60, 90, 120, 180, 240, 360, 480].map(m => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr`}</option>)}
              </select>
              <button
                type="button"
                aria-label="Remove service"
                disabled={config.services.length <= 1}
                onClick={() => update({ services: config.services.filter((_, i) => i !== index) })}
                className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const name = `New Service ${config.services.length + 1}`;
            update({ services: [...config.services, { id: `${slugifyServiceId(name)}-${Date.now().toString(36)}`, name, durationMinutes: 60 }] });
          }}
          className="mt-1.5 px-2.5 py-1 bg-white hover:bg-[#E3F3FF] text-[#315C9F] border border-[#A9CDEE] rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
        >
          <Plus className="h-3 w-3" /> Add service
        </button>
      </div>

      <div>
        <span className={labelClass}>Bookable days</span>
        <div className="flex flex-wrap gap-1">
          {DAY_LABELS.map((label, day) => {
            const on = config.workingDays.includes(day);
            return (
              <button
                key={label}
                type="button"
                onClick={() => update({ workingDays: on ? config.workingDays.filter(d => d !== day) : [...config.workingDays, day].sort() })}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${on ? "bg-[#315C9F] text-white border-[#315C9F]" : "bg-white text-slate-500 border-[#A9CDEE]"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <label><span className={labelClass}>Opens</span><input type="time" value={config.dayStart} onChange={e => update({ dayStart: e.target.value })} className={fieldClass} /></label>
        <label><span className={labelClass}>Closes</span><input type="time" value={config.dayEnd} onChange={e => update({ dayEnd: e.target.value })} className={fieldClass} /></label>
        <label>
          <span className={labelClass}>Time zone</span>
          <select value={config.timeZone} onChange={e => update({ timeZone: e.target.value })} className={fieldClass}>
            {!BOOKING_TIME_ZONES.some(z => z.id === config.timeZone) && <option value={config.timeZone}>{config.timeZone}</option>}
            {BOOKING_TIME_ZONES.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
        </label>
        <label>
          <span className={labelClass}>Start times every</span>
          <select value={config.slotIntervalMinutes} onChange={e => update({ slotIntervalMinutes: Number(e.target.value) })} className={fieldClass}>
            {[15, 30, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
        <label>
          <span className={labelClass}>Buffer between jobs (min)</span>
          <input type="number" min={0} max={240} value={config.bufferMinutes} onChange={e => update({ bufferMinutes: Number(e.target.value) })} className={fieldClass} />
        </label>
        <label>
          <span className={labelClass}>Minimum notice (hours)</span>
          <input type="number" min={0} max={336} value={config.minNoticeHours} onChange={e => update({ minNoticeHours: Number(e.target.value) })} className={fieldClass} />
        </label>
        <label>
          <span className={labelClass}>Book up to (days ahead)</span>
          <input type="number" min={1} max={180} value={config.maxDaysAhead} onChange={e => update({ maxDaysAhead: Number(e.target.value) })} className={fieldClass} />
        </label>
        <label>
          <span className={labelClass}>Jobs at the same time</span>
          <input type="number" min={1} max={50} value={config.capacity} onChange={e => update({ capacity: Number(e.target.value) })} className={fieldClass} />
        </label>
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        A time is only offered when it's free on your Scheduling calendar: every existing appointment (except cancelled ones, reminders and tasks) blocks its time.
        "Jobs at the same time" is how many appointments may overlap -- leave it at 1 if one crew does every job.
      </p>

      <label className="block">
        <span className={labelClass}>Only allow these websites (optional, one per line)</span>
        <textarea
          rows={2}
          value={originsText}
          onChange={e => setOriginsText(e.target.value)}
          placeholder="https://www.yourbusiness.com"
          className={`${fieldClass} font-mono`}
        />
      </label>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="px-4 py-2 bg-[#315C9F] hover:bg-[#254A84] text-white rounded-xl text-xs font-bold font-sans cursor-pointer shadow-sm disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Online Booking Settings"}
      </button>

      {webFormToken && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-500">All-in-one website code (contact info + lead form + booking)</span>
            <button type="button" onClick={() => void copy(combinedSnippet, "combined")} className="px-2.5 py-1 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF] rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer">
              <Copy className="h-3 w-3" /> {copied === "combined" ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            One paste does it all: shows your business phone, email, address and hours (from Settings), then lets each visitor choose
            <strong> Book a time</strong> (books a real open slot as a Job) or <strong>Just contact me</strong> (creates a normal Lead, same as the lead form above).
            {!(config.enabled && config.websiteEnabled) && " Website booking is currently off, so this will show only the contact form until you turn it on and save."}
            {" "}Use this instead of the separate lead-form code, not alongside it.
          </p>
          <textarea readOnly value={combinedSnippet} rows={4} onFocus={e => e.target.select()} className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-lg text-[10px] font-mono text-slate-700" />
        </div>
      )}

      {config.enabled && config.websiteEnabled && (
        webFormToken ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-500">Booking calendar only (embed code)</span>
              <button type="button" onClick={() => void copy(embedSnippet, "embed")} className="px-2.5 py-1 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF] rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer">
                <Copy className="h-3 w-3" /> {copied === "embed" ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-[10px] text-slate-500">Paste this where the booking calendar should appear on your website (Wix, Squarespace, WordPress custom HTML, or any site). Save your settings first.</p>
            <textarea readOnly value={embedSnippet} rows={4} onFocus={e => e.target.select()} className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-lg text-[10px] font-mono text-slate-700" />
            <details className="text-[10px] text-slate-600">
              <summary className="cursor-pointer font-bold text-slate-500 uppercase">Developer API / webhook reference</summary>
              <div className="flex justify-end mt-1">
                <button type="button" onClick={() => void copy(apiReference, "api")} className="px-2 py-0.5 bg-white border border-[#A9CDEE] rounded text-[10px] font-bold text-[#315C9F] cursor-pointer">
                  {copied === "api" ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="mt-1 whitespace-pre-wrap break-all bg-white border border-[#A9CDEE] rounded-lg p-2 font-mono text-[9.5px]">{apiReference}</pre>
            </details>
          </div>
        ) : (
          <p className="text-[10.5px] text-slate-600">Generate the embed code above first -- website booking uses the same secure token as your lead form.</p>
        )
      )}
    </div>
  );
}
