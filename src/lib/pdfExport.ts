// Real PDF generation/merging, backed by pdf-lib -- every function here
// produces actual PDF bytes from real record data (never a placeholder or
// sample document). Used by every "Generate PDF" / "Compile Documents"
// button across Estimates, Accounting (Invoices), Customers, and Documents.
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, RGB } from "pdf-lib";
import type { Estimate, Customer, DocumentItem, Lead, MissedCallEvent, TextMessage } from "../types/domain";
import type { Invoice, InvoiceLineItem } from "../types/accounting";
import { normalizeContactPhone, normalizeEstimateCompany } from "./contactNormalization";
import { calculateEstimatePricing } from "./estimatePricing";

export interface BusinessProfile {
  name: string;
  phone: string;
  address: string;
  email: string;
  logo: string;
}

const PAGE_W = 612; // US Letter, points (72/inch)
const PAGE_H = 792;
const MARGIN = 54;
const NAVY: RGB = rgb(0.121, 0.208, 0.341); // #1F3557
const SLATE: RGB = rgb(0.369, 0.451, 0.576); // #5E7393
const LINE: RGB = rgb(0.62, 0.784, 0.937); // #9EC8EF

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const cleanBase64 = base64.includes(",") ? base64.split(",").pop() || "" : base64;
  const binary = atob(cleanBase64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function tryEmbedLogo(doc: PDFDocument, logoUrl: string) {
  if (!logoUrl) return null;
  try {
    if (logoUrl.startsWith("data:image/png")) return await doc.embedPng(base64ToBytes(logoUrl.split(",")[1] || ""));
    if (logoUrl.startsWith("data:image/jpeg") || logoUrl.startsWith("data:image/jpg")) return await doc.embedJpg(base64ToBytes(logoUrl.split(",")[1] || ""));
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("png") || /\.png($|\?)/i.test(logoUrl)) return await doc.embedPng(bytes);
    return await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

/** A small flowed-text page writer: wraps long lines, starts a new page when the current one runs out of room, and returns the live cursor so callers can keep writing after it. */
class PdfWriter {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
  pages: PDFPage[] = [];
  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont, page: PDFPage) {
    this.doc = doc; this.font = font; this.bold = bold; this.page = page; this.y = PAGE_H - MARGIN;
    this.pages.push(page);
  }
  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN;
  }
  ensureRoom(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }
  wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
  text(value: string, opts: { size?: number; font?: PDFFont; color?: RGB; gap?: number; x?: number; maxWidth?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.font ?? this.font;
    const color = opts.color ?? NAVY;
    const x = opts.x ?? MARGIN;
    const maxWidth = opts.maxWidth ?? PAGE_W - MARGIN * 2 - (x - MARGIN);
    const lines = String(value || "").split(/\r?\n/).flatMap(line => this.wrapLine(line, font, size, maxWidth));
    for (const line of lines) {
      this.ensureRoom(size + 4);
      this.page.drawText(line, { x, y: this.y, size, font, color });
      this.y -= size + 4;
    }
    this.y -= opts.gap ?? 0;
  }
  heading(value: string, size = 13) {
    this.ensureRoom(size + 10);
    this.text(value, { size, font: this.bold, color: NAVY, gap: 6 });
  }
  rule() {
    this.ensureRoom(10);
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_W - MARGIN, y: this.y }, thickness: 0.75, color: LINE });
    this.y -= 12;
  }
  spacer(h = 10) {
    this.ensureRoom(h);
    this.y -= h;
  }
}

async function drawLetterhead(writer: PdfWriter, business: BusinessProfile, docTitle: string, docNumber: string) {
  const logo = await tryEmbedLogo(writer.doc, business.logo);
  let textX = MARGIN;
  if (logo) {
    const logoH = 40;
    const logoW = (logo.width / logo.height) * logoH;
    writer.page.drawImage(logo, { x: MARGIN, y: writer.y - logoH + 8, width: logoW, height: logoH });
    textX = MARGIN + logoW + 14;
  }
  writer.page.drawText(business.name || "Your Business", { x: textX, y: writer.y, size: 15, font: writer.bold, color: NAVY });
  writer.y -= 18;
  const contactLine = [business.address, business.phone, business.email].filter(Boolean).join("   ·   ");
  if (contactLine) {
    writer.page.drawText(contactLine, { x: textX, y: writer.y, size: 8.5, font: writer.font, color: SLATE });
  }
  writer.y -= 30;
  writer.page.drawText(docTitle, { x: PAGE_W - MARGIN - writer.bold.widthOfTextAtSize(docTitle, 16), y: writer.y + 18, size: 16, font: writer.bold, color: NAVY });
  if (docNumber) {
    writer.page.drawText(docNumber, { x: PAGE_W - MARGIN - writer.font.widthOfTextAtSize(docNumber, 9), y: writer.y, size: 9, font: writer.font, color: SLATE });
  }
  writer.rule();
}

