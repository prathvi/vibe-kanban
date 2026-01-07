use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    image::TaskImage,
    project::Project,
    task::{CreateTask, Task, TaskStatus},
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::{
    image::ImageService,
    vortex_issues::{ListVortexIssuesParams, VortexAttachment, VortexIssue, VortexIssuesService},
};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct ListVortexIssuesQuery {
    pub status: Option<String>,
    pub priority: Option<String>,
    pub page: Option<i32>,
    pub limit: Option<i32>,
}

#[derive(Debug, Serialize, TS)]
pub struct VortexIssuesResponse {
    pub issues: Vec<VortexIssue>,
    pub has_vortex_config: bool,
}

#[derive(Debug, Deserialize, TS)]
pub struct ImportVortexIssueRequest {
    pub issue_id: String,
}

#[derive(Debug, Serialize, TS)]
pub struct ImportVortexIssueResponse {
    pub task: Task,
    pub issue: VortexIssue,
}

#[derive(Debug, Serialize, TS)]
pub struct VortexConfigStatus {
    pub has_project_id: bool,
    pub has_token: bool,
    pub project_id: Option<String>,
    pub sync_enabled: bool,
    pub sync_labels: Option<String>,
}

pub async fn get_vortex_config_status(
    Extension(project): Extension<Project>,
) -> Result<ResponseJson<ApiResponse<VortexConfigStatus>>, ApiError> {
    let status = VortexConfigStatus {
        has_project_id: project.vortex_project_id.is_some(),
        has_token: project.vortex_token.is_some(),
        project_id: project.vortex_project_id.clone(),
        sync_enabled: project.vortex_sync_enabled,
        sync_labels: project.vortex_sync_labels.clone(),
    };
    Ok(ResponseJson(ApiResponse::success(status)))
}

pub async fn list_vortex_issues(
    Extension(project): Extension<Project>,
    Query(query): Query<ListVortexIssuesQuery>,
) -> Result<ResponseJson<ApiResponse<VortexIssuesResponse>>, ApiError> {
    let (vortex_project_id, token) = match (&project.vortex_project_id, &project.vortex_token) {
        (Some(pid), Some(tok)) => (pid.clone(), tok.clone()),
        _ => {
            return Ok(ResponseJson(ApiResponse::success(VortexIssuesResponse {
                issues: vec![],
                has_vortex_config: false,
            })));
        }
    };

    let service = VortexIssuesService::new();

    let params = ListVortexIssuesParams {
        status: query.status.or(Some("Open".to_string())),
        priority: query.priority,
        labels: project.vortex_sync_labels.clone(),
        page: query.page.or(Some(1)),
        limit: query.limit.or(Some(50)),
    };

    let issues = service
        .list_issues(&token, &vortex_project_id, &params)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    Ok(ResponseJson(ApiResponse::success(VortexIssuesResponse {
        issues,
        has_vortex_config: true,
    })))
}

struct ImportedImage {
    id: Uuid,
    file_path: String,
    original_name: String,
}

async fn import_vortex_attachments(
    image_service: &ImageService,
    vortex_service: &VortexIssuesService,
    token: &str,
    attachments: &[VortexAttachment],
) -> Vec<ImportedImage> {
    let mut images = Vec::new();

    for attachment in attachments {
        if !attachment.is_image {
            continue;
        }

        let download_url = match &attachment.download_url {
            Some(url) => url,
            None => continue,
        };

        match vortex_service
            .download_attachment(token, download_url)
            .await
        {
            Ok(data) => match image_service.store_image(&data, &attachment.filename).await {
                Ok(image) => {
                    tracing::debug!("Imported Vortex attachment: {}", attachment.filename);
                    images.push(ImportedImage {
                        id: image.id,
                        file_path: image.file_path,
                        original_name: attachment.filename.clone(),
                    });
                }
                Err(e) => {
                    tracing::warn!(
                        "Failed to store Vortex attachment {}: {}",
                        attachment.filename,
                        e
                    );
                }
            },
            Err(e) => {
                tracing::warn!(
                    "Failed to download Vortex attachment {}: {}",
                    attachment.filename,
                    e
                );
            }
        }
    }

    images
}

