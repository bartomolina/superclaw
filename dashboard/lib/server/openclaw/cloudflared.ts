import { existsSync, readFileSync } from "fs";

import { CommandExecutionError, runCommand } from "@/lib/server/command";
import { json } from "@/lib/server/openclaw/http";

type CloudflaredServiceState = {
  active: string | null;
  enabled: string | null;
};

type CloudflaredRoute = {
  hostname: string;
  service: string;
};

function commandStdout(error: unknown) {
  return error instanceof CommandExecutionError ? error.stdout.trim() || null : null;
}

async function readServiceState(): Promise<CloudflaredServiceState> {
  let active: string | null = null;
  let enabled: string | null = null;

  try {
    const { stdout } = await runCommand("systemctl", ["is-active", "cloudflared"], { timeoutMs: 5_000 });
    active = stdout.trim() || null;
  } catch (error) {
    active = commandStdout(error);
  }

  try {
    const { stdout } = await runCommand("systemctl", ["is-enabled", "cloudflared"], { timeoutMs: 5_000 });
    enabled = stdout.trim() || null;
  } catch (error) {
    enabled = commandStdout(error);
  }

  return { active, enabled };
}

function parseConfig(raw: string) {
  const routes: CloudflaredRoute[] = [];
  let tunnel: string | null = null;
  let credentialsFile: string | null = null;
  let currentHostname: string | null = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const tunnelMatch = line.match(/^tunnel:\s*["']?([^"'\s#]+)["']?/i);
    if (tunnelMatch?.[1]) {
      tunnel = tunnelMatch[1];
      continue;
    }

    const credentialsMatch = line.match(/^credentials-file:\s*["']?([^"'#]+?)["']?$/i);
    if (credentialsMatch?.[1]) {
      credentialsFile = credentialsMatch[1].trim();
      continue;
    }

    const hostnameMatch = line.match(/^(?:-\s*)?hostname:\s*["']?([^"'\s#]+)["']?/i);
    if (hostnameMatch?.[1]) {
      currentHostname = hostnameMatch[1];
      continue;
    }

    const serviceMatch = line.match(/^(?:-\s*)?service:\s*["']?([^"'#]+?)["']?$/i);
    if (serviceMatch?.[1] && currentHostname) {
      routes.push({ hostname: currentHostname, service: serviceMatch[1].trim() });
      currentHostname = null;
    }
  }

  return { tunnel, credentialsFile, routes };
}

export async function handleCloudflaredStatus() {
  const configPath = "/etc/cloudflared/config.yml";
  const service = await readServiceState();

  let exists = false;
  let tunnel: string | null = null;
  let credentialsFile: string | null = null;
  let routes: CloudflaredRoute[] = [];

  try {
    exists = existsSync(configPath);
    if (exists) {
      const parsed = parseConfig(readFileSync(configPath, "utf8"));
      tunnel = parsed.tunnel;
      credentialsFile = parsed.credentialsFile;
      routes = parsed.routes;
    }
  } catch {
    exists = false;
  }

  return json({
    service,
    config: {
      path: configPath,
      exists,
      tunnel,
      credentialsFile,
      routes,
    },
  });
}
