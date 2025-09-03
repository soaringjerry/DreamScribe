type Props = {
  isTranscribing: boolean;
  isInitializing: boolean;
  elapsedTime: number;
  wsStatus: 'connecting' | 'open' | 'closed' | 'error';
  onStart: () => void;
  onStop: () => void;
  typewriterEnabled: boolean;
  onToggleTypewriter: (v: boolean) => void;
};

const pad = (n: number) => n.toString().padStart(2, '0');
const formatMMSS = (s: number) => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;

export function HeaderToolbar({
  isTranscribing,
  isInitializing,
  elapsedTime,
  wsStatus,
  onStart,
  onStop,
  typewriterEnabled,
  onToggleTypewriter,
}: Props) {
  const statusColor = wsStatus === 'open' ? '#22c55e' : wsStatus === 'connecting' ? '#f59e0b' : '#ef4444';

  return (
    <header className="ds-header">
      <div className="ds-header__left">
        <div className="ds-brand">DreamScribe</div>
        <div className="ds-chip" title={`WebSocket: ${wsStatus}`}>
          <span className="ds-dot" style={{ backgroundColor: statusColor }} />
          <span className="ds-chip__text">{wsStatus}</span>
        </div>
        <div className="ds-timer">{formatMMSS(elapsedTime)}</div>
      </div>
      <div className="ds-header__center">
        <label className="ds-switch">
          <input
            type="checkbox"
            checked={typewriterEnabled}
            onChange={(e) => onToggleTypewriter(e.target.checked)}
          />
          <span>Typewriter</span>
        </label>
      </div>
      <div className="ds-header__right">
        <button className="btn btn-primary" onClick={onStart} disabled={isTranscribing || isInitializing}>
          {isInitializing ? 'Initializing…' : isTranscribing ? 'Transcribing' : 'Start'}
        </button>
        <button className="btn btn-danger" onClick={onStop} disabled={!isTranscribing}>
          Stop
        </button>
      </div>
    </header>
  );
}
