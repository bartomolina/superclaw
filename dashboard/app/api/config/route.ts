import { NextRequest } from "next/server";

import { errorResponse, handleConfigGet, isAuthorized, json } from "@/lib/server/openclaw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    return await handleConfigGet();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    return json({ error: "Config editing is disabled in the dashboard" }, 405);
  } catch (error) {
    return errorResponse(error);
  }
}
