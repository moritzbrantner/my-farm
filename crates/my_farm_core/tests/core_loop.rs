use my_farm_core::{
    AnimalState, CatalogDocument, DEFAULT_RESIDENT_TASK_STEP_DURATION_MS, FarmCommand, FarmEvent,
    FarmState, FarmhouseUpgradeKind, ItemStack, MachineKind, OvenJobStatus, RecipeTarget, Room,
    RoomTile, ShelterKind, StorageKind, StructureKind, StructureTarget, SweepHarvestMode, Tile,
    ToolKind, ToolSourceRef, add_inventory, apply_command, apply_elapsed, farm_view,
    inventory_quantity, new_farm, scaled_duration_ms, update_level,
};

fn resident_task_ready_at(farm: &FarmState, resident_id: &str, task_index: usize) -> i64 {
    let task = &farm.resident_task_queues[resident_id][task_index];
    let mut ready_at = task.started_at_ms;
    for step in &task.steps {
        ready_at += step.duration_ms;
        if !is_resource_step(step) {
            return ready_at;
        }
    }
    task.ready_at_ms
}

fn resident_task_tail_ready_at(farm: &FarmState, resident_id: &str, task_index: usize) -> i64 {
    let task = &farm.resident_task_queues[resident_id][task_index];
    task.ready_at_ms
        + task
            .steps
            .iter()
            .skip(1)
            .map(|step| step.duration_ms)
            .sum::<i64>()
}

fn resident_task_step_ready_at<F>(
    farm: &FarmState,
    resident_id: &str,
    task_index: usize,
    predicate: F,
) -> i64
where
    F: Fn(&my_farm_core::ResidentTaskStep) -> bool,
{
    let task = &farm.resident_task_queues[resident_id][task_index];
    let mut ready_at = task.started_at_ms;
    for step in &task.steps {
        ready_at += step.duration_ms;
        if predicate(step) {
            return ready_at;
        }
    }
    panic!("resident task step not found");
}

fn expected_path_step_duration(path_len: usize) -> i64 {
    1_000 + path_len as i64 * 750
}

fn expected_step_duration(step: &my_farm_core::ResidentTaskStep) -> i64 {
    let work_duration = match step.work {
        my_farm_core::ResidentTaskStepWork::PickupItems { .. }
        | my_farm_core::ResidentTaskStepWork::PickupTools { .. }
        | my_farm_core::ResidentTaskStepWork::DepositInventory { .. }
        | my_farm_core::ResidentTaskStepWork::DepositItems { .. }
        | my_farm_core::ResidentTaskStepWork::ReturnTools { .. } => 0,
        _ => 1_000,
    };
    work_duration + step.walk_path.len() as i64 * 750
}

fn resident_task_work_step_count(task: &my_farm_core::ResidentTask) -> usize {
    task.steps
        .iter()
        .filter(|step| !is_resource_step(step))
        .count()
}

fn is_resource_step(step: &my_farm_core::ResidentTaskStep) -> bool {
    matches!(
        step.work,
        my_farm_core::ResidentTaskStepWork::PickupItems { .. }
            | my_farm_core::ResidentTaskStepWork::PickupTools { .. }
            | my_farm_core::ResidentTaskStepWork::DepositInventory { .. }
            | my_farm_core::ResidentTaskStepWork::DepositItems { .. }
            | my_farm_core::ResidentTaskStepWork::ReturnTools { .. }
    )
}

fn work_step(task: &my_farm_core::ResidentTask, index: usize) -> &my_farm_core::ResidentTaskStep {
    task.steps
        .iter()
        .filter(|step| !is_resource_step(step))
        .nth(index)
        .unwrap()
}

fn unlock_level(farm: &mut FarmState, catalog: &CatalogDocument, level: u32) {
    farm.xp = catalog
        .level_xp
        .get(level as usize)
        .copied()
        .unwrap_or_default();
    update_level(farm, catalog);
}

fn build_farm_shop(farm: &mut FarmState, catalog: &CatalogDocument, now_ms: i64) {
    unlock_level(farm, catalog, 2);
    let built = apply_command(
        farm,
        catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FarmShop,
            tile: Tile::new(3, 17),
        },
        now_ms,
    );
    assert!(built.accepted, "{:?}", built.error);
}

#[test]
fn planting_orders_prerequisite_pickups_by_shortest_route() {
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
    let task = &farm.resident_task_queues["woman"][0];
    assert_eq!(
        farm.resident_inventories["woman"].tools[&ToolKind::Hoe],
        1
    );
    assert_eq!(
        farm.resident_inventories["woman"].tool_sources[&ToolKind::Hoe],
        ToolSourceRef::Farmhouse
    );
    assert!(matches!(
        &task.steps[0].work,
        my_farm_core::ResidentTaskStepWork::PickupItems {
            source: my_farm_core::StorageSourceRef::Silo,
            items
        } if items == &[ItemStack::new("wheat", 1)]
    ));
    assert!(matches!(
        task.steps[1].work,
        my_farm_core::ResidentTaskStepWork::PlantCrop { .. }
    ));
}

#[test]
fn planting_can_fetch_crop_before_tool_when_that_route_is_shorter() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.resident_locations
        .insert("woman".to_owned(), Tile::new(14, 4));

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
    let task = &farm.resident_task_queues["woman"][0];
    assert_eq!(farm.resident_inventories["woman"].items["wheat"], 1);
    assert!(matches!(
        &task.steps[0].work,
        my_farm_core::ResidentTaskStepWork::PickupTools {
            source: ToolSourceRef::Farmhouse,
            tools
        } if tools == &[my_farm_core::ToolStack::new(ToolKind::Hoe, 1)]
    ));
    assert!(matches!(
        task.steps[1].work,
        my_farm_core::ResidentTaskStepWork::PlantCrop { .. }
    ));
}

#[test]
fn resident_future_tasks_can_be_reordered_authoritatively() {
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
        assert!(planted.accepted, "{:?}", planted.error);
    }
    let original_order = farm.resident_task_queues["woman"]
        .iter()
        .map(|task| task.id.clone())
        .collect::<Vec<_>>();
    let moved_task_id = original_order[2].clone();
    let before_task_id = original_order[1].clone();
    let old_moved_ready_at = farm.resident_task_queues["woman"][2].ready_at_ms;

    let reordered = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::ReorderResidentTask {
            resident_id: "woman".to_owned(),
            task_id: moved_task_id.clone(),
            before_task_id: Some(before_task_id.clone()),
        },
        0,
    );

    assert!(reordered.accepted, "{:?}", reordered.error);
    assert!(matches!(
        reordered.events.as_slice(),
        [FarmEvent::ResidentTaskReordered { resident_id, task_id, before_task_id: event_before }]
            if resident_id == "woman" && task_id == &moved_task_id && event_before.as_deref() == Some(before_task_id.as_str())
    ));
    let reordered_queue = &farm.resident_task_queues["woman"];
    assert_eq!(reordered_queue[0].id, original_order[0]);
    assert_eq!(reordered_queue[1].id, original_order[2]);
    assert_eq!(reordered_queue[2].id, original_order[1]);
    assert_ne!(reordered_queue[1].ready_at_ms, old_moved_ready_at);
    assert!(!reordered_queue[1].steps[0].walk_path.is_empty());
}

#[test]
fn resident_reorder_replans_future_pickups_with_route_aware_ordering() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);

    let stocked = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::StockFarmShop {
            item_id: "wheat".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(stocked.accepted, "{:?}", stocked.error);
    let planted_wheat = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-1".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(planted_wheat.accepted, "{:?}", planted_wheat.error);
    let planted_corn = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-2".to_owned(),
            crop_id: "corn".to_owned(),
        },
        0,
    );
    assert!(planted_corn.accepted, "{:?}", planted_corn.error);

    let original_order = farm.resident_task_queues["woman"]
        .iter()
        .map(|task| task.id.clone())
        .collect::<Vec<_>>();
    let reordered = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::ReorderResidentTask {
            resident_id: "woman".to_owned(),
            task_id: original_order[2].clone(),
            before_task_id: Some(original_order[1].clone()),
        },
        0,
    );

    assert!(reordered.accepted, "{:?}", reordered.error);
    let moved_task = &farm.resident_task_queues["woman"][1];
    assert!(matches!(
        &moved_task.steps[0].work,
        my_farm_core::ResidentTaskStepWork::PickupTools {
            source: ToolSourceRef::Farmhouse,
            tools
        } if tools == &[my_farm_core::ToolStack::new(ToolKind::Hoe, 1)]
    ));
    assert!(matches!(
        &moved_task.steps[1].work,
        my_farm_core::ResidentTaskStepWork::PickupItems {
            source: my_farm_core::StorageSourceRef::Silo,
            items
        } if items == &[ItemStack::new("corn", 1)]
    ));
    assert!(matches!(
        moved_task.steps[2].work,
        my_farm_core::ResidentTaskStepWork::PlantCrop { ref crop_id } if crop_id == "corn"
    ));
}

#[test]
fn resident_reorder_rejects_current_unknown_and_invalid_destinations() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    for plot_id in ["plot-1", "plot-2"] {
        let planted = apply_command(
            &mut farm,
            &catalog,
            FarmCommand::PlantCrop {
                plot_id: plot_id.to_owned(),
                crop_id: "wheat".to_owned(),
            },
            0,
        );
        assert!(planted.accepted, "{:?}", planted.error);
    }
    let current_id = farm.resident_task_queues["woman"][0].id.clone();
    let future_id = farm.resident_task_queues["woman"][1].id.clone();

    let current = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::ReorderResidentTask {
            resident_id: "woman".to_owned(),
            task_id: current_id,
            before_task_id: None,
        },
        0,
    );
    assert!(!current.accepted);
    assert_eq!(
        current.error.unwrap().message,
        "current resident task cannot be reordered"
    );

    let unknown_resident = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::ReorderResidentTask {
            resident_id: "unknown".to_owned(),
            task_id: future_id.clone(),
            before_task_id: None,
        },
        0,
    );
    assert!(!unknown_resident.accepted);
    assert_eq!(
        unknown_resident.error.unwrap().message,
        "resident not found"
    );

    let bad_destination = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::ReorderResidentTask {
            resident_id: "woman".to_owned(),
            task_id: future_id,
            before_task_id: Some("missing-task".to_owned()),
        },
        0,
    );
    assert!(!bad_destination.accepted);
    assert_eq!(
        bad_destination.error.unwrap().message,
        "destination resident task not found"
    );
}

#[test]
fn resident_reorder_failure_leaves_queue_unchanged() {
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
        assert!(planted.accepted, "{:?}", planted.error);
    }
    let original_queue = farm.resident_task_queues["woman"].clone();
    let moved_task_id = original_queue[2].id.clone();
    let before_task_id = original_queue[1].id.clone();
    farm.field_plots.retain(|plot| plot.id != "plot-3");

    let reordered = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::ReorderResidentTask {
            resident_id: "woman".to_owned(),
            task_id: moved_task_id,
            before_task_id: Some(before_task_id),
        },
        0,
    );

    assert!(!reordered.accepted);
    assert_eq!(
        reordered.error.unwrap().message,
        "work target is unreachable"
    );
    assert_eq!(farm.resident_task_queues["woman"], original_queue);
}

#[test]
fn farm_view_exposes_resident_task_preview_paths() {
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
    assert!(planted.accepted, "{:?}", planted.error);

    let view = farm_view(&farm, &catalog);
    let task = &view.resident_work["woman"].queue[0];
    assert!(!task.preview.path.is_empty());
    assert_eq!(
        task.preview.target.as_ref().unwrap().label,
        "Field Plot plot-1"
    );
}

#[test]
fn farm_shop_must_be_built_by_the_road_after_unlock() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let locked = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FarmShop,
            tile: Tile::new(3, 17),
        },
        0,
    );
    assert!(!locked.accepted);

    unlock_level(&mut farm, &catalog, 2);
    let inland = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FarmShop,
            tile: Tile::new(3, 16),
        },
        0,
    );
    assert!(!inland.accepted);

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FarmShop,
            tile: Tile::new(3, 17),
        },
        0,
    );
    assert!(built.accepted, "{:?}", built.error);
    let shop = farm.farm_shop.as_ref().unwrap();
    assert_eq!(shop.tile, Tile::new(3, 17));
    assert_eq!(shop.stock_capacity, 30);
    assert_eq!(shop.stock, Vec::<ItemStack>::new());
    assert!(shop.prices.is_empty());
    assert_eq!(shop.visit_count, 0);
    assert!(shop.current_sale.is_none());
    assert!(shop.current_rejection.is_none());
}

#[test]
fn farm_shop_build_spends_coins_and_rejects_duplicates() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    unlock_level(&mut farm, &catalog, 2);
    let starting_coins = farm.coins;

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FarmShop,
            tile: Tile::new(3, 17),
        },
        0,
    );
    assert!(built.accepted, "{:?}", built.error);
    assert_eq!(farm.coins, starting_coins - 25);

    let duplicate = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FarmShop,
            tile: Tile::new(6, 17),
        },
        0,
    );

    assert!(!duplicate.accepted);
    assert_eq!(duplicate.error.unwrap().message, "structure already built");
    assert_eq!(farm.farm_shop.as_ref().unwrap().tile, Tile::new(3, 17));
}

#[test]
fn farm_shop_moves_only_along_the_road_edge() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);
    let shop_id = farm.farm_shop.as_ref().unwrap().id.clone();

    let inland = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::FarmShop {
                id: shop_id.clone(),
            },
            tile: Tile::new(6, 16),
        },
        0,
    );
    assert!(!inland.accepted);
    assert_eq!(
        inland.error.unwrap().message,
        "farm shop must be placed by the road"
    );

    let moved = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::FarmShop { id: shop_id },
            tile: Tile::new(6, 17),
        },
        0,
    );
    assert!(moved.accepted, "{:?}", moved.error);
    assert_eq!(farm.farm_shop.as_ref().unwrap().tile, Tile::new(6, 17));
    assert_eq!(
        farm_view(&farm, &catalog).farm_shop.unwrap().tile,
        Tile::new(6, 17)
    );
}

#[test]
fn farm_shop_move_is_rejected_while_shop_work_is_queued() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);
    let shop_id = farm.farm_shop.as_ref().unwrap().id.clone();

    let stocked = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::StockFarmShop {
            item_id: "wheat".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(stocked.accepted, "{:?}", stocked.error);

    let moved = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::FarmShop { id: shop_id },
            tile: Tile::new(6, 17),
        },
        0,
    );

    assert!(!moved.accepted);
    assert_eq!(moved.error.unwrap().message, "farm shop is reserved");
    assert_eq!(farm.farm_shop.as_ref().unwrap().tile, Tile::new(3, 17));
}

#[test]
fn farm_shop_stocking_and_unstocking_are_resident_tasks() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);

    let stocked = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::StockFarmShop {
            item_id: "wheat".to_owned(),
            quantity: 2,
        },
        0,
    );
    assert!(stocked.accepted, "{:?}", stocked.error);
    let task = &farm.resident_task_queues["woman"][0];
    assert_eq!(task.kind, my_farm_core::ResidentTaskKind::ShopWork);
    assert!(matches!(
        &task.steps[0].work,
        my_farm_core::ResidentTaskStepWork::PickupItems {
            source: my_farm_core::StorageSourceRef::Silo,
            items
        } if items == &[ItemStack::new("wheat", 2)]
    ));
    assert!(matches!(
        &task.steps[1].work,
        my_farm_core::ResidentTaskStepWork::DepositShopStock { items }
            if items == &[ItemStack::new("wheat", 2)]
    ));

    let ready_at = resident_task_tail_ready_at(&farm, "woman", 0);
    let events = apply_elapsed(&mut farm, &catalog, ready_at);
    assert!(events.iter().any(|event| matches!(
        event,
        FarmEvent::FarmShopStocked { item_id, quantity }
            if item_id == "wheat" && *quantity == 2
    )));
    assert_eq!(
        farm.farm_shop.as_ref().unwrap().stock[0],
        ItemStack::new("wheat", 2)
    );

    let returned = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::UnstockFarmShop {
            item_id: "wheat".to_owned(),
            quantity: 1,
        },
        ready_at,
    );
    assert!(returned.accepted, "{:?}", returned.error);
    let task = &farm.resident_task_queues["woman"][0];
    assert!(matches!(
        &task.steps[0].work,
        my_farm_core::ResidentTaskStepWork::DepositItems { items, .. }
            if items == &[ItemStack::new("wheat", 1)]
    ));
    assert_eq!(farm.resident_inventories["woman"].items["wheat"], 1);
    assert_eq!(
        farm.farm_shop.as_ref().unwrap().stock[0],
        ItemStack::new("wheat", 1)
    );
}

#[test]
fn farm_shop_stocking_and_unstocking_validate_command_boundaries() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let no_shop = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::StockFarmShop {
            item_id: "wheat".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(!no_shop.accepted);
    assert_eq!(no_shop.error.unwrap().message, "farm shop not built");

    build_farm_shop(&mut farm, &catalog, 0);
    let zero_stock = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::StockFarmShop {
            item_id: "wheat".to_owned(),
            quantity: 0,
        },
        0,
    );
    assert!(!zero_stock.accepted);
    assert_eq!(
        zero_stock.error.unwrap().message,
        "quantity must be greater than zero"
    );

    unlock_level(&mut farm, &catalog, 3);
    add_inventory(&mut farm, "chicken_feed", 1);
    let not_sellable = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::StockFarmShop {
            item_id: "chicken_feed".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(!not_sellable.accepted);
    assert_eq!(
        not_sellable.error.unwrap().message,
        "item is not available to sell"
    );

    add_inventory(&mut farm, "wheat", 40);
    let too_much_stock = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::StockFarmShop {
            item_id: "wheat".to_owned(),
            quantity: 31,
        },
        0,
    );
    assert!(!too_much_stock.accepted);
    assert_eq!(
        too_much_stock.error.unwrap().message,
        "farm shop stock is full"
    );

    farm.farm_shop.as_mut().unwrap().stock = vec![ItemStack::new("wheat", 1)];
    farm.silo_capacity = 20;
    let zero_return = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::UnstockFarmShop {
            item_id: "wheat".to_owned(),
            quantity: 0,
        },
        0,
    );
    assert!(!zero_return.accepted);
    assert_eq!(
        zero_return.error.unwrap().message,
        "quantity must be greater than zero"
    );

    let unavailable_return = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::UnstockFarmShop {
            item_id: "wheat".to_owned(),
            quantity: 2,
        },
        0,
    );
    assert!(!unavailable_return.accepted);
    assert_eq!(
        unavailable_return.error.unwrap().message,
        "not enough available shop stock wheat"
    );

    farm.silo_capacity = 19;
    let full_storage_return = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::UnstockFarmShop {
            item_id: "wheat".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(!full_storage_return.accepted);
    assert_eq!(
        full_storage_return.error.unwrap().message,
        "storage is full"
    );
    assert!(farm.resident_task_queues["woman"].is_empty());
}

