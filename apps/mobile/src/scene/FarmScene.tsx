import { Canvas, useThree } from "@react-three/fiber/native";
import { Suspense, useLayoutEffect, useMemo, useState } from "react";
import { Dimensions, View } from "react-native";
import * as THREE from "three";
import type { CatalogDocument, FarmView, FieldPlot, MachineState, Tile } from "@my-farm/contracts";
import {
  FarmArrivalEnvironment,
  FarmAsset,
  computeFarmCameraFrame,
  footprintCenter,
  tileToWorld,
  type FarmAssetKind,
} from "@my-farm/game-scene";
import {
  FARM_GRID_SIZE,
  FARM_HOUSE_FOOTPRINT,
  FARM_HOUSE_TILE,
  currentResidentFacing,
  currentResidentScenePath,
  currentResidentScenePose,
  isResidentInsideHouse,
  isTileAvailableForNewFieldPlot,
  isTileAvailableForNewStructure,
  isTileAvailableForStructure,
  isTileOccupiedForPlacement,
  machineProductionStatus,
  ovenProductionStatus,
  productionStatusLabel,
  residentTaskStatus,
  residentVisualPresentation,
  residentWork,
  shelterProductionStatus,
  structureFootprint,
  structureFootprintForSelection,
  type ResidentScenePath,
  type Selection,
  type StructureFootprint,
  type StructureSelection,
} from "@my-farm/game-model";
import { FarmResidentFigure, type FarmResidentPresentation } from "@my-farm/game-scene/residents";
import { styles } from "../styles";
import type { ActiveFieldTool, BuildPlacementState, HarvestSweepState, PlantSweepState } from "../types";

type Props = {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  selection: Selection;
  activeFieldTool: ActiveFieldTool;
  buildPlacement: BuildPlacementState;
  movingStructure: StructureSelection | null;
  plantSweep: PlantSweepState;
  harvestSweep: HarvestSweepState;
  previewResidentPath: ResidentScenePath | null;
  onSelect(selection: Selection): void;
  onSelectResident(residentId: string): void;
  onPlaceNewStructure(tile: Tile): void;
  onPlaceStructure(tile: Tile): void;
  onStartPlantSweep(plotId: string, pointerId: number): void;
  onEnterPlantSweepPlot(plotId: string): void;
  onStartHarvestSweep(plotId: string, pointerId: number): void;
  onEnterHarvestSweepPlot(plotId: string): void;
};

export function FarmSceneShell(props: Props) {
  return (
    <View style={styles.scene}>
      <Canvas
        orthographic
        camera={{ position: [15, 15, 15], zoom: 28, near: 0.1, far: 100 }}
        gl={{ antialias: true }}
        shadows
      >
        <color attach="background" args={["#9fd3d1"]} />
        <hemisphereLight args={["#d7f3ee", "#536a5e", 1.25]} />
        <ambientLight intensity={0.42} />
        <directionalLight position={[7, 12, 6]} intensity={2.15} />
        <Suspense fallback={null}>
          <FarmCameraFrameController />
          <FarmBoard {...props} />
        </Suspense>
      </Canvas>
    </View>
  );
}

function FarmCameraFrameController() {
  const { camera, size } = useThree();
  const dimensions = Dimensions.get("window");
  const frame = useMemo(
    () =>
      computeFarmCameraFrame({
        canvasWidth: size.width || dimensions.width,
        canvasHeight: size.height || dimensions.height,
        gridSize: FARM_GRID_SIZE,
        insets: { top: 52, right: 0, bottom: 124, left: 0 },
        paddingPx: 32,
      }),
    [dimensions.height, dimensions.width, size.height, size.width],
  );

  useLayoutEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) {
      return;
    }
    camera.position.set(...frame.cameraPosition);
    camera.zoom = frame.zoom;
    camera.lookAt(...frame.target);
    camera.updateProjectionMatrix();
  }, [camera, frame]);

  return null;
}

