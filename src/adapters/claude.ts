import type { MessageRef, SiteAdapter } from './types';

// claude.ai markup as of September 2026. Claude translates its interface, so this file
// sticks to data-testid values and stable class names, never visible text or labels.
const USER = '[data-testid="user-message"]';
const ASSISTANT = '[data-testid="assistant-message"], .font-claude-response, .font-claude-message';
const ASSISTANT_CONTENT = '.font-claude-response, .font-claude-message';
// Claude flags the reply being written with this attribute.
const STREAMING = '[data-is-streaming="true"]';
const CONVERSATION_PATH = /\/chat\/([\w-]+)/;

export const claudeAdapter: SiteAdapter = {
  site: 'claude',

  getConversationId(url) {
    return url.pathname.match(CONVERSATION_PATH)?.[1] ?? null;
  },

  getConversationTitle() {
    const title = document.title.replace(/\s*[-|]\s*Claude$/i, '').trim();
    return title && title !== 'Claude' ? title : 'Untitled chat';
  },

  getMessages() {
    const messages: MessageRef[] = [];
    for (const el of document.querySelectorAll(`${USER}, ${ASSISTANT}`)) {
      // A reply can match twice (its wrapper and its text); keep the outer element only.
      if (messages.some((m) => m.el.contains(el))) continue;
      messages.push({ el, role: el.matches(USER) ? 'user' : 'assistant', index: messages.length });
    }
    return messages;
  },

  // Claude gives messages no stable id, so highlights are found by their text instead.
  getContentRoot(message) {
    if (message.role !== 'assistant') return message.el;
    return message.el.querySelector(ASSISTANT_CONTENT) ?? message.el;
  },

  isStreaming(message) {
    const streaming = document.querySelector(STREAMING);
    return (
      !!streaming &&
      (message.el === streaming || message.el.contains(streaming) || streaming.contains(message.el))
    );
  },
};
