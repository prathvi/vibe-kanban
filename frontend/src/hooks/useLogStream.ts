import { useEffect, useState, useRef, useCallback } from 'react';
import type { PatchType } from 'shared/types';

export type LogEntry = Extract<PatchType, { type: 'STDOUT' } | { type: 'STDERR' }>;

interface UseLogStreamResult {
  logs: LogEntry[];
  error: string | null;
}

export const useLogStream = (processId: string): UseLogStreamResult => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIntentionallyClosed = useRef<boolean>(false);
  
  const pendingLogsRef = useRef<LogEntry[]>([]);
  const flushScheduledRef = useRef<boolean>(false);
  const logsBufferRef = useRef<LogEntry[]>([]);

  const flushPendingLogs = useCallback(() => {
    flushScheduledRef.current = false;
    if (pendingLogsRef.current.length === 0) return;
    
    const newEntries = pendingLogsRef.current;
    pendingLogsRef.current = [];
    
    logsBufferRef.current = [...logsBufferRef.current, ...newEntries];
    setLogs(logsBufferRef.current);
  }, []);

  const queueLogEntry = useCallback((entry: LogEntry) => {
    pendingLogsRef.current.push(entry);
    
    if (!flushScheduledRef.current) {
      flushScheduledRef.current = true;
      requestAnimationFrame(flushPendingLogs);
    }
  }, [flushPendingLogs]);

  useEffect(() => {
    if (!processId) {
      return;
    }

    setLogs([]);
    setError(null);
    logsBufferRef.current = [];
    pendingLogsRef.current = [];

    const open = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const ws = new WebSocket(
        `${protocol}//${host}/api/execution-processes/${processId}/raw-logs/ws`
      );
      wsRef.current = ws;
      isIntentionallyClosed.current = false;

      ws.onopen = () => {
        setError(null);
        setLogs([]);
        logsBufferRef.current = [];
        pendingLogsRef.current = [];
        retryCountRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if ('JsonPatch' in data) {
            const patches = data.JsonPatch as Array<{ value?: PatchType }>;
            for (const patch of patches) {
              const value = patch?.value;
              if (!value || !value.type) continue;

              if (value.type === 'STDOUT' || value.type === 'STDERR') {
                queueLogEntry({ type: value.type, content: value.content });
              }
            }
          } else if (data.finished === true) {
            flushPendingLogs();
            isIntentionallyClosed.current = true;
            ws.close();
          }
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      };

      ws.onerror = () => {
        setError('Connection failed');
      };

      ws.onclose = (event) => {
        if (!isIntentionallyClosed.current && event.code !== 1000) {
          const next = retryCountRef.current + 1;
          retryCountRef.current = next;
          if (next <= 6) {
            const delay = Math.min(1500, 250 * 2 ** (next - 1));
            retryTimerRef.current = setTimeout(() => open(), delay);
          }
        }
      };
    };

    open();

    return () => {
      if (wsRef.current) {
        isIntentionallyClosed.current = true;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [processId, queueLogEntry, flushPendingLogs]);

  return { logs, error };
};
