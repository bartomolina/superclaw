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

type HumanIdentity = {
  email?: string | null;
  name?: string | null;
  userId?: string | null;
};

export type BoardAgentAccess = {
  allowedAgentIds: string[];
  restricted: boolean;
};

const SUPERUSER_EMAIL = normalizeEmail(process.env.SUPERUSER_EMAIL);

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

export function getSuperuserEmail() {
  return SUPERUSER_EMAIL;
}

function normalizeAgentId(value?: string | null) {
  return value?.trim() || null;
}

export function getBoardAgentAccess(board: Pick<BoardDoc, "allowedAgentIds">): BoardAgentAccess {
  const seen = new Set<string>();
  const allowedAgentIds: string[] = [];

  for (const agentId of board.allowedAgentIds ?? []) {
    const normalized = normalizeAgentId(agentId);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    allowedAgentIds.push(normalized);
  }

  return {
    allowedAgentIds,
    restricted: allowedAgentIds.length > 0,
  };
}

export function isAgentAllowedForBoard(board: Pick<BoardDoc, "allowedAgentIds">, agentId?: string | null) {
  const normalizedAgentId = normalizeAgentId(agentId);

  if (!normalizedAgentId) {
    return true;
  }

  const access = getBoardAgentAccess(board);
  if (!access.restricted) {
    return true;
  }

  return access.allowedAgentIds.includes(normalizedAgentId);
}

export function assertAgentsAllowedForBoard(
  board: Pick<BoardDoc, "allowedAgentIds">,
  values: { agentId?: string | null; reviewerId?: string | null },
) {
  if (!isAgentAllowedForBoard(board, values.agentId)) {
    throw new Error("Assigned agent is not allowed for this board");
  }

  if (!isAgentAllowedForBoard(board, values.reviewerId)) {
    throw new Error("Reviewer is not allowed for this board");
  }
}

function isSuperuserEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  return Boolean(SUPERUSER_EMAIL && normalized && normalized === SUPERUSER_EMAIL);
}

async function findInvitedUserByEmail(ctx: Ctx, email?: string | null) {
  const normalized = normalizeEmail(email);

  if (!normalized) {
    return null;
  }

  return await ctx.db
    .query("managedUsers")
    .withIndex("by_email", (q) => q.eq("email", normalized))
    .first();
}

async function getSuperuserProfileName(ctx: Ctx, email?: string | null) {
  const normalized = normalizeEmail(email);

  if (!normalized || !isSuperuserEmail(normalized)) {
    return null;
  }

  const profile = await ctx.db
    .query("superuserProfiles")
    .withIndex("by_email", (q) => q.eq("email", normalized))
    .unique();

  return profile?.name?.trim() || null;
}

async function isInvitedEmail(ctx: Ctx, email?: string | null) {
  return Boolean(await findInvitedUserByEmail(ctx, email));
}

export async function resolveHumanDisplayName(ctx: Ctx, human: HumanIdentity) {
  const normalizedEmail = normalizeEmail(human.email);

  if (normalizedEmail) {
    const superuserProfileName = await getSuperuserProfileName(ctx, normalizedEmail);
    if (superuserProfileName) {
      return superuserProfileName;
    }

    const invitedUser = await findInvitedUserByEmail(ctx, normalizedEmail);
    if (invitedUser?.name?.trim()) {
      return invitedUser.name.trim();
    }
  }

  const explicitName = human.name?.trim();
  if (explicitName) {
    return explicitName;
  }

  if (normalizedEmail) {
    return normalizedEmail;
  }

  return human.userId?.trim() || "Human";
}

export async function resolveCommentAuthorLabel(
  ctx: Ctx,
  comment: Pick<Doc<"comments">, "authorType" | "authorId" | "authorLabel" | "authorEmail">,
) {
  if (comment.authorType === "human") {
    return await resolveHumanDisplayName(ctx, {
      email: comment.authorEmail,
      name: comment.authorLabel,
      userId: comment.authorId,
    });
  }

  return comment.authorLabel ?? comment.authorId ?? (comment.authorType === "system" ? "System" : null);
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

export async function requireMember(ctx: Ctx) {
  const user = await requireUser(ctx);

  if (isSuperuserEmail(user.email)) {
    return {
      ...user,
      isSuperuser: true,
      isMember: true,
    };
  }

  if (!(await isInvitedEmail(ctx, user.email))) {
    throw new Error("Forbidden");
  }

  return {
    ...user,
    isSuperuser: false,
    isMember: true,
  };
}

export async function requireSuperuser(ctx: Ctx) {
  const user = await requireUser(ctx);

  if (!isSuperuserEmail(user.email)) {
    throw new Error("Forbidden");
  }

  return {
    ...user,
    isSuperuser: true,
    isMember: true,
  };
}

export async function getViewer(ctx: Ctx) {
  const user = await getUser(ctx);

  if (!user) {
    return null;
  }

  const isSuperuser = isSuperuserEmail(user.email);
  const isMember = isSuperuser || (await isInvitedEmail(ctx, user.email));

  return {
    ...user,
    isSuperuser,
    isMember,
  };
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
  const user = await requireMember(ctx);
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
