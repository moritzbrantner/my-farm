use my_farm_core::{
    AnimalState, CatalogDocument, FarmCommand, FarmEvent, ItemStack, MachineKind, ShelterKind,
    StructureKind, StructureTarget, Tile, add_inventory, apply_command, apply_elapsed,
    inventory_quantity, new_farm, scaled_duration_ms,
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
fn player_can_sweep_harvest_ready_wheat() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    for plot_id in ["plot-1", "plot-2", "plot-3"] {
        let planted = apply_command(
            &mut farm,
            &catalog,
            FarmCommand::PlantCrop {
                plot_id: plot_id.to_owned(),
                crop_id: "wheat".to_owned(),
            },
            0,
        );
        assert!(planted.accepted);
    }

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest {
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
            ],
        },
        scaled_duration_ms(120, catalog.balance.time_scale),
    );

    assert!(harvested.accepted);
    assert_eq!(inventory_quantity(&farm, "wheat"), 9);
    assert!(farm.field_plots[0].crop.is_none());
    assert!(farm.field_plots[1].crop.is_none());
    assert!(farm.field_plots[2].crop.is_none());
    assert_eq!(
        harvested.events,
        vec![
            FarmEvent::CropHarvested {
                crop_id: "wheat".to_owned(),
                quantity: 2,
            },
            FarmEvent::CropHarvested {
                crop_id: "wheat".to_owned(),
                quantity: 2,
            },
            FarmEvent::CropHarvested {
                crop_id: "wheat".to_owned(),
                quantity: 2,
            },
        ]
    );
}

#[test]
fn sweep_harvest_only_harvests_matching_ready_crop() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;

    for (plot_id, crop_id) in [
        ("plot-1", "wheat"),
        ("plot-2", "corn"),
        ("plot-3", "wheat"),
        ("plot-4", "wheat"),
    ] {
        let planted = apply_command(
            &mut farm,
            &catalog,
            FarmCommand::PlantCrop {
                plot_id: plot_id.to_owned(),
                crop_id: crop_id.to_owned(),
            },
            0,
        );
        assert!(planted.accepted);
    }
    farm.field_plots[3].crop.as_mut().unwrap().ready_at_ms =
        scaled_duration_ms(120, catalog.balance.time_scale) + 1;

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest {
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
                "plot-4".to_owned(),
            ],
        },
        scaled_duration_ms(120, catalog.balance.time_scale),
    );

    assert!(harvested.accepted);
    assert!(farm.field_plots[0].crop.is_none());
    assert!(farm.field_plots[1].crop.is_some());
    assert!(farm.field_plots[2].crop.is_none());
    assert!(farm.field_plots[3].crop.is_some());
    assert_eq!(inventory_quantity(&farm, "wheat"), 7);
    assert_eq!(inventory_quantity(&farm, "corn"), 2);
}

#[test]
fn sweep_harvest_harvests_until_silo_full() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    for plot_id in ["plot-1", "plot-2", "plot-3"] {
        let planted = apply_command(
            &mut farm,
            &catalog,
            FarmCommand::PlantCrop {
                plot_id: plot_id.to_owned(),
                crop_id: "wheat".to_owned(),
            },
            0,
        );
        assert!(planted.accepted);
    }
    farm.silo_capacity = 9;

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest {
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
            ],
        },
        scaled_duration_ms(120, catalog.balance.time_scale),
    );

    assert!(harvested.accepted);
    assert_eq!(inventory_quantity(&farm, "wheat"), 5);
    assert!(farm.field_plots[0].crop.is_none());
    assert!(farm.field_plots[1].crop.is_some());
    assert!(farm.field_plots[2].crop.is_some());
    assert_eq!(harvested.events.len(), 1);
}

#[test]
fn sweep_harvest_rejects_when_no_swept_plot_fits() {
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
        FarmCommand::SweepHarvest {
            plot_ids: vec!["plot-1".to_owned()],
        },
        scaled_duration_ms(120, catalog.balance.time_scale),
    );

    assert!(!harvested.accepted);
    assert_eq!(
        harvested.error.unwrap().message,
        "storage is full".to_owned()
    );
    assert!(farm.field_plots[0].crop.is_some());
}

