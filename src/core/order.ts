import type { Mark } from './types';

/** The user's order. Highlights saved before ordering existed come first, oldest first. */
export function sortByOrder(marks: readonly Mark[]): Mark[] {
  return [...marks].sort((a, b) => (a.order ?? -1) - (b.order ?? -1) || a.createdAt - b.createdAt);
}

/** Order value that puts a new highlight at the end of the list. */
export function nextOrder(marks: readonly Mark[]): number {
  return marks.reduce((max, mark) => Math.max(max, mark.order ?? -1), -1) + 1;
}

/** Returns a copy of `items` with the item at `from` moved to index `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1) as [T];
  next.splice(Math.min(Math.max(to, 0), next.length), 0, item);
  return next;
}