function FarmBoard({
  catalog,
  view,
  nowMs,
  selection,
  activeFieldTool,
  buildPlacement,
  movingStructure,
  plantSweep,
  harvestSweep,
  previewResidentPath,
  onSelect,
  onSelectResident,
  onPlaceNewStructure,
  onPlaceStructure,
  onStartPlantSweep,
  onEnterPlantSweepPlot,
  onStartHarvestSweep,
  onEnterHarvestSweepPlot,
}: Props) {
  const [hoverTile, setHoverTile] = useState<Tile | null>(null);
  const visiblePath = previewResidentPath ?? (selection?.type === "resident" ? currentResidentScenePath(view, selection.id, nowMs) : null);

  return (
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
          nowMs={nowMs}
          selected={selection?.type === "plot" && selection.id === plot.id}
          activeFieldTool={activeFieldTool}
          buildPlacement={buildPlacement}
          movingStructure={movingStructure}
          plantSweep={plantSweep}
          harvestSweep={harvestSweep}
          onHoverTile={setHoverTile}
          onSelect={onSelect}
          onPlaceNewStructure={onPlaceNewStructure}
          onPlaceStructure={onPlaceStructure}
          onStartPlantSweep={onStartPlantSweep}
          onEnterPlantSweepPlot={onEnterPlantSweepPlot}
          onStartHarvestSweep={onStartHarvestSweep}
          onEnterHarvestSweepPlot={onEnterHarvestSweepPlot}
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
        onPlaceNewStructure={onPlaceNewStructure}
        onPlaceStructure={onPlaceStructure}
      />
      <StructureMesh
        target={{ type: "silo" }}
        label="Silo"
        tile={view.silo_tile}
        footprint={structureFootprint("silo")}
        selected={selection?.type === "silo"}
        buildPlacement={buildPlacement}
        movingStructure={movingStructure}
        onHoverTile={setHoverTile}
        onSelect={() => onSelect({ type: "silo" })}
        onPlaceNewStructure={onPlaceNewStructure}
        onPlaceStructure={onPlaceStructure}
      />
      <StructureMesh
        target={{ type: "barn" }}
        label="Barn"
        tile={view.barn_tile}
        footprint={structureFootprint("barn")}
        selected={selection?.type === "barn"}
        buildPlacement={buildPlacement}
        movingStructure={movingStructure}
        onHoverTile={setHoverTile}
        onSelect={() => onSelect({ type: "barn" })}
        onPlaceNewStructure={onPlaceNewStructure}
        onPlaceStructure={onPlaceStructure}
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
          onPlaceNewStructure={onPlaceNewStructure}
          onPlaceStructure={onPlaceStructure}
        />
      ))}
      {view.shelters.map((shelter) => {
        const status = shelterProductionStatus(catalog, view, shelter, nowMs);
        return (
          <StructureMesh
            key={shelter.id}
            target={{ type: "shelter", id: shelter.id }}
            label={shelter.kind === "chicken_coop" ? "Chickens" : "Cows"}
            tile={shelter.tile}
            footprint={structureFootprint(shelter.kind)}
            productionStatus={status}
            selected={selection?.type === "shelter" && selection.id === shelter.id}
            buildPlacement={buildPlacement}
            movingStructure={movingStructure}
            onHoverTile={setHoverTile}
            onSelect={() => onSelect({ type: "shelter", id: shelter.id })}
            onPlaceNewStructure={onPlaceNewStructure}
            onPlaceStructure={onPlaceStructure}
          />
        );
      })}
      {view.delivery_board_built ? (
        <StructureMesh
          target={{ type: "delivery_board" }}
          label="Orders"
          tile={view.delivery_board_tile}
          footprint={structureFootprint("delivery_board")}
          selected={selection?.type === "delivery_board"}
          buildPlacement={buildPlacement}
          movingStructure={movingStructure}
          onHoverTile={setHoverTile}
          onSelect={() => onSelect({ type: "delivery_board" })}
          onPlaceNewStructure={onPlaceNewStructure}
          onPlaceStructure={onPlaceStructure}
        />
      ) : null}
      {view.tool_shed ? (
        <StructureMesh
          target={{ type: "tool_shed", id: view.tool_shed.id }}
          label="Tools"
          tile={view.tool_shed.tile}
          footprint={structureFootprint("tool_shed")}
          selected={selection?.type === "tool_shed" && selection.id === view.tool_shed.id}
          buildPlacement={buildPlacement}
          movingStructure={movingStructure}
          onHoverTile={setHoverTile}
          onSelect={() => onSelect({ type: "tool_shed", id: view.tool_shed.id })}
          onPlaceNewStructure={onPlaceNewStructure}
          onPlaceStructure={onPlaceStructure}
        />
      ) : null}
      {view.farm_shop ? (
        <StructureMesh
          target={{ type: "farm_shop", id: view.farm_shop.id }}
          label="Shop"
          tile={view.farm_shop.tile}
          footprint={structureFootprint("farm_shop")}
          selected={selection?.type === "farm_shop" && selection.id === view.farm_shop.id}
          buildPlacement={buildPlacement}
          movingStructure={movingStructure}
          onHoverTile={setHoverTile}
          onSelect={() => onSelect({ type: "farm_shop", id: view.farm_shop?.id ?? "" })}
          onPlaceNewStructure={onPlaceNewStructure}
          onPlaceStructure={onPlaceStructure}
        />
      ) : null}
      <ResidentPathOverlay path={visiblePath} />
      <FarmResidents catalog={catalog} view={view} nowMs={nowMs} selection={selection} onSelectResident={onSelectResident} />
      {movingStructure && hoverTile ? (
        <PlacementPreview tile={hoverTile} footprint={structureFootprintForSelection(view, movingStructure)} valid={isTileAvailableForStructure(view, hoverTile, movingStructure)} />
      ) : buildPlacement && hoverTile ? (
        <PlacementPreview
          tile={hoverTile}
          footprint={buildPlacement.kind === "field_plot" ? { width: 1, height: 1 } : structureFootprint(buildPlacement.kind)}
          valid={buildPlacement.kind === "field_plot" ? isTileAvailableForNewFieldPlot(view, hoverTile) : isTileAvailableForNewStructure(view, hoverTile, buildPlacement.kind)}
        />
      ) : null}
    </group>
  );
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
  onHoverTile(tile: Tile): void;
  onPlaceNewStructure(tile: Tile): void;
  onPlaceStructure(tile: Tile): void;
}) {
  const tiles = [];
  for (let x = 0; x < FARM_GRID_SIZE; x += 1) {
    for (let y = 0; y < FARM_GRID_SIZE; y += 1) {
      const tile = { x, y };
      const occupied = isTileOccupiedForPlacement(view, tile, movingStructure);
      tiles.push(
        <group key={`${x}-${y}`} position={[tileToWorld(x), -0.01, tileToWorld(y)]}>
          <FarmAsset
            kind="ground_tile"
            label=""
            footprint={{ width: 1, height: 1 }}
            state={{
              selected: false,
              blockedByPlacement: Boolean(movingStructure || buildPlacement) && occupied,
              movingTarget: Boolean(movingStructure || buildPlacement) && !occupied,
            }}
          />
          <mesh
            position={[0, 0.07, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (movingStructure) {
                onPlaceStructure(tile);
              } else if (buildPlacement) {
                onPlaceNewStructure(tile);
              }
            }}
            onPointerMove={() => {
              if (movingStructure || buildPlacement) {
                onHoverTile(tile);
              }
            }}
          >
            <planeGeometry args={[0.98, 0.98]} />
            <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
          </mesh>
        </group>,
      );
    }
  }
  return <>{tiles}</>;
}