pub async fn import_vortex_issue(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<ImportVortexIssueRequest>,
) -> Result<ResponseJson<ApiResponse<ImportVortexIssueResponse>>, ApiError> {
    let token = match &project.vortex_token {
        Some(tok) => tok.clone(),
        None => {
            return Err(ApiError::BadRequest(
                "Vortex token not configured for this project".to_string(),
            ));
        }
    };

    let vortex_service = VortexIssuesService::new();

    let issue = vortex_service
        .get_issue(&token, &payload.issue_id)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let attachments = vortex_service
        .get_issue_attachments(&token, &payload.issue_id)
        .await
        .unwrap_or_default();

    let image_service = ImageService::new(deployment.db().pool.clone())?;

    let imported_images =
        import_vortex_attachments(&image_service, &vortex_service, &token, &attachments).await;

    let issue_url = format!("https://vortextask.com/issues/{}", payload.issue_id);

    let images_markdown = if !imported_images.is_empty() {
        let image_lines: Vec<String> = imported_images
            .iter()
            .map(|img| format!("![{}]({})", img.original_name, img.file_path))
            .collect();
        format!("\n\n## Attachments\n\n{}", image_lines.join("\n\n"))
    } else {
        String::new()
    };

    let description = format!(
        "Imported from Vortex Issue #{}\n{}\n\n{}{}",
        issue.key,
        issue_url,
        issue.description.clone().unwrap_or_default(),
        images_markdown
    );

    let image_ids: Vec<Uuid> = imported_images.iter().map(|img| img.id).collect();

    let create_task = CreateTask {
        project_id: project.id,
        title: issue.title.clone(),
        description: Some(description),
        status: Some(TaskStatus::Todo),
        execution_mode: None,
        parent_workspace_id: None,
        image_ids: if image_ids.is_empty() {
            None
        } else {
            Some(image_ids.clone())
        },
        shared_task_id: None,
    };

    let task_id = Uuid::new_v4();
    let task = Task::create(&deployment.db().pool, &create_task, task_id).await?;

    if !image_ids.is_empty() {
        TaskImage::associate_many_dedup(&deployment.db().pool, task.id, &image_ids).await?;
    }

    deployment
        .track_if_analytics_allowed(
            "vortex_issue_imported",
            serde_json::json!({
                "project_id": project.id.to_string(),
                "issue_key": issue.key,
                "task_id": task.id.to_string(),
                "images_imported": image_ids.len(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(
        ImportVortexIssueResponse { task, issue },
    )))
}

pub async fn sync_vortex_issues(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ImportVortexIssueResponse>>>, ApiError> {
    let (vortex_project_id, token) = match (&project.vortex_project_id, &project.vortex_token) {
        (Some(pid), Some(tok)) => (pid.clone(), tok.clone()),
        _ => {
            return Err(ApiError::BadRequest(
                "Vortex configuration not set for this project".to_string(),
            ));
        }
    };

    let vortex_service = VortexIssuesService::new();

    let params = ListVortexIssuesParams {
        status: Some("Open".to_string()),
        priority: None,
        labels: project.vortex_sync_labels.clone(),
        page: Some(1),
        limit: Some(100),
    };

    let issues = vortex_service
        .list_issues(&token, &vortex_project_id, &params)
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let existing_tasks =
        Task::find_by_project_id_with_attempt_status(&deployment.db().pool, project.id).await?;
    let existing_issue_keys: Vec<String> = existing_tasks
        .iter()
        .filter_map(|t| {
            t.description.as_ref().and_then(|d| {
                if d.starts_with("Imported from Vortex Issue #") {
                    d.lines().next().and_then(|line| {
                        line.strip_prefix("Imported from Vortex Issue #")
                            .map(|s| s.to_string())
                    })
                } else {
                    None
                }
            })
        })
        .collect();

    let image_service = ImageService::new(deployment.db().pool.clone())?;

    let mut imported = Vec::new();

    for issue in issues {
        if existing_issue_keys.contains(&issue.key) {
            continue;
        }

        let attachments = vortex_service
            .get_issue_attachments(&token, &issue.id)
            .await
            .unwrap_or_default();

        let imported_images =
            import_vortex_attachments(&image_service, &vortex_service, &token, &attachments).await;

        let issue_url = format!("https://vortextask.com/issues/{}", issue.id);

        let images_markdown = if !imported_images.is_empty() {
            let image_lines: Vec<String> = imported_images
                .iter()
                .map(|img| format!("![{}]({})", img.original_name, img.file_path))
                .collect();
            format!("\n\n## Attachments\n\n{}", image_lines.join("\n\n"))
        } else {
            String::new()
        };

        let description = format!(
            "Imported from Vortex Issue #{}\n{}\n\n{}{}",
            issue.key,
            issue_url,
            issue.description.clone().unwrap_or_default(),
            images_markdown
        );

        let image_ids: Vec<Uuid> = imported_images.iter().map(|img| img.id).collect();

        let create_task = CreateTask {
            project_id: project.id,
            title: issue.title.clone(),
            description: Some(description),
            status: Some(TaskStatus::Todo),
            execution_mode: None,
            parent_workspace_id: None,
            image_ids: if image_ids.is_empty() {
                None
            } else {
                Some(image_ids.clone())
            },
            shared_task_id: None,
        };

        let task_id = Uuid::new_v4();
        let task = Task::create(&deployment.db().pool, &create_task, task_id).await?;

        if !image_ids.is_empty() {
            TaskImage::associate_many_dedup(&deployment.db().pool, task.id, &image_ids).await?;
        }

        imported.push(ImportVortexIssueResponse { task, issue });
    }

    Project::update_vortex_last_sync(&deployment.db().pool, project.id).await?;

    deployment
        .track_if_analytics_allowed(
            "vortex_issues_synced",
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
        .route("/vortex/config", get(get_vortex_config_status))
        .route("/vortex/issues", get(list_vortex_issues))
        .route("/vortex/issues/import", post(import_vortex_issue))
        .route("/vortex/issues/sync", post(sync_vortex_issues))
}
