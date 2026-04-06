import { runOpenClaw } from "@/lib/server/openclaw/cli";
import { json } from "@/lib/server/openclaw/http";

type BrowserProfile = {
  name: string;
  status: string;
  details: string[];
  isDefault: boolean;
};

const BROWSER_PROFILES_TTL_MS = 60_000;

let browserProfilesCache: BrowserProfile[] | null = null;
let browserProfilesCacheTime = 0;
let browserProfilesCacheInFlight: Promise<BrowserProfile[]> | null = null;

function parseBrowserProfiles(stdout: string) {
  const profiles: BrowserProfile[] = [];
  let current: BrowserProfile | null = null;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;

    const profileMatch = line.match(/^([^\s][^:]*):\s*(.+)$/);
    if (profileMatch) {
      const [, name, rest] = profileMatch;
      const isDefault = /\[default\]/i.test(rest);
      const status = rest.replace(/\s*\[[^\]]+\]/g, "").trim();
      current = {
        name: name.trim(),
        status,
        details: [],
        isDefault,
      };
      profiles.push(current);
      continue;
    }

    if (current && /^\s+/.test(rawLine)) {
      current.details.push(line.trim());
    }
  }

  return profiles;
}

async function loadBrowserProfiles() {
  const { stdout } = await runOpenClaw(["browser", "profiles"], { timeoutMs: 30_000 });
  return parseBrowserProfiles(stdout);
}

function refreshBrowserProfiles() {
  if (!browserProfilesCacheInFlight) {
    browserProfilesCacheInFlight = loadBrowserProfiles()
      .then((profiles) => {
        browserProfilesCache = profiles;
        browserProfilesCacheTime = Date.now();
        return profiles;
      })
      .catch(() => browserProfilesCache || [])
      .finally(() => {
        browserProfilesCacheInFlight = null;
      });
  }

  return browserProfilesCacheInFlight;
}

export async function listBrowserProfiles(forceRefresh = false) {
  if (forceRefresh) return refreshBrowserProfiles();

  const now = Date.now();
  if (browserProfilesCache && now - browserProfilesCacheTime < BROWSER_PROFILES_TTL_MS) return browserProfilesCache;

  if (browserProfilesCache) {
    void refreshBrowserProfiles();
    return browserProfilesCache;
  }

  return refreshBrowserProfiles();
}

export async function handleBrowserProfiles(forceRefresh = false) {
  return json({ profiles: await listBrowserProfiles(forceRefresh) });
}
