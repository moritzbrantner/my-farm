use crate::{CatalogDocument, FarmState, ItemKind, barn_storage_used, crop_storage_used};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct FarmView {
    #[ts(type = "number")]
    pub last_update_ms: i64,
    pub xp: u32,
    pub level: u32,
    pub coins: u32,
    pub silo_used: u32,
    pub silo_capacity: u32,
    pub silo_tile: crate::Tile,
    pub barn_used: u32,
    pub barn_capacity: u32,
    pub barn_tile: crate::Tile,
    pub inventory: Vec<InventoryItemView>,
    pub field_plots: Vec<crate::FieldPlot>,
    pub machines: Vec<crate::MachineState>,
    pub shelters: Vec<crate::AnimalShelterState>,
    pub delivery_board_built: bool,
    pub delivery_board_tile: crate::Tile,
    pub delivery_orders: Vec<crate::DeliveryOrder>,
    pub unlocks: Vec<UnlockView>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct InventoryItemView {
    pub item_id: String,
    pub name: String,
    pub quantity: u32,
    pub kind: ItemKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct UnlockView {
    pub level: u32,
    pub label: String,
    pub unlocked: bool,
}

pub fn farm_view(farm: &FarmState, catalog: &CatalogDocument) -> FarmView {
    let mut inventory = farm
        .inventory
        .iter()
        .filter_map(|(item_id, quantity)| {
            catalog.item(item_id).map(|item| InventoryItemView {
                item_id: item_id.clone(),
                name: item.name.clone(),
                quantity: *quantity,
                kind: item.kind.clone(),
            })
        })
        .collect::<Vec<_>>();
    inventory.sort_by(|a, b| a.item_id.cmp(&b.item_id));

    FarmView {
        last_update_ms: farm.last_update_ms,
        xp: farm.xp,
        level: farm.level,
        coins: farm.coins,
        silo_used: crop_storage_used(farm, catalog),
        silo_capacity: farm.silo_capacity,
        silo_tile: farm.silo_tile.clone(),
        barn_used: barn_storage_used(farm, catalog),
        barn_capacity: farm.barn_capacity,
        barn_tile: farm.barn_tile.clone(),
        inventory,
        field_plots: farm.field_plots.clone(),
        machines: farm.machines.clone(),
        shelters: farm.shelters.clone(),
        delivery_board_built: farm.delivery_board_built,
        delivery_board_tile: farm.delivery_board_tile.clone(),
        delivery_orders: farm.delivery_orders.clone(),
        unlocks: vec![
            unlock(1, "Fields and wheat", farm.level),
            unlock(2, "Bakery, bread, and corn", farm.level),
            unlock(3, "Feed mill, chickens, eggs, and soybeans", farm.level),
            unlock(4, "Delivery orders and corn bread", farm.level),
            unlock(5, "Cow pasture, milk, carrots, and cow feed", farm.level),
        ],
    }
}

fn unlock(level: u32, label: &str, current_level: u32) -> UnlockView {
    UnlockView {
        level,
        label: label.to_owned(),
        unlocked: current_level >= level,
    }
}
