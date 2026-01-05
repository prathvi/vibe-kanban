use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::project_repo::CreateProjectRepo;

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Project not found")]
    ProjectNotFound,
    #[error("Failed to create project: {0}")]
    CreateFailed(String),
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub dev_script: Option<String>,
    pub dev_script_working_dir: Option<String>,
    pub default_agent_working_dir: Option<String>,
    pub remote_project_id: Option<Uuid>,
    pub github_repo_url: Option<String>,
    #[serde(skip_serializing)]
    #[ts(skip)]
    pub github_token: Option<String>,
    pub github_sync_enabled: bool,
    pub github_sync_labels: Option<String>,
    #[ts(type = "string | null")]
    pub github_last_sync_at: Option<DateTime<Utc>>,
    pub gitlab_project_url: Option<String>,
    #[serde(skip_serializing)]
    #[ts(skip)]
    pub gitlab_token: Option<String>,
    pub gitlab_sync_enabled: bool,
    pub gitlab_sync_labels: Option<String>,
    #[ts(type = "string | null")]
    pub gitlab_last_sync_at: Option<DateTime<Utc>>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProject {
    pub name: String,
    pub repositories: Vec<CreateProjectRepo>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub dev_script: Option<String>,
    pub dev_script_working_dir: Option<String>,
    pub default_agent_working_dir: Option<String>,
    pub github_repo_url: Option<String>,
    pub github_token: Option<String>,
    pub github_sync_enabled: Option<bool>,
    pub github_sync_labels: Option<String>,
    pub gitlab_project_url: Option<String>,
    pub gitlab_token: Option<String>,
    pub gitlab_sync_enabled: Option<bool>,
    pub gitlab_sync_labels: Option<String>,
}

#[derive(Debug, Serialize, TS)]
pub struct SearchResult {
    pub path: String,
    pub is_file: bool,
    pub match_type: SearchMatchType,
}

#[derive(Debug, Clone, Serialize, TS)]
pub enum SearchMatchType {
    FileName,
    DirectoryName,
    FullPath,
}

