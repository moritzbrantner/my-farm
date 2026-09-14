use crate::{
    CatalogDocument, CommandOutcome, FarmCommand, FarmEvent, FarmState, FarmView,
    domain::fields::FieldCommand,
};

/// Authoritative write entry point for farm commands.
///
/// Field commands cross a dedicated domain boundary first. Their state-transition implementation
/// still delegates to the legacy mini-engine in this migration slice so command semantics remain
/// byte-for-byte compatible while the oversized engine is dismantled incrementally.
pub fn execute_command(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    command: FarmCommand,
    now_ms: i64,
) -> CommandOutcome {
    match FieldCommand::try_from(command) {
        Ok(command) => execute_field_command(farm, catalog, command, now_ms),
        Err(command) => crate::engine::apply_command(farm, catalog, command, now_ms),
    }
}

/// Advances authoritative time-driven simulation state through the same application boundary.
pub fn advance_time(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    now_ms: i64,
) -> Vec<FarmEvent> {
    crate::engine::apply_elapsed(farm, catalog, now_ms)
}

/// Read-side projection entry point. Queries never mutate authoritative farm state.
pub fn query_farm(farm: &FarmState, catalog: &CatalogDocument) -> FarmView {
    crate::view::farm_view(farm, catalog)
}

fn execute_field_command(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    command: FieldCommand,
    now_ms: i64,
) -> CommandOutcome {
    crate::engine::apply_command(farm, catalog, FarmCommand::from(command), now_ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CatalogDocument, engine, state::new_farm};

    #[test]
    fn field_command_boundary_preserves_legacy_state_transition() {
        let catalog = CatalogDocument::default_catalog();
        let mut expected_farm = new_farm(0, &catalog);
        let mut actual_farm = expected_farm.clone();
        let command = FarmCommand::PlantCrop {
            plot_id: "plot-1".to_owned(),
            crop_id: "wheat".to_owned(),
        };

        let expected = engine::apply_command(&mut expected_farm, &catalog, command.clone(), 0);
        let actual = execute_command(&mut actual_farm, &catalog, command, 0);

        assert_eq!(actual, expected);
        assert_eq!(actual_farm, expected_farm);
    }

    #[test]
    fn elapsed_boundary_preserves_legacy_state_transition() {
        let catalog = CatalogDocument::default_catalog();
        let mut expected_farm = new_farm(0, &catalog);
        let mut actual_farm = expected_farm.clone();

        let expected = engine::apply_elapsed(&mut expected_farm, &catalog, 1);
        let actual = advance_time(&mut actual_farm, &catalog, 1);

        assert_eq!(actual, expected);
        assert_eq!(actual_farm, expected_farm);
    }

    #[test]
    fn query_boundary_is_the_existing_read_projection() {
        let catalog = CatalogDocument::default_catalog();
        let farm = new_farm(0, &catalog);

        assert_eq!(
            query_farm(&farm, &catalog),
            crate::view::farm_view(&farm, &catalog)
        );
    }
}
