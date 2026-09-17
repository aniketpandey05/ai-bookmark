import type { ContentScriptContext } from '#imports';
import type { MessageRef, SiteAdapter } from '../adapters/types';
import { debounce } from '../core/debounce';
import { describeMessage, resolveMarks, type ResolvedMark } from '../core/locate';
import { moveItem, nextOrder, sortByOrder } from '../core/order';
import { HighlightPainter } from '../core/painter';
import { describeQuote } from '../core/quote';
import { loadMarks, removeMark, saveOrder, upsertMark, watchMarks } from '../core/store';
import { buildTextIndex, spanFromRange, type TextIndex, type TextSpan } from '../core/textIndex';
import type { HighlightColor, Mark } from '../core/types';

/** Tag name of the shadow-root host that holds all of our UI. */
export const UI_TAG = 'chatmarks-ui';

// A chat page that still shows no messages after this long probably has a changed layout.
const BROKEN_AFTER_MS = 5000;
const NOTICE_MS = 4000;
const JUMP_FLASH_MS = 1600;
const JUMP_SETTLE_MS = 700;
// Approximate note card size, used to keep it on screen. Matches .cm-card in styles.css.
const CARD_WIDTH = 300;
const CARD_HEIGHT = 200;
const CARD_GAP = 8;
// Clicks on these keep their normal behaviour instead of opening a highlight's note.
const INTERACTIVE = 'a, button, input, textarea, select, [contenteditable="true"]';

export interface PanelItem {
  mark: Mark;
  found: boolean;
}

export interface NoteCardState {
  markId: string;
  /** Viewport position next to the highlight; null docks the card beside the panel. */
  position: { top: number; left: number } | null;
  focusNote: boolean;
}

export interface ViewState {
  conversationId: string | null;
  /** Highlights in the user's order. */
  items: PanelItem[];
  /** Viewport position of the current text selection, when it can be highlighted. */
  selection: { top: number; bottom: number; left: number; streaming: boolean } | null;
  card: NoteCardState | null;
  health: 'ok' | 'no-messages';
  dark: boolean;
  notice: string | null;
}

interface PendingSelection {
  message: MessageRef;
  index: TextIndex;
  span: TextSpan;
}

export class ChatmarksController {
  private state: ViewState = {
    conversationId: null,
    items: [],
    selection: null,
    card: null,
    health: 'ok',
    dark: false,
    notice: null,
  };
  private readonly listeners = new Set<() => void>();
  private readonly painter = new HighlightPainter();
  private marks: Mark[] = [];
  private resolved = new Map<string, ResolvedMark>();
  private pending: PendingSelection | null = null;
  private unwatch: (() => void) | undefined;
  private openedAt = 0;
  // Streaming replies mutate the page constantly, so also refresh at least once a second.
  private readonly scheduleRefresh = debounce(() => this.refresh(), 200, 1000);

  constructor(
    private readonly ctx: ContentScriptContext,
    private readonly adapter: SiteAdapter,
  ) {}

  getState = (): ViewState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async start(): Promise<void> {
    const observer = new MutationObserver(() => this.scheduleRefresh());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    this.ctx.onInvalidated(() => {
      observer.disconnect();
      this.scheduleRefresh.cancel();
      this.unwatch?.();
      this.painter.dispose();
    });

    this.ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => {
      void this.openConversation(newUrl);
    });
    // The selection is only final after mouseup has been handled.
    this.ctx.addEventListener(document, 'mouseup', () => this.ctx.setTimeout(this.captureSelection, 0));
    this.ctx.addEventListener(document, 'click', this.onClick);
    this.ctx.addEventListener(document, 'keyup', this.onKeyUp);
    // Toolbar and card positions are viewport rects, which go stale when anything scrolls.
    this.ctx.addEventListener(document, 'scroll', this.onViewportChange, { capture: true });
    this.ctx.addEventListener(window, 'resize', this.onViewportChange);

