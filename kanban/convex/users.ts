import { v } from "convex/values";

import { requireUser } from "./access";
import { mutation, query } from "./_generated/server";
import { getNextOrder, normalizeText, optionalText } from "./helpers";

function normalizeEmail(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    throw new Error("Email is required");
  }

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);

  if (!isValidEmail) {
    throw new Error("Please enter a valid email address");
  }

  return normalized;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    return await ctx.db
      .query("managedUsers")
      .withIndex("by_owner_order", (q) => q.eq("ownerId", user.userId))
      .order("asc")
      .collect();
  },
});

export const upsert = mutation({
  args: {
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const email = normalizeEmail(args.email);
    const fallbackName = email.split("@")[0] || "User";
    const name = normalizeText(optionalText(args.name) ?? fallbackName, fallbackName);
    const now = Date.now();

    const existing = await ctx.db
      .query("managedUsers")
      .withIndex("by_owner_email", (q) => q.eq("ownerId", user.userId).eq("email", email))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        email,
        updatedAt: now,
      });

      return existing._id;
    }

    const users = await ctx.db
      .query("managedUsers")
      .withIndex("by_owner_order", (q) => q.eq("ownerId", user.userId))
      .order("asc")
      .collect();

    return await ctx.db.insert("managedUsers", {
      ownerId: user.userId,
      name,
      email,
      createdAt: now,
      updatedAt: now,
      order: getNextOrder(users),
    });
  },
});

export const remove = mutation({
  args: {
    userId: v.id("managedUsers"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const managedUser = await ctx.db.get(args.userId);

    if (!managedUser) {
      throw new Error("User not found");
    }

    if (managedUser.ownerId !== user.userId) {
      throw new Error("Forbidden");
    }

    const permissions = await ctx.db
      .query("boardPermissions")
      .withIndex("by_managed_user", (q) => q.eq("managedUserId", args.userId))
      .collect();

    const boardIds = Array.from(new Set(permissions.map((permission) => String(permission.boardId))));

    for (const boardId of boardIds) {
      const board = await ctx.db.get(boardId as typeof permissions[number]["boardId"]);
      if (!board) continue;

      const sharedUserIds = (board.sharedUserIds ?? []).filter(
        (sharedUserId) => String(sharedUserId) !== String(args.userId),
      );

      await ctx.db.patch(board._id, {
        sharedUserIds,
        updatedAt: Date.now(),
      });
    }

    for (const permission of permissions) {
      await ctx.db.delete(permission._id);
    }

    await ctx.db.delete(args.userId);
  },
});
