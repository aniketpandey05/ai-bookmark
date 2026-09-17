import { beforeEach, describe, expect, it } from 'vitest';
import type { MessageRef } from '../src/adapters/types';
import { describeMessage, resolveMarks } from '../src/core/locate';
import { describeQuote } from '../src/core/quote';
import { buildTextIndex } from '../src/core/textIndex';
import type { Mark, Role } from '../src/core/types';

const contentRoot = (m: MessageRef) => m.el;

function readMessages(): MessageRef[] {
  return [...document.querySelectorAll('[data-role]')].map((el, index) => ({
    el,
    role: el.getAttribute('data-role') as Role,
    messageId: el.id,
    index,
  }));
}

function messageAt(index: number): MessageRef {
  const message = readMessages()[index];
  if (!message) throw new Error(`No message at index ${index}`);
  return message;
}

function markOn(message: MessageRef, exact?: string): Mark {
  const { text } = buildTextIndex(message.el);
  const start = exact ? text.indexOf(exact) : -1;
  return {
    id: 'mark-1',
    site: 'chatgpt',
    conversationId: 'conv',
    conversationTitle: 'Test',
    url: 'https://chatgpt.com/c/conv',
    message: describeMessage(message, text),
    quote: exact ? describeQuote(text, { start, end: start + exact.length }) : undefined,
    label: '',
    color: 'yellow',
    snapshot: exact ?? text,
    createdAt: 0,
    updatedAt: 0,
  };
}

function resolveOnly(mark: Mark) {
  const { resolved, missing } = resolveMarks([mark], readMessages(), contentRoot);
  return { hit: resolved[0], missing };
}

beforeEach(() => {
  document.body.innerHTML = `
    <div data-role="user" id="u1"><p>How do I start docker?</p></div>
    <div data-role="assistant" id="a1"><p>Run <code>docker compose up -d</code> in the project folder.</p></div>
    <div data-role="user" id="u2"><p>And how do I stop it?</p></div>
    <div data-role="assistant" id="a2"><p>Run <code>docker compose down</code> in the project folder.</p></div>`;
});

describe('resolveMarks', () => {
  it('resolves a highlight through its message id', () => {
    const { hit, missing } = resolveOnly(markOn(messageAt(3), 'docker compose down'));
    expect(missing).toEqual([]);
    expect(hit?.message.messageId).toBe('a2');
    expect(hit?.range.toString()).toBe('docker compose down');
  });

  it('finds the highlight when message ids change', () => {
    const mark = markOn(messageAt(3), 'docker compose down');
    document.querySelectorAll('[data-role]').forEach((el, i) => (el.id = `new-${i}`));
    const { hit } = resolveOnly(mark);
    expect(hit?.message.messageId).toBe('new-3');
    expect(hit?.range.toString()).toBe('docker compose down');
  });

  it('reports a highlight as missing when its text is gone', () => {
    const mark = markOn(messageAt(3), 'docker compose down');
    document.getElementById('a2')!.innerHTML = '<p>Something else entirely.</p>';
    const { hit, missing } = resolveOnly(mark);
    expect(hit).toBeUndefined();
    expect(missing).toEqual([mark]);
  });

  it('finds a whole-message mark by fingerprint when its id changes', () => {
    const mark = markOn(messageAt(1));
    document.getElementById('a1')!.id = 'regenerated';
    expect(resolveOnly(mark).hit?.message.messageId).toBe('regenerated');
  });
});
