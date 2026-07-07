import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type {
  CatalogDocument,
  FarmCommand,
  FarmResponse,
  FarmView,
  SweepHarvestMode,
  Tile,
} from "@my-farm/contracts";
import {
  buildFieldMenuModel,
  buildStructureMenuModel,
  itemName,
  machineProductionStatus,
  productionStatusLabel,
  recipeName,
  residentTaskStatus,
  residentWork,
  secondsRemaining,
  selectedMachine,
  selectedPlot,
  selectedResident,
  selectedShelter,
  selectedStructureLabel,
  shelterProductionStatus,
  structureLabel,
  taskLabel,
  type Selection,
  type StructureMenuItem,
  type StructureSelection,
} from "@my-farm/game-model";
import { FarmSceneShell } from "../scene/FarmScene";
import { colors, styles } from "../styles";
import type {
  ActiveFieldTool,
  BuildPlacementState,
  BuildableKind,
  CommandSender,
  HarvestSweepState,
  PlantSweepState,
  ShellProps,
} from "../types";
import {
  activeResident,
  buildDisabledReason,
  buildKinds,
  buildLabel,
  inventoryItem,
  structureKindForBuild,
  structureSelectionFromSelection,
  structureTargetFromSelection,
} from "../utils/farm";

export function FarmScreen({
  status,
  message,
  catalog,
  farm,
  nowMs,
  selection,
  onNavigate,
  onSelect,
  onSendCommand,
}: ShellProps & {
  catalog: CatalogDocument;
  farm: FarmResponse;
  selection: Selection;
  onSelect(selection: Selection): void;
  onSendCommand: CommandSender;
  onResetFarm(): void;
}) {
  const view = farm.view;
  const activeSelection: Selection = selection ?? (view.field_plots[0] ? { type: "plot", id: view.field_plots[0].id } : { type: "farmhouse" });
  const [activeFieldTool, setActiveFieldTool] = useState<ActiveFieldTool>({ type: "default" });
  const [buildToolSelected, setBuildToolSelected] = useState(false);
  const [buildPlacement, setBuildPlacement] = useState<BuildPlacementState>(null);
  const [selectedBuildKind, setSelectedBuildKind] = useState<BuildableKind | null>(null);
  const [movingStructure, setMovingStructure] = useState<StructureSelection | null>(null);
  const [plantSweep, setPlantSweep] = useState<PlantSweepState>(null);
  const [harvestSweep, setHarvestSweep] = useState<HarvestSweepState>(null);
  const [harvestMode, setHarvestMode] = useState<SweepHarvestMode>("matching_crop");
  const [seedMenuOpen, setSeedMenuOpen] = useState(false);
  const [harvestMenuOpen, setHarvestMenuOpen] = useState(false);
  const [residentSwitcherOpen, setResidentSwitcherOpen] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(true);

  const selectedResidentForWork = activeResident(view);
  const plantableCrops = catalog.crops.filter((crop) => crop.unlock_level <= view.level);
  const selectedSeedCropId = activeFieldTool.type === "plant" ? activeFieldTool.cropId : plantableCrops[0]?.item_id ?? null;
  const selectionSummary = mobileSelectionSummary(catalog, view, activeSelection, nowMs);

  useEffect(() => {
    setContextExpanded(true);
  }, [activeSelection?.type, activeSelection && "id" in activeSelection ? activeSelection.id : "fixed"]);

  const clearTransientMenus = () => {
    setSeedMenuOpen(false);
    setHarvestMenuOpen(false);
    setResidentSwitcherOpen(false);
  };

  const send = async (command: FarmCommand) => onSendCommand(command);

  const selectResidentForWork = async (residentId: string) => {
    onSelect({ type: "resident", id: residentId });
    setResidentSwitcherOpen(false);
    if (view.selected_resident_id !== residentId) {
      await send({ type: "select_resident", resident_id: residentId });
    }
  };

  const placeNewStructure = async (tile: Tile) => {
    if (!buildPlacement) {
      return;
    }
    const structureKind = structureKindForBuild(buildPlacement.kind);
    const command: FarmCommand = structureKind
      ? { type: "buy_structure", structure_kind: structureKind, tile }
      : { type: "buy_field_plot", tile };
    const result = await send(command);
    if (result.accepted) {
      setBuildPlacement(null);
      setBuildToolSelected(false);
      setSelectedBuildKind(null);
    }
  };

  const placeMovingStructure = async (tile: Tile) => {
    if (!movingStructure) {
      return;
    }
    const target = structureTargetFromSelection(movingStructure);
    if (!target) {
      setMovingStructure(null);
      return;
    }
    const result = await send({ type: "move_structure", target, tile });
    if (result.accepted) {
      setMovingStructure(null);
    }
  };

  const startPlantSweep = (plotId: string, pointerId: number) => {
    if (activeFieldTool.type !== "plant") {
      return;
    }
    setPlantSweep({ cropId: activeFieldTool.cropId, plotIds: [plotId], pointerId });
    onSelect({ type: "plot", id: plotId });
  };

  const enterPlantSweepPlot = (plotId: string) => {
    setPlantSweep((current) => {
      if (!current || current.plotIds.includes(plotId)) {
        return current;
      }
      return { ...current, plotIds: [...current.plotIds, plotId] };
    });
  };

  const startHarvestSweep = (plotId: string, pointerId: number) => {
    const plot = view.field_plots.find((entry) => entry.id === plotId);
    if (!plot?.crop) {
      return;
    }
    setHarvestSweep({ cropId: plot.crop.item_id, harvestMode, plotIds: [plotId], pointerId });
    onSelect({ type: "plot", id: plotId });
  };

  const enterHarvestSweepPlot = (plotId: string) => {
    setHarvestSweep((current) => {
      if (!current || current.plotIds.includes(plotId)) {
        return current;
      }
      const plot = view.field_plots.find((entry) => entry.id === plotId);
      if (!plot?.crop || (current.harvestMode === "matching_crop" && plot.crop.item_id !== current.cropId)) {
        return current;
      }
      return { ...current, plotIds: [...current.plotIds, plotId] };
    });
  };

  const finishPlantSweep = async () => {
    if (!plantSweep) {
      return;
    }
    const result = await send({ type: "sweep_plant", crop_id: plantSweep.cropId, plot_ids: plantSweep.plotIds });
    if (result.accepted) {
      setPlantSweep(null);
    }
  };

  const finishHarvestSweep = async () => {
    if (!harvestSweep) {
      return;
    }
    const result = await send({
      type: "sweep_harvest",
      harvest_mode: harvestSweep.harvestMode,
      plot_ids: harvestSweep.plotIds,
    });
    if (result.accepted) {
      setHarvestSweep(null);
    }
  };

  return (
    <View style={styles.farmScreen}>
      <FarmSceneShell
        catalog={catalog}
        view={view}
        nowMs={nowMs}
        selection={activeSelection}
        activeFieldTool={activeFieldTool}
        buildPlacement={buildPlacement}
        movingStructure={movingStructure}
        plantSweep={plantSweep}
        harvestSweep={harvestSweep}
        previewResidentPath={null}
        onSelect={onSelect}
        onSelectResident={selectResidentForWork}
        onPlaceNewStructure={placeNewStructure}
        onPlaceStructure={placeMovingStructure}
        onStartPlantSweep={startPlantSweep}
        onEnterPlantSweepPlot={enterPlantSweepPlot}
        onStartHarvestSweep={startHarvestSweep}
        onEnterHarvestSweepPlot={enterHarvestSweepPlot}
      />
      <MobileTopBar catalog={catalog} view={view} status={status} message={message} onOpenMenu={() => onNavigate("menu")} />
      {selectionSummary ? (
        <MobileContextSheet
          catalog={catalog}
          view={view}
          selection={activeSelection}
          nowMs={nowMs}
          summary={selectionSummary}
          expanded={contextExpanded}
          onToggleExpanded={() => setContextExpanded((expanded) => !expanded)}
          onClearSelection={() => onSelect(null)}
          onSendCommand={send}
          onStartMove={(target) => {
            setMovingStructure(target);
            setBuildToolSelected(false);
            setBuildPlacement(null);
          }}
          onNavigate={onNavigate}
        />
      ) : null}
      {residentSwitcherOpen ? (
        <ResidentSwitcher catalog={catalog} view={view} nowMs={nowMs} onSelectResident={selectResidentForWork} />
      ) : null}
      {seedMenuOpen ? (
        <SeedPopover
          catalog={catalog}
          view={view}
          selectedCropId={selectedSeedCropId}
          onPlant={(cropId) => {
            setActiveFieldTool({ type: "plant", cropId });
            setBuildToolSelected(false);
            setSeedMenuOpen(false);
          }}
        />
      ) : null}
      {harvestMenuOpen ? (
        <HarvestPopover
          harvestMode={harvestMode}
          onHarvestMode={(mode) => {
            setHarvestMode(mode);
            setActiveFieldTool({ type: "harvest" });
            setHarvestMenuOpen(false);
          }}
        />
      ) : null}
      {buildToolSelected ? (
        <MobileBuildDock
          catalog={catalog}
          view={view}
          selectedKind={selectedBuildKind}
          buildPlacement={buildPlacement}
          onSelectKind={(kind) => {
            setSelectedBuildKind(kind);
            setBuildPlacement({ kind });
            setMovingStructure(null);
          }}
        />
      ) : null}
      <MobileResidentChip
        catalog={catalog}
        view={view}
        nowMs={nowMs}
        residentName={selectedResidentForWork?.display_name ?? "Resident"}
        expanded={residentSwitcherOpen}
        onPress={() => {
          setResidentSwitcherOpen((open) => !open);
          setSeedMenuOpen(false);
          setHarvestMenuOpen(false);
        }}
      />
      {plantSweep ? (
        <Pressable style={styles.mobileToolStatus} onPress={finishPlantSweep}>
          <Text style={styles.mobileToolStatusText}>{plantSweep.plotIds.length} selected - plant</Text>
        </Pressable>
      ) : harvestSweep ? (
        <Pressable style={styles.mobileToolStatus} onPress={finishHarvestSweep}>
          <Text style={styles.mobileToolStatusText}>{harvestSweep.plotIds.length} selected - harvest</Text>
        </Pressable>
      ) : null}
      <MobileActionBar
        activeFieldTool={activeFieldTool}
        buildToolSelected={buildToolSelected}
        plantDisabled={!plantableCrops.some((crop) => (inventoryItem(view, crop.item_id)?.available_quantity ?? inventoryItem(view, crop.item_id)?.quantity ?? 0) > 0)}
        selectedSeedCropId={selectedSeedCropId}
        onDefault={() => {
          clearTransientMenus();
          setActiveFieldTool({ type: "default" });
          setBuildToolSelected(false);
          setBuildPlacement(null);
          setMovingStructure(null);
        }}
        onPlant={() => {
          setSeedMenuOpen((open) => !open);
          setHarvestMenuOpen(false);
          setResidentSwitcherOpen(false);
        }}
        onHarvest={() => {
          if (activeFieldTool.type === "harvest") {
            setHarvestMenuOpen((open) => !open);
          } else {
            setActiveFieldTool({ type: "harvest" });
          }
          setSeedMenuOpen(false);
          setResidentSwitcherOpen(false);
        }}
        onBuild={() => {
          clearTransientMenus();
          setActiveFieldTool({ type: "default" });
          setBuildToolSelected((selected) => !selected);
        }}
      />
    </View>
  );
}

