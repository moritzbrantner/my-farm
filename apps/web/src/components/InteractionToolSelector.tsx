import { useEffect, useMemo, useState } from "react";
import type { CatalogDocument, FarmView, SweepHarvestMode } from "@my-farm/contracts";
import { itemName } from "@my-farm/game-model/selectors";
import { ResourceIcon } from "./ResourceIcon";

export type ActiveFieldTool =
  | { type: "default" }
  | { type: "plant"; cropId: string }
  | { type: "harvest" };

export type PlantSweepState = {
  cropId: string;
  plotIds: string[];
  pointerId: number;
} | null;

export type HarvestSweepState = {
  cropId: string;
  harvestMode: SweepHarvestMode;
  plotIds: string[];
  pointerId: number;
} | null;

type InteractionToolSelectorProps = {
  catalog: CatalogDocument;
  view: FarmView;
  activeFieldTool: ActiveFieldTool;
  buildToolSelected: boolean;
  harvestMode: SweepHarvestMode;
  plantSweep: PlantSweepState;
  harvestSweep: HarvestSweepState;
  onDefault: () => void;
  onPlant: (cropId: string) => void;
  onHarvest: () => void;
  onHarvestMode: (mode: SweepHarvestMode) => void;
  onBuild: () => void;
};

export function InteractionToolSelector({
  catalog,
  view,
  activeFieldTool,
  buildToolSelected,
  harvestMode,
  plantSweep,
  harvestSweep,
  onDefault,
  onPlant,
  onHarvest,
  onHarvestMode,
  onBuild,
}: InteractionToolSelectorProps) {
  const [seedMenuOpen, setSeedMenuOpen] = useState(false);
  const [harvestMenuOpen, setHarvestMenuOpen] = useState(false);
  const inventory = useMemo(
    () => new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)])),
    [view.inventory],
  );
  const unlockedCrops = useMemo(
    () => catalog.crops.filter((crop) => crop.unlock_level <= view.level),
    [catalog.crops, view.level],
  );
  const hasPlantableSeed = unlockedCrops.some((crop) => (inventory.get(crop.item_id) ?? 0) > 0);
  const selectedSeedFieldCount = plantSweep?.plotIds.length ?? 0;
  const selectedHarvestFieldCount = harvestSweep?.plotIds.length ?? 0;
  const selectedSeedCropId = activeFieldTool.type === "plant" ? activeFieldTool.cropId : null;
  const selectedSeedName = selectedSeedCropId ? itemName(catalog, selectedSeedCropId) : null;
  const defaultToolSelected = !buildToolSelected && activeFieldTool.type === "default";
  const harvestModeLabel = harvestMode === "all_crops" ? "All crops" : "Matching crop";

  useEffect(() => {
    if (activeFieldTool.type !== "plant") {
      setSeedMenuOpen(false);
    }
  }, [activeFieldTool.type]);

  const selectSeed = (cropId: string) => {
    onPlant(cropId);
    setSeedMenuOpen(false);
  };

  const selectHarvestMode = (mode: SweepHarvestMode) => {
    onHarvestMode(mode);
    setHarvestMenuOpen(false);
  };

  return (
    <section className="interaction-tools" aria-label="Interaction Tools">
      <div className="interaction-tools__toolbar" role="toolbar" aria-label="Interaction Tools">
        <button
          type="button"
          className={
            defaultToolSelected
              ? "interaction-tool interaction-tool--default interaction-tool--active"
              : "interaction-tool interaction-tool--default"
          }
          aria-label="Default"
          aria-pressed={defaultToolSelected}
          onClick={() => {
            setSeedMenuOpen(false);
            setHarvestMenuOpen(false);
            onDefault();
          }}
        >
          <span className="interaction-tool__glyph interaction-tool__glyph--default" aria-hidden="true" />
          <span>Default</span>
        </button>
        <button
          type="button"
          className={
            activeFieldTool.type === "plant"
              ? "interaction-tool interaction-tool--seed interaction-tool--active"
              : "interaction-tool interaction-tool--seed"
          }
          aria-label="Seed"
          aria-pressed={activeFieldTool.type === "plant"}
          aria-haspopup="menu"
          aria-expanded={seedMenuOpen}
          disabled={!hasPlantableSeed}
          onClick={() => {
            setHarvestMenuOpen(false);
            setSeedMenuOpen((open) => !open);
          }}
        >
          <ResourceIcon type="item" itemId={selectedSeedCropId ?? "wheat"} itemKind="crop" />
          <span>Seed</span>
          {selectedSeedName ? <strong>{selectedSeedName}</strong> : null}
        </button>
        <button
          type="button"
          className={
            activeFieldTool.type === "harvest"
              ? "interaction-tool interaction-tool--harvest interaction-tool--active"
              : "interaction-tool interaction-tool--harvest"
          }
          aria-label="Harvest"
          aria-pressed={activeFieldTool.type === "harvest"}
          aria-haspopup="menu"
          aria-expanded={harvestMenuOpen}
          onClick={() => {
            setSeedMenuOpen(false);
            setHarvestMenuOpen((open) => !open);
            onHarvest();
          }}
        >
          <span className="interaction-tool__glyph interaction-tool__glyph--harvest" aria-hidden="true" />
          <span>Harvest</span>
          <strong>{harvestModeLabel}</strong>
        </button>
        <button
          type="button"
          className={
            buildToolSelected
              ? "interaction-tool interaction-tool--build interaction-tool--active"
              : "interaction-tool interaction-tool--build"
          }
          aria-label="Build"
          aria-pressed={buildToolSelected}
          onClick={() => {
            setSeedMenuOpen(false);
            setHarvestMenuOpen(false);
            onBuild();
          }}
        >
          <span className="interaction-tool__glyph interaction-tool__glyph--build" aria-hidden="true" />
          <span>Build</span>
        </button>
      </div>
      {seedMenuOpen ? (
        <div className="interaction-tools__menu interaction-tools__menu--seed" role="menu" aria-label="Seed crop">
          {unlockedCrops.map((crop) => {
            const quantity = inventory.get(crop.item_id) ?? 0;
            const active = selectedSeedCropId === crop.item_id;
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={active}
                key={crop.item_id}
                className={
                  active
                    ? "interaction-tools__menu-item interaction-tools__menu-item--active"
                    : "interaction-tools__menu-item"
                }
                disabled={quantity < 1}
                onClick={() => selectSeed(crop.item_id)}
              >
                <ResourceIcon type="item" itemId={crop.item_id} itemKind="crop" />
                <span>{itemName(catalog, crop.item_id)}</span>
                <strong>{quantity}</strong>
              </button>
            );
          })}
        </div>
      ) : null}
      {harvestMenuOpen ? (
        <div className="interaction-tools__menu interaction-tools__menu--harvest" role="menu" aria-label="Harvest mode">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={harvestMode === "matching_crop"}
            className={
              harvestMode === "matching_crop"
                ? "interaction-tools__menu-item interaction-tools__menu-item--active"
                : "interaction-tools__menu-item"
            }
            onClick={() => selectHarvestMode("matching_crop")}
          >
            <span>Matching crop</span>
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={harvestMode === "all_crops"}
            className={
              harvestMode === "all_crops"
                ? "interaction-tools__menu-item interaction-tools__menu-item--active"
                : "interaction-tools__menu-item"
            }
            onClick={() => selectHarvestMode("all_crops")}
          >
            <span>All crops</span>
          </button>
        </div>
      ) : null}
      {activeFieldTool.type === "plant" ? (
        <p className="interaction-tools__status" role="status" aria-live="polite">
          {selectedSeedFieldCount === 0
            ? "No fields selected for seeding"
            : `${selectedSeedFieldCount} ${
                selectedSeedFieldCount === 1 ? "field" : "fields"
              } selected for seeding`}
        </p>
      ) : null}
      {activeFieldTool.type === "harvest" && harvestSweep ? (
        <p className="interaction-tools__status" role="status" aria-live="polite">
          {selectedHarvestFieldCount === 1
            ? "1 field selected for harvest"
            : `${selectedHarvestFieldCount} fields selected for harvest`}
        </p>
      ) : null}
      {buildToolSelected && activeFieldTool.type === "default" ? (
        <p className="interaction-tools__status" role="status" aria-live="polite">
          Choose a structure to place
        </p>
      ) : null}
    </section>
  );
}
