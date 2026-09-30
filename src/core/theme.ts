import { storage } from '#imports';

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'local:theme';

export async function loadTheme(): Promise<Theme> {
  return (await storage.getItem<Theme>(KEY)) ?? 'system';
}

export async function saveTheme(theme: Theme): Promise<void> {
  await storage.setItem(KEY, theme);
}

export function watchTheme(onChange: (theme: Theme) => void): () => void {
  return storage.watch<Theme>(KEY, (theme) => onChange(theme ?? 'system'));
}

/** On the extension's own pages, stamp the choice on <html> for the stylesheet to pick up. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
}
