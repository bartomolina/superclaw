import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { requireUser } from "./access";

const COLUMN_MANAGEMENT_DISABLED_ERROR =
  "Column management is disabled. Columns are fixed for all boards.";

export const create = mutation({
  args: {
    boardId: v.id("boards"),
    name: v.string(),
  },
  handler: async (ctx) => {
    await requireUser(ctx);
    throw new Error(COLUMN_MANAGEMENT_DISABLED_ERROR);
  },
});

export const rename = mutation({
  args: {
    columnId: v.id("columns"),
    name: v.string(),
  },
  handler: async (ctx) => {
    await requireUser(ctx);
    throw new Error(COLUMN_MANAGEMENT_DISABLED_ERROR);
  },
});

export const remove = mutation({
  args: {
    columnId: v.id("columns"),
  },
  handler: async (ctx) => {
    await requireUser(ctx);
    throw new Error(COLUMN_MANAGEMENT_DISABLED_ERROR);
  },
});
