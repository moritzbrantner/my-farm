import { itemName, recipeName, secondsRemaining, structureLabel } from "./selectors";
import type {
  AnimalShelterState,
  CatalogDocument,
  FarmCommand,
  FarmView,
  FieldPlot,
  ItemStack,
  MachineState,
} from "../types";
import type { StructureSelection } from "./selectors";

export type StructureMenuItem = {
  id: string;
  label: string;
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
  if (target.type === "machine") {
    const machine = view.machines.find((entry) => entry.id === target.id);
    return machine ? buildMachineMenu(catalog, view, machine, nowMs) : null;
  }
  if (target.type === "shelter") {
    const shelter = view.shelters.find((entry) => entry.id === target.id);
    return shelter ? buildShelterMenu(catalog, view, shelter, nowMs) : null;
  }
  return view.delivery_board_built
    ? {
        title: "Delivery Board",
        items: [
          { id: "view-orders", label: "View delivery orders" },
          { id: "move-structure", label: "Move Delivery Board", action: "move_structure" },
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
  if (!plot.crop) {
    return {
      title: "Field Plot",
      items: catalog.crops
        .filter((crop) => crop.unlock_level <= view.level)
        .map((crop) => {
          const missing = missingItems(catalog, view, [{ item_id: crop.item_id, quantity: 1 }]);
          const reason = missing.length > 0 ? `Need ${itemName(catalog, crop.item_id)}` : undefined;
          return {
            id: `plant-${crop.item_id}`,
            label: `Plant ${itemName(catalog, crop.item_id)}`,
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
      items: [{ id: "growing", label: "Growing", disabled: true, reason: `Ready in ${remaining}s` }],
    };
  }

  const cropDef = catalog.crops.find((crop) => crop.item_id === plot.crop?.item_id);
  const outputs = cropDef ? [{ item_id: plot.crop.item_id, quantity: cropDef.harvest_quantity }] : [];
  const storageFull = !hasStorageRoom(catalog, view, outputs);
  return {
    title: cropName,
    items: [
      {
        id: "harvest",
        label: "Harvest",
        disabled: storageFull,
        reason: storageFull ? "Storage full" : undefined,
        command: storageFull ? undefined : { type: "harvest_crop", plot_id: plot.id },
      },
    ],
  };
}

export function isStructureTargetPresent(view: FarmView, target: StructureSelection): boolean {
  if (target.type === "machine") {
    return view.machines.some((machine) => machine.id === target.id);
  }
  if (target.type === "shelter") {
    return view.shelters.some((shelter) => shelter.id === target.id);
  }
  return view.delivery_board_built;
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

  if (first) {
    const recipe = catalog.recipes.find((entry) => entry.id === first.recipe_id);
    const remaining = secondsRemaining(first.ready_at_ms, nowMs);
    const outputs = recipe?.outputs ?? [];
    const storageFull = remaining === 0 && !hasStorageRoom(catalog, view, outputs);
    items.push({
      id: `collect-${first.id}`,
      label: `Collect ${recipeName(catalog, first.recipe_id)}`,
      disabled: remaining > 0 || storageFull,
      reason: remaining > 0 ? `Ready in ${remaining}s` : storageFull ? "Storage full" : undefined,
      command:
        remaining === 0 && !storageFull
          ? { type: "collect_machine_job", machine_id: machine.id }
          : undefined,
    });
  } else {
    items.push({ id: "queue-empty", label: "Queue empty", disabled: true });
  }

  for (const recipe of catalog.recipes.filter((entry) => entry.machine_kind === machine.kind)) {
    const queueFull = queueLimit > 0 && machine.queue.length >= queueLimit;
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
      id: `make-${recipe.id}`,
      label: `Make ${recipe.name}`,
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
        label: `Move ${structureLabel(machine.kind)}`,
        action: "move_structure",
      },
    ],
  };
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
    if (animal.state.type === "idle") {
      const feedStack = shelterDef ? [{ item_id: shelterDef.feed_item_id, quantity: 1 }] : [];
      const missing = shelterDef ? missingItems(catalog, view, feedStack) : ["feed"];
      const reason = missing.length > 0 ? `Need ${missing.join(", ")}` : undefined;
      return {
        id: `feed-${animal.id}`,
        label: `Feed ${animalName} ${labelIndex}`,
        disabled: Boolean(reason),
        reason,
        command: reason
          ? undefined
          : { type: "feed_animal", shelter_id: shelter.id, animal_slot: animal.id },
      };
    }
    if (animal.state.type === "ready") {
      const storageFull = !hasStorageRoom(catalog, view, productStack);
      return {
        id: `collect-${animal.id}`,
        label: `Collect ${productName} from ${animalName} ${labelIndex}`,
        disabled: storageFull,
        reason: storageFull ? "Storage full" : undefined,
        command: storageFull
          ? undefined
          : { type: "collect_animal_product", shelter_id: shelter.id, animal_slot: animal.id },
      };
    }
    return {
      id: `producing-${animal.id}`,
      label: `${animalName} ${labelIndex}: Ready in ${secondsRemaining(animal.state.ready_at_ms, nowMs)}s`,
      disabled: true,
    };
  });

  return {
    title: shelterDef?.name ?? structureLabel(shelter.kind),
    subtitle: `${animalName}s - feed ${feedName}`,
    items: [
      ...animalItems,
      {
        id: "move-structure",
        label: `Move ${shelterDef?.name ?? structureLabel(shelter.kind)}`,
        action: "move_structure",
      },
    ],
  };
}

function inventoryMap(view: FarmView): Map<string, number> {
  return new Map(view.inventory.map((item) => [item.item_id, item.quantity]));
}

function itemKind(catalog: CatalogDocument, itemId: string) {
  return catalog.items.find((item) => item.id === itemId)?.kind;
}
