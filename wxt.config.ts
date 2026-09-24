import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Chatmarks',
    description: 'Highlight and bookmark anything in your AI chats, then jump back to it.',
    permissions: ['storage', 'unlimitedStorage'],
    // Needed to find an already-open chat tab when jumping to a highlight from the library.
    host_permissions: ['https://chatgpt.com/*'],
    action: { default_title: 'Chatmarks — your highlights' },
  },
  // Hot refresh doesn't work inside content scripts, so leave it off.
  vite: () => ({ plugins: [preact({ prefreshEnabled: false })] }),
});
