import { useRef, useState } from 'react';
import { streamSSE } from '../utils/sse';

type Msg = { id: string; role: 'user' | 'ai'; content: string; typing?: boolean };

export function ChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([
    { id: 'ai-hello', role: 'ai', content: '你好，我是你的课堂助手。' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    // Build a lightweight rolling context from recent turns with hard caps
    const MAX_TURNS = 6;         // limit number of recent messages
    const MAX_CONTEXT_CHARS = 2000; // limit total characters
    const turns = messages.filter((m) => m.role === 'user' || m.role === 'ai');
    const recentTurns = turns.slice(-MAX_TURNS);
    // Enforce char budget from the end backward, then restore order
    let budget = MAX_CONTEXT_CHARS;
    const picked: string[] = [];
    for (let i = recentTurns.length - 1; i >= 0; i--) {
      const t = `${recentTurns[i].role === 'user' ? 'User' : 'Assistant'}: ${recentTurns[i].content}`;
      if (t.length <= budget) {
        picked.push(t);
        budget -= t.length + 1; // + newline
      } else {
        // take tail part to fit budget, if any
        if (budget > 20) { // avoid adding extremely short fragments
          picked.push(t.slice(t.length - budget));
          budget = 0;
        }
        break;
      }
      if (budget <= 0) break;
    }
    picked.reverse();
    const contextText = picked.join('\n');

    const user: Msg = { id: `u-${Date.now()}`, role: 'user', content: text };
    const ai: Msg = { id: `a-${Date.now()}`, role: 'ai', content: '', typing: true };
    setMessages((m) => [...m, user, ai]);
    setInput('');
    setSending(true);

    try {
      await streamSSE(
        '/api/chat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'current_session',
            // Preface prior turns as plain-text context before the new input
            message: contextText ? `Context\n${contextText}\n\nUser: ${text}` : text,
            attrs: {
              model: 'gpt-5',
              system:
                'You are a helpful assistant. Use the provided Context (if any) to answer concisely.',
              // Also provide context via attrs for providers that read attributes
              context: contextText || '',
            },
          }),
        },
        (t) => {
          // first chunk: turn off typing and append
          setMessages((m) =>
            m.map((msg) => (msg.id === ai.id ? { ...msg, typing: false, content: msg.content + t } : msg)),
          );
        },
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="chat-panel">
      <div className="pane__title">提问 Chat</div>
      <div className="chat-list">
        {messages.map((m) => (
          <div key={m.id} className={`chat-item chat-${m.role}`}>
            <div className={`chat-bubble${m.typing ? ' typing' : ''}`}>
              {m.typing ? (
                <span className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入你的问题…（可引用左侧文本）"
          disabled={sending}
        />
        <button className="btn btn-primary" onClick={send} disabled={sending || !input.trim()}>
          发送
        </button>
      </div>
    </div>
  );
}
