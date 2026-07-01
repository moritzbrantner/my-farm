import { Billboard, Html, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import * as THREE from "three";
import type { StructureFootprint } from "../../game/selectors";
import type { StructureProductionStatus } from "../../game/structureStatus";
import { colorForItem } from "../../assets/sprites";

export type FarmAssetKind =
  | "ground_tile"
  | "field_plot"
  | "farm_house"
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
  productionStatus?: StructureProductionStatus;
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

type GableRoofDimensions = {
  width: number;
  height: number;
  depth: number;
};

const arrivalRoadZ = 10.35;
const arrivalRoadStartX = -10.4;
const arrivalRoadEndX = 2.4;
const arrivalPathCenterX = 0;
const arrivalPathCenterZ = 5.12;

export function FarmArrivalEnvironment() {
  return (
    <group>
      <RoadSurface />
      <DirtPath />
      <MovingCar />
    </group>
  );
}

function RoadSurface() {
  const roadLength = arrivalRoadEndX - arrivalRoadStartX;
  const roadCenterX = arrivalRoadStartX + roadLength / 2;

  return (
    <group position={[roadCenterX, -0.02, arrivalRoadZ]}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roadLength, 1.12]} />
        <meshStandardMaterial color="#4d5552" roughness={0.98} metalness={0} />
      </mesh>
      <mesh position={[0, 0.014, -0.46]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roadLength, 0.08]} />
        <meshBasicMaterial color="#f4ead2" transparent opacity={0.78} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.014, 0.46]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roadLength, 0.08]} />
        <meshBasicMaterial color="#f4ead2" transparent opacity={0.78} depthWrite={false} />
      </mesh>
      {[-3.8, -1.8, 0.2, 2.2, 4.2].map((offset) => (
        <mesh key={offset} position={[offset, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.72, 0.06]} />
          <meshBasicMaterial color="#f7d778" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      ))}
      <Html position={[0, 0.24, 0]} center zIndexRange={[20, 0]} wrapperClass="farm-scene-marker-wrapper">
        <div className="farm-scene-marker" data-testid="farm-scene-road" aria-label="Farm road" />
      </Html>
    </group>
  );
}

function DirtPath() {
  return (
    <group position={[arrivalPathCenterX, -0.012, arrivalPathCenterZ]}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.72, 8.35]} />
        <meshStandardMaterial color="#b9824d" roughness={1} metalness={0} />
      </mesh>
      {[-0.22, 0.18].map((xOffset) => (
        <mesh key={xOffset} position={[xOffset, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.08, 8.1]} />
          <meshBasicMaterial color="#d1a06a" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ))}
      <Html position={[0, 0.24, 0]} center zIndexRange={[20, 0]} wrapperClass="farm-scene-marker-wrapper">
        <div className="farm-scene-marker" data-testid="farm-scene-dirt-path" aria-label="Dirt path to Farm House" />
      </Html>
    </group>
  );
}

