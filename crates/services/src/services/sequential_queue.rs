//! Sequential Queue Service
//!
//! Manages the sequential task queue, ensuring tasks run one at a time
//! and automatically starting the next task when the current one completes.

use db::{
    DBService,
    models::task::{ExecutionMode, Task, TaskStatus},
};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum SequentialQueueError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Task not found: {0}")]
    TaskNotFound(Uuid),
    #[error("Task is not in sequential mode")]
    NotSequentialMode,
}

/// Service for managing the sequential task queue
#[derive(Clone)]
pub struct SequentialQueueService {
    db: DBService,
}

impl SequentialQueueService {
    pub fn new(db: DBService) -> Self {
        Self { db }
    }

    /// Get all tasks in the sequential queue for a project, ordered by position
    pub async fn get_queue(&self, project_id: Uuid) -> Result<Vec<Task>, SequentialQueueError> {
        let tasks = Task::find_sequential_queue_for_project(&self.db.pool, project_id).await?;
        Ok(tasks)
    }

    /// Get the next pending task in the queue for a project
    pub async fn get_next_pending(
        &self,
        project_id: Uuid,
    ) -> Result<Option<Task>, SequentialQueueError> {
        let task = Task::get_next_in_queue(&self.db.pool, project_id).await?;
        Ok(task)
    }

    /// Check if there's a running sequential task in the project
    pub async fn has_running_task(&self, project_id: Uuid) -> Result<bool, SequentialQueueError> {
        let has_running = Task::has_running_sequential_task(&self.db.pool, project_id).await?;
        Ok(has_running)
    }

    /// Add a task to the sequential queue
    pub async fn enqueue(
        &self,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<(), SequentialQueueError> {
        Task::add_to_queue(&self.db.pool, task_id, project_id).await?;
        Ok(())
    }

    /// Remove a task from the sequential queue (move to parallel mode)
    pub async fn dequeue(&self, task_id: Uuid) -> Result<(), SequentialQueueError> {
        Task::remove_from_queue(&self.db.pool, task_id).await?;
        Ok(())
    }

    /// Update a task's position in the queue
    pub async fn update_position(
        &self,
        task_id: Uuid,
        new_position: i32,
    ) -> Result<(), SequentialQueueError> {
        Task::update_queue_position(&self.db.pool, task_id, Some(new_position)).await?;
        Ok(())
    }

    /// Reorder tasks in the queue by moving a task to a new position
    /// This shifts other tasks as needed
    pub async fn reorder(
        &self,
        project_id: Uuid,
        task_id: Uuid,
        new_position: i32,
    ) -> Result<(), SequentialQueueError> {
        // Get the current task
        let task = Task::find_by_id(&self.db.pool, task_id)
            .await?
            .ok_or(SequentialQueueError::TaskNotFound(task_id))?;

        if task.execution_mode != ExecutionMode::Sequential {
            return Err(SequentialQueueError::NotSequentialMode);
        }

        let current_position = task.queue_position.unwrap_or(0);
        if current_position == new_position {
            return Ok(()); // No change needed
        }

        // Get all tasks in the queue
        let mut queue = Task::find_sequential_queue_for_project(&self.db.pool, project_id).await?;

        // Remove the task being moved
        queue.retain(|t| t.id != task_id);

        // Insert at new position (clamped to valid range)
        let insert_pos = (new_position as usize).min(queue.len());

        // Update positions for all tasks
        for (idx, t) in queue.iter().enumerate() {
            let pos = if idx < insert_pos {
                idx as i32 + 1
            } else {
                idx as i32 + 2
            };
            Task::update_queue_position(&self.db.pool, t.id, Some(pos)).await?;
        }

        // Set the moved task's position
        Task::update_queue_position(&self.db.pool, task_id, Some(new_position)).await?;

        Ok(())
    }

    /// Check if a sequential task just completed and start the next one if available
    /// Returns the next task if one was started, None otherwise
    pub async fn process_queue_after_completion(
        &self,
        completed_task: &Task,
    ) -> Result<Option<Task>, SequentialQueueError> {
        // Only process if the task was sequential
        if completed_task.execution_mode != ExecutionMode::Sequential {
            return Ok(None);
        }

        // Only process if task is now done or cancelled
        if !matches!(
            completed_task.status,
            TaskStatus::Done | TaskStatus::Cancelled | TaskStatus::InReview
        ) {
            return Ok(None);
        }

        // Check if there's another running sequential task
        if self.has_running_task(completed_task.project_id).await? {
            tracing::debug!(
                "Sequential task {} completed but another sequential task is still running",
                completed_task.id
            );
            return Ok(None);
        }

        // Get the next pending task in the queue
        let next_task = self.get_next_pending(completed_task.project_id).await?;

        if let Some(ref task) = next_task {
            tracing::info!(
                "Sequential task {} completed, next task in queue: {} (position: {:?})",
                completed_task.id,
                task.id,
                task.queue_position
            );
        }

        Ok(next_task)
    }
}
