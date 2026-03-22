import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth-server";
import { getAuthorizedBoardAgentAccess } from "@/lib/server/api-auth";
import { gatewayCall } from "@/lib/server/openclaw/cli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GatewayAgentResponse = {
  runId?: string;
  status?: string;
  sessionKey?: string;
  sessionId?: string;
};

type ManualRunSession = {
  sessionKey: string;
  sessionId: string;
  idempotencyKey: string;
};

type RunTarget = {
  cardId: string;
  title: string;
  columnName: string;
  inboxReason: string;
  acp?: string;
  model?: string;
  executionHint?: string;
};

function createManualRunSession(agentId: string): ManualRunSession {
  const runUuid = randomUUID();
  return {
    sessionKey: `agent:${agentId}:kanban-manual:${runUuid}`,
    sessionId: `kanban-manual-${agentId}-${runUuid}`,
    idempotencyKey: `kanban-manual-${agentId}-${runUuid}`,
  };
}

function buildWorkerMessage({
  boardId,
  boardName,
  sessionId,
  targets,
}: {
  boardId: string;
  boardName: string;
  sessionId: string;
  targets: RunTarget[];
}) {
  const targetSummary =
    targets.length > 0
      ? targets
          .map((target) => {
            const executionHint = target.executionHint?.trim();
            return executionHint
              ? `- ${target.cardId} | ${target.columnName} | ${target.inboxReason} | ${target.title} | ${executionHint}`
              : `- ${target.cardId} | ${target.columnName} | ${target.inboxReason} | ${target.title}`;
          })
          .join("\n")
      : "- none";

  return [
    "Read the kanban skill first.",
    `Run one cron-safe SuperClaw Kanban worker pass for the current agent, scoped only to board "${boardName}" (${boardId}).`,
    `Use this Kanban session id for explicit run tracking: ${sessionId}.`,
    `Include header X-Kanban-Session-Id: ${sessionId} on every POST /agent/kanban/comment and POST /agent/kanban/transition request.`,
    "TODO cards selected for this manual run have already been claimed into In Progress by the backend before your work starts. Do not re-claim them.",
    `When the pass finishes, call POST /agent/kanban/session/finish with JSON {\"sessionId\":\"${sessionId}\",\"status\":\"done\"}. Use status \"failed\" or \"aborted\" when appropriate.`,
    "Current actionable cards for this board:",
    targetSummary,
    'If nothing actionable exists, still finish the session with status "done" and reply NO_REPLY.',
    "Follow the skill and its reference exactly.",
  ].join("\n");
}

function resolveManualRunModel(targets: RunTarget[]) {
  const models = Array.from(
    new Set(
      targets
        .map((target) => target.model?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  return models.length === 1 ? models[0] : null;
}

function completionStatusForGatewayStatus(status?: string | null) {
  const normalized = status?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized === "aborted") {
    return "aborted" as const;
  }

  if (["failed", "error", "rejected"].includes(normalized)) {
    return "failed" as const;
  }

  return null;
}

async function applyManualRunModelOverride(sessionKey: string, model: string) {
  await gatewayCall("sessions.patch", {
    key: sessionKey,
    model,
  });
}

async function startManualWorker(agentId: string, session: ManualRunSession, message: string) {
  const params = {
    agentId,
    sessionKey: session.sessionKey,
    sessionId: session.sessionId,
    label: `Kanban manual run (${agentId})`,
    message,
    deliver: false,
    idempotencyKey: session.idempotencyKey,
  };

  const parsed = await gatewayCall<GatewayAgentResponse>("agent", params);

  return {
    runId: parsed.runId ?? null,
    status: parsed.status ?? null,
    sessionKey: session.sessionKey,
    sessionId: session.sessionId,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { agentId?: string; boardId?: string };
    const agentId = body.agentId?.trim();
    const boardId = body.boardId?.trim();

    if (!agentId) {
      return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 });
    }

    if (!boardId) {
      return NextResponse.json({ ok: false, error: "boardId is required" }, { status: 400 });
    }

    const access = await getAuthorizedBoardAgentAccess(boardId as Id<"boards">);
    if (!access) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    if (access.restricted && !access.allowedAgentIds.includes(agentId)) {
      return NextResponse.json({ ok: false, error: "agent is not allowed for this board" }, { status: 403 });
    }

    const targets = await fetchAuthQuery(api.agent_automation.listBoardRunTargets, {
      boardId: boardId as Id<"boards">,
      agentId,
    });
    const session = createManualRunSession(agentId);
    const runModel = resolveManualRunModel(targets.targets);

    await fetchAuthMutation(api.card_runs.startManualSession, {
      boardId: boardId as Id<"boards">,
      agentId,
      sessionId: session.sessionId,
      cardIds: targets.cardIds,
    });

    if (targets.todoCardIds.length > 0) {
      await fetchAuthMutation(api.cards.claimTodoCards, {
        boardId: boardId as Id<"boards">,
        cardIds: targets.todoCardIds,
      });
    }

    let run: Awaited<ReturnType<typeof startManualWorker>>;

    try {
      if (runModel) {
        await applyManualRunModelOverride(session.sessionKey, runModel);
      }

      run = await startManualWorker(
        agentId,
        session,
        buildWorkerMessage({
          boardId,
          boardName: targets.boardName,
          sessionId: session.sessionId,
          targets: targets.targets,
        }),
      );
    } catch (error) {
      await fetchAuthMutation(api.card_runs.finishManualSession, {
        sessionId: session.sessionId,
        status: "failed",
      });
      throw error;
    }

    const completionStatus = completionStatusForGatewayStatus(run.status);
    if (completionStatus) {
      await fetchAuthMutation(api.card_runs.finishManualSession, {
        sessionId: session.sessionId,
        status: completionStatus,
      });
    }

    return NextResponse.json({
      ok: true,
      agentId,
      boardId,
      sessionId: run.sessionId,
      sessionKey: run.sessionKey,
      runId: run.runId,
      status: run.status,
      targetCardIds: targets.cardIds,
      model: runModel,
      mode: "manual-agent-run",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "failed to run agent worker",
      },
      { status: 500 },
    );
  }
}
