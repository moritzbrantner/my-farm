use crate::{
    CatalogDocument, FarmhouseUpgradeKind, ItemKind, ItemStack, MachineKind, ShelterDef,
    ShelterKind,
};
use schemars::JsonSchema;
use serde::{Deserialize, Deserializer, Serialize};
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

#[derive(Debug, Clone, Serialize, JsonSchema, TS, PartialEq, Eq)]
pub struct FarmState {
    #[ts(type = "number")]
    pub last_update_ms: i64,
    pub xp: u32,
    pub level: u32,
    pub coins: u32,
    pub silo_capacity: u32,
    #[serde(default = "default_storage_upgrade_tier")]
    pub silo_upgrade_tier: u32,
    #[serde(default = "default_silo_tile")]
    pub silo_tile: Tile,
    pub barn_capacity: u32,
    #[serde(default = "default_storage_upgrade_tier")]
    pub barn_upgrade_tier: u32,
    #[serde(default = "default_barn_tile")]
    pub barn_tile: Tile,
    pub inventory: BTreeMap<String, u32>,
    #[serde(default = "default_claimed_crop_unlocks")]
    pub claimed_crop_unlocks: Vec<String>,
    pub field_plots: Vec<FieldPlot>,
    pub machines: Vec<MachineState>,
    #[serde(default)]
    pub owned_farmhouse_upgrades: Vec<FarmhouseUpgradeKind>,
    #[serde(default = "default_oven_state")]
    pub oven: OvenState,
    pub shelters: Vec<AnimalShelterState>,
    pub delivery_board_built: bool,
    #[serde(default = "default_delivery_board_tile")]
    pub delivery_board_tile: Tile,
    pub delivery_orders: Vec<DeliveryOrder>,
    #[serde(default = "default_residents")]
    pub residents: Vec<FarmResident>,
    #[serde(default = "default_selected_resident_id")]
    pub selected_resident_id: String,
    #[serde(default = "default_resident_task_queues")]
    pub resident_task_queues: BTreeMap<String, Vec<ResidentTask>>,
    #[serde(default = "default_house_interior")]
    pub house_interior: HouseInterior,
    #[ts(type = "number")]
    pub next_id: u64,
}

impl<'de> Deserialize<'de> for FarmState {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let raw = FarmStateSerde::deserialize(deserializer)?;
        Ok(raw.into_farm_state())
    }
}

#[derive(Deserialize)]
struct FarmStateSerde {
    last_update_ms: i64,
    xp: u32,
    level: u32,
    coins: u32,
    silo_capacity: u32,
    #[serde(default = "default_storage_upgrade_tier")]
    silo_upgrade_tier: u32,
    #[serde(default = "default_silo_tile")]
    silo_tile: Tile,
    barn_capacity: u32,
    #[serde(default = "default_storage_upgrade_tier")]
    barn_upgrade_tier: u32,
    #[serde(default = "default_barn_tile")]
    barn_tile: Tile,
    inventory: BTreeMap<String, u32>,
    #[serde(default = "default_claimed_crop_unlocks")]
    claimed_crop_unlocks: Vec<String>,
    field_plots: Vec<FieldPlot>,
    #[serde(default)]
    machines: Vec<LegacyMachineState>,
    #[serde(default)]
    owned_farmhouse_upgrades: Vec<FarmhouseUpgradeKind>,
    #[serde(default)]
    oven: Option<OvenState>,
    shelters: Vec<AnimalShelterState>,
    delivery_board_built: bool,
    #[serde(default = "default_delivery_board_tile")]
    delivery_board_tile: Tile,
    delivery_orders: Vec<DeliveryOrder>,
    #[serde(default = "default_residents")]
    residents: Vec<FarmResident>,
    #[serde(default = "default_selected_resident_id")]
    selected_resident_id: String,
    #[serde(default = "default_resident_task_queues")]
    resident_task_queues: BTreeMap<String, Vec<ResidentTask>>,
    #[serde(default = "default_house_interior")]
    house_interior: HouseInterior,
    next_id: u64,
}

