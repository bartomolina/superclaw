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

  const hostBaseUrl = process.env.KANBAN_BASE_URL?.trim() || null;
  const hostToken = process.env.KANBAN_AGENT_TOKEN?.trim() || "";
  const host: RuntimeEnvStatus = {
    configured: !!hostBaseUrl && hostToken.length > 0,
    baseUrl: hostBaseUrl,
    hasToken: hostToken.length > 0,
  };

  const sandboxDefaultsEnv = localConfig.agents?.defaults?.sandbox?.docker?.env;
  const sandboxDefaults = readStatusFromEnv(sandboxDefaultsEnv);
  const sandboxDefaultsToken = typeof sandboxDefaultsEnv?.KANBAN_AGENT_TOKEN === "string" ? sandboxDefaultsEnv.KANBAN_AGENT_TOKEN.trim() : "";
  const sandboxMode = localConfig.agents?.defaults?.sandbox?.mode || "off";
  const sandboxEnabled = sandboxMode !== "off";

  let derived = {
    available: false,
    baseUrl: null as string | null,
    hasToken: false,
    token: "",
  };

  try {
    derived = await resolveDerivedWorkerEnv();
  } catch (error) {
    warnings.push(`resolve-worker-env: ${error instanceof Error ? error.message : String(error)}`);
  }

  const checks = {
    hostMatchesDerived: host.configured && derived.available ? host.baseUrl === derived.baseUrl && hostToken === derived.token : null,
    sandboxMatchesHost: sandboxEnabled && sandboxDefaults.configured && host.configured ? sandboxDefaults.baseUrl === host.baseUrl && sandboxDefaultsToken === hostToken : null,
    sandboxMatchesDerived:
      sandboxEnabled && sandboxDefaults.configured && derived.available
        ? sandboxDefaults.baseUrl === derived.baseUrl && sandboxDefaultsToken === derived.token
        : null,
  };

  const ready = host.configured && (!sandboxEnabled || sandboxDefaults.configured);

  if (!host.configured) {
    warnings.push("OpenClaw host runtime is missing KANBAN_BASE_URL and/or KANBAN_AGENT_TOKEN.");
  }
  if (sandboxEnabled && !sandboxDefaults.configured) {
    warnings.push("Sandbox defaults are enabled but agents.defaults.sandbox.docker.env is missing KANBAN_BASE_URL and/or KANBAN_AGENT_TOKEN.");
  }
  if (checks.hostMatchesDerived === false) {
    warnings.push("OpenClaw host runtime does not match the values derived from the local Kanban app.");
  }
  if (checks.sandboxMatchesHost === false) {
    warnings.push("Sandbox defaults do not match the OpenClaw host runtime values.");
  }

  return json({
    ready,
    host,
    sandboxDefaults: {
      ...sandboxDefaults,
      enabled: sandboxEnabled,
      mode: sandboxMode,
    },
    derived: {
      available: derived.available,
      baseUrl: derived.baseUrl,
      hasToken: derived.hasToken,
    },
    checks,
    warnings,
  });
}
