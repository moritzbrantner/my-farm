import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { createFarmClient, type FarmConnectionStatus } from "./api";
import { FarmScene } from "./components/FarmScene";
import { HouseInteriorScene, type HouseInteriorMode, type HouseRoomId } from "./components/HouseInteriorScene";
import { ResourceIcon } from "./components/ResourceIcon";
import {
  availableRecipes,
  builtStructureKinds,
  isTileAvailableForNewFieldPlot,
  isTileAvailableForNewStructure,
  isTileAvailableForStructure,
  itemName,
  recipeName,
  secondsRemaining,
  selectedMachine,
  selectedPlot,
  selectedResident,
  selectedShelter,
  selectedStructureLabel,
  structureLabel,
  type FieldContextMenuState,
  type StructureContextMenuState,
  type StructureSelection,
  type Selection,
} from "./game/selectors";
import {
  buildFieldMenuModel,
  buildStructureMenuModel,
  farmShopMoveDisabledReason,
  farmhouseOvenDisabledReason,
  isStructureTargetPresent,
  type StructureMenuItem,
  type StructureMenuModel,
} from "./game/structureMenu";
import {
  currentResidentScenePath,
  currentResidentScenePose,
  reservedAnimalReason,
  reservedFieldReason,
  reservedMachineReason,
  reservedOvenReason,
  residentWork,
  residentTaskStatus,
  residentTaskStepLabel,
  taskLabel,
} from "./game/residentTasks";
import { decorationPlacementStatus, type RoomTile } from "./game/houseInterior";
import type {
  AnimalShelterState,
  CatalogDocument,
  FarmCommand,
  FarmResident,
  FarmView,
  FieldPlot,
  InventoryItemView,
  ItemStack,
  MachineState,
  MarketItemDef,
  ResidentStepView,
  ResidentTaskSummaryView,
  StructureKind,
  SweepHarvestMode,
} from "./types";

type BuildableStructureKind = Exclude<StructureKind, "silo" | "barn">;
type BuildableKind = "field_plot" | BuildableStructureKind;

const client = createFarmClient();
const demoMode = client.runtime === "wasm_demo";
const fieldPlotBuildCost = 12;
const buildKinds: BuildableKind[] = [
  "field_plot",
  "feed_mill",
  "chicken_coop",
  "delivery_board",
  "farm_shop",
  "cow_pasture",
  "tool_shed",
];

type CommandResult = { accepted: boolean; error: string | null };
type SendCommand = (command: FarmCommand) => Promise<CommandResult>;
type BuildPlacementState = {
  kind: BuildableKind;
} | null;
type StructureBuildCardMeta = {
  kind: BuildableKind;
  role: string;
  accentClass: string;
};
type ActiveFieldTool = { type: "default" } | { type: "plant"; cropId: string } | { type: "harvest" };
type GameScreen = "main_menu" | "playing";
type PlayScene = "farm" | "house_interior";
type MainMenuPanel = "home" | "settings" | "wiki" | "account";
type MarketTradeMode = "buy" | "sell";
type PlantSweepState = {
  cropId: string;
  plotIds: string[];
  pointerId: number;
} | null;
type HarvestSweepState = {
  cropId: string;
  harvestMode: SweepHarvestMode;
  plotIds: string[];
  pointerId: number;
} | null;

const structureBuildCardMetas: Record<BuildableKind, StructureBuildCardMeta> = {
  field_plot: {
    kind: "field_plot",
    role: "Adds another field plot for crop growing.",
    accentClass: "field-plot",
  },
  feed_mill: {
    kind: "feed_mill",
    role: "Mills crops into animal feed.",
    accentClass: "feed-mill",
  },
  chicken_coop: {
    kind: "chicken_coop",
    role: "Houses chickens that produce eggs.",
    accentClass: "chicken-coop",
  },
  delivery_board: {
    kind: "delivery_board",
    role: "Unlocks delivery orders for coins and XP.",
    accentClass: "delivery-board",
  },
  farm_shop: {
    kind: "farm_shop",
    role: "Stocks roadside goods for passing customers.",
    accentClass: "farm-shop",
  },
  cow_pasture: {
    kind: "cow_pasture",
    role: "Houses cows that produce milk.",
    accentClass: "cow-pasture",
  },
  tool_shed: {
    kind: "tool_shed",
    role: "Stores tools for resident work.",
    accentClass: "tool-shed",
  },
};

const guidedTutorialCards = [
  {
    title: "Welcome to your fresh Farm",
    body: "This New Farm starts clean so every crop, coin, and upgrade comes from your next commands.",
  },
  {
    title: "Field Plots and planting",
    body: "Field Plots hold one planted Crop job. Open Seed, choose Wheat, then use empty Field Plots to start growing.",
  },
  {
    title: "Crop timers and harvesting",
    body: "Crops count down until they become Ready Output. Use Harvest when the timer finishes to move crops into storage.",
  },
  {
    title: "Silo storage",
    body: "The Silo stores harvested Crops and has a limited capacity. Keep an eye on it before planting large batches.",
  },
  {
    title: "Coins, XP, and Build progression",
    body: "Delivery Orders and production earn coins and XP. Build progression unlocks more Field Plots, Machines, Shelters, and upgrades.",
  },
] as const;

