import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type {
  ResidentFacing,
  ResidentHeldTool,
  ResidentMotionState,
  ResidentVisualActivity,
  ResidentVisualProp,
} from "@my-farm/game-model/residentTasks";

export type FarmResidentPresentation = {
  id: string;
  displayName: string;
  variant: "woman" | "man";
  position: [number, number, number];
  state: "idle" | "walking" | "working" | "blocked";
  activity: ResidentVisualActivity;
  prop: ResidentVisualProp;
  heldTool: ResidentHeldTool;
  motion: ResidentMotionState;
  taskLabel: string;
  targetLabel: string;
  selected: boolean;
  blocked: boolean;
  animationPaused: boolean;
  facing: ResidentFacing;
};

type ResidentModelProps = {
  variant: "woman" | "man";
  activity: ResidentVisualActivity;
  prop: ResidentVisualProp;
  heldTool?: ResidentHeldTool;
  motion?: ResidentMotionState;
  animationPaused?: boolean;
  compact?: boolean;
};

type ResidentRig = {
  root: THREE.Group | null;
  torso: THREE.Group | null;
  head: THREE.Group | null;
  leftArm: THREE.Group | null;
  rightArm: THREE.Group | null;
  leftLeg: THREE.Group | null;
  rightLeg: THREE.Group | null;
  prop: THREE.Group | null;
};
type ReducedMotionQuery = {
  matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
};

