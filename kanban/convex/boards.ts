import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getNextOrder, normalizeText, optionalText, optionalUrl } from "./helpers";
import { getViewer, requireAccessibleBoard, requireSuperuser } from "./access";

const FIXED_COLUMNS = ["Ideas", "TODO", "In Progress", "Review", "Done"] as const;

type ManagedUserDoc = Doc<"managedUsers">;
type BoardPermissionDoc = Doc<"boardPermissions">;
type ReadCtx = QueryCtx | MutationCtx;

function normalizeSharedUserIds(sharedUserIds?: Id<"managedUsers">[]) {
  const seen = new Set<string>();
  const normalized: Id<"managedUsers">[] = [];

  for (const userId of sharedUserIds ?? []) {
    const key = String(userId);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(userId);
  }

  return normalized;
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

async function resolveSharedUsers(
  ctx: ReadCtx,
  ownerId: string | undefined,
  sharedUserIds?: Id<"managedUsers">[],
) {
  const normalizedIds = normalizeSharedUserIds(sharedUserIds);
  const sharedUsers: ManagedUserDoc[] = [];

  for (const userId of normalizedIds) {
    const user = await ctx.db.get(userId);

    if (!user) {
      throw new Error("Shared user not found");
    }

    if (user.ownerId !== ownerId) {
      throw new Error("Cannot share a board with a user outside your saved users list");
    }

    sharedUsers.push(user);
  }

  return { normalizedIds, sharedUsers };
}

async function syncBoardPermissions(
  ctx: MutationCtx,
  {
    boardId,
    ownerId,
    sharedUserIds,
    now,
  }: {
    boardId: Id<"boards">;
    ownerId: string | undefined;
    sharedUserIds?: Id<"managedUsers">[];
    now: number;
  },
) {
  const { sharedUsers } = await resolveSharedUsers(ctx, ownerId, sharedUserIds);
  const existing = await ctx.db
    .query("boardPermissions")
    .withIndex("by_board", (q) => q.eq("boardId", boardId))
    .collect();

  const nextByManagedUserId = new Map(sharedUsers.map((user) => [String(user._id), user]));
  const existingByManagedUserId = new Map(
    existing.map((permission: BoardPermissionDoc) => [String(permission.managedUserId), permission]),
  );

  for (const permission of existing) {
    if (!nextByManagedUserId.has(String(permission.managedUserId))) {
      await ctx.db.delete(permission._id);
    }
  }

  for (const sharedUser of sharedUsers) {
    const userEmail = normalizeEmail(sharedUser.email);

    if (!userEmail) {
      continue;
    }

    const current = existingByManagedUserId.get(String(sharedUser._id));

    if (!current) {
      await ctx.db.insert("boardPermissions", {
        boardId,
        ownerId: ownerId ?? "",
        managedUserId: sharedUser._id,
        userEmail,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }

    if (current.userEmail !== userEmail || current.ownerId !== (ownerId ?? "")) {
      await ctx.db.patch(current._id, {
        ownerId: ownerId ?? "",
        userEmail,
        updatedAt: now,
      });
    }
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);

    if (!viewer?.isMember) {
      return [];
    }

    const user = viewer;

    const ownedBoards = await ctx.db
      .query("boards")
      .withIndex("by_owner_order", (q) => q.eq("ownerId", user.userId))
      .order("asc")
      .collect();

    if (!user.email) {
      return ownedBoards.map((board) => ({ ...board, isOwner: true }));
    }

    const permissions = await ctx.db
      .query("boardPermissions")
      .withIndex("by_email", (q) => q.eq("userEmail", user.email!))
      .collect();

    const seen = new Set(ownedBoards.map((board) => String(board._id)));
    const sharedBoards = (
      await Promise.all(
        permissions.map(async (permission) => {
          const board = await ctx.db.get(permission.boardId);
          if (!board) return null;
          if (board.ownerId === user.userId) return null;
          if (seen.has(String(board._id))) return null;
          seen.add(String(board._id));
          return board;
        }),
      )
    )
      .filter((board): board is Doc<"boards"> => Boolean(board))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    return [
      ...ownedBoards.map((board) => ({ ...board, isOwner: true })),
      ...sharedBoards.map((board) => ({ ...board, isOwner: false })),
    ];
  },
});

export const get = query({
  args: {
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const { board, isOwner } = await requireAccessibleBoard(ctx, args.boardId);

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
      board: {
        ...board,
        isOwner,
      },
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
    const user = await requireSuperuser(ctx);

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
    sharedUserIds: v.optional(v.array(v.id("managedUsers"))),
  },
  handler: async (ctx, args) => {
    await requireSuperuser(ctx);

    const board = await ctx.db.get(args.boardId);
    if (!board) {
      throw new Error("Board not found");
    }

    const description = optionalText(args.description);
    const url = optionalUrl(args.url);
    const now = Date.now();
    const { normalizedIds } = await resolveSharedUsers(ctx, board.ownerId, args.sharedUserIds);

    await ctx.db.replace(args.boardId, {
      ownerId: board.ownerId,
      name: normalizeText(args.name, board.name),
      ...(description ? { description } : {}),
      ...(url ? { url } : {}),
      ...(normalizedIds.length > 0 ? { sharedUserIds: normalizedIds } : {}),
      createdAt: board.createdAt,
      updatedAt: now,
      order: board.order,
    });

    await syncBoardPermissions(ctx, {
      boardId: args.boardId,
      ownerId: board.ownerId,
      sharedUserIds: normalizedIds,
      now,
    });
  },
});

export const remove = mutation({
  args: {
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    await requireSuperuser(ctx);

    const boardExists = await ctx.db.get(args.boardId);
    if (!boardExists) {
      throw new Error("Board not found");
    }

    const [cards, comments, columns, permissions] = await Promise.all([
      ctx.db.query("cards").withIndex("by_board", (q) => q.eq("boardId", args.boardId)).collect(),
      ctx.db.query("comments").withIndex("by_board", (q) => q.eq("boardId", args.boardId)).collect(),
      ctx.db.query("columns").withIndex("by_board", (q) => q.eq("boardId", args.boardId)).collect(),
      ctx.db
        .query("boardPermissions")
        .withIndex("by_board", (q) => q.eq("boardId", args.boardId))
        .collect(),
    ]);

    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    for (const permission of permissions) {
      await ctx.db.delete(permission._id);
    }

    for (const card of cards) {
      await ctx.db.delete(card._id);
    }

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
    const user = await requireSuperuser(ctx);

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