export function App() {
  const [catalog, setCatalog] = useState<CatalogDocument | null>(null);
  const [view, setView] = useState<FarmView | null>(null);
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [fieldMenu, setFieldMenu] = useState<FieldContextMenuState>(null);
  const [structureMenu, setStructureMenu] = useState<StructureContextMenuState>(null);
  const [activeFieldTool, setActiveFieldTool] = useState<ActiveFieldTool>({ type: "default" });
  const [buildToolSelected, setBuildToolSelected] = useState(false);
  const [buildPlacement, setBuildPlacement] = useState<BuildPlacementState>(null);
  const [selectedBuildKind, setSelectedBuildKind] = useState<BuildableKind | null>(null);
  const [movingStructure, setMovingStructure] = useState<StructureSelection | null>(null);
  const [plantSweep, setPlantSweep] = useState<PlantSweepState>(null);
  const [harvestSweep, setHarvestSweep] = useState<HarvestSweepState>(null);
  const [harvestMode, setHarvestMode] = useState<SweepHarvestMode>("matching_crop");
  const [screen, setScreen] = useState<GameScreen>("main_menu");
  const [playScene, setPlayScene] = useState<PlayScene>("farm");
  const [houseInteriorMode, setHouseInteriorMode] = useState<HouseInteriorMode>("overview");
  const [houseGridEnabled, setHouseGridEnabled] = useState(true);
  const [selectedHouseRoom, setSelectedHouseRoom] = useState<HouseRoomId>("living_room");
  const [selectedDecorationId, setSelectedDecorationId] = useState<string | null>(null);
  const [selectedDecorationPlacementId, setSelectedDecorationPlacementId] = useState<string | null>(null);
  const [guidedTutorialStep, setGuidedTutorialStep] = useState<number | null>(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [message, setMessage] = useState(
    demoMode ? "Loading browser demo..." : "Connecting to local server...",
  );
  const [connectionStatus, setConnectionStatus] = useState<FarmConnectionStatus>(
    demoMode ? "synced" : "disconnected",
  );
  const [nowMs, setNowMs] = useState(Date.now());
  const ordersRef = useRef<HTMLElement | null>(null);
  const versionRef = useRef(0);
  const plantSweepRef = useRef<PlantSweepState>(null);
  const harvestSweepRef = useRef<HarvestSweepState>(null);
  const gameplayPaused = guidedTutorialStep !== null;

  useLayoutEffect(() => {
    versionRef.current = version;
  }, [version]);

  useLayoutEffect(() => {
    plantSweepRef.current = plantSweep;
  }, [plantSweep]);

  useLayoutEffect(() => {
    harvestSweepRef.current = harvestSweep;
  }, [harvestSweep]);

  const applyFarmSnapshot = useCallback(
    (nextVersion: number, nextView: FarmView, options: { force?: boolean } = {}) => {
      if (!options.force && nextVersion < versionRef.current) {
        return false;
      }
      versionRef.current = nextVersion;
      setView(nextView);
      setVersion(nextVersion);
      return true;
    },
    [],
  );

  const load = useCallback(async () => {
    const [catalogResponse, farmResponse] = await Promise.all([client.catalog(), client.farm()]);
    setCatalog(catalogResponse);
    applyFarmSnapshot(farmResponse.version, farmResponse.view);
    setMessage(farmResponse.notice?.message ?? (demoMode ? "Demo farm loaded" : "Local farm synced"));
  }, [applyFarmSnapshot, client, demoMode]);

  useEffect(() => {
    if (!demoMode) {
      return;
    }
    load().catch((error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    if (gameplayPaused) {
      return;
    }
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
      if (!demoMode) {
        return;
      }
      client
        .farm()
        .then((farm) => {
          applyFarmSnapshot(farm.version, farm.view);
          if (farm.notice) {
            setMessage(farm.notice.message);
          }
        })
        .catch((error) => setMessage(error.message));
    }, 2500);
    return () => window.clearInterval(timer);
  }, [applyFarmSnapshot, client, demoMode, gameplayPaused]);

  useEffect(() => {
    if (demoMode || !client.connect) {
      return;
    }
    return client.connect({
      status(status) {
        setConnectionStatus(status);
        if (status === "disconnected") {
          setMessage("Local server disconnected");
        } else if (status === "reconnecting") {
          setMessage("Reconnecting to local server...");
        } else {
          setMessage("Local farm synced");
        }
      },
      catalog(nextCatalog) {
        setCatalog(nextCatalog);
      },
      farm(farm) {
        applyFarmSnapshot(farm.version, farm.view, { force: true });
        if (farm.notice) {
          setMessage(farm.notice.message);
        }
      },
      error(errorMessage) {
        setMessage(errorMessage);
      },
    });
  }, [applyFarmSnapshot, client, demoMode]);

  useEffect(() => {
    if (!view || !structureMenu || isStructureTargetPresent(view, structureMenu.target)) {
      return;
    }
    setStructureMenu(null);
  }, [structureMenu, view]);

  useEffect(() => {
    if (!view || !movingStructure || isStructureTargetPresent(view, movingStructure)) {
      return;
    }
    setMovingStructure(null);
  }, [movingStructure, view]);

  useEffect(() => {
    if (!view || !fieldMenu || view.field_plots.some((plot) => plot.id === fieldMenu.plotId)) {
      return;
    }
    setFieldMenu(null);
  }, [fieldMenu, view]);

  useEffect(() => {
    if (
      !view ||
      !selectedDecorationPlacementId ||
      view.house_interior.rooms.some((room) =>
        room.decoration_placements.some((placement) => placement.id === selectedDecorationPlacementId),
      )
    ) {
      return;
    }
    setSelectedDecorationPlacementId(null);
  }, [selectedDecorationPlacementId, view]);

  useEffect(() => {
    if (
      !fieldMenu &&
      !structureMenu &&
      !buildToolSelected &&
      !buildPlacement &&
      !movingStructure &&
      !plantSweep &&
      !harvestSweep &&
      activeFieldTool.type === "default"
    ) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".farm-context-menu")) {
        return;
      }
      setFieldMenu(null);
      setStructureMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFieldMenu(null);
        setStructureMenu(null);
        setBuildToolSelected(false);
        setBuildPlacement(null);
        setMovingStructure(null);
        plantSweepRef.current = null;
        harvestSweepRef.current = null;
        setPlantSweep(null);
        setHarvestSweep(null);
        setActiveFieldTool({ type: "default" });
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [
    activeFieldTool.type,
    buildPlacement,
    buildToolSelected,
    fieldMenu,
    harvestSweep,
    movingStructure,
    plantSweep,
    structureMenu,
  ]);

  const clearTransientGameplayUi = useCallback(() => {
    setSelection(null);
    setFieldMenu(null);
    setStructureMenu(null);
    setActiveFieldTool({ type: "default" });
    setBuildToolSelected(false);
    setBuildPlacement(null);
    setSelectedBuildKind(null);
    setMovingStructure(null);
    setSelectedDecorationId(null);
    setSelectedDecorationPlacementId(null);
    setMarketOpen(false);
    plantSweepRef.current = null;
    harvestSweepRef.current = null;
    setPlantSweep(null);
    setHarvestSweep(null);
  }, []);

  const select = useCallback((nextSelection: Selection) => {
    setSelection(nextSelection);
    setFieldMenu(null);
    setStructureMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
    plantSweepRef.current = null;
    harvestSweepRef.current = null;
    setPlantSweep(null);
    setHarvestSweep(null);
  }, []);

  const openFieldMenu = useCallback((plotId: string, point: { x: number; y: number }) => {
    setSelection({ type: "plot", id: plotId });
    setStructureMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
    plantSweepRef.current = null;
    harvestSweepRef.current = null;
    setPlantSweep(null);
    setHarvestSweep(null);
    setFieldMenu({ plotId, x: point.x, y: point.y });
  }, []);

  const openStructureMenu = useCallback((target: StructureSelection, point: { x: number; y: number }) => {
    setSelection(target);
    setFieldMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
    plantSweepRef.current = null;
    harvestSweepRef.current = null;
    setPlantSweep(null);
    setHarvestSweep(null);
    setStructureMenu({ target, x: point.x, y: point.y });
  }, []);

  const selectBuildKind = useCallback((kind: BuildableKind, canPlace: boolean) => {
    setSelectedBuildKind(kind);
    setActiveFieldTool({ type: "default" });
    setBuildToolSelected(true);
    setFieldMenu(null);
    setStructureMenu(null);
    setMovingStructure(null);
    plantSweepRef.current = null;
    harvestSweepRef.current = null;
    setPlantSweep(null);
    setHarvestSweep(null);
    if (canPlace) {
      setBuildPlacement({ kind });
      setSelection(null);
      setMessage(`Place ${buildKindLabel(kind)}`);
      return;
    }
    setBuildPlacement(null);
  }, []);

  const inspectBuildKind = useCallback((kind: BuildableKind) => {
    setSelectedBuildKind(kind);
  }, []);

  const send = useCallback(
    async (command: FarmCommand): Promise<CommandResult> => {
      if (gameplayPaused) {
        return { accepted: false, error: "Gameplay is paused" };
      }
      try {
        let response = await client.command({ expected_version: versionRef.current, command });
        if (!response.accepted && response.error?.startsWith("version mismatch")) {
          applyFarmSnapshot(response.version, response.view);
          response = await client.command({ expected_version: response.version, command });
        }
        applyFarmSnapshot(response.version, response.view);
        setMessage(response.notice?.message ?? (response.accepted ? "Command accepted" : response.error ?? "Command rejected"));
        return { accepted: response.accepted, error: response.error };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Command failed";
        setMessage(errorMessage);
        return { accepted: false, error: errorMessage };
      }
    },
    [applyFarmSnapshot, gameplayPaused],
  );

  const selectResidentForWork = useCallback(
    async (residentId: string) => {
      setSelection({ type: "resident", id: residentId });
      setFieldMenu(null);
      setStructureMenu(null);
      setBuildPlacement(null);
      setMovingStructure(null);
      plantSweepRef.current = null;
      harvestSweepRef.current = null;
      setPlantSweep(null);
      setHarvestSweep(null);
      if (!view || view.selected_resident_id === residentId) {
        return;
      }
      await send({ type: "select_resident", resident_id: residentId });
    },
    [send, view],
  );

  const reset = useCallback(async () => {
    const response = await client.reset();
    applyFarmSnapshot(response.version, response.view, { force: true });
    clearTransientGameplayUi();
    setGuidedTutorialStep(0);
    setMessage(response.notice?.message ?? (demoMode ? "Demo farm reset" : "Farm reset"));
  }, [applyFarmSnapshot, clearTransientGameplayUi, client, demoMode]);

  const startNewFarm = useCallback(async () => {
    await reset();
    setScreen("playing");
  }, [reset]);

  const openMainMenu = useCallback(() => {
    setFieldMenu(null);
    setStructureMenu(null);
    setBuildPlacement(null);
    setBuildToolSelected(false);
    setMovingStructure(null);
    plantSweepRef.current = null;
    harvestSweepRef.current = null;
    setPlantSweep(null);
    setHarvestSweep(null);
    setActiveFieldTool({ type: "default" });
    setMarketOpen(false);
    setGuidedTutorialStep(null);
    setScreen("main_menu");
  }, []);

  const openMarket = useCallback(() => {
    if (demoMode) {
      setMessage("Farmers Market is not available in the demo");
      return;
    }
    setMarketOpen(true);
    setFieldMenu(null);
    setStructureMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
    setBuildToolSelected(false);
    plantSweepRef.current = null;
    harvestSweepRef.current = null;
    setPlantSweep(null);
    setHarvestSweep(null);
    setActiveFieldTool({ type: "default" });
    setMessage("Farmers Market open");
  }, []);

  const viewDeliveryOrders = useCallback(() => {
    setSelection({ type: "delivery_board" });
    setFieldMenu(null);
    setStructureMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
    setBuildToolSelected(false);
    plantSweepRef.current = null;
    harvestSweepRef.current = null;
    setPlantSweep(null);
    setHarvestSweep(null);
    window.setTimeout(() => {
      ordersRef.current?.scrollIntoView({ block: "nearest" });
      ordersRef.current?.focus({ preventScroll: true });
    }, 0);
  }, []);

  const startMovingStructure = useCallback(
    (target: StructureSelection) => {
      if (!view) {
        return;
      }
      if (target.type === "farm_shop") {
        const reason = farmShopMoveDisabledReason(view, target.id);
        if (reason) {
          setMessage(reason);
          return;
        }
      }
      setSelection(target);
      setFieldMenu(null);
      setStructureMenu(null);
      setActiveFieldTool({ type: "default" });
      setBuildToolSelected(false);
      setBuildPlacement(null);
      setMovingStructure(target);
      plantSweepRef.current = null;
      harvestSweepRef.current = null;
      setPlantSweep(null);
      setHarvestSweep(null);
      setMessage(`Moving ${selectedStructureLabel(view, target)}`);
    },
    [view],
  );

  const placeMovingStructure = useCallback(
    async (tile: { x: number; y: number }) => {
      if (!view || !movingStructure) {
        return;
      }
      if (movingStructure.type === "farmhouse") {
        setMessage("Farmhouse cannot be moved");
        setMovingStructure(null);
        return;
      }
      if (!isTileAvailableForStructure(view, tile, movingStructure)) {
        setMessage("Tile is occupied");
        return;
      }
      const accepted = await send({ type: "move_structure", target: movingStructure, tile });
      if (accepted.accepted) {
        setMovingStructure(null);
      }
    },
    [movingStructure, send, view],
  );

  const placeNewStructure = useCallback(
    async (tile: { x: number; y: number }) => {
      if (!view || !buildPlacement) {
        return;
      }
      if (buildPlacement.kind === "field_plot") {
        if (!isTileAvailableForNewFieldPlot(view, tile)) {
          setMessage("Tile is occupied");
          return;
        }
        const accepted = await send({ type: "buy_field_plot", tile });
        if (accepted.accepted) {
          setBuildPlacement(null);
        }
        return;
      }
      if (!isTileAvailableForNewStructure(view, tile, buildPlacement.kind)) {
        setMessage("Tile is occupied");
        return;
      }
      const accepted = await send({
        type: "buy_structure",
        structure_kind: buildPlacement.kind,
        tile,
      });
      if (accepted.accepted) {
        setBuildPlacement(null);
      }
    },
    [buildPlacement, send, view],
  );

  const selectDefaultFieldTool = useCallback(() => {
    setActiveFieldTool({ type: "default" });
    setBuildToolSelected(false);
    setFieldMenu(null);
    setStructureMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
    plantSweepRef.current = null;
    harvestSweepRef.current = null;
    setPlantSweep(null);
    setHarvestSweep(null);
    setMessage("Default tool");
  }, []);

  const enterHouseInterior = useCallback(() => {
    setSelection({ type: "farmhouse" });
    setFieldMenu(null);
    setStructureMenu(null);
    setHouseInteriorMode("overview");
    setPlayScene("house_interior");
    setMessage("Entered House Interior");
  }, []);

  const returnToFarmScene = useCallback(() => {
    setPlayScene("farm");
    setMessage("Returned to Farm");
  }, []);

  const selectDecoration = useCallback(
    (decorationId: string) => {
      const decoration = catalog?.decorations.find((entry) => entry.id === decorationId);
      setSelectedDecorationId(decorationId);
      setSelectedDecorationPlacementId(null);
      setMessage(decoration ? `Place ${decoration.name}` : "Place Decoration");
    },
    [catalog],
  );

  const selectHouseRoom = useCallback((roomId: HouseRoomId) => {
    setSelectedHouseRoom(roomId);
    setHouseInteriorMode("room");
    setSelectedDecorationPlacementId(null);
  }, []);

  const exitHouseRoomToOverview = useCallback(() => {
    setHouseInteriorMode("overview");
    setSelectedDecorationId(null);
    setSelectedDecorationPlacementId(null);
    setMessage("House Overview");
  }, []);

  const setHouseGridMode = useCallback((enabled: boolean) => {
    setHouseGridEnabled(enabled);
    if (!enabled) {
      setSelectedDecorationId(null);
      setSelectedDecorationPlacementId(null);
    }
  }, []);

  const selectDecorationPlacement = useCallback(
    (roomId: string, placementId: string) => {
      if (!catalog || !view) {
        return;
      }
      if (view.level < 5) {
        setMessage("Decoration editing unlocks at Farm level 5");
        return;
      }
      const room = view.house_interior.rooms.find((entry) => entry.id === roomId);
      const placement = room?.decoration_placements.find((entry) => entry.id === placementId);
      const decoration = placement
        ? catalog.decorations.find((entry) => entry.id === placement.decoration_id)
        : null;
      if (!room || !placement || !decoration) {
        setMessage("Decoration placement not found");
        return;
      }
      setSelectedDecorationId(null);
      setSelectedDecorationPlacementId(placementId);
      setMessage(`Selected ${decoration.name}`);
    },
    [catalog, view],
  );

  const placeDecoration = useCallback(
    async (roomId: string, decorationId: string, tile: RoomTile) => {
      if (!catalog || !view) {
        return;
      }
      if (view.level < 5) {
        setMessage("Decoration placement unlocks at Farm level 5");
        return;
      }
      const room = view.house_interior.rooms.find((entry) => entry.id === roomId);
      if (!room) {
        setMessage("Room not found");
        return;
      }
      const status = decorationPlacementStatus(catalog, room, decorationId, tile);
      if (!status.fits) {
        setMessage(
          status.reason === "overlap"
            ? "Decoration placement overlaps"
            : "Decoration placement is out of bounds",
        );
        return;
      }
      await send({ type: "place_decoration", room_id: roomId, decoration_id: decorationId, tile });
    },
    [catalog, send, view],
  );

  const moveDecoration = useCallback(
    async (roomId: string, placementId: string, tile: RoomTile) => {
      if (!catalog || !view) {
        return;
      }
      if (view.level < 5) {
        setMessage("Decoration editing unlocks at Farm level 5");
        return;
      }
      const room = view.house_interior.rooms.find((entry) => entry.id === roomId);
      const placement = room?.decoration_placements.find((entry) => entry.id === placementId);
      if (!room || !placement) {
        setMessage("Decoration placement not found");
        return;
      }
      const status = decorationPlacementStatus(catalog, room, placement.decoration_id, tile, {
        ignorePlacementId: placementId,
      });
      if (!status.fits) {
        setMessage(
          status.reason === "overlap"
            ? "Decoration move overlaps"
            : "Decoration move is out of bounds",
        );
        return;
      }
      await send({ type: "move_decoration", room_id: roomId, placement_id: placementId, tile });
    },
    [catalog, send, view],
  );

  const removeDecoration = useCallback(
    async (roomId: string, placementId: string) => {
      if (!view) {
        return;
      }
      if (view.level < 5) {
        setMessage("Decoration editing unlocks at Farm level 5");
        return;
      }
      const accepted = await send({ type: "remove_decoration", room_id: roomId, placement_id: placementId });
      if (accepted.accepted) {
        setSelectedDecorationPlacementId(null);
      }
    },
    [send, view],
  );

  const renameResident = useCallback(
    async (residentId: string, displayName: string) => {
      return send({
        type: "rename_resident",
        resident_id: residentId,
        display_name: displayName.trim(),
      });
    },
    [send],
  );

  const selectPlantFieldTool = useCallback(
    (cropId: string) => {
      setActiveFieldTool({ type: "plant", cropId });
      setBuildToolSelected(false);
      setFieldMenu(null);
      setStructureMenu(null);
      setBuildPlacement(null);
      setMovingStructure(null);
      plantSweepRef.current = null;
      harvestSweepRef.current = null;
      setPlantSweep(null);
      setHarvestSweep(null);
      setMessage(`Seed tool: ${itemName(catalog, cropId)}`);
    },
    [catalog],
  );

  const selectHarvestFieldTool = useCallback(() => {
    setActiveFieldTool({ type: "harvest" });
    setBuildToolSelected(false);
    setFieldMenu(null);
    setStructureMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
    plantSweepRef.current = null;
    harvestSweepRef.current = null;
    setPlantSweep(null);
    setHarvestSweep(null);
    setMessage(
      harvestMode === "all_crops" ? "Harvest tool: all ready crops" : "Harvest tool: matching crop",
    );
  }, [harvestMode]);

  const selectHarvestMode = useCallback(
    (mode: SweepHarvestMode) => {
      setHarvestMode(mode);
      setActiveFieldTool({ type: "harvest" });
      setBuildToolSelected(false);
      setFieldMenu(null);
      setStructureMenu(null);
      setBuildPlacement(null);
      setMovingStructure(null);
      plantSweepRef.current = null;
      harvestSweepRef.current = null;
      setPlantSweep(null);
      setHarvestSweep(null);
      setMessage(
        mode === "all_crops" ? "Harvest tool: all ready crops" : "Harvest tool: matching crop",
      );
    },
    [],
  );

  const selectBuildTool = useCallback(() => {
    setActiveFieldTool({ type: "default" });
    setBuildToolSelected(true);
    setFieldMenu(null);
    setStructureMenu(null);
    setMovingStructure(null);
    plantSweepRef.current = null;
    harvestSweepRef.current = null;
    setPlantSweep(null);
    setHarvestSweep(null);
    setMessage("Build tool");
  }, []);

  const cancelFieldToolAction = useCallback(() => {
    plantSweepRef.current = null;
    harvestSweepRef.current = null;
    setPlantSweep(null);
    setHarvestSweep(null);
    setFieldMenu(null);
    setStructureMenu(null);
    setActiveFieldTool({ type: "default" });
    setMessage("Field tool cancelled");
  }, []);

  const startPlantSweep = useCallback(
    (plotId: string, pointerId: number) => {
      if (!view || activeFieldTool.type !== "plant") {
        return;
      }
      const plot = view.field_plots.find((entry) => entry.id === plotId);
      const inventory = new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)]));
      const reservedReason = reservedFieldReason(view, plotId);
      if (reservedReason) {
        setMessage(reservedReason);
        return;
      }
      if (plot?.crop || (inventory.get(activeFieldTool.cropId) ?? 0) < 1) {
        return;
      }
      setSelection({ type: "plot", id: plotId });
      setFieldMenu(null);
      setStructureMenu(null);
      setBuildPlacement(null);
      setMovingStructure(null);
      harvestSweepRef.current = null;
      setHarvestSweep(null);
      setPlantSweep((current) => {
        let next: PlantSweepState;
        if (
          current &&
          current.pointerId === pointerId &&
          current.cropId === activeFieldTool.cropId
        ) {
          next = current.plotIds.includes(plotId)
            ? current
            : { ...current, plotIds: [...current.plotIds, plotId] };
        } else {
          next = {
            cropId: activeFieldTool.cropId,
            plotIds: [plotId],
            pointerId,
          };
        }
        plantSweepRef.current = next;
        return next;
      });
    },
    [activeFieldTool, view],
  );

  const enterPlantSweepPlot = useCallback(
    (plotId: string) => {
      if (!view) {
        return;
      }
      setPlantSweep((current) => {
        if (!current || current.plotIds.includes(plotId)) {
          plantSweepRef.current = current;
          return current;
        }
        const plot = view.field_plots.find((entry) => entry.id === plotId);
        const inventory = view.inventory.find((item) => item.item_id === current.cropId)?.quantity ?? 0;
        if (plot?.crop || reservedFieldReason(view, plotId) || current.plotIds.length >= inventory) {
          plantSweepRef.current = current;
          return current;
        }
        const next = { ...current, plotIds: [...current.plotIds, plotId] };
        plantSweepRef.current = next;
        return next;
      });
    },
    [view],
  );

  const finishPlantSweep = useCallback(async () => {
    const sweep = plantSweepRef.current;
    if (!sweep) {
      return;
    }
    const { cropId, plotIds } = sweep;
    plantSweepRef.current = null;
    setPlantSweep(null);
    const accepted = await send({ type: "sweep_plant", crop_id: cropId, plot_ids: plotIds });
    if (accepted.accepted) {
      setSelection({ type: "plot", id: plotIds[0] });
      setFieldMenu(null);
      setStructureMenu(null);
      setBuildPlacement(null);
      setBuildToolSelected(false);
    }
  }, [send]);

  const startHarvestSweep = useCallback(
    (plotId: string, pointerId: number) => {
      if (!view) {
        return;
      }
      const plot = view.field_plots.find((entry) => entry.id === plotId);
      const reservedReason = reservedFieldReason(view, plotId);
      if (reservedReason) {
        setMessage(reservedReason);
        return;
      }
      if (!plot?.crop || plot.crop.ready_at_ms > nowMs) {
        return;
      }
      const cropId = plot.crop.item_id;
      setSelection({ type: "plot", id: plotId });
      setFieldMenu(null);
      setStructureMenu(null);
      setBuildPlacement(null);
      setMovingStructure(null);
      plantSweepRef.current = null;
      setPlantSweep(null);
      setHarvestSweep((current) => {
        let next: HarvestSweepState;
        if (
          current &&
          current.pointerId === pointerId &&
          current.harvestMode === harvestMode &&
          (harvestMode === "all_crops" || current.cropId === cropId)
        ) {
          next = current.plotIds.includes(plotId)
            ? current
            : { ...current, plotIds: [...current.plotIds, plotId] };
        } else {
          next = {
            cropId,
            harvestMode,
            plotIds: [plotId],
            pointerId,
          };
        }
        harvestSweepRef.current = next;
        return next;
      });
    },
    [harvestMode, nowMs, view],
  );

  const enterHarvestSweepPlot = useCallback(
    (plotId: string) => {
      if (!view) {
        return;
      }
      setHarvestSweep((current) => {
        if (!current || current.plotIds.includes(plotId)) {
          harvestSweepRef.current = current;
          return current;
        }
        const plot = view.field_plots.find((entry) => entry.id === plotId);
        if (
          !plot?.crop ||
          reservedFieldReason(view, plotId) ||
          plot.crop.ready_at_ms > nowMs ||
          (current.harvestMode === "matching_crop" && plot.crop.item_id !== current.cropId)
        ) {
          harvestSweepRef.current = current;
          return current;
        }
        const next = { ...current, plotIds: [...current.plotIds, plotId] };
        harvestSweepRef.current = next;
        return next;
      });
    },
    [nowMs, view],
  );

  const finishHarvestSweep = useCallback(async () => {
    const sweep = harvestSweepRef.current;
    if (!sweep) {
      return;
    }
    const { harvestMode, plotIds } = sweep;
    harvestSweepRef.current = null;
    setHarvestSweep(null);
    const accepted = await send({ type: "sweep_harvest", harvest_mode: harvestMode, plot_ids: plotIds });
    if (accepted.accepted) {
      setSelection({ type: "plot", id: plotIds[0] });
      setFieldMenu(null);
      setStructureMenu(null);
      setBuildPlacement(null);
      setBuildToolSelected(false);
    }
  }, [send]);

  useEffect(() => {
    if (activeFieldTool.type === "default" && !plantSweep && !harvestSweep) {
      return;
    }
    const finish = (event: PointerEvent) => {
      const currentPlantSweep = plantSweepRef.current;
      if (currentPlantSweep && event.pointerId === currentPlantSweep.pointerId) {
        void finishPlantSweep();
        return;
      }
      const currentHarvestSweep = harvestSweepRef.current;
      if (currentHarvestSweep && event.pointerId === currentHarvestSweep.pointerId) {
        void finishHarvestSweep();
      }
    };
    const cancelOnContextMenu = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(".field-tools")) {
        return;
      }
      if (
        activeFieldTool.type === "default" &&
        !plantSweepRef.current &&
        !harvestSweepRef.current
      ) {
        return;
      }
      event.preventDefault();
      cancelFieldToolAction();
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("contextmenu", cancelOnContextMenu);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("contextmenu", cancelOnContextMenu);
    };
  }, [
    activeFieldTool.type,
    cancelFieldToolAction,
    finishHarvestSweep,
    finishPlantSweep,
    harvestSweep,
    plantSweep,
  ]);

  if (!view || !catalog) {
    return (
      <main className="app loading">
        <p>{message}</p>
      </main>
    );
  }

  const appToolClass = buildPlacement
    ? "app--tool-place"
    : movingStructure
      ? "app--tool-move"
      : activeFieldTool.type === "plant"
        ? "app--tool-seed"
        : activeFieldTool.type === "harvest"
          ? "app--tool-harvest"
          : "app--tool-default";
  const fullMenuModel = fieldMenu
    ? buildFieldMenuModel(
        catalog,
        view,
        view.field_plots.find((plot) => plot.id === fieldMenu.plotId) ?? view.field_plots[0],
        nowMs,
      )
    : structureMenu
      ? buildStructureMenuModel(catalog, view, structureMenu.target, nowMs)
      : null;
  const menuModel = demoMode && fullMenuModel ? demoMenuModel(fullMenuModel) : fullMenuModel;
  const menuPoint = fieldMenu ?? structureMenu;
  const selectedPath = selection?.type === "resident"
    ? currentResidentScenePath(view, selection.id, nowMs)
    : null;

  return (
    <main className={`app ${appToolClass}`}>
      <div className="gameplay-surface" {...(gameplayPaused ? { inert: "" } : {})}>
        {screen === "playing" && playScene === "house_interior" ? (
          <HouseInteriorScene
            catalog={catalog}
            view={view}
            nowMs={nowMs}
            mode={houseInteriorMode}
            selectedRoom={selectedHouseRoom}
            gridEnabled={houseGridEnabled}
            selectedDecorationId={selectedDecorationId}
            selectedPlacementId={selectedDecorationPlacementId}
            onSelectRoom={selectHouseRoom}
            onExitRoomToOverview={exitHouseRoomToOverview}
            onSetGridEnabled={setHouseGridMode}
            onSelectDecoration={selectDecoration}
            onSelectPlacement={selectDecorationPlacement}
            onPlaceDecoration={placeDecoration}
            onMoveDecoration={moveDecoration}
            onRemoveDecoration={removeDecoration}
            onRenameResident={renameResident}
            onRunCommand={send}
            onBackToFarm={returnToFarmScene}
          />
        ) : (
          <FarmScene
            catalog={catalog}
            view={view}
            nowMs={nowMs}
            visualClockPaused={gameplayPaused}
            selection={selection}
            activeFieldTool={activeFieldTool}
            buildPlacement={buildPlacement}
            movingStructure={movingStructure}
            plantSweep={plantSweep}
            harvestSweep={harvestSweep}
            onSelect={select}
            onSelectResident={selectResidentForWork}
            onOpenFieldMenu={openFieldMenu}
            onOpenStructureMenu={openStructureMenu}
            onPlaceNewStructure={placeNewStructure}
            onPlaceStructure={placeMovingStructure}
            onStartPlantSweep={startPlantSweep}
            onEnterPlantSweepPlot={enterPlantSweepPlot}
            onStartHarvestSweep={startHarvestSweep}
            onEnterHarvestSweepPlot={enterHarvestSweepPlot}
            onCancelFieldToolAction={cancelFieldToolAction}
            onEnterHouseInterior={enterHouseInterior}
          />
        )}
        {screen === "playing" && playScene === "farm" && selectedPath ? (
          <div
            className="resident-path-marker"
            data-testid={`resident-path-${selectedPath.residentId}`}
            data-path-tile-count={selectedPath.tiles.length}
            aria-hidden="true"
          />
        ) : null}
        {screen === "playing" ? (
          playScene === "farm" ? (
            <>
              <TopBar
                view={view}
                message={message}
                connectionStatus={connectionStatus}
                onOpenMenu={openMainMenu}
              />
              <aside className="side-panel">
                <PanelHeader view={view} version={version} onReset={reset} demoMode={demoMode} />
                <ResidentSelector
                  catalog={catalog}
                  view={view}
                  nowMs={nowMs}
                  onSelectResident={selectResidentForWork}
                />
                <SelectionPanel
                  catalog={catalog}
                  view={view}
                  selection={selection}
                  nowMs={nowMs}
                  send={send}
                  demoMode={demoMode}
                  onClearSelection={() => setSelection(null)}
                />
                <Inventory catalog={catalog} view={view} selection={selection} send={send} demoMode={demoMode} />
                {!demoMode ? <MarketLauncher marketOpen={marketOpen} onOpenMarket={openMarket} /> : null}
                <FieldTools
                  catalog={catalog}
                  view={view}
                  activeFieldTool={activeFieldTool}
                  buildToolSelected={buildToolSelected}
                  harvestMode={harvestMode}
                  plantSweep={plantSweep}
                  onDefault={selectDefaultFieldTool}
                  onPlant={selectPlantFieldTool}
                  onHarvest={selectHarvestFieldTool}
                  onHarvestMode={selectHarvestMode}
                  onBuild={selectBuildTool}
                />
                {!demoMode && selection?.type === "delivery_board" ? (
                  <Orders catalog={catalog} view={view} send={send} ordersRef={ordersRef} />
                ) : null}
              </aside>
              {!demoMode && marketOpen ? (
                <FarmersMarket
                  catalog={catalog}
                  view={view}
                  send={send}
                  onClose={() => setMarketOpen(false)}
                />
              ) : null}
              {buildToolSelected ? (
                <BuildTray
                  catalog={catalog}
                  view={view}
                  selectedKind={selectedBuildKind}
                  buildPlacement={buildPlacement}
                  demoMode={demoMode}
                  onInspectKind={inspectBuildKind}
                  onSelectKind={selectBuildKind}
                />
              ) : null}
            </>
          ) : null
        ) : (
          <MainMenu
            view={view}
            message={message}
            demoMode={demoMode}
            onContinue={() => setScreen("playing")}
            onNewFarm={startNewFarm}
          />
        )}
        {screen === "playing" && menuPoint && menuModel ? (
          <StructureContextMenu
            targetType={structureMenu ? "structure" : "field"}
            model={menuModel}
            x={menuPoint.x}
            y={menuPoint.y}
            onClose={() => {
              setFieldMenu(null);
              setStructureMenu(null);
            }}
            onCommand={async (command) => {
              const accepted = await send(command);
              if (accepted.accepted) {
                setFieldMenu(null);
                setStructureMenu(null);
              }
            }}
            onStartMove={() => {
              if (structureMenu) {
                startMovingStructure(structureMenu.target);
              }
            }}
            onViewOrders={viewDeliveryOrders}
          />
        ) : null}
      </div>
      {guidedTutorialStep !== null ? (
        <GuidedTutorial
          step={guidedTutorialStep}
          onGotIt={() => {
            setGuidedTutorialStep((currentStep) => {
              if (currentStep === null || currentStep >= guidedTutorialCards.length - 1) {
                return null;
              }
              return currentStep + 1;
            });
          }}
        />
      ) : null}
    </main>
  );
}

