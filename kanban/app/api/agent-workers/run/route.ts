import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

import { isAuthorized } from "@/lib/server/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const WORKSPACE_DIR = "/root/.openclaw/workspace";
const KANBAN_WORKER_MESSAGE =
  "Read the kanban skill first. Run one cron-safe SuperClaw Kanban worker pass for the current agent. Follow the skill and its reference exactly. If nothing actionable exists, reply NO_REPLY.";

type GatewayAgentResponse = {
  runId?: string;
  status?: string;
  sessionKey?: string;
  sessionId?: string;
};

async function startManualWorker(agentId: string) {
  const runUuid = randomUUID();
  const sessionKey = `agent:${agentId}:kanban-manual:${runUuid}`;
  const sessionId = `kanban-manual-${agentId}-${runUuid}`;
  const idempotencyKey = `kanban-manual-${agentId}-${runUuid}`;
  const params = {
    agentId,
    sessionKey,
    sessionId,
    label: `Kanban manual run (${agentId})`,
    message: KANBAN_WORKER_MESSAGE,
    deliver: false,
    idempotencyKey,
  };

  const { stdout } = await execFileAsync(
    "openclaw",
    ["gateway", "call", "agent", "--json", "--params", JSON.stringify(params)],
    {
      cwd: WORKSPACE_DIR,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        OPENCLAW_HIDE_BANNER: "1",
        OPENCLAW_SUPPRESS_NOTES: "1",
      },
    },
  );

  const parsed = JSON.parse(stdout) as GatewayAgentResponse;

  return {
    runId: parsed.runId ?? null,
    status: parsed.status ?? null,
    sessionKey,
    sessionId,
  };
}

export async function POST(request: Request) {
  if (!(await isAuthorized())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { agentId?: string };
    const agentId = body.agentId?.trim();

    if (!agentId) {
      return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 });
    }

    const run = await startManualWorker(agentId);

    return NextResponse.json({
      ok: true,
      agentId,
      sessionId: run.sessionId,
      sessionKey: run.sessionKey,
      runId: run.runId,
      status: run.status,
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
