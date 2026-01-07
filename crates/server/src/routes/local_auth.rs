use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{get, post},
};
use chrono::{Duration, Utc};
use db::models::user::{User, UserError, UserPublic, UserRole, UserSession};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::{
    jwt::{
        ACCESS_TOKEN_EXPIRY_SECS, REFRESH_TOKEN_EXPIRY_SECS, create_access_token,
        create_refresh_token, validate_refresh_token,
    },
    password::{hash_password, verify_password},
    response::ApiResponse,
};

use crate::{DeploymentImpl, error::ApiError};

/// Request body for user registration
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub email: Option<String>,
}

/// Request body for user login
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

/// Request body for token refresh
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

/// Response containing auth tokens
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct AuthTokensResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub user: UserPublic,
}

/// Response for setup status
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct SetupStatusResponse {
    pub setup_required: bool,
    pub user_count: i64,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/local-auth/register", post(register))
        .route("/local-auth/login", post(login))
        .route("/local-auth/logout", post(logout))
        .route("/local-auth/refresh", post(refresh))
        .route("/local-auth/me", get(get_current_user))
        .route("/local-auth/setup-status", get(setup_status))
}

/// Get the JWT secret from environment or generate one
fn get_jwt_secret() -> String {
    std::env::var("JWT_SECRET").unwrap_or_else(|_| {
        // In production, JWT_SECRET should be set
        // For development, we use a static secret (not recommended for production)
        "development-jwt-secret-change-in-production".to_string()
    })
}

/// Register a new user
/// POST /api/local-auth/register
async fn register(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<RegisterRequest>,
) -> Result<ResponseJson<ApiResponse<AuthTokensResponse>>, ApiError> {
    let pool = &deployment.db().pool;

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

    // Check if this is the first user (will be admin)
    let user_count = User::count(pool).await.map_err(ApiError::Database)?;
    let role = if user_count == 0 {
        UserRole::Admin
    } else {
        UserRole::User
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

    // Generate tokens
    let jwt_secret = get_jwt_secret();
    let access_token = create_access_token(
        user.id,
        &user.username,
        &user.role,
        &jwt_secret,
        ACCESS_TOKEN_EXPIRY_SECS,
    )
    .map_err(|e| ApiError::BadRequest(format!("Failed to create access token: {}", e)))?;

    let refresh_token = create_refresh_token(user.id, &jwt_secret, REFRESH_TOKEN_EXPIRY_SECS)
        .map_err(|e| ApiError::BadRequest(format!("Failed to create refresh token: {}", e)))?;

    // Store refresh token in database
    let expires_at = Utc::now() + Duration::seconds(REFRESH_TOKEN_EXPIRY_SECS);
    UserSession::create(pool, user.id, &refresh_token, expires_at)
        .await
        .map_err(ApiError::Database)?;

    Ok(ResponseJson(ApiResponse::success(AuthTokensResponse {
        access_token,
        refresh_token,
        user: user.into(),
    })))
}

/// Login with username and password
/// POST /api/local-auth/login
async fn login(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<LoginRequest>,
) -> Result<ResponseJson<ApiResponse<AuthTokensResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Find user by username
    let user = User::find_by_username(pool, &payload.username)
        .await
        .map_err(ApiError::Database)?
        .ok_or(ApiError::User(UserError::InvalidCredentials))?;

    // Verify password
    let is_valid = verify_password(&payload.password, &user.password_hash)
        .map_err(|_| ApiError::BadRequest("Failed to verify password".to_string()))?;

    if !is_valid {
        return Err(ApiError::User(UserError::InvalidCredentials));
    }

    // Generate tokens
    let jwt_secret = get_jwt_secret();
    let access_token = create_access_token(
        user.id,
        &user.username,
        &user.role,
        &jwt_secret,
        ACCESS_TOKEN_EXPIRY_SECS,
    )
    .map_err(|e| ApiError::BadRequest(format!("Failed to create access token: {}", e)))?;

    let refresh_token = create_refresh_token(user.id, &jwt_secret, REFRESH_TOKEN_EXPIRY_SECS)
        .map_err(|e| ApiError::BadRequest(format!("Failed to create refresh token: {}", e)))?;

    // Store refresh token in database
    let expires_at = Utc::now() + Duration::seconds(REFRESH_TOKEN_EXPIRY_SECS);
    UserSession::create(pool, user.id, &refresh_token, expires_at)
        .await
        .map_err(ApiError::Database)?;

    Ok(ResponseJson(ApiResponse::success(AuthTokensResponse {
        access_token,
        refresh_token,
        user: user.into(),
    })))
}

