use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

const GITLAB_API_BASE: &str = "https://gitlab.com/api/v4";

#[derive(Debug, Error)]
pub enum GitLabIssuesError {
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("GitLab API error: {status} - {message}")]
    Api { status: u16, message: String },
    #[error("Invalid project URL format: {0}")]
    InvalidProjectUrl(String),
    #[error("Authentication required")]
    AuthRequired,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitLabIssue {
    pub iid: i64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub web_url: String,
    pub author: GitLabUser,
    pub labels: Vec<String>,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "string")]
    pub updated_at: DateTime<Utc>,
    pub assignees: Vec<GitLabUser>,
    pub milestone: Option<GitLabMilestone>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitLabUser {
    pub username: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitLabMilestone {
    pub title: String,
    pub iid: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListGitLabIssuesParams {
    pub state: Option<String>,
    pub labels: Option<String>,
    pub sort: Option<String>,
    pub order_by: Option<String>,
    pub per_page: Option<i32>,
    pub page: Option<i32>,
}

impl Default for ListGitLabIssuesParams {
    fn default() -> Self {
        Self {
            state: Some("opened".to_string()),
            labels: None,
            sort: Some("desc".to_string()),
            order_by: Some("updated_at".to_string()),
            per_page: Some(30),
            page: Some(1),
        }
    }
}

pub struct GitLabIssuesService {
    client: Client,
}

impl GitLabIssuesService {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    pub fn parse_project_url(url: &str) -> Result<String, GitLabIssuesError> {
        let url = url.trim();

        if !url.contains('/') {
            return Err(GitLabIssuesError::InvalidProjectUrl(url.to_string()));
        }

        if !url.contains("://") && !url.contains('@') {
            return Ok(urlencoding::encode(url).to_string());
        }

        let re = regex::Regex::new(r"gitlab\.com[:/](?P<path>.+?)(?:\.git)?(?:/)?$")
            .map_err(|_| GitLabIssuesError::InvalidProjectUrl(url.to_string()))?;

        if let Some(caps) = re.captures(url) {
            let path = caps.name("path")
                .map(|m| m.as_str().trim_end_matches('/').to_string())
                .ok_or_else(|| GitLabIssuesError::InvalidProjectUrl(url.to_string()))?;
            return Ok(urlencoding::encode(&path).to_string());
        }

        Err(GitLabIssuesError::InvalidProjectUrl(url.to_string()))
    }

    pub async fn list_issues(
        &self,
        token: &str,
        project_path: &str,
        params: &ListGitLabIssuesParams,
    ) -> Result<Vec<GitLabIssue>, GitLabIssuesError> {
        let url = format!("{}/projects/{}/issues", GITLAB_API_BASE, project_path);

        let mut request = self.client
            .get(&url)
            .header("PRIVATE-TOKEN", token)
            .header("Accept", "application/json")
            .header("User-Agent", "vibe-kanban");

        if let Some(state) = &params.state {
            request = request.query(&[("state", state)]);
        }
        if let Some(labels) = &params.labels {
            request = request.query(&[("labels", labels)]);
        }
        if let Some(sort) = &params.sort {
            request = request.query(&[("sort", sort)]);
        }
        if let Some(order_by) = &params.order_by {
            request = request.query(&[("order_by", order_by)]);
        }
        if let Some(per_page) = params.per_page {
            request = request.query(&[("per_page", per_page.to_string())]);
        }
        if let Some(page) = params.page {
            request = request.query(&[("page", page.to_string())]);
        }

        let response = request.send().await?;
        let status = response.status();

        if !status.is_success() {
            let message = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(GitLabIssuesError::Api {
                status: status.as_u16(),
                message,
            });
        }

        let issues: Vec<GitLabIssue> = response.json().await?;
        Ok(issues)
    }

    pub async fn get_issue(
        &self,
        token: &str,
        project_path: &str,
        issue_iid: i64,
    ) -> Result<GitLabIssue, GitLabIssuesError> {
        let url = format!("{}/projects/{}/issues/{}", GITLAB_API_BASE, project_path, issue_iid);

        let response = self.client
            .get(&url)
            .header("PRIVATE-TOKEN", token)
            .header("Accept", "application/json")
            .header("User-Agent", "vibe-kanban")
            .send()
            .await?;

        let status = response.status();

        if !status.is_success() {
            let message = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(GitLabIssuesError::Api {
                status: status.as_u16(),
                message,
            });
        }

        let issue: GitLabIssue = response.json().await?;
        Ok(issue)
    }
}

impl Default for GitLabIssuesService {
    fn default() -> Self {
        Self::new()
    }
}
