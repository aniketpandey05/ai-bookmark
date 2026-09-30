import { describe, expect, it } from 'vitest';
import { searchMarks } from '../src/core/search';
import type { Mark } from '../src/core/types';

const mark = (id: string, snapshot: string, extra: Partial<Mark> = {}) =>
  ({
    id,
    snapshot,
    conversationTitle: 'Some chat',
    site: 'chatgpt',
    url: 'https://chatgpt.com/c/x',
    createdAt: Number(id),
    ...extra,
  }) as Mark;

const marks = [
  mark('1', 'docker compose up -d', { note: 'starts the stack detached' }),
  mark('2', 'Named volumes are kept', { conversationTitle: 'Docker setup help' }),
  mark('3', 'O(n log n) is typical for good sorting', {
    site: 'claude',
    url: 'https://claude.ai/chat/y',
  }),
];

describe('searchMarks', () => {
  it('returns everything for an empty query', () => {
    expect(searchMarks(marks, '  ').length).toBe(3);
  });

  it('matches the highlight, the note and the chat title', () => {
    expect(searchMarks(marks, 'volumes').map((m) => m.id)).toEqual(['2']);
    expect(searchMarks(marks, 'detached').map((m) => m.id)).toEqual(['1']);
    expect(searchMarks(marks, 'setup help').map((m) => m.id)).toEqual(['2']);
  });

  it('matches the site a highlight came from', () => {
    expect(searchMarks(marks, 'claude').map((m) => m.id)).toEqual(['3']);
    expect(searchMarks(marks, 'chatgpt sorting')).toEqual([]);
  });

  it('puts matches in the highlight text above matches in the title', () => {
    expect(searchMarks(marks, 'docker').map((m) => m.id)).toEqual(['1', '2']);
  });

  it('requires every word of the query to match', () => {
    expect(searchMarks(marks, 'docker sorting')).toEqual([]);
  });

  it('ignores case', () => {
    expect(searchMarks(marks, 'DOCKER Compose').map((m) => m.id)).toEqual(['1']);
  });
});
