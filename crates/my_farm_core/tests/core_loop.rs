use my_farm_core::{
    AnimalState, CatalogDocument, FarmCommand, FarmEvent, ItemStack, MachineKind, ShelterKind,
    StructureKind, Tile, add_inventory, apply_command, apply_elapsed, inventory_quantity, new_farm,
    scaled_duration_ms,
};

#[test]
fn player_can_plant_and_harvest_wheat() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let planted = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-1".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(planted.accepted);
    assert_eq!(inventory_quantity(&farm, "wheat"), 5);

    let ready_at = scaled_duration_ms(120, catalog.balance.time_scale);
    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        ready_at,
    );
    assert!(harvested.accepted);
    assert_eq!(inventory_quantity(&farm, "wheat"), 7);
    assert!(harvested.events.contains(&FarmEvent::CropHarvested {
        crop_id: "wheat".to_owned(),
        quantity: 2,
    }));
}

#[test]
fn storage_capacity_blocks_harvest() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.silo_capacity = 6;

    let planted = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-1".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(planted.accepted);

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        scaled_duration_ms(120, catalog.balance.time_scale),
    );
    assert!(!harvested.accepted);
    assert_eq!(
        harvested.error.unwrap().message,
        "storage is full".to_owned()
    );
}

#[test]
fn machine_recipes_consume_inputs_and_produce_outputs() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::Bakery,
            tile: Tile::new(4, 1),
        },
        0,
    );
    assert!(built.accepted);
    let bakery_id = farm
        .machines
        .iter()
        .find(|machine| machine.kind == MachineKind::Bakery)
        .unwrap()
        .id
        .clone();

    let queued = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueRecipe {
            machine_id: bakery_id.clone(),
            recipe_id: "bread".to_owned(),
        },
        0,
    );
    assert!(queued.accepted);
    assert_eq!(inventory_quantity(&farm, "wheat"), 3);

    let collected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectMachineJob {
            machine_id: bakery_id,
        },
        scaled_duration_ms(300, catalog.balance.time_scale),
    );
    assert!(collected.accepted);
    assert_eq!(inventory_quantity(&farm, "bread"), 1);
}

#[test]
fn animals_convert_feed_into_products() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;
    add_inventory(&mut farm, "chicken_feed", 1);

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ChickenCoop,
            tile: Tile::new(6, 1),
        },
        0,
    );
    assert!(built.accepted);
    let shelter = farm
        .shelters
        .iter()
        .find(|shelter| shelter.kind == ShelterKind::ChickenCoop)
        .unwrap()
        .clone();
    let animal_id = shelter.animals[0].id.clone();

    let fed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::FeedAnimal {
            shelter_id: shelter.id.clone(),
            animal_slot: animal_id.clone(),
        },
        0,
    );
    assert!(fed.accepted);

    apply_elapsed(
        &mut farm,
        &catalog,
        scaled_duration_ms(1200, catalog.balance.time_scale),
    );
    assert!(matches!(
        farm.shelters[0].animals[0].state,
        AnimalState::Ready
    ));

    let collected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectAnimalProduct {
            shelter_id: shelter.id,
            animal_slot: animal_id,
        },
        scaled_duration_ms(1200, catalog.balance.time_scale),
    );
    assert!(collected.accepted);
    assert_eq!(inventory_quantity(&farm, "egg"), 1);
}

#[test]
fn delivery_orders_pay_rewards_and_regenerate_without_feed_requirements() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 30;
    farm.level = 4;
    add_inventory(&mut farm, "bread", 5);
    add_inventory(&mut farm, "egg", 5);

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::DeliveryBoard,
            tile: Tile::new(2, 6),
        },
        0,
    );
    assert!(built.accepted);
    assert_eq!(farm.delivery_orders.len(), 3);
    assert!(farm.delivery_orders.iter().all(|order| {
        order
            .requirements
            .iter()
            .all(|stack| stack.item_id != "chicken_feed" && stack.item_id != "cow_feed")
    }));

    let order_id = farm.delivery_orders[0].id.clone();
    let requirements = farm.delivery_orders[0].requirements.clone();
    for ItemStack { item_id, quantity } in requirements {
        add_inventory(&mut farm, &item_id, quantity);
    }
    let coins_before = farm.coins;
    let fulfilled = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::FulfillDeliveryOrder { order_id },
        0,
    );
    assert!(fulfilled.accepted);
    assert!(farm.coins > coins_before);
    assert_eq!(farm.delivery_orders.len(), 3);
}
