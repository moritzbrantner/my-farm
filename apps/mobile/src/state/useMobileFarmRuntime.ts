import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FarmCommand, FarmResponse } from "@my-farm/contracts";
import type {
  FarmClient,
  FarmConnectionStatus,
} from "@my-farm/game-client";
import { commandWithVersionRetry } from "./commandRetry";
import { createMobileFarmClient } from "../mobileFarmClient";
import {
  clearServerUrl,
  loadRecentServerUrls,
  loadServerUrl,
  saveServerUrl,
} from "../serverProfile";
import type { Diagnostics, Screen } from "../types";

export const defaultServerUrl =
  Constants.expoConfig?.extra?.defaultApiBaseUrl ??
  process.env.EXPO_PUBLIC_MY_FARM_DEFAULT_API_BASE_URL ??
  "http://127.0.0.1:8081";

export type MobileFarmRuntime = ReturnType<typeof useMobileFarmRuntime>;

export function useMobileFarmRuntime() {
  const [screen, setScreen] = useState<Screen>("connect");
  const [serverUrl, setServerUrl] = useState("");
  const [recentServerUrls, setRecentServerUrls] = useState<string[]>([]);
  const [client, setClient] = useState<FarmClient | null>(null);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<FarmClient["catalog"]>> | null>(null);
  const [farm, setFarm] = useState<FarmResponse | null>(null);
  const [status, setStatus] = useState<FarmConnectionStatus>("disconnected");
  const [message, setMessage] = useState("Choose a Farm server");
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({
    lastCommandLatencyMs: null,
    farmVersion: 0,
  });
  const [nowMs, setNowMs] = useState(Date.now());
  const versionRef = useRef(0);
  const screenRef = useRef<Screen>("connect");

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadServerUrl(AsyncStorage, defaultServerUrl), loadRecentServerUrls(AsyncStorage)])
      .then(([url, recent]) => {
        if (!mounted) {
          return;
        }
        setServerUrl(url);
        setRecentServerUrls(recent);
      })
      .catch((error) => {
        if (mounted) {
          setMessage(error instanceof Error ? error.message : "Could not load server settings");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const applyFarmSnapshot = useCallback((nextFarm: FarmResponse) => {
    versionRef.current = nextFarm.version;
    setFarm(nextFarm);
    setDiagnostics((current) => ({ ...current, farmVersion: nextFarm.version }));
  }, []);

  useEffect(() => {
    if (!client) {
      return;
    }
    return client.connect?.({
      status(nextStatus) {
        setStatus(nextStatus);
        if (nextStatus === "disconnected") {
          setMessage("Server disconnected");
        } else if (nextStatus === "reconnecting") {
          setMessage("Connecting to Farm server...");
        } else {
          setMessage("Farm synced");
        }
      },
      catalog(nextCatalog) {
        setCatalog(nextCatalog);
      },
      farm(nextFarm) {
        applyFarmSnapshot(nextFarm);
        if (nextFarm.notice) {
          setMessage(nextFarm.notice.message);
        }
        if (screenRef.current === "connect") {
          setScreen("menu");
        }
      },
      error(errorMessage) {
        setMessage(errorMessage);
      },
    });
  }, [applyFarmSnapshot, client]);

  const connect = useCallback(async () => {
    try {
      const normalized = await saveServerUrl(AsyncStorage, serverUrl);
      setServerUrl(normalized);
      setRecentServerUrls(await loadRecentServerUrls(AsyncStorage));
      setCatalog(null);
      setFarm(null);
      setStatus("reconnecting");
      setMessage("Connecting to Farm server...");
      setClient(createMobileFarmClient(normalized));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid server URL");
    }
  }, [serverUrl]);

  const resetServerProfile = useCallback(async () => {
    await clearServerUrl(AsyncStorage);
    setServerUrl(defaultServerUrl);
    setClient(null);
    setCatalog(null);
    setFarm(null);
    setScreen("connect");
    setStatus("disconnected");
    setMessage("Server profile cleared");
    setDiagnostics({ lastCommandLatencyMs: null, farmVersion: 0 });
    versionRef.current = 0;
  }, []);

  const send = useCallback(
    async (command: FarmCommand) => {
      if (!client) {
        setMessage("Connect to a Farm server first");
        return { accepted: false, error: "Connect to a Farm server first" };
      }
      const startedAt = Date.now();
      try {
        const response = await commandWithVersionRetry({
          client,
          command,
          expectedVersion: versionRef.current,
          applyFarmSnapshot,
        });
        applyFarmSnapshot({ version: response.version, view: response.view, notice: response.notice });
        setDiagnostics((current) => ({ ...current, lastCommandLatencyMs: Date.now() - startedAt }));
        setMessage(response.notice?.message ?? (response.accepted ? "Command accepted" : response.error ?? "Command rejected"));
        return { accepted: response.accepted, error: response.error };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Command failed";
        setMessage(errorMessage);
        return { accepted: false, error: errorMessage };
      }
    },
    [applyFarmSnapshot, client],
  );

  const resetFarm = useCallback(async () => {
    if (!client) {
      setMessage("Connect to a Farm server first");
      return;
    }
    try {
      const response = await client.reset();
      applyFarmSnapshot(response);
      setMessage(response.notice?.message ?? "Farm reset");
      setScreen("farm");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reset failed");
    }
  }, [applyFarmSnapshot, client]);

  return {
    screen,
    setScreen,
    serverUrl,
    setServerUrl,
    recentServerUrls,
    catalog,
    farm,
    status,
    message,
    diagnostics,
    nowMs,
    connect,
    resetServerProfile,
    send,
    resetFarm,
  };
}