export function FarmResidentFigure({
  resident,
  onSelect,
}: {
  resident: FarmResidentPresentation;
  onSelect: () => void;
}) {
  const selectResident = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    event.stopPropagation();
    onSelect();
  };

  return (
    <group position={resident.position}>
      <mesh
        position={[0, 0.55, 0]}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={selectResident}
      >
        <boxGeometry args={[0.72, 1.25, 0.72]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <ResidentFacingRoot facing={resident.facing} animated={!resident.animationPaused}>
        <ResidentShadow />
        {resident.selected ? <ResidentSelectionRing /> : null}
        <ResidentModel
          variant={resident.variant}
          activity={resident.activity}
          prop={resident.prop}
          heldTool={resident.heldTool}
          motion={resident.motion}
          animationPaused={resident.animationPaused}
        />
      </ResidentFacingRoot>
      {resident.selected ? (
        <mesh position={[0, 1.04, 0]}>
          <boxGeometry args={[0.54, 0.12, 0.06]} />
          <meshBasicMaterial color={resident.blocked ? "#f0a43a" : "#fff7d0"} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

function ResidentFacingRoot({
  facing,
  animated,
  children,
}: {
  facing: ResidentFacing;
  animated: boolean;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const targetRotation = facingRotation(facing);

  useEffect(() => {
    if (!animated || reducedMotion) {
      ref.current?.rotation.set(0, targetRotation, 0);
    }
  }, [animated, reducedMotion, targetRotation]);

  useFrame(() => {
    if (!animated || reducedMotion || !ref.current) {
      return;
    }
    ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, targetRotation, 0.22);
  });

  return <group ref={ref}>{children}</group>;
}

function facingRotation(facing: ResidentFacing) {
  switch (facing) {
    case "north":
      return Math.PI;
    case "east":
      return Math.PI / 2;
    case "west":
      return -Math.PI / 2;
    case "south":
      return 0;
  }
}

export function activityToken(activity: ResidentVisualActivity) {
  switch (activity) {
    case "walking":
      return "Go";
    case "planting":
      return "Pl";
    case "harvesting":
      return "Hv";
    case "picking_up_items":
    case "depositing_inventory":
      return "Cr";
    case "picking_up_tools":
    case "returning_tools":
      return "Tl";
    case "starting_oven":
    case "collecting_oven":
      return "Ov";
    case "feeding_animal":
      return "Fd";
    case "collecting_animal_product":
      return "An";
    case "collecting_machine":
      return "Mc";
    case "idle":
      return "Id";
  }
}

export function ResidentModel({
  variant,
  activity,
  prop,
  heldTool = "none",
  motion = defaultMotionForActivity(activity),
  animationPaused = false,
  compact = false,
}: ResidentModelProps) {
  const rig = useResidentRig();
  const reducedMotion = usePrefersReducedMotion();
  const palette = residentPalette(variant);
  const phase = variant === "woman" ? 0 : 0.68;
  const scale = compact ? 0.72 : 1;
  const shouldAnimate = !reducedMotion && !animationPaused;

  useEffect(() => {
    if (!shouldAnimate) {
      applyResidentPose(rig.current, activity, motion, 0, phase);
    }
  }, [activity, motion, phase, rig, shouldAnimate]);

  useFrame(({ clock }) => {
    if (!shouldAnimate) {
      return;
    }
    applyResidentPose(rig.current, activity, motion, clock.getElapsedTime(), phase);
  });

  return (
    <group ref={(node) => { rig.current.root = node; }} scale={scale}>
      <group ref={(node) => { rig.current.leftLeg = node; }} position={[-0.07, 0.28, 0]}>
        <mesh castShadow position={[0, -0.12, 0]}>
          <capsuleGeometry args={[0.04, 0.22, 4, 8]} />
          <meshStandardMaterial color={palette.trousers} roughness={0.84} metalness={0} />
        </mesh>
        <mesh castShadow position={[0.01, -0.26, 0.03]}>
          <boxGeometry args={[0.09, 0.05, 0.14]} />
          <meshStandardMaterial color={palette.boots} roughness={0.86} metalness={0} />
        </mesh>
      </group>
      <group ref={(node) => { rig.current.rightLeg = node; }} position={[0.07, 0.28, 0]}>
        <mesh castShadow position={[0, -0.12, 0]}>
          <capsuleGeometry args={[0.04, 0.22, 4, 8]} />
          <meshStandardMaterial color={palette.trousers} roughness={0.84} metalness={0} />
        </mesh>
        <mesh castShadow position={[-0.01, -0.26, 0.03]}>
          <boxGeometry args={[0.09, 0.05, 0.14]} />
          <meshStandardMaterial color={palette.boots} roughness={0.86} metalness={0} />
        </mesh>
      </group>
      <group ref={(node) => { rig.current.torso = node; }} position={[0, 0.43, 0]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.13, 0.24, 5, 10]} />
          <meshStandardMaterial color={palette.shirt} roughness={0.76} metalness={0} />
        </mesh>
        <mesh castShadow position={[0, 0.02, -0.095]}>
          <boxGeometry args={[0.23, 0.16, 0.035]} />
          <meshStandardMaterial color={palette.apron} roughness={0.8} metalness={0} />
        </mesh>
      </group>
      <group ref={(node) => { rig.current.leftArm = node; }} position={[-0.16, 0.5, 0]}>
        <mesh castShadow position={[0, -0.11, 0]}>
          <capsuleGeometry args={[0.035, 0.2, 4, 8]} />
          <meshStandardMaterial color={palette.skin} roughness={0.72} metalness={0} />
        </mesh>
        <mesh castShadow position={[0, -0.23, 0.01]}>
          <sphereGeometry args={[0.044, 8, 6]} />
          <meshStandardMaterial color={palette.skin} roughness={0.72} metalness={0} />
        </mesh>
      </group>
      <group ref={(node) => { rig.current.rightArm = node; }} position={[0.16, 0.5, 0]}>
        <mesh castShadow position={[0, -0.11, 0]}>
          <capsuleGeometry args={[0.035, 0.2, 4, 8]} />
          <meshStandardMaterial color={palette.skin} roughness={0.72} metalness={0} />
        </mesh>
        <mesh castShadow position={[0, -0.23, 0.01]}>
          <sphereGeometry args={[0.044, 8, 6]} />
          <meshStandardMaterial color={palette.skin} roughness={0.72} metalness={0} />
        </mesh>
      </group>
      <group ref={(node) => { rig.current.head = node; }} position={[0, 0.68, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.13, 12, 9]} />
          <meshStandardMaterial color={palette.skin} roughness={0.7} metalness={0} />
        </mesh>
        {variant === "woman" ? (
          <>
            <mesh castShadow position={[0, 0.025, -0.055]}>
              <sphereGeometry args={[0.138, 12, 8]} />
              <meshStandardMaterial color={palette.hair} roughness={0.82} metalness={0} />
            </mesh>
            <mesh castShadow position={[0, -0.07, -0.105]}>
              <sphereGeometry args={[0.065, 8, 6]} />
              <meshStandardMaterial color={palette.hair} roughness={0.82} metalness={0} />
            </mesh>
            <mesh castShadow position={[0, 0.12, 0]}>
              <cylinderGeometry args={[0.15, 0.11, 0.08, 12]} />
              <meshStandardMaterial color={palette.hat} roughness={0.82} metalness={0} />
            </mesh>
          </>
        ) : (
          <>
            <mesh castShadow position={[0, 0.09, 0]}>
              <cylinderGeometry args={[0.14, 0.115, 0.08, 12]} />
              <meshStandardMaterial color={palette.hat} roughness={0.82} metalness={0} />
            </mesh>
            <mesh castShadow position={[0, 0.045, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.18, 0.18, 0.025, 12]} />
              <meshStandardMaterial color={palette.hat} roughness={0.84} metalness={0} />
            </mesh>
          </>
        )}
        <mesh castShadow position={[-0.045, 0.005, 0.115]}>
          <sphereGeometry args={[0.012, 6, 4]} />
          <meshStandardMaterial color="#20312b" roughness={0.6} metalness={0} />
        </mesh>
        <mesh castShadow position={[0.045, 0.005, 0.115]}>
          <sphereGeometry args={[0.012, 6, 4]} />
          <meshStandardMaterial color="#20312b" roughness={0.6} metalness={0} />
        </mesh>
      </group>
      <group ref={(node) => { rig.current.prop = node; }} position={[0.24, 0.32, 0.12]}>
        <ResidentProp prop={prop} heldTool={heldTool} palette={palette} />
      </group>
    </group>
  );
}

export function ResidentSelectionRing() {
  return (
    <mesh position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.27, 0.36, 28]} />
      <meshBasicMaterial color="#f0cb6b" transparent opacity={0.92} depthWrite={false} />
    </mesh>
  );
}

export function ResidentShadow() {
  return (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.22, 18]} />
      <meshBasicMaterial color="#20312b" transparent opacity={0.22} depthWrite={false} />
    </mesh>
  );
}

