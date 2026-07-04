use crate::{CatalogDocument, FarmCommand, FarmEvent, FarmView};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct HealthResponse {
    pub ok: bool,
    pub service: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq)]
pub struct FarmResponse {
    #[ts(type = "number")]
    pub version: u64,
    pub view: FarmView,
    #[serde(default)]
    #[ts(optional)]
    pub notice: Option<FarmNotice>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct CommandRequest {
    #[ts(type = "number")]
    pub expected_version: u64,
    pub command: FarmCommand,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq)]
pub struct CommandResponse {
    pub accepted: bool,
    #[ts(type = "number")]
    pub version: u64,
    pub events: Vec<FarmEvent>,
    pub view: FarmView,
    pub error: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub notice: Option<FarmNotice>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct CatalogResponse {
    pub catalog: CatalogDocument,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct FarmNotice {
    pub kind: FarmNoticeKind,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FarmNoticeKind {
    SaveReset,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WebsocketClientMessage {
    SubmitCommand {
        request_id: String,
        #[ts(type = "number")]
        expected_version: u64,
        command: FarmCommand,
    },
    ResetFarm {
        request_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct WebsocketError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WebsocketServerMessage {
    Catalog {
        catalog: CatalogDocument,
    },
    FarmSnapshot {
        #[ts(type = "number")]
        version: u64,
        view: FarmView,
        #[serde(default)]
        #[ts(optional)]
        notice: Option<FarmNotice>,
    },
    CommandResponse {
        request_id: String,
        accepted: bool,
        #[ts(type = "number")]
        version: u64,
        events: Vec<FarmEvent>,
        view: FarmView,
        error: Option<String>,
        #[serde(default)]
        #[ts(optional)]
        notice: Option<FarmNotice>,
    },
    Error {
        error: WebsocketError,
    },
}