function money(n: number): string {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function drawLineItemsTable(writer: PdfWriter, items: InvoiceLineItem[], taxRate: number, discountPercent = 0) {
  const colDesc = MARGIN, colQty = PAGE_W - MARGIN - 210, colPrice = PAGE_W - MARGIN - 140, colTotal = PAGE_W - MARGIN - 70;
  writer.ensureRoom(24);
  writer.page.drawRectangle({ x: MARGIN, y: writer.y - 4, width: PAGE_W - MARGIN * 2, height: 20, color: rgb(0.918, 0.961, 1) });
  writer.page.drawText("Description", { x: colDesc + 6, y: writer.y, size: 8.5, font: writer.bold, color: NAVY });
  writer.page.drawText("Qty", { x: colQty, y: writer.y, size: 8.5, font: writer.bold, color: NAVY });
  writer.page.drawText("Unit Price", { x: colPrice, y: writer.y, size: 8.5, font: writer.bold, color: NAVY });
  writer.page.drawText("Total", { x: colTotal, y: writer.y, size: 8.5, font: writer.bold, color: NAVY });
  writer.y -= 22;
  for (const item of items) {
    const lineTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0);
    const descLines = writer.wrapLine(item.description || "—", writer.font, 9.5, colQty - colDesc - 12);
    writer.ensureRoom(descLines.length * 12 + 6);
    descLines.forEach((line, i) => {
      writer.page.drawText(line, { x: colDesc + 6, y: writer.y - i * 12, size: 9.5, font: writer.font, color: NAVY });
    });
    writer.page.drawText(String(item.quantity ?? ""), { x: colQty, y: writer.y, size: 9.5, font: writer.font, color: NAVY });
    writer.page.drawText(money(item.unitPrice), { x: colPrice, y: writer.y, size: 9.5, font: writer.font, color: NAVY });
    writer.page.drawText(money(lineTotal), { x: colTotal, y: writer.y, size: 9.5, font: writer.font, color: NAVY });
    writer.y -= descLines.length * 12 + 6;
  }
  writer.rule();
  const pricing = calculateEstimatePricing(items, discountPercent, taxRate);
  const summaryX = colPrice;
  const row = (label: string, value: string, bold = false) => {
    writer.ensureRoom(16);
    writer.page.drawText(label, { x: summaryX, y: writer.y, size: 9.5, font: bold ? writer.bold : writer.font, color: bold ? NAVY : SLATE });
    writer.page.drawText(value, { x: colTotal, y: writer.y, size: 9.5, font: bold ? writer.bold : writer.font, color: NAVY });
    writer.y -= 15;
  };
  row("Subtotal", money(pricing.subtotal));
  if (pricing.discountAmount > 0) row(`Discount (${pricing.discountPercent}%)`, `-${money(pricing.discountAmount)}`);
  if (pricing.taxAmount > 0) row(`Tax (${pricing.taxRate}%)`, money(pricing.taxAmount));
  row("Total", money(pricing.total), true);
  return pricing;
}

export async function buildEstimatePdf(estimate: Estimate, customer: Customer | undefined, business: BusinessProfile): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(doc, font, bold, doc.addPage([PAGE_W, PAGE_H]));
  await drawLetterhead(writer, business, "ESTIMATE", estimate.number);

  writer.heading("Prepared for");
  writer.text(estimate.customerName, { font: bold, gap: 1 });
  const company = normalizeEstimateCompany(estimate.customerName, estimate.company);
  if (company) writer.text(company, { gap: 1 });
  if (estimate.address || customer?.address) writer.text(estimate.address || customer?.address || "", { gap: 1 });
  const phone = normalizeContactPhone(estimate.phone || customer?.phone);
  if (phone) writer.text(phone, { gap: 1 });
  if (customer?.email) writer.text(customer.email, { gap: 1 });
  writer.spacer(10);

  writer.heading("Details");
  writer.text(`Status: ${estimate.status}`, { gap: 1 });
  writer.text(`Created: ${estimate.createdDate}`, { gap: 1 });
  writer.text(`Expires: ${estimate.expirationDate}`, { gap: 1 });
  writer.text(`Prepared by: ${estimate.salesRep || "—"}`, { gap: 8 });
  writer.rule();

  if (estimate.lineItems?.length) {
    writer.heading("Itemized pricing");
    drawLineItemsTable(writer, estimate.lineItems, estimate.taxRate || 0, estimate.discountPercent || 0);
    writer.spacer(6);
  } else {
    writer.heading("Estimated total");
    writer.text(money(estimate.amount), { size: 16, font: bold, color: NAVY, gap: 10 });
  }

  if (estimate.projectSpecifics) {
    writer.heading("Project specifics");
    writer.text(estimate.projectSpecifics, { gap: 4 });
  }

  if (estimate.notes) {
    writer.heading("Scope of work / notes");
    writer.text(estimate.notes, { gap: 4 });
  }

  return doc.save();
}