function ResidentProp({
  prop,
  heldTool,
  palette,
}: {
  prop: ResidentVisualProp;
  heldTool: ResidentHeldTool;
  palette: ReturnType<typeof residentPalette>;
}) {
  if (prop === "none" && heldTool === "none") {
    return null;
  }
  const propOffset = heldTool === "none" ? 0 : -0.08;
  if (prop === "seed_pouch") {
    return (
      <group>
        <group position={[propOffset, -0.01, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.07, 8, 6]} />
            <meshStandardMaterial color="#b9824d" roughness={0.88} metalness={0} />
          </mesh>
          <mesh castShadow position={[0, 0.055, 0]}>
            <cylinderGeometry args={[0.045, 0.06, 0.035, 8]} />
            <meshStandardMaterial color="#f4ead2" roughness={0.76} metalness={0} />
          </mesh>
        </group>
        <ResidentHeldTool tool={heldTool} palette={palette} />
      </group>
    );
  }
  if (prop === "basket") {
    return (
      <group>
        <group position={[propOffset, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.16, 0.1, 0.13]} />
            <meshStandardMaterial color="#a46a38" roughness={0.9} metalness={0} />
          </mesh>
          <mesh castShadow position={[0, 0.07, 0]}>
            <torusGeometry args={[0.07, 0.012, 6, 12, Math.PI]} />
            <meshStandardMaterial color="#6f4c2d" roughness={0.88} metalness={0} />
          </mesh>
        </group>
        <ResidentHeldTool tool={heldTool} palette={palette} />
      </group>
    );
  }
  if (prop === "bucket") {
    return (
      <group>
        <group position={[propOffset, 0, 0]}>
          <BucketModel color="#7f9ca2" />
        </group>
        <ResidentHeldTool tool={heldTool} palette={palette} />
      </group>
    );
  }
  if (prop === "crate") {
    return (
      <group>
        <group position={[propOffset, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.17, 0.13, 0.15]} />
            <meshStandardMaterial color="#9b6a43" roughness={0.88} metalness={0} />
          </mesh>
          <mesh castShadow position={[0, 0.073, 0]}>
            <boxGeometry args={[0.19, 0.018, 0.16]} />
            <meshStandardMaterial color="#6f4c2d" roughness={0.86} metalness={0} />
          </mesh>
        </group>
        <ResidentHeldTool tool={heldTool} palette={palette} />
      </group>
    );
  }
  if (prop === "oven_tray") {
    return (
      <group>
        <group position={[propOffset, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.2, 0.028, 0.15]} />
            <meshStandardMaterial color="#6f7f80" roughness={0.42} metalness={0.1} />
          </mesh>
          <mesh castShadow position={[0, 0.045, 0]}>
            <boxGeometry args={[0.12, 0.055, 0.09]} />
            <meshStandardMaterial color="#d8a64e" roughness={0.74} metalness={0} />
          </mesh>
        </group>
        <ResidentHeldTool tool={heldTool} palette={palette} />
      </group>
    );
  }
  if (heldTool !== "none") {
    return <ResidentHeldTool tool={heldTool} palette={palette} />;
  }
  return (
    <group>
      <mesh castShadow rotation={[0, 0, 0.48]}>
        <cylinderGeometry args={[0.018, 0.018, 0.26, 8]} />
        <meshStandardMaterial color="#6f4c2d" roughness={0.82} metalness={0} />
      </mesh>
      <mesh castShadow position={[0.045, 0.02, 0]} rotation={[0, 0, -0.36]}>
        <cylinderGeometry args={[0.015, 0.015, 0.22, 8]} />
        <meshStandardMaterial color="#8a6742" roughness={0.82} metalness={0} />
      </mesh>
      <mesh castShadow position={[0.055, 0.12, 0]}>
        <boxGeometry args={[0.08, 0.035, 0.07]} />
        <meshStandardMaterial color={palette.apron} roughness={0.78} metalness={0} />
      </mesh>
    </group>
  );
}

