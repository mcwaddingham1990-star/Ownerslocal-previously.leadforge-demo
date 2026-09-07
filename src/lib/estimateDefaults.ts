// Shared by every path that creates an Estimate -- the manual "Add
// Estimate" form, Lead -> Estimate conversion, and AI Snapshot intake --
// so a new estimate's number and dates are generated the exact same way
// regardless of which screen created it.

export function generateEstimateNumber(): string {
  return `EST-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
}

export function formatEstimateDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function estimateExpirationDate(from: Date = new Date()): string {
  return formatEstimateDate(new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000));
}
