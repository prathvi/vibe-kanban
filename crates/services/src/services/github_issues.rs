use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

const GITHUB_API_BASE: &str = "https://api.github.com";

#[derive(Debug, Error)]
pub enum GitHubIssuesError {
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("GitHub API error: {status} - {message}")]
    Api { status: u16, message: String },
    #[error("Invalid repository URL format: {0}")]
    InvalidRepoUrl(String),
    #[error("Authentication required")]
    AuthRequired,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitHubIssue {
    pub number: i64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: String,
    pub user: GitHubUser,
    pub labels: Vec<GitHubLabel>,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "string")]
    pub updated_at: DateTime<Utc>,
    pub assignees: Vec<GitHubUser>,
    pub milestone: Option<GitHubMilestone>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitHubUser {
    pub login: String,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitHubLabel {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitHubMilestone {
    pub title: String,
    pub number: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListIssuesParams {
    pub state: Option<String>,
    pub labels: Option<String>,
    pub sort: Option<String>,
    pub direction: Option<String>,
    pub per_page: Option<i32>,
    pub page: Option<i32>,
}

impl Default for ListIssuesParams {
    fn default() -> Self {
        Self {
            state: Some("open".to_string()),
            labels: None,
            sort: Some("updated".to_string()),
            direction: Some("desc".to_string()),
            per_page: Some(30),
            page: Some(1),
        }
    }
}

pub struct GitHubIssuesService {
    client: Client,
}

impl GitHubIssuesService {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    pub fn parse_repo_url(url: &str) -> Result<(String, String), GitHubIssuesError> {
        let url = url.trim();
        
        if url.contains('/') && !url.contains("://") && !url.contains('@') {
            let parts: Vec<&str> = url.split('/').collect();
            if parts.len() == 2 {
                return Ok((parts[0].to_string(), parts[1].to_string()));
            }
        }

        let re = regex::Regex::new(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/\s]+?)(?:\.git)?(?:/|$|\s)")
            .map_err(|_| GitHubIssuesError::InvalidRepoUrl(url.to_string()))?;

        if let Some(caps) = re.captures(url) {
            let owner = caps.name("owner")
                .map(|m| m.as_str().to_string())
                .ok_or_else(|| GitHubIssuesError::InvalidRepoUrl(url.to_string()))?;
            let repo = caps.name("repo")
                .map(|m| m.as_str().to_string())
                .ok_or_else(|| GitHubIssuesError::InvalidRepoUrl(url.to_string()))?;
            return Ok((owner, repo));
        }

        Err(GitHubIssuesError::InvalidRepoUrl(url.to_string()))
    }

    pub async fn list_issues(
        &self,
        token: &str,
        owner: &str,
        repo: &str,
        params: &ListIssuesParams,
    ) -> Result<Vec<GitHubIssue>, GitHubIssuesError> {
        let url = format!("{}/repos/{}/{}/issues", GITHUB_API_BASE, owner, repo);

        let mut request = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "vibe-kanban")
            .header("X-GitHub-Api-Version", "2022-11-28");

        if let Some(state) = &params.state {
            request = request.query(&[("state", state)]);
        }
        if let Some(labels) = &params.labels {
            request = request.query(&[("labels", labels)]);
        }
        if let Some(sort) = &params.sort {
            request = request.query(&[("sort", sort)]);
        }
        if let Some(direction) = &params.direction {
            request = request.query(&[("direction", direction)]);
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
            return Err(GitHubIssuesError::Api {
                status: status.as_u16(),
                message,
            });
        }

        let issues: Vec<GitHubIssue> = response.json().await?;
        let issues = issues.into_iter()
            .filter(|issue| !issue.html_url.contains("/pull/"))
            .collect();

        Ok(issues)
    }

    pub async fn get_issue(
        &self,
        token: &str,
        owner: &str,
        repo: &str,
        issue_number: i64,
    ) -> Result<GitHubIssue, GitHubIssuesError> {
        let url = format!("{}/repos/{}/{}/issues/{}", GITHUB_API_BASE, owner, repo, issue_number);

        let response = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "vibe-kanban")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await?;

        let status = response.status();

        if !status.is_success() {
            let message = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(GitHubIssuesError::Api {
                status: status.as_u16(),
                message,
            });
        }

        let issue: GitHubIssue = response.json().await?;
        Ok(issue)
    }
}

impl Default for GitHubIssuesService {
    fn default() -> Self {
        Self::new()
    }
}
