use anyhow::Context;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router, response::IntoResponse};
use my_farm_core::{
    CatalogDocument, CatalogResponse, CommandRequest, CommandResponse, FarmResponse, FarmState,
    FarmView, HealthResponse, WebsocketClientMessage, WebsocketError, WebsocketServerMessage,
    apply_command, apply_elapsed, farm_view, new_farm,
};
use serde::Serialize;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::{Mutex, broadcast};
use tower_http::cors::CorsLayer;

const FARM_ID: &str = "local-farm";

#[derive(Clone)]
pub struct AppState {
    pool: SqlitePool,
    catalog: CatalogDocument,
    farm_updates: broadcast::Sender<WebsocketServerMessage>,
    mutation_lock: Arc<Mutex<()>>,
}

#[derive(Debug, Serialize)]
pub struct ApiError {
    pub error: String,
}

impl AppState {
    pub fn new(pool: SqlitePool) -> Self {
        let (farm_updates, _) = broadcast::channel(32);
        Self {
            pool,
            catalog: CatalogDocument::default_catalog(),
            farm_updates,
            mutation_lock: Arc::new(Mutex::new(())),
        }
    }
}

pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/catalog", get(get_catalog))
        .route("/api/farm", get(get_farm))
        .route("/api/gameplay", get(gameplay_websocket))
        .route("/api/farm/reset", post(reset_farm))
        .route("/api/commands", post(post_command))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

pub async fn connect_database(database_url: &str) -> anyhow::Result<SqlitePool> {
    let options = SqliteConnectOptions::from_str(database_url)
        .with_context(|| format!("invalid SQLite URL: {database_url}"))?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .context("connect SQLite database")?;
    sqlx::migrate!("../../migrations")
        .run(&pool)
        .await
        .context("run SQLite migrations")?;
    Ok(pool)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "my-farm".to_owned(),
    })
}

async fn get_catalog(State(state): State<AppState>) -> Json<CatalogResponse> {
    Json(CatalogResponse {
        catalog: state.catalog,
    })
}

async fn get_farm(
    State(state): State<AppState>,
) -> Result<Json<FarmResponse>, (StatusCode, Json<ApiError>)> {
    let now_ms = now_ms();
    let (version, mut farm) = load_or_create_farm(&state, now_ms).await?;
    apply_elapsed(&mut farm, &state.catalog, now_ms);
    Ok(Json(FarmResponse {
        version,
        view: farm_view(&farm, &state.catalog),
    }))
}

async fn gameplay_websocket(
    State(state): State<AppState>,
    websocket: WebSocketUpgrade,
) -> impl IntoResponse {
    websocket.on_upgrade(|socket| gameplay_session(socket, state))
}

