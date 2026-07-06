import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Eye,
  EyeOff,
  Grid2x2,
  Grid2x2X,
  House,
  RotateCcw,
  RotateCcwSquare,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type MutableRefObject } from "react";
import * as THREE from "three";
import {
  decorationPlacementStatus,
  type DecorationDefinition,
  type HouseInteriorRoom,
  type RoomTile,
} from "../game/houseInterior";
import { buildStructureMenuModel, type StructureMenuItem } from "../game/structureMenu";
import { ovenProductionStatus, productionStatusLabel } from "../game/structureStatus";
import { recipeName } from "../game/selectors";
import { isResidentInsideHouse, residentVisualCue } from "../game/residentTasks";
import type { CatalogDocument, FarmCommand, FarmView } from "../types";
import { ResidentModel } from "./farmScene/residents";

export type HouseRoomId = "living_room" | "kitchen" | "bedroom";
export type HouseInteriorMode = "overview" | "room";

type HouseRoomStyle = {
  id: HouseRoomId;
  label: string;
  floor: string;
  wall: string;
  accent: string;
};

type Props = {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  mode: HouseInteriorMode;
  selectedRoom: HouseRoomId;
  gridEnabled: boolean;
  selectedDecorationId: string | null;
  selectedPlacementId: string | null;
  onSelectRoom: (room: HouseRoomId) => void;
  onExitRoomToOverview: () => void;
  onSetGridEnabled: (enabled: boolean) => void;
  onSelectDecoration: (decorationId: string) => void;
  onSelectPlacement: (roomId: string, placementId: string) => void;
  onPlaceDecoration: (roomId: string, decorationId: string, tile: RoomTile) => void;
  onMoveDecoration: (roomId: string, placementId: string, tile: RoomTile) => void;
  onRemoveDecoration: (roomId: string, placementId: string) => void;
  onRenameResident: (residentId: string, displayName: string) => Promise<CommandResult>;
  onRunCommand: (command: FarmCommand) => Promise<CommandResult>;
  onBackToFarm: () => void;
};

type CommandResult = { accepted: boolean; error: string | null };

const decorationEditingUnlockLevel = 5;
const tileSize = 0.64;
const kitchenOvenTile: RoomTile = { x: 3, y: 0 };
const kitchenOvenFootprint = { width: 2, height: 1 };
const decorationColors: Record<string, string> = {
  bed: "#ead9cf",
  table: "#d7c48a",
  chair: "#9b6a43",
  sofa: "#4f8f62",
  rug: "#c89672",
  plant: "#5f8f62",
  cabinet: "#8a6742",
  lamp: "#f0cb6b",
  kitchen_counter: "#f2ead7",
};

export const houseRooms: HouseRoomStyle[] = [
  {
    id: "living_room",
    label: "Living Room",
    floor: "#d8b06a",
    wall: "#f1dfb6",
    accent: "#4f8f62",
  },
  {
    id: "kitchen",
    label: "Kitchen",
    floor: "#c8d0c4",
    wall: "#f6ead0",
    accent: "#5f8aa6",
  },
  {
    id: "bedroom",
    label: "Bedroom",
    floor: "#bca3be",
    wall: "#ead9cf",
    accent: "#936f9f",
  },
];

