import path from "path";

import { json } from "@/lib/server/openclaw/http";
import { runOpenClawJson } from "@/lib/server/openclaw/cli";

type RawMcpServer = {
  type?: string;
  url?: string;
  command?: string;
  args?: string[];
  headers?: Array<{ name?: string }>;
  env?: Record<string, string>;
  cwd?: string;
  workingDirectory?: string;
};

function inferTransport(name: string, server: RawMcpServer) {
  const type = typeof server.type === "string" ? server.type : "";
  if (type) return type;
  if (typeof server.url === "string" && server.url) return "http";
  if (typeof server.command === "string" && server.command) return "stdio";
  return name;
}

function summarizeTarget(server: RawMcpServer) {
  if (typeof server.url === "string" && server.url) {
    try {
      const url = new URL(server.url);
      return url.host || url.origin;
    } catch {
      return server.url;
    }
  }

  if (typeof server.command === "string" && server.command) {
    return path.basename(server.command);
  }

  return null;
}

export async function handleMcpList() {
  // OpenClaw now owns MCP registry config via `openclaw mcp` / `mcp.servers`.
  // Read through the CLI and return a sanitized dashboard summary only.
  const data = await runOpenClawJson<Record<string, RawMcpServer>>(["mcp", "list", "--json"], {});

  const servers = Object.entries(data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, server]) => ({
      name,
      transport: inferTransport(name, server),
      target: summarizeTarget(server),
      url: typeof server.url === "string" ? server.url : null,
      hasAuth: (server.headers?.length || 0) > 0 || Object.keys(server.env || {}).length > 0,
      workingDirectory: server.workingDirectory || server.cwd || null,
      argsCount: Array.isArray(server.args) ? server.args.length : 0,
    }));

  return json({ servers });
}