export async function buildLeadPdf(lead: Lead, business: BusinessProfile): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(doc, font, bold, doc.addPage([PAGE_W, PAGE_H]));
  await drawLetterhead(writer, business, "LEAD SUMMARY", lead.id);

  writer.heading("Contact");
  writer.text(lead.name, { font: bold, gap: 1 });
  if (lead.company) writer.text(lead.company, { gap: 1 });
  if (lead.phone) writer.text(lead.phone, { gap: 1 });
  if (lead.email) writer.text(lead.email, { gap: 1 });
  if (lead.address) writer.text(lead.address, { gap: 1 });
  writer.spacer(10);

  writer.heading("Details");
  writer.text(`Source: ${lead.source}`, { gap: 1 });
  writer.text(`Status: ${lead.status}`, { gap: 1 });
  writer.text(`Sales rep: ${lead.salesRep || "—"}`, { gap: 1 });
  writer.text(`Estimated value: ${money(lead.estimatedValue)}`, { gap: 1 });
  writer.text(`Date added: ${lead.dateAdded}`, { gap: 8 });
  writer.rule();

  if (lead.notes) {
    writer.heading("Notes");
    writer.text(lead.notes, { gap: 4 });
  }

  return doc.save();
}

export async function buildInvoicePdf(invoice: Invoice, customer: Customer | undefined, business: BusinessProfile): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(doc, font, bold, doc.addPage([PAGE_W, PAGE_H]));
  await drawLetterhead(writer, business, "INVOICE", invoice.invoiceNumber);

  writer.heading("Billed to");
  writer.text(invoice.customer, { font: bold, gap: 1 });
  if (customer?.address) writer.text(customer.address, { gap: 1 });
  if (customer?.phone) writer.text(customer.phone, { gap: 1 });
  if (customer?.email) writer.text(customer.email, { gap: 1 });
  writer.spacer(6);
  writer.text(`Status: ${invoice.status.toUpperCase()}`, { font: bold, gap: 1 });
  writer.text(`Issued: ${invoice.issuedDate}    Due: ${invoice.dueDate}`, { gap: 10 });

  writer.heading("Line items");
  const totals = drawLineItemsTable(writer, invoice.lineItems, invoice.taxRate);
  writer.spacer(4);
  if (invoice.amountPaid) {
    writer.text(`Amount paid: ${money(invoice.amountPaid)}`, { gap: 1 });
    writer.text(`Balance due: ${money(totals.total - invoice.amountPaid)}`, { font: bold, gap: 6 });
  }

  if (invoice.notes) {
    writer.heading("Notes");
    writer.text(invoice.notes, { gap: 4 });
  }

  return doc.save();
}

