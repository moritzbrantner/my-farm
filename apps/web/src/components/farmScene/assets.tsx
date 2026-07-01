import { Billboard, Text } from "@react-three/drei";
import type { JSX } from "react";
import type { StructureFootprint } from "../../game/selectors";
import { colorForItem } from "../../assets/sprites";

export type FarmAssetKind =
  | "ground_tile"
  | "field_plot"
  | "silo"
  | "barn"
  | "bakery"
  | "feed_mill"
  | "chicken_coop"
  | "cow_pasture"
  | "delivery_board";

export type FarmAssetState = {
  selected: boolean;
  blockedByPlacement: boolean;
  movingTarget: boolean;
  cropItemId?: string;
  cropReady?: boolean;
};

type FarmAssetProps = {
  kind: FarmAssetKind;
  label: string;
  footprint: StructureFootprint;
  state: FarmAssetState;
};

const outlineColor = "#26352f";
const highlightColor = "#fff1a8";
const blockedColor = "#ef6a66";
const movingColor = "#fff7c7";

export function FarmAsset({ kind, label, footprint, state }: FarmAssetProps): JSX.Element {
  if (kind === "ground_tile") {
    return <GroundTile state={state} />;
  }
  if (kind === "field_plot") {
    return <FieldPlotAsset state={state} />;
  }
  return (
    <group>
      <StructureBase footprint={footprint} state={state} />
      {renderStructure(kind, footprint, state)}
      <StructureLabel label={label} footprint={footprint} />
    </group>
  );
}

function GroundTile({ state }: { state: FarmAssetState }) {
  const color = state.blockedByPlacement ? blockedColor : state.movingTarget ? movingColor : "#6d9b57";
  return (
    <mesh receiveShadow position={[0, -0.055, 0]}>
      <boxGeometry args={[0.96, 0.08, 0.96]} />
      <meshStandardMaterial color={color} roughness={0.96} metalness={0} />
    </mesh>
  );
}

function FieldPlotAsset({ state }: { state: FarmAssetState }) {
  const cropColor = state.cropItemId ? colorForItem(state.cropItemId) : "#8a5a35";
  const bedColor = state.blockedByPlacement
    ? blockedColor
    : state.selected || state.movingTarget
      ? "#f4ead2"
      : "#8a5a35";

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.035, 0]}>
        <boxGeometry args={[0.84, 0.13, 0.84]} />
        <meshStandardMaterial color={bedColor} roughness={0.9} metalness={0} />
      </mesh>
      <mesh receiveShadow position={[0, 0.112, 0]}>
        <boxGeometry args={[0.72, 0.035, 0.72]} />
        <meshStandardMaterial color="#60412d" roughness={1} metalness={0} />
      </mesh>
      {state.cropItemId ? <CropCluster color={cropColor} ready={state.cropReady ?? false} /> : null}
      <SelectionPlate state={state} width={0.94} depth={0.94} y={0.01} />
    </group>
  );
}

