import { NextResponse } from "next/server";

import { isAuthorized } from "@/lib/server/api-auth";
import { ACTIVE_WINDOW_MS, listActiveKanbanCardSessions } from "@/lib/server/openclaw/kanban-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAuthorized())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { cardIds?: string[] };
    const cardIds = Array.isArray(body.cardIds)
      ? body.cardIds.map((cardId) => String(cardId).trim()).filter(Boolean).slice(0, 500)
      : [];

    return NextResponse.json({
      ok: true,
      activeByCardId: await listActiveKanbanCardSessions(cardIds),
      windowMs: ACTIVE_WINDOW_MS,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "failed to load active worker sessions",
      },
      { status: 500 },
    );
  }
}
