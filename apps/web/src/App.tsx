import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import { createFarmClient } from "./api";
import { FarmScene } from "./components/FarmScene";
import { ResourceIcon } from "./components/ResourceIcon";
import {
  availableRecipes,
  builtStructureKinds,
  isTileAvailableForStructure,
  itemName,
  recipeName,
  secondsRemaining,
  selectedMachine,
  selectedPlot,
  selectedShelter,
  selectedStructureLabel,
  structureLabel,
  structureTile,
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

const client = createFarmClient();
const buildKinds: StructureKind[] = [
  "bakery",
  "feed_mill",
  "chicken_coop",
  "delivery_board",
  "cow_pasture",
];

type SendCommand = (command: FarmCommand) => Promise<boolean>;
type BuildContextMenuState = {
  kind: StructureKind;
  x: number;
  y: number;
} | null;

export function App() {
  const [catalog, setCatalog] = useState<CatalogDocument | null>(null);
  const [view, setView] = useState<FarmView | null>(null);
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [fieldMenu, setFieldMenu] = useState<FieldContextMenuState>(null);
  const [structureMenu, setStructureMenu] = useState<StructureContextMenuState>(null);
  const [buildMenu, setBuildMenu] = useState<BuildContextMenuState>(null);
  const [movingStructure, setMovingStructure] = useState<StructureSelection | null>(null);
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
    if (!fieldMenu && !structureMenu && !buildMenu && !movingStructure) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".structure-context-menu")) {
        return;
      }
      setFieldMenu(null);
      setStructureMenu(null);
      setBuildMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFieldMenu(null);
        setStructureMenu(null);
        setBuildMenu(null);
        setMovingStructure(null);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [buildMenu, fieldMenu, movingStructure, structureMenu]);

  const select = useCallback((nextSelection: Selection) => {
    setSelection(nextSelection);
    setFieldMenu(null);
    setStructureMenu(null);
    setBuildMenu(null);
    setMovingStructure(null);
  }, []);

  const openFieldMenu = useCallback((plotId: string, point: { x: number; y: number }) => {
    setSelection({ type: "plot", id: plotId });
    setStructureMenu(null);
    setBuildMenu(null);
    setMovingStructure(null);
    setFieldMenu({ plotId, x: point.x, y: point.y });
  }, []);

  const openStructureMenu = useCallback((target: StructureSelection, point: { x: number; y: number }) => {
    setSelection(target);
    setFieldMenu(null);
    setBuildMenu(null);
    setMovingStructure(null);
    setStructureMenu({ target, x: point.x, y: point.y });
  }, []);

  const openBuildMenu = useCallback((kind: StructureKind, point: { x: number; y: number }) => {
    setFieldMenu(null);
    setStructureMenu(null);
    setMovingStructure(null);
    setBuildMenu({ kind, x: point.x, y: point.y });
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
    setBuildMenu(null);
    setMovingStructure(null);
    setMessage("Farm reset");
  }, []);

  const viewDeliveryOrders = useCallback(() => {
    setSelection({ type: "delivery_board" });
    setFieldMenu(null);
    setStructureMenu(null);
    setBuildMenu(null);
    setMovingStructure(null);
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
      setBuildMenu(null);
      setMovingStructure(target);
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
      : buildMenu
        ? buildStructureBuildMenuModel(catalog, view, buildMenu.kind)
        : null;
  const menuPoint = fieldMenu ?? structureMenu ?? buildMenu;

  return (
    <main className="app">
      <FarmScene
        view={view}
        selection={selection}
        movingStructure={movingStructure}
        onSelect={select}
        onOpenFieldMenu={openFieldMenu}
        onOpenStructureMenu={openStructureMenu}
        onPlaceStructure={placeMovingStructure}
      />
      <TopBar view={view} message={message} />
      <aside className="side-panel">
        <PanelHeader view={view} version={version} onReset={reset} />
        <Inventory catalog={catalog} view={view} selection={selection} />
        <SelectionPanel
          catalog={catalog}
          view={view}
          selection={selection}
          nowMs={nowMs}
          send={send}
        />
        <Orders catalog={catalog} view={view} send={send} ordersRef={ordersRef} />
      </aside>
      <BuildTray catalog={catalog} view={view} send={send} onOpenBuildMenu={openBuildMenu} />
      {menuPoint && menuModel ? (
        <StructureContextMenu
          model={menuModel}
          x={menuPoint.x}
          y={menuPoint.y}
          onClose={() => {
            setFieldMenu(null);
            setStructureMenu(null);
            setBuildMenu(null);
          }}
          onCommand={async (command) => {
            const accepted = await send(command);
            if (accepted) {
              setFieldMenu(null);
              setStructureMenu(null);
              setBuildMenu(null);
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

function TopBar({ view, message }: { view: FarmView; message: string }) {
  return (
    <header className="top-bar">
      <strong>My Farm</strong>
      <Metric type="level" label={`Level ${view.level}`} />
      <Metric type="xp" label={`${view.xp} XP`} />
      <Metric type="coins" label={`${view.coins} coins`} />
      <Metric type="silo" label={`Silo ${view.silo_used}/${view.silo_capacity}`} />
      <Metric type="barn" label={`Barn ${view.barn_used}/${view.barn_capacity}`} />
      <small>{message}</small>
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
  return (
    <section className="panel-section">
      <h2>Selection</h2>
      {plot ? <PlotActions catalog={catalog} view={view} plot={plot} nowMs={nowMs} send={send} /> : null}
      {machine ? (
        <MachineActions catalog={catalog} view={view} machine={machine} nowMs={nowMs} send={send} />
      ) : null}
      {shelter ? (
        <ShelterActions catalog={catalog} shelter={shelter} nowMs={nowMs} send={send} />
      ) : null}
      {selection?.type === "delivery_board" ? <p>Use delivery orders below.</p> : null}
      {!plot && !machine && !shelter && selection?.type !== "delivery_board" ? (
        <p>Select a field, machine, shelter, or order board.</p>
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
  send,
  onOpenBuildMenu,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  send: SendCommand;
  onOpenBuildMenu: (kind: StructureKind, point: { x: number; y: number }) => void;
}) {
  const built = useMemo(() => builtStructureKinds(view), [view]);
  return (
    <nav className="build-tray">
      {buildKinds.map((kind) => {
        const unlockLevel = unlockLevelForStructure(catalog, kind);
        const unavailable = built.has(kind) || view.level < unlockLevel;
        return (
          <BuildTrayButton
            key={kind}
            kind={kind}
            unavailable={unavailable}
            onOpenBuildMenu={onOpenBuildMenu}
            onBuild={() =>
              send({
                type: "buy_structure",
                structure_kind: kind,
                tile: structureTile(kind),
              })
            }
          />
        );
      })}
    </nav>
  );
}

function BuildTrayButton({
  kind,
  unavailable,
  onBuild,
  onOpenBuildMenu,
}: {
  kind: StructureKind;
  unavailable: boolean;
  onBuild: () => void;
  onOpenBuildMenu: (kind: StructureKind, point: { x: number; y: number }) => void;
}) {
  const longPressTimer = useRef<number | null>(null);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => clearLongPress, []);

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressStart.current = null;
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", clearLongPress);
    window.removeEventListener("pointercancel", clearLongPress);
  }

  function handleWindowPointerMove(event: PointerEvent) {
    if (!longPressStart.current) {
      return;
    }
    const moved = Math.hypot(
      event.clientX - longPressStart.current.x,
      event.clientY - longPressStart.current.y,
    );
    if (moved > 8) {
      clearLongPress();
    }
  }

  const openMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenBuildMenu(kind, { x: event.clientX, y: event.clientY });
  };

  const startLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }
    longPressStart.current = { x: event.clientX, y: event.clientY };
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", clearLongPress);
    window.addEventListener("pointercancel", clearLongPress);
    longPressTimer.current = window.setTimeout(() => {
      if (!longPressStart.current) {
        return;
      }
      onOpenBuildMenu(kind, longPressStart.current);
      clearLongPress();
    }, 500);
  };

  return (
    <button
      type="button"
      aria-disabled={unavailable}
      onClick={() => {
        clearLongPress();
        if (!unavailable) {
          onBuild();
        }
      }}
      onContextMenu={openMenu}
      onPointerDown={startLongPress}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
    >
      {structureLabel(kind)}
    </button>
  );
}

function unlockLevelForStructure(catalog: CatalogDocument, kind: StructureKind): number {
  if (kind === "bakery" || kind === "feed_mill") {
    return catalog.machines.find((machine) => machine.kind === kind)?.unlock_level ?? 1;
  }
  if (kind === "delivery_board") {
    return 4;
  }
  const shelterKind = kind === "chicken_coop" ? "chicken_coop" : "cow_pasture";
  return catalog.shelters.find((shelter) => shelter.kind === shelterKind)?.unlock_level ?? 1;
}

function buildStructureBuildMenuModel(
  catalog: CatalogDocument,
  view: FarmView,
  kind: StructureKind,
): StructureMenuModel {
  const built = builtStructureKinds(view).has(kind);
  const unlockLevel = unlockLevelForStructure(catalog, kind);
  const buildCost = buildCostForStructure(catalog, kind);
  const label = structureLabel(kind);
  const reason = built
    ? "Already built"
    : view.level < unlockLevel
      ? `Unlocks at level ${unlockLevel}`
      : view.coins < buildCost
        ? `Need ${buildCost - view.coins} coins`
        : undefined;

  return {
    title: label,
    subtitle: built ? "Built structure" : `${buildCost} coins`,
    items: [
      {
        id: `build-${kind}`,
        label: "Build",
        disabled: Boolean(reason),
        reason,
        command: reason
          ? undefined
          : { type: "buy_structure", structure_kind: kind, tile: structureTile(kind) },
      },
    ],
  };
}

function buildCostForStructure(catalog: CatalogDocument, kind: StructureKind): number {
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