function CropCluster({ color, ready }: { color: string; ready: boolean }) {
  const cropHeight = ready ? 0.46 : 0.3;
  const cropPositions = [
    [-0.22, -0.2],
    [0, -0.22],
    [0.22, -0.18],
    [-0.18, 0.12],
    [0.08, 0.08],
    [0.26, 0.16],
  ] as const;

  return (
    <group>
      {cropPositions.map(([x, z], index) => (
        <group key={`${x}-${z}-${index}`} position={[x, 0.17, z]}>
          <mesh castShadow position={[0, cropHeight / 2, 0]}>
            <cylinderGeometry args={[0.025, 0.035, cropHeight, 5]} />
            <meshStandardMaterial color={color} roughness={0.82} metalness={0} />
          </mesh>
          <mesh castShadow position={[0, cropHeight + 0.035, 0]}>
            <sphereGeometry args={[ready ? 0.09 : 0.06, 8, 6]} />
            <meshStandardMaterial color={ready ? "#f6dc72" : color} roughness={0.75} metalness={0} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function StructureBase({ footprint, state }: { footprint: StructureFootprint; state: FarmAssetState }) {
  const color = state.blockedByPlacement ? blockedColor : state.movingTarget ? movingColor : "#597d4a";
  return (
    <group>
      <mesh receiveShadow position={[0, 0.03, 0]}>
        <boxGeometry args={[footprint.width - 0.1, 0.08, footprint.height - 0.1]} />
        <meshStandardMaterial color={color} roughness={0.92} metalness={0} />
      </mesh>
      <SelectionPlate
        state={state}
        width={Math.max(1, footprint.width - 0.02)}
        depth={Math.max(1, footprint.height - 0.02)}
        y={0.085}
      />
    </group>
  );
}

function SelectionPlate({
  state,
  width,
  depth,
  y,
}: {
  state: FarmAssetState;
  width: number;
  depth: number;
  y: number;
}) {
  if (!state.selected && !state.movingTarget && !state.blockedByPlacement) {
    return null;
  }
  const color = state.blockedByPlacement ? "#a9333f" : highlightColor;
  return (
    <mesh position={[0, y, 0]}>
      <boxGeometry args={[width, 0.025, depth]} />
      <meshBasicMaterial color={color} transparent opacity={0.34} depthWrite={false} />
    </mesh>
  );
}

function renderStructure(kind: Exclude<FarmAssetKind, "ground_tile" | "field_plot">, footprint: StructureFootprint, state: FarmAssetState) {
  switch (kind) {
    case "silo":
      return <Silo />;
    case "barn":
      return <Barn state={state} />;
    case "bakery":
      return <Bakery />;
    case "feed_mill":
      return <FeedMill />;
    case "chicken_coop":
      return <ChickenCoop />;
    case "cow_pasture":
      return <CowPasture footprint={footprint} />;
    case "delivery_board":
      return <DeliveryBoard />;
  }
}

function Silo() {
  return (
    <group position={[0, 0.08, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.26, 0.3, 0.68, 12]} />
        <meshStandardMaterial color="#d8b65a" roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh castShadow position={[0, 0.79, 0]}>
        <coneGeometry args={[0.34, 0.28, 12]} />
        <meshStandardMaterial color="#8d6a36" roughness={0.78} metalness={0} />
      </mesh>
      <mesh castShadow position={[0.28, 0.32, -0.16]}>
        <boxGeometry args={[0.07, 0.42, 0.07]} />
        <meshStandardMaterial color={outlineColor} roughness={0.7} metalness={0} />
      </mesh>
    </group>
  );
}

function Barn({ state }: { state: FarmAssetState }) {
  const bodyColor = state.blockedByPlacement ? blockedColor : "#b95346";
  return (
    <group position={[0, 0.08, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.27, 0]}>
        <boxGeometry args={[0.72, 0.46, 0.62]} />
        <meshStandardMaterial color={bodyColor} roughness={0.76} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 0.58, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.58, 0.58, 0.68]} />
        <meshStandardMaterial color="#6d3b35" roughness={0.8} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 0.22, -0.33]}>
        <boxGeometry args={[0.24, 0.3, 0.035]} />
        <meshStandardMaterial color="#f1d2a4" roughness={0.85} metalness={0} />
      </mesh>
    </group>
  );
}

function Bakery() {
  return (
    <group position={[0, 0.08, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.28, 0]}>
        <boxGeometry args={[1.28, 0.46, 1.0]} />
        <meshStandardMaterial color="#c97a48" roughness={0.78} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 0.58, 0]}>
        <boxGeometry args={[1.4, 0.26, 1.1]} />
        <meshStandardMaterial color="#e6a36e" roughness={0.82} metalness={0} />
      </mesh>
      <mesh castShadow position={[0.42, 0.86, 0.28]}>
        <boxGeometry args={[0.18, 0.45, 0.18]} />
        <meshStandardMaterial color="#754231" roughness={0.85} metalness={0} />
      </mesh>
      <mesh castShadow position={[-0.35, 0.28, -0.52]}>
        <boxGeometry args={[0.36, 0.26, 0.035]} />
        <meshStandardMaterial color="#f6d39f" roughness={0.8} metalness={0} />
      </mesh>
    </group>
  );
}

function FeedMill() {
  return (
    <group position={[0, 0.08, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[0.62, 0.42, 0.58]} />
        <meshStandardMaterial color="#79955b" roughness={0.82} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 0.62, 0]}>
        <coneGeometry args={[0.36, 0.42, 4]} />
        <meshStandardMaterial color="#b8d27a" roughness={0.82} metalness={0} />
      </mesh>
      <mesh castShadow position={[0.34, 0.3, -0.18]} rotation={[0, 0, -0.45]}>
        <boxGeometry args={[0.12, 0.5, 0.12]} />
        <meshStandardMaterial color="#536a5e" roughness={0.82} metalness={0} />
      </mesh>
    </group>
  );
}

