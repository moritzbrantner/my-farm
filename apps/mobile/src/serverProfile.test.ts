import { describe, expect, test } from "bun:test";
import {
  clearServerUrl,
  loadRecentServerUrls,
  loadServerUrl,
  normalizeServerUrl,
  saveServerUrl,
  type ServerProfileStore,
} from "./serverProfile";

function memoryStore(): ServerProfileStore {
  const values = new Map<string, string>();
  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

describe("server profile", () => {
  test("normalizes URLs for mobile server profiles", () => {
    expect(normalizeServerUrl("192.168.1.10:8081/")).toBe("http://192.168.1.10:8081");
    expect(normalizeServerUrl(" https://farm.local:8443/path?debug=true#top ")).toBe("https://farm.local:8443/path");
  });

  test("saves, loads, remembers, and clears the configured server URL", async () => {
    const store = memoryStore();

    expect(await loadServerUrl(store, "127.0.0.1:8081")).toBe("http://127.0.0.1:8081");
    await saveServerUrl(store, "castle.local:8081");

    expect(await loadServerUrl(store, "127.0.0.1:8081")).toBe("http://castle.local:8081");
    expect(await loadRecentServerUrls(store)).toEqual(["http://castle.local:8081"]);

    await clearServerUrl(store);
    expect(await loadServerUrl(store, "127.0.0.1:8081")).toBe("http://127.0.0.1:8081");
  });

  test("rejects blank server URLs", async () => {
    await expect(saveServerUrl(memoryStore(), "   ")).rejects.toThrow("Server URL is required");
  });
});
