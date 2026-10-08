import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, CheckCircle2, ChevronDown, ChevronUp, Loader2, Mic, MicOff, Send, Sparkles, Square, X } from "lucide-react";
import { useDomainData } from "../context/DomainDataContext";
import { authedFetch } from "../lib/apiClient";
import { downscaleImageToBase64 } from "../lib/imageCompression";
import { composeSms } from "../lib/deviceHandoff";
import { jobDisplayNumber } from "../lib/ownerProtection";
import {
  PHOTO_CATEGORIES, PHOTO_CATEGORY_LABEL, PROPOSAL_TITLE, buildProposals, describeEffect, todayContext,
  type CapturedPhoto, type PhotoCategory, type PhotoExtraction, type Proposal, type VoiceExtraction
} from "../lib/noTapEntry";
import { useNoTapEntry, type NoTapResult } from "../hooks/useNoTapEntry";
import { useProtectionActions, useProtectionSources } from "../hooks/useOwnerProtection";
import type { SchedulingEvent } from "../types/domain";

const MAX_SECONDS = 180;
type Phase = "capture" | "organizing" | "review" | "saving" | "done";

/** The prominent entry point inside a Job. */
export const NoTapEntryLauncher: React.FC<{ job: SchedulingEvent }> = ({ job }) => {
  const [open, setOpen] = useState<null | "voice" | "photos">(null);
  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-[#315C9F] bg-gradient-to-br from-[#315C9F] to-[#1F3557] p-4 text-white shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#9EC8EF]">No Tap Info Entry</p>
            <p className="text-sm font-black leading-tight">Talk or snap photos. We'll file it.</p>
            <p className="mt-0.5 text-[11px] text-[#C7E3FA]">Work done, materials, follow-ups, approvals and photos go straight to this job.</p>
          </div>
          <button onClick={() => setOpen("voice")} aria-label="Start No Tap Info Entry" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-[#315C9F] shadow-lg ring-4 ring-white/25 active:scale-95">
            <Mic className="h-8 w-8" />
          </button>
        </div>
        <button onClick={() => setOpen("photos")} className="mt-3 w-full rounded-xl bg-white/15 px-3 py-2 text-xs font-bold hover:bg-white/25">
          <Camera className="mr-1.5 inline h-4 w-4" />Snap job photos
        </button>
      </section>
      {open && <NoTapEntrySheet job={job} start={open} onClose={() => setOpen(null)} />}
    </>
  );
};

const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await authedFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 429 ? "Too many requests right now. Wait a minute and try again." : json?.error || `Request failed (${res.status})`);
  return json as T;
}