function FieldMesh({
  plot,
  nowMs,
  selected,
  activeFieldTool,
  buildPlacement,
  movingStructure,
  plantSweep,
  harvestSweep,
  onHoverTile,
  onSelect,
  onPlaceNewStructure,
  onPlaceStructure,
  onStartPlantSweep,
  onEnterPlantSweepPlot,
  onStartHarvestSweep,
  onEnterHarvestSweepPlot,
}: {
  plot: FieldPlot;
  nowMs: number;
  selected: boolean;
  activeFieldTool: ActiveFieldTool;
  buildPlacement: BuildPlacementState;
  movingStructure: StructureSelection | null;
  plantSweep: PlantSweepState;
  harvestSweep: HarvestSweepState;
  onHoverTile(tile: Tile): void;
  onSelect(selection: Selection): void;
  onPlaceNewStructure(tile: Tile): void;
  onPlaceStructure(tile: Tile): void;
  onStartPlantSweep(plotId: string, pointerId: number): void;
  onEnterPlantSweepPlot(plotId: string): void;
  onStartHarvestSweep(plotId: string, pointerId: number): void;
  onEnterHarvestSweepPlot(plotId: string): void;
}) {
  const ready = Boolean(plot.crop && plot.crop.ready_at_ms <= nowMs);
  const sweptByPlant = plantSweep?.plotIds.includes(plot.id) ?? false;
  const sweptByHarvest = harvestSweep?.plotIds.includes(plot.id) ?? false;
  const pointerId = 1;

  const applyTool = () => {
    if (activeFieldTool.type === "plant") {
      if (plot.crop) {
        return;
      }
      if (plantSweep) {
        onEnterPlantSweepPlot(plot.id);
      } else {
        onStartPlantSweep(plot.id, pointerId);
      }
      return;
    }
    if (activeFieldTool.type === "harvest") {
      if (!plot.crop || !ready) {
        return;
      }
      if (harvestSweep) {
        onEnterHarvestSweepPlot(plot.id);
      } else {
        onStartHarvestSweep(plot.id, pointerId);
      }
    }
  };

  return (
    <group position={[tileToWorld(plot.tile.x), 0.02, tileToWorld(plot.tile.y)]}>
      <FarmAsset
        kind="field_plot"
        label=""
        footprint={{ width: 1, height: 1 }}
        state={{
          selected,
          blockedByPlacement: Boolean(buildPlacement || movingStructure),
          movingTarget: sweptByPlant || sweptByHarvest,
          cropItemId: plot.crop?.item_id,
          cropReady: ready,
        }}
      />
      <mesh
        position={[0, 0.24, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (buildPlacement) {
            onPlaceNewStructure(plot.tile);
            return;
          }
          if (movingStructure) {
            onPlaceStructure(plot.tile);
            return;
          }
          if (activeFieldTool.type !== "default") {
            applyTool();
            return;
          }
          onSelect({ type: "plot", id: plot.id });
        }}
        onPointerMove={() => {
          if (activeFieldTool.type === "plant" && plantSweep && !plot.crop) {
            onEnterPlantSweepPlot(plot.id);
          }
          if (activeFieldTool.type === "harvest" && harvestSweep && ready) {
            onEnterHarvestSweepPlot(plot.id);
          }
          if (movingStructure || buildPlacement) {
            onHoverTile(plot.tile);
          }
        }}
      >
        <planeGeometry args={[0.95, 0.95]} />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
      </mesh>
    </group>
  );
}

