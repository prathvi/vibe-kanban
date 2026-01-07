export type TaskStatus = 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled';

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  parent_workspace_id: string | null;
  shared_task_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskWithAttemptStatus = Task & {
  has_in_progress_attempt: boolean;
  last_attempt_failed: boolean;
  executor: string;
};

export type Project = {
  id: string;
  name: string;
  dev_script: string | null;
  github_repo_url: string | null;
  created_at: string;
  updated_at: string;
};

export type KanbanColumn = {
  status: TaskStatus;
  title: string;
  tasks: TaskWithAttemptStatus[];
};

export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: 'To Do', color: 'status-init' },
  inprogress: { label: 'In Progress', color: 'status-running' },
  inreview: { label: 'In Review', color: 'warning' },
  done: { label: 'Done', color: 'status-complete' },
  cancelled: { label: 'Cancelled', color: 'muted' },
};