type MaterialIconName = keyof typeof MaterialCommunityIcons.glyphMap;

function MobileTopBar({
  catalog,
  view,
  status,
  message,
  onOpenMenu,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  status: string;
  message: string;
  onOpenMenu(): void;
}) {
  const progress = levelProgress(catalog, view);
  return (
    <View style={styles.mobileTopBar}>
      <View accessibilityLabel={progress.label} style={styles.levelProgressBadge}>
        <Text style={styles.levelProgressText}>{view.level}</Text>
      </View>
      <HudChip icon="currency-usd" label={`${view.coins} coins`} />
      <View style={styles.storageSummaryChip}>
        <HudChip compact icon="silo" label={`${view.silo_used}/${view.silo_capacity}`} />
        <HudChip compact icon="barn" label={`${view.barn_used}/${view.barn_capacity}`} />
      </View>
      <Text numberOfLines={1} style={styles.mobileNotice}>{hudNoticeMessage(message) ?? status}</Text>
      <Pressable style={styles.mobileMenuButton} onPress={onOpenMenu}>
        <Text style={styles.mobileMenuButtonText}>Menu</Text>
      </Pressable>
    </View>
  );
}

function HudChip({ icon, label, compact = false }: { icon: MaterialIconName; label: string; compact?: boolean }) {
  return (
    <View style={compact ? styles.hudChipCompact : styles.hudChip}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.ink} />
      <Text numberOfLines={1} style={styles.hudChipText}>{label}</Text>
    </View>
  );
}

