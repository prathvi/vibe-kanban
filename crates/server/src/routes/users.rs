use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{delete, get, post, put},
};
use db::models::user::{UpdateUser, User, UserError, UserPublic, UserRole};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::{password::hash_password, response::ApiResponse};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Request body for creating a user (admin only)
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub email: Option<String>,
    pub role: Option<String>,
}

/// Request body for updating a user
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpdateUserRequest {
    pub email: Option<String>,
    pub role: Option<String>,
    pub password: Option<String>,
}

/// Response containing a list of users
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct UsersListResponse {
    pub users: Vec<UserPublic>,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/users", get(list_users))
        .route("/users", post(create_user))
        .route("/users/{id}", get(get_user))
        .route("/users/{id}", put(update_user))
        .route("/users/{id}", delete(delete_user))
}

/// Helper to extract and validate admin user from request
async fn require_admin(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    headers: &axum::http::HeaderMap,
) -> Result<User, ApiError> {
    // Extract token from Authorization header
    let auth_header = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or(ApiError::Unauthorized)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(ApiError::Unauthorized)?;

    // Validate token
    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "development-jwt-secret-change-in-production".to_string());
    let claims = utils::jwt::validate_access_token(token, &jwt_secret)
        .map_err(|_| ApiError::Unauthorized)?;

    // Get user
    let user_id: Uuid = claims
        .sub
        .parse()
        .map_err(|_| ApiError::BadRequest("Invalid user ID in token".to_string()))?;
    let user = User::find_by_id(pool, user_id)
        .await
        .map_err(ApiError::Database)?
        .ok_or(ApiError::User(UserError::NotFound))?;

    // Check if admin
    if !user.is_admin() {
        return Err(ApiError::Forbidden("Admin access required".to_string()));
    }

    Ok(user)
}

/// List all users (admin only)
/// GET /api/users
async fn list_users(
    State(deployment): State<DeploymentImpl>,
    headers: axum::http::HeaderMap,
) -> Result<ResponseJson<ApiResponse<UsersListResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Require admin
    require_admin(pool, &headers).await?;

    let users = User::find_all(pool).await.map_err(ApiError::Database)?;
    let users_public: Vec<UserPublic> = users.into_iter().map(|u| u.into()).collect();

    Ok(ResponseJson(ApiResponse::success(UsersListResponse {
        users: users_public,
    })))
}

/// Create a new user (admin only)
/// POST /api/users
async fn create_user(
    State(deployment): State<DeploymentImpl>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<CreateUserRequest>,
) -> Result<ResponseJson<ApiResponse<UserPublic>>, ApiError> {
    let pool = &deployment.db().pool;

    // Require admin
    require_admin(pool, &headers).await?;

    // Validate username
    if payload.username.is_empty() || payload.username.len() < 3 {
        return Err(ApiError::BadRequest(
            "Username must be at least 3 characters".to_string(),
        ));
    }

    // Validate password
    if payload.password.len() < 8 {
        return Err(ApiError::BadRequest(
            "Password must be at least 8 characters".to_string(),
        ));
    }

    // Determine role
    let role = match payload.role.as_deref() {
        Some("admin") => UserRole::Admin,
        _ => UserRole::User,
    };

    // Hash password
    let password_hash = hash_password(&payload.password)
        .map_err(|_| ApiError::BadRequest("Failed to hash password".to_string()))?;

    // Create user
    let user = User::create(
        pool,
        &payload.username,
        payload.email.as_deref(),
        &password_hash,
        role,
    )
    .await?;

    Ok(ResponseJson(ApiResponse::success(user.into())))
}

/// Get a user by ID (admin only)
/// GET /api/users/:id
async fn get_user(
    State(deployment): State<DeploymentImpl>,
    headers: axum::http::HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<UserPublic>>, ApiError> {
    let pool = &deployment.db().pool;

    // Require admin
    require_admin(pool, &headers).await?;

    let user = User::find_by_id(pool, id)
        .await
        .map_err(ApiError::Database)?
        .ok_or(ApiError::User(UserError::NotFound))?;

    Ok(ResponseJson(ApiResponse::success(user.into())))
}

/// Update a user (admin only)
/// PUT /api/users/:id
async fn update_user(
    State(deployment): State<DeploymentImpl>,
    headers: axum::http::HeaderMap,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateUserRequest>,
) -> Result<ResponseJson<ApiResponse<UserPublic>>, ApiError> {
    let pool = &deployment.db().pool;

    // Require admin
    let admin = require_admin(pool, &headers).await?;

    // Prevent admin from demoting themselves
    if id == admin.id && payload.role.as_deref() == Some("user") {
        return Err(ApiError::BadRequest(
            "Cannot demote yourself from admin".to_string(),
        ));
    }

    // If password is being changed, hash it and update separately
    if let Some(new_password) = &payload.password {
        if new_password.len() < 8 {
            return Err(ApiError::BadRequest(
                "Password must be at least 8 characters".to_string(),
            ));
        }
        let password_hash = hash_password(new_password)
            .map_err(|_| ApiError::BadRequest("Failed to hash password".to_string()))?;

        // Update password using the User model method
        User::update_password(pool, id, &password_hash).await?;
    }

    // Update other fields
    let update_data = UpdateUser {
        email: payload.email,
        role: payload.role,
    };

    let user = User::update(pool, id, &update_data).await?;

    Ok(ResponseJson(ApiResponse::success(user.into())))
}

/// Delete a user (admin only)
/// DELETE /api/users/:id
async fn delete_user(
    State(deployment): State<DeploymentImpl>,
    headers: axum::http::HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let pool = &deployment.db().pool;

    // Require admin
    let admin = require_admin(pool, &headers).await?;

    // Prevent admin from deleting themselves
    if id == admin.id {
        return Err(ApiError::BadRequest(
            "Cannot delete your own account".to_string(),
        ));
    }

    // Delete user
    let rows_affected = User::delete(pool, id).await.map_err(ApiError::Database)?;

    if rows_affected == 0 {
        return Err(ApiError::User(UserError::NotFound));
    }

    Ok(StatusCode::NO_CONTENT)
}
