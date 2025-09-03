import type { RefObject } from 'react';
import { TranscriptItem } from '../components/TranscriptItem';

export interface ConfirmedSegment { text: string; startTime: number; endTime: number; }
export interface TranscriptLine {
  id: number;
  speaker: string;
  confirmedSegments: ConfirmedSegment[];
  partialText: string;
  lastSegmentEndTime: number;
}

type Props = {
  lines: TranscriptLine[];
  typewriterEnabled: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
};

export function TranscriptPane({ lines, typewriterEnabled, scrollRef }: Props) {
  return (
    <section className="pane pane--transcript">
      <div className="pane__title">原文 Transcript</div>

      <div className="pane__body scrollable-column" ref={scrollRef}>
        {lines.length === 0 ? (
          <div style={{ color: 'var(--hai)', padding: '2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>
              等待开始…
            </p>
            <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>点击顶部 Start 开始转录</p>
          </div>
        ) : (
          <div className="content-list">
            {lines.map((line) => {
              const confirmedText = line.confirmedSegments.map((s) => s.text).join('');
              return (
                <TranscriptItem
                  key={line.id}
                  speaker={line.speaker}
                  confirmedText={confirmedText}
                  partialText={line.partialText}
                  typewriterEnabled={typewriterEnabled}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
