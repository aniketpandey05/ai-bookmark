import { browser, type ContentScriptContext } from '#imports';
import type { MessageRef, SiteAdapter } from '../adapters/types';
import { debounce } from '../core/debounce';
import { describeMessage, resolveMarks, type ResolvedMark } from '../core/locate';
import type { PendingJump, RuntimeMessage } from '../core/messages';
import { moveItem, nextOrder, sortByOrder } from '../core/order';
import { HighlightPainter } from '../core/painter';
import { describeQuote } from '../core/quote';
import { searchMarks } from '../core/search';
import { loadAllMarks, loadMarks, removeMark, saveOrder, upsertMark, watchMarks } from '../core/store';
import { loadTheme, watchTheme, type Theme } from '../core/theme';
import { buildTextIndex, spanFromRange, type TextIndex, type TextSpan } from '../core/textIndex';
import type { HighlightColor, Mark } from '../core/types';

/** Tag name of the shadow-root host that holds all of our UI. */
export const UI_TAG = 'chatmarks-ui';

// A chat page that still shows no messages after this long probably has a changed layout.
const BROKEN_AFTER_MS = 5000;
const NOTICE_MS = 4000;
const JUMP_FLASH_MS = 1600;
const JUMP_SETTLE_MS = 700;
// How long to keep looking for a highlight the library asked us to jump to.
const JUMP_WAIT_MS = 15000;
const JUMP_POLL_MS = 300;
// Scrolling up to let a site load older messages: how many screens to try, and how long to wait each time.
const LOAD_OLDER_STEPS = 12;
const LOAD_OLDER_WAIT_MS = 400;
const SEARCH_RESULTS = 8;
const MARK_HASH = '#bookmark=';
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

