import { describe, expect, it } from 'vitest';
import { searchMarks } from '../src/core/search';
import type { Mark } from '../src/core/types';

const mark = (id: string, snapshot: string, note?: string, conversationTitle = 'Some chat') =>
  ({ id, snapshot, note, conversationTitle, createdAt: Number(id) }) as Mark;

const marks = [
  mark('1', 'docker compose up -d', 'starts the stack detached'),
  mark('2', 'Named volumes are kept', undefined, 'Docker setup help'),
  mark('3', 'O(n log n) is typical for good sorting'),
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
