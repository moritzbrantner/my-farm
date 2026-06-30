use crate::{
    add_inventory, add_shelter_animals, gain_xp, has_storage_room, next_id, remove_inventory,
    scaled_duration_ms, update_level, AnimalShelterState, AnimalState, CatalogDocument,
    DeliveryOrder, FarmState, ItemKind, ItemStack, MachineJob, MachineKind, MachineState,
    ShelterKind, StructureKind, Tile,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

const FARM_GRID_SIZE: i32 = 18;

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
    HarvestCrop {
        plot_id: String,
    },
    BuyStructure {
        structure_kind: StructureKind,
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
    CollectMachineJob {
        machine_id: String,
    },
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
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StructureTarget {
    Machine { id: String },
    Shelter { id: String },
    DeliveryBoard,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FarmEvent {
    CropPlanted { crop_id: String },
    CropHarvested { crop_id: String, quantity: u32 },
    StructureBuilt { structure_kind: StructureKind },
    StructureMoved { target: StructureTarget, tile: Tile },
    RecipeQueued { recipe_id: String },
    MachineJobCollected { recipe_id: String },
    AnimalFed { shelter_id: String },
    AnimalProductCollected { item_id: String },
    DeliveryOrderFulfilled { order_id: String },
    DeliveryOrderDiscarded { order_id: String },
    LevelChanged { level: u32 },
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

pub fn apply_elapsed(farm: &mut FarmState, catalog: &CatalogDocument, now_ms: i64) {
    if now_ms <= farm.last_update_ms {
        return;
    }
    for shelter in &mut farm.shelters {
        for animal in &mut shelter.animals {
            if matches!(animal.state, AnimalState::Producing { ready_at_ms, .. } if ready_at_ms <= now_ms)
            {
                animal.state = AnimalState::Ready;
            }
        }
    }
    update_level(farm, catalog);
    ensure_delivery_orders(farm, catalog);
    farm.last_update_ms = now_ms;
}

pub fn apply_command(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    command: FarmCommand,
    now_ms: i64,
) -> CommandOutcome {
    apply_elapsed(farm, catalog, now_ms);
    let previous_level = farm.level;
    let result = match command {
        FarmCommand::PlantCrop { plot_id, crop_id } => {
            plant_crop(farm, catalog, now_ms, &plot_id, &crop_id)
        }
        FarmCommand::HarvestCrop { plot_id } => harvest_crop(farm, catalog, now_ms, &plot_id),
        FarmCommand::BuyStructure {
            structure_kind,
            tile,
        } => buy_structure(farm, catalog, structure_kind, tile),
        FarmCommand::MoveStructure { target, tile } => move_structure(farm, target, tile),
        FarmCommand::QueueRecipe {
            machine_id,
            recipe_id,
        } => queue_recipe(farm, catalog, now_ms, &machine_id, &recipe_id),
        FarmCommand::CollectMachineJob { machine_id } => {
            collect_machine_job(farm, catalog, now_ms, &machine_id)
        }
        FarmCommand::FeedAnimal {
            shelter_id,
            animal_slot,
        } => feed_animal(farm, catalog, now_ms, &shelter_id, &animal_slot),
        FarmCommand::CollectAnimalProduct {
            shelter_id,
            animal_slot,
        } => collect_animal_product(farm, catalog, &shelter_id, &animal_slot),
        FarmCommand::FulfillDeliveryOrder { order_id } => {
            fulfill_delivery_order(farm, catalog, &order_id)
        }
        FarmCommand::DiscardDeliveryOrder { order_id } => {
            discard_delivery_order(farm, catalog, &order_id)
        }
    };

    match result {
        Ok(mut events) => {
            if farm.level != previous_level {
                events.push(FarmEvent::LevelChanged { level: farm.level });
            }
            ensure_delivery_orders(farm, catalog);
            CommandOutcome {
                accepted: true,
                events,
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
    require_level(farm, crop.unlock_level)?;
    remove_inventory(farm, &[ItemStack::new(crop_id, 1)])?;
    farm.field_plots[plot_index].crop = Some(crate::PlantedCrop {
        item_id: crop_id.to_owned(),
        planted_at_ms: now_ms,
        ready_at_ms: now_ms
            + scaled_duration_ms(crop.reference_seconds, catalog.balance.time_scale),
    });
    Ok(vec![FarmEvent::CropPlanted {
        crop_id: crop_id.to_owned(),
    }])
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
    if planted.ready_at_ms > now_ms {
        return Err(CommandError::new("crop is not ready"));
    }
    let crop = catalog
        .crop(&planted.item_id)
        .ok_or_else(|| CommandError::new("unknown crop"))?;
    let outputs = [ItemStack::new(&planted.item_id, crop.harvest_quantity)];
    if !has_storage_room(farm, catalog, &outputs) {
        return Err(CommandError::new("storage is full"));
    }
    farm.field_plots[plot_index].crop = None;
    add_inventory(farm, &planted.item_id, crop.harvest_quantity);
    gain_xp(farm, catalog, crop.xp);
    Ok(vec![FarmEvent::CropHarvested {
        crop_id: planted.item_id,
        quantity: crop.harvest_quantity,
    }])
}

fn buy_structure(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    structure_kind: StructureKind,
    tile: Tile,
) -> Result<Vec<FarmEvent>, CommandError> {
    match &structure_kind {
        StructureKind::Bakery => {
            let def = catalog.machine(&MachineKind::Bakery).unwrap();
            buy_machine(
                farm,
                def.build_cost,
                def.unlock_level,
                MachineKind::Bakery,
                tile,
            )?;
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
    }
    Ok(vec![FarmEvent::StructureBuilt { structure_kind }])
}

fn move_structure(
    farm: &mut FarmState,
    target: StructureTarget,
    tile: Tile,
) -> Result<Vec<FarmEvent>, CommandError> {
    let structure_kind = match &target {
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
    };

    ensure_tile_can_hold_structure(
        farm,
        &tile,
        structure_footprint(&structure_kind),
        Some(&target),
    )?;

    match &target {
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
    if farm.machines[machine_index].kind != recipe.machine_kind {
        return Err(CommandError::new("recipe does not belong to this machine"));
    }
    let machine_def = catalog.machine(&recipe.machine_kind).unwrap();
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
    let recipe = catalog.recipe(&job.recipe_id).unwrap();
    if !has_storage_room(farm, catalog, &recipe.outputs) {
        return Err(CommandError::new("storage is full"));
    }
    farm.machines[machine_index].queue.remove(0);
    for output in &recipe.outputs {
        add_inventory(farm, &output.item_id, output.quantity);
    }
    gain_xp(farm, catalog, recipe.xp);
    Ok(vec![FarmEvent::MachineJobCollected {
        recipe_id: recipe.id.clone(),
    }])
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
    remove_inventory(farm, &[ItemStack::new(&def.feed_item_id, 1)])?;
    let animal = farm.shelters[shelter_index]
        .animals
        .iter_mut()
        .find(|animal| animal.id == animal_slot)
        .ok_or_else(|| CommandError::new("animal not found"))?;
    animal.state = AnimalState::Producing {
        fed_at_ms: now_ms,
        ready_at_ms: now_ms + scaled_duration_ms(def.reference_seconds, catalog.balance.time_scale),
    };
    Ok(vec![FarmEvent::AnimalFed {
        shelter_id: shelter_id.to_owned(),
    }])
}

fn collect_animal_product(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    shelter_id: &str,
    animal_slot: &str,
) -> Result<Vec<FarmEvent>, CommandError> {
    let shelter_index = find_shelter_index(farm, shelter_id)?;
    let def = catalog.shelter(&farm.shelters[shelter_index].kind).unwrap();
    let output = ItemStack::new(&def.product_item_id, 1);
    if !has_storage_room(farm, catalog, std::slice::from_ref(&output)) {
        return Err(CommandError::new("storage is full"));
    }
    let animal = farm.shelters[shelter_index]
        .animals
        .iter_mut()
        .find(|animal| animal.id == animal_slot)
        .ok_or_else(|| CommandError::new("animal not found"))?;
    if !matches!(animal.state, AnimalState::Ready) {
        return Err(CommandError::new("animal product is not ready"));
    }
    animal.state = AnimalState::Idle;
    add_inventory(farm, &output.item_id, output.quantity);
    gain_xp(farm, catalog, def.xp);
    Ok(vec![FarmEvent::AnimalProductCollected {
        item_id: output.item_id,
    }])
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
    if farm
        .field_plots
        .iter()
        .any(|plot| footprint_contains(tile, footprint, &plot.tile))
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
    Ok(())
}

fn structure_footprint(kind: &StructureKind) -> StructureFootprint {
    match kind {
        StructureKind::Bakery | StructureKind::ChickenCoop => StructureFootprint {
            width: 2,
            height: 2,
        },
        StructureKind::CowPasture => StructureFootprint {
            width: 3,
            height: 2,
        },
        StructureKind::FeedMill | StructureKind::DeliveryBoard => StructureFootprint {
            width: 1,
            height: 1,
        },
    }
}

fn machine_structure_kind(kind: &MachineKind) -> StructureKind {
    match kind {
        MachineKind::Bakery => StructureKind::Bakery,
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
