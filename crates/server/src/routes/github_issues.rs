use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    project::Project,
    task::{CreateTask, Task, TaskStatus, TaskWithAttemptStatus},
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::github_issues::{GitHubIssue, GitHubIssuesService, ListIssuesParams};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct ListIssuesQuery {
    pub state: Option<String>,
    pub labels: Option<String>,
    pub page: Option<i32>,
    pub per_page: Option<i32>,
}

#[derive(Debug, Serialize, TS)]
pub struct GitHubIssuesResponse {
    pub issues: Vec<GitHubIssue>,
    pub has_github_config: bool,
}

#[derive(Debug, Deserialize, TS)]
pub struct ImportIssueRequest {
    pub issue_number: i64,
    pub auto_start: Option<bool>,
}

#[derive(Debug, Serialize, TS)]
pub struct ImportIssueResponse {
    pub task: Task,
    pub issue: GitHubIssue,
}

#[derive(Debug, Serialize, TS)]
pub struct GitHubConfigStatus {
    pub has_repo_url: bool,
    pub has_token: bool,
    pub repo_url: Option<String>,
    pub sync_enabled: bool,
    pub sync_labels: Option<String>,
}

pub async fn get_github_config_status(
    Extension(project): Extension<Project>,
) -> Result<ResponseJson<ApiResponse<GitHubConfigStatus>>, ApiError> {
    let status = GitHubConfigStatus {
        has_repo_url: project.github_repo_url.is_some(),
        has_token: project.github_token.is_some(),
        repo_url: project.github_repo_url.clone(),
        sync_enabled: project.github_sync_enabled,
        sync_labels: project.github_sync_labels.clone(),
    };
    Ok(ResponseJson(ApiResponse::success(status)))
}

pub async fn list_github_issues(
    Extension(project): Extension<Project>,
    Query(query): Query<ListIssuesQuery>,
) -> Result<ResponseJson<ApiResponse<GitHubIssuesResponse>>, ApiError> {
    let (repo_url, token) = match (&project.github_repo_url, &project.github_token) {
        (Some(url), Some(tok)) => (url.clone(), tok.clone()),
        _ => {
            return Ok(ResponseJson(ApiResponse::success(GitHubIssuesResponse {
                issues: vec![],
                has_github_config: false,
            })));
        }
    };

    let (owner, repo) = GitHubIssuesService::parse_repo_url(&repo_url)
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let service = GitHubIssuesService::new();
    let params = ListIssuesParams {
        state: query.state.or(Some("open".to_string())),
        labels: query.labels.or(project.github_sync_labels.clone()),
        sort: Some("updated".to_string()),
        direction: Some("desc".to_string()),
        per_page: query.per_page.or(Some(30)),
        page: query.page.or(Some(1)),
    };

    let issues = service
        .list_issues(&token, &owner, &repo, &params)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    Ok(ResponseJson(ApiResponse::success(GitHubIssuesResponse {
        issues,
        has_github_config: true,
    })))
}

pub async fn import_github_issue(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<ImportIssueRequest>,
) -> Result<ResponseJson<ApiResponse<ImportIssueResponse>>, ApiError> {
    let (repo_url, token) = match (&project.github_repo_url, &project.github_token) {
        (Some(url), Some(tok)) => (url.clone(), tok.clone()),
        _ => {
            return Err(ApiError::BadRequest(
                "GitHub configuration not set for this project".to_string(),
            ));
        }
    };

    let (owner, repo) = GitHubIssuesService::parse_repo_url(&repo_url)
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let service = GitHubIssuesService::new();
    let issue = service
        .get_issue(&token, &owner, &repo, payload.issue_number)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let description = format!(
        "Imported from GitHub Issue #{}\n{}\n\n{}",
        issue.number,
        issue.html_url,
        issue.body.clone().unwrap_or_default()
    );

    let create_task = CreateTask {
        project_id: project.id,
        title: issue.title.clone(),
        description: Some(description),
        status: Some(TaskStatus::Todo),
        execution_mode: None,
        parent_workspace_id: None,
        image_ids: None,
        shared_task_id: None,
    };

    let task_id = Uuid::new_v4();
    let task = Task::create(&deployment.db().pool, &create_task, task_id).await?;

    deployment
        .track_if_analytics_allowed(
            "github_issue_imported",
            serde_json::json!({
                "project_id": project.id.to_string(),
                "issue_number": issue.number,
                "task_id": task.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(ImportIssueResponse {
        task,
        issue,
    })))
}

pub async fn sync_github_issues(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ImportIssueResponse>>>, ApiError> {
    let (repo_url, token) = match (&project.github_repo_url, &project.github_token) {
        (Some(url), Some(tok)) => (url.clone(), tok.clone()),
        _ => {
            return Err(ApiError::BadRequest(
                "GitHub configuration not set for this project".to_string(),
            ));
        }
    };

    let (owner, repo) = GitHubIssuesService::parse_repo_url(&repo_url)
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let service = GitHubIssuesService::new();
    let params = ListIssuesParams {
        state: Some("open".to_string()),
        labels: project.github_sync_labels.clone(),
        sort: Some("updated".to_string()),
        direction: Some("desc".to_string()),
        per_page: Some(100),
        page: Some(1),
    };

    let issues = service
        .list_issues(&token, &owner, &repo, &params)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let existing_tasks =
        Task::find_by_project_id_with_attempt_status(&deployment.db().pool, project.id).await?;
    let existing_issue_numbers: Vec<i64> = existing_tasks
        .iter()
        .filter_map(|t| {
            t.description.as_ref().and_then(|d| {
                if d.starts_with("Imported from GitHub Issue #") {
                    d.lines().next().and_then(|line| {
                        line.strip_prefix("Imported from GitHub Issue #")
                            .and_then(|s| s.parse::<i64>().ok())
                    })
                } else {
                    None
                }
            })
        })
        .collect();

    let mut imported = Vec::new();

    for issue in issues {
        if existing_issue_numbers.contains(&issue.number) {
            continue;
        }

        let description = format!(
            "Imported from GitHub Issue #{}\n{}\n\n{}",
            issue.number,
            issue.html_url,
            issue.body.clone().unwrap_or_default()
        );

        let create_task = CreateTask {
            project_id: project.id,
            title: issue.title.clone(),
            description: Some(description),
            status: Some(TaskStatus::Todo),
            execution_mode: None,
            parent_workspace_id: None,
            image_ids: None,
            shared_task_id: None,
        };

        let task_id = Uuid::new_v4();
        let task = Task::create(&deployment.db().pool, &create_task, task_id).await?;
        imported.push(ImportIssueResponse { task, issue });
    }

    Project::update_github_last_sync(&deployment.db().pool, project.id).await?;

    deployment
        .track_if_analytics_allowed(
            "github_issues_synced",
            serde_json::json!({
                "project_id": project.id.to_string(),
                "imported_count": imported.len(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(imported)))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/github/config", get(get_github_config_status))
        .route("/github/issues", get(list_github_issues))
        .route("/github/issues/import", post(import_github_issue))
        .route("/github/issues/sync", post(sync_github_issues))
}
