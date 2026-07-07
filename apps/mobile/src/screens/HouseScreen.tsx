import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type {
  CatalogDocument,
  FarmResponse,
  FarmView,
  RoomTile,
} from "@my-farm/contracts";
import {
  buildStructureMenuModel,
  decorationPlacementStatus,
  ovenProductionStatus,
  productionStatusLabel,
  recipeName,
} from "@my-farm/game-model";
import { ActionButton, Header } from "../components/ui";
import { styles } from "../styles";
import type { CommandSender, ShellProps } from "../types";
import { firstOpenRoomTile, formatTile } from "../utils/farm";

type HouseMode = "overview" | "room";

export function HouseScreen({
  catalog,
  farm,
  message,
  nowMs,
  onNavigate,
  onSendCommand,
}: ShellProps & {
  catalog: CatalogDocument;
  farm: FarmResponse;
  onSendCommand: CommandSender;
}) {
  const view = farm.view;
  const [mode, setMode] = useState<HouseMode>("overview");
  const [selectedRoomId, setSelectedRoomId] = useState(view.house_interior.rooms[0]?.id ?? "");
  const [selectedDecorationId, setSelectedDecorationId] = useState(catalog.decorations[0]?.id ?? "");
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const selectedRoom = view.house_interior.rooms.find((room) => room.id === selectedRoomId) ?? view.house_interior.rooms[0] ?? null;
  const selectedDecoration = catalog.decorations.find((decoration) => decoration.id === selectedDecorationId) ?? catalog.decorations[0] ?? null;
  const selectedPlacement = selectedRoom?.decoration_placements.find((placement) => placement.id === selectedPlacementId) ?? null;
  const ovenStatus = ovenProductionStatus(catalog, view, nowMs);
  const ovenLabel = productionStatusLabel("Oven", catalog, ovenStatus);
  const farmhouseMenu = buildStructureMenuModel(catalog, view, { type: "farmhouse" }, nowMs);
  const placementTiles = useMemo(
    () => selectedRoom?.tiles.slice(0, 24) ?? [],
    [selectedRoom],
  );

  const placeDecoration = (tile: RoomTile) => {
    if (!selectedRoom || !selectedDecoration) {
      return;
    }
    onSendCommand({
      type: "place_decoration",
      room_id: selectedRoom.id,
      decoration_id: selectedDecoration.id,
      tile,
    });
  };

  const moveDecoration = (tile: RoomTile) => {
    if (!selectedRoom || !selectedDecoration || !selectedPlacement) {
      return;
    }
    onSendCommand({
      type: "move_decoration",
      room_id: selectedRoom.id,
      placement_id: selectedPlacement.id,
      tile,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header title="Farmhouse" onBack={() => onNavigate("farm")} />
      <Text style={styles.statusText}>{message}</Text>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Oven Workstation</Text>
        <Text style={styles.bodyText}>{ovenLabel ?? "Oven idle"}</Text>
        {farmhouseMenu?.subtitle ? <Text style={styles.bodyText}>{farmhouseMenu.subtitle}</Text> : null}
        <View style={styles.inlineActions}>
          {farmhouseMenu?.items.map((item) => (
            <ActionButton
              key={item.id}
              label={item.reason ? `${item.label} (${item.reason})` : item.label}
              disabled={item.disabled}
              onPress={() => item.command && onSendCommand(item.command)}
            />
          ))}
        </View>
      </View>

      {mode === "overview" ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>House Overview</Text>
          <Text style={styles.bodyText}>Rooms: {view.house_interior.rooms.map((room) => room.name).join(", ")}</Text>
          <View style={styles.inlineActions}>
            {view.house_interior.rooms.map((room) => (
              <ActionButton
                key={room.id}
                label={`House Door: ${room.name}`}
                onPress={() => {
                  setSelectedRoomId(room.id);
                  setSelectedPlacementId(null);
                  setMode("room");
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      {mode === "room" && selectedRoom ? (
        <View style={styles.panel}>
          <View style={styles.sheetHeader}>
            <Text style={styles.panelTitle}>{selectedRoom.name}</Text>
            <ActionButton label="House Overview" onPress={() => setMode("overview")} />
          </View>
          <Text style={styles.bodyText}>
            {selectedRoom.decoration_placements.length} Decoration Placements
          </Text>
          <View style={styles.subPanel}>
            <Text style={styles.label}>Decoration</Text>
            <View style={styles.inlineActions}>
              {catalog.decorations.map((decoration) => (
                <ActionButton
                  key={decoration.id}
                  label={decoration.id === selectedDecoration?.id ? `${decoration.name} selected` : decoration.name}
                  onPress={() => setSelectedDecorationId(decoration.id)}
                />
              ))}
            </View>
          </View>
          {selectedDecoration ? (
            <View style={styles.subPanel}>
              <Text style={styles.bodyText}>Room Tiles</Text>
              <View style={styles.tileGrid}>
                {placementTiles.map((tile) => {
                  const placementStatus = decorationPlacementStatus(
                    catalog,
                    selectedRoom,
                    selectedDecoration.id,
                    tile,
                    { ignorePlacementId: selectedPlacement?.id },
                  );
                  return (
                    <ActionButton
                      key={formatTile(tile)}
                      label={placementStatus.fits ? formatTile(tile) : `${formatTile(tile)} ${placementStatus.reason}`}
                      disabled={!placementStatus.fits}
                      onPress={() => (selectedPlacement ? moveDecoration(tile) : placeDecoration(tile))}
                    />
                  );
                })}
              </View>
              <ActionButton
                label={`Place ${selectedDecoration.name} at first open tile`}
                onPress={() => placeDecoration(firstOpenRoomTile(catalog, selectedRoom, selectedDecoration.id))}
              />
            </View>
          ) : null}
          {selectedRoom.decoration_placements.map((placement) => (
            <View key={placement.id} style={styles.subPanel}>
              <Text style={styles.bodyText}>
                {catalog.decorations.find((decoration) => decoration.id === placement.decoration_id)?.name ?? placement.decoration_id} at {formatTile(placement.tile)}
              </Text>
              <View style={styles.inlineActions}>
                <ActionButton
                  label={placement.id === selectedPlacementId ? "Moving" : "Move"}
                  onPress={() => {
                    setSelectedPlacementId(placement.id);
                    setSelectedDecorationId(placement.decoration_id);
                  }}
                />
                <ActionButton
                  label="Remove"
                  onPress={() =>
                    onSendCommand({
                      type: "remove_decoration",
                      room_id: selectedRoom.id,
                      placement_id: placement.id,
                    })
                  }
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>House Interior Terms</Text>
        <Text style={styles.bodyText}>
          House Overview, Room, House Door, Room Tile, Decoration Placement, and Oven Workstation are authoritative Farm surfaces.
        </Text>
        {view.oven.queue[0] ? (
          <Text style={styles.bodyText}>
            Current Oven recipe: {recipeName(catalog, view.oven.queue[0].recipe_id)}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
