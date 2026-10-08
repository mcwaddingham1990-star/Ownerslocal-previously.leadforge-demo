import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection";
import type { MissedCallEvent } from "../types/domain";
import { PhoneMissed, PhoneIncoming, PhoneOutgoing, Download, Smartphone, MessageCircle, UserPlus, Apple } from "lucide-react";

// Served from public/downloads (copied there from missed-call-text-back-app's build).
const APK_URL = "/downloads/MissedCallTextBack.apk";
const APK_VERSION = "3.1";

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const STEPS = [
  "Download and open the file on your Android phone. If asked, allow your browser to install apps.",
  "Open Missed Call Text-Back and sign in with this same OwnersLOCAL login.",
  "Tap Allow on each item in the app's Setup list.",
  "Write your auto-reply message and pick any calling apps you use (Google Voice, TextNow…) right in the app.",
  "Long-press your home screen → Widgets → Missed Call Text-Back to add the pulse widget. Tap it for your notifications, missed calls & texts, and team messages.",
];

/**
 * Missed Call Text-Back is a standalone Android app: every setting lives in
 * that app, which runs on its own in the background. This page only offers
 * the download and shows the calls the app has logged.
 */
export const MissedCallTextBackPage: React.FC = () => {
  const { businessId } = useAuth();
  const { customers, leads } = useDomainData();
  const onIPhone = isIOS();

  const [callEvents] = useFirestoreCollection<MissedCallEvent>("missed_call_events", businessId);
  const sortedCallEvents = useMemo(
    () => [...callEvents].sort((a, b) => b.callTimestamp.localeCompare(a.callTimestamp)),
    [callEvents]
  );
  const matchLabel = (event: MissedCallEvent): string => {
    if (event.customerId) {
      const match = customers.find((c) => c.id === event.customerId);
      return match ? `Customer: ${match.contact || match.company}` : "Matched customer";
    }
    if (event.leadId) {
      const match = leads.find((l) => l.id === event.leadId);
      const name = match ? match.name : "";
      return event.createdNewLead ? `New lead created${name ? `: ${name}` : ""}` : `Lead: ${name || "matched"}`;
    }
    return "No match found";
  };

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
            Texts people back automatically when you miss their call. Android app.
          </p>
        </div>
      </div>

      <div className="bg-[#E3F3FF] p-5 rounded-2xl border border-[#A9CDEE] space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-[#315C9F]" />
          <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Download for Android</h3>
        </div>

        {onIPhone && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3">
            <Apple className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-[11px] font-sans leading-relaxed">
              This app is Android only. Apple doesn't let iPhone apps see missed calls or send texts on their own,
              including calls through Google Voice or TextNow. Open this page on an Android phone to install it.
            </p>
          </div>
        )}

        <a
          href={APK_URL}
          download="MissedCallTextBack.apk"
          className="flex items-center justify-center gap-2 w-full sm:w-auto sm:inline-flex px-5 py-3 bg-[#315C9F] hover:bg-[#254A84] text-white rounded-xl text-sm font-bold font-sans shadow-sm"
        >
          <Download className="h-4 w-4" />
          Download APK for Android
        </a>
        <p className="text-[10.5px] text-slate-500 font-sans">Version {APK_VERSION} · Android 8.0 or newer</p>

        <ol className="list-decimal pl-5 space-y-1.5 text-[11px] text-slate-600 font-sans leading-relaxed">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="text-[11px] text-slate-600 font-sans leading-relaxed">
          Once it's set up, it works by itself. It catches calls while your phone is asleep or in use, even when this
          website and the OwnersLOCAL app are closed. All settings are in the Android app.
        </p>
      </div>

      <div className="bg-[#E3F3FF] p-4.5 rounded-2xl border border-[#A9CDEE] space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-[#315C9F]" />
          <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">
            Call Log ({sortedCallEvents.length})
          </h3>
        </div>
        <div className="bg-white rounded-xl border border-[#A9CDEE] divide-y divide-[#A9CDEE]/60 max-h-96 overflow-y-auto">
          {sortedCallEvents.length === 0 ? (
            <p className="text-[11px] text-slate-500 font-sans p-3">
              No calls yet. They'll show up here once the Android app is installed and signed in.
            </p>
          ) : (
            sortedCallEvents.map((event) => (
              <div key={event.id} className="p-2.5 flex items-start gap-2.5 text-xs font-sans">
                {event.direction === "missed" && <PhoneMissed className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />}
                {event.direction === "incoming" && <PhoneIncoming className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />}
                {event.direction === "outgoing" && <PhoneOutgoing className="w-3.5 h-3.5 text-[#315C9F] shrink-0 mt-0.5" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 font-mono">{event.phoneNumber}</span>
                    <span className="text-[9px] font-semibold text-slate-400 shrink-0">{event.callTimestamp}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                    {event.createdNewLead && <UserPlus className="w-3 h-3 text-amber-600 shrink-0" />}
                    {matchLabel(event)}
                  </div>
                  {event.autoReplySent && event.autoReplyMessage && (
                    <p className="text-[10px] text-slate-500 italic mt-1">Texted back: "{event.autoReplyMessage}"</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default MissedCallTextBackPage;