type HouseCameraFrame = {
  key: string;
  target: [number, number, number];
  position: [number, number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
};

type HouseCameraApi = {
  rotateLeft: () => void;
  rotateRight: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
};

type OrbitControlsRef = ComponentRef<typeof OrbitControls>;

const houseCameraFrames = {
  overview: {
    key: "overview",
    target: [0, 0.8, 0] as [number, number, number],
    position: [7.8, 7.6, 8.4] as [number, number, number],
    zoom: 46,
    minZoom: 30,
    maxZoom: 92,
  },
  room: {
    key: "room",
    target: [0, 0.45, 0] as [number, number, number],
    position: [7.8, 7.2, 7.8] as [number, number, number],
    zoom: 58,
    minZoom: 36,
    maxZoom: 110,
  },
} satisfies Record<HouseInteriorMode, HouseCameraFrame>;

export function HouseInteriorScene({
  catalog,
  view,
  nowMs,
  mode,
  selectedRoom,
  gridEnabled,
  selectedDecorationId,
  selectedPlacementId,
  onSelectRoom,
  onExitRoomToOverview,
  onSetGridEnabled,
  onSelectDecoration,
  onSelectPlacement,
  onPlaceDecoration,
  onMoveDecoration,
  onRemoveDecoration,
  onRenameResident,
  onRunCommand,
  onBackToFarm,
}: Props) {
  const [hoverTile, setHoverTile] = useState<RoomTile | null>(null);
  const [upperFloorVisible, setUpperFloorVisible] = useState(true);
  const cameraApiRef = useRef<HouseCameraApi | null>(null);
  const roomStyle = houseRooms.find((entry) => entry.id === selectedRoom) ?? houseRooms[0];
  const room =
    view.house_interior.rooms.find((entry) => entry.id === roomStyle.id) ??
    view.house_interior.rooms[0];
  const canEditDecorations = gridEnabled && view.level >= decorationEditingUnlockLevel;
  const selectedDecoration = selectedDecorationId
    ? catalog.decorations.find((entry) => entry.id === selectedDecorationId) ?? null
    : null;
  const selectedPlacement =
    selectedPlacementId !== null
      ? room.decoration_placements.find((entry) => entry.id === selectedPlacementId) ?? null
      : null;
  const selectedPlacementDecoration = selectedPlacement
    ? catalog.decorations.find((entry) => entry.id === selectedPlacement.decoration_id) ?? null
    : null;
  const activeDecoration = selectedDecoration ?? selectedPlacementDecoration;
  const preview =
    mode === "room" && canEditDecorations && activeDecoration && hoverTile
      ? {
          tile: hoverTile,
          decoration: activeDecoration,
          status: decorationPlacementStatus(catalog, room, activeDecoration.id, hoverTile, {
            ignorePlacementId: selectedPlacement?.id,
          }),
        }
      : null;
  const houseTitle = mode === "overview" ? "House Overview" : roomStyle.label;
  const cameraFrame = useMemo<HouseCameraFrame>(
    () =>
      mode === "overview"
        ? houseCameraFrames.overview
        : { ...houseCameraFrames.room, key: `room:${selectedRoom}` },
    [mode, selectedRoom],
  );
  const setCameraApi = useCallback((api: HouseCameraApi | null) => {
    cameraApiRef.current = api;
  }, []);
  const handlePlacementActivate = useCallback(
    (placement: HouseInteriorRoom["decoration_placements"][number]) => {
      if (selectedPlacementId && selectedPlacementId !== placement.id) {
        onMoveDecoration(room.id, selectedPlacementId, placement.tile);
        return;
      }
      onSelectPlacement(room.id, placement.id);
    },
    [onMoveDecoration, onSelectPlacement, room.id, selectedPlacementId],
  );

  return (
    <section className="house-interior" aria-label="House Interior">
      <Canvas
        className="house-interior__canvas"
        gl={{ preserveDrawingBuffer: true }}
        orthographic
        camera={{ position: cameraFrame.position, zoom: cameraFrame.zoom, near: 0.1, far: 100 }}
        shadows
        dpr={[1, 2]}
      >
        <color attach="background" args={["#8fc9c5"]} />
        <hemisphereLight args={["#fff6df", "#52665c", 1.4]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={2.1} castShadow />
        <HouseCameraController frame={cameraFrame} onReady={setCameraApi} />
        {mode === "overview" ? (
          <HouseOverviewSet
            upperFloorVisible={upperFloorVisible}
            onSelectRoom={onSelectRoom}
            onBackToFarm={onBackToFarm}
          />
        ) : (
          <RoomSet
            catalog={catalog}
            view={view}
            nowMs={nowMs}
            room={room}
            roomStyle={roomStyle}
            preview={preview}
            gridEnabled={gridEnabled}
            selectedDecoration={activeDecoration}
            selectedPlacementId={selectedPlacement?.id ?? null}
            canEditDecorations={canEditDecorations}
            onHoverTile={setHoverTile}
            onSelectPlacement={handlePlacementActivate}
            onPlaceDecoration={onPlaceDecoration}
            onMoveDecoration={onMoveDecoration}
            onExitRoomToOverview={onExitRoomToOverview}
          />
        )}
      </Canvas>
      <HouseCameraToolbar cameraApiRef={cameraApiRef} />
      <div className="house-interior__hud">
        <div className="house-interior__title">
          <span>Farmhouse</span>
          <h1>{houseTitle}</h1>
        </div>
        <div className="house-interior__actions">
          <button
            className="house-interior__grid-toggle"
            type="button"
            aria-pressed={gridEnabled}
            onClick={() => onSetGridEnabled(!gridEnabled)}
          >
            {gridEnabled ? <Grid2x2 aria-hidden="true" focusable="false" /> : <Grid2x2X aria-hidden="true" focusable="false" />}
            <span>Grid {gridEnabled ? "On" : "Off"}</span>
          </button>
          {mode === "overview" ? (
            <button
              className="house-interior__floor-toggle"
              type="button"
              aria-pressed={upperFloorVisible}
              onClick={() => setUpperFloorVisible((visible) => !visible)}
            >
              {upperFloorVisible ? <EyeOff aria-hidden="true" focusable="false" /> : <Eye aria-hidden="true" focusable="false" />}
              <span>{upperFloorVisible ? "Hide upper floor" : "Show upper floor"}</span>
            </button>
          ) : null}
          <button className="house-interior__back" type="button" onClick={onBackToFarm}>
            <House aria-hidden="true" focusable="false" />
            <span>Back to Farm</span>
          </button>
        </div>
      </div>
      {mode === "room" && room.id === "bedroom" ? (
        <FamilyTreePanel view={view} onRenameResident={onRenameResident} />
      ) : null}
      {mode === "room" && room.id === "kitchen" ? (
        <OvenWorkstationPanel
          catalog={catalog}
          view={view}
          nowMs={nowMs}
          onRunCommand={onRunCommand}
        />
      ) : null}
      {mode === "room" ? (
        <DecorationCatalogTray
          catalog={catalog}
          preview={preview}
          gridEnabled={gridEnabled}
          selectedDecorationId={selectedDecorationId}
          selectedPlacement={selectedPlacement}
          selectedPlacementDecoration={selectedPlacementDecoration}
          canEditDecorations={canEditDecorations}
          room={room}
          activeDecoration={activeDecoration}
          selectedPlacementId={selectedPlacement?.id ?? null}
          onPlaceDecoration={onPlaceDecoration}
          onMoveDecoration={onMoveDecoration}
          onSelectDecoration={onSelectDecoration}
          onRemoveDecoration={() => {
            if (selectedPlacement) {
              onRemoveDecoration(room.id, selectedPlacement.id);
            }
          }}
        />
      ) : null}
    </section>
  );
}

function HouseCameraController({
  frame,
  onReady,
}: {
  frame: HouseCameraFrame;
  onReady: (api: HouseCameraApi | null) => void;
}) {
  const { camera, invalidate } = useThree();
  const controlsRef = useRef<OrbitControlsRef | null>(null);

  const reset = useCallback(() => {
    applyHouseCameraFrame(camera, controlsRef.current, frame);
    invalidate();
  }, [camera, frame, invalidate]);

  const rotate = useCallback(
    (radians: number) => {
      if (!(camera instanceof THREE.OrthographicCamera)) {
        return;
      }
      const target = controlsRef.current?.target ?? new THREE.Vector3(...frame.target);
      const offset = camera.position.clone().sub(target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
      camera.position.copy(target).add(offset);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      controlsRef.current?.update();
      invalidate();
    },
    [camera, frame.target, invalidate],
  );

  const zoom = useCallback(
    (factor: number) => {
      if (!(camera instanceof THREE.OrthographicCamera)) {
        return;
      }
      camera.zoom = clamp(camera.zoom * factor, frame.minZoom, frame.maxZoom);
      camera.updateProjectionMatrix();
      controlsRef.current?.update();
      invalidate();
    },
    [camera, frame.maxZoom, frame.minZoom, invalidate],
  );

  useEffect(() => {
    reset();
  }, [frame.key, reset]);

  useEffect(() => {
    const api: HouseCameraApi = {
      rotateLeft: () => rotate(Math.PI / 8),
      rotateRight: () => rotate(-Math.PI / 8),
      zoomIn: () => zoom(1.16),
      zoomOut: () => zoom(1 / 1.16),
      reset,
    };
    onReady(api);
    return () => onReady(null);
  }, [onReady, reset, rotate, zoom]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableRotate
      enablePan={false}
      enableZoom
      minZoom={frame.minZoom}
      maxZoom={frame.maxZoom}
      minPolarAngle={0.58}
      maxPolarAngle={1.08}
      target={frame.target}
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
    />
  );
}

function applyHouseCameraFrame(
  camera: THREE.Camera,
  controls: OrbitControlsRef | null,
  frame: HouseCameraFrame,
) {
  if (!(camera instanceof THREE.OrthographicCamera)) {
    return;
  }
  camera.position.set(...frame.position);
  camera.zoom = frame.zoom;
  camera.lookAt(...frame.target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  controls?.target.set(...frame.target);
  controls?.update();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function HouseCameraToolbar({ cameraApiRef }: { cameraApiRef: MutableRefObject<HouseCameraApi | null> }) {
  return (
    <div className="house-camera-controls" aria-label="House camera controls">
      <button type="button" aria-label="Rotate camera left" onClick={() => cameraApiRef.current?.rotateLeft()}>
        <RotateCcw aria-hidden="true" focusable="false" />
      </button>
      <button type="button" aria-label="Rotate camera right" onClick={() => cameraApiRef.current?.rotateRight()}>
        <RotateCw aria-hidden="true" focusable="false" />
      </button>
      <button type="button" aria-label="Zoom camera in" onClick={() => cameraApiRef.current?.zoomIn()}>
        <ZoomIn aria-hidden="true" focusable="false" />
      </button>
      <button type="button" aria-label="Zoom camera out" onClick={() => cameraApiRef.current?.zoomOut()}>
        <ZoomOut aria-hidden="true" focusable="false" />
      </button>
      <button type="button" aria-label="Reset camera" onClick={() => cameraApiRef.current?.reset()}>
        <RotateCcwSquare aria-hidden="true" focusable="false" />
      </button>
    </div>
  );
}

function FamilyTreePanel({
  view,
  onRenameResident,
}: {
  view: FarmView;
  onRenameResident: (residentId: string, displayName: string) => Promise<CommandResult>;
}) {
  return (
    <section className="family-tree-panel" aria-label="Family Tree">
      <div className="family-tree-panel__header">
        <span>Bedroom</span>
        <strong>Family Tree</strong>
      </div>
      <div className="family-tree-panel__residents">
        {view.residents.slice(0, 2).map((resident) => (
          <FamilyTreeResidentEditor
            key={resident.id}
            resident={resident}
            selected={resident.id === view.selected_resident_id}
            onRenameResident={onRenameResident}
          />
        ))}
      </div>
    </section>
  );
}

function FamilyTreeResidentEditor({
  resident,
  selected,
  onRenameResident,
}: {
  resident: FarmView["residents"][number];
  selected: boolean;
  onRenameResident: (residentId: string, displayName: string) => Promise<CommandResult>;
}) {
  const [draftName, setDraftName] = useState(resident.display_name);
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    setDraftName(resident.display_name);
    setRenameError(null);
  }, [resident.display_name]);

  const submitRename = async () => {
    const trimmed = draftName.trim();
    if (trimmed === resident.display_name) {
      setDraftName(resident.display_name);
      setRenameError(null);
      return;
    }
    const result = await onRenameResident(resident.id, trimmed);
    if (!result.accepted) {
      setDraftName(resident.display_name);
      setRenameError(result.error ?? "Rename rejected");
      return;
    }
    setRenameError(null);
  };

  return (
    <article className={selected ? "family-tree-resident family-tree-resident--selected" : "family-tree-resident"}>
      <div className="family-tree-resident__topline">
        <strong>{resident.display_name}</strong>
        <span>{selected ? "Selected for work" : "Farm Resident"}</span>
      </div>
      <label className="family-tree-resident__name">
        <span>Display name</span>
        <input
          aria-label={`${resident.display_name} display name`}
          value={draftName}
          onChange={(event) => {
            setDraftName(event.target.value);
            setRenameError(null);
          }}
          onBlur={() => {
            void submitRename();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setDraftName(resident.display_name);
              setRenameError(null);
              event.currentTarget.blur();
            }
          }}
        />
      </label>
      <button
        type="button"
        className="family-tree-resident__rename"
        disabled={draftName.trim() === resident.display_name}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          void submitRename();
        }}
      >
        Rename
      </button>
      {renameError ? <small className="family-tree-resident__error">{renameError}</small> : null}
    </article>
  );
}

