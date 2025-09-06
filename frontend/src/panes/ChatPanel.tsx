import { useRef, useState } from 'react';
import { streamSSE } from '../utils/sse';

type Msg = { id: string; role: 'user' | 'ai'; content: string };

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
    const user: Msg = { id: `u-${Date.now()}`, role: 'user', content: text };
    const ai: Msg = { id: `a-${Date.now()}`, role: 'ai', content: '' };
    setMessages((m) => [...m, user, ai]);
    setInput('');
    setSending(true);

    try {
      await streamSSE(
        '/api/chat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: 'current_session', message: text, attrs: { model: 'gpt-5', system: 'You are a helpful assistant.' } }),
        },
        (t) => {
          setMessages((m) => m.map((msg) => (msg.id === ai.id ? { ...msg, content: msg.content + t } : msg)));
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
            <div className="chat-bubble">{m.content}</div>
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

