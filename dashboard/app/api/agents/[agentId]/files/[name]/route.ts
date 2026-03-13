import { NextRequest } from "next/server";

import { errorResponse, handleAgentFileGet, handleAgentFilePut, isAuthorized, json } from "@/lib/server/openclaw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ agentId: string; name: string }> }) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    const { agentId, name } = await ctx.params;
    return await handleAgentFileGet(decodeURIComponent(agentId), decodeURIComponent(name));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ agentId: string; name: string }> }) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    const { agentId, name } = await ctx.params;
    return await handleAgentFilePut(req, decodeURIComponent(agentId), decodeURIComponent(name));
  } catch (error) {
    return errorResponse(error);
  }
}
