import { storage } from '#imports';
import type { Mark, SiteId } from './types';

// Prototype storage: one array per conversation in chrome.storage.local.
// The library/search phase moves this to IndexedDB owned by the extension.
const marksKey = (site: SiteId, conversationId: string) =>
  `local:marks:${site}:${conversationId}` as const;

// Every write reads, changes and rewrites a whole array, so writes run one at a time;
// otherwise a quick color change right after creating a highlight could be lost.
let writeQueue: Promise<unknown> = Promise.resolve();
function serialized(write: () => Promise<void>): Promise<void> {
  const result = writeQueue.then(write, write);
  writeQueue = result.catch(() => undefined);
  return result;
}

export async function loadMarks(site: SiteId, conversationId: string): Promise<Mark[]> {
  return (await storage.getItem<Mark[]>(marksKey(site, conversationId))) ?? [];
}

export function upsertMark(mark: Mark): Promise<void> {
  return serialized(async () => {
    const marks = await loadMarks(mark.site, mark.conversationId);
    const next = marks.some((m) => m.id === mark.id)
      ? marks.map((m) => (m.id === mark.id ? mark : m))
      : [...marks, mark];
    await storage.setItem(marksKey(mark.site, mark.conversationId), next);
  });
}

export function removeMark(site: SiteId, conversationId: string, id: string): Promise<void> {
  return serialized(async () => {
    const marks = await loadMarks(site, conversationId);
    await storage.setItem(
      marksKey(site, conversationId),
      marks.filter((m) => m.id !== id),
    );
  });
}

/** Saves the user's order for a chat in one write, so positions can't get out of step. */
export function saveOrder(site: SiteId, conversationId: string, orderedIds: string[]): Promise<void> {
  return serialized(async () => {
    const position = new Map(orderedIds.map((id, index) => [id, index]));
    const marks = await loadMarks(site, conversationId);
    await storage.setItem(
      marksKey(site, conversationId),
      marks.map((m) => ({ ...m, order: position.get(m.id) ?? m.order })),
    );
  });
}

/** Keeps other tabs showing the same chat in sync. */
export function watchMarks(
  site: SiteId,
  conversationId: string,
  onChange: (marks: Mark[]) => void,
): () => void {
  return storage.watch<Mark[]>(marksKey(site, conversationId), (marks) => onChange(marks ?? []));
}
