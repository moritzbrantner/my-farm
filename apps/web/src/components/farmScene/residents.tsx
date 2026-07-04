import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type FarmResidentPresentation = {
  id: string;
  displayName: string;
  variant: "woman" | "man";
  position: [number, number, number];
  state: "idle" | "walking" | "working";
  targetLabel: string;
  selected: boolean;
};

export function FarmResidentFigure({
  resident,
  onSelect,
}: {
  resident: FarmResidentPresentation;
  onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const selectResident = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    event.stopPropagation();
    onSelect();
  };

  useFrame(({ clock }) => {
    if (!groupRef.current || reducedMotion) {
      return;
    }
    const stride = resident.state === "walking" ? 7 : 2;
    const bob = Math.sin(clock.getElapsedTime() * stride + (resident.variant === "woman" ? 0 : 0.7)) * 0.025;
    groupRef.current.position.y = bob;
    groupRef.current.rotation.y = resident.state === "walking"
      ? Math.sin(clock.getElapsedTime() * 3) * 0.08
      : Math.sin(clock.getElapsedTime() * 0.9) * 0.04;
  });

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
      <group ref={groupRef}>
        <ResidentShadow />
        {resident.selected ? <ResidentSelectionRing /> : null}
        <ResidentBody variant={resident.variant} />
      </group>
      <Html position={[0, 0.96, 0]} center zIndexRange={[88, 0]} wrapperClass="farm-scene-resident-marker-wrapper">
        <button
          type="button"
          className="farm-scene-marker farm-scene-resident-marker"
          data-testid={`farm-scene-resident-${resident.id}`}
          data-resident-state={resident.state}
          data-resident-target={resident.targetLabel}
          aria-label={`${resident.displayName} Farm Resident`}
          aria-pressed={resident.selected}
          onClick={onSelect}
        />
      </Html>
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

function ResidentBody({ variant }: { variant: "woman" | "man" }) {
  const shirtColor = variant === "woman" ? "#4f8f79" : "#4e74a8";
  const hatColor = variant === "woman" ? "#f1d27a" : "#7d5642";
  const trouserColor = variant === "woman" ? "#6d4e78" : "#4b5c64";

  return (
    <group position={[0, 0.08, 0]}>
      <mesh castShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[0.16, 0.28, 0.14]} />
        <meshStandardMaterial color={trouserColor} roughness={0.86} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 0.42, 0]}>
        <boxGeometry args={[0.24, 0.3, 0.18]} />
        <meshStandardMaterial color={shirtColor} roughness={0.78} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 0.66, -0.01]}>
        <sphereGeometry args={[0.135, 10, 8]} />
        <meshStandardMaterial color="#d7a56c" roughness={0.7} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 0.78, -0.01]}>
        <cylinderGeometry args={[0.16, 0.12, 0.09, 10]} />
        <meshStandardMaterial color={hatColor} roughness={0.82} metalness={0} />
      </mesh>
      <mesh castShadow position={[0, 0.72, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.025, 12]} />
        <meshStandardMaterial color={hatColor} roughness={0.84} metalness={0} />
      </mesh>
      {[-0.15, 0.15].map((x) => (
        <mesh key={x} castShadow position={[x, 0.4, 0]}>
          <boxGeometry args={[0.06, 0.23, 0.06]} />
          <meshStandardMaterial color="#d7a56c" roughness={0.74} metalness={0} />
        </mesh>
      ))}
    </group>
  );
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