impl FarmStateSerde {
    fn into_farm_state(self) -> FarmState {
        let forward_oven_present = self.oven.is_some();
        let legacy_bakery = self
            .machines
            .iter()
            .find(|machine| machine.kind == LegacyMachineKind::Bakery)
            .cloned();
        let mut farm = FarmState {
            last_update_ms: self.last_update_ms,
            xp: self.xp,
            level: self.level,
            coins: self.coins,
            silo_capacity: self.silo_capacity,
            silo_upgrade_tier: self.silo_upgrade_tier,
            silo_tile: self.silo_tile,
            barn_capacity: self.barn_capacity,
            barn_upgrade_tier: self.barn_upgrade_tier,
            barn_tile: self.barn_tile,
            inventory: self.inventory,
            claimed_crop_unlocks: self.claimed_crop_unlocks,
            field_plots: self.field_plots,
            machines: self
                .machines
                .into_iter()
                .filter_map(LegacyMachineState::into_forward_machine)
                .collect(),
            owned_farmhouse_upgrades: self.owned_farmhouse_upgrades,
            oven: self.oven.unwrap_or_else(default_oven_state),
            shelters: self.shelters,
            delivery_board_built: self.delivery_board_built,
            delivery_board_tile: self.delivery_board_tile,
            delivery_orders: self.delivery_orders,
            residents: self.residents,
            selected_resident_id: self.selected_resident_id,
            resident_task_queues: self.resident_task_queues,
            house_interior: self.house_interior,
            next_id: self.next_id,
        };

        if let Some(legacy_bakery) = legacy_bakery {
            migrate_legacy_bakery(&mut farm, legacy_bakery, forward_oven_present);
        }

        farm
    }
}

#[derive(Debug, Clone, Deserialize)]
struct LegacyMachineState {
    id: String,
    kind: LegacyMachineKind,
    tile: Tile,
    queue: Vec<MachineJob>,
}

