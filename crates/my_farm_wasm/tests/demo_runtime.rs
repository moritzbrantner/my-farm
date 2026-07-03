use my_farm_core::{
    CommandRequest, CommandResponse, FarmCommand, FarmResponse, FarmhouseUpgradeKind, RoomTile,
    StructureKind, Tile,
};
use my_farm_wasm::{DemoFarmRuntime, demo_catalog};

#[test]
fn demo_catalog_is_limited_to_early_production() {
    let catalog = demo_catalog();

    assert_eq!(
        catalog
            .items
            .iter()
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>(),
        vec!["wheat", "corn", "bread"]
    );
    assert_eq!(catalog.crops.len(), 2);
    assert_eq!(catalog.recipes.len(), 1);
    assert_eq!(catalog.recipes[0].id, "bread");
    assert!(catalog.machines.is_empty());
    assert!(catalog.shelters.is_empty());
    assert!(catalog.market_items.is_empty());
    assert!(catalog.storage_upgrades.is_empty());
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
}

#[test]
fn demo_runtime_persists_a_local_save() {
    let mut runtime = DemoFarmRuntime::new(None, 1_000.0);

    command(
        &mut runtime,
        0,
        FarmCommand::BuyFieldPlot {
            tile: Tile { x: 4, y: 0 },
        },
        1_000.0,
    );
    let save = runtime.save_json();
    let mut restored = DemoFarmRuntime::new(Some(save), 2_000.0);
    let farm = farm(&mut restored, 2_000.0);

    assert_eq!(farm.version, 1);
    assert_eq!(farm.view.field_plots.len(), 7);
}

#[test]
fn demo_runtime_supports_buying_and_persisting_the_farmhouse_oven() {
    let mut runtime = DemoFarmRuntime::new(None, 1_000.0);

    command(
        &mut runtime,
        0,
        FarmCommand::SweepPlant {
            crop_id: "wheat".to_owned(),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
                "plot-4".to_owned(),
            ],
        },
        1_000.0,
    );
    command(
        &mut runtime,
        1,
        FarmCommand::SweepHarvest {
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
                "plot-4".to_owned(),
            ],
            harvest_mode: None,
        },
        27_000.0,
    );
    let bought = command(
        &mut runtime,
        2,
        FarmCommand::BuyFarmhouseUpgrade {
            upgrade_kind: FarmhouseUpgradeKind::Oven,
        },
        37_000.0,
    );

    assert_eq!(bought.view.coins, 140);
    assert_eq!(
        bought.view.owned_farmhouse_upgrades,
        vec![FarmhouseUpgradeKind::Oven]
    );

    let save = runtime.save_json();
    let mut restored = DemoFarmRuntime::new(Some(save), 37_000.0);
    let farm = farm(&mut restored, 37_000.0);
    assert_eq!(
        farm.view.owned_farmhouse_upgrades,
        vec![FarmhouseUpgradeKind::Oven]
    );
}

#[test]
fn demo_runtime_supports_decoration_commands_and_persists_saved_placements() {
    let mut runtime = DemoFarmRuntime::new(None, 1_000.0);

    command(
        &mut runtime,
        0,
        FarmCommand::SweepPlant {
            crop_id: "wheat".to_owned(),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
                "plot-4".to_owned(),
            ],
        },
        1_000.0,
    );
    command(
        &mut runtime,
        1,
        FarmCommand::SweepHarvest {
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
                "plot-4".to_owned(),
            ],
            harvest_mode: None,
        },
        27_000.0,
    );

    let placed = command(
        &mut runtime,
        2,
        FarmCommand::PlaceDecoration {
            room_id: "living_room".to_owned(),
            decoration_id: "chair".to_owned(),
            tile: RoomTile::new(0, 0),
        },
        37_000.0,
    );

    assert_eq!(placed.version, 3);
    let placement_id = placed.view.house_interior.rooms[0]
        .decoration_placements
        .iter()
        .find(|placement| placement.decoration_id == "chair")
        .unwrap()
        .id
        .clone();

    command(
        &mut runtime,
        3,
        FarmCommand::MoveDecoration {
            room_id: "living_room".to_owned(),
            placement_id: placement_id.clone(),
            tile: RoomTile::new(0, 1),
        },
        37_000.0,
    );
    let removed = command(
        &mut runtime,
        4,
        FarmCommand::RemoveDecoration {
            room_id: "living_room".to_owned(),
            placement_id,
        },
        37_000.0,
    );

    assert_eq!(removed.version, 5);
    assert_eq!(
        removed.view.house_interior.rooms[0]
            .decoration_placements
            .len(),
        3
    );

    let save = runtime.save_json();
    let mut restored = DemoFarmRuntime::new(Some(save), 37_000.0);
    let restored_farm = farm(&mut restored, 37_000.0);
    assert_eq!(restored_farm.version, 5);
    assert_eq!(
        restored_farm.view.house_interior.rooms[0]
            .decoration_placements
            .len(),
        3
    );
    assert!(
        demo_catalog()
            .decorations
            .iter()
            .any(|decoration| decoration.id == "chair")
    );
}

