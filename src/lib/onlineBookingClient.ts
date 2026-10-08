import { authedFetch } from "./apiClient";
import type { BookingConfirmation, BookingDayAvailability, OnlineBookingService } from "../types/onlineBooking";

/**
 * Client side of Online Booking. The Book Service UI (BookServiceFlow.tsx)
 * talks to a BookingApi, and each portal hands it the adapter for its own
 * authentication -- token link or signed-in Customer Account -- so both use
 * the exact same server pipeline (server/onlineBooking.ts) and UI.
 */

export interface BookingOptions {
  ok: boolean;
  error?: string;
  businessName?: string;
  services?: OnlineBookingService[];
  timeZone?: string;
  maxDaysAhead?: number;
  customer?: { name: string; phone: string; email: string; address: string };
}

export interface BookingAvailability {
  ok: boolean;
  error?: string;
  timeZone?: string;
  serviceId?: string;
  days?: BookingDayAvailability[];
}

export interface BookingSubmission {
  serviceId: string;
  date: string;
  startTime: string;
  address: string;
  description?: string;
  photos?: string[];
  name?: string;
  phone?: string;
  email?: string;
  idempotencyKey?: string;
}

export interface BookingResult {
  ok: boolean;
  error?: string;
  code?: "VALIDATION" | "DISABLED" | "SLOT_UNAVAILABLE" | "SERVER";
  confirmation?: BookingConfirmation;
  availability?: BookingDayAvailability[];
}

export interface BookingApi {
  getOptions(): Promise<BookingOptions>;
  getAvailability(serviceId: string, from: string, days?: number): Promise<BookingAvailability>;
  book(input: BookingSubmission): Promise<BookingResult>;
}

const OFFLINE = { ok: false, error: "Could not reach the server. Check your connection and try again." };

async function readJson<T>(promise: Promise<Response>): Promise<T> {
  try {
    const res = await promise;
    return await res.json();
  } catch {
    return OFFLINE as T;
  }
}

const query = (params: Record<string, string | number | undefined>) =>
  Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

export function portalBookingApi(token: string): BookingApi {
  const base = `/api/portal/${encodeURIComponent(token)}/booking`;
  return {
    getOptions: () => readJson(fetch(`${base}/options`)),
    getAvailability: (serviceId, from, days = 7) => readJson(fetch(`${base}/availability?${query({ serviceId, from, days })}`)),
    book: input => readJson(fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }))
  };
}

export function customerAccountBookingApi(businessId: string): BookingApi {
  const base = "/api/customer-accounts/booking";
  return {
    getOptions: () => readJson(authedFetch(`${base}/options?${query({ businessId })}`)),
    getAvailability: (serviceId, from, days = 7) => readJson(authedFetch(`${base}/availability?${query({ businessId, serviceId, from, days })}`)),
    book: input => readJson(authedFetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, businessId }) }))
  };
}

export function formatSlotTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatBookingDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric", year: "numeric" }): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export function newIdempotencyKey(): string {
  return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, "");
}
