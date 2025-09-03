import React from 'react';
import type { TranscriptLine } from './TranscriptPane';

type Props = {
  lines: TranscriptLine[];
  targetLang: string;
};

export const TranslationPane: React.FC<Props> = ({ lines, targetLang }) => {
  return (
    <section className="pane pane--translation">
      <div className="pane__title">译文 Translation · {targetLang.toUpperCase()}</div>
      <div className="pane__body scrollable-column">
        {lines.length === 0 ? (
          <div className="placeholder">译文将在此出现</div>
        ) : (
          <div className="content-list">
            {lines.map((line) => (
              <div key={line.id} className="transcript-item">
                <span className="speaker-name">{line.speaker}:</span>
                <span className="text-content" style={{ opacity: 0.75 }}>
                  {/* 占位：先用原文显示，后续接入翻译流 */}
                  {line.confirmedSegments.map((s) => s.text).join('') || line.partialText}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

