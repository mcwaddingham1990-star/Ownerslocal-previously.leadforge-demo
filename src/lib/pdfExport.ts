// Real PDF generation/merging, backed by pdf-lib -- every function here
// produces actual PDF bytes from real record data (never a placeholder or
// sample document). Used by every "Generate PDF" / "Compile Documents"
// button across Estimates, Accounting (Invoices), Customers, and Documents.
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, RGB } from "pdf-lib";
import type { Estimate, Customer, DocumentItem, Lead } from "../types/domain";
import type { Invoice, InvoiceLineItem } from "../types/accounting";

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
  const binary = atob(base64);
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

function drawLineItemsTable(writer: PdfWriter, items: InvoiceLineItem[], taxRate: number) {
  const colDesc = MARGIN, colQty = PAGE_W - MARGIN - 210, colPrice = PAGE_W - MARGIN - 140, colTotal = PAGE_W - MARGIN - 70;
  writer.ensureRoom(24);
  writer.page.drawRectangle({ x: MARGIN, y: writer.y - 4, width: PAGE_W - MARGIN * 2, height: 20, color: rgb(0.918, 0.961, 1) });
  writer.page.drawText("Description", { x: colDesc + 6, y: writer.y, size: 8.5, font: writer.bold, color: NAVY });
  writer.page.drawText("Qty", { x: colQty, y: writer.y, size: 8.5, font: writer.bold, color: NAVY });
  writer.page.drawText("Unit Price", { x: colPrice, y: writer.y, size: 8.5, font: writer.bold, color: NAVY });
  writer.page.drawText("Total", { x: colTotal, y: writer.y, size: 8.5, font: writer.bold, color: NAVY });
  writer.y -= 22;
  let subtotal = 0;
  for (const item of items) {
    const lineTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0);
    subtotal += lineTotal;
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
  const tax = subtotal * (Number(taxRate || 0) / 100);
  const total = subtotal + tax;
  const summaryX = colPrice;
  const row = (label: string, value: string, bold = false) => {
    writer.ensureRoom(16);
    writer.page.drawText(label, { x: summaryX, y: writer.y, size: 9.5, font: bold ? writer.bold : writer.font, color: bold ? NAVY : SLATE });
    writer.page.drawText(value, { x: colTotal, y: writer.y, size: 9.5, font: bold ? writer.bold : writer.font, color: NAVY });
    writer.y -= 15;
  };
  row("Subtotal", money(subtotal));
  if (taxRate) row(`Tax (${taxRate}%)`, money(tax));
  row("Total", money(total), true);
  return { subtotal, tax, total };
}

export async function buildEstimatePdf(estimate: Estimate, customer: Customer | undefined, business: BusinessProfile): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(doc, font, bold, doc.addPage([PAGE_W, PAGE_H]));
  await drawLetterhead(writer, business, "ESTIMATE", estimate.number);

  writer.heading("Prepared for");
  writer.text(estimate.customerName, { font: bold, gap: 1 });
  if (estimate.company) writer.text(estimate.company, { gap: 1 });
  if (estimate.address || customer?.address) writer.text(estimate.address || customer?.address || "", { gap: 1 });
  if (customer?.phone) writer.text(customer.phone, { gap: 1 });
  if (customer?.email) writer.text(customer.email, { gap: 1 });
  writer.spacer(10);

  writer.heading("Details");
  writer.text(`Status: ${estimate.status}`, { gap: 1 });
  writer.text(`Created: ${estimate.createdDate}`, { gap: 1 });
  writer.text(`Expires: ${estimate.expirationDate}`, { gap: 1 });
  writer.text(`Prepared by: ${estimate.salesRep || "—"}`, { gap: 8 });
  writer.rule();

  writer.heading("Estimated total");
  writer.text(money(estimate.amount), { size: 16, font: bold, color: NAVY, gap: 10 });

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

/** Renders a blank-canvas document (header/free-text objects/clauses/footer) built in the PDF Editor's freeform mode -- used only when no source PDF was imported or generated to start from. */
export async function buildFreeformDocumentPdf(opts: { filename: string; header: string; bodyTexts: string[]; clauses: string[]; footer: string }, business: BusinessProfile): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new PdfWriter(doc, font, bold, doc.addPage([PAGE_W, PAGE_H]));
  await drawLetterhead(writer, business, opts.filename || "Document", "");
  if (opts.header) writer.text(opts.header, { font: bold, gap: 8 });
  opts.bodyTexts.filter(Boolean).forEach(value => writer.text(value, { gap: 8 }));
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
  signers: Array<{ name: string; role: string; kind: string; timestamp: string; centralTimestamp?: string; selfieDataUrl?: string; coords?: string }>,
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
