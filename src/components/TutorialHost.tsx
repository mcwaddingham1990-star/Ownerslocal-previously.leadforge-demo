import React, { useEffect, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { TUTORIALS, GUIDE_INTRO } from "../lib/tutorials";
import { BookOpen, X } from "lucide-react";

/**
 * Page tutorials. Pops up the first time an account opens a page, until they
 * tick "Don't show this again" (closing without it hides it for the rest of
 * this browser session only). `openRequest` re-opens the current page's
 * tutorial on demand -- the sidebar's "Revisit Tutorial" button bumps it.
 *
 * "Don't show again" is per account (tutorial_progress/{uid}, so it follows
 * them to other devices) with a localStorage copy for an instant first
 * paint; screens with no account (sign-in, customer portal, remote signing)
 * remember it per device.
 */
interface TutorialHostProps {
  tutorialId: string | null | undefined;
  /** Firebase Auth uid; omit for screens without a signed-in account. */
  accountUid?: string | null;
  /** Increment to open the current page's tutorial regardless of "don't show again". */
  openRequest?: number;
}

const localKey = (uid?: string | null) => `ol_tutorials_dismissed:${uid || "device"}`;
const SESSION_KEY = "ol_tutorials_closed_this_session";

function readSet(storage: Storage | undefined, key: string): Set<string> {
  try {
    const raw = storage?.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSet(storage: Storage | undefined, key: string, value: Set<string>) {
  try {
    storage?.setItem(key, JSON.stringify([...value]));
  } catch {
    /* storage unavailable (private mode) -- fine, it just won't be remembered */
  }
}

const browserLocal = () => (typeof window !== "undefined" ? window.localStorage : undefined);
const browserSession = () => (typeof window !== "undefined" ? window.sessionStorage : undefined);

export const TutorialHost: React.FC<TutorialHostProps> = ({ tutorialId, accountUid, openRequest = 0 }) => {
  const [dismissed, setDismissed] = useState<Set<string>>(() => readSet(browserLocal(), localKey(accountUid)));
  const [ready, setReady] = useState(!accountUid);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const lastOpenRequest = useRef(openRequest);

  // Pull this account's saved choices so a new device doesn't re-show tutorials they already turned off.
  useEffect(() => {
    setDismissed(readSet(browserLocal(), localKey(accountUid)));
    if (!accountUid) {
      setReady(true);
      return;
    }
    setReady(false);
    let cancelled = false;
    const fallback = window.setTimeout(() => !cancelled && setReady(true), 2500);
    getDoc(doc(db, "tutorial_progress", accountUid))
      .then((snap) => {
        if (cancelled) return;
        const remote = snap.exists() ? (snap.data().dismissed as Record<string, boolean> | undefined) : undefined;
        if (remote) {
          setDismissed((prev) => {
            const merged = new Set<string>(prev);
            Object.entries(remote).forEach(([id, on]) => on && merged.add(id));
            writeSet(browserLocal(), localKey(accountUid), merged);
            return merged;
          });
        }
      })
      .catch(() => { /* offline or not yet allowed -- local copy still applies */ })
      .finally(() => {
        if (!cancelled) setReady(true);
        window.clearTimeout(fallback);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [accountUid]);

  // First visit to a page: show its tutorial unless turned off or already closed this session.
  useEffect(() => {
    if (!ready || !tutorialId || !TUTORIALS[tutorialId]) return;
    if (dismissed.has(tutorialId)) return;
    if (readSet(browserSession(), SESSION_KEY).has(tutorialId)) return;
    setDontShowAgain(false);
    setOpenId(tutorialId);
  }, [ready, tutorialId, dismissed]);

  // Leaving the page closes its tutorial.
  useEffect(() => {
    setOpenId((current) => (current && current !== tutorialId ? null : current));
  }, [tutorialId]);

  // "Revisit Tutorial" button.
  useEffect(() => {
    if (openRequest === lastOpenRequest.current) return;
    lastOpenRequest.current = openRequest;
    if (tutorialId && TUTORIALS[tutorialId]) {
      setDontShowAgain(dismissed.has(tutorialId));
      setOpenId(tutorialId);
    }
  }, [openRequest, tutorialId, dismissed]);

  const close = () => {
    if (!openId) return;
    const id = openId;
    setOpenId(null);

    const closedThisSession = readSet(browserSession(), SESSION_KEY);
    closedThisSession.add(id);
    writeSet(browserSession(), SESSION_KEY, closedThisSession);

    const wasDismissed = dismissed.has(id);
    if (dontShowAgain === wasDismissed) return;
    const next = new Set<string>(dismissed);
    if (dontShowAgain) next.add(id);
    else next.delete(id);
    setDismissed(next);
    writeSet(browserLocal(), localKey(accountUid), next);
    if (accountUid) {
      setDoc(
        doc(db, "tutorial_progress", accountUid),
        { dismissed: { [id]: dontShowAgain }, updatedAt: new Date().toISOString() },
        { merge: true }
      ).catch(() => { /* kept locally; syncs next time it's changed */ });
    }
  };

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!openId) return null;
  const tutorial = TUTORIALS[openId];
  if (!tutorial) return null;
  const paragraphs = openId === "dashboard" ? [...GUIDE_INTRO, ...tutorial.paragraphs] : tutorial.paragraphs;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[#1F3557]/40 backdrop-blur-[2px] p-4 animate-fade-in"
      onClick={close}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        className="w-full max-w-md max-h-[85vh] flex flex-col bg-[#E3F3FF] border-2 border-[#9EC8EF] rounded-3xl shadow-2xl text-left overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
          <span className="p-1.5 bg-[#C7E3FB] text-[#315C9F] rounded-xl border border-[#A9CDEE] shrink-0">
            <BookOpen className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-wider text-[#5E7393]">Tutorial</p>
            <h2 id="tutorial-title" className="text-base font-extrabold text-[#1F3557] leading-tight">{tutorial.title}</h2>
          </div>
          <button
            onClick={close}
            aria-label="Close tutorial"
            className="p-1.5 rounded-lg text-[#5E7393] hover:text-[#1F3557] hover:bg-[#C7E3FB] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-4 overflow-y-auto space-y-3">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-[13px] leading-relaxed text-[#1F3557] font-sans">{p}</p>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-[#A9CDEE] bg-[#D6ECFD] flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-[#1F3557]">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-4 w-4 rounded border-[#A9CDEE] text-[#315C9F]"
            />
            Don’t show this again
          </label>
          <button
            onClick={close}
            className="px-5 py-2 bg-[#315C9F] hover:bg-[#254A84] text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default TutorialHost;
