/**
 * Online Booking -- one configuration, stored on the business's own
 * business_profiles/{businessId} doc (field `onlineBooking`), right next to
 * the Website Lead Capture `webFormToken` it extends. The SAME config drives
 * both entry points (Customer Portal "Book Service" and the business's own
 * website via the lead-capture embed token), and the server
 * (server/onlineBooking.ts) is the only thing that ever turns it into
 * bookable slots -- the client only edits it.
 */

export type BookingSource = "Customer Portal" | "Website Booking";

export interface OnlineBookingService {
  id: string;
  name: string;
  durationMinutes: number;
  description?: string;
}

export interface OnlineBookingConfig {
  /** Master switch -- nothing is bookable (portal or website) while off. */
  enabled: boolean;
  /** Lets the business's own website book through the lead-capture embed token. */
  websiteEnabled: boolean;
  services: OnlineBookingService[];
  /** 0 = Sunday ... 6 = Saturday. */
  workingDays: number[];
  /** HH:MM (24-hour), business-local time. */
  dayStart: string;
  dayEnd: string;
  slotIntervalMinutes: number;
  /** Gap required between a booking and any other appointment. */
  bufferMinutes: number;
  /** How far ahead of "now" the earliest bookable slot must start. */
  minNoticeHours: number;
  maxDaysAhead: number;
  /** How many appointments may overlap at once (crews/technicians available). */
  capacity: number;
  /** IANA time zone the schedule's HH:MM times are in. */
  timeZone: string;
  /** When non-empty, website booking calls carrying a browser Origin must come from one of these. */
  allowedOrigins: string[];
}

export const BOOKING_TIME_ZONES: Array<{ id: string; label: string }> = [
  { id: "America/New_York", label: "Eastern (ET)" },
  { id: "America/Chicago", label: "Central (CT)" },
  { id: "America/Denver", label: "Mountain (MT)" },
  { id: "America/Phoenix", label: "Arizona (MST, no DST)" },
  { id: "America/Los_Angeles", label: "Pacific (PT)" },
  { id: "America/Anchorage", label: "Alaska (AKT)" },
  { id: "Pacific/Honolulu", label: "Hawaii (HST)" }
];

const DEFAULT_TIME_ZONE = "America/Los_Angeles";

/** Maps Settings > Company's free-text time-zone label ("Pacific Standard
 * Time (PST)") onto a real IANA zone so a business that never opened the
 * Online Booking settings still gets correct "is this slot in the past". */
export function timeZoneFromCompanyLabel(label: unknown): string {
  const text = String(label || "").toLowerCase();
  if (text.includes("eastern") || /\be[sd]?t\b/.test(text)) return "America/New_York";
  if (text.includes("central") || /\bc[sd]?t\b/.test(text)) return "America/Chicago";
  if (text.includes("arizona")) return "America/Phoenix";
  if (text.includes("mountain") || /\bm[sd]?t\b/.test(text)) return "America/Denver";
  if (text.includes("alaska")) return "America/Anchorage";
  if (text.includes("hawaii")) return "Pacific/Honolulu";
  return DEFAULT_TIME_ZONE;
}

function to24h(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** "08:00 AM - 05:00 PM" (Settings > Company > Business Hours) -> ["08:00", "17:00"]. */
export function parseBusinessHours(raw: unknown): { start: string; end: string } | null {
  const parts = String(raw || "").split(/\s*(?:-|–|to)\s*/i);
  if (parts.length !== 2) return null;
  const start = to24h(parts[0]);
  const end = to24h(parts[1]);
  if (!start || !end || start >= end) return null;
  return { start, end };
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function slugifyServiceId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "service";
}

export function normalizeOrigin(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The one place a stored (possibly partial, possibly hand-edited) config
 * becomes a safe, complete one. Server and client both call it, so the
 * Integrations editor always shows exactly what the booking engine enforces.
 */
export function normalizeOnlineBookingConfig(raw: unknown, companySettings?: any): OnlineBookingConfig {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const hours = parseBusinessHours(companySettings?.company?.businessHours) || { start: "08:00", end: "17:00" };

  let dayStart = HHMM.test(source.dayStart) ? source.dayStart : hours.start;
  let dayEnd = HHMM.test(source.dayEnd) ? source.dayEnd : hours.end;
  if (dayStart >= dayEnd) {
    dayStart = hours.start;
    dayEnd = hours.end;
  }

  const seenIds = new Set<string>();
  const services: OnlineBookingService[] = (Array.isArray(source.services) ? source.services : [])
    .map((service: any) => {
      const name = String(service?.name || "").trim().slice(0, 80);
      if (!name) return null;
      let id = String(service?.id || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || slugifyServiceId(name);
      while (seenIds.has(id)) id = `${id}-x`;
      seenIds.add(id);
      const description = String(service?.description || "").trim().slice(0, 240);
      return { id, name, durationMinutes: clampInt(service?.durationMinutes, 15, 480, 60), ...(description ? { description } : {}) };
    })
    .filter((service: OnlineBookingService | null): service is OnlineBookingService => !!service)
    .slice(0, 30);

  const workingDays = Array.isArray(source.workingDays)
    ? [...new Set<number>(source.workingDays.map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [1, 2, 3, 4, 5];

  const allowedOrigins = (Array.isArray(source.allowedOrigins) ? source.allowedOrigins : [])
    .map((origin: unknown) => normalizeOrigin(String(origin || "")))
    .filter((origin: string | null): origin is string => !!origin)
    .slice(0, 10);

  return {
    enabled: source.enabled === true,
    websiteEnabled: source.websiteEnabled === true,
    services: services.length ? services : [{ id: "service-visit", name: "Service Visit", durationMinutes: 60 }],
    workingDays,
    dayStart,
    dayEnd,
    slotIntervalMinutes: clampInt(source.slotIntervalMinutes, 15, 240, 30),
    bufferMinutes: clampInt(source.bufferMinutes, 0, 240, 0),
    minNoticeHours: clampInt(source.minNoticeHours, 0, 24 * 14, 2),
    maxDaysAhead: clampInt(source.maxDaysAhead, 1, 180, 30),
    capacity: clampInt(source.capacity, 1, 50, 1),
    timeZone: isValidTimeZone(source.timeZone) ? source.timeZone : timeZoneFromCompanyLabel(companySettings?.company?.timeZone),
    allowedOrigins
  };
}

/** What a booking returns to the customer / website on success. */
export interface BookingConfirmation {
  bookingId: string;
  jobId: string;
  jobNumber: string;
  businessName: string;
  serviceName: string;
  date: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  address: string;
  source: BookingSource;
}

export interface BookingSlot { startTime: string; endTime: string }
export interface BookingDayAvailability { date: string; slots: BookingSlot[] }
