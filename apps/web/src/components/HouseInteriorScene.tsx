import { Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import {
  decorationPlacementStatus,
  type DecorationDefinition,
  type HouseInteriorRoom,
  type RoomTile,
} from "../game/houseInterior";
import { buildStructureMenuModel, type StructureMenuItem } from "../game/structureMenu";
import { ovenProductionStatus, productionStatusLabel } from "../game/structureStatus";
import { recipeName } from "../game/selectors";
import { residentVisualCue } from "../game/residentTasks";
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

  return (
    <section className="house-interior" aria-label="House Interior">
      <Canvas
        className="house-interior__canvas"
        gl={{ preserveDrawingBuffer: true }}
        orthographic
        camera={{ position: [7.8, 7.2, 7.8], zoom: 58, near: 0.1, far: 100 }}
        shadows
        dpr={[1, 2]}
      >
        <color attach="background" args={["#8fc9c5"]} />
        <hemisphereLight args={["#fff6df", "#52665c", 1.4]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={2.1} castShadow />
        <OrbitControls enableRotate={false} enablePan={false} enableZoom={false} target={[0, 0.3, 0]} />
        {mode === "overview" ? (
          <HouseOverviewSet />
        ) : (
          <RoomSet
            catalog={catalog}
            view={view}
            nowMs={nowMs}
            room={room}
            roomStyle={roomStyle}
            preview={preview}
            gridEnabled={gridEnabled}
          />
        )}
      </Canvas>
      {mode === "overview" ? (
        <HouseOverviewControls onSelectRoom={onSelectRoom} onBackToFarm={onBackToFarm} />
      ) : (
        <>
          <RoomTileGrid
            catalog={catalog}
            room={room}
            selectedDecoration={activeDecoration}
            selectedPlacementId={selectedPlacement?.id ?? null}
            canEditDecorations={canEditDecorations}
            gridEnabled={gridEnabled}
            onHoverTile={setHoverTile}
            onSelectPlacement={onSelectPlacement}
            onPlaceDecoration={onPlaceDecoration}
            onMoveDecoration={onMoveDecoration}
          />
          <button
            className="house-room-door"
            type="button"
            aria-label={`Exit ${roomStyle.label} to House Overview`}
            onClick={onExitRoomToOverview}
          >
            Door
          </button>
        </>
      )}
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
            Grid {gridEnabled ? "On" : "Off"}
          </button>
          <button className="house-interior__back" type="button" onClick={onBackToFarm}>
            Back to Farm
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

function HouseOverviewSet() {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.6, 5.6]} />
        <meshStandardMaterial color="#6d8b72" roughness={1} />
      </mesh>
      <OverviewRoomBlock position={[-1.75, 0, -0.85]} size={[2.5, 0.22, 2.3]} color="#d8b06a" wall="#f1dfb6" />
      <OverviewRoomBlock position={[1.25, 0, -0.85]} size={[2.5, 0.22, 2.3]} color="#c8d0c4" wall="#f6ead0" />
      <OverviewRoomBlock position={[-0.25, 0, 1.15]} size={[5.5, 0.22, 1.7]} color="#bca3be" wall="#ead9cf" />
      <mesh castShadow receiveShadow position={[0, 0.76, -2.15]}>
        <boxGeometry args={[5.9, 1.45, 0.18]} />
        <meshStandardMaterial color="#eadfcb" roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[-3.05, 0.48, 0]}>
        <boxGeometry args={[0.18, 0.96, 4.1]} />
        <meshStandardMaterial color="#eadfcb" roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[3.05, 0.48, 0]}>
        <boxGeometry args={[0.18, 0.96, 4.1]} />
        <meshStandardMaterial color="#eadfcb" roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.52, 2.1]}>
        <boxGeometry args={[5.9, 1.04, 0.18]} />
        <meshStandardMaterial color="#b98762" roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.38, 2.22]}>
        <boxGeometry args={[0.62, 0.76, 0.12]} />
        <meshStandardMaterial color="#7c5638" roughness={0.72} />
      </mesh>
      <Html position={[0, 1.25, 0]} center wrapperClass="farm-scene-marker-wrapper">
        <div className="farm-scene-marker" data-testid="house-overview" aria-label="House Overview" />
      </Html>
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

