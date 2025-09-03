import { useRef, useCallback, useEffect, useState } from 'react';

// Environment variables are now properly configured

type WebSocketStatus = 'connecting' | 'open' | 'closed' | 'error';

interface UseBackendWebSocketReturn {
  connect: () => void;
  sendMessage: (data: unknown) => void;
  sendBinary: (data: ArrayBuffer) => void;
  disconnect: () => void;
  status: WebSocketStatus;
  onMessage: (handler: (data: string) => void) => void;
  waitForConnection: () => Promise<void>;
}

// Resolve backend WS base:
// Priority:
// 1) URL query param `?ws=ws(s)://host:port` (for quick override in demos)
// 2) VITE_BACKEND_WS_URL (compile-time)
// 3) Same-origin (production, or dev via Vite proxy)
const getExplicitBase = (): string | undefined => {
  let wsParam: string | null = null;
  try {
    const url = new URL(window.location.href);
    wsParam = url.searchParams.get('ws');
  } catch (e) {
    // ignore invalid URL parsing in unusual environments
  }
  if (wsParam && /^wss?:\/\//i.test(wsParam)) return wsParam.trim();
  const env = (import.meta.env.VITE_BACKEND_WS_URL as string | undefined)?.trim();
  return env || undefined;
};
const EXPLICIT_WS_BASE = getExplicitBase();

export const useBackendWebSocket = (): UseBackendWebSocketReturn => {
  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<WebSocketStatus>('closed');
  const [status, setStatus] = useState<WebSocketStatus>('closed');
  const messageHandlerRef = useRef<((data: string) => void) | null>(null);
  
  // Reconnection state management
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeoutRef = useRef<number | null>(null);
  const manuallyDisconnectedRef = useRef(false);

  // Create a ref to hold the connect function
  const connectRef = useRef<(() => void) | null>(null);

  const reconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.error('Max reconnect attempts reached. Giving up.');
      statusRef.current = 'error';
      setStatus('error');
      return;
    }
    if (manuallyDisconnectedRef.current) {
      console.log('Manual disconnect, not reconnecting.');
      return;
    }

    reconnectAttemptsRef.current++;
    // Exponential backoff with jitter
    const delay = Math.min(30000, (Math.pow(2, reconnectAttemptsRef.current) * 1000) + (Math.random() * 1000));
    
    console.log(`WebSocket disconnected. Attempting to reconnect in ${Math.round(delay / 1000)}s... (Attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = window.setTimeout(() => {
      if (connectRef.current) {
        connectRef.current();
      }
    }, delay);
  }, []);

  const connect = useCallback(() => {
    manuallyDisconnectedRef.current = false; // Reset on new connect attempt
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    try {
      // Build final WS URL
      const wsUrl = (() => {
        if (EXPLICIT_WS_BASE) {
          const base = EXPLICIT_WS_BASE.replace(/\/$/, '');
          return `${base}/ws/transcribe`;
        }
        // Use same-origin by default. In dev, vite proxy should forward /ws to backend 8080 with ws upgrade.
        const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${scheme}//${window.location.host}/ws/transcribe`;
      })();
      console.log('[WS] connecting to', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connected to backend');
        statusRef.current = 'open';
        setStatus('open');
        reconnectAttemptsRef.current = 0; // Reset on successful connection
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected from backend');
        statusRef.current = 'closed';
        setStatus('closed');
        
        // Trigger reconnect logic if not manually disconnected
        if (!manuallyDisconnectedRef.current) {
          reconnect();
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        statusRef.current = 'error';
        setStatus('error');
      };

      ws.onmessage = (event) => {
        console.log('Received message from backend:', event.data);
        if (messageHandlerRef.current && typeof event.data === 'string') {
          messageHandlerRef.current(event.data);
        }
      };

      wsRef.current = ws;
      statusRef.current = 'connecting';
      setStatus('connecting');
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      statusRef.current = 'error';
      setStatus('error');
    }
  }, [reconnect]);

  // Store the connect function in the ref
  connectRef.current = connect;

  const sendMessage = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      wsRef.current.send(message);
      console.log('Sent message to backend:', message);
    } else {
      console.warn('WebSocket is not open. Current state:', wsRef.current?.readyState);
    }
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
      console.log('Sent binary data to backend:', data.byteLength, 'bytes');
    } else {
      console.warn('WebSocket is not open. Current state:', wsRef.current?.readyState);
    }
  }, []);

  const onMessage = useCallback((handler: (data: string) => void) => {
    messageHandlerRef.current = handler;
  }, []);

  const disconnect = useCallback(() => {
    manuallyDisconnectedRef.current = true; // Set manual disconnect flag
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const waitForConnection = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      if (statusRef.current === 'open') {
        resolve();
        return;
      }

      let attempts = 0;
      const maxAttempts = 50;
      const checkInterval = setInterval(() => {
        attempts++;
        if (statusRef.current === 'open') {
          clearInterval(checkInterval);
          resolve();
        } else if (attempts >= maxAttempts || statusRef.current === 'error') {
          clearInterval(checkInterval);
          reject(new Error('Failed to connect to backend'));
        }
      }, 100);
    });
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    sendMessage,
    sendBinary,
    disconnect,
    status,
    onMessage,
    waitForConnection,
  };
};
