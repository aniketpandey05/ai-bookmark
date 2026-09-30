import type { SiteAdapter } from './types';

// An ordinary web page has no messages, so the whole article counts as one block of text.
const CONTENT = 'main, article, [role="main"], #content, .post, body';

export const webAdapter: SiteAdapter = {
  site: 'web',

  // One page, one set of highlights. The query string can change what a page shows, so keep it.
  getConversationId(url) {
    return `${url.origin}${url.pathname}${url.search}`;
  },

  getConversationTitle() {
    return document.title.trim() || location.hostname;
  },

  getMessages() {
    const root = document.querySelector(CONTENT) ?? document.body;
    return root ? [{ el: root, role: 'assistant' as const, index: 0 }] : [];
  },

  getContentRoot(message) {
    return message.el;
  },

  isStreaming() {
    return false;
  },
};
