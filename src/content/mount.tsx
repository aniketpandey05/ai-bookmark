import { createShadowRootUi, type ContentScriptContext } from '#imports';
import { render } from 'preact';
import type { SiteAdapter } from '../adapters/types';
import { HighlightPainter } from '../core/painter';
import { App } from '../ui/App';
// Bundled as text so the styles travel with the script, even on sites registered at runtime.
import styles from '../ui/styles.css?inline';
import { ChatmarksController, UI_TAG } from './controller';

export async function mountChatmarks(ctx: ContentScriptContext, adapter: SiteAdapter): Promise<void> {
  if (!HighlightPainter.isSupported()) {
    console.warn('[ai-bookmark] This browser does not support the CSS Custom Highlight API.');
    return;
  }

  const controller = new ChatmarksController(ctx, adapter);
  const ui = await createShadowRootUi(ctx, {
    name: UI_TAG,
    position: 'inline',
    anchor: 'body',
    append: 'last',
    // Stop key presses inside our UI from reaching the site's keyboard shortcuts.
    isolateEvents: true,
    onMount(container) {
      const style = document.createElement('style');
      style.textContent = styles;
      const root = document.createElement('div');
      container.append(style, root);
      render(<App controller={controller} />, root);
      return root;
    },
    onRemove(root) {
      if (root) render(null, root);
    },
  });
  ui.mount();
  await controller.start();
}
