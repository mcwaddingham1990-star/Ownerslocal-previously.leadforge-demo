import type { RecurringTransaction } from "../types/accounting";

export type RecurringFrequency = RecurringTransaction["frequency"];

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
  quarterly: "Every 3 months",
  yearly: "Every year"
};

/** Same date math as server/recurringScheduler.ts's advanceDate(). */
export function advanceRecurringDate(date: string, frequency: RecurringFrequency): string {
  const next = new Date(`${date}T12:00:00Z`);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (frequency === "biweekly") next.setUTCDate(next.getUTCDate() + 14);
  const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : frequency === "yearly" ? 12 : 0;
  if (months) {
    // Due on the 31st -> the last day of shorter months, never skipping one.
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }
  return next.toISOString().slice(0, 10);
}

export interface RepeatingExpensePlan {
  /** True when the first due date is today or earlier: log that one now. */
  logFirstNow: boolean;
  recurring: RecurringTransaction;
}

/**
 * A repeating expense from Log Expense. The picked date is the day it's due.
 * If that day has already come, the first one is logged right away (dated
 * that day) and the schedule picks up at the next due date after today --
 * missed periods in between are never back-filled. A future date is logged
 * automatically when it arrives.
 */
export function planRepeatingExpense(params: {
  id: string;
  amount: number;
  description: string;
  category?: string;
  jobId?: string;
  dueDate: string;
  frequency: RecurringFrequency;
  today: string;
  createdAt: string;
  createdBy?: string;
}): RepeatingExpensePlan {
  const logFirstNow = params.dueDate <= params.today;
  let nextRunDate = params.dueDate;
  if (logFirstNow) {
    do nextRunDate = advanceRecurringDate(nextRunDate, params.frequency);
    while (nextRunDate <= params.today);
  }
  const name = params.description || params.category || "Expense";
  const recurring: RecurringTransaction = {
    id: params.id,
    type: "expense",
    templateName: name,
    frequency: params.frequency,
    nextRunDate,
    active: true,
    payload: {
      customerOrVendor: params.description,
      lineItems: [{ id: `${params.id}_line`, description: name, quantity: 1, unitPrice: params.amount }],
      ...(params.category ? { category: params.category } : {}),
      dueInDays: 0,
      ...(params.jobId ? { jobId: params.jobId } : {})
    },
    createdAt: params.createdAt,
    ...(params.createdBy ? { createdBy: params.createdBy } : {})
  };
  return { logFirstNow, recurring };
}
