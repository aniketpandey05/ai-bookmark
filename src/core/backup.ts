import type { Mark } from './types';

export interface Backup {
  app: 'ai-bookmark';
  version: 1;
  exportedAt: number;
  marks: Mark[];
}

export function createBackup(marks: readonly Mark[]): string {
  const backup: Backup = { app: 'ai-bookmark', version: 1, exportedAt: Date.now(), marks: [...marks] };
  return JSON.stringify(backup, null, 2);
}

/** Reads a backup file, keeping only the entries that look like highlights. */
export function readBackup(text: string): Mark[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't readable as a backup.");
  }
  const marks = Array.isArray(data) ? data : (data as Partial<Backup> | null)?.marks;
  if (!Array.isArray(marks)) throw new Error("That file doesn't look like a backup.");

  const valid = marks.filter(isMark);
  if (valid.length === 0) throw new Error('No highlights were found in that file.');
  return valid;
}

function isMark(value: unknown): value is Mark {
  const mark = value as Partial<Mark> | null;
  return (
    !!mark &&
    typeof mark.id === 'string' &&
    typeof mark.site === 'string' &&
    typeof mark.conversationId === 'string' &&
    typeof mark.snapshot === 'string'
  );
}