impl Project {
    pub async fn count(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar!(r#"SELECT COUNT(*) as "count!: i64" FROM projects"#)
            .fetch_one(pool)
            .await
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      github_repo_url,
                      github_token,
                      github_sync_enabled as "github_sync_enabled!: bool",
                      github_sync_labels,
                      github_last_sync_at as "github_last_sync_at: DateTime<Utc>",
                      gitlab_project_url,
                      gitlab_token,
                      gitlab_sync_enabled as "gitlab_sync_enabled!: bool",
                      gitlab_sync_labels,
                      gitlab_last_sync_at as "gitlab_last_sync_at: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_most_active(pool: &SqlitePool, limit: i32) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"
            SELECT p.id as "id!: Uuid", p.name, p.dev_script, p.dev_script_working_dir,
                   p.default_agent_working_dir,
                   p.remote_project_id as "remote_project_id: Uuid",
                   p.github_repo_url,
                   p.github_token,
                   p.github_sync_enabled as "github_sync_enabled!: bool",
                   p.github_sync_labels,
                   p.github_last_sync_at as "github_last_sync_at: DateTime<Utc>",
                   p.gitlab_project_url,
                   p.gitlab_token,
                   p.gitlab_sync_enabled as "gitlab_sync_enabled!: bool",
                   p.gitlab_sync_labels,
                   p.gitlab_last_sync_at as "gitlab_last_sync_at: DateTime<Utc>",
                   p.created_at as "created_at!: DateTime<Utc>", p.updated_at as "updated_at!: DateTime<Utc>"
            FROM projects p
            WHERE p.id IN (
                SELECT DISTINCT t.project_id
                FROM tasks t
                INNER JOIN workspaces w ON w.task_id = t.id
                ORDER BY w.updated_at DESC
            )
            LIMIT $1
            "#,
            limit
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      github_repo_url,
                      github_token,
                      github_sync_enabled as "github_sync_enabled!: bool",
                      github_sync_labels,
                      github_last_sync_at as "github_last_sync_at: DateTime<Utc>",
                      gitlab_project_url,
                      gitlab_token,
                      gitlab_sync_enabled as "gitlab_sync_enabled!: bool",
                      gitlab_sync_labels,
                      gitlab_last_sync_at as "gitlab_last_sync_at: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      github_repo_url,
                      github_token,
                      github_sync_enabled as "github_sync_enabled!: bool",
                      github_sync_labels,
                      github_last_sync_at as "github_last_sync_at: DateTime<Utc>",
                      gitlab_project_url,
                      gitlab_token,
                      gitlab_sync_enabled as "gitlab_sync_enabled!: bool",
                      gitlab_sync_labels,
                      gitlab_last_sync_at as "gitlab_last_sync_at: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE rowid = $1"#,
            rowid
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_remote_project_id(
        pool: &SqlitePool,
        remote_project_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      github_repo_url,
                      github_token,
                      github_sync_enabled as "github_sync_enabled!: bool",
                      github_sync_labels,
                      github_last_sync_at as "github_last_sync_at: DateTime<Utc>",
                      gitlab_project_url,
                      gitlab_token,
                      gitlab_sync_enabled as "gitlab_sync_enabled!: bool",
                      gitlab_sync_labels,
                      gitlab_last_sync_at as "gitlab_last_sync_at: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE remote_project_id = $1
               LIMIT 1"#,
            remote_project_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        executor: impl Executor<'_, Database = Sqlite>,
        data: &CreateProject,
        project_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"INSERT INTO projects (
                    id,
                    name
                ) VALUES (
                    $1, $2
                )
                RETURNING id as "id!: Uuid",
                          name,
                          dev_script,
                          dev_script_working_dir,
                          default_agent_working_dir,
                          remote_project_id as "remote_project_id: Uuid",
                          github_repo_url,
                          github_token,
                          github_sync_enabled as "github_sync_enabled!: bool",
                          github_sync_labels,
                          github_last_sync_at as "github_last_sync_at: DateTime<Utc>",
                          gitlab_project_url,
                          gitlab_token,
                          gitlab_sync_enabled as "gitlab_sync_enabled!: bool",
                          gitlab_sync_labels,
                          gitlab_last_sync_at as "gitlab_last_sync_at: DateTime<Utc>",
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>""#,
            project_id,
            data.name,
        )
        .fetch_one(executor)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        payload: &UpdateProject,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let name = payload.name.clone().unwrap_or(existing.name);
        let dev_script = payload.dev_script.clone();
        let dev_script_working_dir = payload.dev_script_working_dir.clone();
        let default_agent_working_dir = payload.default_agent_working_dir.clone();
        let github_repo_url = payload.github_repo_url.clone()
            .filter(|s| !s.is_empty())
            .or(existing.github_repo_url);
        let github_token = payload.github_token.clone()
            .filter(|s| !s.is_empty())
            .or(existing.github_token);
        let github_sync_enabled = payload.github_sync_enabled.unwrap_or(existing.github_sync_enabled);
        let github_sync_labels = payload.github_sync_labels.clone()
            .filter(|s| !s.is_empty())
            .or(existing.github_sync_labels);
        let gitlab_project_url = payload.gitlab_project_url.clone()
            .filter(|s| !s.is_empty())
            .or(existing.gitlab_project_url);
        let gitlab_token = payload.gitlab_token.clone()
            .filter(|s| !s.is_empty())
            .or(existing.gitlab_token);
        let gitlab_sync_enabled = payload.gitlab_sync_enabled.unwrap_or(existing.gitlab_sync_enabled);
        let gitlab_sync_labels = payload.gitlab_sync_labels.clone()
            .filter(|s| !s.is_empty())
            .or(existing.gitlab_sync_labels);

        sqlx::query_as!(
            Project,
            r#"UPDATE projects
               SET name = $2, dev_script = $3, dev_script_working_dir = $4, default_agent_working_dir = $5,
                   github_repo_url = $6, github_token = $7, github_sync_enabled = $8, github_sync_labels = $9,
                   gitlab_project_url = $10, gitlab_token = $11, gitlab_sync_enabled = $12, gitlab_sync_labels = $13
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         name,
                         dev_script,
                         dev_script_working_dir,
                         default_agent_working_dir,
                         remote_project_id as "remote_project_id: Uuid",
                         github_repo_url,
                         github_token,
                         github_sync_enabled as "github_sync_enabled!: bool",
                         github_sync_labels,
                         github_last_sync_at as "github_last_sync_at: DateTime<Utc>",
                         gitlab_project_url,
                         gitlab_token,
                         gitlab_sync_enabled as "gitlab_sync_enabled!: bool",
                         gitlab_sync_labels,
                         gitlab_last_sync_at as "gitlab_last_sync_at: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            dev_script,
            dev_script_working_dir,
            default_agent_working_dir,
            github_repo_url,
            github_token,
            github_sync_enabled,
            github_sync_labels,
            gitlab_project_url,
            gitlab_token,
            gitlab_sync_enabled,
            gitlab_sync_labels,
        )
        .fetch_one(pool)
        .await
    }

