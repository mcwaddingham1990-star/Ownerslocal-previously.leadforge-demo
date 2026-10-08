import React, { useState } from "react";
import { X, Calendar as CalendarIcon } from "lucide-react";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { AssignEmployeeField } from "./AssignEmployeeField";
import type { Lead, SchedulingEvent } from "../types/domain";

/**
 * The first real step in the Lead pipeline: get someone out to look at the
 * job before an estimate gets drafted. Creates a real "Site Visit"
 * SchedulingEvent tied back to the lead (sourceLeadId) -- the same
 * calendar/dispatch record type every other scheduled visit uses, just
 * reached from a Lead instead of typed in cold on the calendar.
 *
 * Assigning a technician is optional (the shared AssignEmployeeField's own
 * "Unassigned" default covers that), and the whole step is skippable --
 * not every lead needs an in-person visit before an estimate goes out.
 */
export function ScheduleHomeVisitModal({
  isOpen, onClose, lead
}: {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
}) {
  const { setSchedulingEvents } = useDomainData();
  const { logOperationalEvent, triggerNotification } = useNavTelemetry();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [assignedEmployee, setAssignedEmployee] = useState("");
  const [notes, setNotes] = useState("");

  if (!isOpen || !lead) return null;

  const handleSchedule = () => {
    if (!date || !startTime || !endTime) {
      triggerNotification("Date and time are required.");
      return;
    }
    const now = new Date().toISOString();
    const visit: SchedulingEvent = {
      id: "visit_" + Math.random().toString(36).substring(2, 9),
      eventType: "Site Visit",
      title: "Home Visit",
      date, startTime, endTime,
      customer: lead.name,
      customerPhone: lead.phone,
      customerEmail: lead.email,
      customerAddress: lead.address || "",
      location: lead.address || "",
      assignedEmployee,
      priority: "Medium",
      notes: notes.trim(),
      status: assignedEmployee ? "Assigned" : "Unassigned",
      sourceLeadId: lead.id,
      source: lead.source,
      createdAt: now,
      updatedAt: now
    };
    setSchedulingEvents(prev => [visit, ...prev]);
    if (logOperationalEvent) logOperationalEvent("Home Visit Scheduled", `Site visit scheduled for ${lead.name} on ${date}`, "🏠");
    triggerNotification(`Home visit scheduled for ${lead.name} on ${date}.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm" onMouseDown={(e: any) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl border border-[#9EC8EF] bg-[#F5FAFF] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#9EC8EF] bg-[#C7E3FA] px-4 py-3">
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-[#315C9F]">Lead Follow-Up</p>
            <h3 className="text-base font-black text-[#1F3557]">Schedule Home Visit</h3>
            <p className="text-xs font-semibold text-[#5E7393]">{lead.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-white" aria-label="Close Schedule Home Visit"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-[#5E7393]">Date *</span>
              <input type="date" value={date} onChange={(e: any) => setDate(e.target.value)} className="input" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-[#5E7393]">Start</span>
                <input type="time" value={startTime} onChange={(e: any) => setStartTime(e.target.value)} className="input" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-[#5E7393]">End</span>
                <input type="time" value={endTime} onChange={(e: any) => setEndTime(e.target.value)} className="input" />
              </label>
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-[#5E7393]">Assign technician (optional)</span>
            <AssignEmployeeField value={assignedEmployee} onChange={setAssignedEmployee} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-[#5E7393]">Notes</span>
            <textarea rows={2} value={notes} onChange={(e: any) => setNotes(e.target.value)} className="input" placeholder="Access details, what to inspect..." />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#9EC8EF] bg-[#EAF5FF] p-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Skip</button>
          <button type="button" onClick={handleSchedule} className="rounded-xl bg-[#315C9F] px-5 py-2 text-xs font-black text-white"><CalendarIcon className="mr-1 inline h-4 w-4" />Schedule Visit</button>
        </div>
      </div>
    </div>
  );
}
