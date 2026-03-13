import { NextRequest } from "next/server";

import { errorResponse, handleAgentSkills, isAuthorized, json } from "@/lib/server/openclaw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    const { agentId } = await ctx.params;
    return await handleAgentSkills(decodeURIComponent(agentId));
  } catch (error) {
    return errorResponse(error);
  }
}
