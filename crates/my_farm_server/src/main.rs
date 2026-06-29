use my_farm_server::{AppState, app, connect_database};
use std::net::SocketAddr;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let database_url = std::env::var("MY_FARM_DATABASE_URL")
        .unwrap_or_else(|_| "sqlite://my-farm.sqlite".to_owned());
    let port = std::env::var("MY_FARM_PORT")
        .ok()
        .and_then(|port| port.parse::<u16>().ok())
        .unwrap_or(8081);
    let pool = connect_database(&database_url).await?;
    let app = app(AppState::new(pool));
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    println!("my-farm server listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
