import { describe, expect, test } from "vitest";
import { advanceRecurringDate, planRepeatingExpense } from "../src/lib/recurringExpense";

const base = { id: "rec_1", amount: 1200, description: "Landlord", category: "Rent", createdAt: "2026-10-09T00:00:00Z" };

describe("repeating expenses", () => {
  test("a due date today or earlier logs the first one now and schedules the next due date after today", () => {
    const plan = planRepeatingExpense({ ...base, dueDate: "2026-10-01", frequency: "monthly", today: "2026-10-09" });
    expect(plan.logFirstNow).toBe(true);
    expect(plan.recurring.nextRunDate).toBe("2026-11-01");
    expect(plan.recurring.type).toBe("expense");
    expect(plan.recurring.payload.lineItems[0].unitPrice).toBe(1200);
  });

  test("an older due date never back-fills the missed months", () => {
    const plan = planRepeatingExpense({ ...base, dueDate: "2026-01-15", frequency: "monthly", today: "2026-10-09" });
    expect(plan.logFirstNow).toBe(true);
    expect(plan.recurring.nextRunDate).toBe("2026-10-15");
  });

  test("a future due date is only scheduled -- nothing is logged yet", () => {
    const plan = planRepeatingExpense({ ...base, dueDate: "2026-10-20", frequency: "weekly", today: "2026-10-09" });
    expect(plan.logFirstNow).toBe(false);
    expect(plan.recurring.nextRunDate).toBe("2026-10-20");
  });

  test("only the amount is needed", () => {
    const plan = planRepeatingExpense({ id: "rec_2", amount: 9.99, description: "", dueDate: "2026-10-09", frequency: "yearly", today: "2026-10-09", createdAt: "x" });
    expect(plan.recurring.templateName).toBe("Expense");
    expect(plan.recurring.payload.category).toBeUndefined();
    expect(plan.recurring.nextRunDate).toBe("2027-10-09");
  });

  test("due on the 31st lands on the last day of shorter months without skipping one", () => {
    expect(advanceRecurringDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceRecurringDate("2026-03-31", "quarterly")).toBe("2026-06-30");
    expect(advanceRecurringDate("2028-02-29", "yearly")).toBe("2029-02-28");
    expect(advanceRecurringDate("2026-10-09", "biweekly")).toBe("2026-10-23");
  });
});