#[test]
fn demo_runtime_ticks_completed_resident_tasks_and_preserves_save_state() {
    let mut runtime = DemoFarmRuntime::new(None, 1_000.0);

    command(
        &mut runtime,
        0,
        FarmCommand::RenameResident {
            resident_id: "woman".to_owned(),
            display_name: "Ada".to_owned(),
        },
        1_000.0,
    );
    command(
        &mut runtime,
        1,
        FarmCommand::SelectResident {
            resident_id: "man".to_owned(),
        },
        1_000.0,
    );
    command(
        &mut runtime,
        2,
        FarmCommand::SweepPlant {
            crop_id: "wheat".to_owned(),
            plot_ids: vec!["plot-1".to_owned(), "plot-2".to_owned()],
        },
        1_000.0,
    );

    let queued = farm(&mut runtime, 2_000.0);
    assert_eq!(queued.version, 3);
    assert_eq!(queued.view.selected_resident_id, "man");
    assert_eq!(queued.view.resident_task_queues["man"].len(), 1);
    assert_eq!(queued.view.resident_task_queues["man"][0].steps.len(), 2);

    let ticked = farm(&mut runtime, 7_000.0);
    assert_eq!(ticked.version, 4);
    assert!(ticked.view.field_plots[0].crop.is_some());
    assert_eq!(ticked.view.resident_task_queues["man"][0].steps.len(), 1);

    let save = runtime.save_json();
    let mut restored = DemoFarmRuntime::new(Some(save), 7_000.0);
    let restored_farm = farm(&mut restored, 7_000.0);

    assert_eq!(restored_farm.version, 4);
    assert_eq!(restored_farm.view.selected_resident_id, "man");
    assert_eq!(restored_farm.view.residents[0].display_name, "Ada");
    assert!(restored_farm.view.field_plots[0].crop.is_some());
    assert_eq!(
        restored_farm.view.resident_task_queues["man"][0]
            .steps
            .len(),
        1
    );
}

#[test]
fn demo_runtime_loads_old_saves_with_default_residents_and_empty_queues() {
    let runtime = DemoFarmRuntime::new(None, 1_000.0);
    let mut save: serde_json::Value = serde_json::from_str(&runtime.save_json()).unwrap();
    let farm_json = save["farm"].as_object_mut().unwrap();
    farm_json.remove("residents");
    farm_json.remove("selected_resident_id");
    farm_json.remove("resident_task_queues");

    let mut restored = DemoFarmRuntime::new(Some(save.to_string()), 2_000.0);
    let restored_farm = farm(&mut restored, 2_000.0);

    assert_eq!(restored_farm.view.selected_resident_id, "woman");
    assert_eq!(
        restored_farm
            .view
            .residents
            .iter()
            .map(|resident| resident.id.as_str())
            .collect::<Vec<_>>(),
        vec!["woman", "man"]
    );
    assert!(restored_farm.view.resident_task_queues["woman"].is_empty());
    assert!(restored_farm.view.resident_task_queues["man"].is_empty());
}

#[test]
fn demo_runtime_loads_old_saves_with_default_house_interior() {
    let runtime = DemoFarmRuntime::new(None, 1_000.0);
    let mut save: serde_json::Value = serde_json::from_str(&runtime.save_json()).unwrap();
    let farm_json = save["farm"].as_object_mut().unwrap();
    farm_json.remove("house_interior");

    let mut restored = DemoFarmRuntime::new(Some(save.to_string()), 2_000.0);
    let restored_farm = farm(&mut restored, 2_000.0);

    assert_eq!(
        restored_farm
            .view
            .house_interior
            .rooms
            .iter()
            .map(|room| room.name.as_str())
            .collect::<Vec<_>>(),
        vec!["Living Room", "Kitchen", "Bedroom"]
    );
    assert!(
        restored_farm
            .view
            .house_interior
            .rooms
            .iter()
            .all(|room| room.width == 8 && room.height == 6 && room.tiles.len() == 48)
    );
}

