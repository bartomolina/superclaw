import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

type Ctx = QueryCtx | MutationCtx;
type BoardDoc = Doc<"boards">;

type AuthUser = {
  id?: string;
  userId?: string;
  email?: string;
  name?: string;
};

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

export async function getUser(ctx: Ctx) {
  let authUser: AuthUser | null = null;

  try {
    authUser = (await authComponent.getAuthUser(ctx)) as AuthUser | null;
  } catch {
    authUser = null;
  }

  const identity = await ctx.auth.getUserIdentity();

  const userId =
    authUser?.userId ?? authUser?.id ?? identity?.subject ?? identity?.tokenIdentifier ?? null;

  if (!userId) {
    return null;
  }

  return {
    userId,
    email: normalizeEmail(authUser?.email),
    name: authUser?.name,
  };
}

export async function requireUser(ctx: Ctx) {
  const user = await getUser(ctx);

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

async function hasBoardAccess(ctx: Ctx, board: BoardDoc, user: Awaited<ReturnType<typeof requireUser>>) {
  if (board.ownerId === user.userId) {
    return true;
  }

  if (!user.email) {
    return false;
  }

  const permission = await ctx.db
    .query("boardPermissions")
    .withIndex("by_board_email", (q) => q.eq("boardId", board._id).eq("userEmail", user.email!))
    .unique();

  return Boolean(permission);
}

export async function requireOwnedBoard(ctx: Ctx, boardId: Id<"boards">) {
  const user = await requireUser(ctx);
  const board = await ctx.db.get(boardId);

  if (!board) {
    throw new Error("Board not found");
  }

  if (board.ownerId !== user.userId) {
    throw new Error("Forbidden");
  }

  return { board, user, isOwner: true };
}

export async function requireAccessibleBoard(ctx: Ctx, boardId: Id<"boards">) {
  const user = await requireUser(ctx);
  const board = await ctx.db.get(boardId);

  if (!board) {
    throw new Error("Board not found");
  }

  if (!(await hasBoardAccess(ctx, board, user))) {
    throw new Error("Forbidden");
  }

  return { board, user, isOwner: board.ownerId === user.userId };
}

export async function requireOwnedCard(ctx: Ctx, cardId: Id<"cards">) {
  const card = await ctx.db.get(cardId);

  if (!card) {
    throw new Error("Card not found");
  }

  await requireOwnedBoard(ctx, card.boardId);
  return card;
}

export async function requireAccessibleCard(ctx: Ctx, cardId: Id<"cards">) {
  const card = await ctx.db.get(cardId);

  if (!card) {
    throw new Error("Card not found");
  }

  await requireAccessibleBoard(ctx, card.boardId);
  return card;
}
