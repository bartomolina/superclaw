import { NextResponse } from "next/server";

import { isAuthorized } from "@/lib/server/api-auth";
import { fetchAcpOptions } from "@/lib/server/options-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthorized())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const acp = await fetchAcpOptions();
    return NextResponse.json({ ok: true, acp });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "failed",
      },
      { status: 500 },
    );
  }
}
