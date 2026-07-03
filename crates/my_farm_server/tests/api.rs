use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode, header};
use futures_util::StreamExt;
use my_farm_core::{
    CatalogDocument, CatalogResponse, CommandRequest, CommandResponse, FarmCommand, FarmEvent,
    FarmResponse, FarmState, StorageKind, WebsocketServerMessage, update_level,
};
use my_farm_server::{AppState, app, connect_database};
use tower::ServiceExt;

#[tokio::test]
async fn health_endpoint_remains_available() {
    let app = test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let health: my_farm_core::HealthResponse = json_body(response).await;
    assert!(health.ok);
    assert_eq!(health.service, "my-farm");
}

#[tokio::test]
async fn get_farm_creates_single_local_farm() {
    let app = test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/farm")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let farm: FarmResponse = json_body(response).await;
    assert_eq!(farm.version, 0);
    assert_eq!(farm.view.level, 1);
    assert_eq!(farm.view.field_plots.len(), 6);
}

#[tokio::test]
async fn gameplay_websocket_bootstraps_catalog_and_farm_snapshot() {
    let app = test_app().await;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    let (mut socket, response) =
        tokio_tungstenite::connect_async(format!("ws://{addr}/api/gameplay"))
            .await
            .unwrap();
    assert_eq!(response.status(), StatusCode::SWITCHING_PROTOCOLS);

    let catalog_message: WebsocketServerMessage = websocket_json(&mut socket).await;
    let snapshot_message: WebsocketServerMessage = websocket_json(&mut socket).await;

    let WebsocketServerMessage::Catalog { catalog } = catalog_message else {
        panic!("expected catalog bootstrap message");
    };
    assert!(catalog.items.iter().any(|item| item.id == "wheat"));

    let WebsocketServerMessage::FarmSnapshot { version, view } = snapshot_message else {
        panic!("expected farm snapshot bootstrap message");
    };
    assert_eq!(version, 0);
    assert_eq!(view.level, 1);
    assert_eq!(view.field_plots.len(), 6);

    server.abort();
}

#[tokio::test]
async fn post_command_persists_state_and_rejects_stale_versions() {
    let app = test_app().await;
    let initial = get_farm(app.clone()).await;
    let request = CommandRequest {
        expected_version: initial.version,
        command: FarmCommand::PlantCrop {
            plot_id: "plot-1".to_owned(),
            crop_id: "wheat".to_owned(),
        },
    };
    let planted = post_command(app.clone(), request).await;
    assert!(planted.accepted);
    assert_eq!(planted.version, 1);
    assert_eq!(
        planted
            .view
            .inventory
            .iter()
            .find(|item| item.item_id == "wheat")
            .unwrap()
            .quantity,
        5
    );

    let stale = post_command(
        app,
        CommandRequest {
            expected_version: 0,
            command: FarmCommand::PlantCrop {
                plot_id: "plot-2".to_owned(),
                crop_id: "wheat".to_owned(),
            },
        },
    )
    .await;
    assert!(!stale.accepted);
    assert_eq!(stale.version, 1);
    assert!(stale.error.unwrap().contains("version mismatch"));
}

#[tokio::test]
async fn catalog_exposes_market_items() {
    let app = test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/catalog")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let catalog: CatalogResponse = json_body(response).await;
    assert_eq!(
        catalog.catalog.market_items.len(),
        catalog.catalog.items.len()
    );
    assert!(
        catalog
            .catalog
            .market_items
            .iter()
            .any(|item| item.item_id == "wheat" && item.buy_price == Some(4))
    );
}

#[tokio::test]
async fn post_market_command_persists_state_and_journal_through_restart() {
    let tempdir = tempfile::tempdir().unwrap();
    let url = format!("sqlite://{}", tempdir.path().join("farm.db").display());
    let pool = connect_database(&url).await.unwrap();
    let router = app(AppState::new(pool.clone()));
    let initial = get_farm(router.clone()).await;

    let bought = post_command(
        router.clone(),
        CommandRequest {
            expected_version: initial.version,
            command: FarmCommand::BuyMarketItem {
                item_id: "wheat".to_owned(),
                quantity: 2,
            },
        },
    )
    .await;

    assert!(bought.accepted);
    assert_eq!(bought.version, 1);
    assert_eq!(inventory_quantity(&bought, "wheat"), 8);
    assert_eq!(bought.view.coins, 172);
    assert!(bought.events.contains(&FarmEvent::MarketItemBought {
        item_id: "wheat".to_owned(),
        quantity: 2,
        coins_spent: 8,
    }));

    let journal_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM command_journal WHERE command_json LIKE ?")
            .bind("%buy_market_item%")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(journal_count, 1);

    drop(router);
    pool.close().await;

    let restarted_pool = connect_database(&url).await.unwrap();
    let restarted_app = app(AppState::new(restarted_pool.clone()));
    let reloaded = get_farm(restarted_app).await;

    assert_eq!(reloaded.version, 1);
    assert_eq!(inventory_quantity_from_farm(&reloaded, "wheat"), 8);
    assert_eq!(reloaded.view.coins, 172);
    restarted_pool.close().await;
}

