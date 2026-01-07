use chrono::{DateTime, Duration, Utc};
use jsonwebtoken::{
    DecodingKey, EncodingKey, Header, Validation, dangerous::insecure_decode, decode, encode,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum TokenClaimsError {
    #[error("failed to decode JWT: {0}")]
    Decode(#[from] jsonwebtoken::errors::Error),
    #[error("missing `exp` claim in token")]
    MissingExpiration,
    #[error("invalid `exp` value `{0}`")]
    InvalidExpiration(i64),
    #[error("missing `sub` claim in token")]
    MissingSubject,
    #[error("invalid `sub` value: {0}")]
    InvalidSubject(String),
    #[error("token has expired")]
    Expired,
    #[error("invalid token")]
    InvalidToken,
}

#[derive(Debug, Deserialize)]
struct ExpClaim {
    exp: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct SubClaim {
    sub: Option<String>,
}

/// Claims for local authentication JWT tokens
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalAuthClaims {
    /// User ID (subject)
    pub sub: String,
    /// Username
    pub username: String,
    /// User role ("admin" or "user")
    pub role: String,
    /// Expiration timestamp
    pub exp: i64,
    /// Issued at timestamp
    pub iat: i64,
}

/// Claims for refresh tokens (minimal)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RefreshTokenClaims {
    /// User ID (subject)
    pub sub: String,
    /// Expiration timestamp
    pub exp: i64,
    /// Issued at timestamp
    pub iat: i64,
    /// Token type
    pub token_type: String,
}

/// Extract the expiration timestamp from a JWT without verifying its signature.
pub fn extract_expiration(token: &str) -> Result<DateTime<Utc>, TokenClaimsError> {
    let data = insecure_decode::<ExpClaim>(token)?;
    let exp = data.claims.exp.ok_or(TokenClaimsError::MissingExpiration)?;
    DateTime::from_timestamp(exp, 0).ok_or(TokenClaimsError::InvalidExpiration(exp))
}

/// Extract the subject (user ID) from a JWT without verifying its signature.
pub fn extract_subject(token: &str) -> Result<Uuid, TokenClaimsError> {
    let data = insecure_decode::<SubClaim>(token)?;
    let sub = data.claims.sub.ok_or(TokenClaimsError::MissingSubject)?;
    Uuid::parse_str(&sub).map_err(|_| TokenClaimsError::InvalidSubject(sub))
}

/// Create an access token for local authentication
pub fn create_access_token(
    user_id: Uuid,
    username: &str,
    role: &str,
    secret: &str,
    expires_in_secs: i64,
) -> Result<String, TokenClaimsError> {
    let now = Utc::now();
    let exp = now + Duration::seconds(expires_in_secs);

    let claims = LocalAuthClaims {
        sub: user_id.to_string(),
        username: username.to_string(),
        role: role.to_string(),
        exp: exp.timestamp(),
        iat: now.timestamp(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(TokenClaimsError::Decode)
}

/// Create a refresh token
pub fn create_refresh_token(
    user_id: Uuid,
    secret: &str,
    expires_in_secs: i64,
) -> Result<String, TokenClaimsError> {
    let now = Utc::now();
    let exp = now + Duration::seconds(expires_in_secs);

    let claims = RefreshTokenClaims {
        sub: user_id.to_string(),
        exp: exp.timestamp(),
        iat: now.timestamp(),
        token_type: "refresh".to_string(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(TokenClaimsError::Decode)
}

/// Validate an access token and return the claims
pub fn validate_access_token(
    token: &str,
    secret: &str,
) -> Result<LocalAuthClaims, TokenClaimsError> {
    let token_data = decode::<LocalAuthClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => TokenClaimsError::Expired,
        _ => TokenClaimsError::Decode(e),
    })?;

    Ok(token_data.claims)
}

/// Validate a refresh token and return the claims
pub fn validate_refresh_token(
    token: &str,
    secret: &str,
) -> Result<RefreshTokenClaims, TokenClaimsError> {
    let token_data = decode::<RefreshTokenClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => TokenClaimsError::Expired,
        _ => TokenClaimsError::Decode(e),
    })?;

    if token_data.claims.token_type != "refresh" {
        return Err(TokenClaimsError::InvalidToken);
    }

    Ok(token_data.claims)
}

/// Generate a random JWT secret
pub fn generate_jwt_secret() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..64)
        .map(|_| rng.sample(rand::distributions::Alphanumeric) as char)
        .collect()
}

/// Access token expiration time in seconds (15 minutes)
pub const ACCESS_TOKEN_EXPIRY_SECS: i64 = 15 * 60;

/// Refresh token expiration time in seconds (7 days)
pub const REFRESH_TOKEN_EXPIRY_SECS: i64 = 7 * 24 * 60 * 60;