#[test]
fn farm_shop_limits_stock_to_ten_item_types() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);
    unlock_level(&mut farm, &catalog, 7);
    farm.farm_shop.as_mut().unwrap().stock = vec![
        ItemStack::new("bread", 1),
        ItemStack::new("carrot", 1),
        ItemStack::new("corn", 1),
        ItemStack::new("corn_bread", 1),
        ItemStack::new("egg", 1),
        ItemStack::new("milk", 1),
        ItemStack::new("potato", 1),
        ItemStack::new("soybean", 1),
        ItemStack::new("tomato", 1),
        ItemStack::new("wheat", 1),
    ];
    add_inventory(&mut farm, "potato_bread", 1);

    let too_many_types = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::StockFarmShop {
            item_id: "potato_bread".to_owned(),
            quantity: 1,
        },
        0,
    );

    assert!(!too_many_types.accepted);
    assert_eq!(
        too_many_types.error.unwrap().message,
        "farm shop item type limit reached"
    );
}

#[test]
fn farm_view_exposes_reserved_and_available_shop_stock() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);
    farm.farm_shop.as_mut().unwrap().stock = vec![ItemStack::new("wheat", 3)];

    let returned = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::UnstockFarmShop {
            item_id: "wheat".to_owned(),
            quantity: 2,
        },
        0,
    );
    assert!(returned.accepted, "{:?}", returned.error);

    let view = farm_view(&farm, &catalog);
    let shop = view.farm_shop.unwrap();
    let wheat = shop
        .stock
        .iter()
        .find(|item| item.item_id == "wheat")
        .unwrap();

    assert_eq!(wheat.quantity, 3);
    assert_eq!(wheat.reserved_quantity, Some(2));
    assert_eq!(wheat.available_quantity, Some(1));
    assert_eq!(shop.item_type_capacity, 10);
    assert_eq!(shop.prices[0].item_id, "wheat");
    assert_eq!(shop.prices[0].price, 2);
    assert_eq!(shop.prices[0].base_price, 2);
    assert_eq!(shop.prices[0].max_price, 4);
    assert_eq!(shop.prices[0].sale_chance_bps, 10_000);
}

#[test]
fn farm_shop_price_can_be_set_for_listed_items() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);
    farm.farm_shop.as_mut().unwrap().stock = vec![ItemStack::new("wheat", 2)];

    let priced = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SetFarmShopPrice {
            item_id: "wheat".to_owned(),
            price: 4,
        },
        0,
    );

    assert!(priced.accepted, "{:?}", priced.error);
    assert!(priced.events.iter().any(|event| matches!(
        event,
        FarmEvent::FarmShopPriceSet { item_id, price }
            if item_id == "wheat" && *price == 4
    )));
    assert_eq!(farm.farm_shop.as_ref().unwrap().prices["wheat"], 4);
    let view = farm_view(&farm, &catalog);
    let price = &view.farm_shop.unwrap().prices[0];
    assert_eq!(price.item_id, "wheat");
    assert_eq!(price.price, 4);
    assert_eq!(price.base_price, 2);
    assert_eq!(price.max_price, 4);
    assert_eq!(price.sale_chance_bps, 2_500);
}

#[test]
fn farm_shop_price_commands_validate_boundaries() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let no_shop = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SetFarmShopPrice {
            item_id: "wheat".to_owned(),
            price: 2,
        },
        0,
    );
    assert!(!no_shop.accepted);
    assert_eq!(no_shop.error.unwrap().message, "farm shop not built");

    build_farm_shop(&mut farm, &catalog, 0);
    let unlisted = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SetFarmShopPrice {
            item_id: "wheat".to_owned(),
            price: 2,
        },
        0,
    );
    assert!(!unlisted.accepted);
    assert_eq!(
        unlisted.error.unwrap().message,
        "item is not listed in the farm shop"
    );

    farm.farm_shop.as_mut().unwrap().stock = vec![ItemStack::new("wheat", 1)];
    let zero = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SetFarmShopPrice {
            item_id: "wheat".to_owned(),
            price: 0,
        },
        0,
    );
    assert!(!zero.accepted);
    assert_eq!(
        zero.error.unwrap().message,
        "price must be greater than zero"
    );

    let too_high = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SetFarmShopPrice {
            item_id: "wheat".to_owned(),
            price: 5,
        },
        0,
    );
    assert!(!too_high.accepted);
    assert_eq!(
        too_high.error.unwrap().message,
        "price cannot exceed twice the base price"
    );

    unlock_level(&mut farm, &catalog, 3);
    add_inventory(&mut farm, "chicken_feed", 1);
    farm.farm_shop.as_mut().unwrap().stock = vec![ItemStack::new("chicken_feed", 1)];
    let not_sellable = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SetFarmShopPrice {
            item_id: "chicken_feed".to_owned(),
            price: 1,
        },
        0,
    );
    assert!(!not_sellable.accepted);
    assert_eq!(
        not_sellable.error.unwrap().message,
        "item is not available to sell"
    );
}

#[test]
fn farm_shop_customer_sale_uses_market_sell_price_without_xp() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);
    farm.farm_shop.as_mut().unwrap().stock = vec![ItemStack::new("wheat", 2)];
    let visit_at = farm.farm_shop.as_ref().unwrap().next_customer_visit_at_ms;
    let starting_coins = farm.coins;
    let starting_xp = farm.xp;

    let events = apply_elapsed(&mut farm, &catalog, visit_at);

    assert!(events.iter().any(|event| matches!(
        event,
        FarmEvent::FarmShopSaleCompleted { item_id, quantity, coins_gained }
            if item_id == "wheat" && *quantity == 1 && *coins_gained == 2
    )));
    assert_eq!(farm.coins, starting_coins + 2);
    assert_eq!(farm.xp, starting_xp);
    assert_eq!(
        farm.farm_shop.as_ref().unwrap().stock[0],
        ItemStack::new("wheat", 1)
    );
    let view = farm_view(&farm, &catalog);
    let sale = view.farm_shop.unwrap().current_sale.unwrap();

    apply_elapsed(&mut farm, &catalog, sale.visible_until_ms);
    assert!(
        farm_view(&farm, &catalog)
            .farm_shop
            .unwrap()
            .current_sale
            .is_none()
    );
}

#[test]
fn farm_shop_customer_sale_uses_shop_price_without_xp() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);
    farm.farm_shop.as_mut().unwrap().stock = vec![ItemStack::new("wheat", 1)];
    let priced = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SetFarmShopPrice {
            item_id: "wheat".to_owned(),
            price: 1,
        },
        0,
    );
    assert!(priced.accepted, "{:?}", priced.error);
    let visit_at = farm.farm_shop.as_ref().unwrap().next_customer_visit_at_ms;
    let starting_coins = farm.coins;
    let starting_xp = farm.xp;

    let events = apply_elapsed(&mut farm, &catalog, visit_at);

    assert!(events.iter().any(|event| matches!(
        event,
        FarmEvent::FarmShopSaleCompleted { item_id, quantity, coins_gained }
            if item_id == "wheat" && *quantity == 1 && *coins_gained == 1
    )));
    assert_eq!(farm.coins, starting_coins + 1);
    assert_eq!(farm.xp, starting_xp);
    assert!(farm.farm_shop.as_ref().unwrap().stock.is_empty());
    assert!(
        !farm
            .farm_shop
            .as_ref()
            .unwrap()
            .prices
            .contains_key("wheat")
    );
}

#[test]
fn farm_shop_customer_rejection_preserves_stock_and_shows_feedback() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);
    farm.farm_shop.as_mut().unwrap().stock = vec![ItemStack::new("wheat", 1)];
    let priced = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SetFarmShopPrice {
            item_id: "wheat".to_owned(),
            price: 4,
        },
        0,
    );
    assert!(priced.accepted, "{:?}", priced.error);
    let rejection_visit_at = (0..100_000)
        .find(|visit_at| {
            let mut candidate = farm.clone();
            candidate
                .farm_shop
                .as_mut()
                .unwrap()
                .next_customer_visit_at_ms = *visit_at;
            apply_elapsed(&mut candidate, &catalog, *visit_at)
                .iter()
                .any(|event| matches!(event, FarmEvent::FarmShopVisitRejected { .. }))
        })
        .unwrap();
    farm.farm_shop.as_mut().unwrap().next_customer_visit_at_ms = rejection_visit_at;
    let starting_coins = farm.coins;

    let events = apply_elapsed(&mut farm, &catalog, rejection_visit_at);

    assert!(events.iter().any(|event| matches!(
        event,
        FarmEvent::FarmShopVisitRejected { item_id, shop_price, base_price, sale_chance_bps }
            if item_id == "wheat" && *shop_price == 4 && *base_price == 2 && *sale_chance_bps == 2_500
    )));
    assert_eq!(farm.coins, starting_coins);
    assert_eq!(
        farm.farm_shop.as_ref().unwrap().stock[0],
        ItemStack::new("wheat", 1)
    );
    let view = farm_view(&farm, &catalog);
    let rejection = view.farm_shop.unwrap().current_rejection.unwrap();
    assert_eq!(rejection.item_id, "wheat");
    assert_eq!(rejection.shop_price, 4);
    assert_eq!(rejection.sale_chance_bps, 2_500);

    apply_elapsed(&mut farm, &catalog, rejection.visible_until_ms);
    assert!(
        farm_view(&farm, &catalog)
            .farm_shop
            .unwrap()
            .current_rejection
            .is_none()
    );
}

#[test]
fn farm_shop_customer_visits_skip_empty_stock_and_reschedule_deterministically() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);
    let first_visit_at = farm.farm_shop.as_ref().unwrap().next_customer_visit_at_ms;

    let events = apply_elapsed(&mut farm, &catalog, first_visit_at);

    assert!(events.is_empty());
    let shop = farm.farm_shop.as_ref().unwrap();
    assert_eq!(shop.visit_count, 1);
    assert_eq!(shop.next_customer_visit_at_ms, first_visit_at + 70_000);
    assert!(shop.current_sale.is_none());

    let events = apply_elapsed(&mut farm, &catalog, first_visit_at + 70_000);

    assert!(events.is_empty());
    let shop = farm.farm_shop.as_ref().unwrap();
    assert_eq!(shop.visit_count, 2);
    assert_eq!(shop.next_customer_visit_at_ms, first_visit_at + 150_000);
    assert!(shop.current_sale.is_none());
}

#[test]
fn farm_shop_customer_sales_rotate_across_available_stocked_items() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);
    farm.farm_shop.as_mut().unwrap().stock =
        vec![ItemStack::new("wheat", 2), ItemStack::new("corn", 2)];
    let first_visit_at = farm.farm_shop.as_ref().unwrap().next_customer_visit_at_ms;

    let first_events = apply_elapsed(&mut farm, &catalog, first_visit_at);

    assert!(first_events.iter().any(|event| matches!(
        event,
        FarmEvent::FarmShopSaleCompleted { item_id, quantity, coins_gained }
            if item_id == "corn" && *quantity == 1 && *coins_gained == 4
    )));
    assert_eq!(
        farm.farm_shop
            .as_ref()
            .unwrap()
            .stock
            .iter()
            .find(|stock| stock.item_id == "corn")
            .unwrap()
            .quantity,
        1
    );

    let second_visit_at = farm.farm_shop.as_ref().unwrap().next_customer_visit_at_ms;
    let second_events = apply_elapsed(&mut farm, &catalog, second_visit_at);

    assert!(second_events.iter().any(|event| matches!(
        event,
        FarmEvent::FarmShopSaleCompleted { item_id, quantity, coins_gained }
            if item_id == "wheat" && *quantity == 1 && *coins_gained == 2
    )));
    assert_eq!(
        farm.farm_shop
            .as_ref()
            .unwrap()
            .stock
            .iter()
            .find(|stock| stock.item_id == "wheat")
            .unwrap()
            .quantity,
        1
    );
}

#[test]
fn farm_shop_customer_sales_ignore_reserved_shop_stock() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);
    farm.farm_shop.as_mut().unwrap().stock =
        vec![ItemStack::new("corn", 1), ItemStack::new("wheat", 1)];
    let reserved = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::UnstockFarmShop {
            item_id: "corn".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(reserved.accepted, "{:?}", reserved.error);
    farm.farm_shop.as_mut().unwrap().next_customer_visit_at_ms = 1;

    let events = apply_elapsed(&mut farm, &catalog, 1);

    assert!(events.iter().any(|event| matches!(
        event,
        FarmEvent::FarmShopSaleCompleted { item_id, quantity, coins_gained }
            if item_id == "wheat" && *quantity == 1 && *coins_gained == 2
    )));
    let shop = farm.farm_shop.as_ref().unwrap();
    assert_eq!(
        shop.stock
            .iter()
            .find(|stock| stock.item_id == "corn")
            .unwrap()
            .quantity,
        1
    );
    assert!(!shop.stock.iter().any(|stock| stock.item_id == "wheat"));
}

#[test]
fn farm_shop_customer_visits_run_after_resident_task_completion() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);
    let stocked = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::StockFarmShop {
            item_id: "wheat".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(stocked.accepted, "{:?}", stocked.error);
    let stock_ready_at = resident_task_tail_ready_at(&farm, "woman", 0);
    farm.farm_shop.as_mut().unwrap().next_customer_visit_at_ms = stock_ready_at;

    let events = apply_elapsed(&mut farm, &catalog, stock_ready_at);

    let stocked_event_index = events.iter().position(|event| {
        matches!(
            event,
            FarmEvent::FarmShopStocked { item_id, quantity } if item_id == "wheat" && *quantity == 1
        )
    });
    let sale_event_index = events.iter().position(|event| {
        matches!(
            event,
            FarmEvent::FarmShopSaleCompleted { item_id, quantity, coins_gained }
                if item_id == "wheat" && *quantity == 1 && *coins_gained == 2
        )
    });
    assert!(matches!(
        (stocked_event_index, sale_event_index),
        (Some(stocked_index), Some(sale_index)) if stocked_index < sale_index
    ));
    assert!(farm.farm_shop.as_ref().unwrap().stock.is_empty());
}

#[test]
fn old_save_without_farm_shop_loads_with_none() {
    let catalog = CatalogDocument::default_catalog();
    let farm = new_farm(0, &catalog);
    let mut value = serde_json::to_value(&farm).unwrap();
    value.as_object_mut().unwrap().remove("farm_shop");

    let loaded: FarmState = serde_json::from_value(value).unwrap();

    assert!(loaded.farm_shop.is_none());
}

#[test]
fn old_farm_shop_save_defaults_prices_and_rejection_window() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    build_farm_shop(&mut farm, &catalog, 0);
    farm.farm_shop.as_mut().unwrap().stock = vec![ItemStack::new("wheat", 1)];
    let mut value = serde_json::to_value(&farm).unwrap();
    let shop = value
        .as_object_mut()
        .unwrap()
        .get_mut("farm_shop")
        .unwrap()
        .as_object_mut()
        .unwrap();
    shop.remove("prices");
    shop.remove("current_rejection");

    let loaded: FarmState = serde_json::from_value(value).unwrap();

    assert!(loaded.farm_shop.as_ref().unwrap().prices.is_empty());
    assert!(
        loaded
            .farm_shop
            .as_ref()
            .unwrap()
            .current_rejection
            .is_none()
    );
    let view = farm_view(&loaded, &catalog);
    assert_eq!(view.farm_shop.unwrap().prices[0].price, 2);
}

#[test]
fn field_tools_choose_route_aware_source_and_return_to_original_source() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;
    farm.coins = 90;
    farm.field_plots[0].crop = Some(my_farm_core::PlantedCrop {
        item_id: "wheat".to_owned(),
        planted_at_ms: 0,
        ready_at_ms: 0,
    });

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(3, 2),
        },
        0,
    );
    assert!(built.accepted);

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        0,
    );

    assert!(harvested.accepted);
    let task = &farm.resident_task_queues["woman"][0];
    assert_eq!(
        farm.resident_inventories["woman"].tools[&ToolKind::Sickle],
        1
    );
    assert_eq!(
        farm.resident_inventories["woman"].tool_sources[&ToolKind::Sickle],
        ToolSourceRef::Farmhouse
    );
    assert!(matches!(
        &task.steps[0].work,
        my_farm_core::ResidentTaskStepWork::HarvestCrop { .. }
    ));
    assert!(matches!(
        &task.steps.last().unwrap().work,
        my_farm_core::ResidentTaskStepWork::ReturnTools {
            source: ToolSourceRef::Farmhouse,
            tools
        } if tools == &[my_farm_core::ToolStack::new(ToolKind::Sickle, 1)]
    ));

    let task_tail_ready_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, task_tail_ready_at);
    assert!(farm.resident_task_queues["woman"].is_empty());
    assert_eq!(
        farm.tool_shed.as_ref().unwrap().tool_stock[&ToolKind::Sickle],
        1
    );
    assert_eq!(farm.farmhouse_tool_stock[&ToolKind::Sickle], 1);
}

#[test]
fn field_tools_can_choose_tool_shed_when_it_is_the_shorter_route() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;
    farm.coins = 90;
    farm.resident_locations
        .insert("woman".to_owned(), Tile::new(3, 4));
    farm.field_plots[0].crop = Some(my_farm_core::PlantedCrop {
        item_id: "wheat".to_owned(),
        planted_at_ms: 0,
        ready_at_ms: 0,
    });

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(3, 2),
        },
        0,
    );
    assert!(built.accepted);
    let tool_shed_id = farm.tool_shed.as_ref().unwrap().id.clone();

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        0,
    );

    assert!(harvested.accepted);
    let task = &farm.resident_task_queues["woman"][0];
    assert!(matches!(
        &task.steps[0].work,
        my_farm_core::ResidentTaskStepWork::PickupTools {
            source: ToolSourceRef::ToolShed { id },
            tools
        } if id == &tool_shed_id && tools == &[my_farm_core::ToolStack::new(ToolKind::Sickle, 1)]
    ));
    assert!(matches!(
        &task.steps.last().unwrap().work,
        my_farm_core::ResidentTaskStepWork::ReturnTools {
            source: ToolSourceRef::ToolShed { id },
            tools
        } if id == &tool_shed_id && tools == &[my_farm_core::ToolStack::new(ToolKind::Sickle, 1)]
    ));
}

