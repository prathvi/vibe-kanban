-- Add execution mode and queue position to tasks table
-- execution_mode: 'parallel' (default) or 'sequential'
-- queue_position: ordering for sequential tasks (NULL for parallel tasks)

ALTER TABLE tasks ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'parallel' CHECK (execution_mode IN ('parallel', 'sequential'));
ALTER TABLE tasks ADD COLUMN queue_position INTEGER;

-- Index for efficient queue queries
CREATE INDEX idx_tasks_sequential_queue ON tasks (project_id, execution_mode, queue_position)
  WHERE execution_mode = 'sequential';
