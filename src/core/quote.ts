/**
 * Text-quote anchoring, as in the W3C Web Annotation model (and Hypothesis):
 * store the highlighted text plus some context on each side, then find the
 * best match again later, even if the surrounding text has shifted.
 */

import type { TextSpan } from './textIndex';

export interface TextQuote {
  exact: string;
  prefix: string;
  suffix: string;
  /** Offset where the quote began when created; only used to break ties. */
  start: number;
}

const CONTEXT_CHARS = 32;
const MAX_CANDIDATES = 500;

export function describeQuote(text: string, span: TextSpan): TextQuote {
  return {
    exact: text.slice(span.start, span.end),
    prefix: text.slice(Math.max(0, span.start - CONTEXT_CHARS), span.start),
    suffix: text.slice(span.end, span.end + CONTEXT_CHARS),
    start: span.start,
  };
}

export function resolveQuote(text: string, quote: TextQuote): TextSpan | null {
  if (!quote.exact) return null;
  return findBest(text, quote) ?? findBestIgnoringWhitespace(text, quote);
}

function findBest(text: string, quote: TextQuote): TextSpan | null {
  let best: TextSpan | null = null;
  let bestScore = -Infinity;
  let from = 0;
  for (let n = 0; n < MAX_CANDIDATES; n++) {
    const at = text.indexOf(quote.exact, from);
    if (at === -1) break;
    const span = { start: at, end: at + quote.exact.length };
    const score = contextScore(text, span, quote);
    if (score > bestScore) {
      bestScore = score;
      best = span;
    }
    from = at + 1;
  }
  return best;
}

function contextScore(text: string, span: TextSpan, quote: TextQuote): number {
  const before = text.slice(Math.max(0, span.start - quote.prefix.length), span.start);
  const after = text.slice(span.end, span.end + quote.suffix.length);
  // Matching context dominates; distance from the original position (always < 1) only breaks ties.
  const distance = Math.abs(span.start - quote.start) / (text.length + 1);
  return commonSuffixLength(before, quote.prefix) + commonPrefixLength(after, quote.suffix) - distance;
}

// Re-rendered markdown often changes whitespace (line breaks, indentation), so retry with it collapsed.
function findBestIgnoringWhitespace(text: string, quote: TextQuote): TextSpan | null {
  const collapsed = collapseWhitespace(text);
  const exact = collapseWhitespace(quote.exact).text.trim();
  if (!exact) return null;
  const span = findBest(collapsed.text, {
    exact,
    prefix: collapseWhitespace(quote.prefix).text,
    suffix: collapseWhitespace(quote.suffix).text,
    start: Math.round((quote.start * collapsed.text.length) / (text.length || 1)),
  });
  const start = span && collapsed.map[span.start];
  const last = span && collapsed.map[span.end - 1];
  return start == null || last == null ? null : { start, end: last + 1 };
}

/** Collapses whitespace runs to one space; map[i] is the original index of collapsed char i. */
function collapseWhitespace(input: string): { text: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let previousWasSpace = false;
  for (let i = 0; i < input.length; i++) {
    const char = input.charAt(i);
    const isSpace = /\s/.test(char);
    if (isSpace && previousWasSpace) continue;
    chars.push(isSpace ? ' ' : char);
    map.push(i);
    previousWasSpace = isSpace;
  }
  return { text: chars.join(''), map };
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

function commonSuffixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}
