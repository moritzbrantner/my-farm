import { describe, expect, test } from "bun:test";
import { wheatAppearanceForCrop } from "./cropAppearance";

const wheat = { item_id: "wheat", planted_at_ms: 1_000, ready_at_ms: 11_000 };

describe("authoritative Wheat appearance mapping", () => {
  test("empty and other Crop plots never gain a Wheat model", () => {
    expect(wheatAppearanceForCrop(null, 100_000)).toBeNull();
    expect(wheatAppearanceForCrop({ ...wheat, item_id: "corn" }, 11_000)).toBeNull();
  });
  test("maps planted, growing, and ready timestamps without new saved state", () => {
    expect(wheatAppearanceForCrop(wheat, 1_000)).toBe("early");
    expect(wheatAppearanceForCrop(wheat, 6_499)).toBe("early");
    expect(wheatAppearanceForCrop(wheat, 6_500)).toBe("mature");
    expect(wheatAppearanceForCrop(wheat, 10_999)).toBe("mature");
    expect(wheatAppearanceForCrop(wheat, 11_000)).toBe("ready");
    expect(wheatAppearanceForCrop(wheat, 20_000)).toBe("ready");
  });
  test("handles clock rewind and invalid duration conservatively", () => {
    expect(wheatAppearanceForCrop(wheat, 0)).toBe("early");
    expect(wheatAppearanceForCrop({ ...wheat, ready_at_ms: 1_000 }, 1_000)).toBe("ready");
  });
});