function MobileContextSheet({
  catalog,
  view,
  selection,
  nowMs,
  summary,
  expanded,
  onToggleExpanded,
  onClearSelection,
  onSendCommand,
  onStartMove,
  onNavigate,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  selection: Selection;
  nowMs: number;
  summary: { kicker: string; heading: string; detail: string };
  expanded: boolean;
  onToggleExpanded(): void;
  onClearSelection(): void;
  onSendCommand: CommandSender;
  onStartMove(target: StructureSelection): void;
  onNavigate: ShellProps["onNavigate"];
}) {
  return (
    <View style={styles.mobileContextSheet}>
      <View style={styles.mobileContextPeek}>
        <View style={styles.grow}>
          <Text style={styles.mobileContextKicker}>{summary.kicker}</Text>
          <Text numberOfLines={1} style={styles.mobileContextTitle}>{summary.heading}</Text>
          <Text numberOfLines={2} style={styles.mobileContextDetail}>{summary.detail}</Text>
        </View>
        <Pressable style={styles.mobileIconButton} onPress={onToggleExpanded}>
          <MaterialCommunityIcons name={expanded ? "chevron-down" : "chevron-up"} size={20} color={colors.ink} />
        </Pressable>
        <Pressable style={styles.mobileIconButton} onPress={onClearSelection}>
          <MaterialCommunityIcons name="close" size={18} color={colors.ink} />
        </Pressable>
      </View>
      {expanded ? (
        <ScrollView style={styles.mobileContextDetails} showsVerticalScrollIndicator={false}>
          <SelectionActions
            catalog={catalog}
            view={view}
            selection={selection}
            nowMs={nowMs}
            onSendCommand={onSendCommand}
            onStartMove={onStartMove}
            onNavigate={onNavigate}
          />
        </ScrollView>
      ) : null}
    </View>
  );
}

