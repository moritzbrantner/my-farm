import { Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { colorForItem, spriteTexture } from "../assets/sprites";
import type { FarmView, FieldPlot, MachineState, Tile } from "../types";
import {
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
const MOVE_OCCUPIED_BLOCKED_TINT = "#ffd9d6";
const MOVE_TARGET_TINT = "#fff7c7";

type Props = {
  view: FarmView;
  selection: Selection;
  movingStructure: StructureSelection | null;
  harvestSweep: HarvestSweepState;
  onSelect: (selection: Selection) => void;
  onOpenFieldMenu: (plotId: string, point: { x: number; y: number }) => void;
  onOpenStructureMenu: (target: StructureSelection, point: { x: number; y: number }) => void;
  onPlaceStructure: (tile: Tile) => void;
  onStartHarvestSweep: (plotId: string, pointerId: number) => void;
  onEnterHarvestSweepPlot: (plotId: string) => void;
};

export function FarmScene({
  view,
  selection,
  movingStructure,
  harvestSweep,
  onSelect,
  onOpenFieldMenu,
  onOpenStructureMenu,
  onPlaceStructure,
  onStartHarvestSweep,
  onEnterHarvestSweepPlot,
}: Props) {
  const [hoverTile, setHoverTile] = useState<Tile | null>(null);

  useEffect(() => {
    if (!movingStructure) {
      setHoverTile(null);
    }
  }, [movingStructure]);

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
          movingStructure={movingStructure}
          onHoverTile={setHoverTile}
          onPlaceStructure={onPlaceStructure}
        />
        {view.field_plots.map((plot) => (
          <FieldMesh
            key={plot.id}
            plot={plot}
            selected={selection?.type === "plot" && selection.id === plot.id}
            movingStructure={movingStructure}
            harvestSweep={harvestSweep}
            onHoverTile={setHoverTile}
            onSelect={onSelect}
            onOpenFieldMenu={onOpenFieldMenu}
            onPlaceStructure={onPlaceStructure}
            onStartHarvestSweep={onStartHarvestSweep}
            onEnterHarvestSweepPlot={onEnterHarvestSweepPlot}
          />
        ))}
        {view.machines.map((machine) => (
          <MachineMesh
            key={machine.id}
            machine={machine}
            selected={selection?.type === "machine" && selection.id === machine.id}
            movingStructure={movingStructure}
            onHoverTile={setHoverTile}
            onSelect={onSelect}
            onOpenStructureMenu={onOpenStructureMenu}
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
            movingStructure={movingStructure}
            onHoverTile={setHoverTile}
            onOpenStructureMenu={onOpenStructureMenu}
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
            movingStructure={movingStructure}
            onHoverTile={setHoverTile}
            onOpenStructureMenu={onOpenStructureMenu}
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
        ) : null}
      </group>
      <OrbitControls
        enabled={!harvestSweep}
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

function FarmGround({
  view,
  movingStructure,
  onHoverTile,
  onPlaceStructure,
}: {
  view: FarmView;
  movingStructure: StructureSelection | null;
  onHoverTile: (tile: Tile) => void;
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
      const canPlace =
        movingStructure !== null && isTileAvailableForStructure(view, tile, movingStructure);
      tiles.push(
        <mesh
          key={`${x}-${y}`}
          position={[x, -0.03, y]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(event) => {
            if (!movingStructure) {
              return;
            }
            stop(event);
            onPlaceStructure(tile);
          }}
          onPointerMove={() => {
            if (movingStructure) {
              onHoverTile(tile);
            }
          }}
        >
          <planeGeometry args={[0.96, 0.96]} />
          {movingStructure ? (
            <meshStandardMaterial
              color={canPlace ? MOVE_TILE_AVAILABLE_COLOR : MOVE_TILE_BLOCKED_COLOR}
              emissive={canPlace ? MOVE_TILE_AVAILABLE_EMISSIVE : MOVE_TILE_BLOCKED_EMISSIVE}
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
  movingStructure,
  harvestSweep,
  onHoverTile,
  onSelect,
  onOpenFieldMenu,
  onPlaceStructure,
  onStartHarvestSweep,
  onEnterHarvestSweepPlot,
}: {
  plot: FieldPlot;
  selected: boolean;
  movingStructure: StructureSelection | null;
  harvestSweep: HarvestSweepState;
  onHoverTile: (tile: Tile) => void;
  onSelect: (selection: Selection) => void;
  onOpenFieldMenu: (plotId: string, point: { x: number; y: number }) => void;
  onPlaceStructure: (tile: Tile) => void;
  onStartHarvestSweep: (plotId: string, pointerId: number) => void;
  onEnterHarvestSweepPlot: (plotId: string) => void;
}) {
  const cropReady = plot.crop ? Date.now() >= plot.crop.ready_at_ms : false;
  const color = plot.crop ? colorForItem(plot.crop.item_id) : "#8a5a35";
  const longPressTimer = useRef<number | null>(null);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);
  const harvestSweepStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const ignoreNextClick = useRef(false);
  const texture = useMemo(
    () => spriteTexture(plot.crop ? (cropReady ? "Ready" : plot.crop.item_id) : "Field", color),
    [color, cropReady, plot.crop],
  );
  const blockedByMove = movingStructure !== null;
  const sweptByHarvest = harvestSweep?.plotIds.includes(plot.id) ?? false;
  const eligibleForHarvestSweep =
    harvestSweep !== null &&
    plot.crop?.item_id === harvestSweep.cropId &&
    Date.now() >= plot.crop.ready_at_ms;

  useEffect(() => {
    return () => {
      clearLongPress();
      clearHarvestSweepStart();
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

  function clearHarvestSweepStart() {
    harvestSweepStart.current = null;
    window.removeEventListener("pointermove", handleWindowHarvestSweepPointerMove);
    window.removeEventListener("pointerup", clearHarvestSweepStart);
    window.removeEventListener("pointercancel", clearHarvestSweepStart);
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

  function handleWindowHarvestSweepPointerMove(event: PointerEvent) {
    if (!harvestSweepStart.current || event.pointerId !== harvestSweepStart.current.pointerId) {
      return;
    }
    const moved = Math.hypot(
      event.clientX - harvestSweepStart.current.x,
      event.clientY - harvestSweepStart.current.y,
    );
    if (moved <= 8) {
      return;
    }
    ignoreNextClick.current = true;
    onStartHarvestSweep(plot.id, harvestSweepStart.current.pointerId);
    clearHarvestSweepStart();
  }

  const openMenu = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    stop(event);
    event.nativeEvent.preventDefault();
    clearHarvestSweepStart();
    onOpenFieldMenu(plot.id, {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
    });
  };

  return (
    <mesh
      position={[plot.tile.x, 0.04, plot.tile.y]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(event) => {
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
        clearLongPress();
        clearHarvestSweepStart();
        stop(event);
        onSelect({ type: "plot", id: plot.id });
      }}
      onContextMenu={openMenu}
      onPointerDown={(event) => {
        if (event.nativeEvent.button === 2) {
          openMenu(event);
          return;
        }
        if (plot.crop && cropReady) {
          stop(event);
          harvestSweepStart.current = {
            x: event.nativeEvent.clientX,
            y: event.nativeEvent.clientY,
            pointerId: event.nativeEvent.pointerId,
          };
          window.addEventListener("pointermove", handleWindowHarvestSweepPointerMove);
          window.addEventListener("pointerup", clearHarvestSweepStart);
          window.addEventListener("pointercancel", clearHarvestSweepStart);
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
        if (harvestSweep && event.nativeEvent.pointerId === harvestSweep.pointerId) {
          stop(event);
          if (eligibleForHarvestSweep) {
            onEnterHarvestSweepPlot(plot.id);
          }
          return;
        }
        if (movingStructure) {
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
      onPointerUp={() => {
        clearLongPress();
        clearHarvestSweepStart();
      }}
      onPointerCancel={() => {
        clearLongPress();
        clearHarvestSweepStart();
      }}
    >
      <planeGeometry args={[0.9, 0.9]} />
      <meshStandardMaterial
        map={texture}
        color={
          blockedByMove
            ? MOVE_OCCUPIED_BLOCKED_TINT
            : sweptByHarvest
              ? MOVE_TARGET_TINT
              : selected
                ? "#ffffff"
                : "#f4ead2"
        }
        emissive={blockedByMove ? MOVE_TILE_BLOCKED_EMISSIVE : selected ? "#446d38" : "#000000"}
        emissiveIntensity={blockedByMove ? 0.18 : selected || sweptByHarvest ? 0.22 : 0}
      />
    </mesh>
  );
}

function MachineMesh({
  machine,
  selected,
  movingStructure,
  onHoverTile,
  onSelect,
  onOpenStructureMenu,
  onPlaceStructure,
}: {
  machine: MachineState;
  selected: boolean;
  movingStructure: StructureSelection | null;
  onHoverTile: (tile: Tile) => void;
  onSelect: (selection: Selection) => void;
  onOpenStructureMenu: (target: StructureSelection, point: { x: number; y: number }) => void;
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
      movingStructure={movingStructure}
      onHoverTile={onHoverTile}
      onOpenStructureMenu={onOpenStructureMenu}
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
  movingStructure,
  onHoverTile,
  onSelect,
  onOpenStructureMenu,
  onPlaceStructure,
}: {
  target: StructureSelection;
  label: string;
  hitLabel: string;
  tile: Tile;
  color: string;
  footprint: StructureFootprint;
  selected: boolean;
  movingStructure: StructureSelection | null;
  onHoverTile: (tile: Tile) => void;
  onSelect: () => void;
  onOpenStructureMenu: (target: StructureSelection, point: { x: number; y: number }) => void;
  onPlaceStructure: (tile: Tile) => void;
}) {
  const texture = useMemo(() => spriteTexture(label, color), [label, color]);
  const isMovingTarget = isSameStructure(movingStructure, target);
  const blockedByMove = movingStructure !== null && !isMovingTarget;
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
            onPlaceStructure(tile);
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
          if (movingStructure) {
            onHoverTile(tile);
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
          color={blockedByMove ? MOVE_OCCUPIED_BLOCKED_TINT : isMovingTarget ? MOVE_TARGET_TINT : "#ffffff"}
          emissive={
            blockedByMove ? MOVE_TILE_BLOCKED_EMISSIVE : selected || isMovingTarget ? "#fff7b2" : "#000000"
          }
          emissiveIntensity={blockedByMove ? 0.18 : selected || isMovingTarget ? 0.2 : 0}
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
          style={{ width: `${78 * footprint.width}px`, height: `${58 * footprint.height}px` }}
          onClick={selectFromDom}
          onContextMenu={openDomMenu}
          onPointerDown={startDomLongPress}
          onPointerMove={() => {
            if (movingStructure) {
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
  const color = valid ? "#f7f0a3" : "#ffb0a7";
  const outlineColor = valid ? "#fff3a8" : "#ffd0cb";
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

function isSameStructure(left: StructureSelection | null, right: StructureSelection): boolean {
  if (!left || left.type !== right.type) {
    return false;
  }
  switch (left.type) {
    case "delivery_board":
      return true;
    case "machine":
      return right.type === "machine" && left.id === right.id;
    case "shelter":
      return right.type === "shelter" && left.id === right.id;
  }
}
