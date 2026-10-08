import React, { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { CalendarCheck, Globe } from "lucide-react";
import { db } from "../firebase";

interface OnlineBookingRecord {
  description?: string;
  photos?: string[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  serviceName?: string;
  createdAt?: string;
}

/**
 * "Booked online" panel for a Scheduling event created by Online Booking
 * (server/onlineBooking.ts): shows which entry point it came through and
 * the customer's own description/photos from its online_bookings record
 * (readable by staff with Scheduling access -- see firestore.rules).
 */
export function OnlineBookingDetails({ bookingSource, onlineBookingId }: { bookingSource: string; onlineBookingId?: string }) {
  const [record, setRecord] = useState<OnlineBookingRecord | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  useEffect(() => {
    setRecord(null);
    if (!onlineBookingId) return;
    let cancelled = false;
    getDoc(doc(db, "online_bookings", onlineBookingId))
      .then(snap => { if (!cancelled && snap.exists()) setRecord(snap.data() as OnlineBookingRecord); })
      .catch(err => console.error("Error loading online booking details:", err));
    return () => { cancelled = true; };
  }, [onlineBookingId]);

  const isWebsite = bookingSource === "Website Booking";

  return (
    <div className="space-y-1.5 border-b border-slate-50 pb-3">
      <span className="text-[9px] uppercase tracking-wider text-slate-400 font-extrabold block">Online Booking</span>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[8.5px] ${isWebsite ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>
        {isWebsite ? <Globe className="w-3 h-3" /> : <CalendarCheck className="w-3 h-3" />}
        Source: {bookingSource}
      </span>
      {record?.description && <p className="text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 leading-relaxed whitespace-pre-wrap">{record.description}</p>}
      {!!record?.photos?.length && (
        <div className="flex flex-wrap gap-1.5">
          {record.photos.map((photo, i) => (
            <button key={i} type="button" onClick={() => setPreviewPhoto(photo)} className="cursor-pointer">
              <img src={photo} alt={`Customer photo ${i + 1}`} className="h-14 w-14 rounded-lg object-cover border border-slate-200" />
            </button>
          ))}
        </div>
      )}
      {previewPhoto && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 flex items-center justify-center p-4" onClick={() => setPreviewPhoto(null)}>
          <img src={previewPhoto} alt="Customer photo" className="max-h-[85vh] max-w-full rounded-xl" />
        </div>
      )}
    </div>
  );
}