/// Logout - invalidate refresh token
/// POST /api/local-auth/logout
async fn logout(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<RefreshRequest>,
) -> Result<StatusCode, ApiError> {
    let pool = &deployment.db().pool;

    // Delete refresh token from database
    UserSession::delete_by_refresh_token(pool, &payload.refresh_token)
        .await
        .map_err(ApiError::Database)?;

    Ok(StatusCode::NO_CONTENT)
}

/// Refresh access token using refresh token
/// POST /api/local-auth/refresh
async fn refresh(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<RefreshRequest>,
) -> Result<ResponseJson<ApiResponse<AuthTokensResponse>>, ApiError> {
    let pool = &deployment.db().pool;
    let jwt_secret = get_jwt_secret();

    // Validate refresh token
    let claims = validate_refresh_token(&payload.refresh_token, &jwt_secret)
        .map_err(|_| ApiError::Unauthorized)?;

    // Check if token exists in database and not expired
    let session = UserSession::find_by_refresh_token(pool, &payload.refresh_token)
        .await
        .map_err(ApiError::Database)?
        .ok_or(ApiError::Unauthorized)?;

    if session.is_expired() {
        // Clean up expired token
        UserSession::delete_by_refresh_token(pool, &payload.refresh_token)
            .await
            .ok();
        return Err(ApiError::Unauthorized);
    }

    // Get user
    let user_id = claims
        .sub
        .parse()
        .map_err(|_| ApiError::BadRequest("Invalid user ID in token".to_string()))?;
    let user = User::find_by_id(pool, user_id)
        .await
        .map_err(ApiError::Database)?
        .ok_or(ApiError::User(UserError::NotFound))?;

    // Delete old refresh token
    UserSession::delete_by_refresh_token(pool, &payload.refresh_token)
        .await
        .map_err(ApiError::Database)?;

    // Generate new tokens
    let access_token = create_access_token(
        user.id,
        &user.username,
        &user.role,
        &jwt_secret,
        ACCESS_TOKEN_EXPIRY_SECS,
    )
    .map_err(|e| ApiError::BadRequest(format!("Failed to create access token: {}", e)))?;

    let new_refresh_token =
        create_refresh_token(user.id, &jwt_secret, REFRESH_TOKEN_EXPIRY_SECS)
            .map_err(|e| ApiError::BadRequest(format!("Failed to create refresh token: {}", e)))?;

    // Store new refresh token
    let expires_at = Utc::now() + Duration::seconds(REFRESH_TOKEN_EXPIRY_SECS);
    UserSession::create(pool, user.id, &new_refresh_token, expires_at)
        .await
        .map_err(ApiError::Database)?;

    Ok(ResponseJson(ApiResponse::success(AuthTokensResponse {
        access_token,
        refresh_token: new_refresh_token,
        user: user.into(),
    })))
}

/// Get current authenticated user
/// GET /api/local-auth/me
async fn get_current_user(
    State(deployment): State<DeploymentImpl>,
    headers: axum::http::HeaderMap,
) -> Result<ResponseJson<ApiResponse<UserPublic>>, ApiError> {
    let pool = &deployment.db().pool;

    // Extract token from Authorization header
    let auth_header = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or(ApiError::Unauthorized)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(ApiError::Unauthorized)?;

    // Validate token
    let jwt_secret = get_jwt_secret();
    let claims = utils::jwt::validate_access_token(token, &jwt_secret)
        .map_err(|_| ApiError::Unauthorized)?;

    // Get user
    let user_id = claims
        .sub
        .parse()
        .map_err(|_| ApiError::BadRequest("Invalid user ID in token".to_string()))?;
    let user = User::find_by_id(pool, user_id)
        .await
        .map_err(ApiError::Database)?
        .ok_or(ApiError::User(UserError::NotFound))?;

    Ok(ResponseJson(ApiResponse::success(user.into())))
}

/// Check if initial setup is required (no users exist)
/// GET /api/local-auth/setup-status
async fn setup_status(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<SetupStatusResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    let user_count = User::count(pool).await.map_err(ApiError::Database)?;

    Ok(ResponseJson(ApiResponse::success(SetupStatusResponse {
        setup_required: user_count == 0,
        user_count,
    })))
}
