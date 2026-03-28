import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertAgentsAllowedForBoard } from "./access";
import { requireActiveExtensionCredential } from "./extension_auth";
import { getNextOrder, normalizeText, optionalText, touchBoard } from "./helpers";

type Ctx = QueryCtx | MutationCtx;
type ExtensionCredentialDoc = Doc<"extensionCredentials">;

function compactText(value?: string | null, maxLength = 140) {
  const normalized = optionalText(value ?? undefined);
  if (!normalized) {
    return undefined;
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trimEnd()}…` : normalized;
}

function normalizeBoardName(value: string) {
  return value.trim().toLowerCase();
}

async function listAccessibleBoards(
  ctx: Ctx,
  credential: ExtensionCredentialDoc,
) {
  const ownedBoards = await ctx.db
    .query("boards")
    .withIndex("by_owner_order", (q) => q.eq("ownerId", credential.ownerId))
    .order("asc")
    .collect();

  const permissions = await ctx.db
    .query("boardPermissions")
    .withIndex("by_email", (q) => q.eq("userEmail", credential.ownerEmail))
    .collect();

  const seen = new Set(ownedBoards.map((board) => String(board._id)));
  const sharedBoards = (
    await Promise.all(
      permissions.map(async (permission) => {
        const board = await ctx.db.get(permission.boardId);
        if (!board) return null;
        if (board.ownerId === credential.ownerId) return null;
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
}

async function requireAccessibleBoardForCredential(
  ctx: Ctx,
  credential: ExtensionCredentialDoc,
  boardId: Id<"boards">,
) {
  const board = await ctx.db.get(boardId);

  if (!board) {
    throw new Error("Board not found");
  }

  if (board.ownerId === credential.ownerId) {
    return board;
  }

  const permission = await ctx.db
    .query("boardPermissions")
    .withIndex("by_board_email", (q) => q.eq("boardId", boardId).eq("userEmail", credential.ownerEmail))
    .unique();

  if (!permission) {
    throw new Error("Forbidden");
  }

  return board;
}

async function resolveBoardForCreate(
  ctx: MutationCtx,
  credential: ExtensionCredentialDoc,
  preferredBoardId?: Id<"boards">,
) {
  if (preferredBoardId) {
    try {
      return await requireAccessibleBoardForCredential(ctx, credential, preferredBoardId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to resolve board";
      if (message !== "Board not found" && message !== "Forbidden") {
        throw error;
      }
    }
  }

  const boards = await listAccessibleBoards(ctx, credential);
  const defaultBoard = boards[0];

  if (!defaultBoard) {
    throw new Error("No accessible boards are available");
  }

  return defaultBoard;
}

async function listBoardColumns(ctx: Ctx, boardId: Id<"boards">) {
  return await ctx.db
    .query("columns")
    .withIndex("by_board_order", (q) => q.eq("boardId", boardId))
    .order("asc")
    .collect();
}

function pickColumn(
  columns: Doc<"columns">[],
  preferredColumnId?: Id<"columns">,
) {
  if (preferredColumnId) {
    const preferred = columns.find((column) => column._id === preferredColumnId);
    if (preferred) {
      return preferred;
    }
  }

  const todoColumn = columns.find((column) => normalizeBoardName(column.name) === "todo");
  return todoColumn ?? columns[0] ?? null;
}

function formatSourceLabel(sourceTitle?: string, sourceUrl?: string) {
  const parts = [compactText(sourceTitle), compactText(sourceUrl, 220)].filter(Boolean);
  return parts.join(" - ");
}

function buildCardTitle(args: {
  sourceTitle?: string;
  sourceUrl?: string;
  annotations: Array<{
    note?: string;
    text?: string;
  }>;
}): string {
  const firstNote = args.annotations.map((annotation) => compactText(annotation.note, 120)).find(Boolean);
  if (firstNote) {
    return firstNote;
  }

  const firstText = args.annotations.map((annotation) => compactText(annotation.text, 120)).find(Boolean);
  if (firstText) {
    return firstText;
  }

  const sourceTitle = compactText(args.sourceTitle, 120);
  if (sourceTitle) {
    return `Review: ${sourceTitle}`;
  }

  const sourceUrl = optionalText(args.sourceUrl);
  if (sourceUrl) {
    try {
      const hostname = new URL(sourceUrl).hostname.replace(/^www\./, "");
      return `Review: ${hostname}`;
    } catch {
      return compactText(sourceUrl, 120) ?? "New extension capture";
    }
  }

  return "New extension capture";
}

function buildCardDescription(args: {
  sourceTitle?: string;
  sourceUrl?: string;
  annotations: Array<{
    note?: string;
    selector?: string;
    component?: string;
    text?: string;
    tag?: string;
    classes?: string;
  }>;
}) {
  const sections: string[] = [];
  const sourceLines = [
    compactText(args.sourceTitle, 220) ? `Page: ${compactText(args.sourceTitle, 220)}` : null,
    compactText(args.sourceUrl, 500) ? `URL: ${compactText(args.sourceUrl, 500)}` : null,
  ].filter(Boolean) as string[];

  if (sourceLines.length > 0) {
    sections.push(sourceLines.join("\n"));
  }

  args.annotations.forEach((annotation, index) => {
    const lines = [
      `Annotation ${index + 1}`,
      compactText(annotation.note, 500) ? `Note: ${compactText(annotation.note, 500)}` : null,
      compactText(annotation.text, 240) ? `Text: ${compactText(annotation.text, 240)}` : null,
      compactText(annotation.selector, 500) ? `Selector: ${compactText(annotation.selector, 500)}` : null,
      compactText(annotation.component, 160) ? `Component: ${compactText(annotation.component, 160)}` : null,
      compactText(annotation.tag, 80) ? `Element: ${compactText(annotation.tag, 80)}` : null,
      compactText(annotation.classes, 200) ? `Classes: ${compactText(annotation.classes, 200)}` : null,
    ].filter(Boolean) as string[];

    sections.push(lines.join("\n"));
  });

  return optionalText(sections.join("\n\n"));
}

export const listBoards = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const credential = await requireActiveExtensionCredential(ctx, args.token);
    const boards = await listAccessibleBoards(ctx, credential);

    return {
      boards: boards.map((board) => ({
        id: board._id,
        name: board.name,
        isOwner: board.isOwner,
      })),
      defaultBoardId: boards[0]?._id ?? null,
    };
  },
});

export const listColumns = query({
  args: {
    token: v.string(),
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    await requireAccessibleBoardForCredential(
      ctx,
      await requireActiveExtensionCredential(ctx, args.token),
      args.boardId,
    );
    const columns = await listBoardColumns(ctx, args.boardId);
    const defaultColumn = pickColumn(columns);

    return {
      columns: columns.map((column) => ({
        id: column._id,
        name: column.name,
      })),
      defaultColumnId: defaultColumn?._id ?? null,
    };
  },
});

export const getBoardAgentAccess = query({
  args: {
    token: v.string(),
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const credential = await requireActiveExtensionCredential(ctx, args.token);
    const board = await requireAccessibleBoardForCredential(ctx, credential, args.boardId);
    const allowedAgentIds = Array.from(
      new Set((board.allowedAgentIds ?? []).map((agentId) => agentId.trim()).filter(Boolean)),
    );

    return {
      allowedAgentIds,
      restricted: allowedAgentIds.length > 0,
    };
  },
});

export const createCard = mutation({
  args: {
    token: v.string(),
    boardId: v.optional(v.id("boards")),
    columnId: v.optional(v.id("columns")),
    agentId: v.optional(v.string()),
    sourceTitle: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    annotations: v.array(
      v.object({
        note: v.optional(v.string()),
        selector: v.optional(v.string()),
        component: v.optional(v.string()),
        text: v.optional(v.string()),
        tag: v.optional(v.string()),
        classes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const credential = await requireActiveExtensionCredential(ctx, args.token);
    const board = await resolveBoardForCreate(ctx, credential, args.boardId);
    const columns = await listBoardColumns(ctx, board._id);
    const targetColumn = pickColumn(columns, args.columnId);

    if (!targetColumn) {
      throw new Error("Board has no columns");
    }

    const agentId = optionalText(args.agentId);
    assertAgentsAllowedForBoard(board, { agentId, reviewerId: undefined });

    const cards = await ctx.db
      .query("cards")
      .withIndex("by_column_order", (q) => q.eq("columnId", targetColumn._id))
      .order("asc")
      .collect();

    const title = normalizeText(
      buildCardTitle({
        sourceTitle: args.sourceTitle,
        sourceUrl: args.sourceUrl,
        annotations: args.annotations,
      }),
      "New extension capture",
    );
    const extensionContext = buildCardDescription({
      sourceTitle: args.sourceTitle,
      sourceUrl: args.sourceUrl,
      annotations: args.annotations,
    });
    const now = Date.now();

    const cardId = await ctx.db.insert("cards", {
      boardId: board._id,
      columnId: targetColumn._id,
      title,
      ...(extensionContext ? { extensionContext } : {}),
      ...(agentId ? { agentId } : {}),
      source: "extension",
      isRunning: false,
      order: getNextOrder(cards),
    });

    await touchBoard(ctx, board._id, now);

    return {
      cardId,
      board: {
        id: board._id,
        name: board.name,
      },
      column: {
        id: targetColumn._id,
        name: targetColumn.name,
      },
      title,
      sourceLabel: formatSourceLabel(args.sourceTitle, args.sourceUrl) || null,
    };
  },
});
