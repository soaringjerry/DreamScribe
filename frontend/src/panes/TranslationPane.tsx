import { useMemo, useRef, useState } from 'react';
import type { TranscriptLine } from './TranscriptPane';
import { buildSourceText } from '../utils/text';
import { streamSSE } from '../utils/sse';

type Props = {
  lines: TranscriptLine[];
  targetLang: string;
};

export function TranslationPane({ lines, targetLang }: Props) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const source = useMemo(() => buildSourceText(lines), [lines]);

  const run = async () => {
    if (!source.trim() || running) return;
    setOutput('');
    setRunning(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamSSE(
        '/api/translate/run',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: source, targetLang, attrs: { model: 'gpt-5-mini' } }),
        },
        (t) => setOutput((s) => s + t),
        ac.signal,
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  return (
    <section className="pane pane--translation">
      <div className="pane__title">译文 Translation · {targetLang.toUpperCase()}</div>
      <div className="summary-actions" style={{ display: 'flex', gap: 8, margin: '6px 0 10px 0' }}>
        <button className="btn btn-secondary" onClick={run} disabled={!source.trim() || running}>翻译</button>
        <button className="btn" onClick={() => setOutput('')} disabled={running || !output}>清空</button>
        <button className="btn" onClick={stop} disabled={!running}>停止</button>
      </div>
      <div className="pane__body scrollable-column">
        {(!source.trim() && !output) ? (
          <div className="placeholder">译文将在此出现</div>
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap' }}>{output}</pre>
        )}
      </div>
    </section>
  );
}

