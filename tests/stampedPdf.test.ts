import { describe, expect, test } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildStampedPdf, parseCssColor } from "../src/lib/pdfExport";

const original = async (pages: number) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]).drawText(`Original ${i + 1}`, { x: 72, y: 700, size: 12, font });
  return doc.save();
};
const text = (page: number, value: string) => ({ kind: "text" as const, page, x: 100, y: 200, w: 400, h: 40, value, fontPx: 16, lineHeight: 1.35, padX: 0, padY: 0 });

describe("PDF editor save", () => {
  test("an opened PDF keeps all its original pages, with edits drawn on them -- not appended", async () => {
    const out = await PDFDocument.load(await buildStampedPdf({
      base: await original(3),
      pages: [1, 2, 3].map(() => ({ widthPx: 816, heightPx: 1056, imported: true })),
      objects: [text(1, "typed on page one"), text(3, "typed on page three")],
      clauses: [],
      fields: [{ page: 2, x: 70, y: 575, w: 600, h: 120, kind: "signature", label: "Signature · Signer", signed: true, name: "Pat Customer", stamp: "Oct 10, 2026" }]
    }));
    expect(out.getPageCount()).toBe(3);
    expect(out.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  test("a blank document gets one page per editor page that has content, shaped like the screen", async () => {
    const out = await PDFDocument.load(await buildStampedPdf({
      base: null,
      pages: [1, 2, 3, 4].map(() => ({ widthPx: 380, heightPx: 900, imported: false })),
      objects: [text(1, "first"), text(3, "third")],
      clauses: [],
      fields: [],
      footer: "Thanks"
    }));
    // Page 2 and 4 were empty (pages added by scrolling) and are left out.
    expect(out.getPageCount()).toBe(2);
    const { width, height } = out.getPage(0).getSize();
    expect(width).toBe(612);
    expect(Math.round(height)).toBe(Math.round(900 * 612 / 380));
  });

  test("characters the PDF font can't draw don't break the save", async () => {
    const bytes = await buildStampedPdf({ base: null, pages: [{ widthPx: 816, heightPx: 1056, imported: false }], objects: [text(1, "Owner’s “quote” ✓ 😀")], clauses: [], fields: [] });
    expect(bytes.length).toBeGreaterThan(500);
  });

  test("reads the colors the editor uses", () => {
    expect(parseCssColor("rgb(255 255 255)")).toBeTruthy();
    expect(parseCssColor("rgb(10, 20, 30)")).toBeTruthy();
    expect(parseCssColor("#1F3557")).toBeTruthy();
    expect(parseCssColor("nonsense")).toBeNull();
  });
});
