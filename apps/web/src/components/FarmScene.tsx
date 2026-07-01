import { Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { colorForItem, spriteTexture } from "../assets/sprites";
import type { FarmView, FieldPlot, MachineState, StructureKind, Tile } from "../types";
import {
  isTileOccupiedForPlacement,
  isTileAvailableForNewFieldPlot,
  isTileAvailableForNewStructure,
  isTileAvailableForStructure,
  structureFootprint,
  structureFootprintForSelection,
  type Selection,
  type StructureFootprint,
  type StructureSelection,
} from "../game/selectors";

const FARM_GROUND_COLOR = "#6d9b57";
const MOVE_TILE_AVAILABLE_COLOR = "#2f7d55";
const MOVE_TILE_AVAILABLE_EMISSIVE = "#123826";
const MOVE_TILE_BLOCKED_COLOR = "#a9333f";
const MOVE_TILE_BLOCKED_EMISSIVE = "#461016";
const MOVE_OCCUPIED_BLOCKED_TINT = "#ef6a66";
const MOVE_TARGET_TINT = "#fff7c7";

type Props = {
  view: FarmView;
  selection: Selection;
  activeFieldTool: ActiveFieldTool;
  buildPlacement: BuildPlacementState;
  movingStructure: StructureSelection | null;
  plantSweep: PlantSweepState;
  harvestSweep: HarvestSweepState;
  onSelect: (selection: Selection) => void;
  onOpenFieldMenu: (plotId: string, point: { x: number; y: number }) => void;
  onOpenStructureMenu: (target: StructureSelection, point: { x: number; y: number }) => void;
  onPlaceNewStructure: (tile: Tile) => void;
  onPlaceStructure: (tile: Tile) => void;
  onStartPlantSweep: (plotId: string, pointerId: number) => void;
  onEnterPlantSweepPlot: (plotId: string) => void;
  onStartHarvestSweep: (plotId: string, pointerId: number) => void;
  onEnterHarvestSweepPlot: (plotId: string) => void;
  onCancelFieldToolAction: () => void;
};

export function FarmScene({
  view,
  selection,
  activeFieldTool,
  buildPlacement,
  movingStructure,
  plantSweep,
  harvestSweep,
  onSelect,
  onOpenFieldMenu,
  onOpenStructureMenu,
  onPlaceNewStructure,
  onPlaceStructure,
  onStartPlantSweep,
  onEnterPlantSweepPlot,
  onStartHarvestSweep,
  onEnterHarvestSweepPlot,
  onCancelFieldToolAction,
}: Props) {
  const [hoverTile, setHoverTile] = useState<Tile | null>(null);

  useEffect(() => {
    if (!movingStructure && !buildPlacement) {
      setHoverTile(null);
    }
  }, [buildPlacement, movingStructure]);

  return (
    <Canvas
      className="farm-canvas"
      style={{ position: "absolute", inset: 0, width: "100vw", height: "100vh" }}
      gl={{ preserveDrawingBuffer: true }}
      orthographic
      camera={{ position: [12, 12, 12], zoom: 44, near: 0.1, far: 100 }}
      shadows
    >
      <color attach="background" args={["#9fd3d1"]} />
      <ambientLight intensity={1.7} />
      <directionalLight position={[8, 10, 4]} intensity={1.8} castShadow />
      <group position={[-8.5, 0, -7.8]}>
        <FarmGround
          view={view}
          buildPlacement={buildPlacement}
          movingStructure={movingStructure}
          onHoverTile={setHoverTile}
          onPlaceNewStructure={onPlaceNewStructure}
          onPlaceStructure={onPlaceStructure}
        />
        {view.field_plots.map((plot) => (
          <FieldMesh
            key={plot.id}
            plot={plot}
            selected={selection?.type === "plot" && selection.id === plot.id}
            activeFieldTool={activeFieldTool}
            buildPlacement={buildPlacement}
            movingStructure={movingStructure}
            plantSweep={plantSweep}
            harvestSweep={harvestSweep}
            onHoverTile={setHoverTile}
            onSelect={onSelect}
            onOpenFieldMenu={onOpenFieldMenu}
            onPlaceNewStructure={onPlaceNewStructure}
            onPlaceStructure={onPlaceStructure}
            onStartPlantSweep={onStartPlantSweep}
            onEnterPlantSweepPlot={onEnterPlantSweepPlot}
            onStartHarvestSweep={onStartHarvestSweep}
            onEnterHarvestSweepPlot={onEnterHarvestSweepPlot}
            onCancelFieldToolAction={onCancelFieldToolAction}
          />
        ))}
        <StructureSprite
          target={{ type: "silo" }}
          label="Silo"
          hitLabel="Silo"
          tile={view.silo_tile}
          color="#d8b65a"
          footprint={structureFootprint("silo")}
          selected={selection?.type === "silo"}
          buildPlacement={buildPlacement}
          movingStructure={movingStructure}
          onHoverTile={setHoverTile}
          onOpenStructureMenu={onOpenStructureMenu}
          onPlaceNewStructure={onPlaceNewStructure}
          onPlaceStructure={onPlaceStructure}
          onSelect={() => {
            onSelect({ type: "silo" });
          }}
        />
        <StructureSprite
          target={{ type: "barn" }}
          label="Barn"
          hitLabel="Barn"
          tile={view.barn_tile}
          color="#b95346"
          footprint={structureFootprint("barn")}
          selected={selection?.type === "barn"}
          buildPlacement={buildPlacement}
          movingStructure={movingStructure}
          onHoverTile={setHoverTile}
          onOpenStructureMenu={onOpenStructureMenu}
          onPlaceNewStructure={onPlaceNewStructure}
          onPlaceStructure={onPlaceStructure}
          onSelect={() => {
            onSelect({ type: "barn" });
          }}
        />
        {view.machines.map((machine) => (
          <MachineMesh
            key={machine.id}
            machine={machine}
            selected={selection?.type === "machine" && selection.id === machine.id}
            buildPlacement={buildPlacement}
            movingStructure={movingStructure}
            onHoverTile={setHoverTile}
            onSelect={onSelect}
            onOpenStructureMenu={onOpenStructureMenu}
            onPlaceNewStructure={onPlaceNewStructure}
            onPlaceStructure={onPlaceStructure}
          />
        ))}
        {view.shelters.map((shelter) => (
          <StructureSprite
            key={shelter.id}
            target={{ type: "shelter", id: shelter.id }}
            label={shelter.kind === "chicken_coop" ? "Chickens" : "Cows"}
            hitLabel={shelter.kind === "chicken_coop" ? "Chicken Coop" : "Cow Pasture"}
            tile={shelter.tile}
            color={shelter.kind === "chicken_coop" ? "#d8a64e" : "#b98762"}
            footprint={structureFootprint(shelter.kind)}
            selected={selection?.type === "shelter" && selection.id === shelter.id}
            buildPlacement={buildPlacement}
            movingStructure={movingStructure}
            onHoverTile={setHoverTile}
            onOpenStructureMenu={onOpenStructureMenu}
            onPlaceNewStructure={onPlaceNewStructure}
            onPlaceStructure={onPlaceStructure}
            onSelect={() => {
              onSelect({ type: "shelter", id: shelter.id });
            }}
          />
        ))}
        {view.delivery_board_built ? (
          <StructureSprite
            target={{ type: "delivery_board" }}
            label="Orders"
            hitLabel="Delivery Board"
            tile={view.delivery_board_tile}
            color="#d7c48a"
            footprint={structureFootprint("delivery_board")}
            selected={selection?.type === "delivery_board"}
            buildPlacement={buildPlacement}
            movingStructure={movingStructure}
            onHoverTile={setHoverTile}
            onOpenStructureMenu={onOpenStructureMenu}
            onPlaceNewStructure={onPlaceNewStructure}
            onPlaceStructure={onPlaceStructure}
            onSelect={() => {
              onSelect({ type: "delivery_board" });
            }}
          />
        ) : null}
        {movingStructure && hoverTile ? (
          <PlacementPreview
            tile={hoverTile}
            footprint={structureFootprintForSelection(view, movingStructure)}
            valid={isTileAvailableForStructure(view, hoverTile, movingStructure)}
          />
        ) : buildPlacement && hoverTile ? (
          <PlacementPreview
            tile={hoverTile}
            footprint={
              buildPlacement.kind === "field_plot"
                ? { width: 1, height: 1 }
                : structureFootprint(buildPlacement.kind)
            }
            valid={
              buildPlacement.kind === "field_plot"
                ? isTileAvailableForNewFieldPlot(view, hoverTile)
                : isTileAvailableForNewStructure(view, hoverTile, buildPlacement.kind)
            }
          />
        ) : null}
      </group>
      <OrbitControls
        enabled={activeFieldTool.type === "default" && !harvestSweep && !plantSweep}
        enableRotate={false}
        enablePan
        enableZoom
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{
          ONE: THREE.TOUCH.PAN,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
        minZoom={28}
        maxZoom={82}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}

type HarvestSweepState = {
  cropId: string;
  plotIds: string[];
  pointerId: number;
} | null;

type PlantSweepState = {
  cropId: string;
  plotIds: string[];
  pointerId: number;
} | null;

type ActiveFieldTool = { type: "default" } | { type: "plant"; cropId: string } | { type: "harvest" };

type BuildPlacementState = {
  kind: StructureKind | "field_plot";
} | null;

function FarmGround({
  view,
  buildPlacement,
  movingStructure,
  onHoverTile,
  onPlaceNewStructure,
  onPlaceStructure,
}: {
  view: FarmView;
  buildPlacement: BuildPlacementState;
  movingStructure: StructureSelection | null;
  onHoverTile: (tile: Tile) => void;
  onPlaceNewStructure: (tile: Tile) => void;
  onPlaceStructure: (tile: Tile) => void;
}) {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: FARM_GROUND_COLOR,
        roughness: 0.95,
      }),
    [],
  );
  const tiles = [];
  for (let x = 0; x < 18; x += 1) {
    for (let y = 0; y < 18; y += 1) {
      const tile = { x, y };
      const isOccupied = isTileOccupiedForPlacement(view, tile, movingStructure);
      tiles.push(
        <mesh
          key={`${x}-${y}`}
          position={[x, -0.03, y]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(event) => {
            if (!movingStructure && !buildPlacement) {
              return;
            }
            stop(event);
            if (movingStructure) {
              onPlaceStructure(tile);
              return;
            }
            onPlaceNewStructure(tile);
          }}
          onPointerMove={() => {
            if (movingStructure || buildPlacement) {
              onHoverTile(tile);
            }
          }}
        >
          <planeGeometry args={[0.96, 0.96]} />
          {movingStructure || buildPlacement ? (
            <meshStandardMaterial
              color={isOccupied ? MOVE_TILE_BLOCKED_COLOR : MOVE_TILE_AVAILABLE_COLOR}
              emissive={isOccupied ? MOVE_TILE_BLOCKED_EMISSIVE : MOVE_TILE_AVAILABLE_EMISSIVE}
              emissiveIntensity={0.22}
              roughness={0.9}
            />
          ) : (
            <primitive object={material} attach="material" />
          )}
        </mesh>,
      );
    }
  }
  return <>{tiles}</>;
}

