use std::path::{Path, PathBuf};

use db::models::{repo::Repo, workspace::Workspace as DbWorkspace};
use sqlx::{Pool, Sqlite};
use thiserror::Error;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use super::worktree_manager::{WorktreeCleanup, WorktreeError, WorktreeManager};

#[derive(Debug, Clone)]
pub struct RepoWorkspaceInput {
    pub repo: Repo,
    pub target_branch: String,
}

impl RepoWorkspaceInput {
    pub fn new(repo: Repo, target_branch: String) -> Self {
        Self {
            repo,
            target_branch,
        }
    }
}

#[derive(Debug, Error)]
pub enum WorkspaceError {
    #[error(transparent)]
    Worktree(#[from] WorktreeError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("No repositories provided")]
    NoRepositories,
    #[error("Partial workspace creation failed: {0}")]
    PartialCreation(String),
}

/// Info about a single repo's worktree within a workspace
#[derive(Debug, Clone)]
pub struct RepoWorktree {
    pub repo_id: Uuid,
    pub repo_name: String,
    pub source_repo_path: PathBuf,
    pub worktree_path: PathBuf,
}

/// A container directory holding worktrees for all project repos
#[derive(Debug, Clone)]
pub struct WorktreeContainer {
    pub workspace_dir: PathBuf,
    pub worktrees: Vec<RepoWorktree>,
}

pub struct WorkspaceManager;

impl WorkspaceManager {
    /// Compute the worktree path for a repo - creates worktree as sibling to the source repo
    /// e.g., /home/user/myrepo/ -> /home/user/myrepo-branch-name/
    pub fn compute_worktree_path(repo_path: &Path, branch_name: &str) -> PathBuf {
        let parent = repo_path.parent().unwrap_or(repo_path);
        let repo_name = repo_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "repo".to_string());

        // Sanitize branch name for filesystem (replace / with -)
        let sanitized_branch = branch_name.replace('/', "-");
        parent.join(format!("{}-{}", repo_name, sanitized_branch))
    }

    /// Create a workspace with worktrees for all repositories.
    /// Worktrees are created as siblings to each source repo.
    /// On failure, rolls back any already-created worktrees.
    pub async fn create_workspace(
        workspace_dir: &Path,
        repos: &[RepoWorkspaceInput],
        branch_name: &str,
    ) -> Result<WorktreeContainer, WorkspaceError> {
        if repos.is_empty() {
            return Err(WorkspaceError::NoRepositories);
        }

        info!(
            "Creating workspace at {} with {} repositories (worktrees as repo siblings)",
            workspace_dir.display(),
            repos.len()
        );

        // Create workspace dir for shared files (CLAUDE.md, images)
        tokio::fs::create_dir_all(workspace_dir).await?;

        let mut created_worktrees: Vec<RepoWorktree> = Vec::new();

        for input in repos {
            // Create worktree as sibling to source repo
            let worktree_path = Self::compute_worktree_path(&input.repo.path, branch_name);

            debug!(
                "Creating worktree for repo '{}' at {} (sibling to source repo)",
                input.repo.name,
                worktree_path.display()
            );

            match WorktreeManager::create_worktree(
                &input.repo.path,
                branch_name,
                &worktree_path,
                &input.target_branch,
                true,
            )
            .await
            {
                Ok(()) => {
                    created_worktrees.push(RepoWorktree {
                        repo_id: input.repo.id,
                        repo_name: input.repo.name.clone(),
                        source_repo_path: input.repo.path.clone(),
                        worktree_path,
                    });
                }
                Err(e) => {
                    error!(
                        "Failed to create worktree for repo '{}': {}. Rolling back...",
                        input.repo.name, e
                    );

                    // Rollback: cleanup all worktrees we've created so far
                    Self::cleanup_created_worktrees(&created_worktrees).await;

                    // Also remove the workspace directory if it's empty
                    if let Err(cleanup_err) = tokio::fs::remove_dir(workspace_dir).await {
                        debug!(
                            "Could not remove workspace dir during rollback: {}",
                            cleanup_err
                        );
                    }

                    return Err(WorkspaceError::PartialCreation(format!(
                        "Failed to create worktree for repo '{}': {}",
                        input.repo.name, e
                    )));
                }
            }
        }

        // Create symlinks in workspace_dir pointing to each worktree
        // This allows the agent to access worktrees via workspace_dir/{repo_name}
        for worktree in &created_worktrees {
            let symlink_path = workspace_dir.join(&worktree.repo_name);
            if symlink_path.exists() {
                // Remove existing symlink or directory
                if symlink_path.is_symlink() {
                    let _ = tokio::fs::remove_file(&symlink_path).await;
                } else if symlink_path.is_dir() {
                    let _ = tokio::fs::remove_dir_all(&symlink_path).await;
                }
            }
            if let Err(e) = tokio::fs::symlink(&worktree.worktree_path, &symlink_path).await {
                warn!(
                    "Failed to create symlink {} -> {}: {}",
                    symlink_path.display(),
                    worktree.worktree_path.display(),
                    e
                );
            } else {
                debug!(
                    "Created symlink {} -> {}",
                    symlink_path.display(),
                    worktree.worktree_path.display()
                );
            }
        }

        info!(
            "Successfully created workspace with {} worktrees (as repo siblings with symlinks)",
            created_worktrees.len()
        );

        Ok(WorktreeContainer {
            workspace_dir: workspace_dir.to_path_buf(),
            worktrees: created_worktrees,
        })
    }

