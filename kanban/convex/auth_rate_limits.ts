import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function isCoolingDown(lastTriggeredAt: number, cooldownMs: number, now: number) {
  return cooldownMs > 0 && now - lastTriggeredAt < cooldownMs;
}

export const consumeMagicLinkQuota = internalMutation({
  args: {
    email: v.string(),
    emailCooldownMs: v.number(),
    globalCooldownMs: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const emailKey = normalizeKey(args.email);
    const globalKey = "magic-link";

    const [emailLimit, globalLimit] = await Promise.all([
      ctx.db
        .query("authRateLimits")
        .withIndex("by_scope_key", (q) => q.eq("scope", "magic_link_email").eq("key", emailKey))
        .unique(),
      ctx.db
        .query("authRateLimits")
        .withIndex("by_scope_key", (q) => q.eq("scope", "magic_link_global").eq("key", globalKey))
        .unique(),
    ]);

    if (emailLimit && isCoolingDown(emailLimit.lastTriggeredAt, args.emailCooldownMs, now)) {
      return false;
    }

    if (globalLimit && isCoolingDown(globalLimit.lastTriggeredAt, args.globalCooldownMs, now)) {
      return false;
    }

    if (emailLimit) {
      await ctx.db.patch(emailLimit._id, {
        lastTriggeredAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("authRateLimits", {
        scope: "magic_link_email",
        key: emailKey,
        lastTriggeredAt: now,
        updatedAt: now,
      });
    }

    if (globalLimit) {
      await ctx.db.patch(globalLimit._id, {
        lastTriggeredAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("authRateLimits", {
        scope: "magic_link_global",
        key: globalKey,
        lastTriggeredAt: now,
        updatedAt: now,
      });
    }

    return true;
  },
});
