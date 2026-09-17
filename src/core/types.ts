import type { TextQuote } from './quote';

export type SiteId = 'chatgpt' | 'claude' | 'gemini';
export type Role = 'user' | 'assistant';
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

/** Several independent clues for finding a message again; any one of them may break. */
export interface MessageAnchor {
  messageId?: string;
  role: Role;
  index: number;
  fingerprint: string;
}

export interface Mark {
  id: string;
  site: SiteId;
  conversationId: string;
  conversationTitle: string;
  url: string;
  message: MessageAnchor;
  /** The highlighted passage; absent when the whole message is marked. */
  quote?: TextQuote;
  label: string;
  color: HighlightColor;
  /** Optional note the user wrote about the highlight. */
  note?: string;
  /** Position in the user's list for this chat. New highlights go last; the user can reorder. */
  order?: number;
  /** Copy of the marked text, kept even if the chat is edited or deleted. */
  snapshot: string;
  createdAt: number;
  updatedAt: number;
}
