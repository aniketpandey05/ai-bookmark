const MAX_TAGS = 12;
const MAX_LENGTH = 24;

/** Turns what the user typed into clean tags: no leading #, no duplicates, no empties. */
export function parseTags(input: string): string[] {
  const tags: string[] = [];
  for (const piece of input.split(/[,\n]/)) {
    const tag = piece.trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, MAX_LENGTH).trim();
    if (tag && !tags.some((existing) => sameTag(existing, tag))) tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

/** "HPC" and "hpc" are the same tag. */
export function sameTag(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function addTags(tags: readonly string[], input: string): string[] {
  const next = [...tags];
  for (const tag of parseTags(input)) {
    if (!next.some((existing) => sameTag(existing, tag))) next.push(tag);
  }
  return next.slice(0, MAX_TAGS);
}

export function removeTag(tags: readonly string[], tag: string): string[] {
  return tags.filter((existing) => !sameTag(existing, tag));
}

/** Tags in use, most used first, for the library's filter row. */
export function countTags(marks: ReadonlyArray<{ tags?: string[] }>): Array<[string, number]> {
  const counts = new Map<string, { label: string; count: number }>();
  for (const mark of marks) {
    for (const tag of mark.tags ?? []) {
      const key = tag.toLowerCase();
      const seen = counts.get(key);
      counts.set(key, { label: seen?.label ?? tag, count: (seen?.count ?? 0) + 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((entry) => [entry.label, entry.count]);
}
