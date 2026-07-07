import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import type { CatalogDocument, FarmResponse } from "@my-farm/contracts";
import { itemName } from "@my-farm/game-model";
import { ActionButton, Header } from "../components/ui";
import { styles } from "../styles";
import type { CommandSender, ShellProps } from "../types";
import { inventoryItem, nextFarmShopPrice } from "../utils/farm";

export function MarketScreen({
  catalog,
  farm,
  message,
  nowMs,
  onNavigate,
  onSendCommand,
}: ShellProps & {
  catalog: CatalogDocument;
  farm: FarmResponse;
  onSendCommand: CommandSender;
}) {
  const view = farm.view;
  const sellable = catalog.market_items.filter((item) => item.unlock_level <= view.level);
  const shop = view.farm_shop;
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!shop) {
      return;
    }
    setPriceDrafts((current) => {
      const next = { ...current };
      for (const price of shop.prices) {
        if (next[price.item_id] === undefined) {
          next[price.item_id] = `${price.price}`;
        }
      }
      return next;
    });
  }, [shop]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header title="Market" onBack={() => onNavigate("farm")} />
      <Text style={styles.statusText}>{message}</Text>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Farm Shop</Text>
        <Text style={styles.bodyText}>
          {shop ? `Shop Stock ${shop.stock.reduce((sum, item) => sum + item.quantity, 0)}/${shop.stock_capacity}` : "Build the Farm Shop by the road."}
        </Text>
        {shop ? (
          <Text style={styles.bodyText}>
            Customer Visits: {shop.visit_count} - next in {Math.max(0, Math.ceil((shop.next_customer_visit_at_ms - nowMs) / 1000))}s
          </Text>
        ) : null}
        {shop?.current_sale ? (
          <Text style={styles.bodyText}>
            Shop Sale: {itemName(catalog, shop.current_sale.item_id)} x{shop.current_sale.quantity} for {shop.current_sale.coins_gained} coins
          </Text>
        ) : null}
        {shop?.current_rejection ? (
          <Text style={styles.warningText}>
            Customer Rejection: {itemName(catalog, shop.current_rejection.item_id)} at {shop.current_rejection.shop_price} coins
          </Text>
        ) : null}
      </View>
      {sellable.map((marketItem) => {
        const inventory = inventoryItem(view, marketItem.item_id);
        const stock = shop?.stock.find((item) => item.item_id === marketItem.item_id);
        const price = shop?.prices.find((entry) => entry.item_id === marketItem.item_id);
        const draft = priceDrafts[marketItem.item_id] ?? `${price?.price ?? marketItem.sell_price ?? 1}`;
        const parsedDraft = Number.parseInt(draft, 10);
        const setPriceDisabled = !shop || !price || !Number.isFinite(parsedDraft);
        return (
          <View key={marketItem.item_id} style={styles.panel}>
            <Text style={styles.panelTitle}>{itemName(catalog, marketItem.item_id)}</Text>
            <Text style={styles.bodyText}>
              Storage: {inventory?.available_quantity ?? inventory?.quantity ?? 0}
              {inventory?.reserved_quantity ? ` (${inventory.reserved_quantity} reserved)` : ""}
            </Text>
            <Text style={styles.bodyText}>Shop Stock: {stock?.quantity ?? 0}</Text>
            {price ? (
              <Text style={styles.bodyText}>
                Shop Price: {price.price} coins - sale chance {Math.round(price.sale_chance_bps / 100)}%
              </Text>
            ) : null}
            <View style={styles.inlineActions}>
              {marketItem.buy_price !== null ? (
                <ActionButton
                  label={`Buy ${marketItem.buy_price}`}
                  onPress={() => onSendCommand({ type: "buy_market_item", item_id: marketItem.item_id, quantity: 1 })}
                />
              ) : null}
              {marketItem.sell_price !== null ? (
                <ActionButton
                  label={`Sell ${marketItem.sell_price}`}
                  onPress={() => onSendCommand({ type: "sell_market_item", item_id: marketItem.item_id, quantity: 1 })}
                />
              ) : null}
              <ActionButton
                label="Stock"
                disabled={!shop}
                onPress={() => onSendCommand({ type: "stock_farm_shop", item_id: marketItem.item_id, quantity: 1 })}
              />
              <ActionButton
                label="Return"
                disabled={!shop}
                onPress={() => onSendCommand({ type: "unstock_farm_shop", item_id: marketItem.item_id, quantity: 1 })}
              />
            </View>
            {price ? (
              <View style={styles.subPanel}>
                <Text style={styles.label}>Shop Price</Text>
                <TextInput
                  inputMode="numeric"
                  keyboardType="number-pad"
                  onChangeText={(value) => setPriceDrafts((current) => ({ ...current, [marketItem.item_id]: value }))}
                  style={styles.input}
                  value={draft}
                />
                <View style={styles.inlineActions}>
                  <ActionButton
                    label="-1"
                    onPress={() =>
                      setPriceDrafts((current) => ({
                        ...current,
                        [marketItem.item_id]: `${nextFarmShopPrice(Number.parseInt(draft, 10) || price.price, -1, price.max_price)}`,
                      }))
                    }
                  />
                  <ActionButton
                    label="+1"
                    onPress={() =>
                      setPriceDrafts((current) => ({
                        ...current,
                        [marketItem.item_id]: `${nextFarmShopPrice(Number.parseInt(draft, 10) || price.price, 1, price.max_price)}`,
                      }))
                    }
                  />
                  <ActionButton
                    label="Set Price"
                    disabled={setPriceDisabled}
                    onPress={() =>
                      onSendCommand({
                        type: "set_farm_shop_price",
                        item_id: marketItem.item_id,
                        price: parsedDraft,
                      })
                    }
                  />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

