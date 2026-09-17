import { useEffect, useRef, useState } from 'preact/hooks';
import type { ChatmarksController, NoteCardState, ViewState } from '../content/controller';
import { HIGHLIGHT_COLORS } from '../core/painter';
import type { HighlightColor, Mark } from '../core/types';

const COLORS = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[];
// Space needed above a selection to show the toolbar there instead of below it.
const TOOLBAR_OFFSET = 44;
const MAX_NOTE_LENGTH = 1000;
// Dragging an entry this close to the list's top or bottom edge scrolls the list by this much.
const DRAG_SCROLL_EDGE = 28;
const DRAG_SCROLL_STEP = 10;

interface Props {
  controller: ChatmarksController;
}

export function App({ controller }: Props) {
  const state = useViewState(controller);
  if (!state.conversationId) return null;
  const cardMark = state.card && state.items.find((item) => item.mark.id === state.card?.markId)?.mark;
  return (
    <div class={state.dark ? 'cm-root cm-dark' : 'cm-root'}>
      {state.selection && <SelectionToolbar selection={state.selection} controller={controller} />}
      <Panel state={state} controller={controller} />
      {state.card && cardMark && (
        <NoteCard key={cardMark.id} card={state.card} mark={cardMark} controller={controller} />
      )}
      {state.notice && (
        <div class="cm-notice" role="status">
          {state.notice}
        </div>
      )}
    </div>
  );
}

function useViewState(controller: ChatmarksController): ViewState {
  const [state, setState] = useState(controller.getState());
  useEffect(() => {
    setState(controller.getState());
    return controller.subscribe(() => setState(controller.getState()));
  }, [controller]);
  return state;
}

function SelectionToolbar({
  selection,
  controller,
}: Props & { selection: NonNullable<ViewState['selection']> }) {
  const top =
    selection.top > TOOLBAR_OFFSET + 16 ? selection.top - TOOLBAR_OFFSET : selection.bottom + 10;
  return (
    <div
      class="cm-toolbar"
      style={{ top: `${top}px`, left: `${selection.left}px` }}
      // Keep the page's text selection alive while the toolbar is clicked.
      onMouseDown={(event) => event.preventDefault()}
    >
      {selection.streaming ? (
        <span class="cm-toolbar-note">Wait for the reply to finish</span>
      ) : (
        <>
          {COLORS.map((color) => (
            <button
              key={color}
              class="cm-dot"
              style={{ background: HIGHLIGHT_COLORS[color] }}
              aria-label={`Highlight in ${color}`}
              title={color === 'yellow' ? 'Highlight (Alt+Shift+H)' : 'Highlight'}
              onClick={() => void controller.highlight(color)}
            />
          ))}
          <span class="cm-divider" />
          <button
            class="cm-icon-button"
            aria-label="Highlight and add a note"
            title="Highlight and add a note (Alt+Shift+N)"
            onClick={() => void controller.highlight('yellow', { withNote: true })}
          >
            <PencilIcon />
          </button>
        </>
      )}
    </div>
  );
}

