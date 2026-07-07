import { ScrollView, Text, View } from "react-native";
import type { CatalogDocument, FarmResponse } from "@my-farm/contracts";
import { itemName } from "@my-farm/game-model";
import { ActionButton, Header } from "../components/ui";
import { styles } from "../styles";
import type { CommandSender, ShellProps } from "../types";

export function OrdersScreen({
  catalog,
  farm,
  message,
  onNavigate,
  onSendCommand,
}: ShellProps & {
  catalog: CatalogDocument;
  farm: FarmResponse;
  onSendCommand: CommandSender;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header title="Delivery Orders" onBack={() => onNavigate("farm")} />
      <Text style={styles.statusText}>{message}</Text>
      {farm.view.delivery_orders.length === 0 ? (
        <Text style={styles.bodyText}>Build the Delivery Board at level 4.</Text>
      ) : null}
      {farm.view.delivery_orders.map((order) => (
        <View key={order.id} style={styles.panel}>
          <Text style={styles.panelTitle}>{order.id}</Text>
          <Text style={styles.bodyText}>
            {order.requirements.map((stack) => `${stack.quantity} ${itemName(catalog, stack.item_id)}`).join(", ")}
          </Text>
          <Text style={styles.bodyText}>
            {order.reward_coins} coins - {order.reward_xp} XP
          </Text>
          <View style={styles.inlineActions}>
            <ActionButton
              label="Fulfill"
              onPress={() => onSendCommand({ type: "fulfill_delivery_order", order_id: order.id })}
            />
            <ActionButton
              label="Discard"
              onPress={() => onSendCommand({ type: "discard_delivery_order", order_id: order.id })}
            />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

