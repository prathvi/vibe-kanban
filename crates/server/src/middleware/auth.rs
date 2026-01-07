use axum::{
    extract::FromRequestParts,
    http::{StatusCode, request::Parts},
    response::{IntoResponse, Response},
};
use db::models::user::UserRole;
use uuid::Uuid;

use crate::DeploymentImpl;

/// Authenticated user extracted from the request
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: Uuid,
    pub username: String,
    pub role: UserRole,
}

impl AuthUser {
    pub fn is_admin(&self) -> bool {
        self.role == UserRole::Admin
    }
}

/// Error type for authentication failures
#[derive(Debug)]
pub enum AuthError {
    MissingToken,
    InvalidToken,
    UserNotFound,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AuthError::MissingToken => (StatusCode::UNAUTHORIZED, "Missing authorization token"),
            AuthError::InvalidToken => (StatusCode::UNAUTHORIZED, "Invalid or expired token"),
            AuthError::UserNotFound => (StatusCode::UNAUTHORIZED, "User not found"),
        };

        let body = serde_json::json!({
            "success": false,
            "error": message
        });

        (status, axum::Json(body)).into_response()
    }
}

/// Get JWT secret from environment
fn get_jwt_secret() -> String {
    std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "development-jwt-secret-change-in-production".to_string())
}

/// Extractor that requires authentication
/// Use this in route handlers: `async fn handler(auth: AuthUser, ...) -> ...`
impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
    DeploymentImpl: FromRequestParts<S>,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Extract Authorization header
        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            .ok_or(AuthError::MissingToken)?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or(AuthError::InvalidToken)?;

        // Validate token
        let jwt_secret = get_jwt_secret();
        let claims = utils::jwt::validate_access_token(token, &jwt_secret)
            .map_err(|_| AuthError::InvalidToken)?;

        // Parse user ID
        let user_id: Uuid = claims.sub.parse().map_err(|_| AuthError::InvalidToken)?;

        // Parse role
        let role = claims.role.parse().map_err(|_| AuthError::InvalidToken)?;

        Ok(AuthUser {
            id: user_id,
            username: claims.username,
            role,
        })
    }
}

/// Extractor that requires admin role
/// Use this in route handlers: `async fn handler(admin: RequireAdmin, ...) -> ...`
#[derive(Debug, Clone)]
pub struct RequireAdmin(pub AuthUser);

impl<S> FromRequestParts<S> for RequireAdmin
where
    S: Send + Sync,
    DeploymentImpl: FromRequestParts<S>,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let auth_user = AuthUser::from_request_parts(parts, state)
            .await
            .map_err(|e| e.into_response())?;

        if !auth_user.is_admin() {
            let body = serde_json::json!({
                "success": false,
                "error": "Admin access required"
            });
            return Err((StatusCode::FORBIDDEN, axum::Json(body)).into_response());
        }

        Ok(RequireAdmin(auth_user))
    }
}

/// Optional authentication extractor
/// Use this when authentication is optional: `async fn handler(auth: OptionalAuth, ...) -> ...`
#[derive(Debug, Clone)]
pub struct OptionalAuth(pub Option<AuthUser>);

impl<S> FromRequestParts<S> for OptionalAuth
where
    S: Send + Sync,
    DeploymentImpl: FromRequestParts<S>,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let auth_user = AuthUser::from_request_parts(parts, state).await.ok();
        Ok(OptionalAuth(auth_user))
    }
}