export async function buildCustomerProfilePdf(customer: Customer, related: { estimates: Estimate[]; invoices: Invoice[] }, business: BusinessProfile): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(doc, font, bold, doc.addPage([PAGE_W, PAGE_H]));
  await drawLetterhead(writer, business, "CUSTOMER RECORD", customer.id);

  writer.heading(customer.company || customer.contact);
  writer.text(customer.contact, { gap: 1 });
  writer.text(customer.address || "—", { gap: 1 });
  writer.text(customer.phone || "—", { gap: 1 });
  writer.text(customer.email || "—", { gap: 8 });

  writer.heading("Account summary");
  writer.text(`Type: ${customer.type}    Status: ${customer.status}`, { gap: 1 });
  writer.text(`Open jobs: ${customer.openJobs}`, { gap: 1 });
  writer.text(`Outstanding balance: ${money(customer.outstandingBalance)}`, { gap: 1 });
  writer.text(`Lifetime value: ${money(customer.lifetimeValue)}`, { gap: 8 });
  writer.rule();

  writer.heading(`Estimates (${related.estimates.length})`);
  if (!related.estimates.length) writer.text("None on file.", { color: SLATE, gap: 4 });
  related.estimates.forEach(e => writer.text(`${e.number} · ${e.status} · ${money(e.amount)} · ${e.createdDate}`, { gap: 2 }));
  writer.spacer(6);

  writer.heading(`Invoices (${related.invoices.length})`);
  if (!related.invoices.length) writer.text("None on file.", { color: SLATE, gap: 4 });
  related.invoices.forEach(i => writer.text(`${i.invoiceNumber} · ${i.status} · ${money(i.lineItems.reduce((s, l) => s + l.quantity * l.unitPrice, 0))} · due ${i.dueDate}`, { gap: 2 }));

  return doc.save();
}

const directionLabel: Record<MissedCallEvent["direction"], string> = {
  missed: "Missed Call",
  incoming: "Incoming Call",
  outgoing: "Outgoing Call"
};

/** Real record of a customer's call/text history from the Missed Call Text-Back app (see CrmLinker.kt), oldest first, for the Customer Card's "Convert to PDF" button. */
/** Merges call events and real text messages into one chronological feed for buildCallTextHistoryPdf -- the same merge CustomersPage.tsx's Call & Text History panel builds for on-screen display. */
type CallTextEntry =
  | { sortKey: string; kind: "call"; event: MissedCallEvent }
  | { sortKey: string; kind: "text"; event: TextMessage };

export async function buildCallTextHistoryPdf(customer: Customer, events: MissedCallEvent[], texts: TextMessage[], business: BusinessProfile): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(doc, font, bold, doc.addPage([PAGE_W, PAGE_H]));
  await drawLetterhead(writer, business, "CALL & TEXT HISTORY", customer.id);

  writer.heading(customer.company || customer.contact);
  writer.text(customer.contact, { gap: 1 });
  writer.text(customer.phone || "—", { gap: 8 });

  const timeline: CallTextEntry[] = [
    ...events.map((event): CallTextEntry => ({ sortKey: event.callTimestamp, kind: "call", event })),
    ...texts.map((event): CallTextEntry => ({ sortKey: event.timestamp, kind: "text", event }))
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  if (!timeline.length) {
    writer.text("No calls or texts on file yet.", { color: SLATE, gap: 4 });
    return doc.save();
  }

  for (const entry of timeline) {
    writer.rule();
    if (entry.kind === "call") {
      const event = entry.event;
      writer.text(`${directionLabel[event.direction] || "Call"} — ${event.callTimestamp}`, { font: bold, gap: 2 });
      writer.text(`Number: ${event.phoneNumber}`, { gap: 2 });
      if (event.autoReplySent && event.autoReplyMessage) {
        writer.text(`Auto-reply text sent: "${event.autoReplyMessage}"`, { color: SLATE, gap: 2 });
      }
      if (event.createdNewLead) {
        writer.text("A new lead was created from this call.", { color: SLATE, gap: 2 });
      }
    } else {
      const event = entry.event;
      const who = event.direction === "outgoing" ? "Sent" : "Received";
      writer.text(`Text ${who} — ${event.timestamp}`, { font: bold, gap: 2 });
      writer.text(`"${event.body}"`, { color: SLATE, gap: 2 });
      if (event.createdNewLead) {
        writer.text("A new lead was created from this text.", { color: SLATE, gap: 2 });
      }
    }
  }

  return doc.save();
}

/** Generic real formatted document -- used for job summaries, completion notes/checklists, and any other free-text section folded into a compiled PDF. */
export async function buildTextDocumentPdf(title: string, sections: Array<{ heading?: string; body: string }>, business: BusinessProfile): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(doc, font, bold, doc.addPage([PAGE_W, PAGE_H]));
  await drawLetterhead(writer, business, title.toUpperCase(), "");
  for (const section of sections) {
    if (section.heading) writer.heading(section.heading);
    writer.text(section.body || "—", { gap: 8 });
  }
  return doc.save();
}

export interface FreeformCanvasObject {
  kind: "text" | "image" | "link" | "video";
  page: number;
  x: number; y: number; w: number; h: number;
  value: string;
  fontSize?: number;
  fontFamily?: string;
  /** Hex string, e.g. "#1F3557" -- matches the color picker in the PDF Editor's canvas toolbar. */
  color?: string;
}

