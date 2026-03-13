import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getNextOrder, normalizeText, optionalText, optionalUrl } from "./helpers";
import { getUser, requireOwnedBoard, requireUser } from "./access";

const FIXED_COLUMNS = ["Ideas", "TODO", "In Progress", "Review", "Done"] as const;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);

    if (!user) {
      return [];
    }

    return await ctx.db
      .query("boards")
      .withIndex("by_owner_order", (q) => q.eq("ownerId", user.userId))
      .order("asc")
      .collect();
  },
});

export const get = query({
  args: {
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const { board } = await requireOwnedBoard(ctx, args.boardId);

    const columns = await ctx.db
      .query("columns")
      .withIndex("by_board_order", (q) => q.eq("boardId", args.boardId))
      .order("asc")
      .collect();

    const columnsWithCards = await Promise.all(
      columns.map(async (column) => ({
        ...column,
        cards: await ctx.db
          .query("cards")
          .withIndex("by_column_order", (q) => q.eq("columnId", column._id))
          .order("asc")
          .collect(),
      })),
    );

    return {
      board,
      columns: columnsWithCards,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const now = Date.now();
    const boards = await ctx.db
      .query("boards")
      .withIndex("by_owner_order", (q) => q.eq("ownerId", user.userId))
      .order("asc")
      .collect();
    const description = optionalText(args.description);
    const url = optionalUrl(args.url);

    const boardId = await ctx.db.insert("boards", {
      ownerId: user.userId,
      name: normalizeText(args.name, "Untitled board"),
      ...(description ? { description } : {}),
      ...(url ? { url } : {}),
      createdAt: now,
      updatedAt: now,
      order: getNextOrder(boards),
    });

    for (let index = 0; index < FIXED_COLUMNS.length; index += 1) {
      await ctx.db.insert("columns", {
        boardId,
        name: FIXED_COLUMNS[index],
        order: (index + 1) * 1_000,
      });
    }

    return boardId;
  },
});

export const rename = mutation({
  args: {
    boardId: v.id("boards"),
    name: v.string(),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { board } = await requireOwnedBoard(ctx, args.boardId);
    const description = optionalText(args.description);
    const url = optionalUrl(args.url);

    await ctx.db.replace(args.boardId, {
      ownerId: board.ownerId,
      name: normalizeText(args.name, board.name),
      ...(description ? { description } : {}),
      ...(url ? { url } : {}),
      createdAt: board.createdAt,
      updatedAt: Date.now(),
      order: board.order,
    });
  },
});

export const remove = mutation({
  args: {
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    await requireOwnedBoard(ctx, args.boardId);

    const cards = await ctx.db
      .query("cards")
      .withIndex("by_board", (q) => q.eq("boardId", args.boardId))
      .collect();
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_board", (q) => q.eq("boardId", args.boardId))
      .collect();

    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    for (const card of cards) {
      await ctx.db.delete(card._id);
    }

    const columns = await ctx.db
      .query("columns")
      .withIndex("by_board", (q) => q.eq("boardId", args.boardId))
      .collect();
    for (const column of columns) {
      await ctx.db.delete(column._id);
    }

    await ctx.db.delete(args.boardId);
  },
});

export const reorder = mutation({
  args: {
    boardIds: v.array(v.id("boards")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const boards = await ctx.db
      .query("boards")
      .withIndex("by_owner_order", (q) => q.eq("ownerId", user.userId))
      .order("asc")
      .collect();

    const boardById = new Map(boards.map((board) => [board._id, board]));

    const seen = new Set<string>();
    const orderedIds: string[] = [];

    for (const boardId of args.boardIds) {
      const key = String(boardId);
      if (boardById.has(boardId) && !seen.has(key)) {
        orderedIds.push(boardId);
        seen.add(key);
      }
    }

    for (const board of boards) {
      const key = String(board._id);
      if (!seen.has(key)) {
        orderedIds.push(board._id);
        seen.add(key);
      }
    }

    for (let index = 0; index < orderedIds.length; index += 1) {
      const boardId = orderedIds[index] as typeof boards[number]["_id"];
      const board = boardById.get(boardId);
      if (!board) continue;

      const order = (index + 1) * 1_000;
      if (board.order !== order) {
        await ctx.db.patch(boardId, { order });
      }
    }
  },
});
