use crate::{
    CatalogDocument, FarmState, ItemKind, ItemStack, ResidentTaskStepWork, StorageSourceRef,
    barn_storage_used, crop_storage_used,
};
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
    pub silo_upgrade_tier: u32,
    pub silo_tile: crate::Tile,
    pub barn_used: u32,
    pub barn_capacity: u32,
    pub barn_upgrade_tier: u32,
    pub barn_tile: crate::Tile,
    pub inventory: Vec<InventoryItemView>,
    #[serde(default)]
    #[ts(optional)]
    pub resident_inventories: Option<std::collections::BTreeMap<String, crate::ResidentInventory>>,
    pub field_plots: Vec<crate::FieldPlot>,
    pub machines: Vec<crate::MachineState>,
    pub owned_farmhouse_upgrades: Vec<crate::FarmhouseUpgradeKind>,
    pub oven: crate::OvenState,
    pub shelters: Vec<crate::AnimalShelterState>,
    pub delivery_board_built: bool,
    pub delivery_board_tile: crate::Tile,
    #[serde(default)]
    #[ts(optional)]
    pub tool_shed: Option<crate::ToolShedState>,
    pub delivery_orders: Vec<crate::DeliveryOrder>,
    pub residents: Vec<crate::FarmResident>,
    pub selected_resident_id: String,
    pub resident_locations: std::collections::BTreeMap<String, crate::Tile>,
    pub resident_task_queues: std::collections::BTreeMap<String, Vec<crate::ResidentTask>>,
    #[serde(default)]
    #[ts(optional)]
    pub resident_cleanup_blocks: Option<std::collections::BTreeMap<String, ResidentCleanupBlock>>,
    pub house_interior: crate::HouseInterior,
    pub unlocks: Vec<UnlockView>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct InventoryItemView {
    pub item_id: String,
    pub name: String,
    pub quantity: u32,
    #[serde(default)]
    #[ts(optional)]
    pub reserved_quantity: Option<u32>,
    #[serde(default)]
    #[ts(optional)]
    pub available_quantity: Option<u32>,
    pub kind: ItemKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct UnlockView {
    pub level: u32,
    pub label: String,
    pub unlocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ResidentCleanupBlock {
    pub reason: String,
    pub destination: StorageSourceRef,
    pub items: Vec<ItemStack>,
}

pub fn farm_view(farm: &FarmState, catalog: &CatalogDocument) -> FarmView {
    let mut inventory = farm
        .inventory
        .iter()
        .filter_map(|(item_id, quantity)| {
            let reserved_quantity = reserved_item_pickups(farm, item_id);
            catalog.item(item_id).map(|item| InventoryItemView {
                item_id: item_id.clone(),
                name: item.name.clone(),
                quantity: *quantity,
                reserved_quantity: Some(reserved_quantity),
                available_quantity: Some(quantity.saturating_sub(reserved_quantity)),
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
        silo_upgrade_tier: farm.silo_upgrade_tier,
        silo_tile: farm.silo_tile.clone(),
        barn_used: barn_storage_used(farm, catalog),
        barn_capacity: farm.barn_capacity,
        barn_upgrade_tier: farm.barn_upgrade_tier,
        barn_tile: farm.barn_tile.clone(),
        inventory,
        resident_inventories: Some(farm.resident_inventories.clone()),
        field_plots: farm.field_plots.clone(),
        machines: farm.machines.clone(),
        owned_farmhouse_upgrades: farm.owned_farmhouse_upgrades.clone(),
        oven: farm.oven.clone(),
        shelters: farm.shelters.clone(),
        delivery_board_built: farm.delivery_board_built,
        delivery_board_tile: farm.delivery_board_tile.clone(),
        tool_shed: farm.tool_shed.clone(),
        delivery_orders: farm.delivery_orders.clone(),
        residents: farm.residents.clone(),
        selected_resident_id: farm.selected_resident_id.clone(),
        resident_locations: farm.resident_locations.clone(),
        resident_task_queues: farm.resident_task_queues.clone(),
        resident_cleanup_blocks: cleanup_blocks(farm, catalog),
        house_interior: farm.house_interior.clone(),
        unlocks: vec![
            unlock(1, "Fields and wheat", farm.level),
            unlock(2, "Oven, bread, and corn", farm.level),
            unlock(3, "Feed mill, chickens, eggs, and soybeans", farm.level),
            unlock(4, "Delivery orders and corn bread", farm.level),
            unlock(5, "Cow pasture, milk, carrots, and cow feed", farm.level),
            unlock(6, "Potatoes, potato bread, and carrot cake", farm.level),
            unlock(7, "Tomatoes and tomato tart", farm.level),
        ],
    }
}

fn cleanup_blocks(
    farm: &FarmState,
    catalog: &CatalogDocument,
) -> Option<std::collections::BTreeMap<String, ResidentCleanupBlock>> {
    let mut blocks = std::collections::BTreeMap::new();
    let (reserved_crop, reserved_barn) = reserved_deposits(farm, catalog);
    for (resident_id, inventory) in &farm.resident_inventories {
        if farm
            .resident_task_queues
            .get(resident_id)
            .is_some_and(|queue| !queue.is_empty())
        {
            continue;
        }

        let crop_items = inventory
            .items
            .iter()
            .filter(|(item_id, _)| {
                catalog
                    .item_kind(item_id)
                    .is_some_and(|kind| *kind == ItemKind::Crop)
            })
            .map(|(item_id, quantity)| ItemStack::new(item_id, *quantity))
            .collect::<Vec<_>>();
        let crop_quantity = crop_items.iter().map(|item| item.quantity).sum::<u32>();
        if crop_quantity > 0
            && crop_storage_used(farm, catalog) + reserved_crop + crop_quantity > farm.silo_capacity
        {
            blocks.insert(
                resident_id.clone(),
                ResidentCleanupBlock {
                    reason: "storage_full".to_owned(),
                    destination: StorageSourceRef::Silo,
                    items: crop_items,
                },
            );
            continue;
        }

        let barn_items = inventory
            .items
            .iter()
            .filter(|(item_id, _)| {
                !catalog
                    .item_kind(item_id)
                    .is_some_and(|kind| *kind == ItemKind::Crop)
            })
            .map(|(item_id, quantity)| ItemStack::new(item_id, *quantity))
            .collect::<Vec<_>>();
        let barn_quantity = barn_items.iter().map(|item| item.quantity).sum::<u32>();
        if barn_quantity > 0
            && barn_storage_used(farm, catalog) + reserved_barn + barn_quantity > farm.barn_capacity
        {
            blocks.insert(
                resident_id.clone(),
                ResidentCleanupBlock {
                    reason: "storage_full".to_owned(),
                    destination: StorageSourceRef::Barn,
                    items: barn_items,
                },
            );
        }
    }

    if blocks.is_empty() {
        None
    } else {
        Some(blocks)
    }
}

fn reserved_deposits(farm: &FarmState, catalog: &CatalogDocument) -> (u32, u32) {
    let mut reserved_crop = 0;
    let mut reserved_barn = 0;
    for step in farm
        .resident_task_queues
        .values()
        .flat_map(|queue| queue.iter())
        .flat_map(|task| task.steps.iter())
    {
        let items = match &step.work {
            ResidentTaskStepWork::DepositInventory { item_id, quantity } => {
                vec![ItemStack::new(item_id, *quantity)]
            }
            ResidentTaskStepWork::DepositItems { items, .. } => items.clone(),
            _ => Vec::new(),
        };
        for item in items {
            if catalog
                .item_kind(&item.item_id)
                .is_some_and(|kind| *kind == ItemKind::Crop)
            {
                reserved_crop += item.quantity;
            } else {
                reserved_barn += item.quantity;
            }
        }
    }
    (reserved_crop, reserved_barn)
}

fn reserved_item_pickups(farm: &FarmState, item_id: &str) -> u32 {
    farm.resident_task_queues
        .values()
        .flat_map(|queue| queue.iter())
        .flat_map(|task| task.steps.iter())
        .flat_map(|step| match &step.work {
            ResidentTaskStepWork::PickupItems { items, .. } => items.as_slice(),
            _ => &[][..],
        })
        .filter(|stack| stack.item_id == item_id)
        .map(|stack| stack.quantity)
        .sum()
}

fn unlock(level: u32, label: &str, current_level: u32) -> UnlockView {
    UnlockView {
        level,
        label: label.to_owned(),
        unlocked: current_level >= level,
    }
}
