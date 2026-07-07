import { Canvas } from "@react-three/fiber/native";
import { Suspense } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { FarmView, FieldPlot, Tile } from "@my-farm/contracts";
import type { Selection } from "@my-farm/game-model";
import { styles } from "../styles";

export function FarmSceneShell({
  view,
  selection,
  onSelect,
}: {
  view: FarmView;
  selection: Selection;
  onSelect(selection: Selection): void;
}) {
  const toolShed = view.tool_shed;
  const farmShop = view.farm_shop;
  return (
    <View style={styles.scene}>
      <Canvas camera={{ position: [12, 12, 12], near: 0.1, far: 100 }} gl={{ antialias: true }}>
        <color attach="background" args={["#9fd3d1"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[6, 10, 6]} intensity={1.4} />
        <Suspense fallback={null}>
          <FarmBoard view={view} selection={selection} onSelect={onSelect} />
        </Suspense>
      </Canvas>
      <View style={styles.sceneOverlay}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
          {view.field_plots.map((plot) => (
            <Pressable
              key={plot.id}
              style={selection?.type === "plot" && selection.id === plot.id ? styles.chipSelected : styles.chip}
              onPress={() => onSelect({ type: "plot", id: plot.id })}
            >
              <Text style={styles.chipText}>{plot.id}</Text>
            </Pressable>
          ))}
          <Pressable
            style={selection?.type === "silo" ? styles.chipSelected : styles.chip}
            onPress={() => onSelect({ type: "silo" })}
          >
            <Text style={styles.chipText}>Silo</Text>
          </Pressable>
          <Pressable
            style={selection?.type === "barn" ? styles.chipSelected : styles.chip}
            onPress={() => onSelect({ type: "barn" })}
          >
            <Text style={styles.chipText}>Barn</Text>
          </Pressable>
          <Pressable
            style={selection?.type === "farmhouse" ? styles.chipSelected : styles.chip}
            onPress={() => onSelect({ type: "farmhouse" })}
          >
            <Text style={styles.chipText}>Farmhouse</Text>
          </Pressable>
          {view.delivery_board_built ? (
            <Pressable
              style={selection?.type === "delivery_board" ? styles.chipSelected : styles.chip}
              onPress={() => onSelect({ type: "delivery_board" })}
            >
              <Text style={styles.chipText}>Board</Text>
            </Pressable>
          ) : null}
          {toolShed ? (
            <Pressable
              style={selection?.type === "tool_shed" ? styles.chipSelected : styles.chip}
              onPress={() => onSelect({ type: "tool_shed", id: toolShed.id })}
            >
              <Text style={styles.chipText}>Tool Shed</Text>
            </Pressable>
          ) : null}
          {farmShop ? (
            <Pressable
              style={selection?.type === "farm_shop" ? styles.chipSelected : styles.chip}
              onPress={() => onSelect({ type: "farm_shop", id: farmShop.id })}
            >
              <Text style={styles.chipText}>Farm Shop</Text>
            </Pressable>
          ) : null}
          {view.residents.map((resident) => (
            <Pressable
              key={resident.id}
              style={selection?.type === "resident" && selection.id === resident.id ? styles.chipSelected : styles.chip}
              onPress={() => onSelect({ type: "resident", id: resident.id })}
            >
              <Text style={styles.chipText}>{resident.display_name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function FarmBoard({
  view,
  selection,
  onSelect,
}: {
  view: FarmView;
  selection: Selection;
  onSelect(selection: Selection): void;
}) {
  const toolShed = view.tool_shed;
  const farmShop = view.farm_shop;
  return (
    <group rotation={[-Math.PI / 7, Math.PI / 4, 0]}>
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[18, 0.12, 18]} />
        <meshStandardMaterial color="#6fb36f" />
      </mesh>
      <StructureBlock
        tile={{ x: 8, y: 8 }}
        color="#d9ad6a"
        height={1.4}
        width={2}
        depth={2}
        selected={selection?.type === "farmhouse"}
        onSelect={() => onSelect({ type: "farmhouse" })}
      />
      {view.field_plots.map((plot) => (
        <PlotMesh
          key={plot.id}
          plot={plot}
          selected={selection?.type === "plot" && plot.id === selection.id}
          onSelect={() => onSelect({ type: "plot", id: plot.id })}
        />
      ))}
      <StructureBlock
        tile={view.silo_tile}
        color="#d8b65a"
        height={0.8}
        width={2}
        depth={2}
        selected={selection?.type === "silo"}
        onSelect={() => onSelect({ type: "silo" })}
      />
      <StructureBlock
        tile={view.barn_tile}
        color="#b95346"
        height={1}
        width={2}
        depth={2}
        selected={selection?.type === "barn"}
        onSelect={() => onSelect({ type: "barn" })}
      />
      {view.machines.map((machine) => (
        <StructureBlock
          key={machine.id}
          tile={machine.tile}
          color="#5f8aa6"
          height={0.9}
          selected={selection?.type === "machine" && selection.id === machine.id}
          onSelect={() => onSelect({ type: "machine", id: machine.id })}
        />
      ))}
      {view.shelters.map((shelter) => (
        <StructureBlock
          key={shelter.id}
          tile={shelter.tile}
          color="#b98762"
          height={0.65}
          width={shelter.kind === "cow_pasture" ? 3 : 2}
          depth={3}
          selected={selection?.type === "shelter" && selection.id === shelter.id}
          onSelect={() => onSelect({ type: "shelter", id: shelter.id })}
        />
      ))}
      {view.delivery_board_built ? (
        <StructureBlock
          tile={view.delivery_board_tile}
          color="#7f5b8b"
          height={0.72}
          selected={selection?.type === "delivery_board"}
          onSelect={() => onSelect({ type: "delivery_board" })}
        />
      ) : null}
      {toolShed ? (
        <StructureBlock
          tile={toolShed.tile}
          color="#4d735f"
          height={0.76}
          selected={selection?.type === "tool_shed" && selection.id === toolShed.id}
          onSelect={() => onSelect({ type: "tool_shed", id: toolShed.id })}
        />
      ) : null}
      {farmShop ? (
        <StructureBlock
          tile={farmShop.tile}
          color="#cf6f45"
          height={0.8}
          width={2}
          selected={selection?.type === "farm_shop" && selection.id === farmShop.id}
          onSelect={() => onSelect({ type: "farm_shop", id: farmShop.id })}
        />
      ) : null}
      {Object.entries(view.resident_locations).map(([residentId, tile]) =>
        tile ? (
          <mesh
            key={residentId}
            position={[tile.x - 8, 0.55, tile.y - 8]}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect({ type: "resident", id: residentId });
            }}
          >
            <sphereGeometry args={[0.28, 16, 16]} />
            <meshStandardMaterial
              color={residentId === view.selected_resident_id ? "#20312b" : "#f1dfb6"}
            />
          </mesh>
        ) : null,
      )}
    </group>
  );
}

function PlotMesh({
  plot,
  selected,
  onSelect,
}: {
  plot: FieldPlot;
  selected: boolean;
  onSelect(): void;
}) {
  return (
    <mesh
      position={[plot.tile.x - 8, 0.05, plot.tile.y - 8]}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <boxGeometry args={[0.82, plot.crop ? 0.28 : 0.12, 0.82]} />
      <meshStandardMaterial color={selected ? "#fff7d0" : plot.crop ? "#d8b65a" : "#7b5a35"} />
    </mesh>
  );
}

function StructureBlock({
  tile,
  color,
  height,
  selected,
  onSelect,
  width = 1,
  depth = 1,
}: {
  tile: Tile;
  color: string;
  height: number;
  selected: boolean;
  onSelect(): void;
  width?: number;
  depth?: number;
}) {
  return (
    <mesh
      position={[tile.x - 8 + (width - 1) / 2, height / 2, tile.y - 8 + (depth - 1) / 2]}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <boxGeometry args={[width * 0.94, height, depth * 0.94]} />
      <meshStandardMaterial color={selected ? "#fff7d0" : color} />
    </mesh>
  );
}
