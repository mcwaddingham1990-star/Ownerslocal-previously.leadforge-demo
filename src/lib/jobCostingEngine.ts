import type { SchedulingEvent, Estimate, TimeClockLog, EmployeeRecord, Transaction } from "../types/domain";

export interface JobCostBreakdown {
  estimatedRevenue: number;
  laborHours: number;
  laborCost: number;
  materialCost: number;
  otherCost: number;
  totalCost: number;
  grossProfit: number;
  /** null when there's no revenue basis yet (no estimate/budget) to measure against. */
  marginPercent: number | null;
}

function weekStartKey(ts: number, workweekStartDay: number): { key: string; nextWeekMs: number } {
  const weekStart = new Date(ts);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() - workweekStartDay + 7) % 7));
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(nextWeek.getDate() + 7);
  return { key: weekStart.toISOString().slice(0, 10), nextWeekMs: nextWeek.getTime() };
}

/**
 * Per FLSA workweek (same Sun-Sat-or-configured-start bucketing payroll
 * uses), how many hours this ONE employee worked in total that week versus
 * how many of those hours were on this specific job.
 *
 * This has to walk the employee's FULL log history, not just entries tagged
 * with this job's id: Clock Out/Break Start events never carry a jobId (only
 * Clock In does — see TimeClockPage.tsx's performClockIn/performClockOut) --
 * filtering to `jobId === job.id` first would strand every real clock-in
 * without its matching clock-out and undercount hours to nearly zero. So a
 * segment's job is whatever job its opening Clock In (or the Clock In that
 * started the shift a Break End resumes) carried, tracked across all logs.
 */
function weeklyHoursForEmployee(allLogsForEmployee: TimeClockLog[], jobId: string, workweekStartDay: number): Map<string, { totalHours: number; jobHours: number }> {
  const sorted = [...allLogsForEmployee].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const weeks = new Map<string, { totalHours: number; jobHours: number }>();
  let segmentStart: number | null = null;
  let segmentJobId: string | undefined;

  const addSegment = (startMs: number, endMs: number, segJobId: string | undefined) => {
    let cursor = startMs;
    while (cursor < endMs) {
      const { key, nextWeekMs } = weekStartKey(cursor, workweekStartDay);
      const sliceEnd = Math.min(endMs, nextWeekMs);
      const hrs = Math.max(0, sliceEnd - cursor) / 3600000;
      const bucket = weeks.get(key) || { totalHours: 0, jobHours: 0 };
      bucket.totalHours += hrs;
      if (segJobId === jobId) bucket.jobHours += hrs;
      weeks.set(key, bucket);
      cursor = sliceEnd;
    }
  };

  for (const log of sorted) {
    const ts = new Date(log.timestamp).getTime();
    if (log.type === "Clock In") {
      segmentStart = ts;
      segmentJobId = log.jobId;
    } else if (log.type === "Break End") {
      segmentStart = ts; // segmentJobId carries forward from the shift's Clock In
    } else if ((log.type === "Clock Out" || log.type === "Break Start") && segmentStart !== null) {
      addSegment(segmentStart, ts, segmentJobId);
      segmentStart = null;
      if (log.type === "Clock Out") segmentJobId = undefined;
    }
  }
  if (segmentStart !== null) addSegment(segmentStart, Date.now(), segmentJobId);
  return weeks;
}

/**
 * Actual job profitability from the same linked records already shown
 * elsewhere on the job (Materials & Inventory section, Time Clock, Log
 * Transaction) -- nothing here is a duplicate record, it's a read-time
 * rollup: Estimated Revenue - Labor - Materials - Other Costs = Gross Profit.
 *
 * Labor cost is computed per FLSA workweek, matching real payroll's
 * regular/overtime split (>40 hrs/week) exactly for the employee's total
 * hours, then allocates that week's overtime premium across whichever jobs
 * they worked that week in proportion to hours worked on each -- so it
 * reconciles to actual payroll dollars for hours that are job-linked,
 * instead of (wrongly) treating each job as if it were the employee's whole
 * workweek. Every hour on the job is billed at full rate; only the extra
 * 0.5x overtime premium is shared proportionally.
 *
 * Materials reuse job.materials[] (same field JobsPage already reduces for
 * its "Materials Used" tile). Other costs are job-linked expense
 * Transactions (Transaction.jobId, set from the Log Expense form), excluding
 * payroll-sourced transactions so labor isn't counted twice.
 */
export function computeJobCosting(
  job: SchedulingEvent,
  estimates: Estimate[],
  timeClockLogs: TimeClockLog[],
  employees: EmployeeRecord[],
  transactions: Transaction[],
  payrollWorkweekStart: number
): JobCostBreakdown {
  const estimatedRevenue = estimates.find(e => e.id === job.sourceEstimateId)?.amount || job.budget || 0;

  const employeeEmails = Array.from(new Set(
    timeClockLogs.filter(l => l.jobId === job.id).map(l => l.employeeEmail)
  ));
  let laborHours = 0;
  let laborCost = 0;
  for (const email of employeeEmails) {
    const rate = employees.find(e => e.email === email)?.hourlyRate;
    if (!rate) continue;
    const allLogsForEmployee = timeClockLogs.filter(l => l.employeeEmail === email);
    const weeks = weeklyHoursForEmployee(allLogsForEmployee, job.id, payrollWorkweekStart);
    weeks.forEach(({ totalHours, jobHours }) => {
      if (jobHours <= 0) return;
      laborHours += jobHours;
      // Every hour on the job bills at full rate; the week's overtime
      // premium (the extra 0.5x on hours past 40) is shared proportionally
      // by each job's fraction of that week's total hours.
      const overtimeHours = Math.max(0, totalHours - 40);
      const weeklyOtPremium = overtimeHours * rate * 0.5;
      const jobShare = totalHours > 0 ? jobHours / totalHours : 0;
      laborCost += jobHours * rate + weeklyOtPremium * jobShare;
    });
  }

  const materialCost = (job.materials || []).reduce((s, m) => s + m.quantity * m.unitCost, 0);

  const otherCost = transactions
    .filter(t => t.type === "expense" && t.jobId === job.id && t.source !== "payroll")
    .reduce((s, t) => s + t.amount, 0);

  const totalCost = laborCost + materialCost + otherCost;
  const grossProfit = estimatedRevenue - totalCost;
  const marginPercent = estimatedRevenue > 0 ? (grossProfit / estimatedRevenue) * 100 : null;

  return { estimatedRevenue, laborHours, laborCost, materialCost, otherCost, totalCost, grossProfit, marginPercent };
}
