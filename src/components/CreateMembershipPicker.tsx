import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import type { Membership } from "../types/membership";
import { MembershipBuilder } from "./MembershipBuilder";

/**
 * The 3-choice menu every "Add Membership" entry point shows: Create New
 * Membership, Add Existing Membership (link one already on file to this
 * customer/job), Create Service Agreement From Blank Document. Owns its own
 * MembershipBuilder instance so any page can drop this one component in.
 */
export interface CreateMembershipPickerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Fields to carry in no matter which starting point is picked -- e.g. a
   * preselected customer (Customer card) or job/estimate. */
  prefillBase?: Partial<Membership>;
}

type Mode = "menu" | "pick_existing" | "builder";

export const CreateMembershipPicker: React.FC<CreateMembershipPickerProps> = ({ isOpen, onClose, prefillBase }) => {
  const { memberships, setPendingCreateTemplateFolder } = useDomainData();
  const { navigateToScreen } = useNavTelemetry();
  const [mode, setMode] = useState<Mode>("menu");
  const [editingMembership, setEditingMembership] = useState<Membership | null>(null);

  useEffect(() => {
    if (isOpen) { setMode("menu"); setEditingMembership(null); }
  }, [isOpen]);

  if (!isOpen) return null;

  if (mode === "builder") {
    return (
      <MembershipBuilder
        isOpen
        onClose={onClose}
        editingMembership={editingMembership}
        prefill={editingMembership ? { ...editingMembership, ...prefillBase } : prefillBase}
      />
    );
  }

  const pickExisting = (membershipId: string) => {
    const m = memberships.find(x => x.id === membershipId);
    if (!m) return;
    setEditingMembership(m);
    setMode("builder");
  };

  const createBlankDocument = () => {
    setPendingCreateTemplateFolder("Service Agreements");
    navigateToScreen("documents");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#9EC8EF] bg-[#F5FAFF] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#9EC8EF] bg-[#C7E3FA] px-4 py-3">
          <h3 className="text-base font-black text-[#1F3557]">📜 Add Membership</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-white"><X className="h-4 w-4" /></button>
        </div>

        {mode === "menu" && (
          <div className="space-y-2 p-4">
            <button onClick={() => { setEditingMembership(null); setMode("builder"); }} className="w-full rounded-xl border border-[#9EC8EF] bg-white p-4 text-left text-sm font-black text-[#1F3557]">Create New Membership</button>
            <button onClick={() => setMode("pick_existing")} className="w-full rounded-xl border border-[#9EC8EF] bg-white p-4 text-left text-sm font-black text-[#1F3557]">Add Existing Membership</button>
            <button onClick={createBlankDocument} className="w-full rounded-xl border border-dashed border-[#315C9F] p-4 text-left text-sm font-black text-[#315C9F]">Create Service Agreement From Blank Document</button>
          </div>
        )}

        {mode === "pick_existing" && (
          <div className="space-y-2 p-4">
            {memberships.length === 0 && <p className="text-xs text-slate-400">No memberships yet.</p>}
            {memberships.map(m => (
              <button key={m.id} onClick={() => pickExisting(m.id)} className="w-full rounded-xl border border-[#9EC8EF] bg-white p-3 text-left text-xs">
                <span className="font-black text-[#1F3557]">{m.membershipNumber || m.planName}</span>
                <span className="ml-2 text-[#5E7393]">{m.customerName}</span>
              </button>
            ))}
            <button onClick={() => setMode("menu")} className="text-xs font-bold text-[#315C9F]">← Back</button>
          </div>
        )}
      </div>
    </div>
  );
};
