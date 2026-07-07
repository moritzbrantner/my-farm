import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ElementRef } from "react";
import * as THREE from "three";
import type { CatalogDocument, FarmView, FieldPlot, MachineState, StructureKind, SweepHarvestMode, Tile } from "@my-farm/contracts";
import {
  FARM_GRID_SIZE,
  FARM_HOUSE_FOOTPRINT,
  FARM_HOUSE_TILE,
  isTileOccupiedForPlacement,
  isTileAvailableForNewFieldPlot,
  isTileAvailableForNewStructure,
  isTileAvailableForStructure,
  structureFootprint,
  structureFootprintForSelection,
  type Selection,
  type StructureFootprint,
  type StructureSelection,
} from "@my-farm/game-model/selectors";
import { FarmArrivalEnvironment, FarmAsset, type FarmAssetKind } from "./farmScene/assets";
import { FarmResidentFigure, type FarmResidentPresentation } from "./farmScene/residents";
import {
  computeFarmCameraFrame,
  type FarmCameraFrame,
  type FarmViewportInsets,
} from "./farmScene/framing";
import {
  machineProductionStatus,
  ovenProductionStatus,
  productionStatusLabel,
  shelterProductionStatus,
  type StructureProductionStatus,
} from "@my-farm/game-model/structureStatus";
import {
  currentResidentFacing,
  currentResidentScenePath,
  currentResidentScenePose,
  hasActiveResidentWalk,
  isResidentInsideHouse,
  residentVisualPresentation,
  type ResidentScenePath,
  residentTaskStatus,
  residentWork,
} from "@my-farm/game-model/residentTasks";

const MOVE_TILE_BLOCKED_COLOR = "#a9333f";
const BOARD_ORIGIN = -(FARM_GRID_SIZE - 1) / 2;
const CAMERA_PADDING_PX = 32;
const RAYCAST_MATERIAL_OPACITY = 0.001;
const FARM_ROAD_WORLD_Z = 9.52;
const PAN_SCREEN_RIGHT = new THREE.Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
const PAN_SCREEN_UP = new THREE.Vector3(-0.4082482904638631, 0.8164965809277261, -0.4082482904638631);

