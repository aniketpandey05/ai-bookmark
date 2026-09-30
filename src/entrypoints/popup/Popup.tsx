import { browser } from '#imports';
import { useEffect, useState } from 'preact/hooks';
import type { RuntimeMessage } from '../../core/messages';

const BUILT_IN: Record<string, string> = {
  'chatgpt.com': 'ChatGPT',
  'claude.ai': 'Claude',
  'gemini.google.com': 'Gemini',
};

const send = (message: RuntimeMessage) => browser.runtime.sendMessage(message);
const patternFor = (url: URL) => `${url.protocol}//${url.hostname}/*`;

export function Popup() {
  const [url, setUrl] = useState<URL | null>(null);
  const [ready, setReady] = useState(false);
  const [sites, setSites] = useState<string[]>([]);

  const refresh = async () => setSites(((await send({ type: 'list-sites' })) as string[]) ?? []);

  useEffect(() => {
    void (async () => {
      const [active] = await browser.tabs.query({ active: true, currentWindow: true });
      try {
        setUrl(active?.url ? new URL(active.url) : null);
      } catch {
        setUrl(null);
      }
      await refresh();
      setReady(true);
    })();
  }, []);

  const enable = async (pattern: string) => {
    const granted = await browser.permissions.request({ origins: [pattern] });
    if (!granted) return;
    await send({ type: 'sites-changed' });
    await refresh();
  };

  const disable = async (pattern: string) => {
    await browser.permissions.remove({ origins: [pattern] });
    await send({ type: 'sites-changed' });
    await refresh();
  };

  const hostname = url?.hostname ?? '';
  const builtIn = BUILT_IN[hostname];
  const supported = url?.protocol === 'https:' || url?.protocol === 'http:';
  const pattern = url && supported ? patternFor(url) : null;
  const on = pattern ? sites.includes(pattern) : false;

  return (
    <main class="pop">
      <h1>AI Bookmark</h1>

      {!ready ? (
        <p class="pop-note">Loading…</p>
      ) : builtIn ? (
        <p class="pop-note">
          <strong>{hostname}</strong> is {builtIn}. Highlighting is always on here.
        </p>
      ) : !url ? (
        <p class="pop-note">Couldn't tell which page this is. Close this and click the icon again.</p>
      ) : !pattern ? (
        <p class="pop-note">
          Highlighting doesn't work on this page. Chrome blocks extensions on its own pages, the Web
          Store and PDFs.
        </p>
      ) : (
        <label class="pop-toggle">
          <input
            type="checkbox"
            checked={on}
            onChange={() => void (on ? disable(pattern) : enable(pattern))}
          />
          <span class="pop-switch" aria-hidden="true" />
          <span>
            Highlight on <strong>{hostname}</strong>
          </span>
        </label>
      )}

      {ready && pattern && !on && !builtIn && (
        <p class="pop-hint">Chrome will ask you to allow this site. Nothing is enabled until you do.</p>
      )}

      {sites.length > 0 && (
        <section class="pop-sites">
          <h2>Sites you've switched on</h2>
          <ul>
            {sites.map((site) => (
              <li key={site}>
                <span>{site.replace(/^https?:\/\//, '').replace(/\/\*$/, '')}</span>
                <button onClick={() => void disable(site)} aria-label={`Turn off ${site}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        class="pop-library"
        onClick={() => {
          void send({ type: 'open-library' });
          window.close();
        }}
      >
        Open my highlights
      </button>
    </main>
  );
}