function FieldMesh({
  plot,
  selected,
  activeFieldTool,
  buildPlacement,
  movingStructure,
  plantSweep,
  harvestSweep,
  onHoverTile,
  onSelect,
  onOpenFieldMenu,
  onPlaceNewStructure,
  onPlaceStructure,
  onStartPlantSweep,
  onEnterPlantSweepPlot,
  onStartHarvestSweep,
  onEnterHarvestSweepPlot,
  onCancelFieldToolAction,
}: {
  plot: FieldPlot;
  selected: boolean;
  activeFieldTool: ActiveFieldTool;
  buildPlacement: BuildPlacementState;
  movingStructure: StructureSelection | null;
  plantSweep: PlantSweepState;
  harvestSweep: HarvestSweepState;
  onHoverTile: (tile: Tile) => void;
  onSelect: (selection: Selection) => void;
  onOpenFieldMenu: (plotId: string, point: { x: number; y: number }) => void;
  onPlaceNewStructure: (tile: Tile) => void;
  onPlaceStructure: (tile: Tile) => void;
  onStartPlantSweep: (plotId: string, pointerId: number) => void;
  onEnterPlantSweepPlot: (plotId: string) => void;
  onStartHarvestSweep: (plotId: string, pointerId: number) => void;
  onEnterHarvestSweepPlot: (plotId: string) => void;
  onCancelFieldToolAction: () => void;
}) {
  const cropReady = plot.crop ? Date.now() >= plot.crop.ready_at_ms : false;
  const color = plot.crop ? colorForItem(plot.crop.item_id) : "#8a5a35";
  const longPressTimer = useRef<number | null>(null);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);
  const ignoreNextClick = useRef(false);
  const texture = useMemo(
    () => spriteTexture(plot.crop ? (cropReady ? "Ready" : plot.crop.item_id) : "Field", color),
    [color, cropReady, plot.crop],
  );
  const blockedByPlacement = movingStructure !== null || buildPlacement !== null;
  const sweptByHarvest = harvestSweep?.plotIds.includes(plot.id) ?? false;
  const sweptByPlant = plantSweep?.plotIds.includes(plot.id) ?? false;
  const fieldToolActive = activeFieldTool.type !== "default";
  const eligibleForHarvestSweep =
    harvestSweep !== null &&
    plot.crop?.item_id === harvestSweep.cropId &&
    Date.now() >= plot.crop.ready_at_ms;

  useEffect(() => {
    return () => {
      clearLongPress();
    };
  }, []);

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

  function primaryButtonPressed(buttons: number) {
    return (buttons & 1) === 1;
  }

  function cancelActiveFieldTool() {
    clearLongPress();
    ignoreNextClick.current = true;
    onCancelFieldToolAction();
  }

  function applyActiveFieldTool(pointerId: number, buttons: number) {
    if (!primaryButtonPressed(buttons)) {
      return false;
    }
    if (activeFieldTool.type === "plant") {
      if (plot.crop) {
        return true;
      }
      if (plantSweep && plantSweep.pointerId === pointerId) {
        onEnterPlantSweepPlot(plot.id);
      } else {
        onStartPlantSweep(plot.id, pointerId);
      }
      return true;
    }
    if (activeFieldTool.type === "harvest") {
      if (!plot.crop || !cropReady) {
        return true;
      }
      if (harvestSweep && harvestSweep.pointerId === pointerId) {
        if (eligibleForHarvestSweep) {
          onEnterHarvestSweepPlot(plot.id);
        }
      } else {
        onStartHarvestSweep(plot.id, pointerId);
      }
      return true;
    }
    return false;
  }

  const openMenu = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    stop(event);
    event.nativeEvent.preventDefault();
    if (fieldToolActive) {
      cancelActiveFieldTool();
      return;
    }
    onOpenFieldMenu(plot.id, {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
    });
  };

  const openDomMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (fieldToolActive) {
      cancelActiveFieldTool();
      return;
    }
    onOpenFieldMenu(plot.id, {
      x: event.clientX,
      y: event.clientY,
    });
  };

  const selectFromDom = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (buildPlacement) {
      clearLongPress();
      event.stopPropagation();
      onPlaceNewStructure(plot.tile);
      return;
    }
    if (movingStructure) {
      clearLongPress();
      event.stopPropagation();
      onPlaceStructure(plot.tile);
      return;
    }
    if (ignoreNextClick.current) {
      ignoreNextClick.current = false;
      event.stopPropagation();
      return;
    }
    if (harvestSweep) {
      event.stopPropagation();
      return;
    }
    if (plantSweep || fieldToolActive) {
      event.stopPropagation();
      return;
    }
    clearLongPress();
    event.stopPropagation();
    onSelect({ type: "plot", id: plot.id });
  };

  const startDomPointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (buildPlacement) {
      event.stopPropagation();
      return;
    }
    if (event.button === 2 && fieldToolActive) {
      event.preventDefault();
      event.stopPropagation();
      cancelActiveFieldTool();
      return;
    }
    if (activeFieldTool.type === "plant") {
      event.stopPropagation();
      ignoreNextClick.current = true;
      if (!plot.crop) {
        onStartPlantSweep(plot.id, event.pointerId);
      }
      return;
    }
    if (activeFieldTool.type === "harvest") {
      event.stopPropagation();
      ignoreNextClick.current = true;
      if (plot.crop && cropReady) {
        onStartHarvestSweep(plot.id, event.pointerId);
      }
      return;
    }
    if (event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }
    event.stopPropagation();
    longPressStart.current = {
      x: event.clientX,
      y: event.clientY,
    };
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", clearLongPress);
    window.addEventListener("pointercancel", clearLongPress);
    longPressTimer.current = window.setTimeout(() => {
      if (!longPressStart.current) {
        return;
      }
      ignoreNextClick.current = true;
      onOpenFieldMenu(plot.id, longPressStart.current);
      clearLongPress();
    }, 500);
  };

  return (
    <>
      <mesh
        position={[plot.tile.x, 0.04, plot.tile.y]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(event) => {
          if (buildPlacement) {
            clearLongPress();
            stop(event);
            onPlaceNewStructure(plot.tile);
            return;
          }
          if (movingStructure) {
            clearLongPress();
            stop(event);
            onPlaceStructure(plot.tile);
            return;
          }
          if (ignoreNextClick.current) {
            ignoreNextClick.current = false;
            stop(event);
            return;
          }
          if (harvestSweep) {
            stop(event);
            return;
          }
          if (plantSweep || fieldToolActive) {
            stop(event);
            return;
          }
          clearLongPress();
          stop(event);
          onSelect({ type: "plot", id: plot.id });
        }}
        onContextMenu={openMenu}
        onPointerDown={(event) => {
          if (buildPlacement) {
            stop(event);
            return;
          }
          if (event.nativeEvent.button === 2) {
            if (fieldToolActive) {
              stop(event);
              event.nativeEvent.preventDefault();
              cancelActiveFieldTool();
              return;
            }
            openMenu(event);
            return;
          }
          if (activeFieldTool.type === "plant") {
            stop(event);
            ignoreNextClick.current = true;
            if (!plot.crop) {
              onStartPlantSweep(plot.id, event.nativeEvent.pointerId);
            }
            return;
          }
          if (activeFieldTool.type === "harvest") {
            stop(event);
            ignoreNextClick.current = true;
            if (plot.crop && cropReady) {
              onStartHarvestSweep(plot.id, event.nativeEvent.pointerId);
            }
            return;
          }
          if (event.nativeEvent.pointerType !== "touch" && event.nativeEvent.pointerType !== "pen") {
            return;
          }
          stop(event);
          longPressStart.current = {
            x: event.nativeEvent.clientX,
            y: event.nativeEvent.clientY,
          };
          window.addEventListener("pointermove", handleWindowPointerMove);
          window.addEventListener("pointerup", clearLongPress);
          window.addEventListener("pointercancel", clearLongPress);
          longPressTimer.current = window.setTimeout(() => {
            if (!longPressStart.current) {
              return;
            }
            ignoreNextClick.current = true;
            onOpenFieldMenu(plot.id, longPressStart.current);
            clearLongPress();
          }, 500);
        }}
        onPointerMove={(event) => {
          if (applyActiveFieldTool(event.nativeEvent.pointerId, event.nativeEvent.buttons)) {
            stop(event);
            return;
          }
          if (harvestSweep && event.nativeEvent.pointerId === harvestSweep.pointerId) {
            stop(event);
            if (eligibleForHarvestSweep) {
              onEnterHarvestSweepPlot(plot.id);
            }
            return;
          }
          if (plantSweep && event.nativeEvent.pointerId === plantSweep.pointerId) {
            stop(event);
            if (!plot.crop) {
              onEnterPlantSweepPlot(plot.id);
            }
            return;
          }
          if (movingStructure || buildPlacement) {
            onHoverTile(plot.tile);
          }
          if (!longPressStart.current) {
            return;
          }
          const moved = Math.hypot(
            event.nativeEvent.clientX - longPressStart.current.x,
            event.nativeEvent.clientY - longPressStart.current.y,
          );
          if (moved > 8) {
            clearLongPress();
          }
        }}
        onPointerOver={(event) => {
          if (applyActiveFieldTool(event.nativeEvent.pointerId, event.nativeEvent.buttons)) {
            stop(event);
          }
        }}
        onPointerUp={() => {
          clearLongPress();
        }}
        onPointerCancel={() => {
          clearLongPress();
        }}
      >
        <planeGeometry args={[0.9, 0.9]} />
        <meshStandardMaterial
          map={texture}
          color={
            blockedByPlacement
              ? MOVE_OCCUPIED_BLOCKED_TINT
              : sweptByPlant
                ? "#d5f4c6"
              : sweptByHarvest
                ? MOVE_TARGET_TINT
                : selected
                  ? "#ffffff"
                  : "#f4ead2"
          }
          emissive={blockedByPlacement ? MOVE_TILE_BLOCKED_EMISSIVE : selected ? "#446d38" : "#000000"}
          emissiveIntensity={blockedByPlacement ? 0.18 : selected || sweptByHarvest || sweptByPlant ? 0.22 : 0}
        />
      </mesh>
      <Html
        position={[plot.tile.x, 0.12, plot.tile.y]}
        center
        zIndexRange={[100, 0]}
        wrapperClass="field-hit-wrapper"
      >
        <button
          className="field-hit-target"
          type="button"
          tabIndex={-1}
          aria-label={`Field Plot ${plot.id}`}
          onClick={selectFromDom}
          onContextMenu={openDomMenu}
          onPointerDown={startDomPointer}
          onPointerMove={(event) => {
            if (applyActiveFieldTool(event.pointerId, event.buttons)) {
              event.stopPropagation();
              return;
            }
            if (harvestSweep && event.pointerId === harvestSweep.pointerId) {
              event.stopPropagation();
              if (eligibleForHarvestSweep) {
                onEnterHarvestSweepPlot(plot.id);
              }
              return;
            }
            if (plantSweep && event.pointerId === plantSweep.pointerId) {
              event.stopPropagation();
              if (!plot.crop) {
                onEnterPlantSweepPlot(plot.id);
              }
              return;
            }
            if (movingStructure || buildPlacement) {
              onHoverTile(plot.tile);
            }
          }}
          onPointerOver={(event) => {
            if (applyActiveFieldTool(event.pointerId, event.buttons)) {
              event.stopPropagation();
            }
          }}
          onPointerUp={() => {
            clearLongPress();
          }}
          onPointerCancel={() => {
            clearLongPress();
          }}
        />
      </Html>
    </>
  );
}

