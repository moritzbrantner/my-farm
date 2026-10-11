import type { WheatAppearance } from "@my-farm/game-model";

// Bounded, authored placement of a thicker crop patch inside one Field Plot.
// No runtime scattering, seeds, physics, or crop growth state.
export const WHEAT_STALK_POSITIONS = [
  [-0.20, -0.21, 0.10], [-0.06, -0.23, 2.40], [0.08, -0.22, 1.15], [0.21, -0.18, 3.80],
  [-0.21, -0.07, 2.30], [-0.06, -0.07, 0.80], [0.09, -0.06, 4.10], [0.21, -0.03, 1.45],
  [-0.21, 0.08, 3.65], [-0.06, 0.09, 1.90], [0.08, 0.09, 0.30], [0.21, 0.11, 2.70],
  [-0.20, 0.22, 0.75], [-0.06, 0.22, 3.10], [0.09, 0.21, 2.20], [0.21, 0.21, 5.20],
] as const;

export const WHEAT_STALK_SCALE: Record<WheatAppearance, number> = {
  // Young Wheat must read as a leafy green patch, not as empty brown soil.
  early: 1.9,
  // A recognizably taller, golden head-bearing patch at the overview zoom.
  mature: 1.3,
  ready: 1.3,
};

export function wheatWindRotation(
  elapsedSeconds: number,
  plantIndex: number,
  windPhase: number,
  reducedMotion: boolean,
  paused: boolean,
): readonly [number, number] {
  if (reducedMotion || paused) return [0, 0];
  const phase = windPhase + plantIndex * 0.63;
  // Subtle pitch/roll around the base, explicitly cosmetic; never affects Farm state.
  return [
    0.012 * Math.sin(elapsedSeconds * 0.77 + phase * 0.81),
    0.026 * Math.sin(elapsedSeconds * 1.06 + phase),
  ];
}
