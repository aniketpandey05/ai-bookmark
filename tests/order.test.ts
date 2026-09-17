import { describe, expect, it } from 'vitest';
import { moveItem, nextOrder, sortByOrder } from '../src/core/order';
import type { Mark } from '../src/core/types';

const mark = (id: string, createdAt: number, order?: number) =>
  ({ id, createdAt, order }) as Mark;

describe('sortByOrder', () => {
  it('sorts by the saved order, not creation time', () => {
    const marks = [mark('a', 1, 2), mark('b', 2, 0), mark('c', 3, 1)];
    expect(sortByOrder(marks).map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('puts highlights without an order first, oldest first', () => {
    const marks = [mark('new', 5, 0), mark('old2', 2), mark('old1', 1)];
    expect(sortByOrder(marks).map((m) => m.id)).toEqual(['old1', 'old2', 'new']);
  });
});

describe('nextOrder', () => {
  it('places a new highlight after the last one', () => {
    expect(nextOrder([])).toBe(0);
    expect(nextOrder([mark('a', 1, 0), mark('b', 2, 4)])).toBe(5);
  });
});

describe('moveItem', () => {
  it('moves an item up or down', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('clamps the target and ignores a missing source', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});
