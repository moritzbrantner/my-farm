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
    <View style={styles.screen}>
      <Text style={styles.title}>My Farm</Text>
      <Text style={styles.subtitle}>Native Expo client</Text>
      <View style={styles.metricsRow}>
        <Metric label="Connection" value={status} />
        <Metric label="Level" value={`${farm?.view.level ?? 1}`} />
        <Metric label="Coins" value={`${farm?.view.coins ?? 0}`} />
      </View>
      <PrimaryButton label="Start Farm" onPress={onStartFarm} disabled={!farm} />
      <SecondaryButton label="New Farm" onPress={onNewFarm} />
      <View style={styles.menuGrid}>
        <NavButton label="Settings" onPress={() => onNavigate("settings")} />
        <NavButton label="Wiki" onPress={() => onNavigate("wiki")} />
        <NavButton label="Account" onPress={() => onNavigate("account")} />
      </View>
      <Text style={styles.statusText}>{message}</Text>
    </View>
  );
}

