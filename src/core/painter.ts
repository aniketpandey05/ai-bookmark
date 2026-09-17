import type { HighlightColor } from './types';

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: 'rgba(250, 204, 21, 0.45)',
  green: 'rgba(74, 222, 128, 0.40)',
  blue: 'rgba(96, 165, 250, 0.40)',
  pink: 'rgba(244, 114, 182, 0.40)',
};

const FLASH = 'chatmarks-flash';
const NOTED = 'chatmarks-noted';
const layerName = (color: HighlightColor) => `chatmarks-${color}`;

export interface PaintEntry {
  color: HighlightColor;
  range: Range;
  /** Highlights with a note get a dotted underline so they stand out. */
  noted: boolean;
}

/**
 * Paints highlights with the CSS Custom Highlight API. Nothing is inserted into
 * the chat's DOM, so the site's re-renders can't break or duplicate highlights.
 */
export class HighlightPainter {
  private readonly layers = new Map<HighlightColor, Highlight>();
  private readonly noted = new Highlight();
  private readonly flash = new Highlight();
  private readonly style: HTMLStyleElement;
  private flashTimer: ReturnType<typeof setTimeout> | undefined;

  static isSupported(): boolean {
    return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';
  }

  constructor(doc: Document = document) {
    const colors = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[];
    this.style = doc.createElement('style');
    this.style.setAttribute('data-chatmarks-ui', '');
    this.style.textContent = [
      ...colors.map((c) => `::highlight(${layerName(c)}) { background-color: ${HIGHLIGHT_COLORS[c]}; }`),
      `::highlight(${NOTED}) { text-decoration: underline dotted rgba(234, 88, 12, 0.9); text-decoration-thickness: 2px; }`,
      `::highlight(${FLASH}) { background-color: rgba(249, 115, 22, 0.75); }`,
    ].join('\n');
    doc.head.append(this.style);

    for (const color of colors) {
      const layer = new Highlight();
      this.layers.set(color, layer);
      CSS.highlights.set(layerName(color), layer);
    }
    this.noted.priority = 1;
    CSS.highlights.set(NOTED, this.noted);
    this.flash.priority = 2;
    CSS.highlights.set(FLASH, this.flash);
  }

  paint(entries: PaintEntry[]): void {
    for (const layer of this.layers.values()) layer.clear();
    this.noted.clear();
    for (const { color, range, noted } of entries) {
      this.layers.get(color)?.add(range);
      if (noted) this.noted.add(range);
    }
  }

  /** Emphasizes one highlight, for `durationMs` or until `clearFlash` when no duration is given. */
  flashRange(range: Range, durationMs?: number): void {
    this.flash.clear();
    this.flash.add(range);
    clearTimeout(this.flashTimer);
    if (durationMs !== undefined) this.flashTimer = setTimeout(() => this.flash.clear(), durationMs);
  }

  clearFlash(): void {
    clearTimeout(this.flashTimer);
    this.flash.clear();
  }

  dispose(): void {
    clearTimeout(this.flashTimer);
    for (const color of this.layers.keys()) CSS.highlights.delete(layerName(color));
    CSS.highlights.delete(NOTED);
    CSS.highlights.delete(FLASH);
    this.style.remove();
  }
}