function MachineMesh({
  machine,
  selected,
  buildPlacement,
  movingStructure,
  onHoverTile,
  onSelect,
  onOpenStructureMenu,
  onPlaceNewStructure,
  onPlaceStructure,
}: {
  machine: MachineState;
  selected: boolean;
  buildPlacement: BuildPlacementState;
  movingStructure: StructureSelection | null;
  onHoverTile: (tile: Tile) => void;
  onSelect: (selection: Selection) => void;
  onOpenStructureMenu: (target: StructureSelection, point: { x: number; y: number }) => void;
  onPlaceNewStructure: (tile: Tile) => void;
  onPlaceStructure: (tile: Tile) => void;
}) {
  return (
    <StructureSprite
      target={{ type: "machine", id: machine.id }}
      label={machine.kind === "bakery" ? "Bakery" : "Feed Mill"}
      hitLabel={machine.kind === "bakery" ? "Bakery" : "Feed Mill"}
      tile={machine.tile}
      color={machine.kind === "bakery" ? "#c97a48" : "#79955b"}
      footprint={structureFootprint(machine.kind)}
      selected={selected}
      buildPlacement={buildPlacement}
      movingStructure={movingStructure}
      onHoverTile={onHoverTile}
      onOpenStructureMenu={onOpenStructureMenu}
      onPlaceNewStructure={onPlaceNewStructure}
      onPlaceStructure={onPlaceStructure}
      onSelect={() => {
        onSelect({ type: "machine", id: machine.id });
      }}
    />
  );
}

