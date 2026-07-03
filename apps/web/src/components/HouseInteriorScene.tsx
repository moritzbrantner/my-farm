import { Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

export type HouseRoomId = "living_room" | "kitchen" | "bedroom";

type HouseRoom = {
  id: HouseRoomId;
  label: string;
  floor: string;
  wall: string;
  accent: string;
};

type Props = {
  selectedRoom: HouseRoomId;
  onSelectRoom: (room: HouseRoomId) => void;
  onBackToFarm: () => void;
};

export const houseRooms: HouseRoom[] = [
  {
    id: "living_room",
    label: "Living Room",
    floor: "#d8b06a",
    wall: "#f1dfb6",
    accent: "#4f8f62",
  },
  {
    id: "kitchen",
    label: "Kitchen",
    floor: "#c8d0c4",
    wall: "#f6ead0",
    accent: "#5f8aa6",
  },
  {
    id: "bedroom",
    label: "Bedroom",
    floor: "#bca3be",
    wall: "#ead9cf",
    accent: "#936f9f",
  },
];

export function HouseInteriorScene({ selectedRoom, onSelectRoom, onBackToFarm }: Props) {
  const room = houseRooms.find((entry) => entry.id === selectedRoom) ?? houseRooms[0];

  return (
    <section className="house-interior" aria-label="House Interior">
      <Canvas
        className="house-interior__canvas"
        gl={{ preserveDrawingBuffer: true }}
        orthographic
        camera={{ position: [7.8, 7.2, 7.8], zoom: 58, near: 0.1, far: 100 }}
        shadows
        dpr={[1, 2]}
      >
        <color attach="background" args={["#8fc9c5"]} />
        <hemisphereLight args={["#fff6df", "#52665c", 1.4]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={2.1} castShadow />
        <OrbitControls enableRotate={false} enablePan={false} enableZoom={false} target={[0, 0.3, 0]} />
        <RoomSet room={room} />
      </Canvas>
      <div className="house-interior__hud">
        <div className="house-interior__title">
          <span>Farmhouse</span>
          <h1>House Interior</h1>
        </div>
        <button className="house-interior__back" type="button" onClick={onBackToFarm}>
          Back to Farm
        </button>
      </div>
      <nav className="house-interior__tabs" aria-label="Rooms">
        {houseRooms.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === room.id}
            onClick={() => onSelectRoom(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
    </section>
  );
}

function RoomSet({ room }: { room: HouseRoom }) {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.2, 7.2]} />
        <meshStandardMaterial color="#6d8b72" roughness={1} />
      </mesh>
      <RoomShell room={room} />
      {room.id === "living_room" ? <LivingRoom accent={room.accent} /> : null}
      {room.id === "kitchen" ? <Kitchen accent={room.accent} /> : null}
      {room.id === "bedroom" ? <Bedroom accent={room.accent} /> : null}
      <Html position={[0, 1.1, 0]} center wrapperClass="farm-scene-marker-wrapper">
        <div
          className="farm-scene-marker"
          data-testid={`house-room-${room.id}`}
          aria-label={`${room.label} room`}
        />
      </Html>
    </group>
  );
}

function RoomShell({ room }: { room: HouseRoom }) {
  return (
    <group>
      <mesh receiveShadow position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.2, 5.2]} />
        <meshStandardMaterial color={room.floor} roughness={0.86} />
      </mesh>
      {[-2, -1, 0, 1, 2].map((offset) => (
        <mesh key={`floor-x-${offset}`} position={[offset, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.035, 5.05]} />
          <meshBasicMaterial color="#fff7d0" transparent opacity={0.2} depthWrite={false} />
        </mesh>
      ))}
      {[-2, -1, 0, 1, 2].map((offset) => (
        <mesh key={`floor-z-${offset}`} position={[0, 0.014, offset]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[5.05, 0.035]} />
          <meshBasicMaterial color="#20312b" transparent opacity={0.08} depthWrite={false} />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, 0.9, -2.68]}>
        <boxGeometry args={[5.4, 1.8, 0.22]} />
        <meshStandardMaterial color={room.wall} roughness={0.92} />
      </mesh>
      <mesh castShadow receiveShadow position={[-2.68, 0.9, 0]}>
        <boxGeometry args={[0.22, 1.8, 5.4]} />
        <meshStandardMaterial color={room.wall} roughness={0.92} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.12, 2.72]}>
        <boxGeometry args={[5.4, 0.24, 0.24]} />
        <meshStandardMaterial color="#8a6742" roughness={0.82} />
      </mesh>
      <mesh castShadow receiveShadow position={[2.72, 0.12, 0]}>
        <boxGeometry args={[0.24, 0.24, 5.4]} />
        <meshStandardMaterial color="#8a6742" roughness={0.82} />
      </mesh>
    </group>
  );
}

function LivingRoom({ accent }: { accent: string }) {
  return (
    <group>
      <FurnitureBox position={[-0.85, 0.28, 0.75]} size={[1.7, 0.45, 0.75]} color={accent} />
      <FurnitureBox position={[-0.85, 0.72, 0.38]} size={[1.7, 0.75, 0.22]} color="#3e6f50" />
      <FurnitureBox position={[1.05, 0.18, 0.58]} size={[0.95, 0.22, 0.58]} color="#9b6a43" />
      <FurnitureBox position={[1.05, 0.5, -1.8]} size={[1.25, 0.85, 0.18]} color="#5d4634" />
    </group>
  );
}

function Kitchen({ accent }: { accent: string }) {
  return (
    <group>
      <FurnitureBox position={[-1.45, 0.35, -1.85]} size={[1.65, 0.7, 0.45]} color="#f2ead7" />
      <FurnitureBox position={[0.25, 0.35, -1.85]} size={[1.35, 0.7, 0.45]} color="#f2ead7" />
      <FurnitureBox position={[1.75, 0.55, -1.78]} size={[0.62, 1.1, 0.55]} color={accent} />
      <FurnitureBox position={[0.2, 0.28, 0.55]} size={[1.6, 0.18, 1.05]} color="#d7c48a" />
      <FurnitureBox position={[0.2, 0.62, 0.55]} size={[0.22, 0.7, 0.22]} color="#7a5b3d" />
    </group>
  );
}

function Bedroom({ accent }: { accent: string }) {
  return (
    <group>
      <FurnitureBox position={[-0.95, 0.24, 0.72]} size={[1.65, 0.36, 2.1]} color="#ead9cf" />
      <FurnitureBox position={[-0.95, 0.5, 0.25]} size={[1.55, 0.22, 1.15]} color={accent} />
      <FurnitureBox position={[1.45, 0.48, -1.45]} size={[1, 0.96, 0.48]} color="#8a6742" />
      <FurnitureBox position={[1.4, 0.2, 0.85]} size={[0.62, 0.4, 0.62]} color="#b9824d" />
    </group>
  );
}

function FurnitureBox({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh castShadow receiveShadow position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.78} />
    </mesh>
  );
}
