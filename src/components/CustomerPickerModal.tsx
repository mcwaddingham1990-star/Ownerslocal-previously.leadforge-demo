import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Phone, Building2, Star, Clock } from "lucide-react";
import { Customer } from "../types/domain";

const RECENT_KEY = "ownersLocalOS_recentCustomerPicks";

function readRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function pushRecentId(id: string) {
  try {
    const existing = readRecentIds().filter((x) => x !== id);
    const next = [id, ...existing].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusColor(status: Customer["status"]): string {
  switch (status) {
    case "Active": return "bg-emerald-500";
    case "Past Due": return "bg-rose-500";
    case "Inactive": return "bg-slate-400";
    default: return "bg-slate-400";
  }
}

interface CustomerPickerModalProps {
  customers: Customer[];
  onSelect: (customer: Customer) => void;
  onClose: () => void;
  title?: string;
}

/**
 * A real, searchable customer picker: avatar initials, company, phone,
 * live status color, a "Recent" shortcut row (persisted locally), full
 * keyboard navigation (Up/Down/Enter/Escape), and a touch-friendly layout.
 * Used anywhere the app needs to link a real existing customer record
 * instead of a free-text field or a hardcoded dropdown.
 */
export const CustomerPickerModal: React.FC<CustomerPickerModalProps> = ({
  customers,
  onSelect,
  onClose,
  title = "Choose a Customer"
}) => {
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const recentIds = useMemo(() => readRecentIds(), []);
  const recentCustomers = useMemo(
    () => recentIds.map((id) => customers.find((c) => c.id === id)).filter((c): c is Customer => !!c),
    [recentIds, customers]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q === ""
      ? customers
      : customers.filter((c) =>
          c.company.toLowerCase().includes(q) ||
          c.contact.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
        );
    return [...base].sort((a, b) => a.company.localeCompare(b.company));
  }, [customers, query]);

  const showRecent = query.trim() === "" && recentCustomers.length > 0;
  const listToNavigate = showRecent ? recentCustomers : filtered;

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  useEffect(() => {
    itemRefs.current[highlightIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const commit = (c: Customer) => {
    pushRecentId(c.id);
    onSelect(c);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, listToNavigate.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = listToNavigate[highlightIndex];
      if (target) commit(target);
    }
  };

  const renderRow = (c: Customer, idx: number) => (
    <button
      key={c.id}
      ref={(el) => { itemRefs.current[idx] = el; }}
      type="button"
      onClick={() => commit(c)}
      onMouseEnter={() => setHighlightIndex(idx)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
        highlightIndex === idx ? "bg-[#BDDDF8]" : "hover:bg-[#EAF5FF]"
      }`}
    >
      <div className="relative shrink-0">
        <div className="w-9 h-9 rounded-full bg-[#315C9F] text-white flex items-center justify-center text-[11px] font-black">
          {initials(c.company)}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${statusColor(c.status)}`} title={c.status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold text-[#1F3557] truncate">{c.company}</p>
          {c.isVIP && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
        </div>
        <p className="text-[10.5px] text-[#5E7393] truncate">{c.contact}</p>
      </div>
      <div className="text-right shrink-0 hidden sm:block">
        <p className="text-[10.5px] text-[#5E7393] font-mono flex items-center gap-1 justify-end">
          <Phone className="w-3 h-3" /> {c.phone || "—"}
        </p>
        <p className="text-[9.5px] text-[#5E7393]/80 flex items-center gap-1 justify-end mt-0.5">
          <Building2 className="w-2.5 h-2.5" /> {c.type}
        </p>
      </div>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60] animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[85vh] animate-scale-up"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="bg-[#315C9F] text-white px-5 py-3.5 flex items-center justify-between">
          <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">{title}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 border-b border-[#9EC8EF]/40">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5E7393]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by company, contact, phone, or email..."
              className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl pl-8 pr-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
            />
          </div>
        </div>

        <div className="overflow-y-auto p-2 flex-1">
          {customers.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-2xl">👤</p>
              <p className="text-xs font-bold text-slate-500">No customers yet</p>
              <p className="text-[10.5px] text-slate-400 max-w-xs mx-auto">Add a customer first, then you can link them here.</p>
            </div>
          ) : showRecent ? (
            <>
              <p className="px-3 pt-1 pb-1.5 text-[9px] font-black uppercase tracking-widest text-[#5E7393] flex items-center gap-1">
                <Clock className="w-3 h-3" /> Recent
              </p>
              {recentCustomers.map((c, idx) => renderRow(c, idx))}
              <p className="px-3 pt-3 pb-1.5 text-[9px] font-black uppercase tracking-widest text-[#5E7393]">All Customers</p>
              {[...customers].sort((a, b) => a.company.localeCompare(b.company)).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => commit(c)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-[#EAF5FF] transition-colors cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-full bg-[#9EC8EF] text-[#1F3557] flex items-center justify-center text-[9.5px] font-black shrink-0">
                    {initials(c.company)}
                  </div>
                  <p className="text-[11px] font-bold text-[#1F3557] truncate">{c.company}</p>
                </button>
              ))}
            </>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-2xl">🔍</p>
              <p className="text-xs font-bold text-slate-500">No matches for "{query}"</p>
            </div>
          ) : (
            filtered.map((c, idx) => renderRow(c, idx))
          )}
        </div>
      </div>
    </div>
  );
};
