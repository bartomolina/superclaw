import { existsSync, readFileSync, statSync } from "fs";

import { CommandExecutionError, runCommand } from "@/lib/server/command";
import { json } from "@/lib/server/openclaw/http";

type CaddyServiceState = {
  active: string | null;
  enabled: string | null;
};

function detectConfigPath(execStart: string | null) {
  const candidates = [
    "/etc/caddy/Caddyfile",
    "/usr/local/etc/caddy/Caddyfile",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  if (execStart) {
    const match = execStart.match(/--config\s+([^\s]+)/) || execStart.match(/-config\s+([^\s]+)/);
    if (match?.[1]) return match[1].replace(/^"|"$/g, "");
  }

  return candidates[0];
}

function summarizeSites(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .filter((line) => line.endsWith("{") && line !== "{" && !line.startsWith("(") && !line.startsWith("import "))
    .map((line) => line.slice(0, -1).trim())
    .slice(0, 5);
}

function commandStdout(error: unknown) {
  return error instanceof CommandExecutionError ? error.stdout.trim() || null : null;
}

async function readServiceState(): Promise<CaddyServiceState> {
  let active: string | null = null;
  let enabled: string | null = null;

  try {
    const { stdout } = await runCommand("systemctl", ["is-active", "caddy"], { timeoutMs: 5_000 });
    active = stdout.trim() || null;
  } catch (error) {
    active = commandStdout(error);
  }

  try {
    const { stdout } = await runCommand("systemctl", ["is-enabled", "caddy"], { timeoutMs: 5_000 });
    enabled = stdout.trim() || null;
  } catch (error) {
    enabled = commandStdout(error);
  }

  return { active, enabled };
}

async function readExecStart() {
  try {
    const { stdout } = await runCommand("systemctl", ["show", "caddy", "-p", "ExecStart", "--value"], { timeoutMs: 5_000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function handleCaddyStatus() {
  const [service, execStart] = await Promise.all([readServiceState(), readExecStart()]);
  const configPath = detectConfigPath(execStart);

  let exists = false;
  let size = 0;
  let sites: string[] = [];

  try {
    exists = existsSync(configPath);
    if (exists) {
      size = statSync(configPath).size;
      sites = summarizeSites(readFileSync(configPath, "utf8"));
    }
  } catch {
    exists = false;
    size = 0;
    sites = [];
  }

  return json({
    service,
    config: {
      path: configPath,
      exists,
      size,
      sites,
    },
  });
}