function MovingCar() {
  const carRef = useRef<THREE.Group | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useFrame(({ clock }) => {
    if (!carRef.current || reducedMotion) {
      return;
    }
    const travel = arrivalRoadEndX - arrivalRoadStartX;
    const progress = (clock.getElapsedTime() * 0.1) % 1;
    carRef.current.position.x = arrivalRoadStartX + progress * travel;
  });

  return (
    <group ref={carRef} position={[arrivalRoadStartX + 1.2, 0.12, arrivalRoadZ]} rotation={[0, Math.PI / 2, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
        <boxGeometry args={[0.58, 0.22, 0.34]} />
        <meshStandardMaterial color="#d84d45" roughness={0.72} metalness={0.04} />
      </mesh>
      <mesh castShadow position={[0.02, 0.3, 0]}>
        <boxGeometry args={[0.32, 0.18, 0.28]} />
        <meshStandardMaterial color="#f1d2a4" roughness={0.52} metalness={0.02} />
      </mesh>
      {[-0.22, 0.22].map((x) =>
        [-0.2, 0.2].map((z) => (
          <mesh key={`${x}-${z}`} castShadow position={[x, 0.05, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.06, 10]} />
            <meshStandardMaterial color="#20312b" roughness={0.75} metalness={0} />
          </mesh>
        )),
      )}
      <Html position={[0, 0.54, 0]} center zIndexRange={[25, 0]} wrapperClass="farm-scene-marker-wrapper">
        <div className="farm-scene-marker" data-testid="farm-scene-car" aria-label="Moving car on farm road" />
      </Html>
    </group>
  );
}

export function createGableRoofGeometry({ width, height, depth }: GableRoofDimensions) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -halfWidth,
        0,
        -halfDepth,
        halfWidth,
        0,
        -halfDepth,
        0,
        height,
        -halfDepth,
        -halfWidth,
        0,
        halfDepth,
        halfWidth,
        0,
        halfDepth,
        0,
        height,
        halfDepth,
      ],
      3,
    ),
  );
  geometry.setIndex([
    0,
    2,
    1,
    3,
    4,
    5,
    0,
    1,
    4,
    0,
    4,
    3,
    0,
    3,
    5,
    0,
    5,
    2,
    1,
    2,
    5,
    1,
    5,
    4,
  ]);
  geometry.computeVertexNormals();

  return geometry;
}

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
      <ProductionStatusVisual
        kind={kind}
        footprint={footprint}
        status={state.productionStatus ?? { type: "idle" }}
        hidden={state.blockedByPlacement || state.movingTarget}
      />
      <StructureLabel label={label} footprint={footprint} kind={kind} />
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
    case "farm_house":
      return <FarmHouse />;
    case "silo":
      return <Silo footprint={footprint} />;
    case "barn":
      return <Barn footprint={footprint} state={state} />;
    case "bakery":
      return <Bakery />;
    case "feed_mill":
      return <FeedMill />;
    case "chicken_coop":
      return <ChickenCoop footprint={footprint} />;
    case "cow_pasture":
      return <CowPasture footprint={footprint} />;
    case "delivery_board":
      return <DeliveryBoard />;
  }
}

function FarmHouse() {
  return (
    <group position={[0, 0.08, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.34, 0]}>
        <boxGeometry args={[1.25, 0.55, 1.05]} />
        <meshStandardMaterial color="#f0d7a0" roughness={0.78} metalness={0} />
      </mesh>
      <GableRoof width={1.55} height={0.55} depth={1.2} position={[0, 0.61, 0]} color="#7d5642" />
      <mesh castShadow position={[-0.36, 0.24, -0.54]}>
        <boxGeometry args={[0.24, 0.32, 0.04]} />
        <meshStandardMaterial color="#68412f" roughness={0.86} metalness={0} />
      </mesh>
      <mesh castShadow position={[0.18, 0.38, -0.55]}>
        <boxGeometry args={[0.26, 0.22, 0.04]} />
        <meshStandardMaterial color="#bfe2e0" roughness={0.35} metalness={0} />
      </mesh>
      <mesh castShadow position={[0.46, 0.91, 0.2]}>
        <boxGeometry args={[0.16, 0.42, 0.16]} />
        <meshStandardMaterial color="#624a35" roughness={0.82} metalness={0} />
      </mesh>
    </group>
  );
}

function Silo({ footprint }: { footprint: StructureFootprint }) {
  const radius = Math.min(0.44, footprint.width * 0.16);
  return (
    <group position={[0, 0.08, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.38, 0]}>
        <cylinderGeometry args={[radius * 0.9, radius, 0.68, 12]} />
        <meshStandardMaterial color="#d8b65a" roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh castShadow position={[0, 0.79, 0]}>
        <coneGeometry args={[radius * 1.15, 0.28, 12]} />
        <meshStandardMaterial color="#8d6a36" roughness={0.78} metalness={0} />
      </mesh>
      <mesh castShadow position={[0.28, 0.32, -0.16]}>
        <boxGeometry args={[0.07, 0.42, 0.07]} />
        <meshStandardMaterial color={outlineColor} roughness={0.7} metalness={0} />
      </mesh>
    </group>
  );
}

