import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, AlertTriangle, CheckCircle2, Camera, X, ChevronLeft, ChevronRight, CalendarClock, MapPin, Wrench, Building2, Clock
} from "lucide-react";
import {
  formatBookingDate, formatSlotTime, newIdempotencyKey,
  type BookingApi, type BookingOptions, type BookingResult
} from "../lib/onlineBookingClient";
import type { BookingConfirmation, BookingDayAvailability } from "../types/onlineBooking";
import { downscaleImageToBase64 } from "../lib/imageCompression";

type Step = "service" | "time" | "details" | "review" | "confirmed";

const STEPS: Array<{ id: Exclude<Step, "confirmed">; label: string }> = [
  { id: "service", label: "Service" },
  { id: "time", label: "Date & Time" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review" }
];

const MAX_PHOTOS = 4;
const MAX_PHOTO_CHARS = 340_000;

const inputClass = "mt-1 w-full rounded-xl border border-[#9EC8EF] bg-white px-3 py-2.5 text-sm text-[#1F3557] focus:outline-none focus:ring-2 focus:ring-[#315C9F]/30";
const labelClass = "text-[10px] font-black uppercase tracking-wide text-[#5E7393]";
const primaryBtn = "flex items-center justify-center gap-1.5 rounded-xl bg-[#315C9F] hover:bg-[#1F3557] disabled:opacity-40 px-4 py-2.5 text-xs font-black text-white transition-colors";
// Inactive/secondary controls carry border-transparent: the workspace theme
// (index.css) renders those as light glass and every other button as the
// blue gradient -- the same convention the portal's own sidebar nav uses.
const secondaryBtn = "flex items-center justify-center gap-1.5 rounded-xl border border-transparent px-4 py-2.5 text-xs font-black text-[#315C9F] transition-colors";

async function compressForBooking(file: File): Promise<string> {
  for (const [dimension, quality] of [[1200, 0.72], [900, 0.62], [700, 0.55]] as const) {
    const { base64, mimeType } = await downscaleImageToBase64(file, dimension, quality);
    const dataUrl = `data:${mimeType};base64,${base64}`;
    if (dataUrl.length <= MAX_PHOTO_CHARS) return dataUrl;
  }
  throw new Error("too large");
}

/**
 * Book Service -- the Customer Portal's online-booking flow. Rendered by
 * both the token portal (CustomerPortalPage) and the signed-in Customer
 * Account app (CustomerAppShell) with their own BookingApi adapter; every
 * slot shown and every booking made is computed/validated server-side by
 * server/onlineBooking.ts against the business's live Scheduling data.
 */
export default function BookServiceFlow({ api, onBooked, onViewAppointments }: {
  api: BookingApi;
  onBooked?: (confirmation: BookingConfirmation) => void;
  onViewAppointments?: () => void;
}) {
  const [options, setOptions] = useState<BookingOptions | null>(null);
  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState("");
  const [days, setDays] = useState<BookingDayAvailability[] | null>(null);
  const [windowFrom, setWindowFrom] = useState<string>("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedStart, setSelectedStart] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const idempotencyKeyRef = useRef(newIdempotencyKey());
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getOptions().then(result => {
      if (cancelled) return;
      setOptions(result);
      if (result.ok) {
        if (result.services?.length === 1) setServiceId(result.services[0].id);
        setAddress(result.customer?.address || "");
        setName(result.customer?.name || "");
        setPhone(result.customer?.phone || "");
        setEmail(result.customer?.email || "");
      }
    });
    return () => { cancelled = true; };
  }, [api]);

  const service = useMemo(() => options?.services?.find(s => s.id === serviceId), [options, serviceId]);

  const loadSlots = useCallback(async (from: string) => {
    if (!serviceId) return;
    setLoadingSlots(true);
    const result = await api.getAvailability(serviceId, from, 7);
    setLoadingSlots(false);
    if (!result.ok) { setError(result.error || "Could not load available times."); setDays([]); return; }
    setError("");
    const loaded = result.days || [];
    setDays(loaded);
    setWindowFrom(loaded[0]?.date || from);
    const firstOpen = loaded.find(d => d.slots.length);
    setSelectedDate(current => loaded.some(d => d.date === current && d.slots.length) ? current : firstOpen?.date || loaded[0]?.date || "");
  }, [api, serviceId]);

  useEffect(() => {
    if (step === "time" && days === null) void loadSlots("");
  }, [step, days, loadSlots]);

  const applyRefreshedAvailability = (result: BookingResult) => {
    if (result.availability) {
      setDays(result.availability);
      setWindowFrom(result.availability[0]?.date || windowFrom);
      const firstOpen = result.availability.find(d => d.slots.length);
      setSelectedDate(firstOpen?.date || result.availability[0]?.date || "");
    } else {
      setDays(null);
    }
    setSelectedStart("");
    setStep("time");
  };

  const addPhoto = async (file: File) => {
    if (photos.length >= MAX_PHOTOS) return;
    try {
      const dataUrl = await compressForBooking(file);
      setPhotos(prev => prev.length >= MAX_PHOTOS ? prev : [...prev, dataUrl]);
    } catch {
      setError("Couldn't use that photo -- try a different image.");
    }
  };

  const submit = async () => {
    if (!service || !selectedDate || !selectedStart || submitting) return;
    setSubmitting(true);
    setError("");
    const result = await api.book({
      serviceId: service.id, date: selectedDate, startTime: selectedStart, address: address.trim(), description: description.trim(),
      photos, name: name.trim(), phone: phone.trim(), email: email.trim(), idempotencyKey: idempotencyKeyRef.current
    });
    setSubmitting(false);
    if (result.ok && result.confirmation) {
      setConfirmation(result.confirmation);
      setStep("confirmed");
      onBooked?.(result.confirmation);
      return;
    }
    setError(result.error || "Could not complete your booking.");
    if (result.code === "SLOT_UNAVAILABLE") {
      // The slot was taken (or went stale) -- a fresh attempt is a new booking.
      idempotencyKeyRef.current = newIdempotencyKey();
      applyRefreshedAvailability(result);
    }
  };

  const reset = () => {
    idempotencyKeyRef.current = newIdempotencyKey();
    setConfirmation(null);
    setSelectedStart("");
    setDescription("");
    setPhotos([]);
    setDays(null);
    setError("");
    setStep("service");
  };

  if (!options) {
    return <div className="flex justify-center py-12 text-[#5E7393]"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!options.ok) {
    return (
      <div className="rounded-2xl border border-[#9EC8EF] bg-white p-6 text-center">
        <CalendarClock className="w-8 h-8 text-[#9EC8EF] mx-auto mb-2" />
        <p className="text-sm font-black text-[#1F3557]">Online booking isn't available</p>
        <p className="mt-1 text-xs text-[#5E7393]">{options.error || "Use Request Service instead and the business will reach out to schedule."}</p>
      </div>
    );
  }

  if (step === "confirmed" && confirmation) {
    return (
      <div className="max-w-lg rounded-2xl border border-[#9EC8EF] bg-white p-6">
        <div className="text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
          <p className="text-base font-black text-[#1F3557]">Booking Confirmed</p>
          <p className="mt-1 text-xs text-[#5E7393]">Confirmation #{confirmation.jobNumber}</p>
        </div>
        <SummaryList rows={[
          { icon: <Building2 className="w-4 h-4" />, label: "Business", value: confirmation.businessName || "Your service provider" },
          { icon: <Wrench className="w-4 h-4" />, label: "Service", value: confirmation.serviceName },
          { icon: <CalendarClock className="w-4 h-4" />, label: "Date", value: formatBookingDate(confirmation.date) },
          { icon: <Clock className="w-4 h-4" />, label: "Time", value: `${formatSlotTime(confirmation.startTime)} – ${formatSlotTime(confirmation.endTime)}` },
          { icon: <MapPin className="w-4 h-4" />, label: "Address", value: confirmation.address }
        ]} />
        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          {onViewAppointments && <button className={`${primaryBtn} flex-1`} onClick={onViewAppointments}>View My Appointments</button>}
          <button className={`${secondaryBtn} flex-1`} onClick={reset}>Book Another Service</button>
        </div>
      </div>
    );
  }

  const stepIndex = STEPS.findIndex(s => s.id === step);
  const detailsValid = !!address.trim() && !!name.trim() && (!!phone.trim() || !!email.trim());
  const selectedDay = days?.find(d => d.date === selectedDate);

  return (
    <div className="max-w-2xl space-y-4">
      {options.businessName && <p className="text-xs font-bold text-[#5E7393]">Booking with <span className="text-[#1F3557]">{options.businessName}</span></p>}

      <ol className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black ${i <= stepIndex ? "bg-[#315C9F] text-white" : "bg-white border border-[#9EC8EF] text-[#5E7393]"}`}>{i + 1}</span>
            <span className={`truncate text-[10px] font-black uppercase tracking-wide ${i === stepIndex ? "text-[#1F3557]" : "text-[#5E7393]"}`}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="hidden sm:block flex-1 h-px bg-[#9EC8EF]" />}
          </li>
        ))}
      </ol>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {error}
        </div>
      )}

      <div className="rounded-2xl border border-[#9EC8EF] bg-white p-4 space-y-4">
        {step === "service" && (
          <>
            <span className={labelClass}>What service do you need?</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {(options.services || []).map(s => (
                <button
                  key={s.id}
                  onClick={() => { setServiceId(s.id); setDays(null); setSelectedStart(""); }}
                  aria-pressed={serviceId === s.id}
                  className={`text-left rounded-xl border px-3 py-3 transition-colors ${serviceId === s.id ? "border-[#315C9F] bg-[#315C9F] text-white" : "border-transparent"}`}
                >
                  <p className="text-sm font-black text-[#1F3557]">{s.name}</p>
                  <p className="text-[11px] font-bold text-[#5E7393]">About {s.durationMinutes} min</p>
                  {s.description && <p className="mt-1 text-[11px] text-[#5E7393]">{s.description}</p>}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button className={primaryBtn} disabled={!service} onClick={() => setStep("time")}>Choose a Time <ChevronRight className="w-4 h-4" /></button>
            </div>
          </>
        )}

        {step === "time" && (
          <>
            <div className="flex items-center justify-between">
              <span className={labelClass}>Pick a day</span>
              <div className="flex gap-1">
                <button aria-label="Earlier dates" className="rounded-lg border border-[#9EC8EF] p-1.5 text-[#315C9F] disabled:opacity-30" disabled={loadingSlots} onClick={() => {
                  const [y, m, d] = (windowFrom || new Date().toISOString().slice(0, 10)).split("-").map(Number);
                  void loadSlots(new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10));
                }}><ChevronLeft className="w-4 h-4" /></button>
                <button aria-label="Later dates" className="rounded-lg border border-[#9EC8EF] p-1.5 text-[#315C9F] disabled:opacity-30" disabled={loadingSlots || !days?.length} onClick={() => {
                  const last = days?.[days.length - 1]?.date;
                  if (!last) return;
                  const [y, m, d] = last.split("-").map(Number);
                  void loadSlots(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10));
                }}><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
            {loadingSlots || days === null ? (
              <div className="flex justify-center py-8 text-[#5E7393]"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : days.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#5E7393]">No more dates are open for online booking.</p>
            ) : (
              <>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {days.map(d => {
                    const open = d.slots.length > 0;
                    const active = d.date === selectedDate;
                    return (
                      <button
                        key={d.date}
                        disabled={!open}
                        onClick={() => { setSelectedDate(d.date); setSelectedStart(""); }}
                        aria-pressed={active}
                        className={`rounded-xl border px-1 py-2 text-center transition-colors ${active ? "border-[#315C9F] bg-[#315C9F] text-white" : open ? "border-transparent text-[#1F3557]" : "border-transparent opacity-40 cursor-not-allowed"}`}
                      >
                        <span className="block text-[9px] font-black uppercase">{formatBookingDate(d.date, { weekday: "short" })}</span>
                        <span className="block text-sm font-black">{formatBookingDate(d.date, { day: "numeric" })}</span>
                        <span className={`block text-[9px] font-bold ${active ? "text-blue-100" : "text-[#5E7393]"}`}>{open ? `${d.slots.length} open` : "No times"}</span>
                      </button>
                    );
                  })}
                </div>
                <div>
                  <span className={labelClass}>{selectedDate ? `Available times · ${formatBookingDate(selectedDate, { weekday: "long", month: "short", day: "numeric" })}` : "Available times"}</span>
                  {selectedDay && selectedDay.slots.length ? (
                    <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                      {selectedDay.slots.map(slot => (
                        <button
                          key={slot.startTime}
                          onClick={() => setSelectedStart(slot.startTime)}
                          aria-pressed={selectedStart === slot.startTime}
                          className={`rounded-xl border py-2 text-xs font-black transition-colors ${selectedStart === slot.startTime ? "border-[#315C9F] bg-[#315C9F] text-white" : "border-transparent text-[#315C9F]"}`}
                        >
                          {formatSlotTime(slot.startTime)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-[#5E7393]">No open times this day -- try another date.</p>
                  )}
                </div>
                {options.timeZone && <p className="text-[10px] text-[#5E7393]">Times shown in the business's local time ({options.timeZone.replace(/_/g, " ")}).</p>}
              </>
            )}
            <div className="flex justify-between">
              <button className={secondaryBtn} onClick={() => setStep("service")}><ChevronLeft className="w-4 h-4" /> Back</button>
              <button className={primaryBtn} disabled={!selectedStart} onClick={() => setStep("details")}>Continue <ChevronRight className="w-4 h-4" /></button>
            </div>
          </>
        )}

        {step === "details" && (
          <>
            <label className="block">
              <span className={labelClass}>Service address *</span>
              <input value={address} onChange={e => setAddress(e.target.value)} className={inputClass} placeholder="Street, city, state, ZIP" />
            </label>
            <label className="block">
              <span className={labelClass}>Short description</span>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={2000} className={inputClass} placeholder="What's going on? Anything the technician should know?" />
            </label>
            <div>
              <span className={labelClass}>Photos (optional)</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative h-16 w-16">
                    <img src={p} alt={`Attached photo ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border border-[#9EC8EF]" />
                    <button aria-label="Remove photo" onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1.5 -right-1.5 rounded-full bg-rose-500 text-white p-0.5"><X className="w-3 h-3" /></button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button aria-label="Add photo" onClick={() => fileRef.current?.click()} className="h-16 w-16 rounded-lg border-2 border-transparent flex items-center justify-center text-[#315C9F]">
                    <Camera className="w-5 h-5" />
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void addPhoto(f); e.target.value = ""; }} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className={labelClass}>Your name *</span>
                <input value={name} onChange={e => setName(e.target.value)} className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Phone</span>
                <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Email</span>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" className={inputClass} />
              </label>
            </div>
            <p className="text-[10px] text-[#5E7393]">A phone number or email is needed so the business can reach you about this visit.</p>
            <div className="flex justify-between">
              <button className={secondaryBtn} onClick={() => setStep("time")}><ChevronLeft className="w-4 h-4" /> Back</button>
              <button className={primaryBtn} disabled={!detailsValid} onClick={() => setStep("review")}>Review Booking <ChevronRight className="w-4 h-4" /></button>
            </div>
          </>
        )}

        {step === "review" && service && (
          <>
            <span className={labelClass}>Review Booking</span>
            <SummaryList rows={[
              { icon: <Building2 className="w-4 h-4" />, label: "Business", value: options.businessName || "Your service provider" },
              { icon: <Wrench className="w-4 h-4" />, label: "Service", value: `${service.name} (about ${service.durationMinutes} min)` },
              { icon: <CalendarClock className="w-4 h-4" />, label: "Date", value: formatBookingDate(selectedDate) },
              { icon: <Clock className="w-4 h-4" />, label: "Time", value: formatSlotTime(selectedStart) },
              { icon: <MapPin className="w-4 h-4" />, label: "Address", value: address }
            ]} />
            {description && <p className="rounded-xl bg-[#F5FAFF] border border-[#9EC8EF]/60 p-3 text-xs text-[#1F3557]">{description}</p>}
            {photos.length > 0 && <p className="text-[11px] font-bold text-[#5E7393]">{photos.length} photo{photos.length === 1 ? "" : "s"} attached</p>}
            <div className="flex justify-between">
              <button className={secondaryBtn} disabled={submitting} onClick={() => setStep("details")}><ChevronLeft className="w-4 h-4" /> Back</button>
              <button className={primaryBtn} disabled={submitting} onClick={() => void submit()}>
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirm Booking
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryList({ rows }: { rows: Array<{ icon: React.ReactNode; label: string; value: string }> }) {
  return (
    <dl className="mt-4 divide-y divide-[#9EC8EF]/40 rounded-xl border border-[#9EC8EF]/60">
      {rows.map(row => (
        <div key={row.label} className="flex items-start gap-3 px-3 py-2.5">
          <span className="mt-0.5 text-[#315C9F]">{row.icon}</span>
          <dt className="w-20 shrink-0 text-[10px] font-black uppercase tracking-wide text-[#5E7393] pt-0.5">{row.label}</dt>
          <dd className="text-sm font-bold text-[#1F3557] break-words min-w-0">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
