import { ScrollView, Text, View } from "react-native";
import { basicFarmScenarios } from "@my-farm/game-model/basicFarmScenarios";
import { Header } from "../components/ui";
import { styles } from "../styles";
import type { ShellProps } from "../types";

export function WikiScreen({ catalog, farm, onNavigate }: ShellProps) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header title="Wiki" onBack={() => onNavigate("menu")} />
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Farm Status</Text>
        <Text style={styles.bodyText}>Level {farm?.view.level ?? 1}</Text>
        <Text style={styles.bodyText}>
          Unlocks: {farm?.view.unlocks.filter((unlock) => unlock.unlocked).map((unlock) => unlock.label).join(", ") || "Fresh Farm"}
        </Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Scenarios</Text>
        {basicFarmScenarios.map((scenario) => (
          <View key={scenario.id} style={styles.subPanel}>
            <Text style={styles.bodyText}>
              {scenario.number}. {scenario.title}
            </Text>
            <Text style={styles.mutedText}>{scenario.summary}</Text>
            <Text style={styles.mutedText}>Terms: {scenario.relatedTerms.join(", ")}</Text>
          </View>
        ))}
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Crops</Text>
        {catalog?.crops.map((crop) => (
          <Text key={crop.item_id} style={styles.bodyText}>
            {catalog.items.find((item) => item.id === crop.item_id)?.name ?? crop.item_id} - level {crop.unlock_level}
          </Text>
        ))}
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Recipes</Text>
        {catalog?.recipes.map((recipe) => (
          <Text key={recipe.id} style={styles.bodyText}>
            {recipe.name} - level {recipe.unlock_level}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

