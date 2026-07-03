use my_farm_core::{
    CatalogDocument, CommandRequest, CommandResponse, FarmCommand, FarmResponse, FarmState,
    MachineKind, StructureKind, StructureTarget, apply_command, apply_elapsed, farm_view, new_farm,
};
use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DemoSave {
    version: u64,
    farm: FarmState,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct DemoFarmRuntime {
    catalog: CatalogDocument,
    farm: FarmState,
    version: u64,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl DemoFarmRuntime {
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new(saved_json: Option<String>, now_ms: f64) -> Self {
        let catalog = demo_catalog();
        let save = saved_json
            .and_then(|json| serde_json::from_str::<DemoSave>(&json).ok())
            .filter(|save| demo_save_is_compatible(save, &catalog));

        if let Some(save) = save {
            return Self {
                catalog,
                farm: save.farm,
                version: save.version,
            };
        }

        Self {
            farm: new_farm(now_ms_to_i64(now_ms), &catalog),
            catalog,
            version: 0,
        }
    }

    pub fn catalog_json(&self) -> String {
        serde_json::to_string(&self.catalog).expect("serialize demo catalog")
    }

    pub fn farm_json(&mut self, now_ms: f64) -> String {
        let now_ms = now_ms_to_i64(now_ms);
        self.tick_elapsed(now_ms);
        serde_json::to_string(&FarmResponse {
            version: self.version,
            view: farm_view(&self.farm, &self.catalog),
        })
        .expect("serialize demo farm response")
    }

    pub fn reset(&mut self, now_ms: f64) -> String {
        self.farm = new_farm(now_ms_to_i64(now_ms), &self.catalog);
        self.version = 0;
        serde_json::to_string(&FarmResponse {
            version: self.version,
            view: farm_view(&self.farm, &self.catalog),
        })
        .expect("serialize reset farm response")
    }

    pub fn command_json(&mut self, request_json: &str, now_ms: f64) -> String {
        let now_ms = now_ms_to_i64(now_ms);
        let Ok(request) = serde_json::from_str::<CommandRequest>(request_json) else {
            apply_elapsed(&mut self.farm, &self.catalog, now_ms);
            return self.rejected_response("invalid command request");
        };

        if request.expected_version != self.version {
            apply_elapsed(&mut self.farm, &self.catalog, now_ms);
            return self.rejected_response(&format!(
                "version mismatch: expected {}, found {}",
                request.expected_version, self.version
            ));
        }

        if let Some(reason) = unsupported_demo_command(&self.farm, &request.command) {
            apply_elapsed(&mut self.farm, &self.catalog, now_ms);
            return self.rejected_response(reason);
        }

        let outcome = apply_command(&mut self.farm, &self.catalog, request.command, now_ms);
        if outcome.accepted {
            self.version += 1;
        }

        serde_json::to_string(&CommandResponse {
            accepted: outcome.accepted,
            version: self.version,
            events: outcome.events,
            view: farm_view(&self.farm, &self.catalog),
            error: outcome.error.map(|error| error.message),
        })
        .expect("serialize command response")
    }

    pub fn save_json(&self) -> String {
        serde_json::to_string(&DemoSave {
            version: self.version,
            farm: self.farm.clone(),
        })
        .expect("serialize demo save")
    }
}

impl DemoFarmRuntime {
    fn tick_elapsed(&mut self, now_ms: i64) {
        let events = apply_elapsed(&mut self.farm, &self.catalog, now_ms);
        if !events.is_empty() {
            self.version += 1;
        }
    }

    fn rejected_response(&self, message: &str) -> String {
        serde_json::to_string(&CommandResponse {
            accepted: false,
            version: self.version,
            events: Vec::new(),
            view: farm_view(&self.farm, &self.catalog),
            error: Some(message.to_owned()),
        })
        .expect("serialize rejected command response")
    }
}

pub fn demo_catalog() -> CatalogDocument {
    let mut catalog = CatalogDocument::default_catalog();
    catalog
        .items
        .retain(|item| matches!(item.id.as_str(), "wheat" | "corn" | "bread"));
    catalog
        .crops
        .retain(|crop| matches!(crop.item_id.as_str(), "wheat" | "corn"));
    catalog.recipes.retain(|recipe| recipe.id == "bread");
    catalog
        .machines
        .retain(|machine| machine.kind == MachineKind::Bakery);
    catalog.shelters.clear();
    catalog.market_items.clear();
    catalog.storage_upgrades.clear();
    catalog.level_xp = vec![0, 0, 4];
    catalog
}

fn unsupported_demo_command<'a>(farm: &FarmState, command: &'a FarmCommand) -> Option<&'a str> {
    match command {
        FarmCommand::PlantCrop { .. }
        | FarmCommand::SweepPlant { .. }
        | FarmCommand::HarvestCrop { .. }
        | FarmCommand::SweepHarvest { .. }
        | FarmCommand::BuyFieldPlot { .. }
        | FarmCommand::SelectResident { .. }
        | FarmCommand::RenameResident { .. }
        | FarmCommand::CollectMachineJob { .. } => None,
        FarmCommand::BuyStructure { structure_kind, .. } => {
            if *structure_kind == StructureKind::Bakery {
                None
            } else {
                Some("feature is not available in the demo")
            }
        }
        FarmCommand::MoveStructure { target, .. } => match target {
            StructureTarget::Silo | StructureTarget::Barn => None,
            StructureTarget::Machine { id } => {
                let machine = farm.machines.iter().find(|machine| machine.id == *id);
                if machine.is_none_or(|machine| machine.kind == MachineKind::Bakery) {
                    None
                } else {
                    Some("feature is not available in the demo")
                }
            }
            StructureTarget::Shelter { .. } | StructureTarget::DeliveryBoard => {
                Some("feature is not available in the demo")
            }
        },
        FarmCommand::QueueRecipe { recipe_id, .. } => {
            if recipe_id == "bread" {
                None
            } else {
                Some("feature is not available in the demo")
            }
        }
        FarmCommand::UpgradeStorage { .. }
        | FarmCommand::FeedAnimal { .. }
        | FarmCommand::CollectAnimalProduct { .. }
        | FarmCommand::FulfillDeliveryOrder { .. }
        | FarmCommand::DiscardDeliveryOrder { .. }
        | FarmCommand::DiscardInventory { .. }
        | FarmCommand::BuyMarketItem { .. }
        | FarmCommand::SellMarketItem { .. } => Some("feature is not available in the demo"),
    }
}

fn demo_save_is_compatible(save: &DemoSave, catalog: &CatalogDocument) -> bool {
    save.farm
        .inventory
        .keys()
        .all(|item_id| catalog.item(item_id).is_some())
        && save
            .farm
            .machines
            .iter()
            .all(|machine| machine.kind == MachineKind::Bakery)
        && save.farm.shelters.is_empty()
        && !save.farm.delivery_board_built
}

fn now_ms_to_i64(now_ms: f64) -> i64 {
    if now_ms.is_finite() {
        now_ms.round() as i64
    } else {
        0
    }
}
