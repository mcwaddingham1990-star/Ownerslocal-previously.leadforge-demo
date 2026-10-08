export interface GeneratedPdfDraft {
  filename: string;
  title: string;
  lines: string[];
  customerName: string;
  representativeName: string;
  sourceType: "Estimate" | "Invoice" | "Job" | "Work Order" | "Service Agreement" | "Purchase Order" | "Customer" | "Lead" | "Report";
  sourceId: string;
  /** Existing Documents record for this generated PDF, when one was already created before opening the editor. */
  documentId?: string;
  /** Customer contact info, when known, so the PDF Editor's "Send" button
   * and remote-signing link can go straight to them without another lookup. */
  customerPhone?: string;
  customerEmail?: string;
  /** Real, already-built PDF bytes (base64) -- e.g. from src/lib/pdfExport.ts.
   * When present, the PDF Editor opens with this real document loaded
   * (via initialPdfBase64) instead of a plain-text draft, and no signature
   * fields are pre-seeded -- generating the PDF never requires signing. */
  pdfBase64?: string;
  /** When true, the PDF Editor auto-seeds the standard 2-party signature +
   * initials lines on open (same fields "Capture Signatures" adds manually)
   * so a "Collect Signatures" action lands the user straight on a
   * ready-to-sign document instead of a blank editor. */
  autoCaptureSignatures?: boolean;
  /** When true (alongside autoCaptureSignatures), also opens the "How will
   * the customer sign?" chooser (send remote / in person typed / in person
   * drawn) as soon as the fields are seeded -- lands the user straight on
   * that real choice instead of requiring an extra "Save & Prepare for
   * Signing" click first. Used by the front-door eSign prompts (Estimate
   * Send/Convert to Job, Invoice Send) so picking "Send for Remote eSign" or
   * "Sign in Person" there goes straight into the actual signing setup. */
  autoOpenSignSetup?: boolean;
  /** Force the PDF Editor into the focused in-person signing flow. This is
   * intentionally separate from autoOpenSignSetup so a caller can say
   * "Collect Signatures" and never fall into the remote Text/Email chooser. */
  signatureOnlyMode?: boolean;
}

/** Handoff for opening the Estimate form pre-filled from another page (e.g.
 * a Lead's "Build Estimate" button) -- mirrors GeneratedPdfDraft's pattern:
 * one page sets it and navigates, the destination page consumes it on
 * mount and clears it. */
export interface EstimatePrefill {
  customerName: string;
  company?: string;
  phone?: string;
  address?: string;
  notes?: string;
  sourceLeadId?: string;
  /** Opens the form as a change order for this Job id (Estimate.changeOrderForJobId). */
  changeOrderForJobId?: string;
  /** Job number shown on the change-order banner, e.g. "JOB-123456". */
  changeOrderJobLabel?: string;
}

/** Handoff for opening the single shared "Build Job" modal (BuildJobModal)
 * pre-filled from wherever it was triggered -- a Lead, a Customer card, or
 * an accepted Estimate -- same one-page-sets-it/one-page-consumes-it
 * pattern as EstimatePrefill. Every entry point in the app queues this and
 * navigates to Jobs, which is the only page that renders BuildJobModal, so
 * the popup itself is always the exact same component no matter where the
 * request came from. */
export interface BuildJobPrefill {
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  title?: string;
  description?: string;
  notes?: string;
  budget?: number;
  sourceEstimateId?: string;
  sourceLeadId?: string;
  source?: import("./domain").LeadSource;
  /** Booking a visit for a Service Agreement -- carried onto the new Job. */
  sourceMembershipId?: string;
}
