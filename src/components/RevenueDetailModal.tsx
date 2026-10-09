import React from "react";
import { createPortal } from "react-dom";
import { X, FileText } from "lucide-react";

export interface RevenueDetailRow {
  id: string;
  date: string;
  description: string;
  /** Payment source (e.g. "Completed Job Revenue") or expense category. */
  category: string;
  kind: "payment" | "expense";
  amount: number;
}

interface RevenueDetailModalProps {
  title: string;
  periodLabel: string;
  rows: RevenueDetailRow[];
  /** "net" shows payments as + and expenses as -, with a net total. */
  mode: "payments" | "expenses" | "net";
  onClose: () => void;
  onDownloadCsv: () => void;
}

const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Pop-up opened from a Revenue page tile: every payment and/or expense
 * behind that tile's number for the selected period, in one scrollable
 * table with a sticky header and the total at the bottom.
 */
export const RevenueDetailModal: React.FC<RevenueDetailModalProps> = ({ title, periodLabel, rows, mode, onClose, onDownloadCsv }) => {
  const payments = rows.filter(r => r.kind === "payment").reduce((s, r) => s + r.amount, 0);
  const expenses = rows.filter(r => r.kind === "expense").reduce((s, r) => s + r.amount, 0);
  const total = mode === "payments" ? payments : mode === "expenses" ? expenses : payments - expenses;

  // Portaled to <body> so no transformed/blurred parent can trap or squeeze it.
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm animate-fade-in" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[#9EC8EF] bg-[#EAF5FF] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#9EC8EF] bg-[#C7E3FA] px-5 py-4">
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#1F3557]">{title}</h3>
            <p className="text-[11px] font-semibold text-[#5E7393]">{periodLabel} · {rows.length} item{rows.length === 1 ? "" : "s"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-[#1F3557] hover:bg-white"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {rows.length === 0 ? (
            <div className="py-16 text-center text-xs font-medium text-[#5E7393]">Nothing recorded in this period yet.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#C7E3FA] text-[9px] uppercase tracking-wide text-[#5E7393]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Description</th>
                  <th className="hidden px-4 py-2.5 text-left sm:table-cell">{mode === "payments" ? "Source" : mode === "expenses" ? "Category" : "Type"}</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.kind}_${r.id}_${i}`} className="border-t border-blue-100 bg-white/60 hover:bg-white">
                    <td className="whitespace-nowrap px-3 py-2 font-mono sm:px-4 text-[#5E7393]">{r.date.slice(0, 10)}</td>
                    <td className="px-4 py-2 font-semibold text-[#1F3557]">{r.description}</td>
                    <td className="hidden px-4 py-2 text-[#5E7393] sm:table-cell">{mode === "net" ? `${r.kind === "payment" ? "Payment" : "Expense"} · ${r.category}` : r.category}</td>
                    <td className={`whitespace-nowrap px-4 py-2 text-right font-mono font-bold ${mode === "net" ? (r.kind === "payment" ? "text-emerald-700" : "text-rose-600") : "text-[#1F3557]"}`}>
                      {mode === "net" ? (r.kind === "payment" ? "+" : "−") : ""}{fmt(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#9EC8EF] bg-[#EAF5FF] px-5 py-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
            {mode === "net" && <span className="text-[#5E7393]">In <b className="text-emerald-700">{fmt(payments)}</b> · Out <b className="text-rose-600">{fmt(expenses)}</b></span>}
            <span className="font-bold uppercase tracking-wide text-[#5E7393]">{mode === "net" ? "Net" : "Total"}</span>
            <span className="text-base font-black text-[#1F3557]">{fmt(total)}</span>
          </div>
          <button type="button" onClick={onDownloadCsv} className="flex items-center gap-1.5 rounded-xl border border-[#9EC8EF] bg-white px-3 py-2 text-[11px] font-bold text-[#315C9F] hover:bg-[#C7E3FA]">
            <FileText className="h-3.5 w-3.5" /> Save as CSV
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
