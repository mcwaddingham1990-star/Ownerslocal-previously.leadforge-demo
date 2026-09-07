import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { PhoneMissed, Smartphone, Info } from "lucide-react";

const DEFAULT_MESSAGE = "Sorry we missed your call! We'll get back to you shortly.";

// Mirrors KnownCallingApps.ENTRIES in the companion Android app exactly (label + package name),
// so a package name checked here matches what that app already knows how to watch for.
const KNOWN_APPS: { label: string; packageName: string }[] = [
  { label: "Google Voice", packageName: "com.google.android.apps.googlevoice" },
  { label: "TextNow", packageName: "com.enflick.android.TextNow" },
  { label: "WhatsApp", packageName: "com.whatsapp" },
  { label: "Telegram", packageName: "org.telegram.messenger" },
  { label: "Skype", packageName: "com.skype.raider" },
  { label: "Facebook Messenger", packageName: "com.facebook.orca" },
  { label: "Viber", packageName: "com.viber.voip" }
];

export const MissedCallTextBackPage: React.FC = () => {
  const { loggedInUser, simulatedRole, businessId } = useAuth();
  const { triggerNotification } = useNavTelemetry();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const isAuthorized = activeRole === "Owner" || activeRole === "Office Manager" || activeRole === "Manager" || activeRole === "General Manager";

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_MESSAGE);
  const [watchedKnownApps, setWatchedKnownApps] = useState<Set<string>>(new Set());
  const [customPackages, setCustomPackages] = useState("");

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "missed_call_settings", businessId));
        if (cancelled || !snap.exists()) {
          setIsLoading(false);
          return;
        }
        const data = snap.data();
        if (typeof data.enabled === "boolean") setEnabled(data.enabled);
        if (typeof data.messageTemplate === "string" && data.messageTemplate) setMessageTemplate(data.messageTemplate);
        const watchedPackages: string[] = Array.isArray(data.watchedPackages) ? data.watchedPackages : [];
        const knownPackageNames = new Set(KNOWN_APPS.map((a) => a.packageName));
        setWatchedKnownApps(new Set(watchedPackages.filter((p) => knownPackageNames.has(p))));
        setCustomPackages(watchedPackages.filter((p) => !knownPackageNames.has(p)).join(", "));
      } catch (err) {
        console.error("Error loading missed-call settings:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const toggleKnownApp = (packageName: string) => {
    setWatchedKnownApps((prev) => {
      const next = new Set(prev);
      if (next.has(packageName)) next.delete(packageName);
      else next.add(packageName);
      return next;
    });
  };

  const handleSave = async () => {
    if (!businessId) {
      triggerNotification("Missing business account — please sign in again.");
      return;
    }
    if (!isAuthorized) {
      triggerNotification("🚫 Only Owners and Managers can change these settings.");
      return;
    }
    const watchedPackages = [
      ...Array.from(watchedKnownApps),
      ...customPackages.split(",").map((p) => p.trim()).filter(Boolean)
    ];
    setIsSaving(true);
    try {
      await setDoc(
        doc(db, "missed_call_settings", businessId),
        { enabled, messageTemplate: messageTemplate || DEFAULT_MESSAGE, watchedPackages },
        { merge: true }
      );
      triggerNotification("💾 Saved. The companion Android app will pick this up next time it syncs.");
    } catch (err) {
      console.error("Error saving missed-call settings:", err);
      triggerNotification("Couldn't save settings — check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm text-left animate-fade-in">
        <p className="text-xs text-slate-500 font-sans font-semibold">Loading…</p>
      </div>
    );
  }

  return (
    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-6 animate-fade-in text-left">
      <div className="bg-[#E3F3FF] p-6 rounded-2xl border border-[#A9CDEE] flex items-center gap-2.5">
        <span className="p-1.5 bg-[#C7E3FB] text-[#342D7E] rounded-xl border border-[#A9CDEE]">
          <PhoneMissed className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
            Missed Call Text-Back
          </h1>
          <p className="text-xs text-slate-500 font-sans font-medium">
            Configure the auto-reply your companion Android app sends when you miss a call.
          </p>
        </div>
      </div>

      <div className="bg-[#E3F3FF] p-4 rounded-2xl border border-[#A9CDEE] flex items-start gap-2.5">
        <Info className="h-4 w-4 text-[#315C9F] mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-slate-600 font-sans leading-relaxed">
          This page only stores settings. Actually detecting a missed call and sending the text
          happens on your phone, in the separate <strong>Missed Call Text-Back</strong> Android
          app installed there — it reads these settings when you sign in with this same account
          and tap "Sync Now" (or automatically each time you open it). Nothing here works without
          that app installed and its phone/SMS permissions granted.
        </p>
      </div>

      {!isAuthorized && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs font-sans font-semibold rounded-xl p-3">
          You can view these settings, but only an Owner or Manager can change them.
        </div>
      )}

      <div className="bg-[#E3F3FF] p-4.5 rounded-2xl border border-[#A9CDEE] space-y-4">
        <label className="flex items-center gap-2.5 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!isAuthorized}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-[#A9CDEE] text-[#315C9F]"
          />
          <span className="text-xs font-bold text-slate-800 font-sans">
            Enable auto text-back on missed calls
          </span>
        </label>

        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
            Message to send
          </label>
          <textarea
            value={messageTemplate}
            disabled={!isAuthorized}
            onChange={(e) => setMessageTemplate(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs font-sans disabled:opacity-60"
          />
        </div>
      </div>

      <div className="bg-[#E3F3FF] p-4.5 rounded-2xl border border-[#A9CDEE] space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-[#315C9F]" />
          <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">
            Also catch missed calls from these apps
          </h3>
        </div>
        <p className="text-[11px] text-slate-500 font-sans leading-relaxed">
          TextNow, Google Voice, WhatsApp, and similar apps route calls entirely inside
          themselves, so the phone app catches them by reading that app's own missed-call
          notification. Only works when that notification actually contains a phone number.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {KNOWN_APPS.map((app) => (
            <label key={app.packageName} className="flex items-center gap-2 cursor-pointer text-xs font-sans text-slate-700">
              <input
                type="checkbox"
                checked={watchedKnownApps.has(app.packageName)}
                disabled={!isAuthorized}
                onChange={() => toggleKnownApp(app.packageName)}
                className="h-4 w-4 rounded border-[#A9CDEE] text-[#315C9F]"
              />
              {app.label}
            </label>
          ))}
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
            Other app package names (comma-separated)
          </label>
          <input
            type="text"
            value={customPackages}
            disabled={!isAuthorized}
            onChange={(e) => setCustomPackages(e.target.value)}
            placeholder="e.g. com.example.callingapp"
            className="w-full px-3 py-1.5 bg-white border border-[#A9CDEE] rounded-lg text-xs font-mono disabled:opacity-60"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!isAuthorized || isSaving}
          className="px-4 py-1.5 bg-[#315C9F] hover:bg-[#254A84] text-white rounded-xl text-xs font-bold font-sans cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
};

export default MissedCallTextBackPage;
