use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{project::Project, task::{CreateTask, Task, TaskStatus}};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::gitlab_issues::{GitLabIssue, GitLabIssuesService, ListGitLabIssuesParams};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct ListGitLabIssuesQuery {
    pub state: Option<String>,
    pub labels: Option<String>,
    pub page: Option<i32>,
    pub per_page: Option<i32>,
}

#[derive(Debug, Serialize, TS)]
pub struct GitLabIssuesResponse {
    pub issues: Vec<GitLabIssue>,
    pub has_gitlab_config: bool,
}

#[derive(Debug, Deserialize, TS)]
pub struct ImportGitLabIssueRequest {
    pub issue_iid: i64,
    pub auto_start: Option<bool>,
}

#[derive(Debug, Serialize, TS)]
pub struct ImportGitLabIssueResponse {
    pub task: Task,
    pub issue: GitLabIssue,
}

#[derive(Debug, Serialize, TS)]
pub struct GitLabConfigStatus {
    pub has_project_url: bool,
    pub has_token: bool,
    pub project_url: Option<String>,
    pub sync_enabled: bool,
    pub sync_labels: Option<String>,
}

pub async fn get_gitlab_config_status(
    Extension(project): Extension<Project>,
) -> Result<ResponseJson<ApiResponse<GitLabConfigStatus>>, ApiError> {
    let status = GitLabConfigStatus {
        has_project_url: project.gitlab_project_url.is_some(),
        has_token: project.gitlab_token.is_some(),
        project_url: project.gitlab_project_url.clone(),
        sync_enabled: project.gitlab_sync_enabled,
        sync_labels: project.gitlab_sync_labels.clone(),
    };
    Ok(ResponseJson(ApiResponse::success(status)))
}

pub async fn list_gitlab_issues(
    Extension(project): Extension<Project>,
    Query(query): Query<ListGitLabIssuesQuery>,
) -> Result<ResponseJson<ApiResponse<GitLabIssuesResponse>>, ApiError> {
    let (project_url, token) = match (&project.gitlab_project_url, &project.gitlab_token) {
        (Some(url), Some(tok)) => (url.clone(), tok.clone()),
        _ => {
            return Ok(ResponseJson(ApiResponse::success(GitLabIssuesResponse {
                issues: vec![],
                has_gitlab_config: false,
            })));
        }
    };

    let project_path = GitLabIssuesService::parse_project_url(&project_url)
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let service = GitLabIssuesService::new();
    let params = ListGitLabIssuesParams {
        state: query.state.or(Some("opened".to_string())),
        labels: query.labels.or(project.gitlab_sync_labels.clone()),
        sort: Some("desc".to_string()),
        order_by: Some("updated_at".to_string()),
        per_page: query.per_page.or(Some(30)),
        page: query.page.or(Some(1)),
    };

    let issues = service
        .list_issues(&token, &project_path, &params)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    Ok(ResponseJson(ApiResponse::success(GitLabIssuesResponse {
        issues,
        has_gitlab_config: true,
    })))
}

pub async fn import_gitlab_issue(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<ImportGitLabIssueRequest>,
) -> Result<ResponseJson<ApiResponse<ImportGitLabIssueResponse>>, ApiError> {
    let (project_url, token) = match (&project.gitlab_project_url, &project.gitlab_token) {
        (Some(url), Some(tok)) => (url.clone(), tok.clone()),
        _ => {
            return Err(ApiError::BadRequest(
                "GitLab configuration not set for this project".to_string(),
            ));
        }
    };

    let project_path = GitLabIssuesService::parse_project_url(&project_url)
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let service = GitLabIssuesService::new();
    let issue = service
        .get_issue(&token, &project_path, payload.issue_iid)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let description = format!(
        "Imported from GitLab Issue #{}\n{}\n\n{}",
        issue.iid,
        issue.web_url,
        issue.description.clone().unwrap_or_default()
    );

    let create_task = CreateTask {
        project_id: project.id,
        title: issue.title.clone(),
        description: Some(description),
        status: Some(TaskStatus::Todo),
        parent_workspace_id: None,
        image_ids: None,
        shared_task_id: None,
    };

    let task_id = Uuid::new_v4();
    let task = Task::create(&deployment.db().pool, &create_task, task_id).await?;

    deployment
        .track_if_analytics_allowed(
            "gitlab_issue_imported",
            serde_json::json!({
                "project_id": project.id.to_string(),
                "issue_iid": issue.iid,
                "task_id": task.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(ImportGitLabIssueResponse {
        task,
        issue,
    })))
}

pub async fn sync_gitlab_issues(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ImportGitLabIssueResponse>>>, ApiError> {
    let (project_url, token) = match (&project.gitlab_project_url, &project.gitlab_token) {
        (Some(url), Some(tok)) => (url.clone(), tok.clone()),
        _ => {
            return Err(ApiError::BadRequest(
                "GitLab configuration not set for this project".to_string(),
            ));
        }
    };

    let project_path = GitLabIssuesService::parse_project_url(&project_url)
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let service = GitLabIssuesService::new();
    let params = ListGitLabIssuesParams {
        state: Some("opened".to_string()),
        labels: project.gitlab_sync_labels.clone(),
        sort: Some("desc".to_string()),
        order_by: Some("updated_at".to_string()),
        per_page: Some(100),
        page: Some(1),
    };

    let issues = service
        .list_issues(&token, &project_path, &params)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let existing_tasks = Task::find_by_project_id_with_attempt_status(&deployment.db().pool, project.id).await?;
    let existing_issue_iids: Vec<i64> = existing_tasks
        .iter()
        .filter_map(|t| {
            t.description.as_ref().and_then(|d| {
                if d.starts_with("Imported from GitLab Issue #") {
                    d.lines()
                        .next()
                        .and_then(|line| {
                            line.strip_prefix("Imported from GitLab Issue #")
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
        if existing_issue_iids.contains(&issue.iid) {
            continue;
        }

        let description = format!(
            "Imported from GitLab Issue #{}\n{}\n\n{}",
            issue.iid,
            issue.web_url,
            issue.description.clone().unwrap_or_default()
        );

        let create_task = CreateTask {
            project_id: project.id,
            title: issue.title.clone(),
            description: Some(description),
            status: Some(TaskStatus::Todo),
            parent_workspace_id: None,
            image_ids: None,
            shared_task_id: None,
        };

        let task_id = Uuid::new_v4();
        let task = Task::create(&deployment.db().pool, &create_task, task_id).await?;
        imported.push(ImportGitLabIssueResponse {
            task,
            issue,
        });
    }

    Project::update_gitlab_last_sync(&deployment.db().pool, project.id).await?;

    deployment
        .track_if_analytics_allowed(
            "gitlab_issues_synced",
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
        .route("/gitlab/config", get(get_gitlab_config_status))
        .route("/gitlab/issues", get(list_gitlab_issues))
        .route("/gitlab/issues/import", post(import_gitlab_issue))
        .route("/gitlab/issues/sync", post(sync_gitlab_issues))
}
