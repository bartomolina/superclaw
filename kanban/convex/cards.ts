import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { getNextOrder, normalizeText, optionalText, touchBoard } from "./helpers";
import {
  assertAgentsAllowedForBoard,
  requireAccessibleBoard,
  requireAccessibleCard,
  requireOwnedBoard,
  requireOwnedCard,
} from "./access";

function normalizeSkills(skills?: string[]) {
  if (!skills || skills.length === 0) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const skill of skills) {
    const value = optionalText(skill);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

export const create = mutation({
  args: {
    columnId: v.id("columns"),
    title: v.string(),
    description: v.optional(v.string()),
    agentId: v.optional(v.string()),
    reviewerId: v.optional(v.string()),
    priority: v.optional(v.string()),
    size: v.optional(v.string()),
    type: v.optional(v.string()),
    acp: v.optional(v.string()),
    model: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const column = await ctx.db.get(args.columnId);

    if (!column) {
      throw new Error("Column not found");
    }

    const { board } = await requireAccessibleBoard(ctx, column.boardId);

    const cards = await ctx.db
      .query("cards")
      .withIndex("by_column_order", (q) => q.eq("columnId", args.columnId))
      .order("asc")
      .collect();

    const now = Date.now();
    const description = optionalText(args.description);
    const agentId = optionalText(args.agentId);
    const reviewerId = optionalText(args.reviewerId);
    const priority = optionalText(args.priority);
    const size = optionalText(args.size);
    const type = optionalText(args.type);
    const acp = optionalText(args.acp);
    const model = optionalText(args.model);
    const skills = normalizeSkills(args.skills);

    if (acp && model) {
      throw new Error("Choose either ACP or model");
    }

    assertAgentsAllowedForBoard(board, { agentId, reviewerId });

    const cardId = await ctx.db.insert("cards", {
      boardId: column.boardId,
      columnId: args.columnId,
      title: normalizeText(args.title, "Untitled card"),
      ...(description ? { description } : {}),
      ...(agentId ? { agentId } : {}),
      ...(reviewerId ? { reviewerId } : {}),
      ...(priority ? { priority } : {}),
      ...(size ? { size } : {}),
      ...(type ? { type } : {}),
      ...(acp ? { acp } : {}),
      ...(model ? { model } : {}),
      ...(skills.length > 0 ? { skills } : {}),
      isRunning: false,
      order: getNextOrder(cards),
    });

    await touchBoard(ctx, column.boardId, now);
    return cardId;
  },
});

export const update = mutation({
  args: {
    cardId: v.id("cards"),
    title: v.string(),
    description: v.optional(v.string()),
    agentId: v.optional(v.string()),
    reviewerId: v.optional(v.string()),
    priority: v.optional(v.string()),
    size: v.optional(v.string()),
    type: v.optional(v.string()),
    acp: v.optional(v.string()),
    model: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const card = await requireAccessibleCard(ctx, args.cardId);
    const board = await ctx.db.get(card.boardId);

    if (!board) {
      throw new Error("Board not found");
    }

    const description = optionalText(args.description);
    const agentId = optionalText(args.agentId);
    const reviewerId = optionalText(args.reviewerId);
    const priority = optionalText(args.priority);
    const size = optionalText(args.size);
    const type = optionalText(args.type);
    const acp = optionalText(args.acp);
    const model = optionalText(args.model);
    const skills = normalizeSkills(args.skills);

    if (acp && model) {
      throw new Error("Choose either ACP or model");
    }

    assertAgentsAllowedForBoard(board, { agentId, reviewerId });

    await ctx.db.replace(args.cardId, {
      boardId: card.boardId,
      columnId: card.columnId,
      title: normalizeText(args.title, card.title),
      ...(description ? { description } : {}),
      ...(agentId ? { agentId } : {}),
      ...(reviewerId ? { reviewerId } : {}),
      ...(priority ? { priority } : {}),
      ...(size ? { size } : {}),
      ...(type ? { type } : {}),
      ...(acp ? { acp } : {}),
      ...(model ? { model } : {}),
      ...(skills.length > 0 ? { skills } : {}),
      isRunning: card.isRunning ?? false,
      ...(card.lastSessionId ? { lastSessionId: card.lastSessionId } : {}),
      ...(card.lastSessionAgentId ? { lastSessionAgentId: card.lastSessionAgentId } : {}),
      ...(typeof card.lastSessionUpdatedAt === "number"
        ? { lastSessionUpdatedAt: card.lastSessionUpdatedAt }
        : {}),
      ...(card.lastRunStatus ? { lastRunStatus: card.lastRunStatus } : {}),
      order: card.order,
    });

    await touchBoard(ctx, card.boardId, Date.now());
  },
});

export const remove = mutation({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, args) => {
    const card = await requireAccessibleCard(ctx, args.cardId);

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_card_created", (q) => q.eq("cardId", args.cardId))
      .collect();

    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    await ctx.db.delete(args.cardId);
    await touchBoard(ctx, card.boardId, Date.now());
  },
});

export const moveToColumn = mutation({
  args: {
    cardId: v.id("cards"),
    targetColumnId: v.id("columns"),
  },
  handler: async (ctx, args) => {
    const [card, targetColumn] = await Promise.all([
      ctx.db.get(args.cardId),
      ctx.db.get(args.targetColumnId),
    ]);

    if (!card) {
      throw new Error("Card not found");
    }

    await requireAccessibleBoard(ctx, card.boardId);

    if (!targetColumn) {
      throw new Error("Target column not found");
    }

    if (card.boardId !== targetColumn.boardId) {
      throw new Error("Cards can only move within the same board");
    }

    const targetCards = await ctx.db
      .query("cards")
      .withIndex("by_column_order", (q) => q.eq("columnId", args.targetColumnId))
      .order("asc")
      .collect();

    const nextOrder = getNextOrder(
      targetCards.filter((targetCard) => targetCard._id !== args.cardId),
    );

    await ctx.db.patch(args.cardId, {
      columnId: args.targetColumnId,
      order: nextOrder,
    });

    await touchBoard(ctx, card.boardId, Date.now());
  },
});

