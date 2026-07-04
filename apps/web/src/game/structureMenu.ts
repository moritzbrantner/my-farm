import { itemName, recipeName, secondsRemaining, structureLabel } from "./selectors";
import { reservedAnimalReason, reservedFieldReason, reservedMachineReason, reservedOvenReason } from "./residentTasks";
import type {
  AnimalShelterState,
  CatalogDocument,
  FarmCommand,
  FarmView,
  FieldPlot,
  ItemKind,
  ItemStack,
  MachineState,
  StorageKind,
} from "../types";
import type { StructureSelection } from "./selectors";

export type StructureMenuItem = {
  id: string;
  label: string;
  icon?: {
    itemId: string;
    itemKind?: ItemKind;
  };
  disabled?: boolean;
  reason?: string;
  command?: FarmCommand;
  action?: "move_structure";
};

export type StructureMenuModel = {
  title: string;
  subtitle?: string;
  items: StructureMenuItem[];
};

export function buildStructureMenuModel(
  catalog: CatalogDocument,
  view: FarmView,
  target: StructureSelection,
  nowMs: number,
): StructureMenuModel | null {
  if (target.type === "farmhouse") {
    const ovenOwned = view.owned_farmhouse_upgrades.includes("oven");
    return {
      title: "Farmhouse",
      subtitle: ovenOwned ? ovenSubtitle(catalog, view) : undefined,
      items: ovenOwned ? ovenMenuItems(catalog, view, nowMs) : [farmhouseOvenItem(catalog, view)],
    };
  }
  if (target.type === "silo") {
    return {
      title: "Silo",
      subtitle: `${view.silo_used}/${view.silo_capacity} crops`,
      items: [
        { id: "move-structure", label: "Move", action: "move_structure" },
        storageUpgradeItem(catalog, view, "silo", "Silo", view.silo_capacity, view.silo_upgrade_tier),
      ],
    };
  }
  if (target.type === "barn") {
    return {
      title: "Barn",
      subtitle: `${view.barn_used}/${view.barn_capacity} goods`,
      items: [
        { id: "move-structure", label: "Move", action: "move_structure" },
        storageUpgradeItem(catalog, view, "barn", "Barn", view.barn_capacity, view.barn_upgrade_tier),
      ],
    };
  }
  if (target.type === "machine") {
    const machine = view.machines.find((entry) => entry.id === target.id);
    return machine ? buildMachineMenu(catalog, view, machine, nowMs) : null;
  }
  if (target.type === "shelter") {
    const shelter = view.shelters.find((entry) => entry.id === target.id);
    return shelter ? buildShelterMenu(catalog, view, shelter, nowMs) : null;
  }
  if (target.type === "tool_shed") {
    return view.tool_shed?.id === target.id
      ? {
          title: "Tool Shed",
          items: [{ id: "move-structure", label: "Move", action: "move_structure" }],
        }
      : null;
  }
  return view.delivery_board_built
    ? {
        title: "Delivery Board",
        items: [
          { id: "view-orders", label: "View delivery orders" },
          { id: "move-structure", label: "Move", action: "move_structure" },
        ],
      }
    : null;
}

export function buildFieldMenuModel(
  catalog: CatalogDocument,
  view: FarmView,
  plot: FieldPlot,
  nowMs: number,
): StructureMenuModel {
  const reservedReason = reservedFieldReason(view, plot.id);
  if (!plot.crop) {
    return {
      title: "Field Plot",
      items: catalog.crops
        .filter((crop) => crop.unlock_level <= view.level)
        .map((crop) => {
          const missing = missingItems(catalog, view, [{ item_id: crop.item_id, quantity: 1 }]);
          const reason = reservedReason ?? (missing.length > 0 ? `Need ${itemName(catalog, crop.item_id)}` : undefined);
          return {
            id: `plant-${crop.item_id}`,
            label: itemName(catalog, crop.item_id),
            icon: itemIcon(catalog, crop.item_id),
            disabled: Boolean(reason),
            reason,
            command: reason
              ? undefined
              : { type: "plant_crop", plot_id: plot.id, crop_id: crop.item_id },
          };
        }),
    };
  }

  const cropName = itemName(catalog, plot.crop.item_id);
  const remaining = secondsRemaining(plot.crop.ready_at_ms, nowMs);
  if (remaining > 0) {
    return {
      title: cropName,
      items: [
        {
          id: "growing",
          label: "Growing",
          icon: itemIcon(catalog, plot.crop.item_id),
          disabled: true,
          reason: `${remaining}s`,
        },
      ],
    };
  }

  const cropDef = catalog.crops.find((crop) => crop.item_id === plot.crop?.item_id);
  const outputs = cropDef ? [{ item_id: plot.crop.item_id, quantity: cropDef.harvest_quantity }] : [];
  const storageFull = !hasStorageRoom(catalog, view, outputs);
  const reason = reservedReason ?? (storageFull ? "Storage full" : undefined);
  return {
    title: cropName,
    items: [
      {
        id: "harvest",
        label: "Harvest",
        icon: itemIcon(catalog, plot.crop.item_id),
        disabled: Boolean(reason),
        reason,
        command: reason ? undefined : { type: "harvest_crop", plot_id: plot.id },
      },
    ],
  };
}

