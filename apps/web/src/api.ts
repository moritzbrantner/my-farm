import type { CatalogDocument, CommandRequest, CommandResponse, FarmResponse } from "./types";

const defaultBaseUrl = "http://127.0.0.1:8081";

export function createFarmClient(baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultBaseUrl) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      ...init,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? `Request failed: ${response.status}`);
    }
    return payload;
  }

  return {
    async catalog(): Promise<CatalogDocument> {
      const payload = await request<{ catalog: CatalogDocument }>("/api/catalog");
      return payload.catalog;
    },
    farm(): Promise<FarmResponse> {
      return request<FarmResponse>("/api/farm");
    },
    reset(): Promise<FarmResponse> {
      return request<FarmResponse>("/api/farm/reset", { method: "POST" });
    },
    command(command: CommandRequest): Promise<CommandResponse> {
      return request<CommandResponse>("/api/commands", {
        method: "POST",
        body: JSON.stringify(command),
      });
    },
  };
}

