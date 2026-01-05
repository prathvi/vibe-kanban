ALTER TABLE projects ADD COLUMN gitlab_project_url TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN gitlab_token TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN gitlab_sync_enabled INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN gitlab_sync_labels TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN gitlab_last_sync_at TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_gitlab_sync ON projects(gitlab_sync_enabled) WHERE gitlab_sync_enabled = 1;
