/**
 * Contact-data normalization helpers used at UI/save/PDF boundaries.
 */

function canonicalPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/**
 * Normalize a single-phone field without destroying legitimate multiple
 * numbers. This catches the corruption patterns seen from mobile autofill
 * and repeated Customer phone rows:
 *
 *   (817) 555-1212(817) 555-1212
 *   (817) 555-1212, 817-555-1212
 *
 * Distinct phone numbers are preserved.
 */
export function normalizeContactPhone(value: string | undefined | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  // Customer records may contain multiple phone rows joined with commas.
  // De-duplicate those by normalized digits while preserving the first
  // human-readable formatting for each distinct number.
  const parts = raw.split(/\s*(?:,|;|\||\n)\s*/).map(part => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const part of parts) {
      const key = canonicalPhoneDigits(part);
      const stableKey = key.length >= 7 ? key : part.toLowerCase();
      if (seen.has(stableKey)) continue;
      seen.add(stableKey);
      unique.push(part);
    }
    return unique.join(", ");
  }

  // Also catch the same number appended directly twice, even when the two
  // copies use different punctuation. Compare digits, then cut the original
  // string at the point where half of those digits have been consumed.
  const digits = raw.replace(/\D/g, "");
  if (digits.length % 2 === 0) {
    const halfLength = digits.length / 2;
    if (halfLength >= 7 && halfLength <= 15) {
      const first = digits.slice(0, halfLength);
      const second = digits.slice(halfLength);
      if (first === second) {
        let consumed = 0;
        let boundary = 0;
        for (; boundary < raw.length; boundary++) {
          if (/\d/.test(raw[boundary])) consumed += 1;
          if (consumed === halfLength) {
            boundary += 1;
            break;
          }
        }
        return raw.slice(0, boundary).replace(/[\s,;|/\-]+$/g, "").trim();
      }
    }
  }

  return raw;
}

/**
 * Older customer/estimate code synthesized company values when Company was
 * blank. Known historical fallbacks were either "<customer name>" or
 * "<customer name> Inc". Suppress only those exact patterns when rendering
 * customer-facing estimate data.
 */
export function normalizeEstimateCompany(customerName: string, company: string | undefined | null): string {
  const cleanCompany = String(company || "").trim();
  if (!cleanCompany) return "";

  const cleanName = String(customerName || "").trim();
  if (!cleanName) return cleanCompany;

  const sameAsName = cleanCompany.localeCompare(cleanName, undefined, { sensitivity: "accent" }) === 0;
  const syntheticInc = cleanCompany.localeCompare(`${cleanName} Inc`, undefined, { sensitivity: "accent" }) === 0;
  return sameAsName || syntheticInc ? "" : cleanCompany;
}