function StructureSprite({
  target,
  label,
  hitLabel,
  tile,
  color,
  footprint,
  selected,
  buildPlacement,
  movingStructure,
  onHoverTile,
  onSelect,
  onOpenStructureMenu,
  onPlaceNewStructure,
  onPlaceStructure,
}: {
  target: StructureSelection;
  label: string;
  hitLabel: string;
  tile: Tile;
  color: string;
  footprint: StructureFootprint;
  selected: boolean;
  buildPlacement: BuildPlacementState;
  movingStructure: StructureSelection | null;
  onHoverTile: (tile: Tile) => void;
  onSelect: () => void;
  onOpenStructureMenu: (target: StructureSelection, point: { x: number; y: number }) => void;
  onPlaceNewStructure: (tile: Tile) => void;
  onPlaceStructure: (tile: Tile) => void;
}) {
  const texture = useMemo(() => spriteTexture(label, color), [label, color]);
  const isMovingTarget = isSameStructure(movingStructure, target);
  const blockedByPlacement = buildPlacement !== null || (movingStructure !== null && !isMovingTarget);
  const center = footprintCenter(tile, footprint);
  const visualWidth = Math.max(1.35, footprint.width * 1.08);
  const visualHeight = Math.max(1.35, footprint.height * 1.08);
  const longPressTimer = useRef<number | null>(null);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);
  const ignoreNextClick = useRef(false);

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

  const openMenu = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    stop(event);
    event.nativeEvent.preventDefault();
    onOpenStructureMenu(target, {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
    });
  };

  const openDomMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenStructureMenu(target, {
      x: event.clientX,
      y: event.clientY,
    });
  };

  const selectFromDom = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (buildPlacement) {
      clearLongPress();
      event.stopPropagation();
      onPlaceNewStructure(tile);
      return;
    }
    if (movingStructure) {
      clearLongPress();
      event.stopPropagation();
      onPlaceStructure(tile);
      return;
    }
    if (ignoreNextClick.current) {
      ignoreNextClick.current = false;
      event.stopPropagation();
      return;
    }
    clearLongPress();
    event.stopPropagation();
    onSelect();
  };

  const startDomLongPress = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }
    event.stopPropagation();
    longPressStart.current = {
      x: event.clientX,
      y: event.clientY,
    };
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", clearLongPress);
    window.addEventListener("pointercancel", clearLongPress);
    longPressTimer.current = window.setTimeout(() => {
      if (!longPressStart.current) {
        return;
      }
      ignoreNextClick.current = true;
      onOpenStructureMenu(target, longPressStart.current);
      clearLongPress();
    }, 500);
  };

  return (
    <>
      <mesh
        position={[center.x, 0.17, center.y]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(event) => {
          if (movingStructure) {
            clearLongPress();
            stop(event);
            onPlaceStructure(tileFromPointerEvent(event) ?? tile);
            return;
          }
          if (buildPlacement) {
            clearLongPress();
            stop(event);
            onPlaceNewStructure(tileFromPointerEvent(event) ?? tile);
            return;
          }
          if (ignoreNextClick.current) {
            ignoreNextClick.current = false;
            stop(event);
            return;
          }
          clearLongPress();
          stop(event);
          onSelect();
        }}
        onContextMenu={openMenu}
        onPointerDown={(event) => {
          if (buildPlacement) {
            stop(event);
            return;
          }
          if (event.nativeEvent.button === 2) {
            openMenu(event);
            return;
          }
          if (event.nativeEvent.pointerType !== "touch" && event.nativeEvent.pointerType !== "pen") {
            return;
          }
          stop(event);
          longPressStart.current = {
            x: event.nativeEvent.clientX,
            y: event.nativeEvent.clientY,
          };
          window.addEventListener("pointermove", handleWindowPointerMove);
          window.addEventListener("pointerup", clearLongPress);
          window.addEventListener("pointercancel", clearLongPress);
          longPressTimer.current = window.setTimeout(() => {
            if (!longPressStart.current) {
              return;
            }
            ignoreNextClick.current = true;
            onOpenStructureMenu(target, longPressStart.current);
            clearLongPress();
          }, 500);
        }}
        onPointerMove={(event) => {
          if (movingStructure || buildPlacement) {
            onHoverTile(tileFromPointerEvent(event) ?? tile);
          }
          if (!longPressStart.current) {
            return;
          }
          const moved = Math.hypot(
            event.nativeEvent.clientX - longPressStart.current.x,
            event.nativeEvent.clientY - longPressStart.current.y,
          );
          if (moved > 8) {
            clearLongPress();
          }
        }}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
      >
        <planeGeometry args={[visualWidth, visualHeight]} />
        <meshStandardMaterial
          map={texture}
          transparent
          color={blockedByPlacement ? MOVE_OCCUPIED_BLOCKED_TINT : isMovingTarget ? MOVE_TARGET_TINT : "#ffffff"}
          emissive={
            blockedByPlacement ? MOVE_TILE_BLOCKED_EMISSIVE : selected || isMovingTarget ? "#fff7b2" : "#000000"
          }
          emissiveIntensity={blockedByPlacement ? 0.18 : selected || isMovingTarget ? 0.2 : 0}
        />
      </mesh>
      <Html
        position={[center.x, 0.28, center.y]}
        center
        zIndexRange={[100, 0]}
        wrapperClass="structure-hit-wrapper"
      >
        <button
          className="structure-hit-target"
          type="button"
          tabIndex={-1}
          aria-label={`${hitLabel} structure`}
          style={{
            width: `${78 * footprint.width}px`,
            height: `${58 * footprint.height}px`,
            pointerEvents: movingStructure || buildPlacement ? "none" : "auto",
          }}
          onClick={selectFromDom}
          onContextMenu={openDomMenu}
          onPointerDown={startDomLongPress}
          onPointerMove={() => {
            if (movingStructure || buildPlacement) {
              onHoverTile(tile);
            }
          }}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
        />
      </Html>
    </>
  );
}