#[test]
fn demo_runtime_loads_legacy_bakery_save_as_farmhouse_oven() {
    let runtime = DemoFarmRuntime::new(None, 1_000.0);
    let mut save: serde_json::Value = serde_json::from_str(&runtime.save_json()).unwrap();
    let farm_json = save["farm"].as_object_mut().unwrap();
    farm_json.remove("owned_farmhouse_upgrades");
    farm_json.remove("oven");
    farm_json["machines"] = serde_json::json!([
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
        }
    ]);

    let mut restored = DemoFarmRuntime::new(Some(save.to_string()), 2_000.0);
    let restored_farm = farm(&mut restored, 2_000.0);

    assert_eq!(
        restored_farm.view.owned_farmhouse_upgrades,
        vec![FarmhouseUpgradeKind::Oven]
    );
    assert_eq!(restored_farm.view.oven.id, "machine-bakery");
    assert_eq!(restored_farm.view.oven.queue.len(), 1);
    assert_eq!(restored_farm.view.oven.queue[0].id, "job-bread");
    assert!(restored_farm.view.machines.is_empty());
}

#[test]
fn demo_runtime_supports_crop_and_farmhouse_oven_loop() {
    let mut runtime = DemoFarmRuntime::new(None, 1_000.0);

    command(
        &mut runtime,
        0,
        FarmCommand::SweepPlant {
            crop_id: "wheat".to_owned(),
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
                "plot-4".to_owned(),
            ],
        },
        1_000.0,
    );
    command(
        &mut runtime,
        1,
        FarmCommand::SweepHarvest {
            plot_ids: vec![
                "plot-1".to_owned(),
                "plot-2".to_owned(),
                "plot-3".to_owned(),
                "plot-4".to_owned(),
            ],
            harvest_mode: None,
        },
        23_000.0,
    );
    command(
        &mut runtime,
        2,
        FarmCommand::BuyFarmhouseUpgrade {
            upgrade_kind: FarmhouseUpgradeKind::Oven,
        },
        33_000.0,
    );
    command(
        &mut runtime,
        3,
        FarmCommand::QueueOvenRecipe {
            recipe_id: "bread".to_owned(),
        },
        33_000.0,
    );
    let response = command(&mut runtime, 4, FarmCommand::CollectOvenJob, 64_000.0);

    assert!(response.accepted);
    assert_eq!(
        response
            .view
            .inventory
            .iter()
            .find(|item| item.item_id == "bread")
            .map(|item| item.quantity),
        None
    );

    let farm = farm(&mut runtime, 66_000.0);
    assert_eq!(
        farm.view
            .inventory
            .iter()
            .find(|item| item.item_id == "bread")
            .map(|item| item.quantity),
        Some(1)
    );
}

#[test]
fn demo_runtime_rejects_later_game_commands_before_core_execution() {
    let mut runtime = DemoFarmRuntime::new(None, 1_000.0);
    let response = command_raw(
        &mut runtime,
        0,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FeedMill,
            tile: Tile { x: 10, y: 3 },
        },
        1_000.0,
    );

    assert!(!response.accepted);
    assert_eq!(response.version, 0);
    assert_eq!(
        response.error.as_deref(),
        Some("feature is not available in the demo")
    );
}

fn command(
    runtime: &mut DemoFarmRuntime,
    expected_version: u64,
    command: FarmCommand,
    now_ms: f64,
) -> CommandResponse {
    let response = command_raw(runtime, expected_version, command, now_ms);
    assert!(response.accepted, "{response:?}");
    response
}

fn command_raw(
    runtime: &mut DemoFarmRuntime,
    expected_version: u64,
    command: FarmCommand,
    now_ms: f64,
) -> CommandResponse {
    let request = serde_json::to_string(&CommandRequest {
        expected_version,
        command,
    })
    .unwrap();
    serde_json::from_str(&runtime.command_json(&request, now_ms)).unwrap()
}

fn farm(runtime: &mut DemoFarmRuntime, now_ms: f64) -> FarmResponse {
    serde_json::from_str(&runtime.farm_json(now_ms)).unwrap()
}
