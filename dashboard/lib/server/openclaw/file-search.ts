import { readLocalConfig } from "@/lib/server/openclaw/config";
import { json } from "@/lib/server/openclaw/http";

type FileSearchStore = {
  name: string;
  displayName: string | null;
  createTime: string | null;
  updateTime: string | null;
  activeDocumentsCount: number | null;
  failedDocumentsCount: number | null;
  sizeBytes: number | null;
};

type FileSearchStoresResponse = {
  fileSearchStores?: Array<{
    name?: string;
    displayName?: string;
    createTime?: string;
    updateTime?: string;
    activeDocumentsCount?: string | number;
    failedDocumentsCount?: string | number;
    sizeBytes?: string | number;
  }>;
  nextPageToken?: string;
};

type FileSearchSnapshot = {
  authConfigured: boolean;
  baseUrl: string | null;
  stores: FileSearchStore[];
  error: string | null;
};

const FILE_SEARCH_STORES_TTL_MS = 60_000;
const DEFAULT_GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

let fileSearchStoresCache: FileSearchSnapshot | null = null;
let fileSearchStoresCacheTime = 0;
let fileSearchStoresCacheInFlight: Promise<FileSearchSnapshot> | null = null;

function resolveConfiguredGoogleApiKey() {
  const config = readLocalConfig() as {
    models?: {
      providers?: {
        google?: {
          apiKey?: string | { source?: string; id?: string };
          baseUrl?: string;
        };
      };
    };
  };

  const provider = config.models?.providers?.google;
  const configured = provider?.apiKey;

  if (typeof configured === "string" && configured.trim()) {
    return {
      apiKey: configured.trim(),
      baseUrl: typeof provider?.baseUrl === "string" && provider.baseUrl.trim() ? provider.baseUrl.trim() : DEFAULT_GOOGLE_BASE_URL,
    };
  }

  if (configured && typeof configured === "object" && configured.source === "env" && typeof configured.id === "string" && configured.id.trim()) {
    const envValue = process.env[configured.id.trim()]?.trim();
    if (envValue) {
      return {
        apiKey: envValue,
        baseUrl: typeof provider?.baseUrl === "string" && provider.baseUrl.trim() ? provider.baseUrl.trim() : DEFAULT_GOOGLE_BASE_URL,
      };
    }
  }

  const envValue = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || "";
  if (envValue) {
    return {
      apiKey: envValue,
      baseUrl: typeof provider?.baseUrl === "string" && provider.baseUrl.trim() ? provider.baseUrl.trim() : DEFAULT_GOOGLE_BASE_URL,
    };
  }

  return {
    apiKey: null,
    baseUrl: typeof provider?.baseUrl === "string" && provider.baseUrl.trim() ? provider.baseUrl.trim() : DEFAULT_GOOGLE_BASE_URL,
  };
}

function parseCount(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeStore(store: NonNullable<FileSearchStoresResponse["fileSearchStores"]>[number]): FileSearchStore {
  return {
    name: typeof store.name === "string" ? store.name : "",
    displayName: typeof store.displayName === "string" && store.displayName.trim() ? store.displayName.trim() : null,
    createTime: typeof store.createTime === "string" && store.createTime.trim() ? store.createTime : null,
    updateTime: typeof store.updateTime === "string" && store.updateTime.trim() ? store.updateTime : null,
    activeDocumentsCount: parseCount(store.activeDocumentsCount),
    failedDocumentsCount: parseCount(store.failedDocumentsCount),
    sizeBytes: parseCount(store.sizeBytes),
  };
}

async function loadFileSearchStores(): Promise<FileSearchSnapshot> {
  const { apiKey, baseUrl } = resolveConfiguredGoogleApiKey();
  if (!apiKey) {
    return {
      authConfigured: false,
      baseUrl,
      stores: [],
      error: null,
    };
  }

  try {
    const stores: FileSearchStore[] = [];
    let pageToken = "";

    for (let page = 0; page < 20; page += 1) {
      const url = new URL(`${baseUrl.replace(/\/$/, "")}/fileSearchStores`);
      url.searchParams.set("key", apiKey);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Google File Search API ${response.status}: ${text.slice(0, 300) || "request failed"}`);
      }

      const payload = (await response.json()) as FileSearchStoresResponse;
      stores.push(...(payload.fileSearchStores || []).map(normalizeStore));

      if (!payload.nextPageToken) break;
      pageToken = payload.nextPageToken;
    }

    stores.sort((a, b) => {
      const left = (a.displayName || a.name).toLowerCase();
      const right = (b.displayName || b.name).toLowerCase();
      return left.localeCompare(right);
    });

    return {
      authConfigured: true,
      baseUrl,
      stores,
      error: null,
    };
  } catch (error) {
    return {
      authConfigured: true,
      baseUrl,
      stores: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function refreshFileSearchStores() {
  if (!fileSearchStoresCacheInFlight) {
    fileSearchStoresCacheInFlight = loadFileSearchStores()
      .then((snapshot) => {
        fileSearchStoresCache = snapshot;
        fileSearchStoresCacheTime = Date.now();
        return snapshot;
      })
      .catch(() => fileSearchStoresCache || { authConfigured: false, baseUrl: DEFAULT_GOOGLE_BASE_URL, stores: [], error: "Failed to load Google File Search stores" })
      .finally(() => {
        fileSearchStoresCacheInFlight = null;
      });
  }

  return fileSearchStoresCacheInFlight;
}

export async function listFileSearchStores(forceRefresh = false) {
  if (forceRefresh) return refreshFileSearchStores();

  const now = Date.now();
  if (fileSearchStoresCache && now - fileSearchStoresCacheTime < FILE_SEARCH_STORES_TTL_MS) return fileSearchStoresCache;

  if (fileSearchStoresCache) {
    void refreshFileSearchStores();
    return fileSearchStoresCache;
  }

  return refreshFileSearchStores();
}

export async function handleFileSearchStores(forceRefresh = false) {
  return json(await listFileSearchStores(forceRefresh));
}
