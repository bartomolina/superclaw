/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";

import { optionalString, requiredString } from "@/lib/server/validate";
import { ApiError } from "@/lib/server/errors";
import { gatewayCall, runOpenClaw, runOpenClawJson } from "@/lib/server/openclaw/cli";
import { json, parseBody } from "@/lib/server/openclaw/http";

function normalizeCronList(parsed: any) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.jobs)) return parsed.jobs;
  if (Array.isArray(parsed?.items)) return parsed.items;
  return [];
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
    const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout.trim() : "";
    return stderr || stdout || error.message;
  }

  return String(error);
}

export async function listCrons() {
  const parsed = await runOpenClawJson<any>(["cron", "list", "--all", "--json"], { jobs: [] }, { timeoutMs: 15_000 });
  return normalizeCronList(parsed);
}

export async function handleCronsList() {
  try {
    const jobs = await listCrons();
    return json({ jobs });
  } catch (error) {
    return json({
      jobs: [],
      warnings: [`openclaw cron list: ${describeError(error)}`],
    });
  }
}

export async function handleCronModel(req: NextRequest, cronIdRaw: string) {
  const cronId = requiredString(cronIdRaw, "cronId", 128);
  const body = await parseBody(req);
  const model = optionalString(body.model, 256);

  const jobs = await listCrons();
  const job = jobs.find((entry: any) => entry.id === cronId);
  if (!job) return json({ error: "cron not found" }, 404);

  const args = ["cron", "edit", cronId];

  if (job.payload?.kind === "agentTurn" && typeof job.payload?.message === "string" && job.payload.message.trim()) {
    args.push("--message", job.payload.message);
  } else if (job.payload?.kind === "systemEvent" && typeof job.payload?.text === "string" && job.payload.text.trim()) {
    args.push("--system-event", job.payload.text);
  } else {
    throw new ApiError("unsupported cron payload", 400);
  }

  if (model) {
    args.push("--model", model);
  } else if (job.payload?.model) {
    const payload: Record<string, unknown> = { kind: job.payload.kind };
    if (job.payload?.kind === "agentTurn" && typeof job.payload.message === "string") {
      payload.message = job.payload.message;
    }
    if (job.payload?.kind === "systemEvent" && typeof job.payload.text === "string") {
      payload.text = job.payload.text;
    }

    await gatewayCall("cron.update", { id: cronId, patch: { payload } });
    return json({ ok: true });
  }

  await runOpenClaw(args, { timeoutMs: 15_000 });
  return json({ ok: true });
}
