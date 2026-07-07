import AsyncStorage from "@react-native-async-storage/async-storage";
import { Canvas } from "@react-three/fiber/native";
import Constants from "expo-constants";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type {
  CatalogDocument,
  FarmCommand,
  FarmResponse,
  FarmView,
  FieldPlot,
  InventoryItemView,
  RoomTile,
  Tile,
} from "@my-farm/contracts";
import {
  decorationPlacementStatus,
  itemName,
  residentWork,
} from "@my-farm/game-model";
import type { FarmClient, FarmConnectionStatus } from "@my-farm/game-client";
import { createMobileFarmClient } from "./mobileFarmClient";
import {
  clearServerUrl,
  loadRecentServerUrls,
  loadServerUrl,
  saveServerUrl,
} from "./serverProfile";

type Screen =
  | "connect"
  | "menu"
  | "farm"
  | "residents"
  | "market"
  | "orders"
  | "house"
  | "wiki"
  | "settings"
  | "account";

type Diagnostics = {
  lastCommandLatencyMs: number | null;
  farmVersion: number;
};

type CommandSender = (command: FarmCommand) => Promise<void>;

const defaultServerUrl =
  Constants.expoConfig?.extra?.defaultApiBaseUrl ??
  process.env.EXPO_PUBLIC_MY_FARM_DEFAULT_API_BASE_URL ??
  "http://127.0.0.1:8081";

