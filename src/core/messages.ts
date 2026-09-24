import type { Mark } from './types';

/** Which highlight a newly opened or re-focused tab should jump to. */
export interface PendingJump {
  markId: string;
  conversationId: string;
}

export type RuntimeMessage =
  /** Sent by the library: open the chat this highlight belongs to and jump to it. */
  | { type: 'open-mark'; mark: Mark }
  /** Sent by a content script when it loads: is there a highlight waiting to be jumped to? */
  | { type: 'take-pending-jump' }
  /** Sent to a chat tab that is already open. */
  | ({ type: 'jump-to-mark' } & PendingJump);
