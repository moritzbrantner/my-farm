import type {
  CatalogDocument,
  FarmCommand,
  FarmResponse,
  StructureKind,
  SweepHarvestMode,
} from "@my-farm/contracts";
import type { FarmConnectionStatus } from "@my-farm/game-client";

export type Screen =
  | "connect"
  | "menu"
  | "farm"
  | "residents"
  | "market"
  | "orders"
  | "house"
  | "wiki"
  | "settings"
  | "account";

export type Diagnostics = {
  lastCommandLatencyMs: number | null;
  farmVersion: number;
};

export type CommandResult = { accepted: boolean; error: string | null };
export type CommandSender = (command: FarmCommand) => Promise<CommandResult>;

export type ShellProps = {
  serverUrl: string;
  status: FarmConnectionStatus;
  message: string;
  catalog: CatalogDocument | null;
  farm: FarmResponse | null;
  diagnostics: Diagnostics;
  nowMs: number;
  onNavigate(screen: Screen): void;
};

export type BuildableStructureKind = Exclude<StructureKind, "silo" | "barn">;
export type BuildableKind = "field_plot" | BuildableStructureKind;

export type ActiveFieldTool = { type: "default" } | { type: "plant"; cropId: string } | { type: "harvest" };
export type PlantSweepState = {
  cropId: string;
  plotIds: string[];
  pointerId: number;
} | null;
export type HarvestSweepState = {
  cropId: string;
  harvestMode: SweepHarvestMode;
  plotIds: string[];
  pointerId: number;
} | null;
export type BuildPlacementState = {
  kind: BuildableKind;
} | null;
export type ResidentTaskPreviewSelection = {
  residentId: string;
  taskId: string;
} | null;
