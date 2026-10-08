import React, { useMemo, useState } from "react";
import { Upload, X, AlertTriangle, CheckCircle, Download } from "lucide-react";
import {
  parseSheet, readRow, extractPdfTableText, extractExcelText, downloadImportReport,
  type ImportFieldSpec, type ParsedSheet, type DuplicateCheckResult, type ImportReportRow
} from "../lib/spreadsheetImport";

interface BulkImportModalProps<K extends string> {
  title: string;
  /** One line explaining what this import creates, shown under the title (e.g. "Creates real customer records -- any column order works."). */
  description: string;
  fields: ImportFieldSpec<K>[];
  /** Optional: checked against every mapped row so a row that already exists (matched by phone/email/name -- whatever the caller decides "duplicate" means for this entity) is flagged and, by default, skipped rather than silently creating a second copy. */
  checkDuplicate?: (row: Partial<Record<K, string>>) => DuplicateCheckResult;
  /** A short human label for one row, used in the preview and the downloadable report (e.g. row.contact || row.company). */
  rowLabel: (row: Partial<Record<K, string>>) => string;
  /** Called once with every row that will actually be created (duplicates and rows missing a required field already excluded, unless the user opted to include duplicates anyway). */
  onConfirm: (rows: Array<Partial<Record<K, string>>>) => void;
  onClose: () => void;
  confirmLabel?: string;
}

/**
 * Generic "upload your existing spreadsheet and have it autopopulate" modal
 * -- accepts a CSV/TSV file, a pasted block of spreadsheet cells, or a PDF
 * (real text-layer extraction, see extractPdfTableText), auto-matches
 * columns to the caller's field schema by header name (never guessing an
 * ambiguous column -- see autoMapHeaders), flags rows that look like
 * existing records so a bad re-import doesn't silently duplicate a
 * business's whole customer list, and produces a real downloadable report
 * of exactly what happened. Every page that needs a bulk import
 * (Customers, Roster invites, Scheduling/Jobs) uses this same component
 * instead of hand-rolling its own file input + preview table.
 */