export function App() {
  return (
    <GestureHandlerRootView style={styles.full}>
      <SafeAreaProvider>
        <MobileFarmApp />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function MobileFarmApp() {
  const [screen, setScreen] = useState<Screen>("connect");
  const [serverUrl, setServerUrl] = useState("");
  const [recentServerUrls, setRecentServerUrls] = useState<string[]>([]);
  const [client, setClient] = useState<FarmClient | null>(null);
  const [catalog, setCatalog] = useState<CatalogDocument | null>(null);
  const [farm, setFarm] = useState<FarmResponse | null>(null);
  const [status, setStatus] = useState<FarmConnectionStatus>("disconnected");
  const [message, setMessage] = useState("Choose a farm server");
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({ lastCommandLatencyMs: null, farmVersion: 0 });
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);
  const versionRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadServerUrl(AsyncStorage, defaultServerUrl), loadRecentServerUrls(AsyncStorage)])
      .then(([url, recent]) => {
        if (!mounted) {
          return;
        }
        setServerUrl(url);
        setRecentServerUrls(recent);
      })
      .catch((error) => {
        if (mounted) {
          setMessage(error instanceof Error ? error.message : "Could not load server settings");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    versionRef.current = farm?.version ?? 0;
    setDiagnostics((current) => ({ ...current, farmVersion: farm?.version ?? 0 }));
  }, [farm?.version]);

  useEffect(() => {
    if (!client) {
      return;
    }
    return client.connect?.({
      status(nextStatus) {
        setStatus(nextStatus);
        if (nextStatus === "disconnected") {
          setMessage("Server disconnected");
        } else if (nextStatus === "reconnecting") {
          setMessage("Connecting to farm server...");
        } else {
          setMessage("Farm synced");
        }
      },
      catalog(nextCatalog) {
        setCatalog(nextCatalog);
      },
      farm(nextFarm) {
        applyFarmSnapshot(nextFarm);
        if (nextFarm.notice) {
          setMessage(nextFarm.notice.message);
        }
        if (screen === "connect") {
          setScreen("menu");
        }
      },
      error(errorMessage) {
        setMessage(errorMessage);
      },
    });
  }, [client, screen]);

  const applyFarmSnapshot = useCallback((nextFarm: FarmResponse) => {
    versionRef.current = nextFarm.version;
    setFarm(nextFarm);
  }, []);

  const connect = useCallback(async () => {
    try {
      const normalized = await saveServerUrl(AsyncStorage, serverUrl);
      setServerUrl(normalized);
      setRecentServerUrls(await loadRecentServerUrls(AsyncStorage));
      setCatalog(null);
      setFarm(null);
      setStatus("reconnecting");
      setMessage("Connecting to farm server...");
      setClient(createMobileFarmClient(normalized));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid server URL");
    }
  }, [serverUrl]);

  const resetServerProfile = useCallback(async () => {
    await clearServerUrl(AsyncStorage);
    setServerUrl(defaultServerUrl);
    setClient(null);
    setCatalog(null);
    setFarm(null);
    setScreen("connect");
    setMessage("Server profile cleared");
  }, []);

  const send = useCallback(
    async (command: FarmCommand) => {
      if (!client) {
        setMessage("Connect to a farm server first");
        return;
      }
      const startedAt = Date.now();
      try {
        let response = await client.command({ expected_version: versionRef.current, command });
        if (!response.accepted && response.error?.startsWith("version mismatch")) {
          applyFarmSnapshot({ version: response.version, view: response.view, notice: response.notice });
          response = await client.command({ expected_version: response.version, command });
        }
        applyFarmSnapshot({ version: response.version, view: response.view, notice: response.notice });
        setDiagnostics((current) => ({ ...current, lastCommandLatencyMs: Date.now() - startedAt }));
        setMessage(response.notice?.message ?? (response.accepted ? "Command accepted" : response.error ?? "Command rejected"));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Command failed");
      }
    },
    [applyFarmSnapshot, client],
  );

  const resetFarm = useCallback(async () => {
    if (!client) {
      return;
    }
    try {
      const response = await client.reset();
      applyFarmSnapshot(response);
      setMessage(response.notice?.message ?? "Farm reset");
      setScreen("farm");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reset failed");
    }
  }, [applyFarmSnapshot, client]);

  const shellProps: ShellProps = {
    serverUrl,
    status,
    message,
    catalog,
    farm,
    diagnostics,
    onNavigate: setScreen,
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {screen === "connect" ? (
        <ConnectScreen
          serverUrl={serverUrl}
          recentServerUrls={recentServerUrls}
          status={status}
          message={message}
          onChangeServerUrl={setServerUrl}
          onConnect={connect}
          onPickRecent={setServerUrl}
        />
      ) : null}
      {screen === "menu" ? <MainMenu {...shellProps} onStartFarm={() => setScreen("farm")} onNewFarm={resetFarm} /> : null}
      {screen === "settings" ? (
        <SettingsScreen
          {...shellProps}
          onChangeServerUrl={setServerUrl}
          onConnect={connect}
          onResetServerProfile={resetServerProfile}
        />
      ) : null}
      {screen === "farm" && catalog && farm ? (
        <FarmScreen
          {...shellProps}
          catalog={catalog}
          farm={farm}
          selectedPlotId={selectedPlotId}
          onSelectPlot={setSelectedPlotId}
          onSendCommand={send}
          onResetFarm={resetFarm}
        />
      ) : null}
      {screen === "residents" && catalog && farm ? (
        <ResidentsScreen {...shellProps} catalog={catalog} farm={farm} onSendCommand={send} />
      ) : null}
      {screen === "market" && catalog && farm ? (
        <MarketScreen {...shellProps} catalog={catalog} farm={farm} onSendCommand={send} />
      ) : null}
      {screen === "orders" && catalog && farm ? (
        <OrdersScreen {...shellProps} catalog={catalog} farm={farm} onSendCommand={send} />
      ) : null}
      {screen === "house" && catalog && farm ? (
        <HouseScreen {...shellProps} catalog={catalog} farm={farm} onSendCommand={send} />
      ) : null}
      {screen === "wiki" ? <WikiScreen {...shellProps} /> : null}
      {screen === "account" ? <PlaceholderScreen {...shellProps} title="Account" body="Accounts are out of scope for the local mobile client." /> : null}
    </SafeAreaView>
  );
}

type ShellProps = {
  serverUrl: string;
  status: FarmConnectionStatus;
  message: string;
  catalog: CatalogDocument | null;
  farm: FarmResponse | null;
  diagnostics: Diagnostics;
  onNavigate(screen: Screen): void;
};