function ResidentHeldTool({
  tool,
  palette,
}: {
  tool: ResidentHeldTool;
  palette: ReturnType<typeof residentPalette>;
}) {
  if (tool === "none") {
    return null;
  }
  if (tool === "hoe") {
    return (
      <group position={[0.07, 0.01, 0.02]} rotation={[0.12, 0, -0.32]}>
        <ToolHandle length={0.34} />
        <mesh castShadow position={[0, 0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.1, 0.024, 0.052]} />
          <meshStandardMaterial color="#6f7f80" roughness={0.5} metalness={0.08} />
        </mesh>
      </group>
    );
  }
  if (tool === "sickle") {
    return (
      <group position={[0.08, 0.01, 0.02]} rotation={[0, 0, -0.46]}>
        <ToolHandle length={0.2} />
        <mesh castShadow position={[0.03, 0.12, 0]} rotation={[0, 0, 0.55]}>
          <torusGeometry args={[0.07, 0.009, 6, 18, Math.PI * 1.2]} />
          <meshStandardMaterial color="#d6dde0" roughness={0.36} metalness={0.18} />
        </mesh>
      </group>
    );
  }
  if (tool === "mixing_bowl") {
    return (
      <group position={[0.08, 0, 0]}>
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <sphereGeometry args={[0.075, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#b85f54" roughness={0.78} metalness={0} />
        </mesh>
        <mesh castShadow position={[0.015, 0.085, 0]} rotation={[0, 0, -0.42]}>
          <cylinderGeometry args={[0.008, 0.008, 0.16, 8]} />
          <meshStandardMaterial color="#6f4c2d" roughness={0.82} metalness={0} />
        </mesh>
      </group>
    );
  }
  if (tool === "oven_mitt") {
    return (
      <group position={[0.08, 0, 0]}>
        {[-0.045, 0.045].map((x) => (
          <group key={x} position={[x, 0.02, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[0.045, 9, 7]} />
              <meshStandardMaterial color="#d85e4f" roughness={0.86} metalness={0} />
            </mesh>
            <mesh castShadow position={[0.025, 0.025, 0]}>
              <sphereGeometry args={[0.024, 8, 6]} />
              <meshStandardMaterial color="#d85e4f" roughness={0.86} metalness={0} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
  if (tool === "feed_bucket") {
    return <BucketModel color="#80976f" />;
  }
  if (tool === "collection_pail") {
    return <BucketModel color="#aebec5" />;
  }
  if (tool === "wrench") {
    return (
      <group position={[0.08, 0.01, 0.02]} rotation={[0, 0, -0.52]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.014, 0.014, 0.24, 8]} />
          <meshStandardMaterial color="#788386" roughness={0.42} metalness={0.18} />
        </mesh>
        <mesh castShadow position={[0, 0.13, 0]}>
          <torusGeometry args={[0.036, 0.01, 6, 12, Math.PI * 1.35]} />
          <meshStandardMaterial color="#d6dde0" roughness={0.34} metalness={0.2} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[0.08, 0.01, 0.02]}>
      <group rotation={[0, 0, 0.48]}>
        <ToolHandle length={0.26} />
      </group>
      <group position={[0.05, 0.02, 0]} rotation={[0, 0, -0.36]}>
        <ToolHandle length={0.22} />
      </group>
      <mesh castShadow position={[0.055, 0.12, 0]}>
        <boxGeometry args={[0.08, 0.035, 0.07]} />
        <meshStandardMaterial color={palette.apron} roughness={0.78} metalness={0} />
      </mesh>
    </group>
  );
}

function ToolHandle({ length }: { length: number }) {
  return (
    <mesh castShadow>
      <cylinderGeometry args={[0.012, 0.012, length, 8]} />
      <meshStandardMaterial color="#6f4c2d" roughness={0.82} metalness={0} />
    </mesh>
  );
}

function BucketModel({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow>
        <cylinderGeometry args={[0.07, 0.055, 0.12, 10]} />
        <meshStandardMaterial color={color} roughness={0.56} metalness={0.04} />
      </mesh>
      <mesh castShadow position={[0, 0.075, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.07, 0.01, 6, 12]} />
        <meshStandardMaterial color="#d7c48a" roughness={0.62} metalness={0.02} />
      </mesh>
    </group>
  );
}

function useResidentRig() {
  return useRef<ResidentRig>({
    root: null,
    torso: null,
    head: null,
    leftArm: null,
    rightArm: null,
    leftLeg: null,
    rightLeg: null,
    prop: null,
  });
}

function applyResidentPose(
  rig: ResidentRig,
  activity: ResidentVisualActivity,
  motion: ResidentMotionState,
  elapsedSeconds: number,
  phase: number,
) {
  const wave = Math.sin(elapsedSeconds * poseSpeed(activity) + phase);
  const lift = (Math.sin(elapsedSeconds * poseSpeed(activity) * 0.75 + phase) + 1) / 2;
  resetRig(rig);

  if (!rig.root || !rig.torso || !rig.head || !rig.leftArm || !rig.rightArm || !rig.leftLeg || !rig.rightLeg) {
    return;
  }

  if (motion === "blocked") {
    rig.root.position.y = -0.01;
    rig.torso.rotation.x = 0.1;
    rig.head.rotation.z = -0.08;
    rig.leftArm.rotation.x = -0.32;
    rig.rightArm.rotation.x = -0.38;
    rig.leftArm.rotation.z = 0.18;
    rig.rightArm.rotation.z = -0.24;
    setPropPose(rig, 0.2, 0.28, 0.15, -0.08);
    return;
  }

  if (motion === "walking") {
    rig.root.position.y = Math.abs(wave) * 0.035;
    rig.torso.rotation.x = 0.08;
    rig.leftArm.rotation.x = wave * 0.55;
    rig.rightArm.rotation.x = -wave * 0.55;
    rig.leftLeg.rotation.x = -wave * 0.66;
    rig.rightLeg.rotation.x = wave * 0.66;
    rig.head.rotation.z = wave * 0.05;
    setPropPose(rig, 0.21, 0.31 + Math.abs(wave) * 0.02, 0.14, 0.06 * wave);
    return;
  }

  if (motion === "idle") {
    rig.root.position.y = wave * 0.012;
    rig.torso.rotation.z = wave * 0.025;
    rig.head.rotation.z = -wave * 0.035;
    rig.leftArm.rotation.z = 0.14 + wave * 0.025;
    rig.rightArm.rotation.z = -0.14 - wave * 0.025;
    return;
  }

  rig.root.position.y = -0.015 + lift * 0.018;
  rig.torso.rotation.x = workingLean(activity);
  rig.head.rotation.x = -0.08;

  if (activity === "planting") {
    rig.root.position.y = -0.04 + lift * 0.018;
    rig.torso.rotation.x = 0.34;
    rig.leftArm.rotation.x = -0.65 - lift * 0.28;
    rig.rightArm.rotation.x = -1.05 + lift * 0.62;
    rig.rightArm.rotation.z = -0.16;
    rig.leftLeg.rotation.x = 0.16;
    rig.rightLeg.rotation.x = -0.1;
    setPropPose(rig, 0.19, 0.19 + lift * 0.1, 0.18, -0.46 + lift * 0.24);
    return;
  }

  if (activity === "harvesting") {
    rig.torso.rotation.z = wave * 0.12;
    rig.leftArm.rotation.x = -0.52 + wave * 0.18;
    rig.rightArm.rotation.x = -0.82 - wave * 0.34;
    rig.rightArm.rotation.z = -0.28 + wave * 0.12;
    setPropPose(rig, 0.24, 0.28, 0.16, -0.12 + 0.34 * wave);
    return;
  }

  if (activity === "collecting_machine") {
    rig.torso.rotation.x = 0.14;
    rig.leftArm.rotation.x = -0.5;
    rig.rightArm.rotation.x = -0.58 - lift * 0.22;
    rig.rightArm.rotation.z = -0.32 - wave * 0.12;
    setPropPose(rig, 0.25, 0.31, 0.12, -0.18 - lift * 0.24);
    return;
  }

  if (activity === "feeding_animal") {
    rig.rightArm.rotation.x = -0.65;
    rig.rightArm.rotation.z = -0.22 - lift * 0.28;
    rig.leftArm.rotation.x = -0.36;
    setPropPose(rig, 0.28, 0.28, 0.16, -0.72 * lift);
    return;
  }

  if (activity === "starting_oven" || activity === "collecting_oven") {
    rig.leftArm.rotation.x = -0.82 - (activity === "starting_oven" ? lift * 0.1 : 0);
    rig.rightArm.rotation.x = -0.82 - (activity === "starting_oven" ? 0 : lift * 0.08);
    rig.leftArm.rotation.z = 0.18;
    rig.rightArm.rotation.z = -0.18;
    setPropPose(rig, 0.02, 0.31 + lift * 0.04, 0.24, activity === "starting_oven" ? wave * 0.18 : 0);
    return;
  }

  if (activity === "picking_up_tools" || activity === "returning_tools") {
    rig.leftArm.rotation.x = -0.42;
    rig.rightArm.rotation.x = -0.28 + wave * 0.08;
    rig.rightArm.rotation.z = -0.34;
    setPropPose(rig, 0.25, 0.31, 0.11, 0.18);
    return;
  }

  rig.leftArm.rotation.x = -0.42 - lift * 0.12;
  rig.rightArm.rotation.x = -0.52 - lift * 0.22;
  rig.leftArm.rotation.z = 0.18;
  rig.rightArm.rotation.z = -0.18;
  setPropPose(rig, 0.2, 0.26 + lift * 0.06, 0.18, 0.08 * wave);
}

function resetRig(rig: ResidentRig) {
  if (rig.root) {
    rig.root.position.y = 0;
    rig.root.rotation.set(0, 0, 0);
  }
  for (const part of [rig.torso, rig.head, rig.leftArm, rig.rightArm, rig.leftLeg, rig.rightLeg]) {
    part?.rotation.set(0, 0, 0);
  }
  setPropPose(rig, 0.24, 0.32, 0.12, 0);
}

function setPropPose(rig: ResidentRig, x: number, y: number, z: number, rotationZ: number) {
  if (!rig.prop) {
    return;
  }
  rig.prop.position.set(x, y, z);
  rig.prop.rotation.set(0, 0, rotationZ);
}

function poseSpeed(activity: ResidentVisualActivity) {
  if (activity === "walking") {
    return 8;
  }
  if (activity === "idle") {
    return 1.6;
  }
  return 3.4;
}

function workingLean(activity: ResidentVisualActivity) {
  if (activity === "planting" || activity === "harvesting") {
    return 0.22;
  }
  if (activity === "starting_oven" || activity === "collecting_oven") {
    return 0.12;
  }
  return 0.08;
}

function defaultMotionForActivity(activity: ResidentVisualActivity): ResidentMotionState {
  if (activity === "idle") {
    return "idle";
  }
  if (activity === "walking") {
    return "walking";
  }
  return "working";
}

function residentPalette(variant: "woman" | "man") {
  return variant === "woman"
    ? {
        skin: "#d7a56c",
        shirt: "#4f8f79",
        apron: "#f0cb6b",
        trousers: "#6d4e78",
        boots: "#4b3f4f",
        hat: "#f1d27a",
        hair: "#5d3b2e",
      }
    : {
        skin: "#d4a06b",
        shirt: "#4e74a8",
        apron: "#d7c48a",
        trousers: "#4b5c64",
        boots: "#344146",
        hat: "#7d5642",
        hair: "#4b332c",
      };
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const matchMedia = (globalThis as { matchMedia?: (query: string) => ReducedMotionQuery }).matchMedia;
    if (!matchMedia) {
      return;
    }
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => {
      setReducedMotion(query.matches);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reducedMotion;
}