#[tokio::test]
async fn post_storage_upgrade_persists_state_and_journal_through_restart() {
    let tempdir = tempfile::tempdir().unwrap();
    let url = format!("sqlite://{}", tempdir.path().join("farm.db").display());
    let pool = connect_database(&url).await.unwrap();
    let router = app(AppState::new(pool.clone()));
    let initial = get_farm(router.clone()).await;

    let catalog = CatalogDocument::default_catalog();
    let mut farm = load_saved_farm(&pool).await;
    farm.xp = 4;
    update_level(&mut farm, &catalog);
    save_test_farm(&pool, initial.version, &farm).await;

    let upgraded = post_command(
        router.clone(),
        CommandRequest {
            expected_version: initial.version,
            command: FarmCommand::UpgradeStorage {
                storage_kind: StorageKind::Silo,
            },
        },
    )
    .await;

    assert!(upgraded.accepted);
    assert_eq!(upgraded.version, 1);
    assert_eq!(upgraded.view.silo_upgrade_tier, 1);
    assert_eq!(upgraded.view.silo_capacity, 60);
    assert_eq!(upgraded.view.coins, 120);
    assert!(upgraded.events.contains(&FarmEvent::StorageUpgraded {
        storage_kind: StorageKind::Silo,
        tier: 1,
        capacity: 60,
    }));

    let journal_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM command_journal WHERE command_json LIKE ?")
            .bind("%upgrade_storage%")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(journal_count, 1);

    drop(router);
    pool.close().await;

    let restarted_pool = connect_database(&url).await.unwrap();
    let restarted_app = app(AppState::new(restarted_pool.clone()));
    let reloaded = get_farm(restarted_app).await;

    assert_eq!(reloaded.version, 1);
    assert_eq!(reloaded.view.silo_upgrade_tier, 1);
    assert_eq!(reloaded.view.silo_capacity, 60);
    assert_eq!(reloaded.view.coins, 120);
    restarted_pool.close().await;
}

#[tokio::test]
async fn post_command_reports_invalid_command_json_as_json() {
    let app = test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/commands")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"expected_version":0,"command":{"type":"unknown_command"}}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    assert!(content_type.starts_with("application/json"));
    let body: serde_json::Value = json_body(response).await;
    assert!(body["error"].as_str().unwrap().contains("unknown_command"));
}

async fn test_app() -> axum::Router {
    let url = format!(
        "sqlite://{}",
        tempfile::NamedTempFile::new().unwrap().path().display()
    );
    let pool = connect_database(&url).await.unwrap();
    app(AppState::new(pool))
}

async fn get_farm(app: axum::Router) -> FarmResponse {
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/farm")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    json_body(response).await
}

async fn post_command(app: axum::Router, request: CommandRequest) -> CommandResponse {
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/commands")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    json_body(response).await
}

fn inventory_quantity(response: &CommandResponse, item_id: &str) -> u32 {
    response
        .view
        .inventory
        .iter()
        .find(|item| item.item_id == item_id)
        .map(|item| item.quantity)
        .unwrap_or(0)
}

fn inventory_quantity_from_farm(response: &FarmResponse, item_id: &str) -> u32 {
    response
        .view
        .inventory
        .iter()
        .find(|item| item.item_id == item_id)
        .map(|item| item.quantity)
        .unwrap_or(0)
}

async fn load_saved_farm(pool: &sqlx::SqlitePool) -> FarmState {
    let state_json: String = sqlx::query_scalar("SELECT state_json FROM farm_save WHERE id = ?")
        .bind("local-farm")
        .fetch_one(pool)
        .await
        .unwrap();
    serde_json::from_str(&state_json).unwrap()
}

async fn save_test_farm(pool: &sqlx::SqlitePool, version: u64, farm: &FarmState) {
    let state_json = serde_json::to_string(farm).unwrap();
    sqlx::query("UPDATE farm_save SET version = ?, state_json = ? WHERE id = ?")
        .bind(version as i64)
        .bind(state_json)
        .bind("local-farm")
        .execute(pool)
        .await
        .unwrap();
}

async fn json_body<T: serde::de::DeserializeOwned>(response: axum::response::Response) -> T {
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    serde_json::from_slice(&body).unwrap()
}

async fn websocket_json<T>(
    socket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
) -> T
where
    T: serde::de::DeserializeOwned,
{
    let message = socket.next().await.unwrap().unwrap();
    serde_json::from_str(message.to_text().unwrap()).unwrap()
}
