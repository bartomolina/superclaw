import { NextRequest } from "next/server";

import { errorResponse, handleModelsRemove, isAuthorized, json } from "@/lib/server/openclaw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    return await handleModelsRemove(req);
  } catch (error) {
    return errorResponse(error);
  }
}
