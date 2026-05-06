import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  boards: defineTable({
    ownerId: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
    sharedUserIds: v.optional(v.array(v.id("managedUsers"))),
    allowedAgentIds: v.optional(v.array(v.string())),
    hiddenAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    order: v.number(),
  })
    .index("by_order", ["order"])
    .index("by_owner_order", ["ownerId", "order"]),

  boardPermissions: defineTable({
    boardId: v.id("boards"),
    ownerId: v.string(),
    managedUserId: v.id("managedUsers"),
    userEmail: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_email", ["userEmail"])
    .index("by_managed_user", ["managedUserId"])
    .index("by_board_email", ["boardId", "userEmail"]),

  columns: defineTable({
    boardId: v.id("boards"),
    name: v.string(),
    order: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_board_order", ["boardId", "order"]),

  cards: defineTable({
    boardId: v.id("boards"),
    columnId: v.id("columns"),
    title: v.string(),
    description: v.optional(v.string()),
    extensionContext: v.optional(v.string()),
    source: v.optional(v.string()),
    agentId: v.optional(v.string()),
    reviewerId: v.optional(v.string()),
    priority: v.optional(v.string()),
    size: v.optional(v.string()),
    type: v.optional(v.string()),
    acp: v.optional(v.string()),
    model: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    isRunning: v.optional(v.boolean()),
    lastSessionId: v.optional(v.string()),
    lastSessionAgentId: v.optional(v.string()),
    lastSessionUpdatedAt: v.optional(v.number()),
    lastRunStatus: v.optional(
      v.union(v.literal("running"), v.literal("done"), v.literal("failed"), v.literal("aborted")),
    ),
    order: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_column_order", ["columnId", "order"]),

  cardRunSessions: defineTable({
    sessionId: v.string(),
    agentId: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_card", ["sessionId", "cardId"])
    .index("by_card_session", ["cardId", "sessionId"]),

  comments: defineTable({
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    body: v.string(),
    createdAt: v.number(),
    authorType: v.union(v.literal("agent"), v.literal("human"), v.literal("system")),
    authorId: v.optional(v.string()),
    authorEmail: v.optional(v.string()),
    authorLabel: v.optional(v.string()),
  })
    .index("by_board", ["boardId"])
    .index("by_card_created", ["cardId", "createdAt"]),

  activityEvents: defineTable({
    boardId: v.id("boards"),
    cardId: v.optional(v.id("cards")),
    actorType: v.union(v.literal("agent"), v.literal("human"), v.literal("system")),
    actorId: v.optional(v.string()),
    eventType: v.string(),
    message: v.string(),
    details: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_board_created", ["boardId", "createdAt"])
    .index("by_card_created", ["cardId", "createdAt"]),

  managedUsers: defineTable({
    ownerId: v.string(),
    name: v.string(),
    email: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    order: v.number(),
  })
    .index("by_owner_order", ["ownerId", "order"])
    .index("by_owner_email", ["ownerId", "email"])
    .index("by_email", ["email"]),

  superuserProfiles: defineTable({
    email: v.string(),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  authRateLimits: defineTable({
    scope: v.string(),
    key: v.string(),
    lastTriggeredAt: v.number(),
    updatedAt: v.number(),
  }).index("by_scope_key", ["scope", "key"]),

  agentCredentials: defineTable({
    agentId: v.string(),
    normalizedAgentId: v.string(),
    tokenHash: v.string(),
    tokenPreview: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdByUserId: v.optional(v.string()),
    createdByEmail: v.optional(v.string()),
    lastVerifiedAt: v.optional(v.number()),
  })
    .index("by_agent", ["agentId"])
    .index("by_normalized_agent", ["normalizedAgentId"])
    .index("by_token_hash", ["tokenHash"]),

  extensionCredentials: defineTable({
    ownerId: v.string(),
    ownerEmail: v.string(),
    ownerName: v.optional(v.string()),
    tokenHash: v.string(),
    tokenPreview: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastVerifiedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_token_hash", ["tokenHash"]),
});
