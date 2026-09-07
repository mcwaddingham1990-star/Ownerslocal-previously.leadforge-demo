import React, { useMemo, useState } from "react";
import { AlertCircle, Building2, CheckCircle, CreditCard, FileCheck2, Landmark, Loader2, Play, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection";
import { calculatePayrollLine, DEFAULT_TAX_CONFIG, totalPayroll, validatePayroll, PayrollSourceEmployee } from "../lib/payrollEngine";
import { PayrollRun, PayrollTaxConfig } from "../types/payroll";

interface Props {
  employees: PayrollSourceEmployee[];
}

const dateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const money = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "USD" });

export const PayrollWorkbench: React.FC<Props> = ({ employees }) => {
  const { businessId, loggedInUser } = useAuth();
  const [runs, setRuns] = useFirestoreCollection<PayrollRun>("payroll_runs", businessId);
  const today = new Date();
  const [periodEnd, setPeriodEnd] = useState(dateValue(today));
  const [periodStart, setPeriodStart] = useState(dateValue(new Date(today.getTime() - 13 * 86400000)));
  const [payDate, setPayDate] = useState(dateValue(new Date(today.getTime() + 2 * 86400000)));
  const [taxConfig, setTaxConfig] = useState<PayrollTaxConfig>(DEFAULT_TAX_CONFIG);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const draftLines = useMemo(
    () => employees
      .filter(employee => employee.hoursThisPayPeriod > 0 || employee.hourlyRate > 0)
      .map(employee => calculatePayrollLine(employee, taxConfig)),
    [employees, taxConfig]
  );
  const draftTotals = useMemo(() => totalPayroll(draftLines), [draftLines]);
  const selectedRun = runs.find(run => run.id === selectedRunId) || runs[0];

  const updateRate = (key: keyof PayrollTaxConfig, value: string) => {
    const parsed = Number(value);
    setTaxConfig(current => ({ ...current, [key]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 }));
  };

  const createDraft = () => {
    const errors = validatePayroll(draftLines);
    if (errors.length) {
      setNotice(errors.join(" "));
      return;
    }
    const now = new Date().toISOString();
    const id = `payroll_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const run: PayrollRun = {
      id,
      businessId,
      periodStart,
      periodEnd,
      payDate,
      status: "draft",
      taxConfig,
      lines: draftLines,
      totals: draftTotals,
      createdAt: now,
      createdBy: loggedInUser?.email || "unknown",
      auditLog: [{ at: now, by: loggedInUser?.email || "unknown", action: "draft_created", detail: "Calculated from current approved time-clock records and employee rates." }]
    };
    setRuns(previous => [run, ...previous]);
    setSelectedRunId(id);
    setNotice("Payroll draft created. Review every employee and tax rate before approval.");
  };

  const approveRun = (run: PayrollRun) => {
    if (run.status !== "draft") return;
    const errors = validatePayroll(run.lines);
    if (errors.length) {
      setNotice(errors.join(" "));
      return;
    }
    const now = new Date().toISOString();
    setRuns(previous => previous.map(item => item.id === run.id ? {
      ...item,
      status: "approved",
      approvedAt: now,
      approvedBy: loggedInUser?.email || "unknown",
      auditLog: [...item.auditLog, { at: now, by: loggedInUser?.email || "unknown", action: "approved", detail: "Authorized for payment-rail submission." }]
    } : item));
    setNotice("Payroll approved. It is ready for an ACH/check rail.");
  };

  const submitRun = async (run: PayrollRun) => {
    if (run.status !== "approved") return;
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/payroll/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: run.id,
          businessId,
          payDate: run.payDate,
          fundingAmount: run.totals.netPay + run.totals.taxLiability,
          taxAmount: run.totals.taxLiability,
          payments: run.lines.map(line => ({
            employeeId: line.employeeId,
            employeeName: line.employeeName,
            amount: line.netPay,
            method: line.paymentMethod
          }))
        })
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.message || (result.errors || []).join(" ") || "Payment rail rejected the batch.");
        return;
      }
      const now = new Date().toISOString();
      setRuns(previous => previous.map(item => item.id === run.id ? {
        ...item,
        status: "submitted",
        submittedAt: now,
        providerBatchId: result.providerBatchId,
        auditLog: [...item.auditLog, { at: now, by: loggedInUser?.email || "unknown", action: "submitted", detail: `Batch ${result.providerBatchId}` }]
      } : item));
      setNotice("Payroll batch submitted to the configured money rail.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Payroll submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-[#A9CDEE] overflow-hidden">
      <div className="p-5 bg-gradient-to-r from-[#1F3557] to-[#315C9F] text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><Landmark className="w-5 h-5" /><h3 className="font-black uppercase tracking-wider">Owners Native Payroll</h3></div>
          <p className="text-xs text-blue-100 mt-1">Time clock → calculation → approval → bank/tax disbursement batch</p>
        </div>
        <div className="flex gap-2 text-[10px] font-black uppercase">
          <span className="px-3 py-1.5 rounded-full bg-emerald-400/20 border border-emerald-300/40">Native engine active</span>
          <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/20">Rail-safe submission</span>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {notice && <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{notice}</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([["Period start", periodStart, setPeriodStart], ["Period end", periodEnd, setPeriodEnd], ["Pay date", payDate, setPayDate]] as const).map(([label, value, setter]) => (
            <label key={label} className="text-[10px] font-black uppercase text-slate-500">{label}
              <input type="date" value={value} onChange={event => setter(event.target.value)} className="mt-1 w-full p-2.5 rounded-xl border border-slate-200 text-xs text-slate-800" />
            </label>
          ))}
        </div>

        <div>
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[#342D7E] mb-2">Withholding and employer tax rates</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {([
              ["Federal withholding", "federalWithholdingRate"],
              ["State withholding", "stateWithholdingRate"],
              ["Local withholding", "localWithholdingRate"],
              ["Employee Social Security", "employeeSocialSecurityRate"],
              ["Employee Medicare", "employeeMedicareRate"],
              ["Employer Social Security", "employerSocialSecurityRate"],
              ["Employer Medicare", "employerMedicareRate"],
              ["Federal unemployment", "federalUnemploymentRate"],
              ["State unemployment", "stateUnemploymentRate"]
            ] as Array<[string, keyof PayrollTaxConfig]>).map(([label, key]) => (
              <label key={key} className="text-[9px] font-bold text-slate-500">{label}
                <div className="relative mt-1"><input type="number" min="0" step="0.01" value={taxConfig[key]} onChange={event => updateRate(key, event.target.value)} className="w-full p-2 pr-6 rounded-lg border border-slate-200 text-xs font-mono" /><span className="absolute right-2 top-2 text-slate-400">%</span></div>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">Federal/state/local withholding begins at 0 until the business enters its verified rates. Owners will not invent tax elections.</p>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-xs min-w-[850px]">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-500"><tr>
              <th className="p-3 text-left">Employee</th><th className="p-3 text-right">Regular</th><th className="p-3 text-right">OT</th><th className="p-3 text-right">Rate</th><th className="p-3 text-right">Gross</th><th className="p-3 text-right">Employee taxes</th><th className="p-3 text-right">Net pay</th><th className="p-3 text-right">Employer taxes</th>
            </tr></thead>
            <tbody>{draftLines.map(line => <tr key={line.employeeId} className="border-t border-slate-100">
              <td className="p-3 font-bold text-slate-800">{line.employeeName}</td>
              <td className="p-3 text-right font-mono">{line.regularHours.toFixed(2)}</td>
              <td className="p-3 text-right font-mono text-rose-600">{line.overtimeHours.toFixed(2)}</td>
              <td className="p-3 text-right font-mono">{money(line.hourlyRate)}</td>
              <td className="p-3 text-right font-mono font-bold">{money(line.grossPay)}</td>
              <td className="p-3 text-right font-mono">{money(line.totalDeductions)}</td>
              <td className="p-3 text-right font-mono font-black text-emerald-700">{money(line.netPay)}</td>
              <td className="p-3 text-right font-mono">{money(line.employerTaxes)}</td>
            </tr>)}</tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[["Gross payroll", draftTotals.grossPay], ["Employee taxes", draftTotals.employeeTaxes], ["Net deposits", draftTotals.netPay], ["Employer taxes", draftTotals.employerTaxes], ["Funding required", draftTotals.fundingRequired]].map(([label, value]) => (
            <div key={String(label)} className="p-3 rounded-xl bg-[#F5FAFF] border border-[#A9CDEE]/60"><p className="text-[9px] font-black uppercase text-slate-400">{label}</p><p className="font-mono font-black text-[#1F3557] mt-1">{money(Number(value))}</p></div>
          ))}
        </div>

        <button onClick={createDraft} className="w-full md:w-auto px-5 py-3 bg-[#315C9F] hover:bg-[#274b82] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2"><Play className="w-4 h-4" />Create reviewable pay run</button>

        {runs.length > 0 && <div className="border-t border-slate-200 pt-5 space-y-3">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[#342D7E]">Pay-run ledger</h4>
          {runs.map(run => <div key={run.id} onClick={() => setSelectedRunId(run.id)} className={`p-4 rounded-xl border cursor-pointer ${selectedRun?.id === run.id ? "border-[#315C9F] bg-blue-50/50" : "border-slate-200"}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div><p className="text-xs font-black text-slate-800">{run.periodStart} → {run.periodEnd}</p><p className="text-[10px] text-slate-500">Pay {run.payDate} · {run.lines.length} employees · {money(run.totals.fundingRequired)}</p></div>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-[9px] font-black uppercase w-fit">{run.status}</span>
            </div>
            {selectedRun?.id === run.id && <div className="mt-3 flex flex-wrap gap-2">
              {run.status === "draft" && <button onClick={event => { event.stopPropagation(); approveRun(run); }} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />Approve payroll</button>}
              {run.status === "approved" && <button disabled={submitting} onClick={event => { event.stopPropagation(); submitRun(run); }} className="px-4 py-2 rounded-lg bg-[#1F3557] disabled:opacity-50 text-white text-[10px] font-black uppercase flex items-center gap-1">{submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}Submit bank batch</button>}
              <button onClick={event => { event.stopPropagation(); window.print(); }} className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-[10px] font-black uppercase flex items-center gap-1"><FileCheck2 className="w-3.5 h-3.5" />Print pay-run report</button>
            </div>}
          </div>)}
        </div>}

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-600 flex gap-2">
          <Building2 className="w-4 h-4 shrink-0 text-[#315C9F]" />
          <span><strong>Money-movement guardrail:</strong> approval creates a balanced batch; submission moves funds only after an authorized ACH provider is configured server-side. Plaid/Stripe credentials never enter the browser.</span>
        </div>
      </div>
    </section>
  );
};