function PlacementPreview({
  tile,
  footprint,
  valid,
}: {
  tile: Tile;
  footprint: StructureFootprint;
  valid: boolean;
}) {
  const center = footprintCenter(tile, footprint);
  const width = footprint.width - 0.04;
  const height = footprint.height - 0.04;
  const color = valid ? "#f7f0a3" : "#ff8b80";
  const outlineColor = valid ? "#fff3a8" : MOVE_TILE_BLOCKED_COLOR;
  const edgeThickness = 0.06;

  return (
    <group position={[center.x, 0.13, center.y]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <PreviewEdge
        position={[0, 0.01, -height / 2]}
        width={width}
        thickness={edgeThickness}
        color={outlineColor}
      />
      <PreviewEdge
        position={[0, 0.01, height / 2]}
        width={width}
        thickness={edgeThickness}
        color={outlineColor}
      />
      <PreviewEdge
        position={[-width / 2, 0.012, 0]}
        width={edgeThickness}
        thickness={height}
        color={outlineColor}
      />
      <PreviewEdge
        position={[width / 2, 0.012, 0]}
        width={edgeThickness}
        thickness={height}
        color={outlineColor}
      />
    </group>
  );
}

function PreviewEdge({
  position,
  width,
  thickness,
  color,
}: {
  position: [number, number, number];
  width: number;
  thickness: number;
  color: string;
}) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, thickness]} />
      <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
    </mesh>
  );
}

function stop(event: ThreeEvent<MouseEvent | PointerEvent>) {
  event.stopPropagation();
}

function footprintCenter(tile: Tile, footprint: StructureFootprint): Tile {
  return {
    x: tile.x + (footprint.width - 1) / 2,
    y: tile.y + (footprint.height - 1) / 2,
  };
}

function tileFromPointerEvent(event: ThreeEvent<MouseEvent | PointerEvent>): Tile | null {
  const parent = event.object.parent;
  if (!parent) {
    return null;
  }
  const point = parent.worldToLocal(event.point.clone());
  const tile = {
    x: Math.round(point.x),
    y: Math.round(point.z),
  };
  if (tile.x < 0 || tile.x >= 18 || tile.y < 0 || tile.y >= 18) {
    return null;
  }
  return tile;
}

function isSameStructure(left: StructureSelection | null, right: StructureSelection): boolean {
  if (!left || left.type !== right.type) {
    return false;
  }
  switch (left.type) {
    case "silo":
      return true;
    case "barn":
      return true;
    case "delivery_board":
      return true;
    case "machine":
      return right.type === "machine" && left.id === right.id;
    case "shelter":
      return right.type === "shelter" && left.id === right.id;
  }
}