export interface SearchState {
  query: string;
  results: Mark[];
  /** Which result the arrow keys are on. */
  active: number;
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
  /** The search box over every highlight from every site; null when closed. */
  search: SearchState | null;
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
    search: null,
    health: 'ok',
    dark: false,
    notice: null,
  };
  /** Every highlight from every site, loaded when the search box opens. */
  private allMarks: Mark[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly painter = new HighlightPainter();
  private marks: Mark[] = [];
  private resolved = new Map<string, ResolvedMark>();
  private pending: PendingSelection | null = null;
  private unwatch: (() => void) | undefined;
  private openedAt = 0;
  private theme: Theme = 'system';
  /** Where "next highlight" continues from; -1 means nowhere yet. */
  private cursor = -1;
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
    // The library asks an already-open tab to jump to a highlight.
    browser.runtime.onMessage.addListener((message) => {
      const request = message as RuntimeMessage;
      if (request.type === 'jump-to-mark') void this.jumpWhenReady(request.markId, request.conversationId);
    });

    this.theme = await loadTheme();
    watchTheme((theme) => {
      this.theme = theme;
      this.refresh();
    });

    await this.openConversation(new URL(location.href));
    void this.followRequestedJump();
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
    const index = this.state.items.findIndex((item) => item.mark.id === id);
    if (index !== -1) this.cursor = index;
    void this.jumpToMark(id);
  }

  /** Moves to the next (+1) or previous (-1) highlight in the user's order. */
  step(delta: number): void {
    const { items } = this.state;
    if (items.length === 0) return;
    const from = this.cursor === -1 ? (delta > 0 ? -1 : items.length) : this.cursor;
    const next = clamp(from + delta, 0, items.length - 1);
    this.cursor = next;
    this.notify(`${next + 1} of ${items.length}`);
    void this.jumpToMark(items[next]!.mark.id);
  }

  private async jumpToMark(id: string): Promise<void> {
    this.refresh();
    const hit = this.resolved.get(id) ?? (await this.searchOlderMessages(id));
    if (!hit) {
      this.notify("Couldn't find this one on the page. The message may have been edited or deleted.");
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

  /**
   * Long chats only keep recent messages on the page. Scroll up a screen at a time,
   * giving the site a chance to load older ones, until the highlight turns up.
   */
  private async searchOlderMessages(id: string): Promise<ResolvedMark | undefined> {
    const scroller = this.findScroller();
    if (!scroller) return undefined;

    const startedAt = scroller.scrollTop;
    this.notify('Looking further up the chat…');
    for (let step = 0; step < LOAD_OLDER_STEPS && !this.ctx.isInvalid; step++) {
      const messagesBefore = this.adapter.getMessages().length;
      const topBefore = scroller.scrollTop;
      scroller.scrollTop = Math.max(0, topBefore - scroller.clientHeight);
      await delay(this.ctx, LOAD_OLDER_WAIT_MS);

      this.refresh();
      const hit = this.resolved.get(id);
      if (hit) {
        this.setState({ notice: null });
        return hit;
      }
      // Nothing moved and nothing loaded: we're as far back as this chat goes.
      if (this.adapter.getMessages().length === messagesBefore && scroller.scrollTop === topBefore) break;
    }

    scroller.scrollTop = startedAt;
    return undefined;
  }

  /** The element the chat actually scrolls in, which is rarely the window. */
  private findScroller(): HTMLElement | null {
    const first = this.adapter.getMessages()[0]?.el;
    for (let el = first?.parentElement ?? null; el; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight + 10) {
        return el as HTMLElement;
      }
    }
    const page = document.scrollingElement as HTMLElement | null;
    return page && page.scrollHeight > page.clientHeight + 10 ? page : null;
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

  /** Opens the search box over everything saved, from any site. */
  async openSearch(): Promise<void> {
    this.allMarks = await loadAllMarks();
    const recent = [...this.allMarks].sort((a, b) => b.createdAt - a.createdAt);
    this.setState({ search: { query: '', results: recent.slice(0, SEARCH_RESULTS), active: 0 } });
  }

  searchFor(query: string): void {
    if (!this.state.search) return;
    const matches = query.trim()
      ? searchMarks(this.allMarks, query)
      : [...this.allMarks].sort((a, b) => b.createdAt - a.createdAt);
    this.setState({ search: { query, results: matches.slice(0, SEARCH_RESULTS), active: 0 } });
  }

  moveSearch(delta: number): void {
    const search = this.state.search;
    if (!search?.results.length) return;
    this.setState({
      search: { ...search, active: clamp(search.active + delta, 0, search.results.length - 1) },
    });
  }

  moveSearchTo(active: number): void {
    const search = this.state.search;
    if (search && search.active !== active) this.setState({ search: { ...search, active } });
  }

  closeSearch(): void {
    if (this.state.search) this.setState({ search: null });
  }

  /** Opens the chosen result: jump if it's on this page, otherwise hand it to the background. */
  openSearchResult(mark?: Mark): void {
    const search = this.state.search;
    const target = mark ?? search?.results[search.active];
    if (!target) return;
    this.closeSearch();

    if (target.site === this.adapter.site && target.conversationId === this.state.conversationId) {
      this.jump(target.id);
      return;
    }
    void browser.runtime
      .sendMessage({ type: 'open-mark', mark: target } satisfies RuntimeMessage)
      .catch(() => undefined);
  }

  /** Opens the library page listing highlights from every site. */
  openLibrary(): void {
    void browser.runtime
      .sendMessage({ type: 'open-library' } satisfies RuntimeMessage)
      .catch(() => undefined);
  }

  openCard(markId: string, focusNote = false): void {
    this.setState({ card: { markId, position: this.cardPosition(markId), focusNote } });
  }

  closeCard(): void {
    if (this.state.card) this.setState({ card: null });
  }

  /** Jumps to a highlight opened from the library, or from a link ending in #bookmark=<id>. */
  private async followRequestedJump(): Promise<void> {
    const fromLink = location.hash.startsWith(MARK_HASH)
      ? decodeURIComponent(location.hash.slice(MARK_HASH.length))
      : null;
    if (fromLink && this.state.conversationId) {
      history.replaceState(null, '', location.pathname + location.search);
      await this.jumpWhenReady(fromLink, this.state.conversationId);
      return;
    }
    const pending = (await browser.runtime
      .sendMessage({ type: 'take-pending-jump' } satisfies RuntimeMessage)
      .catch(() => null)) as PendingJump | null;
    if (pending) await this.jumpWhenReady(pending.markId, pending.conversationId);
  }

  /** Waits for the chat and the highlight to load, then jumps to it. */
  private async jumpWhenReady(markId: string, conversationId: string): Promise<void> {
    const deadline = Date.now() + JUMP_WAIT_MS;
    while (Date.now() < deadline && !this.ctx.isInvalid) {
      // Wait for the right chat and for its highlights to load, then let jumping do the rest.
      if (this.state.conversationId === conversationId && this.marks.some((m) => m.id === markId)) {
        this.jump(markId);
        return;
      }
      await delay(this.ctx, JUMP_POLL_MS);
    }
  }

  private async openConversation(url: URL): Promise<void> {
    const conversationId = this.adapter.getConversationId(url);
    if (conversationId === this.state.conversationId) return;

    this.unwatch?.();
    this.unwatch = undefined;
    this.marks = [];
    this.pending = null;
    this.cursor = -1;
    this.openedAt = Date.now();
    this.painter.clearFlash();
    this.setState({
      conversationId,
      items: [],
      selection: null,
      card: null,
      search: null,
      health: 'ok',
    });
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
      // "System" means matching the page we're sitting on, which is what looks right in context.
      dark: this.theme === 'system' ? isDarkPage() : this.theme === 'dark',
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
    } else if (event.altKey && event.shiftKey && event.code === 'KeyF') {
      void this.openSearch();
    } else if (event.altKey && event.shiftKey && (event.code === 'ArrowDown' || event.code === 'ArrowUp')) {
      this.step(event.code === 'ArrowDown' ? 1 : -1);
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

function delay(ctx: ContentScriptContext, ms: number): Promise<void> {
  return new Promise((resolve) => ctx.setTimeout(() => resolve(), ms));
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
