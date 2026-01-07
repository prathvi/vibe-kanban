use reqwest::Client;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{debug, warn};
use ts_rs::TS;

const VORTEX_API_BASE: &str = "https://api.vortextask.com";

#[derive(Debug, Error)]
pub enum VortexIssuesError {
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("Vortex API error: {status} - {message}")]
    Api { status: u16, message: String },
    #[error("Authentication required")]
    AuthRequired,
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
    #[error("Failed to parse API response: {0}")]
    ParseError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct VortexIssue {
    pub id: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    pub key: String,
    pub title: String,
    pub description: Option<String>,
    #[serde(rename = "type", default)]
    pub issue_type: Option<String>,
    pub status: String,
    pub priority: Option<String>,
    pub severity: Option<String>,
    pub assignee_id: Option<String>,
    pub reporter_id: Option<String>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub custom_fields: Option<String>,
    #[serde(rename = "customFields", default)]
    #[ts(type = "any")]
    pub custom_fields_parsed: Option<serde_json::Value>,
    #[serde(rename = "componentIds", default)]
    pub component_ids: Vec<String>,
    #[serde(default)]
    #[ts(type = "any[]")]
    pub subtasks: Vec<serde_json::Value>,
    #[serde(rename = "linkedIssues", default)]
    #[ts(type = "any[]")]
    pub linked_issues: Vec<serde_json::Value>,
    #[serde(default)]
    pub attachments: Vec<VortexAttachment>,
    #[serde(rename = "watcherIds", default)]
    pub watcher_ids: Vec<String>,
    #[serde(default)]
    #[ts(type = "any")]
    pub github_issue: Option<serde_json::Value>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct VortexUser {
    pub id: String,
    pub name: String,
    pub email: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct VortexAttachment {
    pub id: String,
    pub filename: String,
    #[serde(rename = "downloadUrl")]
    pub download_url: Option<String>,
    #[serde(rename = "mimeType", alias = "mime_type")]
    pub mime_type: Option<String>,
    #[serde(rename = "isImage", default)]
    pub is_image: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct VortexComment {
    pub id: String,
    pub issue_id: String,
    pub user_id: String,
    pub content: String,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListVortexIssuesParams {
    pub status: Option<String>,
    pub priority: Option<String>,
    pub labels: Option<String>,
    pub page: Option<i32>,
    pub limit: Option<i32>,
}

impl Default for ListVortexIssuesParams {
    fn default() -> Self {
        Self {
            status: Some("Open".to_string()),
            priority: None,
            labels: None,
            page: Some(1),
            limit: Some(5),
        }
    }
}

#[derive(Debug, Deserialize)]
struct VortexListResponse {
    data: Vec<VortexIssue>,
    #[serde(default)]
    meta: VortexMeta,
}

#[derive(Debug, Deserialize, Default)]
struct VortexMeta {
    #[serde(default)]
    total: i32,
}

#[derive(Debug, Deserialize)]
struct VortexDataResponse<T> {
    data: T,
}

#[derive(Debug, Deserialize)]
struct VortexAttachmentsResponse {
    #[serde(default)]
    data: Vec<VortexAttachment>,
}

pub struct VortexIssuesService {
    client: Client,
}

impl VortexIssuesService {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    pub async fn list_issues(
        &self,
        token: &str,
        project_id: &str,
        params: &ListVortexIssuesParams,
    ) -> Result<Vec<VortexIssue>, VortexIssuesError> {
        let url = format!("{}/api/issues", VORTEX_API_BASE);
        debug!("Vortex list_issues URL: {}", url);

        let mut request = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json")
            .query(&[("projectId", project_id)]);

        if let Some(status) = &params.status {
            request = request.query(&[("status", status)]);
        }
        if let Some(priority) = &params.priority {
            request = request.query(&[("priority", priority)]);
        }
        if let Some(limit) = params.limit {
            request = request.query(&[("limit", limit.to_string())]);
        }
        if let Some(page) = params.page {
            request = request.query(&[("page", page.to_string())]);
        }

        let response = request.send().await?;
        let status = response.status();
        debug!("Vortex API response status: {}", status);

        if !status.is_success() {
            let message = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            warn!("Vortex API error: {} - {}", status.as_u16(), message);
            return Err(VortexIssuesError::Api {
                status: status.as_u16(),
                message,
            });
        }

        let body = response.text().await?;
        debug!("Vortex API response body length: {} chars", body.len());

        let list_response: VortexListResponse = serde_json::from_str(&body).map_err(|e| {
            warn!(
                "Failed to parse Vortex response: {} - Body length: {} chars, ends with: {:?}",
                e,
                body.len(),
                &body[body.len().saturating_sub(100)..]
            );
            VortexIssuesError::ParseError(e.to_string())
        })?;

        Ok(list_response.data)
    }

    pub async fn get_issue(
        &self,
        token: &str,
        issue_id: &str,
    ) -> Result<VortexIssue, VortexIssuesError> {
        let url = format!("{}/api/issues/{}", VORTEX_API_BASE, issue_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json")
            .send()
            .await?;

        let status = response.status();

        if !status.is_success() {
            let message = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(VortexIssuesError::Api {
                status: status.as_u16(),
                message,
            });
        }

        let body = response.text().await?;

        if let Ok(resp) = serde_json::from_str::<VortexDataResponse<VortexIssue>>(&body) {
            return Ok(resp.data);
        }

        serde_json::from_str::<VortexIssue>(&body)
            .map_err(|e| VortexIssuesError::ParseError(e.to_string()))
    }

    pub async fn get_issue_attachments(
        &self,
        token: &str,
        issue_id: &str,
    ) -> Result<Vec<VortexAttachment>, VortexIssuesError> {
        let url = format!("{}/api/issues/{}/attachments", VORTEX_API_BASE, issue_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json")
            .send()
            .await?;

        if !response.status().is_success() {
            return Ok(vec![]);
        }

        let body = response.text().await?;

        if let Ok(resp) = serde_json::from_str::<VortexAttachmentsResponse>(&body) {
            return Ok(resp.data);
        }

        if let Ok(resp) = serde_json::from_str::<VortexDataResponse<Vec<VortexAttachment>>>(&body) {
            return Ok(resp.data);
        }

        Ok(vec![])
    }

    pub async fn download_attachment(
        &self,
        token: &str,
        download_url: &str,
    ) -> Result<Vec<u8>, VortexIssuesError> {
        let full_url = if download_url.starts_with("http") {
            download_url.to_string()
        } else {
            format!("{}{}", VORTEX_API_BASE, download_url)
        };

        let response = self
            .client
            .get(&full_url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(VortexIssuesError::Api {
                status: response.status().as_u16(),
                message: "Failed to download attachment".to_string(),
            });
        }

        Ok(response.bytes().await?.to_vec())
    }

    pub async fn update_issue_status(
        &self,
        token: &str,
        issue_id: &str,
        new_status: &str,
    ) -> Result<(), VortexIssuesError> {
        let url = format!("{}/api/issues/{}", VORTEX_API_BASE, issue_id);

        let body = serde_json::json!({
            "status": new_status
        });

        let response = self
            .client
            .patch(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        let status_code = response.status();

        if !status_code.is_success() {
            let message = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(VortexIssuesError::Api {
                status: status_code.as_u16(),
                message,
            });
        }

        Ok(())
    }

    pub async fn add_comment(
        &self,
        token: &str,
        issue_id: &str,
        content: &str,
    ) -> Result<(), VortexIssuesError> {
        let user_id = self.get_current_user_id(token).await?;

        let url = format!("{}/api/comments", VORTEX_API_BASE);

        let body = serde_json::json!({
            "issueId": issue_id,
            "userId": user_id,
            "content": content
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        let status = response.status();

        if !status.is_success() {
            let message = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            warn!(
                "Failed to add Vortex comment: {} - {}",
                status.as_u16(),
                message
            );
        }

        Ok(())
    }

    pub async fn get_current_user_id(&self, token: &str) -> Result<String, VortexIssuesError> {
        let url = format!("{}/api/users/me", VORTEX_API_BASE);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json")
            .send()
            .await?;

        if response.status().is_success() {
            let body = response.text().await?;
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&body) {
                if let Some(id) = data["data"]["id"].as_str() {
                    return Ok(id.to_string());
                }
            }
        }

        Ok("system".to_string())
    }

    pub async fn add_comment_as_current_user(
        &self,
        token: &str,
        issue_id: &str,
        content: &str,
    ) -> Result<(), VortexIssuesError> {
        self.add_comment(token, issue_id, content).await
    }
}

impl Default for VortexIssuesService {
    fn default() -> Self {
        Self::new()
    }
}

pub fn extract_vortex_issue_id_from_description(description: &str) -> Option<String> {
    if !description.starts_with("Imported from Vortex Issue #") {
        return None;
    }

    let second_line = description.lines().nth(1)?;

    if let Some(id_part) = second_line.rsplit('/').next() {
        let id = id_part.split('?').next()?.trim();
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }

    None
}

pub fn is_vortex_imported_task(description: &str) -> bool {
    description.starts_with("Imported from Vortex Issue #")
}
