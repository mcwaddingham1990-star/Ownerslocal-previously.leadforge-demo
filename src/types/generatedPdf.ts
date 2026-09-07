export interface GeneratedPdfDraft {
  filename: string;
  title: string;
  lines: string[];
  customerName: string;
  representativeName: string;
  sourceType: "Estimate" | "Invoice" | "Job" | "Customer" | "Lead" | "Report";
  sourceId: string;
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
}