// The PDF Editor's on-screen canvas paper is a fixed-aspect box sized in CSS
// pixels (see selfiesave-editor.css's .paper max-width) that visually
// matches US Letter -- these two constants convert an object's editor x/y/w/h
// into real PDF points (72/inch) so a saved template positions and sizes
// content the same place the user actually put it, instead of flattening
// everything into sequential flowed text.
const EDITOR_PAPER_W = 816;
const EDITOR_PAPER_H = 1056;

function hexToRgb(hex?: string): RGB | null {
  if (!hex) return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Renders a blank-canvas document (header/positioned objects/clauses/footer)
 * built in the PDF Editor's freeform mode -- used only when no source PDF
 * was imported or generated to start from. Each object keeps the position,
 * size, font size, and color it was given on screen (converted from editor
 * pixels to PDF points), and image objects are actually embedded -- this is
 * what makes "Create Template" produce a real, reusable template PDF
 * instead of a flattened wall of plain text. */
export async function buildFreeformDocumentPdf(opts: { filename: string; header: string; footer: string; clauses: string[]; objects: FreeformCanvasObject[] }, business: BusinessProfile): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(doc, font, bold, doc.addPage([PAGE_W, PAGE_H]));
  await drawLetterhead(writer, business, opts.filename || "Document", "");
  if (opts.header) writer.text(opts.header, { font: bold, gap: 8 });

  const pageCount = Math.max(1, ...opts.objects.map(o => o.page || 1));
  while (writer.pages.length < pageCount) writer.newPage();
  const scaleX = PAGE_W / EDITOR_PAPER_W;
  const scaleY = PAGE_H / EDITOR_PAPER_H;

  for (const obj of opts.objects) {
    if (!obj.value) continue;
    const page = writer.pages[(obj.page || 1) - 1] || writer.pages[0];
    const x = obj.x * scaleX;
    const w = Math.max(10, obj.w * scaleX);
    const h = Math.max(10, obj.h * scaleY);
    const pdfY = PAGE_H - obj.y * scaleY - h; // editor y is top-down; pdf-lib draws from bottom-left

    if (obj.kind === "text") {
      const size = Math.max(6, (obj.fontSize || 12) * Math.min(scaleX, scaleY));
      const useFont = /bold/i.test(obj.fontFamily || "") ? bold : font;
      const color = hexToRgb(obj.color) || NAVY;
      const lines = String(obj.value).split(/\r?\n/).flatMap(line => writer.wrapLine(line, useFont, size, w));
      lines.forEach((line, i) => {
        const lineY = pdfY + h - size - i * (size * 1.2);
        if (lineY < MARGIN - 20) return;
        page.drawText(line, { x, y: lineY, size, font: useFont, color });
      });
    } else if (obj.kind === "image" && /^data:image\/(png|jpe?g)/.test(obj.value)) {
      try {
        const isPng = obj.value.startsWith("data:image/png");
        const bytes = base64ToBytes(obj.value.split(",")[1] || "");
        const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        page.drawImage(image, { x, y: pdfY, width: w, height: h });
      } catch {
        // Unreadable image data -- skip rather than fail the whole export.
      }
    } else if (obj.kind === "link" && /^https?:/.test(obj.value)) {
      page.drawText(obj.value, { x, y: pdfY + h / 2, size: 10, font, color: rgb(0.09, 0.4, 0.85) });
    }
  }

  writer.page = writer.pages[writer.pages.length - 1];
  writer.y = MARGIN + 40;
  opts.clauses.forEach((clause, i) => writer.text(`${i + 1}. ${clause}`, { gap: 4 }));
  if (opts.footer) writer.text(opts.footer, { color: SLATE, gap: 0 });
  return doc.save();
}

/** Wraps a photo (e.g. a receipt snapshot) as its own full PDF page. dataUrl must be a data: URI (png or jpeg). */
export async function buildImagePagePdf(dataUrl: string, caption?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const isPng = dataUrl.startsWith("data:image/png");
  const bytes = base64ToBytes(dataUrl.split(",")[1] || "");
  const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const maxW = PAGE_W - MARGIN * 2;
  const maxH = PAGE_H - MARGIN * 2 - (caption ? 24 : 0);
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const w = image.width * scale, h = image.height * scale;
  page.drawImage(image, { x: (PAGE_W - w) / 2, y: MARGIN + (caption ? 24 : 0), width: w, height: h });
  if (caption) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText(caption, { x: MARGIN, y: MARGIN, size: 9, font, color: SLATE });
  }
  return doc.save();
}

