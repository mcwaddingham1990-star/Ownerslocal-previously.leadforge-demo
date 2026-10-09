/**
 * Owner'sLOCAL's no-card free trial. Every new business gets full access for
 * FREE_TRIAL_DAYS days, counted from when the owner's login account was
 * created (Firebase Auth's own creation time -- set by Firebase, so it can't
 * be edited to stretch a trial). Shared by the server (subscription status)
 * and the app (banner, Billing page). Pure functions only.
 */
export const FREE_TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function freeTrialEndsAt(accountCreatedAtMs: number): number {
  return accountCreatedAtMs + FREE_TRIAL_DAYS * DAY_MS;
}

export function isFreeTrialActive(trialEndsAtMs: number | null | undefined, nowMs = Date.now()): boolean {
  return typeof trialEndsAtMs === "number" && Number.isFinite(trialEndsAtMs) && nowMs < trialEndsAtMs;
}

/** Whole days left, rounded up (so the last partial day shows as "1 day left"). */
export function freeTrialDaysLeft(trialEndsAtMs: number | null | undefined, nowMs = Date.now()): number {
  if (!isFreeTrialActive(trialEndsAtMs, nowMs)) return 0;
  return Math.ceil(((trialEndsAtMs as number) - nowMs) / DAY_MS);
}

/*
 * One free trial per business. A new business gets no trial when its
 * phone(s), business name(s), address(es) or owner email match a business
 * that signed up earlier. Values are normalized first so formatting tricks
 * don't count as "different": phones compare digits only, names ignore
 * punctuation/spacing and LLC/Inc-style endings, addresses treat
 * Street/St, Suite/Ste etc. as the same, and emails ignore +tags (and dots
 * for Gmail). Each value becomes a prefixed key ("p:", "n:", "a:", "e:")
 * so one list can be matched in a single query.
 */
export function normalizeTrialPhone(raw: string): string | null {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length >= 7 ? digits : null;
}

const NAME_SUFFIXES = /(llc|inc|incorporated|co|company|corp|corporation|ltd|limited|pllc|lp|llp)$/;
export function normalizeTrialBusinessName(raw: string): string | null {
  let name = String(raw || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
  for (let i = 0; i < 2 && NAME_SUFFIXES.test(name); i++) name = name.replace(NAME_SUFFIXES, "");
  name = name.replace(/^the/, "");
  return name.length >= 3 ? name : null;
}

const ADDRESS_WORDS: Record<string, string> = {
  street: "st", avenue: "ave", av: "ave", road: "rd", drive: "dr", boulevard: "blvd", lane: "ln", court: "ct",
  place: "pl", parkway: "pkwy", highway: "hwy", circle: "cir", terrace: "ter", trail: "trl", way: "wy",
  suite: "ste", apartment: "apt", unit: "unit", building: "bldg", floor: "fl",
  north: "n", south: "s", east: "e", west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw"
};
export function normalizeTrialAddress(raw: string): string | null {
  const words = String(raw || "").toLowerCase().replace(/#/g, " ste ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const joined = words.map(w => ADDRESS_WORDS[w] || w).join("");
  return joined.length >= 6 && /\d/.test(joined) ? joined : null;
}

export function normalizeTrialEmail(raw: string): string | null {
  const email = String(raw || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  let local = email.slice(0, at).split("+")[0];
  let domain = email.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return local ? `${local}@${domain}` : null;
}

export interface TrialIdentity {
  ownerEmail?: string;
  businessNames?: unknown;
  businessPhones?: unknown;
  ownerPhones?: unknown;
  businessAddresses?: unknown;
}

const asList = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : typeof value === "string" ? [value] : [];

/** Every normalized key identifying a business, e.g. ["e:john@gmail.com", "p:5552014432", "n:smithplumbing"]. */
export function trialIdentityKeys(identity: TrialIdentity): string[] {
  const keys = new Set<string>();
  const add = (prefix: string, value: string | null) => { if (value) keys.add(`${prefix}:${value}`); };
  add("e", normalizeTrialEmail(identity.ownerEmail || ""));
  for (const p of [...asList(identity.businessPhones), ...asList(identity.ownerPhones)]) add("p", normalizeTrialPhone(p));
  for (const n of asList(identity.businessNames)) add("n", normalizeTrialBusinessName(n));
  for (const a of asList(identity.businessAddresses)) add("a", normalizeTrialAddress(a));
  return [...keys];
}

export type TrialMatchField = "phone" | "business name" | "address" | "email";
const FIELD_BY_PREFIX: Record<string, TrialMatchField> = { p: "phone", n: "business name", a: "address", e: "email" };

/** The first key two businesses share, as a readable field name, or null. */
export function sharedTrialField(a: string[], b: string[]): TrialMatchField | null {
  const other = new Set(b);
  const hit = a.find(k => other.has(k));
  return hit ? FIELD_BY_PREFIX[hit.split(":")[0]] || null : null;
}