#[test]
fn field_tools_fall_back_to_farmhouse_when_no_tool_shed_can_supply_them() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.field_plots[0].crop = Some(my_farm_core::PlantedCrop {
        item_id: "wheat".to_owned(),
        planted_at_ms: 0,
        ready_at_ms: 0,
    });

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        0,
    );

    assert!(harvested.accepted);
    let task = &farm.resident_task_queues["woman"][0];
    assert!(matches!(
        &task.steps[0].work,
        my_farm_core::ResidentTaskStepWork::HarvestCrop { .. }
    ));
    assert_eq!(
        farm.resident_inventories["woman"].tools[&ToolKind::Sickle],
        1
    );
    assert_eq!(
        farm.resident_inventories["woman"].tool_sources[&ToolKind::Sickle],
        ToolSourceRef::Farmhouse
    );
    assert!(matches!(
        &task.steps.last().unwrap().work,
        my_farm_core::ResidentTaskStepWork::ReturnTools {
            source: ToolSourceRef::Farmhouse,
            tools
        } if tools == &[my_farm_core::ToolStack::new(ToolKind::Sickle, 1)]
    ));
}

#[test]
fn idle_resident_with_carried_inventory_gets_cleanup_task() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.farmhouse_tool_stock.insert(ToolKind::Sickle, 0);
    let inventory = farm.resident_inventories.get_mut("woman").unwrap();
    inventory.items.insert("wheat".to_owned(), 1);
    inventory.tools.insert(ToolKind::Sickle, 1);
    inventory
        .tool_sources
        .insert(ToolKind::Sickle, ToolSourceRef::Farmhouse);

    apply_elapsed(&mut farm, &catalog, 1);

    assert_eq!(farm.resident_task_queues["woman"].len(), 1);
    let task = &farm.resident_task_queues["woman"][0];
    assert!(matches!(
        task.steps[0].work,
        my_farm_core::ResidentTaskStepWork::DepositItems { .. }
    ));
    assert!(matches!(
        task.steps[1].work,
        my_farm_core::ResidentTaskStepWork::ReturnTools { .. }
    ));

    let task_tail_ready_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, task_tail_ready_at);

    assert!(farm.resident_task_queues["woman"].is_empty());
    assert!(farm.resident_inventories["woman"].items.is_empty());
    assert!(farm.resident_inventories["woman"].tools.is_empty());
    assert!(farm.resident_inventories["woman"].tool_sources.is_empty());
    assert_eq!(inventory_quantity(&farm, "wheat"), 7);
    assert_eq!(farm.farmhouse_tool_stock[&ToolKind::Sickle], 1);
}

#[test]
fn idle_cleanup_reports_storage_block_instead_of_overfilling() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.silo_capacity = my_farm_core::crop_storage_used(&farm, &catalog);
    farm.resident_inventories
        .get_mut("woman")
        .unwrap()
        .items
        .insert("wheat".to_owned(), 1);

    apply_elapsed(&mut farm, &catalog, 1);

    assert!(farm.resident_task_queues["woman"].is_empty());
    assert_eq!(farm.resident_inventories["woman"].items["wheat"], 1);
    let view = farm_view(&farm, &catalog);
    let block = &view.resident_cleanup_blocks.as_ref().unwrap()["woman"];
    assert_eq!(block.reason, "storage_full");
    assert!(matches!(
        block.destination,
        my_farm_core::StorageSourceRef::Silo
    ));
    assert_eq!(block.items, vec![ItemStack::new("wheat", 1)]);
}

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
    assert_eq!(inventory_quantity(&farm, "wheat"), 6);
    assert_eq!(
        farm_view(&farm, &catalog)
            .inventory
            .iter()
            .find(|item| item.item_id == "wheat")
            .and_then(|item| item.available_quantity),
        Some(5)
    );
    assert!(farm.field_plots[0].crop.is_none());
    assert_eq!(farm.resident_task_queues["woman"].len(), 1);
    let plant_ready_at = resident_task_ready_at(&farm, "woman", 0);

    apply_elapsed(&mut farm, &catalog, plant_ready_at - 1);
    assert!(farm.field_plots[0].crop.is_none());

    apply_elapsed(&mut farm, &catalog, plant_ready_at);
    assert_eq!(
        farm.field_plots[0].crop.as_ref().unwrap().item_id,
        "wheat".to_owned()
    );

    let ready_at = plant_ready_at + scaled_duration_ms(120, catalog.balance.time_scale);
    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        ready_at,
    );
    assert!(harvested.accepted);
    assert_eq!(inventory_quantity(&farm, "wheat"), 5);
    assert!(farm.field_plots[0].crop.is_some());
    assert!(farm.tool_shed.is_none());
    let task = &farm.resident_task_queues["woman"][0];
    assert!(matches!(
        task.steps
            .iter()
            .find(|step| matches!(
                step.work,
                my_farm_core::ResidentTaskStepWork::DepositItems { .. }
            ))
            .unwrap()
            .reserved_work_target,
        my_farm_core::ReservedWorkTarget::Silo
    ));
    assert!(matches!(
        task.steps.last().unwrap().work,
        my_farm_core::ResidentTaskStepWork::ReturnTools { .. }
    ));
    assert!(matches!(
        task.steps[0].work,
        my_farm_core::ResidentTaskStepWork::HarvestCrop { .. }
    ));
    assert!(task.ready_at_ms > task.started_at_ms);
    let harvest_ready_at = resident_task_ready_at(&farm, "woman", 0);

    apply_elapsed(&mut farm, &catalog, harvest_ready_at - 1);
    assert_eq!(inventory_quantity(&farm, "wheat"), 5);
    assert!(farm.field_plots[0].crop.is_some());

    apply_elapsed(&mut farm, &catalog, harvest_ready_at);
    assert_eq!(inventory_quantity(&farm, "wheat"), 5);
    assert!(farm.field_plots[0].crop.is_none());

    let deposit_duration = farm.resident_task_queues["woman"][0].steps[0].duration_ms;
    apply_elapsed(&mut farm, &catalog, harvest_ready_at + deposit_duration);
    assert_eq!(inventory_quantity(&farm, "wheat"), 7);
    assert!(farm.field_plots[0].crop.is_none());

    let return_duration = farm.resident_task_queues["woman"][0].steps[0].duration_ms;
    apply_elapsed(
        &mut farm,
        &catalog,
        harvest_ready_at + deposit_duration + return_duration,
    );
    assert!(farm.resident_task_queues["woman"].is_empty());
    assert!(harvested.events.is_empty());
}

#[test]
fn field_plot_tasks_snapshot_closest_tool_source_timing_when_queued() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;
    farm.coins = 90;

    let planted_before_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-1".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(planted_before_shed.accepted);
    assert_eq!(
        farm.resident_inventories["woman"].tool_sources[&ToolKind::Hoe],
        ToolSourceRef::Farmhouse
    );
    assert!(
        !farm.resident_task_queues["woman"][0]
            .steps
            .iter()
            .any(|step| {
                matches!(
                    step.work,
                    my_farm_core::ResidentTaskStepWork::PickupTools { .. }
                )
            })
    );

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(3, 2),
        },
        0,
    );
    assert!(built.accepted);

    let planted_after_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-2".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(planted_after_shed.accepted);
    let after_shed_work_duration = work_step(&farm.resident_task_queues["woman"][1], 0).duration_ms;
    assert!(
        !farm.resident_task_queues["woman"][1]
            .steps
            .iter()
            .any(|step| {
                matches!(
                    step.work,
                    my_farm_core::ResidentTaskStepWork::PickupTools { .. }
                )
            })
    );

    let tool_shed_id = farm.tool_shed.as_ref().unwrap().id.clone();
    let moved = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::ToolShed { id: tool_shed_id },
            tile: Tile::new(17, 17),
        },
        0,
    );
    assert!(moved.accepted);
    assert_eq!(
        work_step(&farm.resident_task_queues["woman"][1], 0).duration_ms,
        after_shed_work_duration
    );

    let planted_after_move = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-3".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(planted_after_move.accepted);
    assert!(
        !farm.resident_task_queues["woman"][2]
            .steps
            .iter()
            .any(|step| {
                matches!(
                    step.work,
                    my_farm_core::ResidentTaskStepWork::PickupTools { .. }
                )
            })
    );
}

#[test]
fn sweep_field_plot_tasks_fetch_tools_once_then_walk_between_plots() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;
    farm.coins = 45;

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(3, 2),
        },
        0,
    );
    assert!(built.accepted);

    let planted = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepPlant {
            crop_id: "wheat".to_owned(),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
            ],
        },
        0,
    );
    assert!(planted.accepted);
    let task = &farm.resident_task_queues["woman"][0];
    let durations = task
        .steps
        .iter()
        .map(|step| step.duration_ms)
        .collect::<Vec<_>>();
    let first_step_ready_at = resident_task_ready_at(&farm, "woman", 0);
    assert_eq!(
        durations,
        task.steps
            .iter()
            .map(expected_step_duration)
            .collect::<Vec<_>>()
    );
    assert_eq!(
        work_step(task, 1).walk_path,
        vec![work_step(task, 1).approach_tile.clone().unwrap()]
    );
    assert_eq!(
        work_step(task, 2).walk_path,
        vec![work_step(task, 2).approach_tile.clone().unwrap()]
    );

    apply_elapsed(&mut farm, &catalog, first_step_ready_at - 1);
    assert!(farm.field_plots[0].crop.is_none());

    apply_elapsed(&mut farm, &catalog, first_step_ready_at);
    assert!(farm.field_plots[0].crop.is_some());
    assert!(farm.field_plots[1].crop.is_none());
}

#[test]
fn harvest_tasks_use_distance_timing_before_and_after_tool_shed_placement() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;
    farm.coins = 45;

    for plot_index in 0..3 {
        farm.field_plots[plot_index].crop = Some(my_farm_core::PlantedCrop {
            item_id: "wheat".to_owned(),
            planted_at_ms: 0,
            ready_at_ms: 0,
        });
    }

    let harvested_before_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        0,
    );
    assert!(harvested_before_shed.accepted);
    let before_shed_duration = work_step(&farm.resident_task_queues["woman"][0], 0).duration_ms;
    assert_eq!(
        before_shed_duration,
        expected_path_step_duration(
            work_step(&farm.resident_task_queues["woman"][0], 0)
                .walk_path
                .len()
        )
    );

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(3, 2),
        },
        0,
    );
    assert!(built.accepted);

    let harvested_after_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-2".to_owned(),
        },
        0,
    );
    assert!(harvested_after_shed.accepted);
    assert!(
        work_step(&farm.resident_task_queues["woman"][1], 0).duration_ms < before_shed_duration
    );
}

#[test]
fn resident_paths_around_farmhouse_to_field_plot() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyFieldPlot {
            tile: Tile::new(8, 7),
        },
        0,
    );
    assert!(built.accepted);
    let plot_id = farm.field_plots.last().unwrap().id.clone();

    let planted = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id,
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(planted.accepted);
    let step = work_step(&farm.resident_task_queues["woman"][0], 0);
    let farmhouse_tiles = [
        Tile::new(8, 8),
        Tile::new(9, 8),
        Tile::new(8, 9),
        Tile::new(9, 9),
    ];
    assert!(
        step.walk_path
            .iter()
            .all(|tile| !farmhouse_tiles.contains(tile))
    );
    assert_eq!(step.approach_tile, Some(Tile::new(8, 7)));
    assert_eq!(
        step.duration_ms,
        expected_path_step_duration(step.walk_path.len())
    );
}

#[test]
fn field_plots_are_walkable_for_resident_paths() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    for tile in [Tile::new(7, 10), Tile::new(6, 10)] {
        let built = apply_command(&mut farm, &catalog, FarmCommand::BuyFieldPlot { tile }, 0);
        assert!(built.accepted);
    }
    let target_plot_id = farm.field_plots.last().unwrap().id.clone();

    let planted = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: target_plot_id,
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(planted.accepted);
    let step = work_step(&farm.resident_task_queues["woman"][0], 0);
    assert_eq!(step.approach_tile, Some(Tile::new(6, 10)));
}

#[test]
fn structure_work_uses_adjacent_approach_tile() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FeedMill,
            tile: Tile::new(4, 1),
        },
        0,
    );
    assert!(built.accepted);
    let feed_mill_id = farm.machines[0].id.clone();
    let queued = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueRecipe {
            machine_id: feed_mill_id.clone(),
            recipe_id: "chicken_feed".to_owned(),
        },
        0,
    );
    assert!(queued.accepted);
    let ready_at = scaled_duration_ms(300, catalog.balance.time_scale);

    let collected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectMachineJob {
            machine_id: feed_mill_id,
        },
        ready_at,
    );
    assert!(collected.accepted);
    let step = work_step(&farm.resident_task_queues["woman"][0], 0);
    let approach = step.approach_tile.clone().unwrap();
    assert_ne!(approach, Tile::new(4, 1));
    assert_eq!((approach.x - 4).abs() + (approach.y - 1).abs(), 1);
    assert!(!step.walk_path.contains(&Tile::new(4, 1)));
}

#[test]
fn unreachable_work_target_is_rejected_atomically() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.field_plots.push(my_farm_core::FieldPlot {
        id: "boxed-plot".to_owned(),
        tile: Tile::new(5, 5),
        crop: None,
    });
    for (index, tile) in [
        Tile::new(5, 4),
        Tile::new(4, 5),
        Tile::new(6, 5),
        Tile::new(5, 6),
    ]
    .into_iter()
    .enumerate()
    {
        farm.machines.push(my_farm_core::MachineState {
            id: format!("blocker-{index}"),
            kind: MachineKind::FeedMill,
            tile,
            queue: Vec::new(),
        });
    }
    let wheat_before = inventory_quantity(&farm, "wheat");

    let planted = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "boxed-plot".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );

    assert!(!planted.accepted);
    assert_eq!(planted.error.unwrap().message, "work target is unreachable");
    assert_eq!(inventory_quantity(&farm, "wheat"), wheat_before);
    assert!(farm.resident_task_queues["woman"].is_empty());
    assert!(farm.field_plots.last().unwrap().crop.is_none());
}

#[test]
fn completed_steps_update_resident_location() {
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
    let step = farm.resident_task_queues["woman"][0].steps[0].clone();

    apply_elapsed(&mut farm, &catalog, step.duration_ms);

    assert_eq!(
        farm.resident_locations.get("woman"),
        step.approach_tile.as_ref()
    );
}

#[test]
fn completed_steps_update_selected_man_location() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let selected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SelectResident {
            resident_id: "man".to_owned(),
        },
        0,
    );
    assert!(selected.accepted);

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
    assert!(farm.resident_task_queues["woman"].is_empty());
    let step = farm.resident_task_queues["man"][0].steps[0].clone();
    let task_tail_ready_at = resident_task_tail_ready_at(&farm, "man", 0);

    apply_elapsed(&mut farm, &catalog, step.duration_ms);

    assert_eq!(
        farm.resident_locations.get("man"),
        step.approach_tile.as_ref()
    );
    assert!(!farm.resident_task_queues["man"].is_empty());

    apply_elapsed(&mut farm, &catalog, task_tail_ready_at);
    assert!(farm.resident_task_queues["man"].is_empty());
    assert_ne!(farm.resident_locations.get("man"), Some(&Tile::new(9, 10)));
}

#[test]
fn completed_harvest_deposits_grain_then_returns_tools_to_tool_shed() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;
    farm.coins = 45;
    farm.field_plots[0].crop = Some(my_farm_core::PlantedCrop {
        item_id: "wheat".to_owned(),
        planted_at_ms: 0,
        ready_at_ms: 0,
    });

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(3, 2),
        },
        0,
    );
    assert!(built.accepted);
    let tool_shed_tile = farm.tool_shed.as_ref().unwrap().tile.clone();
    let tool_shed_id = farm.tool_shed.as_ref().unwrap().id.clone();

    let selected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SelectResident {
            resident_id: "man".to_owned(),
        },
        0,
    );
    assert!(selected.accepted);
    farm.resident_locations
        .insert("man".to_owned(), Tile::new(3, 4));

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        0,
    );
    assert!(harvested.accepted);
    let task = &farm.resident_task_queues["man"][0];
    assert!(matches!(
        task.steps
            .iter()
            .find(|step| matches!(
                step.work,
                my_farm_core::ResidentTaskStepWork::DepositItems { .. }
            ))
            .unwrap()
            .reserved_work_target,
        my_farm_core::ReservedWorkTarget::Silo
    ));
    assert!(matches!(
        task.steps.last().unwrap().reserved_work_target,
        my_farm_core::ReservedWorkTarget::ToolSource
    ));
    assert!(matches!(
        task.steps.last().unwrap().work,
        my_farm_core::ResidentTaskStepWork::ReturnTools {
            source: ToolSourceRef::ToolShed { ref id },
            ..
        } if id == &tool_shed_id
    ));
    let task_tail_ready_at = resident_task_tail_ready_at(&farm, "man", 0);
    let harvest_ready_at = resident_task_ready_at(&farm, "man", 0);
    let final_approach_tile = task.steps.last().unwrap().approach_tile.clone().unwrap();

    apply_elapsed(&mut farm, &catalog, harvest_ready_at);
    assert!(farm.field_plots[0].crop.is_none());
    assert_eq!(inventory_quantity(&farm, "wheat"), 6);

    let deposit_ready_at = farm.resident_task_queues["man"][0].ready_at_ms;
    apply_elapsed(&mut farm, &catalog, deposit_ready_at);
    assert_eq!(inventory_quantity(&farm, "wheat"), 8);

    apply_elapsed(&mut farm, &catalog, task_tail_ready_at);
    assert!(farm.resident_task_queues["man"].is_empty());
    assert_eq!(
        farm.resident_locations.get("man"),
        Some(&final_approach_tile)
    );
    assert_eq!(
        (final_approach_tile.x - tool_shed_tile.x).abs()
            + (final_approach_tile.y - tool_shed_tile.y).abs(),
        1
    );
}