function HouseOverviewSet({
  upperFloorVisible,
  onSelectRoom,
  onBackToFarm,
}: {
  upperFloorVisible: boolean;
  onSelectRoom: (room: HouseRoomId) => void;
  onBackToFarm: () => void;
}) {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8.2, 6.4]} />
        <meshStandardMaterial color="#6d8b72" roughness={1} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.04, -0.35]}>
        <boxGeometry args={[6.4, 0.16, 4.7]} />
        <meshStandardMaterial color="#d8cfb3" roughness={0.88} />
      </mesh>
      <OverviewRoomBlock position={[-1.62, 0.16, -0.95]} size={[2.75, 0.24, 2.25]} color="#d8b06a" wall="#f1dfb6" />
      <OverviewRoomBlock position={[1.46, 0.16, -0.95]} size={[2.75, 0.24, 2.25]} color="#c8d0c4" wall="#f6ead0" />
      <StairRun />
      <mesh castShadow receiveShadow position={[-0.62, 1.12, 1.48]}>
        <boxGeometry args={[1.34, 0.16, 0.9]} />
        <meshStandardMaterial color="#d8cfb3" roughness={0.88} />
      </mesh>
      {upperFloorVisible ? (
        <>
          <mesh castShadow receiveShadow position={[0.72, 1.12, 1.28]}>
            <boxGeometry args={[4.72, 0.18, 1.82]} />
            <meshStandardMaterial color="#d8cfb3" roughness={0.88} />
          </mesh>
          <Html position={[0.72, 1.36, 1.28]} center wrapperClass="farm-scene-marker-wrapper">
            <div
              className="farm-scene-marker"
              data-testid="house-overview-second-floor"
              aria-label="House Overview second floor"
            />
          </Html>
          <OverviewRoomBlock position={[0.72, 1.26, 1.28]} size={[4.38, 0.24, 1.48]} color="#bca3be" wall="#ead9cf" />
        </>
      ) : null}
      <mesh castShadow receiveShadow position={[0, 0.96, -2.72]}>
        <boxGeometry args={[6.4, 1.55, 0.18]} />
        <meshStandardMaterial color="#eadfcb" roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[-3.3, 0.62, -0.35]}>
        <boxGeometry args={[0.18, 1.24, 4.72]} />
        <meshStandardMaterial color="#eadfcb" roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[3.3, 0.62, -0.35]}>
        <boxGeometry args={[0.18, 1.24, 4.72]} />
        <meshStandardMaterial color="#eadfcb" roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.62, 2.05]}>
        <boxGeometry args={[6.4, 1.24, 0.18]} />
        <meshStandardMaterial color="#b98762" roughness={0.9} />
      </mesh>
      <HouseDoor
        label="Living Room"
        ariaLabel="Enter Living Room"
        testId="house-door-living-room"
        position={[-1.62, 0.48, 0.28]}
        rotation={[0, 0, 0]}
        labelOffset={[-0.42, 0.74, 0.1]}
        labelScreenOffset={[-108, 18]}
        color="#7d5a3e"
        onActivate={() => onSelectRoom("living_room")}
      />
      <HouseDoor
        label="Kitchen"
        ariaLabel="Enter Kitchen"
        testId="house-door-kitchen"
        position={[1.46, 0.48, 0.28]}
        rotation={[0, 0, 0]}
        labelOffset={[0.36, 0.74, 0.1]}
        labelScreenOffset={[98, 18]}
        color="#516979"
        onActivate={() => onSelectRoom("kitchen")}
      />
      {upperFloorVisible ? (
        <>
          <HouseDoor
            label="Bedroom"
            ariaLabel="Enter Bedroom"
            testId="house-door-bedroom"
            position={[0.72, 1.72, 2.08]}
            rotation={[0, 0, 0]}
            labelOffset={[0.18, 0.86, 0.1]}
            labelScreenOffset={[0, -58]}
            color="#795f86"
            onActivate={() => onSelectRoom("bedroom")}
          />
          <Html position={[0.72, 2.08, 1.45]} center wrapperClass="farm-scene-marker-wrapper">
            <div
              className="farm-scene-marker"
              data-testid="house-overview-bedroom-upstairs"
              aria-label="Bedroom upstairs"
            />
          </Html>
        </>
      ) : null}
      <HouseDoor
        label="Front Door"
        ariaLabel="Exit Farmhouse to Farm"
        testId="house-door-front"
        position={[0, 0.48, 2.18]}
        rotation={[0, 0, 0]}
        labelOffset={[0, 0.78, 0.1]}
        labelScreenOffset={[0, 64]}
        color="#7c5638"
        onActivate={onBackToFarm}
      />
      <Html position={[0, 1.25, 0]} center wrapperClass="farm-scene-marker-wrapper">
        <div className="farm-scene-marker" data-testid="house-overview" aria-label="House Overview" />
      </Html>
    </group>
  );
}

