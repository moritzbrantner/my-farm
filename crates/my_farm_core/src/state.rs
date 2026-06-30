use crate::{CatalogDocument, ItemKind, ItemStack, MachineKind, ShelterDef, ShelterKind};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct Tile {
    pub x: i32,
    pub y: i32,
}

impl Tile {
    pub fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct FarmState {
    #[ts(type = "number")]
    pub last_update_ms: i64,
    pub xp: u32,
    pub level: u32,
    pub coins: u32,
    pub silo_capacity: u32,
    pub barn_capacity: u32,
    pub inventory: BTreeMap<String, u32>,
    pub field_plots: Vec<FieldPlot>,
    pub machines: Vec<MachineState>,
    pub shelters: Vec<AnimalShelterState>,
    pub delivery_board_built: bool,
    #[serde(default = "default_delivery_board_tile")]
    pub delivery_board_tile: Tile,
    pub delivery_orders: Vec<DeliveryOrder>,
    #[ts(type = "number")]
    pub next_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct FieldPlot {
    pub id: String,
    pub tile: Tile,
    pub crop: Option<PlantedCrop>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct PlantedCrop {
    pub item_id: String,
    #[ts(type = "number")]
    pub planted_at_ms: i64,
    #[ts(type = "number")]
    pub ready_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct MachineState {
    pub id: String,
    pub kind: MachineKind,
    pub tile: Tile,
    pub queue: Vec<MachineJob>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct MachineJob {
    pub id: String,
    pub recipe_id: String,
    #[ts(type = "number")]
    pub started_at_ms: i64,
    #[ts(type = "number")]
    pub ready_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct AnimalShelterState {
    pub id: String,
    pub kind: ShelterKind,
    pub tile: Tile,
    pub animals: Vec<AnimalSlot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct AnimalSlot {
    pub id: String,
    pub state: AnimalState,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AnimalState {
    Idle,
    Producing {
        #[ts(type = "number")]
        fed_at_ms: i64,
        #[ts(type = "number")]
        ready_at_ms: i64,
    },
    Ready,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct DeliveryOrder {
    pub id: String,
    pub requirements: Vec<ItemStack>,
    pub reward_coins: u32,
    pub reward_xp: u32,
}

pub fn new_farm(now_ms: i64, catalog: &CatalogDocument) -> FarmState {
    let mut inventory = BTreeMap::new();
    inventory.insert("wheat".to_owned(), 6);
    inventory.insert("corn".to_owned(), 3);
    let mut farm = FarmState {
        last_update_ms: now_ms,
        xp: 0,
        level: 1,
        coins: 180,
        silo_capacity: 40,
        barn_capacity: 30,
        inventory,
        field_plots: starting_plots(),
        machines: Vec::new(),
        shelters: Vec::new(),
        delivery_board_built: false,
        delivery_board_tile: default_delivery_board_tile(),
        delivery_orders: Vec::new(),
        next_id: 1,
    };
    update_level(&mut farm, catalog);
    farm
}

pub fn inventory_quantity(farm: &FarmState, item_id: &str) -> u32 {
    farm.inventory.get(item_id).copied().unwrap_or(0)
}

pub fn add_inventory(farm: &mut FarmState, item_id: &str, quantity: u32) {
    *farm.inventory.entry(item_id.to_owned()).or_insert(0) += quantity;
}

pub fn remove_inventory(
    farm: &mut FarmState,
    stacks: &[ItemStack],
) -> Result<(), crate::CommandError> {
    for stack in stacks {
        if inventory_quantity(farm, &stack.item_id) < stack.quantity {
            return Err(crate::CommandError::new(format!(
                "not enough {}",
                stack.item_id
            )));
        }
    }
    for stack in stacks {
        let entry = farm.inventory.entry(stack.item_id.clone()).or_insert(0);
        *entry -= stack.quantity;
        if *entry == 0 {
            farm.inventory.remove(&stack.item_id);
        }
    }
    Ok(())
}

pub fn storage_used(farm: &FarmState, catalog: &CatalogDocument, kind: ItemKind) -> u32 {
    farm.inventory
        .iter()
        .filter(|(item_id, _)| {
            catalog
                .item_kind(item_id)
                .is_some_and(|item_kind| *item_kind == kind)
        })
        .map(|(_, quantity)| *quantity)
        .sum()
}

pub fn crop_storage_used(farm: &FarmState, catalog: &CatalogDocument) -> u32 {
    storage_used(farm, catalog, ItemKind::Crop)
}

pub fn barn_storage_used(farm: &FarmState, catalog: &CatalogDocument) -> u32 {
    farm.inventory
        .iter()
        .filter(|(item_id, _)| {
            !catalog
                .item_kind(item_id)
                .is_some_and(|kind| *kind == ItemKind::Crop)
        })
        .map(|(_, quantity)| *quantity)
        .sum()
}

pub fn has_storage_room(farm: &FarmState, catalog: &CatalogDocument, stacks: &[ItemStack]) -> bool {
    let crop_add = stacks
        .iter()
        .filter(|stack| {
            catalog
                .item_kind(&stack.item_id)
                .is_some_and(|kind| *kind == ItemKind::Crop)
        })
        .map(|stack| stack.quantity)
        .sum::<u32>();
    let barn_add = stacks
        .iter()
        .filter(|stack| {
            !catalog
                .item_kind(&stack.item_id)
                .is_some_and(|kind| *kind == ItemKind::Crop)
        })
        .map(|stack| stack.quantity)
        .sum::<u32>();
    crop_storage_used(farm, catalog) + crop_add <= farm.silo_capacity
        && barn_storage_used(farm, catalog) + barn_add <= farm.barn_capacity
}

pub fn gain_xp(farm: &mut FarmState, catalog: &CatalogDocument, xp: u32) {
    farm.xp += xp;
    update_level(farm, catalog);
}

pub fn update_level(farm: &mut FarmState, catalog: &CatalogDocument) {
    farm.level = catalog.level_for_xp(farm.xp);
}

pub fn next_id(farm: &mut FarmState, prefix: &str) -> String {
    let id = format!("{}-{}", prefix, farm.next_id);
    farm.next_id += 1;
    id
}

pub fn add_shelter_animals(farm: &mut FarmState, shelter: &ShelterDef) -> Vec<AnimalSlot> {
    (0..shelter.slots)
        .map(|_| AnimalSlot {
            id: next_id(farm, "animal"),
            state: AnimalState::Idle,
        })
        .collect()
}

fn starting_plots() -> Vec<FieldPlot> {
    (0..6)
        .map(|index| FieldPlot {
            id: format!("plot-{}", index + 1),
            tile: Tile::new(index % 3, index / 3),
            crop: None,
        })
        .collect()
}

pub fn default_delivery_board_tile() -> Tile {
    Tile::new(2, 7)
}
