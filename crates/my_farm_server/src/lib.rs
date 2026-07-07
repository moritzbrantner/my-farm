use anyhow::Context;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router, response::IntoResponse};
use my_farm_core::{
    CatalogDocument, CatalogResponse, CommandRequest, CommandResponse, FarmNotice, FarmNoticeKind,
    FarmResponse, FarmState, FarmView, HealthResponse, WebsocketClientMessage, WebsocketError,
    WebsocketServerMessage, apply_command, apply_elapsed, farm_view, new_farm,
};
use serde::Serialize;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::{Mutex, broadcast};
use tokio::time::{Duration, MissedTickBehavior};
use tower_http::cors::CorsLayer;

const FARM_ID: &str = "local-farm";
const ELAPSED_SNAPSHOT_TICK_MS: u64 = 100;

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
    let (version, mut farm, notice) = load_or_create_farm(&state, now_ms).await?;
    apply_elapsed(&mut farm, &state.catalog, now_ms);
    Ok(Json(FarmResponse {
        version,
        view: farm_view(&farm, &state.catalog),
        notice,
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
    let mut elapsed_snapshot_tick =
        tokio::time::interval(Duration::from_millis(ELAPSED_SNAPSHOT_TICK_MS));
    elapsed_snapshot_tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
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
            _ = elapsed_snapshot_tick.tick() => {
                if let Err(error) = broadcast_elapsed_snapshot_if_visible(&state).await {
                    let _ = send_websocket_message(
                        &mut socket,
                        &WebsocketServerMessage::Error {
                            error: WebsocketError {
                                code: "elapsed_snapshot_failed".to_owned(),
                                message: error.error,
                            },
                        },
                    )
                    .await;
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
                    notice: response.notice.clone(),
                },
            )
            .await?;
            if response.accepted {
                let _ = state
                    .farm_updates
                    .send(WebsocketServerMessage::FarmSnapshot {
                        version: response.version,
                        view: response.view,
                        notice: None,
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
                    notice: None,
                },
            )
            .await?;
            let _ = state
                .farm_updates
                .send(WebsocketServerMessage::FarmSnapshot {
                    version,
                    view,
                    notice: None,
                });
        }
    }

    Ok(())
}

async fn send_bootstrap(socket: &mut WebSocket, state: &AppState) -> Result<(), ApiError> {
    let now_ms = now_ms();
    let (version, mut farm, notice) = load_or_create_farm(state, now_ms)
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
            notice,
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
    let (version, mut farm, notice) = load_or_create_farm(state, now_ms)
        .await
        .map_err(api_error)?;
    apply_elapsed(&mut farm, &state.catalog, now_ms);
    send_websocket_message(
        socket,
        &WebsocketServerMessage::FarmSnapshot {
            version,
            view: farm_view(&farm, &state.catalog),
            notice,
        },
    )
    .await
}

async fn broadcast_elapsed_snapshot_if_visible(state: &AppState) -> Result<(), ApiError> {
    let _lock = state.mutation_lock.lock().await;
    let now_ms = now_ms();
    let (version, mut farm, _notice) = load_or_create_farm(state, now_ms)
        .await
        .map_err(api_error)?;
    let last_update_ms = farm.last_update_ms;
    if !has_elapsed_visible_ready_transition(&farm, last_update_ms, now_ms) {
        return Ok(());
    }

    apply_elapsed(&mut farm, &state.catalog, now_ms);
    let next_version = version + 1;
    save_farm(&state.pool, next_version, &farm, now_ms)
        .await
        .map_err(api_error)?;
    let _ = state
        .farm_updates
        .send(WebsocketServerMessage::FarmSnapshot {
            version: next_version,
            view: farm_view(&farm, &state.catalog),
            notice: None,
        });
    Ok(())
}

fn has_elapsed_visible_ready_transition(
    farm: &FarmState,
    last_update_ms: i64,
    now_ms: i64,
) -> bool {
    if now_ms <= last_update_ms {
        return false;
    }

    let crop_ready = farm.field_plots.iter().any(|plot| {
        plot.crop
            .as_ref()
            .is_some_and(|crop| elapsed_crossed_ready_at(crop.ready_at_ms, last_update_ms, now_ms))
    });
    let resident_task_ready = farm
        .resident_task_queues
        .iter()
        .any(|(resident_id, queue)| {
            !farm.blocked_resident_tasks.contains_key(resident_id)
                && queue.first().is_some_and(|task| task.ready_at_ms <= now_ms)
        });
    let machine_ready = farm.machines.iter().any(|machine| {
        machine
            .queue
            .first()
            .is_some_and(|job| elapsed_crossed_ready_at(job.ready_at_ms, last_update_ms, now_ms))
    });
    let animal_ready = farm.shelters.iter().any(|shelter| {
        shelter.animals.iter().any(|animal| {
            matches!(
                animal.state,
                my_farm_core::AnimalState::Producing { ready_at_ms, .. }
                    if elapsed_crossed_ready_at(ready_at_ms, last_update_ms, now_ms)
            )
        })
    });

    crop_ready || resident_task_ready || machine_ready || animal_ready
}

fn elapsed_crossed_ready_at(ready_at_ms: i64, last_update_ms: i64, now_ms: i64) -> bool {
    last_update_ms < ready_at_ms && ready_at_ms <= now_ms
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
    Ok(Json(FarmResponse {
        version,
        view,
        notice: None,
    }))
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
    let (version, mut farm, notice) = load_or_create_farm(&state, now_ms).await?;

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
            notice,
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
        notice,
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
) -> Result<(u64, FarmState, Option<FarmNotice>), (StatusCode, Json<ApiError>)> {
    match load_farm(&state.pool).await? {
        FarmLoadResult::Existing(version, farm) => return Ok((version, farm, None)),
        FarmLoadResult::Missing => {}
        FarmLoadResult::Incompatible => {
            let farm = new_farm(now_ms, &state.catalog);
            save_farm(&state.pool, 0, &farm, now_ms).await?;
            return Ok((0, farm, Some(save_reset_notice())));
        }
    }
    let farm = new_farm(now_ms, &state.catalog);
    save_farm(&state.pool, 0, &farm, now_ms).await?;
    Ok((0, farm, None))
}

enum FarmLoadResult {
    Existing(u64, FarmState),
    Missing,
    Incompatible,
}

async fn load_farm(pool: &SqlitePool) -> Result<FarmLoadResult, (StatusCode, Json<ApiError>)> {
    let row = sqlx::query("SELECT version, state_json FROM farm_save WHERE id = ?")
        .bind(FARM_ID)
        .fetch_optional(pool)
        .await
        .map_err(database_error)?;
    let Some(row) = row else {
        return Ok(FarmLoadResult::Missing);
    };
    let version = row.get::<i64, _>("version") as u64;
    let state_json = row.get::<String, _>("state_json");
    match serde_json::from_str(&state_json) {
        Ok(farm) => Ok(FarmLoadResult::Existing(version, farm)),
        Err(_) => Ok(FarmLoadResult::Incompatible),
    }
}

fn save_reset_notice() -> FarmNotice {
    FarmNotice {
        kind: FarmNoticeKind::SaveReset,
        message: "Saved farm data was reset because it used an older prototype format.".to_owned(),
    }
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
