use crate::{CatalogDocument, FarmCommand, FarmEvent, FarmView};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct HealthResponse {
    pub ok: bool,
    pub service: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct FarmResponse {
    #[ts(type = "number")]
    pub version: u64,
    pub view: FarmView,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct CommandRequest {
    #[ts(type = "number")]
    pub expected_version: u64,
    pub command: FarmCommand,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct CommandResponse {
    pub accepted: bool,
    #[ts(type = "number")]
    pub version: u64,
    pub events: Vec<FarmEvent>,
    pub view: FarmView,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct CatalogResponse {
    pub catalog: CatalogDocument,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct WebsocketError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WebsocketServerMessage {
    Catalog {
        catalog: CatalogDocument,
    },
    FarmSnapshot {
        #[ts(type = "number")]
        version: u64,
        view: FarmView,
    },
    Error {
        error: WebsocketError,
    },
}
