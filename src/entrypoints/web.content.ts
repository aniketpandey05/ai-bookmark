import { webAdapter } from '../adapters/web';
import { mountChatmarks } from '../content/mount';

// Not listed in the manifest: the background script registers this for the sites
// the user switches on from the toolbar, so the extension never gets blanket access.
export default defineContentScript({
  registration: 'runtime',
  matches: [],
  main: (ctx) => mountChatmarks(ctx, webAdapter),
});
