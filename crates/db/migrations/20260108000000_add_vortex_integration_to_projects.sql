-- Add Vortex integration fields to projects table
ALTER TABLE projects ADD COLUMN vortex_api_url TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN vortex_project_id TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN vortex_token TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN vortex_sync_enabled INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN vortex_sync_labels TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN vortex_last_sync_at TEXT DEFAULT NULL;

-- Create index for sync queries
CREATE INDEX IF NOT EXISTS idx_projects_vortex_sync ON projects(vortex_sync_enabled) WHERE vortex_sync_enabled = 1;
