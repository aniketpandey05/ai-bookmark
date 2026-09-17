import type { Role, SiteId } from '../core/types';

export interface MessageRef {
  el: Element;
  role: Role;
  messageId?: string;
  /** Position among all messages currently in the page. */
  index: number;
}

/**
 * Everything site-specific lives behind this interface. When a site changes
 * its markup, only its adapter should need fixing.
 */
export interface SiteAdapter {
  site: SiteId;
  getConversationId(url: URL): string | null;
  getConversationTitle(): string;
  getMessages(): MessageRef[];
  /** The element holding the message text, without action bars or labels. */
  getContentRoot(message: MessageRef): Element;
  isStreaming(message: MessageRef): boolean;
}
