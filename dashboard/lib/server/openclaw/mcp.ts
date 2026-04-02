import path from "path";
import { homedir } from "os";

import { runCommand } from "@/lib/server/command";
import { json } from "@/lib/server/openclaw/http";

type McporterServer = {
  name?: string;
  transport?: string;
  baseUrl?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  env?: Record<string, string>;
  cwd?: string;
  workingDirectory?: string;
  source?: {
    kind?: string;
    path?: string;
  };
};

const HOME_DIR = process.env.HOME || homedir();
const OPENCLAW_HOME = path.join(HOME_DIR, ".openclaw");
const MAIN_WORKSPACE = path.join(OPENCLAW_HOME, "workspace");
const MCPORTER_BIN = "mcporter";

function inferTransport(server: McporterServer) {
  if (typeof server.transport === "string" && server.transport) return server.transport;
  if (typeof server.baseUrl === "string" && server.baseUrl) return "http";
  if (typeof server.command === "string" && server.command) return "stdio";
  return "unknown";
}

function summarizeTarget(server: McporterServer) {
  if (typeof server.baseUrl === "string" && server.baseUrl) {
    try {
      const url = new URL(server.baseUrl);
      return url.host || url.origin;
    } catch {
      return server.baseUrl;
    }
  }

  if (typeof server.command === "string" && server.command) {
    return path.basename(server.command);
  }

  return null;
}

function hasAuth(server: McporterServer) {
  const headerKeys = Object.keys(server.headers || {}).filter((key) => key.toLowerCase() !== "accept");
  return headerKeys.length > 0 || Object.keys(server.env || {}).length > 0;
}

export async function handleMcpList() {
  // MCP servers are now managed through mcporter project config in the main OpenClaw workspace.
  // Read through mcporter and return a sanitized dashboard summary only.
  const { stdout } = await runCommand(MCPORTER_BIN, ["config", "list", "--json"], {
    cwd: MAIN_WORKSPACE,
    timeoutMs: 15_000,
  });

  const parsed = JSON.parse(stdout || "{}") as {
    servers?: McporterServer[];
  };

  const servers = (parsed.servers || [])
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map((server) => ({
      name: server.name || "unnamed",
      transport: inferTransport(server),
      target: summarizeTarget(server),
      url: typeof server.baseUrl === "string" ? server.baseUrl : null,
      hasAuth: hasAuth(server),
      workingDirectory: server.workingDirectory || server.cwd || null,
      argsCount: Array.isArray(server.args) ? server.args.length : 0,
    }));

  return json({ servers });
}
