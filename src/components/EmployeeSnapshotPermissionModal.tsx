import React, { useState } from "react";
import { X, Camera } from "lucide-react";
import type { EmployeeRecord } from "../types/domain";

export interface EmployeeSnapshotPermissionModalProps {
  employees: EmployeeRecord[];
  onSave: (grantedEmails: string[]) => void;
  onClose: () => void;
}

/**
 * "Customize Employee Folder" -- the one place Snapshot permission is
 * granted or revoked. Offers the whole roster as a multi-select so an owner
 * can add one employee or all of them in a single save; every employee left
 * checked gets (or keeps) a folder under Employee Snapshot the instant this
 * saves, and every employee unchecked loses both the permission and their
 * folder's place in that list (their already-filed documents stay put,
 * they just stop appearing as an active folder here).
 */
export const EmployeeSnapshotPermissionModal: React.FC<EmployeeSnapshotPermissionModalProps> = ({ employees, onSave, onClose }) => {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(employees.filter(e => e.snapshotPermissionEnabled).map(e => e.email))
  );

  const toggle = (email: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  };

  const allSelected = employees.length > 0 && employees.every(e => selected.has(e.email));

  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[440px] shadow-2xl space-y-3 text-xs">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-black text-[#1F3557] uppercase flex items-center gap-1.5">
            <Camera className="w-4 h-4 text-violet-600" /> Customize Employee Folder
          </h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <p className="text-[10px] text-slate-500">
          Choose which employees can use the Snapshot camera feature (receipts, fuel purchases, forms). Every employee checked gets a folder here for their scans, filed automatically -- select one, several, or the whole roster.
        </p>

        {employees.length === 0 ? (
          <p className="text-[10px] text-slate-400 font-semibold text-center py-6">No employees on the roster yet.</p>
        ) : (
          <>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={e => setSelected(e.target.checked ? new Set(employees.map(emp => emp.email)) : new Set())}
                className="w-4 h-4 accent-violet-600"
              />
              <span className="font-black text-[#1F3557] uppercase text-[10px]">Select All Employees</span>
            </label>
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {employees.map(emp => (
                <label key={emp.email} className="flex items-center justify-between gap-3 p-2.5 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                  <span>
                    <span className="block text-xs font-extrabold text-slate-800">{emp.firstName} {emp.lastName}</span>
                    <span className="block text-[9.5px] text-slate-400">{emp.role} • {emp.email}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={selected.has(emp.email)}
                    onChange={() => toggle(emp.email)}
                    className="w-4 h-4 accent-violet-600 shrink-0"
                  />
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancel</button>
          <button
            onClick={() => onSave([...selected])}
            disabled={employees.length === 0}
            className="flex-1 py-2 bg-violet-600 text-white rounded-xl font-bold disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
