// Small shared CSV helpers -- real file download/parse, used by every
// page's Import/Export buttons instead of each hand-rolling its own.

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  // Guards against CSV/Excel "formula injection": a text cell starting with
  // =, +, -, @, tab, or CR can be interpreted as a live formula (up to
  // arbitrary command execution via legacy DDE) by whatever spreadsheet app
  // opens this export. Exploitable via any exported field that ultimately
  // comes from untrusted input -- e.g. a name/company/notes value entered
  // through the public, unauthenticated website lead-capture form (see
  // server/webLeadFormHandler.ts) and later exported from the Leads page.
  // Only applies to actual string cells -- numeric values (including
  // legitimately negative amounts) are never at risk and pass through as-is.
  const FORMULA_INJECTION_PATTERN = /^[=+\-@\t\r]/;
  const escape = (val: string | number) => {
    let str = String(val ?? "");
    if (typeof val === "string" && FORMULA_INJECTION_PATTERN.test(str)) {
      str = `'${str}`;
    }
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const csvContent = [headers, ...rows].map(row => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Minimal RFC4180-ish delimited-text parser -- handles quoted fields with embedded delimiters/newlines/escaped quotes. Defaults to comma; pass "\t" for a tab-separated (Excel "Save as .tsv" / paste) file. */
export function parseCsv(text: string, delimiter: string = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field); field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(c => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field.trim() !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
