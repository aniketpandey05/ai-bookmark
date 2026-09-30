import type { MessageRef, SiteAdapter } from './types';

// gemini.google.com builds its chat from custom elements, which makes messages easy to find.
const USER = 'user-query';
const ASSISTANT = 'model-response';
const USER_CONTENT = '.query-text';
const ASSISTANT_CONTENT = 'message-content';
// Gemini shows a stop control while a reply is being written.
const STREAMING = '.stop-icon, [data-test-id="stop-button"], .blinking-cursor';
// Matches /app/<id> and chats inside a Gem, /gem/<gem>/<id>.
const CONVERSATION_PATH = /\/(?:app|gem\/[\w-]+)\/([\w-]+)/;

export const geminiAdapter: SiteAdapter = {
  site: 'gemini',

  getConversationId(url) {
    return url.pathname.match(CONVERSATION_PATH)?.[1] ?? null;
  },

  getConversationTitle() {
    const heading = document.querySelector('h1:not([class*="hidden"])')?.textContent?.trim();
    if (heading) return heading;
    const title = document.title.replace(/\s*[-|]\s*Gemini$/i, '').trim();
    return title && title !== 'Gemini' ? title : 'Untitled chat';
  },

  getMessages() {
    const messages: MessageRef[] = [];
    for (const el of document.querySelectorAll(`${USER}, ${ASSISTANT}`)) {
      messages.push({
        el,
        role: el.localName === USER ? 'user' : 'assistant',
        index: messages.length,
      });
    }
    return messages;
  },

  getContentRoot(message) {
    const content = message.el.querySelector(
      message.role === 'user' ? USER_CONTENT : ASSISTANT_CONTENT,
    );
    return content ?? message.el;
  },

  isStreaming(message) {
    if (!document.querySelector(STREAMING)) return false;
    const replies = document.querySelectorAll(ASSISTANT);
    return replies[replies.length - 1] === message.el;
  },
};