function StairRun() {
  return (
    <group position={[-2.35, 0.2, 0.6]} rotation={[0, -0.1, 0]}>
      {Array.from({ length: 8 }, (_, index) => (
        <mesh
          key={index}
          castShadow
          receiveShadow
          position={[index * 0.24, index * 0.13, index * 0.14]}
        >
          <boxGeometry args={[0.78, 0.12, 0.34]} />
          <meshStandardMaterial color="#b98762" roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
}

function OverviewRoomBlock({
  position,
  size,
  color,
  wall,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  wall: string;
}) {
  return (
    <group position={position}>
      <mesh receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.86} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.42, -size[2] / 2]}>
        <boxGeometry args={[size[0], 0.72, 0.12]} />
        <meshStandardMaterial color={wall} roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[-size[0] / 2, 0.32, 0]}>
        <boxGeometry args={[0.12, 0.64, size[2]]} />
        <meshStandardMaterial color={wall} roughness={0.9} />
      </mesh>
    </group>
  );
}

function HouseDoor({
  label,
  ariaLabel,
  testId,
  position,
  rotation,
  labelOffset = [0, 0.75, 0.1],
  labelScreenOffset = [0, 0],
  color,
  onActivate,
}: {
  label: string;
  ariaLabel: string;
  testId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  labelOffset?: [number, number, number];
  labelScreenOffset?: [number, number];
  color: string;
  onActivate: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <group position={position} rotation={rotation}>
      <mesh
        castShadow
        receiveShadow
        onPointerEnter={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
        onClick={(event) => {
          event.stopPropagation();
          onActivate();
        }}
      >
        <boxGeometry args={[0.62, 0.86, 0.12]} />
        <meshStandardMaterial color={hovered ? "#fff7d0" : color} roughness={0.68} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.2, 0.02, 0.07]}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshStandardMaterial color="#f0cb6b" roughness={0.42} />
      </mesh>
      <Html position={labelOffset} center wrapperClass="house-door-label-wrapper">
        <button
          type="button"
          className="house-door-label"
          aria-label={ariaLabel}
          data-testid={testId}
          style={{ transform: `translate(${labelScreenOffset[0]}px, ${labelScreenOffset[1]}px)` }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onActivate();
          }}
        >
          {label}
        </button>
      </Html>
    </group>
  );
}

