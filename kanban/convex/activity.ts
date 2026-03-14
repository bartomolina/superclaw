import { v } from "convex/values";

import { internalMutation, query } from "./_generated/server";
import { requireAccessibleBoard } from "./access";

export const listByBoard = query({
  args: {
    boardId: v.id("boards"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccessibleBoard(ctx, args.boardId);

    const limit = Math.min(Math.max(Math.floor(args.limit ?? 20), 1), 100);

    const rows = await ctx.db
      .query("activityEvents")
      .withIndex("by_board_created", (q) => q.eq("boardId", args.boardId))
      .order("desc")
      .take(limit);

    return rows;
  },
});

export const logAgentEvent = internalMutation({
  args: {
    boardId: v.id("boards"),
    cardId: v.optional(v.id("cards")),
    actorId: v.string(),
    eventType: v.string(),
    message: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("activityEvents", {
      boardId: args.boardId,
      ...(args.cardId ? { cardId: args.cardId } : {}),
      actorType: "agent",
      actorId: args.actorId,
      eventType: args.eventType,
      message: args.message,
      ...(args.details ? { details: args.details } : {}),
      createdAt: Date.now(),
    });
  },
});
