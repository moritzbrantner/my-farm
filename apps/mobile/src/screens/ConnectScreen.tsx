import { Pressable, Text, TextInput, View } from "react-native";
import type { FarmConnectionStatus } from "@my-farm/game-client";
import { PrimaryButton } from "../components/ui";
import { styles } from "../styles";

export function ConnectScreen({
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
      <Text style={styles.subtitle}>Connect to the Rust Farm server on this device or your local network.</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="url"
        onChangeText={onChangeServerUrl}
        placeholder="http://192.168.1.10:8081"
        style={styles.input}
        value={serverUrl}
      />
      <PrimaryButton
        label={status === "reconnecting" ? "Connecting" : "Connect"}
        onPress={onConnect}
        disabled={status === "reconnecting"}
      />
      <Text style={styles.statusText}>{message}</Text>
      {recentServerUrls.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Recent Servers</Text>
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