function ChickenCoop() {
  return (
    <group position={[0, 0.08, 0]}>
      <Fence width={1.55} depth={1.55} />
      <mesh castShadow receiveShadow position={[-0.18, 0.28, 0]}>
        <boxGeometry args={[0.76, 0.42, 0.58]} />
        <meshStandardMaterial color="#d8a64e" roughness={0.82} metalness={0} />
      </mesh>
      <mesh castShadow position={[-0.18, 0.58, 0]}>
        <boxGeometry args={[0.86, 0.2, 0.68]} />
        <meshStandardMaterial color="#8d6a36" roughness={0.86} metalness={0} />
      </mesh>
      <mesh castShadow position={[0.38, 0.2, -0.2]}>
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshStandardMaterial color="#f4eee2" roughness={0.7} metalness={0} />
      </mesh>
    </group>
  );
}

function CowPasture({ footprint }: { footprint: StructureFootprint }) {
  return (
    <group position={[0, 0.08, 0]}>
      <Fence width={footprint.width - 0.3} depth={footprint.height - 0.3} />
      <mesh castShadow receiveShadow position={[-0.6, 0.28, 0.2]}>
        <boxGeometry args={[0.9, 0.36, 0.54]} />
        <meshStandardMaterial color="#b98762" roughness={0.84} metalness={0} />
      </mesh>
      <mesh castShadow position={[-0.6, 0.56, 0.2]}>
        <boxGeometry args={[1.0, 0.18, 0.62]} />
        <meshStandardMaterial color="#8d6a36" roughness={0.88} metalness={0} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.62, 0.2, -0.12]}>
        <boxGeometry args={[0.58, 0.22, 0.28]} />
        <meshStandardMaterial color="#e6d6bd" roughness={0.78} metalness={0} />
      </mesh>
    </group>
  );
}

function DeliveryBoard() {
  return (
    <group position={[0, 0.08, 0]}>
      <mesh castShadow position={[-0.22, 0.32, 0]}>
        <boxGeometry args={[0.08, 0.58, 0.08]} />
        <meshStandardMaterial color="#624a35" roughness={0.78} metalness={0} />
      </mesh>
      <mesh castShadow position={[0.22, 0.32, 0]}>
        <boxGeometry args={[0.08, 0.58, 0.08]} />
        <meshStandardMaterial color="#624a35" roughness={0.78} metalness={0} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.52, 0]}>
        <boxGeometry args={[0.72, 0.44, 0.1]} />
        <meshStandardMaterial color="#d7c48a" roughness={0.8} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 0.72, -0.02]}>
        <boxGeometry args={[0.82, 0.08, 0.14]} />
        <meshStandardMaterial color="#fff1a8" roughness={0.78} metalness={0} />
      </mesh>
    </group>
  );
}

function Fence({ width, depth }: { width: number; depth: number }) {
  const postPositions = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [-width / 2, depth / 2],
    [width / 2, depth / 2],
  ] as const;

  return (
    <group>
      {postPositions.map(([x, z]) => (
        <mesh key={`${x}-${z}`} castShadow position={[x, 0.25, z]}>
          <boxGeometry args={[0.08, 0.42, 0.08]} />
          <meshStandardMaterial color="#624a35" roughness={0.82} metalness={0} />
        </mesh>
      ))}
      <FenceRail position={[0, 0.33, -depth / 2]} width={width} depth={0.06} />
      <FenceRail position={[0, 0.33, depth / 2]} width={width} depth={0.06} />
      <FenceRail position={[-width / 2, 0.33, 0]} width={0.06} depth={depth} />
      <FenceRail position={[width / 2, 0.33, 0]} width={0.06} depth={depth} />
    </group>
  );
}

function FenceRail({
  position,
  width,
  depth,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
}) {
  return (
    <mesh castShadow position={position}>
      <boxGeometry args={[width, 0.07, depth]} />
      <meshStandardMaterial color="#624a35" roughness={0.82} metalness={0} />
    </mesh>
  );
}

function StructureLabel({ label, footprint }: { label: string; footprint: StructureFootprint }) {
  return (
    <Billboard position={[0, 1.15, -footprint.height * 0.08]} follow lockX={false} lockY={false} lockZ={false}>
      <Text
        color="#20312b"
        anchorX="center"
        anchorY="middle"
        fontSize={0.18}
        maxWidth={Math.max(1.2, footprint.width * 0.72)}
        outlineColor="#fff7d0"
        outlineWidth={0.025}
      >
        {label}
      </Text>
    </Billboard>
  );
}