function ConnectScreen({
  serverUrl,
  recentServerUrls,
  status,
  message,
  onChangeServerUrl,
  onConnect,
  onPickRecent,
}: {
  serverUrl: string;
  recentServerUrls: string[];
  status: FarmConnectionStatus;
  message: string;
  onChangeServerUrl(value: string): void;
  onConnect(): void;
  onPickRecent(value: string): void;
}) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>My Farm</Text>
      <Text style={styles.subtitle}>Connect to the Rust farm server on this device or your local network.</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="url"
        onChangeText={onChangeServerUrl}
        placeholder="http://192.168.1.10:8081"
        style={styles.input}
        value={serverUrl}
      />
      <Pressable style={styles.primaryButton} onPress={onConnect}>
        <Text style={styles.primaryButtonText}>{status === "reconnecting" ? "Connecting" : "Connect"}</Text>
      </Pressable>
      <Text style={styles.statusText}>{message}</Text>
      {recentServerUrls.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Recent servers</Text>
          {recentServerUrls.map((url) => (
            <Pressable key={url} style={styles.listButton} onPress={() => onPickRecent(url)}>
              <Text style={styles.listButtonText}>{url}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MainMenu({ farm, status, message, onNavigate, onStartFarm, onNewFarm }: ShellProps & {
  onStartFarm(): void;
  onNewFarm(): void;
}) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>My Farm</Text>
      <Text style={styles.subtitle}>Native Expo client</Text>
      <View style={styles.metricsRow}>
        <Metric label="Connection" value={status} />
        <Metric label="Level" value={`${farm?.view.level ?? 1}`} />
        <Metric label="Coins" value={`${farm?.view.coins ?? 0}`} />
      </View>
      <Pressable style={styles.primaryButton} onPress={onStartFarm}>
        <Text style={styles.primaryButtonText}>Start Farm</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={onNewFarm}>
        <Text style={styles.secondaryButtonText}>New Farm</Text>
      </Pressable>
      <View style={styles.menuGrid}>
        <NavButton label="Settings" onPress={() => onNavigate("settings")} />
        <NavButton label="Wiki" onPress={() => onNavigate("wiki")} />
        <NavButton label="Account" onPress={() => onNavigate("account")} />
      </View>
      <Text style={styles.statusText}>{message}</Text>
    </View>
  );
}

function FarmScreen({
  serverUrl,
  status,
  message,
  catalog,
  farm,
  diagnostics,
  selectedPlotId,
  onNavigate,
  onSelectPlot,
  onSendCommand,
  onResetFarm,
}: ShellProps & {
  catalog: CatalogDocument;
  farm: FarmResponse;
  selectedPlotId: string | null;
  onSelectPlot(plotId: string | null): void;
  onSendCommand: CommandSender;
  onResetFarm(): void;
}) {
  const view = farm.view;
  const selectedPlot = view.field_plots.find((plot) => plot.id === selectedPlotId) ?? view.field_plots[0] ?? null;
  const wheat = catalog.crops.find((crop) => crop.item_id === "wheat") ?? catalog.crops[0];
  const activeResident = selectedResident(view);

  return (
    <View style={styles.farmScreen}>
      <FarmSceneShell view={view} selectedPlotId={selectedPlot?.id ?? null} onSelectPlot={onSelectPlot} />
      <View style={styles.topHud}>
        <Metric label="Level" value={`${view.level}`} />
        <Metric label="Coins" value={`${view.coins}`} />
        <Metric label="Silo" value={`${view.silo_used}/${view.silo_capacity}`} />
        <Metric label="Barn" value={`${view.barn_used}/${view.barn_capacity}`} />
      </View>
      <View style={styles.bottomSheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.panelTitle}>Farm</Text>
          <Text style={styles.badge}>{status}</Text>
        </View>
        <Text style={styles.statusText}>{message}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>
          <ActionButton label="Menu" onPress={() => onNavigate("menu")} />
          <ActionButton label="Residents" onPress={() => onNavigate("residents")} />
          <ActionButton label="Market" onPress={() => onNavigate("market")} />
          <ActionButton label="Orders" onPress={() => onNavigate("orders")} />
          <ActionButton label="House" onPress={() => onNavigate("house")} />
          <ActionButton label="Reset" onPress={onResetFarm} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>
          {selectedPlot && wheat ? (
            <ActionButton
              label={selectedPlot.crop ? "Harvest" : `Plant ${itemName(catalog, wheat.item_id)}`}
              onPress={() =>
                onSendCommand(
                  selectedPlot.crop
                    ? { type: "harvest_crop", plot_id: selectedPlot.id }
                    : { type: "plant_crop", plot_id: selectedPlot.id, crop_id: wheat.item_id },
                )
              }
            />
          ) : null}
          <ActionButton label="Buy Field" onPress={() => onSendCommand({ type: "buy_field_plot", tile: nextFieldPlotTile(view) })} />
          <ActionButton label="Build Feed Mill" onPress={() => onSendCommand({ type: "buy_structure", structure_kind: "feed_mill", tile: nextStructureTile(view, 0) })} />
          <ActionButton label="Build Board" onPress={() => onSendCommand({ type: "buy_structure", structure_kind: "delivery_board", tile: nextStructureTile(view, 2) })} />
          <ActionButton label="Build Shop" onPress={() => onSendCommand({ type: "buy_structure", structure_kind: "farm_shop", tile: { x: 0, y: 12 } })} />
        </ScrollView>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Selection</Text>
          <Text style={styles.bodyText}>
            {selectedPlot ? `${selectedPlot.id}: ${selectedPlot.crop ? `${itemName(catalog, selectedPlot.crop.item_id)} growing` : "empty"}` : "No Field Plot selected"}
          </Text>
          <Text style={styles.bodyText}>Resident: {activeResident?.display_name ?? "None"}</Text>
          <Text style={styles.bodyText}>Queue: {activeResident ? residentWork(view, activeResident.id)?.queue.length ?? 0 : 0}</Text>
        </View>
        <DiagnosticsPanel status={status} serverUrl={serverUrl} diagnostics={diagnostics} compact />
      </View>
    </View>
  );
}

function ResidentsScreen({ farm, message, onNavigate, onSendCommand }: ShellProps & {
  farm: FarmResponse;
  onSendCommand: CommandSender;
}) {
  const view = farm.view;
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header title="Residents" onBack={() => onNavigate("farm")} />
      <Text style={styles.statusText}>{message}</Text>
      {view.residents.map((resident) => {
        const work = residentWork(view, resident.id);
        const selected = resident.id === view.selected_resident_id;
        return (
          <View key={resident.id} style={styles.panel}>
            <View style={styles.sheetHeader}>
              <Text style={styles.panelTitle}>{resident.display_name}</Text>
              <Text style={styles.badge}>{selected ? "selected" : work?.state ?? "idle"}</Text>
            </View>
            <Text style={styles.bodyText}>Queue: {work?.queue.length ?? 0}</Text>
            {work?.current_task ? <Text style={styles.bodyText}>Current: {work.current_task.label}</Text> : null}
            {work?.block ? <Text style={styles.warningText}>{work.block.message}</Text> : null}
            <View style={styles.inlineActions}>
              <ActionButton label="Select" onPress={() => onSendCommand({ type: "select_resident", resident_id: resident.id })} />
              <ActionButton label="Rename" onPress={() => onSendCommand({ type: "rename_resident", resident_id: resident.id, display_name: `${resident.display_name}*` })} />
            </View>
            {work?.queue.map((task) => (
              <View key={task.id} style={styles.subPanel}>
                <Text style={styles.bodyText}>{task.label}</Text>
                <Text style={styles.mutedText}>{task.queue_state} - {task.step_count} steps</Text>
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

function MarketScreen({ catalog, farm, message, onNavigate, onSendCommand }: ShellProps & {
  catalog: CatalogDocument;
  farm: FarmResponse;
  onSendCommand: CommandSender;
}) {
  const view = farm.view;
  const sellable = catalog.market_items.filter((item) => item.unlock_level <= view.level);
  const shop = view.farm_shop;
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header title="Market" onBack={() => onNavigate("farm")} />
      <Text style={styles.statusText}>{message}</Text>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Farm Shop</Text>
        <Text style={styles.bodyText}>{shop ? `Stock ${shop.stock.reduce((sum, item) => sum + item.quantity, 0)}/${shop.stock_capacity}` : "Build the Farm Shop by the road."}</Text>
        {shop?.current_sale ? <Text style={styles.bodyText}>Sold {itemName(catalog, shop.current_sale.item_id)} for {shop.current_sale.coins_gained} coins</Text> : null}
      </View>
      {sellable.map((marketItem) => {
        const inventory = inventoryItem(view, marketItem.item_id);
        const stock = shop?.stock.find((item) => item.item_id === marketItem.item_id);
        return (
          <View key={marketItem.item_id} style={styles.panel}>
            <Text style={styles.panelTitle}>{itemName(catalog, marketItem.item_id)}</Text>
            <Text style={styles.bodyText}>Storage: {inventory?.available_quantity ?? inventory?.quantity ?? 0}</Text>
            <Text style={styles.bodyText}>Shop Stock: {stock?.quantity ?? 0}</Text>
            <View style={styles.inlineActions}>
              {marketItem.buy_price !== null ? <ActionButton label={`Buy ${marketItem.buy_price}`} onPress={() => onSendCommand({ type: "buy_market_item", item_id: marketItem.item_id, quantity: 1 })} /> : null}
              {marketItem.sell_price !== null ? <ActionButton label={`Sell ${marketItem.sell_price}`} onPress={() => onSendCommand({ type: "sell_market_item", item_id: marketItem.item_id, quantity: 1 })} /> : null}
              <ActionButton label="Stock" onPress={() => onSendCommand({ type: "stock_farm_shop", item_id: marketItem.item_id, quantity: 1 })} />
              <ActionButton label="Return" onPress={() => onSendCommand({ type: "unstock_farm_shop", item_id: marketItem.item_id, quantity: 1 })} />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function OrdersScreen({ catalog, farm, onNavigate, onSendCommand }: ShellProps & {
  catalog: CatalogDocument;
  farm: FarmResponse;
  onSendCommand: CommandSender;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header title="Delivery Orders" onBack={() => onNavigate("farm")} />
      {farm.view.delivery_orders.length === 0 ? <Text style={styles.bodyText}>Build the delivery board at level 4.</Text> : null}
      {farm.view.delivery_orders.map((order) => (
        <View key={order.id} style={styles.panel}>
          <Text style={styles.panelTitle}>{order.id}</Text>
          <Text style={styles.bodyText}>
            {order.requirements.map((stack) => `${stack.quantity} ${itemName(catalog, stack.item_id)}`).join(", ")}
          </Text>
          <Text style={styles.bodyText}>{order.reward_coins} coins - {order.reward_xp} XP</Text>
          <View style={styles.inlineActions}>
            <ActionButton label="Fulfill" onPress={() => onSendCommand({ type: "fulfill_delivery_order", order_id: order.id })} />
            <ActionButton label="Discard" onPress={() => onSendCommand({ type: "discard_delivery_order", order_id: order.id })} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function HouseScreen({ catalog, farm, onNavigate, onSendCommand }: ShellProps & {
  catalog: CatalogDocument;
  farm: FarmResponse;
  onSendCommand: CommandSender;
}) {
  const view = farm.view;
  const room = view.house_interior.rooms[0];
  const decoration = catalog.decorations[0];
  const ovenUpgrade = catalog.farmhouse_upgrades.find((upgrade) => upgrade.kind === "oven");
  const ovenOwned = view.owned_farmhouse_upgrades.includes("oven");
  const ovenRecipe = catalog.recipes.find((recipe) => recipe.target.type === "oven" && recipe.unlock_level <= view.level);
  const ovenJob = view.oven.queue[0];
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header title="Farmhouse" onBack={() => onNavigate("farm")} />
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Oven</Text>
        <Text style={styles.bodyText}>{ovenOwned ? `Queue ${view.oven.queue.length}/${ovenUpgrade?.queue_limit ?? 2}` : `Upgrade ${ovenUpgrade?.cost_coins ?? 0} coins`}</Text>
        <View style={styles.inlineActions}>
          {!ovenOwned ? <ActionButton label="Buy Oven" onPress={() => onSendCommand({ type: "buy_farmhouse_upgrade", upgrade_kind: "oven" })} /> : null}
          {ovenRecipe ? <ActionButton label={`Make ${ovenRecipe.name}`} onPress={() => onSendCommand({ type: "queue_oven_recipe", recipe_id: ovenRecipe.id })} /> : null}
          {ovenJob ? <ActionButton label="Collect Oven" onPress={() => onSendCommand({ type: "collect_oven_job" })} /> : null}
        </View>
      </View>
      {room ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{room.name}</Text>
          <Text style={styles.bodyText}>{room.decoration_placements.length} Decoration Placements</Text>
          {decoration ? (
            <View style={styles.inlineActions}>
              <ActionButton
                label={`Place ${decoration.name}`}
                onPress={() => onSendCommand({ type: "place_decoration", room_id: room.id, decoration_id: decoration.id, tile: firstOpenRoomTile(catalog, room, decoration.id) })}
              />
              {room.decoration_placements[0] ? (
                <ActionButton
                  label="Remove First"
                  onPress={() => onSendCommand({ type: "remove_decoration", room_id: room.id, placement_id: room.decoration_placements[0].id })}
                />
              ) : null}
            </View>
          ) : null}
          {room.decoration_placements.map((placement) => (
            <Text key={placement.id} style={styles.bodyText}>
              {placement.decoration_id} at {placement.tile.x},{placement.tile.y}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function SettingsScreen({
  serverUrl,
  status,
  message,
  diagnostics,
  onNavigate,
  onChangeServerUrl,
  onConnect,
  onResetServerProfile,
}: ShellProps & {
  onChangeServerUrl(value: string): void;
  onConnect(): void;
  onResetServerProfile(): void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header title="Settings" onBack={() => onNavigate("menu")} />
      <Text style={styles.label}>Farm server</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="url"
        onChangeText={onChangeServerUrl}
        style={styles.input}
        value={serverUrl}
      />
      <Pressable style={styles.primaryButton} onPress={onConnect}>
        <Text style={styles.primaryButtonText}>Reconnect</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={onResetServerProfile}>
        <Text style={styles.secondaryButtonText}>Clear Server Profile</Text>
      </Pressable>
      <DiagnosticsPanel status={status} serverUrl={serverUrl} diagnostics={diagnostics} />
      <Text style={styles.statusText}>{message}</Text>
    </ScrollView>
  );
}

function WikiScreen({ catalog, farm, onNavigate }: ShellProps) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header title="Wiki" onBack={() => onNavigate("menu")} />
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Farm status</Text>
        <Text style={styles.bodyText}>Level {farm?.view.level ?? 1}</Text>
        <Text style={styles.bodyText}>Unlocks: {farm?.view.unlocks.filter((unlock) => unlock.unlocked).map((unlock) => unlock.label).join(", ") || "Fresh Farm"}</Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Crops</Text>
        {catalog?.crops.map((crop) => (
          <Text key={crop.item_id} style={styles.bodyText}>{itemName(catalog, crop.item_id)} - level {crop.unlock_level}</Text>
        ))}
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Recipes</Text>
        {catalog?.recipes.map((recipe) => (
          <Text key={recipe.id} style={styles.bodyText}>{recipe.name} - level {recipe.unlock_level}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

function FarmSceneShell({
  view,
  selectedPlotId,
  onSelectPlot,
}: {
  view: FarmView;
  selectedPlotId: string | null;
  onSelectPlot(plotId: string): void;
}) {
  return (
    <View style={styles.scene}>
      <Canvas camera={{ position: [12, 12, 12], near: 0.1, far: 100 }} gl={{ antialias: true }}>
        <color attach="background" args={["#9fd3d1"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[6, 10, 6]} intensity={1.4} />
        <Suspense fallback={null}>
          <FarmBoard view={view} selectedPlotId={selectedPlotId} />
        </Suspense>
      </Canvas>
      <View style={styles.sceneOverlay}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.plotPicker}>
          {view.field_plots.map((plot) => (
            <Pressable
              key={plot.id}
              style={plot.id === selectedPlotId ? styles.plotChipSelected : styles.plotChip}
              onPress={() => onSelectPlot(plot.id)}
            >
              <Text style={styles.plotChipText}>{plot.id}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function FarmBoard({ view, selectedPlotId }: { view: FarmView; selectedPlotId: string | null }) {
  return (
    <group rotation={[-Math.PI / 7, Math.PI / 4, 0]}>
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[16, 0.12, 16]} />
        <meshStandardMaterial color="#6fb36f" />
      </mesh>
      {view.field_plots.map((plot) => (
        <PlotMesh key={plot.id} plot={plot} selected={plot.id === selectedPlotId} />
      ))}
      <StructureBlock tile={view.silo_tile} color="#d8b65a" height={0.8} />
      <StructureBlock tile={view.barn_tile} color="#b95346" height={1} />
      {view.machines.map((machine) => <StructureBlock key={machine.id} tile={machine.tile} color="#5f8aa6" height={0.9} />)}
      {view.shelters.map((shelter) => <StructureBlock key={shelter.id} tile={shelter.tile} color="#b98762" height={0.65} />)}
      {view.farm_shop ? <StructureBlock tile={view.farm_shop.tile} color="#cf6f45" height={0.8} /> : null}
      {Object.entries(view.resident_locations).map(([residentId, tile]) =>
        tile ? (
          <mesh key={residentId} position={[tile.x - 8, 0.55, tile.y - 8]}>
            <sphereGeometry args={[0.28, 16, 16]} />
            <meshStandardMaterial color={residentId === view.selected_resident_id ? "#20312b" : "#f1dfb6"} />
          </mesh>
        ) : null,
      )}
    </group>
  );
}

function PlotMesh({ plot, selected }: { plot: FieldPlot; selected: boolean }) {
  return (
    <mesh position={[plot.tile.x - 8, 0.05, plot.tile.y - 8]}>
      <boxGeometry args={[0.82, plot.crop ? 0.28 : 0.12, 0.82]} />
      <meshStandardMaterial color={selected ? "#fff7d0" : plot.crop ? "#d8b65a" : "#7b5a35"} />
    </mesh>
  );
}

function StructureBlock({ tile, color, height }: { tile: Tile; color: string; height: number }) {
  return (
    <mesh position={[tile.x - 8, height / 2, tile.y - 8]}>
      <boxGeometry args={[1.1, height, 1.1]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function PlaceholderScreen({ title, body, message, onNavigate }: ShellProps & { title: string; body: string }) {
  return (
    <View style={styles.screen}>
      <Header title={title} onBack={() => onNavigate("menu")} />
      <Text style={styles.subtitle}>{body}</Text>
      <Text style={styles.statusText}>{message}</Text>
    </View>
  );
}

function DiagnosticsPanel({
  status,
  serverUrl,
  diagnostics,
  compact = false,
}: {
  status: FarmConnectionStatus;
  serverUrl: string;
  diagnostics: Diagnostics;
  compact?: boolean;
}) {
  return (
    <View style={compact ? styles.diagnosticsCompact : styles.diagnostics}>
      <Text style={styles.panelTitle}>Diagnostics</Text>
      <Text style={styles.bodyText}>WebSocket: {status}</Text>
      <Text style={styles.bodyText}>Server: {serverUrl}</Text>
      <Text style={styles.bodyText}>Farm version: {diagnostics.farmVersion}</Text>
      <Text style={styles.bodyText}>Last command: {diagnostics.lastCommandLatencyMs ?? "-"}ms</Text>
    </View>
  );
}

function Header({ title, onBack }: { title: string; onBack(): void }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Pressable style={styles.headerButton} onPress={onBack}>
        <Text style={styles.secondaryButtonText}>Back</Text>
      </Pressable>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function NavButton({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable style={styles.secondaryButton} onPress={onPress}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable style={styles.actionButton} onPress={onPress}>
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

function selectedResident(view: FarmView) {
  return view.residents.find((resident) => resident.id === view.selected_resident_id) ?? view.residents[0] ?? null;
}

function inventoryItem(view: FarmView, itemId: string): InventoryItemView | null {
  return view.inventory.find((item) => item.item_id === itemId) ?? null;
}

function nextFieldPlotTile(view: FarmView): Tile {
  const occupied = occupiedTiles(view);
  for (let y = 4; y < 12; y += 1) {
    for (let x = 4; x < 12; x += 1) {
      if (!occupied.has(`${x},${y}`)) {
        return { x, y };
      }
    }
  }
  return { x: 4, y: 4 };
}

function nextStructureTile(view: FarmView, offset: number): Tile {
  const occupied = occupiedTiles(view);
  for (let y = 3 + offset; y < 14; y += 1) {
    for (let x = 10; x < 16; x += 1) {
      if (!occupied.has(`${x},${y}`)) {
        return { x, y };
      }
    }
  }
  return { x: 10, y: 4 + offset };
}

function occupiedTiles(view: FarmView): Set<string> {
  return new Set([
    ...view.field_plots.map((plot) => `${plot.tile.x},${plot.tile.y}`),
    `${view.silo_tile.x},${view.silo_tile.y}`,
    `${view.barn_tile.x},${view.barn_tile.y}`,
    ...view.machines.map((machine) => `${machine.tile.x},${machine.tile.y}`),
    ...view.shelters.map((shelter) => `${shelter.tile.x},${shelter.tile.y}`),
    ...(view.farm_shop ? [`${view.farm_shop.tile.x},${view.farm_shop.tile.y}`] : []),
  ]);
}

function firstOpenRoomTile(catalog: CatalogDocument, room: FarmView["house_interior"]["rooms"][number], decorationId: string): RoomTile {
  return (
    room.tiles.find((tile) => decorationPlacementStatus(catalog, room, decorationId, tile).fits) ??
    room.tiles[0] ??
    { x: 0, y: 0 }
  );
}

const styles = StyleSheet.create({
  full: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: "#9fd3d1" },
  screen: { flexGrow: 1, gap: 14, padding: 18, backgroundColor: "#9fd3d1" },
  title: { color: "#20312b", fontSize: 34, fontWeight: "900" },
  subtitle: { color: "#2f4a40", fontSize: 16, lineHeight: 22 },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#486355", borderRadius: 8, paddingHorizontal: 12, backgroundColor: "#fbf6e8", color: "#20312b", fontSize: 16 },
  label: { color: "#20312b", fontSize: 13, fontWeight: "800", textTransform: "uppercase" },
  primaryButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#20312b", paddingHorizontal: 14 },
  primaryButtonText: { color: "#fbf6e8", fontSize: 16, fontWeight: "900" },
  secondaryButton: { minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#486355", borderRadius: 8, backgroundColor: "#f7ead2", paddingHorizontal: 14 },
  secondaryButtonText: { color: "#20312b", fontSize: 15, fontWeight: "800" },
  headerButton: { minHeight: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#486355", borderRadius: 8, backgroundColor: "#f7ead2", paddingHorizontal: 12 },
  listButton: { minHeight: 40, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#486355" },
  listButtonText: { color: "#20312b", fontSize: 14, fontWeight: "700" },
  statusText: { color: "#536a5e", fontSize: 14, fontWeight: "700" },
  warningText: { color: "#9b4d42", fontSize: 13, fontWeight: "800" },
  mutedText: { color: "#536a5e", fontSize: 12, fontWeight: "700" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { minWidth: 82, borderWidth: 1, borderColor: "rgba(32,49,43,0.2)", borderRadius: 8, backgroundColor: "rgba(251,246,232,0.9)", padding: 9 },
  metricLabel: { color: "#536a5e", fontSize: 11, fontWeight: "800" },
  metricValue: { color: "#20312b", fontSize: 15, fontWeight: "900", textTransform: "capitalize" },
  menuGrid: { gap: 10 },
  farmScreen: { flex: 1, backgroundColor: "#9fd3d1" },
  scene: { flex: 1 },
  sceneOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingBottom: 8 },
  plotPicker: { gap: 8 },
  plotChip: { minHeight: 36, justifyContent: "center", borderRadius: 8, backgroundColor: "rgba(251,246,232,0.88)", paddingHorizontal: 10 },
  plotChipSelected: { minHeight: 36, justifyContent: "center", borderWidth: 2, borderColor: "#20312b", borderRadius: 8, backgroundColor: "#fff7d0", paddingHorizontal: 10 },
  plotChipText: { color: "#20312b", fontSize: 12, fontWeight: "900" },
  topHud: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bottomSheet: { maxHeight: "48%", gap: 10, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: "rgba(251,246,232,0.96)", padding: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  badge: { overflow: "hidden", borderRadius: 999, backgroundColor: "#20312b", color: "#fbf6e8", paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: "900", textTransform: "capitalize" },
  actionRow: { gap: 8 },
  inlineActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionButton: { minHeight: 40, justifyContent: "center", borderWidth: 1, borderColor: "#486355", borderRadius: 8, backgroundColor: "#fff7d0", paddingHorizontal: 12 },
  actionButtonText: { color: "#20312b", fontSize: 13, fontWeight: "900" },
  panel: { gap: 6, borderWidth: 1, borderColor: "rgba(32,49,43,0.18)", borderRadius: 8, backgroundColor: "rgba(255,247,208,0.55)", padding: 10 },
  subPanel: { gap: 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(32,49,43,0.18)", paddingTop: 6 },
  panelTitle: { color: "#20312b", fontSize: 15, fontWeight: "900" },
  bodyText: { color: "#2f4a40", fontSize: 13, fontWeight: "700" },
  diagnostics: { gap: 5, borderWidth: 1, borderColor: "rgba(32,49,43,0.18)", borderRadius: 8, backgroundColor: "rgba(251,246,232,0.72)", padding: 10 },
  diagnosticsCompact: { gap: 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(32,49,43,0.22)", paddingTop: 8 },
});
