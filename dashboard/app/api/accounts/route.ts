import { NextRequest } from "next/server";

import { errorResponse, handleAccountsList, isAuthorized, json } from "@/lib/server/openclaw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    return await handleAccountsList();
  } catch (error) {
    return errorResponse(error);
  }
}