function Barn({ footprint, state }: { footprint: StructureFootprint; state: FarmAssetState }) {
  const bodyColor = state.blockedByPlacement ? blockedColor : "#b95346";
  const width = Math.min(1.28, footprint.width - 0.45);
  const depth = Math.min(1.08, footprint.height - 0.55);
  const roofWidth = width + 0.28;
  const roofDepth = depth + 0.16;
  return (
    <group position={[0, 0.08, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.27, 0]}>
        <boxGeometry args={[width, 0.46, depth]} />
        <meshStandardMaterial color={bodyColor} roughness={0.76} metalness={0} />
      </mesh>
      <GableRoof width={roofWidth} height={0.54} depth={roofDepth} position={[0, 0.5, 0]} color="#6d3b35" />
      <mesh castShadow position={[0, 0.22, -0.33]}>
        <boxGeometry args={[0.24, 0.3, 0.035]} />
        <meshStandardMaterial color="#f1d2a4" roughness={0.85} metalness={0} />
      </mesh>
    </group>
  );
}

function GableRoof({
  width,
  height,
  depth,
  position,
  color,
}: GableRoofDimensions & { position: [number, number, number]; color: string }) {
  const geometry = useMemo(() => createGableRoofGeometry({ width, height, depth }), [width, height, depth]);

  return (
    <mesh castShadow receiveShadow position={position} geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.82} metalness={0} />
    </mesh>
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

function ChickenCoop({ footprint }: { footprint: StructureFootprint }) {
  return (
    <group position={[0, 0.08, 0]}>
      <Fence width={footprint.width - 0.3} depth={footprint.height - 0.3} />
      <mesh castShadow receiveShadow position={[-0.18, 0.28, -0.32]}>
        <boxGeometry args={[0.76, 0.42, 0.58]} />
        <meshStandardMaterial color="#d8a64e" roughness={0.82} metalness={0} />
      </mesh>
      <mesh castShadow position={[-0.18, 0.58, -0.32]}>
        <boxGeometry args={[0.86, 0.2, 0.68]} />
        <meshStandardMaterial color="#8d6a36" roughness={0.86} metalness={0} />
      </mesh>
      <mesh castShadow position={[0.38, 0.2, 0.48]}>
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

function ProductionStatusVisual({
  kind,
  footprint,
  status,
  hidden,
}: {
  kind: Exclude<FarmAssetKind, "ground_tile" | "field_plot">;
  footprint: StructureFootprint;
  status: StructureProductionStatus;
  hidden: boolean;
}) {
  if (hidden || status.type === "idle") {
    return null;
  }

  const productColor = colorForItem(status.outputItemId);
  const y = kind === "barn" || kind === "farm_house" ? 1.05 : 0.92;
  return (
    <group>
      {status.type === "producing" ? (
        <>
          {isMachineAsset(kind) ? <ProductionSteam productColor={productColor} /> : <ShelterProducingMarker productColor={productColor} />}
          <StatusProgressBar progress={status.progress} productColor={productColor} footprint={footprint} />
        </>
      ) : (
        <>
          <ReadyOutputMarker productColor={productColor} y={y} />
          <ReadyHalo footprint={footprint} productColor={productColor} />
          {status.blockedByStorage ? <StorageBlockedMarker y={y + 0.12} /> : null}
        </>
      )}
    </group>
  );
}

function StatusProgressBar({
  progress,
  productColor,
  footprint,
}: {
  progress: number;
  productColor: string;
  footprint: StructureFootprint;
}) {
  const width = Math.min(1.2, Math.max(0.74, footprint.width * 0.5));
  const fillWidth = Math.max(0.05, width * progress);
  return (
    <Billboard position={[0, 0.9, -footprint.height * 0.12]} follow lockX={false} lockY={false} lockZ={false}>
      <group>
        <mesh>
          <boxGeometry args={[width, 0.07, 0.055]} />
          <meshBasicMaterial color="#20312b" transparent opacity={0.65} />
        </mesh>
        <mesh position={[-width / 2 + fillWidth / 2, 0.006, 0.006]}>
          <boxGeometry args={[fillWidth, 0.046, 0.07]} />
          <meshBasicMaterial color={productColor} />
        </mesh>
      </group>
    </Billboard>
  );
}

function ProductionSteam({ productColor }: { productColor: string }) {
  const groupRef = useRef<THREE.Group | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useFrame(({ clock }) => {
    if (!groupRef.current || reducedMotion) {
      return;
    }
    const elapsed = clock.getElapsedTime();
    groupRef.current.position.y = 0.78 + Math.sin(elapsed * 1.8) * 0.025;
    groupRef.current.rotation.y = Math.sin(elapsed * 0.8) * 0.08;
  });

  return (
    <group ref={groupRef} position={[0.38, 0.78, 0.22]}>
      {[0, 1, 2].map((index) => (
        <mesh key={index} position={[index * 0.08 - 0.08, index * 0.1, 0]}>
          <sphereGeometry args={[0.08 + index * 0.025, 10, 8]} />
          <meshBasicMaterial color={index === 0 ? productColor : "#fff7d0"} transparent opacity={0.34 - index * 0.07} />
        </mesh>
      ))}
    </group>
  );
}

function ShelterProducingMarker({ productColor }: { productColor: string }) {
  const groupRef = useRef<THREE.Group | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useFrame(({ clock }) => {
    if (!groupRef.current || reducedMotion) {
      return;
    }
    groupRef.current.scale.setScalar(1 + Math.sin(clock.getElapsedTime() * 2) * 0.05);
  });

  return (
    <group ref={groupRef} position={[0.48, 0.42, 0.44]}>
      <mesh castShadow>
        <boxGeometry args={[0.22, 0.13, 0.18]} />
        <meshStandardMaterial color={productColor} roughness={0.76} metalness={0} />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshStandardMaterial color="#fff7d0" roughness={0.72} metalness={0} />
      </mesh>
    </group>
  );
}

function ReadyOutputMarker({ productColor, y }: { productColor: string; y: number }) {
  return (
    <Billboard position={[0.36, y, -0.2]} follow lockX={false} lockY={false} lockZ={false}>
      <group>
        <mesh castShadow>
          <boxGeometry args={[0.22, 0.2, 0.08]} />
          <meshStandardMaterial color={productColor} roughness={0.64} metalness={0} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <sphereGeometry args={[0.11, 12, 8]} />
          <meshBasicMaterial color="#fff7d0" transparent opacity={0.82} />
        </mesh>
      </group>
    </Billboard>
  );
}

function ReadyHalo({ footprint, productColor }: { footprint: StructureFootprint; productColor: string }) {
  return (
    <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[Math.max(0.42, Math.min(footprint.width, footprint.height) * 0.32), Math.max(0.5, Math.min(footprint.width, footprint.height) * 0.42), 32]} />
      <meshBasicMaterial color={productColor} transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function StorageBlockedMarker({ y }: { y: number }) {
  return (
    <Billboard position={[0.58, y, -0.18]} follow lockX={false} lockY={false} lockZ={false}>
      <group>
        <mesh rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.11, 0.2, 3]} />
          <meshBasicMaterial color="#f0a43a" />
        </mesh>
        <mesh position={[0, -0.015, 0.01]}>
          <boxGeometry args={[0.025, 0.09, 0.025]} />
          <meshBasicMaterial color="#20312b" />
        </mesh>
      </group>
    </Billboard>
  );
}

function isMachineAsset(kind: FarmAssetKind) {
  return kind === "bakery" || kind === "feed_mill";
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reducedMotion;
}

function StructureLabel({
  label,
  footprint,
  kind,
}: {
  label: string;
  footprint: StructureFootprint;
  kind: Exclude<FarmAssetKind, "ground_tile" | "field_plot">;
}) {
  const labelY = kind === "farm_house" || kind === "barn" ? 1.55 : 1.15;
  return (
    <Billboard position={[0, labelY, -footprint.height * 0.08]} follow lockX={false} lockY={false} lockZ={false}>
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
