import type { Mark } from './types';

// A word found in the highlight itself counts for more than one found in the chat's title.
const FIELD_WEIGHTS = [3, 2, 1];

/** Finds highlights containing every word of the query, best matches first. */
export function searchMarks(marks: readonly Mark[], query: string): Mark[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...marks];

  const hits: Array<{ mark: Mark; score: number }> = [];
  for (const mark of marks) {
    const fields = [mark.snapshot, mark.note ?? '', mark.conversationTitle].map((f) => f.toLowerCase());
    let score = 0;
    for (const word of words) {
      const best = fields.reduce(
        (max, field, i) => (field.includes(word) ? Math.max(max, FIELD_WEIGHTS[i]!) : max),
        0,
      );
      if (best === 0) {
        score = 0;
        break;
      }
      score += best;
    }
    if (score > 0) hits.push({ mark, score });
  }
  return hits
    .sort((a, b) => b.score - a.score || b.mark.createdAt - a.mark.createdAt)
    .map((hit) => hit.mark);
}
