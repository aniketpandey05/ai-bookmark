import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'AI Bookmark',
    description: 'Highlight, note and bookmark anything you read, then jump back to it.',
    // "activeTab" lets the popup see which page you're on when you click the icon, and nothing more.
    // "scripting" lets the extension start highlighting on a site right after you allow it.
    permissions: ['storage', 'unlimitedStorage', 'scripting', 'activeTab'],
    // The chat sites work out of the box; any other site is allowed one at a time from the popup.
    host_permissions: ['https://chatgpt.com/*', 'https://claude.ai/*', 'https://gemini.google.com/*'],
    optional_host_permissions: ['*://*/*'],
    action: { default_title: 'AI Bookmark' },
  },
  // Hot refresh doesn't work inside content scripts, so leave it off.
  vite: () => ({ plugins: [preact({ prefreshEnabled: false })] }),
});
