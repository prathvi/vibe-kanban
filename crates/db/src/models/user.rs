use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum UserError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("User not found")]
    NotFound,
    #[error("Username already exists")]
    UsernameExists,
    #[error("Email already exists")]
    EmailExists,
    #[error("Invalid credentials")]
    InvalidCredentials,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Admin,
    User,
}

impl std::fmt::Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UserRole::Admin => write!(f, "admin"),
            UserRole::User => write!(f, "user"),
        }
    }
}

impl std::str::FromStr for UserRole {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "admin" => Ok(UserRole::Admin),
            "user" => Ok(UserRole::User),
            _ => Err(format!("Invalid role: {}", s)),
        }
    }
}

#[derive(Debug, Clone, FromRow, Serialize, TS)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: Option<String>,
    #[serde(skip_serializing)]
    #[ts(skip)]
    pub password_hash: String,
    #[ts(type = "\"admin\" | \"user\"")]
    pub role: String,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "string")]
    pub updated_at: DateTime<Utc>,
}

impl User {
    pub fn role_enum(&self) -> UserRole {
        self.role.parse().unwrap_or(UserRole::User)
    }

    pub fn is_admin(&self) -> bool {
        self.role_enum() == UserRole::Admin
    }
}

/// User without sensitive fields, safe for API responses
#[derive(Debug, Clone, Serialize, TS)]
pub struct UserPublic {
    pub id: Uuid,
    pub username: String,
    pub email: Option<String>,
    #[ts(type = "\"admin\" | \"user\"")]
    pub role: String,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
}

impl From<User> for UserPublic {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            created_at: user.created_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateUser {
    pub username: String,
    pub email: Option<String>,
    pub password: String,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateUser {
    pub email: Option<String>,
    pub role: Option<String>,
}

impl User {
    pub async fn count(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar!(r#"SELECT COUNT(*) as "count!: i64" FROM users"#)
            .fetch_one(pool)
            .await
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            User,
            r#"SELECT id as "id!: Uuid",
                      username,
                      email,
                      password_hash,
                      role,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM users
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            User,
            r#"SELECT id as "id!: Uuid",
                      username,
                      email,
                      password_hash,
                      role,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM users
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_username(pool: &SqlitePool, username: &str) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            User,
            r#"SELECT id as "id!: Uuid",
                      username,
                      email,
                      password_hash,
                      role,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM users
               WHERE username = $1"#,
            username
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        username: &str,
        email: Option<&str>,
        password_hash: &str,
        role: UserRole,
    ) -> Result<Self, UserError> {
        let id = Uuid::new_v4();
        let role_str = role.to_string();

        // Check if username exists
        if Self::find_by_username(pool, username).await?.is_some() {
            return Err(UserError::UsernameExists);
        }

        sqlx::query_as!(
            User,
            r#"INSERT INTO users (id, username, email, password_hash, role)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id as "id!: Uuid",
                         username,
                         email,
                         password_hash,
                         role,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            username,
            email,
            password_hash,
            role_str
        )
        .fetch_one(pool)
        .await
        .map_err(UserError::Database)
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        payload: &UpdateUser,
    ) -> Result<Self, UserError> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(UserError::NotFound)?;

        let email = payload.email.clone().or(existing.email);
        let role = payload.role.clone().unwrap_or(existing.role);

        sqlx::query_as!(
            User,
            r#"UPDATE users
               SET email = $2, role = $3, updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         username,
                         email,
                         password_hash,
                         role,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            email,
            role
        )
        .fetch_one(pool)
        .await
        .map_err(UserError::Database)
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM users WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn update_password(
        pool: &SqlitePool,
        id: Uuid,
        password_hash: &str,
    ) -> Result<(), UserError> {
        let rows = sqlx::query!(
            "UPDATE users SET password_hash = $1, updated_at = datetime('now', 'subsec') WHERE id = $2",
            password_hash,
            id
        )
        .execute(pool)
        .await
        .map_err(UserError::Database)?
        .rows_affected();

        if rows == 0 {
            return Err(UserError::NotFound);
        }
        Ok(())
    }
}

/// User session for refresh tokens
#[derive(Debug, Clone, FromRow)]
pub struct UserSession {
    pub id: Uuid,
    pub user_id: Uuid,
    pub refresh_token: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

impl UserSession {
    pub async fn create(
        pool: &SqlitePool,
        user_id: Uuid,
        refresh_token: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        sqlx::query_as!(
            UserSession,
            r#"INSERT INTO user_sessions (id, user_id, refresh_token, expires_at)
               VALUES ($1, $2, $3, $4)
               RETURNING id as "id!: Uuid",
                         user_id as "user_id!: Uuid",
                         refresh_token,
                         expires_at as "expires_at!: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>""#,
            id,
            user_id,
            refresh_token,
            expires_at
        )
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_refresh_token(
        pool: &SqlitePool,
        refresh_token: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            UserSession,
            r#"SELECT id as "id!: Uuid",
                      user_id as "user_id!: Uuid",
                      refresh_token,
                      expires_at as "expires_at!: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>"
               FROM user_sessions
               WHERE refresh_token = $1"#,
            refresh_token
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn delete_by_refresh_token(
        pool: &SqlitePool,
        refresh_token: &str,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM user_sessions WHERE refresh_token = $1",
            refresh_token
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete_by_user_id(pool: &SqlitePool, user_id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM user_sessions WHERE user_id = $1", user_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete_expired(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM user_sessions WHERE expires_at < datetime('now')"
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    pub fn is_expired(&self) -> bool {
        self.expires_at < Utc::now()
    }
}