#[test]
fn multi_step_tasks_route_from_previous_work_tile() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let planted = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepPlant {
            crop_id: "wheat".to_owned(),
            plot_ids: vec!["plot-1".to_owned(), "plot-2".to_owned()],
        },
        0,
    );
    assert!(planted.accepted);
    let task = &farm.resident_task_queues["woman"][0];

    assert_eq!(work_step(task, 0).approach_tile, Some(Tile::new(0, 0)));
    assert_eq!(work_step(task, 1).approach_tile, Some(Tile::new(1, 0)));
    assert_eq!(work_step(task, 1).walk_path, vec![Tile::new(1, 0)]);
}

#[test]
fn structure_placement_rejects_reserved_resident_path_tiles() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;
    farm.coins = 90;

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
    let reserved_path_tile = farm.resident_task_queues["woman"][0]
        .steps
        .iter()
        .flat_map(|step| step.walk_path.iter())
        .find(|tile| !farm.field_plots.iter().any(|plot| plot.tile == **tile))
        .cloned()
        .expect("non-field path tile");

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FeedMill,
            tile: reserved_path_tile,
        },
        0,
    );

    assert!(!built.accepted);
    assert_eq!(built.error.unwrap().message, "resident path is reserved");
}

#[test]
fn moving_reserved_structure_target_is_rejected() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FeedMill,
            tile: Tile::new(4, 1),
        },
        0,
    );
    assert!(built.accepted);
    let feed_mill_id = farm.machines[0].id.clone();
    let queued = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueRecipe {
            machine_id: feed_mill_id.clone(),
            recipe_id: "chicken_feed".to_owned(),
        },
        0,
    );
    assert!(queued.accepted);
    let ready_at = scaled_duration_ms(300, catalog.balance.time_scale);
    let collected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectMachineJob {
            machine_id: feed_mill_id.clone(),
        },
        ready_at,
    );
    assert!(collected.accepted);

    let moved = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::Machine { id: feed_mill_id },
            tile: Tile::new(10, 3),
        },
        ready_at,
    );

    assert!(!moved.accepted);
    assert_eq!(moved.error.unwrap().message, "machine is reserved");
    assert_eq!(farm.machines[0].tile, Tile::new(4, 1));
}

#[test]
fn machine_collection_tasks_snapshot_tool_source_timing_when_queued() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;
    farm.coins = 90;

    let built_machine = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FeedMill,
            tile: Tile::new(4, 1),
        },
        0,
    );
    assert!(built_machine.accepted);
    let feed_mill_id = farm.machines[0].id.clone();

    let queued_first = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueRecipe {
            machine_id: feed_mill_id.clone(),
            recipe_id: "chicken_feed".to_owned(),
        },
        0,
    );
    assert!(queued_first.accepted);
    let first_ready_at = scaled_duration_ms(300, catalog.balance.time_scale);

    let collected_before_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectMachineJob {
            machine_id: feed_mill_id.clone(),
        },
        first_ready_at,
    );
    assert!(collected_before_shed.accepted);
    let first_collect_duration = work_step(&farm.resident_task_queues["woman"][0], 0).duration_ms;
    assert_eq!(
        first_collect_duration,
        expected_path_step_duration(
            work_step(&farm.resident_task_queues["woman"][0], 0)
                .walk_path
                .len()
        )
    );

    let built_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(3, 1),
        },
        first_ready_at,
    );
    assert!(built_shed.accepted);
    assert_eq!(
        work_step(&farm.resident_task_queues["woman"][0], 0).duration_ms,
        first_collect_duration
    );

    let first_task_tail_ready_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, first_task_tail_ready_at);
    assert_eq!(inventory_quantity(&farm, "chicken_feed"), 3);

    let second_queued_at = first_task_tail_ready_at;
    let queued_second = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueRecipe {
            machine_id: feed_mill_id.clone(),
            recipe_id: "chicken_feed".to_owned(),
        },
        second_queued_at,
    );
    assert!(queued_second.accepted);
    let second_ready_at = second_queued_at + scaled_duration_ms(300, catalog.balance.time_scale);
    let collected_after_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectMachineJob {
            machine_id: feed_mill_id.clone(),
        },
        second_ready_at,
    );
    assert!(collected_after_shed.accepted);
    let second_collect_duration = work_step(&farm.resident_task_queues["woman"][0], 0).duration_ms;
    assert!(second_collect_duration < first_collect_duration);

    let tool_shed_id = farm.tool_shed.as_ref().unwrap().id.clone();
    let moved_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::ToolShed { id: tool_shed_id },
            tile: Tile::new(17, 17),
        },
        second_ready_at,
    );
    assert!(moved_shed.accepted);
    assert_eq!(
        work_step(&farm.resident_task_queues["woman"][0], 0).duration_ms,
        second_collect_duration
    );

    let second_collect_ready_at = resident_task_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, second_collect_ready_at - 1);
    assert_eq!(farm.machines[0].queue.len(), 1);
    apply_elapsed(&mut farm, &catalog, second_collect_ready_at);
    assert_eq!(farm.machines[0].queue.len(), 0);

    let third_queued_at = second_ready_at + second_collect_duration;
    let queued_third = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueRecipe {
            machine_id: feed_mill_id.clone(),
            recipe_id: "chicken_feed".to_owned(),
        },
        third_queued_at,
    );
    assert!(queued_third.accepted);
    let third_ready_at = third_queued_at + scaled_duration_ms(300, catalog.balance.time_scale);
    let collected_after_move = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectMachineJob {
            machine_id: feed_mill_id,
        },
        third_ready_at,
    );
    assert!(collected_after_move.accepted);
    assert!(work_step(&farm.resident_task_queues["woman"][0], 0).duration_ms > 0);
}

#[test]
fn feed_animal_tasks_snapshot_tool_source_timing_when_queued() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;
    farm.coins = 75;
    add_inventory(&mut farm, "chicken_feed", 3);

    let built_coop = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ChickenCoop,
            tile: Tile::new(6, 1),
        },
        0,
    );
    assert!(built_coop.accepted);
    let shelter_id = farm.shelters[0].id.clone();
    let animal_ids = farm.shelters[0]
        .animals
        .iter()
        .map(|animal| animal.id.clone())
        .collect::<Vec<_>>();

    let fed_before_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::FeedAnimal {
            shelter_id: shelter_id.clone(),
            animal_slot: animal_ids[0].clone(),
        },
        0,
    );
    assert!(fed_before_shed.accepted);
    let before_shed_duration = work_step(&farm.resident_task_queues["woman"][0], 0).duration_ms;
    assert_eq!(
        before_shed_duration,
        expected_path_step_duration(
            work_step(&farm.resident_task_queues["woman"][0], 0)
                .walk_path
                .len()
        )
    );

    let built_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(6, 4),
        },
        0,
    );
    assert!(built_shed.accepted);

    let fed_after_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::FeedAnimal {
            shelter_id: shelter_id.clone(),
            animal_slot: animal_ids[1].clone(),
        },
        0,
    );
    assert!(fed_after_shed.accepted);
    let after_shed_duration = work_step(&farm.resident_task_queues["woman"][1], 0).duration_ms;
    assert!(after_shed_duration > 0);

    let tool_shed_id = farm.tool_shed.as_ref().unwrap().id.clone();
    let moved_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::ToolShed { id: tool_shed_id },
            tile: Tile::new(17, 17),
        },
        0,
    );
    assert!(moved_shed.accepted);
    assert_eq!(
        work_step(&farm.resident_task_queues["woman"][1], 0).duration_ms,
        after_shed_duration
    );

    let fed_after_move = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::FeedAnimal {
            shelter_id: shelter_id.clone(),
            animal_slot: animal_ids[2].clone(),
        },
        0,
    );
    assert!(fed_after_move.accepted);
    assert!(work_step(&farm.resident_task_queues["woman"][2], 0).duration_ms > 0);

    let second_ready_at = resident_task_ready_at(&farm, "woman", 1);
    apply_elapsed(&mut farm, &catalog, second_ready_at - 1);
    assert!(matches!(
        farm.shelters[0].animals[1].state,
        AnimalState::Idle
    ));
    apply_elapsed(&mut farm, &catalog, second_ready_at);
    assert!(matches!(
        farm.shelters[0].animals[1].state,
        AnimalState::Producing { .. }
    ));
}

#[test]
fn animal_product_collection_tasks_snapshot_tool_source_timing_when_queued() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;
    farm.coins = 75;

    let built_coop = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ChickenCoop,
            tile: Tile::new(6, 1),
        },
        0,
    );
    assert!(built_coop.accepted);
    for animal in &mut farm.shelters[0].animals {
        animal.state = AnimalState::Ready;
    }
    let shelter_id = farm.shelters[0].id.clone();
    let animal_ids = farm.shelters[0]
        .animals
        .iter()
        .map(|animal| animal.id.clone())
        .collect::<Vec<_>>();

    let collected_before_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectAnimalProduct {
            shelter_id: shelter_id.clone(),
            animal_slot: animal_ids[0].clone(),
        },
        0,
    );
    assert!(collected_before_shed.accepted);
    let before_shed_duration = work_step(&farm.resident_task_queues["woman"][0], 0).duration_ms;
    assert_eq!(
        before_shed_duration,
        expected_path_step_duration(
            work_step(&farm.resident_task_queues["woman"][0], 0)
                .walk_path
                .len()
        )
    );

    let built_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(6, 4),
        },
        0,
    );
    assert!(built_shed.accepted);

    let collected_after_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectAnimalProduct {
            shelter_id: shelter_id.clone(),
            animal_slot: animal_ids[1].clone(),
        },
        0,
    );
    assert!(collected_after_shed.accepted);
    let after_shed_duration = work_step(&farm.resident_task_queues["woman"][1], 0).duration_ms;
    assert!(after_shed_duration < before_shed_duration);

    let tool_shed_id = farm.tool_shed.as_ref().unwrap().id.clone();
    let moved_shed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::ToolShed { id: tool_shed_id },
            tile: Tile::new(17, 17),
        },
        0,
    );
    assert!(moved_shed.accepted);
    assert_eq!(
        work_step(&farm.resident_task_queues["woman"][1], 0).duration_ms,
        after_shed_duration
    );

    let collected_after_move = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectAnimalProduct {
            shelter_id,
            animal_slot: animal_ids[2].clone(),
        },
        0,
    );
    assert!(collected_after_move.accepted);
    assert!(work_step(&farm.resident_task_queues["woman"][2], 0).duration_ms > 0);

    let final_ready_at = resident_task_tail_ready_at(&farm, "woman", 2);
    apply_elapsed(&mut farm, &catalog, final_ready_at);
    assert_eq!(inventory_quantity(&farm, "egg"), 3);
}

#[test]
fn catalog_and_new_farm_expose_unowned_farmhouse_oven_upgrade() {
    let catalog = CatalogDocument::default_catalog();
    let farm = new_farm(0, &catalog);
    let view = farm_view(&farm, &catalog);
    let oven = catalog
        .farmhouse_upgrade(FarmhouseUpgradeKind::Oven)
        .expect("oven farmhouse upgrade");

    assert_eq!(oven.name, "Oven");
    assert_eq!(oven.cost_coins, 40);
    assert_eq!(oven.unlock_level, 2);
    assert_eq!(oven.queue_limit, 2);
    assert!(farm.owned_farmhouse_upgrades.is_empty());
    assert!(view.owned_farmhouse_upgrades.is_empty());
    assert_eq!(view.unlocks[1].label, "Oven, bread, corn, and Farm Shop");
}

#[test]
fn catalog_and_new_farm_expose_starter_house_interior() {
    let catalog = CatalogDocument::default_catalog();
    let farm = new_farm(0, &catalog);
    let view = farm_view(&farm, &catalog);

    assert_eq!(
        catalog
            .decorations
            .iter()
            .map(|decoration| decoration.id.as_str())
            .collect::<Vec<_>>(),
        vec![
            "bed",
            "table",
            "chair",
            "sofa",
            "rug",
            "plant",
            "cabinet",
            "lamp",
            "kitchen_counter"
        ]
    );
    for decoration in &catalog.decorations {
        assert!(decoration.footprint.width > 0);
        assert!(decoration.footprint.height > 0);
    }

    assert_eq!(
        farm.house_interior
            .rooms
            .iter()
            .map(|room| room.name.as_str())
            .collect::<Vec<_>>(),
        vec!["Living Room", "Kitchen", "Bedroom"]
    );
    for room in &farm.house_interior.rooms {
        assert_eq!(room.width, 8);
        assert_eq!(room.height, 6);
        assert_eq!(room.tiles.len(), 48);
        assert_eq!(room.decoration_placements.len(), 3);
    }

    assert_room_placements(&farm.house_interior.rooms[0], &["sofa", "rug", "plant"]);
    assert_room_placements(
        &farm.house_interior.rooms[1],
        &["kitchen_counter", "table", "chair"],
    );
    assert_room_placements(&farm.house_interior.rooms[2], &["bed", "cabinet", "lamp"]);
    assert_eq!(view.house_interior, farm.house_interior);
}

#[test]
fn old_saves_without_house_interior_load_default_house_interior() {
    let catalog = CatalogDocument::default_catalog();
    let farm = new_farm(0, &catalog);
    let mut json = serde_json::to_value(&farm).unwrap();
    json.as_object_mut().unwrap().remove("house_interior");

    let restored: FarmState = serde_json::from_value(json).unwrap();

    assert_eq!(restored.house_interior, farm.house_interior);
}

#[test]
fn new_and_old_farms_start_without_tool_shed() {
    let catalog = CatalogDocument::default_catalog();
    let farm = new_farm(0, &catalog);
    let view = farm_view(&farm, &catalog);

    assert!(farm.tool_shed.is_none());
    assert!(view.tool_shed.is_none());

    let mut save_json = serde_json::to_value(&farm).unwrap();
    save_json.as_object_mut().unwrap().remove("tool_shed");

    let restored: FarmState = serde_json::from_value(save_json).unwrap();
    let restored_view = farm_view(&restored, &catalog);

    assert!(restored.tool_shed.is_none());
    assert!(restored_view.tool_shed.is_none());
}

#[test]
fn decoration_commands_require_level_five_and_edit_saved_placements_without_resident_tasks() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let locked = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlaceDecoration {
            room_id: "living_room".to_owned(),
            decoration_id: "chair".to_owned(),
            tile: RoomTile::new(0, 0),
        },
        0,
    );

    assert!(!locked.accepted);
    assert_eq!(locked.error.unwrap().message, "requires level 5");

    farm.level = 5;
    let placed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlaceDecoration {
            room_id: "living_room".to_owned(),
            decoration_id: "chair".to_owned(),
            tile: RoomTile::new(0, 0),
        },
        0,
    );

    assert!(placed.accepted, "{placed:?}");
    let placement_id = match &placed.events[0] {
        FarmEvent::DecorationPlaced { placement_id, .. } => placement_id.clone(),
        event => panic!("unexpected event: {event:?}"),
    };
    assert_eq!(farm.house_interior.rooms[0].decoration_placements.len(), 4);
    assert!(
        farm.resident_task_queues
            .values()
            .all(|queue| queue.is_empty())
    );

    let moved = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveDecoration {
            room_id: "living_room".to_owned(),
            placement_id: placement_id.clone(),
            tile: RoomTile::new(0, 1),
        },
        0,
    );

    assert_eq!(
        moved.events,
        vec![FarmEvent::DecorationMoved {
            room_id: "living_room".to_owned(),
            placement_id: placement_id.clone(),
            tile: RoomTile::new(0, 1),
        }]
    );
    assert!(
        farm.resident_task_queues
            .values()
            .all(|queue| queue.is_empty())
    );

    let removed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::RemoveDecoration {
            room_id: "living_room".to_owned(),
            placement_id: placement_id.clone(),
        },
        0,
    );

    assert_eq!(
        removed.events,
        vec![FarmEvent::DecorationRemoved {
            room_id: "living_room".to_owned(),
            placement_id,
        }]
    );
    assert_eq!(farm.house_interior.rooms[0].decoration_placements.len(), 3);
    assert!(catalog.decoration("chair").is_some());
}

#[test]
fn decoration_placement_rejects_unknown_ids_bounds_and_same_room_overlaps() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.level = 5;

    let unknown_room = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlaceDecoration {
            room_id: "attic".to_owned(),
            decoration_id: "chair".to_owned(),
            tile: RoomTile::new(0, 0),
        },
        0,
    );
    assert_eq!(unknown_room.error.unwrap().message, "room not found");

    let unknown_decoration = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlaceDecoration {
            room_id: "living_room".to_owned(),
            decoration_id: "unknown".to_owned(),
            tile: RoomTile::new(0, 0),
        },
        0,
    );
    assert_eq!(
        unknown_decoration.error.unwrap().message,
        "unknown decoration"
    );

    let out_of_bounds = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlaceDecoration {
            room_id: "living_room".to_owned(),
            decoration_id: "rug".to_owned(),
            tile: RoomTile::new(6, 5),
        },
        0,
    );
    assert_eq!(
        out_of_bounds.error.unwrap().message,
        "decoration placement is out of bounds"
    );

    let overlapping = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlaceDecoration {
            room_id: "living_room".to_owned(),
            decoration_id: "chair".to_owned(),
            tile: RoomTile::new(1, 1),
        },
        0,
    );
    assert_eq!(
        overlapping.error.unwrap().message,
        "decoration placement overlaps"
    );

    let placed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlaceDecoration {
            room_id: "living_room".to_owned(),
            decoration_id: "chair".to_owned(),
            tile: RoomTile::new(0, 0),
        },
        0,
    );
    let FarmEvent::DecorationPlaced { placement_id, .. } = &placed.events[0] else {
        panic!("unexpected event: {:?}", placed.events);
    };

    let move_out_of_bounds = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveDecoration {
            room_id: "living_room".to_owned(),
            placement_id: placement_id.clone(),
            tile: RoomTile::new(8, 0),
        },
        0,
    );
    assert_eq!(
        move_out_of_bounds.error.unwrap().message,
        "decoration placement is out of bounds"
    );

    let move_overlapping = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveDecoration {
            room_id: "living_room".to_owned(),
            placement_id: placement_id.clone(),
            tile: RoomTile::new(2, 1),
        },
        0,
    );
    assert_eq!(
        move_overlapping.error.unwrap().message,
        "decoration placement overlaps"
    );
}

