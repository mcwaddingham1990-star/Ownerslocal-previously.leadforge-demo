import React from "react";
import { Folder, FolderPlus, Camera } from "lucide-react";
import type { EmployeeRecord } from "../types/domain";
import type { DocumentItem } from "../types/domain";

export interface EmployeeSnapshotFolderBrowserProps {
  employees: EmployeeRecord[];
  documents: DocumentItem[];
  hasManagePermission: boolean;
  /** The Advanced Filters "Employee" value -- "All" means no employee folder is open yet. */
  activeEmployeeFilter: string;
  onSelectEmployee: (name: string) => void;
  onClearEmployee: () => void;
  onOpenCustomize: () => void;
}

/**
 * The "Employee Snapshot" folder doesn't behave like the other fixed
 * folders in FOLDER_TAXONOMY -- it doesn't exist until an owner/manager
 * customizes it, and what's "inside" is one real folder per employee
 * granted Snapshot permission, not a fixed set of document types. Nothing
 * here is auto-populated: an employee only gets a folder the moment they're
 * checked in "Customize Employee Folder," and it only ever shows employees
 * who currently hold that permission.
 */
export const EmployeeSnapshotFolderBrowser: React.FC<EmployeeSnapshotFolderBrowserProps> = ({
  employees, documents, hasManagePermission, activeEmployeeFilter, onSelectEmployee, onClearEmployee, onOpenCustomize
}) => {
  const permittedEmployees = employees.filter(e => e.snapshotPermissionEnabled);

  if (activeEmployeeFilter !== "All") {
    const emp = permittedEmployees.find(e => `${e.firstName} ${e.lastName}`.trim() === activeEmployeeFilter);
    const count = documents.filter(d => d.folder === "Employee Snapshot" && d.employee === activeEmployeeFilter).length;
    return (
      <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl p-3 flex items-center justify-between gap-3">
        {hasManagePermission ? (
          <button onClick={onClearEmployee} className="text-xs font-black text-[#315C9F] hover:underline">
            ← Employee Snapshot
          </button>
        ) : <span className="w-24" />}
        <span className="text-xs font-black text-[#1F3557]">
          {emp ? `${emp.firstName} ${emp.lastName}` : activeEmployeeFilter}'s Folder — {count} file{count === 1 ? "" : "s"}
        </span>
        <span className="w-24" />
      </div>
    );
  }

  return (
    <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black uppercase text-[#1F3557] flex items-center gap-1.5">
          <Camera className="w-4 h-4 text-violet-600" /> Employee Snapshot
        </h4>
        {hasManagePermission && (
          <button
            onClick={onOpenCustomize}
            className="px-3 py-2 rounded-xl text-[10px] font-black border border-dashed border-violet-500 text-violet-700 hover:bg-violet-50 flex items-center gap-1.5"
          >
            <FolderPlus className="w-3.5 h-3.5" /> Customize Employee Folder
          </button>
        )}
      </div>
      {permittedEmployees.length === 0 ? (
        <p className="text-[10px] text-slate-500 font-semibold py-4 text-center">
          No employees have Snapshot permission yet.{hasManagePermission ? " Use \"Customize Employee Folder\" to add one, several, or the whole roster." : ""}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {permittedEmployees.map(emp => {
            const name = `${emp.firstName} ${emp.lastName}`.trim();
            const count = documents.filter(d => d.folder === "Employee Snapshot" && d.employee === name).length;
            return (
              <button
                key={emp.email}
                onClick={() => onSelectEmployee(name)}
                className="flex flex-col items-center gap-1 p-3 bg-white border border-[#9EC8EF] rounded-xl hover:bg-[#C7E3FA] transition-colors"
              >
                <Folder className="w-6 h-6 text-[#4A9BFF]" />
                <span className="text-[10px] font-extrabold text-[#1F3557] truncate w-full text-center">{name}</span>
                <span className="text-[9px] text-slate-400 font-semibold">{count} file{count === 1 ? "" : "s"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
