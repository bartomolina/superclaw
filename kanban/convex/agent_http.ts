import { ConvexError } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";

function agentHeaders(request: Request) {
  const agentId = request.headers.get("x-agent-id")?.trim() ?? "";
  const agentToken = request.headers.get("x-agent-token")?.trim() ?? "";

  if (!agentId || !agentToken) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Missing agent credentials" });
  }

  return { agentId, agentToken };
}

function errorResponse(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "object" && error.data) {
    const data = error.data as { code?: string; message?: string };
    const code = data.code ?? "ERROR";
    const message = data.message ?? "Request failed";

    const statusByCode: Record<string, number> = {
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      INVALID_INPUT: 400,
    };

    return Response.json(
      { ok: false, code, error: message },
      { status: statusByCode[code] ?? 400 },
    );
  }

  if (error instanceof Error) {
    return Response.json({ ok: false, code: "ERROR", error: error.message }, { status: 500 });
  }

  return Response.json({ ok: false, code: "ERROR", error: "Unknown error" }, { status: 500 });
}

export const listTasks = httpAction(async (ctx, request) => {
  try {
    const { agentId, agentToken } = agentHeaders(request);
    const url = new URL(request.url);
    const includeDone = ["1", "true", "yes"].includes(
      (url.searchParams.get("includeDone") ?? "").toLowerCase(),
    );

    const tasks = await ctx.runQuery(internal.agent_automation.listAssignedTasks, {
      agentId,
      agentToken,
      includeDone,
    });

    return Response.json({ ok: true, tasks });
  } catch (error) {
    return errorResponse(error);
  }
});

export const listInbox = httpAction(async (ctx, request) => {
  try {
    const { agentId, agentToken } = agentHeaders(request);

    const inbox = await ctx.runQuery(internal.agent_automation.listAgentInbox, {
      agentId,
      agentToken,
    });

    return Response.json({ ok: true, ...inbox });
  } catch (error) {
    return errorResponse(error);
  }
});

export const commentOnCard = httpAction(async (ctx, request) => {
  try {
    const { agentId, agentToken } = agentHeaders(request);
    const body = (await request.json()) as { cardId?: string; body?: string };

    if (!body?.cardId || !body?.body) {
      return Response.json(
        { ok: false, code: "INVALID_INPUT", error: "cardId and body are required" },
        { status: 400 },
      );
    }

    const result = await ctx.runMutation(internal.agent_automation.addAgentComment, {
      agentId,
      agentToken,
      cardId: body.cardId as Id<"cards">,
      body: body.body,
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

export const transitionCard = httpAction(async (ctx, request) => {
  try {
    const { agentId, agentToken } = agentHeaders(request);
    const body = (await request.json()) as { cardId?: string; toColumn?: string };

    if (!body?.cardId || !body?.toColumn) {
      return Response.json(
        { ok: false, code: "INVALID_INPUT", error: "cardId and toColumn are required" },
        { status: 400 },
      );
    }

    const result = await ctx.runMutation(internal.agent_automation.transitionAgentCard, {
      agentId,
      agentToken,
      cardId: body.cardId as Id<"cards">,
      toColumn: body.toColumn,
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});
