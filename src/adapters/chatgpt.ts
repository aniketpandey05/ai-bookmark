import type { MessageRef, SiteAdapter } from './types';

// ChatGPT markup as used by open-source ChatGPT tools in September 2026.
// When ChatGPT changes its layout, this is the file to update.
const MESSAGE = '[data-message-author-role]';
const CONTENT = '.markdown, .whitespace-pre-wrap';
const STOP_BUTTON = '[data-testid="stop-button"]';
const LAST_REPLY = '[data-message-author-role="assistant"]';
// Matches /c/<id> and project chats like /g/g-p-<project>/c/<id>.
const CONVERSATION_PATH = /\/c\/([\w-]+)/;

export const chatgptAdapter: SiteAdapter = {
  site: 'chatgpt',

  getConversationId(url) {
    return url.pathname.match(CONVERSATION_PATH)?.[1] ?? null;
  },

  getConversationTitle() {
    const title = document.title.replace(/\s*[-|]\s*ChatGPT$/i, '').trim();
    return title && title !== 'ChatGPT' ? title : 'Untitled chat';
  },

  getMessages() {
    const messages: MessageRef[] = [];
    for (const el of document.querySelectorAll(MESSAGE)) {
      const role = el.getAttribute('data-message-author-role');
      // System and tool messages aren't shown as chat bubbles.
      if (role !== 'user' && role !== 'assistant') continue;
      messages.push({
        el,
        role,
        messageId: el.getAttribute('data-message-id') ?? undefined,
        index: messages.length,
      });
    }
    return messages;
  },

  getContentRoot(message) {
    return message.el.querySelector(CONTENT) ?? message.el;
  },

  isStreaming(message) {
    // While a reply streams the composer shows a stop button, and only the newest reply can be streaming.
    if (!document.querySelector(STOP_BUTTON)) return false;
    const replies = document.querySelectorAll(LAST_REPLY);
    return replies[replies.length - 1] === message.el;
  },
};
