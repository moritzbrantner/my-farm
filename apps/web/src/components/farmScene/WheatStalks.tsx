import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { WheatAppearance } from "@my-farm/game-model";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { WHEAT_STALK_POSITIONS, WHEAT_STALK_SCALE, wheatWindRotation } from "./wheatPresentation";

const farmArt = (file: string) => `${import.meta.env.BASE_URL}farm-art/${file}`;

export function WheatStalks({
  appearance,
  windPhase,
  paused,
}: {
  appearance: WheatAppearance;
  windPhase: number;
  paused: boolean;
}) {
  const { scene } = useGLTF(farmArt(appearance === "early" ? "wheat-early.glb" : "wheat-mature-straw.glb"));
  const plants = useMemo(() => WHEAT_STALK_POSITIONS.map(() => scene.clone(true)), [scene]);
  const groups = useRef<Array<THREE.Group | null>>([]);
  const reducedMotion = usePrefersReducedMotion();

  // One frame callback per Field Plot, with a fixed small number of plants.
  // Clones share the producer's immutable geometry/materials; no model regeneration.
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    for (let index = 0; index < WHEAT_STALK_POSITIONS.length; index += 1) {
      const group = groups.current[index];
      if (!group) continue;
      const [pitch, roll] = wheatWindRotation(time, index, windPhase, reducedMotion, paused);
      group.rotation.x = pitch;
      group.rotation.z = roll;
    }
  });

  return (
    <group position={[0, 0.138, 0]}>
      {appearance === "early" ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
          <circleGeometry args={[0.27, 32]} />
          <meshBasicMaterial color="#487b2c" transparent opacity={0.20} depthWrite={false} />
        </mesh>
      ) : null}
      {WHEAT_STALK_POSITIONS.map(([x, z, yaw], index) => (
        <group
          key={index}
          ref={(group) => { groups.current[index] = group; }}
          position={[x, 0, z]}
          rotation={[0, yaw, 0]}
        >
          <primitive object={plants[index]} scale={WHEAT_STALK_SCALE[appearance]} />
        </group>
      ))}
      {appearance === "ready" ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
          <ringGeometry args={[0.29, 0.37, 32]} />
          <meshBasicMaterial color="#ffdd60" transparent opacity={0.95} depthWrite={false} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}
