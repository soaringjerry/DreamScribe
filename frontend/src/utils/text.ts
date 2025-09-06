import type { TranscriptLine } from '../panes/TranscriptPane';

export function buildSourceText(lines: TranscriptLine[]): string {
  return lines
    .map((l) => `${l.confirmedSegments.map((s) => s.text).join('')}${l.partialText || ''}`)
    .filter(Boolean)
    .join('\n');
}