export function isStructureTargetPresent(view: FarmView, target: StructureSelection): boolean {
  if (target.type === "farmhouse") {
    return true;
  }
  if (target.type === "silo" || target.type === "barn") {
    return true;
  }
  if (target.type === "machine") {
    return view.machines.some((machine) => machine.id === target.id);
  }
  if (target.type === "shelter") {
    return view.shelters.some((shelter) => shelter.id === target.id);
  }
  if (target.type === "tool_shed") {
    return view.tool_shed?.id === target.id;
  }
  return view.delivery_board_built;
}

function farmhouseOvenItem(catalog: CatalogDocument, view: FarmView): StructureMenuItem {
  const oven = catalog.farmhouse_upgrades.find((upgrade) => upgrade.kind === "oven");
  const reason = farmhouseOvenDisabledReason(catalog, view);
  return {
    id: "buy-farmhouse-oven",
    label: "Buy Oven",
    disabled: Boolean(reason),
    reason,
    command:
      oven && !reason
        ? { type: "buy_farmhouse_upgrade", upgrade_kind: "oven" }
        : undefined,
  };
}

export function farmhouseOvenDisabledReason(
  catalog: CatalogDocument,
  view: FarmView,
): string | undefined {
  const oven = catalog.farmhouse_upgrades.find((upgrade) => upgrade.kind === "oven");
  if (!oven) {
    return "Unavailable";
  }
  if (view.owned_farmhouse_upgrades.includes("oven")) {
    return "Already owned";
  }
  if (view.level < oven.unlock_level) {
    return `Unlocks at level ${oven.unlock_level}`;
  }
  if (view.coins < oven.cost_coins) {
    return `Need ${oven.cost_coins - view.coins} coins`;
  }
  return undefined;
}

export function hasRequiredItems(view: FarmView, stacks: ItemStack[]): boolean {
  const inventory = inventoryMap(view);
  return stacks.every((stack) => (inventory.get(stack.item_id) ?? 0) >= stack.quantity);
}

export function missingItems(
  catalog: CatalogDocument,
  view: FarmView,
  stacks: ItemStack[],
): string[] {
  const inventory = inventoryMap(view);
  return stacks.flatMap((stack) => {
    const missing = stack.quantity - (inventory.get(stack.item_id) ?? 0);
    return missing > 0 ? [`${itemName(catalog, stack.item_id)} x${missing}`] : [];
  });
}

export function hasStorageRoom(
  catalog: CatalogDocument,
  view: FarmView,
  stacks: ItemStack[],
): boolean {
  const cropAdd = stacks
    .filter((stack) => itemKind(catalog, stack.item_id) === "crop")
    .reduce((total, stack) => total + stack.quantity, 0);
  const barnAdd = stacks
    .filter((stack) => itemKind(catalog, stack.item_id) !== "crop")
    .reduce((total, stack) => total + stack.quantity, 0);
  return view.silo_used + cropAdd <= view.silo_capacity && view.barn_used + barnAdd <= view.barn_capacity;
}