function StaticFarmHouse({
  catalog,
  view,
  nowMs,
  selected,
  buildPlacement,
  movingStructure,
  onSelect,
  onPlaceNewStructure,
  onPlaceStructure,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  selected: boolean;
  buildPlacement: BuildPlacementState;
  movingStructure: StructureSelection | null;
  onSelect(): void;
  onPlaceNewStructure(tile: Tile): void;
  onPlaceStructure(tile: Tile): void;
}) {
  const center = footprintCenter(FARM_HOUSE_TILE, FARM_HOUSE_FOOTPRINT);
  const productionStatus = ovenProductionStatus(catalog, view, nowMs);
  return (
    <group position={[tileToWorld(center.x), 0.015, tileToWorld(center.y)]}>
      <FarmAsset
        kind="farm_house"
        label="Farmhouse"
        footprint={FARM_HOUSE_FOOTPRINT}
        state={{ selected, blockedByPlacement: false, movingTarget: false, productionStatus }}
      />
      <mesh
        position={[0, 0.62, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (movingStructure) {
            onPlaceStructure(FARM_HOUSE_TILE);
          } else if (buildPlacement) {
            onPlaceNewStructure(FARM_HOUSE_TILE);
          } else {
            onSelect();
          }
        }}
      >
        <planeGeometry args={[2.2, 2.2]} />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
      </mesh>
    </group>
  );
}

function MachineMesh(props: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  machine: MachineState;
  selected: boolean;
  buildPlacement: BuildPlacementState;
  movingStructure: StructureSelection | null;
  onHoverTile(tile: Tile): void;
  onSelect(selection: Selection): void;
  onPlaceNewStructure(tile: Tile): void;
  onPlaceStructure(tile: Tile): void;
}) {
  const status = machineProductionStatus(props.catalog, props.view, props.machine, props.nowMs);
  return (
    <StructureMesh
      target={{ type: "machine", id: props.machine.id }}
      label="Feed Mill"
      tile={props.machine.tile}
      footprint={structureFootprint(props.machine.kind)}
      productionStatus={status}
      selected={props.selected}
      buildPlacement={props.buildPlacement}
      movingStructure={props.movingStructure}
      onHoverTile={props.onHoverTile}
      onSelect={() => props.onSelect({ type: "machine", id: props.machine.id })}
      onPlaceNewStructure={props.onPlaceNewStructure}
      onPlaceStructure={props.onPlaceStructure}
    />
  );
}

