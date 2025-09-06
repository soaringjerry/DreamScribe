import { useMemo, useRef, useState } from 'react';
import type { TranscriptLine } from './TranscriptPane';
import { buildSourceText } from '../utils/text';
import { streamSSE } from '../utils/sse';

type SummaryItem = { id: string; kind: 'key' | 'action' | 'term'; text: string };

type Props = {
  lines?: TranscriptLine[];
};

export function SummaryPanel({ lines = [] }: Props) {
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<SummaryItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const source = useMemo(() => buildSourceText(lines), [lines]);

  const generate = async () => {
    if (!source.trim() || running) return;
    setItems([]);
    setRunning(true);
    const ac = new AbortController();
    abortRef.current = ac;
    let acc = '';
    try {
      await streamSSE(
        '/api/summarize/run',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: source, mode: 'final', attrs: { model: 'gpt-5-mini' } }),
        },
        (t) => {
          acc += t;
          const lines = acc.split(/\n+/).filter(Boolean);
          setItems(lines.map((txt, i) => ({ id: `k${i}`, kind: 'key', text: txt })));
        },
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

  const stop = () => abortRef.current?.abort();

  return (
    <div className="summary-panel">
      <div className="summary-toolbar">
        <div className="pane__title">摘要 Summary</div>
        <div className="summary-actions">
          <button className="btn btn-secondary" onClick={generate} disabled={!source.trim() || running}>生成</button>
          <button className="btn" onClick={() => setItems([])} disabled={running || items.length === 0}>清空</button>
          <button className="btn" onClick={stop} disabled={!running}>停止</button>
        </div>
      </div>
      <div className="summary-list">
        {items.map((it) => (
          <div key={it.id} className={`summary-card summary-${it.kind}`}>
            <div className="summary-kind">{it.kind}</div>
            <div className="summary-text">{it.text}</div>
          </div>
        ))}
        {items.length === 0 && <div className="placeholder">点击“生成”基于当前转录生成摘要</div>}
      </div>
    </div>
  );
}

