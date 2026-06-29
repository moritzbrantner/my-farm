use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode};
use my_farm_core::{CommandRequest, CommandResponse, FarmCommand, FarmResponse};
use my_farm_server::{AppState, app, connect_database};
use tower::ServiceExt;

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

async fn json_body<T: serde::de::DeserializeOwned>(response: axum::response::Response) -> T {
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    serde_json::from_slice(&body).unwrap()
}
