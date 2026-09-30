import { claudeAdapter } from '../adapters/claude';
import { mountChatmarks } from '../content/mount';

export default defineContentScript({
  matches: ['https://claude.ai/*'],
  main: (ctx) => mountChatmarks(ctx, claudeAdapter),
});
