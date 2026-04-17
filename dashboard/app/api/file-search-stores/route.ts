import { NextRequest } from "next/server";

import { errorResponse, handleFileSearchStores, isAuthorized, json } from "@/lib/server/openclaw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";
    return await handleFileSearchStores(forceRefresh);
  } catch (error) {
    return errorResponse(error);
  }
}