function demoMenuModel(model: StructureMenuModel): StructureMenuModel {
  return {
    ...model,
    items: model.items.filter((item) => !item.id.startsWith("upgrade-") && item.id !== "view-orders"),
  };
}

function MainMenu({
  view,
  message,
  demoMode,
  onContinue,
  onNewFarm,
}: {
  view: FarmView;
  message: string;
  demoMode: boolean;
  onContinue: () => void;
  onNewFarm: () => void;
}) {
  const [panel, setPanel] = useState<MainMenuPanel>("home");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const openHome = () => setPanel("home");

  return (
    <section className="main-menu" aria-label="Main menu">
      <div className="main-menu__panel">
        {panel === "home" ? (
          <>
            <div className="main-menu__title">
              <span>{demoMode ? "Browser Demo" : "Local Farm"}</span>
              <h1>My Farm</h1>
            </div>
            <div className="main-menu__stats" aria-label="Farm status">
              <Metric type="level" label={`Level ${view.level}`} />
              <Metric type="coins" label={`${view.coins} coins`} />
              <Metric type="silo" label={`Silo ${view.silo_used}/${view.silo_capacity}`} />
              <Metric type="barn" label={`Barn ${view.barn_used}/${view.barn_capacity}`} />
            </div>
            <div className="main-menu__actions">
              <button className="main-menu__primary" type="button" onClick={onContinue}>
                Start Farm
              </button>
              <button type="button" onClick={onNewFarm}>
                New Farm
              </button>
            </div>
            <nav className="main-menu__options" aria-label="Main menu options">
              <button type="button" onClick={() => setPanel("settings")}>
                Settings
              </button>
              <button type="button" onClick={() => setPanel("wiki")}>
                Wiki
              </button>
              <button type="button" onClick={() => setPanel("account")}>
                Account
              </button>
            </nav>
            <small>{message}</small>
          </>
        ) : null}
        {panel === "settings" ? (
          <MainMenuSubpanel title="Settings" onBack={openHome}>
            <div className="main-menu__settings">
              <label>
                <span>Sound</span>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(event) => setSoundEnabled(event.target.checked)}
                />
              </label>
              <label>
                <span>Notifications</span>
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={(event) => setNotificationsEnabled(event.target.checked)}
                />
              </label>
              <label>
                <span>Reduced Motion</span>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(event) => setReducedMotion(event.target.checked)}
                />
              </label>
            </div>
          </MainMenuSubpanel>
        ) : null}
        {panel === "wiki" ? (
          <MainMenuSubpanel title="Wiki" onBack={openHome}>
            <dl className="main-menu__wiki">
              <div>
                <dt>Field Plot</dt>
                <dd>A tile that holds one planted crop job.</dd>
              </div>
              <div>
                <dt>Crop</dt>
                <dd>A harvestable plant stored in the silo.</dd>
              </div>
              <div>
                <dt>Machine</dt>
                <dd>A structure with a recipe queue for farm products.</dd>
              </div>
              <div>
                <dt>{demoMode ? "Demo Farm" : "Delivery Order"}</dt>
                <dd>
                  {demoMode
                    ? "A browser-local farm saved on this device."
                    : "A request that pays coins and XP for goods."}
                </dd>
              </div>
              {!demoMode ? (
                <div>
                  <dt>Storage Upgrade</dt>
                  <dd>A coin purchase that raises Silo or Barn capacity after reaching its unlock level.</dd>
                </div>
              ) : null}
            </dl>
          </MainMenuSubpanel>
        ) : null}
        {panel === "account" ? (
          <MainMenuSubpanel title="Account" onBack={openHome}>
            <div className="main-menu__account">
              <strong>Local Player</strong>
              <span>Farm level {view.level}</span>
              <span>{view.xp} XP earned</span>
              <span>{demoMode ? "Browser-local save" : `${view.delivery_orders.length} delivery orders`}</span>
              <button className="main-menu__primary" type="button" onClick={onContinue}>
                Continue
              </button>
            </div>
          </MainMenuSubpanel>
        ) : null}
      </div>
    </section>
  );
}

