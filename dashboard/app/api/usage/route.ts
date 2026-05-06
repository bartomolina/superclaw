import { NextRequest } from "next/server";

import { errorResponse, handleUsage, isAuthorized, json } from "@/lib/server/openclaw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseUsageParams(req: NextRequest) {
  const params: Record<string, unknown> = {};
  const search = req.nextUrl.searchParams;

  const limit = Number(search.get("limit"));
  if (Number.isFinite(limit) && limit > 0) params.limit = Math.min(Math.floor(limit), 100);

  for (const key of ["startDate", "endDate"] as const) {
    const value = search.get(key)?.trim();
    if (value) params[key] = value;
  }

  return params;
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);
    return await handleUsage(parseUsageParams(req));
  } catch (error) {
    return errorResponse(error);
  }
}
