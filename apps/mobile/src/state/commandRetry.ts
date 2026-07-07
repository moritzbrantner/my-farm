import type {
  CommandResponse,
  FarmCommand,
  FarmResponse,
} from "@my-farm/contracts";
import type { FarmClient } from "@my-farm/game-client";

export async function commandWithVersionRetry({
  client,
  command,
  expectedVersion,
  applyFarmSnapshot,
}: {
  client: FarmClient;
  command: FarmCommand;
  expectedVersion: number;
  applyFarmSnapshot(response: FarmResponse): void;
}): Promise<CommandResponse> {
  let response = await client.command({ expected_version: expectedVersion, command });
  if (!response.accepted && response.error?.startsWith("version mismatch")) {
    applyFarmSnapshot({ version: response.version, view: response.view, notice: response.notice });
    response = await client.command({ expected_version: response.version, command });
  }
  return response;
}

