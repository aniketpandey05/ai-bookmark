import { beforeEach, describe, expect, it } from 'vitest';
import { buildTextIndex, rangeFromSpan, spanFromRange } from '../src/core/textIndex';

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `
    <p id="before">outside</p>
    <div id="msg">
      <span class="sr-only">ChatGPT said:</span>
      <p>Hello <strong>bold</strong> world.</p>
      <pre><button>Copy code</button><code>npm run build</code></pre>
    </div>
    <p id="after">outside too</p>`;
  root = document.getElementById('msg')!;
});

describe('buildTextIndex', () => {
  it('keeps message text and skips page chrome', () => {
    const { text } = buildTextIndex(root);
    expect(text).toContain('Hello bold world.');
    expect(text).toContain('npm run build');
    expect(text).not.toContain('ChatGPT said');
    expect(text).not.toContain('Copy code');
  });
});

describe('rangeFromSpan / spanFromRange', () => {
  it('round-trips a span across element boundaries', () => {
    const index = buildTextIndex(root);
    const start = index.text.indexOf('lo bold wo');
    const range = rangeFromSpan(index, { start, end: start + 10 })!;
    expect(range.toString()).toBe('lo bold wo');
    expect(spanFromRange(index, range)).toEqual({ start, end: start + 10 });
  });

  it('handles boundaries that point at elements rather than text', () => {
    const index = buildTextIndex(root);
    const strong = root.querySelector('strong')!;
    const range = document.createRange();
    range.setStartBefore(strong);
    range.setEndAfter(strong);
    const span = spanFromRange(index, range)!;
    expect(index.text.slice(span.start, span.end)).toBe('bold');
  });

  it('clips a selection that extends outside the message', () => {
    const index = buildTextIndex(root);
    const range = document.createRange();
    range.setStart(document.getElementById('before')!.firstChild!, 2);
    range.setEnd(document.getElementById('after')!.firstChild!, 3);
    expect(spanFromRange(index, range)).toEqual({ start: 0, end: index.text.length });
  });
});