function NoteCard({ card, mark, controller }: Props & { card: NoteCardState; mark: Mark }) {
  const [note, setNote] = useState(mark.note ?? '');
  const cardRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Read the textarea itself so a save never sees an older render's value.
  const save = () => void controller.saveNote(mark.id, textareaRef.current?.value ?? note);

  useEffect(() => {
    if (card.focusNote) textareaRef.current?.focus({ preventScroll: true });
  }, []);

  // Clicking anywhere else keeps what was typed instead of throwing it away.
  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (cardRef.current && !event.composedPath().includes(cardRef.current)) save();
    };
    window.addEventListener('mousedown', onMouseDown, true);
    return () => window.removeEventListener('mousedown', onMouseDown, true);
  }, [controller, mark.id]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      controller.closeCard();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save();
    }
  };

  return (
    <div
      ref={cardRef}
      class={card.position ? 'cm-card' : 'cm-card cm-card-docked'}
      style={card.position ? { top: `${card.position.top}px`, left: `${card.position.left}px` } : undefined}
      role="dialog"
      aria-label="Highlight note"
      onKeyDown={onKeyDown}
    >
      <div class="cm-card-header">
        <div class="cm-card-colors">
          {COLORS.map((color) => (
            <button
              key={color}
              class={color === mark.color ? 'cm-dot cm-dot-active' : 'cm-dot'}
              style={{ background: HIGHLIGHT_COLORS[color] }}
              aria-label={`Change color to ${color}`}
              aria-pressed={color === mark.color}
              onClick={() => void controller.updateMark(mark.id, { color })}
            />
          ))}
        </div>
        <button class="cm-text-button cm-danger" onClick={() => void controller.remove(mark.id)}>
          Delete
        </button>
      </div>
      {/* Without a highlight on screen to sit next to, show what the note is about. */}
      {!card.position && <p class="cm-card-quote">{mark.snapshot}</p>}
      <textarea
        ref={textareaRef}
        class="cm-textarea"
        value={note}
        maxLength={MAX_NOTE_LENGTH}
        rows={3}
        placeholder="Add a note…"
        aria-label="Note"
        onInput={(event) => setNote(event.currentTarget.value)}
      />
      <div class="cm-card-footer">
        <span class="cm-hint">Ctrl+Enter to save · Esc to cancel</span>
        <button class="cm-primary-button" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

interface DragState {
  id: string;
  from: number;
  over: number;
  /** Pointer position when the drag started, in list content coordinates. */
  startY: number;
  dy: number;
  /** Vertical centre of each entry when the drag started, in list content coordinates. */
  centers: number[];
  height: number;
}

function Panel({ state, controller }: Props & { state: ViewState }) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Moving with the keyboard re-renders the list; put focus back on the moved entry.
  const refocusId = useRef<string | null>(null);

  useEffect(() => {
    const id = refocusId.current;
    if (!id) return;
    refocusId.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-grip="${CSS.escape(id)}"]`)?.focus();
  }, [state.items]);

  if (!open) {
    return (
      <button
        class="cm-tab"
        onClick={() => setOpen(true)}
        aria-label={`Show highlights (${state.items.length})`}
        title="Chatmarks"
      >
        <BookmarkIcon />
        <span>{state.items.length}</span>
        {state.health === 'no-messages' && <span class="cm-alert">!</span>}
      </button>
    );
  }

  const close = () => {
    controller.preview(null);
    setOpen(false);
  };

  const listY = (list: HTMLElement, clientY: number) =>
    clientY - list.getBoundingClientRect().top + list.scrollTop;

  const startDrag = (event: PointerEvent, id: string, index: number) => {
    const list = listRef.current;
    if (event.button !== 0 || !list) return;
    event.preventDefault();
    try {
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    } catch {
      // Capture fails if the pointer is no longer active; dragging still works over the grip.
    }
    const rows = [...list.children].map((row) => row.getBoundingClientRect());
    const listTop = list.getBoundingClientRect().top;
    controller.preview(null);
    setDrag({
      id,
      from: index,
      over: index,
      startY: listY(list, event.clientY),
      dy: 0,
      centers: rows.map((rect) => rect.top - listTop + list.scrollTop + rect.height / 2),
      height: rows[index]?.height ?? 0,
    });
  };

  const continueDrag = (event: PointerEvent) => {
    const list = listRef.current;
    if (!drag || !list) return;
    const { top, bottom } = list.getBoundingClientRect();
    if (event.clientY < top + DRAG_SCROLL_EDGE) list.scrollTop -= DRAG_SCROLL_STEP;
    else if (event.clientY > bottom - DRAG_SCROLL_EDGE) list.scrollTop += DRAG_SCROLL_STEP;
    const dy = listY(list, event.clientY) - drag.startY;
    const center = drag.centers[drag.from]! + dy;
    const over = drag.centers.filter((c, i) => i !== drag.from && c < center).length;
    setDrag({ ...drag, dy, over });
  };

  const endDrag = () => {
    if (drag && drag.over !== drag.from) void controller.move(drag.id, drag.over);
    setDrag(null);
  };

  const onGripKeyDown = (event: KeyboardEvent, id: string, index: number) => {
    const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : null;
    if (to === null) return;
    event.preventDefault();
    if (to < 0 || to >= state.items.length) return;
    refocusId.current = id;
    void controller.move(id, to);
  };

  return (
    <section class="cm-panel" aria-label="Highlights in this chat">
      <header class="cm-panel-header">
        <span>Highlights</span>
        <button class="cm-close" onClick={close} aria-label="Close">
          ✕
        </button>
      </header>
      {state.items.length === 0 ? (
        <p class="cm-empty">Select text in any message to highlight it.</p>
      ) : (
        <ul ref={listRef} class={drag ? 'cm-list cm-list-dragging' : 'cm-list'}>
          {state.items.map(({ mark, found }, index) => (
            <li
              key={mark.id}
              class={rowClass(found, drag?.id === mark.id)}
              style={drag ? { transform: `translateY(${dragOffset(drag, index)}px)` } : undefined}
              onPointerEnter={() => !drag && controller.preview(mark.id)}
              onPointerLeave={() => !drag && controller.preview(null)}
            >
              <button
                class="cm-grip"
                data-grip={mark.id}
                aria-label={`Move highlight ${index + 1} with the up and down arrow keys`}
                title="Drag to reorder"
                onPointerDown={(event) => startDrag(event, mark.id, index)}
                onPointerMove={continueDrag}
                onPointerUp={endDrag}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(event) => onGripKeyDown(event, mark.id, index)}
              >
                <GripIcon />
              </button>
              <button class="cm-item" onClick={() => controller.jump(mark.id)}>
                <span class="cm-number" style={{ background: HIGHLIGHT_COLORS[mark.color] }}>
                  {index + 1}
                </span>
                <span class="cm-item-body">
                  <span class="cm-text">{mark.label || mark.snapshot}</span>
                  {mark.note && <span class="cm-note">{mark.note}</span>}
                </span>
                {!found && <span class="cm-badge">not found</span>}
              </button>
              <button
                class="cm-row-action"
                onClick={() => controller.editNote(mark.id)}
                aria-label={mark.note ? 'Edit note' : 'Add note'}
                title={mark.note ? 'Edit note' : 'Add note'}
              >
                <PencilIcon />
              </button>
              <button
                class="cm-row-action"
                onClick={() => void controller.remove(mark.id)}
                aria-label="Delete highlight"
                title="Delete highlight"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {state.health === 'no-messages' && (
        <p class="cm-warning">
          Can't find any messages on this page. The site may have changed its layout.
        </p>
      )}
    </section>
  );
}

function rowClass(found: boolean, dragging: boolean): string | undefined {
  return [!found && 'cm-missing', dragging && 'cm-dragging'].filter(Boolean).join(' ') || undefined;
}

/** How far an entry shifts while another entry is dragged past it. */
function dragOffset(drag: DragState, index: number): number {
  if (index === drag.from) return drag.dy;
  if (index > drag.from && index <= drag.over) return -drag.height;
  if (index < drag.from && index >= drag.over) return drag.height;
  return 0;
}

function BookmarkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
      <circle cx="2.5" cy="2.5" r="1.3" />
      <circle cx="7.5" cy="2.5" r="1.3" />
      <circle cx="2.5" cy="7" r="1.3" />
      <circle cx="7.5" cy="7" r="1.3" />
      <circle cx="2.5" cy="11.5" r="1.3" />
      <circle cx="7.5" cy="11.5" r="1.3" />
    </svg>
  );
}
