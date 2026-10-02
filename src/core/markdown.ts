import { sortByOrder } from './order';
import { siteLabel } from './sites';
import type { Mark } from './types';

/** Highlights as a Markdown file, grouped by chat or page, ready for notes apps. */
export function toMarkdown(marks: readonly Mark[], today = new Date()): string {
  const groups = new Map<string, Mark[]>();
  for (const mark of marks) {
    const key = `${mark.site}:${mark.conversationId}`;
    groups.set(key, [...(groups.get(key) ?? []), mark]);
  }

  const lines = ['# Highlights', '', `Exported ${today.toISOString().slice(0, 10)}`, ''];
  const newest = (group: Mark[]) => Math.max(...group.map((mark) => mark.createdAt));

  for (const group of [...groups.values()].sort((a, b) => newest(b) - newest(a))) {
    const first = group[0]!;
    lines.push(`## ${first.conversationTitle || 'Untitled'}`, '');
    lines.push(`${siteLabel(first)} — [open](${first.url})`, '');

    for (const mark of sortByOrder(group)) {
      lines.push(...mark.snapshot.split('\n').map((line) => `> ${line}`), '');
      if (mark.note) lines.push(mark.note, '');
      if (mark.tags?.length) {
        lines.push(mark.tags.map((tag) => `#${tag.replace(/\s+/g, '-')}`).join(' '), '');
      }
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
