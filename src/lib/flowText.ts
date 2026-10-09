/**
 * Word-style flowing text for the PDF Editor's "Insert Text" mode.
 *
 * One continuous piece of text (a "flow") is laid out across a chain of
 * text boxes, one per page: the first box sits wherever the user tapped,
 * every continuation box fills the next page between its margins. Text that
 * no longer fits a page spills onto the next one (breaking between words
 * when it can), and deleting text pulls it back -- just like a word
 * processor. Measuring is injected so this stays pure and testable.
 */

/** Rendered height (px) of `text` wrapped at `width` px. */
export type FlowMeasure = (text: string, width: number) => number;

export interface FlowSlot {
  page: number;
  x: number;
  y: number;
  w: number;
  /** Height available for text in this box before the page's bottom margin. */
  maxH: number;
}

export interface FlowSegment {
  slot: FlowSlot;
  value: string;
}

/** Hard cap so a runaway layout can never spin forever. */
const MAX_FLOW_BOXES = 400;

/**
 * Length of the longest prefix of `text` that fits `maxH` at `width`,
 * moved back to the last word break when the cut would split a word.
 * With `forceProgress` (a box on an otherwise empty page) at least one
 * word -- or one character -- is always taken so the layout advances.
 */
export function fitFlowPrefix(text: string, width: number, maxH: number, measure: FlowMeasure, forceProgress = false): number {
  if (!text) return 0;
  if (measure(text, width) <= maxH) return text.length;
  let n = 0;
  if (measure(text.slice(0, 1), width) <= maxH) {
    let lo = 1, hi = text.length - 1; // lo always fits; the whole text does not
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (measure(text.slice(0, mid), width) <= maxH) lo = mid;
      else hi = mid - 1;
    }
    n = lo;
  }
  if (n > 0 && n < text.length && !/\s/.test(text[n]) && !/\s/.test(text[n - 1])) {
    // Mid-word: carry the whole word to the next page instead of splitting it.
    let j = n - 1;
    while (j >= 0 && !/\s/.test(text[j])) j--;
    if (j >= 0) n = j + 1;
  }
  if (n === 0 && forceProgress) {
    const space = text.search(/\s/);
    n = space > 0 ? space + 1 : 1;
  }
  // Spaces hang off the end of a line, and a paragraph break ends this page
  // rather than leaving the next page starting with an empty line.
  while (n < text.length && text[n] === " ") n++;
  if (n > 0 && n < text.length && text[n] === "\n") n++;
  return n;
}

/** Splits `text` across as many boxes as it needs, starting at slot 0. */
export function layoutFlow(text: string, slotFor: (index: number) => FlowSlot, measure: FlowMeasure): FlowSegment[] {
  const segments: FlowSegment[] = [];
  let rest = text;
  do {
    const index = segments.length;
    const slot = slotFor(index);
    if (index === MAX_FLOW_BOXES - 1) {
      segments.push({ slot, value: rest });
      break;
    }
    const n = fitFlowPrefix(rest, slot.w, slot.maxH, measure, index > 0);
    segments.push({ slot, value: rest.slice(0, n) });
    rest = rest.slice(n);
  } while (rest);
  return segments;
}

/**
 * Which box (and where inside it) an absolute caret position lands in.
 * Stays in `prefer` (the box being typed in) whenever the caret is still
 * inside it, so typing never hops focus between pages needlessly.
 */
export function locateFlowCaret(values: string[], caret: number, prefer = -1): { index: number; offset: number } {
  const starts: number[] = [];
  let total = 0;
  values.forEach(value => { starts.push(total); total += value.length; });
  const c = Math.max(0, Math.min(total, caret));
  const last = values.length - 1;
  const holds = (i: number) => {
    const start = starts[i], end = start + values[i].length;
    if (c < start || c > end) return false;
    // At the very end of a box that ends a paragraph (or is empty), the
    // caret belongs at the top of the next page.
    if (c === end && i < last && (values[i] === "" || values[i].endsWith("\n"))) return false;
    return true;
  };
  if (prefer >= 0 && prefer <= last && holds(prefer)) return { index: prefer, offset: c - starts[prefer] };
  for (let i = 0; i <= last; i++) {
    if (c < starts[i] + values[i].length || i === last) return { index: i, offset: c - starts[i] };
  }
  return { index: 0, offset: 0 };
}

/** Text as shown in a box. A trailing line break needs a zero-width
 * character after it, or browsers don't render the empty last line. */
export const FLOW_FILLER = "​";
export function flowDisplayText(value: string, isLastBox: boolean): string {
  return isLastBox && value.endsWith("\n") ? value + FLOW_FILLER : value;
}
export function stripFlowFiller(text: string): string {
  return text.split(FLOW_FILLER).join("");
}
