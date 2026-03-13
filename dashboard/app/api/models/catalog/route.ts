import { NextRequest } from "next/server";

import { errorResponse, handleModelsCatalogProviders, isAuthorized, json } from "@/lib/server/dashboard-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    return await handleModelsCatalogProviders();
  } catch (error) {
    return errorResponse(error);
  }
}