function RoomSet({
  catalog,
  view,
  nowMs,
  room,
  roomStyle,
  preview,
  gridEnabled,
  selectedDecoration,
  selectedPlacementId,
  canEditDecorations,
  onHoverTile,
  onSelectPlacement,
  onPlaceDecoration,
  onMoveDecoration,
  onExitRoomToOverview,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  room: HouseInteriorRoom;
  roomStyle: HouseRoomStyle;
  preview: { tile: RoomTile; decoration: DecorationDefinition; status: ReturnType<typeof decorationPlacementStatus> } | null;
  gridEnabled: boolean;
  selectedDecoration: DecorationDefinition | null;
  selectedPlacementId: string | null;
  canEditDecorations: boolean;
  onHoverTile: (tile: RoomTile | null) => void;
  onSelectPlacement: (placement: HouseInteriorRoom["decoration_placements"][number]) => void;
  onPlaceDecoration: (roomId: string, decorationId: string, tile: RoomTile) => void;
  onMoveDecoration: (roomId: string, placementId: string, tile: RoomTile) => void;
  onExitRoomToOverview: () => void;
}) {
  const floorHeight = room.height * tileSize;
  return (
    <group>
      <mesh receiveShadow position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.2, 7.2]} />
        <meshStandardMaterial color="#6d8b72" roughness={1} />
      </mesh>
      <RoomShell room={room} roomStyle={roomStyle} gridEnabled={gridEnabled} />
      <HouseDoor
        label="Door"
        ariaLabel={`Exit ${roomStyle.label} to House Overview`}
        testId={`house-door-exit-${room.id}`}
        position={[0, 0.46, floorHeight / 2 + 0.22]}
        rotation={[0, 0, 0]}
        color="#7c5638"
        onActivate={onExitRoomToOverview}
      />
      {room.id === "kitchen" ? <OvenWorkstationObject room={room} owned={view.owned_farmhouse_upgrades.includes("oven")} /> : null}
      {room.id === "kitchen" ? <InteriorOvenResidents view={view} nowMs={nowMs} room={room} /> : null}
      <RoomFloorTileTargets
        room={room}
        selectedDecoration={selectedDecoration}
        selectedPlacementId={selectedPlacementId}
        canEditDecorations={canEditDecorations}
        gridEnabled={gridEnabled}
        onHoverTile={onHoverTile}
        onPlaceDecoration={onPlaceDecoration}
        onMoveDecoration={onMoveDecoration}
      />
      {room.decoration_placements.map((placement) => {
        const decoration = catalog.decorations.find((entry) => entry.id === placement.decoration_id);
        const placementInteractive = selectedPlacementId === null || placement.id === selectedPlacementId;
        return decoration ? (
          <DecorationObject
            key={placement.id}
            room={room}
            decoration={decoration}
            tile={placement.tile}
            opacity={1}
            selected={placement.id === selectedPlacementId}
            ariaLabel={`${decoration.name} placement at Room Tile ${placement.tile.x},${placement.tile.y}`}
            onActivate={placementInteractive ? () => onSelectPlacement(placement) : undefined}
          />
        ) : null;
      })}
      {preview ? (
        <DecorationObject
          room={room}
          decoration={preview.decoration}
          tile={preview.tile}
          opacity={0.62}
          invalid={!preview.status.fits}
          selected={false}
        />
      ) : null}
      <Html position={[0, 1.1, 0]} center wrapperClass="farm-scene-marker-wrapper">
        <div
          className="farm-scene-marker"
          data-testid={`house-room-${room.id}`}
          aria-label={`${roomStyle.label} room`}
        />
      </Html>
    </group>
  );
}

function RoomShell({
  room,
  roomStyle,
  gridEnabled,
}: {
  room: HouseInteriorRoom;
  roomStyle: HouseRoomStyle;
  gridEnabled: boolean;
}) {
  const floorWidth = room.width * tileSize;
  const floorHeight = room.height * tileSize;
  return (
    <group>
      <mesh receiveShadow position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[floorWidth, floorHeight]} />
        <meshStandardMaterial color={roomStyle.floor} roughness={0.86} />
      </mesh>
      {gridEnabled
        ? Array.from({ length: room.width + 1 }, (_, index) => index).map((index) => (
            <mesh
              key={`floor-x-${index}`}
              position={[(index - room.width / 2) * tileSize, 0.012, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[0.026, floorHeight]} />
              <meshBasicMaterial color="#fff7d0" transparent opacity={0.2} depthWrite={false} />
            </mesh>
          ))
        : null}
      {gridEnabled
        ? Array.from({ length: room.height + 1 }, (_, index) => index).map((index) => (
            <mesh
              key={`floor-z-${index}`}
              position={[0, 0.014, (index - room.height / 2) * tileSize]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[floorWidth, 0.026]} />
              <meshBasicMaterial color="#20312b" transparent opacity={0.08} depthWrite={false} />
            </mesh>
          ))
        : null}
      <mesh castShadow receiveShadow position={[0, 0.9, -floorHeight / 2 - 0.14]}>
        <boxGeometry args={[floorWidth + 0.28, 1.8, 0.22]} />
        <meshStandardMaterial color={roomStyle.wall} roughness={0.92} />
      </mesh>
      <mesh castShadow receiveShadow position={[-floorWidth / 2 - 0.14, 0.9, 0]}>
        <boxGeometry args={[0.22, 1.8, floorHeight + 0.28]} />
        <meshStandardMaterial color={roomStyle.wall} roughness={0.92} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.12, floorHeight / 2 + 0.16]}>
        <boxGeometry args={[floorWidth + 0.28, 0.24, 0.24]} />
        <meshStandardMaterial color="#8a6742" roughness={0.82} />
      </mesh>
      <mesh castShadow receiveShadow position={[floorWidth / 2 + 0.16, 0.12, 0]}>
        <boxGeometry args={[0.24, 0.24, floorHeight + 0.28]} />
        <meshStandardMaterial color="#8a6742" roughness={0.82} />
      </mesh>
    </group>
  );
}