function GuidedTutorial({ step, onGotIt }: { step: number; onGotIt: () => void }) {
  const card = guidedTutorialCards[step];
  const progress = `Step ${step + 1} of ${guidedTutorialCards.length}`;

  return (
    <div className="guided-tutorial-backdrop">
      <section
        className="guided-tutorial"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-tutorial-title"
        aria-describedby="guided-tutorial-copy"
      >
        <div className="guided-tutorial__eyebrow">{progress}</div>
        <h2 id="guided-tutorial-title">Guided Tutorial</h2>
        <h3>{card.title}</h3>
        <p id="guided-tutorial-copy">{card.body}</p>
        <button className="guided-tutorial__primary" type="button" onClick={onGotIt} autoFocus>
          Got it
        </button>
      </section>
    </div>
  );
}

function MainMenuSubpanel({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="main-menu__subheader">
        <div className="main-menu__title">
          <span>My Farm</span>
          <h1>{title}</h1>
        </div>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </div>
      {children}
    </>
  );
}

function TopBar({
  view,
  message,
  connectionStatus,
  onOpenMenu,
}: {
  view: FarmView;
  message: string;
  connectionStatus: FarmConnectionStatus;
  onOpenMenu: () => void;
}) {
  return (
    <header className="top-bar">
      <strong>My Farm</strong>
      <Metric type="level" label={`Level ${view.level}`} />
      <Metric type="xp" label={`${view.xp} XP`} />
      <Metric type="coins" label={`${view.coins} coins`} />
      <Metric type="silo" label={`Silo ${view.silo_used}/${view.silo_capacity}`} />
      <Metric type="barn" label={`Barn ${view.barn_used}/${view.barn_capacity}`} />
      <ConnectionStatus status={connectionStatus} />
      <small>{message}</small>
      <button className="top-bar__menu-button" type="button" onClick={onOpenMenu}>
        Menu
      </button>
    </header>
  );
}

function ConnectionStatus({ status }: { status: FarmConnectionStatus }) {
  const label =
    status === "synced"
      ? "Synced"
      : status === "reconnecting"
        ? "Reconnecting"
        : "Disconnected";

  return (
    <span className={`connection-status connection-status--${status}`} aria-label={`Connection ${label}`}>
      {label}
    </span>
  );
}

function Metric({
  type,
  label,
}: {
  type: "coins" | "xp" | "level" | "silo" | "barn";
  label: string;
}) {
  return (
    <span className="metric">
      <ResourceIcon type={type} />
      {label}
    </span>
  );
}

function PanelHeader({
  view,
  version,
  onReset,
  demoMode,
}: {
  view: FarmView;
  version: number;
  onReset: () => void;
  demoMode: boolean;
}) {
  return (
    <section className="panel-section compact">
      <div>
        <h1>Farm Control</h1>
        <p>
          Save v{version}
          {demoMode ? " - browser demo" : ` - ${view.delivery_orders.length} orders`}
        </p>
      </div>
      <button type="button" onClick={onReset}>
        Reset
      </button>
    </section>
  );
}

function MarketLauncher({
  marketOpen,
  onOpenMarket,
}: {
  marketOpen: boolean;
  onOpenMarket: () => void;
}) {
  return (
    <section className="panel-section compact market-launcher">
      <div>
        <h2>Farmers Market</h2>
        <p>Buy and sell unlocked goods.</p>
      </div>
      <button
        type="button"
        onClick={onOpenMarket}
        aria-pressed={marketOpen}
        aria-label="Open Farmers Market"
      >
        Open
      </button>
    </section>
  );
}

function ResidentSelector({
  catalog,
  view,
  nowMs,
  onSelectResident,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  onSelectResident: (residentId: string) => void;
}) {
  const residents = view.residents.slice(0, 2);

  return (
    <section className="panel-section resident-selector" aria-label="Farm Residents">
      <h2>Farm Residents</h2>
      <div className="resident-selector__list">
        {residents.map((resident) => (
          <ResidentCard
            key={resident.id}
            catalog={catalog}
            view={view}
            resident={resident}
            selected={resident.id === view.selected_resident_id}
            nowMs={nowMs}
            onSelectResident={onSelectResident}
          />
        ))}
      </div>
    </section>
  );
}

function ResidentCard({
  catalog,
  view,
  resident,
  selected,
  nowMs,
  onSelectResident,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  resident: FarmResident;
  selected: boolean;
  nowMs: number;
  onSelectResident: (residentId: string) => void;
}) {
  const status = residentTaskStatus(catalog, view, resident.id, nowMs);
  const work = residentWork(view, resident.id);

  const selectResident = async () => {
    await onSelectResident(resident.id);
  };

  return (
    <article className={selected ? "resident-card resident-card--selected" : "resident-card"}>
      <div className="resident-card__topline">
        <strong>{selected ? "Selected Resident" : "Farm Resident"}</strong>
        <button type="button" disabled={selected} onClick={() => void selectResident()}>
          {selected ? "Selected" : "Select"}
        </button>
      </div>
      <strong className="resident-card__display-name">{resident.display_name}</strong>
      <dl className="resident-card__status">
        <div>
          <dt>Current task</dt>
          <dd>{status.label}</dd>
        </div>
        <div>
          <dt>Queued tasks</dt>
          <dd>{status.queuedCount}</dd>
        </div>
      </dl>
      {status.currentTask ? (
        <div className="resident-task-progress">
          <progress value={status.progress} max={1} aria-label={`${resident.display_name} task progress`} />
          <span>{Math.round(status.progress * 100)}%</span>
        </div>
      ) : null}
      <ResidentCarrySummary work={work} compact />
    </article>
  );
}

function FarmersMarket({
  catalog,
  view,
  send,
  onClose,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  send: SendCommand;
  onClose: () => void;
}) {
  const [selectedItemId, setSelectedItemId] = useState(catalog.market_items[0]?.item_id ?? "");
  const [tradeMode, setTradeMode] = useState<MarketTradeMode>("buy");
  const [quantityInput, setQuantityInput] = useState("1");
  const inventory = new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)]));
  const itemKinds = new Map(catalog.items.map((item) => [item.id, item.kind]));
  const selectedMarketItem =
    catalog.market_items.find((marketItem) => marketItem.item_id === selectedItemId) ??
    catalog.market_items[0];

  useEffect(() => {
    if (!catalog.market_items.some((marketItem) => marketItem.item_id === selectedItemId)) {
      setSelectedItemId(catalog.market_items[0]?.item_id ?? "");
    }
  }, [catalog.market_items, selectedItemId]);

  const marketItemDetails = (marketItem: MarketItemDef) => {
    const item = resourceItem(catalog, marketItem.item_id, inventory.get(marketItem.item_id) ?? 0);
    const storage =
      itemKinds.get(marketItem.item_id) === "crop"
        ? {
            label: "Silo",
            used: view.silo_used,
            capacity: view.silo_capacity,
          }
        : {
            label: "Barn",
            used: view.barn_used,
            capacity: view.barn_capacity,
          };
    return { item, storage };
  };

  const selectMarketItem = (itemId: string) => {
    setSelectedItemId(itemId);
  };

  if (!selectedMarketItem) {
    return null;
  }

  const selectedDetails = marketItemDetails(selectedMarketItem);

  return (
    <section className="panel-section farmers-market" aria-label="Farmers Market">
      <div className="farmers-market__header">
        <div>
          <h2>Farmers Market</h2>
          <p>Select a resource, then choose whether to buy or sell.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Farmers Market">
          Close
        </button>
      </div>
      <div className="market-list" aria-label="Market resources">
        {catalog.market_items.map((marketItem) => {
          const { item } = marketItemDetails(marketItem);
          return (
            <MarketResourceButton
              key={marketItem.item_id}
              item={item}
              marketItem={marketItem}
              level={view.level}
              selected={marketItem.item_id === selectedMarketItem.item_id}
              onSelect={selectMarketItem}
            />
          );
        })}
      </div>
      <MarketTradePanel
        item={selectedDetails.item}
        marketItem={selectedMarketItem}
        level={view.level}
        coins={view.coins}
        storage={selectedDetails.storage}
        tradeMode={tradeMode}
        quantityInput={quantityInput}
        onTradeMode={setTradeMode}
        onQuantityInput={setQuantityInput}
        send={send}
      />
    </section>
  );
}

