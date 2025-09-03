type SummaryItem = { id: string; kind: 'key' | 'action' | 'term'; text: string };

type Props = {
  items?: SummaryItem[];
};

const SAMPLE: SummaryItem[] = [
  { id: 'k1', kind: 'key', text: '要点：实时转录并编码为记忆事件。' },
  { id: 'a1', kind: 'action', text: '行动：完善 PCAS 连接稳定性与错误提示。' },
  { id: 't1', kind: 'term', text: '术语：InteractStream（PCAS 双向流）。' },
];

export function SummaryPanel({ items = SAMPLE }: Props) {
  return (
    <div className="summary-panel">
      <div className="summary-toolbar">
        <div className="pane__title">摘要 Summary</div>
        <div className="summary-actions">
          <button className="btn btn-secondary" disabled>生成</button>
          <button className="btn btn-secondary" disabled>刷新</button>
        </div>
      </div>
      <div className="summary-list">
        {items.map((it) => (
          <div key={it.id} className={`summary-card summary-${it.kind}`}>
            <div className="summary-kind">{it.kind}</div>
            <div className="summary-text">{it.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