    /// Ensure all worktrees in a workspace exist (for cold restart scenarios)
    /// Worktrees are created as siblings to each source repo.
    /// Migrates old-style worktrees (inside workspace_dir) to new location (repo siblings).
    pub async fn ensure_workspace_exists(
        workspace_dir: &Path,
        repos: &[Repo],
        branch_name: &str,
    ) -> Result<(), WorkspaceError> {
        if repos.is_empty() {
            return Err(WorkspaceError::NoRepositories);
        }

        // Ensure shared workspace dir exists
        if !workspace_dir.exists() {
            tokio::fs::create_dir_all(workspace_dir).await?;
        }

        for repo in repos {
            // New worktree location: sibling to source repo
            let new_worktree_path = Self::compute_worktree_path(&repo.path, branch_name);
            // Old worktree location: inside workspace_dir
            let old_worktree_path = workspace_dir.join(&repo.name);

            // Check if old-style worktree exists (directory with .git file, not a symlink)
            let old_git_marker = old_worktree_path.join(".git");
            if old_worktree_path.exists()
                && !old_worktree_path.is_symlink()
                && old_git_marker.exists()
                && old_git_marker.is_file()
            {
                // Migrate: move worktree from old location to new location
                info!(
                    "Migrating old-style worktree for '{}' from {} to {}",
                    repo.name,
                    old_worktree_path.display(),
                    new_worktree_path.display()
                );

                match WorktreeManager::move_worktree(
                    &repo.path,
                    &old_worktree_path,
                    &new_worktree_path,
                )
                .await
                {
                    Ok(()) => {
                        info!(
                            "Successfully migrated worktree for '{}' to {}",
                            repo.name,
                            new_worktree_path.display()
                        );
                    }
                    Err(e) => {
                        warn!(
                            "Failed to migrate worktree for '{}': {}. Will recreate.",
                            repo.name, e
                        );
                        // Clean up failed migration attempt
                        let _ = tokio::fs::remove_dir_all(&old_worktree_path).await;
                    }
                }
            }

            debug!(
                "Ensuring worktree exists for repo '{}' at {} (sibling to source repo)",
                repo.name,
                new_worktree_path.display()
            );

            WorktreeManager::ensure_worktree_exists(&repo.path, branch_name, &new_worktree_path)
                .await?;

            // Create symlink in workspace_dir pointing to worktree
            if old_worktree_path.is_symlink() {
                let _ = tokio::fs::remove_file(&old_worktree_path).await;
            } else if old_worktree_path.exists() {
                // Should not happen after migration, but clean up just in case
                let _ = tokio::fs::remove_dir_all(&old_worktree_path).await;
            }

            if let Err(e) = tokio::fs::symlink(&new_worktree_path, &old_worktree_path).await {
                warn!(
                    "Failed to create symlink {} -> {}: {}",
                    old_worktree_path.display(),
                    new_worktree_path.display(),
                    e
                );
            }
        }

        Ok(())
    }

    /// Clean up all worktrees in a workspace
    /// Worktrees are located as siblings to each source repo.
    pub async fn cleanup_workspace(
        workspace_dir: &Path,
        repos: &[Repo],
        branch_name: &str,
    ) -> Result<(), WorkspaceError> {
        info!("Cleaning up workspace at {}", workspace_dir.display());

        let cleanup_data: Vec<WorktreeCleanup> = repos
            .iter()
            .map(|repo| {
                // Worktrees are siblings to source repos
                let worktree_path = Self::compute_worktree_path(&repo.path, branch_name);
                WorktreeCleanup::new(worktree_path, Some(repo.path.clone()))
            })
            .collect();

        WorktreeManager::batch_cleanup_worktrees(&cleanup_data).await?;

        // Remove the shared workspace directory (for images, CLAUDE.md, etc.)
        if workspace_dir.exists()
            && let Err(e) = tokio::fs::remove_dir_all(workspace_dir).await
        {
            debug!(
                "Could not remove workspace directory {}: {}",
                workspace_dir.display(),
                e
            );
        }

        Ok(())
    }

    /// Get the base directory for workspaces (same as worktree base dir)
    pub fn get_workspace_base_dir() -> PathBuf {
        WorktreeManager::get_worktree_base_dir()
    }

