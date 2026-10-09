import { describe, expect, it } from "vitest";
import { fitFlowPrefix, flowDisplayText, layoutFlow, locateFlowCaret, stripFlowFiller, type FlowMeasure } from "../src/lib/flowText";

// Fixed-pitch fake: 10px per character, 20px per line, word wrapping like a
// browser's pre-wrap (a word that doesn't fit moves to the next line).
const LINE = 20;
const measure: FlowMeasure = (text, width) => {
  const perLine = Math.max(1, Math.floor(width / 10));
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    let used = 0;
    lines++;
    for (const word of paragraph.split(/(?<= )/)) {
      const visible = word.replace(/ +$/, "").length;
      if (used > 0 && used + visible > perLine) { lines++; used = 0; }
      used += word.length;
      while (used > perLine + (word.length - visible)) { lines++; used -= perLine; }
    }
  }
  return lines * LINE;
};

describe("fitFlowPrefix", () => {
  it("keeps everything that fits", () => {
    expect(fitFlowPrefix("hello world", 200, 40, measure)).toBe(11);
  });

  it("moves a word that would be split to the next box", () => {
    // 10 chars per line, 2 lines fit.
    const text = "aaaa bbbb cccc dddd eeee";
    const n = fitFlowPrefix(text, 100, 40, measure);
    expect(text.slice(0, n)).toBe("aaaa bbbb cccc dddd ");
    expect(text.slice(n)).toBe("eeee");
  });

  it("keeps a paragraph break on the page it ends", () => {
    const text = "one\ntwo\nthree";
    const n = fitFlowPrefix(text, 100, 40, measure);
    expect(text.slice(0, n)).toBe("one\ntwo\n");
  });

  it("returns 0 when not even one line fits, unless forced", () => {
    expect(fitFlowPrefix("abc def", 100, 10, measure)).toBe(0);
    expect(fitFlowPrefix("abc def", 100, 10, measure, true)).toBe(4);
  });
});

describe("layoutFlow", () => {
  const slotFor = (i: number) => ({ page: 1 + i, x: 0, y: 0, w: 100, maxH: 40 });

  it("spills onto as many pages as needed and loses no text", () => {
    const text = "aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj";
    const segments = layoutFlow(text, slotFor, measure);
    expect(segments.map(s => s.value).join("")).toBe(text);
    expect(segments.map(s => s.slot.page)).toEqual([1, 2, 3]);
    segments.forEach(s => expect(measure(s.value.trimEnd(), 100)).toBeLessThanOrEqual(40));
  });

  it("always has one box, even when empty", () => {
    expect(layoutFlow("", slotFor, measure).map(s => s.value)).toEqual([""]);
  });

  it("starts on the next page when the tap was too low for a line", () => {
    const low = (i: number) => (i === 0 ? { page: 1, x: 0, y: 0, w: 100, maxH: 5 } : slotFor(i));
    const segments = layoutFlow("hi there", low, measure);
    expect(segments.map(s => s.value)).toEqual(["", "hi there"]);
  });

  it("pulls text back when it's deleted", () => {
    const long = layoutFlow("aaaa bbbb cccc dddd eeee", slotFor, measure);
    expect(long).toHaveLength(2);
    const short = layoutFlow("aaaa bbbb cccc dddd", slotFor, measure);
    expect(short).toHaveLength(1);
  });
});

describe("locateFlowCaret", () => {
  it("stays in the box being typed in", () => {
    expect(locateFlowCaret(["abc ", "def"], 4, 0)).toEqual({ index: 0, offset: 4 });
  });

  it("follows text that moved to the next page", () => {
    expect(locateFlowCaret(["abc ", "defg"], 8, 0)).toEqual({ index: 1, offset: 4 });
  });

  it("puts the caret at the top of the next page after a page-ending break", () => {
    expect(locateFlowCaret(["abc\n", ""], 4, 0)).toEqual({ index: 1, offset: 0 });
    expect(locateFlowCaret(["", "abc"], 0, 0)).toEqual({ index: 1, offset: 0 });
  });
});

describe("display filler", () => {
  it("renders a trailing line break only on the last box and strips it back", () => {
    expect(flowDisplayText("a\n", true)).toBe("a\n​");
    expect(flowDisplayText("a\n", false)).toBe("a\n");
    expect(stripFlowFiller("a\n​")).toBe("a\n");
  });
});
