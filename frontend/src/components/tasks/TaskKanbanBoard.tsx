import { memo } from 'react';
import { useAuth } from '@/hooks';
import {
  type DragEndEvent,
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import { TaskCard } from './TaskCard';
import type { TaskWithAttemptStatus } from 'shared/types';
import {
  statusBoardColors,
  statusLabels,
  type KanbanColumnStatus,
} from '@/utils/statusLabels';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { SharedTaskCard } from './SharedTaskCard';
import { Button } from '@/components/ui/button';
import { Play, Square } from 'lucide-react';

export type KanbanColumnItem =
  | {
      type: 'task';
      task: TaskWithAttemptStatus;
      sharedTask?: SharedTaskRecord;
    }
  | {
      type: 'shared';
      task: SharedTaskRecord;
    };

export type KanbanColumns = Record<KanbanColumnStatus, KanbanColumnItem[]>;

interface TaskKanbanBoardProps {
  columns: KanbanColumns;
  onDragEnd: (event: DragEndEvent) => void;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  onViewSharedTask?: (task: SharedTaskRecord) => void;
  selectedTaskId?: string;
  selectedSharedTaskId?: string | null;
  onCreateTask?: () => void;
  projectId: string;
  isQueueProcessing?: boolean;
  onStartQueue?: () => void;
  onStopQueue?: () => void;
}

function TaskKanbanBoard({
  columns,
  onDragEnd,
  onViewTaskDetails,
  onViewSharedTask,
  selectedTaskId,
  selectedSharedTaskId,
  onCreateTask,
  projectId,
  isQueueProcessing,
  onStartQueue,
  onStopQueue,
}: TaskKanbanBoardProps) {
  const { userId } = useAuth();

  const queueActions = (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-xs"
      onClick={isQueueProcessing ? onStopQueue : onStartQueue}
    >
      {isQueueProcessing ? (
        <>
          <Square className="h-3 w-3 mr-1" />
          Stop
        </>
      ) : (
        <>
          <Play className="h-3 w-3 mr-1" />
          Start
        </>
      )}
    </Button>
  );

  return (
    <KanbanProvider onDragEnd={onDragEnd}>
      {Object.entries(columns).map(([status, items]) => {
        const statusKey = status as KanbanColumnStatus;
        // Queue column is not droppable (tasks have fixed position based on queue_position)
        const isQueueColumn = statusKey === 'queue';
        return (
          <KanbanBoard key={status} id={statusKey}>
            <KanbanHeader
              name={statusLabels[statusKey]}
              color={statusBoardColors[statusKey]}
              onAddTask={isQueueColumn ? undefined : onCreateTask}
              actions={isQueueColumn ? queueActions : undefined}
            />
            <KanbanCards>
              {items.map((item, index) => {
                const isOwnTask =
                  item.type === 'task' &&
                  (!item.sharedTask?.assignee_user_id ||
                    !userId ||
                    item.sharedTask?.assignee_user_id === userId);

                if (isOwnTask) {
                  return (
                    <TaskCard
                      key={item.task.id}
                      task={item.task}
                      index={index}
                      status={statusKey}
                      onViewDetails={onViewTaskDetails}
                      isOpen={selectedTaskId === item.task.id}
                      projectId={projectId}
                      sharedTask={item.sharedTask}
                      showQueuePosition={isQueueColumn}
                    />
                  );
                }

                const sharedTask =
                  item.type === 'shared' ? item.task : item.sharedTask!;

                return (
                  <SharedTaskCard
                    key={`shared-${item.task.id}`}
                    task={sharedTask}
                    index={index}
                    status={statusKey}
                    isSelected={selectedSharedTaskId === item.task.id}
                    onViewDetails={onViewSharedTask}
                  />
                );
              })}
            </KanbanCards>
          </KanbanBoard>
        );
      })}
    </KanbanProvider>
  );
}

export default memo(TaskKanbanBoard);
