/**
 * One shared Purchase Order system -- no separate version per page. A
 * Purchase Order is 100% user-created: no preset vendors, materials,
 * prices, or PO templates ship with the app.
 */

export type PurchaseOrderStatus = "Draft" | "Ordered" | "Partially Received" | "Received" | "Canceled";

export interface PurchaseOrderItem {
  id: string;
  description: string;
  /** Set when this line was picked from real Inventory -- receiving it
   * updates that same Inventory item's quantity and purchase history. A
   * custom typed-in item (no match in Inventory) leaves this unset. */
  inventoryId?: string;
  quantity: number;
  unitCost: number;
  /** Set once this line has been received -- may be less than `quantity`
   * for a partial receipt. Confirmed by the user at receiving time, never
   * assumed to match what was ordered. */
  receivedQuantity?: number;
  receivedUnitCost?: number;
  receivedAt?: string;
}

export type PurchaseOrderDeliveryMethod = "Delivery" | "Pickup";

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendor: string;
  vendorEmail?: string;
  vendorPhone?: string;
  date: string; // required
  sourceJobId?: string;
  sourceWorkOrderId?: string;
  requestedBy?: string;
  assignedEmployee?: string;
  items: PurchaseOrderItem[];
  deliveryMethod?: PurchaseOrderDeliveryMethod;
  expectedDate?: string;
  notes?: string;
  status: PurchaseOrderStatus;
  /** A photo/PDF of the vendor's receipt or invoice, attached directly to
   * this PO record (same size ceiling as every other inline base64 field --
   * see MAX_INLINE_BASE64_LENGTH). */
  receiptBase64?: string;
  receiptFilename?: string;
  /** Independent-copy links to whatever this PO's receiving created --
   * display/navigation only, same rule as every other source*Id link in
   * this app (never a live reference that gets re-synced). */
  linkedBillId?: string;
  linkedTransactionId?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  activity?: Array<{ id: string; timestamp: string; action: string; by: string; detail?: string }>;
}
