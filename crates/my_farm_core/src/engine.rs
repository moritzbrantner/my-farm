use crate::{
    AnimalShelterState, AnimalState, CatalogDocument, DecorationDef, DecorationPlacement,
    DeliveryOrder, FarmState, FarmhouseUpgradeKind, FieldPlot, ItemKind, ItemStack, MachineJob,
    MachineKind, MachineState, RecipeTarget, ReservedWorkTarget, ResidentTask, ResidentTaskKind,
    ResidentTaskStep, ResidentTaskStepWork, Room, RoomTile, ShelterKind, StorageKind,
    StructureKind, Tile, ToolShedState, add_inventory, add_shelter_animals, barn_storage_used,
    crop_storage_used, default_resident_task_step_duration_ms, gain_xp, next_id, remove_inventory,
    scaled_duration_ms, update_level,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
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
    remove_inventory(farm, &[ItemStack::new(crop_id, 1)])?;
    enqueue_resident_work(
        farm,
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

    remove_inventory(farm, &[ItemStack::new(crop_id, steps.len() as u32)])?;
    enqueue_resident_work(farm, now_ms, ResidentTaskKind::FieldWork, steps)?;
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
    enqueue_resident_work(
        farm,
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

    enqueue_resident_work(farm, now_ms, ResidentTaskKind::FieldWork, steps)?;
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
    ResidentTaskStep {
        reserved_work_target,
        work,
        duration_ms: default_resident_task_step_duration_ms(),
    }
}

fn enqueue_resident_work(
    farm: &mut FarmState,
    now_ms: i64,
    kind: ResidentTaskKind,
    steps: Vec<ResidentTaskStep>,
) -> Result<(), CommandError> {
    find_resident_index(farm, &farm.selected_resident_id)?;
    let selected_resident_id = farm.selected_resident_id.clone();
    let started_at_ms = farm
        .resident_task_queues
        .get(&selected_resident_id)
        .and_then(|queue| queue.last())
        .map(resident_task_tail_ready_at)
        .unwrap_or(now_ms)
        .max(now_ms);
    let steps = snapshot_resident_task_step_durations(farm, steps);
    let ready_at_ms = started_at_ms
        + steps
            .first()
            .map(resident_task_step_duration_ms)
            .unwrap_or(0);
    let task = ResidentTask {
        id: next_id(farm, "task"),
        kind,
        steps,
        started_at_ms,
        ready_at_ms,
    };
    farm.resident_task_queues
        .entry(selected_resident_id)
        .or_default()
        .push(task);
    Ok(())
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

fn snapshot_resident_task_step_durations(
    farm: &FarmState,
    steps: Vec<ResidentTaskStep>,
) -> Vec<ResidentTaskStep> {
    steps
        .into_iter()
        .map(|mut step| {
            step.duration_ms = duration_from_farmhouse_tool_source(farm, &step);
            step
        })
        .collect()
}

fn duration_from_farmhouse_tool_source(_farm: &FarmState, _step: &ResidentTaskStep) -> i64 {
    default_resident_task_step_duration_ms()
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
    Some((step, completed_at))
}

fn complete_resident_task_step(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    step: ResidentTaskStep,
    completed_at_ms: i64,
) -> Vec<FarmEvent> {
    match step.work {
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
            add_inventory(farm, &crop_id, quantity);
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
            for output in &recipe.outputs {
                add_inventory(farm, &output.item_id, output.quantity);
            }
            gain_xp(farm, catalog, recipe.xp);
            vec![FarmEvent::MachineJobCollected {
                recipe_id: recipe.id.clone(),
            }]
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
            for output in &recipe.outputs {
                add_inventory(farm, &output.item_id, output.quantity);
            }
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
            add_inventory(farm, &item_id, quantity);
            if let Some(def) = catalog.shelter(&farm.shelters[shelter_index].kind) {
                gain_xp(farm, catalog, def.xp);
            }
            vec![FarmEvent::AnimalProductCollected { item_id }]
        }
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
    for step in farm
        .resident_task_queues
        .values()
        .flat_map(|queue| queue.iter())
        .flat_map(|task| task.steps.iter())
    {
        match &step.work {
            ResidentTaskStepWork::HarvestCrop { crop_id, quantity } => {
                if catalog
                    .item_kind(crop_id)
                    .is_some_and(|kind| *kind == ItemKind::Crop)
                {
                    reserved_crop += quantity;
                } else {
                    reserved_barn += quantity;
                }
            }
            ResidentTaskStepWork::CollectMachineJob { recipe_id, .. } => {
                let Some(recipe) = catalog.recipe(recipe_id) else {
                    continue;
                };
                for output in &recipe.outputs {
                    if catalog
                        .item_kind(&output.item_id)
                        .is_some_and(|kind| *kind == ItemKind::Crop)
                    {
                        reserved_crop += output.quantity;
                    } else {
                        reserved_barn += output.quantity;
                    }
                }
            }
            ResidentTaskStepWork::CollectOvenJob { recipe_id, .. } => {
                let Some(recipe) = catalog.recipe(recipe_id) else {
                    continue;
                };
                for output in &recipe.outputs {
                    if catalog
                        .item_kind(&output.item_id)
                        .is_some_and(|kind| *kind == ItemKind::Crop)
                    {
                        reserved_crop += output.quantity;
                    } else {
                        reserved_barn += output.quantity;
                    }
                }
            }
            ResidentTaskStepWork::CollectAnimalProduct { item_id, quantity } => {
                if catalog
                    .item_kind(item_id)
                    .is_some_and(|kind| *kind == ItemKind::Crop)
                {
                    reserved_crop += quantity;
                } else {
                    reserved_barn += quantity;
                }
            }
            ResidentTaskStepWork::PlantCrop { .. } | ResidentTaskStepWork::FeedAnimal => {}
        }
    }
    (reserved_crop, reserved_barn)
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
            farm.tool_shed = Some(ToolShedState { id, tile });
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
    remove_inventory(farm, &recipe.inputs)?;
    let start_at = farm
        .oven
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
    farm.oven.queue.push(job);
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
    enqueue_resident_work(
        farm,
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
    enqueue_resident_work(
        farm,
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
    let def = catalog.shelter(&farm.shelters[shelter_index].kind).unwrap();
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
    remove_inventory(farm, &[ItemStack::new(&def.feed_item_id, 1)])?;
    enqueue_resident_work(
        farm,
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
    enqueue_resident_work(
        farm,
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
    let right = tile.x + decoration.footprint.width;
    let bottom = tile.y + decoration.footprint.height;
    let other_right = other_tile.x + other_decoration.footprint.width;
    let other_bottom = other_tile.y + other_decoration.footprint.height;

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
    if tile.x < 0
        || tile.y < 0
        || tile.x + footprint.width > FARM_GRID_SIZE
        || tile.y + footprint.height > FARM_GRID_SIZE
    {
        return Err(CommandError::new("tile is outside the farm"));
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
