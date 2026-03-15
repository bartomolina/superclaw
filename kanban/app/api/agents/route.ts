import { NextRequest, NextResponse } from "next/server";

import type { Id } from "@/convex/_generated/dataModel";
import { getAuthorizedBoardAgentAccess, getAuthorizedViewer } from "@/lib/server/api-auth";
import { fetchAgentOptions } from "@/lib/server/options-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(request: NextRequest) {
  const viewer = await getAuthorizedViewer();

  if (viewer?.isMember !== true) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const boardIdParam = request.nextUrl.searchParams.get("boardId")?.trim();

  if (!boardIdParam && viewer.isSuperuser !== true) {
    return NextResponse.json({ ok: false, error: "boardId is required" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const agents = await fetchAgentOptions();

    if (!boardIdParam) {
      return NextResponse.json({ ok: true, agents }, { headers: NO_STORE_HEADERS });
    }

    const access = await getAuthorizedBoardAgentAccess(boardIdParam as Id<"boards">);
    if (!access) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const filteredAgents = access.restricted
      ? agents.filter((agent) => access.allowedAgentIds.includes(String(agent.id).trim()))
      : agents;

    return NextResponse.json({ ok: true, agents: filteredAgents }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "failed",
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