#[test]
fn kitchen_oven_space_blocks_decoration_placement_before_and_after_purchase() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.level = 5;

    let blocked_before_purchase = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlaceDecoration {
            room_id: "kitchen".to_owned(),
            decoration_id: "chair".to_owned(),
            tile: RoomTile::new(3, 0),
        },
        0,
    );
    assert!(!blocked_before_purchase.accepted);
    assert_eq!(
        blocked_before_purchase.error.unwrap().message,
        "decoration placement overlaps"
    );

    farm.owned_farmhouse_upgrades
        .push(FarmhouseUpgradeKind::Oven);

    let blocked_after_purchase = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveDecoration {
            room_id: "kitchen".to_owned(),
            placement_id: "kitchen-chair".to_owned(),
            tile: RoomTile::new(4, 0),
        },
        0,
    );
    assert!(!blocked_after_purchase.accepted);
    assert_eq!(
        blocked_after_purchase.error.unwrap().message,
        "decoration placement overlaps"
    );
}

#[test]
fn players_can_place_unlimited_copies_of_starter_decorations_when_tiles_are_available() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.level = 5;

    let first = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlaceDecoration {
            room_id: "bedroom".to_owned(),
            decoration_id: "lamp".to_owned(),
            tile: RoomTile::new(0, 0),
        },
        0,
    );
    let second = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlaceDecoration {
            room_id: "bedroom".to_owned(),
            decoration_id: "lamp".to_owned(),
            tile: RoomTile::new(0, 1),
        },
        0,
    );

    assert!(first.accepted, "{first:?}");
    assert!(second.accepted, "{second:?}");
    assert_eq!(
        farm.house_interior.rooms[2]
            .decoration_placements
            .iter()
            .filter(|placement| placement.decoration_id == "lamp")
            .count(),
        3
    );
}

#[test]
fn player_can_buy_farmhouse_oven_once_when_level_and_coins_allow() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.level = 2;
    farm.coins = 40;

    let bought = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyFarmhouseUpgrade {
            upgrade_kind: FarmhouseUpgradeKind::Oven,
        },
        0,
    );

    assert!(bought.accepted);
    assert_eq!(farm.coins, 0);
    assert_eq!(
        farm.owned_farmhouse_upgrades,
        vec![FarmhouseUpgradeKind::Oven]
    );
    assert_eq!(
        bought.events,
        vec![FarmEvent::FarmhouseUpgradeBought {
            upgrade_kind: FarmhouseUpgradeKind::Oven,
        }]
    );

    let duplicate = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyFarmhouseUpgrade {
            upgrade_kind: FarmhouseUpgradeKind::Oven,
        },
        0,
    );
    assert!(!duplicate.accepted);
    assert_eq!(
        duplicate.error.unwrap().message,
        "farmhouse upgrade already owned"
    );
    assert_eq!(farm.coins, 0);
}

#[test]
fn buying_farmhouse_oven_requires_level_and_coins() {
    let catalog = CatalogDocument::default_catalog();
    let mut locked_farm = new_farm(0, &catalog);
    locked_farm.level = 1;
    locked_farm.coins = 180;

    let locked = apply_command(
        &mut locked_farm,
        &catalog,
        FarmCommand::BuyFarmhouseUpgrade {
            upgrade_kind: FarmhouseUpgradeKind::Oven,
        },
        0,
    );
    assert!(!locked.accepted);
    assert_eq!(locked.error.unwrap().message, "requires level 2");
    assert!(locked_farm.owned_farmhouse_upgrades.is_empty());
    assert_eq!(locked_farm.coins, 180);

    let mut poor_farm = new_farm(0, &catalog);
    poor_farm.level = 2;
    poor_farm.coins = 39;
    let unaffordable = apply_command(
        &mut poor_farm,
        &catalog,
        FarmCommand::BuyFarmhouseUpgrade {
            upgrade_kind: FarmhouseUpgradeKind::Oven,
        },
        0,
    );
    assert!(!unaffordable.accepted);
    assert_eq!(unaffordable.error.unwrap().message, "not enough coins");
    assert!(poor_farm.owned_farmhouse_upgrades.is_empty());
    assert_eq!(poor_farm.coins, 39);
}

#[test]
fn field_plot_tasks_reserve_targets_and_storage_until_completion() {
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

    let duplicate_plant = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-1".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(!duplicate_plant.accepted);
    assert_eq!(
        duplicate_plant.error.unwrap().message,
        "field plot is reserved"
    );

    let planted_at = resident_task_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, planted_at);
    let ready_at = planted_at + scaled_duration_ms(120, catalog.balance.time_scale);
    farm.silo_capacity = 10;
    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        ready_at,
    );
    assert!(harvested.accepted);

    let duplicate_harvest = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        ready_at,
    );
    assert!(!duplicate_harvest.accepted);
    assert_eq!(
        duplicate_harvest.error.unwrap().message,
        "field plot is reserved"
    );

    let bought = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "wheat".to_owned(),
            quantity: 1,
        },
        ready_at,
    );
    assert!(!bought.accepted);
    assert_eq!(bought.error.unwrap().message, "storage is full");
}

#[test]
fn sweep_field_work_queues_one_ordered_batch_per_selected_resident() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let planted = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepPlant {
            crop_id: "wheat".to_owned(),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
            ],
        },
        0,
    );
    assert!(planted.accepted);
    assert_eq!(farm.resident_task_queues["woman"].len(), 1);
    assert_eq!(
        resident_task_work_step_count(&farm.resident_task_queues["woman"][0]),
        3
    );
    assert!(farm.field_plots[0].crop.is_none());
    assert!(farm.field_plots[1].crop.is_none());

    let first_woman_ready_at = resident_task_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, first_woman_ready_at);
    assert!(farm.field_plots[0].crop.is_some());
    assert!(farm.field_plots[1].crop.is_none());
    assert_eq!(
        resident_task_work_step_count(&farm.resident_task_queues["woman"][0]),
        2
    );

    let selected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SelectResident {
            resident_id: "man".to_owned(),
        },
        first_woman_ready_at,
    );
    assert!(selected.accepted);
    farm.farmhouse_tool_stock.insert(ToolKind::Hoe, 2);
    let queued_for_man = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-4".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        first_woman_ready_at,
    );
    assert!(queued_for_man.accepted);
    assert_eq!(farm.resident_task_queues["woman"].len(), 1);
    assert_eq!(farm.resident_task_queues["man"].len(), 1);

    let second_woman_ready_at = resident_task_ready_at(&farm, "woman", 0);
    let first_man_ready_at = resident_task_ready_at(&farm, "man", 0);
    let first_man_tail_ready_at = resident_task_tail_ready_at(&farm, "man", 0);
    apply_elapsed(&mut farm, &catalog, second_woman_ready_at);
    assert!(farm.field_plots[1].crop.is_some());
    assert!(farm.field_plots[2].crop.is_none());
    assert!(farm.field_plots[3].crop.is_none());

    let final_woman_ready_at = resident_task_ready_at(&farm, "woman", 0);
    apply_elapsed(
        &mut farm,
        &catalog,
        final_woman_ready_at
            .max(first_man_ready_at)
            .max(first_man_tail_ready_at),
    );
    assert!(farm.field_plots[2].crop.is_some());
    assert!(farm.field_plots[3].crop.is_some());

    let ready_at = final_woman_ready_at + scaled_duration_ms(120, catalog.balance.time_scale);
    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest {
            harvest_mode: Some(SweepHarvestMode::MatchingCrop),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
            ],
        },
        ready_at,
    );
    assert!(harvested.accepted);
    assert_eq!(farm.resident_task_queues["man"].len(), 1);
    assert_eq!(
        resident_task_work_step_count(&farm.resident_task_queues["man"][0]),
        3
    );
    assert!(farm.field_plots[0].crop.is_some());

    let final_harvest_ready_at = resident_task_tail_ready_at(&farm, "man", 0);
    apply_elapsed(&mut farm, &catalog, final_harvest_ready_at);
    assert!(farm.field_plots[0].crop.is_none());
    assert!(farm.field_plots[1].crop.is_none());
    assert!(farm.field_plots[2].crop.is_none());
    assert!(farm.resident_task_queues["man"].is_empty());
    assert_eq!(inventory_quantity(&farm, "wheat"), 8);
}

#[test]
fn sweep_harvest_drains_immediate_prep_but_completes_plots_one_at_a_time() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    for plot in farm.field_plots.iter_mut().take(3) {
        plot.crop = Some(my_farm_core::PlantedCrop {
            item_id: "wheat".to_owned(),
            planted_at_ms: 0,
            ready_at_ms: 0,
        });
    }

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest {
            harvest_mode: Some(SweepHarvestMode::MatchingCrop),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
            ],
        },
        0,
    );

    assert!(harvested.accepted);
    let task = &farm.resident_task_queues["woman"][0];
    assert!(matches!(
        task.steps[0].work,
        my_farm_core::ResidentTaskStepWork::HarvestCrop { .. }
    ));
    assert!(task.ready_at_ms > task.started_at_ms);
    assert!(farm.field_plots[0].crop.is_some());
    assert!(farm.field_plots[1].crop.is_some());
    assert!(farm.field_plots[2].crop.is_some());

    let first_harvest_ready_at = resident_task_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, first_harvest_ready_at);

    assert!(farm.field_plots[0].crop.is_none());
    assert!(farm.field_plots[1].crop.is_some());
    assert!(farm.field_plots[2].crop.is_some());
    assert_eq!(
        resident_task_work_step_count(&farm.resident_task_queues["woman"][0]),
        2
    );
}

#[test]
fn busy_resident_accepts_more_field_work_without_overlapping_fifo_tasks() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let first = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-1".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(first.accepted);

    let second = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-2".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(second.accepted);
    assert_eq!(farm.resident_task_queues["woman"].len(), 2);

    let first_ready_at = resident_task_ready_at(&farm, "woman", 0);
    let first_tail_ready_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, first_ready_at);
    assert!(farm.field_plots[0].crop.is_some());
    assert!(farm.field_plots[1].crop.is_none());
    apply_elapsed(&mut farm, &catalog, first_tail_ready_at);
    assert_eq!(farm.resident_task_queues["woman"].len(), 1);

    let second_ready_at = resident_task_ready_at(&farm, "woman", 0);
    let second_tail_ready_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, second_ready_at);
    assert!(farm.field_plots[1].crop.is_some());
    apply_elapsed(&mut farm, &catalog, second_tail_ready_at);
    assert!(farm.resident_task_queues["woman"].is_empty());
}

#[test]
fn queued_sweep_harvest_keeps_matching_and_all_crops_validation() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;

    for (plot_id, crop_id) in [
        ("plot-1", "wheat"),
        ("plot-2", "corn"),
        ("plot-3", "wheat"),
        ("plot-4", "corn"),
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
    let planted_at = resident_task_tail_ready_at(&farm, "woman", 3);
    apply_elapsed(&mut farm, &catalog, planted_at);
    let ready_at = planted_at + scaled_duration_ms(300, catalog.balance.time_scale);
    farm.field_plots[3].crop.as_mut().unwrap().ready_at_ms = ready_at + 1;

    let matching = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest {
            harvest_mode: Some(SweepHarvestMode::MatchingCrop),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
                "plot-4".to_owned(),
            ],
        },
        ready_at,
    );
    assert!(matching.accepted);
    assert_eq!(
        resident_task_work_step_count(&farm.resident_task_queues["woman"][0]),
        2
    );

    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;
    for (plot_id, crop_id) in [
        ("plot-1", "wheat"),
        ("plot-2", "corn"),
        ("plot-3", "wheat"),
        ("plot-4", "corn"),
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
    let planted_at = resident_task_tail_ready_at(&farm, "woman", 3);
    apply_elapsed(&mut farm, &catalog, planted_at);
    let ready_at = planted_at + scaled_duration_ms(300, catalog.balance.time_scale);
    farm.field_plots[3].crop.as_mut().unwrap().ready_at_ms = ready_at + 1;

    let all_crops = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest {
            harvest_mode: Some(SweepHarvestMode::AllCrops),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
                "plot-4".to_owned(),
            ],
        },
        ready_at,
    );
    assert!(all_crops.accepted);
    assert_eq!(
        resident_task_work_step_count(&farm.resident_task_queues["woman"][0]),
        3
    );
}

#[test]
fn apply_elapsed_returns_field_task_completion_events() {
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

    let planted_at = resident_task_ready_at(&farm, "woman", 0);
    let events = apply_elapsed(&mut farm, &catalog, planted_at);
    assert_eq!(
        events,
        vec![FarmEvent::CropPlanted {
            crop_id: "wheat".to_owned(),
        }]
    );

    let ready_at = planted_at + scaled_duration_ms(120, catalog.balance.time_scale);
    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        ready_at,
    );
    assert!(harvested.accepted);

    let harvested_at = resident_task_ready_at(&farm, "woman", 0);
    let events = apply_elapsed(&mut farm, &catalog, harvested_at);
    assert_eq!(
        events,
        vec![FarmEvent::CropHarvested {
            crop_id: "wheat".to_owned(),
            quantity: 2,
        }]
    );
}

#[test]
fn crop_growth_timers_still_advance_independently_of_resident_tasks() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    farm.field_plots[0].crop = Some(my_farm_core::PlantedCrop {
        item_id: "wheat".to_owned(),
        planted_at_ms: 0,
        ready_at_ms: scaled_duration_ms(120, catalog.balance.time_scale),
    });

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        scaled_duration_ms(120, catalog.balance.time_scale),
    );
    assert!(harvested.accepted);

    let harvested_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, harvested_at);
    assert_eq!(inventory_quantity(&farm, "wheat"), 8);
}

#[test]
fn queued_harvest_completion_emits_crop_harvested_event() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    farm.field_plots[0].crop = Some(my_farm_core::PlantedCrop {
        item_id: "wheat".to_owned(),
        planted_at_ms: 0,
        ready_at_ms: 0,
    });

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        0,
    );
    assert!(harvested.accepted);

    let ready_at = resident_task_ready_at(&farm, "woman", 0);
    let events = apply_elapsed(&mut farm, &catalog, ready_at);
    assert!(events.contains(&FarmEvent::CropHarvested {
        crop_id: "wheat".to_owned(),
        quantity: 2,
    }));
}

#[test]
fn storage_capacity_blocks_harvest() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.silo_capacity = 6;
    farm.field_plots[0].crop = Some(my_farm_core::PlantedCrop {
        item_id: "wheat".to_owned(),
        planted_at_ms: 0,
        ready_at_ms: 0,
    });

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        0,
    );
    assert!(!harvested.accepted);
    assert_eq!(
        harvested.error.unwrap().message,
        "storage is full".to_owned()
    );
}

#[test]
fn player_can_upgrade_silo_storage() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    update_level(&mut farm, &catalog);

    let upgraded = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::UpgradeStorage {
            storage_kind: StorageKind::Silo,
        },
        0,
    );

    assert!(upgraded.accepted);
    assert_eq!(farm.coins, 120);
    assert_eq!(farm.silo_upgrade_tier, 1);
    assert_eq!(farm.silo_capacity, 60);
    assert_eq!(
        upgraded.events,
        vec![FarmEvent::StorageUpgraded {
            storage_kind: StorageKind::Silo,
            tier: 1,
            capacity: 60,
        }]
    );
}

#[test]
fn player_can_upgrade_barn_storage() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    update_level(&mut farm, &catalog);

    let upgraded = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::UpgradeStorage {
            storage_kind: StorageKind::Barn,
        },
        0,
    );

    assert!(upgraded.accepted);
    assert_eq!(farm.coins, 130);
    assert_eq!(farm.barn_upgrade_tier, 1);
    assert_eq!(farm.barn_capacity, 45);
    assert_eq!(
        upgraded.events,
        vec![FarmEvent::StorageUpgraded {
            storage_kind: StorageKind::Barn,
            tier: 1,
            capacity: 45,
        }]
    );
}

#[test]
fn storage_upgrade_requires_unlock_level() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let upgraded = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::UpgradeStorage {
            storage_kind: StorageKind::Silo,
        },
        0,
    );

    assert!(!upgraded.accepted);
    assert_eq!(upgraded.error.unwrap().message, "requires level 2");
    assert_eq!(farm.coins, 180);
    assert_eq!(farm.silo_upgrade_tier, 0);
    assert_eq!(farm.silo_capacity, 40);
}

#[test]
fn storage_upgrade_requires_coins() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.coins = 59;
    update_level(&mut farm, &catalog);

    let upgraded = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::UpgradeStorage {
            storage_kind: StorageKind::Silo,
        },
        0,
    );

    assert!(!upgraded.accepted);
    assert_eq!(upgraded.error.unwrap().message, "not enough coins");
    assert_eq!(farm.coins, 59);
    assert_eq!(farm.silo_upgrade_tier, 0);
    assert_eq!(farm.silo_capacity, 40);
}

#[test]
fn storage_upgrade_rejects_when_fully_upgraded() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 90;
    farm.coins = 1_000;
    farm.silo_upgrade_tier = 3;
    farm.silo_capacity = 115;
    update_level(&mut farm, &catalog);

    let upgraded = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::UpgradeStorage {
            storage_kind: StorageKind::Silo,
        },
        0,
    );

    assert!(!upgraded.accepted);
    assert_eq!(upgraded.error.unwrap().message, "storage fully upgraded");
    assert_eq!(farm.coins, 1_000);
    assert_eq!(farm.silo_upgrade_tier, 3);
    assert_eq!(farm.silo_capacity, 115);
}

#[test]
fn existing_state_defaults_storage_upgrade_tiers_to_zero() {
    let catalog = CatalogDocument::default_catalog();
    let farm = new_farm(0, &catalog);
    let mut save_json = serde_json::to_value(&farm).unwrap();
    let save = save_json.as_object_mut().unwrap();
    save.remove("silo_upgrade_tier");
    save.remove("barn_upgrade_tier");

    let restored: FarmState = serde_json::from_value(save_json).unwrap();

    assert_eq!(restored.silo_upgrade_tier, 0);
    assert_eq!(restored.barn_upgrade_tier, 0);
    assert_eq!(restored.silo_capacity, 40);
    assert_eq!(restored.barn_capacity, 30);
}

