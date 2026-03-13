import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { getUser } from "./access";
import { getNextOrder, optionalText, touchBoard } from "./helpers";

type AgentRole = "assignee" | "reviewer";
type CommentAuthorType = "agent" | "human" | "system";
type InboxReason = "ideas-needs-comment" | "todo" | "review-needs-reply";

type AgentIdentity = {
  id: string;
  normalizedId: string;
};

type BaseTask = {
  cardId: Id<"cards">;
  boardId: Id<"boards">;
  boardName: string;
  boardDescription: string | undefined;
  columnId: Id<"columns">;
  columnName: string;
  title: string;
  description: string | undefined;
  assigneeId: string | undefined;
  reviewerId: string | undefined;
  acp: string | undefined;
  executionHint: string | undefined;
  roles: AgentRole[];
  order: number;
};

type DiscussionComment = {
  body: string;
  createdAt: number;
  authorType: CommentAuthorType;
  authorId: string | null;
  authorLabel: string | null;
};

type EnrichedTask = BaseTask & {
  hasAgentComment: boolean;
  lastCommentAt: number | null;
  lastCommentByType: CommentAuthorType | null;
  lastCommentBy: string | null;
  lastCommentByLabel: string | null;
  comments: DiscussionComment[];
};

type InboxTask = EnrichedTask & {
  inboxReason: InboxReason;
};

type CommentAuthor = {
  type: CommentAuthorType | null;
  id: string | null;
  label: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeColumnName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function buildExecutionHint(acp: string | null | undefined) {
  const normalizedAcp = (acp ?? "").trim().toLowerCase();
  if (!normalizedAcp) return undefined;
  return `run this with acp ${normalizedAcp}`;
}

function authenticateAgent(agentId: string, agentToken: string): AgentIdentity {
  const id = agentId.trim();
  const token = agentToken.trim();
  const sharedToken = process.env.KANBAN_AGENT_SHARED_TOKEN?.trim();

  if (!id || !token) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Missing agent credentials" });
  }

  if (!sharedToken) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "KANBAN_AGENT_SHARED_TOKEN is not configured",
    });
  }

  if (token !== sharedToken) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid agent credentials" });
  }

  return { id, normalizedId: normalize(id) };
}

function cardRoles(
  card: {
    agentId?: string;
    reviewerId?: string;
  },
  normalizedAgentId: string,
): AgentRole[] {
  const roles: AgentRole[] = [];

  const assigneeMatch = normalize(card.agentId) === normalizedAgentId;
  const reviewerMatch = normalize(card.reviewerId) === normalizedAgentId;

  if (assigneeMatch) roles.push("assignee");
  if (reviewerMatch) roles.push("reviewer");

  return roles;
}

function canComment(columnName: string, roles: AgentRole[]) {
  const state = normalizeColumnName(columnName);
  const isAssignee = roles.includes("assignee");
  const isReviewer = roles.includes("reviewer");

  if (state === "ideas") return isAssignee || isReviewer;
  if (state === "todo" || state === "inprogress") return isAssignee;
  if (state === "review") return isAssignee || isReviewer;
  if (state === "done") return isAssignee || isReviewer;

  return false;
}

function canTransition(columnName: string, toColumn: string, roles: AgentRole[]) {
  const fromState = normalizeColumnName(columnName);
  const toState = normalizeColumnName(toColumn);

  if (!roles.includes("assignee")) {
    return false;
  }

  if (fromState === "todo" && toState === "inprogress") return true;
  if (fromState === "inprogress" && toState === "review") return true;
  if (fromState === "review" && toState === "inprogress") return true;

  return false;
}

function commentAuthor(comment: Doc<"comments">): CommentAuthor {
  return {
    type: comment.authorType,
    id: comment.authorId ?? null,
    label: comment.authorLabel ?? comment.authorId ?? null,
  };
}

function serializeDiscussionComment(comment: Doc<"comments">): DiscussionComment {
  return {
    body: comment.body,
    createdAt: comment.createdAt,
    authorType: comment.authorType,
    authorId: comment.authorId ?? null,
    authorLabel: comment.authorLabel ?? comment.authorId ?? null,
  };
}

function isAgentAuthor(author: CommentAuthor, normalizedAgentId: string) {
  return author.type === "agent" && normalize(author.id) === normalizedAgentId;
}