    /// Migrate a legacy single-worktree layout to the new workspace layout.
    /// Old layout: workspace_dir IS the worktree
    /// New layout: workspace_dir contains worktrees at workspace_dir/{repo_name}
    ///
    /// Returns Ok(true) if migration was performed, Ok(false) if no migration needed.
    pub async fn migrate_legacy_worktree(
        workspace_dir: &Path,
        repo: &Repo,
    ) -> Result<bool, WorkspaceError> {
        let expected_worktree_path = workspace_dir.join(&repo.name);

        // Detect old-style: workspace_dir exists AND has .git file (worktree marker)
        // AND expected new location doesn't exist
        let git_file = workspace_dir.join(".git");
        let is_old_style = workspace_dir.exists()
            && git_file.exists()
            && git_file.is_file() // .git file = worktree, .git dir = main repo
            && !expected_worktree_path.exists();

        if !is_old_style {
            return Ok(false);
        }

        info!(
            "Detected legacy worktree at {}, migrating to new layout",
            workspace_dir.display()
        );

        // Move old worktree to temp location (can't move into subdirectory of itself)
        let temp_name = format!(
            "{}-migrating",
            workspace_dir
                .file_name()
                .map(|n| n.to_string_lossy())
                .unwrap_or_default()
        );
        let temp_path = workspace_dir.with_file_name(temp_name);

        WorktreeManager::move_worktree(&repo.path, workspace_dir, &temp_path).await?;

        // Create new workspace directory
        tokio::fs::create_dir_all(workspace_dir).await?;

        // Move worktree to final location using git worktree move
        WorktreeManager::move_worktree(&repo.path, &temp_path, &expected_worktree_path).await?;

        if temp_path.exists() {
            let _ = tokio::fs::remove_dir_all(&temp_path).await;
        }

        info!(
            "Successfully migrated legacy worktree to {}",
            expected_worktree_path.display()
        );

        Ok(true)
    }

    /// Helper to cleanup worktrees during rollback
    async fn cleanup_created_worktrees(worktrees: &[RepoWorktree]) {
        for worktree in worktrees {
            let cleanup = WorktreeCleanup::new(
                worktree.worktree_path.clone(),
                Some(worktree.source_repo_path.clone()),
            );

            if let Err(e) = WorktreeManager::cleanup_worktree(&cleanup).await {
                error!(
                    "Failed to cleanup worktree '{}' during rollback: {}",
                    worktree.repo_name, e
                );
            }
        }
    }

    pub async fn cleanup_orphan_workspaces(db: &Pool<Sqlite>) {
        if std::env::var("DISABLE_WORKTREE_ORPHAN_CLEANUP").is_ok() {
            debug!(
                "Orphan workspace cleanup is disabled via DISABLE_WORKTREE_ORPHAN_CLEANUP environment variable"
            );
            return;
        }

        let workspace_base_dir = Self::get_workspace_base_dir();
        if !workspace_base_dir.exists() {
            debug!(
                "Workspace base directory {} does not exist, skipping orphan cleanup",
                workspace_base_dir.display()
            );
            return;
        }

        let entries = match std::fs::read_dir(&workspace_base_dir) {
            Ok(entries) => entries,
            Err(e) => {
                error!(
                    "Failed to read workspace base directory {}: {}",
                    workspace_base_dir.display(),
                    e
                );
                return;
            }
        };

        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(e) => {
                    warn!("Failed to read directory entry: {}", e);
                    continue;
                }
            };

            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let workspace_path_str = path.to_string_lossy().to_string();
            if let Ok(false) = DbWorkspace::container_ref_exists(db, &workspace_path_str).await {
                info!("Found orphaned workspace: {}", workspace_path_str);
                if let Err(e) = Self::cleanup_workspace_without_repos(&path).await {
                    error!(
                        "Failed to remove orphaned workspace {}: {}",
                        workspace_path_str, e
                    );
                } else {
                    info!(
                        "Successfully removed orphaned workspace: {}",
                        workspace_path_str
                    );
                }
            }
        }
    }

    async fn cleanup_workspace_without_repos(workspace_dir: &Path) -> Result<(), WorkspaceError> {
        info!(
            "Cleaning up orphaned workspace at {}",
            workspace_dir.display()
        );

        let entries = match std::fs::read_dir(workspace_dir) {
            Ok(entries) => entries,
            Err(e) => {
                debug!(
                    "Cannot read workspace directory {}, attempting direct removal: {}",
                    workspace_dir.display(),
                    e
                );
                return tokio::fs::remove_dir_all(workspace_dir)
                    .await
                    .map_err(WorkspaceError::Io);
            }
        };

        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir()
                && let Err(e) = WorktreeManager::cleanup_suspected_worktree(&path).await
            {
                warn!("Failed to cleanup suspected worktree: {}", e);
            }
        }

        if workspace_dir.exists()
            && let Err(e) = tokio::fs::remove_dir_all(workspace_dir).await
        {
            debug!(
                "Could not remove workspace directory {}: {}",
                workspace_dir.display(),
                e
            );
        }

        Ok(())
    }
}
