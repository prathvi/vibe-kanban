import { TaskStatus } from 'shared/types';

// Extended status type that includes the queue column
export type KanbanColumnStatus = TaskStatus | 'queue';

export const statusLabels: Record<KanbanColumnStatus, string> = {
  queue: 'Queue',
  todo: 'To Do',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const statusBoardColors: Record<KanbanColumnStatus, string> = {
  queue: '--violet',
  todo: '--neutral-foreground',
  inprogress: '--info',
  inreview: '--warning',
  done: '--success',
  cancelled: '--destructive',
};
