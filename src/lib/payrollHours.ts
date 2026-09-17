import type { TimeClockLog } from "../types/domain";

/**
 * Splits worked time into Sunday-Saturday (or business-configured start day)
 * workweeks and separates regular vs. overtime hours (>40/week) within each.
 * The FLSA does not allow a biweekly 80-hour average -- each seven-day
 * workweek stands alone. Shared by payroll (App.tsx) and job costing
 * (jobCostingEngine.ts) so both price an hour of labor the same way.
 */
export function computePayrollHoursForRange(logs: TimeClockLog[], startDate: string, endDate: string, workweekStartDay: number): { hours: number; regularHours: number; overtimeHours: number } {
  const since = new Date(`${startDate}T00:00:00`);
  const through = new Date(`${endDate}T23:59:59.999`);
  const sorted = [...logs]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const weekHours = new Map<string, number>();
  let segmentStart: number | null = null;
  const addSegment = (startMs: number, endMs: number) => {
    let cursor = Math.max(startMs, since.getTime());
    while (cursor < endMs) {
      const date = new Date(cursor);
      const weekStart = new Date(date);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() - workweekStartDay + 7) % 7));
      const nextWeek = new Date(weekStart);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const sliceEnd = Math.min(endMs, nextWeek.getTime());
      const key = weekStart.toISOString().slice(0, 10);
      weekHours.set(key, (weekHours.get(key) || 0) + Math.max(0, sliceEnd - cursor) / 3600000);
      cursor = sliceEnd;
    }
  };
  for (const log of sorted) {
    const ts = new Date(log.timestamp).getTime();
    if (log.type === "Clock In" || log.type === "Break End") {
      segmentStart = Math.max(ts, since.getTime());
    } else if ((log.type === "Clock Out" || log.type === "Break Start") && segmentStart !== null) {
      if (ts >= since.getTime() && segmentStart <= through.getTime()) addSegment(segmentStart, Math.min(ts, through.getTime()));
      segmentStart = null;
    }
  }
  if (segmentStart !== null && segmentStart <= through.getTime()) addSegment(segmentStart, Math.min(Date.now(), through.getTime()));
  let regularHours = 0;
  let overtimeHours = 0;
  weekHours.forEach(hours => {
    regularHours += Math.min(hours, 40);
    overtimeHours += Math.max(0, hours - 40);
  });
  return { hours: regularHours + overtimeHours, regularHours, overtimeHours };
}
