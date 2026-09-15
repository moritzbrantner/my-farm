use crate::engine::{FarmCommand, SweepHarvestMode};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum FieldCommand {
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
        harvest_mode: Option<SweepHarvestMode>,
    },
}

impl TryFrom<FarmCommand> for FieldCommand {
    type Error = FarmCommand;

    fn try_from(command: FarmCommand) -> Result<Self, Self::Error> {
        match command {
            FarmCommand::PlantCrop { plot_id, crop_id } => Ok(Self::PlantCrop { plot_id, crop_id }),
            FarmCommand::SweepPlant { crop_id, plot_ids } => {
                Ok(Self::SweepPlant { crop_id, plot_ids })
            }
            FarmCommand::HarvestCrop { plot_id } => Ok(Self::HarvestCrop { plot_id }),
            FarmCommand::SweepHarvest {
                plot_ids,
                harvest_mode,
            } => Ok(Self::SweepHarvest {
                plot_ids,
                harvest_mode,
            }),
            other => Err(other),
        }
    }
}

impl From<FieldCommand> for FarmCommand {
    fn from(command: FieldCommand) -> Self {
        match command {
            FieldCommand::PlantCrop { plot_id, crop_id } => Self::PlantCrop { plot_id, crop_id },
            FieldCommand::SweepPlant { crop_id, plot_ids } => {
                Self::SweepPlant { crop_id, plot_ids }
            }
            FieldCommand::HarvestCrop { plot_id } => Self::HarvestCrop { plot_id },
            FieldCommand::SweepHarvest {
                plot_ids,
                harvest_mode,
            } => Self::SweepHarvest {
                plot_ids,
                harvest_mode,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn field_commands_round_trip_without_contract_changes() {
        let commands = [
            FarmCommand::PlantCrop {
                plot_id: "plot-1".to_owned(),
                crop_id: "wheat".to_owned(),
            },
            FarmCommand::SweepPlant {
                crop_id: "corn".to_owned(),
                plot_ids: vec!["plot-2".to_owned(), "plot-3".to_owned()],
            },
            FarmCommand::HarvestCrop {
                plot_id: "plot-4".to_owned(),
            },
            FarmCommand::SweepHarvest {
                plot_ids: vec!["plot-5".to_owned(), "plot-6".to_owned()],
                harvest_mode: Some(SweepHarvestMode::AllCrops),
            },
        ];

        for command in commands {
            let expected = command.clone();
            let field_command = FieldCommand::try_from(command).expect("field command");
            let round_tripped = FarmCommand::from(field_command);
            assert_eq!(round_tripped, expected);
        }
    }

    #[test]
    fn non_field_commands_stay_outside_the_field_domain() {
        let command = FarmCommand::CollectOvenJob;
        assert_eq!(FieldCommand::try_from(command.clone()), Err(command));
    }
}
