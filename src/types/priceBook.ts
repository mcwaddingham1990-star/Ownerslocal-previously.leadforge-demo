/**
 * One shared Flat Rate Price Book, reused everywhere instead of a
 * per-page version. Starts completely empty -- no preset services,
 * prices, materials, labor, or roles ship with it.
 */
export interface PriceBookFolder {
  id: string;
  name: string;
  createdAt: string;
}

/** The business's own internal cost breakdown for a pricing model -- what
 * it actually costs to deliver, as opposed to sellingPrice (what the
 * customer is charged). Used for the business's own records and, when a
 * model is added to a job's Job Costing, to route real cost data into the
 * job (materials -> job.materials[], labor/other -> a job-linked expense). */
export interface PriceBookLineItem {
  id: string;
  kind: "labor" | "material" | "other";
  description: string;
  quantity: number;
  unitCost: number;
}

export interface PriceBookCustomField {
  key: string;
  value: string;
}

export interface PriceBookModel {
  id: string;
  folderId?: string; // undefined = Unfiled
  name: string;
  description?: string;
  lineItems: PriceBookLineItem[];
  sellingPrice: number;
  notes?: string;
  customFields?: PriceBookCustomField[];
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
}

/** What "Add Flat Rate Pricing Model" actually drops into a document --
 * one line item (the flat rate the customer is charged), tagged with
 * which master model it came from for display only. This is an
 * independent copy from the moment it's created: nothing here is a live
 * reference back to the PriceBookModel, so editing it later never
 * changes the master model in the Price Book. */
export interface AppliedPriceBookItem {
  id: string;
  priceBookModelId: string;
  description: string;
  quantity: number;
  unitPrice: number;
}
