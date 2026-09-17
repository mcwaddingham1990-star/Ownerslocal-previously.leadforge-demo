/**
 * Human-readable age of a real GPS fix ("Live", "3m ago", ...) -- never
 * invented for a fix that doesn't exist, callers only pass a real timestamp.
 * Shared by the Interactive Map and the Employee Locations page so a fix's
 * age reads identically everywhere it's shown.
 */
export function formatFixAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "Live";
  if (ms < 90000) return "Live";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
