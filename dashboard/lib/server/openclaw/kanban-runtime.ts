import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

import { OPENCLAW_HOME } from "@/lib/server/openclaw/constants";
import { readLocalConfig } from "@/lib/server/openclaw/config";
import { json } from "@/lib/server/openclaw/http";

const execFileAsync = promisify(execFile);
const KANBAN_APP_DIR = path.join(OPENCLAW_HOME, "workspace", "apps", "superclaw", "kanban");
const RESOLVE_WORKER_ENV_SCRIPT = path.join(KANBAN_APP_DIR, "scripts", "resolve-worker-env.sh");

type RuntimeEnvStatus = {
  configured: boolean;
  baseUrl: string | null;
  hasToken: boolean;
};

function readStatusFromEnv(env: Record<string, unknown> | undefined | null): RuntimeEnvStatus {
  const baseUrl = typeof env?.KANBAN_BASE_URL === "string" && env.KANBAN_BASE_URL.trim() ? env.KANBAN_BASE_URL.trim() : null;
  const hasToken = typeof env?.KANBAN_AGENT_TOKEN === "string" ? env.KANBAN_AGENT_TOKEN.trim().length > 0 : false;

  return {
    configured: !!baseUrl && hasToken,
    baseUrl,
    hasToken,
  };
}

async function resolveDerivedWorkerEnv() {
  const { stdout } = await execFileAsync(RESOLVE_WORKER_ENV_SCRIPT, [], {
    cwd: KANBAN_APP_DIR,
    timeout: 15_000,
    env: process.env,
    maxBuffer: 256 * 1024,
  });

  const values = Object.fromEntries(
    stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf("=");
        return idx >= 0 ? [line.slice(0, idx), line.slice(idx + 1)] : [line, ""];
      }),
  ) as Record<string, string>;

  const baseUrl = values.KANBAN_BASE_URL?.trim() || null;
  const token = values.KANBAN_AGENT_TOKEN?.trim() || "";

  return {
    available: !!baseUrl && token.length > 0,
    baseUrl,
    hasToken: token.length > 0,
    token,
  };
}

export async function handleKanbanWorkerStatus() {
  const warnings: string[] = [];
  const localConfig = readLocalConfig();

  const sandboxDefaultsEnv = localConfig.agents?.defaults?.sandbox?.docker?.env;
  const sandboxDefaults = readStatusFromEnv(sandboxDefaultsEnv);
  const sandboxDefaultsToken = typeof sandboxDefaultsEnv?.KANBAN_AGENT_TOKEN === "string" ? sandboxDefaultsEnv.KANBAN_AGENT_TOKEN.trim() : "";
  const sandboxMode = localConfig.agents?.defaults?.sandbox?.mode || "off";
  const sandboxEnabled = sandboxMode !== "off";

  let workerEnv = {
    configured: false,
    baseUrl: null as string | null,
    hasToken: false,
    token: "",
  };

  try {
    const resolved = await resolveDerivedWorkerEnv();
    workerEnv = {
      configured: resolved.available,
      baseUrl: resolved.baseUrl,
      hasToken: resolved.hasToken,
      token: resolved.token,
    };
  } catch (error) {
    warnings.push(`resolve-worker-env: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!workerEnv.configured) {
    warnings.push("Kanban worker env is missing KANBAN_BASE_URL and/or KANBAN_AGENT_TOKEN.");
  }
  if (sandboxDefaults.configured && workerEnv.configured && (sandboxDefaults.baseUrl !== workerEnv.baseUrl || sandboxDefaultsToken !== workerEnv.token)) {
    warnings.push("Configured sandbox defaults do not match the resolved Kanban worker env.");
  }

  return json({
    ready: workerEnv.configured,
    workerEnv: {
      configured: workerEnv.configured,
      baseUrl: workerEnv.baseUrl,
      hasToken: workerEnv.hasToken,
    },
    sandboxDefaults: {
      ...sandboxDefaults,
      enabled: sandboxEnabled,
      mode: sandboxMode,
    },
    warnings,
  });
}
