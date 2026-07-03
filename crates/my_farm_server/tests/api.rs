use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode, header};
use futures_util::{SinkExt, StreamExt};
use my_farm_core::{
    AnimalShelterState, AnimalSlot, AnimalState, CatalogDocument, CatalogResponse, CommandRequest,
    CommandResponse, FarmCommand, FarmEvent, FarmResponse, FarmState, FarmhouseUpgradeKind,
    MachineJob, MachineKind, MachineState, ShelterKind, StorageKind, Tile, WebsocketClientMessage,
    WebsocketServerMessage, update_level,
};
use my_farm_server::{AppState, app, connect_database};
use std::net::SocketAddr;
use tokio_tungstenite::tungstenite::Message as ClientMessage;
use tower::ServiceExt;

type TestWebSocket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

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
async fn websocket_command_persists_journal_and_broadcasts_snapshot_to_connected_clients() {
    let (addr, _server, pool) = websocket_test_server().await;
    let (mut first_client, first_snapshot) = connect_gameplay_websocket(addr).await;
    let (mut second_client, second_snapshot) = connect_gameplay_websocket(addr).await;
    assert_eq!(first_snapshot.version, 0);
    assert_eq!(second_snapshot.version, 0);

    send_websocket_json(
        &mut first_client,
        &WebsocketClientMessage::SubmitCommand {
            request_id: "plant-1".to_owned(),
            expected_version: first_snapshot.version,
            command: FarmCommand::PlantCrop {
                plot_id: "plot-1".to_owned(),
                crop_id: "wheat".to_owned(),
            },
        },
    )
    .await;

    let response: WebsocketServerMessage = websocket_json(&mut first_client).await;
    let WebsocketServerMessage::CommandResponse {
        request_id,
        accepted,
        version,
        events,
        view,
        error,
    } = response
    else {
        panic!("expected command response");
    };
    assert_eq!(request_id, "plant-1");
    assert!(accepted);
    assert_eq!(version, 1);
    assert!(error.is_none());
    assert!(events.is_empty());
    assert_eq!(inventory_quantity_from_view(&view, "wheat"), 5);
    assert!(view.field_plots[0].crop.is_none());
    assert_eq!(view.resident_task_queues["woman"].len(), 1);

    let first_broadcast = websocket_farm_snapshot(&mut first_client).await;
    let second_broadcast = websocket_farm_snapshot(&mut second_client).await;
    assert_eq!(first_broadcast.version, 1);
    assert_eq!(second_broadcast.version, 1);
    assert_eq!(
        inventory_quantity_from_view(&first_broadcast.view, "wheat"),
        5
    );
    assert_eq!(
        inventory_quantity_from_view(&second_broadcast.view, "wheat"),
        5
    );

    let saved_version: i64 =
        sqlx::query_scalar("SELECT version FROM farm_save WHERE id = 'local-farm'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(saved_version, 1);
    let journal_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM command_journal")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(journal_count, 1);
}

#[tokio::test]
async fn websocket_stale_command_returns_authoritative_view_without_writing_journal() {
    let (addr, _server, pool) = websocket_test_server().await;
    let (mut client, snapshot) = connect_gameplay_websocket(addr).await;
    assert_eq!(snapshot.version, 0);

    send_websocket_json(
        &mut client,
        &WebsocketClientMessage::SubmitCommand {
            request_id: "stale-1".to_owned(),
            expected_version: 9,
            command: FarmCommand::PlantCrop {
                plot_id: "plot-1".to_owned(),
                crop_id: "wheat".to_owned(),
            },
        },
    )
    .await;

    let response: WebsocketServerMessage = websocket_json(&mut client).await;
    let WebsocketServerMessage::CommandResponse {
        request_id,
        accepted,
        version,
        events,
        view,
        error,
    } = response
    else {
        panic!("expected command response");
    };
    assert_eq!(request_id, "stale-1");
    assert!(!accepted);
    assert_eq!(version, 0);
    assert!(events.is_empty());
    assert_eq!(inventory_quantity_from_view(&view, "wheat"), 6);
    assert!(error.unwrap().contains("version mismatch"));

    let no_broadcast = tokio::time::timeout(
        std::time::Duration::from_millis(50),
        websocket_json::<WebsocketServerMessage>(&mut client),
    )
    .await;
    assert!(no_broadcast.is_err());

    let saved_version: i64 =
        sqlx::query_scalar("SELECT version FROM farm_save WHERE id = 'local-farm'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(saved_version, 0);
    let journal_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM command_journal")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(journal_count, 0);
}

#[tokio::test]
async fn websocket_reset_persists_version_zero_and_broadcasts_new_farm() {
    let (addr, _server, pool) = websocket_test_server().await;
    let (mut first_client, snapshot) = connect_gameplay_websocket(addr).await;
    let (mut second_client, _) = connect_gameplay_websocket(addr).await;

    send_websocket_json(
        &mut first_client,
        &WebsocketClientMessage::SubmitCommand {
            request_id: "plant-before-reset".to_owned(),
            expected_version: snapshot.version,
            command: FarmCommand::PlantCrop {
                plot_id: "plot-1".to_owned(),
                crop_id: "wheat".to_owned(),
            },
        },
    )
    .await;
    let planted: WebsocketServerMessage = websocket_json(&mut first_client).await;
    assert!(matches!(
        planted,
        WebsocketServerMessage::CommandResponse {
            accepted: true,
            version: 1,
            ..
        }
    ));
    let _ = websocket_farm_snapshot(&mut first_client).await;
    let _ = websocket_farm_snapshot(&mut second_client).await;

    send_websocket_json(
        &mut first_client,
        &WebsocketClientMessage::ResetFarm {
            request_id: "reset-1".to_owned(),
        },
    )
    .await;

    let response: WebsocketServerMessage = websocket_json(&mut first_client).await;
    let WebsocketServerMessage::CommandResponse {
        request_id,
        accepted,
        version,
        events,
        view,
        error,
    } = response
    else {
        panic!("expected reset response");
    };
    assert_eq!(request_id, "reset-1");
    assert!(accepted);
    assert_eq!(version, 0);
    assert!(events.is_empty());
    assert!(error.is_none());
    assert_eq!(inventory_quantity_from_view(&view, "wheat"), 6);

    let first_broadcast = websocket_farm_snapshot(&mut first_client).await;
    let second_broadcast = websocket_farm_snapshot(&mut second_client).await;
    assert_eq!(first_broadcast.version, 0);
    assert_eq!(second_broadcast.version, 0);
    assert_eq!(
        inventory_quantity_from_view(&first_broadcast.view, "wheat"),
        6
    );
    assert_eq!(
        inventory_quantity_from_view(&second_broadcast.view, "wheat"),
        6
    );

    let saved_version: i64 =
        sqlx::query_scalar("SELECT version FROM farm_save WHERE id = 'local-farm'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(saved_version, 0);
}

#[tokio::test]
async fn websocket_elapsed_time_broadcasts_one_visible_ready_snapshot_to_all_clients() {
    let (addr, _server, pool) = websocket_test_server().await;
    let (mut first_client, initial) = connect_gameplay_websocket(addr).await;
    let (mut second_client, _) = connect_gameplay_websocket(addr).await;
    let ready_at_ms = chrono::Utc::now().timestamp_millis() + 150;

    let mut farm = load_saved_farm(&pool).await;
    farm.last_update_ms = ready_at_ms - 1_000;
    farm.field_plots[0].crop = Some(my_farm_core::PlantedCrop {
        item_id: "wheat".to_owned(),
        planted_at_ms: ready_at_ms - 2_000,
        ready_at_ms,
    });
    farm.machines.push(MachineState {
        id: "machine-1".to_owned(),
        kind: MachineKind::FeedMill,
        tile: Tile::new(8, 2),
        queue: vec![MachineJob {
            id: "job-ready".to_owned(),
            recipe_id: "chicken_feed".to_owned(),
            started_at_ms: ready_at_ms - 2_000,
            ready_at_ms,
        }],
    });
    farm.shelters.push(AnimalShelterState {
        id: "shelter-1".to_owned(),
        kind: ShelterKind::ChickenCoop,
        tile: Tile::new(5, 7),
        animals: vec![AnimalSlot {
            id: "animal-1".to_owned(),
            state: AnimalState::Producing {
                fed_at_ms: ready_at_ms - 2_000,
                ready_at_ms,
            },
        }],
    });
    save_test_farm(&pool, initial.version, &farm).await;

    let first_elapsed = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        websocket_farm_snapshot(&mut first_client),
    )
    .await
    .unwrap();
    let second_elapsed = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        websocket_farm_snapshot(&mut second_client),
    )
    .await
    .unwrap();

    assert_eq!(first_elapsed.version, 1);
    assert_eq!(second_elapsed.version, 1);
    assert!(
        first_elapsed.view.field_plots[0]
            .crop
            .as_ref()
            .unwrap()
            .ready_at_ms
            <= first_elapsed.view.last_update_ms
    );
    assert!(
        first_elapsed.view.machines[0].queue[0].ready_at_ms <= first_elapsed.view.last_update_ms
    );
    assert!(matches!(
        first_elapsed.view.shelters[0].animals[0].state,
        AnimalState::Ready
    ));
    assert_eq!(second_elapsed.view, first_elapsed.view);

    let no_duplicate = tokio::time::timeout(
        std::time::Duration::from_millis(150),
        websocket_json::<WebsocketServerMessage>(&mut first_client),
    )
    .await;
    assert!(no_duplicate.is_err());
}

#[tokio::test]
async fn websocket_elapsed_time_persists_and_broadcasts_resident_task_completion() {
    let (addr, _server, pool) = websocket_test_server().await;
    let (mut first_client, initial) = connect_gameplay_websocket(addr).await;
    let (mut second_client, _) = connect_gameplay_websocket(addr).await;

    send_websocket_json(
        &mut first_client,
        &WebsocketClientMessage::SubmitCommand {
            request_id: "plant-resident-task".to_owned(),
            expected_version: initial.version,
            command: FarmCommand::PlantCrop {
                plot_id: "plot-1".to_owned(),
                crop_id: "wheat".to_owned(),
            },
        },
    )
    .await;
    let planted: WebsocketServerMessage = websocket_json(&mut first_client).await;
    assert!(matches!(
        planted,
        WebsocketServerMessage::CommandResponse {
            accepted: true,
            version: 1,
            ..
        }
    ));
    let _ = websocket_farm_snapshot(&mut first_client).await;
    let _ = websocket_farm_snapshot(&mut second_client).await;

    let ready_at_ms = chrono::Utc::now().timestamp_millis() + 150;
    let mut farm = load_saved_farm(&pool).await;
    farm.last_update_ms = ready_at_ms - 1_000;
    farm.resident_task_queues
        .get_mut("woman")
        .unwrap()
        .first_mut()
        .unwrap()
        .ready_at_ms = ready_at_ms;
    save_test_farm(&pool, 1, &farm).await;

    let first_elapsed = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        websocket_farm_snapshot(&mut first_client),
    )
    .await
    .unwrap();
    let second_elapsed = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        websocket_farm_snapshot(&mut second_client),
    )
    .await
    .unwrap();

    assert_eq!(first_elapsed.version, 2);
    assert_eq!(second_elapsed.version, 2);
    assert_eq!(second_elapsed.view, first_elapsed.view);
    assert!(first_elapsed.view.field_plots[0].crop.is_some());
    assert!(first_elapsed.view.resident_task_queues["woman"].is_empty());

    let saved_version: i64 =
        sqlx::query_scalar("SELECT version FROM farm_save WHERE id = 'local-farm'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(saved_version, 2);
    let saved = load_saved_farm(&pool).await;
    assert!(saved.field_plots[0].crop.is_some());
    assert!(saved.resident_task_queues["woman"].is_empty());
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
async fn post_farmhouse_oven_purchase_persists_state_and_journal_through_restart() {
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

    let bought = post_command(
        router.clone(),
        CommandRequest {
            expected_version: initial.version,
            command: FarmCommand::BuyFarmhouseUpgrade {
                upgrade_kind: FarmhouseUpgradeKind::Oven,
            },
        },
    )
    .await;

    assert!(bought.accepted);
    assert_eq!(bought.version, 1);
    assert_eq!(bought.view.coins, 140);
    assert_eq!(
        bought.view.owned_farmhouse_upgrades,
        vec![FarmhouseUpgradeKind::Oven]
    );
    assert!(bought.events.contains(&FarmEvent::FarmhouseUpgradeBought {
        upgrade_kind: FarmhouseUpgradeKind::Oven,
    }));

    let journal_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM command_journal WHERE command_json LIKE ?")
            .bind("%buy_farmhouse_upgrade%")
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
    assert_eq!(reloaded.view.coins, 140);
    assert_eq!(
        reloaded.view.owned_farmhouse_upgrades,
        vec![FarmhouseUpgradeKind::Oven]
    );
    restarted_pool.close().await;
}

#[tokio::test]
async fn post_farmhouse_oven_queue_and_collect_persist_state_and_journal_through_restart() {
    let tempdir = tempfile::tempdir().unwrap();
    let url = format!("sqlite://{}", tempdir.path().join("farm.db").display());
    let pool = connect_database(&url).await.unwrap();
    let router = app(AppState::new(pool.clone()));
    let initial = get_farm(router.clone()).await;

    let catalog = CatalogDocument::default_catalog();
    let mut farm = load_saved_farm(&pool).await;
    farm.xp = 4;
    update_level(&mut farm, &catalog);
    farm.owned_farmhouse_upgrades
        .push(FarmhouseUpgradeKind::Oven);
    save_test_farm(&pool, initial.version, &farm).await;

    let queued = post_command(
        router.clone(),
        CommandRequest {
            expected_version: initial.version,
            command: FarmCommand::QueueOvenRecipe {
                recipe_id: "bread".to_owned(),
            },
        },
    )
    .await;

    assert!(queued.accepted);
    assert_eq!(queued.version, 1);
    assert_eq!(queued.view.oven.queue.len(), 1);
    assert_eq!(queued.view.oven.queue[0].recipe_id, "bread");
    assert_eq!(inventory_quantity(&queued, "wheat"), 3);

    let mut ready_farm = load_saved_farm(&pool).await;
    ready_farm.oven.queue[0].ready_at_ms = 0;
    save_test_farm(&pool, queued.version, &ready_farm).await;

    let collected = post_command(
        router.clone(),
        CommandRequest {
            expected_version: queued.version,
            command: FarmCommand::CollectOvenJob,
        },
    )
    .await;

    assert!(collected.accepted);
    assert_eq!(collected.version, 2);
    assert_eq!(collected.view.oven.queue.len(), 1);
    assert_eq!(
        collected.view.resident_task_queues["woman"][0].steps[0].reserved_work_target,
        my_farm_core::ReservedWorkTarget::Oven
    );

    let journal_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM command_journal WHERE command_json LIKE ?")
            .bind("%oven%")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(journal_count, 2);

    drop(router);
    pool.close().await;

    let restarted_pool = connect_database(&url).await.unwrap();
    let restarted_app = app(AppState::new(restarted_pool.clone()));
    let reloaded = get_farm(restarted_app).await;

    assert_eq!(reloaded.version, 2);
    assert_eq!(reloaded.view.oven.queue.len(), 1);
    assert_eq!(inventory_quantity_from_farm(&reloaded, "wheat"), 3);
    assert_eq!(inventory_quantity_from_farm(&reloaded, "bread"), 0);
    assert_eq!(
        reloaded.view.resident_task_queues["woman"][0].steps[0].work,
        my_farm_core::ResidentTaskStepWork::CollectOvenJob {
            job_id: reloaded.view.oven.queue[0].id.clone(),
            recipe_id: "bread".to_owned(),
        }
    );
    restarted_pool.close().await;
}

#[tokio::test]
async fn persisted_legacy_bakery_save_loads_as_farmhouse_oven() {
    let tempdir = tempfile::tempdir().unwrap();
    let url = format!("sqlite://{}", tempdir.path().join("farm.db").display());
    let pool = connect_database(&url).await.unwrap();
    let router = app(AppState::new(pool.clone()));
    let initial = get_farm(router.clone()).await;

    let mut farm = load_saved_farm(&pool).await;
    farm.xp = 4;
    update_level(&mut farm, &CatalogDocument::default_catalog());
    let mut state_json = serde_json::to_value(&farm).unwrap();
    let state = state_json.as_object_mut().unwrap();
    state.remove("owned_farmhouse_upgrades");
    state.remove("oven");
    state["machines"] = serde_json::json!([
        {
            "id": "machine-bakery",
            "kind": "bakery",
            "tile": { "x": 8, "y": 2 },
            "queue": [
                {
                    "id": "job-bread",
                    "recipe_id": "bread",
                    "started_at_ms": 1000,
                    "ready_at_ms": 31000
                }
            ]
        }
    ]);
    sqlx::query("UPDATE farm_save SET version = ?, state_json = ? WHERE id = ?")
        .bind(initial.version as i64)
        .bind(state_json.to_string())
        .bind("local-farm")
        .execute(&pool)
        .await
        .unwrap();

    drop(router);
    pool.close().await;

    let restarted_pool = connect_database(&url).await.unwrap();
    let restarted_app = app(AppState::new(restarted_pool.clone()));
    let reloaded = get_farm(restarted_app).await;

    assert_eq!(reloaded.version, initial.version);
    assert_eq!(
        reloaded.view.owned_farmhouse_upgrades,
        vec![FarmhouseUpgradeKind::Oven]
    );
    assert_eq!(reloaded.view.oven.id, "machine-bakery");
    assert_eq!(reloaded.view.oven.queue.len(), 1);
    assert_eq!(reloaded.view.oven.queue[0].id, "job-bread");
    assert!(reloaded.view.machines.is_empty());
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

fn inventory_quantity_from_view(view: &my_farm_core::FarmView, item_id: &str) -> u32 {
    view.inventory
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

async fn websocket_json<T>(socket: &mut TestWebSocket) -> T
where
    T: serde::de::DeserializeOwned,
{
    let message = socket.next().await.unwrap().unwrap();
    serde_json::from_str(message.to_text().unwrap()).unwrap()
}

async fn websocket_test_server() -> (SocketAddr, tokio::task::JoinHandle<()>, sqlx::SqlitePool) {
    let url = format!(
        "sqlite://{}",
        tempfile::NamedTempFile::new().unwrap().path().display()
    );
    let pool = connect_database(&url).await.unwrap();
    let router = app(AppState::new(pool.clone()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    (addr, server, pool)
}

async fn connect_gameplay_websocket(addr: SocketAddr) -> (TestWebSocket, FarmResponse) {
    let (mut socket, response) =
        tokio_tungstenite::connect_async(format!("ws://{addr}/api/gameplay"))
            .await
            .unwrap();
    assert_eq!(response.status(), StatusCode::SWITCHING_PROTOCOLS);

    let catalog_message: WebsocketServerMessage = websocket_json(&mut socket).await;
    assert!(matches!(
        catalog_message,
        WebsocketServerMessage::Catalog { .. }
    ));
    let snapshot = websocket_farm_snapshot(&mut socket).await;
    (
        socket,
        FarmResponse {
            version: snapshot.version,
            view: snapshot.view,
        },
    )
}

async fn websocket_farm_snapshot(socket: &mut TestWebSocket) -> FarmResponse {
    let message: WebsocketServerMessage = websocket_json(socket).await;
    let WebsocketServerMessage::FarmSnapshot { version, view } = message else {
        panic!("expected farm snapshot");
    };
    FarmResponse { version, view }
}

async fn send_websocket_json<T: serde::Serialize>(socket: &mut TestWebSocket, message: &T) {
    socket
        .send(ClientMessage::Text(
            serde_json::to_string(message).unwrap().into(),
        ))
        .await
        .unwrap();
}
