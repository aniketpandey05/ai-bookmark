import { describe, expect, it } from 'vitest';
import { addTags, countTags, parseTags, removeTag } from '../src/core/tags';

describe('parseTags', () => {
  it('splits on commas and tidies each tag', () => {
    expect(parseTags(' #HPC , report ,, ')).toEqual(['HPC', 'report']);
  });

  it('drops duplicates whatever the case', () => {
    expect(parseTags('hpc, HPC, Hpc')).toEqual(['hpc']);
  });

  it('caps how long a tag can be', () => {
    expect(parseTags('a'.repeat(40))[0]).toHaveLength(24);
  });
});

describe('addTags and removeTag', () => {
  it('adds without duplicating', () => {
    expect(addTags(['hpc'], 'report, HPC')).toEqual(['hpc', 'report']);
  });

  it('removes whatever the case', () => {
    expect(removeTag(['hpc', 'report'], 'HPC')).toEqual(['report']);
  });
});

describe('countTags', () => {
  it('counts tags across highlights, most used first', () => {
    const marks = [{ tags: ['hpc', 'report'] }, { tags: ['HPC'] }, { tags: [] }, {}];
    expect(countTags(marks)).toEqual([
      ['hpc', 2],
      ['report', 1],
    ]);
  });
});
