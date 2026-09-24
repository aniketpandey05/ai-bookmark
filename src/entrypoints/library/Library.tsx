import { browser } from '#imports';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { RuntimeMessage } from '../../core/messages';
import { sortByOrder } from '../../core/order';
import { HIGHLIGHT_COLORS } from '../../core/painter';
import { searchMarks } from '../../core/search';
import { loadAllMarks, removeMark, watchAllMarks } from '../../core/store';
import type { Mark } from '../../core/types';

interface ChatGroup {
  conversationId: string;
  title: string;
  marks: Mark[];
  newest: number;
}

export function Library() {
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const reload = () => void loadAllMarks().then(setMarks);
    reload();
    return watchAllMarks(reload);
  }, []);

  const groups = useMemo(() => groupByChat(searchMarks(marks ?? [], query)), [marks, query]);
  const total = marks?.length ?? 0;
  const shown = groups.reduce((sum, group) => sum + group.marks.length, 0);

  const open = (mark: Mark) => {
    void browser.runtime.sendMessage({ type: 'open-mark', mark } satisfies RuntimeMessage);
  };

  const copyLink = async (mark: Mark) => {
    await navigator.clipboard.writeText(linkTo(mark));
    setCopiedId(mark.id);
    setTimeout(() => setCopiedId((id) => (id === mark.id ? null : id)), 1500);
  };

  return (
    <main class="lib">
      <header class="lib-header">
        <h1>Your highlights</h1>
        <input
          class="lib-search"
          type="search"
          value={query}
          placeholder="Search highlights, notes and chat names…"
          aria-label="Search highlights"
          autofocus
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <p class="lib-count">
          {marks === null ? 'Loading…' : query ? `${shown} of ${total} highlights` : `${total} highlights`}
        </p>
      </header>

      {marks !== null && total === 0 && (
        <p class="lib-empty">
          Nothing saved yet. Select text in a ChatGPT message and pick a color to highlight it.
        </p>
      )}
      {marks !== null && total > 0 && shown === 0 && (
        <p class="lib-empty">No highlights match “{query}”.</p>
      )}

      {groups.map((group) => (
        <section class="lib-group" key={group.conversationId}>
          <h2>
            {group.title}
            <span class="lib-when">{formatWhen(group.newest)}</span>
          </h2>
          <ul>
            {group.marks.map((mark, index) => (
              <li key={mark.id}>
                <button class="lib-item" onClick={() => open(mark)} title="Open this chat at the highlight">
                  <span class="lib-number" style={{ background: HIGHLIGHT_COLORS[mark.color] }}>
                    {index + 1}
                  </span>
                  <span class="lib-body">
                    <span class="lib-text">{mark.snapshot}</span>
                    {mark.note && <span class="lib-note">{mark.note}</span>}
                  </span>
                </button>
                <button class="lib-action" onClick={() => void copyLink(mark)} title="Copy a link to this highlight">
                  {copiedId === mark.id ? 'Copied' : 'Copy link'}
                </button>
                <button
                  class="lib-action lib-danger"
                  onClick={() => void removeMark(mark.site, mark.conversationId, mark.id)}
                  title="Delete this highlight"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

/** A link that opens the chat and jumps to the highlight; without the extension it just opens the chat. */
function linkTo(mark: Mark): string {
  const url = new URL(mark.url);
  url.hash = `chatmark=${mark.id}`;
  return url.toString();
}

function groupByChat(marks: Mark[]): ChatGroup[] {
  const groups = new Map<string, ChatGroup>();
  for (const mark of marks) {
    const key = `${mark.site}:${mark.conversationId}`;
    const group = groups.get(key);
    if (group) {
      group.marks.push(mark);
      group.newest = Math.max(group.newest, mark.createdAt);
    } else {
      groups.set(key, {
        conversationId: key,
        title: mark.conversationTitle || 'Untitled chat',
        marks: [mark],
        newest: mark.createdAt,
      });
    }
  }
  return [...groups.values()]
    .map((group) => ({ ...group, marks: sortByOrder(group.marks) }))
    .sort((a, b) => b.newest - a.newest);
}

function formatWhen(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(timestamp).toLocaleDateString();
}
