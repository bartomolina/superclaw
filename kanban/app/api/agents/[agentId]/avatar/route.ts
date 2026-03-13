import { readFileSync } from "fs";
import path from "path";

import { isAuthorized } from "@/lib/server/api-auth";
import { resolveAgentAvatarPath } from "@/lib/server/openclaw/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const absPath = resolveAgentAvatarPath(agentId);
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
