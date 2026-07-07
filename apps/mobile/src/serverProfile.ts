const serverProfileKey = "my-farm.mobile.server-url.v1";
const recentServerUrlsKey = "my-farm.mobile.recent-server-urls.v1";
const maxRecentUrls = 5;

export type ServerProfileStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export function normalizeServerUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withProtocol);
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

export async function loadServerUrl(store: ServerProfileStore, fallbackUrl: string): Promise<string> {
  const saved = await store.getItem(serverProfileKey);
  return saved ?? normalizeServerUrl(fallbackUrl);
}

export async function saveServerUrl(store: ServerProfileStore, value: string): Promise<string> {
  const normalized = normalizeServerUrl(value);
  if (!normalized) {
    throw new Error("Server URL is required");
  }
  await store.setItem(serverProfileKey, normalized);
  await rememberServerUrl(store, normalized);
  return normalized;
}

export async function clearServerUrl(store: ServerProfileStore): Promise<void> {
  await store.removeItem(serverProfileKey);
}

export async function loadRecentServerUrls(store: ServerProfileStore): Promise<string[]> {
  const raw = await store.getItem(recentServerUrlsKey);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

async function rememberServerUrl(store: ServerProfileStore, value: string): Promise<void> {
  const recent = await loadRecentServerUrls(store);
  const next = [value, ...recent.filter((entry) => entry !== value)].slice(0, maxRecentUrls);
  await store.setItem(recentServerUrlsKey, JSON.stringify(next));
}