    pub async fn clear_default_agent_working_dir(
        pool: &SqlitePool,
        id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE projects
               SET default_agent_working_dir = ''
               WHERE id = $1"#,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn set_remote_project_id(
        pool: &SqlitePool,
        id: Uuid,
        remote_project_id: Option<Uuid>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE projects
               SET remote_project_id = $2
               WHERE id = $1"#,
            id,
            remote_project_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Transaction-compatible version of set_remote_project_id
    pub async fn set_remote_project_id_tx<'e, E>(
        executor: E,
        id: Uuid,
        remote_project_id: Option<Uuid>,
    ) -> Result<(), sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        sqlx::query!(
            r#"UPDATE projects
               SET remote_project_id = $2
               WHERE id = $1"#,
            id,
            remote_project_id
        )
        .execute(executor)
        .await?;

        Ok(())
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM projects WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn update_github_last_sync(
        pool: &SqlitePool,
        id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE projects
               SET github_last_sync_at = datetime('now')
               WHERE id = $1"#,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn find_with_github_sync_enabled(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      github_repo_url,
                      github_token,
                      github_sync_enabled as "github_sync_enabled!: bool",
                      github_sync_labels,
                      github_last_sync_at as "github_last_sync_at: DateTime<Utc>",
                      gitlab_project_url,
                      gitlab_token,
                      gitlab_sync_enabled as "gitlab_sync_enabled!: bool",
                      gitlab_sync_labels,
                      gitlab_last_sync_at as "gitlab_last_sync_at: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE github_sync_enabled = 1
                 AND github_repo_url IS NOT NULL
                 AND github_token IS NOT NULL"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn update_gitlab_last_sync(
        pool: &SqlitePool,
        id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE projects
               SET gitlab_last_sync_at = datetime('now')
               WHERE id = $1"#,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn find_with_gitlab_sync_enabled(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      github_repo_url,
                      github_token,
                      github_sync_enabled as "github_sync_enabled!: bool",
                      github_sync_labels,
                      github_last_sync_at as "github_last_sync_at: DateTime<Utc>",
                      gitlab_project_url,
                      gitlab_token,
                      gitlab_sync_enabled as "gitlab_sync_enabled!: bool",
                      gitlab_sync_labels,
                      gitlab_last_sync_at as "gitlab_last_sync_at: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE gitlab_sync_enabled = 1
                 AND gitlab_project_url IS NOT NULL
                 AND gitlab_token IS NOT NULL"#
        )
        .fetch_all(pool)
        .await
    }
}