export const NoTapEntrySheet: React.FC<{ job: SchedulingEvent; start: "voice" | "photos"; onClose: () => void }> = ({ job, start, onClose }) => {
  const data = useDomainData();
  const { base } = useProtectionSources();
  const plan = base.completionPlans.find(p => p.jobId === job.id);
  const { apply, caps, allowed } = useNoTapEntry(job, plan);
  const { run } = useProtectionActions();
  const number = jobDisplayNumber(job);

  const [phase, setPhase] = useState<Phase>("capture");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [audio, setAudio] = useState<{ blob: Blob; mime: string } | null>(null);
  const [typed, setTyped] = useState("");
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceExtraction | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [result, setResult] = useState<NoTapResult | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const meterRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);

  const context = useMemo(() => ({
    jobTitle: job.title || job.customType, customer: job.customer, jobDescription: job.description || job.notes,
    jobStatus: job.status, assignedEmployee: job.assignedEmployee, today: todayContext(),
    inventory: data.inventoryList.map(i => ({ id: i.id, name: i.name, unit: i.unit })),
  }), [job, data.inventoryList]);

  // ---------------------------------------------------------------- recording

  const stopMeter = () => {
    if (meterRef.current) { cancelAnimationFrame(meterRef.current.raf); void meterRef.current.ctx.close(); meterRef.current = null; }
    setLevel(0);
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find(t => (window as any).MediaRecorder?.isTypeSupported?.(t)) || "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || "audio/webm";
        setAudio({ blob: new Blob(chunksRef.current, { type }), mime: type.split(";")[0] });
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds(s => {
        if (s + 1 >= MAX_SECONDS) stopRecording();
        return s + 1;
      }), 1000);
      // Live level meter so the technician can see it's hearing them.
      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 64));
          if (meterRef.current) meterRef.current.raf = requestAnimationFrame(tick);
        };
        meterRef.current = { ctx, raf: requestAnimationFrame(tick) };
      } catch { /* meter is cosmetic */ }
    } catch (e) {
      setError("Couldn't use the microphone. Allow microphone access for this site, or type your update below.");
    }
  };

  function stopRecording() {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    stopMeter();
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    stopMeter();
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (start === "voice") void startRecording();
    else setTimeout(() => photoInput.current?.click(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- photos

  const analyzePhoto = async (photo: CapturedPhoto) => {
    try {
      const [, b64] = photo.dataUrl.split(",");
      const analysis = await postJson<PhotoExtraction>("/api/ai/job-photo-entry", { context, imageBase64: b64, mimeType: photo.dataUrl.slice(5, photo.dataUrl.indexOf(";")) });
      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, status: "done", analysis, category: analysis.category } : p));
    } catch {
      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, status: "failed" } : p));
    }
  };

  const onPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from<File>(e.target.files ?? []).filter(f => f.type.startsWith("image/"));
    e.target.value = "";
    const added: CapturedPhoto[] = [];
    for (const file of files) {
      try {
        const { base64, mimeType } = await downscaleImageToBase64(file, 1280, 0.75);
        added.push({ id: `ph_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, dataUrl: `data:${mimeType};base64,${base64}`, fileName: file.name || "photo.jpg", takenAt: file.lastModified || Date.now(), status: "analyzing", category: "other" });
      } catch { setError("One of the photos couldn't be read."); }
    }
    setPhotos(prev => [...prev, ...added]);
    // Two at a time keeps it quick without tripping the per-minute AI limit.
    const queue = [...added];
    await Promise.all([0, 1].map(async () => { while (queue.length) await analyzePhoto(queue.shift()!); }));
  };

  const setPhotoCategory = (id: string, category: PhotoCategory) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, category } : p));
    setEditingPhoto(null);
  };

  // ---------------------------------------------------------------- organize / save

  const photosBusy = photos.some(p => p.status === "analyzing");
  const hasInput = !!audio || typed.trim().length > 0 || photos.length > 0;

  const organize = async () => {
    setError(null);
    if (recording) stopRecording();
    setPhase("organizing");
    try {
      let extraction: VoiceExtraction | null = null;
      const recorded = audio;
      if (recorded || typed.trim()) {
        extraction = await postJson<VoiceExtraction>("/api/ai/job-voice-entry", {
          context,
          transcript: typed.trim() || undefined,
          ...(recorded ? { audioBase64: await blobToBase64(recorded.blob), mimeType: recorded.mime } : {}),
        });
      }
      while (photosRef.current.some(p => p.status === "analyzing")) await new Promise(r => setTimeout(r, 300));
      setVoice(extraction);
      setProposals(buildProposals(extraction, photosRef.current, data.inventoryList));
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't organize that.");
      setPhase("capture");
    }
  };
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // If the recording finished while "Organize" was waiting, re-run once audio exists.
  const pendingOrganize = useRef(false);
  const organizeClick = () => {
    if (recording) { pendingOrganize.current = true; stopRecording(); return; }
    void organize();
  };
  useEffect(() => {
    if (audio && pendingOrganize.current) { pendingOrganize.current = false; void organize(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio]);

  /** AI unavailable: still keep what was typed as a plain job note (manual entry). */
  const saveAsNote = () => {
    const text = [typed.trim(), voice?.transcript].filter(Boolean)[0];
    if (!text) return;
    setProposals([{ id: "note_fallback", kind: "notes", text, selected: true, needs: ["job"] }]);
    setPhase("review");
  };

  const update = (id: string, patch: Partial<Proposal>) => setProposals(prev => prev.map(p => p.id === id ? ({ ...p, ...patch } as Proposal) : p));

  const save = async () => {
    setPhase("saving");
    try {
      setResult(await apply(proposals, photos, voice?.transcript || typed));
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed.");
      setPhase("review");
    }
  };

  const selectedCount = proposals.filter(p => p.selected).length + photos.length;
  const effectOpts = { canDeduct: caps.inventory, hasTracking: caps.tracking };

  // ---------------------------------------------------------------- render

  return (
    <div className="fixed inset-0 z-[160] flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="No Tap Info Entry">
      <div className="flex h-[100dvh] w-full flex-col bg-[#F5FAFF] text-left sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-3xl sm:shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[#9EC8EF] bg-[#C7E3FA] px-4 py-3 sm:rounded-t-3xl">
          <Sparkles className="h-5 w-5 text-[#315C9F]" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#315C9F]">No Tap Info Entry · {number}</p>
            <p className="truncate text-sm font-black text-[#1F3557]">{phase === "review" ? "Review & Save" : phase === "done" ? "Saved" : job.title || job.customer}</p>
          </div>
          <button onClick={() => { if (recording) stopRecording(); onClose(); }} aria-label="Close" className="rounded-full p-2 hover:bg-white"><X className="h-5 w-5" /></button>
        </div>
        <input ref={photoInput} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => void onPhotos(e)} />

        <div className="flex-1 overflow-y-auto p-4">
          {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertTriangle className="mr-1 inline h-4 w-4" />{error}</div>}

          {phase === "capture" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-2">
                <button
                  onClick={() => (recording ? stopRecording() : void startRecording())}
                  aria-label={recording ? "Stop recording" : "Start recording"}
                  className={`relative flex h-28 w-28 items-center justify-center rounded-full text-white shadow-xl transition active:scale-95 ${recording ? "bg-rose-600" : "bg-[#315C9F]"}`}
                  style={recording ? { boxShadow: `0 0 0 ${8 + level * 22}px rgba(225,29,72,${0.18 + level * 0.2})` } : undefined}
                >
                  {recording ? <Square className="h-10 w-10" /> : <Mic className="h-12 w-12" />}
                </button>
                <p className="mt-3 text-sm font-black text-[#1F3557]">
                  {recording ? `Listening… ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : audio ? "Recording saved. Tap the mic to redo it." : "Tap and talk"}
                </p>
                <p className="mt-1 max-w-xs text-center text-[11px] text-[#5E7393]">
                  e.g. "Finished the upstairs bathroom, replaced two valves, used six feet of PEX, customer wants us back Tuesday for the downstairs faucet, and she approved another $180."
                </p>
              </div>

              <label className="block">
                <span className="text-[10px] font-bold uppercase text-[#5E7393]">Or type it</span>
                <textarea value={typed} onChange={e => setTyped(e.target.value)} rows={3} placeholder="Type what was done, used, requested or approved…" className="mt-1 w-full rounded-xl border border-[#9EC8EF] bg-white p-3 text-sm text-[#1F3557] outline-none focus:ring-2 focus:ring-[#315C9F]" />
              </label>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-[#5E7393]">Photos ({photos.length})</span>
                  <button onClick={() => photoInput.current?.click()} className="rounded-lg border border-[#9EC8EF] bg-white px-3 py-1.5 text-xs font-bold text-[#315C9F]"><Camera className="mr-1 inline h-4 w-4" />Add photos</button>
                </div>
                <PhotoGrid photos={photos} editing={editingPhoto} onEdit={setEditingPhoto} onSet={setPhotoCategory} onRemove={id => setPhotos(prev => prev.filter(p => p.id !== id))} />
              </div>
            </div>
          )}

          {(phase === "organizing" || phase === "saving") && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-[#315C9F]" />
              <p className="mt-3 text-sm font-black text-[#1F3557]">{phase === "saving" ? "Saving to the job…" : photosBusy ? "Reading your photos…" : "Organizing what you said…"}</p>
            </div>
          )}

          {phase === "review" && (
            <div className="space-y-3">
              {voice?.transcript && (
                <div className="rounded-xl border border-[#9EC8EF] bg-white p-3">
                  <button onClick={() => setShowTranscript(v => !v)} className="flex w-full items-center justify-between text-[10px] font-black uppercase text-[#5E7393]">
                    What we heard {showTranscript ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {showTranscript && <p className="mt-2 text-xs italic text-slate-600">"{voice.transcript}"</p>}
                </div>
              )}
              {!proposals.length && !photos.length && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Nothing to file was found. Go back and add more detail, or save it as a plain note.
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => setPhase("capture")} className="rounded-lg bg-white px-3 py-1.5 font-bold text-[#315C9F]">Go back</button>
                    {(typed.trim() || voice?.transcript) && <button onClick={saveAsNote} className="rounded-lg bg-[#315C9F] px-3 py-1.5 font-bold text-white">Save as note</button>}
                  </div>
                </div>
              )}
              {proposals.map(p => (
                <ProposalCard key={p.id} p={p} canDo={allowed(p)} effect={describeEffect(p, effectOpts)} inventory={data.inventoryList} onChange={patch => update(p.id, patch)} />
              ))}
              {photos.length > 0 && (
                <div className="rounded-xl border border-[#9EC8EF] bg-white p-3">
                  <p className="text-xs font-black text-[#1F3557]">Photos ({photos.length})</p>
                  <p className="text-[11px] text-slate-500">{caps.documents ? `Filed to this job's documents${caps.tracking ? ", Job Tracking" : ""} and Proof Timeline. Tap a label to change it.` : "Your role can't add documents, so these won't be saved."}</p>
                  <PhotoGrid photos={photos} editing={editingPhoto} onEdit={setEditingPhoto} onSet={setPhotoCategory} />
                </div>
              )}
            </div>
          )}

          {phase === "done" && result && (
            <div className="space-y-3">
              <div className="flex flex-col items-center py-4 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <p className="mt-2 text-sm font-black text-[#1F3557]">Saved to {number}</p>
              </div>
              {result.done.length > 0 && <ResultList title="Done" items={result.done} tone="text-emerald-700" />}
              {result.sentToManager.length > 0 && <ResultList title="Sent to a manager" items={result.sentToManager} tone="text-[#315C9F]" />}
              {result.skipped.length > 0 && <ResultList title="Not saved" items={result.skipped} tone="text-amber-700" />}
              <div className="space-y-2">
                {result.changeOrderIds.map(id => (
                  <button key={id} onClick={() => { void run({ kind: "sign_change_order", label: "Get Signature", targetId: id }, job); onClose(); }} className="w-full rounded-xl bg-[#315C9F] px-4 py-3 text-sm font-black text-white">
                    Get the customer's signature on the change order
                  </button>
                ))}
                {result.followUps.filter(f => f.eventType === "Follow-Up" && job.customerPhone).map(f => (
                  <button key={f.id} onClick={() => composeSms({ to: job.customerPhone, body: `Hi ${job.customer.split(" ")[0]}, this is to confirm we'll be back on ${new Date(`${f.date}T${f.startTime}`).toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} for: ${f.title}.` })} className="w-full rounded-xl border border-[#315C9F] bg-white px-4 py-3 text-sm font-bold text-[#315C9F]">
                    <Send className="mr-1.5 inline h-4 w-4" />Text the customer about {f.date}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[#9EC8EF] bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-3xl">
          {phase === "capture" && (
            <button disabled={!hasInput && !recording} onClick={organizeClick} className="w-full rounded-2xl bg-[#315C9F] py-3.5 text-sm font-black text-white shadow disabled:opacity-40">
              {recording ? <><MicOff className="mr-1.5 inline h-4 w-4" />Stop & organize</> : <><Sparkles className="mr-1.5 inline h-4 w-4" />Organize it</>}
            </button>
          )}
          {phase === "review" && (
            <div className="flex gap-2">
              <button onClick={() => setPhase("capture")} className="rounded-2xl border border-[#9EC8EF] px-4 py-3.5 text-sm font-bold text-[#315C9F]">Back</button>
              <button disabled={!selectedCount} onClick={() => void save()} className="flex-1 rounded-2xl bg-emerald-600 py-3.5 text-sm font-black text-white shadow disabled:opacity-40">
                <Check className="mr-1.5 inline h-4 w-4" />Save {selectedCount} item{selectedCount === 1 ? "" : "s"}
              </button>
            </div>
          )}
          {phase === "done" && <button onClick={onClose} className="w-full rounded-2xl bg-[#315C9F] py-3.5 text-sm font-black text-white">Done</button>}
        </div>
      </div>
    </div>
  );
};

const ResultList: React.FC<{ title: string; items: string[]; tone: string }> = ({ title, items, tone }) => (
  <div className="rounded-xl border border-[#9EC8EF] bg-white p-3">
    <p className={`text-[10px] font-black uppercase ${tone}`}>{title}</p>
    <ul className="mt-1 space-y-1">{items.map((t, i) => <li key={i} className="whitespace-pre-line text-xs text-slate-700">• {t}</li>)}</ul>
  </div>
);

const PhotoGrid: React.FC<{ photos: CapturedPhoto[]; editing: string | null; onEdit: (id: string | null) => void; onSet: (id: string, c: PhotoCategory) => void; onRemove?: (id: string) => void }> = ({ photos, editing, onEdit, onSet, onRemove }) => (
  <div className="mt-2 grid grid-cols-3 gap-2">
    {photos.map(p => (
      <div key={p.id} className="relative overflow-hidden rounded-xl border border-[#9EC8EF] bg-white">
        <img src={p.dataUrl} alt={p.analysis?.caption || p.fileName} className="aspect-square w-full object-cover" />
        {onRemove && <button onClick={() => onRemove(p.id)} aria-label="Remove photo" className="absolute right-1 top-1 rounded-full bg-black/50 p-0.5 text-white"><X className="h-3.5 w-3.5" /></button>}
        <button onClick={() => onEdit(editing === p.id ? null : p.id)} className="block w-full truncate bg-[#EAF5FF] px-1 py-1 text-[10px] font-black text-[#315C9F]">
          {p.status === "analyzing" ? <><Loader2 className="mr-0.5 inline h-3 w-3 animate-spin" />Reading…</> : PHOTO_CATEGORY_LABEL[p.category]}
        </button>
        {(p.analysis?.modelNumber || p.analysis?.serialNumber || p.analysis?.receiptTotal != null) && (
          <p className="truncate px-1 pb-1 text-[9px] text-slate-500">{[p.analysis?.modelNumber && `M ${p.analysis.modelNumber}`, p.analysis?.serialNumber && `S ${p.analysis.serialNumber}`, p.analysis?.receiptTotal != null && `$${p.analysis.receiptTotal.toFixed(2)}`].filter(Boolean).join(" · ")}</p>
        )}
      </div>
    ))}
    {editing && (
      <div className="col-span-3 flex flex-wrap gap-1.5 rounded-xl border border-[#9EC8EF] bg-white p-2">
        {PHOTO_CATEGORIES.map(c => (
          <button key={c} onClick={() => onSet(editing, c)} className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${photos.find(p => p.id === editing)?.category === c ? "border-[#315C9F] bg-[#315C9F] text-white" : "border-[#9EC8EF] text-[#315C9F]"}`}>{PHOTO_CATEGORY_LABEL[c]}</button>
        ))}
      </div>
    )}
  </div>
);

const input = "w-full rounded-lg border border-[#9EC8EF] bg-white px-2.5 py-2 text-sm text-[#1F3557] outline-none focus:ring-2 focus:ring-[#315C9F]";

const ProposalCard: React.FC<{ p: Proposal; canDo: boolean; effect: string; inventory: { id: string; name: string; quantity: number; unit: string }[]; onChange: (patch: Partial<Proposal>) => void }> = ({ p, canDo, effect, inventory, onChange }) => (
  <div className={`rounded-xl border p-3 ${p.selected ? "border-[#315C9F] bg-white" : "border-[#D6E8F8] bg-white/60"}`}>
    <label className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" checked={p.selected} onChange={e => onChange({ selected: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#9EC8EF] text-[#315C9F]" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black text-[#1F3557]">{PROPOSAL_TITLE[p.kind]}{p.kind === "material" && p.fromReceipt ? " (seen in a photo)" : ""}</p>
        <p className="text-[11px] text-slate-500">{canDo ? effect : "You can't do this directly, so it'll be sent to a manager."}</p>
      </div>
    </label>
    {p.selected && (
      <div className="mt-2 space-y-2 pl-7">
        {(p.kind === "work" || p.kind === "notes" || p.kind === "equipment") && <textarea value={p.text} onChange={e => onChange({ text: e.target.value } as any)} rows={2} className={input} />}
        {p.kind === "material" && <>
          <input value={p.name} onChange={e => onChange({ name: e.target.value } as any)} className={input} aria-label="Material" />
          <div className="grid grid-cols-[80px_80px_1fr] gap-2">
            <input type="number" min={0} step="any" value={p.quantity} onChange={e => onChange({ quantity: Number(e.target.value) } as any)} className={input} aria-label="Quantity" />
            <input value={p.unit} onChange={e => onChange({ unit: e.target.value } as any)} placeholder="unit" className={input} aria-label="Unit" />
            <select value={p.inventoryId || ""} onChange={e => onChange({ inventoryId: e.target.value || null } as any)} className={input} aria-label="Inventory item">
              <option value="">Not in inventory</option>
              {inventory.map(i => <option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit})</option>)}
            </select>
          </div>
        </>}
        {p.kind === "followup" && <>
          <input value={p.description} onChange={e => onChange({ description: e.target.value } as any)} className={input} aria-label="Follow-up" />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={p.date} onChange={e => onChange({ date: e.target.value } as any)} className={input} aria-label="Date" />
            <input type="time" value={p.time} onChange={e => onChange({ time: e.target.value } as any)} className={input} aria-label="Time" />
          </div>
          {!p.date && <p className="text-[11px] font-bold text-amber-700">Pick a date to schedule it.</p>}
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600"><input type="checkbox" checked={p.appointment} onChange={e => onChange({ appointment: e.target.checked } as any)} />Customer appointment (otherwise an internal task)</label>
        </>}
        {p.kind === "change_order" && <>
          <input value={p.description} onChange={e => onChange({ description: e.target.value } as any)} className={input} aria-label="Change order description" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-500">$</span>
            <input type="number" min={0} step="any" value={p.amount} onChange={e => onChange({ amount: Number(e.target.value) } as any)} className={input} aria-label="Amount" />
          </div>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600"><input type="checkbox" checked={p.approved} onChange={e => onChange({ approved: e.target.checked } as any)} />Customer approved it verbally</label>
        </>}
        {p.kind === "part_order" && <div className="grid grid-cols-[1fr_80px] gap-2">
          <input value={p.name} onChange={e => onChange({ name: e.target.value } as any)} className={input} aria-label="Part" />
          <input type="number" min={0} value={p.quantity ?? ""} onChange={e => onChange({ quantity: e.target.value ? Number(e.target.value) : null } as any)} placeholder="qty" className={input} aria-label="Quantity" />
        </div>}
        {p.kind === "issue" && <textarea value={p.description} onChange={e => onChange({ description: e.target.value } as any)} rows={2} className={input} />}
        {p.kind === "expense" && <div className="grid grid-cols-[1fr_100px] gap-2">
          <input value={p.vendor} onChange={e => onChange({ vendor: e.target.value } as any)} className={input} aria-label="Vendor" />
          <input type="number" min={0} step="0.01" value={p.amount} onChange={e => onChange({ amount: Number(e.target.value) } as any)} className={input} aria-label="Amount" />
          <input type="date" value={p.date} onChange={e => onChange({ date: e.target.value } as any)} className={`${input} col-span-2`} aria-label="Date" />
        </div>}
      </div>
    )}
  </div>
);

export default NoTapEntryLauncher;
