import { useState } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import type { Selection } from "@my-farm/game-model";
import { styles } from "./styles";
import { useMobileFarmRuntime } from "./state/useMobileFarmRuntime";
import { ConnectScreen } from "./screens/ConnectScreen";
import { FarmScreen } from "./screens/FarmScreen";
import { HouseScreen } from "./screens/HouseScreen";
import { MainMenuScreen } from "./screens/MainMenuScreen";
import { MarketScreen } from "./screens/MarketScreen";
import { OrdersScreen } from "./screens/OrdersScreen";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { ResidentsScreen } from "./screens/ResidentsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { WikiScreen } from "./screens/WikiScreen";
import type { ShellProps } from "./types";

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
  const runtime = useMobileFarmRuntime();
  const [selection, setSelection] = useState<Selection>(null);
  const shellProps: ShellProps = {
    serverUrl: runtime.serverUrl,
    status: runtime.status,
    message: runtime.message,
    catalog: runtime.catalog,
    farm: runtime.farm,
    diagnostics: runtime.diagnostics,
    nowMs: runtime.nowMs,
    onNavigate: runtime.setScreen,
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {runtime.screen === "connect" ? (
        <ConnectScreen
          serverUrl={runtime.serverUrl}
          recentServerUrls={runtime.recentServerUrls}
          status={runtime.status}
          message={runtime.message}
          onChangeServerUrl={runtime.setServerUrl}
          onConnect={runtime.connect}
          onPickRecent={runtime.setServerUrl}
        />
      ) : null}
      {runtime.screen === "menu" ? (
        <MainMenuScreen
          {...shellProps}
          onStartFarm={() => runtime.setScreen("farm")}
          onNewFarm={runtime.resetFarm}
        />
      ) : null}
      {runtime.screen === "settings" ? (
        <SettingsScreen
          {...shellProps}
          onChangeServerUrl={runtime.setServerUrl}
          onConnect={runtime.connect}
          onResetServerProfile={runtime.resetServerProfile}
        />
      ) : null}
      {runtime.screen === "farm" && runtime.catalog && runtime.farm ? (
        <FarmScreen
          {...shellProps}
          catalog={runtime.catalog}
          farm={runtime.farm}
          selection={selection}
          onSelect={setSelection}
          onSendCommand={runtime.send}
          onResetFarm={runtime.resetFarm}
        />
      ) : null}
      {runtime.screen === "residents" && runtime.catalog && runtime.farm ? (
        <ResidentsScreen
          {...shellProps}
          catalog={runtime.catalog}
          farm={runtime.farm}
          onSendCommand={runtime.send}
        />
      ) : null}
      {runtime.screen === "market" && runtime.catalog && runtime.farm ? (
        <MarketScreen
          {...shellProps}
          catalog={runtime.catalog}
          farm={runtime.farm}
          onSendCommand={runtime.send}
        />
      ) : null}
      {runtime.screen === "orders" && runtime.catalog && runtime.farm ? (
        <OrdersScreen
          {...shellProps}
          catalog={runtime.catalog}
          farm={runtime.farm}
          onSendCommand={runtime.send}
        />
      ) : null}
      {runtime.screen === "house" && runtime.catalog && runtime.farm ? (
        <HouseScreen
          {...shellProps}
          catalog={runtime.catalog}
          farm={runtime.farm}
          onSendCommand={runtime.send}
        />
      ) : null}
      {runtime.screen === "wiki" ? <WikiScreen {...shellProps} /> : null}
      {runtime.screen === "account" ? (
        <PlaceholderScreen
          {...shellProps}
          title="Account"
          body="Accounts are out of scope for the local mobile client."
        />
      ) : null}
    </SafeAreaView>
  );
}

