// Thin client for the two paywall-bypass server routes -- see
// server/paywallBypass.ts for what actually validates/stores these.
import { authedFetch } from "./apiClient";

// Flat shape with an optional error, not a discriminated union on `success`
// -- this repo's tsconfig doesn't enable strictNullChecks, which weakens
// control-flow narrowing on a `{success:true}|{success:false;error}` union
// (`if (!result.success) result.error` doesn't reliably narrow without it).
// A plain optional field sidesteps that entirely.
export interface PaywallActionResult {
  success: boolean;
  error?: string;
  bypassExpiresAt?: number;
  accessDays?: number;
}

export async function redeemBypassCode(code: string): Promise<PaywallActionResult> {
  try {
    const res = await authedFetch("/api/paywall/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || "Could not redeem that code." };
    return { success: true, bypassExpiresAt: data.bypassExpiresAt, accessDays: data.accessDays };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Could not redeem that code." };
  }
}

export async function setBypassCode(newCode: string, kind: "standard" | "trial" | "secondary" = "standard"): Promise<PaywallActionResult> {
  try {
    const res = await authedFetch("/api/paywall/set-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newCode, kind }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || "Could not set the access code." };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Could not set the access code." };
  }
}
