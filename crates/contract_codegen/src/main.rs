use anyhow::{Context, bail};
use my_farm_core::{
    AnimalShelterState, AnimalSlot, AnimalState, BalanceConfig, CatalogDocument, CatalogResponse,
    CommandRequest, CommandResponse, CropDef, DecorationDef, DecorationFootprint,
    DecorationPlacement, DeliveryOrder, FarmCommand, FarmEvent, FarmResident, FarmResponse,
    FarmState, FarmView, FarmhouseUpgradeDef, FarmhouseUpgradeKind, FieldPlot, HealthResponse,
    HouseInterior, InventoryItemView, ItemDef, ItemKind, ItemStack, MachineDef, MachineJob,
    MachineKind, MachineState, MarketItemDef, OvenJob, OvenJobStatus, OvenState, PlantedCrop,
    RecipeDef, RecipeTarget, ReservedWorkTarget, ResidentTask, ResidentTaskKind,
    ResidentTaskStep, ResidentTaskStepWork, Room, RoomTile, ShelterDef, ShelterKind, StorageKind,
    StorageUpgradeDef, StructureKind, StructureTarget, SweepHarvestMode, Tile, UnlockView,
    WebsocketClientMessage, WebsocketError, WebsocketServerMessage,
};
use schemars::{JsonSchema, schema_for};
use std::fs;
use std::path::{Path, PathBuf};
use ts_rs::TS;

fn main() -> anyhow::Result<()> {
    let check = std::env::args().any(|arg| arg == "--check");
    let root = workspace_root()?;
    let outputs = outputs()?;
    for output in outputs {
        let path = root.join(output.path);
        if check {
            let current = fs::read_to_string(&path)
                .with_context(|| format!("read generated contract {}", path.display()))?;
            if current != output.contents {
                bail!("contract drift detected at {}", path.display());
            }
        } else {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&path, output.contents)
                .with_context(|| format!("write generated contract {}", path.display()))?;
        }
    }
    Ok(())
}

struct Output {
    path: &'static str,
    contents: String,
}

fn outputs() -> anyhow::Result<Vec<Output>> {
    Ok(vec![
        json::<CatalogDocument>("contracts/generated/json/CatalogDocument.schema.json")?,
        json::<FarmState>("contracts/generated/json/FarmState.schema.json")?,
        json::<FarmView>("contracts/generated/json/FarmView.schema.json")?,
        json::<FarmCommand>("contracts/generated/json/FarmCommand.schema.json")?,
        json::<FarmEvent>("contracts/generated/json/FarmEvent.schema.json")?,
        json::<CommandRequest>("contracts/generated/json/CommandRequest.schema.json")?,
        json::<CommandResponse>("contracts/generated/json/CommandResponse.schema.json")?,
        json::<FarmResponse>("contracts/generated/json/FarmResponse.schema.json")?,
        json::<CatalogResponse>("contracts/generated/json/CatalogResponse.schema.json")?,
        json::<WebsocketClientMessage>(
            "contracts/generated/json/WebsocketClientMessage.schema.json",
        )?,
        json::<WebsocketError>("contracts/generated/json/WebsocketError.schema.json")?,
        json::<WebsocketServerMessage>(
            "contracts/generated/json/WebsocketServerMessage.schema.json",
        )?,
        json::<HealthResponse>("contracts/generated/json/HealthResponse.schema.json")?,
        ts_file(
            "contracts/generated/ts/my-farm.d.ts",
            &[
                HealthResponse::decl(),
                BalanceConfig::decl(),
                ItemStack::decl(),
                ItemKind::decl(),
                ItemDef::decl(),
                CropDef::decl(),
                MachineKind::decl(),
                RecipeTarget::decl(),
                ShelterKind::decl(),
                StructureKind::decl(),
                FarmhouseUpgradeKind::decl(),
                StructureTarget::decl(),
                SweepHarvestMode::decl(),
                RecipeDef::decl(),
                MachineDef::decl(),
                FarmhouseUpgradeDef::decl(),
                ShelterDef::decl(),
                MarketItemDef::decl(),
                StorageKind::decl(),
                StorageUpgradeDef::decl(),
                DecorationFootprint::decl(),
                DecorationDef::decl(),
                CatalogDocument::decl(),
                CatalogResponse::decl(),
                Tile::decl(),
                PlantedCrop::decl(),
                MachineJob::decl(),
                OvenJobStatus::decl(),
                OvenJob::decl(),
                OvenState::decl(),
                AnimalState::decl(),
                AnimalSlot::decl(),
                FarmResident::decl(),
                ReservedWorkTarget::decl(),
                ResidentTaskKind::decl(),
                ResidentTaskStepWork::decl(),
                ResidentTaskStep::decl(),
                ResidentTask::decl(),
                RoomTile::decl(),
                DecorationPlacement::decl(),
                Room::decl(),
                HouseInterior::decl(),
                FarmState::decl(),
                FieldPlot::decl(),
                MachineState::decl(),
                AnimalShelterState::decl(),
                DeliveryOrder::decl(),
                InventoryItemView::decl(),
                UnlockView::decl(),
                FarmView::decl(),
                FarmCommand::decl(),
                FarmEvent::decl(),
                CommandRequest::decl(),
                CommandResponse::decl(),
                FarmResponse::decl(),
                WebsocketClientMessage::decl(),
                WebsocketError::decl(),
                WebsocketServerMessage::decl(),
            ],
        ),
    ])
}

fn json<T: JsonSchema>(path: &'static str) -> anyhow::Result<Output> {
    let contents = serde_json::to_string_pretty(&schema_for!(T))?;
    Ok(Output {
        path,
        contents: format!("{contents}\n"),
    })
}

fn ts_file(path: &'static str, declarations: &[String]) -> Output {
    let mut contents = String::from(
        "/* eslint-disable */\n// Generated by contract_codegen. Do not edit by hand.\n\n",
    );
    for declaration in declarations {
        contents.push_str("export ");
        contents.push_str(declaration);
        contents.push_str("\n\n");
    }
    Output { path, contents }
}

fn workspace_root() -> anyhow::Result<PathBuf> {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .ancestors()
        .nth(2)
        .map(Path::to_path_buf)
        .context("resolve workspace root")
}
