# Sequential Task Execution Mode - Implementation Progress

## Overview
This document tracks the implementation progress of the sequential task execution mode feature, which allows tasks to run one after another without creating git worktrees. Sequential tasks work directly on the main repository via symlinks, with proper branch management and commit tracking.

## Implementation Status: ✅ COMPLETE

All planned features have been implemented.

---

## Completed Features

### 1. Database Schema Changes ✅
- [x] Created migration `20260107000000_add_sequential_execution_mode.sql`
- [x] Added `execution_mode` column (TEXT, default 'parallel')
- [x] Added `queue_position` column (INTEGER, nullable)
- [x] Created index for efficient sequential queue queries

**File:** `crates/db/migrations/20260107000000_add_sequential_execution_mode.sql`

### 2. Backend Model Changes ✅
- [x] Added `ExecutionMode` enum (Parallel/Sequential)
- [x] Added `execution_mode` and `queue_position` fields to `Task` struct
- [x] Updated `CreateTask` struct with `execution_mode` field
- [x] Updated `UpdateTask` struct with `execution_mode` field
- [x] Updated all SQL queries to include new columns

**File:** `crates/db/src/models/task.rs`

### 3. Queue Management Methods ✅
- [x] `find_sequential_queue_for_project()` - Get all sequential tasks ordered by position
- [x] `get_next_in_queue()` - Get next pending task in queue
- [x] `has_running_sequential_task()` - Check if a sequential task is running
- [x] `update_execution_mode()` - Update task's execution mode
- [x] `update_queue_position()` - Update task's position in queue
- [x] `add_to_queue()` - Add task to sequential queue (assigns position)
- [x] `remove_from_queue()` - Remove task from queue (sets to parallel)

**File:** `crates/db/src/models/task.rs`

### 4. API Endpoint Updates ✅
- [x] Updated task update endpoint to handle `execution_mode` changes
- [x] Automatic queue position management when moving to/from sequential mode
- [x] Re-fetch task after execution mode update to return current state
- [x] `POST /tasks/{task_id}/reorder-queue` - Update queue position
- [x] `GET /tasks/queue?project_id=...` - Get sequential queue for project

**File:** `crates/server/src/routes/tasks.rs`

### 5. TypeScript Type Generation ✅
- [x] Added `ExecutionMode` to type exports
- [x] Updated `Task`, `CreateTask`, `UpdateTask` types with new fields
- [x] Generated `shared/types.ts` with new types

**Files:**
- `crates/server/src/bin/generate_types.rs`
- `shared/types.ts`

### 6. Frontend Queue Column ✅
- [x] Added `KanbanColumnStatus` type (extends TaskStatus with 'queue')
- [x] Added 'Queue' to status labels and colors (violet theme)
- [x] Updated `TASK_STATUSES` to include 'queue' as first column
- [x] Modified `kanbanColumns` to filter sequential tasks into queue
- [x] Queue column sorted by `queue_position`
- [x] Added `left` prop support to `TaskCardHeader`
- [x] Added queue position badge on task cards in queue column

**Files:**
- `frontend/src/utils/statusLabels.ts`
- `frontend/src/pages/ProjectTasks.tsx`
- `frontend/src/components/tasks/TaskKanbanBoard.tsx`
- `frontend/src/components/tasks/TaskCard.tsx`
- `frontend/src/components/tasks/TaskCardHeader.tsx`

### 7. Drag-and-Drop Support ✅
- [x] Updated `handleDragEnd` to detect queue column movements
- [x] Dragging to Queue sets `execution_mode: 'sequential'`
- [x] Dragging from Queue sets `execution_mode: 'parallel'`
- [x] Proper status mapping (Queue -> 'todo' status)
- [x] Drag-to-reorder within queue column updates `queue_position`

**Files:**
- `frontend/src/pages/ProjectTasks.tsx`
- `frontend/src/lib/api.ts` (reorderQueue method)

### 8. Execution Mode Toggle in Task Creation ✅
- [x] Added UI toggle (Parallel/Sequential) in task creation dialog
- [x] When Sequential selected, task goes directly to queue
- [x] Sequential tasks skip auto-start (they queue instead)
- [x] Violet-themed "Queue" switch in dialog

**File:** `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx`

### 9. Skip Worktree Creation for Sequential Mode ✅
- [x] Modified `container.rs` to check task's `execution_mode`
- [x] For sequential tasks, use main repo path instead of worktree (via symlinks)
- [x] Created `create_sequential()` method in LocalContainerService
- [x] Ensure branches are properly managed without worktrees
- [x] Added `create_branch()` and `checkout_branch()` methods to GitService

**Files:**
- `crates/local-deployment/src/container.rs`
- `crates/services/src/services/git.rs`

### 10. Sequential Queue Processing Service ✅
- [x] Created `SequentialQueueService` for queue management
- [x] Auto-notification when next task is ready after completion
- [x] Handle task failures in queue
- [x] Queue reordering methods

**Files:**
- `crates/services/src/services/sequential_queue.rs` (new)
- `crates/services/src/services/mod.rs`
- `crates/local-deployment/src/container.rs` (try_start_next_sequential_task)

### 11. Sequential Task Commit & Branch Management ✅
- [x] Commits tracked via existing `execution_process_repo_states` table
- [x] After sequential task completes, changes are committed (existing `try_commit_changes`)
- [x] Task branch merged back to target branch after completion
- [x] `merge_sequential_task_branch()` - fast-forward or regular merge
- [x] Next sequential task starts with previous task's changes