#[test]
fn sweep_harvest_rejects_empty_selection() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest { plot_ids: vec![] },
        0,
    );

    assert!(!harvested.accepted);
    assert_eq!(
        harvested.error.unwrap().message,
        "no field plots selected".to_owned()
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

#[test]
fn player_can_move_built_structures_to_open_tiles() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::Bakery,
            tile: Tile::new(8, 2),
        },
        0,
    );
    assert!(built.accepted);
    let bakery_id = farm.machines[0].id.clone();

    let moved = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::Machine {
                id: bakery_id.clone(),
            },
            tile: Tile::new(12, 4),
        },
        0,
    );
    assert!(moved.accepted);
    assert_eq!(farm.machines[0].tile, Tile::new(12, 4));
    assert!(moved.events.contains(&FarmEvent::StructureMoved {
        target: StructureTarget::Machine { id: bakery_id },
        tile: Tile::new(12, 4),
    }));
}

#[test]
fn moving_structure_rejects_occupied_tiles() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;

    let built_bakery = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::Bakery,
            tile: Tile::new(8, 2),
        },
        0,
    );
    assert!(built_bakery.accepted);
    let built_coop = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ChickenCoop,
            tile: Tile::new(5, 7),
        },
        0,
    );
    assert!(built_coop.accepted);
    let bakery_id = farm.machines[0].id.clone();
    let shelter_tile = farm.shelters[0].tile.clone();

    let moved_to_field = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::Machine {
                id: bakery_id.clone(),
            },
            tile: Tile::new(0, 0),
        },
        0,
    );
    assert!(!moved_to_field.accepted);
    assert_eq!(moved_to_field.error.unwrap().message, "tile is occupied");

    let moved_to_structure = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::Machine { id: bakery_id },
            tile: shelter_tile,
        },
        0,
    );
    assert!(!moved_to_structure.accepted);
    assert_eq!(
        moved_to_structure.error.unwrap().message,
        "tile is occupied"
    );
}

#[test]
fn larger_structure_footprints_block_overlap_and_farm_edges() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 55;
    farm.level = 5;

    let built_bakery = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::Bakery,
            tile: Tile::new(8, 2),
        },
        0,
    );
    assert!(built_bakery.accepted);
    let bakery_id = farm.machines[0].id.clone();

    let overlapping_feed_mill = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FeedMill,
            tile: Tile::new(9, 3),
        },
        0,
    );
    assert!(!overlapping_feed_mill.accepted);
    assert_eq!(
        overlapping_feed_mill.error.unwrap().message,
        "tile is occupied"
    );

    let cow_pasture_over_edge = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::CowPasture,
            tile: Tile::new(16, 8),
        },
        0,
    );
    assert!(!cow_pasture_over_edge.accepted);
    assert_eq!(
        cow_pasture_over_edge.error.unwrap().message,
        "tile is outside the farm"
    );

    let moved_over_edge = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::Machine { id: bakery_id },
            tile: Tile::new(17, 4),
        },
        0,
    );
    assert!(!moved_over_edge.accepted);
    assert_eq!(
        moved_over_edge.error.unwrap().message,
        "tile is outside the farm"
    );
}

#[test]
fn delivery_board_uses_and_moves_its_tile() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 30;
    farm.level = 4;

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::DeliveryBoard,
            tile: Tile::new(3, 8),
        },
        0,
    );
    assert!(built.accepted);
    assert_eq!(farm.delivery_board_tile, Tile::new(3, 8));

    let moved = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::DeliveryBoard,
            tile: Tile::new(4, 8),
        },
        0,
    );
    assert!(moved.accepted);
    assert_eq!(farm.delivery_board_tile, Tile::new(4, 8));
}

#[test]
fn barn_and_silo_are_preplaced_and_movable() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    assert_eq!(farm.silo_tile, Tile::new(14, 2));
    assert_eq!(farm.barn_tile, Tile::new(16, 2));

    let moved_silo = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::Silo,
            tile: Tile::new(14, 3),
        },
        0,
    );
    assert!(moved_silo.accepted);
    assert_eq!(farm.silo_tile, Tile::new(14, 3));

    let moved_barn = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::Barn,
            tile: Tile::new(15, 3),
        },
        0,
    );
    assert!(moved_barn.accepted);
    assert_eq!(farm.barn_tile, Tile::new(15, 3));
}

#[test]
fn barn_and_silo_block_structure_placement() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;
    let silo_tile = farm.silo_tile.clone();

    let built_on_silo = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::Bakery,
            tile: silo_tile,
        },
        0,
    );

    assert!(!built_on_silo.accepted);
    assert_eq!(
        built_on_silo.error.unwrap().message,
        "tile is occupied".to_owned()
    );

    let bought_silo = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::Silo,
            tile: Tile::new(13, 2),
        },
        0,
    );

    assert!(!bought_silo.accepted);
    assert_eq!(
        bought_silo.error.unwrap().message,
        "structure already built".to_owned()
    );
}
