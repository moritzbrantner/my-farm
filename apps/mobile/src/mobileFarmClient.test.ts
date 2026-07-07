import { expect, test } from "bun:test";
import { websocketUrl } from "@my-farm/game-client";

test("mobile client uses the shared gameplay websocket path", () => {
  expect(websocketUrl("http://192.168.1.10:8081")).toBe("ws://192.168.1.10:8081/api/gameplay");
  expect(websocketUrl("https://farm.example.test")).toBe("wss://farm.example.test/api/gameplay");
});
