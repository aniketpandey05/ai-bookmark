import { describe, expect, it } from 'vitest';
import { toMarkdown } from '../src/core/markdown';
import type { Mark } from '../src/core/types';

const mark = (partial: Partial<Mark>) =>
  ({
    site: 'chatgpt',
    conversationId: 'c1',
    conversationTitle: 'Docker setup help',
    url: 'https://chatgpt.com/c/c1',
    snapshot: 'docker compose up -d',
    createdAt: 1,
    ...partial,
  }) as Mark;

describe('toMarkdown', () => {
  it('groups highlights under their chat, with a link back', () => {
    const file = toMarkdown([mark({ id: 'a' })], new Date('2026-10-02T00:00:00Z'));
    expect(file).toContain('Exported 2026-10-02');
    expect(file).toContain('## Docker setup help');
    expect(file).toContain('ChatGPT — [open](https://chatgpt.com/c/c1)');
    expect(file).toContain('> docker compose up -d');
  });

  it('includes notes and tags', () => {
    const file = toMarkdown([mark({ id: 'a', note: 'keeps it running', tags: ['hpc', 'to read'] })]);
    expect(file).toContain('keeps it running');
    expect(file).toContain('#hpc #to-read');
  });

  it('keeps the user’s order within a chat and puts newer chats first', () => {
    const file = toMarkdown([
      mark({ id: 'a', snapshot: 'second', order: 1 }),
      mark({ id: 'b', snapshot: 'first', order: 0 }),
      mark({ id: 'c', conversationId: 'c2', conversationTitle: 'Newer chat', snapshot: 'newest', createdAt: 9 }),
    ]);
    expect(file.indexOf('## Newer chat')).toBeLessThan(file.indexOf('## Docker setup help'));
    expect(file.indexOf('> first')).toBeLessThan(file.indexOf('> second'));
  });

  it('quotes every line of a multi-line highlight', () => {
    expect(toMarkdown([mark({ id: 'a', snapshot: 'one\ntwo' })])).toContain('> one\n> two');
  });
});