/** Merges any number of already-built PDFs (bytes or base64) into one, in order. */
export async function mergePdfs(sources: Array<Uint8Array | string>): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const source of sources) {
    try {
      const bytes = typeof source === "string" ? base64ToBytes(source.includes(",") ? source.split(",")[1] : source) : source;
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach(page => merged.addPage(page));
    } catch (error) {
      console.error("mergePdfs: skipped a source that could not be read", error);
    }
  }
  return merged.save();
}

/** Appends a real, standard-format signing certificate page (who signed, when, from where, with what evidence) to an existing PDF -- the same pattern DocuSign/Adobe Sign use, and far more robust than trying to burn signature images onto the original document's exact pixel coordinates. */
export async function appendSignatureCertificate(
  pdfBytes: Uint8Array,
  signers: Array<{ name: string; role: string; kind: string; timestamp: string; centralTimestamp?: string; signatureDataUrl?: string; selfieDataUrl?: string; coords?: string }>,
  business: BusinessProfile
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(doc, font, bold, doc.addPage([PAGE_W, PAGE_H]));
  await drawLetterhead(writer, business, "SIGNATURE CERTIFICATE", "");
  writer.text("This page is a real record of every signature captured on this document.", { color: SLATE, gap: 10 });
  for (const signer of signers) {
    writer.rule();
    writer.text(`${signer.name || "Unnamed signer"} — ${signer.role || ""}`, { font: bold, gap: 2 });
    writer.text(`${signer.kind} completed ${signer.timestamp}${signer.centralTimestamp ? ` (${signer.centralTimestamp})` : ""}`, { gap: 2 });
    if (signer.coords) writer.text(`Location at signing: ${signer.coords}`, { gap: 2 });
    if (signer.signatureDataUrl) {
      try {
        const isPng = signer.signatureDataUrl.startsWith("data:image/png");
        const bytes = base64ToBytes(signer.signatureDataUrl.split(",")[1] || "");
        const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const h = 48, w = Math.min(220, (image.width / image.height) * h);
        writer.ensureRoom(h + 10);
        writer.page.drawImage(image, { x: MARGIN, y: writer.y - h, width: w, height: h });
        writer.y -= h + 10;
      } catch {
        // A bad signature image must not prevent the signed PDF from saving.
      }
    }
    if (signer.selfieDataUrl) {
      try {
        const isPng = signer.selfieDataUrl.startsWith("data:image/png");
        const bytes = base64ToBytes(signer.selfieDataUrl.split(",")[1] || "");
        const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const h = 80, w = (image.width / image.height) * h;
        writer.ensureRoom(h + 6);
        writer.page.drawImage(image, { x: MARGIN, y: writer.y - h, width: w, height: h });
        writer.y -= h + 8;
      } catch {
        // Selfie image couldn't be embedded -- the rest of the certificate still stands.
      }
    }
  }
  return doc.save();
}

/** One editor page as it was laid out on screen (CSS px). */
export interface StampPage { widthPx: number; heightPx: number; imported: boolean }
/** A text/image box as drawn on screen; padding and line height let the PDF wrap exactly where the screen did. */
export interface StampObject {
  kind: "text" | "image" | "link" | "video";
  page: number; x: number; y: number; w: number; h: number;
  value: string;
  fontPx: number; lineHeight: number; padX: number; padY: number;
  color?: string; backgroundColor?: string; bold?: boolean;
}
export interface StampClause { page: number; x: number; y: number; w: number; h: number; number: number; text: string }
export interface StampField {
  page: number; x: number; y: number; w: number; h: number;
  kind: string; label: string; signed: boolean;
  name?: string; signatureDataUrl?: string; stamp?: string;
}

/** "#1f3557", "rgb(1 2 3)", "rgb(1, 2, 3)" -> pdf-lib color. */
export function parseCssColor(value?: string): RGB | null {
  if (!value) return null;
  const hex = hexToRgb(value);
  if (hex) return hex;
  const match = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value);
  if (!match) return null;
  return rgb(Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255);
}

