export interface EstimatePricingLine {
  quantity: number;
  unitPrice: number;
}

const money = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export function clampPercent(value: number | undefined | null): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, numeric));
}

export function calculateEstimatePricing(
  lineItems: EstimatePricingLine[] | undefined,
  discountPercent?: number,
  taxRate?: number
) {
  const subtotal = money((lineItems || []).reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    return sum + quantity * unitPrice;
  }, 0));

  const discountRate = clampPercent(discountPercent);
  const taxPercent = clampPercent(taxRate);
  const discountAmount = money(subtotal * discountRate / 100);
  const taxableAmount = money(Math.max(0, subtotal - discountAmount));
  const taxAmount = money(taxableAmount * taxPercent / 100);
  const total = money(taxableAmount + taxAmount);

  return {
    subtotal,
    discountPercent: discountRate,
    discountAmount,
    taxableAmount,
    taxRate: taxPercent,
    taxAmount,
    total
  };
}
