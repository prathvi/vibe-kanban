import { useEffect, useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertCircle } from 'lucide-react';
import { useLogStream } from '@/hooks/useLogStream';
import RawLogText from '@/components/common/RawLogText';
import type { PatchType } from 'shared/types';

type LogEntry = Extract<PatchType, { type: 'STDOUT' } | { type: 'STDERR' }>;

interface ProcessLogsViewerProps {
  processId: string;
}

export function ProcessLogsViewerContent({
  logs,
  error,
}: {
  logs: LogEntry[];
  error: string | null;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const didInitScroll = useRef(false);
  const prevLenRef = useRef(0);
  const [atBottom, setAtBottom] = useState(true);

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    // Initial estimate - will be refined by measureElement
    estimateSize: () => 24,
    overscan: 20,
  });

  // Check if user is at the bottom of the scroll
  const checkAtBottom = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const threshold = 50;
    const isAtBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setAtBottom(isAtBottom);
  }, []);

  // 1) Initial jump to bottom once data appears.
  useEffect(() => {
    if (!didInitScroll.current && logs.length > 0) {
      didInitScroll.current = true;
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(logs.length - 1, { align: 'end' });
      });
    }
  }, [logs.length, virtualizer]);

  // 2) If there's a large append and we're at bottom, force-stick to the last item.
  useEffect(() => {
    const prev = prevLenRef.current;
    const grewBy = logs.length - prev;
    prevLenRef.current = logs.length;

    const LARGE_BURST = 10;
    if (grewBy >= LARGE_BURST && atBottom && logs.length > 0) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(logs.length - 1, { align: 'end' });
      });
    }
  }, [logs.length, atBottom, virtualizer]);

  // 3) Follow output when at bottom (for small updates)
  useEffect(() => {
    if (atBottom && logs.length > 0) {
      virtualizer.scrollToIndex(logs.length - 1, { align: 'end' });
    }
  }, [logs.length, atBottom, virtualizer]);

  return (
    <div className="h-full">
      {logs.length === 0 && !error ? (
        <div className="p-4 text-center text-muted-foreground text-sm">
          No logs available
        </div>
      ) : error ? (
        <div className="p-4 text-center text-destructive text-sm">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          {error}
        </div>
      ) : (
        <div
          ref={parentRef}
          className="h-full overflow-auto"
          onScroll={checkAtBottom}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const entry = logs[virtualRow.index];
              return (
                <div
                  // Use stable key from virtualizer
                  key={virtualRow.key}
                  // CRITICAL: data-index is required for measureElement to work
                  data-index={virtualRow.index}
                  // CRITICAL: ref for dynamic measurement
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    // DO NOT set height - let content determine it
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <RawLogText
                    content={entry.content}
                    channel={entry.type === 'STDERR' ? 'stderr' : 'stdout'}
                    className="text-sm px-4 py-1"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProcessLogsViewer({
  processId,
}: ProcessLogsViewerProps) {
  const { logs, error } = useLogStream(processId);
  return <ProcessLogsViewerContent logs={logs} error={error} />;
}