#[test]
fn player_can_sweep_harvest_ready_wheat() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    for plot_index in 0..3 {
        farm.field_plots[plot_index].crop = Some(my_farm_core::PlantedCrop {
            item_id: "wheat".to_owned(),
            planted_at_ms: 0,
            ready_at_ms: 0,
        });
    }

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest {
            harvest_mode: Some(SweepHarvestMode::MatchingCrop),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
            ],
        },
        0,
    );

    assert!(harvested.accepted);
    assert_eq!(farm.resident_task_queues["woman"].len(), 1);
    assert_eq!(
        resident_task_work_step_count(&farm.resident_task_queues["woman"][0]),
        3
    );
    assert_eq!(inventory_quantity(&farm, "wheat"), 6);
    assert!(farm.field_plots[0].crop.is_some());
    let harvested_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, harvested_at);
    assert_eq!(inventory_quantity(&farm, "wheat"), 12);
    assert!(farm.field_plots[0].crop.is_none());
    assert!(farm.field_plots[1].crop.is_none());
    assert!(farm.field_plots[2].crop.is_none());
    assert!(harvested.events.is_empty());
}

#[test]
fn player_can_buy_more_field_plots_on_open_tiles() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyFieldPlot {
            tile: Tile::new(4, 0),
        },
        0,
    );

    assert!(built.accepted);
    assert_eq!(farm.coins, 168);
    assert_eq!(farm.field_plots.len(), 7);
    assert_eq!(farm.field_plots[6].id, "plot-7");
    assert_eq!(farm.field_plots[6].tile, Tile::new(4, 0));
    assert_eq!(
        built.events,
        vec![FarmEvent::FieldPlotBuilt {
            plot_id: "plot-7".to_owned(),
        }]
    );
}

#[test]
fn buying_field_plot_rejects_occupied_tiles() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let built_on_existing_plot = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyFieldPlot {
            tile: Tile::new(0, 0),
        },
        0,
    );
    assert!(!built_on_existing_plot.accepted);
    assert_eq!(
        built_on_existing_plot.error.unwrap().message,
        "tile is occupied"
    );

    let built_on_storage = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyFieldPlot {
            tile: Tile::new(14, 2),
        },
        0,
    );
    assert!(!built_on_storage.accepted);
    assert_eq!(built_on_storage.error.unwrap().message, "tile is occupied");

    let built_on_storage_footprint = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyFieldPlot {
            tile: Tile::new(15, 3),
        },
        0,
    );
    assert!(!built_on_storage_footprint.accepted);
    assert_eq!(
        built_on_storage_footprint.error.unwrap().message,
        "tile is occupied"
    );

    let built_on_farm_house = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyFieldPlot {
            tile: Tile::new(8, 8),
        },
        0,
    );
    assert!(!built_on_farm_house.accepted);
    assert_eq!(
        built_on_farm_house.error.unwrap().message,
        "tile is occupied"
    );
}

#[test]
fn animal_shelter_footprints_occupy_their_full_area() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 55;
    update_level(&mut farm, &catalog);

    let chicken_coop = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ChickenCoop,
            tile: Tile::new(4, 4),
        },
        0,
    );
    assert!(chicken_coop.accepted);

    let field_on_chicken_coop_footprint = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyFieldPlot {
            tile: Tile::new(5, 6),
        },
        0,
    );
    assert!(!field_on_chicken_coop_footprint.accepted);
    assert_eq!(
        field_on_chicken_coop_footprint.error.unwrap().message,
        "tile is occupied"
    );

    let cow_pasture = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::CowPasture,
            tile: Tile::new(12, 12),
        },
        0,
    );
    assert!(cow_pasture.accepted);

    let field_on_cow_pasture_footprint = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyFieldPlot {
            tile: Tile::new(14, 14),
        },
        0,
    );
    assert!(!field_on_cow_pasture_footprint.accepted);
    assert_eq!(
        field_on_cow_pasture_footprint.error.unwrap().message,
        "tile is occupied"
    );
}

#[test]
fn player_can_sweep_plant_empty_field_plots() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let planted = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepPlant {
            crop_id: "wheat".to_owned(),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
            ],
        },
        0,
    );

    assert!(planted.accepted);
    assert_eq!(inventory_quantity(&farm, "wheat"), 6);
    assert_eq!(
        farm_view(&farm, &catalog)
            .inventory
            .iter()
            .find(|item| item.item_id == "wheat")
            .and_then(|item| item.available_quantity),
        Some(3)
    );
    assert!(farm.field_plots[0].crop.is_none());
    assert!(farm.field_plots[1].crop.is_none());
    assert!(farm.field_plots[2].crop.is_none());
    assert_eq!(farm.resident_task_queues["woman"].len(), 1);
    assert_eq!(
        resident_task_work_step_count(&farm.resident_task_queues["woman"][0]),
        3
    );
    assert!(planted.events.is_empty());

    let planted_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, planted_at);
    assert!(farm.field_plots[0].crop.is_some());
    assert!(farm.field_plots[1].crop.is_some());
    assert!(farm.field_plots[2].crop.is_some());
}

#[test]
fn sweep_plant_skips_planted_fields_and_stops_when_seed_runs_out() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;

    let planted_first = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-1".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(planted_first.accepted);
    let first_planted_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, first_planted_at);

    let planted = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepPlant {
            crop_id: "corn".to_owned(),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
                "plot-4".to_owned(),
                "plot-5".to_owned(),
            ],
        },
        0,
    );

    assert!(planted.accepted);
    assert_eq!(inventory_quantity(&farm, "corn"), 3);
    assert_eq!(
        farm_view(&farm, &catalog)
            .inventory
            .iter()
            .find(|item| item.item_id == "corn")
            .and_then(|item| item.available_quantity),
        Some(0)
    );
    assert_eq!(farm.resident_task_queues["woman"].len(), 1);
    assert_eq!(
        resident_task_work_step_count(&farm.resident_task_queues["woman"][0]),
        3
    );
    let planted_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, planted_at);
    assert_eq!(
        farm.field_plots[0].crop.as_ref().unwrap().item_id,
        "wheat".to_owned()
    );
    assert_eq!(
        farm.field_plots[1].crop.as_ref().unwrap().item_id,
        "corn".to_owned()
    );
    assert_eq!(
        farm.field_plots[2].crop.as_ref().unwrap().item_id,
        "corn".to_owned()
    );
    assert_eq!(
        farm.field_plots[3].crop.as_ref().unwrap().item_id,
        "corn".to_owned()
    );
    assert!(farm.field_plots[4].crop.is_none());
    assert!(planted.events.is_empty());
}

#[test]
fn sweep_plant_rejects_unknown_plot_without_partial_mutation() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let planted = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepPlant {
            crop_id: "wheat".to_owned(),
            plot_ids: vec!["plot-1".to_owned(), "missing-plot".to_owned()],
        },
        0,
    );

    assert!(!planted.accepted);
    assert_eq!(planted.error.unwrap().message, "field plot not found");
    assert!(farm.field_plots[0].crop.is_none());
    assert_eq!(inventory_quantity(&farm, "wheat"), 6);
}

#[test]
fn sweep_harvest_only_harvests_matching_ready_crop() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;

    for (plot_index, crop_id) in [(0, "wheat"), (1, "corn"), (2, "wheat"), (3, "wheat")] {
        farm.field_plots[plot_index].crop = Some(my_farm_core::PlantedCrop {
            item_id: crop_id.to_owned(),
            planted_at_ms: 0,
            ready_at_ms: 0,
        });
    }
    farm.field_plots[3].crop.as_mut().unwrap().ready_at_ms = 1;

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest {
            harvest_mode: Some(SweepHarvestMode::MatchingCrop),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
                "plot-4".to_owned(),
            ],
        },
        0,
    );

    assert!(harvested.accepted);
    assert_eq!(
        resident_task_work_step_count(&farm.resident_task_queues["woman"][0]),
        2
    );
    let harvested_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, harvested_at);
    assert!(farm.field_plots[0].crop.is_none());
    assert!(farm.field_plots[1].crop.is_some());
    assert!(farm.field_plots[2].crop.is_none());
    assert!(farm.field_plots[3].crop.is_some());
    assert_eq!(inventory_quantity(&farm, "wheat"), 10);
    assert_eq!(inventory_quantity(&farm, "corn"), 3);
}

#[test]
fn sweep_harvest_all_crops_harvests_mixed_ready_crops() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;

    for (plot_index, crop_id) in [(0, "wheat"), (1, "corn"), (2, "wheat"), (3, "corn")] {
        farm.field_plots[plot_index].crop = Some(my_farm_core::PlantedCrop {
            item_id: crop_id.to_owned(),
            planted_at_ms: 0,
            ready_at_ms: 0,
        });
    }
    farm.field_plots[3].crop.as_mut().unwrap().ready_at_ms = 1;

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest {
            harvest_mode: Some(SweepHarvestMode::AllCrops),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
                "plot-4".to_owned(),
            ],
        },
        0,
    );

    assert!(harvested.accepted);
    assert_eq!(
        resident_task_work_step_count(&farm.resident_task_queues["woman"][0]),
        3
    );
    let harvested_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, harvested_at);
    assert!(farm.field_plots[0].crop.is_none());
    assert!(farm.field_plots[1].crop.is_none());
    assert!(farm.field_plots[2].crop.is_none());
    assert!(farm.field_plots[3].crop.is_some());
    assert_eq!(inventory_quantity(&farm, "wheat"), 10);
    assert_eq!(inventory_quantity(&farm, "corn"), 5);
    assert!(harvested.events.is_empty());
}

#[test]
fn sweep_harvest_harvests_until_silo_full() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    for plot_index in 0..3 {
        farm.field_plots[plot_index].crop = Some(my_farm_core::PlantedCrop {
            item_id: "wheat".to_owned(),
            planted_at_ms: 0,
            ready_at_ms: 0,
        });
    }
    farm.inventory.insert("wheat".to_owned(), 3);
    farm.silo_capacity = 9;

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest {
            harvest_mode: Some(SweepHarvestMode::MatchingCrop),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
            ],
        },
        0,
    );

    assert!(harvested.accepted);
    assert_eq!(inventory_quantity(&farm, "wheat"), 3);
    assert_eq!(
        resident_task_work_step_count(&farm.resident_task_queues["woman"][0]),
        1
    );
    let harvested_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, harvested_at);
    assert_eq!(inventory_quantity(&farm, "wheat"), 5);
    assert!(farm.field_plots[0].crop.is_none());
    assert!(farm.field_plots[1].crop.is_some());
    assert!(farm.field_plots[2].crop.is_some());
    assert!(harvested.events.is_empty());
}

#[test]
fn sweep_harvest_rejects_when_no_swept_plot_fits() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.silo_capacity = 6;
    farm.field_plots[0].crop = Some(my_farm_core::PlantedCrop {
        item_id: "wheat".to_owned(),
        planted_at_ms: 0,
        ready_at_ms: 0,
    });

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest {
            harvest_mode: Some(SweepHarvestMode::MatchingCrop),
            plot_ids: vec!["plot-1".to_owned()],
        },
        0,
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
        FarmCommand::SweepHarvest {
            harvest_mode: Some(SweepHarvestMode::MatchingCrop),
            plot_ids: vec![],
        },
        0,
    );

    assert!(!harvested.accepted);
    assert_eq!(
        harvested.error.unwrap().message,
        "no field plots selected".to_owned()
    );
}

#[test]
fn crop_unlocks_grant_starter_stock_when_silo_has_room() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 13;
    update_level(&mut farm, &catalog);

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
    let planted_at = resident_task_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, planted_at);

    let harvested = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        planted_at + scaled_duration_ms(120, catalog.balance.time_scale),
    );

    assert!(harvested.accepted);
    let harvested_at = resident_task_ready_at(&farm, "woman", 0);
    let events = apply_elapsed(&mut farm, &catalog, harvested_at);
    assert!(events.contains(&FarmEvent::LevelChanged { level: 3 }));
    assert_eq!(inventory_quantity(&farm, "soybean"), 2);

    apply_elapsed(&mut farm, &catalog, harvested_at + 1);
    assert_eq!(inventory_quantity(&farm, "soybean"), 2);
}

#[test]
fn crop_unlock_starter_stock_retries_after_silo_space_opens() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 13;
    farm.silo_capacity = 11;
    update_level(&mut farm, &catalog);

    let planted_wheat = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-1".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(planted_wheat.accepted);
    let planted_wheat_at = resident_task_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, planted_wheat_at);

    let harvested_wheat = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
        planted_wheat_at + scaled_duration_ms(120, catalog.balance.time_scale),
    );
    assert!(harvested_wheat.accepted);
    let harvested_wheat_at = resident_task_ready_at(&farm, "woman", 0);
    let harvested_wheat_tail_at = resident_task_tail_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, harvested_wheat_at);
    assert_eq!(farm.level, 3);
    assert_eq!(inventory_quantity(&farm, "soybean"), 0);
    apply_elapsed(&mut farm, &catalog, harvested_wheat_tail_at);

    let planted_corn = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-2".to_owned(),
            crop_id: "corn".to_owned(),
        },
        harvested_wheat_tail_at + 1,
    );
    assert!(planted_corn.accepted);
    assert_eq!(inventory_quantity(&farm, "soybean"), 0);
    let corn_pickup_ready_at = resident_task_step_ready_at(&farm, "woman", 0, |step| {
        matches!(
            &step.work,
            my_farm_core::ResidentTaskStepWork::PickupItems { items, .. }
                if items == &[ItemStack::new("corn", 1)]
        )
    });
    apply_elapsed(&mut farm, &catalog, corn_pickup_ready_at);
    assert_eq!(inventory_quantity(&farm, "soybean"), 2);
}

#[test]
fn catalog_extends_late_crop_and_oven_progression() {
    let catalog = CatalogDocument::default_catalog();

    assert!(catalog.crop("soybean").is_some());
    assert!(catalog.crop("carrot").is_some());
    assert_eq!(catalog.crop("potato").unwrap().unlock_level, 6);
    assert_eq!(catalog.crop("tomato").unwrap().unlock_level, 7);
    assert_eq!(catalog.level_for_xp(140), 7);

    let carrot_cake = catalog.recipe("carrot_cake").unwrap();
    assert_eq!(carrot_cake.unlock_level, 6);
    assert!(
        carrot_cake
            .inputs
            .iter()
            .any(|stack| stack.item_id == "carrot")
    );
    assert!(
        carrot_cake
            .inputs
            .iter()
            .any(|stack| stack.item_id == "milk")
    );

    let tomato_tart = catalog.recipe("tomato_tart").unwrap();
    assert_eq!(tomato_tart.unlock_level, 7);
    assert!(
        tomato_tart
            .inputs
            .iter()
            .any(|stack| stack.item_id == "tomato")
    );
}

#[test]
fn machine_recipes_consume_inputs_and_produce_outputs() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FeedMill,
            tile: Tile::new(4, 1),
        },
        0,
    );
    assert!(built.accepted);
    let feed_mill_id = farm
        .machines
        .iter()
        .find(|machine| machine.kind == MachineKind::FeedMill)
        .unwrap()
        .id
        .clone();

    let queued = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueRecipe {
            machine_id: feed_mill_id.clone(),
            recipe_id: "chicken_feed".to_owned(),
        },
        0,
    );
    assert!(queued.accepted);
    assert_eq!(inventory_quantity(&farm, "wheat"), 4);
    assert_eq!(inventory_quantity(&farm, "corn"), 2);

    let collected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectMachineJob {
            machine_id: feed_mill_id,
        },
        scaled_duration_ms(300, catalog.balance.time_scale),
    );
    assert!(collected.accepted);
    assert_eq!(inventory_quantity(&farm, "chicken_feed"), 0);
    let collect_duration = farm.resident_task_queues["woman"][0].steps[0].duration_ms;
    let collect_tail_ready_at = resident_task_tail_ready_at(&farm, "woman", 0);

    apply_elapsed(
        &mut farm,
        &catalog,
        scaled_duration_ms(300, catalog.balance.time_scale) + collect_duration,
    );
    assert_eq!(inventory_quantity(&farm, "chicken_feed"), 0);
    apply_elapsed(&mut farm, &catalog, collect_tail_ready_at);
    assert_eq!(inventory_quantity(&farm, "chicken_feed"), 3);
}

#[test]
fn bread_family_recipes_target_the_farmhouse_oven() {
    let catalog = CatalogDocument::default_catalog();

    for recipe_id in [
        "bread",
        "corn_bread",
        "potato_bread",
        "carrot_cake",
        "tomato_tart",
    ] {
        let recipe = catalog.recipe(recipe_id).unwrap();
        assert_eq!(recipe.target, RecipeTarget::Oven);
    }

    assert_eq!(
        catalog.recipe("chicken_feed").unwrap().target,
        RecipeTarget::Machine {
            machine_kind: MachineKind::FeedMill
        }
    );
}

#[test]
fn queue_oven_recipe_creates_pending_job_and_start_task() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;

    let rejected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueOvenRecipe {
            recipe_id: "bread".to_owned(),
        },
        0,
    );
    assert!(!rejected.accepted);
    assert_eq!(rejected.error.unwrap().message, "oven is not owned");
    assert!(farm.oven.queue.is_empty());
    assert_eq!(inventory_quantity(&farm, "wheat"), 6);

    let bought = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyFarmhouseUpgrade {
            upgrade_kind: FarmhouseUpgradeKind::Oven,
        },
        0,
    );
    assert!(bought.accepted);

    let queued = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueOvenRecipe {
            recipe_id: "bread".to_owned(),
        },
        0,
    );
    assert!(queued.accepted);
    assert_eq!(inventory_quantity(&farm, "wheat"), 6);
    assert_eq!(
        farm_view(&farm, &catalog)
            .inventory
            .iter()
            .find(|item| item.item_id == "wheat")
            .and_then(|item| item.available_quantity),
        Some(3)
    );
    assert_eq!(farm.oven.queue.len(), 1);
    assert_eq!(farm.oven.queue[0].recipe_id, "bread");
    assert_eq!(farm.oven.queue[0].status, OvenJobStatus::PendingStart);
    assert_eq!(farm.oven.queue[0].started_at_ms, 0);
    assert_eq!(farm.oven.queue[0].ready_at_ms, 0);
    let task = &farm.resident_task_queues["woman"][0];
    assert!(task.steps.iter().any(|step| matches!(
        &step.work,
        my_farm_core::ResidentTaskStepWork::StartOvenRecipe { recipe_id, .. } if recipe_id == "bread"
    )));
    assert!(task.steps.iter().any(|step| {
        matches!(
            step.reserved_work_target,
            my_farm_core::ReservedWorkTarget::Oven
        ) && matches!(
            step.work,
            my_farm_core::ResidentTaskStepWork::StartOvenRecipe { .. }
        )
    }));
}

