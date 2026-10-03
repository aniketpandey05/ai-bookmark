import { storage } from '#imports';

// Sites the user switched off. The chat sites ship switched on, so only the
// exceptions are stored; everywhere else is off until a site is allowed.
const KEY = 'local:disabled-sites';

export async function loadDisabledSites(): Promise<string[]> {
  return (await storage.getItem<string[]>(KEY)) ?? [];
}

export async function setSiteEnabled(hostname: string, enabled: boolean): Promise<void> {
  const disabled = await loadDisabledSites();
  const next = enabled
    ? disabled.filter((host) => host !== hostname)
    : [...new Set([...disabled, hostname])];
  await storage.setItem(KEY, next);
}

export function watchDisabledSites(onChange: (hostnames: string[]) => void): () => void {
  return storage.watch<string[]>(KEY, (hostnames) => onChange(hostnames ?? []));
}
