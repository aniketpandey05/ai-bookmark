import { chatgptAdapter } from '../adapters/chatgpt';
import { mountChatmarks } from '../content/mount';

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  cssInjectionMode: 'ui',
  main: (ctx) => mountChatmarks(ctx, chatgptAdapter),
});
