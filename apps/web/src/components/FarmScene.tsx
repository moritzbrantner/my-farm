import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { colorForItem, spriteTexture } from "../assets/sprites";
import type { FarmView, FieldPlot, MachineState, Tile } from "../types";
import type { Selection } from "../game/selectors";

type Props = {
  view: FarmView;
  selection: Selection;
  onSelect: (selection: Selection) => void;
};

export function FarmScene({ view, selection, onSelect }: Props) {
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
          />
        ))}
        {view.machines.map((machine) => (
          <MachineMesh
            key={machine.id}
            machine={machine}
            selected={selection?.type === "machine" && selection.id === machine.id}
            onSelect={onSelect}
          />
        ))}
        {view.shelters.map((shelter) => (
          <StructureSprite
            key={shelter.id}
            label={shelter.kind === "chicken_coop" ? "Chickens" : "Cows"}
            tile={shelter.tile}
            color={shelter.kind === "chicken_coop" ? "#d8a64e" : "#b98762"}
            selected={selection?.type === "shelter" && selection.id === shelter.id}
            onClick={(event) => {
              stop(event);
              onSelect({ type: "shelter", id: shelter.id });
            }}
          />
        ))}
        {view.delivery_board_built ? (
          <StructureSprite
            label="Orders"
            tile={{ x: 2, y: 7 }}
            color="#d7c48a"
            selected={selection?.type === "delivery_board"}
            onClick={(event) => {
              stop(event);
              onSelect({ type: "delivery_board" });
            }}
          />
        ) : null}
      </group>
      <OrbitControls
        enableRotate={false}
        enablePan
        enableZoom
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
}: {
  plot: FieldPlot;
  selected: boolean;
  onSelect: (selection: Selection) => void;
}) {
  const cropReady = plot.crop ? Date.now() >= plot.crop.ready_at_ms : false;
  const color = plot.crop ? colorForItem(plot.crop.item_id) : "#8a5a35";
  const texture = useMemo(
    () => spriteTexture(plot.crop ? (cropReady ? "Ready" : plot.crop.item_id) : "Field", color),
    [color, cropReady, plot.crop],
  );
  return (
    <mesh
      position={[plot.tile.x, 0.04, plot.tile.y]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(event) => {
        stop(event);
        onSelect({ type: "plot", id: plot.id });
      }}
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
}: {
  machine: MachineState;
  selected: boolean;
  onSelect: (selection: Selection) => void;
}) {
  return (
    <StructureSprite
      label={machine.kind === "bakery" ? "Bakery" : "Feed Mill"}
      tile={machine.tile}
      color={machine.kind === "bakery" ? "#c97a48" : "#79955b"}
      selected={selected}
      onClick={(event) => {
        stop(event);
        onSelect({ type: "machine", id: machine.id });
      }}
    />
  );
}

function StructureSprite({
  label,
  tile,
  color,
  selected,
  onClick,
}: {
  label: string;
  tile: Tile;
  color: string;
  selected: boolean;
  onClick: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const texture = useMemo(() => spriteTexture(label, color), [label, color]);
  return (
    <mesh position={[tile.x, 0.17, tile.y]} rotation={[-Math.PI / 2, 0, 0]} onClick={onClick}>
      <planeGeometry args={[1.35, 1.35]} />
      <meshStandardMaterial
        map={texture}
        transparent
        emissive={selected ? "#fff7b2" : "#000000"}
        emissiveIntensity={selected ? 0.18 : 0}
      />
    </mesh>
  );
}

function stop(event: ThreeEvent<MouseEvent>) {
  event.stopPropagation();
}
