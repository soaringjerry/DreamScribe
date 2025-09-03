import React, { useRef, useState } from 'react';

type Msg = { id: string; role: 'user' | 'ai'; content: string };

export const ChatPanel: React.FC = () => {
  const [messages, setMessages] = useState<Msg[]>([
    { id: 'ai-hello', role: 'ai', content: '你好，我是你的课堂助手。' },
  ]);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const newUser: Msg = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages((m) => [...m, newUser, { id: `ai-${Date.now()}`, role: 'ai', content: '（占位）稍后将接入流式回答。' }]);
    setInput('');
    inputRef.current?.focus();
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
        />
        <button className="btn btn-primary" onClick={send}>发送</button>
      </div>
    </div>
  );
};