function OvenWorkstationObject({
  room,
  owned,
}: {
  room: HouseInteriorRoom;
  owned: boolean;
}) {
  const x = (kitchenOvenTile.x + kitchenOvenFootprint.width / 2 - room.width / 2) * tileSize;
  const z = (kitchenOvenTile.y + kitchenOvenFootprint.height / 2 - room.height / 2) * tileSize;
  return (
    <group position={[x, 0.16, z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[kitchenOvenFootprint.width * tileSize - 0.08, 0.32, kitchenOvenFootprint.height * tileSize - 0.08]} />
        <meshStandardMaterial color={owned ? "#536a5e" : "#9aa39b"} roughness={0.76} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.28, -0.08]}>
        <boxGeometry args={[0.58, 0.3, 0.12]} />
        <meshStandardMaterial color={owned ? "#2f3d38" : "#747d76"} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.36, 0.22]}>
        <boxGeometry args={[0.42, 0.035, 0.08]} />
        <meshStandardMaterial color={owned ? "#f0cb6b" : "#d3d0c2"} emissive={owned ? "#8f6121" : "#000000"} emissiveIntensity={owned ? 0.22 : 0} />
      </mesh>
      <Html position={[0, 0.68, 0]} center wrapperClass="farm-scene-marker-wrapper">
        <div
          className="farm-scene-marker"
          data-testid="house-kitchen-oven"
          aria-label={owned ? "Kitchen Oven Workstation" : "Locked Kitchen Oven Workstation"}
        />
      </Html>
    </group>
  );
}

