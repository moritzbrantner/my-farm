/// <reference types="bun-types/test" />

import { afterEach, expect, test } from "bun:test";
import { websocketUrl } from "./api";

const originalViteApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const originalViteGameplayWsUrl = import.meta.env.VITE_GAMEPLAY_WS_URL;
const originalWindow = globalThis.window;

afterEach(() => {
  import.meta.env.VITE_API_BASE_URL = originalViteApiBaseUrl;
  import.meta.env.VITE_GAMEPLAY_WS_URL = originalViteGameplayWsUrl;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

test("normal local dev websocket connects to the Rust server port", () => {
  import.meta.env.VITE_API_BASE_URL = undefined;
  import.meta.env.VITE_GAMEPLAY_WS_URL = undefined;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: new URL("http://127.0.0.1:5176"),
    },
  });

  expect(websocketUrl("http://127.0.0.1:8081")).toBe("ws://127.0.0.1:8081/api/gameplay");
});

test("explicit websocket override wins over API base URL", () => {
  import.meta.env.VITE_API_BASE_URL = "http://127.0.0.1:8091";
  import.meta.env.VITE_GAMEPLAY_WS_URL = "ws://127.0.0.1:9000/gameplay";

  expect(websocketUrl("http://127.0.0.1:8091")).toBe("ws://127.0.0.1:9000/gameplay");
});
