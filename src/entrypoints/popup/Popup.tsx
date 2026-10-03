import { browser } from '#imports';
import { useEffect, useState } from 'preact/hooks';
import { loadDisabledSites, setSiteEnabled, watchDisabledSites } from '../../core/enabledSites';
import type { RuntimeMessage } from '../../core/messages';

const BUILT_IN = [
  { host: 'chatgpt.com', label: 'ChatGPT' },
  { host: 'claude.ai', label: 'Claude' },
  { host: 'gemini.google.com', label: 'Gemini' },
];

const send = (message: RuntimeMessage) => browser.runtime.sendMessage(message);
const patternFor = (url: URL) => `${url.protocol}//${url.hostname}/*`;
const hostFromPattern = (pattern: string) => pattern.replace(/^https?:\/\//, '').replace(/\/\*$/, '');

export function Popup() {
  const [url, setUrl] = useState<URL | null>(null);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [switchedOff, setSwitchedOff] = useState<string[]>([]);

  const refresh = async () => {
    setAllowed(((await send({ type: 'list-sites' })) as string[]) ?? []);
    setSwitchedOff(await loadDisabledSites());
  };

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
    return watchDisabledSites(setSwitchedOff);
  }, []);

  const isOn = (host: string) => !switchedOff.includes(host);

  const toggleSite = async (host: string, on: boolean) => {
    await setSiteEnabled(host, on);
    await refresh();
  };

  /** Allowing a new site needs Chrome's permission; everything else is just a switch. */
  const allowCurrentSite = async (pattern: string, host: string) => {
    const granted = await browser.permissions.request({ origins: [pattern] });
    if (!granted) return;
    await setSiteEnabled(host, true);
    await send({ type: 'sites-changed' });
    await refresh();
  };

  const forgetSite = async (pattern: string) => {
    await browser.permissions.remove({ origins: [pattern] });
    await setSiteEnabled(hostFromPattern(pattern), true);
    await send({ type: 'sites-changed' });
    await refresh();
  };

  const hostname = url?.hostname ?? '';
  const builtIn = BUILT_IN.some((site) => site.host === hostname);
  const supported = url?.protocol === 'https:' || url?.protocol === 'http:';
  const pattern = url && supported ? patternFor(url) : null;
  const knownHere = builtIn || (pattern ? allowed.includes(pattern) : false);

  return (
    <main class="pop">
      <h1>AI Bookmark</h1>

      {!ready ? (
        <p class="pop-note">Loading…</p>
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
            checked={knownHere && isOn(hostname)}
            onChange={() =>
              void (knownHere
                ? toggleSite(hostname, !isOn(hostname))
                : allowCurrentSite(pattern, hostname))
            }
          />
          <span class="pop-switch" aria-hidden="true" />
          <span>
            Highlight on <strong>{hostname}</strong>
          </span>
        </label>
      )}

      {ready && pattern && !knownHere && (
        <p class="pop-hint">Chrome will ask you to allow this site. Nothing happens until you do.</p>
      )}

      <section class="pop-sites">
        <h2>Built in</h2>
        <ul>
          {BUILT_IN.map(({ host, label }) => (
            <li key={host}>
              <span>{label}</span>
              <label class="pop-row-toggle">
                <input
                  type="checkbox"
                  checked={isOn(host)}
                  aria-label={`Highlight on ${label}`}
                  onChange={() => void toggleSite(host, !isOn(host))}
                />
                <span class="pop-switch pop-switch-small" aria-hidden="true" />
              </label>
            </li>
          ))}
        </ul>
      </section>

      {allowed.length > 0 && (
        <section class="pop-sites">
          <h2>Sites you've added</h2>
          <ul>
            {allowed.map((site) => {
              const host = hostFromPattern(site);
              return (
                <li key={site}>
                  <span title={host}>{host}</span>
                  <label class="pop-row-toggle">
                    <input
                      type="checkbox"
                      checked={isOn(host)}
                      aria-label={`Highlight on ${host}`}
                      onChange={() => void toggleSite(host, !isOn(host))}
                    />
                    <span class="pop-switch pop-switch-small" aria-hidden="true" />
                  </label>
                  <button
                    class="pop-forget"
                    onClick={() => void forgetSite(site)}
                    aria-label={`Forget ${host}`}
                    title="Forget this site and give the permission back"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
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
