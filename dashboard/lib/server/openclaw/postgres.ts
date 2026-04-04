import { CommandExecutionError, runCommand } from "@/lib/server/command";
import { json } from "@/lib/server/openclaw/http";

type PostgresDatabase = {
  name: string;
};

const POSTGRES_DATABASES_TTL_MS = 60_000;
const LIST_DATABASES_SQL = "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;";

let postgresDatabasesCache: PostgresDatabase[] | null = null;
let postgresDatabasesCacheTime = 0;
let postgresDatabasesCacheInFlight: Promise<PostgresDatabase[]> | null = null;

function commandMissing(error: unknown) {
  return error instanceof CommandExecutionError && /not found/i.test(error.message);
}

async function loadPostgresDatabases() {
  try {
    const { stdout } = await runCommand("sudo", ["-u", "postgres", "psql", "-Atqc", LIST_DATABASES_SQL], { timeoutMs: 10_000 });

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
  } catch (error) {
    if (commandMissing(error)) return [];
    throw error;
  }
}

function refreshPostgresDatabases() {
  if (!postgresDatabasesCacheInFlight) {
    postgresDatabasesCacheInFlight = loadPostgresDatabases()
      .then((databases) => {
        postgresDatabasesCache = databases;
        postgresDatabasesCacheTime = Date.now();
        return databases;
      })
      .catch(() => postgresDatabasesCache || [])
      .finally(() => {
        postgresDatabasesCacheInFlight = null;
      });
  }

  return postgresDatabasesCacheInFlight;
}

export async function listPostgresDatabases(forceRefresh = false) {
  if (forceRefresh) return refreshPostgresDatabases();

  const now = Date.now();
  if (postgresDatabasesCache && now - postgresDatabasesCacheTime < POSTGRES_DATABASES_TTL_MS) return postgresDatabasesCache;

  if (postgresDatabasesCache) {
    void refreshPostgresDatabases();
    return postgresDatabasesCache;
  }

  return refreshPostgresDatabases();
}

export async function handlePostgresDatabases(forceRefresh = false) {
  return json({ databases: await listPostgresDatabases(forceRefresh) });
}
