use crate::{
    CatalogDocument, FarmState, ItemKind, ItemStack, ReservedWorkTarget, ResidentTask,
    ResidentTaskKind, ResidentTaskStep, ResidentTaskStepWork, StorageSourceRef, Tile,
    barn_storage_used, crop_storage_used,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq)]
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
    #[serde(default)]
    #[ts(optional)]
    pub farm_shop: Option<crate::FarmShopState>,
    pub delivery_orders: Vec<crate::DeliveryOrder>,
    pub residents: Vec<crate::FarmResident>,
    pub selected_resident_id: String,
    pub resident_locations: std::collections::BTreeMap<String, crate::Tile>,
    pub resident_work: std::collections::BTreeMap<String, ResidentWorkView>,
    pub reservations: ReservationView,
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

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq)]
pub struct ResidentScenePoint {
    pub x: f64,
    pub y: f64,
}

impl ResidentScenePoint {
    fn from_tile(tile: &Tile) -> Self {
        Self {
            x: tile.x as f64,
            y: tile.y as f64,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResidentWorkState {
    Idle,
    Walking,
    Working,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResidentPathState {
    Walking,
    Working,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResidentVisualActivity {
    Idle,
    Walking,
    PickingUpItems,
    PickingUpTools,
    Planting,
    Harvesting,
    CollectingMachine,
    StartingOven,
    CollectingOven,
    FeedingAnimal,
    CollectingAnimalProduct,
    DepositingInventory,
    ReturningTools,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResidentVisualProp {
    None,
    SeedPouch,
    Basket,
    Bucket,
    Crate,
    OvenTray,
    ToolBundle,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResidentTargetKind {
    Farmhouse,
    FieldPlot,
    Silo,
    Barn,
    ToolSource,
    Machine,
    Oven,
    Animal,
    FarmShop,
    Work,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq)]
pub struct ResidentTargetView {
    pub kind: ResidentTargetKind,
    #[serde(default)]
    #[ts(optional)]
    pub id: Option<String>,
    pub label: String,
    pub tile: ResidentScenePoint,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq)]
pub struct ResidentSceneView {
    pub tile: ResidentScenePoint,
    pub path: Vec<ResidentScenePoint>,
    #[serde(default)]
    #[ts(optional)]
    pub path_state: Option<ResidentPathState>,
    pub inside_house: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq)]
pub struct ResidentStepView {
    pub label: String,
    pub activity: ResidentVisualActivity,
    pub prop: ResidentVisualProp,
    #[serde(default)]
    #[ts(optional)]
    pub target: Option<ResidentTargetView>,
    pub quantity: u32,
    pub kind: ItemKind,
    #[ts(type = "number")]
    pub walk_duration_ms: i64,
    #[ts(type = "number")]
    pub work_duration_ms: i64,
    #[ts(type = "number")]
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResidentTaskQueueState {
    Current,
    Queued,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq)]
pub struct ResidentTaskSummaryView {
    pub id: String,
    pub kind: ResidentTaskKind,
    pub label: String,
    pub step_count: u32,
    pub steps: Vec<ResidentStepView>,
    pub queue_state: ResidentTaskQueueState,
    #[ts(type = "number")]
    pub started_at_ms: i64,
    #[ts(type = "number")]
    pub ready_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ResidentCarryItemView {
    pub item_id: String,
    pub name: String,
    pub quantity: u32,
    pub kind: ItemKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ResidentCarryToolView {
    pub tool_kind: crate::ToolKind,
    pub label: String,
    pub quantity: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ResidentCarryView {
    pub items: Vec<ResidentCarryItemView>,
    pub tools: Vec<ResidentCarryToolView>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct BlockedResidentTaskView {
    pub task_id: String,
    pub resident_id: String,
    pub reason: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq)]
pub struct ResidentWorkView {
    pub resident_id: String,
    pub display_name: String,
    pub selected: bool,
    pub state: ResidentWorkState,
    #[serde(default)]
    #[ts(optional)]
    pub current_task: Option<ResidentTaskSummaryView>,
    pub queue: Vec<ResidentTaskSummaryView>,
    #[serde(default)]
    #[ts(optional)]
    pub current_step: Option<ResidentStepView>,
    #[serde(default)]
    #[ts(optional)]
    pub target: Option<ResidentTargetView>,
    pub scene: ResidentSceneView,
    pub carry: ResidentCarryView,
    #[serde(default)]
    #[ts(optional)]
    pub block: Option<BlockedResidentTaskView>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ReservationReasonView {
    pub resident_id: String,
    pub resident_name: String,
    pub task_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct AnimalReservationKey {
    pub shelter_id: String,
    pub animal_slot: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq)]
pub struct ReservedPathTileView {
    pub tile: Tile,
    pub resident_id: String,
    pub task_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq)]
pub struct ReservationView {
    pub field_plots: std::collections::BTreeMap<String, ReservationReasonView>,
    pub machines: std::collections::BTreeMap<String, ReservationReasonView>,
    #[serde(default)]
    #[ts(optional)]
    pub oven: Option<ReservationReasonView>,
    pub animals: Vec<(AnimalReservationKey, ReservationReasonView)>,
    #[serde(default)]
    pub farm_shop_stock: std::collections::BTreeMap<String, u32>,
    pub path_tiles: Vec<ReservedPathTileView>,
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
        field_plots: farm.field_plots.clone(),
        machines: farm.machines.clone(),
        owned_farmhouse_upgrades: farm.owned_farmhouse_upgrades.clone(),
        oven: farm.oven.clone(),
        shelters: farm.shelters.clone(),
        delivery_board_built: farm.delivery_board_built,
        delivery_board_tile: farm.delivery_board_tile.clone(),
        tool_shed: farm.tool_shed.clone(),
        farm_shop: farm.farm_shop.clone(),
        delivery_orders: farm.delivery_orders.clone(),
        residents: farm.residents.clone(),
        selected_resident_id: farm.selected_resident_id.clone(),
        resident_locations: farm.resident_locations.clone(),
        resident_work: resident_work(farm, catalog),
        reservations: reservations(farm),
        resident_cleanup_blocks: cleanup_blocks(farm, catalog),
        house_interior: farm.house_interior.clone(),
        unlocks: vec![
            unlock(1, "Fields and wheat", farm.level),
            unlock(2, "Oven, bread, corn, and Farm Shop", farm.level),
            unlock(3, "Feed mill, chickens, eggs, and soybeans", farm.level),
            unlock(4, "Delivery orders and corn bread", farm.level),
            unlock(5, "Cow pasture, milk, carrots, and cow feed", farm.level),
            unlock(6, "Potatoes, potato bread, and carrot cake", farm.level),
            unlock(7, "Tomatoes and tomato tart", farm.level),
        ],
    }
}

fn resident_work(
    farm: &FarmState,
    catalog: &CatalogDocument,
) -> std::collections::BTreeMap<String, ResidentWorkView> {
    farm.residents
        .iter()
        .map(|resident| {
            let queue = farm
                .resident_task_queues
                .get(&resident.id)
                .map(Vec::as_slice)
                .unwrap_or(&[]);
            let current_task = queue.first();
            let current_step = current_task.and_then(|task| task.steps.first());
            let block = farm.blocked_resident_tasks.get(&resident.id);
            let state = resident_state(farm, &resident.id, current_task, current_step, block);
            let target = current_step.and_then(|step| resident_target_view(farm, step));
            let scene = resident_scene_view(farm, &resident.id, current_task, current_step, &state);
            let queue_views = queue
                .iter()
                .enumerate()
                .map(|(index, task)| {
                    resident_task_summary(
                        catalog,
                        farm,
                        task,
                        if index == 0 && block.is_some() {
                            ResidentTaskQueueState::Blocked
                        } else if index == 0 {
                            ResidentTaskQueueState::Current
                        } else {
                            ResidentTaskQueueState::Queued
                        },
                    )
                })
                .collect::<Vec<_>>();
            let current_task_view = current_task.map(|task| {
                resident_task_summary(
                    catalog,
                    farm,
                    task,
                    if block.is_some() {
                        ResidentTaskQueueState::Blocked
                    } else {
                        ResidentTaskQueueState::Current
                    },
                )
            });
            let current_step_view =
                current_step.map(|step| resident_step_view(farm, catalog, step));
            let block_view = block.map(|block| BlockedResidentTaskView {
                task_id: block.task_id.clone(),
                resident_id: resident.id.clone(),
                reason: block.reason.clone(),
                message: block.message.clone(),
            });

            (
                resident.id.clone(),
                ResidentWorkView {
                    resident_id: resident.id.clone(),
                    display_name: resident.display_name.clone(),
                    selected: resident.id == farm.selected_resident_id,
                    state,
                    current_task: current_task_view,
                    queue: queue_views,
                    current_step: current_step_view,
                    target,
                    scene,
                    carry: resident_carry_view(farm, catalog, &resident.id),
                    block: block_view,
                },
            )
        })
        .collect()
}

fn resident_state(
    farm: &FarmState,
    resident_id: &str,
    current_task: Option<&ResidentTask>,
    current_step: Option<&ResidentTaskStep>,
    block: Option<&crate::BlockedResidentTask>,
) -> ResidentWorkState {
    if block.is_some() {
        return ResidentWorkState::Blocked;
    }
    let Some(task) = current_task else {
        return ResidentWorkState::Idle;
    };
    let Some(step) = current_step else {
        return ResidentWorkState::Idle;
    };
    let walk_ends_at_ms = task.started_at_ms + step.walk_duration_ms;
    if !step.walk_path.is_empty() && farm.last_update_ms < walk_ends_at_ms {
        ResidentWorkState::Walking
    } else {
        let _ = resident_id;
        ResidentWorkState::Working
    }
}

fn resident_scene_view(
    farm: &FarmState,
    resident_id: &str,
    current_task: Option<&ResidentTask>,
    current_step: Option<&ResidentTaskStep>,
    state: &ResidentWorkState,
) -> ResidentSceneView {
    let current_tile = farm
        .resident_locations
        .get(resident_id)
        .cloned()
        .unwrap_or_else(|| Tile::new(8, 10));
    let Some(task) = current_task else {
        return ResidentSceneView {
            tile: ResidentScenePoint::from_tile(&current_tile),
            path: Vec::new(),
            path_state: None,
            inside_house: false,
        };
    };
    let Some(step) = current_step else {
        return ResidentSceneView {
            tile: ResidentScenePoint::from_tile(&current_tile),
            path: Vec::new(),
            path_state: None,
            inside_house: false,
        };
    };
    let approach_tile = step
        .approach_tile
        .clone()
        .or_else(|| step.walk_path.last().cloned())
        .unwrap_or_else(|| current_tile.clone());
    let tile = match state {
        ResidentWorkState::Walking => interpolate_resident_path(
            &current_tile,
            &step.walk_path,
            task.started_at_ms,
            task.started_at_ms + step.walk_duration_ms,
            farm.last_update_ms,
        ),
        ResidentWorkState::Working | ResidentWorkState::Blocked => {
            ResidentScenePoint::from_tile(&approach_tile)
        }
        ResidentWorkState::Idle => ResidentScenePoint::from_tile(&current_tile),
    };
    let mut path = Vec::new();
    if !step.walk_path.is_empty() {
        path.push(ResidentScenePoint::from_tile(&current_tile));
        path.extend(step.walk_path.iter().map(ResidentScenePoint::from_tile));
    }
    let path_state = if path.is_empty() {
        None
    } else if matches!(state, ResidentWorkState::Walking) {
        Some(ResidentPathState::Walking)
    } else {
        Some(ResidentPathState::Working)
    };
    ResidentSceneView {
        tile,
        path,
        path_state,
        inside_house: matches!(step.reserved_work_target, ReservedWorkTarget::Oven)
            && matches!(
                state,
                ResidentWorkState::Working | ResidentWorkState::Blocked
            ),
    }
}

fn interpolate_resident_path(
    start: &Tile,
    path: &[Tile],
    started_at_ms: i64,
    walk_ends_at_ms: i64,
    now_ms: i64,
) -> ResidentScenePoint {
    if path.is_empty() {
        return ResidentScenePoint::from_tile(start);
    }
    let duration = walk_ends_at_ms - started_at_ms;
    if duration <= 0 || now_ms >= walk_ends_at_ms {
        return ResidentScenePoint::from_tile(path.last().unwrap());
    }
    let progress = ((now_ms - started_at_ms) as f64 / duration as f64).clamp(0.0, 1.0);
    if progress >= 1.0 {
        return ResidentScenePoint::from_tile(path.last().unwrap());
    }
    let scaled = progress * path.len() as f64;
    let segment_index = (scaled.floor() as usize).min(path.len() - 1);
    let segment_progress = scaled - segment_index as f64;
    let from = if segment_index == 0 {
        start
    } else {
        &path[segment_index - 1]
    };
    let to = &path[segment_index];
    ResidentScenePoint {
        x: from.x as f64 + (to.x - from.x) as f64 * segment_progress,
        y: from.y as f64 + (to.y - from.y) as f64 * segment_progress,
    }
}

fn resident_task_summary(
    catalog: &CatalogDocument,
    farm: &FarmState,
    task: &ResidentTask,
    queue_state: ResidentTaskQueueState,
) -> ResidentTaskSummaryView {
    ResidentTaskSummaryView {
        id: task.id.clone(),
        kind: task.kind.clone(),
        label: task_label(catalog, task),
        step_count: task.steps.len() as u32,
        steps: task
            .steps
            .iter()
            .map(|step| resident_step_view(farm, catalog, step))
            .collect(),
        queue_state,
        started_at_ms: task.started_at_ms,
        ready_at_ms: task.ready_at_ms,
    }
}

fn resident_step_view(
    farm: &FarmState,
    catalog: &CatalogDocument,
    step: &ResidentTaskStep,
) -> ResidentStepView {
    let (activity, prop) = visual_cue_for_work(&step.work);
    let (quantity, kind) = step_quantity_and_kind(catalog, &step.work);
    ResidentStepView {
        label: resident_task_step_label(catalog, &step.work),
        activity,
        prop,
        target: resident_target_view(farm, step),
        quantity,
        kind,
        walk_duration_ms: step.walk_duration_ms,
        work_duration_ms: step.work_duration_ms,
        duration_ms: step.duration_ms,
    }
}

fn step_quantity_and_kind(
    catalog: &CatalogDocument,
    work: &ResidentTaskStepWork,
) -> (u32, ItemKind) {
    match work {
        ResidentTaskStepWork::PickupItems { items, .. }
        | ResidentTaskStepWork::DepositItems { items, .. }
        | ResidentTaskStepWork::DepositShopStock { items }
        | ResidentTaskStepWork::PickupShopStock { items } => {
            quantity_and_kind_for_stacks(catalog, items)
        }
        ResidentTaskStepWork::PlantCrop { crop_id } => (
            1,
            catalog
                .item(crop_id)
                .map(|item| item.kind.clone())
                .unwrap_or(ItemKind::Crop),
        ),
        ResidentTaskStepWork::HarvestCrop { crop_id, quantity } => (
            *quantity,
            catalog
                .item(crop_id)
                .map(|item| item.kind.clone())
                .unwrap_or(ItemKind::Crop),
        ),
        ResidentTaskStepWork::StartOvenRecipe { recipe_id, .. } => catalog
            .recipe(recipe_id)
            .map(|recipe| quantity_and_kind_for_stacks(catalog, &recipe.inputs))
            .unwrap_or((0, ItemKind::Product)),
        ResidentTaskStepWork::CollectMachineJob { recipe_id, .. }
        | ResidentTaskStepWork::CollectOvenJob { recipe_id, .. } => catalog
            .recipe(recipe_id)
            .map(|recipe| quantity_and_kind_for_stacks(catalog, &recipe.outputs))
            .unwrap_or((0, ItemKind::Product)),
        ResidentTaskStepWork::FeedAnimal => (1, ItemKind::Product),
        ResidentTaskStepWork::CollectAnimalProduct { item_id, quantity } => (
            *quantity,
            catalog
                .item(item_id)
                .map(|item| item.kind.clone())
                .unwrap_or(ItemKind::Product),
        ),
        ResidentTaskStepWork::DepositInventory { item_id, quantity } => (
            *quantity,
            catalog
                .item(item_id)
                .map(|item| item.kind.clone())
                .unwrap_or(ItemKind::Product),
        ),
        ResidentTaskStepWork::PickupTools { tools, .. }
        | ResidentTaskStepWork::ReturnTools { tools, .. } => (
            tools.iter().map(|tool| tool.quantity).sum(),
            ItemKind::Product,
        ),
    }
}

fn quantity_and_kind_for_stacks(
    catalog: &CatalogDocument,
    stacks: &[ItemStack],
) -> (u32, ItemKind) {
    let quantity = stacks.iter().map(|stack| stack.quantity).sum();
    let kind = stacks
        .first()
        .and_then(|stack| catalog.item(&stack.item_id))
        .map(|item| item.kind.clone())
        .unwrap_or(ItemKind::Product);
    (quantity, kind)
}

fn task_label(catalog: &CatalogDocument, task: &ResidentTask) -> String {
    let first_work = task
        .steps
        .iter()
        .find(|step| !is_resource_step_work(&step.work))
        .or_else(|| task.steps.first())
        .map(|step| &step.work);
    match first_work {
        Some(work) => resident_task_step_label(catalog, work),
        None => match task.kind {
            ResidentTaskKind::FieldWork => "Field work".to_owned(),
            ResidentTaskKind::ProductionWork => "Production work".to_owned(),
            ResidentTaskKind::ShopWork => "Shop work".to_owned(),
        },
    }
}

fn resident_task_step_label(catalog: &CatalogDocument, work: &ResidentTaskStepWork) -> String {
    match work {
        ResidentTaskStepWork::PickupItems { items, .. } => {
            format!("Pick up {}", stack_list_label(catalog, items))
        }
        ResidentTaskStepWork::PickupTools { tools, .. } => {
            format!("Pick up {}", tool_list_label(tools))
        }
        ResidentTaskStepWork::PlantCrop { crop_id } => {
            format!("Plant {}", item_name(catalog, crop_id))
        }
        ResidentTaskStepWork::HarvestCrop { crop_id, .. } => {
            format!("Harvest {}", item_name(catalog, crop_id))
        }
        ResidentTaskStepWork::CollectMachineJob { recipe_id, .. } => {
            format!("Collect {}", recipe_name(catalog, recipe_id))
        }
        ResidentTaskStepWork::StartOvenRecipe { recipe_id, .. } => {
            format!("Start {}", recipe_name(catalog, recipe_id))
        }
        ResidentTaskStepWork::CollectOvenJob { recipe_id, .. } => {
            format!("Collect {}", recipe_name(catalog, recipe_id))
        }
        ResidentTaskStepWork::FeedAnimal => "Feed animal".to_owned(),
        ResidentTaskStepWork::CollectAnimalProduct { item_id, .. } => {
            format!("Collect {}", item_name(catalog, item_id))
        }
        ResidentTaskStepWork::DepositInventory { item_id, .. } => {
            format!("Store {}", item_name(catalog, item_id))
        }
        ResidentTaskStepWork::DepositItems { items, .. } => {
            format!("Store {}", stack_list_label(catalog, items))
        }
        ResidentTaskStepWork::DepositShopStock { items } => {
            format!("Stock {}", stack_list_label(catalog, items))
        }
        ResidentTaskStepWork::PickupShopStock { items } => {
            format!("Return {}", stack_list_label(catalog, items))
        }
        ResidentTaskStepWork::ReturnTools { .. } => "Return tools".to_owned(),
    }
}

fn visual_cue_for_work(
    work: &ResidentTaskStepWork,
) -> (ResidentVisualActivity, ResidentVisualProp) {
    match work {
        ResidentTaskStepWork::PickupItems { .. } => (
            ResidentVisualActivity::PickingUpItems,
            ResidentVisualProp::Crate,
        ),
        ResidentTaskStepWork::PickupTools { .. } => (
            ResidentVisualActivity::PickingUpTools,
            ResidentVisualProp::ToolBundle,
        ),
        ResidentTaskStepWork::PlantCrop { .. } => (
            ResidentVisualActivity::Planting,
            ResidentVisualProp::SeedPouch,
        ),
        ResidentTaskStepWork::HarvestCrop { .. } => (
            ResidentVisualActivity::Harvesting,
            ResidentVisualProp::Basket,
        ),
        ResidentTaskStepWork::CollectMachineJob { .. } => (
            ResidentVisualActivity::CollectingMachine,
            ResidentVisualProp::Crate,
        ),
        ResidentTaskStepWork::StartOvenRecipe { .. } => (
            ResidentVisualActivity::StartingOven,
            ResidentVisualProp::OvenTray,
        ),
        ResidentTaskStepWork::CollectOvenJob { .. } => (
            ResidentVisualActivity::CollectingOven,
            ResidentVisualProp::OvenTray,
        ),
        ResidentTaskStepWork::FeedAnimal => (
            ResidentVisualActivity::FeedingAnimal,
            ResidentVisualProp::Bucket,
        ),
        ResidentTaskStepWork::CollectAnimalProduct { .. } => (
            ResidentVisualActivity::CollectingAnimalProduct,
            ResidentVisualProp::Basket,
        ),
        ResidentTaskStepWork::DepositInventory { .. }
        | ResidentTaskStepWork::DepositItems { .. }
        | ResidentTaskStepWork::DepositShopStock { .. } => (
            ResidentVisualActivity::DepositingInventory,
            ResidentVisualProp::Crate,
        ),
        ResidentTaskStepWork::PickupShopStock { .. } => (
            ResidentVisualActivity::PickingUpItems,
            ResidentVisualProp::Crate,
        ),
        ResidentTaskStepWork::ReturnTools { .. } => (
            ResidentVisualActivity::ReturningTools,
            ResidentVisualProp::ToolBundle,
        ),
    }
}

fn resident_target_view(farm: &FarmState, step: &ResidentTaskStep) -> Option<ResidentTargetView> {
    let approach_tile = step.approach_tile.clone();
    let target = match &step.reserved_work_target {
        ReservedWorkTarget::FieldPlot { plot_id } => {
            let plot = farm.field_plots.iter().find(|plot| plot.id == *plot_id)?;
            ResidentTargetView {
                kind: ResidentTargetKind::FieldPlot,
                id: Some(plot.id.clone()),
                label: format!("Field Plot {}", plot.id),
                tile: approach_tile
                    .as_ref()
                    .map(ResidentScenePoint::from_tile)
                    .unwrap_or_else(|| ResidentScenePoint::from_tile(&plot.tile)),
            }
        }
        ReservedWorkTarget::Silo => ResidentTargetView {
            kind: ResidentTargetKind::Silo,
            id: None,
            label: "Silo".to_owned(),
            tile: approach_tile
                .as_ref()
                .map(ResidentScenePoint::from_tile)
                .unwrap_or_else(|| ResidentScenePoint::from_tile(&farm.silo_tile)),
        },
        ReservedWorkTarget::Barn => ResidentTargetView {
            kind: ResidentTargetKind::Barn,
            id: None,
            label: "Barn".to_owned(),
            tile: approach_tile
                .as_ref()
                .map(ResidentScenePoint::from_tile)
                .unwrap_or_else(|| ResidentScenePoint::from_tile(&farm.barn_tile)),
        },
        ReservedWorkTarget::ToolSource => tool_source_target_view(farm, step, approach_tile)?,
        ReservedWorkTarget::Machine { machine_id } => {
            let machine = farm
                .machines
                .iter()
                .find(|machine| machine.id == *machine_id)?;
            ResidentTargetView {
                kind: ResidentTargetKind::Machine,
                id: Some(machine.id.clone()),
                label: "Machine".to_owned(),
                tile: approach_tile
                    .as_ref()
                    .map(ResidentScenePoint::from_tile)
                    .unwrap_or_else(|| ResidentScenePoint::from_tile(&machine.tile)),
            }
        }
        ReservedWorkTarget::Oven => ResidentTargetView {
            kind: ResidentTargetKind::Oven,
            id: Some(farm.oven.id.clone()),
            label: "Oven".to_owned(),
            tile: approach_tile
                .as_ref()
                .map(ResidentScenePoint::from_tile)
                .unwrap_or(ResidentScenePoint { x: 8.5, y: 8.5 }),
        },
        ReservedWorkTarget::FarmShop { shop_id } => {
            let shop = farm.farm_shop.as_ref().filter(|shop| shop.id == *shop_id)?;
            ResidentTargetView {
                kind: ResidentTargetKind::FarmShop,
                id: Some(shop.id.clone()),
                label: "Farm Shop".to_owned(),
                tile: approach_tile
                    .as_ref()
                    .map(ResidentScenePoint::from_tile)
                    .unwrap_or_else(|| ResidentScenePoint::from_tile(&shop.tile)),
            }
        }
        ReservedWorkTarget::Animal {
            shelter_id,
            animal_slot,
        } => {
            let shelter = farm
                .shelters
                .iter()
                .find(|shelter| shelter.id == *shelter_id)?;
            ResidentTargetView {
                kind: ResidentTargetKind::Animal,
                id: Some(format!("{shelter_id}:{animal_slot}")),
                label: "Animal".to_owned(),
                tile: approach_tile
                    .as_ref()
                    .map(ResidentScenePoint::from_tile)
                    .unwrap_or_else(|| ResidentScenePoint::from_tile(&shelter.tile)),
            }
        }
    };
    Some(target)
}

fn tool_source_target_view(
    farm: &FarmState,
    step: &ResidentTaskStep,
    approach_tile: Option<Tile>,
) -> Option<ResidentTargetView> {
    let source = match &step.work {
        ResidentTaskStepWork::PickupTools { source, .. }
        | ResidentTaskStepWork::ReturnTools { source, .. } => Some(source),
        _ => None,
    };
    match source {
        Some(crate::ToolSourceRef::ToolShed { id }) => {
            let tool_shed = farm
                .tool_shed
                .as_ref()
                .filter(|tool_shed| tool_shed.id == *id)?;
            Some(ResidentTargetView {
                kind: ResidentTargetKind::ToolSource,
                id: Some(id.clone()),
                label: "Tool Shed".to_owned(),
                tile: approach_tile
                    .as_ref()
                    .map(ResidentScenePoint::from_tile)
                    .unwrap_or_else(|| ResidentScenePoint::from_tile(&tool_shed.tile)),
            })
        }
        _ => Some(ResidentTargetView {
            kind: ResidentTargetKind::ToolSource,
            id: Some("farmhouse".to_owned()),
            label: "Farmhouse".to_owned(),
            tile: approach_tile
                .as_ref()
                .map(ResidentScenePoint::from_tile)
                .unwrap_or(ResidentScenePoint { x: 8.5, y: 8.5 }),
        }),
    }
}

fn resident_carry_view(
    farm: &FarmState,
    catalog: &CatalogDocument,
    resident_id: &str,
) -> ResidentCarryView {
    let Some(inventory) = farm.resident_inventories.get(resident_id) else {
        return ResidentCarryView {
            items: Vec::new(),
            tools: Vec::new(),
        };
    };
    let items = inventory
        .items
        .iter()
        .filter_map(|(item_id, quantity)| {
            if *quantity == 0 {
                return None;
            }
            catalog.item(item_id).map(|item| ResidentCarryItemView {
                item_id: item_id.clone(),
                name: item.name.clone(),
                quantity: *quantity,
                kind: item.kind.clone(),
            })
        })
        .collect();
    let tools = inventory
        .tools
        .iter()
        .filter(|(_, quantity)| **quantity > 0)
        .map(|(tool_kind, quantity)| ResidentCarryToolView {
            tool_kind: *tool_kind,
            label: tool_label(*tool_kind),
            quantity: *quantity,
        })
        .collect();
    ResidentCarryView { items, tools }
}

fn reservations(farm: &FarmState) -> ReservationView {
    let mut field_plots = std::collections::BTreeMap::new();
    let mut machines = std::collections::BTreeMap::new();
    let mut oven = None;
    let mut animals = Vec::new();
    let mut farm_shop_stock = std::collections::BTreeMap::new();
    let mut path_tiles = Vec::new();

    for resident in &farm.residents {
        let Some(queue) = farm.resident_task_queues.get(&resident.id) else {
            continue;
        };
        for task in queue {
            let reason = ReservationReasonView {
                resident_id: resident.id.clone(),
                resident_name: resident.display_name.clone(),
                task_id: task.id.clone(),
                reason: format!("Reserved for {}'s task", resident.display_name),
            };
            for step in &task.steps {
                match &step.reserved_work_target {
                    ReservedWorkTarget::FieldPlot { plot_id } => {
                        field_plots.entry(plot_id.clone()).or_insert(reason.clone());
                    }
                    ReservedWorkTarget::Machine { machine_id } => {
                        machines.entry(machine_id.clone()).or_insert(reason.clone());
                    }
                    ReservedWorkTarget::Oven => {
                        oven.get_or_insert_with(|| reason.clone());
                    }
                    ReservedWorkTarget::Animal {
                        shelter_id,
                        animal_slot,
                    } => animals.push((
                        AnimalReservationKey {
                            shelter_id: shelter_id.clone(),
                            animal_slot: animal_slot.clone(),
                        },
                        reason.clone(),
                    )),
                    ReservedWorkTarget::FarmShop { .. } => {
                        if let ResidentTaskStepWork::PickupShopStock { items } = &step.work {
                            for item in items {
                                *farm_shop_stock.entry(item.item_id.clone()).or_insert(0) +=
                                    item.quantity;
                            }
                        }
                    }
                    ReservedWorkTarget::Silo
                    | ReservedWorkTarget::Barn
                    | ReservedWorkTarget::ToolSource => {}
                }
                for tile in &step.walk_path {
                    path_tiles.push(ReservedPathTileView {
                        tile: tile.clone(),
                        resident_id: resident.id.clone(),
                        task_id: task.id.clone(),
                    });
                }
            }
        }
    }

    ReservationView {
        field_plots,
        machines,
        oven,
        animals,
        farm_shop_stock,
        path_tiles,
    }
}

fn is_resource_step_work(work: &ResidentTaskStepWork) -> bool {
    matches!(
        work,
        ResidentTaskStepWork::PickupItems { .. }
            | ResidentTaskStepWork::PickupTools { .. }
            | ResidentTaskStepWork::DepositInventory { .. }
            | ResidentTaskStepWork::DepositItems { .. }
            | ResidentTaskStepWork::DepositShopStock { .. }
            | ResidentTaskStepWork::PickupShopStock { .. }
            | ResidentTaskStepWork::ReturnTools { .. }
    )
}

fn item_name(catalog: &CatalogDocument, item_id: &str) -> String {
    catalog
        .item(item_id)
        .map(|item| item.name.clone())
        .unwrap_or_else(|| item_id.to_owned())
}

fn recipe_name(catalog: &CatalogDocument, recipe_id: &str) -> String {
    catalog
        .recipe(recipe_id)
        .map(|recipe| recipe.name.clone())
        .unwrap_or_else(|| recipe_id.to_owned())
}

fn stack_list_label(catalog: &CatalogDocument, items: &[ItemStack]) -> String {
    items
        .iter()
        .map(|item| format!("{} {}", item.quantity, item_name(catalog, &item.item_id)))
        .collect::<Vec<_>>()
        .join(", ")
}

fn tool_list_label(tools: &[crate::ToolStack]) -> String {
    tools
        .iter()
        .map(|tool| {
            format!(
                "{} {}",
                tool.quantity,
                tool_label(tool.tool_kind).to_lowercase()
            )
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn tool_label(tool_kind: crate::ToolKind) -> String {
    match tool_kind {
        crate::ToolKind::Hoe => "Hoe",
        crate::ToolKind::Sickle => "Sickle",
        crate::ToolKind::MixingBowl => "Mixing Bowl",
        crate::ToolKind::OvenMitt => "Oven Mitt",
        crate::ToolKind::FeedBucket => "Feed Bucket",
        crate::ToolKind::CollectionPail => "Collection Pail",
        crate::ToolKind::Wrench => "Wrench",
    }
    .to_owned()
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
