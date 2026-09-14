mod api;
pub mod application;
mod catalog;
mod domain;
mod engine;
mod state;
mod view;

pub use api::*;
pub use application::{advance_time, execute_command, query_farm};
pub use catalog::*;
pub use engine::{
    CommandError, CommandOutcome, FARM_SHOP_ITEM_TYPE_CAPACITY, FarmCommand, FarmEvent,
    StructureTarget, SweepHarvestMode, available_farm_shop_stock_quantity, ensure_delivery_orders,
    farm_shop_sale_chance_bps, projected_farm_shop_item_ids, reserved_farm_shop_stock_pickups,
};
pub use state::*;
pub use view::*;

/// Compatibility name for callers that have not yet adopted the explicit CQRS application API.
pub fn apply_command(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    command: FarmCommand,
    now_ms: i64,
) -> CommandOutcome {
    execute_command(farm, catalog, command, now_ms)
}

/// Compatibility name for callers that still refer to elapsed simulation as an engine operation.
pub fn apply_elapsed(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
) -> Vec<FarmEvent> {
    advance_time(farm, catalog, now_ms)
}
