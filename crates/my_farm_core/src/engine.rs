use crate::{
    AnimalShelterState, AnimalState, CatalogDocument, DecorationDef, DecorationPlacement,
    DeliveryOrder, FarmState, FarmhouseUpgradeKind, FieldPlot, ItemKind, ItemStack, MachineJob,
    MachineKind, MachineState, OvenJob, OvenJobStatus, RecipeTarget, ReservedWorkTarget,
    ResidentTask, ResidentTaskKind, ResidentTaskStep, ResidentTaskStepWork, Room, RoomTile,
    ShelterKind, StorageKind, StorageSourceRef, StructureKind, Tile, ToolKind, ToolShedState,
    ToolSourceRef, ToolStack, add_inventory, add_shelter_animals, barn_storage_used,
    crop_storage_used, default_resident_task_step_duration_ms, default_tool_stock, gain_xp,
    inventory_quantity, next_id, remove_inventory, scaled_duration_ms, update_level,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use ts_rs::TS;

const FARM_GRID_SIZE: i32 = 18;
const FARM_HOUSE_TILE_X: i32 = 8;
const FARM_HOUSE_TILE_Y: i32 = 8;
const FARM_HOUSE_FOOTPRINT: StructureFootprint = StructureFootprint {
    width: 2,
    height: 2,
};
const CROP_STARTER_STOCK: u32 = 2;
const FIELD_PLOT_COST: u32 = 12;
const TOOL_SHED_COST: u32 = 45;
const TOOL_SHED_UNLOCK_LEVEL: u32 = 3;
const DECORATION_EDITING_UNLOCK_LEVEL: u32 = 5;
const RESIDENT_FIELD_WORK_BASE_DURATION_MS: i64 = 1_000;
const RESIDENT_FIELD_WORK_WALKED_TILE_DURATION_MS: i64 = 750;
const KITCHEN_OVEN_ROOM_ID: &str = "kitchen";
const KITCHEN_OVEN_TILE_X: u32 = 3;
const KITCHEN_OVEN_TILE_Y: u32 = 0;
const KITCHEN_OVEN_FOOTPRINT_WIDTH: u32 = 2;
const KITCHEN_OVEN_FOOTPRINT_HEIGHT: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct StructureFootprint {
    width: i32,
    height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FarmCommand {
    PlantCrop {
        plot_id: String,
        crop_id: String,
    },
    SweepPlant {
        crop_id: String,
        plot_ids: Vec<String>,
    },
    HarvestCrop {
        plot_id: String,
    },
    SweepHarvest {
        plot_ids: Vec<String>,
        #[serde(default)]
        #[ts(optional)]
        harvest_mode: Option<SweepHarvestMode>,
    },
    BuyStructure {
        structure_kind: StructureKind,
        tile: Tile,
    },
    BuyFarmhouseUpgrade {
        upgrade_kind: FarmhouseUpgradeKind,
    },
    UpgradeStorage {
        storage_kind: StorageKind,
    },
    BuyFieldPlot {
        tile: Tile,
    },
    MoveStructure {
        target: StructureTarget,
        tile: Tile,
    },
    QueueRecipe {
        machine_id: String,
        recipe_id: String,
    },
    QueueOvenRecipe {
        recipe_id: String,
    },
    CollectMachineJob {
        machine_id: String,
    },
    CollectOvenJob,
    FeedAnimal {
        shelter_id: String,
        animal_slot: String,
    },
    CollectAnimalProduct {
        shelter_id: String,
        animal_slot: String,
    },
    FulfillDeliveryOrder {
        order_id: String,
    },
    DiscardDeliveryOrder {
        order_id: String,
    },
    DiscardInventory {
        item_id: String,
        quantity: u32,
    },
    SelectResident {
        resident_id: String,
    },
    RenameResident {
        resident_id: String,
        display_name: String,
    },
    BuyMarketItem {
        item_id: String,
        quantity: u32,
    },
    SellMarketItem {
        item_id: String,
        quantity: u32,
    },
    PlaceDecoration {
        room_id: String,
        decoration_id: String,
        tile: RoomTile,
    },
    MoveDecoration {
        room_id: String,
        placement_id: String,
        tile: RoomTile,
    },
    RemoveDecoration {
        room_id: String,
        placement_id: String,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SweepHarvestMode {
    #[default]
    MatchingCrop,
    AllCrops,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StructureTarget {
    Silo,
    Barn,
    Machine { id: String },
    Shelter { id: String },
    DeliveryBoard,
    ToolShed { id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FarmEvent {
    CropPlanted {
        crop_id: String,
    },
    CropHarvested {
        crop_id: String,
        quantity: u32,
    },
    FieldPlotBuilt {
        plot_id: String,
    },
    StructureBuilt {
        structure_kind: StructureKind,
    },
    FarmhouseUpgradeBought {
        upgrade_kind: FarmhouseUpgradeKind,
    },
    StorageUpgraded {
        storage_kind: StorageKind,
        tier: u32,
        capacity: u32,
    },
    StructureMoved {
        target: StructureTarget,
        tile: Tile,
    },
    RecipeQueued {
        recipe_id: String,
    },
    MachineJobCollected {
        recipe_id: String,
    },
    AnimalFed {
        shelter_id: String,
    },
    AnimalProductCollected {
        item_id: String,
    },
    DeliveryOrderFulfilled {
        order_id: String,
    },
    DeliveryOrderDiscarded {
        order_id: String,
    },
    InventoryDiscarded {
        item_id: String,
        quantity: u32,
    },
    ResidentSelected {
        resident_id: String,
    },
    ResidentRenamed {
        resident_id: String,
        display_name: String,
    },
    MarketItemBought {
        item_id: String,
        quantity: u32,
        coins_spent: u32,
    },
    MarketItemSold {
        item_id: String,
        quantity: u32,
        coins_gained: u32,
    },
    DecorationPlaced {
        room_id: String,
        placement_id: String,
        decoration_id: String,
        tile: RoomTile,
    },
    DecorationMoved {
        room_id: String,
        placement_id: String,
        tile: RoomTile,
    },
    DecorationRemoved {
        room_id: String,
        placement_id: String,
    },
    LevelChanged {
        level: u32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct CommandError {
    pub message: String,
}

impl CommandError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct CommandOutcome {
    pub accepted: bool,
    pub events: Vec<FarmEvent>,
    pub error: Option<CommandError>,
}

pub fn apply_elapsed(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
) -> Vec<FarmEvent> {
    if now_ms <= farm.last_update_ms {
        return Vec::new();
    }
    let previous_level = farm.level;
    let mut events = Vec::new();
    events.extend(complete_resident_tasks(farm, catalog, now_ms));
    ensure_idle_cleanup_tasks(farm, catalog, now_ms);
    advance_animal_production(farm, now_ms);
    update_level(farm, catalog);
    grant_unclaimed_crop_starter_stock(farm, catalog);
    ensure_delivery_orders(farm, catalog);
    if farm.level != previous_level {
        events.push(FarmEvent::LevelChanged { level: farm.level });
    }
    farm.last_update_ms = now_ms;
    events
}

fn advance_animal_production(farm: &mut FarmState, now_ms: i64) {
    for shelter in &mut farm.shelters {
        for animal in &mut shelter.animals {
            if matches!(animal.state, AnimalState::Producing { ready_at_ms, .. } if ready_at_ms <= now_ms)
            {
                animal.state = AnimalState::Ready;
            }
        }
    }
}

pub fn apply_command(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    command: FarmCommand,
    now_ms: i64,
) -> CommandOutcome {
    let elapsed_events = apply_elapsed(farm, catalog, now_ms);
    let previous_level = farm.level;
    let result = match command {
        FarmCommand::PlantCrop { plot_id, crop_id } => {
            plant_crop(farm, catalog, now_ms, &plot_id, &crop_id)
        }
        FarmCommand::SweepPlant { crop_id, plot_ids } => {
            sweep_plant(farm, catalog, now_ms, &crop_id, &plot_ids)
        }
        FarmCommand::HarvestCrop { plot_id } => harvest_crop(farm, catalog, now_ms, &plot_id),
        FarmCommand::SweepHarvest {
            plot_ids,
            harvest_mode,
        } => sweep_harvest(
            farm,
            catalog,
            now_ms,
            &plot_ids,
            harvest_mode.unwrap_or_default(),
        ),
        FarmCommand::BuyStructure {
            structure_kind,
            tile,
        } => buy_structure(farm, catalog, structure_kind, tile),
        FarmCommand::BuyFarmhouseUpgrade { upgrade_kind } => {
            buy_farmhouse_upgrade(farm, catalog, upgrade_kind)
        }
        FarmCommand::UpgradeStorage { storage_kind } => {
            upgrade_storage(farm, catalog, storage_kind)
        }
        FarmCommand::BuyFieldPlot { tile } => buy_field_plot(farm, tile),
        FarmCommand::MoveStructure { target, tile } => move_structure(farm, target, tile),
        FarmCommand::QueueRecipe {
            machine_id,
            recipe_id,
        } => queue_recipe(farm, catalog, now_ms, &machine_id, &recipe_id),
        FarmCommand::QueueOvenRecipe { recipe_id } => {
            queue_oven_recipe(farm, catalog, now_ms, &recipe_id)
        }
        FarmCommand::CollectMachineJob { machine_id } => {
            collect_machine_job(farm, catalog, now_ms, &machine_id)
        }
        FarmCommand::CollectOvenJob => collect_oven_job(farm, catalog, now_ms),
        FarmCommand::FeedAnimal {
            shelter_id,
            animal_slot,
        } => feed_animal(farm, catalog, now_ms, &shelter_id, &animal_slot),
        FarmCommand::CollectAnimalProduct {
            shelter_id,
            animal_slot,
        } => collect_animal_product(farm, catalog, now_ms, &shelter_id, &animal_slot),
        FarmCommand::FulfillDeliveryOrder { order_id } => {
            fulfill_delivery_order(farm, catalog, &order_id)
        }
        FarmCommand::DiscardDeliveryOrder { order_id } => {
            discard_delivery_order(farm, catalog, &order_id)
        }
        FarmCommand::DiscardInventory { item_id, quantity } => {
            discard_inventory(farm, &item_id, quantity)
        }
        FarmCommand::SelectResident { resident_id } => select_resident(farm, &resident_id),
        FarmCommand::RenameResident {
            resident_id,
            display_name,
        } => rename_resident(farm, &resident_id, &display_name),
        FarmCommand::BuyMarketItem { item_id, quantity } => {
            buy_market_item(farm, catalog, &item_id, quantity)
        }
        FarmCommand::SellMarketItem { item_id, quantity } => {
            sell_market_item(farm, catalog, &item_id, quantity)
        }
        FarmCommand::PlaceDecoration {
            room_id,
            decoration_id,
            tile,
        } => place_decoration(farm, catalog, &room_id, &decoration_id, tile),
        FarmCommand::MoveDecoration {
            room_id,
            placement_id,
            tile,
        } => move_decoration(farm, catalog, &room_id, &placement_id, tile),
        FarmCommand::RemoveDecoration {
            room_id,
            placement_id,
        } => remove_decoration(farm, &room_id, &placement_id),
    };

    match result {
        Ok(mut events) => {
            grant_unclaimed_crop_starter_stock(farm, catalog);
            if farm.level != previous_level {
                events.push(FarmEvent::LevelChanged { level: farm.level });
            }
            ensure_delivery_orders(farm, catalog);
            let mut all_events = elapsed_events;
            all_events.extend(events);
            CommandOutcome {
                accepted: true,
                events: all_events,
                error: None,
            }
        }
        Err(error) => CommandOutcome {
            accepted: false,
            events: Vec::new(),
            error: Some(error),
        },
    }
}

fn plant_crop(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
    plot_id: &str,
    crop_id: &str,
) -> Result<Vec<FarmEvent>, CommandError> {
    let crop = catalog
        .crop(crop_id)
        .ok_or_else(|| CommandError::new("unknown crop"))?;
    let plot_index = farm
        .field_plots
        .iter()
        .position(|plot| plot.id == plot_id)
        .ok_or_else(|| CommandError::new("field plot not found"))?;
    if farm.field_plots[plot_index].crop.is_some() {
        return Err(CommandError::new("field plot is already planted"));
    }
    if field_plot_is_reserved(farm, plot_id) {
        return Err(CommandError::new("field plot is reserved"));
    }
    require_level(farm, crop.unlock_level)?;
    let planned = plan_resident_work(
        farm,
        catalog,
        now_ms,
        ResidentTaskKind::FieldWork,
        vec![resident_task_step(
            ReservedWorkTarget::FieldPlot {
                plot_id: plot_id.to_owned(),
            },
            ResidentTaskStepWork::PlantCrop {
                crop_id: crop_id.to_owned(),
            },
        )],
    )?;
    push_planned_resident_work(farm, planned);
    Ok(Vec::new())
}

fn sweep_plant(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
    crop_id: &str,
    plot_ids: &[String],
) -> Result<Vec<FarmEvent>, CommandError> {
    let crop = catalog
        .crop(crop_id)
        .ok_or_else(|| CommandError::new("unknown crop"))?;
    require_level(farm, crop.unlock_level)?;

    let plot_indexes = dedupe_plot_ids(plot_ids)
        .into_iter()
        .map(|plot_id| find_field_plot_index(farm, plot_id))
        .collect::<Result<Vec<_>, _>>()?;
    let mut steps = Vec::new();
    let mut stopped_for_inventory = false;
    let mut available_seeds = crate::inventory_quantity(farm, crop_id);
    for plot_index in plot_indexes {
        let plot_id = farm.field_plots[plot_index].id.clone();
        if farm.field_plots[plot_index].crop.is_some() || field_plot_is_reserved(farm, &plot_id) {
            continue;
        }
        if available_seeds == 0 {
            stopped_for_inventory = true;
            break;
        }
        available_seeds -= 1;
        steps.push(resident_task_step(
            ReservedWorkTarget::FieldPlot { plot_id },
            ResidentTaskStepWork::PlantCrop {
                crop_id: crop_id.to_owned(),
            },
        ));
    }

    if steps.is_empty() {
        return Err(CommandError::new(if stopped_for_inventory {
            format!("not enough {}", crop_id)
        } else {
            "no empty field plots selected".to_owned()
        }));
    }

    let planned = plan_resident_work(farm, catalog, now_ms, ResidentTaskKind::FieldWork, steps)?;
    push_planned_resident_work(farm, planned);
    Ok(Vec::new())
}

fn harvest_crop(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
    plot_id: &str,
) -> Result<Vec<FarmEvent>, CommandError> {
    let plot_index = farm
        .field_plots
        .iter()
        .position(|plot| plot.id == plot_id)
        .ok_or_else(|| CommandError::new("field plot not found"))?;
    let planted = farm.field_plots[plot_index]
        .crop
        .clone()
        .ok_or_else(|| CommandError::new("field plot is empty"))?;
    if field_plot_is_reserved(farm, plot_id) {
        return Err(CommandError::new("field plot is reserved"));
    }
    if planted.ready_at_ms > now_ms {
        return Err(CommandError::new("crop is not ready"));
    }
    let crop = catalog
        .crop(&planted.item_id)
        .ok_or_else(|| CommandError::new("unknown crop"))?;
    let outputs = [ItemStack::new(&planted.item_id, crop.harvest_quantity)];
    if !has_storage_room_after_reservations(farm, catalog, &outputs) {
        return Err(CommandError::new("storage is full"));
    }
    let planned = plan_resident_work(
        farm,
        catalog,
        now_ms,
        ResidentTaskKind::FieldWork,
        vec![resident_task_step(
            ReservedWorkTarget::FieldPlot {
                plot_id: plot_id.to_owned(),
            },
            ResidentTaskStepWork::HarvestCrop {
                crop_id: planted.item_id,
                quantity: crop.harvest_quantity,
            },
        )],
    )?;
    push_planned_resident_work(farm, planned);
    Ok(Vec::new())
}

fn sweep_harvest(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
    plot_ids: &[String],
    harvest_mode: SweepHarvestMode,
) -> Result<Vec<FarmEvent>, CommandError> {
    let plot_ids = dedupe_plot_ids(plot_ids);
    let first_plot_id = plot_ids
        .first()
        .ok_or_else(|| CommandError::new("no field plots selected"))?;
    let first_plot_index = find_field_plot_index(farm, first_plot_id)?;
    let first_planted = farm.field_plots[first_plot_index]
        .crop
        .clone()
        .ok_or_else(|| CommandError::new("field plot is empty"))?;
    if first_planted.ready_at_ms > now_ms {
        return Err(CommandError::new("crop is not ready"));
    }

    catalog
        .crop(&first_planted.item_id)
        .ok_or_else(|| CommandError::new("unknown crop"))?;
    let crop_id = first_planted.item_id;
    let mut steps = Vec::new();
    let mut reserved_outputs = Vec::new();
    let mut stopped_for_storage = false;

    for plot_id in plot_ids {
        let plot_index = find_field_plot_index(farm, plot_id)?;
        if field_plot_is_reserved(farm, plot_id) {
            continue;
        }
        let Some(planted) = farm.field_plots[plot_index].crop.clone() else {
            continue;
        };
        if planted.ready_at_ms > now_ms
            || (harvest_mode == SweepHarvestMode::MatchingCrop && planted.item_id != crop_id)
        {
            continue;
        }
        let crop = catalog
            .crop(&planted.item_id)
            .ok_or_else(|| CommandError::new("unknown crop"))?;
        let output = ItemStack::new(&planted.item_id, crop.harvest_quantity);
        let mut outputs_to_reserve = reserved_outputs.clone();
        outputs_to_reserve.push(output.clone());
        if !has_storage_room_after_reservations(farm, catalog, &outputs_to_reserve) {
            stopped_for_storage = true;
            break;
        }

        reserved_outputs.push(output);
        steps.push(resident_task_step(
            ReservedWorkTarget::FieldPlot {
                plot_id: plot_id.to_owned(),
            },
            ResidentTaskStepWork::HarvestCrop {
                crop_id: planted.item_id,
                quantity: crop.harvest_quantity,
            },
        ));
    }

    if steps.is_empty() {
        return Err(CommandError::new(if stopped_for_storage {
            "storage is full"
        } else if harvest_mode == SweepHarvestMode::AllCrops {
            "no ready crops"
        } else {
            "no ready matching crops"
        }));
    }

    let planned = plan_resident_work(farm, catalog, now_ms, ResidentTaskKind::FieldWork, steps)?;
    push_planned_resident_work(farm, planned);
    Ok(Vec::new())
}

fn find_field_plot_index(farm: &FarmState, plot_id: &str) -> Result<usize, CommandError> {
    farm.field_plots
        .iter()
        .position(|plot| plot.id == plot_id)
        .ok_or_else(|| CommandError::new("field plot not found"))
}

fn dedupe_plot_ids(plot_ids: &[String]) -> Vec<&str> {
    let mut ordered = Vec::new();
    for plot_id in plot_ids {
        if !ordered.contains(&plot_id.as_str()) {
            ordered.push(plot_id.as_str());
        }
    }
    ordered
}

fn resident_task_step(
    reserved_work_target: ReservedWorkTarget,
    work: ResidentTaskStepWork,
) -> ResidentTaskStep {
    let work_duration_ms = default_resident_task_step_duration_ms();
    ResidentTaskStep {
        reserved_work_target,
        work,
        approach_tile: None,
        walk_path: Vec::new(),
        walk_duration_ms: 0,
        work_duration_ms,
        duration_ms: work_duration_ms,
    }
}

struct PlannedResidentWork {
    resident_id: String,
    started_at_ms: i64,
    ready_at_ms: i64,
    kind: ResidentTaskKind,
    steps: Vec<ResidentTaskStep>,
}

fn plan_resident_work(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
    kind: ResidentTaskKind,
    steps: Vec<ResidentTaskStep>,
) -> Result<PlannedResidentWork, CommandError> {
    find_resident_index(farm, &farm.selected_resident_id)?;
    let selected_resident_id = farm.selected_resident_id.clone();
    strip_trailing_cleanup_steps(farm, &selected_resident_id);
    let started_at_ms = farm
        .resident_task_queues
        .get(&selected_resident_id)
        .and_then(|queue| queue.last())
        .map(resident_task_tail_ready_at)
        .unwrap_or(now_ms)
        .max(now_ms);
    let steps = plan_resource_steps(farm, catalog, &selected_resident_id, steps)?;
    let steps = plan_resident_task_steps(farm, &selected_resident_id, steps)?;
    let ready_at_ms = started_at_ms
        + steps
            .first()
            .map(resident_task_step_duration_ms)
            .unwrap_or(0);

    Ok(PlannedResidentWork {
        resident_id: selected_resident_id,
        started_at_ms,
        ready_at_ms,
        kind,
        steps,
    })
}

#[derive(Clone)]
struct ProjectedInventory {
    items: BTreeMap<String, u32>,
    tools: BTreeMap<ToolKind, u32>,
    tool_sources: BTreeMap<ToolKind, ToolSourceRef>,
    item_capacity: u32,
}

fn plan_resource_steps(
    farm: &FarmState,
    catalog: &CatalogDocument,
    resident_id: &str,
    work_steps: Vec<ResidentTaskStep>,
) -> Result<Vec<ResidentTaskStep>, CommandError> {
    let mut projected = projected_resident_inventory(farm, catalog, resident_id);
    let mut planned = Vec::new();

    for index in 0..work_steps.len() {
        let work_step = work_steps[index].clone();
        let inputs = step_inventory_inputs(farm, catalog, &work_step)?;
        let pickup_inputs =
            pickup_inputs_for_remaining_work(farm, catalog, &projected, &work_steps[index..])?;
        if carried_item_quantity(&projected.items) + stack_quantity(&pickup_inputs)
            > projected.item_capacity
            && !projected.items.is_empty()
        {
            planned.extend(deposit_all_carried_items(catalog, &mut projected));
        }
        let pickups = missing_projected_items(farm, &projected, &pickup_inputs)?;
        if !pickups.is_empty() {
            for pickup in pickups {
                add_projected_items(&mut projected.items, std::slice::from_ref(&pickup));
                planned.push(resident_task_step(
                    reserved_target_for_storage_source(&storage_source_for_item(
                        catalog,
                        &pickup.item_id,
                    )),
                    ResidentTaskStepWork::PickupItems {
                        source: storage_source_for_item(catalog, &pickup.item_id),
                        items: vec![pickup],
                    },
                ));
            }
        }

        if let Some(tool_kind) = tool_for_work(&work_step.work) {
            if projected.tools.get(&tool_kind).copied().unwrap_or(0) == 0 {
                let source = available_tool_source(farm, tool_kind)
                    .ok_or_else(|| CommandError::new("required tool unavailable"))?;
                add_projected_tools(&mut projected.tools, &[ToolStack::new(tool_kind, 1)]);
                planned.push(resident_task_step(
                    ReservedWorkTarget::ToolSource,
                    ResidentTaskStepWork::PickupTools {
                        source,
                        tools: vec![ToolStack::new(tool_kind, 1)],
                    },
                ));
            }
        }

        let outputs = step_inventory_outputs(catalog, &work_step.work);
        if carried_item_quantity(&projected.items) + stack_quantity(&outputs)
            > projected.item_capacity
            && !projected.items.is_empty()
        {
            planned.extend(deposit_all_carried_items(catalog, &mut projected));
        }
        remove_projected_items(&mut projected.items, &inputs)?;
        add_projected_items(&mut projected.items, &outputs);
        planned.push(work_step);
    }

    planned.extend(deposit_all_carried_items(catalog, &mut projected));
    planned.extend(return_all_carried_tools(farm, &mut projected));

    Ok(planned)
}

fn pickup_inputs_for_remaining_work(
    farm: &FarmState,
    catalog: &CatalogDocument,
    projected: &ProjectedInventory,
    remaining_work: &[ResidentTaskStep],
) -> Result<Vec<ItemStack>, CommandError> {
    let mut required = BTreeMap::new();
    for step in remaining_work {
        for input in step_inventory_inputs(farm, catalog, step)? {
            *required.entry(input.item_id).or_insert(0) += input.quantity;
        }
    }
    Ok(required
        .into_iter()
        .map(|(item_id, quantity)| {
            let carried = projected.items.get(&item_id).copied().unwrap_or(0);
            ItemStack::new(item_id, quantity.saturating_sub(carried))
        })
        .filter(|stack| stack.quantity > 0)
        .collect())
}

fn strip_trailing_cleanup_steps(farm: &mut FarmState, resident_id: &str) {
    let Some(queue) = farm.resident_task_queues.get_mut(resident_id) else {
        return;
    };
    let Some(task) = queue.last_mut() else {
        return;
    };

    while task.steps.last().is_some_and(|step| {
        matches!(
            step.work,
            ResidentTaskStepWork::DepositInventory { .. }
                | ResidentTaskStepWork::DepositItems { .. }
                | ResidentTaskStepWork::ReturnTools { .. }
        )
    }) {
        task.steps.pop();
    }

    if task.steps.is_empty() {
        queue.pop();
    }
}

fn ensure_idle_cleanup_tasks(farm: &mut FarmState, catalog: &CatalogDocument, now_ms: i64) {
    let resident_ids = farm
        .residents
        .iter()
        .map(|resident| resident.id.clone())
        .collect::<Vec<_>>();
    for resident_id in resident_ids {
        if farm
            .resident_task_queues
            .get(&resident_id)
            .is_some_and(|queue| !queue.is_empty())
        {
            continue;
        }
        let Some(inventory) = farm.resident_inventories.get(&resident_id).cloned() else {
            continue;
        };
        if inventory.items.is_empty() && inventory.tools.is_empty() {
            continue;
        }
        if !carried_items_fit_storage(farm, catalog, &inventory.items) {
            continue;
        }
        let mut projected = ProjectedInventory {
            items: inventory.items,
            tools: inventory.tools,
            tool_sources: inventory.tool_sources,
            item_capacity: inventory.item_capacity,
        };
        let mut steps = deposit_all_carried_items(catalog, &mut projected);
        steps.extend(return_all_carried_tools(farm, &mut projected));
        if steps.is_empty() {
            continue;
        }
        let Ok(steps) = plan_resident_task_steps(farm, &resident_id, steps) else {
            continue;
        };
        let ready_at_ms = now_ms
            + steps
                .first()
                .map(resident_task_step_duration_ms)
                .unwrap_or(0);
        let task_id = next_id(farm, "task");
        farm.resident_task_queues
            .entry(resident_id)
            .or_default()
            .push(ResidentTask {
                id: task_id,
                kind: ResidentTaskKind::FieldWork,
                steps,
                started_at_ms: now_ms,
                ready_at_ms,
            });
    }
}

fn carried_items_fit_storage(
    farm: &FarmState,
    catalog: &CatalogDocument,
    items: &BTreeMap<String, u32>,
) -> bool {
    let stacks = items
        .iter()
        .map(|(item_id, quantity)| ItemStack::new(item_id, *quantity))
        .collect::<Vec<_>>();
    has_storage_room_after_reservations(farm, catalog, &stacks)
}

fn projected_resident_inventory(
    farm: &FarmState,
    catalog: &CatalogDocument,
    resident_id: &str,
) -> ProjectedInventory {
    let base = farm
        .resident_inventories
        .get(resident_id)
        .cloned()
        .unwrap_or_else(crate::default_resident_inventory);
    let mut projected = ProjectedInventory {
        items: base.items,
        tools: base.tools,
        tool_sources: base.tool_sources,
        item_capacity: base.item_capacity,
    };

    if let Some(queue) = farm.resident_task_queues.get(resident_id) {
        for task in queue {
            for step in &task.steps {
                let _ = apply_projected_work(catalog, &mut projected, &step.work);
            }
        }
    }

    projected
}

fn apply_projected_work(
    catalog: &CatalogDocument,
    projected: &mut ProjectedInventory,
    work: &ResidentTaskStepWork,
) -> Result<(), CommandError> {
    match work {
        ResidentTaskStepWork::PickupItems { items, .. } => {
            add_projected_items(&mut projected.items, items);
        }
        ResidentTaskStepWork::PickupTools { tools, .. } => {
            add_projected_tools(&mut projected.tools, tools);
            if let ResidentTaskStepWork::PickupTools { source, tools } = work {
                for tool in tools {
                    projected
                        .tool_sources
                        .insert(tool.tool_kind, source.clone());
                }
            }
        }
        ResidentTaskStepWork::DepositInventory { item_id, quantity } => {
            remove_projected_items(&mut projected.items, &[ItemStack::new(item_id, *quantity)])?;
        }
        ResidentTaskStepWork::DepositItems { items, .. } => {
            remove_projected_items(&mut projected.items, items)?;
        }
        ResidentTaskStepWork::ReturnTools { tools, .. } => {
            if tools.is_empty() {
                projected.tools.clear();
                projected.tool_sources.clear();
            } else {
                remove_projected_tools(&mut projected.tools, tools)?;
                for tool in tools {
                    if projected.tools.get(&tool.tool_kind).copied().unwrap_or(0) == 0 {
                        projected.tool_sources.remove(&tool.tool_kind);
                    }
                }
            }
        }
        other => {
            let inputs = projected_step_inputs(catalog, other);
            remove_projected_items(&mut projected.items, &inputs)?;
            let outputs = step_inventory_outputs(catalog, other);
            add_projected_items(&mut projected.items, &outputs);
        }
    }
    Ok(())
}

fn step_inventory_inputs(
    farm: &FarmState,
    catalog: &CatalogDocument,
    step: &ResidentTaskStep,
) -> Result<Vec<ItemStack>, CommandError> {
    let inputs = match &step.work {
        ResidentTaskStepWork::FeedAnimal => {
            let ReservedWorkTarget::Animal { shelter_id, .. } = &step.reserved_work_target else {
                return Ok(Vec::new());
            };
            let Some(shelter) = farm
                .shelters
                .iter()
                .find(|shelter| shelter.id == *shelter_id)
            else {
                return Ok(Vec::new());
            };
            let Some(def) = catalog.shelter(&shelter.kind) else {
                return Ok(Vec::new());
            };
            vec![ItemStack::new(&def.feed_item_id, 1)]
        }
        _ => projected_step_inputs(catalog, &step.work),
    };
    Ok(inputs)
}

fn projected_step_inputs(catalog: &CatalogDocument, work: &ResidentTaskStepWork) -> Vec<ItemStack> {
    match work {
        ResidentTaskStepWork::PlantCrop { crop_id } => vec![ItemStack::new(crop_id, 1)],
        ResidentTaskStepWork::StartOvenRecipe { recipe_id, .. } => catalog
            .recipe(recipe_id)
            .map(|recipe| recipe.inputs.clone())
            .unwrap_or_default(),
        ResidentTaskStepWork::FeedAnimal => Vec::new(),
        _ => Vec::new(),
    }
}

fn missing_projected_items(
    farm: &FarmState,
    projected: &ProjectedInventory,
    inputs: &[ItemStack],
) -> Result<Vec<ItemStack>, CommandError> {
    let mut pickups = Vec::new();
    for input in inputs {
        let carried = projected.items.get(&input.item_id).copied().unwrap_or(0);
        if carried >= input.quantity {
            continue;
        }
        let needed = input.quantity - carried;
        if available_stored_quantity(farm, &input.item_id) < needed {
            return Err(CommandError::new(format!(
                "not enough available {}",
                input.item_id
            )));
        }
        pickups.push(ItemStack::new(&input.item_id, needed));
    }
    Ok(pickups)
}

fn available_stored_quantity(farm: &FarmState, item_id: &str) -> u32 {
    inventory_quantity(farm, item_id).saturating_sub(reserved_item_pickups(farm, item_id))
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

fn add_projected_items(items: &mut BTreeMap<String, u32>, stacks: &[ItemStack]) {
    for stack in stacks {
        *items.entry(stack.item_id.clone()).or_insert(0) += stack.quantity;
    }
}

fn remove_projected_items(
    items: &mut BTreeMap<String, u32>,
    stacks: &[ItemStack],
) -> Result<(), CommandError> {
    for stack in stacks {
        if items.get(&stack.item_id).copied().unwrap_or(0) < stack.quantity {
            return Err(CommandError::new(format!(
                "not enough carried {}",
                stack.item_id
            )));
        }
    }
    for stack in stacks {
        let entry = items.entry(stack.item_id.clone()).or_insert(0);
        *entry -= stack.quantity;
        if *entry == 0 {
            items.remove(&stack.item_id);
        }
    }
    Ok(())
}

fn add_projected_tools(tools: &mut BTreeMap<ToolKind, u32>, stacks: &[ToolStack]) {
    for stack in stacks {
        *tools.entry(stack.tool_kind).or_insert(0) += stack.quantity;
    }
}

fn remove_projected_tools(
    tools: &mut BTreeMap<ToolKind, u32>,
    stacks: &[ToolStack],
) -> Result<(), CommandError> {
    for stack in stacks {
        if tools.get(&stack.tool_kind).copied().unwrap_or(0) < stack.quantity {
            return Err(CommandError::new("required tool unavailable"));
        }
    }
    for stack in stacks {
        let entry = tools.entry(stack.tool_kind).or_insert(0);
        *entry -= stack.quantity;
        if *entry == 0 {
            tools.remove(&stack.tool_kind);
        }
    }
    Ok(())
}

fn carried_item_quantity(items: &BTreeMap<String, u32>) -> u32 {
    items.values().sum()
}

fn stack_quantity(stacks: &[ItemStack]) -> u32 {
    stacks.iter().map(|stack| stack.quantity).sum()
}

fn deposit_all_carried_items(
    catalog: &CatalogDocument,
    projected: &mut ProjectedInventory,
) -> Vec<ResidentTaskStep> {
    let items = projected
        .items
        .iter()
        .map(|(item_id, quantity)| ItemStack::new(item_id, *quantity))
        .collect::<Vec<_>>();
    projected.items.clear();
    items
        .into_iter()
        .map(|item| {
            let destination = storage_source_for_item(catalog, &item.item_id);
            resident_task_step(
                reserved_target_for_storage_source(&destination),
                ResidentTaskStepWork::DepositItems {
                    destination,
                    items: vec![item],
                },
            )
        })
        .collect()
}

fn return_all_carried_tools(
    farm: &FarmState,
    projected: &mut ProjectedInventory,
) -> Vec<ResidentTaskStep> {
    let tools = projected
        .tools
        .iter()
        .map(|(tool_kind, quantity)| {
            let source = projected
                .tool_sources
                .get(tool_kind)
                .cloned()
                .unwrap_or_else(|| fallback_tool_return_source(farm, *tool_kind));
            (source, ToolStack::new(*tool_kind, *quantity))
        })
        .collect::<Vec<_>>();
    projected.tools.clear();
    projected.tool_sources.clear();
    group_tool_return_steps(tools)
}

fn group_tool_return_steps(tools: Vec<(ToolSourceRef, ToolStack)>) -> Vec<ResidentTaskStep> {
    let mut grouped: Vec<(ToolSourceRef, Vec<ToolStack>)> = Vec::new();
    for (source, tool) in tools {
        if let Some((_, tools)) = grouped
            .iter_mut()
            .find(|(existing_source, _)| *existing_source == source)
        {
            tools.push(tool);
        } else {
            grouped.push((source, vec![tool]));
        }
    }
    grouped
        .into_iter()
        .map(|(source, tools)| {
            resident_task_step(
                ReservedWorkTarget::ToolSource,
                ResidentTaskStepWork::ReturnTools { source, tools },
            )
        })
        .collect()
}

fn fallback_tool_return_source(farm: &FarmState, tool_kind: ToolKind) -> ToolSourceRef {
    if is_field_tool(tool_kind) {
        if let Some(tool_shed) = &farm.tool_shed {
            return ToolSourceRef::ToolShed {
                id: tool_shed.id.clone(),
            };
        }
    }
    ToolSourceRef::Farmhouse
}

fn tool_for_work(work: &ResidentTaskStepWork) -> Option<ToolKind> {
    match work {
        ResidentTaskStepWork::PlantCrop { .. } => Some(ToolKind::Hoe),
        ResidentTaskStepWork::HarvestCrop { .. } => Some(ToolKind::Sickle),
        ResidentTaskStepWork::StartOvenRecipe { .. } => Some(ToolKind::MixingBowl),
        ResidentTaskStepWork::CollectOvenJob { .. } => Some(ToolKind::OvenMitt),
        ResidentTaskStepWork::FeedAnimal => Some(ToolKind::FeedBucket),
        ResidentTaskStepWork::CollectAnimalProduct { .. } => Some(ToolKind::CollectionPail),
        ResidentTaskStepWork::CollectMachineJob { .. } => Some(ToolKind::Wrench),
        _ => None,
    }
}

fn available_tool_source(farm: &FarmState, tool_kind: ToolKind) -> Option<ToolSourceRef> {
    if let Some(source) = available_tool_shed_source(farm, tool_kind) {
        return Some(source);
    }
    if tool_source_available(farm, &ToolSourceRef::Farmhouse, tool_kind) {
        return Some(ToolSourceRef::Farmhouse);
    }
    None
}

fn is_field_tool(tool_kind: ToolKind) -> bool {
    matches!(tool_kind, ToolKind::Hoe | ToolKind::Sickle)
}

fn available_tool_shed_source(farm: &FarmState, tool_kind: ToolKind) -> Option<ToolSourceRef> {
    let tool_shed = farm.tool_shed.as_ref()?;
    let source = ToolSourceRef::ToolShed {
        id: tool_shed.id.clone(),
    };
    tool_source_available(farm, &source, tool_kind).then_some(source)
}

fn tool_source_available(farm: &FarmState, source: &ToolSourceRef, tool_kind: ToolKind) -> bool {
    tool_source_quantity(farm, source, tool_kind)
        .saturating_sub(reserved_tool_pickups(farm, source, tool_kind))
        > 0
}

fn tool_source_quantity(farm: &FarmState, source: &ToolSourceRef, tool_kind: ToolKind) -> u32 {
    match source {
        ToolSourceRef::Farmhouse => farm
            .farmhouse_tool_stock
            .get(&tool_kind)
            .copied()
            .unwrap_or(0),
        ToolSourceRef::ToolShed { id } => farm
            .tool_shed
            .as_ref()
            .filter(|tool_shed| tool_shed.id == *id)
            .and_then(|tool_shed| tool_shed.tool_stock.get(&tool_kind).copied())
            .unwrap_or(0),
    }
}

fn reserved_tool_pickups(farm: &FarmState, source: &ToolSourceRef, tool_kind: ToolKind) -> u32 {
    farm.resident_task_queues
        .values()
        .flat_map(|queue| queue.iter())
        .flat_map(|task| task.steps.iter())
        .flat_map(|step| match &step.work {
            ResidentTaskStepWork::PickupTools {
                source: pickup_source,
                tools,
            } if pickup_source == source => tools.as_slice(),
            _ => &[][..],
        })
        .filter(|stack| stack.tool_kind == tool_kind)
        .map(|stack| stack.quantity)
        .sum()
}

fn storage_source_for_item(catalog: &CatalogDocument, item_id: &str) -> StorageSourceRef {
    if catalog
        .item_kind(item_id)
        .is_some_and(|kind| *kind == ItemKind::Crop)
    {
        StorageSourceRef::Silo
    } else {
        StorageSourceRef::Barn
    }
}

fn reserved_target_for_storage_source(source: &StorageSourceRef) -> ReservedWorkTarget {
    match source {
        StorageSourceRef::Silo => ReservedWorkTarget::Silo,
        StorageSourceRef::Barn => ReservedWorkTarget::Barn,
    }
}

fn push_planned_resident_work(farm: &mut FarmState, planned: PlannedResidentWork) {
    let task = ResidentTask {
        id: next_id(farm, "task"),
        kind: planned.kind,
        steps: planned.steps,
        started_at_ms: planned.started_at_ms,
        ready_at_ms: planned.ready_at_ms,
    };
    farm.resident_task_queues
        .entry(planned.resident_id)
        .or_default()
        .push(task);
}

fn resident_task_tail_ready_at(task: &ResidentTask) -> i64 {
    task.ready_at_ms
        + task
            .steps
            .iter()
            .skip(1)
            .map(resident_task_step_duration_ms)
            .sum::<i64>()
}

fn projected_resident_start_tile(farm: &FarmState, resident_id: &str) -> Tile {
    farm.resident_task_queues
        .get(resident_id)
        .and_then(|queue| queue.last())
        .and_then(|task| task.steps.last())
        .and_then(|step| step.approach_tile.clone())
        .or_else(|| farm.resident_locations.get(resident_id).cloned())
        .unwrap_or_else(|| Tile::new(8, 10))
}

fn plan_resident_task_steps(
    farm: &FarmState,
    resident_id: &str,
    mut steps: Vec<ResidentTaskStep>,
) -> Result<Vec<ResidentTaskStep>, CommandError> {
    let mut previous_tile = projected_resident_start_tile(farm, resident_id);
    for step in steps.iter_mut() {
        let route = best_work_target_route(farm, &previous_tile, step)
            .ok_or_else(|| CommandError::new("work target is unreachable"))?;

        apply_route_to_step(step, route);
        previous_tile = step.approach_tile.clone().unwrap_or(previous_tile);
    }
    Ok(steps)
}

fn apply_route_to_step(step: &mut ResidentTaskStep, route: PlannedRoute) {
    let work_duration_ms = resident_task_step_work_duration_ms(&step.work);
    let walk_duration_ms = route.walk_duration_ms();
    step.approach_tile = Some(route.approach_tile);
    step.walk_path = route.path;
    step.walk_duration_ms = walk_duration_ms;
    step.work_duration_ms = work_duration_ms;
    step.duration_ms = walk_duration_ms + work_duration_ms;
}

fn resident_task_step_work_duration_ms(work: &ResidentTaskStepWork) -> i64 {
    match work {
        ResidentTaskStepWork::PickupItems { .. }
        | ResidentTaskStepWork::PickupTools { .. }
        | ResidentTaskStepWork::DepositInventory { .. }
        | ResidentTaskStepWork::DepositItems { .. }
        | ResidentTaskStepWork::ReturnTools { .. } => 0,
        ResidentTaskStepWork::PlantCrop { .. }
        | ResidentTaskStepWork::HarvestCrop { .. }
        | ResidentTaskStepWork::CollectMachineJob { .. }
        | ResidentTaskStepWork::StartOvenRecipe { .. }
        | ResidentTaskStepWork::CollectOvenJob { .. }
        | ResidentTaskStepWork::FeedAnimal
        | ResidentTaskStepWork::CollectAnimalProduct { .. } => RESIDENT_FIELD_WORK_BASE_DURATION_MS,
    }
}

#[derive(Debug, Clone)]
struct PlannedRoute {
    approach_tile: Tile,
    path: Vec<Tile>,
}

impl PlannedRoute {
    fn walk_duration_ms(&self) -> i64 {
        self.path.len() as i64 * RESIDENT_FIELD_WORK_WALKED_TILE_DURATION_MS
    }
}

fn best_work_target_route(
    farm: &FarmState,
    start: &Tile,
    step: &ResidentTaskStep,
) -> Option<PlannedRoute> {
    let target_candidates = work_target_candidates(farm, step)?;
    let mut best: Option<(usize, i32, i32, i32, i32, PlannedRoute)> = None;
    for target in target_candidates {
        let Some(path) = find_walk_path(farm, start, &target) else {
            continue;
        };
        let score = (
            path.len(),
            target.y,
            target.x,
            0,
            0,
            PlannedRoute {
                approach_tile: target,
                path,
            },
        );
        if best
            .as_ref()
            .is_none_or(|current| route_score_less(&score, current))
        {
            best = Some(score);
        }
    }
    best.map(|(_, _, _, _, _, route)| route)
}

fn route_score_less(
    left: &(usize, i32, i32, i32, i32, PlannedRoute),
    right: &(usize, i32, i32, i32, i32, PlannedRoute),
) -> bool {
    (left.0, left.1, left.2, left.3, left.4) < (right.0, right.1, right.2, right.3, right.4)
}

fn work_target_candidates(farm: &FarmState, step: &ResidentTaskStep) -> Option<Vec<Tile>> {
    match &step.reserved_work_target {
        ReservedWorkTarget::Silo => Some(approach_tiles_for_footprint(
            farm,
            &farm.silo_tile,
            structure_footprint(&StructureKind::Silo),
        )),
        ReservedWorkTarget::Barn => Some(approach_tiles_for_footprint(
            farm,
            &farm.barn_tile,
            structure_footprint(&StructureKind::Barn),
        )),
        ReservedWorkTarget::ToolSource => match &step.work {
            ResidentTaskStepWork::PickupTools { source, .. }
            | ResidentTaskStepWork::ReturnTools { source, .. } => {
                tool_source_ref_candidates(farm, source)
            }
            _ => Some(tool_source_candidates(farm)),
        },
        ReservedWorkTarget::FieldPlot { plot_id } => {
            let plot = farm.field_plots.iter().find(|plot| plot.id == *plot_id)?;
            Some(vec![plot.tile.clone()])
        }
        ReservedWorkTarget::Machine { machine_id } => {
            let machine = farm
                .machines
                .iter()
                .find(|machine| machine.id == *machine_id)?;
            Some(approach_tiles_for_footprint(
                farm,
                &machine.tile,
                structure_footprint(&machine_structure_kind(&machine.kind)),
            ))
        }
        ReservedWorkTarget::Animal { shelter_id, .. } => {
            let shelter = farm
                .shelters
                .iter()
                .find(|shelter| shelter.id == *shelter_id)?;
            Some(approach_tiles_for_footprint(
                farm,
                &shelter.tile,
                structure_footprint(&shelter_structure_kind(&shelter.kind)),
            ))
        }
        ReservedWorkTarget::Oven => Some(approach_tiles_for_footprint(
            farm,
            &Tile::new(FARM_HOUSE_TILE_X, FARM_HOUSE_TILE_Y),
            FARM_HOUSE_FOOTPRINT,
        )),
    }
}

fn tool_source_ref_candidates(farm: &FarmState, source: &ToolSourceRef) -> Option<Vec<Tile>> {
    match source {
        ToolSourceRef::Farmhouse => Some(approach_tiles_for_footprint(
            farm,
            &Tile::new(FARM_HOUSE_TILE_X, FARM_HOUSE_TILE_Y),
            FARM_HOUSE_FOOTPRINT,
        )),
        ToolSourceRef::ToolShed { id } => farm
            .tool_shed
            .as_ref()
            .filter(|tool_shed| tool_shed.id == *id)
            .map(|tool_shed| {
                approach_tiles_for_footprint(
                    farm,
                    &tool_shed.tile,
                    structure_footprint(&StructureKind::ToolShed),
                )
            }),
    }
}

fn tool_source_candidates(farm: &FarmState) -> Vec<Tile> {
    let mut candidates = approach_tiles_for_footprint(
        farm,
        &Tile::new(FARM_HOUSE_TILE_X, FARM_HOUSE_TILE_Y),
        FARM_HOUSE_FOOTPRINT,
    );
    if let Some(tool_shed) = &farm.tool_shed {
        candidates.extend(approach_tiles_for_footprint(
            farm,
            &tool_shed.tile,
            structure_footprint(&StructureKind::ToolShed),
        ));
    }
    candidates.sort_by_key(|tile| (tile.y, tile.x));
    candidates.dedup_by(|left, right| left.x == right.x && left.y == right.y);
    candidates
}

fn approach_tiles_for_footprint(
    farm: &FarmState,
    origin: &Tile,
    footprint: StructureFootprint,
) -> Vec<Tile> {
    let mut candidates = Vec::new();
    for x in origin.x..origin.x + footprint.width {
        candidates.push(Tile::new(x, origin.y - 1));
        candidates.push(Tile::new(x, origin.y + footprint.height));
    }
    for y in origin.y..origin.y + footprint.height {
        candidates.push(Tile::new(origin.x - 1, y));
        candidates.push(Tile::new(origin.x + footprint.width, y));
    }
    candidates.sort_by_key(|tile| (tile.y, tile.x));
    candidates.dedup_by(|left, right| left.x == right.x && left.y == right.y);
    candidates
        .into_iter()
        .filter(|tile| is_walkable_tile(farm, tile))
        .collect()
}

fn find_walk_path(farm: &FarmState, start: &Tile, target: &Tile) -> Option<Vec<Tile>> {
    if !is_walkable_tile(farm, start) || !is_walkable_tile(farm, target) {
        return None;
    }
    if start == target {
        return Some(Vec::new());
    }

    let start_key = tile_key(start);
    let target_key = tile_key(target);
    let mut queue = VecDeque::from([start_key]);
    let mut visited = BTreeSet::from([start_key]);
    let mut previous: BTreeMap<(i32, i32), (i32, i32)> = BTreeMap::new();

    while let Some(current) = queue.pop_front() {
        for neighbor in walk_neighbors(current) {
            let neighbor_tile = Tile::new(neighbor.0, neighbor.1);
            if !is_walkable_tile(farm, &neighbor_tile) || visited.contains(&neighbor) {
                continue;
            }
            visited.insert(neighbor);
            previous.insert(neighbor, current);
            if neighbor == target_key {
                return Some(reconstruct_path(start_key, target_key, &previous));
            }
            queue.push_back(neighbor);
        }
    }

    None
}

fn reconstruct_path(
    start: (i32, i32),
    target: (i32, i32),
    previous: &BTreeMap<(i32, i32), (i32, i32)>,
) -> Vec<Tile> {
    let mut cursor = target;
    let mut path = vec![Tile::new(cursor.0, cursor.1)];
    while cursor != start {
        let Some(next) = previous.get(&cursor) else {
            break;
        };
        cursor = *next;
        if cursor != start {
            path.push(Tile::new(cursor.0, cursor.1));
        }
    }
    path.reverse();
    path
}

fn walk_neighbors(tile: (i32, i32)) -> [(i32, i32); 4] {
    [
        (tile.0, tile.1 - 1),
        (tile.0 - 1, tile.1),
        (tile.0 + 1, tile.1),
        (tile.0, tile.1 + 1),
    ]
}

fn tile_key(tile: &Tile) -> (i32, i32) {
    (tile.x, tile.y)
}

fn is_walkable_tile(farm: &FarmState, tile: &Tile) -> bool {
    is_tile_inside_farm(tile)
        && !footprint_contains(
            &Tile::new(FARM_HOUSE_TILE_X, FARM_HOUSE_TILE_Y),
            FARM_HOUSE_FOOTPRINT,
            tile,
        )
        && !structure_footprints(farm)
            .into_iter()
            .any(|(origin, footprint)| footprint_contains(&origin, footprint, tile))
}

fn resident_task_step_duration_ms(step: &ResidentTaskStep) -> i64 {
    step.duration_ms.max(0)
}

fn complete_resident_tasks(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
) -> Vec<FarmEvent> {
    let mut events = Vec::new();
    loop {
        let mut completed_any = false;
        let resident_ids = farm
            .resident_task_queues
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        for resident_id in resident_ids {
            while let Some((step, completed_at_ms)) =
                pop_ready_resident_task_step(farm, &resident_id, now_ms)
            {
                completed_any = true;
                events.extend(complete_resident_task_step(
                    farm,
                    catalog,
                    &resident_id,
                    step,
                    completed_at_ms,
                ));
            }
        }
        if !completed_any {
            break;
        }
    }
    events
}

fn pop_ready_resident_task_step(
    farm: &mut FarmState,
    resident_id: &str,
    now_ms: i64,
) -> Option<(ResidentTaskStep, i64)> {
    let queue = farm.resident_task_queues.get_mut(resident_id)?;
    let task = queue.first_mut()?;
    if task.ready_at_ms > now_ms {
        return None;
    }
    let completed_at = task.ready_at_ms;
    let step = task.steps.remove(0);
    if task.steps.is_empty() {
        queue.remove(0);
    } else {
        task.started_at_ms = completed_at;
        task.ready_at_ms = completed_at
            + task
                .steps
                .first()
                .map(resident_task_step_duration_ms)
                .unwrap_or(0);
    }
    if let Some(approach_tile) = &step.approach_tile {
        farm.resident_locations
            .insert(resident_id.to_owned(), approach_tile.clone());
    }
    Some((step, completed_at))
}

fn complete_resident_task_step(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    resident_id: &str,
    step: ResidentTaskStep,
    completed_at_ms: i64,
) -> Vec<FarmEvent> {
    match step.work {
        ResidentTaskStepWork::PickupItems { items, .. } => {
            if remove_inventory(farm, &items).is_ok() {
                add_resident_items(farm, resident_id, &items);
            }
            Vec::new()
        }
        ResidentTaskStepWork::PickupTools { source, tools } => {
            if remove_tool_source_tools(farm, &source, &tools).is_ok() {
                add_resident_tools(farm, resident_id, &source, &tools);
            }
            Vec::new()
        }
        ResidentTaskStepWork::PlantCrop { crop_id } => {
            let ReservedWorkTarget::FieldPlot { plot_id } = step.reserved_work_target else {
                return Vec::new();
            };
            let Ok(plot_index) = find_field_plot_index(farm, &plot_id) else {
                return Vec::new();
            };
            if farm.field_plots[plot_index].crop.is_some() {
                return Vec::new();
            }
            let Some(crop) = catalog.crop(&crop_id) else {
                return Vec::new();
            };
            if remove_resident_items(farm, resident_id, &[ItemStack::new(&crop_id, 1)]).is_err()
                && remove_inventory(farm, &[ItemStack::new(&crop_id, 1)]).is_err()
            {
                return Vec::new();
            }
            farm.field_plots[plot_index].crop = Some(crate::PlantedCrop {
                item_id: crop_id.clone(),
                planted_at_ms: completed_at_ms,
                ready_at_ms: completed_at_ms
                    + scaled_duration_ms(crop.reference_seconds, catalog.balance.time_scale),
            });
            vec![FarmEvent::CropPlanted { crop_id }]
        }
        ResidentTaskStepWork::HarvestCrop { crop_id, quantity } => {
            let ReservedWorkTarget::FieldPlot { plot_id } = step.reserved_work_target else {
                return Vec::new();
            };
            let Ok(plot_index) = find_field_plot_index(farm, &plot_id) else {
                return Vec::new();
            };
            farm.field_plots[plot_index].crop = None;
            add_resident_items(farm, resident_id, &[ItemStack::new(&crop_id, quantity)]);
            if let Some(crop) = catalog.crop(&crop_id) {
                gain_xp(farm, catalog, crop.xp);
            }
            vec![FarmEvent::CropHarvested { crop_id, quantity }]
        }
        ResidentTaskStepWork::CollectMachineJob { job_id, recipe_id } => {
            let ReservedWorkTarget::Machine { machine_id } = step.reserved_work_target else {
                return Vec::new();
            };
            let Some(machine_index) = farm
                .machines
                .iter()
                .position(|machine| machine.id == machine_id)
            else {
                return Vec::new();
            };
            let Some(job_index) = farm.machines[machine_index]
                .queue
                .iter()
                .position(|job| job.id == job_id)
            else {
                return Vec::new();
            };
            farm.machines[machine_index].queue.remove(job_index);
            let Some(recipe) = catalog.recipe(&recipe_id) else {
                return Vec::new();
            };
            add_resident_items(farm, resident_id, &recipe.outputs);
            gain_xp(farm, catalog, recipe.xp);
            vec![FarmEvent::MachineJobCollected {
                recipe_id: recipe.id.clone(),
            }]
        }
        ResidentTaskStepWork::StartOvenRecipe { job_id, recipe_id } => {
            let ReservedWorkTarget::Oven = step.reserved_work_target else {
                return Vec::new();
            };
            let Some(job_index) = farm.oven.queue.iter().position(|job| job.id == job_id) else {
                return Vec::new();
            };
            if farm.oven.queue[job_index].status != OvenJobStatus::PendingStart {
                return Vec::new();
            }
            let Some(recipe) = catalog.recipe(&recipe_id) else {
                return Vec::new();
            };
            if remove_resident_items(farm, resident_id, &recipe.inputs).is_err()
                && remove_inventory(farm, &recipe.inputs).is_err()
            {
                return Vec::new();
            }
            farm.oven.queue[job_index].status = OvenJobStatus::Producing;
            farm.oven.queue[job_index].started_at_ms = completed_at_ms;
            farm.oven.queue[job_index].ready_at_ms = completed_at_ms
                + scaled_duration_ms(recipe.reference_seconds, catalog.balance.time_scale);
            Vec::new()
        }
        ResidentTaskStepWork::CollectOvenJob { job_id, recipe_id } => {
            let ReservedWorkTarget::Oven = step.reserved_work_target else {
                return Vec::new();
            };
            let Some(job_index) = farm.oven.queue.iter().position(|job| job.id == job_id) else {
                return Vec::new();
            };
            farm.oven.queue.remove(job_index);
            let Some(recipe) = catalog.recipe(&recipe_id) else {
                return Vec::new();
            };
            add_resident_items(farm, resident_id, &recipe.outputs);
            gain_xp(farm, catalog, recipe.xp);
            vec![FarmEvent::MachineJobCollected {
                recipe_id: recipe.id.clone(),
            }]
        }
        ResidentTaskStepWork::FeedAnimal => {
            let ReservedWorkTarget::Animal {
                shelter_id,
                animal_slot,
            } = step.reserved_work_target
            else {
                return Vec::new();
            };
            let Ok(shelter_index) = find_shelter_index(farm, &shelter_id) else {
                return Vec::new();
            };
            let Some(def) = catalog.shelter(&farm.shelters[shelter_index].kind) else {
                return Vec::new();
            };
            if remove_resident_items(farm, resident_id, &[ItemStack::new(&def.feed_item_id, 1)])
                .is_err()
                && remove_inventory(farm, &[ItemStack::new(&def.feed_item_id, 1)]).is_err()
            {
                return Vec::new();
            }
            let Some(animal) = farm.shelters[shelter_index]
                .animals
                .iter_mut()
                .find(|animal| animal.id == animal_slot)
            else {
                return Vec::new();
            };
            if !matches!(animal.state, AnimalState::Idle) {
                return Vec::new();
            }
            animal.state = AnimalState::Producing {
                fed_at_ms: completed_at_ms,
                ready_at_ms: completed_at_ms
                    + scaled_duration_ms(def.reference_seconds, catalog.balance.time_scale),
            };
            vec![FarmEvent::AnimalFed { shelter_id }]
        }
        ResidentTaskStepWork::CollectAnimalProduct { item_id, quantity } => {
            let ReservedWorkTarget::Animal {
                shelter_id,
                animal_slot,
            } = step.reserved_work_target
            else {
                return Vec::new();
            };
            let Ok(shelter_index) = find_shelter_index(farm, &shelter_id) else {
                return Vec::new();
            };
            let Some(animal) = farm.shelters[shelter_index]
                .animals
                .iter_mut()
                .find(|animal| animal.id == animal_slot)
            else {
                return Vec::new();
            };
            if !matches!(animal.state, AnimalState::Ready) {
                return Vec::new();
            }
            animal.state = AnimalState::Idle;
            add_resident_items(farm, resident_id, &[ItemStack::new(&item_id, quantity)]);
            if let Some(def) = catalog.shelter(&farm.shelters[shelter_index].kind) {
                gain_xp(farm, catalog, def.xp);
            }
            vec![FarmEvent::AnimalProductCollected { item_id }]
        }
        ResidentTaskStepWork::DepositInventory { item_id, quantity } => {
            add_inventory(farm, &item_id, quantity);
            Vec::new()
        }
        ResidentTaskStepWork::DepositItems { items, .. } => {
            if remove_resident_items(farm, resident_id, &items).is_ok() {
                for item in items {
                    add_inventory(farm, &item.item_id, item.quantity);
                }
            }
            Vec::new()
        }
        ResidentTaskStepWork::ReturnTools { source, tools } => {
            let tools = if tools.is_empty() {
                farm.resident_inventories
                    .get(resident_id)
                    .map(|inventory| {
                        inventory
                            .tools
                            .iter()
                            .map(|(tool_kind, quantity)| ToolStack::new(*tool_kind, *quantity))
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default()
            } else {
                tools
            };
            if remove_resident_tools(farm, resident_id, &tools).is_ok() {
                add_tool_source_tools(farm, &source, &tools);
            }
            Vec::new()
        }
    }
}

fn add_resident_items(farm: &mut FarmState, resident_id: &str, stacks: &[ItemStack]) {
    let inventory = farm
        .resident_inventories
        .entry(resident_id.to_owned())
        .or_insert_with(crate::default_resident_inventory);
    for stack in stacks {
        *inventory.items.entry(stack.item_id.clone()).or_insert(0) += stack.quantity;
    }
}

fn remove_resident_items(
    farm: &mut FarmState,
    resident_id: &str,
    stacks: &[ItemStack],
) -> Result<(), CommandError> {
    let inventory = farm
        .resident_inventories
        .entry(resident_id.to_owned())
        .or_insert_with(crate::default_resident_inventory);
    for stack in stacks {
        if inventory.items.get(&stack.item_id).copied().unwrap_or(0) < stack.quantity {
            return Err(CommandError::new(format!(
                "not enough carried {}",
                stack.item_id
            )));
        }
    }
    for stack in stacks {
        let entry = inventory.items.entry(stack.item_id.clone()).or_insert(0);
        *entry -= stack.quantity;
        if *entry == 0 {
            inventory.items.remove(&stack.item_id);
        }
    }
    Ok(())
}

fn add_resident_tools(
    farm: &mut FarmState,
    resident_id: &str,
    source: &ToolSourceRef,
    stacks: &[ToolStack],
) {
    let inventory = farm
        .resident_inventories
        .entry(resident_id.to_owned())
        .or_insert_with(crate::default_resident_inventory);
    for stack in stacks {
        *inventory.tools.entry(stack.tool_kind).or_insert(0) += stack.quantity;
        inventory
            .tool_sources
            .insert(stack.tool_kind, source.clone());
    }
}

fn remove_resident_tools(
    farm: &mut FarmState,
    resident_id: &str,
    stacks: &[ToolStack],
) -> Result<(), CommandError> {
    let inventory = farm
        .resident_inventories
        .entry(resident_id.to_owned())
        .or_insert_with(crate::default_resident_inventory);
    remove_projected_tools(&mut inventory.tools, stacks)?;
    for stack in stacks {
        if inventory.tools.get(&stack.tool_kind).copied().unwrap_or(0) == 0 {
            inventory.tool_sources.remove(&stack.tool_kind);
        }
    }
    Ok(())
}

fn remove_tool_source_tools(
    farm: &mut FarmState,
    source: &ToolSourceRef,
    stacks: &[ToolStack],
) -> Result<(), CommandError> {
    let stock = tool_source_stock_mut(farm, source)?;
    remove_projected_tools(stock, stacks)
}

fn add_tool_source_tools(farm: &mut FarmState, source: &ToolSourceRef, stacks: &[ToolStack]) {
    if let Ok(stock) = tool_source_stock_mut(farm, source) {
        add_projected_tools(stock, stacks);
    }
}

fn tool_source_stock_mut<'a>(
    farm: &'a mut FarmState,
    source: &ToolSourceRef,
) -> Result<&'a mut BTreeMap<ToolKind, u32>, CommandError> {
    match source {
        ToolSourceRef::Farmhouse => Ok(&mut farm.farmhouse_tool_stock),
        ToolSourceRef::ToolShed { id } => farm
            .tool_shed
            .as_mut()
            .filter(|tool_shed| tool_shed.id == *id)
            .map(|tool_shed| &mut tool_shed.tool_stock)
            .ok_or_else(|| CommandError::new("tool shed not found")),
    }
}

fn step_inventory_outputs(
    catalog: &CatalogDocument,
    work: &ResidentTaskStepWork,
) -> Vec<ItemStack> {
    match work {
        ResidentTaskStepWork::HarvestCrop { crop_id, quantity } => {
            vec![ItemStack::new(crop_id, *quantity)]
        }
        ResidentTaskStepWork::CollectMachineJob { recipe_id, .. }
        | ResidentTaskStepWork::CollectOvenJob { recipe_id, .. } => catalog
            .recipe(recipe_id)
            .map(|recipe| recipe.outputs.clone())
            .unwrap_or_default(),
        ResidentTaskStepWork::CollectAnimalProduct { item_id, quantity } => {
            vec![ItemStack::new(item_id, *quantity)]
        }
        ResidentTaskStepWork::PlantCrop { .. }
        | ResidentTaskStepWork::PickupItems { .. }
        | ResidentTaskStepWork::PickupTools { .. }
        | ResidentTaskStepWork::FeedAnimal
        | ResidentTaskStepWork::StartOvenRecipe { .. }
        | ResidentTaskStepWork::DepositInventory { .. }
        | ResidentTaskStepWork::DepositItems { .. }
        | ResidentTaskStepWork::ReturnTools { .. } => Vec::new(),
    }
}

fn field_plot_is_reserved(farm: &FarmState, plot_id: &str) -> bool {
    farm.resident_task_queues
        .values()
        .flat_map(|queue| queue.iter())
        .flat_map(|task| task.steps.iter())
        .any(|step| {
            matches!(
                &step.reserved_work_target,
                ReservedWorkTarget::FieldPlot { plot_id: reserved_plot_id }
                    if reserved_plot_id == plot_id
            )
        })
}

fn machine_is_reserved(farm: &FarmState, machine_id: &str) -> bool {
    farm.resident_task_queues
        .values()
        .flat_map(|queue| queue.iter())
        .flat_map(|task| task.steps.iter())
        .any(|step| {
            matches!(
                &step.reserved_work_target,
                ReservedWorkTarget::Machine { machine_id: reserved_machine_id }
                    if reserved_machine_id == machine_id
            )
        })
}

fn oven_is_reserved(farm: &FarmState) -> bool {
    farm.resident_task_queues
        .values()
        .flat_map(|queue| queue.iter())
        .flat_map(|task| task.steps.iter())
        .any(|step| matches!(&step.reserved_work_target, ReservedWorkTarget::Oven))
}

fn shelter_is_reserved(farm: &FarmState, shelter_id: &str) -> bool {
    farm.resident_task_queues
        .values()
        .flat_map(|queue| queue.iter())
        .flat_map(|task| task.steps.iter())
        .any(|step| {
            matches!(
                &step.reserved_work_target,
                ReservedWorkTarget::Animal {
                    shelter_id: reserved_shelter_id,
                    ..
                } if reserved_shelter_id == shelter_id
            )
        })
}

fn animal_slot_is_reserved(farm: &FarmState, shelter_id: &str, animal_slot: &str) -> bool {
    farm.resident_task_queues
        .values()
        .flat_map(|queue| queue.iter())
        .flat_map(|task| task.steps.iter())
        .any(|step| {
            matches!(
                &step.reserved_work_target,
                ReservedWorkTarget::Animal {
                    shelter_id: reserved_shelter_id,
                    animal_slot: reserved_animal_slot
                } if reserved_shelter_id == shelter_id && reserved_animal_slot == animal_slot
            )
        })
}

fn has_storage_room_after_reservations(
    farm: &FarmState,
    catalog: &CatalogDocument,
    stacks: &[ItemStack],
) -> bool {
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
    let (reserved_crop, reserved_barn) = reserved_storage(farm, catalog);

    crop_storage_used(farm, catalog) + reserved_crop + crop_add <= farm.silo_capacity
        && barn_storage_used(farm, catalog) + reserved_barn + barn_add <= farm.barn_capacity
}

fn reserved_storage(farm: &FarmState, catalog: &CatalogDocument) -> (u32, u32) {
    let mut reserved_crop = 0;
    let mut reserved_barn = 0;
    for queue in farm.resident_task_queues.values() {
        for task_index in 0..queue.len() {
            for step_index in 0..queue[task_index].steps.len() {
                let step = &queue[task_index].steps[step_index];
                let outputs = match &step.work {
                    ResidentTaskStepWork::DepositInventory { item_id, quantity } => {
                        vec![ItemStack::new(item_id, *quantity)]
                    }
                    ResidentTaskStepWork::DepositItems { items, .. } => items.clone(),
                    _ => {
                        let outputs = step_inventory_outputs(catalog, &step.work);
                        if outputs.is_empty()
                            || step_outputs_have_following_deposits(
                                catalog, queue, task_index, step_index, &outputs,
                            )
                        {
                            Vec::new()
                        } else {
                            outputs
                        }
                    }
                };
                reserve_storage_outputs(catalog, &outputs, &mut reserved_crop, &mut reserved_barn);
            }
        }
    }
    (reserved_crop, reserved_barn)
}

fn step_outputs_have_following_deposits(
    _catalog: &CatalogDocument,
    queue: &[ResidentTask],
    task_index: usize,
    step_index: usize,
    outputs: &[ItemStack],
) -> bool {
    outputs.iter().all(|output| {
        queue_has_following_deposit(
            queue,
            task_index,
            step_index,
            &output.item_id,
            output.quantity,
        )
    })
}

fn queue_has_following_deposit(
    queue: &[ResidentTask],
    task_index: usize,
    step_index: usize,
    item_id: &str,
    quantity: u32,
) -> bool {
    for (current_task_index, task) in queue.iter().enumerate().skip(task_index) {
        let first_step_index = if current_task_index == task_index {
            step_index + 1
        } else {
            0
        };
        for step in task.steps.iter().skip(first_step_index) {
            match &step.work {
                ResidentTaskStepWork::DepositInventory {
                    item_id: deposit_item_id,
                    quantity: deposit_quantity,
                } => {
                    if deposit_item_id == item_id && *deposit_quantity == quantity {
                        return true;
                    }
                }
                ResidentTaskStepWork::DepositItems { items, .. } => {
                    if items
                        .iter()
                        .any(|item| item.item_id == item_id && item.quantity == quantity)
                    {
                        return true;
                    }
                }
                _ => return false,
            }
        }
    }
    false
}

fn reserve_storage_outputs(
    catalog: &CatalogDocument,
    outputs: &[ItemStack],
    reserved_crop: &mut u32,
    reserved_barn: &mut u32,
) {
    for output in outputs {
        if catalog
            .item_kind(&output.item_id)
            .is_some_and(|kind| *kind == ItemKind::Crop)
        {
            *reserved_crop += output.quantity;
        } else {
            *reserved_barn += output.quantity;
        }
    }
}

fn grant_unclaimed_crop_starter_stock(farm: &mut FarmState, catalog: &CatalogDocument) {
    for crop in &catalog.crops {
        if crop.unlock_level > farm.level
            || farm
                .claimed_crop_unlocks
                .iter()
                .any(|claimed| claimed == &crop.item_id)
        {
            continue;
        }

        let starter_stock = ItemStack::new(&crop.item_id, CROP_STARTER_STOCK);
        if !has_storage_room_after_reservations(farm, catalog, std::slice::from_ref(&starter_stock))
        {
            continue;
        }

        add_inventory(farm, &starter_stock.item_id, starter_stock.quantity);
        farm.claimed_crop_unlocks.push(crop.item_id.clone());
    }
}

fn buy_field_plot(farm: &mut FarmState, tile: Tile) -> Result<Vec<FarmEvent>, CommandError> {
    ensure_tile_can_hold_structure(
        farm,
        &tile,
        StructureFootprint {
            width: 1,
            height: 1,
        },
        None,
    )?;
    spend_coins(farm, FIELD_PLOT_COST)?;
    let mut plot_id = next_id(farm, "plot");
    while farm.field_plots.iter().any(|plot| plot.id == plot_id) {
        plot_id = next_id(farm, "plot");
    }
    farm.field_plots.push(FieldPlot {
        id: plot_id.clone(),
        tile,
        crop: None,
    });
    Ok(vec![FarmEvent::FieldPlotBuilt { plot_id }])
}

fn buy_structure(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    structure_kind: StructureKind,
    tile: Tile,
) -> Result<Vec<FarmEvent>, CommandError> {
    match &structure_kind {
        StructureKind::Silo | StructureKind::Barn => {
            return Err(CommandError::new("structure already built"));
        }
        StructureKind::FeedMill => {
            let def = catalog.machine(&MachineKind::FeedMill).unwrap();
            buy_machine(
                farm,
                def.build_cost,
                def.unlock_level,
                MachineKind::FeedMill,
                tile,
            )?;
        }
        StructureKind::ChickenCoop => {
            let def = catalog.shelter(&ShelterKind::ChickenCoop).unwrap();
            buy_shelter(farm, def, tile)?;
        }
        StructureKind::CowPasture => {
            let def = catalog.shelter(&ShelterKind::CowPasture).unwrap();
            buy_shelter(farm, def, tile)?;
        }
        StructureKind::DeliveryBoard => {
            require_level(farm, 4)?;
            if farm.delivery_board_built {
                return Err(CommandError::new("structure already built"));
            }
            ensure_tile_can_hold_structure(
                farm,
                &tile,
                structure_footprint(&StructureKind::DeliveryBoard),
                None,
            )?;
            spend_coins(farm, 20)?;
            farm.delivery_board_built = true;
            farm.delivery_board_tile = tile;
            ensure_delivery_orders(farm, catalog);
        }
        StructureKind::ToolShed => {
            require_level(farm, TOOL_SHED_UNLOCK_LEVEL)?;
            if farm.tool_shed.is_some() {
                return Err(CommandError::new("structure already built"));
            }
            ensure_tile_can_hold_structure(
                farm,
                &tile,
                structure_footprint(&StructureKind::ToolShed),
                None,
            )?;
            spend_coins(farm, TOOL_SHED_COST)?;
            let id = next_id(farm, "tool-shed");
            farm.tool_shed = Some(ToolShedState {
                id,
                tile,
                tool_stock: default_tool_stock(),
            });
        }
    }
    Ok(vec![FarmEvent::StructureBuilt { structure_kind }])
}

fn upgrade_storage(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    storage_kind: StorageKind,
) -> Result<Vec<FarmEvent>, CommandError> {
    let current_tier = match storage_kind {
        StorageKind::Silo => farm.silo_upgrade_tier,
        StorageKind::Barn => farm.barn_upgrade_tier,
    };
    let next_tier = current_tier + 1;
    let upgrade = catalog
        .storage_upgrade(storage_kind, next_tier)
        .ok_or_else(|| CommandError::new("storage fully upgraded"))?;

    require_level(farm, upgrade.unlock_level)?;
    spend_coins(farm, upgrade.cost_coins)?;

    let capacity = match storage_kind {
        StorageKind::Silo => {
            farm.silo_upgrade_tier = upgrade.tier;
            farm.silo_capacity = farm.silo_capacity.max(upgrade.capacity);
            farm.silo_capacity
        }
        StorageKind::Barn => {
            farm.barn_upgrade_tier = upgrade.tier;
            farm.barn_capacity = farm.barn_capacity.max(upgrade.capacity);
            farm.barn_capacity
        }
    };

    Ok(vec![FarmEvent::StorageUpgraded {
        storage_kind,
        tier: upgrade.tier,
        capacity,
    }])
}

fn buy_farmhouse_upgrade(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    upgrade_kind: FarmhouseUpgradeKind,
) -> Result<Vec<FarmEvent>, CommandError> {
    let upgrade = catalog
        .farmhouse_upgrade(upgrade_kind)
        .ok_or_else(|| CommandError::new("unknown farmhouse upgrade"))?;
    require_level(farm, upgrade.unlock_level)?;
    if farm.owned_farmhouse_upgrades.contains(&upgrade_kind) {
        return Err(CommandError::new("farmhouse upgrade already owned"));
    }
    spend_coins(farm, upgrade.cost_coins)?;
    farm.owned_farmhouse_upgrades.push(upgrade_kind);
    Ok(vec![FarmEvent::FarmhouseUpgradeBought { upgrade_kind }])
}

fn move_structure(
    farm: &mut FarmState,
    target: StructureTarget,
    tile: Tile,
) -> Result<Vec<FarmEvent>, CommandError> {
    ensure_structure_target_can_move(farm, &target)?;
    let structure_kind = match &target {
        StructureTarget::Silo => StructureKind::Silo,
        StructureTarget::Barn => StructureKind::Barn,
        StructureTarget::Machine { id } => {
            let machine = farm
                .machines
                .iter()
                .find(|machine| machine.id == *id)
                .ok_or_else(|| CommandError::new("machine not found"))?;
            machine_structure_kind(&machine.kind)
        }
        StructureTarget::Shelter { id } => {
            let shelter = farm
                .shelters
                .iter()
                .find(|shelter| shelter.id == *id)
                .ok_or_else(|| CommandError::new("animal shelter not found"))?;
            shelter_structure_kind(&shelter.kind)
        }
        StructureTarget::DeliveryBoard => {
            if !farm.delivery_board_built {
                return Err(CommandError::new("delivery board not found"));
            }
            StructureKind::DeliveryBoard
        }
        StructureTarget::ToolShed { id } => {
            farm.tool_shed
                .as_ref()
                .filter(|tool_shed| tool_shed.id == *id)
                .ok_or_else(|| CommandError::new("tool shed not found"))?;
            StructureKind::ToolShed
        }
    };

    ensure_tile_can_hold_structure(
        farm,
        &tile,
        structure_footprint(&structure_kind),
        Some(&target),
    )?;

    match &target {
        StructureTarget::Silo => {
            farm.silo_tile = tile.clone();
        }
        StructureTarget::Barn => {
            farm.barn_tile = tile.clone();
        }
        StructureTarget::Machine { id } => {
            let machine = farm
                .machines
                .iter_mut()
                .find(|machine| machine.id == *id)
                .unwrap();
            machine.tile = tile.clone();
        }
        StructureTarget::Shelter { id } => {
            let shelter = farm
                .shelters
                .iter_mut()
                .find(|shelter| shelter.id == *id)
                .unwrap();
            shelter.tile = tile.clone();
        }
        StructureTarget::DeliveryBoard => {
            farm.delivery_board_tile = tile.clone();
        }
        StructureTarget::ToolShed { id } => {
            let tool_shed = farm
                .tool_shed
                .as_mut()
                .filter(|tool_shed| tool_shed.id == *id)
                .unwrap();
            tool_shed.tile = tile.clone();
        }
    }

    Ok(vec![FarmEvent::StructureMoved { target, tile }])
}

fn ensure_structure_target_can_move(
    farm: &FarmState,
    target: &StructureTarget,
) -> Result<(), CommandError> {
    match target {
        StructureTarget::Machine { id } if machine_is_reserved(farm, id) => {
            Err(CommandError::new("machine is reserved"))
        }
        StructureTarget::Shelter { id } if shelter_is_reserved(farm, id) => {
            Err(CommandError::new("animal shelter is reserved"))
        }
        _ => Ok(()),
    }
}

fn queue_recipe(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
    machine_id: &str,
    recipe_id: &str,
) -> Result<Vec<FarmEvent>, CommandError> {
    let recipe = catalog
        .recipe(recipe_id)
        .ok_or_else(|| CommandError::new("unknown recipe"))?;
    require_level(farm, recipe.unlock_level)?;
    let machine_index = farm
        .machines
        .iter()
        .position(|machine| machine.id == machine_id)
        .ok_or_else(|| CommandError::new("machine not found"))?;
    let RecipeTarget::Machine { machine_kind } = &recipe.target else {
        return Err(CommandError::new("recipe does not belong to this machine"));
    };
    if &farm.machines[machine_index].kind != machine_kind {
        return Err(CommandError::new("recipe does not belong to this machine"));
    }
    let machine_def = catalog.machine(machine_kind).unwrap();
    if farm.machines[machine_index].queue.len() >= machine_def.queue_limit {
        return Err(CommandError::new("machine queue is full"));
    }
    remove_inventory(farm, &recipe.inputs)?;
    let start_at = farm.machines[machine_index]
        .queue
        .last()
        .map(|job| job.ready_at_ms)
        .unwrap_or(now_ms)
        .max(now_ms);
    let job = MachineJob {
        id: next_id(farm, "job"),
        recipe_id: recipe_id.to_owned(),
        started_at_ms: start_at,
        ready_at_ms: start_at
            + scaled_duration_ms(recipe.reference_seconds, catalog.balance.time_scale),
    };
    farm.machines[machine_index].queue.push(job);
    Ok(vec![FarmEvent::RecipeQueued {
        recipe_id: recipe_id.to_owned(),
    }])
}

fn queue_oven_recipe(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
    recipe_id: &str,
) -> Result<Vec<FarmEvent>, CommandError> {
    let recipe = catalog
        .recipe(recipe_id)
        .ok_or_else(|| CommandError::new("unknown recipe"))?;
    require_level(farm, recipe.unlock_level)?;
    if !matches!(recipe.target, RecipeTarget::Oven) {
        return Err(CommandError::new("recipe does not belong to the oven"));
    }
    if !farm
        .owned_farmhouse_upgrades
        .contains(&FarmhouseUpgradeKind::Oven)
    {
        return Err(CommandError::new("oven is not owned"));
    }
    let oven_def = catalog
        .farmhouse_upgrade(FarmhouseUpgradeKind::Oven)
        .ok_or_else(|| CommandError::new("unknown farmhouse upgrade"))?;
    if farm.oven.queue.len() >= oven_def.queue_limit {
        return Err(CommandError::new("oven queue is full"));
    }
    let mut planned = plan_resident_work(
        farm,
        catalog,
        now_ms,
        ResidentTaskKind::ProductionWork,
        vec![resident_task_step(
            ReservedWorkTarget::Oven,
            ResidentTaskStepWork::StartOvenRecipe {
                job_id: String::new(),
                recipe_id: recipe.id.clone(),
            },
        )],
    )?;
    let job = OvenJob {
        id: next_id(farm, "job"),
        recipe_id: recipe_id.to_owned(),
        status: OvenJobStatus::PendingStart,
        started_at_ms: 0,
        ready_at_ms: 0,
    };
    let job_id = job.id.clone();
    if let Some(step) = planned
        .steps
        .iter_mut()
        .find(|step| matches!(step.work, ResidentTaskStepWork::StartOvenRecipe { .. }))
    {
        step.work = ResidentTaskStepWork::StartOvenRecipe {
            job_id,
            recipe_id: recipe.id.clone(),
        };
    }
    farm.oven.queue.push(job);
    push_planned_resident_work(farm, planned);
    Ok(vec![FarmEvent::RecipeQueued {
        recipe_id: recipe_id.to_owned(),
    }])
}

fn collect_machine_job(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
    machine_id: &str,
) -> Result<Vec<FarmEvent>, CommandError> {
    let machine_index = farm
        .machines
        .iter()
        .position(|machine| machine.id == machine_id)
        .ok_or_else(|| CommandError::new("machine not found"))?;
    let job = farm.machines[machine_index]
        .queue
        .first()
        .cloned()
        .ok_or_else(|| CommandError::new("machine queue is empty"))?;
    if job.ready_at_ms > now_ms {
        return Err(CommandError::new("machine job is not ready"));
    }
    if machine_is_reserved(farm, machine_id) {
        return Err(CommandError::new("machine is reserved"));
    }
    let recipe = catalog.recipe(&job.recipe_id).unwrap();
    if !has_storage_room_after_reservations(farm, catalog, &recipe.outputs) {
        return Err(CommandError::new("storage is full"));
    }
    let planned = plan_resident_work(
        farm,
        catalog,
        now_ms,
        ResidentTaskKind::ProductionWork,
        vec![resident_task_step(
            ReservedWorkTarget::Machine {
                machine_id: machine_id.to_owned(),
            },
            ResidentTaskStepWork::CollectMachineJob {
                job_id: job.id,
                recipe_id: recipe.id.clone(),
            },
        )],
    )?;
    push_planned_resident_work(farm, planned);
    Ok(Vec::new())
}

fn collect_oven_job(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
) -> Result<Vec<FarmEvent>, CommandError> {
    let job = farm
        .oven
        .queue
        .first()
        .cloned()
        .ok_or_else(|| CommandError::new("oven queue is empty"))?;
    if job.status == OvenJobStatus::PendingStart {
        return Err(CommandError::new("oven job has not started"));
    }
    if job.ready_at_ms > now_ms {
        return Err(CommandError::new("oven job is not ready"));
    }
    if oven_is_reserved(farm) {
        return Err(CommandError::new("oven is reserved"));
    }
    let recipe = catalog.recipe(&job.recipe_id).unwrap();
    if !has_storage_room_after_reservations(farm, catalog, &recipe.outputs) {
        return Err(CommandError::new("storage is full"));
    }
    let planned = plan_resident_work(
        farm,
        catalog,
        now_ms,
        ResidentTaskKind::ProductionWork,
        vec![resident_task_step(
            ReservedWorkTarget::Oven,
            ResidentTaskStepWork::CollectOvenJob {
                job_id: job.id,
                recipe_id: recipe.id.clone(),
            },
        )],
    )?;
    push_planned_resident_work(farm, planned);
    Ok(Vec::new())
}

fn feed_animal(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
    shelter_id: &str,
    animal_slot: &str,
) -> Result<Vec<FarmEvent>, CommandError> {
    let shelter_index = find_shelter_index(farm, shelter_id)?;
    let animal = farm.shelters[shelter_index]
        .animals
        .iter()
        .find(|animal| animal.id == animal_slot)
        .ok_or_else(|| CommandError::new("animal not found"))?;
    if !matches!(animal.state, AnimalState::Idle) {
        return Err(CommandError::new("animal is not hungry"));
    }
    if animal_slot_is_reserved(farm, shelter_id, animal_slot) {
        return Err(CommandError::new("animal is reserved"));
    }
    let planned = plan_resident_work(
        farm,
        catalog,
        now_ms,
        ResidentTaskKind::ProductionWork,
        vec![resident_task_step(
            ReservedWorkTarget::Animal {
                shelter_id: shelter_id.to_owned(),
                animal_slot: animal_slot.to_owned(),
            },
            ResidentTaskStepWork::FeedAnimal,
        )],
    )?;
    push_planned_resident_work(farm, planned);
    Ok(Vec::new())
}

fn collect_animal_product(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
    shelter_id: &str,
    animal_slot: &str,
) -> Result<Vec<FarmEvent>, CommandError> {
    let shelter_index = find_shelter_index(farm, shelter_id)?;
    let def = catalog.shelter(&farm.shelters[shelter_index].kind).unwrap();
    let output = ItemStack::new(&def.product_item_id, 1);
    let animal = farm.shelters[shelter_index]
        .animals
        .iter()
        .find(|animal| animal.id == animal_slot)
        .ok_or_else(|| CommandError::new("animal not found"))?;
    if !matches!(animal.state, AnimalState::Ready) {
        return Err(CommandError::new("animal product is not ready"));
    }
    if animal_slot_is_reserved(farm, shelter_id, animal_slot) {
        return Err(CommandError::new("animal is reserved"));
    }
    if !has_storage_room_after_reservations(farm, catalog, std::slice::from_ref(&output)) {
        return Err(CommandError::new("storage is full"));
    }
    let planned = plan_resident_work(
        farm,
        catalog,
        now_ms,
        ResidentTaskKind::ProductionWork,
        vec![resident_task_step(
            ReservedWorkTarget::Animal {
                shelter_id: shelter_id.to_owned(),
                animal_slot: animal_slot.to_owned(),
            },
            ResidentTaskStepWork::CollectAnimalProduct {
                item_id: output.item_id,
                quantity: output.quantity,
            },
        )],
    )?;
    push_planned_resident_work(farm, planned);
    Ok(Vec::new())
}

fn fulfill_delivery_order(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    order_id: &str,
) -> Result<Vec<FarmEvent>, CommandError> {
    let index = farm
        .delivery_orders
        .iter()
        .position(|order| order.id == order_id)
        .ok_or_else(|| CommandError::new("delivery order not found"))?;
    let order = farm.delivery_orders[index].clone();
    remove_inventory(farm, &order.requirements)?;
    farm.delivery_orders.remove(index);
    farm.coins += order.reward_coins;
    gain_xp(farm, catalog, order.reward_xp);
    ensure_delivery_orders(farm, catalog);
    Ok(vec![FarmEvent::DeliveryOrderFulfilled {
        order_id: order.id,
    }])
}

fn discard_delivery_order(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    order_id: &str,
) -> Result<Vec<FarmEvent>, CommandError> {
    let index = farm
        .delivery_orders
        .iter()
        .position(|order| order.id == order_id)
        .ok_or_else(|| CommandError::new("delivery order not found"))?;
    farm.delivery_orders.remove(index);
    ensure_delivery_orders(farm, catalog);
    Ok(vec![FarmEvent::DeliveryOrderDiscarded {
        order_id: order_id.to_owned(),
    }])
}

fn discard_inventory(
    farm: &mut FarmState,
    item_id: &str,
    quantity: u32,
) -> Result<Vec<FarmEvent>, CommandError> {
    if quantity == 0 {
        return Err(CommandError::new("quantity must be greater than zero"));
    }

    remove_inventory(farm, &[ItemStack::new(item_id, quantity)])?;
    Ok(vec![FarmEvent::InventoryDiscarded {
        item_id: item_id.to_owned(),
        quantity,
    }])
}

fn select_resident(
    farm: &mut FarmState,
    resident_id: &str,
) -> Result<Vec<FarmEvent>, CommandError> {
    find_resident_index(farm, resident_id)?;
    farm.selected_resident_id = resident_id.to_owned();
    Ok(vec![FarmEvent::ResidentSelected {
        resident_id: resident_id.to_owned(),
    }])
}

fn rename_resident(
    farm: &mut FarmState,
    resident_id: &str,
    display_name: &str,
) -> Result<Vec<FarmEvent>, CommandError> {
    let resident_index = find_resident_index(farm, resident_id)?;
    let display_name = validated_resident_display_name(display_name)?;
    farm.residents[resident_index].display_name = display_name.clone();
    Ok(vec![FarmEvent::ResidentRenamed {
        resident_id: resident_id.to_owned(),
        display_name,
    }])
}

fn find_resident_index(farm: &FarmState, resident_id: &str) -> Result<usize, CommandError> {
    farm.residents
        .iter()
        .position(|resident| resident.id == resident_id)
        .ok_or_else(|| CommandError::new("resident not found"))
}

fn validated_resident_display_name(display_name: &str) -> Result<String, CommandError> {
    let trimmed = display_name.trim();
    if trimmed.is_empty() {
        return Err(CommandError::new("resident name cannot be empty"));
    }
    if trimmed.chars().count() > 20 {
        return Err(CommandError::new(
            "resident name cannot exceed 20 characters",
        ));
    }
    Ok(trimmed.to_owned())
}

fn buy_market_item(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    item_id: &str,
    quantity: u32,
) -> Result<Vec<FarmEvent>, CommandError> {
    let market_item = catalog
        .market_item(item_id)
        .ok_or_else(|| CommandError::new("unknown market item"))?;
    if quantity == 0 {
        return Err(CommandError::new("quantity must be greater than zero"));
    }
    require_level(farm, market_item.unlock_level)?;
    let unit_price = market_item
        .buy_price
        .ok_or_else(|| CommandError::new("item is not available to buy"))?;
    let coins_spent = unit_price
        .checked_mul(quantity)
        .ok_or_else(|| CommandError::new("market price overflow"))?;
    let output = ItemStack::new(item_id, quantity);
    if !has_storage_room_after_reservations(farm, catalog, std::slice::from_ref(&output)) {
        return Err(CommandError::new("storage is full"));
    }
    spend_coins(farm, coins_spent)?;
    add_inventory(farm, item_id, quantity);
    Ok(vec![FarmEvent::MarketItemBought {
        item_id: item_id.to_owned(),
        quantity,
        coins_spent,
    }])
}

fn sell_market_item(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    item_id: &str,
    quantity: u32,
) -> Result<Vec<FarmEvent>, CommandError> {
    let market_item = catalog
        .market_item(item_id)
        .ok_or_else(|| CommandError::new("unknown market item"))?;
    if quantity == 0 {
        return Err(CommandError::new("quantity must be greater than zero"));
    }
    require_level(farm, market_item.unlock_level)?;
    let unit_price = market_item
        .sell_price
        .ok_or_else(|| CommandError::new("item is not available to sell"))?;
    let coins_gained = unit_price
        .checked_mul(quantity)
        .ok_or_else(|| CommandError::new("market price overflow"))?;
    remove_inventory(farm, &[ItemStack::new(item_id, quantity)])?;
    farm.coins += coins_gained;
    Ok(vec![FarmEvent::MarketItemSold {
        item_id: item_id.to_owned(),
        quantity,
        coins_gained,
    }])
}

fn place_decoration(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    room_id: &str,
    decoration_id: &str,
    tile: RoomTile,
) -> Result<Vec<FarmEvent>, CommandError> {
    require_level(farm, DECORATION_EDITING_UNLOCK_LEVEL)?;
    let decoration = catalog
        .decoration(decoration_id)
        .ok_or_else(|| CommandError::new("unknown decoration"))?;
    let room_index = find_room_index(farm, room_id)?;
    ensure_decoration_tile_available(
        &farm.house_interior.rooms[room_index],
        catalog,
        decoration,
        &tile,
        None,
    )?;

    let placement_id = next_decoration_placement_id(farm);
    farm.house_interior.rooms[room_index]
        .decoration_placements
        .push(DecorationPlacement {
            id: placement_id.clone(),
            decoration_id: decoration_id.to_owned(),
            tile: tile.clone(),
        });

    Ok(vec![FarmEvent::DecorationPlaced {
        room_id: room_id.to_owned(),
        placement_id,
        decoration_id: decoration_id.to_owned(),
        tile,
    }])
}

fn move_decoration(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    room_id: &str,
    placement_id: &str,
    tile: RoomTile,
) -> Result<Vec<FarmEvent>, CommandError> {
    require_level(farm, DECORATION_EDITING_UNLOCK_LEVEL)?;
    let room_index = find_room_index(farm, room_id)?;
    let placement_index =
        find_decoration_placement_index(&farm.house_interior.rooms[room_index], placement_id)?;
    let decoration_id = farm.house_interior.rooms[room_index].decoration_placements
        [placement_index]
        .decoration_id
        .clone();
    let decoration = catalog
        .decoration(&decoration_id)
        .ok_or_else(|| CommandError::new("unknown decoration"))?;
    ensure_decoration_tile_available(
        &farm.house_interior.rooms[room_index],
        catalog,
        decoration,
        &tile,
        Some(placement_id),
    )?;

    farm.house_interior.rooms[room_index].decoration_placements[placement_index].tile =
        tile.clone();

    Ok(vec![FarmEvent::DecorationMoved {
        room_id: room_id.to_owned(),
        placement_id: placement_id.to_owned(),
        tile,
    }])
}

fn remove_decoration(
    farm: &mut FarmState,
    room_id: &str,
    placement_id: &str,
) -> Result<Vec<FarmEvent>, CommandError> {
    require_level(farm, DECORATION_EDITING_UNLOCK_LEVEL)?;
    let room_index = find_room_index(farm, room_id)?;
    let placement_index =
        find_decoration_placement_index(&farm.house_interior.rooms[room_index], placement_id)?;
    farm.house_interior.rooms[room_index]
        .decoration_placements
        .remove(placement_index);

    Ok(vec![FarmEvent::DecorationRemoved {
        room_id: room_id.to_owned(),
        placement_id: placement_id.to_owned(),
    }])
}

fn find_room_index(farm: &FarmState, room_id: &str) -> Result<usize, CommandError> {
    farm.house_interior
        .rooms
        .iter()
        .position(|room| room.id == room_id)
        .ok_or_else(|| CommandError::new("room not found"))
}

fn find_decoration_placement_index(room: &Room, placement_id: &str) -> Result<usize, CommandError> {
    room.decoration_placements
        .iter()
        .position(|placement| placement.id == placement_id)
        .ok_or_else(|| CommandError::new("decoration placement not found"))
}

fn ensure_decoration_tile_available(
    room: &Room,
    catalog: &CatalogDocument,
    decoration: &DecorationDef,
    tile: &RoomTile,
    ignored_placement_id: Option<&str>,
) -> Result<(), CommandError> {
    let Some(right) = tile.x.checked_add(decoration.footprint.width) else {
        return Err(CommandError::new("decoration placement is out of bounds"));
    };
    let Some(bottom) = tile.y.checked_add(decoration.footprint.height) else {
        return Err(CommandError::new("decoration placement is out of bounds"));
    };
    if right > room.width || bottom > room.height {
        return Err(CommandError::new("decoration placement is out of bounds"));
    }
    if fixed_room_feature_overlaps(
        room,
        tile,
        decoration.footprint.width,
        decoration.footprint.height,
    ) {
        return Err(CommandError::new("decoration placement overlaps"));
    }

    for placement in &room.decoration_placements {
        if ignored_placement_id.is_some_and(|ignored| ignored == placement.id) {
            continue;
        }
        let other = catalog
            .decoration(&placement.decoration_id)
            .ok_or_else(|| CommandError::new("unknown decoration"))?;
        if decoration_footprints_overlap(tile, decoration, &placement.tile, other) {
            return Err(CommandError::new("decoration placement overlaps"));
        }
    }

    Ok(())
}

fn decoration_footprints_overlap(
    tile: &RoomTile,
    decoration: &DecorationDef,
    other_tile: &RoomTile,
    other_decoration: &DecorationDef,
) -> bool {
    room_footprints_overlap(
        tile,
        decoration.footprint.width,
        decoration.footprint.height,
        other_tile,
        other_decoration.footprint.width,
        other_decoration.footprint.height,
    )
}

fn fixed_room_feature_overlaps(room: &Room, tile: &RoomTile, width: u32, height: u32) -> bool {
    if room.id != KITCHEN_OVEN_ROOM_ID {
        return false;
    }
    room_footprints_overlap(
        tile,
        width,
        height,
        &RoomTile::new(KITCHEN_OVEN_TILE_X, KITCHEN_OVEN_TILE_Y),
        KITCHEN_OVEN_FOOTPRINT_WIDTH,
        KITCHEN_OVEN_FOOTPRINT_HEIGHT,
    )
}

fn room_footprints_overlap(
    tile: &RoomTile,
    width: u32,
    height: u32,
    other_tile: &RoomTile,
    other_width: u32,
    other_height: u32,
) -> bool {
    let right = tile.x + width;
    let bottom = tile.y + height;
    let other_right = other_tile.x + other_width;
    let other_bottom = other_tile.y + other_height;

    tile.x < other_right && right > other_tile.x && tile.y < other_bottom && bottom > other_tile.y
}

fn next_decoration_placement_id(farm: &mut FarmState) -> String {
    let mut placement_id = next_id(farm, "decoration");
    while farm.house_interior.rooms.iter().any(|room| {
        room.decoration_placements
            .iter()
            .any(|placement| placement.id == placement_id)
    }) {
        placement_id = next_id(farm, "decoration");
    }
    placement_id
}

pub fn ensure_delivery_orders(farm: &mut FarmState, catalog: &CatalogDocument) {
    if !farm.delivery_board_built || farm.level < 4 {
        return;
    }
    while farm.delivery_orders.len() < catalog.balance.max_orders {
        let order = generated_order(farm, catalog);
        farm.delivery_orders.push(order);
    }
}

fn generated_order(farm: &mut FarmState, catalog: &CatalogDocument) -> DeliveryOrder {
    let unlocked = catalog
        .items
        .iter()
        .filter(|item| item.unlock_level <= farm.level && item.kind != ItemKind::Feed)
        .collect::<Vec<_>>();
    let seed = farm.next_id as usize;
    let first = unlocked[seed % unlocked.len()];
    let second = unlocked[(seed + 2) % unlocked.len()];
    let mut requirements = vec![ItemStack::new(&first.id, 1 + (seed as u32 % 2))];
    if second.id != first.id {
        requirements.push(ItemStack::new(&second.id, 1));
    }
    let reward_units = requirements.iter().map(|stack| stack.quantity).sum::<u32>();
    DeliveryOrder {
        id: next_id(farm, "order"),
        requirements,
        reward_coins: 8 + reward_units * 7 + farm.level,
        reward_xp: 2 + reward_units,
    }
}

fn buy_machine(
    farm: &mut FarmState,
    cost: u32,
    unlock_level: u32,
    kind: MachineKind,
    tile: Tile,
) -> Result<(), CommandError> {
    require_level(farm, unlock_level)?;
    if farm.machines.iter().any(|machine| machine.kind == kind) {
        return Err(CommandError::new("structure already built"));
    }
    let structure_kind = machine_structure_kind(&kind);
    ensure_tile_can_hold_structure(farm, &tile, structure_footprint(&structure_kind), None)?;
    spend_coins(farm, cost)?;
    let id = next_id(farm, "machine");
    farm.machines.push(MachineState {
        id,
        kind,
        tile,
        queue: Vec::new(),
    });
    Ok(())
}

fn buy_shelter(
    farm: &mut FarmState,
    def: &crate::ShelterDef,
    tile: Tile,
) -> Result<(), CommandError> {
    require_level(farm, def.unlock_level)?;
    if farm.shelters.iter().any(|shelter| shelter.kind == def.kind) {
        return Err(CommandError::new("structure already built"));
    }
    let structure_kind = shelter_structure_kind(&def.kind);
    ensure_tile_can_hold_structure(farm, &tile, structure_footprint(&structure_kind), None)?;
    spend_coins(farm, def.build_cost)?;
    let id = next_id(farm, "shelter");
    let animals = add_shelter_animals(farm, def);
    farm.shelters.push(AnimalShelterState {
        id,
        kind: def.kind.clone(),
        tile,
        animals,
    });
    Ok(())
}

fn spend_coins(farm: &mut FarmState, amount: u32) -> Result<(), CommandError> {
    if farm.coins < amount {
        return Err(CommandError::new("not enough coins"));
    }
    farm.coins -= amount;
    Ok(())
}

fn require_level(farm: &FarmState, unlock_level: u32) -> Result<(), CommandError> {
    if farm.level < unlock_level {
        return Err(CommandError::new(format!(
            "requires level {}",
            unlock_level
        )));
    }
    Ok(())
}

fn find_shelter_index(farm: &FarmState, shelter_id: &str) -> Result<usize, CommandError> {
    farm.shelters
        .iter()
        .position(|shelter| shelter.id == shelter_id)
        .ok_or_else(|| CommandError::new("animal shelter not found"))
}

fn ensure_tile_can_hold_structure(
    farm: &FarmState,
    tile: &Tile,
    footprint: StructureFootprint,
    ignore_target: Option<&StructureTarget>,
) -> Result<(), CommandError> {
    if !is_footprint_inside_farm(tile, footprint) {
        return Err(CommandError::new("tile is outside the farm"));
    }
    if resident_path_overlaps_footprint(farm, tile, footprint) {
        return Err(CommandError::new("resident path is reserved"));
    }
    let farm_house_tile = Tile::new(FARM_HOUSE_TILE_X, FARM_HOUSE_TILE_Y);
    if footprints_overlap(tile, footprint, &farm_house_tile, FARM_HOUSE_FOOTPRINT) {
        return Err(CommandError::new("tile is occupied"));
    }
    if farm
        .field_plots
        .iter()
        .any(|plot| footprint_contains(tile, footprint, &plot.tile))
    {
        return Err(CommandError::new("tile is occupied"));
    }
    if !matches!(ignore_target, Some(StructureTarget::Silo))
        && footprints_overlap(
            tile,
            footprint,
            &farm.silo_tile,
            structure_footprint(&StructureKind::Silo),
        )
    {
        return Err(CommandError::new("tile is occupied"));
    }
    if !matches!(ignore_target, Some(StructureTarget::Barn))
        && footprints_overlap(
            tile,
            footprint,
            &farm.barn_tile,
            structure_footprint(&StructureKind::Barn),
        )
    {
        return Err(CommandError::new("tile is occupied"));
    }
    if farm.machines.iter().any(|machine| {
        !ignores_machine(ignore_target, &machine.id)
            && footprints_overlap(
                tile,
                footprint,
                &machine.tile,
                structure_footprint(&machine_structure_kind(&machine.kind)),
            )
    }) {
        return Err(CommandError::new("tile is occupied"));
    }
    if farm.shelters.iter().any(|shelter| {
        !ignores_shelter(ignore_target, &shelter.id)
            && footprints_overlap(
                tile,
                footprint,
                &shelter.tile,
                structure_footprint(&shelter_structure_kind(&shelter.kind)),
            )
    }) {
        return Err(CommandError::new("tile is occupied"));
    }
    if farm.delivery_board_built
        && !matches!(ignore_target, Some(StructureTarget::DeliveryBoard))
        && footprints_overlap(
            tile,
            footprint,
            &farm.delivery_board_tile,
            structure_footprint(&StructureKind::DeliveryBoard),
        )
    {
        return Err(CommandError::new("tile is occupied"));
    }
    if let Some(tool_shed) = &farm.tool_shed {
        if !ignores_tool_shed(ignore_target, &tool_shed.id)
            && footprints_overlap(
                tile,
                footprint,
                &tool_shed.tile,
                structure_footprint(&StructureKind::ToolShed),
            )
        {
            return Err(CommandError::new("tile is occupied"));
        }
    }
    Ok(())
}

fn resident_path_overlaps_footprint(
    farm: &FarmState,
    tile: &Tile,
    footprint: StructureFootprint,
) -> bool {
    farm.resident_task_queues
        .values()
        .flat_map(|queue| queue.iter())
        .flat_map(|task| task.steps.iter())
        .flat_map(|step| step.walk_path.iter())
        .any(|path_tile| footprint_contains(tile, footprint, path_tile))
}

fn structure_footprints(farm: &FarmState) -> Vec<(Tile, StructureFootprint)> {
    let mut footprints = vec![
        (
            farm.silo_tile.clone(),
            structure_footprint(&StructureKind::Silo),
        ),
        (
            farm.barn_tile.clone(),
            structure_footprint(&StructureKind::Barn),
        ),
    ];
    footprints.extend(farm.machines.iter().map(|machine| {
        (
            machine.tile.clone(),
            structure_footprint(&machine_structure_kind(&machine.kind)),
        )
    }));
    footprints.extend(farm.shelters.iter().map(|shelter| {
        (
            shelter.tile.clone(),
            structure_footprint(&shelter_structure_kind(&shelter.kind)),
        )
    }));
    if farm.delivery_board_built {
        footprints.push((
            farm.delivery_board_tile.clone(),
            structure_footprint(&StructureKind::DeliveryBoard),
        ));
    }
    if let Some(tool_shed) = &farm.tool_shed {
        footprints.push((
            tool_shed.tile.clone(),
            structure_footprint(&StructureKind::ToolShed),
        ));
    }
    footprints
}

fn structure_footprint(kind: &StructureKind) -> StructureFootprint {
    match kind {
        StructureKind::Silo | StructureKind::Barn => StructureFootprint {
            width: 2,
            height: 2,
        },
        StructureKind::ChickenCoop => StructureFootprint {
            width: 2,
            height: 3,
        },
        StructureKind::CowPasture => StructureFootprint {
            width: 3,
            height: 3,
        },
        StructureKind::FeedMill | StructureKind::DeliveryBoard | StructureKind::ToolShed => {
            StructureFootprint {
                width: 1,
                height: 1,
            }
        }
    }
}

fn machine_structure_kind(kind: &MachineKind) -> StructureKind {
    match kind {
        MachineKind::FeedMill => StructureKind::FeedMill,
    }
}

fn shelter_structure_kind(kind: &ShelterKind) -> StructureKind {
    match kind {
        ShelterKind::ChickenCoop => StructureKind::ChickenCoop,
        ShelterKind::CowPasture => StructureKind::CowPasture,
    }
}

fn footprint_contains(origin: &Tile, footprint: StructureFootprint, tile: &Tile) -> bool {
    tile.x >= origin.x
        && tile.x < origin.x + footprint.width
        && tile.y >= origin.y
        && tile.y < origin.y + footprint.height
}

fn is_tile_inside_farm(tile: &Tile) -> bool {
    tile.x >= 0 && tile.y >= 0 && tile.x < FARM_GRID_SIZE && tile.y < FARM_GRID_SIZE
}

fn is_footprint_inside_farm(tile: &Tile, footprint: StructureFootprint) -> bool {
    tile.x >= 0
        && tile.y >= 0
        && tile.x + footprint.width <= FARM_GRID_SIZE
        && tile.y + footprint.height <= FARM_GRID_SIZE
}

fn footprints_overlap(
    left_origin: &Tile,
    left_footprint: StructureFootprint,
    right_origin: &Tile,
    right_footprint: StructureFootprint,
) -> bool {
    left_origin.x < right_origin.x + right_footprint.width
        && left_origin.x + left_footprint.width > right_origin.x
        && left_origin.y < right_origin.y + right_footprint.height
        && left_origin.y + left_footprint.height > right_origin.y
}

fn ignores_machine(ignore_target: Option<&StructureTarget>, machine_id: &str) -> bool {
    matches!(ignore_target, Some(StructureTarget::Machine { id }) if id == machine_id)
}

fn ignores_shelter(ignore_target: Option<&StructureTarget>, shelter_id: &str) -> bool {
    matches!(ignore_target, Some(StructureTarget::Shelter { id }) if id == shelter_id)
}

fn ignores_tool_shed(ignore_target: Option<&StructureTarget>, tool_shed_id: &str) -> bool {
    matches!(ignore_target, Some(StructureTarget::ToolShed { id }) if id == tool_shed_id)
}
