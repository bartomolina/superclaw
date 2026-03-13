import { NextRequest } from "next/server";

import { errorResponse, handlePerformance, isAuthorized, json } from "@/lib/server/openclaw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    return await handlePerformance();
  } catch (error) {
    return errorResponse(error);
  }
}
