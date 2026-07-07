import { Text, View } from "react-native";
import { Metric, NavButton, PrimaryButton, SecondaryButton } from "../components/ui";
import { styles } from "../styles";
import type { ShellProps } from "../types";

export function MainMenuScreen({
  farm,
  status,
  message,
  onNavigate,
  onStartFarm,
  onNewFarm,
}: ShellProps & {
  onStartFarm(): void;
  onNewFarm(): void;
}) {
  return (
    <View style={styles.mainMenuScreen}>
      <View style={styles.mainMenuPanel}>
        <View>
          <Text style={styles.mainMenuEyebrow}>{status === "synced" ? "Local Farm" : "Farm Server"}</Text>
          <Text style={styles.title}>My Farm</Text>
        </View>
      <View style={styles.mainMenuStats}>
        <Metric label="Level" value={`${farm?.view.level ?? 1}`} />
        <Metric label="Coins" value={`${farm?.view.coins ?? 0}`} />
        <Metric label="Silo" value={`${farm?.view.silo_used ?? 0}/${farm?.view.silo_capacity ?? 40}`} />
        <Metric label="Barn" value={`${farm?.view.barn_used ?? 0}/${farm?.view.barn_capacity ?? 30}`} />
      </View>
      <View style={styles.mainMenuActions}>
        <PrimaryButton label="Start Farm" onPress={onStartFarm} disabled={!farm} />
        <SecondaryButton label="New Farm" onPress={onNewFarm} />
      </View>
      <View style={styles.mainMenuOptions}>
        <NavButton label="Settings" onPress={() => onNavigate("settings")} />
        <NavButton label="Wiki" onPress={() => onNavigate("wiki")} />
        <NavButton label="Farmers Market" onPress={() => onNavigate("market")} />
        <NavButton label="Account" onPress={() => onNavigate("account")} />
      </View>
      <Text style={styles.statusText}>{message}</Text>
      </View>
    </View>
  );
}
