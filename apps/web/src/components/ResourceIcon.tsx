import type { ItemKind } from "../types";

type ResourceIconProps =
  | {
      type: "item";
      itemId: string;
      itemKind?: ItemKind;
    }
  | {
      type: "coins" | "xp" | "level" | "silo" | "barn";
    };

type IconMeta = {
  className: string;
  glyph: string;
};

export function ResourceIcon(props: ResourceIconProps) {
  const meta = props.type === "item" ? itemIconMeta(props.itemId, props.itemKind) : systemIconMeta(props.type);
  return (
    <span
      className={`resource-icon resource-icon--${meta.className}`}
      data-glyph={meta.glyph}
      aria-hidden="true"
    />
  );
}

function itemIconMeta(itemId: string, itemKind?: ItemKind): IconMeta {
  switch (itemId) {
    case "wheat":
      return { className: "wheat", glyph: "W" };
    case "corn":
      return { className: "corn", glyph: "C" };
    case "soybean":
      return { className: "soybean", glyph: "S" };
    case "carrot":
      return { className: "carrot", glyph: "Ca" };
    case "chicken_feed":
      return { className: "feed", glyph: "F" };
    case "cow_feed":
      return { className: "feed", glyph: "F" };
    case "egg":
      return { className: "egg", glyph: "E" };
    case "milk":
      return { className: "milk", glyph: "M" };
    case "bread":
      return { className: "bread", glyph: "B" };
    case "corn_bread":
      return { className: "corn-bread", glyph: "CB" };
  }

  switch (itemKind) {
    case "crop":
      return { className: "crop", glyph: "C" };
    case "feed":
      return { className: "feed", glyph: "F" };
    case "animal_product":
      return { className: "animal-product", glyph: "A" };
    case "product":
      return { className: "product", glyph: "P" };
    default:
      return { className: "item", glyph: "I" };
  }
}

function systemIconMeta(type: Exclude<ResourceIconProps["type"], "item">): IconMeta {
  switch (type) {
    case "coins":
      return { className: "coins", glyph: "$" };
    case "xp":
      return { className: "xp", glyph: "XP" };
    case "level":
      return { className: "level", glyph: "L" };
    case "silo":
      return { className: "silo", glyph: "S" };
    case "barn":
      return { className: "barn", glyph: "B" };
  }
}