    await this.openConversation(new URL(location.href));
  }

  async highlight(color: HighlightColor, { withNote = false } = {}): Promise<void> {
    const pending = this.pending;
    const conversationId = this.state.conversationId;
    if (!pending || !conversationId || this.adapter.isStreaming(pending.message)) return;

    const quote = describeQuote(pending.index.text, pending.span);
    const now = Date.now();
    const mark: Mark = {
      id: crypto.randomUUID(),
      site: this.adapter.site,
      conversationId,
      conversationTitle: this.adapter.getConversationTitle(),
      url: location.href,
      message: describeMessage(pending.message, pending.index.text),
      quote,
      label: '',
      color,
      order: nextOrder(this.marks),
      snapshot: quote.exact.trim(),
      createdAt: now,
      updatedAt: now,
    };

    window.getSelection()?.removeAllRanges();
    this.clearSelectionDraft();
    this.marks = [...this.marks, mark];
    this.refresh();
    if (withNote) this.openCard(mark.id, true);
    await upsertMark(mark);
  }

  async updateMark(id: string, patch: Partial<Pick<Mark, 'color' | 'note'>>): Promise<void> {
    const mark = this.marks.find((m) => m.id === id);
    if (!mark) return;
    const updated: Mark = { ...mark, ...patch, updatedAt: Date.now() };
    this.marks = this.marks.map((m) => (m.id === id ? updated : m));
    this.refresh();
    await upsertMark(updated);
  }

  async saveNote(id: string, note: string): Promise<void> {
    if (this.state.card?.markId === id) this.closeCard();
    const trimmed = note.trim();
    const mark = this.marks.find((m) => m.id === id);
    if (!mark || (mark.note ?? '') === trimmed) return;
    await this.updateMark(id, { note: trimmed || undefined });
  }

  /** Moves a highlight to a new position in the user's list. */
  async move(id: string, toIndex: number): Promise<void> {
    const conversationId = this.state.conversationId;
    const ordered = sortByOrder(this.marks);
    const from = ordered.findIndex((m) => m.id === id);
    if (!conversationId || from === -1 || from === toIndex) return;

    this.marks = moveItem(ordered, from, toIndex).map((m, order) =>
      m.order === order ? m : { ...m, order },
    );
    this.refresh();
    await saveOrder(this.adapter.site, conversationId, this.marks.map((m) => m.id));
  }

  async remove(id: string): Promise<void> {
    const conversationId = this.state.conversationId;
    if (!conversationId) return;
    if (this.state.card?.markId === id) this.closeCard();
    this.painter.clearFlash();
    this.marks = this.marks.filter((m) => m.id !== id);
    this.refresh();
    await removeMark(this.adapter.site, conversationId, id);
  }

  jump(id: string): void {
    this.refresh();
    const hit = this.resolved.get(id);
    if (!hit) {
      this.notify("Couldn't find this in the page. If it's in an older part of the chat, scroll up and try again.");
      return;
    }
    const target = hit.range.startContainer.parentElement ?? hit.message.el;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
    this.painter.flashRange(hit.range, JUMP_FLASH_MS);
    if (smooth) {
      // Smooth scrolling can stall (e.g. while the page isn't painting); make sure we still arrive.
      this.ctx.setTimeout(() => {
        if (!isInViewport(target)) target.scrollIntoView({ block: 'center' });
      }, JUMP_SETTLE_MS);
    }
  }

  /** Lights up a highlight in the chat while its panel entry is hovered; null turns it off. */
  preview(id: string | null): void {
    const range = id ? this.resolved.get(id)?.range : undefined;
    if (range) this.painter.flashRange(range);
    else this.painter.clearFlash();
  }

  /** Opens a highlight's note from the panel, scrolling to the highlight when it's on the page. */
  editNote(id: string): void {
    this.refresh();
    if (this.resolved.has(id)) this.jump(id);
    this.openCard(id, true);
  }

  openCard(markId: string, focusNote = false): void {
    this.setState({ card: { markId, position: this.cardPosition(markId), focusNote } });
  }

  closeCard(): void {
    if (this.state.card) this.setState({ card: null });
  }

  private async openConversation(url: URL): Promise<void> {
    const conversationId = this.adapter.getConversationId(url);
    if (conversationId === this.state.conversationId) return;

    this.unwatch?.();
    this.unwatch = undefined;
    this.marks = [];
    this.pending = null;
    this.openedAt = Date.now();
    this.painter.clearFlash();
    this.setState({ conversationId, items: [], selection: null, card: null, health: 'ok' });
    if (!conversationId) {
      this.refresh();
      return;
    }

    this.unwatch = watchMarks(this.adapter.site, conversationId, (marks) => {
      this.marks = marks;
      this.refresh();
    });
    const marks = await loadMarks(this.adapter.site, conversationId);
    if (this.state.conversationId !== conversationId) return;
    this.marks = marks;
    this.refresh();
    // Re-check once the page has had time to render, so a broken layout gets reported.
    this.ctx.setTimeout(() => this.refresh(), BROKEN_AFTER_MS + 100);
  }

  private refresh(): void {
    const { conversationId, card } = this.state;
    const messages = conversationId ? this.adapter.getMessages() : [];
    const { resolved } = resolveMarks(this.marks, messages, (m) => this.adapter.getContentRoot(m));
    this.resolved = new Map(resolved.map((r) => [r.mark.id, r]));
    this.painter.paint(
      resolved
        .filter((r) => r.mark.quote)
        .map((r) => ({ color: r.mark.color, range: r.range, noted: !!r.mark.note })),
    );

    const brokenLayout =
      !!conversationId && messages.length === 0 && Date.now() - this.openedAt > BROKEN_AFTER_MS;
    const cardStillValid = card && this.marks.some((m) => m.id === card.markId);
    this.setState({
      items: sortByOrder(this.marks).map((mark) => ({ mark, found: this.resolved.has(mark.id) })),
      card: cardStillValid ? { ...card, position: this.cardPosition(card.markId) } : null,
      health: brokenLayout ? 'no-messages' : 'ok',
      dark: isDarkPage(),
    });
  }

  private cardPosition(markId: string): NoteCardState['position'] {
    const range = this.resolved.get(markId)?.range;
    if (!range) return null;
    const rects = range.getClientRects();
    const first = rects[0];
    const last = rects[rects.length - 1];
    if (!first || !last) return null;
    const fitsBelow = last.bottom + CARD_GAP + CARD_HEIGHT <= innerHeight;
    const top = fitsBelow ? last.bottom + CARD_GAP : first.top - CARD_GAP - CARD_HEIGHT;
    return {
      top: clamp(top, CARD_GAP, innerHeight - CARD_HEIGHT - CARD_GAP),
      left: clamp(last.left, CARD_GAP, innerWidth - CARD_WIDTH - CARD_GAP),
    };
  }

  private captureSelection = (): void => {
    const selection = window.getSelection();
    if (!this.state.conversationId || !selection || selection.isCollapsed || !selection.rangeCount) {
      this.clearSelectionDraft();
      return;
    }
    const range = selection.getRangeAt(0);
    const messages = this.adapter.getMessages();
    const containing = (node: Node) =>
      messages.find((m) => this.adapter.getContentRoot(m).contains(node));
    const message = containing(range.startContainer) ?? containing(range.endContainer);
    if (!message) {
      this.clearSelectionDraft();
      return;
    }

    const index = buildTextIndex(this.adapter.getContentRoot(message));
    const span = spanFromRange(index, range);
    if (!span || !index.text.slice(span.start, span.end).trim()) {
      this.clearSelectionDraft();
      return;
    }

    const rect = range.getBoundingClientRect();
    this.pending = { message, index, span };
    this.setState({
      selection: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left + rect.width / 2,
        streaming: this.adapter.isStreaming(message),
      },
    });
  };

  private clearSelectionDraft = (): void => {
    if (!this.pending && !this.state.selection) return;
    this.pending = null;
    this.setState({ selection: null });
  };

  /** A plain click on highlighted text opens that highlight's note. */
  private onClick = (event: MouseEvent): void => {
    if (event.button !== 0 || !window.getSelection()?.isCollapsed) return;
    const ignored = event
      .composedPath()
      .some((node) => node instanceof Element && (node.localName === UI_TAG || node.matches(INTERACTIVE)));
    if (ignored) return;
    const markId = this.markAt(event.clientX, event.clientY);
    if (markId) this.openCard(markId);
  };

  private markAt(x: number, y: number): string | undefined {
    for (const { mark, range } of this.resolved.values()) {
      if (!mark.quote) continue;
      for (const rect of range.getClientRects()) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return mark.id;
      }
    }
    return undefined;
  }

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.altKey && event.shiftKey && (event.code === 'KeyH' || event.code === 'KeyN')) {
      void this.highlight('yellow', { withNote: event.code === 'KeyN' });
    } else if (event.shiftKey || event.key.startsWith('Arrow')) {
      this.captureSelection();
    }
  };

  // Scroll events already arrive at most once per frame, so repositioning right away is cheap.
  private onViewportChange = (): void => {
    this.clearSelectionDraft();
    const card = this.state.card;
    if (card?.position) this.setState({ card: { ...card, position: this.cardPosition(card.markId) } });
  };

  private notify(notice: string): void {
    this.setState({ notice });
    this.ctx.setTimeout(() => {
      if (this.state.notice === notice) this.setState({ notice: null });
    }, NOTICE_MS);
  }

  private setState(patch: Partial<ViewState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function isInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < innerHeight;
}

function isDarkPage(): boolean {
  for (const el of [document.body, document.documentElement]) {
    const [r, g, b, alpha = 1] = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
    if (r === undefined || g === undefined || b === undefined || alpha === 0) continue;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  }
  return matchMedia('(prefers-color-scheme: dark)').matches;
}