function buildMachineMenu(
  catalog: CatalogDocument,
  view: FarmView,
  machine: MachineState,
  nowMs: number,
): StructureMenuModel {
  const machineDef = catalog.machines.find((entry) => entry.kind === machine.kind);
  const queueLimit = machineDef?.queue_limit ?? 0;
  const items: StructureMenuItem[] = [];
  const first = machine.queue[0];
  const reservedReason = reservedMachineReason(view, machine.id);

  if (first) {
    const recipe = catalog.recipes.find((entry) => entry.id === first.recipe_id);
    const remaining = secondsRemaining(first.ready_at_ms, nowMs);
    const outputs = recipe?.outputs ?? [];
    const storageFull = remaining === 0 && !hasStorageRoom(catalog, view, outputs);
    const reason = reservedReason ?? (remaining > 0 ? `${remaining}s` : storageFull ? "Storage full" : undefined);
    items.push({
      id: `collect-${first.id}`,
      label: `Collect ${recipeName(catalog, first.recipe_id)}`,
      icon: outputs[0] ? itemIcon(catalog, outputs[0].item_id) : undefined,
      disabled: Boolean(reason),
      reason,
      command: reason ? undefined : { type: "collect_machine_job", machine_id: machine.id },
    });
  } else {
    items.push({ id: "queue-empty", label: "Queue empty", disabled: true });
  }

  for (const recipe of catalog.recipes.filter(
    (entry) => entry.target.type === "machine" && entry.target.machine_kind === machine.kind,
  )) {
    const queueFull = queueLimit > 0 && machine.queue.length >= queueLimit;
    const missing = missingItems(catalog, view, recipe.inputs);
    const locked = recipe.unlock_level > view.level;
    const reason = locked
      ? `Unlocks at level ${recipe.unlock_level}`
      : reservedReason
        ? reservedReason
        : queueFull
        ? "Queue full"
        : missing.length > 0
          ? `Need ${missing.join(", ")}`
          : undefined;
    items.push({
      id: `make-${recipe.id}`,
      label: recipe.name,
      icon: recipe.outputs[0] ? itemIcon(catalog, recipe.outputs[0].item_id) : undefined,
      disabled: Boolean(reason),
      reason,
      command: reason
        ? undefined
        : { type: "queue_recipe", machine_id: machine.id, recipe_id: recipe.id },
    });
  }

  return {
    title: structureLabel(machine.kind),
    subtitle: `Queue ${machine.queue.length}/${queueLimit}`,
    items: [
      ...items,
      {
        id: "move-structure",
        label: "Move",
        action: "move_structure",
      },
    ],
  };
}

function ovenSubtitle(catalog: CatalogDocument, view: FarmView) {
  const queueLimit = catalog.farmhouse_upgrades.find((upgrade) => upgrade.kind === "oven")?.queue_limit ?? 0;
  return `Oven queue ${view.oven.queue.length}/${queueLimit}`;
}

function ovenMenuItems(catalog: CatalogDocument, view: FarmView, nowMs: number): StructureMenuItem[] {
  const queueLimit = catalog.farmhouse_upgrades.find((upgrade) => upgrade.kind === "oven")?.queue_limit ?? 0;
  const items: StructureMenuItem[] = [];
  const first = view.oven.queue[0];
  const reservedReason = reservedOvenReason(view);

  if (first) {
    const recipe = catalog.recipes.find((entry) => entry.id === first.recipe_id);
    const outputs = recipe?.outputs ?? [];
    const remaining = first.status === "pending_start" ? 0 : secondsRemaining(first.ready_at_ms, nowMs);
    const storageFull = first.status !== "pending_start" && remaining === 0 && !hasStorageRoom(catalog, view, outputs);
    const reason =
      first.status === "pending_start"
        ? "Starting"
        : reservedReason ?? (remaining > 0 ? `${remaining}s` : storageFull ? "Storage full" : undefined);
    items.push({
      id: `collect-oven-${first.id}`,
      label: `Collect ${recipeName(catalog, first.recipe_id)}`,
      icon: outputs[0] ? itemIcon(catalog, outputs[0].item_id) : undefined,
      disabled: Boolean(reason),
      reason,
      command: reason ? undefined : { type: "collect_oven_job" },
    });
  } else {
    items.push({ id: "oven-queue-empty", label: "Oven queue empty", disabled: true });
  }

  for (const recipe of catalog.recipes.filter((entry) => entry.target.type === "oven")) {
    const queueFull = queueLimit > 0 && view.oven.queue.length >= queueLimit;
    const missing = missingItems(catalog, view, recipe.inputs);
    const locked = recipe.unlock_level > view.level;
    const reason = locked
      ? `Unlocks at level ${recipe.unlock_level}`
      : queueFull
        ? "Queue full"
        : missing.length > 0
          ? `Need ${missing.join(", ")}`
          : undefined;
    items.push({
      id: `make-oven-${recipe.id}`,
      label: recipe.name,
      icon: recipe.outputs[0] ? itemIcon(catalog, recipe.outputs[0].item_id) : undefined,
      disabled: Boolean(reason),
      reason,
      command: reason ? undefined : { type: "queue_oven_recipe", recipe_id: recipe.id },
    });
  }

  return items;
}

