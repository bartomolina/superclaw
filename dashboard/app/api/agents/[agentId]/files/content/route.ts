import { NextRequest } from "next/server";

import { errorResponse, handleAgentFileGet, isAuthorized, json } from "@/lib/server/openclaw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    const { agentId } = await ctx.params;
    const relativePath = req.nextUrl.searchParams.get("path") || "";
    return await handleAgentFileGet(decodeURIComponent(agentId), relativePath);
  } catch (error) {
    return errorResponse(error);
  }
}
