import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ResidentVisualActivity, ResidentVisualProp } from "../../game/residentTasks";

export type FarmResidentPresentation = {
  id: string;
  displayName: string;
  variant: "woman" | "man";
  position: [number, number, number];
  state: "idle" | "walking" | "working";
  activity: ResidentVisualActivity;
  prop: ResidentVisualProp;
  targetLabel: string;
  selected: boolean;
  animationPaused: boolean;
};

type ResidentModelProps = {
  variant: "woman" | "man";
  activity: ResidentVisualActivity;
  prop: ResidentVisualProp;
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
      <group>
        <ResidentShadow />
        {resident.selected ? <ResidentSelectionRing /> : null}
        <ResidentModel
          variant={resident.variant}
          activity={resident.activity}
          prop={resident.prop}
          animationPaused={resident.animationPaused}
        />
      </group>
      <Html position={[0, 0.96, 0]} center zIndexRange={[88, 0]} wrapperClass="farm-scene-resident-marker-wrapper">
        <button
          type="button"
          className="farm-scene-marker farm-scene-resident-marker"
          data-testid={`farm-scene-resident-${resident.id}`}
          data-resident-state={resident.state}
          data-resident-activity={resident.activity}
          data-resident-prop={resident.prop}
          data-resident-target={resident.targetLabel}
          aria-label={`${resident.displayName} Farm Resident`}
          aria-pressed={resident.selected}
          onClick={onSelect}
        />
      </Html>
    </group>
  );
}

export function ResidentModel({
  variant,
  activity,
  prop,
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
      applyResidentPose(rig.current, activity, 0, phase);
    }
  }, [activity, phase, rig, shouldAnimate]);

  useFrame(({ clock }) => {
    if (!shouldAnimate) {
      return;
    }
    applyResidentPose(rig.current, activity, clock.getElapsedTime(), phase);
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
        <ResidentProp prop={prop} palette={palette} />
      </group>
    </group>
  );
}

function ResidentSelectionRing() {
  return (
    <mesh position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.27, 0.36, 28]} />
      <meshBasicMaterial color="#f0cb6b" transparent opacity={0.92} depthWrite={false} />
    </mesh>
  );
}

function ResidentShadow() {
  return (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.22, 18]} />
      <meshBasicMaterial color="#20312b" transparent opacity={0.22} depthWrite={false} />
    </mesh>
  );
}

function ResidentProp({
  prop,
  palette,
}: {
  prop: ResidentVisualProp;
  palette: ReturnType<typeof residentPalette>;
}) {
  if (prop === "none") {
    return null;
  }
  if (prop === "seed_pouch") {
    return (
      <group>
        <mesh castShadow>
          <sphereGeometry args={[0.07, 8, 6]} />
          <meshStandardMaterial color="#b9824d" roughness={0.88} metalness={0} />
        </mesh>
        <mesh castShadow position={[0, 0.055, 0]}>
          <cylinderGeometry args={[0.045, 0.06, 0.035, 8]} />
          <meshStandardMaterial color="#f4ead2" roughness={0.76} metalness={0} />
        </mesh>
      </group>
    );
  }
  if (prop === "basket") {
    return (
      <group>
        <mesh castShadow>
          <boxGeometry args={[0.16, 0.1, 0.13]} />
          <meshStandardMaterial color="#a46a38" roughness={0.9} metalness={0} />
        </mesh>
        <mesh castShadow position={[0, 0.07, 0]}>
          <torusGeometry args={[0.07, 0.012, 6, 12, Math.PI]} />
          <meshStandardMaterial color="#6f4c2d" roughness={0.88} metalness={0} />
        </mesh>
      </group>
    );
  }
  if (prop === "bucket") {
    return (
      <group>
        <mesh castShadow>
          <cylinderGeometry args={[0.07, 0.055, 0.12, 10]} />
          <meshStandardMaterial color="#7f9ca2" roughness={0.56} metalness={0.04} />
        </mesh>
        <mesh castShadow position={[0, 0.075, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.07, 0.01, 6, 12]} />
          <meshStandardMaterial color="#d7c48a" roughness={0.62} metalness={0.02} />
        </mesh>
      </group>
    );
  }
  if (prop === "crate") {
    return (
      <group>
        <mesh castShadow>
          <boxGeometry args={[0.17, 0.13, 0.15]} />
          <meshStandardMaterial color="#9b6a43" roughness={0.88} metalness={0} />
        </mesh>
        <mesh castShadow position={[0, 0.073, 0]}>
          <boxGeometry args={[0.19, 0.018, 0.16]} />
          <meshStandardMaterial color="#6f4c2d" roughness={0.86} metalness={0} />
        </mesh>
      </group>
    );
  }
  if (prop === "oven_tray") {
    return (
      <group>
        <mesh castShadow>
          <boxGeometry args={[0.2, 0.028, 0.15]} />
          <meshStandardMaterial color="#6f7f80" roughness={0.42} metalness={0.1} />
        </mesh>
        <mesh castShadow position={[0, 0.045, 0]}>
          <boxGeometry args={[0.12, 0.055, 0.09]} />
          <meshStandardMaterial color="#d8a64e" roughness={0.74} metalness={0} />
        </mesh>
      </group>
    );
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
  elapsedSeconds: number,
  phase: number,
) {
  const wave = Math.sin(elapsedSeconds * poseSpeed(activity) + phase);
  const lift = (Math.sin(elapsedSeconds * poseSpeed(activity) * 0.75 + phase) + 1) / 2;
  resetRig(rig);

  if (!rig.root || !rig.torso || !rig.head || !rig.leftArm || !rig.rightArm || !rig.leftLeg || !rig.rightLeg) {
    return;
  }

  if (activity === "walking") {
    rig.root.position.y = Math.abs(wave) * 0.035;
    rig.torso.rotation.x = 0.08;
    rig.leftArm.rotation.x = wave * 0.85;
    rig.rightArm.rotation.x = -wave * 0.85;
    rig.leftLeg.rotation.x = -wave * 0.66;
    rig.rightLeg.rotation.x = wave * 0.66;
    rig.head.rotation.z = wave * 0.05;
    return;
  }

  if (activity === "idle") {
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
    rig.rightArm.rotation.x = -0.95 + lift * 0.45;
    rig.leftLeg.rotation.x = 0.16;
    rig.rightLeg.rotation.x = -0.1;
    setPropPose(rig, 0.18, 0.2 + lift * 0.08, 0.18, -0.3);
    return;
  }

  if (activity === "harvesting") {
    rig.torso.rotation.z = wave * 0.08;
    rig.leftArm.rotation.x = -0.52 + wave * 0.18;
    rig.rightArm.rotation.x = -0.82 - wave * 0.24;
    rig.rightArm.rotation.z = -0.22;
    setPropPose(rig, 0.24, 0.28, 0.16, 0.16 * wave);
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
    rig.leftArm.rotation.x = -0.82;
    rig.rightArm.rotation.x = -0.82;
    rig.leftArm.rotation.z = 0.18;
    rig.rightArm.rotation.z = -0.18;
    setPropPose(rig, 0, 0.31 + lift * 0.04, 0.24, 0);
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
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => {
      setReducedMotion(query.matches);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reducedMotion;
}
