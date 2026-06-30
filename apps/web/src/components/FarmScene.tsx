import { Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { colorForItem, spriteTexture } from "../assets/sprites";
import type { FarmView, FieldPlot, MachineState, Tile } from "../types";
import type { Selection, StructureSelection } from "../game/selectors";

type Props = {
  view: FarmView;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onOpenFieldMenu: (plotId: string, point: { x: number; y: number }) => void;
  onOpenStructureMenu: (target: StructureSelection, point: { x: number; y: number }) => void;
};

export function FarmScene({ view, selection, onSelect, onOpenFieldMenu, onOpenStructureMenu }: Props) {
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
        <FarmGround />
        {view.field_plots.map((plot) => (
          <FieldMesh
            key={plot.id}
            plot={plot}
            selected={selection?.type === "plot" && selection.id === plot.id}
            onSelect={onSelect}
            onOpenFieldMenu={onOpenFieldMenu}
          />
        ))}
        {view.machines.map((machine) => (
          <MachineMesh
            key={machine.id}
            machine={machine}
            selected={selection?.type === "machine" && selection.id === machine.id}
            onSelect={onSelect}
            onOpenStructureMenu={onOpenStructureMenu}
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
            selected={selection?.type === "shelter" && selection.id === shelter.id}
            onOpenStructureMenu={onOpenStructureMenu}
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
            tile={{ x: 2, y: 7 }}
            color="#d7c48a"
            selected={selection?.type === "delivery_board"}
            onOpenStructureMenu={onOpenStructureMenu}
            onSelect={() => {
              onSelect({ type: "delivery_board" });
            }}
          />
        ) : null}
      </group>
      <OrbitControls
        enableRotate={false}
        enablePan
        enableZoom
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
        }}
        minZoom={28}
        maxZoom={82}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}

function FarmGround() {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#7fb469",
        roughness: 0.95,
      }),
    [],
  );
  const tiles = [];
  for (let x = 0; x < 18; x += 1) {
    for (let y = 0; y < 18; y += 1) {
      tiles.push(
        <mesh key={`${x}-${y}`} position={[x, -0.03, y]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.96, 0.96]} />
          <primitive object={material} attach="material" />
        </mesh>,
      );
    }
  }
  return <>{tiles}</>;
}

function FieldMesh({
  plot,
  selected,
  onSelect,
  onOpenFieldMenu,
}: {
  plot: FieldPlot;
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onOpenFieldMenu: (plotId: string, point: { x: number; y: number }) => void;
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
        if (ignoreNextClick.current) {
          ignoreNextClick.current = false;
          stop(event);
          return;
        }
        clearLongPress();
        stop(event);
        onSelect({ type: "plot", id: plot.id });
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
          onOpenFieldMenu(plot.id, longPressStart.current);
          clearLongPress();
        }, 500);
      }}
      onPointerMove={(event) => {
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
      <planeGeometry args={[0.9, 0.9]} />
      <meshStandardMaterial
        map={texture}
        color={selected ? "#ffffff" : "#f4ead2"}
        emissive={selected ? "#446d38" : "#000000"}
        emissiveIntensity={selected ? 0.22 : 0}
      />
    </mesh>
  );
}

function MachineMesh({
  machine,
  selected,
  onSelect,
  onOpenStructureMenu,
}: {
  machine: MachineState;
  selected: boolean;
  onSelect: (selection: Selection) => void;
  onOpenStructureMenu: (target: StructureSelection, point: { x: number; y: number }) => void;
}) {
  return (
    <StructureSprite
      target={{ type: "machine", id: machine.id }}
      label={machine.kind === "bakery" ? "Bakery" : "Feed Mill"}
      hitLabel={machine.kind === "bakery" ? "Bakery" : "Feed Mill"}
      tile={machine.tile}
      color={machine.kind === "bakery" ? "#c97a48" : "#79955b"}
      selected={selected}
      onOpenStructureMenu={onOpenStructureMenu}
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
  selected,
  onSelect,
  onOpenStructureMenu,
}: {
  target: StructureSelection;
  label: string;
  hitLabel: string;
  tile: Tile;
  color: string;
  selected: boolean;
  onSelect: () => void;
  onOpenStructureMenu: (target: StructureSelection, point: { x: number; y: number }) => void;
}) {
  const texture = useMemo(() => spriteTexture(label, color), [label, color]);
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
        position={[tile.x, 0.17, tile.y]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(event) => {
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
        <planeGeometry args={[1.35, 1.35]} />
        <meshStandardMaterial
          map={texture}
          transparent
          emissive={selected ? "#fff7b2" : "#000000"}
          emissiveIntensity={selected ? 0.18 : 0}
        />
      </mesh>
      <Html
        position={[tile.x, 0.28, tile.y]}
        center
        zIndexRange={[100, 0]}
        wrapperClass="structure-hit-wrapper"
      >
        <button
          className="structure-hit-target"
          type="button"
          tabIndex={-1}
          aria-label={`${hitLabel} structure`}
          onClick={selectFromDom}
          onContextMenu={openDomMenu}
          onPointerDown={startDomLongPress}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
        />
      </Html>
    </>
  );
}

function stop(event: ThreeEvent<MouseEvent | PointerEvent>) {
  event.stopPropagation();
}
