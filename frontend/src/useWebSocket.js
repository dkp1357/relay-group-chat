import { useEffect, useRef, useCallback, useState } from "react";
import { wsUrl } from "./api";

export function useWebSocket({ slug, onMessage }) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!slug || !mountedRef.current) return;

    const token = localStorage.getItem("relay_token");
    if (!token) {
      reconnectTimer.current = setTimeout(connect, 1000);
      return;
    }
    const ws = new WebSocket(wsUrl(slug));
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
    };
    ws.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        onMessage(JSON.parse(e.data));
      } catch {}
    };
    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
  }, [slug, onMessage]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send, connected };
}