function StructureMesh({
  target,
  label,
  tile,
  footprint,
  productionStatus,
  selected,
  buildPlacement,
  movingStructure,
  onHoverTile,
  onSelect,
  onPlaceNewStructure,
  onPlaceStructure,
}: {
  target: StructureSelection;
  label: string;
  tile: Tile;
  footprint: StructureFootprint;
  productionStatus?: Parameters<typeof productionStatusLabel>[2];
  selected: boolean;
  buildPlacement: BuildPlacementState;
  movingStructure: StructureSelection | null;
  onHoverTile(tile: Tile): void;
  onSelect(): void;
  onPlaceNewStructure(tile: Tile): void;
  onPlaceStructure(tile: Tile): void;
}) {
  const center = footprintCenter(tile, footprint);
  const isMovingTarget = isSameStructure(movingStructure, target);
  return (
    <group position={[tileToWorld(center.x), 0.02, tileToWorld(center.y)]}>
      <FarmAsset
        kind={assetKindForTarget(target, label)}
        label={label}
        footprint={footprint}
        state={{
          selected,
          blockedByPlacement: buildPlacement !== null || (movingStructure !== null && !isMovingTarget),
          movingTarget: isMovingTarget,
          productionStatus,
        }}
      />
      <mesh
        position={[0, 0.45, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (movingStructure) {
            onPlaceStructure(tile);
          } else if (buildPlacement) {
            onPlaceNewStructure(tile);
          } else {
            onSelect();
          }
        }}
        onPointerMove={() => {
          if (movingStructure || buildPlacement) {
            onHoverTile(tile);
          }
        }}
      >
        <planeGeometry args={[Math.max(1, footprint.width), Math.max(1, footprint.height)]} />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
      </mesh>
    </group>
  );
}

function FarmResidents({
  catalog,
  view,
  nowMs,
  selection,
  onSelectResident,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  selection: Selection;
  onSelectResident(residentId: string): void;
}) {
  const residents = view.residents
    .slice(0, 2)
    .filter((resident) => !isResidentInsideHouse(view, resident.id, nowMs))
    .map((resident, index): FarmResidentPresentation => {
      const pose = currentResidentScenePose(view, resident.id, nowMs);
      const presentation = residentVisualPresentation(view, resident.id, nowMs);
      const work = residentWork(view, resident.id);
      const status = residentTaskStatus(catalog, view, resident.id, nowMs);
      const offset = residentVisualOffset(index, pose.state);
      return {
        id: resident.id,
        displayName: resident.display_name,
        variant: resident.id === "man" ? "man" : "woman",
        position: [tileToWorld(pose.tile.x) + offset[0], 0.16, tileToWorld(pose.tile.y) + offset[1]],
        state: pose.state,
        activity: presentation.activity,
        prop: presentation.prop,
        heldTool: presentation.heldTool,
        motion: presentation.motion,
        taskLabel: work?.current_step?.label ?? status.currentTask?.label ?? status.label,
        targetLabel: pose.label,
        selected: selection?.type === "resident" && selection.id === resident.id,
        blocked: pose.state === "blocked",
        animationPaused: false,
        facing: currentResidentFacing(view, resident.id, nowMs),
      };
    });
  return (
    <group>
      {residents.map((resident) => (
        <FarmResidentFigure key={resident.id} resident={resident} onSelect={() => onSelectResident(resident.id)} />
      ))}
    </group>
  );
}

function ResidentPathOverlay({ path }: { path: ResidentScenePath | null }) {
  const linePoints = useMemo(() => {
    if (!path) {
      return new Float32Array();
    }
    return new Float32Array(path.tiles.flatMap((tile) => [tileToWorld(tile.x), 0.13, tileToWorld(tile.y)]));
  }, [path]);
  if (!path || path.tiles.length < 2) {
    return null;
  }
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[linePoints, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={path.state === "walking" ? "#f0cb6b" : "#fff7d0"} transparent opacity={0.92} />
    </line>
  );
}

function PlacementPreview({ tile, footprint, valid }: { tile: Tile; footprint: StructureFootprint; valid: boolean }) {
  const center = footprintCenter(tile, footprint);
  return (
    <mesh position={[tileToWorld(center.x), 0.13, tileToWorld(center.y)]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[footprint.width - 0.04, footprint.height - 0.04]} />
      <meshBasicMaterial color={valid ? "#f7f0a3" : "#ff8b80"} transparent opacity={0.36} depthWrite={false} />
    </mesh>
  );
}

function residentVisualOffset(index: number, state: "idle" | "walking" | "working" | "blocked") {
  if (state === "walking") {
    return [0, 0] as const;
  }
  return index === 0 ? ([-0.12, 0.1] as const) : ([0.12, -0.1] as const);
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
  return "id" in left && "id" in right ? left.id === right.id : true;
}