export function BulkImportModal<K extends string>({ title, description, fields, checkDuplicate, rowLabel, onConfirm, onClose, confirmLabel }: BulkImportModalProps<K>) {
  const [sheet, setSheet] = useState<ParsedSheet<K> | null>(null);
  const [columnMap, setColumnMap] = useState<Array<K | null>>([]);
  const [error, setError] = useState<string | null>(null);
  const [isReadingPdf, setIsReadingPdf] = useState(false);
  const [isReadingExcel, setIsReadingExcel] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [sourceFileName, setSourceFileName] = useState("import");
  const [includeDuplicates, setIncludeDuplicates] = useState(false);

  const loadText = (text: string, fileName?: string) => {
    const parsed = parseSheet<K>(text, fields);
    if (!parsed.headers.length) {
      setError("Couldn't find any rows -- make sure the first line is a header row.");
      setSheet(null);
      return;
    }
    setSheet(parsed);
    setColumnMap(parsed.columnMap);
    setError(null);
    if (fileName) setSourceFileName(fileName);
  };

  const handleFile = async (file: File) => {
    setError(null);
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
      setIsReadingPdf(true);
      try {
        const text = await extractPdfTableText(file);
        if (!text.trim()) {
          setError("Couldn't find any real text in that PDF -- this works on PDFs exported from a spreadsheet/report (real text layer), not a scanned photo of paper records.");
        } else {
          loadText(text, file.name);
        }
      } catch {
        setError("Couldn't read that PDF. Try exporting it as a CSV instead if your source software offers that.");
      } finally {
        setIsReadingPdf(false);
      }
      return;
    }
    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
      setIsReadingExcel(true);
      try {
        const text = await extractExcelText(file);
        if (!text.trim()) {
          setError("That workbook's first sheet looks empty.");
        } else {
          loadText(text, file.name);
        }
      } catch {
        // Legacy .xls (pre-2007 binary format) isn't readable this way -- same
        // limitation/message InventoryPage's own Excel importer already gives.
        setError(
          lowerName.endsWith(".xls")
            ? "Old .xls files aren't supported -- open it in Excel/Sheets and save as .xlsx, then try again."
            : "Couldn't read that Excel file. Try exporting it as a CSV instead."
        );
      } finally {
        setIsReadingExcel(false);
      }
      return;
    }
    const text = await file.text();
    loadText(text, file.name);
  };

  const requiredMissingColumns = useMemo(() => {
    if (!sheet) return [];
    return fields.filter(f => f.required && !columnMap.includes(f.key));
  }, [fields, columnMap, sheet]);

  // Every row, classified: invalid (a required field has no value on this
  // specific row, even though its column is mapped), duplicate (matches an
  // existing record per the caller's checkDuplicate), or ready to import.
  const classifiedRows = useMemo(() => {
    if (!sheet) return [];
    return sheet.rows.map((row, idx) => {
      const mapped = readRow(row, columnMap);
      const missingRequired = fields.filter(f => f.required && !mapped[f.key]?.trim());
      if (missingRequired.length > 0) {
        return { idx, mapped, status: "skipped_invalid" as const, reason: `Missing ${missingRequired.map(f => f.label).join(", ")}` };
      }
      const dup = checkDuplicate?.(mapped);
      if (dup?.isDuplicate) {
        return { idx, mapped, status: "skipped_duplicate" as const, reason: dup.reason || "Matches an existing record" };
      }
      return { idx, mapped, status: "imported" as const, reason: undefined };
    });
  }, [sheet, columnMap, fields, checkDuplicate]);

  const acceptedRows = useMemo(
    () => classifiedRows.filter(r => r.status === "imported" || (includeDuplicates && r.status === "skipped_duplicate")),
    [classifiedRows, includeDuplicates]
  );
  const duplicateCount = classifiedRows.filter(r => r.status === "skipped_duplicate").length;
  const invalidCount = classifiedRows.filter(r => r.status === "skipped_invalid").length;

  const canConfirm = !!sheet && requiredMissingColumns.length === 0 && acceptedRows.length > 0;

  const handleConfirm = () => {
    const report: ImportReportRow[] = classifiedRows.map(r => ({
      rowNumber: r.idx + 1,
      status: includeDuplicates && r.status === "skipped_duplicate" ? "imported" : r.status,
      summary: rowLabel(r.mapped) || `Row ${r.idx + 1}`,
      reason: r.status === "skipped_duplicate" && includeDuplicates ? undefined : r.reason
    }));
    onConfirm(acceptedRows.map(r => r.mapped));
    downloadImportReport(sourceFileName, report);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-white" />
            <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">{title}</h3>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-[#1F3557]">
          <p className="text-[11px] text-[#5E7393] leading-relaxed">{description} Column order doesn't matter -- headers are matched automatically (an ambiguous one is left for you to pick, never guessed), and you'll see exactly what will be created before anything happens.</p>

          <div className="relative border-2 border-dashed border-[#9EC8EF] hover:border-[#315C9F] bg-[#EAF5FF]/30 hover:bg-[#EAF5FF]/50 rounded-2xl p-6 transition-colors text-center cursor-pointer">
            <input
              type="file"
              accept=".csv,.tsv,.txt,.pdf,.xlsx,.xls"
              onChange={e => { const file = e.target.files?.[0]; if (file) void handleFile(file); }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-[#315C9F]" />
              <p className="text-xs font-extrabold">
                {isReadingPdf ? "Reading PDF…" : isReadingExcel ? "Reading Excel file…" : "Click to select or drag & drop a file"}
              </p>
              <p className="text-[10px] text-[#5E7393]">CSV, TSV, Excel (.xlsx), or PDF (from a spreadsheet/report export)</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-[#5E7393]">Or paste rows copied from a spreadsheet</label>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              rows={3}
              placeholder="Paste header row + data rows here…"
              className="w-full text-[11px] font-mono border border-[#9EC8EF] rounded-xl px-3 py-2 focus:outline-none focus:border-[#315C9F]"
            />
            {pasteText.trim() && (
              <button type="button" onClick={() => loadText(pasteText, "pasted-rows")} className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] text-[10.5px] font-bold rounded-xl cursor-pointer">
                Parse pasted rows
              </button>
            )}
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl flex items-center gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="font-semibold">{error}</span>
            </div>
          )}

          {sheet && sheet.headers.length > 0 && (
            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#5E7393] block mb-1.5">Column mapping ({sheet.rows.length} row{sheet.rows.length === 1 ? "" : "s"} found)</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {sheet.headers.map((header, idx) => (
                    <div key={idx} className={`border rounded-xl p-2 space-y-1 ${columnMap[idx] ? "bg-[#EAF5FF]/40 border-[#9EC8EF]/30" : "bg-amber-50 border-amber-200"}`}>
                      <p className="text-[9px] font-bold text-[#5E7393] truncate" title={header}>{header || `Column ${idx + 1}`}</p>
                      <select
                        value={columnMap[idx] || ""}
                        onChange={e => {
                          const next = [...columnMap];
                          next[idx] = (e.target.value || null) as K | null;
                          setColumnMap(next);
                        }}
                        className="w-full text-[10px] font-bold bg-white border border-[#9EC8EF] rounded-lg px-1.5 py-1 focus:outline-none"
                      >
                        <option value="">{columnMap[idx] ? "Ignore this column" : "Unmapped -- pick a field"}</option>
                        {fields.map(f => <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {requiredMissingColumns.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl flex items-center gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="font-semibold">Map a column to: {requiredMissingColumns.map(f => f.label).join(", ")} before importing.</span>
                </div>
              )}

              {requiredMissingColumns.length === 0 && (
                <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl p-3 space-y-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold">
                    <span className="text-emerald-700">{acceptedRows.length} will be imported</span>
                    {duplicateCount > 0 && <span className="text-amber-700">{duplicateCount} look like duplicates (skipped)</span>}
                    {invalidCount > 0 && <span className="text-rose-700">{invalidCount} missing required data (skipped)</span>}
                  </div>
                  {duplicateCount > 0 && (
                    <label className="flex items-center gap-2 text-[10.5px] font-semibold text-[#1F3557] cursor-pointer">
                      <input type="checkbox" checked={includeDuplicates} onChange={e => setIncludeDuplicates(e.target.checked)} className="h-3.5 w-3.5" />
                      Import the {duplicateCount} possible duplicate{duplicateCount === 1 ? "" : "s"} anyway
                    </label>
                  )}
                </div>
              )}

              <div>
                <span className="text-[10px] uppercase font-bold text-[#5E7393] block mb-1.5">Preview (first {Math.min(6, classifiedRows.length)} of {classifiedRows.length})</span>
                <div className="border border-[#9EC8EF]/40 rounded-xl overflow-hidden max-h-56 overflow-y-auto divide-y divide-[#9EC8EF]/20 bg-slate-50">
                  {classifiedRows.slice(0, 6).map(r => (
                    <div key={r.idx} className="p-2 text-[10.5px] flex items-center gap-2">
                      <span className={`shrink-0 px-1.5 py-0.5 rounded font-bold text-[9px] uppercase ${
                        r.status === "imported" ? "bg-emerald-100 text-emerald-700" : r.status === "skipped_duplicate" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                      }`}>
                        {r.status === "imported" ? "New" : r.status === "skipped_duplicate" ? "Duplicate" : "Invalid"}
                      </span>
                      <span className="flex-1 min-w-0 truncate">
                        <span className="font-bold">{rowLabel(r.mapped) || `Row ${r.idx + 1}`}</span>
                        {r.reason && <span className="text-[#5E7393]"> — {r.reason}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${canConfirm ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"}`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {confirmLabel || `Import (${acceptedRows.length})`}
            <Download className="w-3 h-3 opacity-70" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default BulkImportModal;