export const moveToBoard = mutation({
  args: {
    cardId: v.id("cards"),
    targetBoardId: v.id("boards"),
    targetColumnName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const card = await requireOwnedCard(ctx, args.cardId);

    if (card.boardId === args.targetBoardId) {
      return;
    }

    const [targetBoardResult, targetColumns] = await Promise.all([
      requireOwnedBoard(ctx, args.targetBoardId),
      ctx.db
        .query("columns")
        .withIndex("by_board_order", (q) => q.eq("boardId", args.targetBoardId))
        .order("asc")
        .collect(),
    ]);

    if (!targetBoardResult.board) {
      throw new Error("Target board not found");
    }

    if (targetColumns.length === 0) {
      throw new Error("Target board has no columns");
    }

    const normalizeColumnName = (value: string) => value.toLowerCase().replace(/\s+/g, "");
    const targetName = optionalText(args.targetColumnName);
    const targetColumn =
      (targetName
        ? targetColumns.find(
            (column) => normalizeColumnName(column.name) === normalizeColumnName(targetName),
          )
        : null) ?? targetColumns[0];

    const targetCards = await ctx.db
      .query("cards")
      .withIndex("by_column_order", (q) => q.eq("columnId", targetColumn._id))
      .order("asc")
      .collect();

    await ctx.db.patch(args.cardId, {
      boardId: args.targetBoardId,
      columnId: targetColumn._id,
      order: getNextOrder(targetCards),
      agentId: undefined,
      reviewerId: undefined,
    });

    const now = Date.now();
    await Promise.all([
      touchBoard(ctx, card.boardId, now),
      touchBoard(ctx, args.targetBoardId, now),
    ]);
  },
});

export const applyLayout = mutation({
  args: {
    boardId: v.id("boards"),
    columns: v.array(
      v.object({
        columnId: v.id("columns"),
        cardIds: v.array(v.id("cards")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAccessibleBoard(ctx, args.boardId);

    const [boardColumns, boardCards] = await Promise.all([
      ctx.db.query("columns").withIndex("by_board", (q) => q.eq("boardId", args.boardId)).collect(),
      ctx.db.query("cards").withIndex("by_board", (q) => q.eq("boardId", args.boardId)).collect(),
    ]);

    const validColumnIds = new Set(boardColumns.map((column) => column._id));
    const cardById = new Map(boardCards.map((card) => [card._id, card]));
    const seenCardIds = new Set<typeof boardCards[number]["_id"]>();

    for (const columnLayout of args.columns) {
      if (!validColumnIds.has(columnLayout.columnId)) {
        throw new Error("Column does not belong to board");
      }

      for (let index = 0; index < columnLayout.cardIds.length; index += 1) {
        const cardId = columnLayout.cardIds[index];

        if (seenCardIds.has(cardId)) {
          throw new Error("Duplicate card id in layout");
        }

        const card = cardById.get(cardId);
        if (!card) {
          throw new Error("Card does not belong to board");
        }

        seenCardIds.add(cardId);

        const nextOrder = (index + 1) * 1_000;
        if (card.columnId !== columnLayout.columnId || card.order !== nextOrder) {
          await ctx.db.patch(cardId, {
            columnId: columnLayout.columnId,
            order: nextOrder,
          });
        }
      }
    }

    await touchBoard(ctx, args.boardId, Date.now());
  },
});

export const reorder = mutation({
  args: {
    cardId: v.id("cards"),
    targetColumnId: v.id("columns"),
    targetCardId: v.optional(v.id("cards")),
    position: v.optional(v.union(v.literal("before"), v.literal("after"))),
  },
  handler: async (ctx, args) => {
    const card = await requireAccessibleCard(ctx, args.cardId);
    const targetColumn = await ctx.db.get(args.targetColumnId);

    if (!targetColumn) {
      throw new Error("Target column not found");
    }

    if (card.boardId !== targetColumn.boardId) {
      throw new Error("Cards can only move within the same board");
    }

    if (args.targetCardId && args.targetCardId === args.cardId) {
      return;
    }

    const targetCards = await ctx.db
      .query("cards")
      .withIndex("by_column_order", (q) => q.eq("columnId", args.targetColumnId))
      .order("asc")
      .collect();

    const cardsWithoutMoving = targetCards.filter((targetCard) => targetCard._id !== args.cardId);

    let insertIndex = cardsWithoutMoving.length;

    if (args.targetCardId) {
      const targetIndex = cardsWithoutMoving.findIndex((targetCard) => targetCard._id === args.targetCardId);
      if (targetIndex < 0) {
        throw new Error("Target card not found in target column");
      }

      insertIndex = args.position === "after" ? targetIndex + 1 : targetIndex;
    }

    const reorderedCards = [...cardsWithoutMoving];
    reorderedCards.splice(insertIndex, 0, {
      ...card,
      columnId: args.targetColumnId,
    });

    for (let index = 0; index < reorderedCards.length; index += 1) {
      const row = reorderedCards[index];
      const order = (index + 1) * 1_000;
      const nextColumnId = row._id === args.cardId ? args.targetColumnId : row.columnId;

      if (row.order !== order || row.columnId !== nextColumnId) {
        await ctx.db.patch(row._id, {
          order,
          columnId: nextColumnId,
        });
      }
    }

    await touchBoard(ctx, card.boardId, Date.now());
  },
});
