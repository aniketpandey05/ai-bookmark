import { describe, expect, it } from 'vitest';
import { describeQuote, resolveQuote } from '../src/core/quote';

function quoteOf(text: string, exact: string, occurrence = 0) {
  let start = -1;
  for (let i = 0; i <= occurrence; i++) start = text.indexOf(exact, start + 1);
  return describeQuote(text, { start, end: start + exact.length });
}

describe('resolveQuote', () => {
  it('finds the quote in unchanged text', () => {
    const text = 'Use docker compose up -d to start the stack.';
    const quote = quoteOf(text, 'docker compose up -d');
    expect(resolveQuote(text, quote)).toEqual({ start: 4, end: 24 });
  });

  it('picks the occurrence whose context matches', () => {
    const text = 'Step one: run the tests. Step two: deploy, then run the tests again.';
    const quote = quoteOf(text, 'run the tests', 1);
    const span = resolveQuote(text, quote)!;
    expect(text.slice(span.start - 13, span.end)).toBe('deploy, then run the tests');
  });

  it('survives text inserted before the quote', () => {
    const original = 'Intro. The key insight is caching. Outro.';
    const quote = quoteOf(original, 'The key insight is caching.');
    const edited = 'A brand new paragraph was added here. ' + original;
    const span = resolveQuote(edited, quote)!;
    expect(edited.slice(span.start, span.end)).toBe('The key insight is caching.');
  });

  it('falls back to whitespace-insensitive matching', () => {
    const original = 'first line\n\n  second   line';
    const quote = quoteOf(original, 'line\n\n  second');
    const rerendered = 'first line second line';
    const span = resolveQuote(rerendered, quote)!;
    expect(rerendered.slice(span.start, span.end)).toBe('line second');
  });

  it('prefers the nearest match when context cannot decide', () => {
    const text = 'ok ok ok ok';
    const quote = { exact: 'ok', prefix: '', suffix: '', start: 6 };
    expect(resolveQuote(text, quote)).toEqual({ start: 6, end: 8 });
  });

  it('returns null when the text is gone', () => {
    const quote = quoteOf('hello brave world', 'brave');
    expect(resolveQuote('hello world', quote)).toBeNull();
  });
});