function MarketResourceButton({
  item,
  marketItem,
  level,
  selected,
  onSelect,
}: {
  item: InventoryItemView;
  marketItem: MarketItemDef;
  level: number;
  selected: boolean;
  onSelect: (itemId: string) => void;
}) {
  const locked = level < marketItem.unlock_level;
  const status = locked ? `Unlocks at level ${marketItem.unlock_level}` : null;

  return (
    <button
      type="button"
      className={selected ? "market-item market-item--selected" : "market-item"}
      data-testid={`market-item-${marketItem.item_id}`}
      aria-pressed={selected}
      aria-label={`Select ${item.name}`}
      onClick={() => onSelect(marketItem.item_id)}
    >
      <span className="market-item__identity">
        <ResourceIcon type="item" itemId={item.item_id} itemKind={item.kind} />
        <span>
          <strong>{item.name}</strong>
          <span>Owned {item.quantity}</span>
        </span>
      </span>
      <span className="market-item__prices">
        <span>{marketItem.buy_price === null ? "Buy unavailable" : `Buy ${marketItem.buy_price} coins`}</span>
        <span>{marketItem.sell_price === null ? "Sell unavailable" : `Sell ${marketItem.sell_price} coins`}</span>
      </span>
      {status ? <small className="market-item__status">{status}</small> : null}
    </button>
  );
}

function MarketTradePanel({
  item,
  marketItem,
  level,
  coins,
  storage,
  tradeMode,
  quantityInput,
  onTradeMode,
  onQuantityInput,
  send,
}: {
  item: InventoryItemView;
  marketItem: MarketItemDef;
  level: number;
  coins: number;
  storage: { label: string; used: number; capacity: number };
  tradeMode: MarketTradeMode;
  quantityInput: string;
  onTradeMode: (mode: MarketTradeMode) => void;
  onQuantityInput: (value: string) => void;
  send: SendCommand;
}) {
  const quantity = Number(quantityInput);
  const commandQuantity = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
  const locked = level < marketItem.unlock_level;
  const storageRoom = Math.max(0, storage.capacity - storage.used);
  const buyReason = buyMarketDisabledReason(marketItem, locked, quantity, coins, storageRoom, storage.label);
  const sellReason = sellMarketDisabledReason(marketItem, locked, quantity, item.quantity);
  const buyTotal = marketItem.buy_price === null ? null : marketItem.buy_price * commandQuantity;
  const sellTotal = marketItem.sell_price === null ? null : marketItem.sell_price * commandQuantity;
  const activeReason = tradeMode === "buy" ? buyReason : sellReason;
  const activeTotal = tradeMode === "buy" ? buyTotal : sellTotal;
  const activeVerb = tradeMode === "buy" ? "Buy" : "Sell";
  const activeTitle =
    activeReason ??
    (tradeMode === "buy" ? `Spend ${activeTotal} coins` : `Gain ${activeTotal} coins`);
  const tradeCommand: FarmCommand =
    tradeMode === "buy"
      ? { type: "buy_market_item", item_id: item.item_id, quantity: commandQuantity }
      : { type: "sell_market_item", item_id: item.item_id, quantity: commandQuantity };

  return (
    <article className="market-trade" data-testid={`market-trade-${marketItem.item_id}`}>
      <div className="market-trade__hero">
        <ResourceIcon type="item" itemId={item.item_id} itemKind={item.kind} />
        <div>
          <h3>{item.name}</h3>
          <p>Owned {item.quantity}</p>
        </div>
      </div>
      <div className="market-trade__stats">
        <span>{marketItem.buy_price === null ? "Cannot buy" : `Buy price ${marketItem.buy_price} coins`}</span>
        <span>{marketItem.sell_price === null ? "Cannot sell" : `Sell price ${marketItem.sell_price} coins`}</span>
        <span>{storage.label} room {storageRoom}</span>
      </div>
      <div className="market-trade__mode" aria-label={`${item.name} trade mode`}>
        <button
          type="button"
          className={tradeMode === "buy" ? "market-trade__mode-button market-trade__mode-button--active" : "market-trade__mode-button"}
          aria-pressed={tradeMode === "buy"}
          onClick={() => onTradeMode("buy")}
        >
          Buy
        </button>
        <button
          type="button"
          className={tradeMode === "sell" ? "market-trade__mode-button market-trade__mode-button--active" : "market-trade__mode-button"}
          aria-pressed={tradeMode === "sell"}
          onClick={() => onTradeMode("sell")}
        >
          Sell
        </button>
      </div>
      <div className="market-item__quantity" aria-label={`${item.name} trade quantity`}>
        <button
          type="button"
          aria-label={`Decrease ${item.name} quantity`}
          onClick={() => onQuantityInput(String(Math.max(1, commandQuantity - 1)))}
        >
          -
        </button>
        <input
          aria-label={`${item.name} quantity`}
          type="number"
          min="1"
          step="1"
          value={quantityInput}
          onChange={(event) => onQuantityInput(event.target.value)}
        />
        <button
          type="button"
          aria-label={`Increase ${item.name} quantity`}
          onClick={() => onQuantityInput(String(commandQuantity + 1))}
        >
          +
        </button>
      </div>
      <button
        type="button"
        className="market-trade__submit"
        disabled={activeReason !== null}
        title={activeTitle}
        aria-label={`${activeVerb} ${commandQuantity} ${item.name}`}
        onClick={() => send(tradeCommand)}
      >
        {activeVerb} {activeTotal === null ? "" : activeTotal}
      </button>
      <small className="market-item__status">{activeReason ?? `${activeVerb} ${commandQuantity} for ${activeTotal} coins`}</small>
    </article>
  );
}

function buyMarketDisabledReason(
  marketItem: MarketItemDef,
  locked: boolean,
  quantity: number,
  coins: number,
  storageRoom: number,
  storageLabel: string,
) {
  if (locked) {
    return `Unlocks at level ${marketItem.unlock_level}`;
  }
  if (marketItem.buy_price === null) {
    return "Cannot buy here";
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return "Choose at least 1";
  }
  const total = marketItem.buy_price * quantity;
  if (coins < total) {
    return `Need ${total} coins`;
  }
  if (storageRoom < quantity) {
    return `${storageLabel} full`;
  }
  return null;
}

function sellMarketDisabledReason(
  marketItem: MarketItemDef,
  locked: boolean,
  quantity: number,
  owned: number,
) {
  if (locked) {
    return `Unlocks at level ${marketItem.unlock_level}`;
  }
  if (marketItem.sell_price === null) {
    return "Cannot sell here";
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return "Choose at least 1";
  }
  if (owned < quantity) {
    return `Need ${quantity} owned`;
  }
  return null;
}

