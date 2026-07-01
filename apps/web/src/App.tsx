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
import { createFarmClient } from "./api";
import { FarmScene } from "./components/FarmScene";
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
  isStructureTargetPresent,
  type StructureMenuItem,
  type StructureMenuModel,
} from "./game/structureMenu";
import type {
  AnimalShelterState,
  CatalogDocument,
  FarmCommand,
  FarmView,
  FieldPlot,
  InventoryItemView,
  MachineState,
  StructureKind,
} from "./types";

type BuildableStructureKind = Exclude<StructureKind, "silo" | "barn">;
type BuildableKind = "field_plot" | BuildableStructureKind;

const client = createFarmClient();
const fieldPlotBuildCost = 12;
const buildKinds: BuildableKind[] = [
  "field_plot",
  "bakery",
  "feed_mill",
  "chicken_coop",
  "delivery_board",
  "cow_pasture",
];

type SendCommand = (command: FarmCommand) => Promise<boolean>;
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
type MainMenuPanel = "home" | "settings" | "wiki" | "account";
type PlantSweepState = {
  cropId: string;
  plotIds: string[];
  pointerId: number;
} | null;
type HarvestSweepState = {
  cropId: string;
  plotIds: string[];
  pointerId: number;
} | null;

const structureBuildCardMetas: Record<BuildableKind, StructureBuildCardMeta> = {
  field_plot: {
    kind: "field_plot",
    role: "Adds another field plot for crop growing.",
    accentClass: "field-plot",
  },
  bakery: {
    kind: "bakery",
    role: "Turns wheat into bread for delivery orders.",
    accentClass: "bakery",
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
  cow_pasture: {
    kind: "cow_pasture",
    role: "Houses cows that produce milk.",
    accentClass: "cow-pasture",
  },
};

export function App() {
  const [catalog, setCatalog] = useState<CatalogDocument | null>(null);
  const [view, setView] = useState<FarmView | null>(null);
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [fieldMenu, setFieldMenu] = useState<FieldContextMenuState>(null);
  const [structureMenu, setStructureMenu] = useState<StructureContextMenuState>(null);
  const [activeFieldTool, setActiveFieldTool] = useState<ActiveFieldTool>({ type: "default" });
  const [buildPlacement, setBuildPlacement] = useState<BuildPlacementState>(null);
  const [selectedBuildKind, setSelectedBuildKind] = useState<BuildableKind | null>(null);
  const [movingStructure, setMovingStructure] = useState<StructureSelection | null>(null);
  const [plantSweep, setPlantSweep] = useState<PlantSweepState>(null);
  const [harvestSweep, setHarvestSweep] = useState<HarvestSweepState>(null);
  const [screen, setScreen] = useState<GameScreen>("main_menu");
  const [message, setMessage] = useState("Connecting to local server...");
  const [nowMs, setNowMs] = useState(Date.now());
  const ordersRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    const [catalogResponse, farmResponse] = await Promise.all([client.catalog(), client.farm()]);
    setCatalog(catalogResponse);
    setView(farmResponse.view);
    setVersion(farmResponse.version);
    setMessage("Local farm synced");
  }, []);

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
      client
        .farm()
        .then((farm) => {
          setView(farm.view);
          setVersion(farm.version);
        })
        .catch((error) => setMessage(error.message));
    }, 2500);
    return () => window.clearInterval(timer);
  }, []);

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
      !fieldMenu &&
      !structureMenu &&
      !buildPlacement &&
      !movingStructure &&
      !plantSweep &&
      !harvestSweep &&
      activeFieldTool.type === "default"
    ) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".structure-context-menu")) {
        return;
      }
      setFieldMenu(null);
      setStructureMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFieldMenu(null);
        setStructureMenu(null);
        setBuildPlacement(null);
        setMovingStructure(null);
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
  }, [activeFieldTool.type, buildPlacement, fieldMenu, harvestSweep, movingStructure, plantSweep, structureMenu]);

  const select = useCallback((nextSelection: Selection) => {
    setSelection(nextSelection);
    setFieldMenu(null);
    setStructureMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
    setPlantSweep(null);
    setHarvestSweep(null);
  }, []);

  const openFieldMenu = useCallback((plotId: string, point: { x: number; y: number }) => {
    setSelection({ type: "plot", id: plotId });
    setStructureMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
    setPlantSweep(null);
    setHarvestSweep(null);
    setFieldMenu({ plotId, x: point.x, y: point.y });
  }, []);

  const openStructureMenu = useCallback((target: StructureSelection, point: { x: number; y: number }) => {
    setSelection(target);
    setFieldMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
    setPlantSweep(null);
    setHarvestSweep(null);
    setStructureMenu({ target, x: point.x, y: point.y });
  }, []);

  const selectBuildKind = useCallback((kind: BuildableKind, canPlace: boolean) => {
    setSelectedBuildKind(kind);
    setActiveFieldTool({ type: "default" });
    setFieldMenu(null);
    setStructureMenu(null);
    setMovingStructure(null);
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
    async (command: FarmCommand): Promise<boolean> => {
      try {
        const response = await client.command({ expected_version: version, command });
        setView(response.view);
        setVersion(response.version);
        setMessage(response.accepted ? "Command accepted" : response.error ?? "Command rejected");
        return response.accepted;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Command failed");
        return false;
      }
    },
    [version],
  );

  const reset = useCallback(async () => {
    const response = await client.reset();
    setView(response.view);
    setVersion(response.version);
    setSelection(null);
    setFieldMenu(null);
    setStructureMenu(null);
    setActiveFieldTool({ type: "default" });
    setBuildPlacement(null);
    setMovingStructure(null);
    setPlantSweep(null);
    setHarvestSweep(null);
    setMessage("Farm reset");
  }, []);

  const startNewFarm = useCallback(async () => {
    await reset();
    setScreen("playing");
  }, [reset]);

  const openMainMenu = useCallback(() => {
    setFieldMenu(null);
    setStructureMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
    setPlantSweep(null);
    setHarvestSweep(null);
    setActiveFieldTool({ type: "default" });
    setScreen("main_menu");
  }, []);

  const viewDeliveryOrders = useCallback(() => {
    setSelection({ type: "delivery_board" });
    setFieldMenu(null);
    setStructureMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
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
      setSelection(target);
      setFieldMenu(null);
      setStructureMenu(null);
      setActiveFieldTool({ type: "default" });
      setBuildPlacement(null);
      setMovingStructure(target);
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
      if (!isTileAvailableForStructure(view, tile, movingStructure)) {
        setMessage("Tile is occupied");
        return;
      }
      const accepted = await send({ type: "move_structure", target: movingStructure, tile });
      if (accepted) {
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
        if (accepted) {
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
      if (accepted) {
        setBuildPlacement(null);
      }
    },
    [buildPlacement, send, view],
  );

  const selectDefaultFieldTool = useCallback(() => {
    setActiveFieldTool({ type: "default" });
    setFieldMenu(null);
    setStructureMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
    setPlantSweep(null);
    setHarvestSweep(null);
    setMessage("Default tool");
  }, []);

  const selectPlantFieldTool = useCallback(
    (cropId: string) => {
      setActiveFieldTool({ type: "plant", cropId });
      setFieldMenu(null);
      setStructureMenu(null);
      setBuildPlacement(null);
      setMovingStructure(null);
      setPlantSweep(null);
      setHarvestSweep(null);
      setMessage(`Seed tool: ${itemName(catalog, cropId)}`);
    },
    [catalog],
  );

  const selectHarvestFieldTool = useCallback(() => {
    setActiveFieldTool({ type: "harvest" });
    setFieldMenu(null);
    setStructureMenu(null);
    setBuildPlacement(null);
    setMovingStructure(null);
    setPlantSweep(null);
    setHarvestSweep(null);
    setMessage("Harvest tool");
  }, []);

  const startPlantSweep = useCallback(
    (plotId: string, pointerId: number) => {
      if (!view || activeFieldTool.type !== "plant") {
        return;
      }
      const plot = view.field_plots.find((entry) => entry.id === plotId);
      const inventory = new Map(view.inventory.map((item) => [item.item_id, item.quantity]));
      if (plot?.crop || (inventory.get(activeFieldTool.cropId) ?? 0) < 1) {
        return;
      }
      setSelection({ type: "plot", id: plotId });
      setFieldMenu(null);
      setStructureMenu(null);
      setBuildPlacement(null);
      setMovingStructure(null);
      setHarvestSweep(null);
      setPlantSweep((current) => {
        if (
          current &&
          current.pointerId === pointerId &&
          current.cropId === activeFieldTool.cropId
        ) {
          return current.plotIds.includes(plotId)
            ? current
            : { ...current, plotIds: [...current.plotIds, plotId] };
        }
        return {
          cropId: activeFieldTool.cropId,
          plotIds: [plotId],
          pointerId,
        };
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
          return current;
        }
        const plot = view.field_plots.find((entry) => entry.id === plotId);
        const inventory = view.inventory.find((item) => item.item_id === current.cropId)?.quantity ?? 0;
        if (plot?.crop || current.plotIds.length >= inventory) {
          return current;
        }
        return { ...current, plotIds: [...current.plotIds, plotId] };
      });
    },
    [view],
  );

  const finishPlantSweep = useCallback(async () => {
    if (!plantSweep) {
      return;
    }
    const { cropId, plotIds } = plantSweep;
    setPlantSweep(null);
    const accepted = await send({ type: "sweep_plant", crop_id: cropId, plot_ids: plotIds });
    if (accepted) {
      setSelection({ type: "plot", id: plotIds[0] });
      setFieldMenu(null);
      setStructureMenu(null);
      setBuildPlacement(null);
    }
  }, [plantSweep, send]);

  const startHarvestSweep = useCallback(
    (plotId: string, pointerId: number) => {
      if (!view) {
        return;
      }
      const plot = view.field_plots.find((entry) => entry.id === plotId);
      if (!plot?.crop || plot.crop.ready_at_ms > nowMs) {
        return;
      }
      const cropId = plot.crop.item_id;
      setSelection({ type: "plot", id: plotId });
      setFieldMenu(null);
      setStructureMenu(null);
      setBuildPlacement(null);
      setMovingStructure(null);
      setPlantSweep(null);
      setHarvestSweep((current) => {
        if (
          current &&
          current.pointerId === pointerId &&
          current.cropId === cropId
        ) {
          return current.plotIds.includes(plotId)
            ? current
            : { ...current, plotIds: [...current.plotIds, plotId] };
        }
        return {
          cropId,
          plotIds: [plotId],
          pointerId,
        };
      });
    },
    [nowMs, view],
  );

  const enterHarvestSweepPlot = useCallback(
    (plotId: string) => {
      if (!view) {
        return;
      }
      setHarvestSweep((current) => {
        if (!current || current.plotIds.includes(plotId)) {
          return current;
        }
        const plot = view.field_plots.find((entry) => entry.id === plotId);
        if (!plot?.crop || plot.crop.item_id !== current.cropId || plot.crop.ready_at_ms > nowMs) {
          return current;
        }
        return { ...current, plotIds: [...current.plotIds, plotId] };
      });
    },
    [nowMs, view],
  );

  const finishHarvestSweep = useCallback(async () => {
    if (!harvestSweep) {
      return;
    }
    const plotIds = harvestSweep.plotIds;
    setHarvestSweep(null);
    const accepted = await send({ type: "sweep_harvest", plot_ids: plotIds });
    if (accepted) {
      setSelection({ type: "plot", id: plotIds[0] });
      setFieldMenu(null);
      setStructureMenu(null);
      setBuildPlacement(null);
    }
  }, [harvestSweep, send]);

  useEffect(() => {
    if (!plantSweep) {
      return;
    }
    const finish = (event: PointerEvent) => {
      if (event.pointerId === plantSweep.pointerId) {
        void finishPlantSweep();
      }
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [finishPlantSweep, plantSweep]);

  useEffect(() => {
    if (!harvestSweep) {
      return;
    }
    const finish = (event: PointerEvent) => {
      if (event.pointerId === harvestSweep.pointerId) {
        void finishHarvestSweep();
      }
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [finishHarvestSweep, harvestSweep]);

  if (!view || !catalog) {
    return (
      <main className="app loading">
        <p>{message}</p>
      </main>
    );
  }

  const menuModel = fieldMenu
    ? buildFieldMenuModel(
        catalog,
        view,
        view.field_plots.find((plot) => plot.id === fieldMenu.plotId) ?? view.field_plots[0],
        nowMs,
      )
    : structureMenu
      ? buildStructureMenuModel(catalog, view, structureMenu.target, nowMs)
      : null;
  const menuPoint = fieldMenu ?? structureMenu;

  return (
    <main className="app">
      <FarmScene
        view={view}
        selection={selection}
        activeFieldTool={activeFieldTool}
        buildPlacement={buildPlacement}
        movingStructure={movingStructure}
        plantSweep={plantSweep}
        harvestSweep={harvestSweep}
        onSelect={select}
        onOpenFieldMenu={openFieldMenu}
        onOpenStructureMenu={openStructureMenu}
        onPlaceNewStructure={placeNewStructure}
        onPlaceStructure={placeMovingStructure}
        onStartPlantSweep={startPlantSweep}
        onEnterPlantSweepPlot={enterPlantSweepPlot}
        onStartHarvestSweep={startHarvestSweep}
        onEnterHarvestSweepPlot={enterHarvestSweepPlot}
      />
      {screen === "playing" ? (
        <>
          <TopBar view={view} message={message} onOpenMenu={openMainMenu} />
          <aside className="side-panel">
            <PanelHeader view={view} version={version} onReset={reset} />
            <Inventory catalog={catalog} view={view} selection={selection} />
            <FieldTools
              catalog={catalog}
              view={view}
              activeFieldTool={activeFieldTool}
              onDefault={selectDefaultFieldTool}
              onPlant={selectPlantFieldTool}
              onHarvest={selectHarvestFieldTool}
            />
            <SelectionPanel
              catalog={catalog}
              view={view}
              selection={selection}
              nowMs={nowMs}
              send={send}
            />
            <Orders catalog={catalog} view={view} send={send} ordersRef={ordersRef} />
          </aside>
          <BuildTray
            catalog={catalog}
            view={view}
            selectedKind={selectedBuildKind}
            buildPlacement={buildPlacement}
            onInspectKind={inspectBuildKind}
            onSelectKind={selectBuildKind}
          />
        </>
      ) : (
        <MainMenu
          view={view}
          message={message}
          onContinue={() => setScreen("playing")}
          onNewFarm={startNewFarm}
        />
      )}
      {screen === "playing" && menuPoint && menuModel ? (
        <StructureContextMenu
          model={menuModel}
          x={menuPoint.x}
          y={menuPoint.y}
          onClose={() => {
            setFieldMenu(null);
            setStructureMenu(null);
          }}
          onCommand={async (command) => {
            const accepted = await send(command);
            if (accepted) {
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
    </main>
  );
}

function MainMenu({
  view,
  message,
  onContinue,
  onNewFarm,
}: {
  view: FarmView;
  message: string;
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
              <span>Local Farm</span>
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
                <dt>Delivery Order</dt>
                <dd>A request that pays coins and XP for goods.</dd>
              </div>
            </dl>
          </MainMenuSubpanel>
        ) : null}
        {panel === "account" ? (
          <MainMenuSubpanel title="Account" onBack={openHome}>
            <div className="main-menu__account">
              <strong>Local Player</strong>
              <span>Farm level {view.level}</span>
              <span>{view.xp} XP earned</span>
              <span>{view.delivery_orders.length} delivery orders</span>
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
  onOpenMenu,
}: {
  view: FarmView;
  message: string;
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
      <small>{message}</small>
      <button className="top-bar__menu-button" type="button" onClick={onOpenMenu}>
        Menu
      </button>
    </header>
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
}: {
  view: FarmView;
  version: number;
  onReset: () => void;
}) {
  return (
    <section className="panel-section compact">
      <div>
        <h1>Farm Control</h1>
        <p>Save v{version} - {view.delivery_orders.length} orders</p>
      </div>
      <button type="button" onClick={onReset}>
        Reset
      </button>
    </section>
  );
}

function Inventory({
  catalog,
  view,
  selection,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  selection: Selection;
}) {
  const items = relevantInventoryItems(catalog, view, selection);
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

function FieldTools({
  catalog,
  view,
  activeFieldTool,
  onDefault,
  onPlant,
  onHarvest,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  activeFieldTool: ActiveFieldTool;
  onDefault: () => void;
  onPlant: (cropId: string) => void;
  onHarvest: () => void;
}) {
  const inventory = new Map(view.inventory.map((item) => [item.item_id, item.quantity]));
  return (
    <section className="panel-section field-tools">
      <h2>Field Tools</h2>
      <div className="field-tool-grid">
        <button
          type="button"
          className={activeFieldTool.type === "default" ? "field-tool field-tool--active" : "field-tool"}
          aria-pressed={activeFieldTool.type === "default"}
          onClick={onDefault}
        >
          Default
        </button>
        <button
          type="button"
          className={activeFieldTool.type === "harvest" ? "field-tool field-tool--active" : "field-tool"}
          aria-pressed={activeFieldTool.type === "harvest"}
          onClick={onHarvest}
        >
          Harvest
        </button>
        {catalog.crops
          .filter((crop) => crop.unlock_level <= view.level)
          .map((crop) => {
            const quantity = inventory.get(crop.item_id) ?? 0;
            const active = activeFieldTool.type === "plant" && activeFieldTool.cropId === crop.item_id;
            return (
              <button
                type="button"
                key={crop.item_id}
                className={active ? "field-tool field-tool--active field-tool--seed" : "field-tool field-tool--seed"}
                aria-pressed={active}
                disabled={quantity < 1}
                onClick={() => onPlant(crop.item_id)}
              >
                <ResourceIcon type="item" itemId={crop.item_id} itemKind="crop" />
                <span>{itemName(catalog, crop.item_id)}</span>
                <strong>{quantity}</strong>
              </button>
            );
          })}
      </div>
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
    kind: item?.kind ?? "product",
  };
}

function relevantInventoryItems(catalog: CatalogDocument, view: FarmView, selection: Selection) {
  const relevantItemIds = relevantItemIdsForSelection(catalog, view, selection);
  if (!relevantItemIds) {
    return view.inventory;
  }

  const quantities = new Map(view.inventory.map((item) => [item.item_id, item.quantity]));
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
    for (const recipe of catalog.recipes.filter((entry) => entry.machine_kind === machine.kind)) {
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

  return null;
}

function SelectionPanel({
  catalog,
  view,
  selection,
  nowMs,
  send,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  selection: Selection;
  nowMs: number;
  send: SendCommand;
}) {
  const plot = selectedPlot(view, selection);
  const machine = selectedMachine(view, selection);
  const shelter = selectedShelter(view, selection);
  const isSilo = selection?.type === "silo";
  const isBarn = selection?.type === "barn";
  return (
    <section className="panel-section">
      <h2>Selection</h2>
      {isSilo ? <p>Silo storage - {view.silo_used}/{view.silo_capacity} crops</p> : null}
      {isBarn ? <p>Barn storage - {view.barn_used}/{view.barn_capacity} goods</p> : null}
      {plot ? <PlotActions catalog={catalog} view={view} plot={plot} nowMs={nowMs} send={send} /> : null}
      {machine ? (
        <MachineActions catalog={catalog} view={view} machine={machine} nowMs={nowMs} send={send} />
      ) : null}
      {shelter ? (
        <ShelterActions catalog={catalog} shelter={shelter} nowMs={nowMs} send={send} />
      ) : null}
      {selection?.type === "delivery_board" ? <p>Use delivery orders below.</p> : null}
      {!plot && !machine && !shelter && !isSilo && !isBarn && selection?.type !== "delivery_board" ? (
        <p>Select a field, machine, shelter, storage, or order board.</p>
      ) : null}
    </section>
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
  if (plot.crop) {
    const remaining = secondsRemaining(plot.crop.ready_at_ms, nowMs);
    return (
      <div className="action-stack">
        <p>{itemName(catalog, plot.crop.item_id)} - {remaining === 0 ? "ready" : `${remaining}s`}</p>
        <button
          type="button"
          disabled={remaining > 0}
          onClick={() => send({ type: "harvest_crop", plot_id: plot.id })}
        >
          Harvest
        </button>
      </div>
    );
  }
  const inventory = new Map(view.inventory.map((item) => [item.item_id, item.quantity]));
  return (
    <div className="action-grid">
      {catalog.crops
        .filter((crop) => crop.unlock_level <= view.level)
        .map((crop) => (
          <button
            type="button"
            key={crop.item_id}
            disabled={(inventory.get(crop.item_id) ?? 0) < 1}
            onClick={() => send({ type: "plant_crop", plot_id: plot.id, crop_id: crop.item_id })}
          >
            Plant {itemName(catalog, crop.item_id)}
          </button>
        ))}
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
  return (
    <div className="action-stack">
      <p>{machine.kind === "bakery" ? "Bakery" : "Feed Mill"} - queue {machine.queue.length}/2</p>
      {first ? (
        <button
          type="button"
          disabled={remaining > 0}
          onClick={() => send({ type: "collect_machine_job", machine_id: machine.id })}
        >
          Collect {recipeName(catalog, first.recipe_id)} {remaining > 0 ? `(${remaining}s)` : ""}
        </button>
      ) : null}
      <div className="action-grid">
        {availableRecipes(catalog, machine, view.level).map((recipe) => (
          <button
            type="button"
            key={recipe.id}
            onClick={() => send({ type: "queue_recipe", machine_id: machine.id, recipe_id: recipe.id })}
          >
            Make {recipe.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function ShelterActions({
  catalog,
  shelter,
  nowMs,
  send,
}: {
  catalog: CatalogDocument;
  shelter: AnimalShelterState;
  nowMs: number;
  send: SendCommand;
}) {
  const label = shelter.kind === "chicken_coop" ? "Chicken Coop" : "Cow Pasture";
  return (
    <div className="action-stack">
      <p>{label}</p>
      {shelter.animals.map((animal, index) => {
        if (animal.state.type === "idle") {
          return (
            <button
              type="button"
              key={animal.id}
              onClick={() =>
                send({ type: "feed_animal", shelter_id: shelter.id, animal_slot: animal.id })
              }
            >
              Feed animal {index + 1}
            </button>
          );
        }
        if (animal.state.type === "ready") {
          return (
            <button
              type="button"
              key={animal.id}
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

function BuildTray({
  catalog,
  view,
  selectedKind,
  buildPlacement,
  onInspectKind,
  onSelectKind,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  selectedKind: BuildableKind | null;
  buildPlacement: BuildPlacementState;
  onInspectKind: (kind: BuildableKind) => void;
  onSelectKind: (kind: BuildableKind, canPlace: boolean) => void;
}) {
  const built = useMemo(() => builtStructureKinds(view), [view]);
  const cardStates = buildKinds.map((kind) =>
    buildStructureCardState(catalog, view, kind, built, selectedKind, buildPlacement),
  );
  const detail = cardStates.find((state) => state.kind === (selectedKind ?? buildKinds[0])) ?? cardStates[0];

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
  if (kind === "bakery" || kind === "feed_mill") {
    return catalog.machines.find((machine) => machine.kind === kind)?.unlock_level ?? 1;
  }
  if (kind === "delivery_board") {
    return 4;
  }
  const shelterKind = kind === "chicken_coop" ? "chicken_coop" : "cow_pasture";
  return catalog.shelters.find((shelter) => shelter.kind === shelterKind)?.unlock_level ?? 1;
}

function buildCostForBuildKind(catalog: CatalogDocument, kind: BuildableKind): number {
  if (kind === "field_plot") {
    return fieldPlotBuildCost;
  }
  if (kind === "bakery" || kind === "feed_mill") {
    return catalog.machines.find((machine) => machine.kind === kind)?.build_cost ?? 0;
  }
  if (kind === "delivery_board") {
    return 20;
  }
  const shelterKind = kind === "chicken_coop" ? "chicken_coop" : "cow_pasture";
  return catalog.shelters.find((shelter) => shelter.kind === shelterKind)?.build_cost ?? 0;
}


function StructureContextMenu({
  model,
  x,
  y,
  onClose,
  onCommand,
  onStartMove,
  onViewOrders,
}: {
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
      className="structure-context-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label={`${model.title} actions`}
      data-testid="structure-context-menu"
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
