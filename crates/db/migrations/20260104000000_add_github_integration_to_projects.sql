-- Add GitHub integration fields to projects table
ALTER TABLE projects ADD COLUMN github_repo_url TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN github_token TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN github_sync_enabled INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN github_sync_labels TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN github_last_sync_at TEXT DEFAULT NULL;

-- Create index for sync queries
CREATE INDEX IF NOT EXISTS idx_projects_github_sync ON projects(github_sync_enabled) WHERE github_sync_enabled = 1;
