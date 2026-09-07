export interface ScannedLineItem {
  name: string | null;
  sku: string | null;
  barcode: string | null;
  quantity: number | null;
  unit: string | null;
  unitCost: number | null;
  category: string | null;
  manufacturer: string | null;
}

export interface ScannedReceipt {
  vendor: string | null;
  purchaseDate: string | null;
  /** One entry per distinct line item on the receipt (or a single entry for
   *  a plain product label/barcode). */
  items: ScannedLineItem[];
  /** The receipt's own printed total (including tax) -- read directly, not
   *  computed by summing items, since many receipts never print a clean
   *  per-item price. This is what the logged expense should use. */
  total: number | null;
  unreadable: boolean;
}
