import { NextRequest } from "next/server";

import { errorResponse, handleModelsCatalogProvider, isAuthorized, json } from "@/lib/server/dashboard-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    const { provider } = await ctx.params;
    return await handleModelsCatalogProvider(provider);
  } catch (error) {
    return errorResponse(error);
  }
}
