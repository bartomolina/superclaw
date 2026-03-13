import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  boards: defineTable({
    ownerId: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    order: v.number(),
  })
    .index("by_order", ["order"])
    .index("by_owner_order", ["ownerId", "order"]),

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
    agentId: v.optional(v.string()),
    reviewerId: v.optional(v.string()),
    priority: v.optional(v.string()),
    size: v.optional(v.string()),
    acp: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    order: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_column_order", ["columnId", "order"]),

  comments: defineTable({
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    body: v.string(),
    createdAt: v.number(),
    authorType: v.union(v.literal("agent"), v.literal("human"), v.literal("system")),
    authorId: v.optional(v.string()),
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
});
