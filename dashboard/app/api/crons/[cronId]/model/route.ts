import { NextRequest } from "next/server";

import { errorResponse, handleCronModel, isAuthorized, json } from "@/lib/server/dashboard-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ cronId: string }> }) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    const { cronId } = await ctx.params;
    return await handleCronModel(req, decodeURIComponent(cronId));
  } catch (error) {
    return errorResponse(error);
  }
}
