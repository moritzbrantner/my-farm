import type {
  CatalogDocument,
  FarmCommand,
  FarmResponse,
  StructureKind,
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

export type CommandSender = (command: FarmCommand) => Promise<void>;

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

