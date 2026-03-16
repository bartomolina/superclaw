import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { isAgentAllowedForBoard, requireAccessibleBoard } from "./access";

type CardRunStatus = Doc<"cards">["lastRunStatus"];

function normalizeSessionId(value: string) {
  return value.trim();
}

function normalizeAgentId(value: string) {
  return value.trim();
}

function normalizeCardIds(cardIds: Id<"cards">[]) {
  const seen = new Set<string>();
  const normalized: Id<"cards">[] = [];

  for (const cardId of cardIds) {
    const key = String(cardId);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(cardId);
  }

  return normalized;
}

async function trackSessionCard(
  ctx: MutationCtx,
  {
    sessionId,
    agentId,
    card,
    now,
  }: {
    sessionId: string;
    agentId: string;
    card: Doc<"cards">;
    now: number;
  },
) {
  const existing = await ctx.db
    .query("cardRunSessions")
    .withIndex("by_session_card", (q) => q.eq("sessionId", sessionId).eq("cardId", card._id))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      agentId,
      boardId: card.boardId,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("cardRunSessions", {
      sessionId,
      agentId,
      boardId: card.boardId,
      cardId: card._id,
      createdAt: now,
      updatedAt: now,
    });
  }

  await ctx.db.patch(card._id, {
    isRunning: true,
    lastSessionId: sessionId,
    lastSessionAgentId: agentId,
    lastSessionUpdatedAt: now,
    lastRunStatus: "running",
  });
}

async function finishTrackedSession(
  ctx: MutationCtx,
  {
    sessionId,
    status,
    expectedAgentId,
  }: {
    sessionId: string;
    status: Exclude<CardRunStatus, "running" | undefined>;
    expectedAgentId?: string;
  },
) {
  const now = Date.now();
  const rows = await ctx.db
    .query("cardRunSessions")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();

  if (expectedAgentId && rows.some((row) => row.agentId !== expectedAgentId)) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Session does not belong to this agent" });
  }

  for (const row of rows) {
    const card = await ctx.db.get(row.cardId);

    if (card && card.lastSessionId === sessionId) {
      await ctx.db.patch(card._id, {
        isRunning: false,
        lastSessionAgentId: card.lastSessionAgentId ?? row.agentId,
        lastSessionUpdatedAt: now,
        lastRunStatus: status,
      });
    }

    await ctx.db.delete(row._id);
  }

  return {
    ok: true,
    sessionId,
    status,
    cardIds: rows.map((row) => row.cardId),
  };
}

export const startManualSession = mutation({
  args: {
    boardId: v.id("boards"),
    agentId: v.string(),
    sessionId: v.string(),
    cardIds: v.array(v.id("cards")),
  },
  handler: async (ctx, args) => {
    const { board } = await requireAccessibleBoard(ctx, args.boardId);
    const sessionId = normalizeSessionId(args.sessionId);
    const agentId = normalizeAgentId(args.agentId);

    if (!sessionId) {
      throw new Error("sessionId is required");
    }

    if (!agentId) {
      throw new Error("agentId is required");
    }

    if (!isAgentAllowedForBoard(board, agentId)) {
      throw new Error("Agent is not allowed for this board");
    }

    const cardIds = normalizeCardIds(args.cardIds);
    const cards = await Promise.all(cardIds.map((cardId) => ctx.db.get(cardId)));
    const now = Date.now();

    for (const card of cards) {
      if (!card) {
        throw new Error("Card not found");
      }

      if (card.boardId !== args.boardId) {
        throw new Error("Card does not belong to the selected board");
      }

      await trackSessionCard(ctx, {
        sessionId,
        agentId,
        card,
        now,
      });
    }

    return {
      ok: true,
      sessionId,
      cardIds,
    };
  },
});

export const finishManualSession = mutation({
  args: {
    sessionId: v.string(),
    status: v.union(v.literal("done"), v.literal("failed"), v.literal("aborted")),
  },
  handler: async (ctx, args) => {
    return await finishTrackedSession(ctx, {
      sessionId: normalizeSessionId(args.sessionId),
      status: args.status,
    });
  },
});

export const touchSessionCard = internalMutation({
  args: {
    sessionId: v.string(),
    agentId: v.string(),
    cardId: v.id("cards"),
  },
  handler: async (ctx, args) => {
    const sessionId = normalizeSessionId(args.sessionId);
    const agentId = normalizeAgentId(args.agentId);

    if (!sessionId || !agentId) {
      return { ok: false };
    }

    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    await trackSessionCard(ctx, {
      sessionId,
      agentId,
      card,
      now: Date.now(),
    });

    return { ok: true };
  },
});

export const finishSession = internalMutation({
  args: {
    sessionId: v.string(),
    agentId: v.string(),
    status: v.union(v.literal("done"), v.literal("failed"), v.literal("aborted")),
  },
  handler: async (ctx, args) => {
    return await finishTrackedSession(ctx, {
      sessionId: normalizeSessionId(args.sessionId),
      expectedAgentId: normalizeAgentId(args.agentId),
      status: args.status,
    });
  },
});