/**
 * The PDF Editor's real save: everything on screen is stamped onto the real
 * pages exactly where it sits -- typed text, edits over an opened PDF's text,
 * images, clauses, and signature/initials lines with the actual signatures.
 * An opened PDF keeps its original pages (edits drawn on top of them); a
 * blank document gets one PDF page per editor page that has anything on it,
 * shaped like the page on screen so nothing is squeezed or cut off.
 */
export async function buildStampedPdf(opts: {
  base?: Uint8Array | null;
  pages: StampPage[];
  objects: StampObject[];
  clauses: StampClause[];
  fields: StampField[];
  header?: string;
  footer?: string;
  draftDate?: string;
}): Promise<Uint8Array> {
  const doc = opts.base ? await PDFDocument.load(opts.base, { ignoreEncryption: true }) : await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const baseCount = doc.getPageCount();

  const used = new Set<number>();
  opts.objects.forEach(o => { if (o.value?.trim()) used.add(o.page); });
  opts.clauses.forEach(c => used.add(c.page));
  opts.fields.forEach(f => used.add(f.page));
  const lastPage = Math.max(baseCount, 1, ...used);

  // PDF page + scale (points per screen px) for each editor page.
  const pdfPages: Array<{ page: PDFPage; scale: number; height: number } | null> = [];
  for (let i = 1; i <= lastPage; i++) {
    const info = opts.pages[i - 1] || opts.pages[opts.pages.length - 1] || { widthPx: 816, heightPx: 1056, imported: false };
    if (i <= baseCount) {
      const page = doc.getPage(i - 1);
      const { width, height } = page.getSize();
      pdfPages.push({ page, scale: width / Math.max(1, info.widthPx), height });
      continue;
    }
    // Blank pages in between with nothing on them are dropped (an opened
    // PDF's own pages are always kept above).
    if (!used.has(i) && !(i === 1 && baseCount === 0)) { pdfPages.push(null); continue; }
    const scale = PAGE_W / Math.max(1, info.widthPx);
    const height = Math.round(info.heightPx * scale);
    const page = doc.addPage([PAGE_W, height]);
    pdfPages.push({ page, scale, height });
    // The editor's own header/footer bands on blank pages.
    const s = scale;
    if (opts.header?.trim()) page.drawText(opts.header.trim().slice(0, 120), { x: 55 * s, y: height - 40 * s, size: 15 * s, font: italic, color: SLATE });
    if (opts.draftDate) {
      const label = `Date document was drafted: ${opts.draftDate}`;
      page.drawText(label, { x: Math.max(8, PAGE_W - 55 * s - font.widthOfTextAtSize(label, 9 * s)), y: height - 38 * s, size: 9 * s, font, color: SLATE });
    }
    if (opts.footer?.trim()) page.drawText(opts.footer.trim().slice(0, 160), { x: 55 * s, y: 22 * s, size: 9 * s, font, color: SLATE });
    page.drawText(`Page ${i}`, { x: PAGE_W - 55 * s - bold.widthOfTextAtSize(`Page ${i}`, 9 * s), y: 22 * s, size: 9 * s, font: bold, color: NAVY });
  }
  const at = (n: number) => pdfPages[n - 1] || null;
  // Screen box -> PDF box (PDF y runs bottom-up).
  const box = (p: { page: PDFPage; scale: number; height: number }, b: { x: number; y: number; w: number; h: number }) => ({
    x: b.x * p.scale, w: b.w * p.scale, h: b.h * p.scale, top: p.height - b.y * p.scale
  });
  const wrap = (text: string, f: PDFFont, size: number, width: number) =>
    String(text).split(/\r?\n/).flatMap(line => {
      const words = line.split(/(\s+)/).filter(Boolean);
      if (!words.length) return [""];
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const candidate = current + word;
        if (current.trim() && f.widthOfTextAtSize(candidate.trimEnd(), size) > width && word.trim()) {
          lines.push(current.trimEnd());
          current = word;
        } else current = candidate;
      }
      lines.push(current.trimEnd());
      return lines;
    });
  // Standard fonts can only draw WinAnsi characters; anything else is swapped for "?" rather than failing the save.
  const safe = (f: PDFFont, text: string) => {
    let out = "";
    for (const ch of text) {
      if (ch === "\n" || ch === "\r" || ch === "\t") { out += ch === "\t" ? "    " : ch; continue; }
      try { f.encodeText(ch); out += ch; } catch { out += ch === "“" || ch === "”" ? '"' : ch === "‘" || ch === "’" ? "'" : "?"; }
    }
    return out;
  };
  const drawLines = (page: PDFPage, text: string, f: PDFFont, size: number, x: number, top: number, width: number, lineHeight: number, color: RGB) => {
    const lineH = size * lineHeight;
    wrap(safe(f, text), f, size, width).forEach((line, i) => {
      if (!line) return;
      const baseline = top - i * lineH - (lineH - size) / 2 - size * 0.8;
      if (baseline < 0) return;
      page.drawText(line, { x, y: baseline, size, font: f, color });
    });
  };
  const embedImage = async (dataUrl: string) => {
    const bytes = base64ToBytes(dataUrl.split(",")[1] || "");
    return dataUrl.startsWith("data:image/png") ? doc.embedPng(bytes) : doc.embedJpg(bytes);
  };

  for (const o of opts.objects) {
    const p = at(o.page);
    if (!p || !o.value) continue;
    const b = box(p, o);
    if (o.kind === "text") {
      const background = parseCssColor(o.backgroundColor);
      if (background) p.page.drawRectangle({ x: b.x, y: b.top - b.h, width: b.w, height: b.h, color: background });
      if (!o.value.trim()) continue;
      const size = Math.max(2, o.fontPx * p.scale);
      drawLines(p.page, o.value, o.bold ? bold : font, size, b.x + o.padX * p.scale, b.top - o.padY * p.scale,
        Math.max(4, b.w - 2 * o.padX * p.scale), o.lineHeight, parseCssColor(o.color) || NAVY);
    } else if (o.kind === "image" && /^data:image\/(png|jpe?g)/.test(o.value)) {
      try {
        const image = await embedImage(o.value);
        // object-fit: contain, like the screen.
        const fit = Math.min(b.w / image.width, b.h / image.height);
        const w = image.width * fit, h = image.height * fit;
        p.page.drawImage(image, { x: b.x + (b.w - w) / 2, y: b.top - b.h + (b.h - h) / 2, width: w, height: h });
      } catch { /* unreadable image: skip it, keep the save */ }
    } else if ((o.kind === "link" || o.kind === "video") && /^https?:/.test(o.value)) {
      drawLines(p.page, o.value, font, 12 * p.scale, b.x, b.top, b.w, 1.3, rgb(0.09, 0.4, 0.85));
    }
  }

  for (const c of opts.clauses) {
    const p = at(c.page);
    if (!p || !c.text.trim()) continue;
    const b = box(p, c);
    const size = 13 * p.scale;
    p.page.drawText(`${c.number}.`, { x: b.x + 10 * p.scale, y: b.top - 10 * p.scale - size, size, font: bold, color: NAVY });
    drawLines(p.page, c.text, font, size, b.x + 38 * p.scale, b.top - 10 * p.scale, Math.max(4, b.w - 48 * p.scale), 1.6, NAVY);
  }

  for (const f of opts.fields) {
    const p = at(f.page);
    if (!p) continue;
    const b = box(p, f);
    const s = p.scale;
    p.page.drawText(safe(font, f.label), { x: b.x + 4 * s, y: b.top - 12 * s, size: 8 * s, font, color: SLATE });
    const lineY = b.top - b.h + 20 * s;
    p.page.drawLine({ start: { x: b.x + 4 * s, y: lineY }, end: { x: b.x + b.w - 4 * s, y: lineY }, thickness: 0.8, color: NAVY });
    if (f.signed) {
      let drewImage = false;
      if (f.signatureDataUrl && /^data:image\/(png|jpe?g)/.test(f.signatureDataUrl)) {
        try {
          const image = await embedImage(f.signatureDataUrl);
          const maxH = Math.max(10, b.h - 40 * s), maxW = b.w - 12 * s;
          const fit = Math.min(maxW / image.width, maxH / image.height);
          p.page.drawImage(image, { x: b.x + 6 * s, y: lineY + 2, width: image.width * fit, height: image.height * fit });
          drewImage = true;
        } catch { /* fall back to the typed name */ }
      }
      if (!drewImage && f.name) {
        const size = Math.min(22 * s, Math.max(8, (b.h - 40 * s) * 0.8));
        p.page.drawText(safe(italic, f.name), { x: b.x + 8 * s, y: lineY + 4 * s, size, font: italic, color: NAVY });
      }
      const caption = [f.name, f.stamp].filter(Boolean).join(" · ");
      if (caption) p.page.drawText(safe(font, caption), { x: b.x + 4 * s, y: lineY - 11 * s, size: 7.5 * s, font, color: SLATE });
    }
  }

  return doc.save();
}