function buildShelterMenu(
  catalog: CatalogDocument,
  view: FarmView,
  shelter: AnimalShelterState,
  nowMs: number,
): StructureMenuModel {
  const shelterDef = catalog.shelters.find((entry) => entry.kind === shelter.kind);
  const animalName = shelterDef?.animal_name ?? "Animal";
  const feedName = shelterDef ? itemName(catalog, shelterDef.feed_item_id) : "Feed";
  const productName = shelterDef ? itemName(catalog, shelterDef.product_item_id) : "Product";
  const productStack = shelterDef ? [{ item_id: shelterDef.product_item_id, quantity: 1 }] : [];
  const animalItems: StructureMenuItem[] = shelter.animals.map((animal, index) => {
    const labelIndex = index + 1;
    const reservedReason = reservedAnimalReason(view, shelter.id, animal.id);
    if (animal.state.type === "idle") {
      const feedStack = shelterDef ? [{ item_id: shelterDef.feed_item_id, quantity: 1 }] : [];
      const missing = shelterDef ? missingItems(catalog, view, feedStack) : ["feed"];
      const reason = reservedReason ?? (missing.length > 0 ? `Need ${missing.join(", ")}` : undefined);
      return {
        id: `feed-${animal.id}`,
        label: `Feed ${animalName} ${labelIndex}`,
        icon: shelterDef ? itemIcon(catalog, shelterDef.feed_item_id) : undefined,
        disabled: Boolean(reason),
        reason,
        command: reason
          ? undefined
          : { type: "feed_animal", shelter_id: shelter.id, animal_slot: animal.id },
      };
    }
    if (animal.state.type === "ready") {
      const storageFull = !hasStorageRoom(catalog, view, productStack);
      const reason = reservedReason ?? (storageFull ? "Storage full" : undefined);
      return {
        id: `collect-${animal.id}`,
        label: `Collect ${productName} from ${animalName} ${labelIndex}`,
        icon: shelterDef ? itemIcon(catalog, shelterDef.product_item_id) : undefined,
        disabled: Boolean(reason),
        reason,
        command: reason ? undefined : { type: "collect_animal_product", shelter_id: shelter.id, animal_slot: animal.id },
      };
    }
    return {
      id: `producing-${animal.id}`,
      label: `${animalName} ${labelIndex} producing ${productName}`,
      icon: shelterDef ? itemIcon(catalog, shelterDef.product_item_id) : undefined,
      reason: `${secondsRemaining(animal.state.ready_at_ms, nowMs)}s`,
      disabled: true,
    };
  });

  return {
    title: shelterDef?.name ?? structureLabel(shelter.kind),
    subtitle: `${shelter.animals.length} ${pluralize(animalName, shelter.animals.length)} - feed ${feedName}`,
    items: [
      ...animalItems,
      {
        id: "move-structure",
        label: "Move",
        action: "move_structure",
      },
    ],
  };
}

function storageUpgradeItem(
  catalog: CatalogDocument,
  view: FarmView,
  storageKind: StorageKind,
  label: string,
  currentCapacity: number,
  currentTier: number,
): StructureMenuItem {
  const nextTier = currentTier + 1;
  const next = catalog.storage_upgrades.find(
    (upgrade) => upgrade.storage_kind === storageKind && upgrade.tier === nextTier,
  );
  if (!next) {
    return {
      id: `upgrade-${storageKind}`,
      label: `Upgrade ${label}`,
      disabled: true,
      reason: "Fully upgraded",
    };
  }

  if (view.level < next.unlock_level) {
    return {
      id: `upgrade-${storageKind}`,
      label: `Upgrade ${label}`,
      disabled: true,
      reason: `Unlocks at level ${next.unlock_level}`,
    };
  }

  if (view.coins < next.cost_coins) {
    return {
      id: `upgrade-${storageKind}`,
      label: `Upgrade ${label}`,
      disabled: true,
      reason: `Need ${next.cost_coins - view.coins} coins`,
    };
  }

  return {
    id: `upgrade-${storageKind}`,
    label: `Upgrade ${label}`,
    reason: `${next.cost_coins} coins - Capacity ${currentCapacity} -> ${Math.max(
      currentCapacity,
      next.capacity,
    )}`,
    command: { type: "upgrade_storage", storage_kind: storageKind },
  };
}

function inventoryMap(view: FarmView): Map<string, number> {
  return new Map(view.inventory.map((item) => [item.item_id, item.quantity]));
}

function itemKind(catalog: CatalogDocument, itemId: string) {
  return catalog.items.find((item) => item.id === itemId)?.kind;
}

function itemIcon(catalog: CatalogDocument, itemId: string) {
  return {
    itemId,
    itemKind: itemKind(catalog, itemId),
  };
}

function pluralize(name: string, count: number) {
  return count === 1 ? name : `${name}s`;
}
