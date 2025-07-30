import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  PCMAudioRecorderProvider,
  usePCMAudioRecorderContext,
  usePCMAudioListener,
} from '@speechmatics/browser-audio-input-react';
import { useBackendWebSocket } from './hooks/useBackendWebSocket';
import { useSmartScroll } from './hooks/useSmartScroll';
import { saveSession, loadSession, clearSession } from './db';
import { throttle } from 'lodash';
import { TranscriptItem } from './components/TranscriptItem';
import './App.css';

// High-resolution timestamp helper function
const getHighResTimestamp = () => {
  const now = new Date();
  return `${now.toISOString().slice(0, -1)}${String(now.getMilliseconds()).padStart(3, '0')}`;
};

interface ConfirmedSegment {
  text: string;
  startTime: number;
  endTime: number;
}

interface TranscriptLine {
  id: number;
  speaker: string;
  confirmedSegments: ConfirmedSegment[]; // 累积最终转录的片段（包含时间戳）
  partialText: string;                   // 当前完整的临时转录文本
  lastSegmentEndTime: number;            // 当前行中最后一个确认片段的结束时间（秒）
}

function TranscriptionApp() {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [typewriterEnabled, setTypewriterEnabled] = useState(true); // New state for typewriter mode
  const [elapsedTime, setElapsedTime] = useState(0); // Recording time in seconds
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [loadedAudioBlob, setLoadedAudioBlob] = useState<Blob | null>(null);
  const nextIdRef = useRef(1);
  const timerIntervalRef = useRef<number | null>(null);
  const PARAGRAPH_BREAK_SILENCE_THRESHOLD = 2.0; // 2 秒的静默时间，用于判断是否开启新段落
  
  // Recording states
  const [, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  
  // Session management
  const SESSION_ID = 'current_session';
  const linesRef = useRef<TranscriptLine[]>([]);
  const effectRan = useRef(false);
  
  // Scroll container refs for auto-scrolling
  const originalColumnRef = useRef<HTMLDivElement>(null);
  
  // Throttle save operations to once every 10 seconds
  const throttledSave = useMemo(
    () => throttle(async () => {
      const audioBlob = audioChunksRef.current.length > 0 
        ? new Blob(audioChunksRef.current, { type: 'audio/webm' })
        : null;
      
      const saved = await saveSession(SESSION_ID, {
        audioBlob,
        lines: linesRef.current,
        translations: [],
      });
      
      if (saved) {
        console.log('Session saved to IndexedDB');
      }
    }, 10000, { leading: false, trailing: true }),
    []
  );
  
  const { startRecording, stopRecording } = usePCMAudioRecorderContext();
  const { connect, sendBinary, disconnect, status: wsStatus, onMessage } = useBackendWebSocket();
  
  // Current line tracking for accumulating text
  const currentLineRef = useRef<string>('');
  
  // Set up message handler for text from backend
  useEffect(() => {
    onMessage((text: string) => {
      console.log('Received text from backend:', text);
      
      // Accumulate text
      currentLineRef.current += text;
      
      setLines((prevLines) => {
        const newLines = [...prevLines];
        
        // Check if this completes a sentence
        const sentences = currentLineRef.current.match(/[^。？！]+[。？！]/g) || [];
        
        sentences.forEach((sentence) => {
          const trimmedSentence = sentence.trim();
          if (!trimmedSentence) return;
          
          // For now, we'll use a single speaker since our backend doesn't provide speaker info
          const speaker = 'Speaker';
          const currentTime = Date.now() / 1000; // Convert to seconds
          
          // Get the last line
          const lastLine = newLines.length > 0 ? newLines[newLines.length - 1] : null;
          
          // Determine if we should start a new paragraph
          let shouldStartNewParagraph = false;
          
          if (!lastLine || lastLine.speaker !== speaker) {
            shouldStartNewParagraph = true;
          } else if (lastLine.confirmedSegments.length > 0) {
            const timeGap = currentTime - lastLine.lastSegmentEndTime;
            if (timeGap > PARAGRAPH_BREAK_SILENCE_THRESHOLD) {
              shouldStartNewParagraph = true;
            }
          }
          
          const newSegment: ConfirmedSegment = {
            text: trimmedSentence,
            startTime: currentTime,
            endTime: currentTime
          };
          
          if (shouldStartNewParagraph) {
            newLines.push({
              id: nextIdRef.current++,
              speaker,
              confirmedSegments: [newSegment],
              partialText: '',
              lastSegmentEndTime: currentTime
            });
          } else {
            const lastLineIndex = newLines.length - 1;
            const updatedLine = { ...newLines[lastLineIndex] };
            updatedLine.confirmedSegments.push(newSegment);
            updatedLine.lastSegmentEndTime = currentTime;
            newLines[lastLineIndex] = updatedLine;
          }
        });
        
        // Remove processed sentences from buffer
        const lastSentenceEnd = currentLineRef.current.search(/[。？！][^。？！]*$/);
        if (lastSentenceEnd !== -1) {
          currentLineRef.current = currentLineRef.current.substring(lastSentenceEnd + 1);
        }
        
        // Handle partial text (incomplete sentence)
        if (currentLineRef.current.trim()) {
          const lastLine = newLines[newLines.length - 1];
          if (lastLine) {
            lastLine.partialText = currentLineRef.current;
          } else {
            // Create a new line for partial text if no lines exist
            newLines.push({
              id: nextIdRef.current++,
              speaker: 'Speaker',
              confirmedSegments: [],
              partialText: currentLineRef.current,
              lastSegmentEndTime: Date.now() / 1000
            });
          }
        }
        
        linesRef.current = newLines;
        throttledSave();
        
        return newLines;
      });
    });
  }, [onMessage, throttledSave]);
  
  // Send audio to backend
  usePCMAudioListener((audioData) => {
    console.log(`[${getHighResTimestamp()}] AUDIO_CAPTURED: ${audioData.byteLength} bytes`);
    if (wsStatus === 'open' && isTranscribing) {
      console.log(`[${getHighResTimestamp()}] AUDIO_SENDING: ${audioData.byteLength} bytes`);
      sendBinary(audioData);
    }
  });

  // Apply smart auto-scroll to original text column
  useSmartScroll(originalColumnRef, lines);
  
  // Connect to backend WebSocket on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);
  
  // Load saved session on mount
  useEffect(() => {
    // In StrictMode, effects run twice. We only want to run this logic once.
    if (effectRan.current === true || import.meta.env.MODE !== 'development') {
      const restoreSession = async () => {
        const savedSession = await loadSession(SESSION_ID);
        if (savedSession && (savedSession.lines.length > 0 || savedSession.audioBlob)) {
          console.log('Restoring session from IndexedDB');
          
          // Show a notification to user in English
          const userConfirmed = window.confirm(
            `An unfinished transcription session was found.\n` +
            `Recording time: ${new Date(savedSession.timestamp).toLocaleString()}\n` +
            `Do you want to restore it?`
          );
          
          if (userConfirmed) {
            // Restore transcript lines
            setLines(savedSession.lines);
            linesRef.current = savedSession.lines;
            
            // Restore audio data if available
            if (savedSession.audioBlob) {
              audioChunksRef.current = [savedSession.audioBlob];
            }
            
            // Restore audio data for batch processing
            if (savedSession.audioBlob) {
              setLoadedAudioBlob(savedSession.audioBlob);
              console.log(`Audio blob of ${savedSession.audioBlob.size} bytes loaded for batch processing.`);
            }
          } else {
            // User chose not to restore, clear the session
            await clearSession(SESSION_ID);
            console.log('User declined to restore. Cleared saved session.');
          }
        }
      };
      
      restoreSession();
    }
    
    // Cleanup function to set the ref, ensuring the effect runs on the next render in dev
    return () => {
      effectRan.current = true;
    };
  }, []);

  const handleStart = async () => {
    // Password verification
    const password = prompt("Please enter password：");
    const correctPassword = "233333"; // Default password

    if (password !== correctPassword) {
      alert("密码错误！");
      return; // Abort function execution
    }
    
    // If password is correct, continue with recording
    try {
      setError(null);
      setIsInitializing(true);
      
      // Clear previous session data
      await clearSession(SESSION_ID);
      audioChunksRef.current = [];
      setLines([]);
      linesRef.current = [];
      currentLineRef.current = '';
      
      // Ensure WebSocket is connected
      if (wsStatus !== 'open') {
        connect();
        // Wait for connection
        let attempts = 0;
        while (wsStatus !== 'open' && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        if (wsStatus !== 'open') {
          throw new Error('Failed to connect to backend');
        }
      }
      
      // Start recording audio
      console.log('Starting audio recording...');
      await startRecording({});  // Using default audio settings
      console.log('Audio recording started');
      
      // Start the timer
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setElapsedTime(0); // Reset time
      timerIntervalRef.current = window.setInterval(() => {
        setElapsedTime(prevTime => prevTime + 1);
      }, 1000);
      
      // Initialize MediaRecorder for saving audio
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;
        
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            throttledSave();
          }
        };
        
        mediaRecorder.onstart = () => {
          console.log('MediaRecorder started');
          setIsRecording(true);
        };
        
        mediaRecorder.onstop = () => {
          console.log('MediaRecorder stopped');
          setIsRecording(false);
        };
        
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(1000); // Collect data every second
      } catch (err) {
        console.error('Failed to initialize MediaRecorder:', err);
      }
      
      // 现在才真正开始转录
      setIsTranscribing(true);
      setIsInitializing(false);
    } catch (err) {
      console.error('Failed to start transcription:', err);
      setError(err instanceof Error ? err.message : 'Failed to start transcription');
      setIsTranscribing(false);
      setIsInitializing(false);
    }
  };

  const handleStop = async () => {
    // Stop the timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setElapsedTime(0); // Reset time
    
    try {
      await stopRecording();
      
      // Stop MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      
      // Stop all audio tracks
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
      
      setIsTranscribing(false);
    } catch (err) {
      console.error('Failed to stop transcription:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop transcription');
    }
  };

  const handleDownloadAudio = () => {
    if (audioChunksRef.current.length === 0) {
      alert('No audio recorded yet');
      return;
    }
    
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
    if (lines.length === 0) {
      alert('No transcript available yet');
      return;
    }
    
    const fullText = lines.map(line => {
      const text = line.confirmedSegments.map(seg => seg.text).join('');
      return `${line.speaker}: ${text}`;
    }).join('\n\n');
    
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
  
  // Format elapsed time in MM:SS format
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  };
  
  const handleClearSession = async () => {
    const confirmed = window.confirm('Are you sure you want to clear the current session? This will delete all transcription text and audio recordings.');
    if (confirmed) {
      await clearSession(SESSION_ID);
      setLines([]);
      linesRef.current = [];
      audioChunksRef.current = [];
      setLoadedAudioBlob(null);
      currentLineRef.current = '';
      alert('Session cleared');
    }
  };

  const handleBatchTranscribe = async () => {
    if (!loadedAudioBlob) {
      alert('No cached audio to transcribe.');
      return;
    }

    setIsBatchProcessing(true);
    setError(null);

    try {
      // 1. 寻找断点：获取最后一个确认片段的结束时间
      let lastTimestamp = 0;
      if (linesRef.current.length > 0) {
        const lastLine = linesRef.current[linesRef.current.length - 1];
        if (lastLine.confirmedSegments.length > 0) {
          lastTimestamp = lastLine.confirmedSegments[lastLine.confirmedSegments.length - 1].endTime;
        }
      }
      console.log(`Found last timestamp (breakpoint): ${lastTimestamp}s`);

      const formData = new FormData();
      formData.append('audio', loadedAudioBlob, 'session_audio.webm');

      const response = await fetch('/api/transcribe/batch', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Batch transcription failed: ${errorText}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(`Batch transcription error: ${result.error}`);
      }

      if (result.status === 'done' && result.transcript?.results) {
        // 2. 过滤结果：只保留在断点之后的新片段
        const newSegments = result.transcript.results
          .filter((item: any) => item.start_time > lastTimestamp)
          .map((item: any) => ({
            text: item.alternatives[0]?.content || '',
            startTime: item.start_time,
            endTime: item.end_time,
            speaker: item.alternatives[0]?.speaker || 'Speaker'
          }));

        if (newSegments.length === 0) {
          alert('No new content found in the cached audio to transcribe.');
          setLoadedAudioBlob(null); // Clear blob as it has been fully processed
          setIsBatchProcessing(false);
          return;
        }
        
        console.log(`Found ${newSegments.length} new segments to append.`);

        // 3. 无缝合并
        setLines(prevLines => {
          const newLines = [...prevLines];
          
          newSegments.forEach((segment: any) => {
            if (!segment.text.trim()) return;

            let lastSpeakerLineIndex = -1;
            for (let i = newLines.length - 1; i >= 0; i--) {
              if (newLines[i].speaker === segment.speaker) {
                lastSpeakerLineIndex = i;
                break;
              }
            }

            const newSegmentData = {
              text: segment.text,
              startTime: segment.startTime,
              endTime: segment.endTime,
            };

            // 判断是否需要开启新段落（与之前的逻辑类似）
            const timeGap = lastSpeakerLineIndex !== -1 && newLines[lastSpeakerLineIndex].lastSegmentEndTime > 0
              ? segment.startTime - newLines[lastSpeakerLineIndex].lastSegmentEndTime
              : 0;

            if (lastSpeakerLineIndex === -1 || timeGap > PARAGRAPH_BREAK_SILENCE_THRESHOLD) {
              newLines.push({
                id: nextIdRef.current++,
                speaker: segment.speaker,
                confirmedSegments: [newSegmentData],
                partialText: '',
                lastSegmentEndTime: segment.endTime,
              });
            } else {
              const updatedLine = { ...newLines[lastSpeakerLineIndex] };
              updatedLine.confirmedSegments.push(newSegmentData);
              updatedLine.lastSegmentEndTime = segment.endTime;
              newLines[lastSpeakerLineIndex] = updatedLine;
            }
          });
          
          linesRef.current = newLines;
          throttledSave();
          return newLines;
        });

        alert('Successfully transcribed new content from cache!');
        setLoadedAudioBlob(null);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBatchProcessing(false);
    }
  };

  return (
    <div className="App">
      <h1>Real-time Speech Transcription</h1>
      
      {/* Unified Status Bar */}
      <div className="status-bar">
        {error ? (
          <>
            <div className="status-indicator" style={{ backgroundColor: 'var(--ume)' }} />
            <span className="status-text">Error occurred</span>
          </>
        ) : isInitializing ? (
          <>
            <div className="status-indicator" style={{ backgroundColor: 'var(--sakura)' }} />
            <span className="status-text">Initializing microphone...</span>
          </>
        ) : isTranscribing ? (
          <>
            <div className="status-indicator" style={{ backgroundColor: 'var(--ume)' }} />
            <span className="status-text">Recording: {formatTime(elapsedTime)}</span>
          </>
        ) : (
          <>
            <div className="status-indicator" style={{ backgroundColor: 'var(--hai)' }} />
            <span className="status-text">Ready to start</span>
          </>
        )}
      </div>
      
      {/* Toggle Switches */}
      <div className="toggle-group">
        <div className="toggle-container">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={typewriterEnabled}
              onChange={(e) => setTypewriterEnabled(e.target.checked)}
            />
            <div className="toggle-switch">
              <div className="toggle-slider" />
            </div>
            <span>Typewriter Mode (Experimental)</span>
          </label>
          {typewriterEnabled && (
            <div className="warning-text">
              ⚠️ Experimental feature - may cause delays or incomplete display
            </div>
          )}
        </div>
      </div>
      
      <div className="controls">
        <button 
          onClick={handleStart} 
          disabled={isTranscribing || isInitializing}
          className="btn btn-primary"
        >
          {isInitializing ? 'Initializing...' : isTranscribing ? 'Transcribing' : 'Start Transcription'}
        </button>
        
        <button 
          onClick={handleStop} 
          disabled={!isTranscribing}
          className="btn btn-danger"
        >
          Stop Transcription
        </button>
        
        {loadedAudioBlob && !isTranscribing && (
          <button 
            onClick={handleBatchTranscribe} 
            disabled={isBatchProcessing}
            className="control-button"
          >
            {isBatchProcessing ? 'Processing...' : 'Transcribe Cached Audio'}
          </button>
        )}
        
      </div>

      {/* Download buttons */}
      <div className="controls">
        <button 
          onClick={handleDownloadAudio} 
          disabled={audioChunksRef.current.length === 0}
          className="btn btn-secondary"
        >
          Download Audio
        </button>
        
        <button 
          onClick={handleDownloadText} 
          disabled={lines.length === 0}
          className="btn btn-secondary"
        >
          Download Text
        </button>
        
        <button 
          onClick={handleClearSession} 
          disabled={lines.length === 0 && audioChunksRef.current.length === 0}
          className="btn btn-danger"
        >
          Clear Session
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>❌</span>
          <span>{error}</span>
        </div>
      )}

      <div className="transcript-container">
        <h2>Transcription</h2>
        <div className="column-container">
          <h3>Transcribed Text</h3>
          <div className="scrollable-column" ref={originalColumnRef}>
            {lines.length === 0 ? (
              <div style={{ color: 'var(--hai)', padding: '2rem', textAlign: 'center' }}>
                <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>
                  {isInitializing ? 'Initializing microphone and connection...' : 
                   isTranscribing ? 'Listening... Speak into your microphone.' : 
                   'Click Start to begin transcription'}
                </p>
                <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                  {isTranscribing ? 'Your words will appear here in real-time' : 
                   'High-quality speech recognition powered by PCAS'}
                </p>
              </div>
            ) : (
              <div className="content-list">
                {lines.map((line) => {
                  const confirmedText = line.confirmedSegments.map(seg => seg.text).join('');
                  
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
        </div>
      </div>
    </div>
  );
}

function App() {
  // Create AudioContext instance using useState to ensure it persists
  const [audioContext] = useState(() => {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('AudioContext not supported');
    }
    return new AudioContextClass();
  });

  return (
    <PCMAudioRecorderProvider 
      workletScriptURL="/pcm-audio-worklet.min.js"
      audioContext={audioContext}
    >
      <TranscriptionApp />
    </PCMAudioRecorderProvider>
  );
}

export default App;