type Props = {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  visualClockPaused: boolean;
  selection: Selection;
  activeFieldTool: ActiveFieldTool;
  buildPlacement: BuildPlacementState;
  movingStructure: StructureSelection | null;
  plantSweep: PlantSweepState;
  harvestSweep: HarvestSweepState;
  previewResidentPath: ResidentScenePath | null;
  onSelect: (selection: Selection) => void;
  onSelectResident: (residentId: string) => void;
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
  catalog,
  view,
  nowMs,
  visualClockPaused,
  selection,
  activeFieldTool,
  buildPlacement,
  movingStructure,
  plantSweep,
  harvestSweep,
  previewResidentPath,
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
  onSelectResident,
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
      camera={{ position: [15, 15, 15], zoom: 28, near: 0.1, far: 100 }}
      shadows
      dpr={[1, 2]}
    >
      <color attach="background" args={["#9fd3d1"]} />
      <hemisphereLight args={["#d7f3ee", "#536a5e", 1.25]} />
      <ambientLight intensity={0.42} />
      <directionalLight
        position={[7, 12, 6]}
        intensity={2.35}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <FarmCameraController activeFieldTool={activeFieldTool} harvestSweep={harvestSweep} plantSweep={plantSweep} />
      <group>
        <FarmArrivalEnvironment />
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
        <StaticFarmHouse
          catalog={catalog}
          view={view}
          nowMs={nowMs}
          selected={selection?.type === "farmhouse"}
          buildPlacement={buildPlacement}
          movingStructure={movingStructure}
          onSelect={() => onSelect({ type: "farmhouse" })}
          onOpenStructureMenu={onOpenStructureMenu}
          onPlaceNewStructure={onPlaceNewStructure}
          onPlaceStructure={onPlaceStructure}
        />
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
            catalog={catalog}
            view={view}
            nowMs={nowMs}
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
        {view.shelters.map((shelter) => {
          const status = shelterProductionStatus(catalog, view, shelter, nowMs);
          const hitLabel = shelter.kind === "chicken_coop" ? "Chicken Coop" : "Cow Pasture";
          return (
            <StructureSprite
              key={shelter.id}
              target={{ type: "shelter", id: shelter.id }}
              label={shelter.kind === "chicken_coop" ? "Chickens" : "Cows"}
              hitLabel={hitLabel}
              tile={shelter.tile}
              color={shelter.kind === "chicken_coop" ? "#d8a64e" : "#b98762"}
              footprint={structureFootprint(shelter.kind)}
              productionStatus={status}
              productionStatusLabel={productionStatusLabel(hitLabel, catalog, status)}
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
          );
        })}
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
        {view.tool_shed ? (
          <StructureSprite
            target={{ type: "tool_shed", id: view.tool_shed.id }}
            label="Tools"
            hitLabel="Tool Shed"
            tile={view.tool_shed.tile}
            color="#6f8f88"
            footprint={structureFootprint("tool_shed")}
            selected={selection?.type === "tool_shed" && selection.id === view.tool_shed.id}
            buildPlacement={buildPlacement}
            movingStructure={movingStructure}
            onHoverTile={setHoverTile}
            onOpenStructureMenu={onOpenStructureMenu}
            onPlaceNewStructure={onPlaceNewStructure}
            onPlaceStructure={onPlaceStructure}
            onSelect={() => {
              onSelect({ type: "tool_shed", id: view.tool_shed.id });
            }}
          />
        ) : null}
        {view.farm_shop ? (
          <StructureSprite
            target={{ type: "farm_shop", id: view.farm_shop.id }}
            label="Shop"
            hitLabel="Farm Shop"
            tile={view.farm_shop.tile}
            color="#e7c16d"
            footprint={structureFootprint("farm_shop")}
            selected={selection?.type === "farm_shop" && selection.id === view.farm_shop.id}
            buildPlacement={buildPlacement}
            movingStructure={movingStructure}
            onHoverTile={setHoverTile}
            onOpenStructureMenu={onOpenStructureMenu}
            onPlaceNewStructure={onPlaceNewStructure}
            onPlaceStructure={onPlaceStructure}
            onSelect={() => {
              onSelect({ type: "farm_shop", id: view.farm_shop?.id ?? "" });
            }}
          />
        ) : null}
        {view.farm_shop &&
        ((view.farm_shop.current_sale && view.farm_shop.current_sale.visible_until_ms > nowMs) ||
          (view.farm_shop.current_rejection && view.farm_shop.current_rejection.visible_until_ms > nowMs)) ? (
          <FarmShopSaleCar shopTile={view.farm_shop.tile} />
        ) : null}
        <ResidentPathOverlay view={view} selection={selection} nowMs={nowMs} previewPath={previewResidentPath} />
        <FarmResidents
          catalog={catalog}
          view={view}
          nowMs={nowMs}
          visualClockPaused={visualClockPaused}
          selection={selection}
          onSelectResident={onSelectResident}
        />
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
    </Canvas>
  );
}