#[test]
fn pending_oven_job_reserves_capacity() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;
    add_inventory(&mut farm, "wheat", 6);
    farm.owned_farmhouse_upgrades
        .push(FarmhouseUpgradeKind::Oven);

    for _ in 0..2 {
        let queued = apply_command(
            &mut farm,
            &catalog,
            FarmCommand::QueueOvenRecipe {
                recipe_id: "bread".to_owned(),
            },
            0,
        );
        assert!(queued.accepted);
    }

    let rejected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueOvenRecipe {
            recipe_id: "bread".to_owned(),
        },
        0,
    );
    assert!(!rejected.accepted);
    assert_eq!(rejected.error.unwrap().message, "oven queue is full");
    assert_eq!(farm.oven.queue.len(), 2);
}

#[test]
fn pending_oven_job_cannot_be_collected() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;
    farm.owned_farmhouse_upgrades
        .push(FarmhouseUpgradeKind::Oven);

    let queued = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueOvenRecipe {
            recipe_id: "bread".to_owned(),
        },
        0,
    );
    assert!(queued.accepted);

    let rejected = apply_command(&mut farm, &catalog, FarmCommand::CollectOvenJob, 0);
    assert!(!rejected.accepted);
    assert_eq!(rejected.error.unwrap().message, "oven job has not started");
}

#[test]
fn start_oven_recipe_step_starts_baking() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;
    farm.owned_farmhouse_upgrades
        .push(FarmhouseUpgradeKind::Oven);

    let queued = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueOvenRecipe {
            recipe_id: "bread".to_owned(),
        },
        0,
    );
    assert!(queued.accepted);
    let job_id = farm.oven.queue[0].id.clone();
    let start_ready_at = resident_task_ready_at(&farm, "woman", 0);

    apply_elapsed(&mut farm, &catalog, start_ready_at - 1);
    assert_eq!(farm.oven.queue[0].status, OvenJobStatus::PendingStart);

    apply_elapsed(&mut farm, &catalog, start_ready_at);
    assert_eq!(farm.oven.queue[0].id, job_id);
    assert_eq!(farm.oven.queue[0].status, OvenJobStatus::Producing);
    assert_eq!(farm.oven.queue[0].started_at_ms, start_ready_at);
    assert_eq!(
        farm.oven.queue[0].ready_at_ms,
        start_ready_at + scaled_duration_ms(300, catalog.balance.time_scale)
    );
}

#[test]
fn oven_recipe_collection_still_uses_resident_work_and_respects_storage_capacity() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;
    farm.owned_farmhouse_upgrades
        .push(FarmhouseUpgradeKind::Oven);

    let queued = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueOvenRecipe {
            recipe_id: "bread".to_owned(),
        },
        0,
    );
    assert!(queued.accepted);
    let start_ready_at = resident_task_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, start_ready_at);
    let ready_at = farm.oven.queue[0].ready_at_ms;

    farm.barn_capacity = 0;
    let storage_full = apply_command(&mut farm, &catalog, FarmCommand::CollectOvenJob, ready_at);
    assert!(!storage_full.accepted);
    assert_eq!(storage_full.error.unwrap().message, "storage is full");
    assert_eq!(farm.oven.queue.len(), 1);

    farm.barn_capacity = 30;
    let collected = apply_command(&mut farm, &catalog, FarmCommand::CollectOvenJob, ready_at);
    assert!(collected.accepted);
    assert!(collected.events.is_empty());
    assert_eq!(farm.oven.queue.len(), 1);
    assert_eq!(inventory_quantity(&farm, "bread"), 0);
    let collect_task_index = farm.resident_task_queues["woman"].len() - 1;
    assert!(matches!(
        work_step(&farm.resident_task_queues["woman"][collect_task_index], 0).work,
        my_farm_core::ResidentTaskStepWork::CollectOvenJob { .. }
    ));
    let collect_ready_at = resident_task_ready_at(&farm, "woman", collect_task_index);

    let duplicate_collect =
        apply_command(&mut farm, &catalog, FarmCommand::CollectOvenJob, ready_at);
    assert!(!duplicate_collect.accepted);
    assert_eq!(duplicate_collect.error.unwrap().message, "oven is reserved");

    apply_elapsed(&mut farm, &catalog, collect_ready_at - 1);
    assert_eq!(farm.oven.queue.len(), 1);
    assert_eq!(inventory_quantity(&farm, "bread"), 0);

    let collect_tail_ready_at = resident_task_tail_ready_at(&farm, "woman", collect_task_index);
    let events = apply_elapsed(&mut farm, &catalog, collect_ready_at);
    assert_eq!(farm.oven.queue.len(), 0);
    assert_eq!(inventory_quantity(&farm, "bread"), 0);
    assert!(events.contains(&FarmEvent::MachineJobCollected {
        recipe_id: "bread".to_owned(),
    }));
    apply_elapsed(&mut farm, &catalog, collect_tail_ready_at);
    assert_eq!(inventory_quantity(&farm, "bread"), 1);
}

#[test]
fn feed_mill_still_uses_placed_machine_production() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FeedMill,
            tile: Tile::new(10, 3),
        },
        0,
    );
    assert!(built.accepted);
    let feed_mill_id = farm.machines[0].id.clone();

    let queued = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueRecipe {
            machine_id: feed_mill_id.clone(),
            recipe_id: "chicken_feed".to_owned(),
        },
        0,
    );
    assert!(queued.accepted);
    assert_eq!(farm.machines[0].queue.len(), 1);

    let oven_rejected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueRecipe {
            machine_id: feed_mill_id,
            recipe_id: "bread".to_owned(),
        },
        0,
    );
    assert!(!oven_rejected.accepted);
    assert_eq!(
        oven_rejected.error.unwrap().message,
        "recipe does not belong to this machine"
    );
}

#[test]
fn machine_collection_is_queued_and_reserves_job_and_barn_capacity() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FeedMill,
            tile: Tile::new(4, 1),
        },
        0,
    );
    assert!(built.accepted);
    let feed_mill_id = farm.machines[0].id.clone();

    let queued = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::QueueRecipe {
            machine_id: feed_mill_id.clone(),
            recipe_id: "chicken_feed".to_owned(),
        },
        0,
    );
    assert!(queued.accepted);
    let ready_at = scaled_duration_ms(300, catalog.balance.time_scale);

    let collected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectMachineJob {
            machine_id: feed_mill_id.clone(),
        },
        ready_at,
    );
    assert!(collected.accepted);
    assert!(collected.events.is_empty());
    assert_eq!(farm.machines[0].queue.len(), 1);
    assert_eq!(inventory_quantity(&farm, "chicken_feed"), 0);
    assert_eq!(farm.xp, 14);
    assert!(farm.tool_shed.is_none());
    assert!(matches!(
        farm.resident_task_queues["woman"][0]
            .steps
            .iter()
            .find(|step| matches!(
                step.work,
                my_farm_core::ResidentTaskStepWork::DepositItems { .. }
            ))
            .unwrap()
            .reserved_work_target,
        my_farm_core::ReservedWorkTarget::Barn
    ));
    let collect_duration = work_step(&farm.resident_task_queues["woman"][0], 0).duration_ms;
    assert_eq!(
        collect_duration,
        expected_path_step_duration(
            work_step(&farm.resident_task_queues["woman"][0], 0)
                .walk_path
                .len()
        )
    );

    let duplicate_collect = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectMachineJob {
            machine_id: feed_mill_id,
        },
        ready_at,
    );
    assert!(!duplicate_collect.accepted);
    assert_eq!(
        duplicate_collect.error.unwrap().message,
        "machine is reserved"
    );

    farm.barn_capacity = 1;
    let bought_feed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "chicken_feed".to_owned(),
            quantity: 1,
        },
        ready_at,
    );
    assert!(!bought_feed.accepted);
    assert_eq!(bought_feed.error.unwrap().message, "storage is full");

    apply_elapsed(&mut farm, &catalog, ready_at + collect_duration - 1);
    assert_eq!(farm.machines[0].queue.len(), 1);
    assert_eq!(inventory_quantity(&farm, "chicken_feed"), 0);

    let collect_tail_ready_at = resident_task_tail_ready_at(&farm, "woman", 0);
    let events = apply_elapsed(&mut farm, &catalog, ready_at + collect_duration);
    assert_eq!(farm.machines[0].queue.len(), 0);
    assert_eq!(inventory_quantity(&farm, "chicken_feed"), 0);
    assert_eq!(farm.xp, 16);
    assert!(events.contains(&FarmEvent::MachineJobCollected {
        recipe_id: "chicken_feed".to_owned(),
    }));
    apply_elapsed(&mut farm, &catalog, collect_tail_ready_at);
    assert_eq!(inventory_quantity(&farm, "chicken_feed"), 3);
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
    assert!(fed.events.is_empty());
    assert_eq!(inventory_quantity(&farm, "chicken_feed"), 1);
    assert_eq!(
        farm_view(&farm, &catalog)
            .inventory
            .iter()
            .find(|item| item.item_id == "chicken_feed")
            .and_then(|item| item.available_quantity),
        Some(0)
    );
    assert!(matches!(
        farm.shelters[0].animals[0].state,
        AnimalState::Idle
    ));
    assert!(farm.tool_shed.is_none());
    let feed_duration = work_step(&farm.resident_task_queues["woman"][0], 0).duration_ms;
    assert_eq!(
        feed_duration,
        expected_path_step_duration(
            work_step(&farm.resident_task_queues["woman"][0], 0)
                .walk_path
                .len()
        )
    );

    let duplicate_feed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::FeedAnimal {
            shelter_id: shelter.id.clone(),
            animal_slot: animal_id.clone(),
        },
        0,
    );
    assert!(!duplicate_feed.accepted);
    assert_eq!(duplicate_feed.error.unwrap().message, "animal is reserved");

    let feed_ready_at = resident_task_ready_at(&farm, "woman", 0);
    apply_elapsed(&mut farm, &catalog, feed_ready_at - 1);
    assert!(matches!(
        farm.shelters[0].animals[0].state,
        AnimalState::Idle
    ));

    apply_elapsed(
        &mut farm,
        &catalog,
        feed_ready_at + scaled_duration_ms(1200, catalog.balance.time_scale),
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
        feed_ready_at + scaled_duration_ms(1200, catalog.balance.time_scale),
    );
    assert!(collected.accepted);
    assert!(collected.events.is_empty());
    assert_eq!(inventory_quantity(&farm, "egg"), 0);
    assert!(farm.tool_shed.is_none());
    let collect_duration = work_step(&farm.resident_task_queues["woman"][0], 0).duration_ms;
    assert_eq!(
        collect_duration,
        expected_path_step_duration(
            work_step(&farm.resident_task_queues["woman"][0], 0)
                .walk_path
                .len()
        )
    );
    let collect_ready_at = resident_task_ready_at(&farm, "woman", 0);

    apply_elapsed(&mut farm, &catalog, collect_ready_at - 1);
    assert_eq!(inventory_quantity(&farm, "egg"), 0);

    let collect_tail_ready_at = resident_task_tail_ready_at(&farm, "woman", 0);
    let events = apply_elapsed(&mut farm, &catalog, collect_ready_at);
    assert_eq!(inventory_quantity(&farm, "egg"), 0);
    assert!(events.contains(&FarmEvent::AnimalProductCollected {
        item_id: "egg".to_owned(),
    }));
    assert!(matches!(
        farm.shelters[0].animals[0].state,
        AnimalState::Idle
    ));
    apply_elapsed(&mut farm, &catalog, collect_tail_ready_at);
    assert_eq!(inventory_quantity(&farm, "egg"), 1);
}

#[test]
fn animal_product_collection_reserves_slot_and_barn_capacity() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;

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
    let shelter_id = farm.shelters[0].id.clone();
    let animal_id = farm.shelters[0].animals[0].id.clone();
    farm.shelters[0].animals[0].state = AnimalState::Ready;
    farm.barn_capacity = 1;

    let collected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectAnimalProduct {
            shelter_id: shelter_id.clone(),
            animal_slot: animal_id.clone(),
        },
        0,
    );
    assert!(collected.accepted);
    assert!(matches!(
        farm.shelters[0].animals[0].state,
        AnimalState::Ready
    ));

    let duplicate_collect = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CollectAnimalProduct {
            shelter_id,
            animal_slot: animal_id,
        },
        0,
    );
    assert!(!duplicate_collect.accepted);
    assert_eq!(
        duplicate_collect.error.unwrap().message,
        "animal is reserved"
    );

    let bought_feed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "chicken_feed".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(!bought_feed.accepted);
    assert_eq!(bought_feed.error.unwrap().message, "storage is full");
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
fn player_can_discard_storage_inventory() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    add_inventory(&mut farm, "bread", 3);

    let discarded = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::DiscardInventory {
            item_id: "bread".to_owned(),
            quantity: 2,
        },
        0,
    );

    assert!(discarded.accepted);
    assert_eq!(inventory_quantity(&farm, "bread"), 1);
    assert!(discarded.events.contains(&FarmEvent::InventoryDiscarded {
        item_id: "bread".to_owned(),
        quantity: 2,
    }));

    let discarded_crop = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::DiscardInventory {
            item_id: "wheat".to_owned(),
            quantity: 1,
        },
        0,
    );

    assert!(discarded_crop.accepted);
    assert_eq!(inventory_quantity(&farm, "wheat"), 5);
    assert!(
        discarded_crop
            .events
            .contains(&FarmEvent::InventoryDiscarded {
                item_id: "wheat".to_owned(),
                quantity: 1,
            })
    );
}

#[test]
fn player_can_buy_unlocked_market_items() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let bought = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "wheat".to_owned(),
            quantity: 3,
        },
        0,
    );

    assert!(bought.accepted);
    assert_eq!(farm.coins, 168);
    assert_eq!(inventory_quantity(&farm, "wheat"), 9);
    assert!(bought.events.contains(&FarmEvent::MarketItemBought {
        item_id: "wheat".to_owned(),
        quantity: 3,
        coins_spent: 12,
    }));
}

#[test]
fn market_catalog_covers_default_items_with_valid_prices() {
    let catalog = CatalogDocument::default_catalog();

    let item_ids = catalog
        .items
        .iter()
        .map(|item| item.id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    let market_item_ids = catalog
        .market_items
        .iter()
        .map(|item| item.item_id.as_str())
        .collect::<std::collections::BTreeSet<_>>();

    assert_eq!(market_item_ids, item_ids);
    for market_item in &catalog.market_items {
        assert!(
            market_item.buy_price.is_some() || market_item.sell_price.is_some(),
            "{} should be buyable or sellable",
            market_item.item_id
        );
        if let (Some(buy_price), Some(sell_price)) = (market_item.buy_price, market_item.sell_price)
        {
            assert!(
                buy_price > sell_price,
                "{} buy price should be higher than sell price",
                market_item.item_id
            );
        }
    }
}

#[test]
fn player_can_sell_unlocked_market_items() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    let coins_before = farm.coins;

    let sold = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SellMarketItem {
            item_id: "wheat".to_owned(),
            quantity: 2,
        },
        0,
    );

    assert!(sold.accepted);
    assert_eq!(farm.coins, coins_before + 4);
    assert_eq!(inventory_quantity(&farm, "wheat"), 4);
    assert!(sold.events.contains(&FarmEvent::MarketItemSold {
        item_id: "wheat".to_owned(),
        quantity: 2,
        coins_gained: 4,
    }));
}

#[test]
fn market_commands_reject_invalid_buys() {
    let catalog = CatalogDocument::default_catalog();

    let mut farm = new_farm(0, &catalog);
    let unknown = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "stone".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(!unknown.accepted);
    assert_eq!(unknown.error.unwrap().message, "unknown market item");

    let mut farm = new_farm(0, &catalog);
    let zero = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "wheat".to_owned(),
            quantity: 0,
        },
        0,
    );
    assert!(!zero.accepted);
    assert_eq!(
        zero.error.unwrap().message,
        "quantity must be greater than zero"
    );

    let mut farm = new_farm(0, &catalog);
    let locked = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "corn".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(!locked.accepted);
    assert_eq!(locked.error.unwrap().message, "requires level 2");

    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    update_level(&mut farm, &catalog);
    let unavailable = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "bread".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(!unavailable.accepted);
    assert_eq!(
        unavailable.error.unwrap().message,
        "item is not available to buy"
    );

    let mut farm = new_farm(0, &catalog);
    farm.coins = 3;
    let insufficient_coins = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "wheat".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(!insufficient_coins.accepted);
    assert_eq!(
        insufficient_coins.error.unwrap().message,
        "not enough coins"
    );

    let mut farm = new_farm(0, &catalog);
    farm.silo_capacity = 8;
    let full_silo = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "wheat".to_owned(),
            quantity: 3,
        },
        0,
    );
    assert!(!full_silo.accepted);
    assert_eq!(full_silo.error.unwrap().message, "storage is full");

    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    update_level(&mut farm, &catalog);
    farm.barn_capacity = 0;
    let full_barn = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "chicken_feed".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(!full_barn.accepted);
    assert_eq!(full_barn.error.unwrap().message, "storage is full");
}