function SelectionActions({
  catalog,
  view,
  selection,
  nowMs,
  onSendCommand,
  onStartMove,
  onNavigate,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  selection: Selection;
  nowMs: number;
  onSendCommand: CommandSender;
  onStartMove(target: StructureSelection): void;
  onNavigate: ShellProps["onNavigate"];
}) {
  const plot = selectedPlot(view, selection);
  const structureSelection = structureSelectionFromSelection(selection);
  const fieldMenu = plot ? buildFieldMenuModel(catalog, view, plot, nowMs) : null;
  const structureMenu = structureSelection ? buildStructureMenuModel(catalog, view, structureSelection, nowMs) : null;
  const resident = selectedResident(view, selection);

  return (
    <View style={styles.mobileActionStack}>
      {resident ? <Text style={styles.bodyText}>{resident.display_name}: {residentTaskStatus(catalog, view, resident.id, nowMs).label}</Text> : null}
      {fieldMenu ? (
        <>
          <Text style={styles.panelTitle}>{fieldMenu.title}</Text>
          <View style={styles.inlineActions}>
            {fieldMenu.items.map((item) => (
              <ActionPill key={item.id} label={item.reason ? `${item.label} (${item.reason})` : item.label} disabled={item.disabled} onPress={() => item.command && onSendCommand(item.command)} />
            ))}
          </View>
        </>
      ) : null}
      {structureMenu && structureSelection ? (
        <>
          <Text style={styles.panelTitle}>{structureMenu.title}</Text>
          {structureMenu.subtitle ? <Text style={styles.bodyText}>{structureMenu.subtitle}</Text> : null}
          <View style={styles.inlineActions}>
            {structureMenu.items.map((item) => (
              <ActionPill
                key={item.id}
                label={item.reason ? `${item.label} (${item.reason})` : item.label}
                disabled={item.disabled}
                onPress={() => runStructureMenuItem(item, structureSelection, onSendCommand, onStartMove, onNavigate)}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function runStructureMenuItem(
  item: StructureMenuItem,
  selection: StructureSelection,
  onSendCommand: CommandSender,
  onStartMove: (target: StructureSelection) => void,
  onNavigate: ShellProps["onNavigate"],
) {
  if (item.disabled) {
    return;
  }
  if (item.action === "move_structure") {
    onStartMove(selection);
    return;
  }
  if (item.action === "view_orders") {
    onNavigate("orders");
    return;
  }
  if (item.command) {
    void onSendCommand(item.command);
  }
}

function SeedPopover({
  catalog,
  view,
  selectedCropId,
  onPlant,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  selectedCropId: string | null;
  onPlant(cropId: string): void;
}) {
  return (
    <View style={styles.mobileToolPopover}>
      {catalog.crops.filter((crop) => crop.unlock_level <= view.level).map((crop) => {
        const quantity = inventoryItem(view, crop.item_id)?.available_quantity ?? inventoryItem(view, crop.item_id)?.quantity ?? 0;
        return (
          <Pressable
            key={crop.item_id}
            disabled={quantity < 1}
            style={[styles.mobileToolPopoverItem, selectedCropId === crop.item_id ? styles.mobileToolPopoverItemActive : null, quantity < 1 ? styles.disabledButton : null]}
            onPress={() => onPlant(crop.item_id)}
          >
            <MaterialCommunityIcons name="barley" size={22} color={colors.ink} />
            <Text style={styles.mobileToolPopoverText}>{itemName(catalog, crop.item_id)}</Text>
            <Text style={styles.mobileToolPopoverCount}>{quantity}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function HarvestPopover({ harvestMode, onHarvestMode }: { harvestMode: SweepHarvestMode; onHarvestMode(mode: SweepHarvestMode): void }) {
  return (
    <View style={styles.mobileToolPopover}>
      <ActionPill label="Matching crop" active={harvestMode === "matching_crop"} onPress={() => onHarvestMode("matching_crop")} />
      <ActionPill label="All crops" active={harvestMode === "all_crops"} onPress={() => onHarvestMode("all_crops")} />
    </View>
  );
}

function ResidentSwitcher({
  catalog,
  view,
  nowMs,
  onSelectResident,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  onSelectResident(residentId: string): void;
}) {
  return (
    <View style={styles.mobileResidentSwitcher}>
      {view.residents.map((resident) => {
        const status = residentTaskStatus(catalog, view, resident.id, nowMs);
        return (
          <Pressable key={resident.id} style={styles.mobileResidentRow} onPress={() => onSelectResident(resident.id)}>
            <Text style={styles.panelTitle}>{resident.display_name}</Text>
            <Text style={styles.bodyText}>{status.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MobileBuildDock({
  catalog,
  view,
  selectedKind,
  buildPlacement,
  onSelectKind,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  selectedKind: BuildableKind | null;
  buildPlacement: BuildPlacementState;
  onSelectKind(kind: BuildableKind): void;
}) {
  return (
    <View style={styles.mobileBuildDock}>
      {selectedKind ? (
        <View style={styles.mobileBuildDetail}>
          <Text style={styles.panelTitle}>{buildLabel(selectedKind)}</Text>
          <Text style={styles.bodyText}>{buildPlacement ? "Tap an open farm tile to place." : "Select to place."}</Text>
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileBuildTray}>
        {buildKinds.map((kind) => {
          const reason = buildDisabledReason(catalog, view, kind);
          return (
            <Pressable
              key={kind}
              disabled={Boolean(reason)}
              style={[styles.mobileBuildCard, selectedKind === kind ? styles.mobileBuildCardActive : null, reason ? styles.disabledButton : null]}
              onPress={() => onSelectKind(kind)}
            >
              <Text style={styles.mobileBuildIcon}>{kind === "field_plot" ? "#" : "⌂"}</Text>
              <Text numberOfLines={2} style={styles.mobileBuildTitle}>{buildLabel(kind)}</Text>
              <Text numberOfLines={2} style={styles.mobileBuildMeta}>{reason ?? structureLabelForBuild(kind)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function MobileResidentChip({
  catalog,
  view,
  nowMs,
  residentName,
  expanded,
  onPress,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  residentName: string;
  expanded: boolean;
  onPress(): void;
}) {
  const resident = activeResident(view);
  const status = resident ? residentTaskStatus(catalog, view, resident.id, nowMs) : null;
  return (
    <Pressable accessibilityState={{ expanded }} style={styles.mobileResidentChip} onPress={onPress}>
      <MaterialCommunityIcons name="account" size={18} color={colors.ink} />
      <Text numberOfLines={1} style={styles.mobileResidentChipText}>{residentName}</Text>
      <Text style={styles.mobileResidentQueue}>{status?.queuedCount ?? 0}</Text>
    </Pressable>
  );
}

function MobileActionBar({
  activeFieldTool,
  buildToolSelected,
  plantDisabled,
  selectedSeedCropId,
  onDefault,
  onPlant,
  onHarvest,
  onBuild,
}: {
  activeFieldTool: ActiveFieldTool;
  buildToolSelected: boolean;
  plantDisabled: boolean;
  selectedSeedCropId: string | null;
  onDefault(): void;
  onPlant(): void;
  onHarvest(): void;
  onBuild(): void;
}) {
  return (
    <View style={styles.mobileActionBar}>
      <MobileActionButton label="Select" icon="cursor-default-click" active={!buildToolSelected && activeFieldTool.type === "default"} onPress={onDefault} />
      <MobileActionButton label="Plant" icon={selectedSeedCropId ? "barley" : "sprout"} active={activeFieldTool.type === "plant"} disabled={plantDisabled} onPress={onPlant} />
      <MobileActionButton label="Harvest" icon="content-cut" active={activeFieldTool.type === "harvest"} onPress={onHarvest} />
      <MobileActionButton label="Build" icon="hammer" active={buildToolSelected} onPress={onBuild} />
    </View>
  );
}

function MobileActionButton({ label, icon, active, disabled, onPress }: { label: string; icon: MaterialIconName; active?: boolean; disabled?: boolean; onPress(): void }) {
  return (
    <Pressable disabled={disabled} accessibilityState={{ selected: active, disabled }} style={[styles.mobileActionButton, active ? styles.mobileActionButtonActive : null, disabled ? styles.disabledButton : null]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.ink} />
      <Text numberOfLines={1} style={styles.mobileActionButtonText}>{label}</Text>
    </Pressable>
  );
}

function ActionPill({ label, onPress, disabled = false, active = false }: { label: string; onPress(): void; disabled?: boolean; active?: boolean }) {
  return (
    <Pressable disabled={disabled} style={[styles.actionButton, active ? styles.mobileActionButtonActive : null, disabled ? styles.disabledButton : null]} onPress={onPress}>
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

function mobileSelectionSummary(catalog: CatalogDocument, view: FarmView, selection: Selection, nowMs: number) {
  if (!selection) {
    return null;
  }
  const plot = selectedPlot(view, selection);
  if (plot) {
    if (!plot.crop) {
      return { kicker: "Field Plot", heading: "Empty Field Plot", detail: "Choose Plant, then tap fields to seed." };
    }
    const cropName = itemName(catalog, plot.crop.item_id);
    const ready = plot.crop.ready_at_ms <= nowMs;
    return { kicker: "Field Plot", heading: cropName, detail: ready ? "Ready to harvest." : `${secondsRemaining(plot.crop.ready_at_ms, nowMs)} until ready.` };
  }
  const resident = selectedResident(view, selection);
  if (resident) {
    const status = residentTaskStatus(catalog, view, resident.id, nowMs);
    return { kicker: resident.id === view.selected_resident_id ? "Selected Resident" : "Farm Resident", heading: resident.display_name, detail: status.currentTask ? `${taskLabel(catalog, status.currentTask)} in progress.` : "Idle and ready for work." };
  }
  const structureSelection = structureSelectionFromSelection(selection);
  if (!structureSelection) {
    return null;
  }
  return {
    kicker: "Selection",
    heading: selectedStructureLabel(view, structureSelection),
    detail: mobileStructureSummary(catalog, view, structureSelection, nowMs),
  };
}

function mobileStructureSummary(catalog: CatalogDocument, view: FarmView, selection: StructureSelection, nowMs: number) {
  const machine = selectedMachine(view, selection);
  if (machine) {
    return productionStatusLabel(selectedStructureLabel(view, selection), catalog, machineProductionStatus(catalog, view, machine, nowMs)) ?? "No active production.";
  }
  const shelter = selectedShelter(view, selection);
  if (shelter) {
    return productionStatusLabel(selectedStructureLabel(view, selection), catalog, shelterProductionStatus(catalog, view, shelter, nowMs)) ?? "No active production.";
  }
  if (selection.type === "silo") {
    return `${view.silo_used}/${view.silo_capacity} crops stored.`;
  }
  if (selection.type === "barn") {
    return `${view.barn_used}/${view.barn_capacity} goods stored.`;
  }
  if (selection.type === "delivery_board") {
    return `${view.delivery_orders.length} delivery orders.`;
  }
  if (selection.type === "farmhouse") {
    const first = view.oven.queue[0];
    return first ? `Oven: ${recipeName(catalog, first.recipe_id)}.` : "Enter rooms, inspect upgrades, or start household work.";
  }
  if (selection.type === "farm_shop") {
    return "Manage roadside Shop Stock and Customer Visits.";
  }
  return "Open details for available commands.";
}

function levelProgress(catalog: CatalogDocument, view: FarmView) {
  const currentThreshold = catalog.level_xp[view.level] ?? 0;
  const nextThreshold = catalog.level_xp[view.level + 1] ?? null;
  if (nextThreshold === null || nextThreshold <= currentThreshold) {
    return { percent: 100, label: `Level ${view.level}, ${view.xp} XP` };
  }
  const percent = Math.min(100, Math.max(0, ((view.xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100));
  return { percent, label: `Level ${view.level}, ${Math.round(percent)} percent progress` };
}

function hudNoticeMessage(message: string) {
  if (message === "Farm synced" || message === "Command accepted" || message.startsWith("Connecting")) {
    return null;
  }
  return message;
}

function structureLabelForBuild(kind: BuildableKind) {
  return kind === "field_plot" ? "Crop growing" : structureLabel(kind);
}
