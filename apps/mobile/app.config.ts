import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "My Farm",
  slug: "my-farm",
  scheme: "myfarm",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  newArchEnabled: false,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "dev.moritzbrantner.myfarm",
  },
  android: {
    package: "dev.moritzbrantner.myfarm",
    adaptiveIcon: {
      backgroundColor: "#9fd3d1",
    },
  },
  extra: {
    defaultApiBaseUrl: process.env.EXPO_PUBLIC_MY_FARM_DEFAULT_API_BASE_URL ?? "http://127.0.0.1:8081",
  },
};

export default config;
