import { readFileSync } from "fs";
import path from "path";

import { isAuthorized } from "@/lib/server/api-auth";
import { request } from "@/lib/server/gateway";
import { resolveExistingFileWithin } from "@/lib/server/path-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RawConfig = {
  agents?: {
    defaults?: {
      workspace?: string;
    };
    list?: Array<{
      id?: string;
      workspace?: string;
    }>;
  };
};

function parseAvatarFromIdentity(content: string | null | undefined) {
  if (!content) return null;
  const match = content.match(/\*\*Avatar:\*\*\s*(.+)/i);
  return match?.[1]?.trim() || null;
}

function isValidAgentId(value: string) {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

export async function GET(req: Request, context: { params: Promise<{ agentId: string }> }) {
  void req;

  if (!(await isAuthorized())) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { agentId: rawAgentId } = await context.params;
  const agentId = decodeURIComponent(rawAgentId || "").trim();

  if (!isValidAgentId(agentId)) {
    return new Response(JSON.stringify({ ok: false, error: "invalid agent id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const [identityFile, config] = (await Promise.all([
      request("agents.files.get", { agentId, name: "IDENTITY.md" }),
      request("config.get", {}),
    ])) as [{ file?: { content?: string } }, { raw?: string }];

    const avatarRelPath = parseAvatarFromIdentity(identityFile?.file?.content);
    if (!avatarRelPath) {
      return new Response(JSON.stringify({ ok: false, error: "no avatar" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    let rawConfig: RawConfig = {};
    try {
      rawConfig = JSON.parse(config.raw ?? "{}") as RawConfig;
    } catch {
      rawConfig = {};
    }

    const defaultsWorkspace = String(rawConfig.agents?.defaults?.workspace ?? "");
    const configuredAgents = Array.isArray(rawConfig.agents?.list) ? rawConfig.agents.list : [];
    const configuredAgent = configuredAgents.find((agent) => agent?.id === agentId);
    const workspace = String(configuredAgent?.workspace ?? defaultsWorkspace);

    const absPath = resolveExistingFileWithin(workspace, avatarRelPath);
    if (!absPath) {
      return new Response(JSON.stringify({ ok: false, error: "avatar file not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const ext = path.extname(absPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };

    const data = readFileSync(absPath);
    return new Response(data, {
      headers: {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
