import { NextResponse } from "next/server";

import { isAuthorized } from "@/lib/server/api-auth";
import { fetchModelOptions } from "@/lib/server/options-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthorized())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const models = await fetchModelOptions();
    return NextResponse.json({ ok: true, models });
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
