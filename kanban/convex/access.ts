import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

type Ctx = QueryCtx | MutationCtx;

type AuthUser = {
  id?: string;
  userId?: string;
  email?: string;
  name?: string;
};

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
    email: authUser?.email,
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

export async function requireOwnedBoard(ctx: Ctx, boardId: Id<"boards">) {
  const user = await requireUser(ctx);
  const board = await ctx.db.get(boardId);

  if (!board) {
    throw new Error("Board not found");
  }

  if (board.ownerId !== user.userId) {
    throw new Error("Forbidden");
  }

  return { board, user };
}

export async function requireOwnedCard(ctx: Ctx, cardId: Id<"cards">) {
  const card = await ctx.db.get(cardId);

  if (!card) {
    throw new Error("Card not found");
  }

  await requireOwnedBoard(ctx, card.boardId);
  return card;
}
