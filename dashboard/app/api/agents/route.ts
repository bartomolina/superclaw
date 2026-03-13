import { NextRequest } from "next/server";

import { errorResponse, handleAgentsList, handleCreateAgent, isAuthorized, json } from "@/lib/server/dashboard-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    return await handleAgentsList();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    return await handleCreateAgent(req);
  } catch (error) {
    return errorResponse(error);
  }
}
