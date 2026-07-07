import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type {
  CatalogDocument,
  FarmCommand,
  FarmResponse,
  FarmView,
  SweepHarvestMode,
} from "@my-farm/contracts";
import {
  buildFieldMenuModel,
  buildStructureMenuModel,
  itemName,
  residentWork,
  selectedResident,
  selectedStructureLabel,
  type Selection,
  type StructureMenuItem,
  type StructureSelection,
} from "@my-farm/game-model";
import { ActionButton, DiagnosticsPanel, Metric } from "../components/ui";
import { FarmSceneShell } from "../scene/FarmScene";
import { styles } from "../styles";
import type { BuildableKind, CommandSender, ShellProps } from "../types";
import {
  activeResident,
  buildDisabledReason,
  buildKinds,
  buildLabel,
  candidateTilesForBuild,
  candidateTilesForMove,
  formatTile,
  inventoryItem,
  selectedPlotFromSelection,
  structureKindForBuild,
  structureSelectionFromSelection,
  structureTargetFromSelection,
} from "../utils/farm";

export function FarmScreen({
  serverUrl,
  status,
  message,
  catalog,
  farm,
  diagnostics,
  nowMs,
  selection,
  onNavigate,
  onSelect,
  onSendCommand,
  onResetFarm,
}: ShellProps & {
  catalog: CatalogDocument;
  farm: FarmResponse;
  selection: Selection;
  onSelect(selection: Selection): void;
  onSendCommand: CommandSender;
  onResetFarm(): void;
}) {
  const view = farm.view;
  const fallbackSelection: Selection = view.field_plots[0] ? { type: "plot", id: view.field_plots[0].id } : { type: "farmhouse" };
  const activeSelection = selection ?? fallbackSelection;
  const selectedPlot = selectedPlotFromSelection(view, activeSelection);
  const structureSelection = structureSelectionFromSelection(activeSelection);
  const selectedFarmResident = selectedResident(view, activeSelection);
  const selectedActiveResident = activeResident(view);
  const [buildKind, setBuildKind] = useState<BuildableKind | null>(null);
  const [movingStructure, setMovingStructure] = useState<StructureSelection | null>(null);
  const [harvestMode, setHarvestMode] = useState<SweepHarvestMode>("matching_crop");
  const unlockedCrops = catalog.crops.filter((crop) => crop.unlock_level <= view.level);
  const plantableCrop =
    unlockedCrops.find((crop) => (inventoryItem(view, crop.item_id)?.available_quantity ?? inventoryItem(view, crop.item_id)?.quantity ?? 0) > 0) ??
    unlockedCrops[0];
  const readyPlotIds = view.field_plots
    .filter((plot) => plot.crop && plot.crop.ready_at_ms <= nowMs)
    .map((plot) => plot.id);
  const emptyPlotIds = view.field_plots.filter((plot) => !plot.crop).map((plot) => plot.id);

  const fieldMenu = selectedPlot ? buildFieldMenuModel(catalog, view, selectedPlot, nowMs) : null;
  const structureMenu = structureSelection ? buildStructureMenuModel(catalog, view, structureSelection, nowMs) : null;

  const buildCandidates = useMemo(
    () => (buildKind ? candidateTilesForBuild(view, buildKind) : []),
    [buildKind, view],
  );
  const moveCandidates = useMemo(
    () => (movingStructure ? candidateTilesForMove(view, movingStructure) : []),
    [movingStructure, view],
  );

  const runMenuItem = (item: StructureMenuItem) => {
    if (item.disabled) {
      return;
    }
    if (item.action === "move_structure" && structureSelection) {
      setMovingStructure(structureSelection);
      setBuildKind(null);
      return;
    }
    if (item.command) {
      onSendCommand(item.command);
    }
  };

  const runBuild = (kind: BuildableKind, tile = buildCandidates[0]) => {
    if (!tile) {
      return;
    }
    const structureKind = structureKindForBuild(kind);
    const command: FarmCommand = structureKind
      ? { type: "buy_structure", structure_kind: structureKind, tile }
      : { type: "buy_field_plot", tile };
    onSendCommand(command);
    setBuildKind(null);
  };

  const runMove = (tile = moveCandidates[0]) => {
    if (!movingStructure || !tile) {
      return;
    }
    const target = structureTargetFromSelection(movingStructure);
    if (!target) {
      return;
    }
    onSendCommand({ type: "move_structure", target, tile });
    setMovingStructure(null);
  };

  return (
    <View style={styles.farmScreen}>
      <FarmSceneShell view={view} selection={activeSelection} onSelect={onSelect} />
      <View style={styles.topHud}>
        <Metric label="Level" value={`${view.level}`} />
        <Metric label="XP" value={`${view.xp}`} />
        <Metric label="Coins" value={`${view.coins}`} />
        <Metric label="Silo" value={`${view.silo_used}/${view.silo_capacity}`} />
        <Metric label="Barn" value={`${view.barn_used}/${view.barn_capacity}`} />
      </View>
      <View style={styles.bottomSheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.panelTitle}>Farm</Text>
          <Text style={styles.badge}>{status}</Text>
        </View>
        <Text style={styles.statusText}>{message}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>
          <ActionButton label="Menu" onPress={() => onNavigate("menu")} />
          <ActionButton label="Residents" onPress={() => onNavigate("residents")} />
          <ActionButton label="Market" onPress={() => onNavigate("market")} />
          <ActionButton label="Orders" onPress={() => onNavigate("orders")} />
          <ActionButton label="House" onPress={() => onNavigate("house")} />
          <ActionButton label="Wiki" onPress={() => onNavigate("wiki")} />
          <ActionButton label="Reset" onPress={onResetFarm} />
        </ScrollView>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Selection</Text>
            {selectedPlot ? (
              <Text style={styles.bodyText}>
                {selectedPlot.id}: {selectedPlot.crop ? `${itemName(catalog, selectedPlot.crop.item_id)} ${selectedPlot.crop.ready_at_ms <= nowMs ? "Ready Output" : "growing"}` : "empty Field Plot"}
              </Text>
            ) : null}
            {structureSelection ? (
              <Text style={styles.bodyText}>{selectedStructureLabel(view, structureSelection)}</Text>
            ) : null}
            {selectedFarmResident ? (
              <Text style={styles.bodyText}>
                Farm Resident: {selectedFarmResident.display_name} ({residentWork(view, selectedFarmResident.id)?.state ?? "idle"})
              </Text>
            ) : null}
            <Text style={styles.bodyText}>Selected Resident: {selectedActiveResident?.display_name ?? "None"}</Text>
            <Text style={styles.bodyText}>
              Queue: {selectedActiveResident ? residentWork(view, selectedActiveResident.id)?.queue.length ?? 0 : 0}
            </Text>
          </View>

          {fieldMenu ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>{fieldMenu.title}</Text>
              <View style={styles.inlineActions}>
                {fieldMenu.items.map((item) => (
                  <ActionButton
                    key={item.id}
                    label={item.reason ? `${item.label} (${item.reason})` : item.label}
                    disabled={item.disabled}
                    onPress={() => item.command && onSendCommand(item.command)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {structureMenu && structureSelection ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>{structureMenu.title}</Text>
              {structureMenu.subtitle ? <Text style={styles.bodyText}>{structureMenu.subtitle}</Text> : null}
              <View style={styles.inlineActions}>
                {structureMenu.items.map((item) => (
                  <ActionButton
                    key={item.id}
                    label={item.reason ? `${item.label} (${item.reason})` : item.label}
                    disabled={item.disabled}
                    onPress={() => runMenuItem(item)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Crop Sweep</Text>
            <View style={styles.inlineActions}>
              <ActionButton
                label={plantableCrop ? `Sweep Plant ${itemName(catalog, plantableCrop.item_id)}` : "Sweep Plant"}
                disabled={!plantableCrop || emptyPlotIds.length === 0}
                onPress={() =>
                  plantableCrop &&
                  onSendCommand({ type: "sweep_plant", crop_id: plantableCrop.item_id, plot_ids: emptyPlotIds })
                }
              />
              <ActionButton
                label={`Harvest ${harvestMode === "matching_crop" ? "Matching" : "All"}`}
                disabled={readyPlotIds.length === 0}
                onPress={() => onSendCommand({ type: "sweep_harvest", plot_ids: readyPlotIds, harvest_mode: harvestMode })}
              />
              <ActionButton
                label={harvestMode === "matching_crop" ? "Mode: Matching" : "Mode: All Crops"}
                onPress={() => setHarvestMode(harvestMode === "matching_crop" ? "all_crops" : "matching_crop")}
              />
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Build</Text>
            <View style={styles.inlineActions}>
              {buildKinds.map((kind) => {
                const reason = buildDisabledReason(catalog, view, kind);
                return (
                  <ActionButton
                    key={kind}
                    label={reason ? `${buildLabel(kind)} (${reason})` : buildLabel(kind)}
                    disabled={Boolean(reason)}
                    onPress={() => {
                      setBuildKind(buildKind === kind ? null : kind);
                      setMovingStructure(null);
                    }}
                  />
                );
              })}
            </View>
            {buildKind ? (
              <View style={styles.subPanel}>
                <Text style={styles.bodyText}>Open Tiles for {buildLabel(buildKind)}</Text>
                <View style={styles.tileGrid}>
                  {buildCandidates.map((tile) => (
                    <ActionButton key={formatTile(tile)} label={formatTile(tile)} onPress={() => runBuild(buildKind, tile)} />
                  ))}
                  {buildCandidates.length === 0 ? <Text style={styles.warningText}>No valid placement</Text> : null}
                </View>
              </View>
            ) : null}
          </View>

          {movingStructure ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Move {selectedStructureLabel(view, movingStructure)}</Text>
              <View style={styles.tileGrid}>
                {moveCandidates.map((tile) => (
                  <ActionButton key={formatTile(tile)} label={formatTile(tile)} onPress={() => runMove(tile)} />
                ))}
                {moveCandidates.length === 0 ? <Text style={styles.warningText}>No valid placement</Text> : null}
              </View>
              <ActionButton label="Cancel Move" onPress={() => setMovingStructure(null)} />
            </View>
          ) : null}

          <DiagnosticsPanel status={status} serverUrl={serverUrl} diagnostics={diagnostics} compact />
        </ScrollView>
      </View>
    </View>
  );
}

