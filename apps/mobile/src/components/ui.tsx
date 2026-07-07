import { Pressable, Text, View } from "react-native";
import type { FarmConnectionStatus } from "@my-farm/game-client";
import { styles } from "../styles";
import type { Diagnostics } from "../types";

export function Header({ title, onBack }: { title: string; onBack(): void }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Pressable style={styles.headerButton} onPress={onBack}>
        <Text style={styles.secondaryButtonText}>Back</Text>
      </Pressable>
    </View>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function NavButton({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable style={styles.secondaryButton} onPress={onPress}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function ActionButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.actionButton, disabled ? styles.disabledButton : null]}
      onPress={onPress}
    >
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.primaryButton, disabled ? styles.disabledButton : null]}
      onPress={onPress}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.secondaryButton, disabled ? styles.disabledButton : null]}
      onPress={onPress}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function DiagnosticsPanel({
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
      <Text style={styles.bodyText}>Last Command: {diagnostics.lastCommandLatencyMs ?? "-"}ms</Text>
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const width = `${Math.max(0, Math.min(1, value)) * 100}%` as const;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width }]} />
    </View>
  );
}

