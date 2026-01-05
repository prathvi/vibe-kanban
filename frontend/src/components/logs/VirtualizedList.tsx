import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState, useCallback } from 'react';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { Loader2 } from 'lucide-react';
import { TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';

interface VirtualizedListProps {
  attempt: WorkspaceWithSession;
  task?: TaskWithAttemptStatus;
}


const VirtualizedList = ({ attempt, task }: VirtualizedListProps) => {
  const [entries, setEntriesState] = useState<PatchTypeWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const parentRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);
  const didInitScroll = useRef(false);
  const { setEntries, reset } = useEntries();

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  useEffect(() => {
    setLoading(true);
    setEntriesState([]);
    didInitScroll.current = false;
    reset();
  }, [attempt.id, reset]);

  // Check if user is at the bottom
  const checkAtBottom = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const threshold = 100;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setAtBottom(isAtBottom);
  }, []);

  // Initial scroll to bottom
  useEffect(() => {
    if (!didInitScroll.current && entries.length > 0 && !loading) {
      didInitScroll.current = true;
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(entries.length - 1, { align: 'end' });
      });
    }
  }, [entries.length, loading, virtualizer]);

  // Auto-scroll when new entries arrive
  useEffect(() => {
    const prev = prevLenRef.current;
    const grewBy = entries.length - prev;
    prevLenRef.current = entries.length;

    if (grewBy > 0 && atBottom && entries.length > 0 && didInitScroll.current) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(entries.length - 1, { align: 'end', behavior: 'smooth' });
      });
    }
  }, [entries.length, atBottom, virtualizer]);

  const onEntriesUpdated = useCallback((
    newEntries: PatchTypeWithKey[],
    _addType: AddEntryType,
    newLoading: boolean
  ) => {
    setEntriesState(newEntries);
    setEntries(newEntries);

    if (loading) {
      setLoading(newLoading);
    }
  }, [loading, setEntries]);

  useConversationHistory({ attempt, onEntriesUpdated });

  const renderItem = (data: PatchTypeWithKey) => {
    if (data.type === 'STDOUT') {
      return <p>{data.content}</p>;
    }
    if (data.type === 'STDERR') {
      return <p>{data.content}</p>;
    }
    if (data.type === 'NORMALIZED_ENTRY' && attempt) {
      return (
        <DisplayConversationEntry
          expansionKey={data.patchKey}
          entry={data.content}
          executionProcessId={data.executionProcessId}
          taskAttempt={attempt}
          task={task}
        />
      );
    }
    return null;
  };

  return (
    <ApprovalFormProvider>
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        onScroll={checkAtBottom}
      >
        <div className="h-2" />
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index];
            return (
              <div
                key={`l-${entry.patchKey}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {renderItem(entry)}
              </div>
            );
          })}
        </div>
        <div className="h-2" />
      </div>
      {loading && (
        <div className="float-left top-0 left-0 w-full h-full bg-primary flex flex-col gap-2 justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Loading History</p>
        </div>
      )}
    </ApprovalFormProvider>
  );
};

export default VirtualizedList;
