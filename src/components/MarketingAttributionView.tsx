import React, { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { Lead, Customer, Estimate, SchedulingEvent, EmployeeRecord, TimeClockLog, Transaction } from "../types/domain";
import type { Invoice } from "../types/accounting";
import { ALL_LEAD_SOURCES, computeAttributionRows, type AttributionFilters } from "../lib/marketingAttribution";

export interface MarketingAttributionViewProps {
  leads: Lead[];
  customers: Customer[];
  estimates: Estimate[];
  jobs: SchedulingEvent[];
  invoices: Invoice[];
  timeClockLogs: TimeClockLog[];
  employees: EmployeeRecord[];
  transactions: Transaction[];
  payrollWorkweekStart: number;
}

const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Guards against CSV/Excel "formula injection" -- same approach as
// AccountingPage's own exportCsv, since these source labels can ultimately
// trace back to unauthenticated input (the public website lead form).
const csvEscape = (value: string) => {
  const raw = String(value ?? "");
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
};

export const MarketingAttributionView: React.FC<MarketingAttributionViewProps> = (data) => {
  const [source, setSource] = useState<string>("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [employee, setEmployee] = useState("");
  const [jobType, setJobType] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [wonLost, setWonLost] = useState<"All" | "Won" | "Lost">("All");

  const employeeOptions = useMemo(() => {
    const set = new Set<string>();
    data.jobs.forEach(j => j.assignedEmployee && set.add(j.assignedEmployee));
    data.estimates.forEach(e => e.salesRep && set.add(e.salesRep));
    return Array.from(set).sort();
  }, [data.jobs, data.estimates]);

  const jobTypeOptions = useMemo(() => {
    const set = new Set<string>();
    data.jobs.forEach(j => j.jobType && set.add(j.jobType));
    return Array.from(set).sort();
  }, [data.jobs]);

  const filters: AttributionFilters = {
    source: source as AttributionFilters["source"],
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    employee: employee || undefined,
    jobType: jobType || undefined,
    customerId: customerId || undefined,
    wonLost
  };

  const rows = useMemo(() => computeAttributionRows(data, filters), [data, filters]);

  const totals = rows.reduce((acc, r) => ({
    leads: acc.leads + r.leads,
    estimatesSent: acc.estimatesSent + r.estimatesSent,
    jobsWon: acc.jobsWon + r.jobsWon,
    revenue: acc.revenue + r.revenue,
    grossProfit: acc.grossProfit + r.grossProfit
  }), { leads: 0, estimatesSent: 0, jobsWon: 0, revenue: 0, grossProfit: 0 });

  const exportCsv = () => {
    const header = ["Source", "Leads", "Estimates Sent", "Jobs Won", "Revenue", "Gross Profit", "Conversion Rate", "Avg Job Value"];
    const lines = [header.join(",")];
    rows.forEach(r => {
      lines.push([
        csvEscape(r.source), r.leads, r.estimatesSent, r.jobsWon,
        r.revenue.toFixed(2), r.grossProfit.toFixed(2), `${r.conversionRate.toFixed(1)}%`, r.avgJobValue.toFixed(2)
      ].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "marketing_attribution.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-[#9EC8EF] bg-white p-3">
        <Field label="Source">
          <select value={source} onChange={e => setSource(e.target.value)} className="input">
            <option value="All">All Sources</option>
            {ALL_LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="From">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" />
        </Field>
        <Field label="To">
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" />
        </Field>
        <Field label="Employee / Sales Rep">
          <select value={employee} onChange={e => setEmployee(e.target.value)} className="input">
            <option value="">All</option>
            {employeeOptions.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </Field>
        <Field label="Job Type">
          <select value={jobType} onChange={e => setJobType(e.target.value)} className="input">
            <option value="">All</option>
            {jobTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Customer">
          <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="input">
            <option value="">All</option>
            {data.customers.map(c => <option key={c.id} value={c.id}>{c.contact || c.company}</option>)}
          </select>
        </Field>
        <Field label="Won / Lost">
          <select value={wonLost} onChange={e => setWonLost(e.target.value as "All" | "Won" | "Lost")} className="input">
            <option value="All">All</option>
            <option value="Won">Won</option>
            <option value="Lost">Lost</option>
          </select>
        </Field>
        <button onClick={exportCsv} className="ml-auto flex items-center gap-1.5 rounded-xl border border-[#9EC8EF] bg-[#EAF5FF] px-3 py-2 text-xs font-bold text-[#315C9F]">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Leads", totals.leads.toLocaleString()],
          ["Estimates Sent", totals.estimatesSent.toLocaleString()],
          ["Jobs Won", totals.jobsWon.toLocaleString()],
          ["Revenue", fmt(totals.revenue)],
          ["Gross Profit", fmt(totals.grossProfit)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[#9EC8EF] bg-white p-3 text-center">
            <p className="text-[9px] font-bold uppercase text-[#5E7393]">{label}</p>
            <p className="mt-1 text-sm font-black text-[#1F3557]">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#9EC8EF] bg-white">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead>
            <tr className="bg-[#EAF5FF] text-[10px] font-bold uppercase text-[#1F3557]">
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3 text-right">Leads</th>
              <th className="px-4 py-3 text-right">Estimates Sent</th>
              <th className="px-4 py-3 text-right">Jobs Won</th>
              <th className="px-4 py-3 text-right">Revenue</th>
              <th className="px-4 py-3 text-right">Gross Profit</th>
              <th className="px-4 py-3 text-right">Conversion Rate</th>
              <th className="px-4 py-3 text-right">Avg Job Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#9EC8EF]/30">
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-[#5E7393]">No data matches these filters yet.</td></tr>}
            {rows.map(r => (
              <tr key={r.source} className="hover:bg-[#EAF5FF]/60">
                <td className="px-4 py-3 font-black text-[#1F3557]">{r.source}</td>
                <td className="px-4 py-3 text-right font-mono">{r.leads}</td>
                <td className="px-4 py-3 text-right font-mono">{r.estimatesSent}</td>
                <td className="px-4 py-3 text-right font-mono">{r.jobsWon}</td>
                <td className="px-4 py-3 text-right font-mono font-bold">{fmt(r.revenue)}</td>
                <td className={`px-4 py-3 text-right font-mono font-bold ${r.grossProfit < 0 ? "text-rose-600" : "text-emerald-700"}`}>{fmt(r.grossProfit)}</td>
                <td className="px-4 py-3 text-right font-mono">{r.conversionRate.toFixed(1)}%</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(r.avgJobValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1">
    <span className="text-[9px] font-bold uppercase tracking-wider text-[#5E7393]">{label}</span>
    {children}
  </label>
);
