import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PCMAudioRecorderProvider,
  usePCMAudioRecorderContext,
  usePCMAudioListener,
} from '@speechmatics/browser-audio-input-react';
import { useBackendWebSocket } from './hooks/useBackendWebSocket';
import { useSmartScroll } from './hooks/useSmartScroll';
import { saveSession, loadSession, clearSession } from './db';
import { throttle } from 'lodash';

import './App.css';
import { HeaderToolbar } from './components/HeaderToolbar';
import { TranscriptPane } from './panes/TranscriptPane';
import { TranslationPane } from './panes/TranslationPane';
import { SummaryPanel } from './panes/SummaryPanel';
import { ChatPanel } from './panes/ChatPanel';

// Types
export interface ConfirmedSegment {
  text: string;
  startTime: number;
  endTime: number;
}

export interface TranscriptLine {
  id: number;
  speaker: string;
  confirmedSegments: ConfirmedSegment[];
  partialText: string;
  lastSegmentEndTime: number;
}

const PARAGRAPH_BREAK_SILENCE_THRESHOLD = 2.0; // seconds

function TranscriptionApp() {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [typewriterEnabled, setTypewriterEnabled] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);

  const originalColumnRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(1);
  const timerIntervalRef = useRef<number | null>(null);
  const currentLineRef = useRef<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const SESSION_ID = 'current_session';
  const linesRef = useRef<TranscriptLine[]>([]);

  // WebSocket + audio hooks
  const { startRecording, stopRecording } = usePCMAudioRecorderContext();
  const { connect, sendBinary, disconnect, status: wsStatus, onMessage, waitForConnection } = useBackendWebSocket();

  // Throttled session save
  const throttledSave = useMemo(
    () => throttle(async () => {
      const audioBlob = audioChunksRef.current.length > 0
        ? new Blob(audioChunksRef.current, { type: 'audio/webm' })
        : null;
      await saveSession(SESSION_ID, {
        audioBlob,
        lines: linesRef.current,
        translations: [],
      });
    }, 10000, { leading: false, trailing: true }),
    []
  );

  // Incoming transcript text handler
  useEffect(() => {
    onMessage((text: string) => {
      currentLineRef.current += text;

      setLines((prev) => {
        const newLines = [...prev];
        const sentences = currentLineRef.current.match(/[^。？！]+[。？！]/g) || [];

        sentences.forEach((sentence) => {
          const trimmed = sentence.trim();
          if (!trimmed) return;

          const speaker = 'Speaker';
          const nowSec = Date.now() / 1000;
          const lastLine = newLines.length > 0 ? newLines[newLines.length - 1] : null;

          let newParagraph = false;
          if (!lastLine || lastLine.speaker !== speaker) newParagraph = true;
          else if (lastLine.confirmedSegments.length > 0) {
            const gap = nowSec - lastLine.lastSegmentEndTime;
            if (gap > PARAGRAPH_BREAK_SILENCE_THRESHOLD) newParagraph = true;
          }

          const seg: ConfirmedSegment = { text: trimmed, startTime: nowSec, endTime: nowSec };

          if (newParagraph) {
            newLines.push({
              id: nextIdRef.current++,
              speaker,
              confirmedSegments: [seg],
              partialText: '',
              lastSegmentEndTime: nowSec,
            });
          } else {
            const idx = newLines.length - 1;
            const updated = { ...newLines[idx] };
            updated.confirmedSegments = [...updated.confirmedSegments, seg];
            updated.lastSegmentEndTime = nowSec;
            newLines[idx] = updated;
          }
        });

        // remove processed sentence buffer
        const lastEnd = currentLineRef.current.search(/[。？！][^。？！]*$/);
        if (lastEnd !== -1) currentLineRef.current = currentLineRef.current.substring(lastEnd + 1);

        // partial text
        if (currentLineRef.current.trim()) {
          const last = newLines[newLines.length - 1];
          if (last) last.partialText = currentLineRef.current;
          else {
            newLines.push({
              id: nextIdRef.current++,
              speaker: 'Speaker',
              confirmedSegments: [],
              partialText: currentLineRef.current,
              lastSegmentEndTime: Date.now() / 1000,
            });
          }
        }

        linesRef.current = newLines;
        throttledSave();
        return newLines;
      });
    });
  }, [onMessage, throttledSave]);

  // Send PCM audio to backend
  usePCMAudioListener((audioData) => {
    if (wsStatus === 'open' && isTranscribing) {
      sendBinary(audioData);
    }
  });

  // Auto scroll transcript pane
  useSmartScroll(originalColumnRef, lines);

  // Connect WS on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Load saved session on mount (best-effort)
  useEffect(() => {
    (async () => {
      const saved = await loadSession(SESSION_ID);
      if (saved && (saved.lines?.length || saved.audioBlob)) {
        setLines(saved.lines || []);
        linesRef.current = saved.lines || [];
        if (saved.audioBlob) audioChunksRef.current = [saved.audioBlob];
      }
    })();
  }, []);

  const handleStart = async () => {
    try {
      setError(null);
      setIsInitializing(true);
      // Environment checks: secure context and AudioWorklet support
      if (!window.isSecureContext) {
        throw new Error('当前页面不是安全上下文。请使用 HTTPS 访问，或通过 http://localhost:PORT 访问（localhost 被视为安全）。');
      }

      const hasAudioWorklet = typeof AudioContext !== 'undefined' &&
        'audioWorklet' in (AudioContext.prototype as unknown as Record<string, unknown>);
      if (!hasAudioWorklet) {
        throw new Error('当前环境缺少 AudioWorklet 支持。请使用最新版 Chrome/Edge，并确保通过 HTTPS 或 localhost 访问。');
      }
      // reset session
      await clearSession(SESSION_ID);
      audioChunksRef.current = [];
      setLines([]);
      linesRef.current = [];
      currentLineRef.current = '';

      if (wsStatus !== 'open') {
        connect();
        await waitForConnection();
      }

      await startRecording({});

      // timer
      if (timerIntervalRef.current) window.clearInterval(timerIntervalRef.current);
      setElapsedTime(0);
      timerIntervalRef.current = window.setInterval(() => setElapsedTime((s) => s + 1), 1000);

      // local MediaRecorder for saving audio (optional)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
          throttledSave();
        }
      };
      mr.start(2000);
      mediaRecorderRef.current = mr;

      setIsTranscribing(true);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleStop = async () => {
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setElapsedTime(0);
    try {
      await stopRecording();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
      }
      setIsTranscribing(false);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to stop');
    }
  };

  const handleDownloadAudio = () => {
    if (audioChunksRef.current.length === 0) return;
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording-${new Date().toISOString().replace(/:/g, '-')}.webm`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleDownloadText = () => {
    if (lines.length === 0) return;
    const fullText = lines.map((line) => `${line.speaker}: ${line.confirmedSegments.map((s) => s.text).join('')}`).join('\n\n');
    const textBlob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(textBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${new Date().toISOString().replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleClearSession = async () => {
    await clearSession(SESSION_ID);
    setLines([]);
    linesRef.current = [];
    audioChunksRef.current = [];
    currentLineRef.current = '';
  };

  return (
    <div className="App">
      <HeaderToolbar
        isTranscribing={isTranscribing}
        isInitializing={isInitializing}
        elapsedTime={elapsedTime}
        wsStatus={wsStatus}
        onStart={handleStart}
        onStop={handleStop}
        typewriterEnabled={typewriterEnabled}
        onToggleTypewriter={setTypewriterEnabled}
      />

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          <span>{error}</span>
        </div>
      )}

      <main className="neo-layout">
        <TranscriptPane lines={lines} typewriterEnabled={typewriterEnabled} scrollRef={originalColumnRef} />
        <TranslationPane lines={lines} targetLang="en" />
        <div className="right-stack">
          <SummaryPanel />
          <ChatPanel />
          <div className="controls" style={{ justifyContent: 'flex-end' }}>
            <button onClick={handleDownloadText} className="btn btn-secondary" disabled={lines.length === 0}>导出文本</button>
            <button onClick={handleDownloadAudio} className="btn btn-secondary" disabled={audioChunksRef.current.length === 0}>导出音频</button>
            <button onClick={handleClearSession} className="btn btn-danger" disabled={lines.length === 0 && audioChunksRef.current.length === 0}>清空会话</button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [audioContext] = useState(() => {
    type ACType = typeof AudioContext;
    const w = window as unknown as { AudioContext?: ACType; webkitAudioContext?: ACType };
    const AC: ACType | undefined = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) throw new Error('AudioContext not supported');
    return new AC();
  });

  return (
    <PCMAudioRecorderProvider workletScriptURL="/pcm-audio-worklet.min.js" audioContext={audioContext}>
      <TranscriptionApp />
    </PCMAudioRecorderProvider>
  );
}
