import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertCircle } from 'lucide-react';
import { useLogStream } from '@/hooks/useLogStream';
import RawLogText from '@/components/common/RawLogText';
import type { PatchType } from 'shared/types';

// ============================================================================
// Types
// ============================================================================

type LogEntry = Extract<PatchType, { type: 'STDOUT' } | { type: 'STDERR' }>;

interface ProcessLogsViewerProps {
  processId: string;
}

interface ProcessLogsViewerContentProps {
  logs: LogEntry[];
  error: string | null;
}

// ============================================================================
// LogLine Component - Renders a single log entry
// ============================================================================

interface LogLineProps {
  entry: LogEntry;
}

const LogLine = memo(({ entry }: LogLineProps) => (
  <RawLogText
    content={entry.content}
    channel={entry.type === 'STDERR' ? 'stderr' : 'stdout'}
    className="text-sm px-4 py-1"
  />
));

LogLine.displayName = 'LogLine';

// ============================================================================
// EmptyState Component - Shows when no logs available
// ============================================================================

const EmptyState = () => (
  <div className="h-full flex items-center justify-center">
    <p className="text-muted-foreground text-sm">No logs available</p>
  </div>
);

// ============================================================================
// ErrorState Component - Shows error messages
// ============================================================================

interface ErrorStateProps {
  message: string;
}

const ErrorState = ({ message }: ErrorStateProps) => (
  <div className="h-full flex items-center justify-center">
    <div className="text-destructive text-sm flex items-center gap-2">
      <AlertCircle className="h-4 w-4" />
      <span>{message}</span>
    </div>
  </div>
);

// ============================================================================
// VirtualLogList Component - Handles virtualized rendering of logs
// ============================================================================

interface VirtualLogListProps {
  logs: LogEntry[];
}

const ESTIMATED_ROW_HEIGHT = 28;
const OVERSCAN_COUNT = 15;

const VirtualLogList = memo(({ logs }: VirtualLogListProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isInitialScrollDone = useRef(false);
  const previousLogCount = useRef(0);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_COUNT,
  });

  // Detect if user is scrolled to bottom
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsUserAtBottom(distanceFromBottom < 50);
  }, []);

  // Initial scroll to bottom when logs first appear
  useEffect(() => {
    if (!isInitialScrollDone.current && logs.length > 0) {
      isInitialScrollDone.current = true;
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(logs.length - 1, { align: 'end' });
      });
    }
  }, [logs.length, virtualizer]);

  // Auto-scroll to bottom when new logs arrive (only if user was at bottom)
  useEffect(() => {
    const prevCount = previousLogCount.current;
    const newLogsAdded = logs.length - prevCount;
    previousLogCount.current = logs.length;

    if (newLogsAdded > 0 && isUserAtBottom && logs.length > 0) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(logs.length - 1, { align: 'end' });
      });
    }
  }, [logs.length, isUserAtBottom, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  return (
    <div
      ref={scrollContainerRef}
      className="absolute inset-0 overflow-auto"
      onScroll={handleScroll}
    >
      <div
        className="relative w-full"
        style={{ height: `${totalHeight}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const entry = logs[virtualRow.index];
          return (
            <div
              key={virtualRow.index}
              className="absolute left-0 w-full"
              style={{ top: `${virtualRow.start}px` }}
            >
              <LogLine entry={entry} />
            </div>
          );
        })}
      </div>
    </div>
  );
});

VirtualLogList.displayName = 'VirtualLogList';

// ============================================================================
// ProcessLogsViewerContent - Main content component (exported for direct use)
// ============================================================================

export const ProcessLogsViewerContent = memo(({
  logs,
  error,
}: ProcessLogsViewerContentProps) => {
  // Determine what to render
  const hasError = Boolean(error);
  const isEmpty = logs.length === 0;

  return (
    <div className="relative h-full w-full">
      {hasError ? (
        <ErrorState message={error!} />
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <VirtualLogList logs={logs} />
      )}
    </div>
  );
});

ProcessLogsViewerContent.displayName = 'ProcessLogsViewerContent';

// ============================================================================
// ProcessLogsViewer - Main component with data fetching
// ============================================================================

const ProcessLogsViewer = ({ processId }: ProcessLogsViewerProps) => {
  const { logs, error } = useLogStream(processId);
  return <ProcessLogsViewerContent logs={logs} error={error} />;
};

export default ProcessLogsViewer;