impl LegacyMachineState {
    fn into_forward_machine(self) -> Option<MachineState> {
        match self.kind {
            LegacyMachineKind::Bakery => None,
            LegacyMachineKind::FeedMill => Some(MachineState {
                id: self.id,
                kind: MachineKind::FeedMill,
                tile: self.tile,
                queue: self.queue,
            }),
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum LegacyMachineKind {
    Bakery,
    FeedMill,
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
pub struct OvenState {
    pub id: String,
    pub queue: Vec<MachineJob>,
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

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct FarmResident {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ResidentTask {
    pub id: String,
    pub kind: ResidentTaskKind,
    pub steps: Vec<ResidentTaskStep>,
    #[ts(type = "number")]
    pub started_at_ms: i64,
    #[ts(type = "number")]
    pub ready_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct HouseInterior {
    pub rooms: Vec<Room>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct Room {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub tiles: Vec<RoomTile>,
    pub decoration_placements: Vec<DecorationPlacement>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct RoomTile {
    pub x: u32,
    pub y: u32,
}

impl RoomTile {
    pub fn new(x: u32, y: u32) -> Self {
        Self { x, y }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct DecorationPlacement {
    pub id: String,
    pub decoration_id: String,
    pub tile: RoomTile,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ResidentTaskKind {
    FieldWork,
    ProductionWork,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ResidentTaskStep {
    pub reserved_work_target: ReservedWorkTarget,
    pub work: ResidentTaskStepWork,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ResidentTaskStepWork {
    PlantCrop { crop_id: String },
    HarvestCrop { crop_id: String, quantity: u32 },
    CollectMachineJob { job_id: String, recipe_id: String },
    CollectOvenJob { job_id: String, recipe_id: String },
    FeedAnimal,
    CollectAnimalProduct { item_id: String, quantity: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ReservedWorkTarget {
    FieldPlot {
        plot_id: String,
    },
    Machine {
        machine_id: String,
    },
    Oven,
    Animal {
        shelter_id: String,
        animal_slot: String,
    },
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
        silo_upgrade_tier: default_storage_upgrade_tier(),
        silo_tile: default_silo_tile(),
        barn_capacity: 30,
        barn_upgrade_tier: default_storage_upgrade_tier(),
        barn_tile: default_barn_tile(),
        inventory,
        claimed_crop_unlocks: default_claimed_crop_unlocks(),
        field_plots: starting_plots(),
        machines: Vec::new(),
        owned_farmhouse_upgrades: Vec::new(),
        oven: default_oven_state(),
        shelters: Vec::new(),
        delivery_board_built: false,
        delivery_board_tile: default_delivery_board_tile(),
        delivery_orders: Vec::new(),
        residents: default_residents(),
        selected_resident_id: default_selected_resident_id(),
        resident_task_queues: default_resident_task_queues(),
        house_interior: default_house_interior(),
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

pub fn default_silo_tile() -> Tile {
    Tile::new(14, 2)
}

pub fn default_storage_upgrade_tier() -> u32 {
    0
}

pub fn default_claimed_crop_unlocks() -> Vec<String> {
    vec!["wheat".to_owned(), "corn".to_owned()]
}

pub fn default_barn_tile() -> Tile {
    Tile::new(16, 2)
}

pub fn default_residents() -> Vec<FarmResident> {
    vec![
        FarmResident {
            id: "woman".to_owned(),
            display_name: "Woman".to_owned(),
        },
        FarmResident {
            id: "man".to_owned(),
            display_name: "Man".to_owned(),
        },
    ]
}

pub fn default_selected_resident_id() -> String {
    "woman".to_owned()
}

pub fn default_resident_task_queues() -> BTreeMap<String, Vec<ResidentTask>> {
    BTreeMap::from([
        ("woman".to_owned(), Vec::new()),
        ("man".to_owned(), Vec::new()),
    ])
}

pub fn default_oven_state() -> OvenState {
    OvenState {
        id: "oven".to_owned(),
        queue: Vec::new(),
    }
}

pub fn default_house_interior() -> HouseInterior {
    HouseInterior {
        rooms: vec![
            room(
                "living_room",
                "Living Room",
                vec![
                    placement("living-room-sofa", "sofa", 1, 1),
                    placement("living-room-rug", "rug", 2, 3),
                    placement("living-room-plant", "plant", 6, 1),
                ],
            ),
            room(
                "kitchen",
                "Kitchen",
                vec![
                    placement("kitchen-counter", "kitchen_counter", 0, 0),
                    placement("kitchen-table", "table", 3, 2),
                    placement("kitchen-chair", "chair", 5, 2),
                ],
            ),
            room(
                "bedroom",
                "Bedroom",
                vec![
                    placement("bedroom-bed", "bed", 1, 1),
                    placement("bedroom-cabinet", "cabinet", 5, 0),
                    placement("bedroom-lamp", "lamp", 6, 2),
                ],
            ),
        ],
    }
}

fn room(id: &str, name: &str, decoration_placements: Vec<DecorationPlacement>) -> Room {
    let width = 8;
    let height = 6;
    Room {
        id: id.to_owned(),
        name: name.to_owned(),
        width,
        height,
        tiles: room_tiles(width, height),
        decoration_placements,
    }
}

fn room_tiles(width: u32, height: u32) -> Vec<RoomTile> {
    (0..height)
        .flat_map(|y| (0..width).map(move |x| RoomTile::new(x, y)))
        .collect()
}

fn placement(id: &str, decoration_id: &str, x: u32, y: u32) -> DecorationPlacement {
    DecorationPlacement {
        id: id.to_owned(),
        decoration_id: decoration_id.to_owned(),
        tile: RoomTile::new(x, y),
    }
}

fn migrate_legacy_bakery(
    farm: &mut FarmState,
    legacy_bakery: LegacyMachineState,
    forward_oven_present: bool,
) {
    if !farm
        .owned_farmhouse_upgrades
        .contains(&FarmhouseUpgradeKind::Oven)
    {
        farm.owned_farmhouse_upgrades
            .push(FarmhouseUpgradeKind::Oven);
    }

    if !forward_oven_present {
        farm.oven = OvenState {
            id: legacy_bakery.id.clone(),
            queue: legacy_bakery.queue,
        };
    }

    for step in farm
        .resident_task_queues
        .values_mut()
        .flat_map(|queue| queue.iter_mut())
        .flat_map(|task| task.steps.iter_mut())
    {
        if matches!(
            &step.reserved_work_target,
            ReservedWorkTarget::Machine { machine_id } if machine_id == &legacy_bakery.id
        ) {
            step.reserved_work_target = ReservedWorkTarget::Oven;
            if let ResidentTaskStepWork::CollectMachineJob { job_id, recipe_id } = &step.work {
                step.work = ResidentTaskStepWork::CollectOvenJob {
                    job_id: job_id.clone(),
                    recipe_id: recipe_id.clone(),
                };
            }
        }
    }
}