function HouseOverviewControls({
  onSelectRoom,
  onBackToFarm,
}: {
  onSelectRoom: (room: HouseRoomId) => void;
  onBackToFarm: () => void;
}) {
  return (
    <div className="house-overview-controls" aria-label="House Overview rooms">
      <button
        type="button"
        className="house-overview-room house-overview-room--living"
        aria-label="Enter Living Room"
        onClick={() => onSelectRoom("living_room")}
      >
        Living Room
      </button>
      <button
        type="button"
        className="house-overview-room house-overview-room--kitchen"
        aria-label="Enter Kitchen"
        onClick={() => onSelectRoom("kitchen")}
      >
        Kitchen
      </button>
      <button
        type="button"
        className="house-overview-room house-overview-room--bedroom"
        aria-label="Enter Bedroom"
        onClick={() => onSelectRoom("bedroom")}
      >
        Bedroom
      </button>
      <button
        type="button"
        className="house-overview-front-door"
        aria-label="Exit Farmhouse to Farm"
        onClick={onBackToFarm}
      >
        Front Door
      </button>
    </div>
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
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  room: HouseInteriorRoom;
  roomStyle: HouseRoomStyle;
  preview: { tile: RoomTile; decoration: DecorationDefinition; status: ReturnType<typeof decorationPlacementStatus> } | null;
  gridEnabled: boolean;
}) {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.2, 7.2]} />
        <meshStandardMaterial color="#6d8b72" roughness={1} />
      </mesh>
      <RoomShell room={room} roomStyle={roomStyle} gridEnabled={gridEnabled} />
      {room.id === "kitchen" ? <OvenWorkstationObject room={room} owned={view.owned_farmhouse_upgrades.includes("oven")} /> : null}
      {room.id === "kitchen" ? <InteriorOvenResidents view={view} nowMs={nowMs} room={room} /> : null}
      {room.decoration_placements.map((placement) => {
        const decoration = catalog.decorations.find((entry) => entry.id === placement.decoration_id);
        return decoration ? (
          <DecorationObject
            key={placement.id}
            room={room}
            decoration={decoration}
            tile={placement.tile}
            opacity={1}
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
  const residentsAtOven = view.residents.filter((resident) => {
    const step = view.resident_task_queues[resident.id]?.[0]?.steps[0];
    return step?.reserved_work_target.type === "oven";
  });
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

function DecorationObject({
  room,
  decoration,
  tile,
  opacity,
  invalid = false,
}: {
  room: HouseInteriorRoom;
  decoration: DecorationDefinition;
  tile: RoomTile;
  opacity: number;
  invalid?: boolean;
}) {
  const width = decoration.footprint.width * tileSize;
  const height = decoration.footprint.height * tileSize;
  const x = (tile.x + decoration.footprint.width / 2 - room.width / 2) * tileSize;
  const z = (tile.y + decoration.footprint.height / 2 - room.height / 2) * tileSize;
  const color = invalid ? "#b8463d" : decorationColors[decoration.id] ?? "#d7c48a";
  return (
    <mesh castShadow receiveShadow position={[x, 0.12, z]}>
      <boxGeometry args={[Math.max(0.18, width - 0.08), 0.24, Math.max(0.18, height - 0.08)]} />
      <meshStandardMaterial color={color} roughness={0.78} transparent opacity={opacity} />
    </mesh>
  );
}

function RoomTileGrid({
  catalog,
  room,
  selectedDecoration,
  selectedPlacementId,
  canEditDecorations,
  gridEnabled,
  onHoverTile,
  onSelectPlacement,
  onPlaceDecoration,
  onMoveDecoration,
}: {
  catalog: CatalogDocument;
  room: HouseInteriorRoom;
  selectedDecoration: DecorationDefinition | null;
  selectedPlacementId: string | null;
  canEditDecorations: boolean;
  gridEnabled: boolean;
  onHoverTile: (tile: RoomTile | null) => void;
  onSelectPlacement: (roomId: string, placementId: string) => void;
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

  return (
    <div
      className={gridEnabled ? "house-room-tiles" : "house-room-tiles house-room-tiles--hidden"}
      style={{
        gridTemplateColumns: `repeat(${room.width}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${room.height}, minmax(0, 1fr))`,
        aspectRatio: `${room.width} / ${room.height}`,
      }}
      aria-label={`${room.name} Room Tiles`}
    >
      {tiles.map((tile) => (
        <button
          key={`${tile.x},${tile.y}`}
          type="button"
          className="house-room-tile"
          aria-label={`Room Tile ${tile.x},${tile.y}`}
          disabled={!gridEnabled || !canEditDecorations || !selectedDecoration}
          onPointerEnter={() => onHoverTile(tile)}
          onFocus={() => onHoverTile(tile)}
          onPointerLeave={() => onHoverTile(null)}
          onBlur={() => onHoverTile(null)}
          onClick={() => {
            if (selectedPlacementId) {
              onMoveDecoration(room.id, selectedPlacementId, tile);
              return;
            }
            if (selectedDecoration) {
              onPlaceDecoration(room.id, selectedDecoration.id, tile);
            }
          }}
        />
      ))}
      {room.decoration_placements.map((placement) => {
        const decoration = catalog.decorations.find((entry) => entry.id === placement.decoration_id);
        if (!decoration) {
          return null;
        }
        return (
          <button
            key={placement.id}
            type="button"
            className={
              placement.id === selectedPlacementId
                ? "house-room-placement house-room-placement--selected"
                : "house-room-placement"
            }
            style={{
              gridColumn: `${placement.tile.x + 1} / span ${decoration.footprint.width}`,
              gridRow: `${placement.tile.y + 1} / span ${decoration.footprint.height}`,
            }}
            aria-label={`${decoration.name} placement at Room Tile ${placement.tile.x},${placement.tile.y}`}
            aria-pressed={placement.id === selectedPlacementId}
            disabled={!gridEnabled || !canEditDecorations}
            onPointerEnter={() => onHoverTile(placement.tile)}
            onFocus={() => onHoverTile(placement.tile)}
            onPointerLeave={() => onHoverTile(null)}
            onBlur={() => onHoverTile(null)}
            onClick={(event) => {
              event.stopPropagation();
              onHoverTile(null);
              if (selectedPlacementId && selectedPlacementId !== placement.id) {
                onMoveDecoration(room.id, selectedPlacementId, placement.tile);
                return;
              }
              onSelectPlacement(room.id, placement.id);
            }}
          />
        );
      })}
    </div>
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
