import { NextRequest } from "next/server";

import { errorResponse, handleVerify } from "@/lib/server/dashboard-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    return await handleVerify(req);
  } catch (error) {
    return errorResponse(error);
  }
}