function InteriorOvenResidents({ view, nowMs, room }: { view: FarmView; nowMs: number; room: HouseInteriorRoom }) {
  const residentsAtOven = view.residents.filter((resident) =>
    isResidentInsideHouse(view, resident.id, nowMs),
  );
  if (residentsAtOven.length === 0) {
    return null;
  }
  const baseX = (kitchenOvenTile.x + kitchenOvenFootprint.width / 2 - room.width / 2) * tileSize;
  const baseZ = (kitchenOvenTile.y + kitchenOvenFootprint.height + 0.4 - room.height / 2) * tileSize;
  return (
    <group>
      {residentsAtOven.map((resident, index) => {
        const visualCue = residentVisualCue(view, resident.id, nowMs);
        return (
          <group
            key={resident.id}
            position={[baseX + (index - (residentsAtOven.length - 1) / 2) * 0.34, 0.1, baseZ]}
          >
            <ResidentModel
              variant={resident.id === "man" ? "man" : "woman"}
              activity={visualCue.activity}
              prop={visualCue.prop}
              compact
            />
            <Html position={[0, 0.52, 0]} center wrapperClass="farm-scene-marker-wrapper">
              <div
                className="farm-scene-marker"
                data-testid={`house-resident-${resident.id}`}
                data-resident-activity={visualCue.activity}
                data-resident-prop={visualCue.prop}
                aria-label={`${resident.display_name} at Kitchen Oven`}
              />
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function RoomFloorTileTargets({
  room,
  selectedDecoration,
  selectedPlacementId,
  canEditDecorations,
  gridEnabled,
  onHoverTile,
  onPlaceDecoration,
  onMoveDecoration,
}: {
  room: HouseInteriorRoom;
  selectedDecoration: DecorationDefinition | null;
  selectedPlacementId: string | null;
  canEditDecorations: boolean;
  gridEnabled: boolean;
  onHoverTile: (tile: RoomTile | null) => void;
  onPlaceDecoration: (roomId: string, decorationId: string, tile: RoomTile) => void;
  onMoveDecoration: (roomId: string, placementId: string, tile: RoomTile) => void;
}) {
  const tiles = useMemo(
    () =>
      Array.from({ length: room.width * room.height }, (_, index) => ({
        x: index % room.width,
        y: Math.floor(index / room.width),
      })),
    [room.height, room.width],
  );
  const actionEnabled = gridEnabled && canEditDecorations && (Boolean(selectedDecoration) || Boolean(selectedPlacementId));

  if (!gridEnabled) {
    return null;
  }

  return (
    <group>
      {tiles.map((tile) => {
        const x = (tile.x + 0.5 - room.width / 2) * tileSize;
        const z = (tile.y + 0.5 - room.height / 2) * tileSize;
        const activate = () => {
          if (!actionEnabled) {
            return;
          }
          if (selectedPlacementId) {
            onMoveDecoration(room.id, selectedPlacementId, tile);
            return;
          }
          if (selectedDecoration) {
            onPlaceDecoration(room.id, selectedDecoration.id, tile);
          }
        };
        return (
          <group key={`${tile.x},${tile.y}`} position={[x, 0.026, z]}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              onPointerEnter={(event) => {
                event.stopPropagation();
                onHoverTile(tile);
              }}
              onPointerLeave={() => onHoverTile(null)}
              onClick={(event) => {
                event.stopPropagation();
                activate();
              }}
            >
              <planeGeometry args={[tileSize * 0.92, tileSize * 0.92]} />
              <meshBasicMaterial
                color={actionEnabled ? "#fff7d0" : "#20312b"}
                transparent
                opacity={actionEnabled ? 0.08 : 0.02}
                depthWrite={false}
              />
            </mesh>
            <Html
              position={[0, 0.04, 0]}
              center
              wrapperClass="house-room-tile-marker-wrapper"
              zIndexRange={actionEnabled ? [80, 40] : [10, 0]}
            >
              <button
                type="button"
                className="house-room-tile-marker"
                aria-label={`Room Tile ${tile.x},${tile.y}`}
                disabled={!actionEnabled}
                style={{ pointerEvents: actionEnabled ? "auto" : "none" }}
                onPointerEnter={() => onHoverTile(tile)}
                onFocus={() => onHoverTile(tile)}
                onPointerLeave={() => onHoverTile(null)}
                onBlur={() => onHoverTile(null)}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  activate();
                }}
              />
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function DecorationObject({
  room,
  decoration,
  tile,
  opacity,
  invalid = false,
  selected = false,
  ariaLabel,
  onActivate,
}: {
  room: HouseInteriorRoom;
  decoration: DecorationDefinition;
  tile: RoomTile;
  opacity: number;
  invalid?: boolean;
  selected?: boolean;
  ariaLabel?: string;
  onActivate?: () => void;
}) {
  const width = decoration.footprint.width * tileSize;
  const height = decoration.footprint.height * tileSize;
  const x = (tile.x + decoration.footprint.width / 2 - room.width / 2) * tileSize;
  const z = (tile.y + decoration.footprint.height / 2 - room.height / 2) * tileSize;
  const color = invalid ? "#b8463d" : decorationColors[decoration.id] ?? "#d7c48a";
  return (
    <group position={[x, 0.12, z]}>
      <mesh
        castShadow
        receiveShadow
        onClick={
          onActivate
            ? (event) => {
                event.stopPropagation();
                onActivate();
              }
            : undefined
        }
      >
        <boxGeometry args={[Math.max(0.18, width - 0.08), 0.24, Math.max(0.18, height - 0.08)]} />
        <meshStandardMaterial color={color} roughness={0.78} transparent opacity={opacity} />
      </mesh>
      {selected ? (
        <mesh position={[0, 0.135, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[Math.max(0.24, width), Math.max(0.24, height)]} />
          <meshBasicMaterial color="#fff7d0" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      ) : null}
      {ariaLabel && onActivate ? (
        <Html position={[0, 0.26, 0]} center wrapperClass="house-placement-marker-wrapper" zIndexRange={[30, 10]}>
          <button
            type="button"
            className={selected ? "house-placement-marker house-placement-marker--selected" : "house-placement-marker"}
            aria-label={ariaLabel}
            aria-pressed={selected}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onActivate();
            }}
          />
        </Html>
      ) : null}
    </group>
  );
}

function OvenWorkstationPanel({
  catalog,
  view,
  nowMs,
  onRunCommand,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  onRunCommand: (command: FarmCommand) => Promise<CommandResult>;
}) {
  const model = buildStructureMenuModel(catalog, view, { type: "farmhouse" }, nowMs);
  const owned = view.owned_farmhouse_upgrades.includes("oven");
  const firstJob = view.oven.queue[0] ?? null;
  const firstRecipeName = firstJob ? recipeName(catalog, firstJob.recipe_id) : null;
  const status = ovenProductionStatus(catalog, view, nowMs);
  const statusText =
    firstJob?.status === "pending_start"
      ? `Starting ${firstRecipeName}`
      : productionStatusLabel("Kitchen Oven", catalog, status) ?? (owned ? "Oven queue empty" : "Oven not owned");
  const items = model?.items ?? [];

  return (
    <section className="oven-workstation-panel" aria-label="Kitchen Oven Workstation">
      <div className="oven-workstation-panel__header">
        <span>Kitchen</span>
        <strong>Oven Workstation</strong>
      </div>
      <p data-testid="kitchen-oven-status">{statusText}</p>
      <div className="oven-workstation-panel__items">
        {items.map((item) => (
          <OvenWorkstationButton key={item.id} item={item} onRunCommand={onRunCommand} />
        ))}
      </div>
    </section>
  );
}

function OvenWorkstationButton({
  item,
  onRunCommand,
}: {
  item: StructureMenuItem;
  onRunCommand: (command: FarmCommand) => Promise<CommandResult>;
}) {
  const label = item.reason ? `${item.label} - ${item.reason}` : item.label;
  return (
    <button
      type="button"
      className="oven-workstation-panel__item"
      disabled={item.disabled || !item.command}
      onClick={() => {
        if (item.command) {
          void onRunCommand(item.command);
        }
      }}
    >
      <span>{label}</span>
    </button>
  );
}

function DecorationCatalogTray({
  catalog,
  preview,
  gridEnabled,
  selectedDecorationId,
  selectedPlacement,
  selectedPlacementDecoration,
  canEditDecorations,
  room,
  activeDecoration,
  selectedPlacementId,
  onPlaceDecoration,
  onMoveDecoration,
  onSelectDecoration,
  onRemoveDecoration,
}: {
  catalog: CatalogDocument;
  preview: { tile: RoomTile; status: ReturnType<typeof decorationPlacementStatus> } | null;
  gridEnabled: boolean;
  selectedDecorationId: string | null;
  selectedPlacement: HouseInteriorRoom["decoration_placements"][number] | null;
  selectedPlacementDecoration: DecorationDefinition | null;
  canEditDecorations: boolean;
  room: HouseInteriorRoom;
  activeDecoration: DecorationDefinition | null;
  selectedPlacementId: string | null;
  onPlaceDecoration: (roomId: string, decorationId: string, tile: RoomTile) => void;
  onMoveDecoration: (roomId: string, placementId: string, tile: RoomTile) => void;
  onSelectDecoration: (decorationId: string) => void;
  onRemoveDecoration: () => void;
}) {
  const statusText = placementStatusText(
    gridEnabled,
    canEditDecorations,
    preview,
    selectedPlacement,
    selectedPlacementDecoration,
  );
  return (
    <section className="decoration-dock" aria-label="Decoration catalog">
      <div className="decoration-dock__status" data-testid="decoration-placement-status">
        {statusText}
        {selectedPlacement && selectedPlacementDecoration ? (
          <button type="button" className="decoration-dock__remove" onClick={onRemoveDecoration}>
            Remove {selectedPlacementDecoration.name}
          </button>
        ) : null}
      </div>
      <RoomTileCoordinateControls
        catalog={catalog}
        room={room}
        activeDecoration={activeDecoration}
        selectedPlacementId={selectedPlacementId}
        gridEnabled={gridEnabled}
        canEditDecorations={canEditDecorations}
        onPlaceDecoration={onPlaceDecoration}
        onMoveDecoration={onMoveDecoration}
      />
      <nav className="decoration-tray" aria-label="Decorations">
        {catalog.decorations.map((decoration) => (
          <button
            key={decoration.id}
            type="button"
            className={
              decoration.id === selectedDecorationId
                ? "decoration-card decoration-card--selected"
                : "decoration-card"
            }
            disabled={!gridEnabled || !canEditDecorations}
            aria-pressed={decoration.id === selectedDecorationId}
            onClick={() => onSelectDecoration(decoration.id)}
          >
            <span className="decoration-card__swatch" style={{ background: decorationColors[decoration.id] }} />
            <span>{decoration.name}</span>
            <small>
              {decoration.footprint.width}x{decoration.footprint.height}
            </small>
          </button>
        ))}
      </nav>
    </section>
  );
}

function RoomTileCoordinateControls({
  catalog,
  room,
  activeDecoration,
  selectedPlacementId,
  gridEnabled,
  canEditDecorations,
  onPlaceDecoration,
  onMoveDecoration,
}: {
  catalog: CatalogDocument;
  room: HouseInteriorRoom;
  activeDecoration: DecorationDefinition | null;
  selectedPlacementId: string | null;
  gridEnabled: boolean;
  canEditDecorations: boolean;
  onPlaceDecoration: (roomId: string, decorationId: string, tile: RoomTile) => void;
  onMoveDecoration: (roomId: string, placementId: string, tile: RoomTile) => void;
}) {
  const [tile, setTile] = useState<RoomTile>({ x: 0, y: 0 });
  const actionEnabled = gridEnabled && canEditDecorations && Boolean(activeDecoration);
  const status = activeDecoration
    ? decorationPlacementStatus(catalog, room, activeDecoration.id, tile, {
        ignorePlacementId: selectedPlacementId,
      })
    : null;
  const disabled = !actionEnabled || !status?.fits;

  useEffect(() => {
    setTile((current) => ({
      x: clamp(current.x, 0, Math.max(0, room.width - 1)),
      y: clamp(current.y, 0, Math.max(0, room.height - 1)),
    }));
  }, [room.height, room.width]);

  const runAction = () => {
    if (disabled || !activeDecoration) {
      return;
    }
    if (selectedPlacementId) {
      onMoveDecoration(room.id, selectedPlacementId, tile);
      return;
    }
    onPlaceDecoration(room.id, activeDecoration.id, tile);
  };

  return (
    <div className="room-tile-coordinate-controls" aria-label="Room Tile coordinates">
      <label>
        <span>X</span>
        <input
          aria-label="Room Tile X"
          type="number"
          min={0}
          max={Math.max(0, room.width - 1)}
          value={tile.x}
          disabled={!gridEnabled || !canEditDecorations}
          onChange={(event) => {
            const next = Number.parseInt(event.currentTarget.value, 10);
            setTile((current) => ({
              ...current,
              x: Number.isFinite(next) ? clamp(next, 0, Math.max(0, room.width - 1)) : current.x,
            }));
          }}
        />
      </label>
      <label>
        <span>Y</span>
        <input
          aria-label="Room Tile Y"
          type="number"
          min={0}
          max={Math.max(0, room.height - 1)}
          value={tile.y}
          disabled={!gridEnabled || !canEditDecorations}
          onChange={(event) => {
            const next = Number.parseInt(event.currentTarget.value, 10);
            setTile((current) => ({
              ...current,
              y: Number.isFinite(next) ? clamp(next, 0, Math.max(0, room.height - 1)) : current.y,
            }));
          }}
        />
      </label>
      <button type="button" disabled={disabled} onClick={runAction}>
        {selectedPlacementId ? "Move" : "Place"}
      </button>
    </div>
  );
}

function placementStatusText(
  gridEnabled: boolean,
  canEditDecorations: boolean,
  preview: { tile: RoomTile; status: ReturnType<typeof decorationPlacementStatus> } | null,
  selectedPlacement: HouseInteriorRoom["decoration_placements"][number] | null,
  selectedPlacementDecoration: DecorationDefinition | null,
) {
  if (!gridEnabled) {
    return "Grid off; turn on grid to edit Decorations.";
  }
  if (!canEditDecorations) {
    return "Decoration placement unlocks at Farm level 5";
  }
  if (!preview) {
    if (selectedPlacement && selectedPlacementDecoration) {
      return `Selected ${selectedPlacementDecoration.name} at Room Tile ${selectedPlacement.tile.x},${selectedPlacement.tile.y}. Choose a Room Tile to move it.`;
    }
    return "Choose a Decoration, then choose a Room Tile";
  }
  if (preview.status.fits) {
    return `Fits on Room Tile ${preview.tile.x},${preview.tile.y}`;
  }
  return preview.status.reason === "overlap"
    ? `Blocked: overlaps at Room Tile ${preview.tile.x},${preview.tile.y}`
    : `Blocked: out of bounds at Room Tile ${preview.tile.x},${preview.tile.y}`;
}
