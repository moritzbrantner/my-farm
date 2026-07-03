use my_farm_core::{
    CommandRequest, CommandResponse, FarmCommand, FarmResponse, StructureKind, Tile,
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
    assert_eq!(catalog.machines.len(), 1);
    assert!(catalog.shelters.is_empty());
    assert!(catalog.market_items.is_empty());
    assert!(catalog.storage_upgrades.is_empty());
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
fn demo_runtime_supports_crop_and_bakery_loop() {
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
        21_000.0,
    );
    let built = command(
        &mut runtime,
        2,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::Bakery,
            tile: Tile { x: 8, y: 2 },
        },
        29_000.0,
    );
    let bakery_id = built.view.machines[0].id.clone();
    command(
        &mut runtime,
        3,
        FarmCommand::QueueRecipe {
            machine_id: bakery_id.clone(),
            recipe_id: "bread".to_owned(),
        },
        29_000.0,
    );
    let response = command(
        &mut runtime,
        4,
        FarmCommand::CollectMachineJob {
            machine_id: bakery_id,
        },
        60_000.0,
    );

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

    let farm = farm(&mut runtime, 62_000.0);
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
