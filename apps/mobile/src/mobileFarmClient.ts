import { createHttpFarmClient, websocketUrl, type FarmClient } from "@my-farm/game-client";

export function createMobileFarmClient(baseUrl: string): FarmClient {
  return createHttpFarmClient(baseUrl, websocketUrl(baseUrl), {
    now: Date.now,
    randomUUID: randomRequestId,
    setTimeout,
    clearTimeout,
    WebSocket: globalThis.WebSocket,
  });
}

function randomRequestId(): string {
  const random = Math.random().toString(36).slice(2);
  return `${Date.now()}-${random}`;
}
