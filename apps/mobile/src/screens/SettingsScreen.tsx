import { ScrollView, Text, TextInput } from "react-native";
import { DiagnosticsPanel, Header, PrimaryButton, SecondaryButton } from "../components/ui";
import { styles } from "../styles";
import type { ShellProps } from "../types";

export function SettingsScreen({
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
      <Text style={styles.label}>Farm Server</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="url"
        onChangeText={onChangeServerUrl}
        style={styles.input}
        value={serverUrl}
      />
      <PrimaryButton label="Reconnect" onPress={onConnect} />
      <SecondaryButton label="Clear Server Profile" onPress={onResetServerProfile} />
      <DiagnosticsPanel status={status} serverUrl={serverUrl} diagnostics={diagnostics} />
      <Text style={styles.statusText}>{message}</Text>
    </ScrollView>
  );
}