function Inventory({
  catalog,
  view,
  selection,
  send,
  demoMode,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  selection: Selection;
  send: SendCommand;
  demoMode: boolean;
}) {
  const items = relevantInventoryItems(catalog, view, selection);
  if (selection?.type === "silo" || selection?.type === "barn") {
    return (
      <section className="panel-section">
        <h2>Inventory</h2>
        <div className="storage-inventory-list">
          {items.map((item) => (
            <StorageInventoryItem key={item.item_id} item={item} send={send} demoMode={demoMode} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="panel-section">
      <h2>Inventory</h2>
      <div className="inventory-grid">
        {items.map((item) => (
          <ResourceAmount key={item.item_id} item={item} amount={String(item.quantity)} />
        ))}
      </div>
    </section>
  );
}

function StorageInventoryItem({
  item,
  send,
  demoMode,
}: {
  item: InventoryItemView;
  send: SendCommand;
  demoMode: boolean;
}) {
  const hasAny = (item.available_quantity ?? item.quantity) > 0;
  return (
    <div className="storage-inventory-item">
      <ResourceIcon type="item" itemId={item.item_id} itemKind={item.kind} />
      <div className="storage-inventory-item__body">
        <span className="storage-inventory-item__name">{item.name}</span>
        <span className="storage-inventory-item__meta">
          {item.quantity} stored
          {(item.reserved_quantity ?? 0) > 0 ? ` - ${item.reserved_quantity} reserved` : ""}
          {(item.reserved_quantity ?? 0) > 0 ? ` - ${item.available_quantity ?? item.quantity} available` : ""}
        </span>
      </div>
      {!demoMode ? (
        <button
          type="button"
          className="storage-inventory-item__discard"
          disabled={!hasAny}
          aria-label={`Throw away 1 ${item.name}`}
          title={`Throw away 1 ${item.name}`}
          onClick={() => send({ type: "discard_inventory", item_id: item.item_id, quantity: 1 })}
        >
          <span>1</span>
          <span aria-hidden="true">🗑</span>
        </button>
      ) : null}
    </div>
  );
}

function FieldTools({
  catalog,
  view,
  activeFieldTool,
  buildToolSelected,
  harvestMode,
  plantSweep,
  onDefault,
  onPlant,
  onHarvest,
  onHarvestMode,
  onBuild,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  activeFieldTool: ActiveFieldTool;
  buildToolSelected: boolean;
  harvestMode: SweepHarvestMode;
  plantSweep: PlantSweepState;
  onDefault: () => void;
  onPlant: (cropId: string) => void;
  onHarvest: () => void;
  onHarvestMode: (mode: SweepHarvestMode) => void;
  onBuild: () => void;
}) {
  const [seedMenuOpen, setSeedMenuOpen] = useState(false);
  const [harvestMenuOpen, setHarvestMenuOpen] = useState(false);
  const inventory = new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)]));
  const unlockedCrops = catalog.crops.filter((crop) => crop.unlock_level <= view.level);
  const hasPlantableSeed = unlockedCrops.some((crop) => (inventory.get(crop.item_id) ?? 0) > 0);
  const selectedSeedFieldCount = plantSweep?.plotIds.length ?? 0;
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
    <section className="panel-section field-tools">
      <h2>Field Tools</h2>
      <div className="field-tool-grid">
        <button
          type="button"
          className={defaultToolSelected ? "field-tool field-tool--active" : "field-tool"}
          aria-pressed={defaultToolSelected}
          onClick={() => {
            setSeedMenuOpen(false);
            setHarvestMenuOpen(false);
            onDefault();
          }}
        >
          Default
        </button>
        <button
          type="button"
          className={
            activeFieldTool.type === "harvest"
              ? "field-tool field-tool--harvest field-tool--active"
              : "field-tool field-tool--harvest"
          }
          aria-pressed={activeFieldTool.type === "harvest"}
          aria-haspopup="menu"
          aria-expanded={harvestMenuOpen}
          aria-label="Harvest"
          onClick={() => {
            setSeedMenuOpen(false);
            setHarvestMenuOpen(false);
            onHarvest();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setSeedMenuOpen(false);
            setHarvestMenuOpen((open) => !open);
          }}
        >
          <span>Harvest</span>
          <strong>{harvestModeLabel}</strong>
        </button>
        {harvestMenuOpen ? (
          <div className="harvest-menu" role="menu" aria-label="Harvest mode">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={harvestMode === "matching_crop"}
              className={
                harvestMode === "matching_crop"
                  ? "harvest-menu__item harvest-menu__item--active"
                  : "harvest-menu__item"
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
                  ? "harvest-menu__item harvest-menu__item--active"
                  : "harvest-menu__item"
              }
              onClick={() => selectHarvestMode("all_crops")}
            >
              <span>All crops</span>
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className={buildToolSelected ? "field-tool field-tool--active field-tool--build" : "field-tool field-tool--build"}
          aria-pressed={buildToolSelected}
          onClick={() => {
            setSeedMenuOpen(false);
            setHarvestMenuOpen(false);
            onBuild();
          }}
        >
          Build
        </button>
        <button
          type="button"
          className={activeFieldTool.type === "plant" ? "field-tool field-tool--active field-tool--seed" : "field-tool field-tool--seed"}
          aria-pressed={activeFieldTool.type === "plant"}
          aria-haspopup="menu"
          aria-expanded={seedMenuOpen}
          aria-label="Seed"
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
        {seedMenuOpen ? (
          <div className="seed-menu" role="menu" aria-label="Seed type">
            {unlockedCrops.map((crop) => {
              const quantity = inventory.get(crop.item_id) ?? 0;
              const active = selectedSeedCropId === crop.item_id;
              return (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  key={crop.item_id}
                  className={active ? "seed-menu__item seed-menu__item--active" : "seed-menu__item"}
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
      </div>
      {activeFieldTool.type === "plant" ? (
        <p className="field-tool-status" role="status" aria-live="polite">
          {selectedSeedFieldCount === 0
            ? "No fields selected for seeding"
            : `${selectedSeedFieldCount} ${
                selectedSeedFieldCount === 1 ? "field" : "fields"
              } selected for seeding`}
        </p>
      ) : null}
    </section>
  );
}

function ResourceAmount({ item, amount }: { item: InventoryItemView; amount: string }) {
  return (
    <span className="resource-amount">
      <ResourceIcon type="item" itemId={item.item_id} itemKind={item.kind} />
      <span className="resource-amount__name">{item.name}</span>
      <strong>{amount}</strong>
    </span>
  );
}

function resourceItem(catalog: CatalogDocument, itemId: string, quantity: number): InventoryItemView {
  const item = catalog.items.find((entry) => entry.id === itemId);
  return {
    item_id: itemId,
    name: item?.name ?? itemId,
    quantity,
    reserved_quantity: 0,
    available_quantity: quantity,
    kind: item?.kind ?? "product",
  };
}

function relevantInventoryItems(catalog: CatalogDocument, view: FarmView, selection: Selection) {
  const relevantItemIds = relevantItemIdsForSelection(catalog, view, selection);
  if (!relevantItemIds) {
    return view.inventory;
  }

  const quantities = new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)]));
  return catalog.items
    .filter((item) => relevantItemIds.has(item.id))
    .map((item) => ({
      item_id: item.id,
      name: item.name,
      quantity: quantities.get(item.id) ?? 0,
      kind: item.kind,
    }));
}

function relevantItemIdsForSelection(
  catalog: CatalogDocument,
  view: FarmView,
  selection: Selection,
): Set<string> | null {
  const machine = selectedMachine(view, selection);
  if (machine) {
    const itemIds = new Set<string>();
    for (const recipe of catalog.recipes.filter(
      (entry) => entry.target.type === "machine" && entry.target.machine_kind === machine.kind,
    )) {
      for (const stack of [...recipe.inputs, ...recipe.outputs]) {
        itemIds.add(stack.item_id);
      }
    }
    return itemIds;
  }

  if (selection?.type === "farmhouse" && view.owned_farmhouse_upgrades.includes("oven")) {
    const itemIds = new Set<string>();
    for (const recipe of catalog.recipes.filter((entry) => entry.target.type === "oven")) {
      for (const stack of [...recipe.inputs, ...recipe.outputs]) {
        itemIds.add(stack.item_id);
      }
    }
    return itemIds;
  }

  const shelter = selectedShelter(view, selection);
  if (shelter) {
    const shelterDef = catalog.shelters.find((entry) => entry.kind === shelter.kind);
    return shelterDef ? new Set([shelterDef.feed_item_id, shelterDef.product_item_id]) : new Set();
  }

  if (selection?.type === "silo") {
    return new Set(catalog.items.filter((item) => item.kind === "crop").map((item) => item.id));
  }

  if (selection?.type === "barn") {
    return new Set(catalog.items.filter((item) => item.kind !== "crop").map((item) => item.id));
  }

  if (selection?.type === "delivery_board") {
    return new Set(
      view.delivery_orders.flatMap((order) => order.requirements.map((stack) => stack.item_id)),
    );
  }

  if (selection?.type === "farm_shop") {
    return new Set([
      ...(view.farm_shop?.stock.map((stock) => stock.item_id) ?? []),
      ...catalog.market_items
        .filter((marketItem) => marketItem.sell_price !== null && marketItem.unlock_level <= view.level)
        .map((marketItem) => marketItem.item_id),
    ]);
  }

  return null;
}

function SelectionPanel({
  catalog,
  view,
  selection,
  nowMs,
  send,
  demoMode,
  onClearSelection,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  selection: Selection;
  nowMs: number;
  send: SendCommand;
  demoMode: boolean;
  onClearSelection: () => void;
}) {
  const plot = selectedPlot(view, selection);
  const machine = selectedMachine(view, selection);
  const shelter = selectedShelter(view, selection);
  const resident = selectedResident(view, selection);
  const isFarmhouse = selection?.type === "farmhouse";
  const isSilo = selection?.type === "silo";
  const isBarn = selection?.type === "barn";
  const isToolShed = selection?.type === "tool_shed";
  const isFarmShop = selection?.type === "farm_shop";
  return (
    <section className={resident ? "panel-section resident-details-panel" : "panel-section"}>
      <div className="selection-panel__header">
        <h2>{resident ? "Resident Details" : "Selection"}</h2>
        {resident ? (
          <button type="button" aria-label="Close Resident Details" onClick={onClearSelection}>
            Close
          </button>
        ) : null}
      </div>
      {isSilo ? (
        demoMode ? (
          <StorageStatus label="Silo" used={view.silo_used} capacity={view.silo_capacity} unit="crops" />
        ) : (
          <StorageUpgradeStatus
            catalog={catalog}
            view={view}
            storageKind="silo"
            label="Silo"
            used={view.silo_used}
            capacity={view.silo_capacity}
            tier={view.silo_upgrade_tier}
            unit="crops"
            send={send}
          />
        )
      ) : null}
      {isBarn ? (
        demoMode ? (
          <StorageStatus label="Barn" used={view.barn_used} capacity={view.barn_capacity} unit="goods" />
        ) : (
          <StorageUpgradeStatus
            catalog={catalog}
            view={view}
            storageKind="barn"
            label="Barn"
            used={view.barn_used}
            capacity={view.barn_capacity}
            tier={view.barn_upgrade_tier}
            unit="goods"
            send={send}
          />
        )
      ) : null}
      {isFarmhouse ? <FarmhouseActions catalog={catalog} view={view} nowMs={nowMs} send={send} /> : null}
      {plot ? <PlotActions catalog={catalog} view={view} plot={plot} nowMs={nowMs} send={send} /> : null}
      {machine ? (
        <MachineActions catalog={catalog} view={view} machine={machine} nowMs={nowMs} send={send} />
      ) : null}
      {shelter ? (
        <ShelterActions catalog={catalog} view={view} shelter={shelter} nowMs={nowMs} send={send} />
      ) : null}
      {resident ? (
        <ResidentActions catalog={catalog} view={view} resident={resident} nowMs={nowMs} />
      ) : null}
      {!demoMode && selection?.type === "delivery_board" ? <p>Use delivery orders below.</p> : null}
      {!demoMode && isFarmShop ? (
        <FarmShopActions catalog={catalog} view={view} nowMs={nowMs} send={send} />
      ) : null}
      {isToolShed ? <p>Tool Shed</p> : null}
      {!plot &&
      !machine &&
      !shelter &&
      !resident &&
      !isFarmhouse &&
      !isSilo &&
      !isBarn &&
      !isToolShed &&
      !isFarmShop &&
      selection?.type !== "delivery_board" ? (
        <p>
          {demoMode
            ? "Select a field, Farmhouse, or storage."
            : "Select a field, machine, shelter, storage, or order board."}
        </p>
      ) : null}
    </section>
  );
}

function ResidentActions({
  catalog,
  view,
  resident,
  nowMs,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  resident: FarmResident;
  nowMs: number;
}) {
  const status = residentTaskStatus(catalog, view, resident.id, nowMs);
  const work = residentWork(view, resident.id);
  const pose = currentResidentScenePose(view, resident.id, nowMs);
  const currentStep = work?.current_step ?? null;
  const queue = work?.queue ?? [];
  return (
    <div className="action-stack resident-details">
      <div className="resident-details__header">
        <strong>{resident.display_name}</strong>
        <span>{resident.id === view.selected_resident_id ? "Selected for work" : "Inspecting"}</span>
      </div>
      <dl className="resident-card__status">
        <div>
          <dt>State</dt>
          <dd>{sceneStateLabel(pose.state)}</dd>
        </div>
        <div>
          <dt>Current task</dt>
          <dd>{status.label}</dd>
        </div>
        <div>
          <dt>Current step</dt>
          <dd>{currentStep ? residentTaskStepLabel(catalog, currentStep) : "None"}</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>{pose.label}</dd>
        </div>
      </dl>
      {work?.block ? <p className="resident-task-blocked">{work.block.message}</p> : null}
      {status.currentTask ? (
        <div className="resident-task-progress">
          <progress value={status.progress} max={1} aria-label={`${resident.display_name} task progress`} />
          <span>{Math.round(status.progress * 100)}%</span>
        </div>
      ) : null}
      <ResidentCarrySummary work={work} />
      <div className="resident-queue">
        <strong>Task queue</strong>
        {queue.length === 0 ? (
          <p>Idle</p>
        ) : (
          <ol className="resident-queue__list">
            {queue.map((task, index) => (
              <ResidentTaskQueueRow
                key={task.id}
                catalog={catalog}
                task={task}
                fallbackQueueState={index === 0 ? "Current" : "Queued"}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function ResidentTaskQueueRow({
  catalog,
  task,
  fallbackQueueState,
}: {
  catalog: CatalogDocument;
  task: ResidentTaskSummaryView;
  fallbackQueueState: string;
}) {
  return (
    <li className="resident-queue-task">
      <details>
        <summary>
          <span>{taskLabel(catalog, task)}</span>
          <small>
            {queueStateLabel(task, fallbackQueueState)} - {task.step_count}{" "}
            {task.step_count === 1 ? "step" : "steps"}
          </small>
        </summary>
        <ol className="resident-queue-steps">
          {task.steps.map((step, index) => (
            <li key={`${task.id}-${index}`}>
              <div>
                <strong>{residentTaskStepLabel(catalog, step)}</strong>
                <small>{step.target?.label ?? "Work target"}</small>
              </div>
              <span>
                {formatStepTiming(step)} - {formatStepQuantity(step)}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}

function queueStateLabel(task: ResidentTaskSummaryView, fallback: string) {
  if (task.queue_state === "blocked") {
    return "Blocked";
  }
  if (task.queue_state === "current") {
    return "Current";
  }
  if (task.queue_state === "queued") {
    return "Queued";
  }
  return fallback;
}

function formatStepTiming(step: ResidentStepView) {
  return `Walk ${formatDuration(step.walk_duration_ms)} / Work ${formatDuration(step.work_duration_ms)}`;
}

function formatDuration(durationMs: number) {
  if (durationMs <= 0) {
    return "0s";
  }
  const seconds = Math.round(durationMs / 1000);
  return `${seconds}s`;
}

function formatStepQuantity(step: ResidentStepView) {
  if (step.quantity === 0) {
    return itemKindLabel(step.kind);
  }
  return `${step.quantity} ${itemKindLabel(step.kind)}`;
}

function itemKindLabel(kind: ResidentStepView["kind"]) {
  if (kind === "animal_product") {
    return "animal product";
  }
  return kind;
}

function ResidentCarrySummary({
  work,
  compact = false,
}: {
  work: ReturnType<typeof residentWork>;
  compact?: boolean;
}) {
  const itemEntries = work?.carry.items ?? [];
  const toolEntries = work?.carry.tools ?? [];

  if (itemEntries.length === 0 && toolEntries.length === 0) {
    return compact ? null : (
      <div className="resident-carry">
        <strong>Carrying</strong>
        <p>Empty</p>
      </div>
    );
  }

  return (
    <div className={compact ? "resident-carry resident-carry--compact" : "resident-carry"}>
      {!compact ? <strong>Carrying</strong> : null}
      <div className="resident-carry__chips">
        {itemEntries.map((item) => {
          return (
            <span className="resident-carry-chip" key={`item-${item.item_id}`}>
              <ResourceIcon type="item" itemId={item.item_id} itemKind={item.kind} />
              {item.quantity} {item.name}
            </span>
          );
        })}
        {toolEntries.map((tool) => (
          <span className="resident-carry-chip" key={`tool-${tool.tool_kind}`}>
            {tool.quantity} {tool.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function sceneStateLabel(state: ReturnType<typeof currentResidentScenePose>["state"]) {
  return state === "idle" ? "Idle" : state === "walking" ? "Walking" : state === "blocked" ? "Blocked" : "Working";
}

function FarmhouseActions({
  catalog,
  view,
  nowMs,
  send,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  send: SendCommand;
}) {
  const oven = catalog.farmhouse_upgrades.find((upgrade) => upgrade.kind === "oven");
  const reason = farmhouseOvenDisabledReason(catalog, view);
  const ovenOwned = view.owned_farmhouse_upgrades.includes("oven");
  const first = view.oven.queue[0];
  const remaining = first ? secondsRemaining(first.ready_at_ms, nowMs) : 0;
  const queueLimit = oven?.queue_limit ?? 2;
  const queueFull = view.oven.queue.length >= queueLimit;
  const inventory = new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)]));
  const reservedReason = reservedOvenReason(view);
  return (
    <div className="action-stack">
      <p>Farmhouse</p>
      {!oven ? (
        <p>Oven upgrade unavailable</p>
      ) : ovenOwned ? (
        <>
          <p>Oven - queue {view.oven.queue.length}/{queueLimit}</p>
          {first ? (
            <button
              type="button"
              disabled={remaining > 0 || Boolean(reservedReason)}
              title={reservedReason ?? undefined}
              onClick={() => send({ type: "collect_oven_job" })}
            >
              Collect {recipeName(catalog, first.recipe_id)} {remaining > 0 ? `(${remaining}s)` : ""}
            </button>
          ) : null}
          <div className="recipe-list">
            {catalog.recipes
              .filter((recipe) => recipe.target.type === "oven" && recipe.unlock_level <= view.level)
              .map((recipe) => {
                const missingInputs = missingRecipeInputs(recipe.inputs, inventory);
                const canQueue = !reservedReason && !queueFull && missingInputs.length === 0;
                const disabledReason = queueFull
                  ? "Queue full"
                  : reservedReason ?? missingInputs.map((stack) => `Need ${stack.quantity} ${itemName(catalog, stack.item_id)}`).join(", ");
                return (
                  <div className="recipe-card" data-testid={`recipe-card-${recipe.id}`} key={recipe.id}>
                    <div className="recipe-card__header">
                      <strong>{recipe.name}</strong>
                      <button
                        type="button"
                        disabled={!canQueue}
                        aria-label={`Make ${recipe.name}`}
                        title={canQueue ? `Make ${recipe.name}` : disabledReason}
                        onClick={() => send({ type: "queue_oven_recipe", recipe_id: recipe.id })}
                      >
                        Make
                      </button>
                    </div>
                    <div className="recipe-card__inputs" aria-label={`${recipe.name} required resources`}>
                      {recipe.inputs.map((stack) => {
                        const available = inventory.get(stack.item_id) ?? 0;
                        const missing = Math.max(0, stack.quantity - available);
                        return (
                          <RecipeInputAmount
                            key={stack.item_id}
                            catalog={catalog}
                            stack={stack}
                            available={available}
                            missing={missing}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
          {reservedReason ? <small>{reservedReason}</small> : null}
        </>
      ) : (
        <>
          <p>Oven upgrade - {oven.cost_coins} coins, queue {oven.queue_limit}</p>
          <button
            type="button"
            disabled={Boolean(reason)}
            title={reason ?? "Buy Oven"}
            onClick={() => send({ type: "buy_farmhouse_upgrade", upgrade_kind: "oven" })}
          >
            Buy Oven
          </button>
          {reason ? <small>{reason}</small> : null}
        </>
      )}
    </div>
  );
}

function StorageStatus({
  label,
  used,
  capacity,
  unit,
}: {
  label: string;
  used: number;
  capacity: number;
  unit: string;
}) {
  return (
    <div className="action-stack">
      <p>{label} storage - {used}/{capacity} {unit}</p>
    </div>
  );
}

function StorageUpgradeStatus({
  catalog,
  view,
  storageKind,
  label,
  used,
  capacity,
  tier,
  unit,
  send,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  storageKind: "silo" | "barn";
  label: string;
  used: number;
  capacity: number;
  tier: number;
  unit: string;
  send: SendCommand;
}) {
  const tiers = catalog.storage_upgrades.filter((upgrade) => upgrade.storage_kind === storageKind);
  const maxTier = tiers.reduce((max, upgrade) => Math.max(max, upgrade.tier), 0);
  const next = tiers.find((upgrade) => upgrade.tier === tier + 1);
  const nextCapacity = next ? Math.max(capacity, next.capacity) : null;
  const lockedReason = next && view.level < next.unlock_level ? `Unlocks at level ${next.unlock_level}` : null;
  const coinsReason = next && view.coins < next.cost_coins ? `Need ${next.cost_coins - view.coins} coins` : null;
  const reason = !next ? "Fully upgraded" : lockedReason ?? coinsReason;
  return (
    <div className="action-stack">
      <p>{label} storage - {used}/{capacity} {unit}</p>
      <p>Tier {tier}/{maxTier}</p>
      {next ? (
        <p>Next upgrade - {next.cost_coins} coins, capacity {capacity} -&gt; {nextCapacity}</p>
      ) : (
        <p>Fully upgraded</p>
      )}
      <button
        type="button"
        disabled={Boolean(reason)}
        title={reason ?? `Upgrade ${label}`}
        onClick={() => send({ type: "upgrade_storage", storage_kind: storageKind })}
      >
        Upgrade {label}
      </button>
      {reason ? <small>{reason}</small> : null}
    </div>
  );
}

function PlotActions({
  catalog,
  view,
  plot,
  nowMs,
  send,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  plot: FieldPlot;
  nowMs: number;
  send: SendCommand;
}) {
  const reservedReason = reservedFieldReason(view, plot.id);
  if (plot.crop) {
    const remaining = secondsRemaining(plot.crop.ready_at_ms, nowMs);
    return (
      <div className="action-stack">
        <p>{itemName(catalog, plot.crop.item_id)} - {remaining === 0 ? "ready" : `${remaining}s`}</p>
        <button
          type="button"
          disabled={remaining > 0 || Boolean(reservedReason)}
          title={reservedReason ?? undefined}
          onClick={() => send({ type: "harvest_crop", plot_id: plot.id })}
        >
          Harvest
        </button>
        {reservedReason ? <small>{reservedReason}</small> : null}
      </div>
    );
  }
  const inventory = new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)]));
  return (
    <div className="action-grid">
      {catalog.crops
        .filter((crop) => crop.unlock_level <= view.level)
        .map((crop) => (
          <button
            type="button"
            key={crop.item_id}
            disabled={Boolean(reservedReason) || (inventory.get(crop.item_id) ?? 0) < 1}
            title={reservedReason ?? undefined}
            onClick={() => send({ type: "plant_crop", plot_id: plot.id, crop_id: crop.item_id })}
          >
            Plant {itemName(catalog, crop.item_id)}
          </button>
        ))}
      {reservedReason ? <small>{reservedReason}</small> : null}
    </div>
  );
}

function MachineActions({
  catalog,
  view,
  machine,
  nowMs,
  send,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  machine: MachineState;
  nowMs: number;
  send: SendCommand;
}) {
  const first = machine.queue[0];
  const remaining = first ? secondsRemaining(first.ready_at_ms, nowMs) : 0;
  const queueLimit =
    catalog.machines.find((entry) => entry.kind === machine.kind)?.queue_limit ?? 2;
  const queueFull = machine.queue.length >= queueLimit;
  const inventory = new Map(view.inventory.map((item) => [item.item_id, (item.available_quantity ?? item.quantity)]));
  const reservedReason = reservedMachineReason(view, machine.id);
  return (
    <div className="action-stack">
      <p>Feed Mill - queue {machine.queue.length}/{queueLimit}</p>
      {first ? (
        <button
          type="button"
          disabled={remaining > 0 || Boolean(reservedReason)}
          title={reservedReason ?? undefined}
          onClick={() => send({ type: "collect_machine_job", machine_id: machine.id })}
        >
          Collect {recipeName(catalog, first.recipe_id)} {remaining > 0 ? `(${remaining}s)` : ""}
        </button>
      ) : null}
      <div className="recipe-list">
        {availableRecipes(catalog, machine, view.level).map((recipe) => {
          const missingInputs = missingRecipeInputs(recipe.inputs, inventory);
          const canQueue = !reservedReason && !queueFull && missingInputs.length === 0;
          const disabledReason = queueFull
            ? "Queue full"
            : reservedReason ?? missingInputs.map((stack) => `Need ${stack.quantity} ${itemName(catalog, stack.item_id)}`).join(", ");
          return (
            <div className="recipe-card" data-testid={`recipe-card-${recipe.id}`} key={recipe.id}>
              <div className="recipe-card__header">
                <strong>{recipe.name}</strong>
                <button
                  type="button"
                  disabled={!canQueue}
                  aria-label={`Make ${recipe.name}`}
                  title={canQueue ? `Make ${recipe.name}` : disabledReason}
                  onClick={() => send({ type: "queue_recipe", machine_id: machine.id, recipe_id: recipe.id })}
                >
                  Make
                </button>
              </div>
              <div className="recipe-card__inputs" aria-label={`${recipe.name} required resources`}>
                {recipe.inputs.map((stack) => {
                  const available = inventory.get(stack.item_id) ?? 0;
                  const missing = Math.max(0, stack.quantity - available);
                  return (
                    <RecipeInputAmount
                      key={stack.item_id}
                      catalog={catalog}
                      stack={stack}
                      available={available}
                      missing={missing}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {reservedReason ? <small>{reservedReason}</small> : null}
    </div>
  );
}

function RecipeInputAmount({
  catalog,
  stack,
  available,
  missing,
}: {
  catalog: CatalogDocument;
  stack: ItemStack;
  available: number;
  missing: number;
}) {
  const requiredItem = resourceItem(catalog, stack.item_id, stack.quantity);
  return (
    <span className={missing > 0 ? "recipe-input recipe-input--missing" : "recipe-input"}>
      <ResourceIcon type="item" itemId={stack.item_id} itemKind={requiredItem.kind} />
      <span className="recipe-input__name">{requiredItem.name}</span>
      <strong>{available}/{stack.quantity}</strong>
      {missing > 0 ? <em>Need {missing}</em> : null}
    </span>
  );
}

function missingRecipeInputs(inputs: ItemStack[], inventory: Map<string, number>): ItemStack[] {
  return inputs
    .map((stack) => ({
      item_id: stack.item_id,
      quantity: Math.max(0, stack.quantity - (inventory.get(stack.item_id) ?? 0)),
    }))
    .filter((stack) => stack.quantity > 0);
}

function ShelterActions({
  catalog,
  view,
  shelter,
  nowMs,
  send,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  shelter: AnimalShelterState;
  nowMs: number;
  send: SendCommand;
}) {
  const label = shelter.kind === "chicken_coop" ? "Chicken Coop" : "Cow Pasture";
  return (
    <div className="action-stack">
      <p>{label}</p>
      {shelter.animals.map((animal, index) => {
        const reservedReason = reservedAnimalReason(view, shelter.id, animal.id);
        if (animal.state.type === "idle") {
          return (
            <span className="animal-action" key={animal.id}>
              <button
                type="button"
                disabled={Boolean(reservedReason)}
                title={reservedReason ?? undefined}
                onClick={() =>
                  send({ type: "feed_animal", shelter_id: shelter.id, animal_slot: animal.id })
                }
              >
                Feed animal {index + 1}
              </button>
              {reservedReason ? <small>{reservedReason}</small> : null}
            </span>
          );
        }
        if (animal.state.type === "ready") {
          return (
            <span className="animal-action" key={animal.id}>
              <button
                type="button"
                disabled={Boolean(reservedReason)}
                title={reservedReason ?? undefined}
                onClick={() =>
                  send({
                    type: "collect_animal_product",
                    shelter_id: shelter.id,
                    animal_slot: animal.id,
                  })
                }
              >
                Collect animal {index + 1}
              </button>
              {reservedReason ? <small>{reservedReason}</small> : null}
            </span>
          );
        }
        return (
          <span key={animal.id}>
            Animal {index + 1}: {secondsRemaining(animal.state.ready_at_ms, nowMs)}s
          </span>
        );
      })}
      <small>{catalog.shelters.find((entry) => entry.kind === shelter.kind)?.animal_name}</small>
    </div>
  );
}

function Orders({
  catalog,
  view,
  send,
  ordersRef,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  send: SendCommand;
  ordersRef: Ref<HTMLElement>;
}) {
  return (
    <section className="panel-section" ref={ordersRef} tabIndex={-1}>
      <h2>Delivery Orders</h2>
      {view.delivery_orders.length === 0 ? <p>Build the delivery board at level 4.</p> : null}
      {view.delivery_orders.map((order) => (
        <div className="order" key={order.id}>
          <div>
            {order.requirements.map((stack) => (
              <ResourceAmount
                key={stack.item_id}
                item={resourceItem(catalog, stack.item_id, stack.quantity)}
                amount={`x${stack.quantity}`}
              />
            ))}
          </div>
          <strong className="order__reward">
            <Metric type="coins" label={`${order.reward_coins} coins`} />
            <Metric type="xp" label={`${order.reward_xp} XP`} />
          </strong>
          <button
            type="button"
            onClick={() => send({ type: "fulfill_delivery_order", order_id: order.id })}
          >
            Fulfill
          </button>
        </div>
      ))}
    </section>
  );
}

function FarmShopActions({
  catalog,
  view,
  nowMs,
  send,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  send: SendCommand;
}) {
  const shop = view.farm_shop;
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const inventory = useMemo(
    () => new Map(view.inventory.map((item) => [item.item_id, item])),
    [view.inventory],
  );
  const sellableItems = catalog.market_items.filter(
    (marketItem) => marketItem.sell_price !== null && marketItem.unlock_level <= view.level,
  );
  const selectedMarketItem = sellableItems.find((marketItem) => marketItem.item_id === itemId) ?? sellableItems[0];
  const selectedItemId = selectedMarketItem?.item_id ?? "";
  const stockUsed = shop?.stock.reduce((sum, stock) => sum + stock.quantity, 0) ?? 0;
  const stockCapacity = shop?.stock_capacity ?? 0;
  const selectedInventory = selectedItemId ? inventory.get(selectedItemId) : null;
  const availableInventory = selectedInventory?.available_quantity ?? selectedInventory?.quantity ?? 0;
  const selectedStock = shop?.stock.find((stock) => stock.item_id === selectedItemId)?.quantity ?? 0;
  const selectedStockView = shop?.stock.find((stock) => stock.item_id === selectedItemId) ?? null;
  const reservedStock = selectedItemId
    ? selectedStockView?.reserved_quantity ?? view.reservations.farm_shop_stock[selectedItemId] ?? 0
    : 0;
  const availableStock = Math.max(0, selectedStock - reservedStock);
  const projectedStockUsed = shop ? projectedFarmShopStockUsed(view, shop.id, stockUsed) : 0;
  const projectedStockRoom = Math.max(0, stockCapacity - projectedStockUsed);
  const commandQuantity = Math.max(1, Math.floor(quantity));
  const stockReason = !shop
    ? "Farm Shop not built"
    : !selectedMarketItem
      ? "Item is unavailable"
      : commandQuantity > availableInventory
        ? `Need ${commandQuantity - availableInventory} more in storage`
        : commandQuantity > projectedStockRoom
          ? "Projected Shop Stock capacity is full"
          : undefined;
  const returnReason = !shop
    ? "Farm Shop not built"
    : !selectedMarketItem
      ? "Item is unavailable"
      : commandQuantity > availableStock
        ? "Not enough available Shop Stock"
        : !storageHasRoomForReturn(catalog, view, selectedItemId, commandQuantity)
          ? "Destination storage is full"
          : undefined;

  useEffect(() => {
    if (!selectedItemId || selectedItemId === itemId) {
      return;
    }
    setItemId(selectedItemId);
  }, [itemId, selectedItemId]);

  if (!shop) {
    return <p>Build the Farm Shop by the road.</p>;
  }

  return (
    <section className="farm-shop-panel" aria-label="Farm Shop stock">
      <StorageStatus label="Shop Stock" used={stockUsed} capacity={stockCapacity} unit="items" />
      {shop.current_sale && shop.current_sale.visible_until_ms > nowMs ? (
        <p className="farm-shop-panel__sale">
          Sold {itemName(catalog, shop.current_sale.item_id)} for {shop.current_sale.coins_gained} coins
        </p>
      ) : null}
      <dl className="farm-shop-panel__summary">
        <div>
          <dt>Total stock</dt>
          <dd>{selectedStock}</dd>
        </div>
        <div>
          <dt>Reserved stock</dt>
          <dd>{reservedStock}</dd>
        </div>
        <div>
          <dt>Available stock</dt>
          <dd>{availableStock}</dd>
        </div>
      </dl>
      <div className="farm-shop-panel__stock-list">
        {shop.stock.length === 0 ? <p>No Shop Stock</p> : null}
        {shop.stock.map((stock) => {
          const reserved = view.reservations.farm_shop_stock[stock.item_id] ?? 0;
          const available = Math.max(0, stock.quantity - reserved);
          return (
            <div className="farm-shop-stock-row" key={stock.item_id}>
              <ResourceAmount item={resourceItem(catalog, stock.item_id, stock.quantity)} amount={`x${stock.quantity}`} />
              <small>{available} available{reserved > 0 ? `, ${reserved} reserved` : ""}</small>
            </div>
          );
        })}
      </div>
      <label className="farm-shop-panel__field">
        <span>Item</span>
        <select value={selectedItemId} onChange={(event) => setItemId(event.target.value)}>
          {sellableItems.map((marketItem) => (
            <option key={marketItem.item_id} value={marketItem.item_id}>
              {itemName(catalog, marketItem.item_id)} - {marketItem.sell_price} coins
            </option>
          ))}
        </select>
      </label>
      <label className="farm-shop-panel__field">
        <span>Quantity</span>
        <input
          aria-label="Farm Shop quantity"
          type="number"
          min={1}
          max={99}
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value))}
        />
      </label>
      <div className="farm-shop-panel__actions">
        <button
          type="button"
          disabled={Boolean(stockReason)}
          onClick={() => send({ type: "stock_farm_shop", item_id: selectedItemId, quantity: commandQuantity })}
        >
          Stock
        </button>
        <button
          type="button"
          disabled={Boolean(returnReason)}
          onClick={() => send({ type: "unstock_farm_shop", item_id: selectedItemId, quantity: commandQuantity })}
        >
          Return
        </button>
      </div>
      <small className="farm-shop-panel__status">
        {[stockReason, returnReason].filter(Boolean).join(" - ") || "Ready"}
      </small>
    </section>
  );
}

function storageHasRoomForReturn(
  catalog: CatalogDocument,
  view: FarmView,
  itemId: string,
  quantity: number,
): boolean {
  const item = catalog.items.find((entry) => entry.id === itemId);
  if (!item) {
    return false;
  }
  if (item.kind === "crop") {
    return view.silo_used + quantity <= view.silo_capacity;
  }
  return view.barn_used + quantity <= view.barn_capacity;
}

function projectedFarmShopStockUsed(view: FarmView, shopId: string, currentStockUsed: number): number {
  let projected = currentStockUsed;
  for (const work of Object.values(view.resident_work)) {
    const steps = work?.queue.flatMap((task) => task.steps) ?? (work?.current_step ? [work.current_step] : []);
    for (const step of steps) {
      if (step.target?.kind !== "farm_shop" || step.target.id !== shopId) {
        continue;
      }
      if (step.activity === "depositing_inventory") {
        projected += step.quantity;
      } else if (step.activity === "picking_up_items") {
        projected -= step.quantity;
      }
    }
  }
  return Math.max(0, projected);
}

function BuildTray({
  catalog,
  view,
  selectedKind,
  buildPlacement,
  demoMode,
  onInspectKind,
  onSelectKind,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  selectedKind: BuildableKind | null;
  buildPlacement: BuildPlacementState;
  demoMode: boolean;
  onInspectKind: (kind: BuildableKind) => void;
  onSelectKind: (kind: BuildableKind, canPlace: boolean) => void;
}) {
  const built = useMemo(() => builtStructureKinds(view), [view]);
  const visibleBuildKinds = demoMode ? buildKinds.filter(isDemoBuildKind) : buildKinds;
  const cardStates = visibleBuildKinds.map((kind) =>
    buildStructureCardState(catalog, view, kind, built, selectedKind, buildPlacement),
  );
  const detail =
    cardStates.find((state) => state.kind === (selectedKind ?? visibleBuildKinds[0])) ?? cardStates[0];

  return (
    <section className="build-dock" aria-label="Structure build menu">
      <div
        className={`build-detail-strip build-detail-strip--${detail.accentClass}`}
        data-testid="build-detail-strip"
      >
        <div className="build-detail-strip__copy">
          <strong>{detail.label}</strong>
          <span>{detail.role}</span>
        </div>
        <div className="build-detail-strip__facts">
          <span>{detail.cost} coins</span>
          <span>{detail.placing ? "Choose a tile" : detail.reason ?? "Click to place"}</span>
        </div>
      </div>
      <nav className="build-tray" aria-label="Structures">
        {cardStates.map((state) => (
          <StructureBuildCard
            key={state.kind}
            state={state}
            onInspect={() => onInspectKind(state.kind)}
            onSelect={() => onSelectKind(state.kind, state.canPlace)}
          />
        ))}
      </nav>
    </section>
  );
}

function isDemoBuildKind(kind: BuildableKind): boolean {
  return kind === "field_plot";
}

type StructureBuildCardState = StructureBuildCardMeta & {
  label: string;
  cost: number;
  status: string;
  reason?: string;
  canPlace: boolean;
  selected: boolean;
  placing: boolean;
};

function StructureBuildCard({
  state,
  onInspect,
  onSelect,
}: {
  state: StructureBuildCardState;
  onInspect: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      className={`structure-build-card structure-build-card--${state.accentClass}${
        state.selected ? " structure-build-card--selected" : ""
      }${state.placing ? " structure-build-card--placing" : ""}`}
      type="button"
      aria-pressed={state.placing}
      data-status={state.status}
      onFocus={onInspect}
      onClick={onSelect}
    >
      <span className="structure-build-card__art" aria-hidden="true">
        {structureInitials(state.label)}
      </span>
      <span className="structure-build-card__body">
        <strong>{state.label}</strong>
        <span>{state.role}</span>
      </span>
      <span className="structure-build-card__footer">
        <span>{state.cost} coins</span>
        <span>{state.placing ? "Placing" : state.status}</span>
      </span>
    </button>
  );
}

function buildStructureCardState(
  catalog: CatalogDocument,
  view: FarmView,
  kind: BuildableKind,
  built: Set<StructureKind>,
  selectedKind: BuildableKind | null,
  buildPlacement: BuildPlacementState,
): StructureBuildCardState {
  const unlockLevel = unlockLevelForBuildKind(catalog, kind);
  const cost = buildCostForBuildKind(catalog, kind);
  const isBuilt = kind !== "field_plot" && built.has(kind);
  const locked = view.level < unlockLevel;
  const unaffordable = view.coins < cost;
  const placing = buildPlacement?.kind === kind;
  const reason = isBuilt
    ? "Already built"
    : locked
      ? `Unlocks at level ${unlockLevel}`
      : unaffordable
        ? `Need ${cost - view.coins} coins`
        : undefined;
  const meta = structureBuildCardMetas[kind];

  return {
    ...meta,
    label: buildKindLabel(kind),
    cost,
    status: isBuilt ? "Built" : locked ? `Level ${unlockLevel}` : unaffordable ? "Need coins" : "Ready",
    reason,
    canPlace: !isBuilt && !locked && !unaffordable,
    selected: selectedKind === kind,
    placing,
  };
}

function structureInitials(label: string): string {
  return label
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

function buildKindLabel(kind: BuildableKind): string {
  return kind === "field_plot" ? "Field Plot" : structureLabel(kind);
}

function unlockLevelForBuildKind(catalog: CatalogDocument, kind: BuildableKind): number {
  if (kind === "field_plot") {
    return 1;
  }
  if (kind === "feed_mill") {
    return catalog.machines.find((machine) => machine.kind === kind)?.unlock_level ?? 1;
  }
  if (kind === "delivery_board") {
    return 4;
  }
  if (kind === "farm_shop") {
    return 2;
  }
  if (kind === "tool_shed") {
    return 3;
  }
  const shelterKind = kind === "chicken_coop" ? "chicken_coop" : "cow_pasture";
  return catalog.shelters.find((shelter) => shelter.kind === shelterKind)?.unlock_level ?? 1;
}

function buildCostForBuildKind(catalog: CatalogDocument, kind: BuildableKind): number {
  if (kind === "field_plot") {
    return fieldPlotBuildCost;
  }
  if (kind === "feed_mill") {
    return catalog.machines.find((machine) => machine.kind === kind)?.build_cost ?? 0;
  }
  if (kind === "delivery_board") {
    return 20;
  }
  if (kind === "farm_shop") {
    return 25;
  }
  if (kind === "tool_shed") {
    return 45;
  }
  const shelterKind = kind === "chicken_coop" ? "chicken_coop" : "cow_pasture";
  return catalog.shelters.find((shelter) => shelter.kind === shelterKind)?.build_cost ?? 0;
}


function StructureContextMenu({
  targetType,
  model,
  x,
  y,
  onClose,
  onCommand,
  onStartMove,
  onViewOrders,
}: {
  targetType: "structure" | "field";
  model: StructureMenuModel;
  x: number;
  y: number;
  onClose: () => void;
  onCommand: (command: FarmCommand) => Promise<void>;
  onStartMove: () => void;
  onViewOrders: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x, y });

  useLayoutEffect(() => {
    const margin = 12;
    const rect = menuRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 280;
    const height = rect?.height ?? 220;
    setPosition({
      x: Math.min(Math.max(margin, x), window.innerWidth - width - margin),
      y: Math.min(Math.max(margin, y), window.innerHeight - height - margin),
    });
  }, [model, x, y]);

  return (
    <div
      ref={menuRef}
      className={`farm-context-menu farm-context-menu--${targetType}`}
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label={`${model.title} actions`}
      data-testid={targetType === "structure" ? "structure-context-menu" : "field-context-menu"}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="structure-context-menu__header">
        <strong>{model.title}</strong>
        {model.subtitle ? <small>{model.subtitle}</small> : null}
      </div>
      <div className="structure-context-menu__items">
        {model.items.map((item) => (
          <StructureContextMenuItem
            key={item.id}
            item={item}
            onCommand={onCommand}
            onStartMove={onStartMove}
            onViewOrders={onViewOrders}
          />
        ))}
      </div>
      <button
        className="structure-context-menu__close"
        type="button"
        aria-label="Close structure menu"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}

function StructureContextMenuItem({
  item,
  onCommand,
  onStartMove,
  onViewOrders,
}: {
  item: StructureMenuItem;
  onCommand: (command: FarmCommand) => Promise<void>;
  onStartMove: () => void;
  onViewOrders: () => void;
}) {
  const isViewOrders = item.id === "view-orders";
  const isMoveStructure = item.action === "move_structure";
  const canRun = Boolean(item.command) || isViewOrders || isMoveStructure;
  return (
    <button
      className={`structure-context-menu__item${
        item.icon ? " structure-context-menu__item--with-icon" : ""
      }`}
      type="button"
      role="menuitem"
      disabled={item.disabled || !canRun}
      onClick={() => {
        if (item.command) {
          void onCommand(item.command);
          return;
        }
        if (isViewOrders) {
          onViewOrders();
          return;
        }
        if (isMoveStructure) {
          onStartMove();
        }
      }}
    >
      {item.icon ? (
        <ResourceIcon type="item" itemId={item.icon.itemId} itemKind={item.icon.itemKind} />
      ) : null}
      <span className="structure-context-menu__item-copy">
        <span>{item.label}</span>
        {item.reason ? <small>{item.reason}</small> : null}
      </span>
    </button>
  );
}
