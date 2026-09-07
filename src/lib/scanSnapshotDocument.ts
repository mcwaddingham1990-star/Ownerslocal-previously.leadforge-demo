import type { DocumentItem } from "../types/domain";

const extensionFor = (mimeType: string) => (mimeType === "image/png" ? "png" : "jpg");

const sanitizeFilenamePart = (value: string) => value.replace(/[\\/:*?"<>|]+/g, "-").trim();

// Firestore caps a single document at ~1 MiB, and this photo is stored
// inline as a base64 data URL on the documents/{id} record. Skip saving the
// snapshot rather than attempt a write that will be silently rejected --
// the underlying receipt/bill/expense record itself still saves fine either way.
export const SNAPSHOT_PHOTO_MAX_BASE64_LENGTH = 900_000;

/**
 * Builds the Documents Hub record for the original photo behind an AI scan
 * (receipt, invoice, bill, check) -- filed under the Snapshots folder, named
 * "{date} {vendor}" so a stack of scans stays sortable and identifiable at a
 * glance without opening each one.
 */
export function buildScanSnapshotDocument(params: {
  photoBase64: string;
  mimeType: string;
  vendor?: string | null;
  date?: string | null;
  docType: "Receipts" | "Invoices" | "Bills" | "Checks";
  uploadedBy?: string;
}): DocumentItem {
  const date = params.date || new Date().toISOString().slice(0, 10);
  const vendor = sanitizeFilenamePart(params.vendor?.trim() || "Unknown Vendor");
  const ext = extensionFor(params.mimeType);
  const now = new Date().toISOString();
  return {
    id: `doc_scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: `${date} ${vendor}.${ext}`,
    customer: "None",
    employee: params.uploadedBy || "AI Scan",
    vendor: params.vendor || "None",
    job: "None",
    type: params.docType,
    folder: "Snapshots",
    uploadedBy: params.uploadedBy || "AI Scan",
    date,
    size: `${Math.max(1, Math.ceil((params.photoBase64.length * 0.75) / 1024))} KB`,
    status: "Unsigned",
    isFavorite: false,
    isArchived: false,
    notes: `Original photo captured via AI scan (${params.docType}).`,
    tags: ["AI Scan", params.docType],
    estimateId: "None",
    invoiceId: "None",
    lastModified: now,
    url: `data:${params.mimeType};base64,${params.photoBase64}`
  };
}
