import { describe, expect, it } from 'vitest';
import { createBackup, readBackup } from '../src/core/backup';
import type { Mark } from '../src/core/types';

const mark = (id: string) =>
  ({ id, site: 'chatgpt', conversationId: 'c1', snapshot: 'some text' }) as Mark;

describe('backup', () => {
  it('survives a round trip', () => {
    const marks = [mark('a'), mark('b')];
    expect(readBackup(createBackup(marks))).toEqual(marks);
  });

  it('also accepts a plain list of highlights', () => {
    expect(readBackup(JSON.stringify([mark('a')])).length).toBe(1);
  });

  it('skips entries that are not highlights', () => {
    const file = JSON.stringify({ marks: [mark('a'), { id: 'b' }, null, 'nope'] });
    expect(readBackup(file).map((m) => m.id)).toEqual(['a']);
  });

  it('explains what is wrong with a bad file', () => {
    expect(() => readBackup('not json')).toThrow(/readable/);
    expect(() => readBackup('{"hello":"world"}')).toThrow(/backup/);
    expect(() => readBackup('[]')).toThrow(/No highlights/);
  });
});
