import type { Mark } from './types';

const SITE_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
};

/** What to call the place a highlight came from; unknown sites fall back to their domain. */
export function siteLabel(mark: Pick<Mark, 'site' | 'url'>): string {
  return SITE_LABELS[mark.site] ?? hostnameOf(mark.url);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Unknown site';
  }
}
