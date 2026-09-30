import { browser } from '#imports';
import { useEffect, useRef, useState } from 'preact/hooks';
import { createBackup, readBackup } from '../../core/backup';
import type { RuntimeMessage } from '../../core/messages';
import { sortByOrder } from '../../core/order';
import { HIGHLIGHT_COLORS } from '../../core/painter';
import { searchMarks } from '../../core/search';
import { siteLabel } from '../../core/sites';
import { importMarks, loadAllMarks, removeMark, watchAllMarks } from '../../core/store';
import type { Mark } from '../../core/types';

interface ChatGroup {
  key: string;
  title: string;
  site: string;
  marks: Mark[];
  newest: number;
}

export function Library() {
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const [query, setQuery] = useState('');
  const [site, setSite] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const reload = () => void loadAllMarks().then(setMarks);
    reload();
    return watchAllMarks(reload);
  }, []);

  const all = marks ?? [];
  const sites = countBySite(all);
  const groups = groupByChat(searchMarks(site ? all.filter((m) => siteLabel(m) === site) : all, query));
  const total = all.length;
  const shown = groups.reduce((sum, group) => sum + group.marks.length, 0);

  const open = (mark: Mark) => {
    void browser.runtime.sendMessage({ type: 'open-mark', mark } satisfies RuntimeMessage);
  };

  const copyLink = async (mark: Mark) => {
    await navigator.clipboard.writeText(linkTo(mark));
    setCopiedId(mark.id);
    setTimeout(() => setCopiedId((id) => (id === mark.id ? null : id)), 1500);
  };

  const exportBackup = () => {
    const file = new Blob([createBackup(all)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = `ai-bookmark-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage(`Saved a backup of ${total} highlight${total === 1 ? '' : 's'}.`);
  };

  const importBackup = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so the same file can be picked again
    if (!file) return;
    try {
      const { added, updated } = await importMarks(readBackup(await file.text()));
      const parts = [];
      if (added) parts.push(`added ${added} highlight${added === 1 ? '' : 's'}`);
      if (updated) parts.push(`updated ${updated}`);
      setMessage(parts.length ? `Imported: ${parts.join(', ')}.` : 'Everything in that file was already here.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That file could not be imported.');
    }
  };

  return (
    <main class="lib">
      <header class="lib-header">
        <h1>Your highlights</h1>
        <input
          class="lib-search"
          type="search"
          value={query}
          placeholder="Search highlights, notes, chat names and sites…"
          aria-label="Search highlights"
          autofocus
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        {sites.length > 1 && (
          <div class="lib-filters" role="group" aria-label="Filter by site">
            <button class={site === null ? 'lib-chip lib-chip-on' : 'lib-chip'} onClick={() => setSite(null)}>
              All {total}
            </button>
            {sites.map(([label, count]) => (
              <button
                key={label}
                class={site === label ? 'lib-chip lib-chip-on' : 'lib-chip'}
                onClick={() => setSite(label)}
              >
                {label} {count}
              </button>
            ))}
          </div>
        )}
        <div class="lib-tools">
          <p class="lib-count">
            {marks === null
              ? 'Loading…'
              : query || site
                ? `${shown} of ${total} highlights`
                : `${total} highlights`}
          </p>
          <button class="lib-tool" onClick={exportBackup} disabled={total === 0}>
            Export backup
          </button>
          <button class="lib-tool" onClick={() => fileInput.current?.click()}>
            Import backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void importBackup(event)}
          />
        </div>
        {message && (
          <p class="lib-message" role="status">
            {message}
          </p>
        )}
      </header>

      {marks !== null && total === 0 && (
        <p class="lib-empty">
          Nothing saved yet. Select text in a message on ChatGPT, Claude or Gemini and pick a color.
        </p>
      )}
      {marks !== null && total > 0 && shown === 0 && (
        <p class="lib-empty">No highlights match what you're looking for.</p>
      )}

      {groups.map((group) => (
        <section class="lib-group" key={group.key}>
          <h2>
            <span class="lib-site">{group.site}</span>
            <span class="lib-title">{group.title}</span>
            <span class="lib-when">{formatWhen(group.newest)}</span>
          </h2>
          <ul>
            {group.marks.map((mark, index) => (
              <li key={mark.id}>
                <button class="lib-item" onClick={() => open(mark)} title="Open this page at the highlight">
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

/** A link that opens the page and jumps to the highlight; without the extension it just opens the page. */
function linkTo(mark: Mark): string {
  const url = new URL(mark.url);
  url.hash = `bookmark=${mark.id}`;
  return url.toString();
}

function countBySite(marks: Mark[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const mark of marks) {
    const label = siteLabel(mark);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
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
        key,
        title: mark.conversationTitle || 'Untitled',
        site: siteLabel(mark),
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