async function buildBaseTasks(
  ctx: QueryCtx,
  agent: AgentIdentity,
  includeDone: boolean,
  ownerId?: string,
): Promise<BaseTask[]> {
  const [allBoards, columns, cards] = await Promise.all([
    ctx.db.query("boards").withIndex("by_order").order("asc").collect(),
    ctx.db.query("columns").collect(),
    ctx.db.query("cards").collect(),
  ]);

  const boards = ownerId ? allBoards.filter((board) => board.ownerId === ownerId) : allBoards;
  const boardById = new Map(boards.map((board) => [board._id, board]));
  const columnById = new Map(columns.map((column) => [column._id, column]));

  return cards
    .map((card) => {
      const roles = cardRoles(card, agent.normalizedId);
      if (roles.length === 0) return null;

      const column = columnById.get(card.columnId);
      const board = boardById.get(card.boardId);

      if (!column || !board) return null;

      const isDone = normalizeColumnName(column.name) === "done";
      if (isDone && !includeDone) return null;

      return {
        cardId: card._id,
        boardId: board._id,
        boardName: board.name,
        boardDescription: board.description,
        columnId: column._id,
        columnName: column.name,
        title: card.title,
        description: card.description,
        assigneeId: card.agentId,
        reviewerId: card.reviewerId,
        acp: card.acp,
        executionHint: buildExecutionHint(card.acp),
        roles,
        order: card.order,
      } satisfies BaseTask;
    })
    .filter((task): task is BaseTask => Boolean(task));
}

async function enrichTask(
  ctx: QueryCtx,
  task: BaseTask,
  agent: AgentIdentity,
): Promise<EnrichedTask> {
  const comments = await ctx.db
    .query("comments")
    .withIndex("by_card_created", (q) => q.eq("cardId", task.cardId))
    .order("asc")
    .collect();

  const lastComment = comments[comments.length - 1] ?? null;
  const lastAuthor = lastComment ? commentAuthor(lastComment) : null;
  const hasAgentComment = comments.some((comment) => isAgentAuthor(commentAuthor(comment), agent.normalizedId));

  return {
    ...task,
    hasAgentComment,
    lastCommentAt: lastComment?.createdAt ?? null,
    lastCommentByType: lastAuthor?.type ?? null,
    lastCommentBy: lastAuthor?.id ?? null,
    lastCommentByLabel: lastAuthor?.label ?? null,
    comments: comments.map((comment) => serializeDiscussionComment(comment)),
  };
}

async function listTasksWithCommentState(
  ctx: QueryCtx,
  agent: AgentIdentity,
  includeDone: boolean,
  ownerId?: string,
): Promise<EnrichedTask[]> {
  const baseTasks = await buildBaseTasks(ctx, agent, includeDone, ownerId);
  const tasks = await Promise.all(baseTasks.map((task) => enrichTask(ctx, task, agent)));

  return tasks.sort((a, b) => {
    if (a.boardName !== b.boardName) return a.boardName.localeCompare(b.boardName);
    if (a.columnName !== b.columnName) return a.columnName.localeCompare(b.columnName);
    return a.order - b.order;
  });
}

function inboxReasonForTask(task: EnrichedTask, agent: AgentIdentity): InboxReason | null {
  const state = normalizeColumnName(task.columnName);
  const agentWasLastCommenter =
    task.lastCommentByType === "agent" && normalize(task.lastCommentBy) === agent.normalizedId;

  if (state === "ideas" && canComment(task.columnName, task.roles) && !agentWasLastCommenter) {
    return "ideas-needs-comment";
  }

  if (state === "todo" && task.roles.includes("assignee")) {
    return "todo";
  }

  if (state === "review" && canComment(task.columnName, task.roles) && !agentWasLastCommenter) {
    return "review-needs-reply";
  }

  return null;
}

function buildInbox(tasks: EnrichedTask[], agent: AgentIdentity) {
  const inboxTasks = tasks
    .map((task) => {
      const inboxReason = inboxReasonForTask(task, agent);
      if (!inboxReason) return null;
      return {
        ...task,
        inboxReason,
      } satisfies InboxTask;
    })
    .filter((task): task is InboxTask => Boolean(task));

  return {
    boards: groupInboxByBoard(inboxTasks),
    totalCount: inboxTasks.length,
  };
}

function groupInboxByBoard(tasks: InboxTask[]) {
  const boards = new Map<
    string,
    {
      boardId: Id<"boards">;
      boardName: string;
      boardDescription: string | undefined;
      ideas: InboxTask[];
      todos: InboxTask[];
      review: InboxTask[];
    }
  >();

  for (const task of tasks) {
    const key = task.boardId;
    const entry =
      boards.get(key) ??
      {
        boardId: task.boardId,
        boardName: task.boardName,
        boardDescription: task.boardDescription,
        ideas: [],
        todos: [],
        review: [],
      };

    if (task.inboxReason === "ideas-needs-comment") entry.ideas.push(task);
    if (task.inboxReason === "todo") entry.todos.push(task);
    if (task.inboxReason === "review-needs-reply") entry.review.push(task);

    boards.set(key, entry);
  }

  return Array.from(boards.values())
    .sort((a, b) => a.boardName.localeCompare(b.boardName))
    .map((board) => ({
      ...board,
      totalCount: board.ideas.length + board.todos.length + board.review.length,
    }));
}

