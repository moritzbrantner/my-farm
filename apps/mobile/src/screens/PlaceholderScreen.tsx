import { Text, View } from "react-native";
import { Header } from "../components/ui";
import { styles } from "../styles";
import type { ShellProps } from "../types";

export function PlaceholderScreen({
  title,
  body,
  message,
  onNavigate,
}: ShellProps & {
  title: string;
  body: string;
}) {
  return (
    <View style={styles.screen}>
      <Header title={title} onBack={() => onNavigate("menu")} />
      <Text style={styles.subtitle}>{body}</Text>
      <Text style={styles.statusText}>{message}</Text>
    </View>
  );
}