**Files:**
- `crates/local-deployment/src/container.rs` (merge_sequential_task_branch)

---

## How It Works

### Task Lifecycle with Sequential Mode

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEQUENTIAL TASK FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CREATE TASK (with Queue toggle ON)                          │
│     └─> execution_mode = 'sequential'                           │
│     └─> queue_position = max + 1                                │
│     └─> Appears in Queue column                                 │
│                                                                 │
│  2. START TASK                                                  │
│     └─> create_sequential() called                              │
│     └─> Creates symlinks to main repo                           │
│     └─> Creates branch from target (e.g., main)                 │
│     └─> Checkouts task branch                                   │
│                                                                 │
│  3. TASK EXECUTION                                              │
│     └─> Agent works on task branch                              │
│     └─> Changes committed to task branch                        │
│     └─> Commits tracked in execution_process_repo_states        │
│                                                                 │
│  4. TASK COMPLETION                                             │
│     └─> try_commit_changes() commits final changes              │
│     └─> merge_sequential_task_branch() merges to target         │
│     └─> try_start_next_sequential_task() notifies next ready    │
│                                                                 │
│  5. NEXT TASK                                                   │
│     └─> Starts from updated target branch                       │
│     └─> Has all previous tasks' changes                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Queue Column Behavior

- Only tasks with `execution_mode: 'sequential'` and `status: 'todo'` appear in Queue
- Tasks are sorted by `queue_position` (ascending)
- Each task shows its queue position as a badge (violet circle)
- Tasks can be reordered by dragging within the queue
- Dragging out of queue sets `execution_mode: 'parallel'`

### Branch Management

```
main ─────┬────────────────┬────────────────┬─────> (updated main)
          │                │                │
          └─ task-1 ──────>│ (merge)        │
                           │                │
                           └─ task-2 ──────>│ (merge)
                                            │
                                            └─ task-3 ───> (in progress)
```

### Commit Tracking

Each execution is tracked in `execution_process_repo_states`:
- `before_head_commit` - SHA before task execution
- `after_head_commit` - SHA after task commits
- `merge_commit` - SHA of merge commit (if applicable)

---

## Testing Checklist

### Basic Queue Operations
- [ ] Create new task with "Queue" toggle OFF - appears in 'To Do'
- [ ] Create new task with "Queue" toggle ON - appears in 'Queue'
- [ ] Drag task from 'To Do' to 'Queue' - verify execution_mode changes
- [ ] Drag task from 'Queue' to 'In Progress' - verify execution_mode changes back
- [ ] Verify queue position badges display correctly
- [ ] Verify queue is sorted by position

### Reordering
- [ ] Drag task within queue to reorder
- [ ] Verify queue positions update correctly
- [ ] Verify API call to reorder-queue endpoint

### Sequential Execution
- [ ] Start a sequential task - verify no worktree created
- [ ] Verify task branch created from target branch
- [ ] Complete sequential task - verify changes committed
- [ ] Verify task branch merged to target
- [ ] Start next sequential task - verify it has previous task's changes

### Edge Cases
- [ ] Test search filtering includes queue tasks
- [ ] Test keyboard navigation includes queue column
- [ ] Test merge conflicts during branch merge

---

## Related Files Summary

### Backend
| File | Changes |
|------|---------|
| `crates/db/migrations/20260107000000_add_sequential_execution_mode.sql` | New migration |
| `crates/db/src/models/task.rs` | ExecutionMode enum, queue methods |
| `crates/server/src/routes/tasks.rs` | Execution mode handling, reorder-queue endpoint |
| `crates/server/src/routes/github_issues.rs` | Added execution_mode to CreateTask |
| `crates/server/src/routes/gitlab_issues.rs` | Added execution_mode to CreateTask |
| `crates/server/src/mcp/task_server.rs` | Added execution_mode to UpdateTask |
| `crates/server/src/bin/generate_types.rs` | Export ExecutionMode type |
| `crates/local-deployment/src/container.rs` | Sequential workspace, branch merge, queue processing |
| `crates/services/src/services/git.rs` | Added create_branch, checkout_branch methods |
| `crates/services/src/services/sequential_queue.rs` | New SequentialQueueService |
| `crates/services/src/services/mod.rs` | Added sequential_queue module |

### Frontend
| File | Changes |
|------|---------|
| `frontend/src/utils/statusLabels.ts` | KanbanColumnStatus type, queue labels |
| `frontend/src/pages/ProjectTasks.tsx` | Queue column logic, drag handling, reordering |
| `frontend/src/components/tasks/TaskKanbanBoard.tsx` | Queue column rendering |
| `frontend/src/components/tasks/TaskCard.tsx` | Queue position badge |
| `frontend/src/components/tasks/TaskCardHeader.tsx` | Left slot support |
| `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx` | Execution mode toggle, queue switch UI |
| `frontend/src/components/tasks/TaskDetails/preview/NoServerContent.tsx` | execution_mode in forms |
| `frontend/src/lib/api.ts` | Added reorderQueue method |

### Generated
| File | Changes |
|------|---------|
| `shared/types.ts` | ExecutionMode type, updated Task types |
| `.sqlx/` | Updated query cache |
