export type SSEOnText = (text: string) => void;

// Stream an SSE response and invoke onText for each {text:"..."} payload.
// Expects server to emit lines like: "data: {\"text\":\"...\"}\n\n".
export async function streamSSE(
  input: RequestInfo,
  init: RequestInit | undefined,
  onText: SSEOnText,
  signal?: AbortSignal,
): Promise<void> {
  const controller = new AbortController();
  const linked = signal ? linkAbortSignals(signal, controller) : undefined;
  try {
    const resp = await fetch(input, { ...(init || {}), signal: controller.signal });
    if (!resp.ok || !resp.body) {
      const t = await resp.text().catch(() => '');
      throw new Error(t || `${resp.status} ${resp.statusText}`);
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const lines = frame.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const json = line.slice(6);
            try {
              const obj = JSON.parse(json);
              if (obj && typeof obj.text === 'string') onText(obj.text);
            } catch {
              // ignore parse errors for non-JSON or partial frames
            }
          }
        }
      }
    }
  } finally {
    controller.abort();
    if (linked) linked.abort();
  }
}

function linkAbortSignals(a: AbortSignal, b: AbortController): AbortController {
  const c = new AbortController();
  const onAbort = () => {
    b.abort();
    c.abort();
  };
  if (a.aborted) onAbort();
  else a.addEventListener('abort', onAbort, { once: true });
  return c;
}