#[test]
fn market_commands_reject_invalid_sells() {
    let catalog = CatalogDocument::default_catalog();

    let mut farm = new_farm(0, &catalog);
    let unknown = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SellMarketItem {
            item_id: "stone".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(!unknown.accepted);
    assert_eq!(unknown.error.unwrap().message, "unknown market item");

    let mut farm = new_farm(0, &catalog);
    let zero = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SellMarketItem {
            item_id: "wheat".to_owned(),
            quantity: 0,
        },
        0,
    );
    assert!(!zero.accepted);
    assert_eq!(
        zero.error.unwrap().message,
        "quantity must be greater than zero"
    );

    let mut farm = new_farm(0, &catalog);
    let locked = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SellMarketItem {
            item_id: "corn".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(!locked.accepted);
    assert_eq!(locked.error.unwrap().message, "requires level 2");

    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    update_level(&mut farm, &catalog);
    add_inventory(&mut farm, "chicken_feed", 1);
    let unavailable = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SellMarketItem {
            item_id: "chicken_feed".to_owned(),
            quantity: 1,
        },
        0,
    );
    assert!(!unavailable.accepted);
    assert_eq!(
        unavailable.error.unwrap().message,
        "item is not available to sell"
    );

    let mut farm = new_farm(0, &catalog);
    let insufficient_inventory = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SellMarketItem {
            item_id: "wheat".to_owned(),
            quantity: 7,
        },
        0,
    );
    assert!(!insufficient_inventory.accepted);
    assert_eq!(
        insufficient_inventory.error.unwrap().message,
        "not enough wheat"
    );
}

#[test]
fn storage_discard_rejects_zero_quantity() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let zero = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::DiscardInventory {
            item_id: "bread".to_owned(),
            quantity: 0,
        },
        0,
    );
    assert!(!zero.accepted);
    assert_eq!(
        zero.error.unwrap().message,
        "quantity must be greater than zero"
    );
}

#[test]
fn player_can_move_built_structures_to_open_tiles() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FeedMill,
            tile: Tile::new(8, 2),
        },
        0,
    );
    assert!(built.accepted);
    let feed_mill_id = farm.machines[0].id.clone();

    let moved = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::Machine {
                id: feed_mill_id.clone(),
            },
            tile: Tile::new(12, 4),
        },
        0,
    );
    assert!(moved.accepted);
    assert_eq!(farm.machines[0].tile, Tile::new(12, 4));
    assert!(moved.events.contains(&FarmEvent::StructureMoved {
        target: StructureTarget::Machine { id: feed_mill_id },
        tile: Tile::new(12, 4),
    }));
}

#[test]
fn moving_structure_rejects_occupied_tiles() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;

    let built_feed_mill = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FeedMill,
            tile: Tile::new(8, 2),
        },
        0,
    );
    assert!(built_feed_mill.accepted);
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
    let feed_mill_id = farm.machines[0].id.clone();
    let shelter_tile = farm.shelters[0].tile.clone();

    let moved_to_field = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::Machine {
                id: feed_mill_id.clone(),
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
            target: StructureTarget::Machine { id: feed_mill_id },
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

    let built_coop = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ChickenCoop,
            tile: Tile::new(8, 2),
        },
        0,
    );
    assert!(built_coop.accepted);
    let shelter_id = farm.shelters[0].id.clone();

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
            target: StructureTarget::Shelter { id: shelter_id },
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
            tile: Tile::new(16, 4),
        },
        0,
    );
    assert!(moved_barn.accepted);
    assert_eq!(farm.barn_tile, Tile::new(16, 4));
}

#[test]
fn barn_and_silo_block_structure_placement() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;
    let silo_tile = farm.silo_tile.clone();

    let built_on_silo = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FeedMill,
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

#[test]
fn level_three_farm_can_build_one_tool_shed_and_move_it() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 14;
    farm.level = 3;
    farm.coins = 45;

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(12, 12),
        },
        0,
    );

    assert!(built.accepted);
    assert_eq!(farm.coins, 0);
    assert_eq!(farm.tool_shed.as_ref().unwrap().tile, Tile::new(12, 12));
    assert!(built.events.contains(&FarmEvent::StructureBuilt {
        structure_kind: StructureKind::ToolShed,
    }));
    let tool_shed_id = farm.tool_shed.as_ref().unwrap().id.clone();

    let second = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(13, 12),
        },
        0,
    );
    assert!(!second.accepted);
    assert_eq!(second.error.unwrap().message, "structure already built");

    let moved = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::ToolShed {
                id: tool_shed_id.clone(),
            },
            tile: Tile::new(13, 12),
        },
        0,
    );

    assert!(moved.accepted);
    assert_eq!(farm.tool_shed.as_ref().unwrap().tile, Tile::new(13, 12));
    assert!(moved.events.contains(&FarmEvent::StructureMoved {
        target: StructureTarget::ToolShed { id: tool_shed_id },
        tile: Tile::new(13, 12),
    }));
    assert_eq!(farm_view(&farm, &catalog).tool_shed, farm.tool_shed);
}

#[test]
fn tool_shed_build_requires_level_three_and_forty_five_coins() {
    let catalog = CatalogDocument::default_catalog();
    let mut low_level_farm = new_farm(0, &catalog);
    low_level_farm.level = 2;
    low_level_farm.coins = 45;

    let low_level = apply_command(
        &mut low_level_farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(12, 12),
        },
        0,
    );
    assert!(!low_level.accepted);
    assert_eq!(low_level.error.unwrap().message, "requires level 3");
    assert!(low_level_farm.tool_shed.is_none());

    let mut poor_farm = new_farm(0, &catalog);
    poor_farm.xp = 14;
    poor_farm.level = 3;
    poor_farm.coins = 44;

    let poor = apply_command(
        &mut poor_farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(12, 12),
        },
        0,
    );
    assert!(!poor.accepted);
    assert_eq!(poor.error.unwrap().message, "not enough coins");
    assert!(poor_farm.tool_shed.is_none());
}

#[test]
fn tool_shed_uses_structure_collision_rules() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 55;
    farm.level = 5;
    farm.coins = 1_000;

    assert!(
        apply_command(
            &mut farm,
            &catalog,
            FarmCommand::BuyStructure {
                structure_kind: StructureKind::FeedMill,
                tile: Tile::new(4, 4),
            },
            0,
        )
        .accepted
    );
    assert!(
        apply_command(
            &mut farm,
            &catalog,
            FarmCommand::BuyStructure {
                structure_kind: StructureKind::ChickenCoop,
                tile: Tile::new(5, 7),
            },
            0,
        )
        .accepted
    );
    assert!(
        apply_command(
            &mut farm,
            &catalog,
            FarmCommand::BuyStructure {
                structure_kind: StructureKind::DeliveryBoard,
                tile: Tile::new(3, 8),
            },
            0,
        )
        .accepted
    );

    for occupied_tile in [
        Tile::new(0, 0),
        farm.silo_tile.clone(),
        farm.barn_tile.clone(),
        farm.machines[0].tile.clone(),
        farm.shelters[0].tile.clone(),
        farm.delivery_board_tile.clone(),
        Tile::new(8, 8),
    ] {
        let built = apply_command(
            &mut farm,
            &catalog,
            FarmCommand::BuyStructure {
                structure_kind: StructureKind::ToolShed,
                tile: occupied_tile,
            },
            0,
        );
        assert!(!built.accepted);
        assert_eq!(built.error.unwrap().message, "tile is occupied");
        assert!(farm.tool_shed.is_none());
    }

    let outside = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(18, 0),
        },
        0,
    );
    assert!(!outside.accepted);
    assert_eq!(outside.error.unwrap().message, "tile is outside the farm");

    let built = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::ToolShed,
            tile: Tile::new(12, 12),
        },
        0,
    );
    assert!(built.accepted);
    let tool_shed_id = farm.tool_shed.as_ref().unwrap().id.clone();

    let field_plot = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyFieldPlot {
            tile: Tile::new(12, 12),
        },
        0,
    );
    assert!(!field_plot.accepted);
    assert_eq!(field_plot.error.unwrap().message, "tile is occupied");

    let cow_pasture = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::CowPasture,
            tile: Tile::new(12, 12),
        },
        0,
    );
    assert!(!cow_pasture.accepted);
    assert_eq!(cow_pasture.error.unwrap().message, "tile is occupied");

    let moved_to_occupied = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::ToolShed { id: tool_shed_id },
            tile: Tile::new(4, 4),
        },
        0,
    );
    assert!(!moved_to_occupied.accepted);
    assert_eq!(moved_to_occupied.error.unwrap().message, "tile is occupied");
    assert_eq!(farm.tool_shed.as_ref().unwrap().tile, Tile::new(12, 12));
}

#[test]
fn new_and_existing_farms_have_default_residents_and_empty_queues() {
    let catalog = CatalogDocument::default_catalog();
    let farm = new_farm(0, &catalog);

    assert_eq!(farm.selected_resident_id, "woman");
    assert_eq!(farm.residents.len(), 2);
    assert_eq!(farm.residents[0].id, "woman");
    assert_eq!(farm.residents[1].id, "man");
    assert_eq!(farm.resident_locations["woman"], Tile::new(8, 10));
    assert_eq!(farm.resident_locations["man"], Tile::new(9, 10));
    assert_eq!(farm.resident_task_queues["woman"].len(), 0);
    assert_eq!(farm.resident_task_queues["man"].len(), 0);

    let mut save_json = serde_json::to_value(&farm).unwrap();
    let save = save_json.as_object_mut().unwrap();
    save.remove("residents");
    save.remove("selected_resident_id");
    save.remove("resident_locations");
    save.remove("resident_task_queues");

    let restored: FarmState = serde_json::from_value(save_json).unwrap();

    assert_eq!(restored.selected_resident_id, "woman");
    assert_eq!(restored.residents.len(), 2);
    assert_eq!(restored.residents[0].id, "woman");
    assert_eq!(restored.residents[1].id, "man");
    assert_eq!(restored.resident_locations["woman"], Tile::new(8, 10));
    assert_eq!(restored.resident_locations["man"], Tile::new(9, 10));
    assert_eq!(restored.resident_task_queues["woman"].len(), 0);
    assert_eq!(restored.resident_task_queues["man"].len(), 0);
}

#[test]
fn legacy_resident_task_steps_without_duration_use_two_seconds() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let queued = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-1".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(queued.accepted);
    farm.resident_inventories
        .get_mut("woman")
        .unwrap()
        .items
        .insert("wheat".to_owned(), 1);

    let mut save_json = serde_json::to_value(&farm).unwrap();
    let plant_step = save_json["resident_task_queues"]["woman"][0]["steps"][1].clone();
    save_json["resident_task_queues"]["woman"][0]["steps"] = serde_json::json!([plant_step]);
    let legacy_step = save_json["resident_task_queues"]["woman"][0]["steps"][0]
        .as_object_mut()
        .unwrap();
    legacy_step.remove("duration_ms");
    legacy_step.remove("approach_tile");
    legacy_step.remove("walk_path");
    legacy_step.remove("walk_duration_ms");
    legacy_step.remove("work_duration_ms");
    save_json["resident_task_queues"]["woman"][0]["ready_at_ms"] =
        serde_json::json!(DEFAULT_RESIDENT_TASK_STEP_DURATION_MS);

    let mut restored: FarmState = serde_json::from_value(save_json).unwrap();

    assert_eq!(
        restored.resident_task_queues["woman"][0].steps[0].duration_ms,
        DEFAULT_RESIDENT_TASK_STEP_DURATION_MS
    );
    apply_elapsed(
        &mut restored,
        &catalog,
        DEFAULT_RESIDENT_TASK_STEP_DURATION_MS - 1,
    );
    assert!(restored.field_plots[0].crop.is_none());

    apply_elapsed(
        &mut restored,
        &catalog,
        DEFAULT_RESIDENT_TASK_STEP_DURATION_MS,
    );
    assert_eq!(
        restored.field_plots[0].crop.as_ref().unwrap().item_id,
        "wheat"
    );
}

#[test]
fn impossible_queued_work_is_reported_as_blocked_resident_task() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let queued = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-1".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(queued.accepted);

    let plant_step = farm.resident_task_queues["woman"][0]
        .steps
        .iter()
        .find(|step| {
            matches!(
                step.work,
                my_farm_core::ResidentTaskStepWork::PlantCrop { .. }
            )
        })
        .unwrap()
        .clone();
    let ready_at_ms = plant_step.duration_ms;
    let task = farm
        .resident_task_queues
        .get_mut("woman")
        .unwrap()
        .first_mut()
        .unwrap();
    task.steps = vec![plant_step];
    task.ready_at_ms = ready_at_ms;

    apply_elapsed(&mut farm, &catalog, ready_at_ms);

    assert!(farm.field_plots[0].crop.is_none());
    assert_eq!(farm.resident_task_queues["woman"].len(), 1);
    assert_eq!(
        farm.blocked_resident_tasks["woman"].reason,
        "missing_carried_items"
    );

    let view = farm_view(&farm, &catalog);
    let work = &view.resident_work["woman"];
    assert_eq!(work.state, my_farm_core::ResidentWorkState::Blocked);
    assert_eq!(work.block.as_ref().unwrap().reason, "missing_carried_items");
}

#[test]
fn legacy_bakery_save_loads_as_owned_oven_with_queue_and_resident_work() {
    let catalog = CatalogDocument::default_catalog();
    let farm = new_farm(0, &catalog);
    let mut save_json = serde_json::to_value(&farm).unwrap();
    let save = save_json.as_object_mut().unwrap();
    save.remove("oven");
    save["machines"] = serde_json::json!([
        {
            "id": "machine-bakery",
            "kind": "bakery",
            "tile": { "x": 8, "y": 2 },
            "queue": [
                {
                    "id": "job-bread",
                    "recipe_id": "bread",
                    "started_at_ms": 1000,
                    "ready_at_ms": 31000
                }
            ]
        },
        {
            "id": "machine-feed",
            "kind": "feed_mill",
            "tile": { "x": 10, "y": 3 },
            "queue": []
        }
    ]);
    save["resident_task_queues"] = serde_json::json!({
        "woman": [
            {
                "id": "task-bakery",
                "kind": { "type": "production_work" },
                "steps": [
                    {
                        "reserved_work_target": {
                            "type": "machine",
                            "machine_id": "machine-bakery"
                        },
                        "work": {
                            "type": "collect_machine_job",
                            "job_id": "job-bread",
                            "recipe_id": "bread"
                        }
                    }
                ],
                "started_at_ms": 31000,
                "ready_at_ms": 33000
            }
        ],
        "man": []
    });

    let restored: FarmState = serde_json::from_value(save_json).unwrap();

    assert_eq!(
        restored.owned_farmhouse_upgrades,
        vec![FarmhouseUpgradeKind::Oven]
    );
    assert_eq!(restored.oven.id, "machine-bakery");
    assert_eq!(restored.oven.queue.len(), 1);
    assert_eq!(restored.oven.queue[0].id, "job-bread");
    assert_eq!(restored.machines.len(), 1);
    assert_eq!(restored.machines[0].kind, MachineKind::FeedMill);
    assert_eq!(
        restored.resident_task_queues["woman"][0].steps[0].reserved_work_target,
        my_farm_core::ReservedWorkTarget::Oven
    );
    assert_eq!(
        restored.resident_task_queues["woman"][0].steps[0].work,
        my_farm_core::ResidentTaskStepWork::CollectOvenJob {
            job_id: "job-bread".to_owned(),
            recipe_id: "bread".to_owned(),
        }
    );
}

#[test]
fn forward_oven_state_wins_when_legacy_bakery_is_also_present() {
    let catalog = CatalogDocument::default_catalog();
    let farm = new_farm(0, &catalog);
    let mut save_json = serde_json::to_value(&farm).unwrap();
    let save = save_json.as_object_mut().unwrap();
    save["owned_farmhouse_upgrades"] = serde_json::json!(["oven"]);
    save["oven"] = serde_json::json!({
        "id": "oven",
        "queue": [
            {
                "id": "job-forward",
                "recipe_id": "bread",
                "started_at_ms": 2000,
                "ready_at_ms": 32000
            }
        ]
    });
    save["machines"] = serde_json::json!([
        {
            "id": "machine-bakery",
            "kind": "bakery",
            "tile": { "x": 8, "y": 2 },
            "queue": [
                {
                    "id": "job-legacy",
                    "recipe_id": "bread",
                    "started_at_ms": 1000,
                    "ready_at_ms": 31000
                }
            ]
        }
    ]);

    let restored: FarmState = serde_json::from_value(save_json).unwrap();

    assert_eq!(restored.oven.id, "oven");
    assert_eq!(restored.oven.queue.len(), 1);
    assert_eq!(restored.oven.queue[0].id, "job-forward");
    assert!(restored.machines.is_empty());
}

#[test]
fn player_can_select_and_rename_farm_residents() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let selected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SelectResident {
            resident_id: "man".to_owned(),
        },
        0,
    );

    assert!(selected.accepted);
    assert_eq!(farm.selected_resident_id, "man");
    assert_eq!(
        selected.events,
        vec![FarmEvent::ResidentSelected {
            resident_id: "man".to_owned(),
        }]
    );

    let renamed = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::RenameResident {
            resident_id: "man".to_owned(),
            display_name: "  Eli  ".to_owned(),
        },
        0,
    );

    assert!(renamed.accepted);
    assert_eq!(farm.residents[1].display_name, "Eli");
    assert_eq!(
        renamed.events,
        vec![FarmEvent::ResidentRenamed {
            resident_id: "man".to_owned(),
            display_name: "Eli".to_owned(),
        }]
    );

    let view = farm_view(&farm, &catalog);
    assert_eq!(view.selected_resident_id, "man");
    assert_eq!(view.residents[1].display_name, "Eli");
}

#[test]
fn invalid_resident_commands_are_rejected_without_mutating_residents() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);

    let before = farm.clone();
    let selected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::SelectResident {
            resident_id: "child".to_owned(),
        },
        0,
    );
    assert!(!selected.accepted);
    assert_eq!(selected.error.unwrap().message, "resident not found");
    assert_eq!(farm, before);

    let empty_name = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::RenameResident {
            resident_id: "woman".to_owned(),
            display_name: "   ".to_owned(),
        },
        0,
    );
    assert!(!empty_name.accepted);
    assert_eq!(
        empty_name.error.unwrap().message,
        "resident name cannot be empty"
    );
    assert_eq!(farm, before);

    let long_name = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::RenameResident {
            resident_id: "woman".to_owned(),
            display_name: "abcdefghijklmnopqrstu".to_owned(),
        },
        0,
    );
    assert!(!long_name.accepted);
    assert_eq!(
        long_name.error.unwrap().message,
        "resident name cannot exceed 20 characters"
    );
    assert_eq!(farm, before);
}

fn assert_room_placements(room: &Room, decoration_ids: &[&str]) {
    assert_eq!(
        room.decoration_placements
            .iter()
            .map(|placement| placement.decoration_id.as_str())
            .collect::<Vec<_>>(),
        decoration_ids
    );
}
