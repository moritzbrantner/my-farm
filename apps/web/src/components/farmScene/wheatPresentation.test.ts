import { describe, expect, test } from "bun:test";
import { WHEAT_STALK_POSITIONS, WHEAT_STALK_SCALE, wheatWindRotation } from "./wheatPresentation";

describe("readable but bounded Wheat Field Plot presentation", () => {
  test("renders a dense, fixed patch of generated Wheat inside the Field Plot", () => {
    expect(WHEAT_STALK_POSITIONS.length).toBe(16);
    expect(new Set(WHEAT_STALK_POSITIONS.map(([x, z]) => `${x},${z}`)).size).toBe(16);
    for (const [x, z, yaw] of WHEAT_STALK_POSITIONS) {
      expect(Math.abs(x)).toBeLessThanOrEqual(0.22);
      expect(Math.abs(z)).toBeLessThanOrEqual(0.23);
      expect(Number.isFinite(yaw)).toBe(true);
    }
    expect(WHEAT_STALK_SCALE.early).toBeGreaterThan(1.5);
    expect(WHEAT_STALK_SCALE.mature).toBeGreaterThan(1);
    expect(WHEAT_STALK_SCALE.ready).toBe(WHEAT_STALK_SCALE.mature);
  });

  test("wind is small, deterministic, varied and independent of crop progress", () => {
    const reference = wheatWindRotation(7.2, 0, 1.1, false, false);
    expect(wheatWindRotation(7.2, 0, 1.1, false, false)).toEqual(reference);
    expect(wheatWindRotation(7.2, 1, 1.1, false, false)).not.toEqual(reference);
    for (const time of [0, 1, 10, 1000]) {
      for (let index = 0; index < WHEAT_STALK_POSITIONS.length; index += 1) {
        const [pitch, roll] = wheatWindRotation(time, index, 0.37, false, false);
        expect(Math.abs(pitch)).toBeLessThanOrEqual(0.01201);
        expect(Math.abs(roll)).toBeLessThanOrEqual(0.02601);
      }
    }
  });

  test("reduced motion and paused visuals keep Wheat motionless", () => {
    for (const time of [0, 1.2, 15, 500]) {
      expect(wheatWindRotation(time, 4, 1.4, true, false)).toEqual([0, 0]);
      expect(wheatWindRotation(time, 4, 1.4, false, true)).toEqual([0, 0]);
    }
  });
});
