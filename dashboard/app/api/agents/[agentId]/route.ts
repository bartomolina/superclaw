import { NextRequest } from "next/server";

import { errorResponse, handleDeleteAgent, isAuthorized, json } from "@/lib/server/dashboard-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    const { agentId } = await ctx.params;
    return await handleDeleteAgent(req, decodeURIComponent(agentId));
  } catch (error) {
    return errorResponse(error);
  }
}
