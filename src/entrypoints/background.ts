import { browser, defineBackground } from '#imports';
import type { PendingJump, RuntimeMessage } from '../core/messages';
import type { Mark } from '../core/types';

const LIBRARY_PAGE = '/library.html';
const pendingKey = (tabId: number) => `pending-jump:${tabId}`;

export default defineBackground(() => {
  browser.action.onClicked.addListener(() => void openLibrary());

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handle(message as RuntimeMessage, sender.tab?.id).then(sendResponse);
    return true;
  });
});

async function handle(message: RuntimeMessage, senderTabId: number | undefined) {
  if (message.type === 'open-mark') return openMark(message.mark);
  if (message.type === 'take-pending-jump') return takePendingJump(senderTabId);
  return null;
}

/** Opens (or re-focuses) the chat a highlight belongs to and tells that tab to jump to it. */
async function openMark(mark: Mark): Promise<null> {
  const url = new URL(mark.url);
  const pending: PendingJump = { markId: mark.id, conversationId: mark.conversationId };
  const existing = await findTab(`${url.origin}${url.pathname}*`);

  if (existing?.id === undefined) {
    const tab = await browser.tabs.create({ url: mark.url });
    if (tab.id !== undefined) await browser.storage.session.set({ [pendingKey(tab.id)]: pending });
    return null;
  }

  // The tab may already be showing this chat, so ask it to jump as well as leaving a note behind.
  await browser.storage.session.set({ [pendingKey(existing.id)]: pending });
  await focusTab(existing);
  await browser.tabs
    .sendMessage(existing.id, { type: 'jump-to-mark', ...pending } satisfies RuntimeMessage)
    .catch(() => undefined);
  return null;
}

async function takePendingJump(tabId: number | undefined): Promise<PendingJump | null> {
  if (tabId === undefined) return null;
  const key = pendingKey(tabId);
  const stored = await browser.storage.session.get(key);
  const pending = stored[key] as PendingJump | undefined;
  if (pending) await browser.storage.session.remove(key);
  return pending ?? null;
}

async function openLibrary(): Promise<void> {
  const url = browser.runtime.getURL(LIBRARY_PAGE);
  const existing = await findTab(url);
  if (existing?.id === undefined) {
    await browser.tabs.create({ url });
    return;
  }
  await focusTab(existing);
}

async function findTab(url: string) {
  // Querying by URL needs permission for that URL, which we only have for the chat sites.
  return browser.tabs
    .query({ url })
    .then((tabs) => tabs[0])
    .catch(() => undefined);
}

async function focusTab(tab: { id?: number; windowId?: number }): Promise<void> {
  if (tab.id !== undefined) await browser.tabs.update(tab.id, { active: true });
  if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
}
