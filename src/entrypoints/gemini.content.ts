import { geminiAdapter } from '../adapters/gemini';
import { mountChatmarks } from '../content/mount';

export default defineContentScript({
  matches: ['https://gemini.google.com/*'],
  main: (ctx) => mountChatmarks(ctx, geminiAdapter),
});
