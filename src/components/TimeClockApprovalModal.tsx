import React, { useState } from "react";
import { X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { AppNotification, TimeClockLog } from "../types/domain";
import { resolveTimeClockApproval } from "../lib/notificationsService";

export interface TimeClockApprovalModalProps {
  log: TimeClockLog;
  timeClockLogs: TimeClockLog[];
  setTimeClockLogs: Dispatch<SetStateAction<TimeClockLog[]>>;
  setNotifications: Dispatch<SetStateAction<AppNotification[]>>;
  businessId: string | undefined;
  actingUserEmail: string | undefined;
  actingUserName: string | undefined;
  logOperationalEvent?: (type: string, desc: string, icon: string) => void;
  notify?: (message: string) => void;
  onClose: () => void;
}

/**
 * The remote-approval popup: a manager reviews one pending punch from their
 * own device and either approves it (optionally correcting the date/time
 * first -- e.g. the employee forgot to clock in on time) or rejects it with
 * a reason. Shared by TimeClockPage and App.tsx's sidebar Alert Center so
 * the review experience is identical wherever a manager acts from.
 */
export const TimeClockApprovalModal: React.FC<TimeClockApprovalModalProps> = ({
  log, timeClockLogs, setTimeClockLogs, setNotifications, businessId,
  actingUserEmail, actingUserName, logOperationalEvent, notify, onClose
}) => {
  const [dateStr, setDateStr] = useState(log.date);
  const [timeStr, setTimeStr] = useState(log.time);
  const [rejectionReason, setRejectionReason] = useState("");
  const timeChanged = dateStr.trim() !== log.date || timeStr.trim() !== log.time;

  const commonParams = {
    logId: log.id, timeClockLogs, setTimeClockLogs, setNotifications,
    businessId, actingUserEmail, actingUserName, logOperationalEvent, notify
  };

  const handleApprove = () => {
    resolveTimeClockApproval({ ...commonParams, decision: "approved", adjustedDate: dateStr.trim(), adjustedTime: timeStr.trim() });
    onClose();
  };
  const handleReject = () => {
    resolveTimeClockApproval({ ...commonParams, decision: "rejected", rejectionReason: rejectionReason.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[10000] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white max-w-sm w-full rounded-3xl p-6 border border-[#A9CDEE] shadow-2xl space-y-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-black uppercase text-[#342D7E] tracking-wider">Review {log.type}</h4>
            <p className="text-[10px] text-slate-500 mt-1">
              {log.employeeName} · {log.type} logged at {log.time} on {log.date}. Adjust below if it's wrong, then approve.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Date</label>
            <input
              type="text"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:outline-none font-mono text-slate-700 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Time</label>
            <input
              type="text"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              placeholder="e.g. 08:03 AM"
              className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:outline-none font-mono text-slate-700 text-xs"
            />
          </div>
        </div>
        {timeChanged && (
          <p className="text-[9.5px] text-amber-600 font-semibold">
            Approving will save this corrected time — {log.employeeName}'s hours will be recalculated from it, not the original punch.
          </p>
        )}

        <div className="space-y-1">
          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Rejection reason (only used if you reject)</label>
          <input
            type="text"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="e.g. GPS looked off-site"
            className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:outline-none text-slate-700 text-xs"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleReject}
            className="flex-1 py-2.5 bg-rose-100 hover:bg-rose-200 text-rose-700 font-black rounded-xl text-xs uppercase cursor-pointer"
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs uppercase cursor-pointer"
          >
            {timeChanged ? "Save & Approve" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
};
