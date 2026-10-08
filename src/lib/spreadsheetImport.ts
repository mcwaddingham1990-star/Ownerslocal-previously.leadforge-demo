// Shared "upload your existing spreadsheet (or a tabular PDF export) and
// have it autopopulate" engine, used by every bulk-import flow (Customers,
// Roster invites, Scheduling/Jobs). One real business's export column order
// almost never matches another's, so this matches columns by fuzzy header
// name instead of requiring an exact template -- the same job LeadsPage's
// existing CSV importer already did by hand; this generalizes that pattern
// so every page gets it instead of re-deriving it.
import ExcelJS from "exceljs";
import { parseCsv, downloadCsv } from "./csv";

export interface ImportFieldSpec<K extends string = string> {
  key: K;
  label: string;
  /** Header names (any casing/punctuation) this field should match, e.g. ["Company Name", "Business", "Company"]. */
  aliases: string[];
  required?: boolean;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Best-effort column -> field mapping by header name. Returns, per column
 * index, the matched field key (or null if nothing matched, or if the
 * match was ambiguous) so the caller can still offer a manual override UI
 * for anything not auto-mapped.
 *
 * SAFETY: an ambiguous header (its substring match ties between two or more
 * still-unclaimed fields -- e.g. a header like "Contact" could plausibly be
 * a Customer's `contact` name or a generic `notes` field depending on the
 * schema) is deliberately left unmapped rather than guessing the first
 * candidate in field-declaration order. A wrong silent guess here means
 * real data lands in the wrong column with no indication anything went
 * wrong; leaving it null forces the user to look at it and choose.
 */
export function autoMapHeaders<K extends string>(headers: string[], fields: ImportFieldSpec<K>[]): Array<K | null> {
  const used = new Set<K>();
  return headers.map(header => {
    const norm = normalizeHeader(header);
    if (!norm) return null;
    // Exact alias match first (highest confidence) -- but still only when
    // exactly one still-unclaimed field's alias list matches. Two fields
    // sharing a generic alias (e.g. both "Notes" and "Contact" listing
    // "info") is a real possibility a schema author can introduce by
    // accident, and this must stay ambiguous rather than silently
    // rewarding whichever field happens to be declared first.
    const exactCandidates = fields.filter(field => !used.has(field.key) && field.aliases.some(alias => normalizeHeader(alias) === norm));
    if (exactCandidates.length === 1) {
      used.add(exactCandidates[0].key);
      return exactCandidates[0].key;
    }
    if (exactCandidates.length > 1) return null;
    // Fall back to a substring match (e.g. header "Customer Phone Number" vs
    // alias "phone") -- but only when exactly one still-unclaimed field
    // qualifies. More than one candidate is ambiguous; leave it for the user.
    const candidates = fields.filter(field => !used.has(field.key) && field.aliases.some(alias => {
      const a = normalizeHeader(alias);
      return a.length >= 3 && (norm.includes(a) || a.includes(norm));
    }));
    if (candidates.length === 1) {
      used.add(candidates[0].key);
      return candidates[0].key;
    }
    return null;
  });
}

/** Last-10-digits phone comparison, same normalization CrmLinker.kt uses for the Missed Call Text-Back matching -- phone numbers are stored however each business originally typed them, so an exact string match would miss real duplicates constantly. */
export function normalizePhoneForMatch(raw: string | undefined | null): string {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizeEmailForMatch(raw: string | undefined | null): string {
  return (raw || "").trim().toLowerCase();
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason?: string;
}

/** Import-report row status, used for the downloadable audit log every bulk import produces. */
export type ImportRowStatus = "imported" | "skipped_duplicate" | "skipped_invalid";
export interface ImportReportRow {
  rowNumber: number; // 1-based, matching the source file's data rows (header excluded)
  status: ImportRowStatus;
  summary: string; // a human-readable identifier for the row, e.g. a name
  reason?: string;
}

/** Real, downloadable audit trail for one bulk import: which rows were created, which were skipped as duplicates, which were skipped as invalid, and why -- so a business can see exactly what a 2,000-row import actually did instead of trusting a single toast notification. */
export function downloadImportReport(sourceFileName: string, report: ImportReportRow[]) {
  const headers = ["Row", "Status", "Record", "Reason"];
  const rows = report.map(r => [r.rowNumber, r.status.replace("_", " "), r.summary, r.reason || ""]);
  const safeName = (sourceFileName || "import").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-");
  downloadCsv(`${safeName}-import-report-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
}

export interface ParsedSheet<K extends string = string> {
  headers: string[];
  rows: string[][];
  /** headers[i] -> columnMap[i], the auto-detected field for that column (editable by the user before commit). */
  columnMap: Array<K | null>;
}

function detectDelimiter(firstLine: string): string {
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

/** Parses raw delimited text (CSV, TSV, or a pasted Excel selection) and auto-maps its header row to the given field schema. */
export function parseSheet<K extends string>(text: string, fields: ImportFieldSpec<K>[]): ParsedSheet<K> {
  const delimiter = detectDelimiter(text.split(/\r?\n/)[0] || "");
  const table = parseCsv(text, delimiter);
  if (!table.length) return { headers: [], rows: [], columnMap: [] };
  const [headerRow, ...dataRows] = table;
  const headers = headerRow.map(h => h.trim());
  return { headers, rows: dataRows.filter(r => r.some(c => c.trim() !== "")), columnMap: autoMapHeaders(headers, fields) };
}

/** Reads a mapped row into a plain object keyed by field, given the sheet's current column map (post any manual user correction). */
export function readRow<K extends string>(row: string[], columnMap: Array<K | null>): Partial<Record<K, string>> {
  const record: Partial<Record<K, string>> = {};
  columnMap.forEach((key, idx) => {
    if (key && row[idx] !== undefined) record[key] = row[idx].trim();
  });
  return record;
}

/**
 * Best-effort table reconstruction from a PDF's real text layer -- reads
 * actual embedded text via pdf.js (same library/worker SelfieSaveEditor
 * already uses to render PDFs), then rebuilds rows/columns from each text
 * item's real x/y position: items on close-together y are one row, items
 * separated by a wide x gap are different columns. Works well for PDFs
 * that started life as a spreadsheet/report export (aligned columns, real
 * whitespace between them). Does NOT do OCR -- a scanned photo of paper
 * records has no text layer at all and will come back empty; that's a
 * genuinely different (much bigger, AI-vision) problem this doesn't claim
 * to solve.
 */
/** Quote a cell only when it needs it (contains a comma/quote/newline), doubling any embedded quotes -- a real round-trip-safe CSV cell, not the naive unquoted comma-join InventoryPage's own Excel importer uses (that one breaks the moment a cell itself contains a comma, e.g. "123 Main St, Suite 4"). */
function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Same cell-value extraction ExcelJS's own consumers in this app already use (see InventoryPage.tsx's excelFileToImportLines) -- formulas resolve to their last calculated result, not the formula text; rich text runs are flattened to plain text. */
function excelCellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const rich = value as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
    if (typeof rich.text === "string") return rich.text;
    if (Array.isArray(rich.richText)) return rich.richText.map(t => t.text).join("");
    if (rich.result != null) return String(rich.result);
    return "";
  }
  return String(value);
}

/**
 * Real .xlsx parsing via ExcelJS (already a dependency, used the same way by
 * InventoryPage's own Excel importer) -- reads the first sheet and converts
 * it to a properly quoted CSV string so it flows through the exact same
 * parseSheet/autoMapHeaders engine as an actual CSV upload, instead of
 * duplicating the column-mapping logic for a second input format. Legacy
 * .xls (pre-2007 binary format) is NOT readable this way -- ExcelJS only
 * understands the OOXML .xlsx format -- and throws; the caller (
 * BulkImportModal) catches that and tells the user to re-save as .xlsx.
 */
export async function extractExcelText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return "";
  const lines: string[] = [];
  worksheet.eachRow({ includeEmpty: false }, row => {
    const cells = (row.values as unknown[]).slice(1).map(excelCellToString);
    lines.push(cells.map(csvEscape).join(","));
  });
  return lines.join("\n");
}

export async function extractPdfTableText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfWorkerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const Y_TOLERANCE = 3; // points -- items within this band count as the same row
  const COLUMN_GAP = 10; // points -- an x-gap at least this wide is a new column, not a word-space

  const lines: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const items = (content.items as any[]).filter(item => typeof item.str === "string" && item.str.trim() !== "");

    const rows = new Map<number, Array<{ x: number; endX: number; str: string }>>();
    for (const item of items) {
      const x = item.transform[4];
      const y = item.transform[5];
      const width = item.width ?? item.str.length * (item.height || 8) * 0.5;
      let bucketKey = y;
      for (const existingKey of rows.keys()) {
        if (Math.abs(existingKey - y) <= Y_TOLERANCE) { bucketKey = existingKey; break; }
      }
      if (!rows.has(bucketKey)) rows.set(bucketKey, []);
      rows.get(bucketKey)!.push({ x, endX: x + width, str: item.str });
    }

    const orderedRowKeys = Array.from(rows.keys()).sort((a, b) => b - a); // PDF y grows upward -- read top to bottom
    for (const key of orderedRowKeys) {
      const cells = rows.get(key)!.sort((a, b) => a.x - b.x);
      let line = "";
      let prevEnd: number | null = null;
      for (const cell of cells) {
        if (prevEnd === null) {
          line = cell.str;
        } else {
          const gap = cell.x - prevEnd;
          line += (gap >= COLUMN_GAP ? "\t" : " ") + cell.str;
        }
        prevEnd = cell.endX;
      }
      lines.push(line);
    }
  }
  return lines.join("\n");
}
