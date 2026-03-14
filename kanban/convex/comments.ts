import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { optionalText, touchBoard } from "./helpers";
import { requireAccessibleCard, requireUser } from "./access";

export const listByCard = query({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args) => {
    await requireAccessibleCard(ctx, args.cardId);

    return await ctx.db
      .query("comments")
      .withIndex("by_card_created", (q) => q.eq("cardId", args.cardId))
      .order("asc")
      .collect();
  },
});

export const add = mutation({
  args: {
    cardId: v.id("cards"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const card = await requireAccessibleCard(ctx, args.cardId);
    const user = await requireUser(ctx);

    const body = optionalText(args.body);

    if (!body) {
      throw new Error("Comment cannot be empty");
    }

    const createdAt = Date.now();
    const authorLabel = user.name ?? user.email ?? user.userId;

    const commentId = await ctx.db.insert("comments", {
      boardId: card.boardId,
      cardId: card._id,
      body,
      createdAt,
      authorType: "human",
      authorId: user.userId,
      authorLabel,
    });

    await touchBoard(ctx, card.boardId, createdAt);
    return commentId;
  },
});