export const listAssignedTasks = internalQuery({
  args: {
    agentId: v.string(),
    agentToken: v.string(),
    includeDone: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const agent = authenticateAgent(args.agentId, args.agentToken);
    return await listTasksWithCommentState(ctx, agent, Boolean(args.includeDone));
  },
});

export const listAgentInbox = internalQuery({
  args: {
    agentId: v.string(),
    agentToken: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = authenticateAgent(args.agentId, args.agentToken);
    const tasks = await listTasksWithCommentState(ctx, agent, false);
    const inbox = buildInbox(tasks, agent);

    return {
      agentId: agent.id,
      ...inbox,
    };
  },
});

export const debugAgentInbox = query({
  args: {
    agentId: v.string(),
    refreshKey: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) {
      throw new Error("Unauthorized");
    }

    const agentId = args.agentId.trim();
    if (!agentId) {
      throw new Error("Agent id is required");
    }

    const agent = {
      id: agentId,
      normalizedId: normalize(agentId),
    } satisfies AgentIdentity;

    const tasks = await listTasksWithCommentState(ctx, agent, false, user.userId);
    const inbox = buildInbox(tasks, agent);

    return {
      agentId: agent.id,
      ...inbox,
    };
  },
});

export const addAgentComment = internalMutation({
  args: {
    agentId: v.string(),
    agentToken: v.string(),
    cardId: v.id("cards"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = authenticateAgent(args.agentId, args.agentToken);

    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Card not found" });
    }

    const column = await ctx.db.get(card.columnId);
    if (!column) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Column not found" });
    }

    const roles = cardRoles(card, agent.normalizedId);
    if (!canComment(column.name, roles)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Comment not allowed for this role/state" });
    }

    const body = optionalText(args.body);
    if (!body) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Comment cannot be empty" });
    }

    const createdAt = Date.now();

    const commentId = await ctx.db.insert("comments", {
      boardId: card.boardId,
      cardId: card._id,
      body,
      createdAt,
      authorType: "agent",
      authorId: agent.id,
      authorLabel: agent.id,
    });

    await touchBoard(ctx, card.boardId, createdAt);
    await ctx.runMutation(internal.activity.logAgentEvent, {
      boardId: card.boardId,
      cardId: card._id,
      actorId: agent.id,
      eventType: "agent.comment",
      message: "Agent left a comment",
      details: body,
    });

    return {
      ok: true,
      commentId,
    };
  },
});

export const transitionAgentCard = internalMutation({
  args: {
    agentId: v.string(),
    agentToken: v.string(),
    cardId: v.id("cards"),
    toColumn: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = authenticateAgent(args.agentId, args.agentToken);

    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Card not found" });
    }

    const [currentColumn, boardColumns] = await Promise.all([
      ctx.db.get(card.columnId),
      ctx.db
        .query("columns")
        .withIndex("by_board_order", (q) => q.eq("boardId", card.boardId))
        .order("asc")
        .collect(),
    ]);

    if (!currentColumn) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Current column not found" });
    }

    const targetState = normalizeColumnName(args.toColumn);
    const targetColumn = boardColumns.find(
      (column) => normalizeColumnName(column.name) === targetState,
    );

    if (!targetColumn) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Target column not found on board" });
    }

    const roles = cardRoles(card, agent.normalizedId);
    if (!canTransition(currentColumn.name, targetColumn.name, roles)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: `Transition ${currentColumn.name} -> ${targetColumn.name} not allowed`,
      });
    }

    if (targetColumn._id === card.columnId) {
      return {
        ok: true,
        cardId: card._id,
        from: currentColumn.name,
        to: targetColumn.name,
        noOp: true,
      };
    }

    const targetCards = await ctx.db
      .query("cards")
      .withIndex("by_column_order", (q) => q.eq("columnId", targetColumn._id))
      .order("asc")
      .collect();

    await ctx.db.patch(card._id, {
      columnId: targetColumn._id,
      order: getNextOrder(targetCards.filter((row) => row._id !== card._id)),
    });

    await touchBoard(ctx, card.boardId, Date.now());
    await ctx.runMutation(internal.activity.logAgentEvent, {
      boardId: card.boardId,
      cardId: card._id,
      actorId: agent.id,
      eventType: "agent.transition",
      message: `Moved card ${currentColumn.name} → ${targetColumn.name}`,
      details: `${currentColumn.name} -> ${targetColumn.name}`,
    });

    return {
      ok: true,
      cardId: card._id,
      from: currentColumn.name,
      to: targetColumn.name,
      noOp: false,
    };
  },
});