function FarmShopSaleCar({ shopTile }: { shopTile: Tile }) {
  const x = tileToWorld(shopTile.x + 0.5);
  return (
    <group position={[x, 0.12, FARM_ROAD_WORLD_Z - 0.22]} rotation={[0, 0, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
        <boxGeometry args={[0.66, 0.22, 0.36]} />
        <meshStandardMaterial color="#cf5d4f" roughness={0.72} metalness={0.04} />
      </mesh>
      <mesh castShadow position={[0.04, 0.31, 0]}>
        <boxGeometry args={[0.34, 0.18, 0.28]} />
        <meshStandardMaterial color="#f1d2a4" roughness={0.52} metalness={0.02} />
      </mesh>
      <mesh castShadow position={[0.34, 0.16, 0]}>
        <boxGeometry args={[0.04, 0.08, 0.23]} />
        <meshStandardMaterial color="#f7e8a8" roughness={0.42} metalness={0.05} />
      </mesh>
      {[-0.24, 0.24].map((wheelX) =>
        [-0.21, 0.21].map((wheelZ) => (
          <mesh key={`${wheelX}-${wheelZ}`} castShadow position={[wheelX, 0.05, wheelZ]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.06, 10]} />
            <meshStandardMaterial color="#20312b" roughness={0.75} metalness={0} />
          </mesh>
        )),
      )}
      <Html position={[0, 0.54, 0]} center zIndexRange={[25, 0]} wrapperClass="farm-scene-marker-wrapper">
        <div className="farm-scene-marker" data-testid="farm-shop-sale-car" aria-label="Customer car at Farm Shop" />
      </Html>
    </group>
  );
}

function FarmResidents({
  catalog,
  view,
  nowMs,
  visualClockPaused,
  selection,
  onSelectResident,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  visualClockPaused: boolean;
  selection: Selection;
  onSelectResident: (residentId: string) => void;
}) {
  const residentNowMs = useResidentVisualNowMs(view, nowMs, visualClockPaused);
  const residents = view.residents
    .slice(0, 2)
    .filter((resident) => !isResidentInsideHouse(view, resident.id, residentNowMs))
    .map((resident, index): FarmResidentPresentation => {
      const pose = currentResidentScenePose(view, resident.id, residentNowMs);
      const presentation = residentVisualPresentation(view, resident.id, residentNowMs);
      const work = residentWork(view, resident.id);
      const status = residentTaskStatus(catalog, view, resident.id, residentNowMs);
      const offset = residentVisualOffset(index, pose.state);
      const position: [number, number, number] = [
        tileToWorld(pose.tile.x) + offset[0],
        0.16,
        tileToWorld(pose.tile.y) + offset[1],
      ];

      return {
        id: resident.id,
        displayName: resident.display_name,
        variant: resident.id === "man" ? "man" : "woman",
        position,
        state: pose.state,
        activity: presentation.activity,
        prop: presentation.prop,
        heldTool: presentation.heldTool,
        motion: presentation.motion,
        taskLabel: work?.current_step?.label ?? status.currentTask?.label ?? status.label,
        targetLabel: pose.label,
        selected: selection?.type === "resident" && selection.id === resident.id,
        blocked: pose.state === "blocked",
        animationPaused: visualClockPaused,
        facing: currentResidentFacing(view, resident.id, residentNowMs),
      };
    });

  return (
    <group>
      {residents.map((resident) => (
        <FarmResidentFigure
          key={resident.id}
          resident={resident}
          onSelect={() => onSelectResident(resident.id)}
        />
      ))}
    </group>
  );
}

function ResidentPathOverlay({
  view,
  selection,
  nowMs,
  previewPath,
}: {
  view: FarmView;
  selection: Selection;
  nowMs: number;
  previewPath: ResidentScenePath | null;
}) {
  const path = previewPath ?? (selection?.type === "resident"
    ? currentResidentScenePath(view, selection.id, nowMs)
    : null);
  const linePoints = useMemo(() => {
    if (!path) {
      return new Float32Array();
    }
    return new Float32Array(
      path.tiles.flatMap((tile) => [tileToWorld(tile.x), 0.13, tileToWorld(tile.y)]),
    );
  }, [path]);

  if (!path || path.tiles.length < 2) {
    return null;
  }

  return (
    <group>
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePoints, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#20312b" transparent opacity={0.54} linewidth={5} />
      </line>
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePoints, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={path.state === "walking" ? "#f0cb6b" : "#fff7d0"} transparent opacity={0.96} linewidth={2} />
      </line>
      {path.tiles.map((tile, index) => (
        <mesh
          key={`${tile.x},${tile.y},${index}`}
          position={[tileToWorld(tile.x), 0.145, tileToWorld(tile.y)]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color="#20312b" transparent opacity={0.72} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function useResidentVisualNowMs(view: FarmView, nowMs: number, paused: boolean) {
  const [visualNowMs, setVisualNowMs] = useState(nowMs);

  useEffect(() => {
    setVisualNowMs(paused ? nowMs : Date.now());
  }, [nowMs, paused, view]);

  useEffect(() => {
    if (paused) {
      return;
    }

    let frame = 0;

    const tick = () => {
      const nextNowMs = Date.now();
      setVisualNowMs(nextNowMs);
      if (hasActiveResidentWalk(view, nextNowMs)) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    if (!hasActiveResidentWalk(view, Date.now())) {
      return;
    }

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [paused, view]);

  return visualNowMs;
}

function StaticFarmHouse({
  catalog,
  view,
  nowMs,
  selected,
  buildPlacement,
  movingStructure,
  onSelect,
  onOpenStructureMenu,
  onPlaceNewStructure,
  onPlaceStructure,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  selected: boolean;
  buildPlacement: BuildPlacementState;
  movingStructure: StructureSelection | null;
  onSelect: () => void;
  onOpenStructureMenu: (target: StructureSelection, point: { x: number; y: number }) => void;
  onPlaceNewStructure: (tile: Tile) => void;
  onPlaceStructure: (tile: Tile) => void;
}) {
  const center = footprintCenter(FARM_HOUSE_TILE, FARM_HOUSE_FOOTPRINT);
  const productionStatus = ovenProductionStatus(catalog, view, nowMs);
  const statusLabel = productionStatusLabel("Farmhouse Oven", catalog, productionStatus);
  const statusTestId = statusLabel ? `structure-status-${statusId("Farmhouse Oven")}` : null;
  const clearFixedInteraction = (event: React.MouseEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleFixedClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    clearFixedInteraction(event);
    if (movingStructure) {
      onPlaceStructure(FARM_HOUSE_TILE);
      return;
    }
    if (buildPlacement) {
      onPlaceNewStructure(FARM_HOUSE_TILE);
      return;
    }
    onSelect();
  };

  const handleFixedContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    clearFixedInteraction(event);
    onOpenStructureMenu({ type: "farmhouse" }, { x: event.clientX, y: event.clientY });
  };

  return (
    <group position={[tileToWorld(center.x), 0.015, tileToWorld(center.y)]}>
      <FarmAsset
        kind="farm_house"
        label="Farmhouse"
        footprint={FARM_HOUSE_FOOTPRINT}
        state={{
          selected,
          blockedByPlacement: false,
          movingTarget: false,
        }}
      />
      <Html position={[0, 1.1, 0]} center zIndexRange={[95, 0]} wrapperClass="farm-scene-marker-wrapper">
        <div className="farm-scene-marker" data-testid="farm-scene-farm-house" aria-label="Farmhouse" />
      </Html>
      <Html position={[0, 0.62, 0]} center zIndexRange={[100, 0]} wrapperClass="structure-hit-wrapper">
        <button
          className="structure-hit-target"
          type="button"
          tabIndex={-1}
          aria-label="Farmhouse structure"
          style={{
            width: `${farmhouseHitTargetWidth(FARM_HOUSE_FOOTPRINT)}px`,
            height: `${farmhouseHitTargetHeight(FARM_HOUSE_FOOTPRINT)}px`,
          }}
          onClick={handleFixedClick}
          onContextMenu={handleFixedContextMenu}
          onPointerDown={clearFixedInteraction}
        />
      </Html>
      {statusLabel && statusTestId ? (
        <StructureStatusCue
          position={[0, 1.32, 0]}
          status={productionStatus}
          statusLabel={statusLabel}
          statusTestId={statusTestId}
        />
      ) : null}
    </group>
  );
}

type HarvestSweepState = {
  cropId: string;
  harvestMode: SweepHarvestMode;
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

function FarmCameraController({
  activeFieldTool,
  harvestSweep,
  plantSweep,
}: {
  activeFieldTool: ActiveFieldTool;
  harvestSweep: HarvestSweepState;
  plantSweep: PlantSweepState;
}) {
  const { camera, gl, invalidate, size } = useThree();
  const controlsRef = useRef<ElementRef<typeof OrbitControls> | null>(null);
  const controlsEnabled = activeFieldTool.type === "default" && !harvestSweep && !plantSweep;
  const frame = useMemo(
    () =>
      computeFarmCameraFrame({
        canvasWidth: size.width,
        canvasHeight: size.height,
        gridSize: FARM_GRID_SIZE,
        insets: readFarmViewportInsets(gl.domElement.closest(".app")),
        paddingPx: CAMERA_PADDING_PX,
      }),
    [gl.domElement, size.height, size.width],
  );

  useLayoutEffect(() => {
    applyFarmCameraFrame(camera, frame);
  }, [camera, frame]);

  useLayoutEffect(() => {
    if (!controlsEnabled || !(camera instanceof THREE.OrthographicCamera)) {
      return;
    }
    let activePointer: { id: number; x: number; y: number } | null = null;

    const isManualPanPointer = (event: PointerEvent) =>
      event.pointerType === "touch" || (event.pointerType === "mouse" && event.button === 2);

    const startManualPan = (event: PointerEvent) => {
      if (!isManualPanPointer(event)) {
        return;
      }
      event.preventDefault();
      activePointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const moveManualPan = (event: PointerEvent) => {
      if (!activePointer || event.pointerId !== activePointer.id) {
        return;
      }
      event.preventDefault();
      const dx = event.clientX - activePointer.x;
      const dy = event.clientY - activePointer.y;
      activePointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      panCamera(camera, controlsRef.current, dx, dy);
      invalidate();
    };
    const stopManualPan = (event: PointerEvent) => {
      if (activePointer?.id === event.pointerId) {
        activePointer = null;
      }
    };

    const canvas = gl.domElement;
    canvas.addEventListener("pointerdown", startManualPan);
    canvas.addEventListener("pointermove", moveManualPan);
    canvas.addEventListener("pointerup", stopManualPan);
    canvas.addEventListener("pointercancel", stopManualPan);
    return () => {
      canvas.removeEventListener("pointerdown", startManualPan);
      canvas.removeEventListener("pointermove", moveManualPan);
      canvas.removeEventListener("pointerup", stopManualPan);
      canvas.removeEventListener("pointercancel", stopManualPan);
    };
  }, [camera, controlsEnabled, gl.domElement, invalidate]);

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={controlsEnabled}
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
      minZoom={frame.minZoom}
      maxZoom={frame.maxZoom}
      target={frame.target}
    />
  );
}

function panCamera(
  camera: THREE.OrthographicCamera,
  controls: { target: THREE.Vector3; update: () => void } | null,
  dx: number,
  dy: number,
) {
  const rightPan = PAN_SCREEN_RIGHT.clone().multiplyScalar(-dx / camera.zoom);
  const upPan = PAN_SCREEN_UP.clone().multiplyScalar(dy / camera.zoom);
  const pan = rightPan.add(upPan);
  camera.position.add(pan);
  controls?.target.add(pan);
  controls?.update();
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
}

function applyFarmCameraFrame(camera: THREE.Camera, frame: FarmCameraFrame) {
  if (!(camera instanceof THREE.OrthographicCamera)) {
    return;
  }
  camera.position.set(...frame.cameraPosition);
  camera.zoom = frame.zoom;
  camera.lookAt(...frame.target);
  camera.updateProjectionMatrix();
}

function readFarmViewportInsets(element: Element | null): FarmViewportInsets {
  if (!element) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const styles = window.getComputedStyle(element);
  return {
    top: readCssPx(styles, "--farm-viewport-inset-top"),
    right: readCssPx(styles, "--farm-viewport-inset-right"),
    bottom: readCssPx(styles, "--farm-viewport-inset-bottom"),
    left: readCssPx(styles, "--farm-viewport-inset-left"),
  };
}

function readCssPx(styles: CSSStyleDeclaration, property: string) {
  const value = Number.parseFloat(styles.getPropertyValue(property));
  return Number.isFinite(value) ? value : 0;
}

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
  const tiles = [];
  for (let x = 0; x < FARM_GRID_SIZE; x += 1) {
    for (let y = 0; y < FARM_GRID_SIZE; y += 1) {
      const tile = { x, y };
      const isOccupied = isTileOccupiedForPlacement(view, tile, movingStructure);
      tiles.push(
        <group
          key={`${x}-${y}`}
          position={[tileToWorld(x), -0.01, tileToWorld(y)]}
        >
          <FarmAsset
            kind="ground_tile"
            label=""
            footprint={{ width: 1, height: 1 }}
            state={{
              selected: false,
              blockedByPlacement: Boolean(movingStructure || buildPlacement) && isOccupied,
              movingTarget: Boolean(movingStructure || buildPlacement) && !isOccupied,
            }}
          />
          <mesh
            position={[0, 0.07, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerDown={(event) => {
              if (event.nativeEvent.button !== 0 || (!movingStructure && !buildPlacement)) {
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
            <planeGeometry args={[0.98, 0.98]} />
            <meshBasicMaterial transparent opacity={RAYCAST_MATERIAL_OPACITY} depthWrite={false} />
          </mesh>
          {(movingStructure || buildPlacement) && !isOccupied ? (
            <Html
              position={[0, 0.32, 0]}
              center
              zIndexRange={[90, 0]}
              wrapperClass="ground-hit-wrapper"
            >
              <button
                className="ground-hit-target"
                type="button"
                tabIndex={-1}
                aria-label={`Ground tile ${x},${y}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (movingStructure) {
                    onPlaceStructure(tile);
                    return;
                  }
                  onPlaceNewStructure(tile);
                }}
                onPointerMove={() => {
                  onHoverTile(tile);
                }}
              />
            </Html>
          ) : null}
        </group>,
      );
    }
  }
  return (
    <>
      {tiles}
      {movingStructure || buildPlacement ? (
        <mesh
          position={[0, 0.16, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={(event) => {
            if (event.nativeEvent.button !== 0) {
              return;
            }
            const tile = tileFromPointerEvent(event);
            if (!tile) {
              return;
            }
            stop(event);
            event.nativeEvent.preventDefault();
            if (movingStructure) {
              onPlaceStructure(tile);
              return;
            }
            onPlaceNewStructure(tile);
          }}
          onPointerMove={(event) => {
            const tile = tileFromPointerEvent(event);
            if (tile) {
              onHoverTile(tile);
            }
          }}
        >
          <planeGeometry args={[FARM_GRID_SIZE, FARM_GRID_SIZE]} />
          <meshBasicMaterial transparent opacity={RAYCAST_MATERIAL_OPACITY} depthWrite={false} />
        </mesh>
      ) : null}
    </>
  );
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
  const longPressTimer = useRef<number | null>(null);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);
  const ignoreNextClick = useRef(false);
  const blockedByPlacement = movingStructure !== null || buildPlacement !== null;
  const sweptByHarvest = harvestSweep?.plotIds.includes(plot.id) ?? false;
  const sweptByPlant = plantSweep?.plotIds.includes(plot.id) ?? false;
  const fieldToolActive = activeFieldTool.type !== "default";
  const eligibleForHarvestSweep =
    harvestSweep !== null &&
    cropReady &&
    (harvestSweep.harvestMode === "all_crops" || plot.crop?.item_id === harvestSweep.cropId);

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
    if (ignoreNextClick.current) {
      ignoreNextClick.current = false;
      event.stopPropagation();
      return;
    }
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
      clearLongPress();
      ignoreNextClick.current = true;
      event.preventDefault();
      event.stopPropagation();
      onPlaceNewStructure(plot.tile);
      return;
    }
    if (movingStructure) {
      clearLongPress();
      ignoreNextClick.current = true;
      event.preventDefault();
      event.stopPropagation();
      onPlaceStructure(plot.tile);
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
      <group
        position={[tileToWorld(plot.tile.x), 0.02, tileToWorld(plot.tile.y)]}
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
            ignoreNextClick.current = true;
            stop(event);
            onPlaceNewStructure(plot.tile);
            return;
          }
          if (movingStructure) {
            ignoreNextClick.current = true;
            stop(event);
            onPlaceStructure(plot.tile);
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
        <FarmAsset
          kind="field_plot"
          label=""
          footprint={{ width: 1, height: 1 }}
          state={{
            selected,
            blockedByPlacement,
            movingTarget: sweptByHarvest || sweptByPlant,
            cropItemId: plot.crop?.item_id,
            cropReady,
          }}
        />
        <mesh position={[0, 0.24, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.95, 0.95]} />
          <meshBasicMaterial transparent opacity={RAYCAST_MATERIAL_OPACITY} depthWrite={false} />
        </mesh>
      </group>
      <Html
        position={[tileToWorld(plot.tile.x), 0.28, tileToWorld(plot.tile.y)]}
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
  catalog,
  view,
  nowMs,
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
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
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
  const status = machineProductionStatus(catalog, view, machine, nowMs);
  const label = "Feed Mill";
  return (
    <StructureSprite
      target={{ type: "machine", id: machine.id }}
      label={label}
      hitLabel={label}
      tile={machine.tile}
      color="#79955b"
      footprint={structureFootprint(machine.kind)}
      productionStatus={status}
      productionStatusLabel={productionStatusLabel(label, catalog, status)}
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
  productionStatus = { type: "idle" },
  productionStatusLabel,
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
  productionStatus?: StructureProductionStatus;
  productionStatusLabel?: string | null;
  selected: boolean;
  buildPlacement: BuildPlacementState;
  movingStructure: StructureSelection | null;
  onHoverTile: (tile: Tile) => void;
  onSelect: () => void;
  onOpenStructureMenu: (target: StructureSelection, point: { x: number; y: number }) => void;
  onPlaceNewStructure: (tile: Tile) => void;
  onPlaceStructure: (tile: Tile) => void;
}) {
  const isMovingTarget = isSameStructure(movingStructure, target);
  const blockedByPlacement = buildPlacement !== null || (movingStructure !== null && !isMovingTarget);
  const center = footprintCenter(tile, footprint);
  const statusTestId = productionStatusLabel ? `structure-status-${statusId(hitLabel)}` : null;
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
      <group
        position={[tileToWorld(center.x), 0.02, tileToWorld(center.y)]}
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
        <FarmAsset
          kind={assetKindForTarget(target, label)}
          label={label}
          footprint={footprint}
          state={{
            selected,
            blockedByPlacement,
            movingTarget: isMovingTarget,
            productionStatus,
          }}
        />
        <mesh position={[0, 0.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[Math.max(1, footprint.width), Math.max(1, footprint.height)]} />
          <meshBasicMaterial transparent opacity={RAYCAST_MATERIAL_OPACITY} depthWrite={false} />
        </mesh>
      </group>
      <Html
        position={[tileToWorld(center.x), 0.62, tileToWorld(center.y)]}
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
	            width: `${structureHitTargetWidth(footprint)}px`,
	            height: `${structureHitTargetHeight(footprint)}px`,
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
      {productionStatusLabel && statusTestId ? (
        <StructureStatusCue
          position={[tileToWorld(center.x), 1.08, tileToWorld(center.y)]}
          status={productionStatus}
          statusLabel={productionStatusLabel}
          statusTestId={statusTestId}
        />
      ) : null}
    </>
  );
}

function StructureStatusCue({
  position,
  status,
  statusLabel,
  statusTestId,
}: {
  position: [number, number, number];
  status: StructureProductionStatus;
  statusLabel: string;
  statusTestId: string;
}) {
  return (
    <Html
      position={position}
      center
      zIndexRange={[95, 0]}
      wrapperClass="structure-status-wrapper"
    >
      <div
        className={`structure-status structure-status--${status.type}`}
        data-testid={statusTestId}
        role="img"
        aria-label={statusLabel}
      >
        <span className="structure-status__dot" />
        {status.type === "producing" ? (
          <span
            className="structure-status__progress"
            data-testid={`${statusTestId}-progress`}
            style={{ "--progress": status.progress } as CSSProperties}
          />
        ) : null}
        {status.type === "ready" && status.blockedByStorage ? (
          <span className="structure-status__warning" data-testid={`${statusTestId}-blocked`} />
        ) : null}
      </div>
    </Html>
  );
}

function statusId(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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
    <group position={[tileToWorld(center.x), 0.13, tileToWorld(center.y)]}>
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
  const tile = {
    x: Math.round(worldToTile(event.point.x)),
    y: Math.round(worldToTile(event.point.z)),
  };
  if (tile.x < 0 || tile.x >= FARM_GRID_SIZE || tile.y < 0 || tile.y >= FARM_GRID_SIZE) {
    return null;
  }
  return tile;
}

function tileToWorld(value: number) {
  return value + BOARD_ORIGIN;
}

function worldToTile(value: number) {
  return value - BOARD_ORIGIN;
}

function residentVisualOffset(index: number, state: "idle" | "walking" | "working" | "blocked") {
  if (state === "walking") {
    return [0, 0] as const;
  }
  const offsets = [
    [-0.12, 0.1],
    [0.12, -0.1],
  ] as const;
  return offsets[index] ?? ([0, 0] as const);
}

function structureHitTargetWidth(footprint: StructureFootprint) {
  return 16 + (footprint.width - 1) * 10;
}

function structureHitTargetHeight(footprint: StructureFootprint) {
  return 14 + (footprint.height - 1) * 8;
}

function farmhouseHitTargetWidth(footprint: StructureFootprint) {
  return Math.max(72, structureHitTargetWidth(footprint));
}

function farmhouseHitTargetHeight(footprint: StructureFootprint) {
  return Math.max(56, structureHitTargetHeight(footprint));
}

function assetKindForTarget(target: StructureSelection, label: string): Exclude<FarmAssetKind, "ground_tile" | "field_plot"> {
  switch (target.type) {
    case "farmhouse":
      return "farm_house";
    case "silo":
      return "silo";
    case "barn":
      return "barn";
    case "delivery_board":
      return "delivery_board";
    case "tool_shed":
      return "tool_shed";
    case "farm_shop":
      return "farm_shop";
    case "machine":
      return "feed_mill";
    case "shelter":
      return label === "Chickens" ? "chicken_coop" : "cow_pasture";
  }
}

function isSameStructure(left: StructureSelection | null, right: StructureSelection): boolean {
  if (!left || left.type !== right.type) {
    return false;
  }
  switch (left.type) {
    case "farmhouse":
      return true;
    case "silo":
      return true;
    case "barn":
      return true;
    case "delivery_board":
      return true;
    case "tool_shed":
      return right.type === "tool_shed" && left.id === right.id;
    case "farm_shop":
      return right.type === "farm_shop" && left.id === right.id;
    case "machine":
      return right.type === "machine" && left.id === right.id;
    case "shelter":
      return right.type === "shelter" && left.id === right.id;
  }
}