async fn gameplay_session(mut socket: WebSocket, state: AppState) {
    let mut farm_updates = state.farm_updates.subscribe();
    if let Err(error) = send_bootstrap(&mut socket, &state).await {
        let _ = send_websocket_message(
            &mut socket,
            &WebsocketServerMessage::Error {
                error: WebsocketError {
                    code: "bootstrap_failed".to_owned(),
                    message: error.error,
                },
            },
        )
        .await;
        return;
    }

    loop {
        tokio::select! {
            message = socket.recv() => {
                let Some(message) = message else {
                    break;
                };
                let Ok(message) = message else {
                    break;
                };
                if matches!(message, Message::Close(_)) {
                    break;
                }
                if let Err(error) = handle_websocket_client_message(&mut socket, &state, message).await {
                    let _ = send_websocket_message(
                        &mut socket,
                        &WebsocketServerMessage::Error {
                            error: WebsocketError {
                                code: "client_message_failed".to_owned(),
                                message: error.error,
                            },
                        },
                    )
                    .await;
                }
            }
            update = farm_updates.recv() => {
                match update {
                    Ok(message) => {
                        if send_websocket_message(&mut socket, &message).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        if let Err(error) = send_current_farm_snapshot(&mut socket, &state).await {
                            let _ = send_websocket_message(
                                &mut socket,
                                &WebsocketServerMessage::Error {
                                    error: WebsocketError {
                                        code: "resync_failed".to_owned(),
                                        message: error.error,
                                    },
                                },
                            )
                            .await;
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }
}

async fn handle_websocket_client_message(
    socket: &mut WebSocket,
    state: &AppState,
    message: Message,
) -> Result<(), ApiError> {
    let Message::Text(payload) = message else {
        return Ok(());
    };
    let message: WebsocketClientMessage =
        serde_json::from_str(&payload).map_err(|error| ApiError {
            error: format!("invalid websocket client message: {error}"),
        })?;

    match message {
        WebsocketClientMessage::SubmitCommand {
            request_id,
            expected_version,
            command,
        } => {
            let request = CommandRequest {
                expected_version,
                command,
            };
            let response = apply_command_request(state, &request)
                .await
                .map_err(api_error)?;
            send_websocket_message(
                socket,
                &WebsocketServerMessage::CommandResponse {
                    request_id,
                    accepted: response.accepted,
                    version: response.version,
                    events: response.events,
                    view: response.view.clone(),
                    error: response.error,
                },
            )
            .await?;
            if response.accepted {
                let _ = state
                    .farm_updates
                    .send(WebsocketServerMessage::FarmSnapshot {
                        version: response.version,
                        view: response.view,
                    });
            }
        }
        WebsocketClientMessage::ResetFarm { request_id } => {
            let (version, view) = reset_farm_state(state).await.map_err(api_error)?;
            send_websocket_message(
                socket,
                &WebsocketServerMessage::CommandResponse {
                    request_id,
                    accepted: true,
                    version,
                    events: Vec::new(),
                    view: view.clone(),
                    error: None,
                },
            )
            .await?;
            let _ = state
                .farm_updates
                .send(WebsocketServerMessage::FarmSnapshot { version, view });
        }
    }

    Ok(())
}

async fn send_bootstrap(socket: &mut WebSocket, state: &AppState) -> Result<(), ApiError> {
    let now_ms = now_ms();
    let (version, mut farm) = load_or_create_farm(state, now_ms)
        .await
        .map_err(api_error)?;
    apply_elapsed(&mut farm, &state.catalog, now_ms);

    send_websocket_message(
        socket,
        &WebsocketServerMessage::Catalog {
            catalog: state.catalog.clone(),
        },
    )
    .await?;
    send_websocket_message(
        socket,
        &WebsocketServerMessage::FarmSnapshot {
            version,
            view: farm_view(&farm, &state.catalog),
        },
    )
    .await?;
    Ok(())
}

async fn send_current_farm_snapshot(
    socket: &mut WebSocket,
    state: &AppState,
) -> Result<(), ApiError> {
    let now_ms = now_ms();
    let (version, mut farm) = load_or_create_farm(state, now_ms)
        .await
        .map_err(api_error)?;
    apply_elapsed(&mut farm, &state.catalog, now_ms);
    send_websocket_message(
        socket,
        &WebsocketServerMessage::FarmSnapshot {
            version,
            view: farm_view(&farm, &state.catalog),
        },
    )
    .await
}

async fn send_websocket_message(
    socket: &mut WebSocket,
    message: &WebsocketServerMessage,
) -> Result<(), ApiError> {
    let payload = serde_json::to_string(message).map_err(|error| ApiError {
        error: error.to_string(),
    })?;
    socket
        .send(Message::Text(payload.into()))
        .await
        .map_err(|error| ApiError {
            error: format!("websocket send error: {error}"),
        })
}

async fn reset_farm(
    State(state): State<AppState>,
) -> Result<Json<FarmResponse>, (StatusCode, Json<ApiError>)> {
    let (version, view) = reset_farm_state(&state).await?;
    Ok(Json(FarmResponse { version, view }))
}

async fn post_command(
    State(state): State<AppState>,
    request: Result<Json<CommandRequest>, JsonRejection>,
) -> Result<Json<CommandResponse>, (StatusCode, Json<ApiError>)> {
    let Json(request) = request.map_err(json_rejection)?;
    Ok(Json(apply_command_request(&state, &request).await?))
}

async fn apply_command_request(
    state: &AppState,
    request: &CommandRequest,
) -> Result<CommandResponse, (StatusCode, Json<ApiError>)> {
    let _lock = state.mutation_lock.lock().await;
    let now_ms = now_ms();
    let (version, mut farm) = load_or_create_farm(&state, now_ms).await?;

    if request.expected_version != version {
        apply_elapsed(&mut farm, &state.catalog, now_ms);
        return Ok(CommandResponse {
            accepted: false,
            version,
            events: Vec::new(),
            view: farm_view(&farm, &state.catalog),
            error: Some(format!(
                "version mismatch: expected {}, found {}",
                request.expected_version, version
            )),
        });
    }

    let outcome = apply_command(&mut farm, &state.catalog, request.command.clone(), now_ms);
    let next_version = if outcome.accepted {
        let next = version + 1;
        save_farm(&state.pool, next, &farm, now_ms).await?;
        append_journal(
            &state.pool,
            next,
            &request,
            &serde_json::to_value(&outcome).map_err(internal_error)?,
            now_ms,
        )
        .await?;
        next
    } else {
        version
    };

    Ok(CommandResponse {
        accepted: outcome.accepted,
        version: next_version,
        events: outcome.events,
        view: farm_view(&farm, &state.catalog),
        error: outcome.error.map(|error| error.message),
    })
}

async fn reset_farm_state(
    state: &AppState,
) -> Result<(u64, FarmView), (StatusCode, Json<ApiError>)> {
    let _lock = state.mutation_lock.lock().await;
    let now_ms = now_ms();
    let farm = new_farm(now_ms, &state.catalog);
    save_farm(&state.pool, 0, &farm, now_ms).await?;
    Ok((0, farm_view(&farm, &state.catalog)))
}

async fn load_or_create_farm(
    state: &AppState,
    now_ms: i64,
) -> Result<(u64, FarmState), (StatusCode, Json<ApiError>)> {
    if let Some((version, farm)) = load_farm(&state.pool).await? {
        return Ok((version, farm));
    }
    let farm = new_farm(now_ms, &state.catalog);
    save_farm(&state.pool, 0, &farm, now_ms).await?;
    Ok((0, farm))
}

async fn load_farm(
    pool: &SqlitePool,
) -> Result<Option<(u64, FarmState)>, (StatusCode, Json<ApiError>)> {
    let row = sqlx::query("SELECT version, state_json FROM farm_save WHERE id = ?")
        .bind(FARM_ID)
        .fetch_optional(pool)
        .await
        .map_err(database_error)?;
    let Some(row) = row else {
        return Ok(None);
    };
    let version = row.get::<i64, _>("version") as u64;
    let state_json = row.get::<String, _>("state_json");
    let farm = serde_json::from_str(&state_json).map_err(internal_error)?;
    Ok(Some((version, farm)))
}

async fn save_farm(
    pool: &SqlitePool,
    version: u64,
    farm: &FarmState,
    updated_at_ms: i64,
) -> Result<(), (StatusCode, Json<ApiError>)> {
    let state_json = serde_json::to_string(farm).map_err(internal_error)?;
    sqlx::query(
        "INSERT INTO farm_save (id, version, state_json, updated_at_ms)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           version = excluded.version,
           state_json = excluded.state_json,
           updated_at_ms = excluded.updated_at_ms",
    )
    .bind(FARM_ID)
    .bind(version as i64)
    .bind(state_json)
    .bind(updated_at_ms)
    .execute(pool)
    .await
    .map_err(database_error)?;
    Ok(())
}

async fn append_journal(
    pool: &SqlitePool,
    version: u64,
    request: &CommandRequest,
    result: &serde_json::Value,
    created_at_ms: i64,
) -> Result<(), (StatusCode, Json<ApiError>)> {
    let command_json = serde_json::to_string(request).map_err(internal_error)?;
    let result_json = serde_json::to_string(result).map_err(internal_error)?;
    sqlx::query(
        "INSERT INTO command_journal (version, command_json, result_json, created_at_ms)
         VALUES (?, ?, ?, ?)",
    )
    .bind(version as i64)
    .bind(command_json)
    .bind(result_json)
    .bind(created_at_ms)
    .execute(pool)
    .await
    .map_err(database_error)?;
    Ok(())
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn database_error(error: sqlx::Error) -> (StatusCode, Json<ApiError>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ApiError {
            error: format!("database error: {error}"),
        }),
    )
}

fn json_rejection(error: JsonRejection) -> (StatusCode, Json<ApiError>) {
    (
        error.status(),
        Json(ApiError {
            error: error.body_text(),
        }),
    )
}

fn internal_error(error: impl std::fmt::Display) -> (StatusCode, Json<ApiError>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ApiError {
            error: error.to_string(),
        }),
    )
}

fn api_error((_, Json(error)): (StatusCode, Json<ApiError>)) -> ApiError {
    error
}
